# Agent Note: Deterministische Tests, das Fixture für die Replay-Invariante und Race-Stress

Status: proposed

[English](2026-06-11-deterministic-and-stress-testing.md) | [中文](2026-06-11-deterministic-and-stress-testing.zh.md) | Deutsch

Der [CI test reliability skill](../../../skills/dsh-ci-test-reliability/SKILL.md) liefert aktuelle Leitlinien für die Erstellung und Diagnose von Tests, ohne die hier vorgeschlagene Lint-Regel, das universelle Replay-Fixture oder den nächtlichen Stress-Job zu implementieren. Diese Mechanismen bleiben im Vorschlagsstatus.

## Problem

Mehrere Loop-Tests synchronisieren mit `setTimeout(30)`-Sleeps — eine Flakiness-Schuld, die Agent-Zyklen mit Wiederholungen verschwendet und Ordering-Bugs verdecken kann. Unabhängig davon: Unser zentrales Architekturversprechen (jedes Session-Log replayt zu identischer abgeleiteter Historie) wird in zwei Tests geprüft, ist aber *überall* kostengünstig zu prüfen. Und der Inbox-Wakeup-Race wurde genau einmal manuell verifiziert; nichts verifiziert ihn kontinuierlich neu.

## Vorschlag

Drei Maßnahmen:

1. **Keine Wanduhr-Sleeps in Tests.** Ersetze `setTimeout(N)`-Warten durch ereignisgesteuertes Warten (das bestehende `waitForIdle`-Muster, erweitert auf `waitForStatus` und `waitForEvent(n)`) oder vitest-Fake-Timer, wenn die Zeit selbst das Testobjekt ist. Durchgesetzt mit einer Lint-Regel, die `setTimeout` in `packages/*/tests` außerhalb des erlaubten Helper-Moduls verbietet.
2. **Universelles Replay-Fixture.** Ein gemeinsamer Test-Helper kapselt das Loop-Harness so, dass nach jedem Test das Session-Log des Agents in eine frische Session replayt wird und die Gleichheit von `deriveMessages()` automatisch geprüft wird. Die Invariante wird dann hunderte Male pro CI-Lauf über jedes von der Suite erzeugte Szenario geprüft, nicht nur zweimal.
3. **Nächtlicher Race-Stress.** Ein CI-Job führt die agent-loop- und inbox-Suiten mit `vitest --repeat=200` (und `--shuffle`) aus, um scheduling-abhängige Fehler aufzudecken; jeder gefundene Flake ist ein Bug, der zu beheben ist — kein Retry.

## Plan

1 und 2 zusammen bringen (sie berühren dieselben Helper); den nächtlichen Job erst hinzufügen, wenn die Suite sleep-frei ist, damit die Wiederholungen schnell laufen.

## Akzeptanzkriterien

- In `packages/*/tests` bleibt kein `setTimeout` außerhalb des erlaubten Helper-Moduls, durchgesetzt durch die Lint-Regel.
- Das gemeinsame Harness replays das Session-Log jedes Tests in eine frische `Session` und prüft automatisch die Gleichheit von `deriveMessages()` — über die gesamte Suite hinweg.
- Der nächtliche Job führt die agent-loop- und inbox-Suiten mit `--repeat` und `--shuffle` aus; ein von ihm gefundener Flake wird als Bug triagiert, nie durch Retries beiseitegeschoben.

## Risiken

Fake-Timer interagieren subtil mit dem Promise-Scheduling in der Loop — ereignisgesteuertes Warten bevorzugen; Fake-Timer nur für das Verhalten des Timer-Dienstes selbst reservieren.

<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
