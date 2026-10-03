# Agent Note: Dateisystem-Seam aufgeteilt — Provider-Textmutationen plus das `dsh-fs-observation-policy`-Plugin
[English](2026-06-26-fsspec-style-fs-seam.md) | [中文](2026-06-26-fsspec-style-fs-seam.zh.md) | Deutsch

Status: implemented


## Problem

Die Filesystem-Capability aus [filesystem-capability-seam](../../archived/architecture/2026-06-17-filesystem-capability-seam.md) lässt aktuell einen abstrakten `FileSystem`-Service zwei verschiedene Aufgaben besitzen:

1. **Provider-Operationen** — Targets auflösen, stat-/Versionsmetadaten, Text-Reads/Streams, atomare Writes und abgesicherte literale Edits.
2. **Agent-zugewandte Policy** — Zeilenfenster, literale Edit-Semantik und der Observed-State für Read-before-Write/Edit.

Das zwingt jedes künftige Backend, die modellzugewandte Read-Semantik und die Observation-Policy neu zu implementieren. `readPage` gibt nummerierte Zeilen und View-Metadaten zurück; der Basis-Service speichert Dateistatus pro Owner und unterscheidet `full`- von `partial`-Reads. Das sind nützliche Policies, aber keine Filesystem-Provider-Primitive. Literale Textmutation ist anders: Versions-Guard, literales Matching, Ambiguitätserkennung und atomares Rewrite müssen innerhalb der Mutationsgrenze des Providers zusammenbleiben, aber der aktuelle `applyEdit`-Name und der umgebende Seam binden diese Provider-Operation an die alte Read-before-Edit-Policy-Form.

Das erzeugt außerdem eine echte UX-Sackgasse: Ein gefensterter Read zeichnet `view: partial` auf, und partielle Views können `edit` nicht autorisieren. Ein Modell, das die Zeilen 100–150 einer großen Datei liest, kann daher Zeile 120 nicht editieren, ohne zuvor einen `full`-Read zu erhalten — der für eine Datei jenseits des Read-Limits unmöglich sein kann. Literales Editieren braucht nur Freshness: Die gematchten Bytes müssen noch aus der Version stammen, die das Modell gelesen hat.

Die alte Agent Note hatte ein separates `@deepseek-ai/dsh-fs-observation-policy`-Package bereits zurückgestellt. Diese Entscheidung baut diese Schicht und hält `ctx.fs` nah an fsspec-artigen Storage-Primitives (`info`/`cat`/`open`), ohne daraus ein vollständiges fsspec zu machen.

## Entscheidung

Der Stack wird in vier Schichten aufgeteilt:

```text
tool          dsh-tool-fs       model-facing schemas + read windowing + text rendering; the EXECUTOR (reads/writes/edits via ctx.fs, dispatches the fs/* events)
policy        dsh-fs-observation-policy  observed-state + read-before-edit + write/edit freshness, contributed through the fs/* event gate (no service)
provider contract dsh-fs            ctx.fs: text IO + atomic mutation primitives (optional version guard)
provider      dsh-fs-local      local implementation of ctx.fs
```

`dsh-tool-fs` behält dieselben modellzugewandten `read`/`write`/`edit`-Schemas. Es ist der Executor: Es injiziert `fs` (keinen Policy-Service), greift direkt auf `ctx.fs` zu, besitzt das Read-Windowing und dispatcht die `fs/*`-Events, damit `dsh-fs-observation-policy` gaten und aufzeichnen kann.

Diese Agent Note hat den Vier-Schichten-Split, den Provider-Contract und die Freshness-Policy entschieden. Die Tool↔Policy-Kopplung wurde anschließend durch [die Event-Gate-Agent-Note](../architecture/2026-06-26-file-context-as-event-gate.de.md) verfeinert: `dsh-fs-observation-policy` ist ein Gate-PLUGIN, das über die `fs/*`-Events teilnimmt, statt ein `ctx.fileContext`-Methoden-Service, sodass das Tool nicht auf Methodenebene daran gekoppelt ist und Read-Windowing plus die fs-I/O in `dsh-tool-fs` liegen. Dieses Dokument beschreibt die gelandete Event-Gate-Form; der Versions-Guard des Providers ist optional (Weglassen = unbedingter Bare-Provider).

