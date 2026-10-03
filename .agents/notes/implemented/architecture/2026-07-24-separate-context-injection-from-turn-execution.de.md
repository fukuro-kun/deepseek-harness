# Agent Note: Context-Injection von Turn-Execution getrennt

Status: implemented

[English](2026-07-24-separate-context-injection-from-turn-execution.md) | [中文](2026-07-24-separate-context-injection-from-turn-execution.zh.md) | Deutsch

## Problem

Die Agent-API repräsentierte ergänzenden Model-facing-Input auf drei überlappende Weisen: Caller hängten `HookContext[]` über `SendOptions.contexts` an, Interception- und Tool-Hooks gaben `additionalContexts` zurück, und Plugins riefen `agent.inject()`. Diese Pfade schrieben Context schließlich in dieselbe Model-History, trugen aber unterschiedliche Placement-, Metadata-, Admission-, Queue- und Turn-Lifecycle-Regeln.

Atomares Attachment an eine Inbox-Message zwang den Loop, Context durch Prompt-Admission, Steering-Konversion, Cancellation und terminalem Discard hindurch zu bewahren. `prompt-prefix`-Placement kombinierte dann Context und den direkten Prompt in einem Event, was einen Model-hidden-Envelope erforderte, damit Transcript-Consumer rekonstruieren konnten, was der User tatsächlich geschrieben hatte. Das Ergebnis machte Outbox-Entries, Session-Projection und UI-Replay für eine Unterscheidung verantwortlich, die dem Producer gehört.

Idle-`inject()` exponierte ein zweites Mismatch. Injection requestete keine Model-Execution, doch die Implementierung öffnete und schloss einen Zero-Step-`injection`-Turn allein, um die Turn-Enclosure-Invariante zu erfüllen und einen Durability-Checkpoint zu erhalten. Ein Turn bedeutete daher manchmal „den Agent-Loop ausführen" und manchmal „Context persistieren, ohne ihn auszuführen".

`HookContext` benannte außerdem seinen Producer statt seiner Rolle. Der Wert konnte von einem nativen Plugin, einer Hook-Bridge, Prompt-Admission oder Tool-Post-Processing kommen; seine stabile Bedeutung war zusätzlicher Model-facing-Context, dessen `source` den Producer nannte.

## Entscheidung

`inject()` ist die einzige Caller-facing-Operation für ergänzenden Model-facing-Input, und ein Turn bedeutet eine Ausführung des Model-Loops.

Ein Caller, der Context besitzt, liefert eine identifizierte, gefrorene `UserMessage` über `inject()` und submittet die direkte Message unabhängig per `followup()` oder `steer()`.

Ein eintretender Pre-Step gibt den vollständigen `PreStepDecision.messages`-Batch für den finalisiert werdenden Request zurück. Tool-Extension-Points geben weiterhin `additionalContexts` zurück, die erst nach den entsprechenden Tool-Results in die Next-Step-Inbox eintreten. Diese Werte sind Extension-Point-Outputs, keine Attachments, die aus dem Inbox-Item eines Callers captured wurden.

Jeder zusätzliche Context ist eine unabhängige `UserMessage`, deren `source` ihren Producer benennt und Producer-spezifische Felder trägt. Inbox-Insertion ist sofort durable; Admission zeichnet denselben Wert später als `user/message` auf. Es gibt kein `context/message`, kein Prompt-Prefix-Placement, keinen stabilen Request-Delimiter und keinen Prompt-Envelope. Transcript- und UI-Consumer unterscheiden direkte User-Messages von injiziertem Context anhand von `source`.

## Injection-Lifecycle

`inject()` fügt Context immer in die nicht-wachende `next-step`-Inbox ein und committet diese Queue-Mutation als `agent/inbox/spliced`. Ein laufender Driver claimt ihn an der nächstfolgenden Pre-Step-Boundary. Ein Idle-Driver lässt ihn pending, bis `followup()` oder `steer()` wachende Arbeit liefert; Cancellation oder Disposal kann ihn vorher verwerfen, ohne die durable Queue-History zu löschen.

Der Loop claimt den aktuellen Next-Step-Batch vor dem Lauf von `agent/pre-step`, sodass eine Injection, die nach diesem Claim eintrifft, den bereits finalisiert werdenden Request verpassen kann. Die nächste Boundary claimt ihn stattdessen. Eine Enter-Decision hängt ihre zurückgegebenen Messages innerhalb des besitzenden Turns an, bevor der Request sie konsumiert. Context, der während eines Assistant-Tool-Call-Batches produziert wird, erscheint daher nach den vollständigen geordneten Results dieses Batches.

Wenn Pre-Step rejected oder wirft, bleiben sein geclaimter injizierter Context, Steering und der gequeuete Prompt entfernt, und kein zurückgegebener Batch wird angehängt. Messages, die nach diesem atomaren Claim eingefügt werden, sind unbetroffen und bleiben pending.

Der Loop hängt injizierte `user/message`-Events nur aus entered Batches innerhalb eines Turns an. Core-Execution-Events, Steering, Assistant-Output und Tools bleiben Turn-enclosed; merge-extensible Event-Relationen gehören ihrem deklarierenden Plugin statt einem Core-Default.

## Extension- und Caller-Semantik

Das `PreStepDecision.messages` des Enter-Branch ist der vollständige Batch für den vorgeschlagenen Step. Ein Waterfall-Listener, der mit `next()` delegiert, bewahrt Downstream-Messages, es sei denn, er ersetzt sie absichtlich; Hinzufügungen folgen der natürlichen Waterfall-Return-Reihenfolge. Tool-Result-`additionalContexts` behalten FIFO-Reihenfolge und die Source jeder Message.

