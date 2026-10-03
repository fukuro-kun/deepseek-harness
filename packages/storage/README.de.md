---
description: "Die storage-Gruppenkarte: persistente Nicht-Session-Daten über benannte Backends und die typisierte Domain-Datenform, für Nutzer und Maintainer, die die Gruppe durchsehen."
kind: "package-group"
---

# packages/storage
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Die storage-Gruppe hält Nicht-Session-Anwendungsdaten über Neustarts hinweg, einschließlich Workspace-Records und Session-Sidecars. Wähle `storage-json` für menschenlesbare Dateien oder `storage-sqlite` für Punkt-Updates in einer Datenbank; `storage-domain` fügt schema-validierte typisierte Records und Change-Benachrichtigungen hinzu, während `storage` das konfigurierte Backend auswählt. Diese Pakete sind optional und host-seitig: Sie exponieren dem Modell keine Tools, Prompt-Inhalte oder Session-Events. Verwende die Gruppe, wenn Anwendungszustand einen Prozess überdauern muss, und lasse sie weg, wenn die Komposition keine solchen Daten hat.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`storage`](storage/README.de.md) | Verbindet registrierte Backends mit gemounteten Data-Form-Einrichtungen | `ctx.storage` |
| [`storage-json`](storage-json/README.de.md) | Speichert jede Einheit als eine menschenlesbare JSON-Datei | registriert Backend `json` |
| [`storage-sqlite`](storage-sqlite/README.de.md) | Speichert Einheiten als JSON-Dokumente in einer SQLite-Datenbank | registriert Backend `sqlite` |
| [`storage-domain`](storage-domain/README.de.md) | Stellt schema-validierte, Change-Events emittierende KV-Domains über gerouteten Backends bereit | `ctx.storageDomain` |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

- [Storage-Subsystem](../../docs/subsystems/storage.de.md) — der maßgebliche Contract: der Backend-Contract, Domain-Deklaration, Change-Events und generierte API.
- [Agent Note zu Domain-KV-Storage](../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.de.md) — das Design hinter der Familie, der Workspace-Consumer und die aufgeschobene Session-Backend-Migration.
- [Workspace-Subsystem](../../docs/subsystems/workspace.de.md) — der erste Consumer der Domain-Datenform.

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Das Design-Agent-Note ist noch als proposed markiert, während die Familie bereits ausgeliefert wird; seine Out-of-scope-Tabelle ist die Deferred-work-Liste für die Migrationsphase (die `log`-Facette, Session-Backend-Wiederverwendung, prozessübergreifender Change-Push). Hebe Entscheidungen in implemented-Notes, sobald sie landen.

</details>