## Provider-Contract

`@deepseek-ai/dsh-fs` schrumpft auf Provider-Text-IO plus abgesicherte Textmutation:

```ts ignore-check
abstract resolve(path: string, opts?: { cwd?: string; signal?: AbortSignal }): Promise<FsTarget>
abstract stat(target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined>
abstract readText(target: FsTarget, signal?: AbortSignal): Promise<string>
abstract streamText(target: FsTarget, signal?: AbortSignal): Promise<AsyncIterable<string>>
abstract writeText(target: FsTarget, content: string, expected: FsWriteIntent, signal?: AbortSignal): Promise<FsWriteOutcome>
abstract editText(target: FsTarget, edit: FsEditRequest, expected: { version: FsVersion }, signal?: AbortSignal): Promise<FsEditOutcome>

interface FsInfo {
  version: FsVersion
  type: 'file' | 'directory' | 'other'
  size?: number
}

type FsWriteIntent =
  | { kind: 'createIfAbsent' }
  | { kind: 'replaceIfVersion'; version: FsVersion }
```

`stat` gibt Metadaten zurück, nicht Inhalt. `version` ist das Freshness-Token; `type` lässt den Executor Directories/Special-Files vor dem Lesen ablehnen; `size` lässt das `read`-Tool `readText` vs. `streamText` wählen, ohne per Fehler zu proben. `undefined` bedeutet nicht vorhanden.

`readText` liest die gesamte reguläre Textdatei. `streamText` streamed dieselbe Textsemantik für große Dateien. Beide Provider-Primitive besitzen Regular-File-Checks, UTF-8-Dekodierung, Binary/NUL-Ablehnung und `FS_NOT_TEXT`; die Policy-Schicht handhabt nie rohe Bytes und reimplementiert keine chunk-übergreifende Dekodierung. `readText` ist das Primitive für kleine Dateien/direkte Ganze-Datei-Reads, während große modellzugewandte Reads `streamText` nutzen.

`writeText` ist atomar per Temp-Datei + Rename mit expliziter Write-Erwartung. `createIfAbsent` erzeugt ein fehlendes Target und lehnt ein existierendes Target mit `FS_NOT_OBSERVED` ab; es ist der Pfad, der genutzt wird, wenn der Owner keinen vorherigen Read hat. `replaceIfVersion` ersetzt nur, wenn das Target in der beobachteten Version existiert; ein fehlendes Target oder Versions-Mismatch wirft `FS_STALE_VERSION`.

`editText` ist eine abgesicherte Textmutation auf Provider-Ebene. Im abgesicherten Fall verifiziert es zuerst, dass das Target noch in `expected.version` existiert, liest dann den aktuellen Text, wendet die literale Ersetzung an und schreibt atomar. Der Stale-Check muss vor dem literalen Matching erfolgen, damit ein Edit auf Basis eines alten Reads `FS_STALE_VERSION` meldet statt `FS_EDIT_NOT_FOUND` oder `FS_AMBIGUOUS_EDIT` aus dem Matching gegen neueren Inhalt. Dieses Primitive im Provider-Contract zu halten, bewahrt Backend-lokales Locking und erlaubt einem künftigen Remote-Backend natives Compare-and-Edit, ohne die Policy-Schicht zu zwingen, die ganze Datei durch sich hindurchzuziehen.

Dies ist ein *Text-Storage*-Seam, bewusst ein halbes Level über Byte-Level-fsspec (`cat`/`open` geben rohe Bytes zurück). UTF-8-Dekodierung, Binary/NUL-Ablehnung, abgesicherte Ganze-Datei-Writes und abgesicherte literale Textedits liegen im Provider, sodass die Policy-Schicht nie rohe Bytes berührt, chunk-übergreifende Dekodierung reimplementiert oder Stale-Checks von der Mutations-Kritiksektion trennt. Modellzugewandte Konzepte bleiben weiterhin aus dem Provider draußen: keine Zeilenfenster, nummerierten Zeilen, gerenderten Footer oder Observed-State-Store, die nach unten lecken.

