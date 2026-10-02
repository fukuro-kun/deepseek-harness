---
description: "Der dateigestützte Settings-Provider für Nutzer und Maintainer, die das YAML/JSON-Settings-Dokument und sein Hot-Reload wählen, konfigurieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-settings-file

[English](README.md) | [中文](README.zh.md) | Deutsch

## Überblick

`dsh-settings-file` hält die Nutzer-Settings jedes Namespaces in einem YAML- oder JSON-Dokument, standardmäßig `settings.yaml` unter dem Harness-Home: Nutzer können das Dokument direkt editieren — Änderungen werden live wirksam — oder über den Service schreiben, der nebenläufige Edits sicher mergt. YAML-Schreibvorgänge bewahren Kommentare, Anchors und Formatierung auf jedem unberührten Knoten, und eine Section, die einem nicht geladenen Plugin gehört, wird nie verworfen. Der Boot schlägt bei einem ungültigen Dokument laut fehl; ein fehlschlagendes Live-Reload behält die letzten guten Sections und warnt, statt den Prozess mitzureißen.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Mounte diesen Provider, wenn eine Composition ein nutzer-editierbares Settings-Dokument will. Der übliche Pfad ist explizit: Provider mounten, Namespaces über `ctx.settings` registrieren und Nutzer das Dokument editieren oder eine Konfigurations-UI über den Service schreiben lassen.

### Wann wählen

Wähle ihn als den Standard-Store für Nutzer-Settings: ein menschenlesbares Dokument, das Nutzer in jedem Editor öffnen können, mit Änderungen, die ohne Restart wirksam werden. Wähle ihn, wenn Kommentare und Formatierung in diesem Dokument zählen, denn Schreibvorgänge bewahren sie. Ein nicht-dateigestützter Store wie ein Remote-Settings-Backend wird hier nicht ausgeliefert; das bräuchte einen anderen Provider.

### Minimale Konfiguration

```yaml
- name: '@deepseek-ai/dsh-settings-file'
  config:
    path: /absolute/path/to/settings.yaml
```

| Feld | Default | Bedeutung |
|---|---|---|
| `path` | `<harness home>/settings.yaml` | Pfad des Settings-Dokuments; die Extension wählt das Format (`.yaml`, `.yml` oder `.json`) |
| `dshHome` | `$DSH_HOME` oder `~/.dsh` | Harness-Home, das verwendet wird, wenn `path` weggelassen wird |
| `watch` | `true` | Das Dokument beobachten und externe Edits heiß veröffentlichen |
| `debounceMs` | `100` | Schreib-Settle-Fenster des Watchers, in Millisekunden |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-settings-file) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Das Dokument editieren

Das Dokument ist ein YAML- oder JSON-Mapping von Namespace auf User-Section. Nutzer können es direkt editieren: Jede Änderung wird automatisch wirksam, und Löschen der Datei setzt jeden Namespace auf Defaults und `base` zurück. Ein existierendes, aber ungültiges Dokument lässt den Plugin-Load beim Boot fehlschlagen — der Provider ignoriert oder überschreibt es nie still. Einmal live warnt ein unlesbarer oder nicht parsbarer Edit nur und behält die letzten guten Sections, sodass ein Hand-Edit-Fehler den Prozess nicht mitreißen kann.

### Über den Service schreiben

Schreibvorgänge über `ctx.settings` verlieren nie nebenläufige Änderungen: ein noch im Flug befindlicher externer Edit, eine vom Watcher verpasste Änderung oder ein Schreibvorgang eines anderen Prozesses wird in das Dokument gemergt, bevor der Schreibvorgang landet. YAML-Edits sind Leaf-Level-Diffs: Nur geänderte Werte werden gesetzt und nur entfernte Keys gelöscht, sodass Kommentare, Anchors und Formatierung auf jedem unberührten Knoten und auf dem Key jedes geänderten Paars überleben; ein geändertes Array oder ein anderer Non-Map-Wert ersetzt wholesale. JSON-Dokumente werden ohne Kommentare re-serialisiert. Wenn das On-disk-Dokument ungültig geworden ist, schlägt der Schreibvorgang laut fehl, statt den manuellen Edit des Nutzers zu überschreiben.