Caller-getriebene Injection und Current-Step-Context nutzen bewusst unterschiedliches Timing. `inject()` tritt dem nächsten verfügbaren Pre-Step bei und kann nicht versprechen, dass ein bereits finalisiert werdender Request ihn konsumiert. Ein Listener, der genau jenen Request beeinflussen muss, gibt den Context in `PreStepDecision.messages` zurück; ein Downstream-Reject oder -Failure verhindert dann seine Materialisierung.

Cross-Session-Referenzen nutzen diese Domain-Composition: TUI bereitet den Snapshot vor, gibt ihn aus dem Pre-Step der Idle-Direct-Message neben jener Message zurück oder injiziert ihn vor dem Waking-Steering während eines laufenden Turns. Das Ziel-Log enthält zwei einfache Messages, sodass spätere Source-Mutation das Replay nicht ändern kann und Transcript-Consumer keinen Prompt-Envelope brauchen. Dies ersetzt den Attachment-Mechanismus der [Cross-Session-Reference-Entscheidung](../../archived/feature/2026-07-21-cross-session-references.md) unter Beibehaltung ihrer Snapshot- und Trust-Boundary-Regeln.

Diese Entscheidung bewahrt die Caller-owned-Framing-Entscheidung aus [Unwrapped Injected Content](../simplification/2026-07-20-unwrap-injected-content-envelopes.de.md) und die One-Item-Turn-Regel aus [One Send, One Turn](../simplification/2026-07-17-one-send-one-turn.de.md). Die spätere [Standalone-Log-Only-Event-Entscheidung](../simplification/2026-07-28-remove-synthetic-log-only-turns.de.md) wendet dieselbe Execution-only-Bedeutung auf Plugin-eigene Records an.

## Erwogene Alternativen

**`SendOptions.contexts` als atomares Attachment behalten.** Das bewahrt All-or-Nothing-Delivery, wenn Prompt-Admission blockiert, hält Context aber im Inbox-Lifecycle-State und erfordert, dass jede Queue-Transition und jedes Observation-Event ihn mitträgt. Die generische Agent-API sollte keine Domain-Transaktion kodieren, die die meisten Caller als Context-Injection gefolgt von Message-Delivery ausdrücken können.

**Ein getrenntes `context/message`-Session-Event behalten.** User-Role-Model-Input hätte wieder zwei Event-Typen mit identischer Projection. `user/message.source` trägt bereits die Unterscheidung, die Policy-, Transcript- und Replay-Consumer brauchen.

**One-Shot-Turns für Idle-Injection behalten.** Durable Inbox-Insertion zeichnet Idle-Context bereits auf, ohne einen Turn zu öffnen. Ein synthetischer Turn würde Turn-Counts und Observer Arbeit reporten, die das Model nie laufen ließ; nicht-wachender Context bleibt pending, bis echte wachende Arbeit einen Request liefert.

**`prompt-prefix` als optionales Placement behalten.** Prefix-Baking kann Context und Request in einer Provider-Message erscheinen lassen, führt aber eine zweite Repräsentation des direkten Prompts ein und verteilt Placement-Handling über Admission, Steering, Logging, Replay und UI-Code. Producer, die Textual-Framing benötigen, können es in ihren eigenen Context-Content aufnehmen.

**Prompt-Hooks `inject()` aufrufen lassen statt Messages zurückzugeben.** Eine Injection kann den Request verpassen, dessen Prompt bereits finalisiert wird, und würde einem Downstream-Block jener Decision entkommen. Das Zurückgeben des vollständigen Message-Batch hält Current-Request-Context unter der Autorität des Waterfalls.

## Verifikation

- Delivery-Inputs und Steering-Inbox-Records enthalten keine attached Contexts; `agent/inbox/inserted` reportet nur die eingefügte Message, während der durable Splice seine Ziel-Liste behält.
- `UserMessage` ist die geteilte identifizierte, gefrorene Form über Prompt-Interception, Tool-Execution, Hook-Bridges, Guards und Context-Producer hinweg.
- Prompt-Prefix-Placement, Prompt-Envelopes und `context/message` fehlen in Public-Types, durable Events, Projection und UI-Replay.
- Idle-`inject()` hängt sofort eine durable Inbox-Insertion an, aber kein Model-sichtbares `user/message`; eine spätere wachende Delivery kann Pre-Step-Processing starten.
- Active-Turn-Injection wird an der nächstfolgenden Pre-Step-Boundary geclaimt, nach vollständigen Tool-Result-Batches und vor dem Request, der sie konsumiert.
- Rejected oder Failed Pre-Step verwirft seinen geclaimten Batch; nach dem Claim eingefügter Input bleibt pending.
- Unit-, Persistence/Resume-, Invariant- und TUI-Coverage pinnen Event-Order, Claim-Ownership und durable Replay.

## Konsequenzen

- Idle-Injection ist nicht Model-sichtbar, bis ein späterer Pre-Step sie entert, und kann durch Cancellation oder Disposal verworfen werden, während ihr durabler Inbox-Lifecycle aufgezeichnet bleibt.
- Aufeinanderfolgende User-Role-Messages ersetzen eine gebackte Prompt-Message; Provider-Adapters bewahren diese Reihenfolge.
- Exact-Current-Request-Context muss aus `agent/pre-step` zurückgegeben werden; gewöhnliche Injection bietet nur Nearest-Later-Boundary-Delivery.
- Der Public-Delivery-Contract und die Inbox-Records bleiben klein: kein Context-Attachment, kein Context-Placement-Metadata, kein Prompt-Envelope, kein duplizierter durabler Event-Typ.