Aus `dsh-fs` gelöscht: `readPage`, `FsExpectation`, `FsView`, `FsStateSource`, `FsReadRequest`, `FsTextLine`, Zeilen-/Fenster-Konstanten, `formatReadBody` und die Observed-State-`WeakMap`. `applyEdit` wird durch das schmalere Provider-Primitive `editText` ersetzt, dessen Contract versions-abgesicherte literale Textmutation ist statt Read-Autorisierung der Policy-Schicht. Der `FS_PARTIAL_OBSERVATION`-Code verlässt ebenfalls die `FsErrorCode`-Taxonomie: Freshness-Autorisierung kennt keine partial/full-Unterscheidung, sodass nichts ihn auslösen kann. `FsTargetKey` und `FsVersion` werden gebrandete opaque IDs unter der bestehenden [Branded-IDs-Agent-Note](../../archived/architecture/2026-06-20-branded-ids.md).

## Policy-Contract

`@deepseek-ai/dsh-fs-observation-policy` ist ein Plugin, kein Service: Es registriert keinen `ctx.*`-Key und injiziert nichts. Es besitzt die Write/Edit-Freshness-Policy und den Observed-State, die nicht auf die `FileSystem`-Provider-Basisklasse gehören (wo ein Sandbox-/Remote-Backend sonst modellzugewandte Observation-Policy erben würde, die zu tragen es keinen Anlass hat). Es trägt diese Policy über das `fs/*`-Event-Gate bei, das der Executor dispatcht.

Der Observed-State liegt hier als `WeakMap<owner, Map<targetKey, FsVersion>>`. Ein Eintrag existiert genau dann, wenn der Owner dieses Target gelesen, geschrieben ODER editiert hat (jeder Erfolg emittiert `fs/observed`), sodass seine Anwesenheit *selbst* die Prior-Observation-Aufzeichnung ist — es gibt kein separates `hasRead`-Flag. Der Owner wird strukturell aus dem opaquen Event-Actor abgeleitet (`{ agent?: { session? } }`), eine Form, die in `dsh-fs-observation-policy` lebt, nicht in `dsh-fs`.

Das Plugin entscheidet drei `fs/*`-Events:

- `fs/write-intent` — keine Prior-Observation ⇒ `{ kind: 'createIfAbsent' }` (nur neue Dateien können blind erzeugt werden); eine Prior-Observation ⇒ `{ kind: 'replaceIfVersion', version: vObserved }` (existierende Dateien werden nur ersetzt, wenn seit der Observation unverändert). Single-Slot-Entscheidung; ruft `next()` nicht.
- `fs/edit-intent` — verlangt eine Prior-Observation durch den Owner (sonst `FS_NOT_OBSERVED`); gibt `{ version: vObserved }` als CAS-Basis zurück. Es implementiert die literale Ersetzung nicht — es autorisiert und liefert die Version, und die Mutations-Kritiksektion des Providers wendet den Guard an, sodass konkurrierende Edits auf derselben beobachteten Version ein-gewinnt/ein-stale bleiben.
- `fs/observed` — zeichnet `{ version }` für dieses Owner+Target nach erfolgreichem Read/Write/Edit auf. Synchrones, rein seiteneffektisches `WeakMap.set`.

Das Plugin macht KEINE Filesystem-I/O: „Hast du diese Datei beobachtet?" ist ein `WeakMap`-Lookup, und „ist die Version, die du gelesen hast, noch aktuell?" wird innerhalb von `ctx.fs.editText`/`writeText` im selben atomaren Lock entschieden, der die Mutation ausführt — das Plugin liefert nur `vObserved` als Basis.

## Tool-Contract

