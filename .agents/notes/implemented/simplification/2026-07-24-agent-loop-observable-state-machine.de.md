# Agent Note: Agent-Loop-Events um die beobachtbare State-Machine kollabieren

Status: implemented

[English](2026-07-24-agent-loop-observable-state-machine.md) | [中文](2026-07-24-agent-loop-observable-state-machine.zh.md) | Deutsch

## Problem

Der Agent-Loop exponierte seinen Control-Flow als große Menge von Cordis-Events. Separate `pre-step`- und `post-step`-Checkpoints umklammerten einen Step, `session-prefix` und `step-result` transformierten Request- und Response-Messages, `request-error` entschied, ob ein fehlgeschlagener Request innerhalb seines Turns retried, und `turn-continuation` plus `turn-stop` komponierten konkurrierende Continuation-Entscheidungen.

Diese Events machten interne Phasen öffentlich, obwohl das durable Session-Log die entsprechenden Turn- und Step-Fakten bereits besaß. Sie mischten außerdem zwei Extensions-Modelle: Einige Listener beobachteten eine Grenze und gaben ein Agent-Command aus, während andere Control-Entscheidungen zurückgaben, die der Loop interpretierte. Die öffentliche Maschine zu verstehen erforderte daher, Event-Reihenfolge, Waterfall-Prezedenz und spezielle Terminal-Overrides gemeinsam zu rekonstruieren.

Agent-Lifetime, Whole-Agent-Aktivität, Inbox-Item-Fortschritt und Per-Turn-Settlement sind unabhängige State-Dimensionen. Sie als einen Status oder eine lineare Callback-Sequenz zu behandeln macht gewöhnliche Fragen mehrdeutig: Ein Agent kann über mehrere Turns `running` bleiben, ein akzeptiertes Item kann discarded werden, ohne einen Turn zu öffnen, und ein Turn kann settlen, während spätere Arbeit den Agent aktiv hält.

## Entscheidung

Der öffentliche Contract exponiert vier orthogonale State-Dimensionen:

- Registration-Lifetime ist das `agent/created`-bis-`agent/disposed`-Intervall. Disposal ist die terminale Registry-Kante, kein `AgentStatus`.
- Whole-Agent-Aktivität ist `AgentStatus = 'idle' | 'running'`. Aufeinanderfolgende Turns können ein `running`-Intervall teilen.
- Eine pending Message emittiert beim Insert `agent/inbox/inserted`, dann entweder `agent/inbox/claimed` nach einem atomaren Pure-Deletion-Claim oder `agent/inbox/discarded` nach einer gewöhnlichen Entfernung. `MessageId` korreliert die exakte Message; durable Splice-Koordinaten bewahren Placement und Cancellation. Inbox-Events beschreiben Insert, Claim und Discard statt Turn-Abschluss.
- Ein geclaimter Turn durchläuft Pre-Step-Entry und null oder mehr Request-Steps. Ein automatischer Retry schließt den fehlgeschlagenen Turn und öffnet sofort einen weiteren; `agent/settled` meldet nur den terminalen Turn in dieser Chain und bleibt vom Whole-Agent-Übergang zu `status === 'idle'` verschieden.

Der Loop behält vier Machine-Extension-Events. `agent/pre-step` entscheidet Reject oder Enter für einen exklusiven geclaimten Batch und läuft vor jedem vorgeschlagenen Step. `agent/request` ist der Waterfall für die gefrorene Call-Konfiguration; die Konfiguration kommt nur aus `await next()`, nicht aus einem doppelten Positionsargument. `agent/request-error` serialisiert das Ownership von awaited Model-Request-Recovery. `agent/turn-stopping` läuft, wenn der Turn sonst keine Arbeit mehr hat; ein Listener, der einen weiteren Step braucht, zeichnet echtes Steering mit `agent.steer()` auf, und der Loop entscheidet aus diesen Daten, nachdem alle Listener gesettlet sind.

Continuation und Termination sind Daten statt zurückgegebener Control-Enums. Tool-Calls und akzeptiertes Steering erfordern einen weiteren Step. Ein Tool-Result mit `concludesTurn` beendet den Tool-Loop an seinem Step. Der Loop exponiert keinen generischen `ContinuationDecision`- oder Terminal-Stop-Return-Channel.

Ein Model-Request-Fehler schließt seinen Step und betritt dann `agent/request-error` mit dem exakten Error, normalisiertem `LlmFailure` und dem live Turn-Signal. Ein Listener, der die Recovery besitzt, repariert den State, gibt `{ kind: 'retry' }` zurück und stoppt das Delegieren. Der Loop schließt den fehlgeschlagenen Turn und öffnet einen Retry-Turn über diesem State ohne dazwischenliegende Idle-Notification; Retry ist kein weiterer Step innerhalb des fehlgeschlagenen Turns. `agent/settled` meldet das terminale Outcome, und `agent/error` bleibt die Live-Error-Notification für Consumer, die Fehler unabhängig vom Turn-Settlement berichten. Die [Retry-Action-Entscheidung](2026-07-27-request-error-retry-action.md) supersedet den Command-förmigen Teil dieses Designs.

