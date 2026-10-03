# Agent Note: Ein gegates in-file-Format für Agent Notes

Status: implemented

[English](2026-07-05-uniform-agent-note-format.md) | [中文](2026-07-05-uniform-agent-note-format.zh.md) | Deutsch

## Problem

Agent-Note-Pfade kodierten Lebenszyklus und Klasse, aber die Dateiinhalte mischten weiterhin Überschriften, Statusformate, ADR- und Proposal-Templates sowie Proposal-Zeit-Abschnitte in Implementierungseinträgen. Autoren kopierten, welchen Nachbarn sie gerade fanden, und Lebenszyklusverschiebungen konnten das erforderliche Rewrite überspringen, weil kein Gate einen in-file-Vertrag erzwang.

## Entscheidung

[README.md § The file format](../../README.de.md#the-file-format) ist der in-file-Vertrag — der Header-Block (`# Agent Note: <title>` plus ein datumloses, ordnerkonformes `Status:`-Enum, dessen einziger Inhalt die Ablehnungsbegründung ist), das lebenszyklusspezifische Body-Skelett (`Problem`-Opener überall; `Proposal`/`Acceptance criteria`/`Risks` in `proposed/`; gegenwartsbezogene `Decision`/`Consequences` mit verbotenen Proposal-Zeit-Überschriften in `implemented/`; eingefrorene Proposal-Form in `rejected/`), ein obligatorischer `Alternatives considered`-Abschnitt und das kanonische Abschnittsvokabular, zwischen dem maßgeschneiderte technische Abschnitte frei bleiben. `pnpm run verify-agent-note-format` ([scripts/verify-agent-note-format.ts](../../../../scripts/verify-agent-note-format.ts)) erzwingt jede mechanische Klausel als Teil von `doc-sync`, sodass eine Lebenszyklusverschiebung, die ihr Rewrite überspringt, jetzt CI statt Reviewer-Gedächtnis scheitern lässt.

Der gesamte Korpus wurde in derselben Änderung normalisiert, die das Format definierte — die Pre-Release-Haltung: keine Übergangszeit, keine Doppelformat-Toleranz. Das einzige Grandfathering betrifft Inhalt, nicht Format: Alternativen werden festgehalten, nie erfunden, also trägt eine Pre-Format-Agent-Note, deren Alternativen aus dem Eintrag nicht rekonstruierbar sind, den exakten `agent-note-format: alternatives-not-recorded`-Kommentar, den das Gate nur für Dateien akzeptiert, die vor dieser Agent Note datiert sind.

## Betrachtete Alternativen

- **Ein vollständig starres Template** (eine feste Abschnittsfolge pro Lebenszyklus, jede Agent Note darauf umstrukturiert) — abgelehnt: Die großen Design-Agent-Notes tragen acht bis fünfzehn maßgeschneiderte technische Abschnitte (Pakettopologie, Wire-Verträge, Schemas), die tragender Inhalt sind, nicht Drift; eine starre Folge würde jetzt destruktive Rewrites erzwingen und für immer Template-Kämpfe.
- **Nur-Header-Normalisierung** (H1 und Status, Bodies unangetastet) — abgelehnt: Die Schuldmarker kennzeichneten die *Body*-Gattungsspaltung, und `Context`/`Decision` neben `Problem`/`Proposal` auf unbestimmte Zeit zu belassen löst nichts.
- **Keine Statuszeile** (der Ordner ist bereits der Status; die drei neuesten Pre-Format-Agent-Notes (und das zh-Gegenstück einer) ließen die Zeile weg) — abgelehnt zugunsten einer selbstbeschreibenden Datei: Das Driftrisiko, das das Weglassen motivierte, wird neutralisiert, indem die Zeile stattdessen gegen den Ordner gegate wird.
- **Datiertes Status** (`Status: implemented (accepted YYYY-MM-DD)`) — abgelehnt: Das Annahmedatum ist erzählte Geschichte, die die Schreibregeln aus Docs heraushalten; der Dateiname trägt das Erstproposal, git trägt den Rest, und das Gate könnte das Format eines Datums prüfen, nie seine Wahrheit.
- **Ein bloßes `# <title>`-H1** — abgelehnt: Das `Agent Note: `-Präfix beschreibt die Gattung selbst, wenn eine Datei außerhalb ihres Baums gelesen wird, und das Format-Gate verhindert sein Driften.
- **`## What we give up` als Implementierungsabschluss** (die eigene Formulierung des README für das, was eine Agent Note festhält) — abgelehnt: Es benennt nur Kosten, und ein ehrlicher Konsequenzenabschnitt protokolliert auch, was der Tausch erkauft hat.
- **Konvention ohne Gate** (den Vertrag niederschreiben, per Review durchsetzen) — abgelehnt: Die Slop-Checkliste hatte Spec-Speak in `implemented/` bereits per Konvention verboten, und neunzehn Dateien zeigen, was Konvention allein hier erreicht.
- **Eine eigenständige `FORMAT.md`-Vertragsdatei** — abgelehnt, weil ein einziger Einstiegspunkt, der Layout, Klassifikation und Format trägt, leichter zu finden und zu pflegen ist als zwei Vertragsdateien.

## Konsequenzen

Jede Agent Note kostet jetzt etwas mehr Struktur, und der obligatorische `Alternatives considered`-Abschnitt ist bewusste Reibung: Eine Entscheidung, die ohne das festgehalten wird, was sie geschlagen hat, lädt genau die Neuverhandlung ein, die Agent Notes verhindern sollen. Pre-Format-Agent-Notes, deren Alternativen nicht rekonstruierbar waren, tragen den Grandfather-Kommentar dauerhaft — eine ehrliche Lücke im Eintrag statt erfundener Begründung. `doc-sync` gewinnt ein Gate, und das Verschieben einer Agent Note zwischen Lebenszyklusordnern ist jetzt echte Arbeit zum Verschiebezeitpunkt (das Body-Rewrite, das die Verschiebung immer geschuldet hat) statt aufgeschobener Aufräumarbeit, die nichts verfolgte. Die neununddreißig Schuldmarker sind weg, aufgelöst durch das Template, auf das sie warteten.