`dsh-tool-fs` behält dieselben Schemas und den Prompt-Eintrag. `read` exponiert weiterhin `file_path`, `offset` und `limit`; `write` und `edit` sind unverändert. Es ist der Executor: Es validiert Modell-Args, liest/schreibt/editiert direkt über `ctx.fs`, besitzt Zeilenfensterung und Ergebnis-Rendering (`N: text`, Footer, `<path>/<content>`-Envelope) und dispatcht die `fs/*`-Events.

Jede Mutation dispatcht ihren Intent-Waterfall mit einem `undefined`-Bare-Provider-Default, ruft dann `ctx.fs` und emittiert dann `fs/observed`: z. B. macht `write` `ctx.waterfall('fs/write-intent', target, exec, () => undefined)` → `ctx.fs.writeText(target, content, intent)` → `ctx.emit('fs/observed', …)`. Ein `read` statt einmal, liest/streamed, baut das Fenster und emittiert `fs/observed`. `exec` als Actor zu übergeben erlaubt `dsh-fs-observation-policy`, den Owner abzuleiten, ohne dass das Tool in die Policy hineingreift.

Weil die Policy über Events mit `undefined`-Default beigetragen wird, ist `dsh-tool-fs` nicht auf Methodenebene an `dsh-fs-observation-policy` gekoppelt: Ohne das Plugin fällt jeder Intent-Waterfall auf `undefined` durch (unbedingter Bare-Provider-Write/Edit), und `fs/observed` hat keinen Listener. Das Plugin wieder zu laden legt die Read-before-Write/Edit-Policy wieder obenauf.

## Concurrency-Grenze

In-Process-Updates sind sicher: Das lokale Backend hält den bestehenden Per-Target-Mutations-Lock, sodass Versions-Check-dann-Rename serialisiert ist und ein verlierendes Update `FS_STALE_VERSION` sieht.

In-Process-Creates werden durch denselben Per-Target-Mutations-Lock abgesichert: Zwei Aufrufer, die mit `createIfAbsent` racen, serialisieren, einer erzeugt, und der nächste sieht, dass das Target existiert, und erhält `FS_NOT_OBSERVED`. Prozessübergreifende Creates sind nur Best-Effort; ein lokaler Stat-dann-Rename-Guard kann keine portablen Create-Exclusive-Garantien über alle künftigen Backends geben.

Prozessübergreifende Writes sind Best-Effort-Freshness plus atomarer Ersatz: `mtime:size` fängt Editor-Saves meistens, aber Same-Tick-Writes gleicher Größe können übersehen werden; atomares Temp+Rename verhindert torn Files, aber nicht jeden Lost Update.

## Supersedes

Diese Agent Note kehrt zwei Entscheidungen aus [filesystem-capability-seam](../../archived/architecture/2026-06-17-filesystem-capability-seam.md) um und verengt eine dritte:

- Die Read-before-Write/Edit-Policy zieht aus `ctx.fs` aus und in das `dsh-fs-observation-policy`-Plugin ein (auf dem `fs/*`-Event-Gate).
- Text-Reads geben keine Backend-nummerierten Zeilen-Records oder `full`/`partial`-Views mehr zurück; Autorisierung basiert auf Versions-Freshness, sodass ein gefensterter Read einen Edit autorisieren kann, wenn die Datei unverändert ist.
- Literales Editieren sitzt nicht mehr hinter der alten `applyEdit`-API, die Backend-Mutation mit Seam-besessener Observation-Policy mischte. Es bleibt als `editText` ein Provider-Primitive, weil Versions-Guard + literales Matching + atomares Rewrite innerhalb der Mutations-Kritiksektion des Providers zusammenbleiben müssen.

Es behält die Service-Definition-/Service-Provider-/Consumer-Disziplin, die Consumer-importiert-nie-Backend-Regel, Backend-definierte Target-/Versions-/Display-Metadaten, atomare lokale Writes und die geteilte `FsError`-Taxonomie.

## Verifikation

