# Agent Note: Latch wake-ups that land in the cancel-convergence window

Status: implemented

[English](2026-08-07-cancel-convergence-wake-latch.md) | [中文](2026-08-07-cancel-convergence-wake-latch.zh.md) | Deutsch

## Problem

`Agent.cancel(cause, { keepInbox: true })` kehrt sofort nach dem Feuern des Abort-Signals zurück, aber der aktive Driver muss noch nicht zu `idle` konvergiert sein: LLM-Stream-Teardown, Tool-Cancellation und der `turn/end`-Append unwinden alle asynchron, nachdem `abort()` zurückgekehrt ist. Ein in diesem Fenster eintreffender Waking-Send wurde in `next-turn` platziert, während `wakeDriver()` bei der noch `running` Phase früh zurückkehrte, und der aussteigende Driver replayte den Wake nie — die Message blieb geparkt, bis ein weiterer Waking-Send eintraf. Dasselbe Dropped-Wake-Fenster existierte um abgebrochene `runMaintenance`-Aktivitäten. Mehrere Tests verfestigten das Park-Verhalten ("waits for another wakeup"); der Bug brach sowohl `session.cancel` als auch den `subagent.interrupt`-Kompositionspfad (Issue #1838). Die zuständigen Cancellation- und Send-Verträge sind die Entscheidungen [explicit turn cancellation](../architecture/2026-07-16-explicit-turn-cancellation.de.md) und [unified send](../../archived/architecture/2026-07-22-unified-send-and-coalesced-user-messages.md); der produktive `keepInbox`-Consumer ist [web stop preserves queue](../../archived/bug-fix/2026-07-31-web-stop-preserves-queue.md).

## Decision

Die `running`-Phase trägt einen `wakeRequested`-Latch, analog zum bestehenden `maintenance`-Phasenfeld. `wakeDriver()` latcht immer dann, wenn die aktuelle Aktivität den Wake nicht zustellen kann — eine Maintenance-Task liest die Queue nie, und eine abgebrochene Aktivität konvergiert ohne Neustart —, während ein lebender Driver keinen Latch braucht, weil er gequeuete Arbeit selbst claimt. Die aussteigende Aktivität replayt den Latch an ihrer eigenen Convergence-Grenze (`kick`s `finally` und `runMaintenance`s `finally`): Diese Platzierung garantiert, dass `turn/end N` landet, bevor der replayte Driver `turn/start N+1` öffnet, und dass `whenIdle()` den replayten Driver durch seine `activityDone`-Schleife sieht. Die Replay-Stellen laufen nur, solange `inbox.hasPending` gilt, sodass ein gelatchter Wake, der vor der Convergence aus der Inbox entfernt wird, keinen leeren Driver startet. Ein Wake, der gesendet wird, während der Agent bereits idle ist, behält seine Turn-Grenze, selbst wenn seine Message gecleart wird, bevor der Driver claimt — dieser `idle → running → idle`-Übergang ist ein beobachtbarer Vertrag: Der Pause-/Disarm-Fallback des Goal-Round-Driver-Drivers feuert auf den `idle`-Übergang nach einer gecancelten Reservierung (den Guard in `wakeDriver()` zu verschieben würde diese Grenze unterdrücken). `cancel()` ohne `keepInbox` cleart den Latch zusammen mit der Inbox.

Der `signal.aborted`-Diskriminator ist tragend: Er trennt vor dem Abort gequeuete Arbeit — die `keepInbox` für einen späteren Wake parkt (der `keepInbox`-Parking-Vertrag) — von expliziten Wakes nach dem Abort, die nach der Convergence laufen müssen.

## Alternatives considered

**`cancel()` die Phase sofort auf `idle` setzen lassen.** Verworfen: Der Driver unwindet noch, also überlappen zwei Driver. Der Replay lebt im `finally` des alten Drivers, das dann nie läuft — 14 von 83 Tests schlugen fehl, mehrere deadlocked. Ihn zu reparieren erfordert identitätsbasierte Phase-Ownership plus eine Turn-Open-Quiescence-Barriere, was strikt mehr Maschinerie ist und der verkleidete Latch.

**Bedingungslos für jeden Nicht-Idle-Wake latchen.** Verworfen: Pre-Abort-Wakes würden nach einem `keepInbox`-Cancel automatisch starten, was den `keepInbox`-Parking-Vertrag verletzt; der "parks queued work"-Test und der Error-Window-Steering-Test schlugen beide fehl.

**Über eine verkettete Promise replayen (`activityDone.then(...)`).** Verworfen: Der Replay würde außerhalb des eigenen Settlements der Aktivität laufen, sodass die `whenIdle()`-Schleife auflösen kann, bevor der replayte Driver startet; das zu reparieren erfordert das Ersetzen von `activityDone` zur Send-Zeit und hängt von Microtask-Reaction-Ordering ab — fragiler als ein synchrones Flag.

**Im Subagent-Adapter auf Quiescence warten.** Vom Issue-Scope verworfen: Die Cancel-/Wake-Zustandsmaschine besitzt den Fix, nicht ein Consumer.

## Consequences

Die `running`-Phase gewinnt ein `wakeRequested`-Feld; `cancel()` ohne `keepInbox` cleart es zusammen mit der Inbox, und ein `disposed`-Cancel latcht nie, sodass ein nach Beginn des Disposals eintreffender Wake geparkt bleibt und `whenIdle()` nicht auf einen vollen Modell-Turn über der abgerissenen Session wartet. Ein Wake, der in die Sub-Microtask-Lücke zwischen dem letzten `hasPending`-Check des Drivers und seinem Exit fällt, parkt weiterhin — kein Latch feuert, weil die Phase `running` und nicht aborted ist; diese Lücke zu schließen erfordert den bedingungslosen Latch und ist bewusst außerhalb des Scopes. Zwischen dem abgebrochenen Turn und dem replayten Driver emittieren die Statusübergänge ein transientes `idle → running`-Paar. Ein Waking-Send, dessen Message gecleart wird, bevor irgendein Driver sie claimt, öffnet weiterhin einen leeren abgeschlossenen Turn und bewahrt so die beobachtbare Wake-Grenze.
