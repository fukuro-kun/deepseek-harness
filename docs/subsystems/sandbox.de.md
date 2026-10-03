# Prozess-Sandbox
[English](sandbox.md) | [中文](sandbox.zh.md) | Deutsch


Der Prozess-Sandbox-seam von [dsh-sandbox](../../packages/sandbox/sandbox) verpackt das argv eines Subprozesses, der Dateisystem und Kernel mit dem Host teilt, in eine Dateieffekt-Richtlinie, ohne Konsumenten an einen plattformspezifischen Runner zu koppeln. [dsh-sandbox-local](../../packages/sandbox/sandbox-local) liefert Linux bwrap/Landlock, macOS Seatbelt und das Windows-ACL-Backend mit restricted token; [dsh-bash-sandbox](../../packages/shell/bash-sandbox) und [dsh-pwsh-sandbox](../../packages/shell/pwsh-sandbox) konsumieren ihn. Container, MicroVMs und Remote-Ausführung sind gleichrangige Implementierungen ganzer Capability-seams, keine Provider von `ctx.sandbox`.

Quelle: [`packages/sandbox/sandbox/src/index.ts`](../../packages/sandbox/sandbox/src/index.ts)

## Modi und Durchsetzung

`SandboxMode` regelt ausschließlich Dateisystemeffekte. `read-only` fordert vom Backend, Schreibzugriffe abzulehnen — die POSIX-Runner gewähren zusätzlich die `/dev/null`-Senke, die ihre Shells benötigen, während der Windows-ACL-Runner keine explizit beschreibbare Wurzel gewährt und wegen seiner Umgebungs-ACL-Lücken teilweise Durchsetzung meldet; `workspace-write` erlaubt Schreibzugriffe unter der Workspace-Wurzel und dem vom Backend zugesagten Temp-Bereich; `danger-full-access` umgeht die Beschränkung. Netzwerk- und Prozesssichtbarkeit liegen außerhalb dieses Vokabulars.

```ts type-equiv
/**
 * File-effect policy for confined processes. `read-only` permits only required
 * sinks such as `/dev/null`; `workspace-write` also permits the workspace and a
 * backend-defined temp area; `danger-full-access` bypasses confinement. Network
 * and process visibility are outside this vocabulary.
 */
type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access'
```

Nur die ersten beiden Modi können an einen Provider gesendet werden. Ein `danger-full-access`-Konsument startet sein ursprüngliches argv per spawn und ruft `ctx.sandbox` nicht auf.

```ts type-equiv
/** A confining (non-`danger-full-access`) mode — the modes a {@link SandboxPolicy} can carry. */
type ConfinedSandboxMode = Exclude<SandboxMode, 'danger-full-access'>
```

Durchsetzung ist eine gemeldete Tatsache. `full` bedeutet, das Backend kontrolliert jeden vom Modus zugesagten Dateieffekt; `partial` bedeutet, ein aktives Backend oder eine ältere Kernel-ABI kontrolliert nur eine Teilmenge, sodass Konsumenten, die die absolute Zusage benötigen, diesen Unterschied ablehnen oder nach oben melden müssen. Ältere Landlock-ABIs und die Everyone-/Hardlink-Grenzen des Windows-ACL-Runners sind aktuelle Partial-Fälle.

```ts type-equiv
/**
 * Enforcement completeness for this host. `partial` means an active backend or
 * older kernel ABI cannot govern every promised file effect; callers requiring
 * an absolute boundary must not treat it as `full`.
 */
type SandboxEnforcement = 'full' | 'partial'
```

## Richtlinie pro Aufruf

Die vollständige Ausführungsrichtlinie wird pro Capability-Aufruf aufgelöst und mitgeführt. Sie schließt `danger-full-access` ein, damit ein Konsument die Richtlinie einmal auflösen kann, bevor er entscheidet, ob er die Beschränkung umgeht. Normale Tool-Aufrufe leiten `workspaceRoot` aus dem unveränderlichen cwd der aufrufenden Session ab; die Deployment-Konfiguration ist der Fallback ohne Agent. Die Wurzel wird vor der lexikalischen Normalisierung mit Dateisystemsemantik kanonisiert, sodass ein cwd, der `symlink/..` enthält, das Verzeichnis identifiziert, in dem ein gestarteter Prozess tatsächlich läuft.