Der Lock hat eine 2-Sekunden-Acquisition-Frist mit exponentiellem Backoff; ein Contender, der in den Timeout läuft, lässt den bestehenden Lock in Ruhe, weil das Lock-Alter einen gecrashten Owner nicht von einem pausierten Live-Writer unterscheiden kann — Orphan-Lock-Recovery ist eine Operator-Aktion. Das Dokument wird mit `0600` unter einem nur-owner `0700`-Verzeichnis erstellt und atomar über ein Random-Suffix-Temp-Sibling ersetzt, das niemals einem platzierten Symlink folgt.

### Fehler und Recovery

- Eine nicht unterstützte Extension schlägt beim Load fehl — das Format kommt aus der Extension (`.yaml`, `.yml`, `.json`).
- Ein fehlendes Dokument ist ein leerer Store; Löschen der Datei kehrt in diesen Zustand zurück.
- Ein zur Laufzeit ungültiges On-disk-Dokument blockiert nichts, behält aber die letzten guten Sections; ein Schreibvorgang verweigert das Überschreiben.
- `prepareDocument()` materialisiert ein abwesendes Dokument als leere nur-owner-Datei, bevor ein nativer Editor es öffnet.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Design-Entscheidungen hinter dem Provider und zeigt auf den Code, der sie realisiert; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Design-Philosophie

- **Ein expliziter Defaulting-Schritt.** `resolveSpec(config)` löst Dateiname, Format, Watch-Flag und Debounce-Fenster in einem Schritt auf, sodass programmatische Konstruktion, die die Schemastery-Normalisierung umgeht, dieselben Defaults bekommt.
- **Boot schlägt laut fehl, Reload behält letzte gute Werte.** Ein existierendes-aber-ungültiges Dokument lässt den Plugin-Load fehlschlagen; einmal live warnt ein unlesbarer oder nicht parsbarer Edit und behält die letzten guten Sections.
- **Jeder Schreibvorgang ist ein Read-Modify-Write.** Ein Persist reconciliert zuerst von der Disk und veröffentlicht jede Differenz in den Seam, dann rendert er gegen diesen frischen Text, sodass ein Schreibvorgang nie ein stale Dokument wiederbelebt oder eine unbeobachtete Sibling-Section verwirft.
- **Schreibvorgänge halten einen prozessübergreifenden Writer-Lock.** Der Read-Render-Rename-Zyklus läuft unter einem mit `wx` erstellten `<file>.lock`-Sibling mit exponentiellem Backoff und 2-Sekunden-Acquisition-Frist; Leser nehmen den Lock nie, weil der Rename-Commit atomar ist.
- **YAML-Edits sind Leaf-Level-Diffs.** Nur geänderte Werte werden gesetzt und nur entfernte Keys gelöscht, was Kommentare, Anchors und Formatierung auf unberührten Knoten bewahrt.
- **Reloads und Schreibvorgänge teilen eine Operationskette.** Watcher-Refreshes und Persist-Vorgänge aus jeder Namespace-Queue laufen einzeln in Queue-Reihenfolge; jedes Render sieht den Text, den die vorherige Operation committet hat.
- **Self-Write-Unterdrückung per Inhalt.** Der Provider cached den letzten guten Text; ein Watcher-Event, dessen Inhalt dem Cache entspricht — der eigene Schreibvorgang inklusive — ist ein No-op.

### Source-Map

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Provider: Spec-Auflösung, Load/Parse, Read-Modify-Write unter dem Writer-Lock, Watcher-Lifecycle, YAML/JSON-Rendering |
| — | Es wird kein Runtime-Invarianten-Companion veröffentlicht; die Verträge dieses Providers sind File-Roundtrip, Watcher-Timing und Atomic-Write-Verhalten — IO-Effekte, die von Paket-Tests bewiesen werden; die in-process Commit-Relation gehört `@deepseek-ai/dsh-settings`. |

### Dokument-Lifecycle

Das Init des Basis-Services lädt und veröffentlicht das Dokument, bevor der Service injizierbar wird; der Provider startet dann den Watcher und reconciliert einmal bei Ready, um die Startlücke zu schließen, in der eine zwischen dem initialen Read und dem Aktivwerden des Watchers geschriebene Änderung nie ein Event feuert. Jedes Watcher-Event und jedes Persist queued auf dieselbe exklusive Operationskette. `reconcileFromDisk` vergleicht den On-disk-Text mit dem Cache, veröffentlicht jede Differenz (einschließlich Abwesenheit als leeres Dokument) und wirft nur bei einem Parse-Fehler, sodass jeder Caller seine Policy wählt — ein Reload warnt und behält das letzte gute Dokument, ein Schreibvorgang schlägt laut fehl. Dispose markiert den Provider als geschlossen, schließt den Watcher und wartet jede gequeuete oder in-flight Operation ab, sodass nach dem Teardown nichts mehr veröffentlicht wird.

