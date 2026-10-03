# Agent Note: Publint-Test-Subprozesse erben die Deadline der Ausführungs-Lane

Status: implemented

[English](2026-09-07-publint-test-subprocess-lifetime.md) | [中文](2026-09-07-publint-test-subprocess-lifetime.zh.md) | Deutsch

## Problem

Die publint-Skript-Tests setzen eine fünfsekündige synchrone Subprozess-Deadline unterhalb der bestehenden 90-Sekunden-Test- und Hook-Budgets der Windows-Coverage-Lane. Erfasste Windows-Fehler melden sowohl im gültigen als auch im ungültigen JavaScript/CSS-Fall einen null-Status; der gültige Fall dauert 5028 ms. Diese Logs lassen Subprozess-Fehler und -Signal aus und belegen daher kein ETIMEDOUT. Die Deadline-Diskrepanz ist ein geteilter Testdefekt, kein Beweis dafür, dass eine Produktänderung die Fehler verursacht hat.

## Entscheidung

Die [publint-Spec](../../../../scripts/publint-all.spec.ts) nutzt die bestehende Execa-Dependency mit dem Test-Kontext-Signal von Vitest. Es gibt kein unabhängiges Subprozess-Timeout. Das [Workflow](../../../../.github/workflows/ci.yml) und der [Coverage-Argument-Owner](../../../../scripts/coverage-partitions.ts) bleiben für die Budgets verantwortlich. Das wendet dieselbe Lane-Ownership-Regel an wie die [Subagent-Teardown-Tests](2026-09-07-subagent-teardown-test-budgets.de.md), ohne deren Cleanup zu ändern.

Jedes direkte Node-Kind wird sofort registriert, Cancellation fordert SIGKILL an, und der Teardown wartet Ergebnis und close-Event jedes eigenen Kinds ab, bevor private Paket-Wurzelverzeichnisse entfernt werden. Prozessfehler, Cancellation, Timeout-Flags, Signale und erfasste Streams werden vor den erwarteten Exit-Codes diagnostiziert. Ein gewöhnlicher Exit-Code von eins bleibt für negative publint-Fälle gültig. Alle fünf Fälle rufen das echte Skript mit isolierten Publikations-Fixtures auf.

## Erwogene Alternativen

- Die Fünf-Sekunden-Konstante erhöhen: Eine andere lokale Konstante würde das Budget der Ausführungs-Lane weiterhin überschreiben.
- publint vorladen oder ersetzen: Beides übt weder kalte Skript-Imports noch die echten Publikationsprüfungen.
- Nach dem Kill zurückkehren: Prozess- und Pipe-Schließen müssen dem Fixture-Entfernen vorausgehen.

## Konsequenzen

Eine readiness-gesteuerte Deadline-Regression bricht zwei lebende Kinder ab und prüft beide Schließ-Events, tote PIDs und informative Diagnostik. Ein fehlendes Arbeitsverzeichnis verifiziert die Spawn-Fehler-Diagnostik. Unabhängige nebenläufige Spec-Prozesse prüfen Tempverzeichnis-Isolation und Subprozess-Scheduling. Die native Windows-CI bleibt Besitzerin der Windows-Terminierungs- und Dateisystem-Nachweise; macOS-Ergebnisse belegen diese Garantien nicht. Produktcode, Workflow-Budgets und Snapshot-Ausgabe bleiben unverändert.