```ts type-equiv
/**
 * The complete file-effect policy resolved for one capability call. The root
 * is carried even under modes that do not consume it so callers can resolve
 * policy once before choosing the enforcement path.
 */
interface SandboxExecutionPolicy {
  /** The file-effect mode this execution runs under. */
  mode: SandboxMode
  /** Absolute root directory `workspace-write` may write under. */
  workspaceRoot: string
  /**
   * Opaque identity of the calling session (the branded `dsh-session`
   * SessionId). Backends key per-session state off it (e.g. windows-acl gives
   * each live session/workspace pair a random private temp directory and SID,
   * while the workspace SID and standing grant remain per-workspace); absent
   * for agentless calls, which fall back to per-call backend state.
   */
  sessionId?: SessionId
}
```

`ctx.sandboxPolicy.resolve()` akzeptiert die aktive Session und für einen genehmigten Wiederholungsversuch einen expliziten Modus. Der Service besitzt die Rangfolge und den Wurzel-Fallback, damit bash und fs sie nicht wiederholen.

```ts type-equiv
/** Inputs that select the sandbox policy for one capability call. */
interface SandboxPolicyRequest {
  /** Calling session; its immutable cwd becomes the workspace boundary. */
  session?: Session
  /** Explicit approved mode override, which outranks session policy. */
  mode?: SandboxMode
}
```

Nur eine beschränkte Ausführung erreicht `ctx.sandbox`; die an den Provider übergebene Richtlinie verengt den Modus bei gleicher Wurzel. So können konkurrierende Sessions, Konsumenten und einmalig eskalierte Wiederholungen beim selben Provider unterschiedliche Grenzen anfragen, ohne Provider-Zustand zu verändern.

```ts type-equiv
/**
 * What one confined execution is allowed to touch — carried PER CALL, not
 * fixed on the provider: two consumers may confine under different policies
 * at the same instant (bash under `read-only` while a confined child agent
 * needs its state directory writable), and an approved escalated retry is a
 * new call with a wider policy. Defaulting/resolution is an explicit step at
 * the consumer boundary; the provider treats the policy as fully specified.
 */
interface SandboxPolicy extends SandboxExecutionPolicy {
  /** The file-effect mode this execution runs under. */
  mode: ConfinedSandboxMode
}
```

<a id="wrapped-argv-and-classification-dialects"></a>

## Verpacktes argv und Klassifizierungsdialekte

`RunnerFailureRule` bündelt die Nachweise dafür, dass ein Runner vor Ausführung des Befehls fehlgeschlagen ist. Ein Konsument verlangt einen Exit ungleich null, das optionale Exit-Code-Gatter der erlaubten Codes und eine groß-/kleinschreibungsunabhängige fatale Signatur in einer der verbleibenden stderr-Zeilen. Groß-/kleinschreibungsunabhängige exakte Vollzeilen-Ausschlüsse informativer Zeilen werden zuerst entfernt, sodass eine harmlose Runner-Meldung allein keinen Fehler beweisen kann. Die gematchte Zeile bleibt als Fehlerdetail verfügbar; die Klassifizierung schreibt stderr nicht um.

```ts type-equiv
/**
 * Evidence that identifies a sandbox runner failing before it executes the
 * wrapped command. A consumer first applies {@link allowedExitCodes} when
 * present, removes {@link informationalLines} by case-insensitive exact line
 * equality, then matches {@link fatalSignatures} case-insensitively within
 * each remaining stderr line. Exit status alone never proves runner failure.
 */
interface RunnerFailureRule {
  /** Nonzero process exit codes on which this rule may match; omitted permits any nonzero exit. */
  allowedExitCodes?: readonly number[]
  /** Non-empty substrings identifying a fatal runner diagnostic on one stderr line. */
  fatalSignatures: readonly string[]
  /** Benign stderr lines excluded by exact full-line equality before fatal matching. */
  informationalLines?: readonly string[]
}
```

`ConfinedArgv` ist das, was der Konsument per spawn startet. Neben dem Ersatz-argv trägt es die Durchsetzungstatsache des Backends und zwei orthogonale stderr-Klassifizierer. `denialSignatures` erkennen, dass der beschränkte Befehl blockiert wurde, während die Sandbox korrekt arbeitet. `runnerFailureRules` erkennen, dass der Sandbox-Runner vor Ausführung des Befehls verweigert oder fehlschlägt; Konsumenten prüfen diese zuerst und melden einen Sandbox-Infrastrukturfehler, niemals einen normalen Taskfehler.

