# Compaction
[English](compaction.md) | [中文](compaction.zh.md) | Deutsch


Der Compaction-Seam — ein [Capability-Seam](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.de.md), aufgeteilt wie bash: Service Definition ([dsh-compaction](../../packages/compaction/compaction), `ctx.compaction`), Service Provider (ein Backend wie [dsh-compaction-basic](../../packages/compaction/compaction-basic)) und menschlicher Consumer ([dsh-command-compact](../../packages/compaction/command-compact)). Compaction ist **eine optionale Capability**, nicht Teil der Agent-Loop-Spine — deshalb lebt ihr Vokabular hier, nicht in [core.md](core.de.md). Ein tokenizer- oder templatebasiertes Backend ist ein Sibling-Package, das dasselbe Interface implementiert. Anders als bash hängt das Interface notwendigerweise von `dsh-session` und `dsh-llm` ab: seine Verben agieren auf einer agent-eigenen `Session`, und sein durable Summary-Event verwendet das `ContentBlock`-Vokabular (siehe die [Compaction-Capability-Seam Agent Note](../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.de.md)).

Quelle: [`packages/compaction/compaction/src/types.ts`](../../packages/compaction/compaction/src/types.ts)

## Die `compaction/*`-Session-Events

Compaction erweitert [`SessionEventMap`](session.de.md) per Declaration Merging um drei Event-Typen. Alle drei sind **nur Log** — sie zeichnen Lock, Summary, gewählte Range, beschattete Event-Seqs, Token-Anzahl und Modellaufruf auf, ohne der Surface beizutreten. `SurfaceEventType` wird bewusst NICHT erweitert (nur message-produzierende Events erreichen das Modell), daher fährt die Summary selbst auf einer separaten `user/message` mit `surfaceOp: { op: 'replace', startSeq, endSeq }` mit — der einzigen Surface-Mutation, die Summary-Compaction ausführt. Die [Agent Note](../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.de.md) besitzt die Begründung für die Wiederverwendung von `user/message`.

| Event | Payload | Rolle |
|---|---|---|
| `compaction/start` | `{ turn }` | erwirbt den log-aufgezeichneten Lock; eine Zahl identifiziert den offenen automatischen Turn, während `null` einen eigenständigen manuellen Versuch identifiziert |
| `compaction/summary` | `{ summary, rawOutput?, llmStreamCall?, shadowedRange, shadowedSeqs, shadowedTokenCount, provider, model, maxTokens?, usage? }` | die sichere Summary-Projektion, optional vollständiger Provider-Output und Usage, ein `llmStreamCall: true`-Marker, wenn das Erzeugen des Ergebnisses exakt einen Aufruf über `ctx.llm.stream()` dieses Kontexts konsumiert hat (was vollständiges `rawOutput` erfordert), das beschattete Surface-Boundary-Paar (`start`/`end`-Seqs — ein Positionsspann, kein numerisches Intervall), die beschatteten Seqs in Surface-Reihenfolge, die geschätzte Token-Anzahl und der Envelope des Summarize-Calls (`provider`, `model`, plus dessen Generation-Cap, falls eines galt) — geloggt, damit der One-Shot-Request aus Log + Code rekonstruierbar ist (die Reconstructability Agent Note); unmarkiertes `rawOutput` identifiziert den Call-Pfad nicht |
| `compaction/end` | `{ turn, error? }` | gibt den Lock mit demselben numerischen-oder-`null`-Owner frei (`error` zeichnet einen erfolglosen Versuch auf) |

Der Lock umfasst die **gesamte** Operation: zuerst wird `compaction/start` angehängt, dann landen Summarization, der `compaction/summary`-Record und die `user/message`-Ersetzung, und erst dann `compaction/end`. Das zuletzt-Freigeben des Locks verwandelt einen Crash mitten in der Operation in einen detektierbaren verwaisten Lock (ein `compaction/start` ohne passendes `compaction/end`) statt in ein `compaction/end`, das fälschlich behauptet, Compaction sei abgeschlossen.

Die Marker sind Lock-Zeitpunkte, kein exklusiver Container. Eine unzusammenhängende Idle-Injection kann zwischen einem eigenständigen manuellen Start und End erscheinen, während die Summarization pending ist. Der manuelle Pfad revalidiert nur seinen gewählten Positions-Spann, sodass dieser injizierte Kontext nach dem Replacement-Checkpoint überlebt. Ein aktiver ungematchter Start blockiert jeden Einstiegspunkt; ein ungematchter Start vor einem neueren `session/end-seed` ist stale Evidenz aus einem früheren Lifecycle und wird ignoriert.

