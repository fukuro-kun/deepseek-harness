# Tools
[English](tools.md) | [中文](tools.zh.md) | Deutsch


Die Tool-Pipeline von [dsh-tools](../../packages/core/tools). [core.md](core.de.md) führt `ToolDefinition` als den Pipeline-Authoring-Typ ein, der von den Core-Paketen geteilt wird; der modellseitige [`ToolSchema`](llm-streaming.de.md#the-model-request-and-result)-Wire-Typ wird zusammen mit der Modellanfrage deklariert. Diese Seite dokumentiert jedes `ToolDefinition`-Feld, die typisierte Schema-DSL, die es erzeugt, die abgesicherten Ausführungstypen und die UI-Präsentationstypen.

Quellen: [`packages/core/tools/src/index.ts`](../../packages/core/tools/src/index.ts) · [`packages/core/tools/src/schema.ts`](../../packages/core/tools/src/schema.ts) · [`packages/core/tools/src/presentation.ts`](../../packages/core/tools/src/presentation.ts)

## `ToolDefinition` — ein registriertes Tool

Ein `ToolSchema` (die modellseitigen Felder) plus eine obligatorische kanonische Output-Deklaration, die `execute`-Funktion, host-exklusive Scheduler-Metadaten, ein optionaler Final-Content-Callback und optionale UI-Presenter. Die Registry hält diese Definitionen; der Loop dispatcht Aufrufe durch sie. Die Registry-Methode `schemas()` erzeugt das modellseitige `ToolSchema[]` durch eine explizite Allowlist — `output`/`execute`/`finalizeContent`/`timeoutMs`/`isConcurrencySafe`/`presentCall`/`presentResult` dürfen niemals in eine Modellanfrage gelangen.

```ts type-equiv
/** Tool-owned canonical output contract used after the body returns a JSON value. */
interface ToolOutputDefinition {
  /** Raw supported JSON Schema enforced against every successful canonical value. */
  readonly schema: JsonSchemaNode
  /** Pure projection from validated arguments and value to Native/model content. */
  render(args: unknown, value: JsonValue): ContentBlock[]
  /** Pure replayable presentation projection, computed only for top-level calls. */
  presentationMeta?(args: unknown, value: JsonValue): JsonValue
}
```

```ts type-equiv
/** A registered tool: its schema plus the execution function. */
interface ToolDefinition extends ToolSchema {
  /** Mandatory canonical output declaration. */
  readonly output: ToolOutputDefinition
  /**
   * Run one accepted call and return only its canonical lossless-JSON value.
   * Async work must observe or forward `exec.signal` and settle only after its
   * owned work reaches quiescence. The registry preserves caller cancellation
   * through around-dispatch signal replacement and does not abandon this
   * promise, but it cannot hard-kill same-process code.
   * @param args - losslessly snapshotted, frozen model arguments.
   * @param exec - execution identity, cancellation signal, and context deferral.
   * @returns the canonical value declared by `output.schema`.
   */
  execute(args: unknown, exec: ToolRunContext): Promise<unknown>
  /**
   * Synchronous last-mile transform for model-facing content. The registry
   * snapshots this callback when execution starts and invokes it exactly once
   * for every normalized outcome, including pipeline failures that bypass
   * `tools/post-execute`, immediately before lossless materialization.
   * Returning `undefined` preserves the content; every other result field
   * remains registry-owned. The callback must be total and must not throw.
   * @param exec - immutable execution identity and arguments.
   * @param result - complete normalized outcome before materialization.
   * @returns replacement content, or `undefined` to preserve it.
   */
  finalizeContent?(exec: Readonly<ToolExecution>, result: Readonly<ToolExecutionResult>): ContentBlock[] | undefined
  /**
   * Cooperative tool-call timeout budget in milliseconds. Omit for no deadline.
   * Enforced by `@deepseek-ai/dsh-tool-call-timeout-policy` (a `tools/execute` wrapper); it
   * is NEVER sent to the model — `schemas()` whitelists only name/description/
   * parameters. Declaring it asserts this tool forwards `exec.signal` to a
   * cooperative implementation that can reach quiescence when the signal aborts.
   */
  timeoutMs?: number
  /**
   * Pure synchronous classifier for overlap with sibling tool calls. Only
   * `true` opts in; omission, exceptions, non-`true` returns, and invalid
   * `defineTool` arguments are exclusive. This metadata is never model-visible.
   *
   * Opted-in executions must not mutate parent-owned state. Shared state must
   * tolerate concurrent dispatch; recorder races are permitted only when they
   * commute or fail closed. See the
   * [parallel-tool-call Agent Note](../../../../.agents/notes/implemented/feature/2026-07-10-parallel-tool-call-execution.md)
   * for the full contract.
   * @param args - parsed arguments; `defineTool` validates before calling.
   * @returns Whether this call may join a parallel group.
   */
  isConcurrencySafe?(args: unknown): boolean
  /**
   * Optional: how to present the PENDING state of one call in a UI, derived from
   * the call's `args` (parsed arguments, `unknown` — the tool validates/narrows
   * its own input). Returns a {@link ToolCallView} (a `card`-tagged render intent),
   * or `undefined` (or omit the method) to fall back to a generic presentation
   * (title = tool name, raw args as input). Pure and side-effect-free: a UI may
   * call it during live streaming AND a session-log replay, so it must depend
   * only on `args`.
   */
  presentCall?(args: unknown): ToolCallView | undefined
  /**
   * Optional: how to present the COMPLETED state, given the same `args` and the
   * durable result projection (`content`, failure state, and optional `meta`). Returns a
   * {@link ToolResultView}, or `undefined` (or omit the method) to keep the
   * pending title and render the raw result content. Pure and side-effect-free
   * for the same replay reason.
   */
  presentResult?(args: unknown, result: ToolResult): ToolResultView | undefined
}
```

`execute` empfängt `args: unknown` — ein rohes `ToolDefinition` validiert seine eigene Eingabe. First-Party-Tools schreiben das nicht von Hand; sie verwenden `defineTool`, das Argumente validiert und einschränkt, den Body-Rückgabewert aus `output.schema` inferiert und beide Output-Projektoren typisiert. `finalizeContent` erhält bewusst die unveränderliche Execution statt typisierter Argumente, weil ungültige Eingaben und äußere Pipeline-Fehler ebenfalls diesen Callback erreichen; es kann eine tool-eigene Content-Bindung durchsetzen, während `isError`, der kanonische Wert, die strukturierte Fehleridentität, aufgeschobene Kontexte und Präsentationsmetadaten erhalten bleiben.

## Die vereinheitlichte JSON-Wert-Schema-DSL

Plugin-Autoren verwenden ein Vokabular für typisierte Parameter und typisierte Output-Werte. `ValueSchemaSpec` unterstützt `string`, `number`, `integer`, `boolean`, `null`, `array`, `object`, nur-Autor-`json` und exakt-eins `oneOf`; skalare `enum`- und `const`-Werte müssen ihrem Knotentyp entsprechen. Ein expliziter Objekt-Knoten deklariert immer `additionalProperties: true | false`. Parameterdefinitionen bleiben eine implizite offene Objekt-Eigenschafts-Map, wobei `required: true` an jeder benötigten Eigenschaft angebracht wird.

Quelle: [`packages/core/tools/src/schema.ts`](../../packages/core/tools/src/schema.ts)

```ts type-equiv
/** One author-facing schema for any lossless JSON value root. */
type ValueSchemaSpec =
  | StringValueSchemaSpec
  | NumberValueSchemaSpec
  | IntegerValueSchemaSpec
  | BooleanValueSchemaSpec
  | NullValueSchemaSpec
  | ArrayValueSchemaSpec
  | ObjectValueSchemaSpec
  | JsonValueSchemaSpec
  | OneOfValueSchemaSpec
```

```ts type-equiv
/** One implicit parameter-root property, optionally required. */
type ParameterPropertySpec = ValueSchemaSpec & { required?: true }
```

```ts type-equiv
/**
 * Tool parameter schema. The map itself is an implicit open object root;
 * requiredness remains a per-property `required: true` annotation.
 */
type ParameterSchemaSpec = {
  [key: string]: ParameterPropertySpec
  [key: symbol]: never
}
```

`{ type: 'json' }` inferiert `JsonValue` und kompiliert zu einem nur-Annotationen, unbeschränkten Raw-Schema. Output-Roots können Objekte, Arrays, Skalare oder null sein. `InferValue<S>` wahrt Literal-Bindungen und Objekt-Offenheit durch 16 Container-Ebenen, dann fällt es auf `JsonValue` zurück, statt den TypeScript-Typ-Instanziierungs-Stack auszuschöpfen. `InferArgs<P>` wandelt Per-Eigenschaft-Benötigtsein in benötigte und optionale String-Keys:

```ts type-equiv
/**
 * Infer the TypeScript value accepted by an author-facing value schema. Exact
 * inference is bounded to 16 container levels, then falls back to `JsonValue`.
 */
type InferValue<S> = InferValueAt<S, []>
```

```ts type-equiv
/** Infer the TypeScript argument object for an implicit parameter schema. */
type InferArgs<S> = InferProperties<S, []>
```

`defineTool({ name, description, parameters, output, execute, … })` bindet Parameter-Inferenz an `parameterSchemaSpecToJsonSchema()` und `validateArgs()` und bindet `execute`/`render`/`presentationMeta` an `InferValue<OutputSchema>`. Schema-Datensätze enthalten nur eigene aufzählbare String-Keys und Schema-Arrays sind dichte intrinsische Arrays, sodass Inferenz, Kompilierung und Validierung dieselbe Deklaration beobachten. Die Inferenz bleibt exakt durch 16 Container-Ebenen und erweitert sich dann zu `JsonValue`; die Laufzeit-Validierung durchläuft weiterhin das vollständige Schema. `valueSchemaSpecToJsonSchema()` kompiliert Output-Deklarationen durch dieselbe erzwungene Raw-Teilmenge. Ein Parameter-Mismatch wirft `ToolArgsError` (`INVALID_ARGS`); ein ungültiger Body- oder Post-Policy-Wert wirft `ToolOutputError` (`INVALID_TOOL_OUTPUT`). Beide verwenden den normalen Tool-Fehler-Pfad. Raw JSON Schema bleibt standardmäßig offen; nicht unterstützte Keywords werden abgelehnt statt ohne Durchsetzung akzeptiert.

Die Registrierung ist ein vertrauenswürdiger Same-Process-Contract. Die Registry übernimmt die typisierte Definition als Readonly-Eingabe, verlangt `output`, validiert ihr Raw-Schema und prüft semantische Anforderungen wie ein positives endliches `timeoutMs`; `schemas()` erzeugt die modellseitige Projektion beim Erstellen einer Anfrage, sodass Ausführung und Präsentation eine aufgelöste Definition teilen, ohne Callbacks auf das Wire zu leaken.

## `ToolRestriction` — ein Scope-Live-Filter über Geerbtes

`ToolRestriction` gilt für die Tools, die ein Scope erbt: die Deployment-globalen Schicht plus jeder Vorfahren-Scope auf seiner Kette. Die Registry kompiliert Readonly-Namen in private Sets, schneidet mehrere Restrictions, legt dann die EIGENEN Registrierungen des Scope darüber, die exempt bleiben, sodass ein delegiertes Child die Tools behält, durch die es antwortet. Ein Deny-only-Filter lässt spätere nicht gelistete geerbte Tools zu, während eine Allow-Liste sie ausschließt.

```ts type-equiv
/**
 * Per-scope filter over global tools. Restrictions intersect and do not affect
 * scoped registrations or the reserved PTC mode transport.
 */
interface ToolRestriction {
  /** Global tool names that stay visible; everything else is removed. */
  readonly allow?: readonly string[]
  /** Global tool names removed from visibility. */
  readonly deny?: readonly string[]
}
```

## Ausführung: erweiterbare Waterfalls plus monotone Policy

`ctx.tools.execute()` akzeptiert ein vom Aufrufer besessenes `ToolExecutionInput` mit einem erforderlichen Readonly-`signal`, materialisiert seine geparsten JSON-Argumente einmal in ein Pipeline-besessenes `ToolExecution` und führt diesen Aufruf durch `tools/pre-execute` (der umsortierbare Allow/Deny/Ask-Waterfall) → registrierte monotone Guards → `tools/execute` (Around-Dispatch-Wrapper) → `tools/post-execute` (Ergebnis inspizieren/ersetzen) → optionaler definitionsbesitzender `finalizeContent` → `tools/result` (das unveränderliche autoritative Ergebnis). Nur die `tools/execute`-Sicht darf das erforderliche Signal ersetzen. Das Ergebnis ist ein `ToolExecutionResult`.

```ts type-equiv
/** Opaque call identity that permits correlation without exposing mutable execution state. */
type ToolExecutionToken = symbol & { readonly [toolExecutionTokenBrand]: true }
```

```ts type-equiv
/**
 * Caller-supplied description of one tool call. {@link ToolRuntime.execute}
 * adds the registry-owned token to form a pipeline {@link ToolExecution};
 * callers do not choose that token.
 */
interface ToolExecutionInput {
  readonly callId: ToolCallId
  /**
   * Root model-requested call owning this execution tree. Callers omit it for
   * a root execution; nested dispatchers propagate the enclosing value.
   */
  readonly rootCallId?: ToolCallId
  readonly name: string
  /** Losslessly JSON-serializable parsed arguments (tools validate their own schema). */
  readonly arguments: unknown
  /** The agent on whose behalf the call runs (set by the agent loop). */
  readonly agent?: Agent
  /**
   * Opaque token of the enclosing transport execution, when one exists. PTC
   * mode sets this on SDK sub-dispatches so commit-style observers can wait for
   * the outer `run_code` outcome without receiving its live mutable execution.
   * The token also marks the call as a transport sub-dispatch rather than a
   * model-direct call: under `mode: 'ptc'`, only calls WITH a parent may
   * execute a native tool name — a model-direct call (no parent) is denied as
   * `UNKNOWN_TOOL` before the policy pipeline. See {@link ToolRuntime.execute}.
   */
  readonly parent?: ToolExecutionToken
  /** Required caller-owned cancellation for this invocation. */
  readonly signal: AbortSignal
}
```

Ein Tool-Body empfängt die Runtime-Erweiterung. `deferContext()` hängt Kontext an das eigene Ergebnis dieser Execution an — der Composite-Tool-Nested-Dispatch-Kanal, auch von einem Leaf-Tool verwendbar, das eine Plugin-quellende Instruktion prägt — ohne Injektion innerhalb des noch offenen äußeren Aufrufs.

```ts type-equiv
/**
 * Runtime context handed to a tool implementation after the registry has
 * accepted a {@link ToolExecution}. {@link deferContext} attaches context to
 * this execution's own result — a composite tool ferries nested-dispatch
 * context back to the outer result, and a leaf tool may mint a fresh
 * plugin-sourced instruction; the loop appends it only after the
 * `tool/result`.
 */
interface ToolRunContext extends ToolExecution {
  /**
   * Defer one context — typically a nested-dispatch context ferried by a
   * composite tool, or a fresh plugin-sourced instruction — until this tool's
   * final result reaches the agent loop. Contexts retain their individual
   * source and metadata and are emitted in call order.
   */
  deferContext(context: UserMessage): void
  /**
   * Mark a successful final result as terminal for the current agent turn.
   * The marker rides this execution's own result (`concludesTurn` exists only
   * on {@link ToolExecutionSuccess}); a composite that dispatches nested
   * calls forwards it from the nested result, exactly like
   * `additionalContexts`, so only an authoritative nested success can
   * conclude the enclosing run.
   */
  concludeTurn(): void
}
```

Der Agent-Loop fragt die Registry nach dem Ausführungsmodus jedes ausstehenden Aufrufs ab und nutzt ihn, um exklusive Barrieren und Rolling-Pool-Parallel-Läufe zu bilden:

```ts type-equiv
/**
 * Scheduling mode for one pending call. `parallel` may overlap with siblings;
 * `exclusive` runs alone and forms an ordering barrier.
 */
type ToolExecutionMode =
  | { kind: 'parallel' }
  | { kind: 'exclusive' }
```

Die PTC-Mode-Bridge legt zusätzlich jeden abgeschlossenen Sub-Dispatch dem `tools/ptc-dispatch-log`-Waterfall offen, der die Content-Kopie des dauerhaften Ereignisses ändern kann (der Wert des Programms und das modellseitige Ergebnis bleiben unangetastet):

```ts type-equiv
/**
 * One settled `run_code` sub-dispatch about to be logged, as seen by the
 * `tools/ptc-dispatch-log` waterfall: the parent execution (session owner,
 * outer call identity), the sub-call identity, and the outcome whose durable
 * copy a listener may reshape. `content` is the RENDERED result projection
 * (what a native `tool/result` would carry) — the program itself received
 * the structured `value` (or just the error message on failure); only the
 * `tool/ptc-dispatch` event's copy changes.
 */
interface PtcDispatchLog {
  /** The outer `run_code` execution. */
  readonly exec: ToolExecution
  /** The calling agent (the scope routing key and the spill owner), when the outer call has one. */
  readonly agent?: Agent
  /** Opaque sub-call id; new calls use `<parent>:ptc:<n>`. */
  readonly subCallId: ToolCallId
  /** The dispatched sub-tool name. */
  readonly name: string
  /** Whether the sub-call settled as an error. */
  readonly isError: boolean
  /** The sub-call's complete model-facing content (the settle event's default payload). */
  readonly content: ContentBlock[]
}
```

```ts type-equiv
/**
 * One pending tool call inside the registry pipeline. Parsed arguments cross
 * one lossless-JSON materialization boundary before policy and are deep-frozen;
 * call identity, the caller signal, and the registry-assigned {@link token} are
 * readonly. The registry freezes the complete object before `tools/result`
 * observers run.
 */
interface ToolExecution extends ToolExecutionInput {
  /** Root model-requested call, resolved for every root and nested execution. */
  readonly rootCallId: ToolCallId
  /** Registry-assigned identity shared with nested calls only as their opaque `parent` token. */
  readonly token: ToolExecutionToken
}
```

```ts type-equiv
/**
 * Around-dispatch view of a {@link ToolExecution}. A `tools/execute` wrapper
 * may replace the signal for its delegated lifetime, but it cannot remove it.
 * The registry fuses every replacement with the captured caller signal.
 */
interface ToolDispatchExecution extends Omit<ToolExecution, 'signal'> {
  /** Cancellation signal visible to the next wrapper or tool body. */
  signal: AbortSignal
}
```

`ToolExecutionToken` ist ein opakes Runtime-`Symbol`, das nur für Identitätsvergleich verwendet wird. Vor der Policy materialisiert und friert `execute()` Argumente ein, lehnt Nicht-JSON-Eingaben ab und weist das Token zu. Identitätsfelder, das erforderliche Caller-Signal und das optionale Parent-Token bleiben Readonly. Ein `ToolDispatchExecution`-Wrapper darf das Signal ersetzen, aber nicht entfernen; die Registry führt das Caller-Signal vor dem Aufruf des Tool-Bodys wieder zusammen. Endgültige Beobachter empfangen die eingefrorene Execution-Identität.

Ein `ToolGuard` ist eine Scope-bewusste finale Pre-Dispatch-Policy. Sein Rückgabetyp hat bewusst kein Allow-Ergebnis: `undefined` wahrt die Waterfall-Entscheidung, während ein zurückgegebener Reason nur die Berechtigung reduzieren kann, sodass ein späterer Listener sie nicht rückgängig machen kann.

```ts type-equiv
/**
 * A monotonic execution guard evaluated after every `tools/pre-execute`
 * listener and before the tool body. Returning a reason denies the call;
 * returning `undefined` leaves it unchanged. Because guards have no allow
 * result, listener ordering cannot turn a denial back into permission.
 * @param execution - the identity-protected call after extensible pre-execute policy completed.
 * @returns a final denial reason, or `undefined` to leave the call allowed.
 */
type ToolGuard = (execution: Readonly<ToolExecution>) => string | undefined
```

```ts type-equiv
/** Canonical failure detail; internal routing information remains optional. */
interface ToolFailure {
  /** Human-readable failure message without the Native `Error: ` envelope. */
  message: string
  /** Internal error class/code used by policy and durable diagnostics. */
  info?: ToolErrorInfo
}
```

```ts type-equiv
/** Successful canonical tool execution, including its Native/model projection. */
interface ToolExecutionSuccess {
  readonly isError: false
  /** Execution-local canonical value; deliberately omitted from durable events. */
  readonly value: JsonValue
  readonly content: ContentBlock[]
  readonly error?: never
  readonly meta?: JsonValue
  readonly additionalContexts?: UserMessage[]
  /** The agent loop stops after committing this successful result batch. */
  readonly concludesTurn?: true
}
```

```ts type-equiv
/** Failed canonical tool execution; failures never carry a successful value. */
interface ToolExecutionFailure {
  readonly isError: true
  readonly error: ToolFailure
  readonly value?: never
  readonly content: ContentBlock[]
  readonly meta?: JsonValue
  readonly additionalContexts?: UserMessage[]
  readonly concludesTurn?: never
}
```

```ts type-equiv
/** The discriminated, execution-local outcome of one tool call. */
type ToolExecutionResult = ToolExecutionSuccess | ToolExecutionFailure
```

Das Ergebnis trägt nur das Outcome. Die Aufrufidentität bleibt auf der unveränderlichen `ToolExecution`, die es durch jeden Hook begleitet, und auf den dauerhaften `tool/call`-/`tool/result`-Session-Ereignissen, sodass Wrapper keine zweite, widersprüchliche Identität erzeugen können. Der kanonische `value` ist Execution-lokal: der Loop persistiert nur `content`, `error` und `meta`, während `tool/ptc-dispatch` den gerenderten `content` und `isError` des Sub-Aufrufs unverändert speichert. Replay reproduziert die Präsentation, kann aber kanonische Zwischenwerte nicht rekonstruieren.

Bei Erfolg snapshottet und validiert die Registry den Body-Wert, friert ihn ein und ruft den reinen Renderer plus den optionalen Top-Level-Call-Metadaten-Projektor auf. Sie materialisiert die dauerhaften Präsentationsfelder separat unmittelbar vor `tools/result`; ein ungültiger Wert, ein Renderer/Projektor-Fehler oder eine Nicht-JSON-Präsentation wird zu einem JSON-sicheren `isError`. Der endgültige Live-Beobachter sieht daher den exakten Execution-lokalen Wert neben Feldern, die für das spätere dauerhafte Anhängen sicher sind.

Vor dem finalen Content materialisiert die Registry das Kandidaten-Ergebnis; ein Fehler in Content, strukturiertem Fehler, zusätzlichem Kontext oder Präsentationsmetadaten wird zu einem JSON-sicheren `isError`-Ergebnis, das `finalizeContent` noch erreicht. Die Registry ruft diesen Callback genau einmal auf, dann materialisiert und friert sie das akzeptierte Ergebnis unmittelbar vor `tools/result` ein, sodass das beobachtete Live-Outcome für das spätere dauerhafte `tool/result`-Anhängen sicher ist.

Jeder Interception-Waterfall gibt eine typisierte **Decision** zurück (das Idiom, das mit den `agent/*`-Waterfalls geteilt wird). `tools/pre-execute`-Listener empfangen `(exec, next)` und geben eine `PreToolDecision` zurück; `tools/execute`-Wrapper geben eine `ToolExecutionResult` zurück; `tools/post-execute`-Listener empfangen `(exec, result, next)` und geben eine `PostToolDecision` zurück:

```ts type-equiv
/**
 * Pre-dispatch decision. `allow` runs the call; `deny` materializes an error;
 * `ask` runs only after an approval service returns `allowed-once` and otherwise
 * denies. Input rewriting is excluded because arguments are already logged and
 * presented.
 */
type PreToolDecision =
  | { kind: 'allow' }
  | { kind: 'deny'; reason: string }
  | { kind: 'ask'; reason?: string }
```

```ts type-equiv
/**
 * Post-dispatch decision: accept, replace one projection, attach context for the
 * next request, or block by turning corrective feedback into an error result.
 */
type PostToolDecision =
  | { kind: 'accept'; content?: ContentBlock[]; value?: never; additionalContexts?: UserMessage[] }
  | { kind: 'accept'; value: JsonValue; content?: never; additionalContexts?: UserMessage[] }
  | { kind: 'block'; feedback: ContentBlock[]; additionalContexts?: UserMessage[] }
```

`next()` für die Standardentscheidung aufrufen oder eine Decision zurückgeben, um kurzuschließen. Pre-Policy darf deny oder ask; nur `allowed-once` führt weiter, während eine Nicht-Gewährung, ein fehlender Approval-Kanal oder -Dienst oder eine Agent-lose Anfrage zu einer Denial wird. Guards können weiterhin eine finale Denial auferlegen. Argumente können nicht umgeschrieben werden, da Verlauf, Audit, UI und Ausführung übereinstimmen müssen.

Post-Policy darf entweder Content oder Value ersetzen, niemals beides. Content-Ersatz wahrt den kanonischen Wert und bestehende Metadaten; Value-Ersatz wird revalidiert und berechnet Content/Metadaten neu; ein Block entfernt den Wert und wird zu einem `isError` mit korrigierendem Feedback. Content-Ersatz ist Präsentations-Policy, nicht Vertraulichkeits-Policy: ein Listener, der den programmatischen Wert verbergen muss, blockiert oder ersetzt ihn. `tools/result` empfängt die eingefrorene Execution und das Ergebnis nach Normalisierung; Beobachter können sie nicht transformieren und Beobachter-Fehler werden eingegrenzt. Unbekannte und werfende Tools werden beide zu strukturierten Fehlern (`ToolNotFoundError` mapt zu `UNKNOWN_TOOL`), sodass der Aufruf fehlschlägt, ohne den Turn zu beenden.

## Die erzwungene Raw-JSON-Schema-Teilmenge

Raw-Schemas von Subagents, Workflows, MCP und dynamischen Registrierungen verwenden das Wire-Level-Gegenstück der Autor-DSL. `assertSupportedJsonSchema()` akzeptiert jeden JSON-Root, `validateJsonSchemaValue()` erzwingt es und `JsonSchemaError` meldet jeden nicht unterstützten oder fehlerhaften Schema-Pfad. Der leere nur-Annotationen-Knoten bedeutet unbeschränktes verlustfreies JSON. `oneOf` erfordert mindestens zwei Branches und ein Wert muss genau einem entsprechen. Consumer, die weiterhin einen Objekt-Root erfordern, rufen `assertObjectJsonSchema()` auf und tragen `ObjectJsonSchema`; so bleibt der durch Aufrufer definierte strukturierte Output von Subagent/Workflow objekt-gerootet, ohne das geteilte Vokabular einzuschränken.

```ts type-equiv
/** Scalar JSON values supported by `enum` and `const`. */
type JsonSchemaScalar = string | number | boolean | null
```

```ts type-equiv
/** Single-type keywords accepted by the enforced subset. */
type JsonSchemaType = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null'
```

```ts type-equiv
/**
 * One raw JSON Schema node in the enforced subset. The optional fields express
 * the external wire schema; {@link assertSupportedJsonSchema} rejects invalid
 * combinations before a caller treats the node as trusted.
 */
interface JsonSchemaNode {
  /** Omit with no constraints for any JSON value, or use `oneOf`. */
  type?: JsonSchemaType
  /** Exactly one branch must validate; at least two branches are required. */
  oneOf?: JsonSchemaNode[]
  /** Nested property schemas (`type: 'object'` only). */
  properties?: Record<string, JsonSchemaNode>
  /** Required property names; each must appear in `properties`. */
  required?: string[]
  /** `false` rejects undeclared keys; absent/`true` follows JSON Schema's open default. */
  additionalProperties?: boolean
  /** Item schema (`type: 'array'` only); absent accepts any JSON item. */
  items?: JsonSchemaNode
  /** Allowed values for a scalar node. */
  enum?: JsonSchemaScalar[]
  /** The single allowed value for a scalar node. */
  const?: JsonSchemaScalar
  /** Annotation, ignored for validation. */
  description?: string
  /** Annotation, ignored for validation. */
  title?: string
  /** Annotation, ignored for validation but required to be lossless JSON. */
  default?: JsonValue
  /** Annotation, ignored for validation but required to be lossless JSON. */
  examples?: JsonValue
}
```

```ts type-equiv
/** A consumer-constrained object-rooted schema. */
type ObjectJsonSchema = JsonSchemaNode & { type: 'object' }
```

## Tool-Präsentations-UI-Vokabular

Wie ein Tool seinen Aufruf in einer UI präsentiert haben möchte (eine Editor-Tool-Call-Karte, eine CLI-Logzeile), Provider-neutral, sodass ein Tool sich selbst beschreibt, ohne von einem Client-Protokoll abzuhängen. `presentCall`/`presentResult` geben eine **`card`-getaggte Render-Intent** zurück — eine Discriminated Union, auf die eine UI-Bridge switcht:

- `ToolCallView` (pending): `{ card: 'generic', title, kind?, rawInput?, content?, locations? }` (die Standardkarte; `locations` ist `{ path, line? }[]` Dateien, die der Aufruf liest/ändert, für Editor-Nachverfolgung), `{ card: 'terminal', title, description?, cwd? }` (ein Shell-Befehl → eine Terminal-Karte), oder `{ card: 'diff', title, diffs, locations? }` (eine Datei-Erstellung/-Änderung → eine Inline-Diff-Karte; `diffs` ist `{ path, oldText, newText }[]`, `oldText: null` für eine neue Datei).
- `ToolResultView` (completed): `{ card: 'generic', title?, content? }`, `{ card: 'terminal', title?, output?, exitCode?, signal? }` (die erfasste Ausgabe + Exit; eine fähige UI zeigt einen Exit-Status-Pill, während eine andere einen fenced ` ```console `-Fallback ableiten kann), `{ card: 'diff', title?, diffs }` (eine abgeschlossene Datei-Mutation → die anzuzeigende Änderung, typischerweise die angewandten Hunks mit Kontextzeilen, berechnet aus dem Before/After-Content, oder ein Whole-File-Diff, wenn es kein Before-Image gibt), `{ card: 'search', shape, title?, truncated, total, … }` (eine abgeschlossene Discovery-Suche → nach-Datei-gruppierte Matches für `shape: 'matches'` (grep) oder eine flache Pfadliste für `shape: 'paths'` (glob); `truncated`/`total` melden, ob das Inline-Ergebnis begrenzt wurde, damit eine UI niemals ein Teil-Ergebnis als vollständig präsentiert; die View trägt keinen Ergebnis-Text — eine UI ohne Search-Karte fällt auf den rohen Ergebnis-Content zurück), `{ card: 'read', title?, path, offset, lines, totalLines, lang?, content? }` (ein abgeschlossener Datei-Lesezugriff → eine zeilennummerierte, optional syntax-highlightende Code-View; `offset` ist die 1-basierte erste Zeile, die das Fenster angefordert hat, auch beibehalten wenn `lines` leer ist; `lang` ist ein Sprach-Hint von der Erweiterung, und `content` ist der envelope-stripped Text, auf den eine UI ohne Lese-Unterstützung zurückfällt), oder `{ card: 'web', kind: 'search' | 'fetch', title?, … }` (ein abgeschlossener Web-Retrieval; `kind: 'search'` trägt die strukturierten `sources`/`answer?`/`truncated`, `kind: 'fetch'` trägt `url`/`statusCode`/`truncated`, und eine UI ohne `web`-Capability fällt auf den rohen Ergebnis-Content zurück — der Body wird nicht in die View dupliziert). Completed-Views ersetzen Pending-Views, sodass Mutations-Tools ein Diff-Ergebnis zurückgeben, selbst wenn es das Call-Time-Snippet dupliziert; eine Search und ein Web-Retrieval haben kein `card`-Call-Time-Äquivalent (ihr Pending-Zustand bleibt eine generische Karte, da das strukturierte Ergebnis erst nach `execute` existiert).

`ToolCallKind` (`'read' | 'edit' | 'delete' | 'move' | 'search' | 'execute' | 'fetch' | 'other'`) wählt ein Icon auf einer generischen Karte. `FileLocation` (`{ path, line? }`), `FileDiff` (`{ path, oldText, newText }`) und `ReadFileLine` (`{ number, text }`, eine 1-basierte nummerierte Zeile eines Lese-Fensters) sind das geteilte Datei-Karten-Vokabular. Das Design ist im [Render-Intent-Union Agent Note](../../.agents/notes/implemented/architecture/2026-07-02-tool-render-intent-union.de.md) fixiert; Host/Client-Runtimes projizieren dieses neutrale Vokabular in ihre eigenen Views.

Die vollständigen Präsentationsfeld-Dokumente liegen in [`packages/core/tools/src/presentation.ts`](../../packages/core/tools/src/presentation.ts). Das `bash`-Schema und der Executor sind auf [shell.md](shell.de.md); generische Hintergrund-Kontrollen sind auf [jobs.md](jobs.de.md).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.de.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxtools--toolruntime"></a>

### `ctx.tools` — `ToolRuntime`

Tool registry and execution pipeline. Scoped registrations shadow globals; one visibility resolver feeds presentation, lookup, and dispatch.

```ts cordis-catalog
/**
 * Present the calling scope's tools in `mode` instead of the deployment
 * default. Nearest scope on the chain wins, so a preset's standing
 * declaration covers every agent joined under it.
 *
 * Scoped only, and one declaration per scope: this is how an agent preset
 * composes PTC mode agents beside native ones in the same process, and a
 * process-global override would be the `mode` config field instead.
 * @param mode - the presentation the covered agents' models see.
 * @returns the exact disposer that restores the deployment default.
 */
presentAs(mode: ToolPresentationMode): () => void

/**
 * Register globally or in the calling agent scope. Scoped tools shadow
 * globals; duplicates within one layer and the reserved `run_code` name fail.
 * @param definition - tool schema, execution, and optional finalization/presentation callbacks.
 * @returns the exact disposer that unregisters the tool.
 */
register(definition: ToolDefinition): () => void

/**
 * Restrict global tools for the calling agent scope. Empty filters, unknown
 * names, scope-local names, and reserved transport names fail. Restrictions
 * intersect; scoped registrations remain visible.
 * @param filter - global-tool mask: `allow` (keep only) and/or `deny` (remove).
 * @returns the exact disposer that lifts this restriction.
 */
restrict(filter: ToolRestriction): () => void

/**
 * Register a monotonic guard after the extensible `tools/pre-execute`
 * waterfall. A plain-context guard applies globally; one registered through
 * `agent.ctx` applies only to that agent. Any matching guard may deny by
 * returning a reason, while no guard can force-allow a call another guard
 * denied. The exact effect disposer is returned for ordered ownership and
 * HMR cleanup.
 * @param guard - synchronous check; a returned string denies the execution.
 * @returns the exact disposer that unregisters the guard.
 */
guard(guard: ToolGuard): () => void

/**
 * Look up a tool as one scope sees it (scoped
 * shadows global; a restricted-away global reads as absent). Presenters pass
 * the calling agent so the rendered card matches the definition that
 * actually executed.
 * @param name - the tool name as registered.
 * @param scope - the viewing scope (the agent); omitted = the global view.
 * @returns the definition the scope resolves, or undefined when none is visible.
 */
get(name: string, scope?: ScopeKey): ToolDefinition | undefined

/**
 * Project visible definitions onto the allowlisted model-facing schema fields,
 * excluding execution and presentation callbacks.
 * @param scope - the viewing scope (the agent); omitted = the global view.
 * @returns one deep-cloned schema per visible tool.
 */
schemas(scope?: ScopeKey): ToolSchema[]

/**
 * Classify a pending call through the caller's visible tool definition. Only
 * an exact `true` is parallel; unknown, hidden, undeclared, invalid, or
 * throwing classifiers are exclusive.
 * @param exec - call name, parsed arguments, and optional agent scope.
 * @returns the fail-closed scheduling mode.
 */
executionMode(exec: ToolExecutionInput): ToolExecutionMode

/**
 * Execute through pre-policy, guards, around-dispatch, post-policy,
 * definition-owned content finalization, and final notification. Tool and
 * listener failures resolve as materialized error results; an invisible tool
 * reports `UNKNOWN_TOOL`. The returned outcome is the same lossless, frozen
 * snapshot final observers receive. Cancellation
 * arriving after entry and before final result materialization skips a
 * not-yet-started body with `ABORTED_BEFORE_DISPATCH` or replaces a
 * successful started outcome with `ABORTED`; already-started work is still
 * drained and may retain a tool-owned structured error.
 * @param exec - the typed same-process call input. The registry assigns its
 *   correlation token before policy begins.
 * @returns the materialized final result.
 */
async execute(exec: ToolExecutionInput): Promise<ToolExecutionResult>
```

Types: [ScopeKey](scope.de.md)

Source: [`packages/core/tools/src/index.ts`](../../packages/core/tools/src/index.ts)

<a id="tools-events"></a>

### `tools/*` events

<a id="toolschange--emit"></a>

#### `tools/change` — emit

A tool was registered or unregistered, or a scoped restriction changed (the available tool set changed — possibly for one scope only). An UNFILTERED registry-subject notification, deliberately not scope-filtered dispatch: a global change concerns every agent's next assembly, so a scoped listener subscribing here sees every change, not just its own scope's.

```ts cordis-catalog
/**
 * A tool was registered or unregistered, or a scoped restriction changed
 * (the available tool set changed — possibly for one scope only). An
 * UNFILTERED registry-subject notification, deliberately not scope-filtered
 * dispatch: a global change concerns every agent's next assembly, so a
 * scoped listener subscribing here sees every change, not just its own
 * scope's.
 * @mode emit
 */
'tools/change'(): void
```

Source: [`packages/core/tools/src/index.ts`](../../packages/core/tools/src/index.ts)

<a id="toolsexecute--waterfall"></a>

#### `tools/execute` — waterfall

Around-dispatch waterfall for timeout, retry, or metrics. `next()` returns a normalized result; wrappers may change only `exec.signal`, while call identity remains immutable. The registry re-fuses the original caller signal before the body, so replacement cannot detach caller cancellation; wrappers must still restore their signal and reach quiescence. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent's calls.

```ts cordis-catalog
/**
 * Around-dispatch waterfall for timeout, retry, or metrics. `next()` returns
 * a normalized result; wrappers may change only `exec.signal`, while call
 * identity remains immutable. The registry re-fuses the original caller
 * signal before the body, so replacement cannot detach caller cancellation;
 * wrappers must still restore their signal and reach quiescence.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent's calls.
 * @param exec - the allowed call about to dispatch (name, parsed arguments, caller agent, signal).
 * @mode waterfall
 */
'tools/execute'(this: Scoped<ToolRuntime>, exec: ToolDispatchExecution, next: () => Promise<ToolExecutionResult>): Promise<ToolExecutionResult>
```

Types: [Scoped](scope.de.md)

Source: [`packages/core/tools/src/index.ts`](../../packages/core/tools/src/index.ts)

<a id="toolspost-execute--waterfall"></a>

#### `tools/post-execute` — waterfall

Accept, replace, enrich, or block a normalized dispatch result. `next()` accepts it unchanged; thrown tools still reach this waterfall as errors. Async listeners must observe `exec.signal`; after they settle, caller cancellation replaces only a successful accepted outcome with the code selected by whether the tool body was invoked. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent's calls.

```ts cordis-catalog
/**
 * Accept, replace, enrich, or block a normalized dispatch result. `next()`
 * accepts it unchanged; thrown tools still reach this waterfall as errors. Async
 * listeners must observe `exec.signal`; after they settle, caller
 * cancellation replaces only a successful accepted outcome with the code
 * selected by whether the tool body was invoked.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent's calls.
 * @param exec - the call that just ran (name, parsed arguments, caller agent).
 * @param result - the dispatch outcome a listener may accept, replace, or block.
 * @mode waterfall
 */
'tools/post-execute'(this: Scoped<ToolRuntime>, exec: ToolExecution, result: Readonly<ToolExecutionResult>, next: () => Promise<PostToolDecision>): Promise<PostToolDecision>
```

Types: [Scoped](scope.de.md)

Source: [`packages/core/tools/src/index.ts`](../../packages/core/tools/src/index.ts)

<a id="toolspre-execute--waterfall"></a>

#### `tools/pre-execute` — waterfall

Allow, deny, or ask before dispatch. `next()` delegates to allow; missing approval support turns `ask` into denial. Async gates must observe `exec.signal`; the registry rechecks cancellation after they settle but never abandons their promise. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent's calls.

```ts cordis-catalog
/**
 * Allow, deny, or ask before dispatch. `next()` delegates to allow; missing
 * approval support turns `ask` into denial. Async gates must observe
 * `exec.signal`; the registry rechecks cancellation after they settle but
 * never abandons their promise.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent's calls.
 * @param exec - the pending call (name, parsed arguments, caller agent).
 * @mode waterfall
 */
'tools/pre-execute'(this: Scoped<ToolRuntime>, exec: ToolExecution, next: () => Promise<PreToolDecision>): Promise<PreToolDecision>
```

Types: [Scoped](scope.de.md)

Source: [`packages/core/tools/src/index.ts`](../../packages/core/tools/src/index.ts)

<a id="toolsptc-dispatch-log--waterfall"></a>

#### `tools/ptc-dispatch-log` — waterfall

Allow a listener to replace content in the DURABLE LOG COPY of one `run_code` sub-dispatch outcome before the bridge appends its `tool/ptc-dispatch` event. `next()` keeps the content unchanged; a listener may return replacement blocks (e.g. the spill policy's preview + locator for an oversized text result). Only the logged copy is affected — the program already received the complete value, and the model sees neither. A throwing listener is contained: the bridge falls back to logging the original settled content. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent's dispatches.

```ts cordis-catalog
/**
 * Allow a listener to replace content in the DURABLE LOG COPY of one
 * `run_code` sub-dispatch outcome before the bridge appends its
 * `tool/ptc-dispatch` event. `next()` keeps the
 * content unchanged; a listener may return replacement blocks (e.g. the
 * spill policy's preview + locator for an oversized text result). Only the
 * logged copy is affected — the program already received the complete
 * value, and the model sees neither. A throwing listener is contained:
 * the bridge falls back to logging the original settled content.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent's dispatches.
 * @param dispatch - the parent execution, sub-call identity, and the settled content to log.
 * @mode waterfall
 */
'tools/ptc-dispatch-log'(this: Scoped<ToolRuntime>, dispatch: PtcDispatchLog, next: () => Promise<ContentBlock[]>): Promise<ContentBlock[]>
```

Types: [ContentBlock](llm-streaming.de.md) · [Scoped](scope.de.md)

Source: [`packages/core/tools/src/index.ts`](../../packages/core/tools/src/index.ts)

<a id="toolsresult--emit"></a>

#### `tools/result` — emit

Observe the frozen, lossless-JSON final outcome. Listener failures are contained. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): keyed by `exec.agent`.

```ts cordis-catalog
/**
 * Observe the frozen, lossless-JSON final outcome. Listener failures are contained.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): keyed by `exec.agent`.
 * @param exec - the execution object that traversed the pipeline.
 * @param result - a deep-frozen snapshot of the final returned result.
 * @mode emit
 */
'tools/result'(this: Scoped<ToolRuntime>, exec: Readonly<ToolExecution>, result: Readonly<ToolExecutionResult>): undefined
```

Types: [Scoped](scope.de.md)

Source: [`packages/core/tools/src/index.ts`](../../packages/core/tools/src/index.ts)
<!-- END GENERATED cordis-surface -->
