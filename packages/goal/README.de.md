---
description: "The goal group map: one durable completion objective per session, with model tools, a human command, and automatic continuation, for users and maintainers navigating the group."
kind: "package-group"
---

# packages/goal

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Die goal-Gruppe lässt eine agent-Session ein persistentes Abschlussziel über Restarts, Resumes und Forks hinweg verfolgen. Agents können das Ziel erstellen und aktualisieren, während Menschen es mit `/goal` direkt einsehen oder steuern können, ohne einen Modell-Turn zu verbrauchen. Ein optionales Continuation-Paket kann aktive Arbeit über sequentielle Rounds weiterführen. Jede Session hat nur ein aktuelles Goal, und dieses Goal zeichnet den Abschlusszustand auf statt Arbeit zu schedulen; automatische Fortsetzung muss daher separat aktiviert werden.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`goal`](goal/README.de.md) | Ein persistentes Goal pro Session: create, edit, pause, resume, complete, block und clear | `ctx.goals` |
| [`tool-goal`](tool-goal/README.de.md) | Modell-tools `get_goal`, `create_goal`, `update_goal` | registriert auf `ctx.tools` |
| [`command-goal`](command-goal/README.de.md) | `/goal`-Befehl für Menschen in UI-Befehlsebenen | registriert auf `ctx.commands` |
| [`goal-round-driver`](goal-round-driver/README.de.md) | Automatische Fortsetzung: verwandelt ein aktives Goal in sequentielle Rounds | kein Service-Schlüssel |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

- [Goal-Subsystem](../../docs/subsystems/goal.de.md) — Goal-Typen, persistente `goal/change`-Events und die generierte Service-API.
- [Generierter tool-Katalog](../../docs/tool-catalog.de.md#deepseek-aidsh-tool-goal) — die drei Goal-tool-schemas, die das Modell erhält.
- [Generierter Konfigurationskatalog](../../docs/config-catalog.de.md#deepseek-aidsh-goal) — jedes akzeptierte Konfigfeld des Goal-Services.
- [Goal-Domain-Agent-Note](../../.agents/notes/implemented/feature/2026-07-19-persisted-same-session-goal-domain.de.md) — das Domain-Design und seine Entscheidungen.

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
