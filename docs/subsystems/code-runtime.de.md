# Code Runtime

[English](code-runtime.md) | [中文](code-runtime.zh.md) | Deutsch

Der Code-Ausführungs-Seam — ein [Capability Seam](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.de.md), dessen Service Definition ([dsh-code-runtime](../../packages/code-runtime/code-runtime), `ctx.codeRuntime`) ein vom Modell geschriebenes Programm gegen host-seitige asynchrone Bindings ausführt und berichtet, was es ausgegeben und zurückgegeben hat. Code-Ausführung ist **eine optionale Capability**, nicht Teil der Agent-Loop-Spine — deshalb lebt ihr Vokabular hier und nicht in [core.md](core.de.md). Backends unterscheiden sich in Ausführungssubstrat und Quellsprache, beides Readonly-Deskriptoren auf dem Service; der Worker-Thread-Service-Provider und der Tool-Registry-Consumer sind in der [PTC-Mode-Grundlage](../../.agents/notes/implemented/feature/2026-06-15-ptc.de.md) und dem [Typed-Return-Vertrag](../../.agents/notes/implemented/feature/2026-07-20-ptc-typed-tool-returns.de.md) spezifiziert.

Quelle: [`packages/code-runtime/code-runtime/src/types.ts`](../../packages/code-runtime/code-runtime/src/types.ts)

## Der Lauf: Request rein, Result raus

Ein `CodeRunRequest` trägt **alles, worauf die Runtime wirkt** — gemäß der Regel „explizit > implizit an Package-Grenzen" ist die Default-Belegung (Zeitbudgets, Ausgabelimits) validierte Config der Implementierung, niemals ein verstecktes `??` innerhalb von `run()`:

```ts type-equiv
/**
 * One run: the program source plus everything the runtime acts on. Per the
 * explicit-over-implicit convention, defaulting (time budgets, output caps)
 * is the implementation's validated config — a request carries no optional
 * tuning knobs for a hidden `??` to fill in.
 */
interface CodeRunRequest {
  /**
   * The program source, in the runtime's {@link ../index.ts | language}. It
   * runs as the body of an async function: top-level `await` and `return`
   * are available, and the completion value becomes
   * {@link CodeRunResult.value}.
   */
  program: string
  /** Host functions exposed to the program, one global object per namespace. */
  bindings: CodeBindingNamespace[]
  /**
   * Abort the run: the runtime stops the program (hard, even mid-loop) and
   * resolves with a {@link CodeRunFailure} of kind `'abort'`. In-flight
   * binding calls are the CALLER's to settle — the runtime only stops asking.
   */
  signal?: AbortSignal
}
```

Das Ergebnis meldet einen Fehler als **Feld**, niemals als Rejection von `run()` — ein fehlgeschlagenes Programm zu melden ist Aufgabe des Aufrufers, kein Ausnahmepfad (entsprechend dem Resolve-on-Failure-Vertrag von `ShellExecutor.run`):

```ts type-equiv
/**
 * The outcome of one run. An error is a FIELD on a resolved result, never a
 * rejection of `run()` — reporting a failed program is the caller's job, not
 * an exception path.
 */
interface CodeRunResult {
  /**
   * The program's completion value (its top-level `return`), when it ran to
   * completion and the value crossed the runtime's lossless-JSON boundary.
   * Invalid or over-limit completions fail the run instead of substituting a
   * rendered string; a failed or value-less run leaves this absent.
   */
  value?: CodeJsonValue
  /**
   * Captured text. Each source channel preserves emission order; interleaving
   * across independent channels is backend-dependent. Bounded only as part of
   * the outer result.
   */
  logs: string[]
  /** Present iff the run failed; see {@link CodeRunFailure} for the taxonomy. */
  error?: CodeRunFailure
}
```

## Bindings: Host-Funktionen als Programm-Globale

