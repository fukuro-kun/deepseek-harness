---
description: "Der ctx.fs-Dateisystem-Servicevertrag für Deployments, die ein Dateisystem-Backend wählen oder mounten, und für Entwickler, die eines implementieren."
kind: "package-reference"
---

# @deepseek-ai/dsh-fs

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Verwende `dsh-fs`, wenn eine Anwendung konsistente Dateisystemoperationen über Host-, eingeschränkte oder entfernte Ausführungsumgebungen hinweg benötigt. Consumers können stabile Dateiidentitäten auflösen, gemeinsam genutzte Host-Dateien mappen (sofern unterstützt), begrenzte Text- und Byte-Lesevorgänge ausführen, Verzeichnisse auflisten sowie atomare Textschreibvorgänge und literale Edits anwenden. Versionsguards sind optional, sodass ein Backend ohne Policy-Durchsetzung funktioniert; Aufrufer können einen Guard übergeben, um eine Mutation abzulehnen, nachdem sich die Datei geändert hat. Wähle je nach benötigter Ausführungsumgebung `fs-local`, `fs-sandbox` oder `fs-e2b`. Modellseitige Dateisystem-Tools stellt `dsh-tool-fs` separat bereit.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

`dsh-fs` wird selten direkt geladen: Du mountest ein Backend, das sich als `ctx.fs` registriert, und rufst den Service dann entweder aus deinem eigenen Plugin auf oder lässt die `dsh-tool-fs`-Tools ihn für dich aufrufen. Diese Seite richtet sich an die beiden Zielgruppen, die sie tatsächlich berühren — Deployments, die ein Backend wählen, und Entwickler, die den Vertrag implementieren oder konsumieren.

### Backend wählen und mounten

Wähle [`fs-local`](../fs-local/README.de.md) für gewöhnliche Host-Dateien, [`fs-sandbox`](../fs-sandbox/README.de.md), wenn die Mutationen einer Session auf ihren Workspace und ihre temp roots beschränkt bleiben müssen, und [`fs-e2b`](../../e2b/fs-e2b/README.de.md), wenn der Dateizustand in einer entfernten Ausführungswelt liegen muss. Das Mounten eines beliebigen Backends befüllt `ctx.fs`; ein Backend-Wechsel ändert nichts am Policy-Plugin, an den Tools oder an den Tool-Schemata. Eine Komposition ohne gemountetes Backend hat überhaupt kein `ctx.fs`, und die Tools scheitern bei der Registrierung.

### Was der Service ermöglicht

Über `ctx.fs` kannst du jeden Pfad zu einer stabilen Zielidentität auflösen, eine Textdatei vollständig lesen oder in Chunks streamen, Rohbytes bis zu einer expliziten Obergrenze lesen, eine Verzeichnisebene auflisten, eine Datei atomar anlegen oder ersetzen und einen literalen Textedit atomar anwenden. Der Versionsguard bei beiden Mutationen ist optional: Ohne ihn wird bedingungslos angelegt oder überschrieben; mit ihm schlägt die Operation fehl, wenn sich die Datei seit der letzten Beobachtung geändert hat. Jede Operation liefert Daten oder einen typisierten `FsError` mit einem stabilen Code wie `FS_NOT_FOUND`, `FS_STALE_VERSION` oder `FS_AMBIGUOUS_EDIT` — Aufrufer verzweigen auf den Code, niemals auf den Nachrichtentext.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter dem Vertrag und verweist auf den Code, der sie umsetzt; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) abgedeckt.

### Designphilosophie

Der Vertrag baut auf einer Trennung und drei Zusagen auf:

- **Vertrag statt Mechanismus.** Der Service benennt, was eine Speicherschicht kann — resolve, stat, read, list, write, edit — und niemals, wie sie Bytes speichert. Backends besitzen Zielidentität, Execution-World-Koordinaten, Dekodierung, Binärablehnung und Atomarität.
- **Policy bleibt außerhalb der Basisklasse.** Beobachteter Zustand, Read-before-Edit und versionsgesicherte Mutationen sind Aufgabe eines Plugins (`dsh-fs-observation-policy`), das über den optionalen Guard hinzugefügt wird — ein sandboxed oder remote Backend erbt also keine modellseitige Observation Policy.
- **`editText` bleibt am seam.** Versionsprüfung, literaler Abgleich und atomares Rewrite teilen einen kritischen Abschnitt, sodass Fehlerzuordnung und One-wins/One-stale-Nebenläufigkeit korrekt bleiben; ein Remote-Backend kann es als natives Compare-and-Edit implementieren.
- **Grenzen leben an diesem seam.** `readBytes` verlangt `maxBytes` und schlägt mit `FS_TOO_LARGE` fehl statt abzuschneiden, sodass kein Backend jemals eine unbegrenzte Datei puffert. `readByteRange` ist stattdessen durch sein Fenster begrenzt: Ein Backend überträgt höchstens die angeforderte `length` über das übersprungene Präfix hinaus, sodass die `length`-Obergrenze des Aufrufers der Guard ist.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Service Definition: die abstrakte `FileSystem`-Klasse, die `ctx.fs`-Deklaration und das `fs/*`-Event-Vokabular |
| [`src/types.ts`](src/types.ts) | Vokabular: `FsTarget`/`FsTargetKey`, `FsVersion`, `FsObservation`, `FsWriteIntent`, `FsError` und seine Codes |

