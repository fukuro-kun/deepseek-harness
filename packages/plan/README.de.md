---
description: "Paketkarte der plan-Gruppe: das Plan-Mode-Feature, das den agent vor dem Ausführen zum Erforschen und Entwerfen führt, für Nutzer und Maintainer, die die Gruppe durchsehen."
kind: "package-group"
---

# plan/ — plan-Kollaborationszustand
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Die Gruppe `plan/` stellt den Plan-Modus bereit: Solange er aktiv ist, erforscht und entwirft der agent vor dem Ausführen, geführt von Anweisungen, die das Deployment schreibt, und legt den fertigen Plan vor der Ausführung deiner Genehmigung vor. Du kannst den Plan-Modus mit dem `/plan`-Befehl betreten und verlassen, den Plan genehmigen oder den agent zum Weiterplanen zurückschicken. Der Plan-Modus führt statt einzuschränken: Jedes Tool bleibt verfügbar, und Einschränkungen wie Sandbox-Modus und Approval-Prompts werden separat konfiguriert. Die Gruppe enthält ein Paket, `plan-mode`.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

Ein Paket stellt das komplette Plan-Mode-Feature bereit; die Subsystem-Referenz besitzt die erschöpfenden Contracts.

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`plan-mode/`](plan-mode/README.de.md) | Stellt den Plan-Modus bereit: `/plan` betritt und verlässt ihn, Deployment-Anleitung steuert den agent während des Planens, und `exit_plan_mode` legt den fertigen Plan deiner Prüfung vor | `ctx.planMode` |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

Beginne mit der Subsystem-Referenz für das gemeinsame Vokabular, dann lies die Design-Notiz für die Entscheidungen.

- [Plan-Mode-Subsystem-Referenz](../../docs/subsystems/plan.de.md) — wie der Plan-Modus funktioniert, seine Konfiguration und das Verhalten des Exit-Tools.
- [plan-spezifischer Kollaborationszustand](../../.agents/notes/implemented/simplification/2026-07-22-plan-specific-collaboration-state.de.md) — die Designentscheidung hinter dem Plan-Modus.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
