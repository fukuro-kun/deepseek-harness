# Agent Teams

[English](agent-team.md) | [中文](agent-team.zh.md) | Deutsch

Typen, die sich die experimentelle implizit-root Team-Domäne, Model-Tools und Host-Adapter teilen. Der [Agent-Teams-Agent-Note](../../.agents/notes/implemented/feature/2026-08-05-agent-teams.de.md) hält die Entscheidungen zu Identität, Mailbox, Tasks und gemeinsamem Checkout; diese Seite hält die buchstäblichen durable Formen aus [`packages/experimental/agent-team/src/types.ts`](../../packages/experimental/agent-team/src/types.ts) fest.

## Identität und Roster

`TeamId` ist die root `SessionId` unter einer eigenen [brand](core.de.md#branded-ids). `TeamTaskId` ist Team-lokal und wird monoton als `task-<n>` vergeben; `TeamMessageId` ist global zufällig. Die Session-id eines teammate bleibt seine persistente Identität, während `name` ein unveränderliches Modell-/UI-Label ist.

```ts type-equiv
/** Whole durable value written on every teammate lifecycle change. */
interface TeamMemberSnapshot {
  readonly id: SessionId
  readonly name: string
  readonly description: string
  readonly provider: string
  readonly context: 'fresh' | 'fork'
  readonly phase: TeamMemberPhase
  readonly error?: string
}
```

Jedes Mitglied beginnt in `provisioning` und erreicht genau eine terminale Roster-Phase, `active` oder `failed`. Der Laufzeitstatus `running`/`idle`/`inactive` wird separat abgeleitet und überschreibt diesen Datensatz nie.

## Durable Mailbox

Die Lead-Session speichert zuerst die vollständige queued message. Ein Zielempfang wird erst bestätigt, nachdem sein pending inbox-Eintrag oder seine aufgezeichnete user message durable ist; queued-minus-delivered bleibt dadurch die Recovery-Mailbox.

```ts type-equiv
/** One peer message retained until its target Session records it. */
interface TeamMessageSnapshot {
  readonly id: TeamMessageId
  readonly senderId: SessionId
  readonly senderName: string
  readonly targetId: SessionId
  readonly content: ContentBlock[]
}
```

Jede Nachricht versucht eine Steer-Zustellung. Ein laufendes Ziel empfängt sie an der nächsten Schrittgrenze, ein idle-Ziel startet eine Runde (turn), und ein inaktiver teammate macht einen cold-resume. Das Scheduling wird nicht im durable Datensatz gespeichert, weil Aufrufer keinen anderen Modus wählen können.

Die Ziel-Session bewahrt Nachrichtenidentität und Senderzuschreibung sowohl auf dem pending inbox-Eintrag als auch auf der späteren user message. Das Zusammenfalten dieser Quelle über Inbox und History hinweg ist der Deduplikationsschlüssel auf der Zielseite; das modell-sichtbare Framing wiederholt id und Sender.

```ts type-equiv
/** Source retained by the target Session for durable mailbox de-duplication. */
interface TeamMessageSource {
  readonly kind: 'team-message'
  readonly teamId: TeamId
  readonly messageId: TeamMessageId
  readonly senderId: SessionId
  readonly senderName: string
}
```

## Gemeinsamer Task-DAG

Jedes Task-Event speichert einen vollständigen Snapshot. `revision` ist der compare-and-set-Wert und erhöht sich pro Mutation um eins. `blockedBy`-Kanten müssen nicht gelöschte Tasks benennen und den Graph azyklisch halten. `writeScopes` sind normalisierte beratende Pfadpräfixe, keine Locks.

```ts type-equiv
/** Whole durable task snapshot; every mutation increments {@link revision}. */
interface TeamTaskSnapshot {
  readonly id: TeamTaskId
  readonly revision: number
  readonly subject: string
  readonly description: string
  readonly status: TeamTaskStatus
  readonly ownerId?: SessionId
  readonly blockedBy: TeamTaskId[]
  readonly writeScopes: string[]
}
```

`pending` ist unbegonnen oder freigegeben, `in_progress` trägt einen owner, `completed` erfüllt Blocker, und `deleted` ist ein aufbewahrter tombstone. Views ergänzen owner name, readiness und write-scope-Overlap-Warnungen, ohne den durable Snapshot zu verändern.

## Replay

`foldTeam()` replayt eine root Session zu dem Roster, dem Task-Board und der queued-minus-delivered-Mailbox, die jede Team-Operation liest. Es wählt Datensätze nach `TeamId` aus, sodass von einem gewöhnlichen fork vererbte Events die ancestor id behalten und nie in den Zustand der neuen root gelangen. Session-Event-`seq` und `time` bleiben die Ordnungs- und Zeitaufzeichnung; Team-Snapshots duplizieren sie nicht. Roster- und Task-Lesevorgänge erreichen Aufrufer als Views; pending mail bleibt intern für Zustellung und Recovery. Das Package-[README](../../packages/experimental/agent-team/README.de.md) hält Betrieb, Autorisierung, Recovery und Limit-Verhalten.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.de.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxagentteams--teamservice"></a>

### `ctx.agentTeams` — `TeamService`

Agent Teams service backed by the exact live Lead Session log.

```ts cordis-catalog
/**
 * Resolve one exact live Agent's Team role.
 * @param agent - exact live Agent used as the authority credential.
 * @returns its root, Team identity, role, and model-facing name.
 */
membership(agent: Agent): TeamMembership

/**
 * List the runtime-enriched roster visible to one Team member.
 * @param agent - exact live Team member.
 * @returns Lead and teammate rows in creation order.
 */
listMembers(agent: Agent): TeamMemberView[]

/**
 * Create one named, continuable direct child of the Team Lead.
 * @param caller - exact live Lead Agent.
 * @param request - immutable name, description, prompt, context mode, provider, and cancellation.
 * @returns the active roster row.
 */
async spawnTeammate(caller: Agent, request: SpawnTeammateRequest): Promise<SpawnTeammateResult>

/**
 * Queue one durable peer message, then attempt immediate delivery.
 * @param caller - exact live sending Team member.
 * @param request - target name, content, and pre-queue cancellation.
 * @returns durable message identity and immediate-delivery observation.
 */
async sendMessage(caller: Agent, request: SendTeamMessageRequest): Promise<SendTeamMessageResult>

/**
 * Create one unowned pending task in the Team Lead log.
 * @param caller - exact live Team member creating the task.
 * @param request - task text, blockers, and advisory write scopes.
 * @returns the revision-one task view.
 */
async createTask(caller: Agent, request: CreateTeamTaskRequest): Promise<TeamTaskView>

/**
 * Return one task, including a deleted tombstone.
 * @param caller - exact live Team member reading the task.
 * @param id - Team-local task identity.
 * @returns the latest task value and derived readiness diagnostics.
 */
getTask(caller: Agent, id: TeamTaskId): TeamTaskView

/**
 * List current non-deleted tasks in numeric creation order.
 * @param caller - exact live Team member reading the board.
 * @returns detached current task views.
 */
listTasks(caller: Agent): TeamTaskView[]

/**
 * Compare-and-set one authorized task transition.
 * @param caller - exact live Team member authorizing the mutation.
 * @param request - task identity, expected revision, action, and action fields.
 * @returns the committed next task revision.
 */
async updateTask(caller: Agent, request: UpdateTeamTaskRequest): Promise<TeamTaskView>

/**
 * Wait for the next Team-domain or member-status change.
 * @param caller - exact live Team member waiting for activity.
 * @param timeoutMs - bounded wait duration from ten seconds through one hour.
 * @param signal - caller cancellation for the wait only.
 * @returns one observed change or a timeout result.
 */
async waitForChange(caller: Agent, timeoutMs: number, signal: AbortSignal): Promise<TeamWaitResult>

/**
 * Interrupt one live teammate turn without clearing its pending inbox.
 * @param caller - exact live Lead Agent.
 * @param targetName - durable teammate name.
 * @returns the target status sampled before cancellation.
 */
interrupt(caller: Agent, targetName: string): { previousStatus: 'running' | 'idle' | 'inactive' }

/**
 * Resolve a caller without throwing, used by scoped-tool installation and observers.
 * @param agent - candidate exact live Agent.
 * @returns Team membership, or undefined for non-Team subagents and stale identities.
 */
tryMembership(agent: Agent): TeamMembership | undefined

/**
 * Read the current roster and non-deleted task board through the generated Remote API.
 * @param agent - exact live Team member used as the authority credential.
 * @returns detached current roster and task views.
 */
@Remote('view') remoteView(agent: Agent): TeamView

/**
 * Create one shared task through the generated Remote API.
 * @param agent - exact live Team member creating the task.
 * @param request - task text, blockers, and advisory write scopes.
 * @returns the revision-one task or a typed Team rejection.
 */
@Remote('createTask') remoteCreateTask(agent: Agent, request: CreateTeamTaskRequest): Promise<TeamTaskMutationResult>

/**
 * Apply one task mutation and preserve Team rejections as business results.
 * @param agent - exact live Team member authorizing the mutation.
 * @param request - task identity, expected revision, action, and action fields.
 * @returns the committed task or a typed Team rejection.
 */
@Remote('updateTask') remoteUpdateTask(agent: Agent, request: UpdateTeamTaskRequest): Promise<TeamTaskMutationResult>
```

Types: [Agent](core.de.md)

Source: [`packages/experimental/agent-team/src/index.ts`](../../packages/experimental/agent-team/src/index.ts)
<!-- END GENERATED cordis-surface -->
