---
description: "Die runtime-diagnostics-Gruppenkarte: paketverwaltete Runtime-Invariantenprüfungen für laufende Kompositionen, für Nutzer und Maintainer, die die Gruppe durchsuchen."
kind: "package-group"
---

# packages/runtime-diagnostics
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Die runtime-diagnostics-Gruppe stellt Runtime-Selbstprüfung für DeepSeek-Harness-Kompositionen bereit: Ein Paket, `invariants`, führt paketverwaltete Prüfungen aus, die die durable Event- und Datenbeziehungen jedes Pakets verifizieren, während die Komposition läuft. Eine Verletzung erscheint als Fehler, der dem Paket zugeordnet wird, dem die Beziehung gehört; ein globaler Schalter und Paketnamenfilter steuern, welche Prüfungen laufen. Verwende das Paket dieser Gruppe, wenn eine Komposition ihre eigenen Runtime-Verträge im normalen Betrieb verifizieren soll.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Entwicklerhinweis](#dev-note)

-----

<a id="packages"></a>
## Pakete

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`invariants`](invariants/README.de.md) | Führt paketverwaltete Runtime-Prüfungen aus und meldet jeden Fehlschlag dem besitzenden Paket | registriert auf `ctx.invariants` |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

- [Runtime-Invarianten-Subsystem](../../docs/subsystems/invariants.de.md) — die generierte Service-Referenz: Auswahl, Installer und Companion-Vertrag.
- [Invarianten-Runtime-Verträge Agent Note](../../.agents/notes/implemented/architecture/2026-07-19-package-invariant-runtime-contracts.de.md) — was eine Runtime-Invariante behaupten darf und das mechanische Gate, das die Companion-Verdrahtung erzwingt.
- [Paketkonventionen](../AGENTS.md) — die `./invariant`-Companion-Regel, der jedes Paket folgt.

-----

<a id="dev-note"></a>
## Entwicklerhinweis

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
