# Agent Note: Packed-Session-Fixture-Branch-Migrator entfernen

Status: proposed

[English](2026-07-26-remove-packed-session-fixture-migrator.md) | [中文](2026-07-26-remove-packed-session-fixture-migrator.zh.md) | Deutsch

## Problem

Die Standard-Writers und der Snapshot-Check des Repositories halten Session-Fixtures im kanonischen Packed-Row-Layout. `pnpm run migrate:packed-session-fixtures` bleibt neben dieser dauerhaften Erzwingung nur deshalb, damit in-flight-Branches mit älteren Fixture-Bearbeitungen das aktuelle `master` mergen und mechanisch konvergieren, ohne Modell-Output neu aufzunehmen.

Sobald jeder solche Branch gemergt, geschlossen oder bereits kanonisch ist, haben der Write-Befehl und seine Branch-Konvergenzanweisungen keinen fortbestehenden Owner. Einen Mutation-Befehl nach Ende seiner Übergangsphase zu behalten, fügt neben dem dauerhaften read-only Snapshot-Check einen zweiten scheinbaren Wartungsweg hinzu.

## Vorschlag

Den temporären `scripts/migrate-packed-session-fixtures.ts`-CLI und den Root-`migrate:packed-session-fixtures`-Package-Befehl entfernen, nachdem ein Live-Inventar bestätigt, dass kein offener Pull Request mehr die Konvertierung von Session-Format-JSONL benötigt. Die Übergangs-Befehls-Links aus der Test-Policy, dem ACP-Snapshot-README und dem implementierten Packed-Row-Agent-Note in derselben Änderung entfernen; den befehls-spezifischen Reparaturtext in `scripts/session-fixture-layout.snapshot.ts` durch befehls-unabhängige kanonische-Layout-Anleitung ersetzen.

`scripts/session-fixture-layout.ts`, seine Unit-Tests und `scripts/session-fixture-layout.snapshot.ts` beibehalten. Sie definieren und erzwingen das dauerhafte kanonische Layout; nur der Branch-orientierte Writer ist temporär.

Bevor der Befehl entfernt wird, merged jeder betroffene Branch das aktuelle `master`, führt den Migrator einmal aus, committet die resultierende fixture-only-Neuschreibung separat und verifiziert, dass der repository-weite Snapshot-Layout-Check besteht. Geschlossene oder ersetzte Branches benötigen keine Migration.

## In Erwägung gezogene Alternativen

**Den Befehl unbegrenzt beibehalten.** Dies macht die alte Fixture-Konvertierung bequem, lässt aber ein repository-weites Mutation-Tool zurück, nachdem das einzige bekannte Migrationsfenster schließt. Der read-only Gate liefert bereits das dauerhafte Verhalten und die Diagnose.

**Das Kanonisierungs-Modul mit dem CLI entfernen.** Das Modul ist kein Übergangs-Rest: Snapshot-CI verwendet es, um zukünftige Fixtures zu entdecken, gemischte physische Records zu decodieren und sie mit der kanonischen Packed-Darstellung zu vergleichen. Seine Entfernung würde auch die Erzwingung entfernen.

**Den Befehl sofort löschen, wenn Packed-Rows `master` erreichen.** Ältere offene Branches würden dann Ad-hoc-Skripte oder manuelle Snapshot-Neuerzeugung nach dem Retargeting benötigen, was das Konflikt-Risiko erhöht und die Decodierten-Event-Erhaltung schwerer zu reviewen macht.

## Akzeptanzkriterien

- Ein Live-Offener-PR-Inventar findet keinen Branch mit Session-Format-JSONL-Änderungen, der noch vom temporären Migrationsbefehl abhängt.
- Der temporäre CLI, der Root-Package-Befehl, jeder Branch-Konvergenz-Link und die befehls-spezifische Gate-Diagnose sind abwesend; der dauerhafte Kanonisierer, die Unit-Tests und der Snapshot-Check bleiben.
- `pnpm run test:snapshot`, `pnpm run doc-sync`, Lint und Whitespace-Validierung bestehen ohne den temporären Befehl.
- Die aktuelle Dokumentation beschreibt nur das Packed-Default und die dauerhafte kanonische-Layout-Erzwingung.

## Risiken

Ein unvollständiges Offener-Branch-Inventar könnte einen Contributor mit einem großen Unpacked-Fixture-Konflikt nach dem Verschwinden des Befehls zurücklassen. Die Entfernung hängt daher von Live-Pull-Request-Evidenz ab, nicht von verstrichener Zeit. Den Befehl zu lange zu behalten hat eine kleinere operative Kosten, verschleiert aber, welcher Mechanismus dauerhaft ist.
