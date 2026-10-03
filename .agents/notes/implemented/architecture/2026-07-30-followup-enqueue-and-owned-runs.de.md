# Agent Note: Follow-up-enqueue und owned-run-Grenzen

Status: implemented

[English](2026-07-30-followup-enqueue-and-owned-runs.md) | [中文](2026-07-30-followup-enqueue-and-owned-runs.zh.md) | Deutsch

## Problem

`Agent.followup()` identifiziert und queuet eine user-message, aber ein follow-up besitzt nicht die Aktivität, die ihm folgt. Steering, injizierter context, tool-Fortsetzungen, recovery und später gequeuete messages können alle beitragen, bevor der agent das nächste Mal idle wird. Ein `MessageId` kann daher inbox-admission beweisen, aber nicht identifizieren, welche assistant-message oder `turn/end` das Ergebnis dieses inputs ist.

Die [one-send-one-turn-Entscheidung](../simplification/2026-07-17-one-send-one-turn.de.md) lehnt bereits einen per-send-completion-handle in der core-API ab. Protocol- und SDK-Layer, die eine prompt-Anfrage mit einem turn-Ergebnis paaren, stellen diese fehlende Beziehung downstream her. Die Paarung wird ambig, sobald Aktivität weiteren input zulässt, und sie exponiert turn-Mechanik, als wäre sie ein prompt-Level-Ergebnis.

## Entscheidung

`Agent.followup(message): void` bleibt eine reine enqueue-Operation. `Agent.whenIdle()` und `agent/status` bleiben whole-agent-lifecycle-Beobachtungen; keines settle-t eine einzelne message. Inbox-durability zeichnet die identifizierte message und ihre admission oder cancellation auf, ohne ihr späteren output zuzuweisen.

Das low-level-SDK-Protokoll beantwortet `session/prompt`, sobald enqueue gelingt, mit `{ messageId }`. Es streamt durable facts über `session.event`, publiziert whole-agent-Übergänge über `session.status` und hat kein `session.finished`. Ein low-level-client darf receipt und spätere idleness beobachten, erhält aber kein prompt-Ergebnis.

High-level-automation-APIs geben ein `RunResult` nur zurück, wenn sie explizit ein Aktivitätsintervall besitzen. Die `run()`-Methoden des TypeScript- und Python-SDK sammeln vom durable inbox-receipt der eingereichten message bis zum nächsten whole-agent-`idle`; ihre finale response ist die letzte committete assistant-message in diesem Intervall, keine response, die dem eingereichten prompt kausal zugeschrieben wird. Das Python-SDK meldet außerdem den reason-kind des letzten root-turns als run-Level-[`finish_reason`](../../archived/bug-fix/2026-08-11-owned-run-finish-reason.md), ohne ihn dem eingereichten prompt zuzuschreiben. Die one-shot-CLI besitzt das analoge idle-to-idle-Intervall. Ein isolierter child-agent-run darf ein Ergebnis melden, weil sein caller den kompletten child-lifecycle besitzt und jegliches steering zu diesem run gehört.

ACP muss ein Protokoll-`stopReason` zurückgeben. Seine bridge serialisiert einen in-flight-prompt pro ACP-session und besitzt das Intervall von admission über whole-agent-idle bis zur geordneten update-Zustellung. Es korreliert den turn, der die identifizierte ACP-message admittet, ohne zu behaupten, dass jede Aktivität im Intervall nur von dieser message verursacht wurde. Ein korreliertes token-limit-Ende mappt auf standard `max_tokens`; ein korrelierter model-Fehler rejected an derselben quiescence-Grenze; ein turnloser slot settled als `cancelled` neben expliziter ACP-cancellation oder disposal. Andere normale quiescence meldet `end_turn`.

Goal-continuation behält `MessageId` nur, um seine durable gequeuete und admittete goal-message zu erkennen. Es rückt vom durable goal-state bei whole-agent-idle vor, ohne die message auf ein turn-Ergebnis zu mappen.

## In Betracht gezogene Alternativen

**`MessageId` auf den turn mappen, der sie admittet.** Ein turn kann steering und injizierten context konsumieren und über mehrere model/tool-steps weiterlaufen. Das Mapping identifiziert admission, nicht kausale ownership des resultierenden outputs oder stop-Grunds.

**Einen per-follow-up-completion-handle zurückgeben.** Ein handle würde eine Ergebnisgrenze implizieren, die der geteilte agent-lifecycle nicht hat. Er würde entweder Arbeit auslassen, die die Aktivität beeinflusste, oder unrelated späteren input still absorbieren.

**Das letzte vor idle beobachtete `turn/end` verwenden.** Dies ist eine nützliche run-Level-Beobachtung für ein explizit besessenes Intervall, aber es als Ergebnis der eingereichten message zu benennen, reproduziert die falsche Kausalbehauptung.

## Verifikation

- Agent- und inbox-Tests pinnen enqueue-only-follow-up, durable admission oder cancellation und whole-agent-idle-Beobachtung.
- SDK-protocol-, TypeScript-SDK- und Python-SDK-Tests pinnen den `{ messageId }`-receipt, `session.status`, die Abwesenheit von `session.finished` und die receipt-to-idle-`RunResult`-Sammlung ohne prompt-Level-`status` oder `reason`; Python-SDK-Tests pinnen separat ihre run-Level-`finish_reason`-Beobachtung.
- ACP-, one-shot-CLI-, goal-continuation- und subagent-Tests pinnen die unterschiedliche Aktivitäts-ownership, die jede Integration besitzt.
- Consumer-Tests pinnen, dass keine Produktions-Integration ein follow-up-Ergebnis durch Korrelation von `MessageId` mit `turn/end` ableitet.

## Konsequenzen

Ein owned activity-Intervall kann steering, injizierten context oder andere vor idleness eingereichte Arbeit enthalten, daher sind seine finale response, finish reason und events bewusst breiter als die initiierende message. Prompt-Level-model-error- und token-limit-Klassifikationen bleiben im low-level-DSH-SDK-Ergebnis abwesend. ACP projiziert den korrelierten turn in seinen erforderlichen standard-error oder `max_tokens`-stop-reason bei Intervall-quiescence, ohne ein DSH-spezifisches Ergebnis hinzuzufügen oder exklusive Kausalität zu behaupten. Nebenläufige Automatisierung auf einer session erfordert eine explizite Serialisierungs- oder ownership-policy statt eines impliziten per-follow-up-Ergebnisses.