### Render-Pfade

YAML rendert, indem der gecachte Text in einen mutierbaren kommentarbewahrenden Baum geparst und ein Namespace mit Leaf-Level-Edits gepatcht wird; JSON rendert, indem ein Namespace-Key ersetzt und mit Zwei-Leerzeichen-Indentation re-serialisiert wird. Bevor Chokidar das Ziel öffnet, realpatht der Provider den tiefsten existierenden Vorfahren und stellt jedes fehlende Suffix wieder her, damit Windows innerhalb von libuv keinen 8.3-Alias mit langen Event-Pfaden mischen kann.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der provider-weite Vertrag nicht reicht. Sie führen vom Seam-Vertrag zum Atomic-Write-Primitiv und zur erschöpfenden Konfigurationsoberfläche.

- [User-Settings-Service](../settings/README.de.md) — Namespace-Registrierung, Layered-Auflösung, Schreibvorgänge und die Events, die dieser Provider speist.
- [Settings-Subsystem-Referenz](../../../docs/subsystems/settings.de.md) — Namespaces, Auflösungsreihenfolge, Descriptors und Change-Commits.
- [Settings-Paketkarte](../README.de.md) — die zwei Pakete der User-Settings-Capability.
- [Atomic Write](../../util/atomic-write/README.de.md) — der Writer-Lock und die atomare Ersetzung, die jeder Schreibvorgang nutzt.
- [Home-Pfade](../../util/home-paths/README.de.md) — `$DSH_HOME`-Auflösung und kanonische Watch-Pfade.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-settings-file) — jedes akzeptierte Config-Feld und seine Quelldeklaration.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über die Consumer von `ctx.settings`, die jedes Model-zugewandte Verhalten besitzen, das von einem gespeicherten Wert gespeist wird; der File-Provider speichert und veröffentlicht nur Namespace-Sections und registriert selbst nichts Model-zugewandtes.

#### KV-Cache-Effekt

Keine direkte Invalidation; das konsumierende Plugin besitzt alle Request-Präfix-Änderungen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann der Provider eine schlechte Wahl ist oder besondere Betriebsaufmerksamkeit braucht. Sie sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Same-Namespace-Konflikte bleiben Last-Write-Wins** — der Writer-Lock und Read-Modify-Write verhindern, dass nebenläufige Writer einander ihre Namespaces verlieren, aber zwei Writer, die einen Namespace editieren, lösen immer noch auf den späteren Schreibvorgang auf; es gibt kein Per-Value-Merge und keine Revisionsprüfung.
- **Ein verpasstes Watcher-Event bleibt bis zum nächsten Signal unsichtbar** — Reads re-statten die Datei nie, sodass eine vom Watcher nicht gemeldete Änderung erst vom nächsten Event, dem nächsten Schreibvorgang oder einem Restart eingefaltet wird.
- **Kommentarbewahrung ist YAML-only und Map-förmig** — JSON-Dokumente re-serialisieren ohne Kommentare, und Kommentare innerhalb eines geänderten Arrays oder inline an einem geänderten Skalarwert gehen mit dem Wert, den sie beschrieben haben.
- **Keine Wert-Indirektion** — Sections halten literale Werte; `${env:VAR}`-artige Referenzen für Secrets sind ein zurückgestelltes Seam-Level-Feature.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: zurückgestellte Richtungen, die nicht entschieden sind. Sie ist explizit nicht autoritativ — ausgeliefertes Verhalten, Grenzen und akzeptierte Rationale leben in den obigen Abschnitten und im Paketcode. Zurückgestellte Richtungen: `${env:VAR}`-artige Wert-Indirektion ist ein Seam-Level-Feature — sie gehört, wenn sie landet, zum Settings-Service-Vertrag, nicht zu diesem Provider. Orphan-Lock-Recovery bleibt by Design eine Operator-Aktion, weil das Lock-Alter einen gecrashten Owner nicht von einem pausierten Live-Writer unterscheiden kann.

</details>
