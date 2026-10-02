---
description: "File-Reference-Discovery und @file-Mention-Grammatik für hostgestützte UIs, für Benutzer und Maintainer, die den Seam wählen oder mit einem Provider kombinieren."
kind: "package-reference"
---

# @deepseek-ai/dsh-file-reference

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

Hostgestützte Benutzeroberflächen verwenden `dsh-file-reference`, um `@file`-Vervollständigung anzubieten: Eine UI fragt Pfadkandidaten für den adressierten Agent an, das Modell tippt `@path` oder `@"path with spaces"`, und die Auswahl eines Kandidaten fügt die passende Mention als gewöhnlichen Prompt-Text ein. Der Seam selbst besitzt keinen Filesystem-Zugriff — ein konkreter Provider wie `@deepseek-ai/dsh-file-reference-local` liefert Kandidaten, Ranking, Caching und Invalidierung. Die Auswahl eines Kandidaten liest oder hängt niemals Dateiinhalte an; das Modell muss ein Filesystem-Tool aufrufen, um eine Datei zu prüfen. Session Controller stellt Browser-Consumern dieselbe Discovery über den `fileReferences/list` Remote zur Verfügung.

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

Wähle dieses Paket, wenn eine hostgestützte UI (Web oder Terminal) `@file`-Vervollständigung anbieten soll, und kombiniere es mit einem Provider, dessen Namespace zum wirksamen `read`-Tool des Agent passt. Ein Mounten des Seam ohne Provider gibt der UI eine leere Vervollständigungsfläche.

### Mention-Grammatik

Ein `@path`-Token am Eingabeanfang oder nach Whitespace löst die Vervollständigung aus; ein `@` innerhalb eines anderen Tokens, etwa in einer E-Mail-Adresse, nicht. `@"path with spaces"` öffnet eine gequotete Mention, und ein Verzeichniskandidat hält das Quote nach seinem abschließenden Slash offen, sodass die Vervollständigung eine Ebene tiefer absteigen kann. Der Formatter lehnt Pfade mit Steuerzeichen oder eingebetteten Quotes ab, die die Grammatik nicht sicher darstellen kann.

### Kandidaten abrufen

`ctx.fileReferences.list(agent, query, signal)` gibt rein pfadbasierte Datei- und Verzeichniskandidaten für das Working Directory eines Agent zurück, deterministisch vom Provider gerankt. Verzeichnis-Mentions werden mit abschließendem `/` gerendert, sodass die Vervollständigung eine Ebene tiefer absteigen kann. Browser-Consumer rufen den Session-Controller-Adapter als `ctx.remote.fileReferences.list` auf; das abschließende Signal bricht eine langsame Autovervollständigung ab.

### Mit einem Provider kombinieren

Für ein lokales Filesystem mounte `@deepseek-ai/dsh-file-reference-local`; andere Namespaces (remote oder virtuelle Filesysteme) brauchen einen Provider, dessen Discovery zum wirksamen Tool passt. Wenn der adressierte Agent `read` aufrufen kann, darf ein Provider die stabile `FILE_REFERENCE_PROMPT`-Guidance installieren, die das Modell anweist, eine referenzierte Datei zu lesen, bevor es behauptet, sie geprüft zu haben.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Design des Seam; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designkonzept

Das Paket trennt einen abstrakten Discovery-Service von einer gemeinsamen, browsersicheren Mention-Grammatik; Provider besitzen Namespace-Zugriff, Ranking, Caching und Invalidierung. Der Service bleibt wire-neutral; `dsh-api-session-controller` besitzt den `fileReferences/list`-Remote-Adapter und delegiert nach dem Auflösen seines Agent an den aktiven Provider.

### Source Map

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Abstrakter `FileReferenceService` und `FILE_REFERENCE_PROMPT` |
| [`src/grammar.ts`](src/grammar.ts) | `activeAtToken`-Erkennung und `formatFileMention`-Rendering |
| [`src/types.ts`](src/types.ts) | `FileReferenceCandidate`: rein pfadbasierter Ergebnistyp |
| — | Es wird kein Runtime-Invariant-Companion veröffentlicht; das Interface hält keinen Kandidaten- oder Lifecycle-State; konkrete Provider besitzen ihre Cache- und Invalidierungsbeziehungen. |

### Hauptablauf

Die UI erkennt ein aktives `@`-Token über `activeAtToken`, ruft `list` mit dem Query-Text auf und rendert die gerankten Kandidaten. Bei Auswahl gibt `formatFileMention` die passende Prompt-Schreibweise aus (`@path`, `@"path with spaces"` oder ein offenes `@"dir/` für ein gequotetes Verzeichnis). An keiner Stelle werden Dateiinhalte gelesen; Provider dürfen zusätzlich den stabilen `FILE_REFERENCE_PROMPT`-Abschnitt installieren, wenn der adressierte Agent ein `read`-Tool hat.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Vertrag nicht ausreicht. Sie führen vom mitgelieferten Provider zur gemeinsamen Referenzfläche und zu den Tools, auf die die Kandidaten zeigen.

- [Lokaler File-Reference-Provider](../file-reference-local/README.de.md) — die mitgelieferte Local-Workspace-Implementierung dieses Seam.
- [Session-Reference-Subsystem](../../../docs/subsystems/session-reference.de.md) — die gemeinsamen File-Reference- und Session-Reference-Verträge hinter Host-UIs.
- [Context-Gruppenkarte](../README.md) — benachbarte Request-Context-Pakete.
- [Filesystem-Tool-Katalog](../../../docs/tool-catalog.md#deepseek-aidsh-tool-fs) — das `read`-Tool, für das die referenzierten Pfade gedacht sind.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über den kombinierten Provider, der die File-Reference-Guidance besitzt, die Discovery-Seam und Grammatik dieses Pakets an ihn delegieren.

#### KV-Cache-Effekt

Interface und Grammatik fügen keine Request-Tokens hinzu; ein Provider-besitzter Prompt-Abschnitt bestimmt, ob sich das wiederverwendbare Präfix ändert.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann der Seam schlecht passt. Sie sind aktuelle Paket-Constraints.

- **Pfadkandidaten sind advisory** — der Seam beweist nicht, dass ein späteres modellseitiges Filesystem-Tool denselben Namespace erreichen kann; Deployments müssen den Provider mit der wirksamen `read`-Implementierung abgleichen.
- **Kein Dateiinhalts-Referenzobjekt** — ausgewählte Dateien bleiben gewöhnlicher Prompt-Text und benötigen einen expliziten Tool-Call des Modells, bevor ihre Inhalte modellsichtbar werden.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
