# Agent Note: Unterbrochene finale Turns beim Laden abschneiden

Status: rejected — ein einzelner Turn kann substanzielle echte Arbeit enthalten, einschließlich vieler Steps und großer Tool-Ausgaben. Unterbrochene Turns zu bewahren ist dem stillen Verwerfen dieses Tails beim Laden vorzuziehen.

[English](2026-06-20-truncate-interrupted-turns.md) | [中文](2026-06-20-truncate-interrupted-turns.zh.md) | Deutsch

## Problem

Der aktuelle Persistence-Vertrag bewahrt einen finalen Turn, der durable geschrieben, aber nie geschlossen wurde. Beim Laden scannt `interruptedTurnClosers()` den Tail, synthetisiert Error-`tool/result`-Events für unbeantwortete Tool Calls, hängt ein `step/end` an, wenn ein Step offen ist, hängt `turn/end { kind: 'interrupted' }` an und bittet das Backend, diese Reparatur durable zu committen. Der Coordinator, das JSONL-Backend, das SQLite-Backend, das Session-Event-Vokabular, Invarianten, Docs und Tests modellieren alle diesen synthetischen Close-Pfad.

Das ist viel Maschinerie, um Teil-Arbeit aus dem letzten gecrashten Turn zu bewahren. Sie erfindet außerdem Events, die nie passiert sind. Ein synthetisches Tool Result ist nützlich, weil es die Provider-History valide macht, bedeutet aber auch, dass das resumed Log modell-sichtbaren Text enthält, den kein Tool erzeugt hat. Das aktuelle Design optimiert auf maximale Tail-Bewahrung, bevor es ein veröffentlichtes Produkt oder eine echte Resume-UX gibt, die beweist, dass Partial-Turn-Recovery zählt.

## Proposal

Beim Laden nur den letzten abgeschlossenen Turn behalten. Ein Backend toleriert und schneidet einen zerrissenen finalen Record weiterhin ab, aber wenn das geparste durable Präfix nach einem offenen `turn/start` endet, ist die kanonische Reparatur, jedes Event nach dem vorherigen `turn/end` zu verwerfen. Kein synthetisches `tool/result`, kein synthetisches `step/end`, kein `turn/end { interrupted }` und kein `interrupted` als Turn-End-Reason.

Das macht die persistierte Turn-Grenze einfach: Ein abgeschlossenes `turn/end` ist der Checkpoint. Alles nach dem letzten Checkpoint ist Crash-Tail. Der nächste Prompt resumed vom letzten bekannt-validen Provider-Transcript, nicht aus einem teilweise rekonstruierten finalen Turn.

## Acceptance criteria

- `TurnEndReasonMap` verliert die `interrupted`-Variante.
- `interruptedTurnClosers()` und seine Tests verschwinden.
- Der Repair-Hook des Persistence-Coordinators schneidet backend-spezifischen zerrissenen/offenen Tail-State ab, ohne Closer anzuhängen.
- Die [Session-Persistence-Docs](../../../../packages/session/session-persistence/README.de.md) besagen, dass Load den letzten abgeschlossenen Turn zurückgibt, plus kein partieller finaler Turn.
- Snapshot- und Contract-Tests werden zusammen mit dem Verhalten aktualisiert, das sie pinnen.
- Die Session-Format-Version und die aufgezeichneten Fixtures werden erneuert; nicht-aktuelle gespeicherte Logs werden gemäß der Pre-Release-Format-Policy zurückgewiesen, ohne Migrationspfad.

## What we give up

Ein Crash kann echte Arbeit aus dem finalen Turn verlieren: Assistant-Text, Tool Calls und Tool-Ausgaben, die nach dem vorherigen `turn/end` angehängt wurden. Das ist die bewusste Vereinfachung. Das Produkt ist unveröffentlicht, die Final-Turn-Recovery-Semantik ist nicht nutzererprobt, und ein sauberer Completed-Turn-Checkpoint ist deutlich einfacher zu erklären, zu testen und zu implementieren. Ein künftiges "partiell gecrashte Arbeit wiederherstellen"-Feature sollte als explizite nutzerseitige Recovery-View entworfen werden, nicht als synthetische Events, die still in den kanonischen Transcript eingefügt werden.

## Related

Dies ist eine direkte Vereinfachung von [Session Persistence](../../implemented/architecture/2026-06-14-session-persistence.de.md) und der historischen [universalen Turn-Enclosure-Regel](../../archived/architecture/2026-06-15-turn-enclosure-invariant.md). Sie entfernt außerdem einen Großteil der Motivation für durable Step-Boundary-Events, wodurch [durable Step-Boundary-Events streichen](2026-06-20-drop-durable-step-boundaries.de.md) kleiner wird.

<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
