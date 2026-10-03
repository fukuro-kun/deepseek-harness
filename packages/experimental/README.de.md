---
description: "The experimental group map: pre-stable prototypes that are private by default, with explicit public Agent Teams packages."
kind: "package-group"
---

# packages/experimental
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Die Gruppe experimental enthält Prototyp-Capabilities, deren Verträge sich ändern können und keine Support-Zusage tragen. Pakete sind standardmäßig privat; die fünf Agent-Teams-Pakete sind explizit veröffentlichte Ausnahmen unter ihren bestehenden `@deepseek-ai/dsh-experimental-*`-Namen. Die Gruppe enthält außerdem die privaten realm-übergreifenden Inspector-, CPython-Subprozess-Backend- und Browser-Worker-Vorschaupakete. Veröffentlichte Produkte außerhalb dieser Gruppe dürfen nicht von experimentellen Paketen abhängen.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`agent-team-profile`](agent-team-profile/README.de.md) | Veröffentlichte opt-in-Profilebene für Agent Teams | — |
| [`agent-team`](agent-team/README.de.md) | Benannte teammates mit persistenten Nachrichten und einem gemeinsamen Aufgabenboard | `ctx.agentTeams` |
| [`agent-team-web-profile`](agent-team-web-profile/README.de.md) | Veröffentlichte opt-in-Webebene für Agent Teams | — |
| [`client-ui-agent-team`](client-ui-agent-team/README.de.md) | Team-Roster, Aufgabenboard und teammate-Navigation für Web | — |
| [`code-runtime-python`](code-runtime-python/README.de.md) | CPython-Subprozess-Backend für den Code-Ausführungs-seam | `ctx.codeRuntime` |
| [`inspector`](inspector/README.de.md) | Realm-übergreifender CDP-Hub für Host-Debugging, Client-Runtime-Inspektion, Netzwerkaufzeichnung und Cordis-Bäume | `ctx.inspector` |
| [`tool-agent-team`](tool-agent-team/README.de.md) | Neun tools, mit denen das Modell teammates erstellen, benachrichtigen und koordinieren kann | registriert gescopte tools auf `ctx.tools` |
| [`webworker-packer`](webworker-packer/README.de.md) | Baut das gzip-komprimierte VFS-Image, das die Browser-Worker-Vorschau konsumiert | Bibliothek und CLI — kein ctx-Schlüssel |
| [`webworker-runtime`](webworker-runtime/README.de.md) | Führt den Harness-Plugin-Baum in einem dedizierten Browser-Worker aus | Bibliothek und Worker-Einstieg — kein ctx-Schlüssel |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

- [Entscheidung zu experimentellen Paketen](../../.agents/notes/implemented/architecture/2026-08-18-experimental-agent-teams-packages.de.md) — private Defaults, öffentliche Agent-Teams-Ausnahmen und Abhängigkeitsisolierung.
- [Agent-Teams-Subsystem](../../docs/subsystems/agent-team.de.md) — persistente Team-Typen und die `ctx.agentTeams`-Service-API.
- [Regeln des experimental-Teilbaums](AGENTS.md) — was der experimentelle Status lockert und was nicht.

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
