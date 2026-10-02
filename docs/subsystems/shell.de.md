# Bash-Executor

[English](shell.md) | [中文](shell.zh.md) | Deutsch

Der bash-Execution-Seam ist aufgeteilt in eine Service Definition ([dsh-shell](../../packages/shell/shell), `ctx.shell`), Service Providers ([dsh-bash-local](../../packages/shell/bash-local) und [dsh-bash-sandbox](../../packages/shell/bash-sandbox)) und einen Consumer ([dsh-tool-bash](../../packages/shell/tool-bash), das `bash`-Schema). Generische Background-Job-Ids, Ownership und Controls liegen in [jobs.md](jobs.de.md); dieser Seam gibt einen jobfreien Prozess-Handle zurück. Die Managed-Range-Mechanik liegt hinter dem [Subprocess-Seam](subprocess.de.md).

Quelle: [`packages/shell/shell/src/types.ts`](../../packages/shell/shell/src/types.ts)

## Der managed Shell-Environment-Namespace

`DSH_*`-Variablen sind Harness-eigene Child-Process-Fakten. Das modellseitige bash-Tool sammelt sie über `ctx.shellEnv` und reicht sie über `ShellExecRequest.dshEnv` durch; der Subprocess-Service entfernt geerbte `DSH_*`-Namen, bevor er den aktuellen Snapshot einmischt. Das `DshEnvironmentKey`/`DshEnvironment`-Vokabular gehört dem [Subprocess-Seam](subprocess.de.md) und wird von `dsh-shell` re-exportiert.

## Request vs. Spec: der `resolve()`-Split

