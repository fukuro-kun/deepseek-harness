# Agent Note: Abgebrochene Streams finalisieren ihr ausgeliefertes Präfix
[English](2026-08-10-cancelled-stream-prefix-finalize.md) | [中文](2026-08-10-cancelled-stream-prefix-finalize.zh.md) | Deutsch

Status: implemented


## Problem

Ein abgebrochener Stream kann transient Chunks hinterlassen, die Clients bereits gerendert haben, während `deriveMessages()` sie auslässt, weil kein `assistant/message` das ausgelieferte Präfix festhält. Eine Folgefrage wie „expand on your second point" verliert dann Text, den der Nutzer gelesen hat, und ein fork am abgebrochenen Turn erbt dieselbe Lücke.

Die Model-History muss Assistant-Inhalt enthalten, der nach dem Abbruch für den Nutzer sichtbar bleibt.

## Entscheidung

`ReactLoopAgent.step()` fängt den Abbruch beim Konsumieren eines Model-Streams ab, sobald sein `BlockAssembler`, der kompakte Stream-Akkumulator und die Provider-Route das ausgelieferte Präfix identifizieren. Er hängt dieses Präfix als `assistant/message` des Steps mit `interrupted: true`, `surfaceOp: 'append'` und dem exakten eingebetteten zeitgestempelten Stream an. Der Append steht vor dem committeten `agent/assistant-stream`-Endframe, `step/end` und dem abgebrochenen `turn/end`.

`BlockAssembler.interruptedBlocks()` gibt geschlossene und offene `text`- und `reasoning`-Blöcke mit nichtleerem Inhalt in Stream-Reihenfolge zurück. Es lässt Tool-Calls aus, weil der Abbruch vor dem Dispatch liegt und kein echtes Ergebnis existiert; ebenso lässt es leere Blöcke und offene unbekannte Blocktypen aus. Ein leeres Ergebnis hängt statt einer Surface-Message `assistant/attempt` an. Auch Provider-Finishes mit `error` und `aborted` committen `assistant/attempt` vor `agent/request-error`, sodass ihre Streams persistent bleiben, ohne fehlgeschlagenen Request-Inhalt in die Model-History zu legen.

Die Conversation Definitions von Chat und Trajectory lesen `interrupted` aus der persistenten Message. Chat rendert den Stopped-Marker, während Trajectory den Provider-Request nach `step/end` im Error-Lifecycle hält und die durable Ergebnis-Seq sowie die Provider-Informationen behält. Ein Abbruch während der Tool-Ausführung folgt dem Tool-Scheduler-Vertrag, weil die Assistant-Message bereits committet ist: gestartete Calls erzeugen echte Ergebnisse, und nicht dispatachte Calls erhalten `ABORTED_BEFORE_DISPATCH`-Ergebnisse.

## Betrachtete Alternativen

**Das Präfix immer verwerfen.** Das vermeidet einen neuen persistenten Marker, lässt aber jedes Abbruch-plus-Folgefrage und jeden fork Assistant-Inhalt auslassen, der für den Nutzer sichtbar bleibt.

**Das Präfix bei der Projektion aus dem eingebetteten Attempt zusammensetzen.** `deriveMessages()` und die Client Conversation Definitions bräuchten dann jeweils eigene Abbruch-Assemblierungsregeln, und das Log hätte keine verbindliche Surface-Message für das Präfix. Das weitet die Model-History außerdem über die drei `SurfaceEventType`-Events hinaus aus.

**Vollständige Tool-Calls mit synthetischen Abbruch-Ergebnissen behalten.** Diese Calls wurden nie dispatacht, sodass synthetische Ergebnisse ein Ausführungsergebnis behaupten würden, das nicht eingetreten ist, und Inhalt hinzufügen, den der Nutzer nicht als Tool-Ergebnis erhalten hat.

**Eine model-sichtbare Abbruch-Message wie `[interrupted by user]` anhängen.** Das könnte dem Modell mitteilen, dass das Präfix unvollständig ist, erfordert aber einen eigenen Source-Typ, eine Projektionsregel, eine UI-Behandlung und lokalisierte Formulierung. Das durable abgebrochene `turn/end` bewahrt die Tatsache, die für diese spätere Entscheidung nötig ist.

## Konsequenzen

Folgefragen und forks nach einem Abbruch enthalten das ausgelieferte Präfix. Die ACP-Bridge entleert die geordnete Assistant-Ausgabe, bevor sie den Prompt abschließt, sodass das letzte `agent_message_chunk`-Update vor dem abgebrochenen Stop-Reason liegt.

Terminale Provider-Fehler behalten ihren Stream in `assistant/attempt`, halten seinen Inhalt aber aus der Model-History heraus. Nur die Abbruch-Entscheidung des Nutzers macht sichtbaren ausgelieferten Text zu einer interrupted Surface-Message.

## Tests

`packages/core/agent-loop/tests/cancel.spec.ts` deckt Inhalt, eingebettete Streams, Event-Reihenfolge, Parität des nächsten Requests, reine Reasoning-Ausgabe, das Auslassen von Tool-Calls, Abbruch während der Wiederherstellung und den Attempt bei leerem Präfix ab. `packages/llm/llm/tests/assembler.spec.ts` deckt `interruptedBlocks()` ab. `packages/client/ui-chat/tests/conversation-node-definitions.client.spec.ts` und `packages/client/ui-trajectory/tests/conversation-definitions.client.spec.ts` decken beide Client-Projektionen ab. Der schlüssellose `cancel`-ACP-Snapshot und der `goal-round-driver`-Goal-Snapshot decken assemblierte Anwendungen ab.