Die Event-Taxonomie entfernt die Legacy-Prompt-Preparation/Submission- und Serial-Step-Hooks zusammen mit `agent/post-step`, `agent/session-prefix`, `agent/step-result`, `agent/turn-continuation` und `agent/turn-stop`. Der einzelne `agent/pre-step`-Waterfall besitzt den Claimed-Message-Entry. Durable Turn- und Step-Grenzen bleiben Session-Events. Modellzugewandte Ergänzungen nutzen geloggte Message-Channels, Request-Konfiguration nutzt `agent/request`, Response-Content wird assembliert aufgezeichnet, Failed-Request-Recovery nutzt die `agent/request-error`-Return-Action, und End-of-Turn-Continuation nutzt `agent/turn-stopping` plus Steering.

## Erwogene Alternativen

**Die feingranulare Event-Sequenz behalten.** Dies bewahrt einen dedizierten Interception-Point für jede interne Phase, einschließlich Request-only-Prefixe, Assistant-Message-Rewriting, Post-Step-Arbeit, In-Turn-Request-Recovery und Terminal-Stop-Overrides. Es macht aber auch die private Sequenzierung des Loops zu einem permanenten öffentlichen Contract und lässt überlappende Extension-Points konfligierende Entscheidungen ausdrücken. Die Entscheidung akzeptiert die verlorenen Interception-Points im Tausch gegen eine Grenze pro unterstützter Extension-Verantwortlichkeit.

**Disposal als dritten `AgentStatus` darstellen.** Dies gibt gehaltenen Handles einen terminalen Status-Wert, dupliziert aber den Registry-Lifecycle, den `agent/disposed` bereits ausdrückt. Die Entscheidung hält `AgentStatus` bei Live-Aktivität und macht Registration-Lifetime zu einer separaten Dimension.

**Eine Retry-Entscheidung aus `agent/request-error` zurückgeben.** Diese Alternative wird von der [Retry-Action-Entscheidung](2026-07-27-request-error-retry-action.md) superseded, die das doppelte Command entfernt und die Entscheidung lokal beim Waterfall-Ergebnis hält.

**Durable Turn- und Step-Grenzen als Agent-Events spiegeln.** Dies gibt Live-Consumern einen zweiten Event-Stream für dieselben Fakten. Die Entscheidung hält das Session-Log als Source of Truth und exponiert nur Extension-Checkpoints oder Live-only-Fakten, die der durable Stream nicht tragen kann.

## Konsequenzen

Die beobachtbare Maschine ist kleiner und kompositional: Registration-Lifetime, Aktivität, Item-Fortschritt und terminales Settlement können unabhängig verfolgt werden. Insbesondere impliziert `agent/settled` nicht `agent.status === 'idle'`; es meldet den terminalen Turn einer Drain-Chain, während `agent/status` meldet, ob der ganze Agent aktiv ist.

Plugins können nicht mehr jede Phase des Loops umschreiben. Es gibt keinen Request-only-Message-Prefix, keine Assistant-Message-Transformation, keinen Post-Step-Checkpoint, kein generisches Continuation-Enum, kein generisches Terminal-Stop-Result und keinen In-Turn-Request-Retry. Extensions nutzen stattdessen die verbleibenden eigenen Channels, statt diese Phasen nachzubauen.

Continuation-Plugins publizieren durables Steering statt einen ungeloggten Grund zurückzugeben. Recovery-Plugins agieren nach dem fehlgeschlagenen Step und geben eine explizite Retry-Action zurück. Dies macht jeden Versuch zu einem vollständigen Turn, während asynchrone Reparatur und Policy-Ownership an einer schmalen Waterfall-Grenze bleiben.

Der Inbox-Lifecycle ergänzt das durable Session-Log statt es zu ersetzen. `MessageId` korreliert Acceptance mit Claim oder Discard; Turn- und Step-Nummern, Messages, Tool-Aktivität und terminale Gründe bleiben Session-Fakten.

## Verwandt

- [Unify agent delivery routing and coalesce injected context into user/message](../../archived/architecture/2026-07-22-unified-send-and-coalesced-user-messages.md)
- [Remove implicit batching from ordinary sends](2026-07-17-one-send-one-turn.de.md)
- [Microkernel event taxonomy](../architecture/2026-06-11-microkernel-event-taxonomy.md)
- [Bounded LLM request recovery](../architecture/2026-06-21-bounded-llm-request-recovery.md)
- [Reconstructable requests](../architecture/2026-07-05-reconstructable-requests.md)
