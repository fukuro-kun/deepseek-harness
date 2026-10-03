---
description: "Package map for the conversation-condensing feature family: automatic compaction, the on-demand /compact command, and tool-output trimming."
kind: "package-group"
---

# compaction/ — compaction-Capability-Familie

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Die Gruppe `compaction/` hält lange agent-Konversationen nahe am Kontextlimit des Modells funktionsfähig: Ältere Historie wird bei steigendem Token-Druck automatisch zu einer Zusammenfassung verdichtet, auf Abruf mit `/compact`, und überlange tool-Ausgaben können zuerst gekürzt werden, damit weniger verdichtet werden muss. Die ausgelieferte `dsh`-Basis aktiviert das Feature standardmäßig — mounte die Pakete explizit, um Zeitpunkt und Art der Verdichtung zu steuern. Die Token-Messung, die entscheidet, wann verdichtet wird, liegt in einem separaten Service der LLM-Familie.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

Jedes Paket unten liefert einen Teil des Features; die Paketseite erklärt die Verwendung.

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`compaction/`](compaction/README.de.md) | Der gemeinsame Verdichtungsvertrag: die Operationen und das Zusammenfassungsformat, die jedes Backend und jeder Trigger verwenden | `ctx.compaction` |
| [`compaction-basic/`](compaction-basic/README.de.md) | Automatische Verdichtung älterer Historie zu einer Zusammenfassung bei steigendem Token-Druck | registriert `ctx.compaction` |
| [`compaction-tool-result-pruner/`](compaction-tool-result-pruner/README.de.md) | Kürzt überlange tool-Ausgaben, damit weniger Historie verdichtet werden muss | `ctx.toolResultPruner` |
| [`command-compact/`](command-compact/README.de.md) | Der `/compact`-Befehl zur Verdichtung der Historie auf Abruf | registriert auf `ctx.commands` |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

Beginne mit der Subsystem-Referenz für das gemeinsame Vokabular, dann die beiden Agent Notes für die Designbegründung.

- [Compaction-Subsystem-Referenz](../../docs/subsystems/compaction.de.md) — das Verdichtungsvokabular, Ergebnisse und das Service-Verhalten.
- [Agent Note zur compaction-Capability-seam](../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.de.md) — wie die Familie aufgeteilt ist und warum sie vom Session- und LLM-Vokabular abhängt.
- [Agent Note zur gequeueten manuellen compaction](../../.agents/notes/implemented/feature/2026-07-30-queued-manual-compaction.de.md) — wie `/compact` auf Abruf gegen laufende Turns serialisiert wird.
- [Capability seams](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.de.md) — die Service-Definition-/Service-Provider-/Consumer-Aufteilung, der diese Familie folgt.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
