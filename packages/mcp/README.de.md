---
description: "Die MCP-Paketgruppe: externe Model-Context-Protocol-Server anbinden, damit ihre Tools als native Tools aufrufbar sind."
kind: "package-group"
---

# MCP — Model Context Protocol
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Die Gruppe `mcp/` verbindet den harness mit dem Model-Context-Protocol-(MCP)-Ökosystem von Tool-Servern. Das eine Paket dieser Gruppe bindet einen externen Server an — einen Dateisystem-, GitHub-, Datenbank- oder Memory-Server — sodass seine Tools dem Modell als native Tools unter stabilen server-qualifizierten Namen zur Verfügung stehen. Jeder Server ist ein Konfigurationseintrag; nichts wird aktiviert ausgeliefert, du entscheidest also pro Server. Nur die Tools-Capability wird gebridgt: MCP resources und prompts werden nicht unterstützt. Diese Seite kartiert die Gruppe; den Per-Package-Contract besitzt das Paket-README.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

Die Gruppe enthält ein Paket; das Paket-README und die Links unten besitzen die Details.

| Paket | Was es bereitstellt |
|---|---|
| [`mcp-client/`](mcp-client/README.de.md) | Bindet einen externen MCP-Server an, damit das Modell seine Tools als native Tools aufrufen kann |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

Probiere die ausgearbeiteten Beispielkonfigurationen, um das Plugin in Aktion zu sehen, und lies dann das Agent Note für die Verhaltensentscheidungen dahinter.

- [MCP-Client-Plugin-Agent-Note](../../.agents/notes/implemented/feature/2026-07-07-mcp-client-plugin.de.md) — das Design der Bridge: server-qualifizierte Namensgebung, Discovery, Ausführung und Environment-Scrubbing.
- [Guide zu Third-party-Memory-MCP](../../docs/user/guide/mcp-memory.de.md) — lauffähige Overlay-Zeilen und Setup-Anleitung.
- [Tools-Subsystem-Referenz](../../docs/subsystems/tools.de.md) — die `ToolRuntime`, die die registrierten Tools empfängt.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
