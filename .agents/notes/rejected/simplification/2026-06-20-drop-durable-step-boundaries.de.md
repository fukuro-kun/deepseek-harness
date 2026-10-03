# Agent Note: Durable Step-Boundary-Events streichen
[English](2026-06-20-drop-durable-step-boundaries.md) | [中文](2026-06-20-drop-durable-step-boundaries.zh.md) | Deutsch

Status: rejected — `step/end` ist die durable Anzeige dafür, dass ein Model-Step abgeschlossen wurde, und das Behalten des symmetrischen `step/start`-/`step/end`-Paars macht Crash-Repair, Invarianten und Transcript-Inspektion klarer, als den Abschluss aus angrenzenden step-scoped Events abzuleiten.


## Problem

Das Session-Log speichert `step/start`- und `step/end`-Events, obwohl jedes step-scoped Event bereits `{ turn, step }` trägt: Assistant-Chunks, Assistant-Messages, Tool Calls, Tool Results, usage und Errors. `deriveMessages()` ignoriert Step-Grenzen, ACP ignoriert sie für die UI, und die Haupt-Consumer sind Invarianten, Tests, Snapshot-Expected-Outputs und Crash-Repair.

Das abgelehnte Argument war, dass Boundary-Events das Log eher zeremoniell als informativ machen. In der Praxis ist `step/end` konkrete Information: Ein Leser kann erkennen, ob ein Model-Request abgeschlossen wurde, gecrasht ist oder repariert wird, ohne diesen Zustand aus dem nächsten Event abzuleiten. Ein nacktes `step/start` ist ebenso nützlich für einen Model-Request, der begann, aber vor dem Fehlschlagen keine Chunks produzierte.

## Proposal

Den Turn zur einzigen durable Grenze machen. `step/start` und `step/end` aus `SessionEventMap` entfernen; das numerische `step`-Feld auf Events behalten, die Gruppierung brauchen. Der Loop inkrementiert den Step-Counter und zeichnet step-scoped Events mit dieser Nummer auf, hängt aber keine Open-/Close-Boundary-Events mehr an. Consumer leiten Step-Gruppen aus zusammenhängenden Events ab, die `(turn, step)` teilen.

Das Invarianten-Plugin sollte erzwingen, dass step-scoped Events gültige positive Step-Nummern innerhalb eines offenen Turns haben, nicht dass separate Boundary-Records sie umgeben. Crash-Repair sollte kein `step/end` synthetisieren; wenn ein unterbrochener Turn bewahrt wird, kann der Repair-Pfad den Turn trotzdem schließen, ohne Step-Boundary-Records zu erfinden.

## Acceptance criteria

- `SessionEventMap` enthält kein `step/start` oder `step/end` mehr.
- Der Loop hat keinen `closeStep()`-Finalisierungspfad.
- ACP-Snapshots und Persistence-Contract-Fixtures erwarten keine Step-Boundary-Zeilen mehr.
- `deriveMessages()` und Replay leiten dieselbe Message-History aus step-scoped Events ab.
- Die [Event-Taxonomie-Docs](../../../../docs/architecture.de.md) beschreiben Turns als die durable Grenze und Steps als Feld auf step-scoped Records.
- Die Session-Format-Version und die aufgezeichneten Fixtures werden erneuert; nicht-aktuelle gespeicherte Logs werden gemäß der Pre-Release-Format-Policy zurückgewiesen.

## What we give up

Das Log zeichnet "ein Model-Request startete, produzierte aber vor dem Prozesstod kein Event" nicht mehr als durable Fakt auf und hat keinen expliziten "dieser Step ist abgeschlossen"-Marker mehr. Dieser Verlust ist nicht akzeptabel, solange das Session-Log die durable Replay- und Audit-Oberfläche ist.

<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
