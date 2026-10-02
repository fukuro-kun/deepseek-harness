---
description: "Die ACP-Paketgruppe (Agent Client Protocol): der Nur-Automatisierungs-Server, der frische Harness-Agents über JSON-RPC stdio für programmatische Clients bereitstellt."
kind: "package-group"
---

# acp/ — Agent Client Protocol automation

[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

Die acp-Gruppe stellt ein Paket bereit: einen Server, über den Programme und Automatisierung persistente DeepSeek-Harness-Agents über das standardmäßige Agent Client Protocol ausführen können. Ein Client kann Sessions erstellen, listen, fortsetzen und schließen; standardmäßige MCP-Server anbinden; Modelloptionen wählen; Text- und Bild-Prompts senden; semantische Updates empfangen; Berechtigungsanfragen beantworten; und Arbeit abbrechen — ganz ohne Mensch in der Schleife. Der passende Client, der einen solchen Server aus einem anderen Harness spawnt, liegt in `subagent/subagent-acp`. Diese Seite kartiert die Gruppe; das Paket-README trägt den Paket-Contract.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Zugehörige Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

| Paket | Rolle |
|---|---|
| [`acp/`](acp/README.de.md) | Lässt Programme persistente Agents über ACP verwalten, MCP-Server anbinden, Modelloptionen wählen, Arbeit prompten und abbrechen sowie semantische Updates empfangen |

-----

<a id="related-documentation"></a>
## Zugehörige Dokumentation

- [dsh-subagent-acp](../subagent/subagent-acp/README.de.md) — der Out-of-Process-ACP-Client, der diesen Server spawnt und steuert.
- [ACP as an automation-only protocol](../../.agents/notes/implemented/simplification/2026-07-23-acp-automation-only-protocol.md) — der Design-Record für den Automatisierungs-Contract und seine Wire-Grenzen.
- [Multiplex concurrent ACP sessions over one connection](../../.agents/notes/archived/feature/2026-06-14-acp-multi-session.md) — Per-Session-Isolation-, Ownership- und Teardown-Entscheidungen.

<a id="dev-note"></a>
## Dev Note

Keine.