### Wie ein Aufruf abläuft

Jede gewöhnliche Operation beginnt mit `resolve(path, { cwd })`, das ein stabiles `FsTarget` erzeugt (einen opaken `targetKey` plus `displayPath` für Modell-/UI-Ausgabe); dieselbe Datei über verschiedene Pfade ergibt denselben Key. `processPathFromHostPath(hostPath)` mappt separat eine absolute Host-Datei in diese Execution World, wenn das Backend sie teilt oder explizit mappt, und gibt sonst `undefined` zurück. Reads laufen dann über `stat` → `readText`/`streamText`/`readBytes`/`readByteRange`, Listings über `listDir`, und Mutationen laufen durch einen kritischen Abschnitt pro Ziel: Der optionale Guard wird geprüft, der neue Inhalt angewendet und das Ergebnis atomar veröffentlicht.

### Die `fs/*`-Policy-Events

Das Paket deklariert drei Events, damit Emitter (`dsh-tool-fs`) und Policy-Listener (`dsh-fs-observation-policy`) ein gemeinsames Vokabular teilen, ohne dass der Emitter vom Policy-Plugin abhängt. `fs/write-intent` und `fs/edit-intent` sind Single-Slot-Entscheidungs-waterfalls: Der erste Listener entscheidet direkt und ruft niemals `next()`. `fs/observed` ist ein Fire-and-forget-Aufzeichnungsevent, das eine `FsObservation` trägt — vorhanden mit Version oder bestätigt abwesend. Die Events tragen nur `dsh-fs`-Vokabular plus einen opaken `object`-Akteur.

### Invarianten

- `targetKey` und `version` sind gebrandete opake ids: Consumers dürfen sie weder parsen noch interpretieren; nur `displayPath` ist für Modell-/UI-Ausgabe.
- Fehler sind typisierte `FsError`s mit stabilen Codes, niemals ad-hoc-Message-Strings.
- Der seam setzt keine I/O-Deadline; Abbruch ist ein optionales `AbortSignal` pro Primitiv.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der paketweite Vertrag nicht ausreicht. Sie führen vom erschöpfenden Vertrag zu den darauf aufbauenden Backends und Consumers.

- [Dateisystem-Subsystem](../../../docs/subsystems/filesystem.de.md) — erschöpfender Provider-Vertrag, Policy-Events und Fehlertaxonomie.
- [fs-local](../fs-local/README.de.md) — das Host-Dateisystem-Backend, das diesen Vertrag implementiert.
- [fs-sandbox](../fs-sandbox/README.de.md) — das Sandbox-erzwingende Backend, das diesen Vertrag implementiert.
- [tool-fs](../tool-fs/README.de.md) — die modellseitigen Tools, die `ctx.fs` konsumieren.
- [fs-observation-policy](../fs-observation-policy/README.de.md) — das Policy-Plugin, das Mutationen über die `fs/*`-Events absichert.
- [Capability-seams-Notiz](../../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.de.md) — warum der Dateisystem-Stack in Vertrag, Provider, Policy und Tools aufgeteilt ist.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über `dsh-tool-fs`, das Provider-Text und -Fehler als begrenzte, einbehaltene Dateisystem-Tool-Ergebnisse rendert.

#### KV-Cache-Effekt

Keine direkte Invalidierung; der genannte Consumer besitzt alle Änderungen am Request-Präfix.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann der Vertrag schlecht passt oder besondere betriebliche Sorgfalt braucht. Sie sind aktuelle Paket-Einschränkungen, kein allgemeiner Dateisystemvergleich und kein Aufgabenrückstand.

- **Mutationen sind vertraglich reine Textoperationen** — Text-Reads und beide Mutationen lehnen binären oder nicht-UTF-8-Inhalt mit `FS_NOT_TEXT` ab; `readBytes` und `readByteRange` sind die Rohbyte-Primitive, und binärsichere Mutationen bleiben zurückgestellt.
- **Nur dreizehn Primitive** — kein delete, rename, copy oder watch; `listDir` listet eine einzelne Ebene; Rekursion, Globbing, Paginierung und Suche liegen außerhalb des Umfangs ([Verzeichnislisting-Notiz](../../../.agents/notes/archived/architecture/2026-07-03-filesystem-directory-listing-seam.md)).
- **Keine I/O-Deadline** — der seam armiert keinen Timeout; Abbruch ist ein best-effort-optionales `AbortSignal` pro Primitiv ([Haltung der fs-Familie](../README.de.md)).
- **Resolve-then-operate kostet ein Remote-Backend zwei Roundtrips pro Tool-Aufruf** — das Zusammenfalten oder Cachen der Auflösung bleibt einem solchen Backend überlassen.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
