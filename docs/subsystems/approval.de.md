# User Approval
[English](approval.md) | [中文](approval.zh.md) | Deutsch


Der User-Approval-seam von [dsh-user-approval](../../packages/interaction/user-approval) beantwortet eine Frage: Darf diese konkrete Aktion fortfahren? Er besitzt das geteilte Request/Outcome-Vokabular, den `ctx.approval`-Dispatch-Service, den `approval/request`-Answerer-waterfall, das nur geloggte Audit-Paar und die per-session `ask`/`never`-Policy. UI-Channels können menschliche Answerer bereitstellen; die [ACP-Automation-Bridge](../../packages/acp/acp) liefert One-shot-Maschinenentscheidungen für ihre eigenen Agents. Caller wie [dsh-tools](../../packages/core/tools) und [dsh-tool-bash](../../packages/shell/tool-bash) konsumieren das geschlossene Outcome und schlagen fehl-closed fehl, sofern es nicht `allowed-once` ist.

Quelle: [`packages/interaction/user-approval/src/index.ts`](../../packages/interaction/user-approval/src/index.ts)

## Identität und Outcome

Jeder Request erhält eine frische `ApprovalRequestId`. Das Brand paart die Audit-Events `approval/asked` und `approval/decided`, ohne Approval-Ids mit Tool-Call- oder Agent/Session-Ids austauschbar zu machen.

```ts type-equiv
/**
 * Pairs one `approval/asked` audit event with its `approval/decided`.
 * Service-issued (one fresh id per {@link ApprovalService.request} call).
 */
type ApprovalRequestId = Branded<'ApprovalRequestId'>
```

`ApprovalOutcome` ist geschlossen und fail-closed. `allowed-once` gewährt nur die angefragte Aktion; Caller verweigern bei `rejected`, `cancelled` und `unavailable`. Ein fehlender, nicht zuständiger, throwender oder nicht konformer Answerer wird zu `unavailable`, statt das Gate zu öffnen.

```ts type-equiv
/**
 * Closed approval outcomes: a one-shot grant, explicit rejection, withdrawn
 * request, or unavailable answerer. Callers fail closed on `unavailable`.
 */
type ApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'
```

## Per-Session-Policy

`ApprovalPolicy` bestimmt, was vor dem Lauf interaktiver Answerer geschieht. `ask` delegiert an die komponierte Answerer-Kette, deren No-answer-Default `unavailable` ist; `never` gibt deterministisch `rejected` zurück, ohne irgendeinen Answerer zu dispatchen. Der effektive Wert ist das letzte `approval/policy`-Event im Session-Log mit Fallback auf die Service-Config. Consumer lesen ihn mit `ctx.approval.effectivePolicy(session)`; `setApprovalPolicy(session, policy)` ist der einzige Schreibpfad, sodass Replay den Override rekonstruiert.

```ts type-equiv
/**
 * A session's approval policy — what happens to an {@link ApprovalService}
 * ask BEFORE any interactive answerer sees it:
 *
 * - `'ask'` (the default) — delegate to the composed answerers; with none
 *   composed the chain falls through to the fail-closed `'unavailable'`.
 * - `'never'` — never prompt anyone: every ask resolves `'rejected'`
 *   deterministically. The strict headless stance (CI, unattended runs) and
 *   the policy whose outcome is knowable without asking.
 */
type ApprovalPolicy = 'ask' | 'never'
```

Beide Policies tragen ihre vollständige aktuelle Bedeutung zum cache-sicheren Runtime-Context-Snapshot bei. Das gesourcte `user/message` ist der durable modellsichtbare Input; eine Änderung des Approval-State hängt einen neuen vollständigen Snapshot nach der behaltenen Historie an, ohne die `system/message`-Nodes anzufassen, die den gerenderten System-Prompt halten.

## Approval-Request

`ApprovalRequest` identifiziert Agent und Tool-Aktion genau genug, um die Frage zu routen und zu auditieren. Es lässt Tool-Argumente bewusst weg: Ein Answerer hängt den Prompt über `callId` an den bereits gestreamten Tool-Call, statt eine zweite Kopie zu rendern, die driften könnte.

