# Workflow

[English](workflow.md) | [中文](workflow.zh.md) | Deutsch

Das Workflow-Seam erlaubt einem Agent, ein vom Modell geschriebenes Orchestrierungs-SKRIPT auszuführen, das Subagents startet. Wie [subagent](subagent.de.md) ist es **eine optionale Capability**, nicht Teil des Agent-Loops, daher leben seine Typen und Operationen hier und nicht in [core.md](core.de.md). Wie bash erlaubt es EINE Engine-Implementierung pro Kontext, die `ctx.workflowEngine` bereitstellt; es gibt keine Named-Provider-Registry (eine zweite Engine ersetzt die erste über die Plugin-Konfiguration, statt neben ihr zu laufen).

Service Definition: [dsh-workflow](../../packages/workflow/workflow) (`ctx.workflowEngine` + das Vokabular unten). Der Service Provider ist [dsh-workflow-worker-thread](../../packages/workflow/workflow-worker-thread) (eine `node:worker_threads`-Engine — ein Worker pro Run, der vm-Kontext des Skripts darin); der modellseitige Consumer ist [dsh-tool-workflow](../../packages/workflow/tool-workflow). Vorschlag und Rationale: [der Dynamic-Workflows Agent Note](../../.agents/notes/implemented/feature/2026-07-05-dynamic-workflows.de.md).

Quellen: Browser-sicheres Vokabular in [`packages/workflow/workflow/src/types.ts`](../../packages/workflow/workflow/src/types.ts), Host-Request- und Live-Run-Handles in [`runtime-types.ts`](../../packages/workflow/workflow/src/runtime-types.ts).

## Die Start-Request

Was ein Aufrufer beim Starten eines Runs anfordert. Das normale Workflow-Tool baut sie aus dem `{ script, meta, args }`-Call des Modells plus dem aufrufenden Agent; spezialisierte Consumer können außerdem einen engine-weiten `subagentProvider` wählen und `maxTotalAgents` für den Run senken, aber das Skript kann keine dieser beiden Policies beobachten oder ersetzen. `meta` und `args` sind reine JSON-DATEN (die Engine validiert `meta` gegen ihr Schema und lehnt laut ab, BEVOR irgendetwas läuft — zu ihrer Gewinnung wird niemals Skripttext evaluiert). `parent` ist PFLICHT — jedes Child, das das Skript startet, wird ihm zugeordnet, und cwd, Lineage und Tiefe laufen durch das [Subagent-Seam](subagent.de.md).

```ts type-equiv
/**
 * What a caller asks for when starting a workflow run. `meta` and `args` are
 * plain JSON data by the seam contract. `parent` is required because every
 * `agent()` spawned by the script is attributed to that live Agent.
 */
interface WorkflowStartRequest {
  /** The plain-JS script body (top-level await allowed; ends with `return <json-value>`). */
  script: string
  /** The workflow's identity block, as plain JSON data (shape-validated by the engine). */
  meta: WorkflowMeta
  /** Optional input exposed verbatim to the script as the `args` global. */
  args?: unknown
  /** Optional engine-wide child-provider override for this run. */
  subagentProvider?: string
  /** Optional per-run total-child ceiling. */
  maxTotalAgents?: number
  /** The agent on whose behalf the run executes (parent of every child). */
  parent: Agent
  /** Cancels the run when aborted. */
  signal?: AbortSignal
}
```

## Die Identität des Workflows: `WorkflowMeta`

Der Identity-Block, der als Daten auf der Start-Request mitgeführt wird (der `meta`-Parameter des Tools; das Feldvokabular entspricht dem Meta-Block der Claude-Code-Dynamic-Workflows). `phases` ist reines Fortschrittsvokabular: `phase()`-Calls matchen Titel für Observer; es wird keine Ausführungsstruktur impliziert.

