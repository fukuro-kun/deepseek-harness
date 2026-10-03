---
description: "Die subprocess-Gruppenkarte: der gemeinsame Kindprozess-Service und sein lokaler Host-Provider, für Nutzer und Maintainer, die die Gruppe durchsehen."
kind: "package-group"
---

# subprocess/ — subprocess-Capability-Familie
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Jeder Kindprozess und jede Terminal-Session, die der harness ausführt — bash-Befehle, Language Server, persistente Shells und out-of-process-subagent-Backends — wird über einen gemeinsamen Service (`ctx.subprocess`) gestartet, beobachtet und beendet, mit einem lokalen Provider, der sie auf dem Host-Rechner ausführt. Es ist kein eigenständiges Produkt-Feature: Die konsumierenden Capability seams entscheiden, was jeder Prozess bedeutet, und Befehlssemantik, Deadlines und modellseitige Präsentation bleiben bei ihnen. Die Gruppe stellt Executable-Lookup, begrenzte Output-Erfassung mit spill-Wiederherstellung, Provider-verwaltete Prozessbereiche mit offengelegten schwächeren Fallbacks und eine bereinigte Start-Umgebung für jedes Kind bereit.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`subprocess`](subprocess/README.de.md) | Definiert den Kindprozess-Service: Executable-Lookup, verwaltete Prozess-spawns und echte Terminal-Sessions | `ctx.subprocess` |
| [`subprocess-local`](subprocess-local/README.de.md) | Führt Host-Prozesse und Terminals mit nativen verwalteten Bereichen aus, wo unterstützt, sonst mit expliziten schwächeren Fallbacks | registriert auf `ctx.subprocess` |
| [`win32-process`](win32-process/README.de.md) | Besitzt die gemeinsamen Win32-Bindings für Sandbox- und gewöhnliche Prozesserstellung, stdio, Job-Zuordnung, Polling, Waits und Handle-Cleanup | Library — kein ctx-Schlüssel |

Der Service hält die Prozess-Lebensdauer über Consumer-Reloads hinweg; die Consumers besitzen, was ein Prozess bedeutet (ein bash-Befehl, ein Language Server), und jeden Default, der einen formt.

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

- [subprocess-Subsystem](../../docs/subsystems/subprocess.de.md) — spawn-Specs, Output-Reader, Outcomes und die verwaltete `DSH_*`-Umgebung.
- [subprocess-seam-Agent-Note](../../.agents/notes/archived/architecture/2026-07-26-subprocess-seam.md) — warum die Prozesshälfte der bash-Executoren ein eigener seam wurde.

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
