# Agent Note: Mutationstesting als Gegengewicht zur Abdeckung
[English](2026-06-11-mutation-testing.md) | [中文](2026-06-11-mutation-testing.zh.md) | Deutsch

Status: proposed


## Problem

Das pro Datei 100 % Abdeckung fordernde Gate ([die quality-gates-Entscheidung](../../implemented/process/2026-06-11-quality-gates.de.md)) beweist, dass jede Zeile *unter Test ausgeführt* wird — nicht, dass eine Assertion es bemerken würde, wenn die Zeile falsch wäre. Bei agent-geschriebenen Tests kann Abdeckungsdruck zu Ausführung ohne Assertion führen. Mutationstesting misst, was Abdeckung nicht kann: ob die Suite gezielt injizierte Bugs *tötet*.

## Vorschlag

Stryker (`@stryker-mutator/vitest-runner`) über `packages/*/src`:

- **PR-abgegrenzte inkrementelle Läufe** (nur geänderte Dateien) als CI-Job — nach der Abstimmung schnell genug, um Merges zu gaten.
- **Nächtliche Voll-Läufe** mit getracktem Mutations-Score; zunächst nur aufzeichnen, dann die Schwelle auf die beobachtete Baseline setzen und nur noch verschärfen (gleiche Politik wie bei der Abdeckung: Schwellen werden nur je enger).
- Überlebende Mutanten sind Arbeitspakete: Ein Agent wählt eine überlebende Mutante aus, schreibt den tötenden Test und wiederholt — ein sauber geformter autonomer Loop.
- Äquivalente Mutanten (nachweislich verhaltenserhaltend) erhalten annotierte Ausnahmen mit Begründung, nach dem Vorbild der `/* v8 ignore */`-Politik.

## Plan

1. Stryker-Konfiguration auf ein Paket beschränken (llm — kleinstes, am algorithmischsten) und die Laufzeit messen.
2. Auf alle Pakete ausweiten; Baseline-Scores in der Konfiguration aufzeichnen.
3. Den nächtlichen Job verdrahten; den inkrementellen PR-Job hinzufügen, sobald die Laufzeit akzeptabel ist.

## Akzeptanzkriterien

- Eine Stryker-Konfiguration läuft mit dem vitest-Runner über `packages/*/src`; ein nächtlicher Job zeichnet den Mutations-Score auf, und eine nur nach oben ratchende Schwelle lässt den Lauf scheitern, wenn der Score unter die aufgezeichnete Baseline fällt.
- PR-abgegrenzte inkrementelle Läufe gated Merges, sobald die Laufzeit akzeptabel ist — oder werden ausdrücklich nur nächtlich belassen, mit diesem Ergebnis hier aufgezeichnet.
- Äquivalente Mutanten tragen annotierte Ausnahmen mit Begründung, nach dem Vorbild der `/* v8 ignore */`-Politik.

## Risiken

Laufzeit: Mutationstesting ist teuer; die pro Datei 100 % Abdeckung hilft (jede Mutante wird zumindest erreicht). Wenn PR-abgegrenzte Läufe zu langsam bleiben, nur nächtlich belassen und sich auf den Score-Ratchet verlassen.

<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
