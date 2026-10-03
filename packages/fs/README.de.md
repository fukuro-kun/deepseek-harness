---
description: "Die Filesystem-Paketgruppe: der ctx.fs-Provider-Vertrag, lokale und Sandbox-erzwingende Backends, das Read-before-Edit-Policy-Plugin und die modellseitigen Datei- und Suchtools."
kind: "package-group"
---

# packages/fs
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

Die `fs/`-Gruppe gibt Agents dauerhaften, policy-gesteuerten Dateizugriff: den `ctx.fs`-Service-Vertrag in `fs/`, die Host-Filesystem- und Sandbox-erzwingenden Backends in `fs-local/` und `fs-sandbox/`, die Read-before-Edit-Policy in `fs-observation-policy/` und die modellseitigen Tools in `tool-fs/` (`read`, `read_image`, `write`, `edit`) und `tool-fs-search/` (`glob`, `grep`). Ein Deployment mountet ein Backend, lädt die Policy für Freshness-geschützte Mutationen und registriert die Tool-Pakete, die das Modell sehen soll; Backends lassen sich tauschen, ohne Tools oder Policy anzufassen. Datei-I/O hat bewusst kein Timeout: Eine Deadline würde Arbeit töten, die das Betriebssystem noch zu Ende bringt, daher ist Cancellation an Syscall-Grenzen ein Best-Effort-Signal.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

Acht Pakete plus das entfernte Geschwister `fs-e2b` spielen die Filesystem-Rollen; die Subsystem-Referenz besitzt die erschöpfenden Verträge und die Fehlertaxonomie.

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`fs/`](fs/README.de.md) | `ctx.fs`-Service-Vertrag: Execution-World-Pfade, begrenzte Text-I/O und atomare Mutationen mit optionalem Versionsguard | `ctx.fs` |
| [`fs-local/`](fs-local/README.de.md) | Host-Filesystem-Backend: liest, schreibt und editiert echte Dateien auf dem lokalen Rechner | registriert auf `ctx.fs` |
| [`fs-sandbox/`](fs-sandbox/README.de.md) | Sandbox-erzwingendes Backend: schirmt Schreib- und Editiervorgänge nach dem Pro-Call-Sandbox-Modus ab, während Reads durchgehen | registriert auf `ctx.fs` |
| [`e2b/fs-e2b`](../e2b/fs-e2b/README.de.md) | E2B-gestütztes Backend: Dateizustand liegt in der entfernten Execution World, die mit dem E2B-Subprocess-Provider geteilt wird | registriert auf `ctx.fs` |
| [`fs-observation-policy/`](fs-observation-policy/README.de.md) | Read-before-Edit-Policy: zeichnet beobachtetes Vorhandensein oder Fehlen auf und schützt write/edit über die `fs/*`-Ereignisse | `fs/*`-Listener |
| [`tool-fs/`](tool-fs/README.de.md) | Modellseitige `read`-, `read_image`-, `write`- und `edit`-Tools plus ihr Executor | registriert auf `ctx.tools` |
| [`tool-fs-search/`](tool-fs-search/README.de.md) | Modellseitige `glob`- und `grep`-Discovery-Tools, gestützt auf das mitgelieferte ripgrep-Binary | registriert auf `ctx.tools` |
| [`tool-str-replace-editor/`](tool-str-replace-editor/README.de.md) | Eigenständiges `str_replace_editor`-Tool: `view`, `create`, `str_replace` und `insert` über `ctx.fs` | registriert auf `ctx.tools` |
| [`tool-present/`](tool-present/README.de.md) | Explizite unveränderliche Snapshots ausgelieferter Dateien | registriert auf `ctx.tools` |

Die Policy ist ein Plugin, kein Dienst, den die Tools injizieren: Ihr Entfernen hinterlässt das bedingungslose Mutationsverhalten des nackten Providers, statt die Tools zu brechen. Der Moduszaun in `fs-sandbox` und das Read-before-Edit-Gate komponieren. `tool-fs-search` erweitert bewusst nicht den Provider-Vertrag — Suche ist ein prozessgestützter ripgrep-Workflow, sodass Filesystem-Backends frei von einer universellen Such-API bleiben.

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

Beginne mit der Subsystem-Referenz für das gemeinsame Vokabular und die Fehlertaxonomie, dann mit den Entscheidungen, die die Familie geprägt haben.

- [Filesystem-Subsystem](../../docs/subsystems/filesystem.de.md) — Ziele, Outcomes, Guards, Policy-Ereignisse und die Fehlertaxonomie.
- [Cross-Family-fs-Sandbox-Entscheidung](../../.agents/notes/implemented/feature/2026-07-14-cross-family-fs-sandbox.de.md) — der gemeinsame Sandbox-Modus-Zaun über dem Filesystem-seam.
- [Portable-Execution-World-Consumers-Entscheidung](../../.agents/notes/implemented/architecture/2026-07-28-portable-execution-world-consumers.de.md) — warum das E2B-Backend die entfernte Execution World teilt.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
