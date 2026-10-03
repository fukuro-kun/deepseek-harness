---
description: "Paketkarte der User-Settings-Capability-Familie: der ctx.settings-Service, der pro-Namespace-Konfiguration auflöst, und der YAML/JSON-File-Provider, der sie speichert."
kind: "package-group"
---

# settings/ — nutzer-editierbare Konfiguration

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Die Gruppe `settings/` macht Plugin-Konfiguration nutzer-editierbar: Ein Plugin registriert einen benannten Namespace mit einem Schema, und Nutzer überschreiben Werte in einem Dokument, ohne `cordis.yml` anzufassen. Nutzer-Overrides gewinnen über die eigene Konfiguration des Deployments und über Schema-Defaults, und Änderungen greifen live. Zwei Pakete decken die Capability ab: `settings/` stellt den Settings-Service bereit, und `settings-file/` speichert jeden Namespace in einem YAML- oder JSON-Dokument, das Nutzer editieren können. Settings sind optional: Ohne gemounteten Provider bleibt die Konfiguration exakt wie komponiert.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

Zwei Pakete decken die Capability ab; den vollständigen Contract besitzt jeweils das README der Kinder, und die Subsystem-Referenz besitzt die erschöpfende Service-Oberfläche.

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`settings/`](settings/README.de.md) | Settings-Service: Namespaces registrieren und ihre Werte lesen oder ändern | `ctx.settings` |
| [`settings-file/`](settings-file/README.de.md) | Speichert Settings in einer lokalen YAML/JSON-Datei und publiziert externe Edits heiß | registriert `ctx.settings` |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

Beginne mit der Subsystem-Referenz für das gemeinsame Vokabular, dann mit der Capability-seam-Aufteilung, der diese Familie folgt.

- [Settings-Subsystem-Referenz](../../docs/subsystems/settings.de.md) — Namespaces, geschichtete Auflösung, Descriptoren, Change-Commits und die generierte Cordis-Oberfläche.
- [Capability seams](../../docs/capability-seams.de.md) — die Service-Definition-/Service-Provider-/Consumer-Aufteilung, der diese Familie folgt.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
