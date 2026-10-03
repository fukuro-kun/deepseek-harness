# Agent Note: Eingebettete Assistant-Stream-Consumers lesen kompakte Records

Status: implemented

[English](2026-09-06-embedded-stream-record-readers.md) | [中文](2026-09-06-embedded-stream-record-readers.zh.md) | Deutsch

## Problem

Session-Format v2 bettet den kompakten Stream jedes Modellversuchs (`AssistantStreamRecord[]`: gepackte `text-chunks`-, `reasoning-chunks`- und `tool-call-chunks`-Runs plus zeitgestempelte rohe `chunk`-Records) in `assistant/message` und `assistant/attempt` ein. Consumers, die diese Settlements foldeten, riefen zuerst `expandAssistantStream()` auf; es materialisiert das vollständige Per-Member-Array, sodass ein Consumer, der eine einzige Tatsache braucht (`find` auf dem ersten Token, der letzte Usage-Chunk, ein verbundener Text, ein Block-Ende), O(Members) an Allokation und Zeit zahlte: etwa zwei Objekte pro Member zusätzlich zur kompakten Form.

Nachdem sich das Settlement eingebetteter v2-Streams mit dem Nachrichteninhalt erweiterte und Chat- und Trajectory-Sektionen direkt daraus settled wurden, sind die verbleibenden Expand-Consumers die Host- und Client-Folds: Session Stats liest die First-Token-Zeit pro `assistant/attempt` und `assistant/message` (die Projektionsphase jedes Session-Öffnens), der Token-Meter baut Provider-Inhalt wieder auf und scannt jeden Stream nach seinem letzten Usage-Chunk (die Projektionseinheit scannt weiterhin bis zum Ende), der Subagent-Output-Fold verbindet Plaintext, und das Image-Lookup des Session Controllers scannt nach Block-End-Chunks.

## Entscheidung

`@deepseek-ai/dsh-llm` beantwortet Consumer-Fragen direkt aus kompakten Records; jeder verbleibende Consumer foldet Records einmal mit Early-Exit.

`packages/llm/llm/src/assistant-stream.ts` exportiert Record-Level-Reader neben dem Accumulator und `expandAssistantStream`:

- Chunk-Regeln: `isTokenDelta` (nicht-leeres Text-, Reasoning- oder Tool-Call-Argumente-Fragment oder jedes namenstragende Tool-Call-Delta), `isVisibleChunk` (nicht-Whitespace-Text oder Reasoning oder ein Blockanfang oder -ende jeder Art außer Text, Reasoning oder Tool Call) und `chunkHasVisibleText` (nicht-Whitespace-Textdelta oder abgeschlossener Textblock).
- Run-Reader: `runFirstTokenTime` und `runFirstVisibleTime` rekonstruieren die Zeit des ersten qualifizierenden Members aus `time0` und den `dt`-Lücken und stoppen den Scan dort; ein namenstragender Tool-Call-Run liefert `time0`, ohne ein Fragment zu lesen.
- Stream-Reader: `assistantStreamFirstTokenTime`, `assistantStreamHasVisibleContent`, `assistantStreamHasVisibleText`, `lastAssistantStreamChunk(stream, type)` (Rückwärtsscan), `assistantStreamChunks(stream, type)`, `joinAssistantStreamText` und `assembleAssistantStream`, das einen `BlockAssembler` mit einem verbundenen Delta pro Run füttert (Assembly konkateniert nur, sodass Blöcke, Usage, Finish und Replay-Zustand dem Per-Member-Ergebnis entsprechen). `RawStreamChunkType` schließt die Delta-Typen aus, sodass ein Raw-Chunk-Lookup niemals still gepackte Members überspringen kann.

Session Stats liest `assistantStreamFirstTokenTime`; der Token-Meter liest `lastAssistantStreamChunk(stream, 'usage')` und assembliert Provider-Output über `assembleAssistantStream`; der Subagent-Output-Fold hängt `joinAssistantStreamText` an; der Session Controller scannt `assistantStreamChunks(stream, 'block-end')` nach Bildern.

`expandAssistantStream` behält seine strikte Validierung und seine verbleibenden Aufrufer, die jeden Member brauchen oder den Stream an einer dauerhaften Grenze validieren: Session-Restore-Validierung, der v1-zu-v2-Migrationsvalidator und die Veröffentlichungs-Worker-Replay, die Reconnect-Basislinie und Testunterstützung.

### Messungen

Der synthetische First-Open-Benchmark des Repos (200 Turns, 127.400 Released-v0-Events, 500.000 gestreamte Deltas in 1.600 kompakten Records; fünf Samples, Median):

| Phase | Vorher | Nachher |
|---|---|---|
| first-open projection | 28.0 ms | 5.9 ms |
| first-open total | 76.9 ms | 53.8 ms |
| first-open peak RSS | 137.2 MB | 94.6 MB |
| reopen projection | 17.8 ms | 6.5 ms |

Open-, Read- und Restore-Phasen sind unverändert; der Reader behält konstruktionsbedingt dieselbe First-Token-Zeit (der erste qualifizierende Member ist das erste qualifizierende Fragment des ersten Records, und die Deltas bleiben geordnet).

## Erwogene Alternativen

**`expandAssistantStream` pro Eingabe-Array memoisieren.** Alle Streams einmal zu expandieren kostet zig Millisekunden, aber die Expansionen zu halten kostet etwa das Zehnfache des kompakten Streams für die Lebensdauer des Events — eine permanente Version der transienten Allokation, die die Änderung entfernt. Die Reader beseitigen den Bedarf an gehaltenen Expansionen vollständig.

**Den Per-Member-Fold behalten.** Early-Exit-`.find` materialisiert weiterhin zuerst das ganze Array; Allokation und O(Members)-Zeit bleiben also.

## Konsequenzen

Host- und Client-Folds eines eingebetteten Settlements kosten O(Records) plus einen Join pro Run, und kein Consumer materialisiert Members, es sei denn, er validiert an einer dauerhaften Grenze oder braucht jeden Member. Die Token-, Sichtbarkeits- und Visible-Text-Regeln haben ein einziges Zuhause in `dsh-llm`, sodass ein Record-Reader und die Packing-Regeln des Accumulators nicht auseinanderdriften können.

Die Veröffentlichungsverifikation (`assertCurrentAssistantStreams`) spielt weiterhin jedes Settlement zur Publish-Zeit ab; da sie Chunk-für-Chunk-Übereinstimmung des Inhalts beweisen muss, bleibt ihre Umwandlung auf run-bewusste Assembly ohne Member-Materialisierung offene Arbeit.
