---
description: "Die hooks-Gruppenkarte: bestehende Claude-Code- und Codex-Shell-Hook-Konfigurationen während agent-Runs ausführen, für Nutzer und Maintainer, die die Gruppe durchsehen."
kind: "package-group"
---

# packages/hooks
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Die hooks-Gruppe lässt agent-Runs Shell-Hooks wiederverwenden, die für Claude Code oder Codex geschrieben wurden. Richte die passende Integration auf eine bestehende `hooks.json`, um unterstützte Command-Hooks auszuführen, wenn Sessions starten, Prompts eintreffen, Tools laufen oder Runs stoppen. Diese Hooks können Prompts oder tool-Aufrufe mit modellsichtbaren Nachrichten blockieren, Konversationskontext hinzufügen oder verlangen, dass der Run weitergeht. Wähle diese Gruppe, um bestehende Hook-Konfigurationen zu erhalten; jede Integration unterstützt nur die Command-Hook-Teilmenge, die ihr Quell-Tool dokumentiert.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

| Paket | Rolle | Form |
|---|---|---|
| [`hook-protocol`](hook-protocol/README.de.md) | Die gemeinsame Hook-Engine, die beide Bridges verwenden; nie direkt konfiguriert | Library |
| [`hooks-claude-code`](hooks-claude-code/README.de.md) | Führt deine bestehenden Claude-Code-`hooks.json`-Hooks während agent-Runs aus | Plugin |
| [`hooks-codex`](hooks-codex/README.de.md) | Führt deine bestehenden Codex-`hooks.json`-Hooks während agent-Runs aus | Plugin |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

- [Agent Note zu Interception-Extension-points](../../.agents/notes/implemented/feature/2026-06-30-interception-extension-points.de.md) — die typisierte Decision-Oberfläche, gegen die die Bridges programmieren.
- [Hook-Bridges-Agent-Note](../../.agents/notes/archived/feature/2026-06-30-hook-bridges.md) — das Bridge-Design und sein Decision-Mapping.
- [Hook-Protocol-Library-Agent-Note](../../.agents/notes/archived/feature/2026-06-30-hook-protocol-lib.md) — was die gemeinsame Library besitzt und warum.

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
