# Agent Note: Implizites Batching aus gewöhnlichen Sends entfernen

Status: implemented

[English](2026-07-17-one-send-one-turn.md) | [中文](2026-07-17-one-send-one-turn.zh.md) | Deutsch

## Problem

Angenommen, ein Caller reicht Message A und dann Message B mit zwei `Agent.send()`-Aufrufen ein. Implizites Batching kann A und B in einen Turn legen, nur weil beide warten, wenn der Driver seine Queue liest. Der Caller hat zwei Aufrufe gemacht, aber der Loop verwandelt sie still in eine Arbeitseinheit.

Diese Gruppierung hängt vom Timing ab, nicht von der Caller-Absicht. Aufrufe aus einem synchronen Stack, benachbarte Microtasks, Event-Listener und Modell-Callbacks könnten unterschiedlich gruppiert werden, obwohl jeder Caller dieselbe API nutzte.

Diese Gruppierung ändert Verhalten, nicht nur die Zahl der Modell-Calls. Ein gewöhnlicher Turn besitzt einen geclaimten Follow-up, `turn/start`, `turn/end` und einen Durability-Checkpoint. Wenn Message B den Turn von Message A teilt, kann B in A's Modell-Request eintreten, statt zuerst A's geschlossenes Ergebnis im Session-Log zu sehen. Einen Follow-up hereinzulassen, während ein anderer abgelehnt wird, erfordert außerdem einen gemischten State, den kein Caller angefragt hat.

## Entscheidung

Jeder erfolgreiche `send()` erzeugt ein unabhängiges FIFO-Queue-Item. Wenn dieses Item läuft, ist es die einzige gewöhnliche Message in seinem Turn. Ein Item kann vor seinem Start gedroppt werden, sodass die präzise Garantie höchstens ein Turn statt exakt einem ist; zwei Sends werden nie still kombiniert.

Vor dem Insert einer Message prüft `send()` den Agent-State und akzeptiert einen bereits identifizierten, deep-gefrozene Wert. Der durable Splice und `agent/inbox/inserted { message }` behalten seine `MessageId`; die pending Message bleibt über `Inbox.replace()` und `Inbox.remove()` adressierbar, bis der Driver sie claimt oder discarded. Die [Claimed-Pre-Step-Inbox-Entscheidung](../architecture/2026-07-31-claimed-pre-step-inbox-lifecycle.md) besitzt den aktuellen Lifecycle.

Wenn die Messages A und B beide verarbeitet werden, beginnt B's Turn erst, nachdem A `turn/end` aufgezeichnet hat und A's Durability-Checkpoint settled. B's Request sieht daher das geschlossene Ergebnis, das A im selben Session-Log hinterlassen hat. Ein Checkpoint-Error wird gemeldet, aber Settlement löst nur diese Ordering-Barriere; es macht einen fehlgeschlagenen Write nicht durable. Breites `cancel()`, Disposal oder ein Fehler vor `turn/start` können stattdessen ein ungestartetes Item discarden, ohne einen leeren Turn zu öffnen.

An einer Turn-Grenze öffnet der Loop den Turn und claimt einen Follow-up nach pending Next-Step-Input. `agent/pre-step` lehnt entweder den Vorschlag ab oder gibt den vollständigen eintretenden Batch zurück. Ein abgelehnter Follow-up bleibt entfernt und schließt einen blockierten No-Step-Turn, ohne modell-sichtbare History zu schreiben. Gemischte Ordinary-Follow-up-Branches existieren nicht.

Die No-Batching-Regel gilt nur für gewöhnlichen Follow-up-Input. `steer()` legt Input in die Next-Step-Inbox und weckt den Driver. Während eines Turns kann der Loop ihn an einer späteren Step-Grenze claimen; im Idle startet der weckende Next-Step-Batch einen neuen Turn. Input, der nach dem Claimen eines Batches ankommt, wartet auf eine spätere Grenze, während Cancellation oder Disposal ihn discarden kann.

`inject()` fügt weiterhin modellzugewandten Context hinzu, ohne gewöhnlichen Input einzureichen oder den Driver zu wecken. Er wartet immer in der Next-Step-Inbox auf einen späteren Pre-Step, einschließlich im Idle; AgentLoop zeichnet ihn nur dann als `user/message` auf, wenn eine Enter-Entscheidung ihn innerhalb eines Turns zurückgibt. `cancel()` bleibt eine Whole-Agent-Operation, die allen ungestarteten gewöhnlichen Input, Steering und Injection clearen und den aktuellen Step aborten kann. `status` und `whenIdle()` beschreiben ebenfalls den ganzen Agent, nicht eine Message.

## Erwogene Alternativen

**Automatisches Ordinary-Send-Batching behalten, um Modell-Calls zu reduzieren.** Dies kann den Durchsatz verbessern, wenn Producer den Driver überholen, macht aber Turn-Grenzen vom Scheduling abhängig und lässt eine spätere Message laufen, bevor der vorangehende Turn schließt und seinen Checkpoint erreicht. Die Entscheidung behält die vorhersehbare Grenze und akzeptiert die zusätzlichen Calls. Jedes künftige Batching-Feature braucht einen expliziten Caller-sichtbaren Contract, der durch Messungen gestützt ist.

## Verifikation

- Unit- und Property-Tests reichen Sends aus demselben Stack, benachbarten Microtasks, verschiedenen Producern und reentranten Callbacks ein; jede Message bekommt ihren eigenen FIFO-geordneten Turn.
- Ein Built-Stdio-Test reicht zwei Zeilen ein und beobachtet zwei Modell-Requests und zwei Turn-Grenzen.
- Verzögerte und rejected First-Turn-Checkpoints halten den nächsten Turn wartend und beweisen, dass dessen Request das vorangehende Assistant-Ergebnis sieht.
- Failure-Path-Tests decken Pre-Step-Rejection, Listener-Failure, breite Cancellation, Disposal und Failure vor `turn/start` ab; initiale Pre-Step-Exits schließen balancierte No-Step-Turns, Messages mergen nicht, und überlebende spätere Arbeit drainet weiter.
- Separate Tests decken `steer()` bei offenem Turn, fehlgeschlagenem Turn und im Idle ab, sowie pending `inject()`, Whole-Agent-Status und `whenIdle()`.

## Konsequenzen

Gewöhnliche Turn-Grenzen sind vorhersehbar: Messages A und B bleiben getrennt, und B läuft erst, nachdem A geschlossen hat und seinen Checkpoint erreicht hat. Caller erhalten weiterhin keinen Per-Send-Completion-Handle; eine pending Message kann über ihre `MessageId` entfernt werden, breite Cancellation kann den gesamten ungestarteten Tail discarden, und Status und Quiescence bleiben Agent-weite Beobachtungen.

Der Trade-off sind mehr Modell-Requests und mehr Checkpoints. Eine belebte Queue kann länger zum Drainen brauchen und unter anhaltenden Producern wachsen. Ordinary-Send-Batching kehrt nur über einen expliziten, gemessenen Contract zurück.
