---
description: "Die subagent-Paketgruppe: der Delegation-seam, seine in-process- und out-of-process-Backends und die modellseitigen Delegation-Tools."
kind: "package-group"
---

# subagent/ — subagent-Capability-Familie

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Die subagent-Paketfamilie lässt einen agent eine Aufgabe an ein Kind delegieren, die Arbeit des Kinds fortsetzen und jedes erstellte Kind entdecken. Wähle ein frisches in-process-Kind für isolierte Arbeit, ein mit Historie vorbefülltes in-process-Kind, wenn frühere Konversation zählt, oder ein out-of-process-Kind hinter ACP, Codex, Claude Code oder einer anderen Harness-Runtime. Modellseitige Tools lassen agents außerdem benachbarten agents Nachrichten senden, Arbeit unterbrechen und Kind-Status auflisten. Jedes Kind bleibt für sein Elternteil sichtbar, ob es läuft oder gespeichert ist; die Paket-READMEs dokumentieren Provider-spezifische Einrichtung und Grenzen.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`subagent/`](subagent/README.de.md) | Definiert den Delegation-Service: Provider-Registry, One-shot-Runs, fortsetzbare Kinder und Discovery | `ctx.subagents` |
| [`subagent-in-process-driver/`](subagent-in-process-driver/README.de.md) | Stellt den gemeinsamen in-process-Run-Driver bereit | — |
| [`subagent-spawn-in-process/`](subagent-spawn-in-process/README.de.md) | Führt ein frisches in-process-Kind aus | registriert auf `ctx.subagents` |
| [`subagent-fork-in-process/`](subagent-fork-in-process/README.de.md) | Führt ein in-process-Kind aus, das aus der abgeschlossenen Historie des Elternteils vorbefüllt ist | registriert auf `ctx.subagents` |
| [`subagent-acp/`](subagent-acp/README.de.md) | Führt ein out-of-process-Kind über das Agent Client Protocol aus | registriert auf `ctx.subagents` |
| [`subagent-codex/`](subagent-codex/README.de.md) | Führt ein echtes Codex-Kind über das offizielle App-Server-Protokoll aus | registriert auf `ctx.subagents` |
| [`subagent-claude-code/`](subagent-claude-code/README.de.md) | Führt ein echtes Claude-Code-Kind über das offizielle Agent SDK aus | registriert auf `ctx.subagents` |
| [`subagent-dsh-sdk/`](subagent-dsh-sdk/README.de.md) | Führt ein out-of-process-Harness-Kind über das TypeScript SDK aus | registriert auf `ctx.subagents` |
| [`tool-subagent/`](tool-subagent/README.de.md) | Exponiert Delegation dem Modell | registriert auf `ctx.tools` |
| [`tool-subagent-control/`](tool-subagent-control/README.de.md) | Exponiert dem Modell Messaging an benachbarte agents, Interrupt und Listing | registriert auf `ctx.tools` |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

- [subagent-Subsystem](../../docs/subsystems/subagent.de.md) — der Service-Contract, der Provider-Contract und die Terminal-Result-Semantik.
- [subagent-Capability-seam](../../.agents/notes/implemented/feature/2026-06-21-subagent-capability-seam.de.md) — der Design-Record für die Delegation-Capability-Familie.
- [Fortsetzbare subagents](../../.agents/notes/implemented/feature/2026-07-28-continuable-subagent-conversations.de.md) — persistente Kinder, die Folge-Turns akzeptieren.
- [tool-subagent-control README](tool-subagent-control/README.de.md) — die Oberfläche für Folge-Nachrichten, Interrupt und Listing.

<a id="dev-note"></a>
## Dev Note

Keine.
