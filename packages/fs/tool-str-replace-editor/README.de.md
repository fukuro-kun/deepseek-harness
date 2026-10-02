---
description: "Das standalone str_replace_editor-Tool über ctx.fs für Nutzer und Maintainer, die Claude-Code-artige Dateibearbeitung für Agents komponieren."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-str-replace-editor

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`dsh-tool-str-replace-editor` stellt ein standalone modellseitiges `str_replace_editor`-Tool über `ctx.fs` bereit: `view` zeigt nummerierten Datei-Inhalt oder ein flaches Directory-Listing, `create` legt eine neue Datei an, `str_replace` wendet einen eindeutigen Literal-Ersatz an, und `insert` fügt Zeilen an einer gewählten Grenze ein. Es ist mit persistentem Bash, One-Shot-Bash, sandboxed Bash oder einer anderen Terminal-Oberfläche komponierbar. Mutationen gehorchen derselben Read-before-Edit-Policy und Sandbox-Fence wie der Rest der fs-Familie, durchgesetzt von jeweils gemounteten Backend- und Policy-Plugins. Wählen Sie es, wenn ein Deployment das Claude-Code-artige Einzel-Editor-Tool mit absoluten Pfaden will; das `dsh-tool-fs`-Paket stellt die alternative `read`/`write`/`edit`-Suite bereit.

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

Mounten Sie das Tool neben einem `ctx.fs`-Backend (und für bewachte Mutationen dem Policy-Plugin), wenn das Modell Dateien über das vertraute `view`/`create`/`str_replace`/`insert`-Kommando-Vokabular auf absoluten Pfaden bearbeiten soll.

### Minimale Komposition

Ein Backend, optional das Policy-Plugin, dann das Tool; der Editor komponiert mit jeder Terminal-Oberfläche.

```yaml
- name: '@deepseek-ai/dsh-fs-local'
- name: '@deepseek-ai/dsh-fs-observation-policy'
- name: '@deepseek-ai/dsh-tool-str-replace-editor'
```

### Konfiguration

| Schlüssel | Default | Bedeutung |
|---|---|---|
| `maxOutputChars` | `16000` | Für Datei- und Directory-Views behaltene Präfix-Characters |
| `description` | `Custom editing tool for viewing, creating and editing files` (mehrzeilig) | Modellseitige Tool-Beschreibung |

### Die Kommandos

`view` gibt eins-basiert nummerierten Datei-Inhalt zurück (Tabs bleiben erhalten, sodass angezeigter Text gültige Literal-Ersatz-Eingabe bleibt) oder ein Two-Level-Directory-Listing, das versteckte, Dependency- und Python-Cache-Einträge auslässt. `create` legt eine neue Datei an und verweigert das Überschreiben einer bestehenden. Kommando-spezifische Felder können `null`-Platzhalter enthalten, wenn das gewählte Kommando sie nicht nutzt; Pflichtfelder bleiben Pflicht, `view_range: null` wählt die volle Ansicht, und `str_replace.new_str: null` wird rejected, sodass Löschen Weglassen erfordert. `str_replace` erfordert einen eindeutigen Literal-Match, wobei Fehler im öffentlichen `old_str`-Vokabular gemeldet werden; `insert` folgt der gewählten null-basierten Einfüge-Grenze, ohne ein implizites abschließendes Newline hinzuzufügen. Mutationen bewahren Tabs außerhalb der angefragten Bearbeitung.

### Fehler und Wiederherstellung

Ein Metadata-Miss von `view`, `str_replace` oder `insert` zeichnet bestätigte Abwesenheit auf, bevor er `FS_NOT_FOUND` zurückgibt, sodass ein späteres `create` einen extern gelöschten Pfad über den Guarded-Create-Fluss der gemounteten Policy zurückgewinnen kann; Abwesenheit autorisiert nie `str_replace` oder `insert`. Bewachte Mutationen erben die Codes und Remedies des Policy-Plugins — `FS_NOT_OBSERVED` (die Datei lesen, dann retry), `FS_STALE_VERSION` (neu lesen, dann retry) — und Sandbox-Denials treten als `[sandbox: file access denied under <mode> mode]`-Marker auf. Pfade müssen absolut sein; ein relativer Pfad wird mit einem Hinweis abgelehnt.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Design-Entscheidungen hinter dem Editor-Tool und verweist auf den Code, der sie umsetzt; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig behandelt.

### Design-Konzept