Jedes `CodeBindingNamespace` wird innerhalb des Programms zu einem globalen Objekt asynchroner Callables (der PTC-Mode-Consumer übergibt eines: `tools`). Argumente und Auflösungswerte müssen verlustfreies JSON sein und queren die Grenze ohne Seam-Level-Byte-Limit; die Runtime darf sie per Structured Clone überbrücken. Ein Namespace darf eine programmsichtbare Fehlerklasse deklarieren, ohne dass die Runtime die Namen des Consumers kennt: Die Runtime injiziert den echten Konstruktor und wandelt verworfene Aufrufe in dessen Instanzen um. Eine Runtime behandelt Binding-Namen außerdem als feindliche Eingabe (`__proto__` ist eine gewöhnliche eigene Property, niemals eine Prototyp-Kollision):

```ts type-equiv
/**
 * Program-visible typed rejection for one binding namespace. The runtime
 * injects a real error constructor under `name`; rejected member calls become
 * its instances and expose the exact member name through
 * `memberNameProperty`. Both strings are runtime data rather than knowledge
 * of a particular consumer such as PTC mode.
 */
interface CodeBindingErrorClass {
  /** Constructor global and resulting `Error.name`; same portable identifier rule as {@link CodeBindingNamespace.global}. */
  name: string
  /**
   * Non-empty own property for the member name. The portable exclusion set is
   * `RESERVED_ERROR_MEMBERS` plus dunder-form names (`__x__`, non-empty
   * middle), enforced identically by every backend; any other name —
   * identifiers or not — is accepted everywhere.
   */
  memberNameProperty: string
}
```

```ts type-equiv
/**
 * A named group of {@link CodeBindingFunction}s the runtime exposes to the
 * program as one global object (e.g. `tools`). Function names are arbitrary
 * strings — a runtime must treat names like `__proto__` or `constructor` as
 * ordinary own properties (null-prototype construction), never as prototype
 * collisions.
 */
interface CodeBindingNamespace {
  /**
   * The global identifier the program sees. Must match the LANGUAGE-PORTABLE
   * identifier subset `[A-Za-z_][A-Za-z0-9_]*` and no language's reserved
   * words, so the same namespace list works against every backend regardless
   * of `language` — a JS-only spelling like `$tools` is rejected by design,
   * not just by the Python backend. Names that satisfy the identifier rule but
   * name a backend-owned slot (`RESERVED_BINDING_GLOBALS`, e.g. `console`,
   * `__dsh_main__`) are also refused everywhere; see its declaration for the
   * exact set and why each entry is reserved.
   */
  global: string
  /** The callable members, keyed by the exact name the program calls. */
  functions: Record<string, CodeBindingFunction>
  /** Optional program-visible typed rejection contract for this namespace. */
  errorClass?: CodeBindingErrorClass
}
```

```ts type-equiv
/** A lossless JSON value transferable through the dependency-light Service Definition. */
type CodeJsonValue = null | boolean | number | string | CodeJsonValue[] | { [key: string]: CodeJsonValue }
```

```ts type-equiv
/**
 * One host-side function exposed to the program as an async callable. The
 * runtime bridges calls to it (possibly across a serialization boundary), so
 * `args` and the resolution value MUST be lossless JSON. A runtime rejects a
 * lossy or non-cloneable value with a descriptive error rather than corrupting
 * the run. No seam-level byte cap applies to a binding resolution. A rejection
 * of this function surfaces inside the program as a rejection of the
 * corresponding call.
 */
type CodeBindingFunction = (args: unknown) => Promise<CodeJsonValue>
```

## Erfasste Ausgabe und die Fehler-Taxonomie

Logs sind einfache Strings. Jeder Quellkanal bewahrt die Emissionsreihenfolge; das Interleaving zwischen unabhängigen Kanälen ist backend-abhängig, weil Kanal-Metadaten nicht Teil des Seams sind. Die Runtime erfasst die Console- und Stream-Ausgabe des Programms, und Consumer rendern nur den Text. Implementierungen begrenzen die serialisierte äußere Log-Liste plus die Nutzlast aus Completion-Value oder Failure-Message; die feste Result-Envelope-Syntax und das Consumer-Darstellungs-Whitespace gehören nicht zu dieser variablen Nutzlast-Bilanz. Überlauf ist ein expliziter Fehler statt einer In-Band-Wertsubstitution.

