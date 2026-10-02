<!-- Die englische Quelldatei wird von scripts/gen-doc-graphs.ts generiert; diese deutsche Datei ist die über den zweisprachigen Paarungsprozess gepflegte begutachtete Gegenseite.
     Zum Aktualisieren zuerst `pnpm run gen-doc-graphs` für die englische Seite ausführen, dann diese Datei aktualisieren und `pnpm run verify-translation-pairing --write docs/graph-atlas.md` zur erneuten Paaraufzeichnung ausführen. -->

# Dokumentationsgraph-Index

[English](graph-atlas.md) | [中文](graph-atlas.zh.md) | Deutsch

Diese Diagramme zeigen Beziehungen, die die generierten Kataloge nicht enthalten. Nutze sie, um Paketbeziehungen, capability seams, Eventfluss, modellseitige Tools, App-Komposition und Laufzeit-Lebenszykluspfade zu finden. Exakte Signaturen und Typdefinitionen bleiben in den [Subsystem-Seiten](subsystems/core.de.md) (Typen und generierte `cordis-surface`-Regionen) und [tool-catalog.md](tool-catalog.de.md).

Die Prozessentscheidung hinter diesem Index ist in der [Dokumentationsgraph-Agent-Note](../.agents/notes/archived/process/2026-07-03-documentation-graph-atlas.md) festgehalten.

| Graph | Modus |
| --- | --- |
| [Modulabhängigkeitsgraph](module-graph.de.md) | `generated` |
| [Tool-Schema-Katalog und Paketzuordnung](tool-catalog.de.md) | `generated` |
| [Capability seams und Kernservices](capability-seams.de.md) | `hybrid generated` |
| [dsh Shared-Base-Komposition](../apps/cli/composition.md) | `hybrid generated` |
| [Event-Producer/Consumer-Matrix](event-producer-consumer.de.md) | `hybrid generated` |
| [Agent-Turn- und Step-Lebenszyklus](agent-lifecycle.de.md) | `curated` |
| [Tool-Ausführungspipeline](tool-execution-pipeline.de.md) | `curated` |

Mit `pnpm run gen-doc-graphs` wird die englische Quelldatei neu generiert; mit `pnpm run verify-doc-graphs` wird die Frische der englischen Quelle geprüft. Die deutsche Gegenseite wird über den zweisprachigen Paarungsprozess gepflegt.

Der Wartungsmodus der englischen Quelldatei ist gemischt: Jede verlinkte Seite deklariert ihren Modus als generated, hybrid oder curated; diese deutsche Datei ist die über den zweisprachigen Paarungsprozess gepflegte begutachtete Gegenseite.