Das Tool ist ein Schema mit vier Kommandos über `ctx.fs`. Mutationen fassen den Provider nie direkt mit eigenen Annahmen an: Jede läuft den `fs/write-intent`- oder `fs/edit-intent`-Waterfall, um den Guard des Policy-Plugins zu erhalten, resolved die pro-Aufruf-Sandbox-Policy, wenn das gemountete `ctx.fs` einschränkt, und delegiert die Durchsetzung an den Provider. `str_replace` und `insert` lesen die Datei zusätzlich neu und verwenden die beobachtete Version als Compare-and-Swap-Basis, wenn kein Policy-Plugin einen Guard liefert.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Das ganze Tool: Schema, Kommando-Dispatch, View-Rendering, Mutations-Policy |

### Wie jedes Kommando läuft

Jedes Kommando resolved zuerst den absoluten Pfad; Mutationen folgen dann einem geteilten Fluss — Policy-Guard, Provider-Durchsetzung, dann ein `fs/observed`-Record bei Erfolg — während `view` nur stattet und rendert. Das ganze Tool — Schema, Kommando-Dispatch und View-Rendering — lebt in `src/index.ts`.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Paket-Vertrag nicht ausreicht. Sie führen vom Tool zum Vertrag, zur Policy und zu den Backends, mit denen es komponiert.

- [Filesystem-Subsystem](../../../docs/subsystems/filesystem.de.md) — erschöpfender Provider-Vertrag, Policy-Events und Fehler-Taxonomie.
- [dsh-fs](../fs/README.de.md) — der `ctx.fs`-Vertrag, den dieses Tool konsumiert.
- [tool-fs](../tool-fs/README.de.md) — die alternative `read`/`write`/`edit`-Tool-Suite.
- [fs-observation-policy](../fs-observation-policy/README.de.md) — das Policy-Plugin, das Mutationen über die `fs/*`-Events bewacht.
- [fs-sandbox](../fs-sandbox/README.de.md) — das sandbox-durchsetzende Backend, das Mutationen einzäunt.
- [Generierter Tool-Katalog](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-str-replace-editor) — das erschöpfende Schema, das dieses Paket registriert.

-----

<a id="model-experience"></a>
## Model Experience

### Tool-Schema

#### Was das Modell sieht

Das generierte [`str_replace_editor`-Schema](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-str-replace-editor), einschließlich der konfigurierten `description`. Das Plugin trägt keine eigenständige System-Prompt-Sektion bei.

#### Token-Effekt

Feste Schema-Kosten, solange `str_replace_editor` sichtbar ist.

#### KV-Cache-Effekt

Präfix-stabil, solange die konfigurierte Beschreibung und das Schema unverändert bleiben.

### Tool-Ergebnisse

#### Was das Modell sieht

Views geben nummerierten Text oder ein flaches Directory-Listing zurück. Calls exponieren Datei-Positionen, und Create/Replace-Calls exponieren Diff-Cards an Präsentations-Oberflächen. Mutationen geben knappe Bestätigungen zurück. Lange Views behalten ihr Präfix und hängen einen Clipping-Hinweis an.

#### Token-Effekt

Datenabhängig und begrenzt durch `maxOutputChars` plus den festen Clipping-Hinweis.

#### KV-Cache-Effekt

Append-only-Tool-Ergebnisse folgen dem wiederverwendbaren Request-Präfix.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann das Editor-Tool eine schlechte Wahl ist oder besondere betriebliche Sorgfalt braucht. Sie sind aktuelle Paket-Einschränkungen, kein allgemeiner Editor-Vergleich und kein Task-Backlog.

- **Operationen zielen auf UTF-8-Text** — Binärdateien werden nicht unterstützt.
- **`str_replace` rejected absichtlich null oder mehrere Matches** — es hat kein `replace_all`-Argument.
- **Jede Mutation läuft über die gemountete Policy und Sandbox** — `fs/write-intent` oder `fs/edit-intent` resolved die aktuelle Session-Sandbox-Policy und delegiert die Durchsetzung an die gemounteten Filesystem- und Policy-Plugins, sodass ein Deployment ohne sie unbedingte Mutationen erhält.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>

**Runtime-Invariante:** Es wird kein Begleiter veröffentlicht. Der Tool-Adapter besitzt keinen unabhängigen durable State; Filesystem-Mutations-Relationen bleiben bei den Provider- und Policy-Plugins.
