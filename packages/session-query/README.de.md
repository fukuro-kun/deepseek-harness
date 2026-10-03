---
description: "Paketkarte der Session-Retrieval-Capability-Familie: Suchen, Tracen und Lesen laufender und durabler Session-Historie, plus der Web-Session-Log-Export."
kind: "package-group"
---

# session-query/ — Session-Retrieval-Capability-Familie

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Die Gruppe `session-query/` stellt Retrieval über laufende und durable Session-Historie bereit, unabhängig von Compaction: Programmatische Aufrufer fragen einen einheitlichen Service nach exakten Logs, gefilterten Listen, Beziehungs-Traces und Volltextsuche ab; ein SQLite-Backend treibt die Suche an; das Modell erhält fünf workspace-autorisierte Tools; und die Web-UI erhält einen `/export`-Befehl, der eine Session-ZIP herunterlädt. Suchergebnisse stimmen mit der Konversationshistorie überein, die das Modell sieht. Diese Seite kartiert die Gruppe; das README jedes Pakets besitzt seinen paketweiten Vertrag.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Entwicklerhinweis](#dev-note)

-----

<a id="packages"></a>
## Pakete

Das README jedes Pakets beschreibt, was du mit seinem Teil der Familie tun kannst.

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`session-query/`](session-query/README.de.md) | Einheitlicher Session-Historie-Abfrageservice: exakte Reads, Beziehungs-Traces und Filter | `ctx.sessionQuery` |
| [`session-query-sqlite/`](session-query-sqlite/README.de.md) | Volltextsuche über die Session-Historie auf Basis eines SQLite-FTS5-Index | registriert auf `ctx.sessionQuery` |
| [`session-log-export/`](session-log-export/README.de.md) | Web-`/export`-Befehl und Browser-Download einer Session-ZIP | `ctx.sessionLogDownload` (Browser) |
| [`tool-session-query/`](tool-session-query/README.de.md) | Modellseitige Tools zum Suchen, Tracen und Lesen der Session-Historie | registriert auf `ctx.tools` |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

Beginne mit der Subsystem-Referenz für das geteilte Abfragevokabular, dann den Entwurfsaufzeichnungen hinter Tracing und Suche.

- [Session-Query-Subsystem-Referenz](../../docs/subsystems/session-query.de.md) — logische Datensätze, Filter, Suchseiten, Lineage, begrenzte Reads und Event-Beziehungen.
- [Session-Query-Beziehungs-Tracing](../../.agents/notes/archived/feature/2026-07-13-session-query-tracing.md) — Trace-Semantik und die Validierungsgrenze.
- [SQLite-FTS5-Session-Suche](../../.agents/notes/archived/feature/2026-07-10-sqlite-session-query-provider.md) — Suchsemantik, Abgleich und die Tokenizer-Entscheidung.

<a id="dev-note"></a>
## Entwicklerhinweis

Keiner.
