# Agent Note: Inbox-input vor einer einzigen pre-step-Entscheidung claimen

Status: implemented

[English](2026-07-31-claimed-pre-step-inbox-lifecycle.md) | [中文](2026-07-31-claimed-pre-step-inbox-lifecycle.zh.md) | Deutsch

## Problem

Der loop teilte früher eine step-Grenze über prompt-preparation, prompt-admission und einen seriellen step-hook auf. Geclaimter input konnte durch ein admission-Ergebnis behalten oder verworfen werden, und live-queue-events trugen shapes, die durable inbox-state duplizierten. Plugins mussten wählen, ob sie die inbox mutieren, einen eingereichten batch umschreiben oder direkt an session-Historie anhängen, während observer sich nicht auf eine exakte Reihenfolge verlassen konnten.

Occurrence-lokale inbox-wrapper duplizierten auch die identity, die jede `UserMessage` bereits trug. Sie machten insertion, editing, claiming, cancellation, reconnect-Projektion und step-entry zu einem kombinierten Protokoll, obwohl die append-only-session bereits die durable queue-Projektion besaß.

## Entscheidung

Vor jedem vorgeschlagenen step claimt das package-interne `ReactLoopInbox` des loops atomar den kompletten batch: alle `next-step`-messages und an einer turn-Grenze eine `next-turn`-message. An der initialen Grenze committet der loop zuerst `turn/start`, sodass der claim und seine einzige `agent/pre-step`-Entscheidung durable turn-ownership haben. Claiming zeichnet normalisierte `agent/inbox/spliced`-pure-deletions ohne outcome auf, emittiert `agent/inbox/claimed { message, turn }` einmal pro geclaimter message und gibt den exklusiven batch für die waterfall des loops mit `{ turn, step, signal }` zurück.

`PreStepDecision` ist `{ kind: 'reject' } | { kind: 'enter'; messages: UserMessage[] }`. Reject eröffnet keinen step, lässt den geclaimten batch entfernt und schließt den turn als blocked ohne step-events. Leere entry, cancellation und failure vor `step/start` schließen ebenfalls einen balancierten no-step-turn. Enter liefert den kompletten batch, der nach `step/start` als `user/message`-events angehängt wird. Ein listener, der `next()` wrappt, bewahrt downstream-Änderungen, es sei denn, er ersetzt sie absichtlich, sodass alle message-rewrites einmal im finalen Rückgabewert settle-n. Es gibt keinen `agent/prompt-prepare`-, `agent/prompt-submit`- oder `agent/step`-extension-point.

Die durable inbox bleibt zwei `UserMessage[]`-Listen, adressiert über `MessageId`. `append`, `prepend` und `splice` nehmen ein target, während `replace(messageId, newMessage)` und `remove(messageId)` die pending message über beide Listen lokalisieren, bevor sie einen normalisierten splice committen. Replacement darf identity ändern und emittiert die alte message als discarded gefolgt von der neuen message als inserted. Jede insertion emittiert `agent/inbox/inserted { message }`; eine gewöhnliche removal zeichnet `outcome: 'canceled'` auf und emittiert `agent/inbox/discarded { message }`. Claiming zeichnet pure deletions ohne outcome auf und emittiert claimed-events aus `ReactLoopInbox`. Diese live-events fügen keine placement-, outcome- oder batch-Felder hinzu.

`Agent.inbox` exponiert nur das strukturelle `Inbox`-interface zum Lesen und Mutieren von pending work; loop-only-`hasPending`- und claim-Operationen fehlen auf diesem öffentlichen Gesicht. dsh-agent-loop konstruiert ein `ReactLoopInbox` und verwendet es sowohl für strukturelle Kommandos als auch für driver-Operationen. Der konkrete Konstruktor erhält `SessionProjectionRegistry` direkt statt des breiteren Cordis-`Context` und registriert die standard-definition auf dem agent-scope vor seinem ersten read. `AgentLoop` erfordert den registry-service bei Aktivierung, und die registry zählt Referenzen auf die definition über live agent-scopes hinweg.

