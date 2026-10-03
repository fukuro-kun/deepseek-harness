# Agent Note: Child Agent messages precede their settlement notices
[English](2026-08-17-subagent-message-settlement-ordering.md) | [中文](2026-08-17-subagent-message-settlement-ordering.zh.md) | Deutsch

Status: implemented


## Problem

Ein continuable Child kann ausgewählten Content senden und später eine unbedingte, vom Manager verfasste Settlement-Notiz erzeugen. Wenn diese beiden Messages in Queues mit unterschiedlicher Claim-Priorität gelangen, kann die spätere Settlement-Notiz das Parent-Modell vor der früheren Child-Message erreichen. Der erste Step eines Turns claimt den vollständigen `next-step`-Batch vor einer `next-turn`-Message, sodass das Mischen eines FIFO-Later-Turn-Sends mit einem Next-Step-Settlement die Kausalreihenfolge umkehrt. [Issue #2600](https://github.com/deepseek-harness/deepseek-harness/issues/2600) dokumentiert den Defekt.

Die Child-Instruktion sagt, einen Fund zu senden, wann immer er ändert, was der Parent als Nächstes tun soll. Diese Message auf einen späteren Turn zu verschieben widerspricht ihrer Scheduling-Bedeutung und trennt kausal geordnete Messages über Queues mit unterschiedlicher Claim-Priorität.

## Decision

Jede modellverfasste Adjacent-Agent-Message nutzt feste Steer-Zustellung über `SubagentRuntime.sendMessage()`. Ein laufender Parent liest die Child-Message an seiner nächsten sicheren Step-Grenze, und ein idle Parent startet einen Turn. Es gibt keine Quiet- oder Next-Turn-Modellzustellungsoption.

Der Continuation-Manager behält `sendWaking()` um Messages, die an residente continuable Parents zugestellt werden, und routet den synchronen Send durch das private `SubagentInbox` des Parents. Der Wrapper akzeptiert den Send, bevor seine Closing-Promise installiert ist, oder lehnt ihn danach ab, und ein akzeptierter Versuch erneuert die Wake-Generation der Activation vor der Rückkehr. Die empfangende Activation kann daher über einen akzeptierten Waking-Send hinweg nicht settlen.

### Ordering across parent states

Ein laufender Parent empfängt eine akzeptierte Child-Message und die spätere Settlement-Notiz des Childs in derselben `next-step`-FIFO. Wird der Parent idle, bevor das Settlement eintrifft, hat er die Child-Message bereits geclaimt; das Settlement kann dann einen späteren Turn öffnen, ohne die beobachtete Reihenfolge umzukehren.

Während der Parent-Maintenance belegt die Child-Message `next-step` und latcht einen Wake, während das Settlement `next-turn` belegen kann, weil Maintenance Idle-Status meldet. Der initiale Claim nimmt weiterhin Next-Step-Input vor dem gequeueten Turn. Nach Cancellation eingereichter Waking-Input folgt der Cancellation-Convergence des Core-Agents statt sie zu umgehen.

### Verification

Die Control-Tool-Suite hält einen Parent innerhalb eines aktiven Modell-Requests, reicht Child-Messages ein, settlet das Child und verifiziert Sender-Identität, Steer-Admission, FIFO-Batching und Erhaltung nach dem Settlement. Die Continuation-Coverage pinnt die Wake-Admission-Buchhaltung für einen residenten continuable Parent und hält die Runtime-eigene Settlement-Quelle von `agent-message` getrennt.

Der schlüssellose Continuable-Subagent-Snapshot nutzt die ausgelieferte feste Zustellung. Sein child-sichtbares Tool-Schema ist dasselbe wie das des Parents, und die akzeptierte Child-Message geht der späteren Settlement-Notiz ohne Scheduling-Overlay voraus.

## Alternatives considered

**Quiet-Delivery anbieten.** Eine Quiet-Message kann ungelesen bleiben, nachdem ein idle Parent parkt. Sie gibt zudem äquivalenten modellverfassten Messages unterschiedliche Liveness-Semantik und reißt deploymentabhängiges Ordering wieder auf.

**Next-Turn-Delivery anbieten.** Eine spätere Next-Step-Settlement-Notiz kann sie trotzdem überholen. Message-vor-Settlement zu bewahren erforderte eine Queue-übergreifende Ordering-Barriere, und keine aktuelle Modelloperation verlangt Later-Turn-Isolation stark genug, um diesen Mechanismus zu besitzen.

**Settlement-Notizen nach `next-turn` verschieben.** Settlement-Batching nutzt die Next-Step-Queue, damit mehrere gemeinsam endende Children einen Parent-Step statt je eines Turns kosten. Das Verschieben des Settlements würde Latenz und Modellarbeit erhöhen, um einen unnötigen Message-Scheduling-Modus zu behalten.

## Consequences

- Eine Child-Message kann einen offenen Parent-Turn verlängern. Sie unterbricht nie den aktiven Modell-Request oder die Tool-Ausführung; der Agent Loop lässt sie nur an einer Step-Grenze zu.
- Gemeinsam akzeptierte Messages teilen einen Next-Step-Batch, bewahren FIFO-Reihenfolge und begrenzen Turn-Amplifikation.
- Modell-Caller können keinen Delivery-Mode wählen, sodass Ordering und Wake-Verhalten nicht je Deployment oder Call variieren.
- Ein Child-zu-Parent-Send erfordert weiterhin, dass der direkte Parent live bleibt; der Service bietet keine durable Parent-Mailbox.
