---
description: "The preset group map: per-session agent composition from preset files, for users and maintainers navigating the group."
kind: "package-group"
---

# packages/preset

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Die preset-Gruppe stellt agent-Komposition pro Session bereit: Ein agent-Preset ist ein Verzeichnis mit einer `agent.cordis.yml`, und eine aus einem Preset komponierte Session führt die tools, Prompt-Abschnitte und skills dieses Presets aus, während jede andere Session ihre eigenen behält. `agent-presets` besitzt das Roster — Discovery über konfigurierte Roots plus das Harness-Home, den abgesicherten Mount pro agent und die nur-kopierende Erstellung — und `persona` liefert die komponierbare Zeile, mit der ein Preset nicht nur die tools, sondern auch die Identität eines agent ändern kann. Zusammen lassen sie einen Prozess mehrere unterschiedlich komponierte agents gleichzeitig ausführen.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`agent-presets`](agent-presets/README.de.md) | Preset-Roster, Discovery über vertrauenswürdige und Benutzer-Roots, Komposition pro agent, nur-kopierende Erstellung | `ctx.agentPresets` |
| [`persona`](persona/README.de.md) | Die komponierbare Persona-Zeile, die ein Preset mountet, um die Deployment-Persona zu überblenden oder zu ersetzen | — |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

- [`AgentPresets`-Referenz](../../docs/subsystems/core.de.md#ctxagentpresets--agentpresets) — Discovery, Mounting, Vererbung und Rekomposition.
- [Scope-Subsystem](../../docs/subsystems/scope.de.md) — Scope-Schlüssel und die Elternkette, über die der Mount agents einbindet.
- [System-Prompt-Subsystem](../../docs/subsystems/system-prompt.de.md) — wie Preset-Prompt-Abschnitte registriert und assembliert werden.
- [Agent Note zu agent-Presets pro Session](../../.agents/notes/implemented/architecture/2026-08-03-per-session-agent-presets.de.md) — Designbegründung und Alternativen.

Die Presets, die das Deployment ausliefert, liegen in [`agent-presets/presets/`](agent-presets/presets) — ein Verzeichnis pro Preset, und diese Verzeichnisliste ist das Roster; sie hier ebenfalls zu benennen wäre eine zweite Liste, die synchron gehalten werden müsste.

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
