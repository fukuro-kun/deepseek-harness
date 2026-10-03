# Agent Note: API-Extractor-Reports

Status: proposed

[English](2026-06-11-api-extractor-reports.md) | [中文](2026-06-11-api-extractor-reports.zh.md) | Deutsch

> Die Teile für Doc-Block-Typechecking und Event-Taxonomie sind ausgeliefert ([doc-sync-Erzwingung](../../archived/process/2026-06-11-doc-sync-enforcement.md)); der verbleibende API-Report-Teil ist als eigenständiger Vorschlag verschoben.

## Problem

Öffentliche API-Änderungen sind unsichtbar — nichts macht „dieser Commit hat die öffentliche API geändert" zu einer expliziten, prüfbaren Tatsache. Ein Reviewer, der einen Diff liest, kann übersehen, dass ein exportierter Typ ein Feld erhalten hat oder sich eine Methodensignatur verschoben hat.

## Vorschlag

api-extractor (oder `tsc --emitDeclarationOnly` + ein normalisierter öffentlicher API-Dump) erzeugt ein eingechecktes `etc/<pkg>.api.md` pro Package; CI schlägt fehl, wenn sich die Regenerierung unterscheidet. Jede öffentliche API-Änderung wird zu einer Diff-Zeile, die ein Reviewer (oder Review-Agent) sehen muss.

## In Erwägung gezogene Alternativen

**`tsc --emitDeclarationOnly` plus ein normalisierter öffentlicher API-Dump** — der leichtere Mechanismus, falls sich api-extractor als zu schwer erweist; beide erfüllen die eingecheckte, diffbare Reportform, die der Vorschlag benötigt.

## Akzeptanzkriterien

- Jedes Package hat ein eingechecktes `etc/<pkg>.api.md`; CI schlägt fehl, wenn sich die Regenerierung vom übergebenen Report unterscheidet.
- Eine öffentliche API-Änderung (ein neuer Export, ein erweitertes Feld, eine verschobene Signatur) ist als Report-Diff-Zeile in der Review sichtbar.

## Risiken

Die Abhängigkeit ist schwer und launisch — der Grund für die Verschiebung — und das Reportformat ändert sich mit Compiler-Upgrades, was eine Wartungslast hinzufügt, die wenig bringt, solange die Packages unveröffentlicht bleiben.

## Grund für die Verschiebung

Verschoben, als doc-sync landete: geringer Wert für ein internes Monorepo, in dem Reviewer bereits den Source-Diff sehen, und eine schwere, launische Abhängigkeit. Erneut prüfen, falls die Packages jemals extern veröffentlicht werden — zu diesem Zeitpunkt lohnt sich eine stabile, diffbare öffentliche API.