Diese Varianten werden innerhalb eines `declare module '@deepseek-ai/dsh-session/types'`-Blocks gemergt, sodass sie — anders als die Top-Level-Typen auf den anderen Subsystem-Seiten — nicht als drift-geprüfter ` ```ts type-equiv `-Block eingefügt werden (der `verify-type-equiv`-Extraktor matcht nur Top-Level-Deklarationen per Name). Die Payload-Tabelle oben ist der Katalogeintrag; für die autoritativen Felder folge dem Source-Link.

## `CompactionResult`

Was eine erfolgreiche Compaction ihrem Aufrufer zurückgibt: die Bookkeeping-Event-Seqs, die sichere Summary-Projektion, beschattete Range und Seqs sowie die geschätzte Token-Anzahl.

```ts type-equiv
/** Result of a successful compaction operation. */
interface CompactionResult {
  /** Stable identity shared by this compaction's complete durable lifecycle. */
  compactionId: CompactionId
  /** Human command that initiated this compaction, when it was manual. */
  sourceCommandId?: CommandId
  /** The seq of the appended `compaction/start` event. */
  startSeq: SessionSeq
  /** The seq of the appended `compaction/summary` event. */
  summarySeq: SessionSeq
  /** The seq of the appended `compaction/end` event. */
  endSeq: SessionSeq
  /** The summary content blocks produced by the backend. */
  summary: ContentBlock[]
  /**
   * The surface-boundary pair that was shadowed: the seqs of the first
   * (`start`) and last (`end`) surface nodes of the replaced range. A
   * surface-POSITION span, not a numeric seq interval — after a prior replace
   * lands a fresh high-seq summary node at an older range's position, `start`
   * can be GREATER than `end`. {@link CompactionResult.shadowedSeqs} is the
   * authoritative set of shadowed nodes, in surface order.
   */
  shadowedRange: { start: SessionSeq; end: SessionSeq }
  /** The seqs of all shadowed surface nodes, in surface order. */
  shadowedSeqs: SessionSeq[]
  /** Estimated token count of the shadowed content. */
  shadowedTokenCount: number
}
```

## Der Service

Automatische Aufrufer geben an, warum Policy läuft; Implementierungen dürfen bestätigten Overflow aggressiver behandeln als gewöhnlichen Pressure.

```ts type-equiv
/** Why automatic policy is asking a backend to consider compaction. */
type CompactionTrigger = 'pressure' | 'context-overflow'
```

`CompactionEngine` exponiert `compactIfNeeded(agent, trigger, signal)` für automatische `pressure`- oder `context-overflow`-Policy, `compactNow(agent, signal)` für eine nützliche Idle-Session-Reduktion auch unterhalb von Pressure, und `compactRegion(...)` für eine explizite inklusive Surface-Range. `compactNow()` läuft als Agent-Maintenance zwischen Turns, gibt `null` ohne Schreiben zurück, wenn keine nützliche Range existiert, zeichnet eine eigenständige `turn: null`-Klammer vor der Summarization auf und flusht einen geschlossenen Versuch, bevor später gequeuete Prompts von der neuen Surface ableiten dürfen. Jedes Backend erzeugt seine Ersatz-`user/message`-Quelle mit `compactCheckpointSource(compactionId, sourceCommandId?)`; Client- und Wire-Consumer importieren diesen Konstruktor, `CompactionCheckpointSource` und `isCompactCheckpointSource()` aus dem cordis-freien `@deepseek-ai/dsh-compaction/checkpoint`-Subpath, während der Package-Root sie für Host-Consumer re-exportiert. Die erforderliche Transaktionsidentität korreliert den Replacement-Checkpoint, während das Prädikat die Erkennung unabhängig von jedem einzelnen Backend hält. Implementierungen müssen das gelieferte Signal an die Summarization weiterleiten. Der Seam besitzt keine Pricing-API: das Singleton [`ctx.tokenMeter`](token-meter.de.md) besitzt Schätzung und Replay direkt, während `dsh-compaction-basic` Retention, Event-Sequenzierung, geroutete Summarization-Calls und deren Konfiguration besitzt.

Erwartete manuelle Fehler verwenden `ManualCompactionErrorCode`:

```ts type-equiv
/** Expected failure classes for an explicit idle-session compaction request. */
type ManualCompactionErrorCode =
  | 'busy'
  | 'cancelled'
  | 'changed'
  | 'summary'
  | 'commit'
  | 'persistence'
