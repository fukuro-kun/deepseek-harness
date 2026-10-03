---
description: "Lokaler Workspace-@file-Completion-Provider für Benutzer und Maintainer, die die ctx.fileReferences-Discovery aktivieren, dimensionieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-file-reference-local
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

Agents und Host-UIs können `@file`-Mentions mit gerankten Pfaden aus dem lokalen Workspace des jeweiligen Agent vervollständigen, mit begrenzter Discovery, die auch in großen Repositories responsiv bleibt. Ergebnisse werden nach Tool-Aktivität aktualisiert, ohne die Vervollständigung zu blockieren, und Verzeichnis-Symlinks werden nie verfolgt. Wenn `read` verfügbar ist, erhält das Modell außerdem stabile Guidance zur Interpretation referenzierter Pfade. Wähle dieses Paket, wenn `read` das Harness-Host-Filesystem verwendet; remote oder virtuelle Namespaces brauchen passende Discovery.

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

Mounte diesen Provider, wenn die `@file`-Vervollständigung das eigene Filesystem des Harness-Hosts durchsuchen soll — den Namespace, auf dem das mitgelieferte `read`-Tool arbeitet. Der Workspace jedes Agent wird ab dem Working Directory seiner Session indiziert, mit Fallback auf das Host-Prozessverzeichnis, wenn die Session keines hat.

### Den Provider aktivieren

Die Defaults passen für einen typischen Workspace, daher braucht das minimale Mount keine Konfiguration:

```yaml
- name: '@deepseek-ai/dsh-file-reference-local'
  config:
    maxResults: 20
```

### Was du bekommst

Die Eingabe von `@` in einer Host-UI liefert bis zu `maxResults` gerankte Pfadkandidaten für den adressierten Agent. Eine Query, die `/` enthält, listet die Einträge des passenden Verzeichnisses direkt; eine leere Query ranked den begrenzten rekursiven Index fuzzy. Verzeichniskandidaten halten die Mention mit einem abschließenden Slash offen. Nach jedem Tool-Ergebnis wird der Index des Agent als stale markiert: Die nächste Query antwortet noch daraus, und ihr Ersatz baut im Hintergrund, sodass ein Rebuild nie vor dem Caret steht.

### Konfiguration

| Feld | Standard | Bedeutung |
|---|---|---|
| `maxResults` | `20` | Maximale Anzahl gerankter Kandidaten pro Query |
| `maxEntries` | `50000` | Maximale Anzahl indizierter Dateien und Verzeichnisse pro Agent-Workspace |
| `excludedDirectories` | `['.git', 'node_modules', 'dist', 'build', 'out', 'coverage', 'target', '.next', '.nuxt', '.turbo', '.venv', '__pycache__', '.pytest_cache', '.mypy_cache', '.gradle']` | Verzeichnis-Basenames, die von Traversal und Kandidaten ausgenommen sind |

