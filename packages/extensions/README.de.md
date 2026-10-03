---
description: "The extensions group map: model-facing tools and dual-half runners for defining, running, and removing dynamic Cordis packages, for users and maintainers navigating the group."
kind: "package-group"
---

# packages/extensions

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Die extensions-Gruppe lässt einen agent die laufende DSH-Runtime inspizieren und verändern, ohne Repository-Dateien oder Konfiguration zu bearbeiten. Er kann dynamische Cordis-Pakete aus Modell-tools oder einem Browser-Panel definieren, ausführen, aktualisieren, stoppen und entfernen. Ein Paket kann Host, Browser oder beides betreffen; unveränderliche Versionen ermöglichen kontrollierte Updates. Definitionen existieren nur im Prozessspeicher und verschwinden beim DSH-Neustart. Wähle das Unterpaket für Modell-tools, Host-Ausführung, Browser-Ausführung oder Browser-Steuerelemente.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`tool-cordis`](tool-cordis/README.de.md) | Sieben modellseitige tools: laufende Runtime inspizieren, dynamische Pakete definieren, ausführen, stoppen und entfernen | registriert auf `ctx.tools` |
| [`cordis-host-runner`](cordis-host-runner/README.de.md) | Host-Hälfte: Definitions-Registry, sandboxed Host-Hälften-Lifecycle und die Inspect-Registry, die Browser-Abfragen beantwortet | stellt `ctx.dynamicCordisRunner` und `ctx.cordisInspect` bereit |
| [`cordis-client-runner`](cordis-client-runner/README.de.md) | Browser-Hälfte: evaluiert Browser-Hälften-Quelltext zu einem Live-Plugin und beantwortet Run-Anfragen | Client-Seite; stellt Browser-`ctx.dynamicCordisRunner` bereit |
| [`ui-cordis`](ui-cordis/README.de.md) | Browser-Flächen: das frame-weite Panel, Lifecycle-tool-Karten und die `@pluginId`-Eingabequelle | Client-Seite; registriert slots |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

- [Extensions-Subsystem](../../docs/subsystems/extensions.de.md) — die generierte `ctx.cordisInspect`- und `ctx.dynamicCordisRunner`-Service-API.
- [Generierter tool-Katalog](../../docs/tool-catalog.de.md#deepseek-aidsh-tool-cordis) — die sieben modellseitigen tool-schemas.
- [Generierter Konfigurationskatalog](../../docs/config-catalog.de.md#deepseek-aidsh-cordis-host-runner) — die akzeptierten Konfigfelder des Runners.
- [Agent Note zum selbstreferenziellen Cordis-Toolset](../../.agents/notes/implemented/feature/2026-07-08-self-referential-cordis-toolset.de.md) — Design-Heimat für Sandbox-Semantik, Lifecycle und Komposition.
- [Agent Note zu Client-Shells und dynamischen Paketen](../../.agents/notes/implemented/architecture/2026-08-15-client-shells-and-dynamic-packages.de.md) — Paketplatzierung und Build-Seiten für die Client-Hälften.

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Die beiden Browser-Hälften-Pakete liegen in dieser Gruppe statt unter `packages/client/`, weil sie Hälften der Dual-Half-Pakete dieses Subsystems sind; die Client-Seite kompiliert sie über das Client-Programm, während das Host-Programm nur den Host-Runner referenziert.

</details>
