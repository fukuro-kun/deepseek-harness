---
description: "Paketkarte der persistenten Terminal-Capability-Familie: der owner-scoped ctx.terminals-Service, das Shell-Backend, das interaktives bash oder pwsh startet, und die sechs modellseitigen Tools."
kind: "package-group"
---

# terminal/ — persistente PTY-Capability-Familie
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Die Familie `terminal/` hält interaktive Shell- und REPL-Sessions von agents über tool-Aufrufe hinweg am Leben, einschließlich Arbeitsverzeichnis, Umgebungsvariablen und laufender Kindprozesse. Verwende `terminal/` für owner-isoliertes Session-Management, `terminal-bash/` für gesandboxte interaktive bash- oder pwsh-Sessions und `tool-terminal/` für sechs modellseitige Terminal-Operationen mit begrenzten Ergebnissen. Wähle diese Familie, wenn eine Aufgabe interaktive Eingaben oder Zustand braucht, den ein einmaliger bash-Befehl nicht halten kann. Sessions bleiben lokal an einen harness-Prozess gebunden und überleben keinen Neustart.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

Die Familie besteht aus einem Session-Service, einem Shell-Backend und einem Satz modellseitiger Tools. Den vollständigen Contract besitzt jeweils das README der Kinder; die Subsystem-Referenz besitzt das gemeinsame Vokabular und die generierte Service-Oberfläche.

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`terminal/`](terminal/README.de.md) | Session-Service: owner-scoped Sessions mit opaken ids, exakter Owner-Abgrenzung und abgewartetem Cleanup | `ctx.terminals` |
| [`terminal-bash/`](terminal-bash/README.de.md) | Shell-Backend: interaktives bash oder pwsh unter der gemeinsamen Sandbox-Policy, mit Readiness-Erkennung und begrenzter Ausgabe | registriert ein Backend auf `ctx.terminals` |
| [`tool-terminal/`](tool-terminal/README.de.md) | Sechs modellseitige Tools mit Owner-Isolation und optionalen Hintergrund-Sends | registriert auf `ctx.tools` |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

Beginne mit der Subsystem-Referenz für die gemeinsamen Typen und die Service-Oberfläche, dann mit dem Agent Note für die Designbegründung und die aufgeschobenen Grenzen.

- [Terminal-Subsystem-Referenz](../../docs/subsystems/terminal.de.md) — ids, Backend- und Session-Contracts, Send-Readiness, begrenzte Reads und die generierte `ctx.terminals`-API.
- [Agent Note zu persistenten PTY-Sessions](../../.agents/notes/implemented/feature/2026-07-16-persistent-pty-sessions.de.md) — die Designentscheidung, Alternativen und aufgeschobene Arbeit.
- [Capability seams](../../docs/capability-seams.de.md) — die Service-Definition-/Service-Provider-/Consumer-Aufteilung, der diese Familie folgt.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
