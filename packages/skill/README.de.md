---
description: "The skill group map: reusable agent instructions discovered from providers and loaded through the session catalog and skill tool, for users and maintainers navigating the group."
kind: "package-group"
---

# skill/ — skill-Capability-Familie

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Die skill-Familie lässt agents und Benutzer wiederverwendbare Aufgabenanweisungen nur bei Bedarf entdecken und laden. Verwende `skill/`, um Kataloge zu kombinieren und pro Namen einen Anweisungssatz bereitzustellen; wähle `skill-filesystem` für die Discovery aus Projekt-, eigenen oder Benutzerverzeichnissen und `skill-badge` für das optionale offizielle Badge. Füge `tool-skill` hinzu, wenn Modelle einen sortierten, persistenten Session-Katalog erhalten, vollständige Anweisungen über das `skill`-tool laden oder direkte `/name`-Aufrufe akzeptieren sollen. Verschiedene Quellen erzeugen dasselbe modellsichtbare Format, und Modellzugriff erfordert mindestens eine Quelle.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`skill/`](skill/README.de.md) | Registry, die skill-Kataloge beliebiger Provider mergt und den gewinnenden skill für einen Namen auflöst | `ctx.skills` |
| [`skill-filesystem/`](skill-filesystem/README.de.md) | Entdeckt skills aus Projekt-, eigenen und Benutzerverzeichnissen und beobachtet sie auf Änderungen | registriert auf `ctx.skills` |
| [`skill-badge/`](skill-badge/README.de.md) | Bündelt den offiziellen „powered by dsh“-Badge-skill, standardmäßig deaktiviert | registriert auf `ctx.skills` |
| [`tool-skill/`](tool-skill/README.de.md) | Veröffentlicht den Session-skill-Katalog und das modellseitige `skill`-Loader-tool | registriert auf `ctx.tools` |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

Beginne mit der Subsystem-Referenz für das gemeinsame Vokabular, dann die Agent Notes für die Designbegründung.

- [Skill-Subsystem-Referenz](../../docs/subsystems/skills.de.md) — die Registry, der Provider-Vertrag, die Priorität lokaler Discovery sowie Katalog und tool.
- [Agent Note zur skill-Aufrufpolicy](../../.agents/notes/implemented/feature/2026-07-28-skill-invocation-policy.de.md) — die Aufrufkontrollen für Modell und Benutzer.

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
