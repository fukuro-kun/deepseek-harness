---
description: "Die jobs-Gruppenkarte: Background-Job-Steuerung — der Registry-Contract, prozesslokaler Storage und die modellseitigen Job-Tools — für Nutzer und Maintainer, die die Gruppe durchsehen."
kind: "package-group"
---

# jobs/ — Background-Job-Capability-Familie

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Die jobs-Gruppe ist die Background-Work-Capability-Familie: Tools, die lange Arbeit ausführen, registrieren sie als Job, und der besitzende agent kann ihn lesen, auf ihn warten, ihn auflisten und canceln, ohne den eigenen Turn zu blockieren. Jobs gehören der agent-Session, die sie gestartet hat, sodass ein agent nie die Arbeit eines anderen sieht; Completion wird dem besitzenden agent in der Session zugestellt statt gepollt. Die Gruppe teilt sich in den Registry-Contract (`jobs`), seinen prozesslokalen Storage (`jobs-local`) und die modellseitigen Steuerungs-Tools mit Completion-Benachrichtigungen (`tool-jobs`).

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`jobs`](jobs/README.de.md) | Definiert den Background-Job-Contract: ids, Ownership, Lifecycle und Completion-Listener | `ctx.jobs` |
| [`jobs-local`](jobs-local/README.de.md) | Führt Jobs in diesem Prozess aus und speichert sie, pro Owner abgegrenzt | registriert auf `ctx.jobs` |
| [`tool-jobs`](tool-jobs/README.de.md) | Lässt das Modell Jobs lesen, auflisten und killen und stellt Completion-Benachrichtigungen zu | registriert auf `ctx.tools` |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

- [Background-Task-Runtime-Subsystem](../../docs/subsystems/jobs.de.md) — die Job-Typen, Snapshot-Felder und die `ctx.jobs`-API.
- [Agent Note zur generischen Long-running-tool-Runtime](../../.agents/notes/implemented/architecture/2026-06-20-generic-long-running-tool-runtime.de.md) — das Design hinter der Background-Job-Runtime.
- [job-registry-seam-Agent-Note](../../.agents/notes/archived/architecture/2026-07-26-job-registry-seam.md) — der pro-Owner-abgegrenzte Registry-Contract und seine Begründung.

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