Der Seam trennt den **modell-/pluginseitigen Request** (optionales `workdir`/`timeoutMs`/`stdoutMaxBytes`, befüllt aus Config oder Request-Policy) vom **vollständig aufgelösten Spec**, auf den der Executor agiert (diese Felder erforderlich). Die Tool-Schicht ruft `ctx.shell.resolve(request)` dazwischen auf (die Regel des Repos „explizit > implizit an Package-Grenzen"); ein `ShellExecSpec` trägt aufgelöste Werte.

```ts type-equiv
/**
 * A caller's execution REQUEST: `workdir` and `timeoutMs` are optional and
 * filled by {@link ShellExecutor.resolve} from the implementation's config.
 * This is the model-/plugin-facing shape; pass it to `resolve()` to obtain a
 * fully-resolved {@link ShellExecSpec}.
 */
interface ShellExecRequest {
  command: string
  /** Working directory override (default: implementation-configured). */
  workdir?: string | undefined
  /** Timeout override in milliseconds (implementations cap it). */
  timeoutMs?: number | undefined
  /**
   * Foreground stdout capture budget in bytes. Absent uses the executor's
   * default output cap. Trusted in-process consumers use this when they must
   * parse complete stdout up to their own bounded limit; the model-facing bash
   * tool does not expose it as a parameter.
   */
  stdoutMaxBytes?: number | undefined
  /** Abort signal — implementations kill the command when it fires. */
  signal?: AbortSignal | undefined
  /**
   * Bytes to write to the command's stdin, then close it. Absent leaves stdin
   * closed/empty (the default for model-driven tool calls). Set by in-process
   * plugins (e.g. the hooks bridges, which write a hook command's JSON payload
   * to its stdin); the model-facing bash tool does not expose it as a parameter
   * (a model that needs stdin uses shell syntax like a heredoc or a pipe).
   */
  stdin?: string | undefined
  /**
   * Ordinary environment entries for the command, merged after the credential
   * scrub. Managed facts belong in {@link dshEnv}, which merges after this
   * map, so an entry here can never displace one. Set by in-process plugins
   * (the hooks bridges set `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT`, …); the
   * model-facing bash tool does not expose it as a parameter.
   */
  env?: Record<string, string> | undefined
  /**
   * Harness-owned `DSH_*` variables for this execution (typed to managed
   * keys). Executors discard ambient `DSH_*` entries before merging this
   * snapshot last, so an unavailable current fact cannot inherit a stale
   * value from the harness process and a caller {@link env} entry cannot
   * displace a managed one.
   */
  dshEnv?: DshEnvironment | undefined
  /** Fully resolved per-call sandbox policy; sandboxing executors default it. */
  sandboxPolicy?: SandboxExecutionPolicy | undefined
}
```

```ts type-equiv
/**
 * A resolved execution spec. {@link ShellExecutor.resolve} fills and caps the
 * required fields; {@link ShellExecutor.start} ignores `timeoutMs` because
 * background processes have no executor timeout.
 */
interface ShellExecSpec {
  command: string
  workdir: string
  timeoutMs: number
  /**
   * Resolved foreground stdout capture budget in bytes. `run()` uses it for
   * stdout; background jobs and stderr keep the executor's own output cap.
   */
  stdoutMaxBytes: number
  /** Abort signal — implementations kill the command when it fires. */
  signal?: AbortSignal | undefined
  /** Bytes to write to stdin before closing it; absent means no stdin. */
  stdin?: string | undefined
  /**
   * Ordinary environment entries carried through from
   * {@link ShellExecRequest.env}; {@link dshEnv} still merges after them.
   * OPTIONAL on the spec for the same reason as `stdin`: absent means no
   * ordinary extra environment.
   */
  env?: Record<string, string> | undefined
  /** Managed `DSH_*` snapshot (typed to managed keys); merges after {@link env}. */
  dshEnv?: DshEnvironment | undefined
  /** Resolved sandbox policy; ignored by executors that do not confine. */
  sandboxPolicy: SandboxExecutionPolicy | undefined
}
```

`stdin` und `env` sind vertrauenswürdige In-Process-Plugin-Inputs und werden von `dsh-tool-bash` nicht exponiert. Der lokale Executor scrubbt zuerst ambient Credentials, bevor er explizit vom Aufrufer geliefertes env einmischt.

`stdoutMaxBytes` ist ebenfalls nur für vertrauenswürdige Plugins. Es erlaubt einem Foreground-Consumer, vollständiges stdout bis zu einem begrenzten Parser-Budget anzufordern, ohne stderr, Background Jobs oder das gewöhnliche Output-Cap des modellseitigen bash-Tools zu ändern.

## Foreground Runs: `ShellRunResult`

Das Ergebnis eines abgeschlossenen (oder gekillten) Foreground Runs. Orthogonale Outcomes werden **unabhängig** gemeldet — ein Prozess kann sowohl ein Timeout haben ALS AUCH mit 0 exiten, weil er das Signal gefangen hat — deshalb sind `timedOut`, `aborted`, `signal` und `exitCode` jeweils eigene Felder; ein Aufrufer liest einen vorzeitig abgebrochenen Run niemals als sauberen Erfolg.

```ts type-equiv
/** The outcome of one completed (or killed) foreground run. */
interface ShellRunResult {
  /** Exit code; null when the process died from a signal. */
  exitCode: number | null
  /** Terminating signal (e.g. 'SIGTERM'); null on normal exit. */
  signal: NodeJS.Signals | null
  /**
   * True when the executor's own timeout was the FIRST cause to cut the command
   * short. Mutually exclusive with {@link aborted}: one fused deadline drives
   * both the timeout and the caller's cancellation, so a timeout and an abort
   * racing before process close report the single first-abort cause, not both
   * (see the [timeout-library Agent Note](../../../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.md)).
   */
  timedOut: boolean
  /**
   * True when the caller's `AbortSignal` was the FIRST cause to kill the command
   * (and it was not the executor's own timeout). Mutually exclusive with
   * {@link timedOut} — see there for the first-cause classification.
   */
  aborted: boolean
  /** The effective timeout applied to this run (after defaulting/capping). */
  timeoutMs: number
  stdout: CollectedOutput
  stderr: CollectedOutput
  /** Sandbox execution facts, absent for an unsandboxed executor. */
  sandbox?: ShellSandboxInfo
}
```

Jeder Stream ist ein `CollectedOutput` — der (möglicherweise gekürzte) Text plus Recovery-Info; bei Kürzung ist `text` der **Tail**, und der vollständige Stream spillt in eine private Datei. Die Felder gehören dem [Subprocess-Seam](subprocess.de.md) und werden von `dsh-shell` re-exportiert.

## Datei-Sandbox: `ShellSandboxInfo`

Ein sandboxnutzender Executor exponiert sein konfiguriertes Mode-Fallback über `ShellExecutor.sandboxMode`. Die Tool-Schicht beauftragt [`@deepseek-ai/dsh-sandbox-policy`](../../packages/sandbox/sandbox-policy/README.de.md), das durable `sandbox/mode`-Override und das immutable cwd der jeweils aufrufenden Session in `ShellExecRequest.sandboxPolicy` aufzulösen; ein vom Benutzer genehmigter, strikt weiterer Aufruf ersetzt nur den Mode. Das Mode/Root/Enforcement-Vokabular gehört dem [`@deepseek-ai/dsh-sandbox`-Seam](sandbox.de.md); Modes regeln nur Dateieffekte.

Ein sandboxed Run meldet seinen Mode, die konservative Denial-Klassifikation und die Enforcement-Vollständigkeit. `runnerFailed` markiert einen Sandbox-Runner-Fehler bevor das Kommando lief; die Foreground-Ausführung wirft `SANDBOX_UNAVAILABLE`, während ein beendeter Hintergrundprozess nur seinen Faktenkanal hat.

```ts type-equiv
/**
 * Sandbox facts for one run, present iff a sandboxing executor handled it.
 * Facts are reported independently of process exit status so callers can
 * distinguish command failures from policy denials and runner failures.
 */
interface ShellSandboxInfo {
  /** The mode the command actually ran under. */
  mode: SandboxMode
  /** Whether the sandbox denied a file operation. */
  denied: boolean
  /** How completely the selected runner enforced the requested mode. */
  enforcement?: SandboxEnforcement
  /** Whether the sandbox runner failed before the command could run. */
  runnerFailed?: boolean
}
```

Der `SANDBOX_UNAVAILABLE`-Fehlercode (im Besitz des [Sandbox-Seams](sandbox.de.md)) ist der, den der `ctx.sandbox`-Provider wirft — und der Executor propagiert — wenn ein confinierender Mode kein nutzbares Backend hat. Ein ausgewählter Runner, der sein Profil ablehnt, erreicht denselben fail-closed-Foreground-Fehler; ein beendeter Background Job verzeichnet `runnerFailed`. Das Modell erhält Denial-/Runner-Fakten in den Ergebnissen, erfährt den effektiven Mode nur, wenn ein Denial-Marker ihn benennt, und kann über `sandbox_permissions` plus `justification` einen einmaligen, strikt weiteren Retry anfordern; `ctx.approval` muss genau diesen Aufruf genehmigen, bevor irgendetwas ausgeführt wird. Das vollständige Policy- und Switching-Design ist die [Sandbox Agent Note](../../.agents/notes/implemented/feature/2026-07-06-sandbox.de.md).

## Hintergrundprozesse: `ShellProcess`

`start()` gibt einen Handle ohne Id oder Owner zurück. `dsh-tool-bash` adaptiert ihn in `ctx.jobs.start()`-Hooks; die generische Runtime besitzt dann Job-Identität und Lifecycle. `done` resolved, wenn der zugrundeliegende Prozess settled, und rejectet nie; eine Provider-Rejection des Subprocess wird zu einem `killed`-Prozess mit einem stage-neutralen Fehler auf stderr. Reads bleiben nach dem Settlement gültig, und Sandbox-Fakten werden gestempelt, bevor `done` resolved.

```ts type-equiv
/**
 * A background process handle returned by {@link ShellExecutor.start}. It is the
 * only access path; buffered output remains readable after exit. Composition
 * teardown (the subprocess service's disposal) kills running processes and
 * awaits {@link done}; an executor-only reload leaves them running.
 */
interface ShellProcess {
  /** Process lifecycle state (settled exactly once). */
  status: ShellProcessStatus
  /** Exit code once finished (null = killed by signal / still running). */
  exitCode: number | null
  /** Terminating signal name, when signal-killed. */
  signal: NodeJS.Signals | null
  /**
   * Resolves when the underlying process settles (never rejects — provider
   * rejection settles as `killed` with a stage-neutral error on stderr).
   */
  readonly done: Promise<void>
  /** Sandbox facts, stamped once a confined process settles. */
  sandbox?: ShellSandboxInfo
  /**
   * Read output produced since the previous read (consuming — consecutive
   * reads never re-deliver). Reads that lost data flag `lossy` and point at
   * full-stream spill files when available.
   */
  readOutput(): ShellProcessRead
  /**
   * Terminate the provider-managed range. Returns false when it had already finished
   * (no-op); idempotent.
   */
  kill(): boolean
}
```

`readOutput()` gibt das inkrementelle Delta und die Spill-Recovery-Fakten zurück:

```ts type-equiv
/** One incremental {@link ShellProcess.readOutput} read. */
interface ShellProcessRead {
  /** Output produced since the previous read (stderr in a marked section). */
  delta: string
  /** True when truncation dropped unread bytes the delta cannot include. */
  lossy: boolean
  /** Full stdout spill file, when stdout truncation occurred and a safe path is available. */
  stdoutSpillPath?: string
  /** Full stderr spill file, when stderr truncation occurred and a safe path is available. */
  stderrSpillPath?: string
}
```

## Der Service

`ShellExecutor` besitzt `resolve`, den Foreground-`run`, den Hintergrundprozess-`start` und das `sandboxMode`-Capability-Fakt. `dsh-bash-local` besitzt Command-Defaulting, Timeout/Abort-Klassifikation, das Terminal-Environment und den Background-Read-Merge; Managed-Range-Termination, begrenzte Collector, Spill-Dateien, Credential-Scrubbing und Disposal-Quiescence gehören dem [Subprocess-Service](subprocess.de.md). `dsh-tool-bash` besitzt das modellseitige Rendering und adaptiert Background-Handles in die [generische Job-Runtime](jobs.de.md). `dsh-shell` besitzt den gemeinsamen Exit-Status-Contract der Shell-Tools: das exportierte `parseExitStatus`/`ParsedExitStatus` invertiert die `[exit code: N]`-/`[killed by signal: X]`-Marker, die `dsh-tool-bash`' `renderResult` und `dsh-tool-pwsh`' `renderPwshResult` anhängen, und beider Tools `presentResult` verwenden es, um den gerenderten Text in den Output-Body der Terminal-Karte und ihre Exit-Status-Pill aufzuteilen.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.de.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.de.md).