Jeder numerische Wert muss ein positiver safe integer sein, und jeder ausgeschlossene Name muss ein nicht-leerer Basename ohne `/` oder `\` sein.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Design des Providers; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designkonzept

Der Provider hält pro Agent ein wiederverwendbares `WorkspaceFileSearch`, verwurzelt im `cwd` dieser Session. Verzeichnisbezogene Queries (`a/b/...`) listen den Live-Verzeichniszustand, während leere Fuzzy-Queries einen gemeinsamen begrenzten rekursiven Traversal teilen. Nur die erste leere Query eines Workspace wartet auf diesen Traversal; ein `tool/result`-Event markiert die abgerechneten Einträge als stale, und die nächste leere Query bedient sie, während der Ersatz aufbaut. Die Modell-Guidance ist ein pro-Agent-Prompt-Abschnitt, der nur beigesteuert wird, solange der adressierte Agent ein `read`-Tool hat; die Disposal des Agent gibt sowohl Index als auch Prompt-Fiber frei.

### Source Map

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | `LocalFileReferenceService`: Config-Validierung, Searches pro Agent, Prompt-Installation |
| [`src/search.ts`](src/search.ts) | `WorkspaceFileSearch`: Traversal, Ranking, Exclusion, Staleness und Background-Rebuild |
| — | Es wird kein Runtime-Invariant-Companion veröffentlicht; die pro-Agent-Indizes sind private advisory Caches, deren Invalidierung und Disposal direkt über Service-Tests beobachtet werden. |

### Hauptablauf

Ein `list(agent, query, signal)`-Aufruf listet entweder die Einträge eines Verzeichnisses oder liest den geteilten begrenzten Index, rankt die Kandidaten (exact-, prefix-, substring-, dann subsequence-Scores mit Verzeichnis-Boni) und gibt höchstens `maxResults` in deterministischer Reihenfolge zurück. `tool/result`-Events markieren den Index des adressierten Agent als stale, sodass eine spätere leere Query einen frischen Baum sieht. Ein unlesbarer oder ausgeschlossener Subtree liefert keine Kandidaten, während eine unlesbare Wurzel ihren Traversal stattdessen fehlschlagen lässt: Ein transienter Fehler darf noch gültige Einträge nicht durch einen leeren Index ersetzen.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Vertrag nicht ausreicht. Sie führen vom Seam, den dieser Provider implementiert, zu den Tools, auf die seine Kandidaten zeigen.

- [File-Reference-Seam](../file-reference/README.de.md) — der Service-Vertrag und die `@file`-Grammatik, die dieser Provider implementiert.
- [Session-Reference-Subsystem](../../../docs/subsystems/session-reference.de.md) — der geteilte File-Reference-Vertrag hinter Host-UIs.
- [Filesystem-Tool-Katalog](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-fs) — das `read`-Tool, dessen Namespace-Discovery übereinstimmen muss.
- [Context-Gruppenkarte](../README.de.md) — benachbarte Request-Context-Pakete.

-----

<a id="model-experience"></a>
## Model Experience

### File-Reference-Guidance bei verfügbarem read

#### Was das Modell sieht

Wenn der adressierte Agent ein wirksames `read`-Tool hat, trägt der Provider diesen stabilen System-Prompt-Abschnitt bei:

##### File-Reference-Anweisung

```markdown
Tokens prefixed with @ are workspace paths the user explicitly referenced, relative to the workspace root. A trailing slash marks a directory: list it when its contents matter. Anything else is a file: use the read tool when its contents are needed, and do not claim to have inspected it before reading. @"..." quotes a path containing spaces.
```

#### Token-Effekt

Konditional und fixiert: Der eine Satz ist vorhanden, solange `read` für den adressierten Agent sichtbar ist; die Kandidatensuche selbst fügt keine Tokens hinzu, und ein gewählter Pfad trägt nur seine gewöhnlichen User-Message-Zeichen bei.

#### KV-Cache-Effekt

Der stabile Satz tritt dem System-Prompt-Präfix bei. Das Mounten oder Entfernen dieses Providers oder das Ändern, ob `read` sichtbar ist, ändert dieses Präfix; Queries, Kandidaten und Index-Staleness tun das nicht.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann der Provider schlecht passt. Sie sind aktuelle Paket-Constraints.

- **Host-lokaler Namespace** — der Provider scannt das Harness-Host-Filesystem, daher benötigen remote oder virtuelle `read`-Implementierungen einen Provider, dessen Namespace zum Tool passt.
- **Begrenzter advisory Index** — sehr große Workspaces können Pfade nach `maxEntries` auslassen, und ausgeschlossene oder unlesbare Verzeichnisse erscheinen nicht. Die Standard-Ausschlüsse nennen nur Build-Outputs, die kein Ökosystem auch für Quellen nutzt; `lib` fehlt bewusst, sodass ein Workspace, der dorthin baut, diesen Namen über `excludedDirectories` hinzufügt.
- **Ein Invalidierungsfenster von Staleness** — eine leere Query, die direkt nach einem Tool-Ergebnis beantwortet wird, spiegelt den Baum zum Stand des vorherigen Traversals; die darauffolgende Query sieht den Rebuild.
- **Keine Ignore-File-Semantik** — `.gitignore` und andere Projekt-Ignore-Dateien beeinflussen die Discovery nicht; nur konfigurierte Verzeichnis-Basenames werden ausgeschlossen.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