```ts type-equiv
/**
 * A {@link SandboxProvider.confine} result: the argv to spawn in place of
 * the caller's own, plus the enforcement completeness the selected backend
 * achieves for it.
 */
interface ConfinedArgv {
  /** The wrapped argv (runner, profile, separator, then the caller's argv). */
  argv: string[]
  /** How completely the selected backend enforces the policy's file effects. */
  enforcement: SandboxEnforcement
  /**
   * The selected backend's denial DIALECT: the case-insensitive stderr
   * substrings a file effect denied by THIS backend produces (EROFS text
   * under bwrap's read-only binds, EACCES under Landlock, EPERM under
   * Seatbelt). A consumer that infers denials from a failed run's stderr
   * matches against exactly these rather than a cross-backend union — the
   * union claims denials a given backend never produces.
   */
  denialSignatures: readonly string[]
  /**
   * Structured runner-failure evidence rules. Consumers require a matching
   * fatal stderr line (after informational exclusions) and any rule-specific
   * exit-code gate before checking denial signatures: runner failure means the
   * command never ran, while denial means confinement worked and blocked it.
   */
  runnerFailureRules: readonly RunnerFailureRule[]
}
```

Der [lokale Provider](../../packages/sandbox/sandbox-local/README.de.md) besitzt die Betreiberkonfiguration und bildet seinen Runner-Dialekt auf diese Regeln ab. Der [gesandboxte bash-Konsument](../../packages/shell/bash-sandbox/README.de.md) besitzt spawn und Ergebniszuordnung.

## Provider und Fail-Closed-Fehler

`ctx.sandbox.confine(argv, policy)` gibt ein `ConfinedArgv` zurück oder wirft `SandboxUnavailableError` mit Code `SANDBOX_UNAVAILABLE`, wenn kein nutzbares Backend existiert. Konsumenten können einen Fehler auch beim Starten oder Beobachten des zurückgegebenen argv klassifizieren; diese Zuordnung gehört zum Konsumentenvertrag. Stiller unbeschränkter Passthrough ist für eine beschränkte Richtlinie niemals zulässig.

Provider-Auswahl, Probing, Caching und backend-spezifische Durchsetzungsberichte gehören dem [lokalen Provider](../../packages/sandbox/sandbox-local/README.de.md).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.de.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsandbox--sandboxprovider-abstract-seam"></a>

### `ctx.sandbox` — `SandboxProvider` (abstract seam)

Abstract process-sandbox service. confine must return enforcing argv or fail closed at wrap or runner-execution time; silent unconfined passthrough is forbidden. Functional probes arbitrate multi-runner chains and may be skipped for a sole candidate, whose own refusal remains the fail-closed end.

```ts cordis-catalog
/**
 * Wrap `argv` so it executes confined under `policy` on this host; the
 * caller spawns the returned argv in place of its own.
 * @param argv - the exact argv the caller is about to spawn (program plus
 *   arguments), NOT a shell string — a shell-shaped consumer passes
 *   `['bash', '-c', command]`.
 * @param policy - the file-effect policy this execution runs under,
 *   carried per call (see {@link SandboxPolicy}).
 * @returns the argv to spawn instead, plus the enforcement completeness
 *   the selected backend achieves for it.
 */
abstract confine(argv: readonly string[], policy: SandboxPolicy): ConfinedArgv
```

Source: [`packages/sandbox/sandbox/src/index.ts`](../../packages/sandbox/sandbox/src/index.ts)

<a id="ctxsandboxpolicy--sandboxpolicyservice"></a>

### `ctx.sandboxPolicy` — `SandboxPolicyService`

The sandbox-policy service (`ctx.sandboxPolicy`). Owns the deployment default mode, fallback workspace root, and current request-time policy section. Tool layers call resolve for each execution so a session's mode log and immutable cwd travel together to every enforcing capability.

```ts cordis-catalog
/**
 * Resolve the complete policy for one capability call. An approved explicit
 * mode outranks the session's last `sandbox/mode` event, which outranks the
 * deployment default. A session cwd is its workspace-write boundary; the
 * configured root is the fallback for agentless calls and sessions without a
 * cwd.
 * @param request - optional session and approved mode override.
 * @returns the fully resolved per-call mode and absolute workspace root.
 */
resolve(request: SandboxPolicyRequest = {}): SandboxExecutionPolicy

/**
 * Read the session override without applying the deployment default.
 * @param session - session whose log supplies the override.
 * @returns the last logged mode, or `undefined` without one.
 */
overrideOf(session: Session): SandboxMode | undefined
```

Types: [Session](session.de.md)

Source: [`packages/sandbox/sandbox-policy/src/index.ts`](../../packages/sandbox/sandbox-policy/src/index.ts)
<!-- END GENERATED cordis-surface -->