```ts type-equiv
/**
 * The script's identity block, provided as plain JSON data alongside the
 * script body (the model-facing tool carries it as its `meta` parameter) and
 * validated by the engine before the body runs. `name`/`description` are
 * required; the rest is optional annotation. The field vocabulary matches the
 * Claude Code dynamic-workflows meta block.
 */
interface WorkflowMeta {
  /** Short kebab-case workflow name (display + persistence key). */
  name: string
  /** One-line description of what the workflow does. */
  description: string
  /** Optional guidance on when this workflow applies (shown in listings). */
  whenToUse?: string
  /** Optional phase declarations matched by `phase()` calls. */
  phases?: WorkflowPhase[]
}
```

## Das Endresultat: `WorkflowResult`

Das Ergebnis eines Runs, aufgelöst durch `WorkflowRun.result`. `value` ist der materialisierte Rückgabewert des Skripts — reine Host-Realm-JSON-Daten (`null`, wenn das Skript nichts zurückgab) — nur für `completed` bedeutungsvoll. `stopReason` ist eine GESCHLOSSENE Union (engine-eigen; Consumer dürfen sie erschöpfend behandeln): `completed` | `cancelled` | `error`. Ein nicht-`completed` Reason trägt den Fehler in `error`, und der Consumer bildet ihn auf ein `isError`-Tool-Result ab, statt partielle Ausgabe als Erfolg zu melden.

```ts type-equiv
/**
 * The outcome resolved by a live workflow run. `value` is
 * the script's materialized return value (plain host-realm JSON data; `null`
 * when the script returned `undefined`) — meaningful only for `completed`.
 * A non-`completed` reason carries the failure in `error`; the consumer maps
 * it to an `isError` tool result rather than reporting partial output.
 */
interface WorkflowResult {
  /** The script's return value (host JSON data; `null` for no return). */
  value: unknown
  /** Why the run settled. */
  stopReason: WorkflowStopReason
  /** The failure message (present iff `stopReason` is not `completed`). */
  error?: string
  /**
   * How many `agent()` calls the run accepted over its whole lifetime. On a
   * graceful settlement this is the script-side count (calls still queued for
   * a concurrency slot included); on a termination path (grace force-settle,
   * worker death) it degrades to the host-observed count — calls queued
   * inside a terminated script are unknowable then.
   */
  agentsStarted: number
}
```

## Ein Live-Run: `WorkflowRun`

Das Handle, das der Consumer hält, während ein Skript ausgeführt wird. Der Consumer awaited `result`, darf mid-flight `cancel` aufrufen und MUSS auf jedem Pfad `dispose` aufrufen. `result` rejected NICHT — ein Skriptfehler resolved mit `stopReason: 'error'` — und sobald der Run gecancelt ist, SETTELT er innerhalb der begrenzten Grace der Engine, selbst wenn das Skript selbst nie settelt (die Engine force-settelt `cancelled`; die Worker-Thread-Engine terminiert dann den Worker des Skripts), sodass ein auf `result` wartender Consumer nach einer Cancellation nie hängt. `dispose()` = Cancel + dieses begrenzte Settle + Child-Quiescence; es hängt nie an einem festsitzenden Skript.

```ts type-equiv
/**
 * Holder-owned live workflow. `result` never rejects; consumers may cancel
 * and must call idempotent `dispose()` to await script and child quiescence.
 */
interface WorkflowRun {
  readonly id: WorkflowRunId
  /** The validated meta block available before the script body runs. */
  readonly meta: WorkflowMeta
  readonly result: Promise<WorkflowResult>
  /** Cancel the run and its children. */
  cancel(reason?: string): void
  /** Cancel if needed and await bounded settlement and cleanup. */
  dispose(): Promise<void>
}
```

## Fehlerdisziplin: `WorkflowError.fatal`

