---
description: "Die workspace-Gruppenkarte: die persistente Workspace-Entitätenfamilie, dauerhafte Verzeichniseinträge und header-validierte Session-Mitgliedschaft, für Nutzer und Maintainer, die die Gruppe durchsuchen."
kind: "package-group"
---

# packages/workspace
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Die Workspace-Familie lässt ein Host-Produkt eine geordnete Liste benannter Projekte halten und die Sessions jedes Projekts nach Verzeichnis gruppieren. Nutzer können diese Projekte und Sessions durchsuchen, eine Session aus der Gruppierung ausblenden, ohne sie zu löschen, und ein Projekt entfernen, ohne dessen Ordner oder Session-Verlauf zu löschen. Ausgeblendete oder entfernte Sessions bleiben als ungruppierter Verlauf verfügbar. Wähle diese Familie für eine persistente Projektoberfläche; sie benötigt Session-Speicher und ein Persistenz-Backend und stellt dem Modell weder Tools, Prompts noch Session-Events bereit.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Entwicklerhinweis](#dev-note)

-----

<a id="packages"></a>
## Pakete

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`workspace`](workspace/README.de.md) | Stellt benannte, geordnete Projekte mit den Sessions bereit, die in jedem Verzeichnis liefen | `ctx.workspaceRegistry` |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

- [Workspace-Subsystem](../../docs/subsystems/workspace.de.md) — der verbindliche Feature-Vertrag für Projekte und ihre Sessions.
- [Domain-KV-Storage Agent Note](../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.de.md) — das Speicherdesign hinter den Projekteinträgen.
- [Workspace-UI-Produktfluss Agent Note](../../.agents/notes/archived/feature/2026-07-25-workspace-ui-product-flow.md) — wie der erste Start Projekte aus dem Session-Verlauf aufbaut und wie die GUI sie ordnet.
- [Entscheidung zum Löschen von Workspace-Registrierungen](../../.agents/notes/implemented/feature/2026-07-27-workspace-registration-deletion.de.md) — warum das Entfernen eines Projekts niemals dessen Ordner oder Sessions löscht.

-----

<a id="dev-note"></a>
## Entwicklerhinweis

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