Fehlerarten sind **orthogonale, unabhängig gemeldete Ergebnisse** (per [defensive-patterns](../defensive-patterns.de.md)): Ein abgelaufenes Budget ist keine Exception, ein Abort ist kein Timeout, und ein Substrat-Tod (z. B. OOM) ist keines von beiden:

```ts type-equiv
/**
 * Why a run failed. The kinds are orthogonal outcomes reported independently
 * (per docs/defensive-patterns.md): a budget expiry is not an exception, an
 * abort is not a timeout, and a substrate death is neither.
 *
 * - `'exception'` — the program threw or failed to parse/transform.
 * - `'timeout'` — an implementation-owned budget expired; the message says which.
 * - `'abort'` — {@link CodeRunRequest.signal} fired.
 * - `'worker-exit'` — the execution substrate died without settling (e.g. OOM).
 * - `'invalid-output'` — the completion value was not lossless JSON.
 * - `'output-limit'` — the serialized outer logs/value/diagnostic exceeded the configured cap.
 */
interface CodeRunFailure {
  /** The failure class (see the interface doc for each kind's meaning). */
  kind: 'exception' | 'timeout' | 'abort' | 'worker-exit' | 'invalid-output' | 'output-limit'
  /** Human-readable detail, suitable for feeding back to a model to self-correct. */
  message: string
}
```

## Der Service

`CodeRuntime` (`ctx.codeRuntime`, abstrakt — definiert in [`packages/code-runtime/code-runtime/src/index.ts`](../../packages/code-runtime/code-runtime/src/index.ts)) besteht aus `run(request)` plus zwei Readonly-Deskriptoren: `language` (die Sprache, in der das Programm geschrieben sein muss — `'typescript'` und `'python'` sind die bekannten Werte, die `dsh-tools` präsentiert; das TypeScript-Backend ist veröffentlicht, das Python-Backend experimentell und privat (nicht publiziert); ein Consumer, der sprachspezifische Darstellung erzeugt, schaltet darauf und schlägt bei einer nicht darstellbaren Sprache laut fehl) und `isolation` (das Ausführungssubstrat — `'worker-thread'`, `'process'`, `'container'`; eine Diagnose-Marke, **kein Sicherheitsversprechen**). Implementierungen müssen Läufe voneinander isolieren (kein run-übergreifender Zustand) und bis zur Quieszenz dispose: In-flight-Läufe werden terminiert und abgewartet, bevor der Teardown abschließt.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.de.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxcoderuntime--coderuntime-abstract-seam"></a>

### `ctx.codeRuntime` — `CodeRuntime` (abstract seam)

Registers one `ctx.codeRuntime` implementation. Program, budget, abort, and substrate failures resolve in CodeRunResult; only Service Definition contract misuse rejects. Implementations bridge structured-cloneable bindings, materialize each declared namespace rejection class, treat programs as hostile peers, isolate runs from one another, and terminate and await in-flight runs during disposal.

```ts cordis-catalog
/**
 * Execute one program against the request's bindings and capture what it
 * emitted. See the class doc for the resolution contract (error is a result
 * field; rejection means Service Definition contract misuse only).
 * @param request - the program, its bindings, and the abort signal; the
 *   request carries everything the runtime acts on, with no hidden defaults.
 * @returns the run's outcome: completion value (when transferable), the
 *   ordered log capture, and the failure (if any).
 */
abstract run(request: CodeRunRequest): Promise<CodeRunResult>
```

Source: [`packages/code-runtime/code-runtime/src/index.ts`](../../packages/code-runtime/code-runtime/src/index.ts)
<!-- END GENERATED cordis-surface -->