Hook-Missbrauch innerhalb eines Skripts — falsche Argumente, unbekannte/deferred `agent()`-Optionen, ein Schema außerhalb der [Structured-Output-Teilmenge](../../packages/core/tools/README.de.md), ein überschrittenes Cap, ein Seam-Startfehler, Cancellation — wirft einen `WorkflowError` mit `fatal: true`. Die `parallel()`/`pipeline()`-Kombinatoren werfen fatale Fehler ERNEUT, statt das Item auf `null` abzubilden: eine falsch geschriebene Option muss das Skript laut töten, darf nie in etwas zerfließen, das wie ein gewöhnlicher Child-Fehler aussieht. Das Per-Item-`null` ist Child-Run-Fehlern (einem nicht-`completed` Stop-Reason) und gewöhnlichen Skriptfehlern innerhalb einer Stage vorbehalten.

## Events

Die `workflow/*`-Events (`workflow/start`, `workflow/phase`, `workflow/log`, `workflow/agent-start`, `workflow/agent-end`, `workflow/end` — siehe den [Events-Katalog](#cordis-surface)) sind **nur beobachtende** Emits, die DATEN-SNAPSHOTS tragen: Jedes Payload beginnt mit `WorkflowRunInfo` (id + meta), niemals dem Live-`WorkflowRun`, sodass ein Subscriber kein `cancel`/`dispose` erlangen kann, und `workflow/end` lässt den Result-Wert bewusst weg (ein Listener, der Ergebnisse beobachtet, darf kein mutierbares Alias auf das Result des Aufrufers erhalten). Jeder Emit ist pro Listener eingedämmt — ein werfender Subscriber wird geloggt, nie propagiert, und kann die danach registrierten Listener nicht aushungern — und jeder Listener erhält seinen eigenen Payload-Klon, sodass seine Mutation weder die Engine noch andere Listener beschädigt; die Eindämmung spiegelt `subagent/start`/`subagent/end`.

## Dauerhafte Chat-Records

Der Top-Level-`dsh-tool-workflow`-Consumer projiziert Anzeigefakten in die aufrufende Parent-Session, ohne die Ausführungs-Ownership zu ändern. Er schreibt `tool-workflow/run-start`, nachdem ein Run akzeptiert wurde, paart Member-Start und -Ende über `runId + seq` und schreibt `tool-workflow/run-end` erst, nachdem das Result bekannt ist und das Dispose die Quiescence erreicht. Verschachtelte Transport-Calls schreiben keinen Record. Der erste Append-Fehler deaktiviert weitere Writes für diesen Run, sodass das Log leer bleibt oder ein legaler kontinuierlicher Präfix, und das Tool-Result bleibt unverändert.

`dsh-tool-workflow/invariant` validiert dasselbe Protokoll vor dem Live-Commit und beim Laden einer Session: ein Start pro Run, positive eindeutige Member-Sequenzen, gepaarte Member-Enden, kein Run-Ende mit offenen Membern und keine Updates nach dem Run-Ende. Ein fehlendes Member-Ende oder Run-Ende am Log-Ende ist valides Unterbrechungs-Evidence, keine Korruption.

`dsh-client-ui-workflow-run` faltet die vier Events über die Conversation-Node-Engine zu einem `workflow-run`-Chat-Node, verankert an der Run-Start-Sequenz, hinter dem ursprünglichen Workflow-Tool-Node. Phasengruppen entstehen nur aus tatsächlichen Member-Starts und bewahren exakte Strings, einschließlich des Unterschieds zwischen einer ausgelassenen Phase und `''`. Geschlossene Locations verwandeln fehlende terminale Fakten in eine unterbrochene Darstellung. Das [UI-Paket-README](../../packages/client/ui-workflow-run/README.de.md) besitzt Disclosure-, Status- und Same-Parent-Local-Navigation-Verhalten.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.de.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxworkflowengine--workflowengine-abstract-seam"></a>

### `ctx.workflowEngine` — `WorkflowEngine` (abstract seam)

Workflow Service Definition contract. Invalid requests throw before publication; a live run is holder-owned, its result never rejects, cancellation and disposal are bounded, and disposal waits for child cleanup within that bound. Lifecycle listener failures are contained, and `workflow/end` fires exactly once as the result settles.

```ts cordis-catalog
/**
 * Parse and execute a workflow script.
 * @param request - the script, its `args`, the parent agent, and an
 *   optional cancel signal.
 * @returns the live run; its `result` resolves when the script settles.
 */
abstract start(request: WorkflowStartRequest): WorkflowRun
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)

<a id="workflow-events"></a>

### `workflow/*` events

<a id="workflowagent-end--emit"></a>

#### `workflow/agent-end` — emit

One `agent()` call settled (clean result, child failure, or run cancellation). Paired with Events['workflow/agent-start'] by `agent.seq`, exactly once per started call on every stop path — on an engine termination path (a worker killed past its grace) the end is engine-synthesized with outcome `'cancelled'`.

```ts cordis-catalog
/**
 * One `agent()` call settled (clean result, child failure, or run
 * cancellation). Paired with {@link Events['workflow/agent-start']} by
 * `agent.seq`, exactly once per started call on every stop path — on an
 * engine termination path (a worker killed past its grace) the end is
 * engine-synthesized with outcome `'cancelled'`.
 * @param info - the run's identity snapshot.
 * @param agent - the call identity plus its outcome.
 * @mode emit
 */
'workflow/agent-end'(info: WorkflowRunInfo, agent: WorkflowAgentEndInfo): void
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowagent-start--emit"></a>

#### `workflow/agent-start` — emit

One `agent()` call established a published child run. Paired with Events['workflow/agent-end'] by `agent.seq`. A call that never receives a published run from the provider emits neither event in this pair.

```ts cordis-catalog
/**
 * One `agent()` call established a published child run. Paired with
 * {@link Events['workflow/agent-end']} by `agent.seq`. A call that never
 * receives a published run from the provider emits neither
 * event in this pair.
 * @param info - the run's identity snapshot.
 * @param agent - the call's sequence number, label, phase, and child id.
 * @mode emit
 */
'workflow/agent-start'(info: WorkflowRunInfo, agent: WorkflowAgentInfo): void
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowend--emit"></a>

#### `workflow/end` — emit

A workflow run settled (any stop reason). Fired when WorkflowRun.result resolves. Paired with Events['workflow/start'].

```ts cordis-catalog
/**
 * A workflow run settled (any stop reason). Fired when
 * {@link WorkflowRun.result} resolves. Paired with
 * {@link Events['workflow/start']}.
 * @param info - the run's identity snapshot.
 * @param result - the outcome data (stop reason, error, agent count) —
 *   deliberately WITHOUT the result value (see {@link WorkflowResultInfo}).
 * @mode emit
 */
'workflow/end'(info: WorkflowRunInfo, result: WorkflowResultInfo): void
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowlog--emit"></a>

#### `workflow/log` — emit

The script emitted a narration line (a `log(message)` call).

```ts cordis-catalog
/**
 * The script emitted a narration line (a `log(message)` call).
 * @param info - the run's identity snapshot.
 * @param message - the logged message, verbatim.
 * @mode emit
 */
'workflow/log'(info: WorkflowRunInfo, message: string): void
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowphase--emit"></a>

#### `workflow/phase` — emit

The script entered a phase (a `phase(title)` call) — progress grouping for observers; no execution semantics.

```ts cordis-catalog
/**
 * The script entered a phase (a `phase(title)` call) — progress grouping
 * for observers; no execution semantics.
 * @param info - the run's identity snapshot.
 * @param title - the phase title, verbatim.
 * @mode emit
 */
'workflow/phase'(info: WorkflowRunInfo, title: string): void
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowstart--emit"></a>

#### `workflow/start` — emit

A workflow run started — the script's meta block validated, the body about to execute. Paired with Events['workflow/end'].

```ts cordis-catalog
/**
 * A workflow run started — the script's meta block validated, the body
 * about to execute. Paired with {@link Events['workflow/end']}.
 * @param info - the run's identity snapshot (id + meta).
 * @mode emit
 */
'workflow/start'(info: WorkflowRunInfo): void
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)
<!-- END GENERATED cordis-surface -->