```ts type-equiv
/**
 * Readonly same-process permission question. `callId` links to an already
 * presented tool call, so arguments are not duplicated here.
 */
interface ApprovalRequest extends ApprovalRequestEvent {
  /**
   * The agent on whose behalf the question is asked. Routes the question (a
   * UI answerer only answers for agents it owns) and receives the audit
   * events on its session log.
   */
  readonly agent: Agent
  /** The tool the question is about (presentation and audit). */
  readonly toolName: string
  /**
   * The exact tool call being decided, when the asker has one — lets a UI
   * attach the prompt to the tool call it already streamed.
   */
  readonly callId?: ToolCallId
  /** The asker's human-readable explanation of WHY it is asking. */
  readonly reason?: string
  /**
   * Aborting withdraws the question: the request settles `'cancelled'`
   * immediately and a late answer from a still-pending answerer is discarded.
   */
  readonly signal?: AbortSignal
}
```

## Dispatch und Audit

`ctx.approval.request(req)` erfordert, dass die anfragende Session sich in einem offenen Turn befindet. Es hängt `approval/asked` an, erhält ein Outcome, hängt das passende `approval/decided` an und resolved mit diesem Outcome. Die `never`-Policy wird im Service vor dem waterfall-Dispatch durchgesetzt, sodass selbst ein später mit `prepend` registrierter Answerer sie nicht umgehen kann. Answerer geben ein Outcome zurück, wenn ihnen der Request gehört, oder rufen `next()` zur Delegation; die erste Antwort belegt den einzigen Entscheidungs-Slot.

Die Audit-Events sind nur Log und gehen nicht in das Modell-Transcript ein. Modellsichtbares Verhalten ist das abgeleitete Tool-Result des Callers plus der aktuelle Runtime-Context-Snapshot. Das Disposen des Services entfernt seinen Context-Beitrag; Answerer-Listener sind unabhängig per Effect an ihre besitzenden Plugins gebunden.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.de.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxapproval--approvalservice"></a>

### `ctx.approval` — `ApprovalService`

Approval service that applies session policy before answerers and logs every ask/outcome pair to the requesting session. It exposes deterministic policy changes to the model through the runtime-context snapshot and switch notices.

```ts cordis-catalog
/**
 * Switch one live agent's policy and queue the transition for its next model
 * step. Session initialization uses {@link setApprovalPolicy} directly
 * because there is no previously visible policy to change.
 * @param agent - the live agent whose policy is changing.
 * @param policy - the new effective policy.
 */
setPolicy(agent: Agent, policy: ApprovalPolicy): void

/**
 * Ask the composed answerers to decide one readonly same-process request.
 * The service borrows the request, agent, session, and live signal directly.
 * The request requires an open turn because the audit pair must be enclosed
 * by the durable log's commit/replay boundary; an idle ask rejects before
 * appending anything. The answerer phase always produces an outcome: an
 * aborted signal yields `'cancelled'`, a missing or throwing answerer yields
 * `'unavailable'` (fail closed), and a rogue non-vocabulary return value is
 * normalized to `'unavailable'`. A failure that prevents either audit append
 * from committing still rejects because returning an unlogged decision would
 * violate the pair. Session contains post-commit observer failures, so an
 * authoritative append cannot reject the request or suppress its matching
 * audit event.
 * @param req - the pending decision (agent, tool identity, reason, signal).
 * @returns the closed outcome; `'allowed-once'` is the only grant.
 * @throws when no turn is open or either audit event fails before the session
 *   append commit point.
 */
async request(req: ApprovalRequest): Promise<ApprovalOutcome>

/**
 * Read the session override without applying the configured default.
 * @param session - session whose log supplies the override.
 * @returns the last logged policy, or `undefined` without one.
 */
overrideOf(session: Session): ApprovalPolicy | undefined
```

Types: [Agent](core.de.md) · [Session](session.de.md)

Source: [`packages/interaction/user-approval/src/index.ts`](../../packages/interaction/user-approval/src/index.ts)

<a id="approval-events"></a>

### `approval/*` events

<a id="approvalrequest--waterfall"></a>

#### `approval/request` — waterfall

Ask composed answerers for one decision. Return an outcome to claim the request or call `next()` to delegate. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.

```ts cordis-catalog
/**
 * Ask composed answerers for one decision. Return an outcome to claim the
 * request or call `next()` to delegate. Scope-filtered dispatch
 * (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @param req - pending approval request.
 * @mode waterfall
 */
'approval/request'( this: Scoped<Agent>, req: ApprovalRequestEvent, next: () => Promise<ApprovalOutcome>, ): Promise<ApprovalOutcome>
```

Types: [Agent](core.de.md) · [Scoped](scope.de.md)

Source: [`packages/interaction/user-approval/src/types.ts`](../../packages/interaction/user-approval/src/types.ts)
<!-- END GENERATED cordis-surface -->