`dsh-fs` exponiert exakt `resolve`/`stat`/`readText`/`streamText`/`writeText`/`editText` (`stat` gibt `FsInfo | undefined` zurück, `writeText` nimmt `FsWriteIntent`), wobei die entfernten Typen/Primitive weg sind; `dsh-fs-local` trägt keine Zeilen-, View- oder `formatReadBody`-Logik; die modellzugewandten Schemas blieben Byte-für-Byte unverändert. Tests pinnen, dass ein gefensterter Read einen späteren Edit einer unveränderten Datei autorisiert, dass ein Edit auf Basis eines stale Reads `FS_STALE_VERSION` meldet, bevor literales Matching versucht wird, dass das Versions-CAS-Verhalten erhalten bleibt und dass der Observation-Contract gilt (ein `read`-Tool-Read zeichnet Observed-State auf; ein direkter `ctx.fs`-Read nicht); `dsh-fs-observation-policy` hat HMR-/Disposal-Abdeckung.

## Spätere Erweiterung

Der Seam wurde später um direktes Directory-Listing erweitert durch [Add direct directory listing to the filesystem seam](../../archived/architecture/2026-07-03-filesystem-directory-listing-seam.md). Dieser Nachfolger wird separat festgehalten, damit diese Note weiterhin den ursprünglich ausgelieferten fsspec-artigen Umbau beschreibt.

## Erwogene Alternativen

- **Byte-Level-fsspec (`cat`/`open` geben rohe Bytes zurück)** — abgelehnt: Der Seam ist bewusst Text-Storage, ein halbes Level höher, sodass UTF-8-Dekodierung, Binary/NUL-Ablehnung und abgesicherte Textmutationen einmal im Provider leben und die Policy-Schicht nie rohe Bytes berührt oder Stale-Checks von der Mutations-Kritiksektion trennt.
- **Ein konkreter `ctx.fileContext`-Methoden-Service** — die ursprüngliche Policy-Form dieser Agent Note; von [der Event-Gate-Agent-Note](../architecture/2026-06-26-file-context-as-event-gate.de.md) zum Gate-Plugin umgearbeitet, sodass das Tool nie auf Methodenebene an die Policy gekoppelt ist.
- **`readPage` und `full`/`partial`-View-Autorisierung im Provider behalten** — die Form vor dem Umbau, die der Supersedes-Abschnitt umkehrt: View-Vollständigkeit ist nicht das, was Edit-Sicherheit braucht, Versions-Freshness ist es, und die View-Regel machte große Dateien jenseits des Read-Limits uneditierbar.

## Konsequenzen

- Fügt ein viertes fs-Package und eine neue Plugin-Schicht hinzu. Das ist beabsichtigt: Es ist die zuvor zurückgestellte Policy-Schicht, nicht ein zweiter abstrakter Backend-Contract.
- Direkte `ctx.fs`-Nutzung umgeht die Policy: Ein direkter `ctx.fs.readText` emittiert kein `fs/observed`, sodass unter der Default-Policy ein späteres `edit` mit `FS_NOT_OBSERVED` ablehnt, bis die Datei über das `read`-Tool gelesen wurde. Der Fehlschlag ist explizit und dokumentiert.
- Zeilenfensterung großer Dateien zieht vom Backend in das `read`-Tool in `dsh-tool-fs` um; Text-Dekodierung und Binary-Ablehnung bleiben in `ctx.fs.streamText`, sodass dies nur eine Verlagerung der Fensterung ist, keine zweite Text-IO-Implementierung.
- `editText` im Provider-Contract zu halten bedeutet, dass jedes Backend den Literal-Replacement-Contract implementieren muss. Das ist beabsichtigt: Die Operation ist kein reiner Storage, aber Stale-Guard + literales Matching + atomares Rewrite ist die Einheit, die für korrekte Fehlerattribution und Concurrency-Verhalten zusammenbleiben muss. Der Contract sollte schmal und rein textuell bleiben, damit künftige Backends ihn nativ oder per Ganze-Datei-Rewrite implementieren können.
- Freshness erlaubt einen Ganze-Datei-`write` nach einem gefensterten Read. Das ist schwächer als der alte View-Check, vermeidet aber, dass große Dateien uneditierbar werden; die Prompt-Guidance rät weiterhin von blinden Ganze-Datei-Ersetzungen ab.