<a id="ctxshell--shellexecutor-abstract-seam"></a>

### `ctx.shell` — `ShellExecutor` (abstract seam)

Abstract bash execution service. Subclass, implement the abstract methods, and load the subclass as a plugin — it registers as `ctx.shell` (one implementation per context; loading a second throws, which is cordis' standard duplicate-service behavior).

Implementations must honor these semantics:

- run rejects only for infrastructure failures. Nonzero exits, timeout kills, and abort kills resolve with a ShellRunResult.
- start returns immediately; no timeout applies to background processes. `done` settles at process close and never rejects; spawn failures settle as `killed` with the error on stderr.
- ShellProcess.readOutput is incremental: consecutive reads never repeat output. Lossy reads report truncation and available spill files.
- A still-running background process is stopped and awaited when its owning composition tears down. With the subprocess seam that boundary is `ctx.subprocess` disposal, so a background process survives an executor-only reload.

```ts cordis-catalog
/**
 * Apply implementation-owned defaults and caps to a request before execution.
 * @param request - the caller's request; omitted fields get this
 *   implementation's defaults, capped fields are clamped.
 * @returns the fully-specified spec to hand to {@link run}/{@link start}.
 */
abstract resolve(request: ShellExecRequest): ShellExecSpec

/**
 * Run a command in the foreground; resolves when it finishes.
 * @param spec - a resolved spec from {@link resolve}, never a raw request.
 * @returns the outcome; nonzero exits, timeout kills, and abort kills
 *   resolve with a descriptive result rather than reject.
 */
abstract run(spec: ShellExecSpec): Promise<ShellRunResult>

/**
 * Start a background process and return its handle immediately.
 * @param spec - a resolved spec from {@link resolve}, never a raw request.
 * @returns the live process handle (reads, kill, quiescence promise).
 */
abstract start(spec: ShellExecSpec): ShellProcess
```

Source: [`packages/shell/shell/src/index.ts`](../../packages/shell/shell/src/index.ts)

<a id="ctxshellenv--shellenvregistry"></a>

### `ctx.shellEnv` — `ShellEnvRegistry`

Registry (`ctx.shellEnv`) for trusted, per-execution `DSH_*` variables. The namespace is rebuilt for every model shell call: ambient `DSH_*` values are discarded by the executor, then the registry's current snapshot is injected. Built-in shell facts remain owned by the registry itself while plugins can register additional, enumerable facts with effect-scoped disposal.

```ts cordis-catalog
/**
 * Register one environment contributor. Names and keys are unique; built-in
 * keys are reserved. Registration is disposed with the calling plugin fiber.
 * @param contributor - declared key ownership and per-execution resolver.
 * @returns the disposer that unregisters the contribution.
 */
register(contributor: BashEnvContributor): () => void

/**
 * Build the trusted `DSH_*` snapshot for one shell tool execution.
 * @param execution - the current tool execution.
 * @returns an immutable environment overlay containing built-ins and current contributions.
 */
collect(execution: ToolExecution): DshEnvironment

/**
 * Enumerate plugin-contributed variables without executing their resolvers.
 * @returns declarations sorted by environment variable name.
 */
list(): BashEnvVariableInfo[]
```

Types: [DshEnvironment](subprocess.de.md) · [ToolExecution](tools.de.md)

Source: [`packages/shell/shell-env/src/index.ts`](../../packages/shell/shell-env/src/index.ts)
<!-- END GENERATED cordis-surface -->
