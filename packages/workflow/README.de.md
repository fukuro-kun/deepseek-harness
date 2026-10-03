---
description: "The workflow group map: model-authored orchestration scripts that fan out subagents, for users and maintainers navigating the group."
kind: "package-group"
---

# packages/workflow
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Die workflow-Gruppe lässt einen agent ein vom Modell geschriebenes Orchestrierungsskript ausführen, das Arbeit auf viele subagents verteilt und einen Endwert zurückgibt. Das Paket `workflow` stellt den Run-Service bereit, das Worker-Thread-Paket führt Skripte in isolierten Threads aus, und zwei modellseitige tools stellen die Orchestrierung bereit: das allgemeine `workflow`-tool für skriptbasiertes Fan-out und das feste `ralph`-tool für iterative Schleifen mit jeweils frischem agent. Das Skript koordiniert agents über hooks, während die agents die eigentliche Arbeit leisten. Die Engine hält die synchrone Arbeit eines Skripts vom Host-Event-Loop fern, ist aber Isolation, keine Sicherheitsgrenze.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`workflow`](workflow/README.de.md) | Führt ein vom Modell geschriebenes Orchestrierungsskript aus, das subagents verteilt | `ctx.workflowEngine` |
| [`workflow-worker-thread`](workflow-worker-thread/README.de.md) | Führt jedes workflow-Skript in einem eigenen Worker-Thread aus, fern vom Host-Event-Loop | registriert auf `ctx.workflowEngine` |
| [`tool-workflow`](tool-workflow/README.de.md) | Gibt dem Modell das `workflow`-tool für skriptbasierte Multi-agent-Orchestrierung | registriert auf `ctx.tools` |
| [`tool-ralph`](tool-ralph/README.de.md) | Gibt dem Modell das `ralph`-tool für iterative Schleifen mit jeweils frischem agent | registriert auf `ctx.tools` |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

- [Workflow-Subsystem](../../docs/subsystems/workflow.de.md) — die Typen des seam, die Startanfrage und die `workflow/*`-Events.
- [Generierter tool-Katalog](../../docs/tool-catalog.de.md#deepseek-aidsh-tool-workflow) — das `workflow`-tool-schema, das das Modell erhält.
- [Generierter tool-Katalog](../../docs/tool-catalog.de.md#deepseek-aidsh-tool-ralph) — das `ralph`-tool-schema, das das Modell erhält.
- [Generierter Konfigurationskatalog](../../docs/config-catalog.de.md#deepseek-aidsh-workflow-worker-thread) — jedes akzeptierte Engine-Konfigfeld.
- [Agent Note zu dynamischen Workflows](../../.agents/notes/implemented/feature/2026-07-05-dynamic-workflows.de.md) — das seam-Design und seine Entscheidungen.
- [Agent Note zur zielbasierten Ausführung auf Harness-Ebene](../../.agents/notes/implemented/feature/2026-07-16-harness-level-loop.de.md) — das Design der festen Fresh-agent-Schleife und zurückgestellte Arbeit.

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
