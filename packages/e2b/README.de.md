---
description: "Die E2B-Remote-Runtime-Gruppenkarte: Datei- und Kommandoarbeit in einer einzigen entfernten Linux-Sandbox, für Nutzer und Maintainer der E2B-Familie."
kind: "package-group"
---

# packages/e2b
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

Die E2B-Familie lässt agents Dateien lesen und bearbeiten, Shell-Kommandos ausführen und Terminals in einer einzigen entfernten Linux-Sandbox statt auf der Host-Maschine nutzen. Sie hält Dateisystem-Arbeit von Kommando- und Terminal-Ausführung getrennt, während beide dieselbe Sandbox nutzen. Bestehende Shell-, Terminal- und Language-Server-Features funktionieren weiter ohne E2B-spezifische Tools. Harness, Modellaufrufe und Session-State bleiben lokal; die Sandbox ist ephemer, experimentell und in ausgelieferten Kompositionen standardmäßig nicht enthalten.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`e2b`](e2b/README.de.md) | Eine geteilte entfernte Linux-Sandbox, in der Datei- und Kommandoarbeit läuft | `ctx.e2b` |
| [`fs-e2b`](fs-e2b/README.de.md) | Datei-Reads, -Writes, -Edits und -Listings in der entfernten Sandbox | `ctx.fs` |
| [`subprocess-e2b`](subprocess-e2b/README.de.md) | Shell-Kommandos und interaktive Terminals in der entfernten Sandbox | `ctx.subprocess` |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

- [Portable-Execution-World-Entscheidung](../../.agents/notes/implemented/architecture/2026-07-28-portable-execution-world-consumers.de.md) — warum die Ausführungswelt wechseln kann, ohne den harness zu bewegen, und was lokal bleibt.
- [Subprocess-Subsystem](../../docs/subsystems/subprocess.de.md) — der Subprocess-Seam-Contract und die generierte Cordis-Oberfläche, einschließlich `ctx.e2b`.
- [Dateisystem-Subsystem](../../docs/subsystems/filesystem.de.md) — der Dateisystem-Seam-Contract und die generierte Cordis-Oberfläche.

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