```

`changed` und `summary` lassen die Konversations-Surface unverändert, schließen und persistieren den fehlgeschlagenen Versuch aber trotzdem im Log. `commit` kann auf partielle Mutation folgen; `persistence` bedeutet, die In-Memory-Klammer schloss, aber ihr Flush scheiterte. Cancellation bleibt separat und wirft nach dem erforderlichen Cleanup die exakte Abort-Reason.

Pressure-Compaction läuft am `agent/pre-step`-Waterfall vor der Request-Derivation. Sobald Pressure oder kanonischer Overflow qualifiziert, ruft compaction-basic vor der Range-Auswahl den optionalen [`ctx.toolResultPruner`](../../packages/compaction/compaction-tool-result-pruner/README.de.md) auf, misst über `ctx.tokenMeter` neu und kann die Surface ohne Summary voranbringen. Failed-Request-Recovery läuft über `agent/request-error`, nachdem der fehlgeschlagene Step schließt, und gibt eine Retry-Action nur zurück, wenn die Surface-Replacement-Generation voranschreitet — selbst wenn spätere Summary-Arbeit nach dem Pruning wirft; Cancellation gewinnt weiterhin. Regionsgrenzen bewahren Tool-Call/Result-Pairing, aber nicht ganze Turns, sodass früh geschlossene Steps eines überdimensionierten Turns kompaktierbar sind. `dsh-compaction-basic` besitzt Thresholds, Retained-Tail-Policy, Overflow-Caps und Fehlerbehandlung.

Die Service Definition exportiert `toolPairingBalancedBefore(session, seq)` und `toolPairingBalancedAfter(session, seq)` für die Tool-Call/Result-Pairing-Checks vor und nach einem Seq. Beide validieren die aktuelle Surface-Mitgliedschaft und lehnen fehlende Seqs und verwaiste Results ab; der [Package-Contract](../../packages/compaction/compaction/README.de.md#tool-pairing-boundaries) definiert ihr Cache-Verhalten.

## Tool-Result-Pruning-Ergebnisse

Der optionale Tool-Result-Pruning-Service meldet jede durable Content-Ersetzung und die aggregierte Unicode-Code-Point-Reduktion. Seine öffentlichen Ergebnistypen liegen in [`compaction-tool-result-pruner/src/types.ts`](../../packages/compaction/compaction-tool-result-pruner/src/types.ts).

```ts type-equiv
/** Cited source event and size accounting for one landed surface replacement. */
interface PrunedEntry {
  /** Full-fidelity tool-result event shadowed by the replacement. */
  readonly originalSeq: SessionSeq
  /** Newly appended pruned tool-result event. */
  readonly replacementSeq: SessionSeq
  /** Tool call shared by the original and replacement. */
  readonly callId: ToolCallId
  /** Original text size in Unicode code points. */
  readonly charsBefore: number
  /** Replacement text size in Unicode code points. */
  readonly charsAfter: number
}
```

```ts type-equiv
/** Aggregate outcome of one stable-surface pruning pass. */
interface PruneResult {
  /** Replacements in the snapshotted surface order. */
  readonly pruned: readonly PrunedEntry[]
  /** Total Unicode code points removed across replacements. */
  readonly charsRemoved: number
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.de.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxcompaction--compactionengine-abstract-seam"></a>

### `ctx.compaction` — `CompactionEngine` (abstract seam)

Abstract compaction service. Implementations own trigger policy, retention, and summarization, and may consume a separate measurement service. A successful run replaces the selected surface span with one summary node and prevents concurrent compaction of the same session. The replacement user message uses compactCheckpointSource with the transaction identity so consumers recognize and correlate it independently of the backend. Load one implementation per context as `ctx.compaction`.

```ts cordis-catalog
/**
 * Consider automatic compaction for one explicit trigger. Pressure policy
 * uses the latest durable routed request, while context-overflow policy may
 * force a useful balanced reduction even below the normal threshold. Return
 * `null` when no safe range can be compacted. A single oversized retained
 * unit or request envelope cannot be repaired through surface compaction.
 *
 * @param agent - agent context owning the session surface and routing options.
 * @param trigger - normal pressure or provider-confirmed context overflow.
 * @param signal - cancellation signal; model-backed implementations must forward it.
 * @returns the compaction result, or `null` if no compaction was needed.
 */
abstract compactIfNeeded( agent: CompactionAgentContext, trigger: CompactionTrigger, signal: AbortSignal, ): Promise<CompactionResult | null>

/**
 * Explicitly compact useful history even below automatic pressure thresholds.
 * Implementations synchronously start an idle task before any asynchronous
 * work, select a useful range without writing on a no-op, then
 * append a standalone `compaction/start` before summarization. That durable
 * marker is the compaction lock until one `compaction/end` attempt. Later waking
 * prompts remain accepted in FIFO order and start only after the optional
 * durability checkpoint and idle-task settlement. Context injected while the
 * summary runs may sit between the marker pair; only the selected span must
 * remain stable.
 *
 * @param agent - idle agent whose durable history should be compacted.
 * @param signal - cancellation scoped to this compaction request.
 * @param sourceCommandId - initiating command identity for a manual compaction.
 * @returns the compaction result, or `null` when no safe useful range exists.
 * @throws {@link ManualCompactionError} for expected busy, agent-cancellation,
 * changed-span, summarization/shrink, commit-stage, or persistence failures;
 * an aborted request preserves its exact abort reason. Failed attempts remain
 * visible in the log.
 */
abstract compactNow( agent: ManualCompactAgentContext, signal: AbortSignal, sourceCommandId?: CommandId, ): Promise<CompactionResult | null>

/**
 * Forcibly compact a range of surface nodes into a single summary node.
 * `start` and `end` name an inclusive span by surface position, not numeric seq
 * order; replacements can make visible seqs non-monotonic. Both edges must be
 * balanced so assistant tool calls remain paired with their results. A model-
 * backed implementation forwards cancellation and rejects active, missing,
 * reversed, or unbalanced ranges. The target session is `agent.session`.
 * Its replacement user message must use {@link compactCheckpointSource} with
 * the transaction's `CompactionId`.
 * Use {@link toolPairingBalancedBefore} and {@link toolPairingBalancedAfter}
 * for the edge checks.
 *
 * @param start - first surface seq, inclusive.
 * @param end - last surface seq, inclusive.
 * @param agent - context whose session is mutated and whose routing options guide summarization.
 * @param signal - optional cancellation; model-backed implementations must forward it.
 * @throws when compaction is active or the range is missing, reversed, or unbalanced.
 * @returns the appended event seqs, summary, replaced range, and token accounting.
 */
abstract compactRegion( start: SessionSeq, end: SessionSeq, agent: CompactionAgentContext, signal?: AbortSignal, ): Promise<CompactionResult>
```

Types: [CommandId](commands.de.md) · [SessionSeq](session.de.md)

Source: [`packages/compaction/compaction/src/index.ts`](../../packages/compaction/compaction/src/index.ts)

<a id="ctxtoolresultpruner--toolresultpruner"></a>

### `ctx.toolResultPruner` — `ToolResultPruner`

Deterministic head/middle/tail pruning for current tool-result surface nodes.

```ts cordis-catalog
/**
 * Measure text content in Unicode code points; non-text blocks cost zero.
 * @param blocks - tool-result content to measure.
 * @returns total Unicode code points across text blocks.
 */
measureContent(blocks: readonly ContentBlock[]): number

/**
 * Replace an over-budget text middle while retaining rich-block order.
 * Text slicing is by Unicode code point, not UTF-16 code unit, so a retained
 * boundary cannot split a surrogate pair. Grapheme clusters may still split.
 * @param blocks - original tool-result content.
 * @returns pruned content, or `null` when the text is within budget.
 */
pruneContent(blocks: readonly ContentBlock[]): ContentBlock[] | null

/**
 * Prune every over-budget tool result from one stable current-surface snapshot.
 * Each replacement preserves the complete event data except for `content`,
 * cites the shadowed node so replay can recover the replacement input, and is
 * immediately preceded by a `compaction/prune` shadow-price event pricing the
 * shadowed node through the injected token meter, so pure consumers can
 * subtract it without per-node state.
 * @param session - session whose current surface is rewritten.
 * @returns landed replacements and aggregate Unicode-code-point savings.
 * @throws when the session rejects a replacement; replacements committed
 * earlier in the pass remain durable.
 */
pruneSession(session: Session): PruneResult
```

Types: [ContentBlock](llm-streaming.de.md) · [Session](session.de.md)

Source: [`packages/compaction/compaction-tool-result-pruner/src/index.ts`](../../packages/compaction/compaction-tool-result-pruner/src/index.ts)
<!-- END GENERATED cordis-surface -->
