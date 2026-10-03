# Agent Note: Preset-Authoring nur per Kopie und der Weg zu den Dateien eines Presets

Status: implemented

[English](2026-08-08-copy-only-preset-authoring.md) | [中文](2026-08-08-copy-only-preset-authoring.zh.md) | Deutsch

## Problem

Die Settings-Seite für agent presets enthielt einen Web-YAML-Editor: `agentPreset.write` akzeptierte beliebigen Composition-Text, die Seite hielt eine Textarea ohne Completion, Highlighting oder Diff, und die Formprüfung stützte sich auf das `entryListSchema` des Loaders — dessen Dialekt `!!js` enthält, sodass „formgeprüfter Text" beim nächsten Mount weiterhin beliebiger Code war. Schwach als Editor, breit als Capability und die Quelle der Editor-gegen-Roster-Race-Conditions, gegen die der Abschnitt sich verteidigen musste.

## Entscheidung

Authoring ist eine hostseitige Kopie, und die Dateien sind der Editor. Aus `agentPreset.write` wurde `agentPreset.copy { from, agentPreset, name? }`: zwei ids, die der Host gegen seine eigenen Roots auflöst, plus ein optionaler Anzeigename, ein `cp` des gesamten Verzeichnisses (Symlinks dereferenziert, Modi erneut auf owner-only verschärft, owner-execute bleibt erhalten); die Metadaten werden umgeschrieben, sodass die Beschreibung der Quelle erhalten bleibt, nie aber ihr Name oder `order`. Die Seite umfasst nun einen Read-only-Viewer über die mitgelieferten Compositions, einen Copy-Dialog als einzigen Create-Einstieg (kein leeres „new preset" — YAML aus dem Nichts zu schreiben ist nichts, was Leute tun), Delete für custom Rows und eine Location-Aktion, die zu den Dateien führt — `settings/openAgentPresetDirectory { agentPreset }` löst das Verzeichnis hostseitig auf und öffnet es nativ oder antwortet mit `{ opened: false, path }`, das die Row als Text anzeigt, wenn das Deployment keinen Desktop hat (`hasDocument` auf `list`; `settings/canOpenAgentPresetDirectory` steuert die Row, und `nativeOpen` des Settings Controllers fixiert das Server-Verhalten dort, wo Plattform-Erkennung täuschen würde).

## Konsequenzen

- Weder Composition-Text noch Pfad überquert in einer der beiden Authoring-Richtungen die Browser-Schnittstelle; die `entryListSchema`/`!!js`-Problematik löst sich zusammen mit `assertComposition` selbst auf (gelöscht). Die Authoring-Operationen sind `read`/`copy`/`openDocument`/`remove` — keine akzeptiert ein Dateisystem-Ziel, und Connection authentifiziert sie mit der vollständigen Host API.
- Da der Editor entfällt, ist das manuelle Bearbeiten von `agent.cordis.yml` die EINZIGE Composition-Bearbeitung; darum bekam die Standing-Mount-Schicht stamp-keyed Generations: `ensureStanding` vergleicht mtime+size der Datei und startet die nächste Generation für spätere Sessions ([Standing-Mounts-Note](../../archived/architecture/2026-08-08-per-preset-standing-mounts.md), in-place aktualisiert). Ohne diesen Mechanismus würde eine bearbeitete Datei bis zum Prozess-Neustart stale Compositions ausliefern.
- Eine Kopie ist ein vollständiger Snapshot, der von einer aktualisierten mitgelieferten Quelle driftet — akzeptiert; die Preset-Schicht hat keine Patch-Semantik (das ist `cordis.patch.yml` der Bundle-Schicht), und das mitgelieferte Set selbst zahlt denselben Preis (`cordis`/`code` sind Vollkopien von `standard`) für die Lesbarkeit in einer Datei.
- `read` verlor `writable` (kein Editor, den es zu gaten gäbe), und builtin-Verzeichnisse werden nie geöffnet (`openDocument` lehnt wie `remove` non-`user`-Trust ab): das Install wird durch Upgrades überschrieben, und einen Editor darauf zu richten lädt zu Edits ein, die ein Upgrade still verwirft.

## Tragende Details

- **Die Ablehnung des Kopi-Ziels besteht absichtlich aus zwei Prüfungen.** Die Roster-Prüfung lehnt jede id ab, die ein Root liefert — ein User-Verzeichnis, das wie ein mitgeliefertes Preset heißt, würde verdeckt, sodass „create" eine Datei ablegt, die nie gelistet wird; die Disk-Prüfung (`PresetExistsError` vor `cp` mit `errorOnExist` als Race-Backstop) lehnt ein Verzeichnis ab, das den Namen belegt, ohne ein Preset zu sein — etwas, das Discovery nicht sehen kann.
- **Der angezeigte Pfad ist eine Disclosure in Response-Richtung, browser-authentifiziert.** Die Invariante „kein Browser-Payload kann ein beliebiges Dateisystem-Ziel wählen" betrifft die Request-Richtung; das aufgelöste Verzeichnis dem authentifizierten Browser zu zeigen ist der Fallback, den der Plan verlangt. Es fährt nie auf `list` mit.
- **Die e2e-Lane pinnt `nativeOpen: false`** (`agent-preset-authoring.overlay.yml`) — damit Goldens auf macOS-Dev und headless Linux CI denselben Branch rendern, und damit Testläufe nie einen echten Dateimanager öffnen. Das angezeigte Verzeichnis wird von der Lane selbst als `{{presetRoot}}` tokenisiert, da `normalizeAria` nur das workspace cwd kennt.

## Betrachtete Alternativen

Write mit einem besseren Editor behalten (CodeMirror etc.): immer noch beliebige Capability über die Schnittstelle, immer noch die Race-Quelle und immer noch ein schlechterer Editor als der eigene des Users. Kopien mit Patch-Semantik („standard plus dieses Diff"): unterhalb der Bundle-Ebene existiert keine solche Schicht, und die eigenen mitgelieferten Presets des Repos wählten Vollkopien bewusst. Browser-seitiges `session/openWorkspacePath` mit zurückgegebenem Pfad: bricht die No-arbitrary-target-Invariante des README in dem Moment, in dem der Pfad Request-Parameter wird.
