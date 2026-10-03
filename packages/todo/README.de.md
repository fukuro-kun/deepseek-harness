---
description: "Die todo-Gruppenkarte: das modellseitige todo_write-Tool über dem Session-Log, für Nutzer und Maintainer, die die Gruppe durchsuchen."
kind: "package-group"
---

# packages/todo
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Die todo-Gruppe gibt Agents eine sitzungsweite Aufgabenliste zum Planen: Aufgaben hinzufügen, als in Bearbeitung markieren und abhaken; dieselbe Liste bleibt über Turns und erneut geöffnete Sessions hinweg bestehen. Sie besteht aus einem Produktpaket, das das `todo_write`-Tool bereitstellt; die Liste gehört der Agent-Session, die sie erstellt hat, und jede Aktualisierung ersetzt die gesamte Liste. Interaktive Hosts zeigen den aktuellen Plan aus der Liste an; die Gruppe selbst liefert keine UI mit.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Entwicklerhinweis](#dev-note)

-----

<a id="packages"></a>
## Pakete

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`tool-todo`](tool-todo/README.de.md) | Lässt den Agent eine Session-Aufgabenliste pflegen: Aufgaben planen, Status aktualisieren, Fortschritt verfolgen | registriert auf `ctx.tools` |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

- [Todo-Subsystem](../../docs/subsystems/todo.de.md) — die `todo/write`-Event-Nutzlast, Eigentumsregeln und `TodoItem`.
- [Generierter Tool-Katalog](../../docs/tool-catalog.de.md#deepseek-aidsh-tool-todo) — das `todo_write`-Schema, das das Modell erhält.
- [Generierter Konfigurationskatalog](../../docs/config-catalog.de.md#deepseek-aidsh-tool-todo) — jedes akzeptierte Konfigurationsfeld.
- [todo_write-Tool Agent Note](../../.agents/notes/archived/feature/2026-06-29-todo-write-tool.md) — das ursprüngliche Design und seine Alternativen.

-----

<a id="dev-note"></a>
## Entwicklerhinweis

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