Die zwei event-surfaces haben getrennte consumer. Observer, die einer message folgen, verwenden `agent/inbox/inserted`, `claimed` und `discarded`. Jedes `ReactLoopInbox` trägt von seinem agent-scope die standard-`inbox`-Projektion über den durable `agent/inbox/spliced`-stream bei; UI-edits und -removals laufen über eine Inbox-mutationsmethode, sodass dieselbe Projektion jede Änderung aufzeichnet. Wenn diese Projektion durable Historie rekonstruiert, lehnt sie unsichere oder out-of-range-Koordinaten und duplizierte `MessageId`-Werte über beide Listen ab und meldet den seq des verletzenden events. Whole-queue-control-consumer verwenden den Projektions-Änderungsfeed: der Session-controller publiziert den Projektions-frame und leitet dann die queue-Ersetzung aus demselben post-fold-inbox-Wert ab.

Plugins, die current-step-atomares rewriting brauchen, geben messages von `agent/pre-step` zurück. Plugins, die nur späteren context brauchen, dürfen `agent.inbox` direkt mutieren. Workspace-context verwendet beide Pfade: asynchrone filesystem-Projektionen stagen ein ersetzbares `next-step`-item, während der nächste eintretende pre-step dieses item oder eine neu komponierte baseline in seinen finalen batch faltet und die pending Kopie entfernt. Rejection hält das item gequeuet.

Die archivierte [addressable-queue-occurrence-Entscheidung](../../archived/feature/2026-07-29-addressable-queue-operations.md) beschreibt das ersetzte occurrence-wrapper-Design. `MessageId` besitzt Adressierbarkeit, während `ReactLoopInbox` `inbox` als die standard-session-Projektion über durable splices beiträgt. Der generische Projektions-träger bedient diese Faltung für live-updates, history-tail-reconnect-baselines und kalte process-restart-recovery ohne ein live Agent-mirror.

## In Betracht gezogene Alternativen

**Getrennte prepare- und admit-hooks behalten.** Dies lässt preparation die inbox vor dem claimen mutieren und admission danach umschreiben, schafft aber zwei Ordnungsflächen für eine Grenze und macht cancellation-ownership ambig.

**Rejection den geclaimten batch requeuen lassen.** Dies bewahrt retry-artiges Verhalten, verwandelt aber ein veto in versteckte queue-Mutation, dupliziert spätere Arbeit, es sei denn, jede race ist eingezäunt, und verhindert, dass claim ein atomarer ownership-Transfer ist.

**Placement und outcome auf jedes live-event legen.** Durable splices besitzen diese facts bereits. Ihre Wiederholung auf live-Benachrichtigungen schafft einen zweiten contract, der driften kann und für consumer unnötig ist, die die exakte message-identity halten.

## Verifikation

Agent-loop-Abdeckung pinnt die turn-start-vor-claim-vor-pre-step-Reihenfolge, exakte live-event-payloads, balancierte no-step-rejection, final-batch-rewriting, nach einem claim eingefügten input, listener-failure, cancellation und agent-scope-Projektionsentfernung, nachdem der letzte owner entlädt. Inbox- und consumer-Tests pinnen pure claim-deletions, canceled gewöhnliche removals, agent-instructions-staging, replacement und same-step-entry, plan/goal/hook-Verhalten, UI-cleanup, compaction, checkpointing, resumed durable Projektion, Ablehnung ungültiger persistierter Koordinaten oder cross-list-identities und post-fold-queue-Ersetzung, wenn der controller vor der Projektions-registry registriert. Consumer-domain-Tests verwenden einen process-local-Inbox-stub nur, wenn durability außerhalb des Testsubjekts liegt; claiming-, durable-Projektions-, recovery-, Validierungs- und live-notification-Tests erzeugen Agents über die Produktions-AgentLoop-test-harness, sodass test-support die Projektion nie neu implementiert. Generierte event- und type-catalogs exponieren nur die neue waterfall und payloads.

## Konsequenzen

Der loop hat eine awaited Entscheidung vor jedem step und einen ownership-Transfer für seinen input. Geclaimte messages kehren nie implizit in die inbox zurück; spätere insertions bleiben unabhängig. Live-events sind symmetrisch mit anderen inbox-Benachrichtigungen, ohne durable metadaten zu spiegeln, und plugins können explizit zwischen exaktem current-step-rewriting und gewöhnlicher späterer inbox-Zustellung wählen.
