# LLM Streaming
[English](llm-streaming.md) | [中文](llm-streaming.zh.md) | Deutsch


Die Konversations- und Streaming-Typen aus [`packages/llm`](../../packages/llm/README.de.md): die `Message`/`ContentBlock`-Varianten, die jeder Request und die persistente Historie teilen, der vollständig assemblierte Modell-Request, das rohe `StreamChunk`-Protokoll, der Adapter-Contract, den jeder Adapter implementieren muss, sowie der gemeinsame Assembler. Die [Core-Pakete](core.de.md) halten und protokollieren diese Werte in jedem Turn; diese Seite deklariert sie.

Source: [`packages/llm/llm/src/types.ts`](../../packages/llm/llm/src/types.ts)

<a id="content-blocks-and-messages"></a>

## Content-Blocks und Messages

Eine Konversation besteht aus `Message`s; eine Message ist ein Array typisierter **Content-Blocks**. Die Block-Union wird aus `ContentBlockMap` abgeleitet.

Source: [`packages/llm/llm/src/types.ts`](../../packages/llm/llm/src/types.ts)

```ts type-equiv
/**
 * Merge-extensible content blocks keyed by `type`. New core blocks must land
 * with adapter, UI, and compaction support.
 */
interface ContentBlockMap {
  'text': TextBlock
  'reasoning': ReasoningBlock
  'image': ImageBlock
  'file': FileBlock
  'tool-call': ToolCallBlock
  'tool-result': ToolResultBlock
}
```

Die Block-Schnittstellen (vollständige Felder im Source): `TextBlock` (`text`), `ReasoningBlock` (Thinking, verschieden vom sichtbaren Text), `ImageBlock` (ein persistenter [Bild-Anhang](attachment.de.md)), `FileBlock` (ein persistenter wortwörtlicher [Datei-Anhang](attachment.de.md), den die Request-Assembly für jede Route als Handle-Text projiziert), `ToolCallBlock` (`id: ToolCallId`, `name`, rohes JSON `arguments`) und `ToolResultBlock` (`toolCallId`, verschachteltes `content: ContentBlock[]`, `isError?`). `ContentBlock = ContentBlockMap[ContentBlockType]`. Eine neue Modalität gehört nur dann in die merge-extensible Map, wenn Adapter, UI, Compaction und persistenter Replay-Pfad sie unterstützen.

Bildzugriff gehört zur Request-Serialisierung, nicht zum persistenten Anhang oder zur deterministischen Request-Image-Version. `resolveImageAttachmentAccess()` kombiniert den optionalen Host-Objekt-Pfad des Anhang-Providers mit einem Mapping, das der Consumer für das aktuelle Tool-Execution-Dateisystem bereitstellt. Das Ergebnis ist nur für diesen Request verfügbar und nimmt nicht an `variantId` teil.

Source: [`packages/llm/llm/src/content.ts`](../../packages/llm/llm/src/content.ts)

```ts type-equiv
/** Execution-world path that model tools can use to read one normalized attachment. */
interface ImageAttachmentAccess {
  /** Absolute path to immutable normalized bytes; callers must treat it as read-only. */
  readonlyPath: string
}
```

Source: [`packages/llm/llm/src/message.ts`](../../packages/llm/llm/src/message.ts)

Eine `Message` ist ein identifizierter, unveränderlicher Role-/Source-/Content-Wert. Modellgenerierte Assistant-Messages benennen den Provider und das Modell, die sie erzeugt haben, und tragen optionale adapter-private Replay-Daten in ihrer Source:

```ts type-equiv
/** Provider/model identity and adapter-private replay data for an assistant message. */
interface AssistantProvenance {
  /** Provider route that produced the message. */
  provider: string
  /** Provider model id that produced the message. */
  model: string
  /**
   * Lossless-JSON adapter state needed to replay the provider response.
   * `LlmRuntime` exposes it to a target adapter only when that adapter instance
   * currently owns both this historical provider and the target provider.
   */
  replayState?: unknown
}
```

```ts type-equiv
/** One immutable message representation shared by delivery, durable history, and model requests. */
interface Message {
  /** Stable identity preserved across every representation boundary. */
  readonly id: MessageId
  /** Provider-neutral conversation role. */
  readonly role: 'system' | 'user' | 'assistant'
  /** Exact model-facing blocks. */
  readonly content: ContentBlock[]
  /** Required source fields supplied by the producer. */
  readonly source: MessageSource
}
```

Woher eine Message stammt, ist selbst ein merge-extensiver Summentyp:

```ts type-equiv
/**
 * Where a message (or injected content) came from.
 * Merge-extensible sum type — plugins add their own `kind`s.
 */
interface MessageSourceMap {
  user: { kind: 'user' }
  plugin: { kind: 'plugin'; plugin: string } & ContextFormed
  model: ModelMessageSource
  tool: ToolMessageSource
}
```

Producer-Identität und Präsentationsform sind unabhängig. `kind` beantwortet *wer dies erzeugt hat*; das optionale `form` beantwortet *was für eine Art Information dies ist*, und Consumer entscheiden, wie sie es präsentieren. Mehrere Producer können eine Form teilen, und ein Producer kann über eine Session hinweg mehr als eine Form emittieren. Die Werte sind semantisch und wachsen einzeln; ein abwesender oder nicht erkannter Wert verwendet den dokumentierten Default und wird als opaker Content präsentiert:

```ts type-equiv
/**
 * The kind of information in producer-supplied context, declared by the
 * producer beside its provenance.
 *
 * `MessageSource.kind` answers *who produced this*; `form` answers *what kind
 * of thing it is*, and the two axes are deliberately independent — several
 * producers share one form, and one producer may emit more than one form over
 * a session.
 *
 * The vocabulary is SEMANTIC, never visual: a value states that the content is
 * a file's instructions or a catalog of available items, and a consumer decides
 * what that looks like. Colors, icons, ordering, and collapse defaults are the
 * consumer's business and must not enter this union. It grows one value at a
 * time as producers gain the structured fields their form needs; an absent or
 * unknown value is the documented default, presented as opaque content.
 */
type ContextForm =
  /** Instructions read out of workspace files the model is expected to follow. */
  | 'instructions'
  /** A catalog of items available in this session, republished as it changes. */
  | 'catalog'
  /** Current state, where a later snapshot from the same producer supersedes an earlier one. */
  | 'snapshot'
  /** A one-off account of something that just happened; it supersedes nothing. */
  | 'notice'
  /** A message another agent addressed to this one. */
  | 'relay'
  /** Material lifted out of another session's log, possibly reduced on the way in. */
  | 'recall'
```

```ts type-equiv
/** One named contribution to a `snapshot`-form context, in assembly order. */
interface ContextSnapshotSection {
  /** The contributing subsystem's name. */
  readonly name: string
  /** That contribution's model-facing text, exactly as assembled. */
  readonly text: string
}
```

```ts type-equiv
/**
 * Producer-declared {@link ContextForm} and the fields that form requires,
 * mixed into the source types that carry one.
 *
 * Discriminated by `form` so a producer cannot select a form without the
 * fields needed to present it: a `notice` must record its one-line
 * account, a `snapshot` its sections. Omitting `form` stays valid — an
 * undeclared context is the documented default.
 */
type ContextFormed =
  | { readonly form?: never }
  | { readonly form: 'instructions' }
  | { readonly form: 'catalog' }
  | {
    readonly form: 'snapshot'
    /** The named contributions this snapshot assembled, in order. */
    readonly sections: readonly ContextSnapshotSection[]
  }
  | {
    readonly form: 'notice'
    /** One-line account of what happened, shown without expanding the row. */
    readonly summary: string
  }
  | { readonly form: 'relay' }
  | { readonly form: 'recall' }
```

<a id="streamchunk--the-raw-protocol"></a>

## `StreamChunk` — das Rohprotokoll

Eine Streaming-Antwort interleavt mehrere typisierte Blocks (Text, Reasoning, mehrere Tool-Calls). `index` verknüpft jedes Delta mit seinem Block; `block-end` trägt den vollständig assemblierten `ContentBlock`, sodass Consumer Deltas nicht selbst reassemblieren müssen. Es ist eine **geschlossene** discriminated-Union — ein `switch` über `type` endet mit `assertNever`, sodass das Hinzufügen einer Variante die Kompilierung an jedem Consumer bricht, der sie behandeln muss.

```ts type-equiv
/**
 * Adapter-private lossless-JSON state for replaying a successful response,
 * carried by a terminal `finish` chunk and stored on the assembled assistant
 * message's model source. Both halves stay opaque to the harness; only the
 * split is shared vocabulary, so assembly can keep stored metadata aligned
 * with stored content without reading either half.
 */
interface ReplayEnvelope {
  /** Response-level adapter-private metadata (ids, native stop reason). */
  response: unknown
  /**
   * Per-block adapter-private metadata, one entry per emitted block in
   * first-seen stream order. When assembly drops a block it drops the entry at
   * the same position; entries whose length does not match the emitted block
   * count discard the whole envelope. An adapter whose metadata is independent
   * of block structure omits this field and the envelope passes through
   * assembly unchanged.
   */
  blocks?: readonly unknown[]
}
```

```ts type-equiv
/**
 * Raw streaming protocol emitted by adapters.
 * Block indexes correlate interleaved deltas, and `block-end` carries the
 * assembled block. Adapters emit usage before the terminal finish and nothing
 * afterward; tool arguments remain raw JSON strings. An adapter implementation
 * may throw, but `LlmRuntime.stream()` normalizes that failure to a terminal
 * `error` or `aborted` finish before exposing it to consumers.
 */
type StreamChunk =
  | { type: 'block-start'; index: number; blockType: ContentBlockType }
  | { type: 'text-delta'; index: number; text: string }
  | { type: 'reasoning-delta'; index: number; text: string }
  | { type: 'tool-call-delta'; index: number; id: ToolCallId; name?: string; argumentsDelta: string }
  | { type: 'block-end'; index: number; block: ContentBlock }
  | { type: 'usage'; usage: TokenUsage }
  | {
    type: 'finish'
    reason: FinishReason
    /** Replay metadata for a successful response; see {@link ReplayEnvelope}. */
    replayState?: ReplayEnvelope
  }
```

<a id="compact-assistant-streams"></a>

## Kompakte Assistant-Streams

`AssistantStreamAccumulator` paart jeden `StreamChunk` mit seinem ursprünglichen Safe-Integer-Zeitstempel und erzeugt `AssistantStreamRecord[]`. Aufeinanderfolgende Text-, Reasoning- oder Tool-Argument-Deltas für denselben Block werden zu einem Record mit `time0`, exakten Zeitstempel-Abständen und einem Array-Eintrag pro Original-Delta; jeder andere Chunk bleibt ein zeitstempelbehafteter Raw-Record. Diese Repräsentation entfernt wiederholte Event-Hüllen, ohne Token-Grenzen zu verbinden oder Terminal-, Usage-, Block-, Failure- oder Replay-Fakten zu verwerfen.

`snapshot()` gibt einen losgelösten unveränderlichen Stream zurück. `expandAssistantStream()` prüft Record-Keys, Member-Anzahlen, Indizes, Zeitstempel, Tool-Call-Identität und verlustfreies JSON streng, bevor es die exakte zeitstempelbehaftete Chunk-Sequenz rekonstruiert. Das Session-Log bettet diesen Stream in `assistant/message` für ein Surface-Ergebnis oder `assistant/attempt` für einen Versuch ohne Surface-Message ein.

Prozesslokale `agent/assistant-stream`-Frames tragen Live-Präsentation. Persistenter Replay und Restore-Validierung expandieren weiterhin die eingebettete Settlement; Telemetrie, Token-Accounting und Host-Folds lesen die kompakten Records direkt. Record-Level-Reader (`assistantStreamFirstTokenTime`, `assistantStreamHasVisibleContent`, `assistantStreamHasVisibleText`, `lastAssistantStreamChunk`, `assistantStreamChunks`, `joinAssistantStreamText`, `assembleAssistantStream` sowie die pro-Run `runFirstTokenTime` und `runFirstVisibleTime`) beantworten Consumer-Fragen in einem Pass über die Records mit Early-Exit, sodass eine große Historie O(Records) pro Settlement statt O(Members)-Expansion kostet ([Fold-Entscheidung](../../.agents/notes/implemented/architecture/2026-09-06-embedded-stream-record-readers.de.md)). `expandAssistantStream()` bleibt der validierende Pfad für Records, die an einer persistenten Grenze gelesen werden, und für Consumer, die jedes Member benötigen.

<a id="llmfailure"></a>

## `LlmFailure`

Jeder geworfene oder In-Band-Final-Adapter-Fehler normalisiert zu einem serialisierbaren Provider-neutralen Payload. `providerRetryAfterMs` ist eine validierte positive Verzögerung, die vom Provider angefordert wird, keine Retry-Entscheidung; `ProviderRequestId` ist ein opaker gebrandeter String für Diagnose.

```ts type-equiv
/** Serializable provider or transport failure facts; policy decides whether they are retryable. */
interface LlmFailure {
  /** Human-readable provider or transport failure. */
  readonly message: string
  /** Stable provider-neutral machine-routing code. */
  readonly code: string
  /** HTTP status returned by the provider, when available. */
  readonly status?: number
  /** Provider-requested delay in milliseconds, when valid and available. */
  readonly providerRetryAfterMs?: number
  /** Opaque provider-issued request identifier for diagnostics. */
  readonly requestId?: ProviderRequestId
}
```

## Request-Image-Preisbildung

Ein Adapter, dessen Provider visuelle Tokens für Request-Bilder berechnet, deklariert pro-Route-Preisbildung durch Überschreiben von `LlmAdapter.imageRequestPricing`, und `ctx.llm.imageRequestPricing(provider, model)` löst sie synchron für Consumer auf. Der Token-Meter löst die Preisbildung des gerouteten Modells bei jeder Messung auf, sodass Compaction-Druck, Retention und Bereichsauswahl die Bild-Historie so bepreisen, wie der geroutete Request sie tatsächlich sendet; der DeepSeek-Adapter reproduziert seine eigene Request-Projektion (Pixel-Budget pro Modell, Oldest-First-Offload) und bepreist zurückbehaltene Bilder mit der veröffentlichten v4-Vision-Abrechnung, während Provider-Usage der autoritative Anker für abgeschlossene Requests bleibt.

```ts type-equiv
/**
 * Request price of one ordered image occurrence under one exact model route's
 * request projection. Every occurrence resolves to the pair the wire actually
 * carries: provider visual tokens for a retained image, plus the model-visible
 * text sent with or instead of it (request-preview handle, offload placeholder,
 * or text-only substitution). The caller prices `text` with its own text
 * estimator so provider pricing never fixes a text tokenization.
 */
interface LlmImageRequestPrice {
  /** Provider visual tokens for the retained request image; 0 when only text represents this occurrence. */
  visualTokens: number
  /** Model-visible text sent for this occurrence, to be priced by the caller's text estimator. */
  text: string
}
```

```ts type-equiv
/**
 * Provider-side request-image pricing for one exact model route. Implemented
 * by adapters whose provider charges visual tokens; consumers (the token
 * meter) resolve it synchronously per measurement, so implementations must not
 * perform I/O.
 */
interface LlmImageRequestPricing {
  /**
   * Price every image occurrence of one request projection.
   * @param images - durable image references in request order, one entry per occurrence.
   * @returns one price per occurrence, aligned by index with `images`.
   */
  priceImages(images: readonly ImageAttachmentRef[]): readonly LlmImageRequestPrice[]
}
```

## Der Adapter-Contract

Jeder Adapter MUSS diese Regeln einhalten, und jeder Consumer darf sich darauf verlassen:

- **`usage` vor `finish`, nichts nach `finish`.** Beide bis zum End-of-Stream-Marker des Providers verzögern, sodass ein nachfolgender Usage-Only-Chunk die Reihenfolge nicht verletzen kann.
- **Tool-Call-`arguments` bleiben End-to-End rohe JSON-Strings.** Partielle Fragmente streamen via `argumentsDelta`; ein Provider, der geparste Objekte zurückgibt, re-serialisiert bei `block-end`.
- **Zwei sanktionierte Fehlerpfade, ein `LlmFailure`-Typ.** Ein Fehler kann entweder aus `stream()` THROWEN (Transport-/Protokollfehler) **oder** den Stream mit `finish {kind:'error'|'aborted', failure}` beenden (Provider-In-Band-Fehler, für Adapter, die Mid-Stream nicht werfen können). `LlmError.failure` trägt dasselbe `LlmFailure`. Nachdem der Call seinen Adapter ausgewählt hat, bewahrt der Stream das exakte geworfene `Error`-Objekt und assoziiert unveränderliche Fakten sowie die unveränderliche Retry-Policy der Service-Registrierung mit diesem Call; der Agent-Loop committet den Attempt-Stream als `assistant/attempt`, schließt den fehlgeschlagenen Step und bietet den Fehler, die Fakten, die unveränderlichen zuvor-retryierten Fakten, die Service-Policy und das Turn-Signal `agent/request-error` an. Ein behandelter Listener gibt `{ kind: 'retry' }` nach seiner awaited-Reparatur zurück; ohne Recovery wird der strukturierte Fehler zum Turn-Fehler, und für diesen Attempt wird keine Surface-Assistant-Message oder Tool-Seiteneffekt committet.
- **Ein Adapter-Call ist ein Provider-Versuch.** Adapter deaktivieren Library-Retries. Agent-Level-Recovery öffnet einen weiteren persistenten nummerierten Turn; direkte `ctx.llm.stream()`-Caller bleiben Single-Attempt.
- **Provider-Stalls sind auf Transport-Ebene begrenzt.** Beide ausgelieferten Remote-Adapter exponieren positive endliche `streamIdleTimeoutMs` mit einem Default von fünf Minuten. Der Watchdog armiert nur, während Iterator `next()` aussteht, verwendet ein stabiles Signal für den gesamten Request, bildet seinen eigenen Ablauf auf `TIMEOUT` ab und behält einen früheren Caller-Abort als `ABORTED`.
- **Context-Overflow hat einen kanonischen Code.** Beide DeepSeek-Adapter klassifizieren explizite Provider-Details über `isContextWindowExceededError()` und surfacen `CONTEXT_WINDOW_EXCEEDED`, egal ob der Fehler als geworfene HTTP-`LlmError` oder In-Band-Finish-Fehler ankommt. Consumer routen nach Code, niemals nach Provider-Text.
- **Eine leere Completion ist ein retryabler Fehler, kein stiller Erfolg.** Beide Adapter bilden ein terminales `stop`-Finish, das keine Content-Blocks trug, auf `finish {kind:'error'}` mit dem kanonischen `EMPTY_RESPONSE`-Code ab, und `dsh-llm-retry` retryt es per Default.
- **Jeder Provider-HTTP-Request trägt die App-Attribution-Header.** Adapter senden `attributionHeaders()` (siehe unten) — die `User-Agent`-Baseline — und weisen dies mit einem Wire-Level-Test nach.
- **Replay-State ist Adapter-eigen; seine Aufteilung ist geteilt.** Ein erfolgreiches `finish` kann ein `ReplayEnvelope` tragen: opake Response-Level-Metadaten plus optionale Per-Block-Einträge, ausgerichtet an der emittierten Block-Sequenz. Die Ausrichtung ist das Vokabular des Harness — wenn die Assembly einen Block verwirft, verwirft sie den Eintrag an derselben Position, sodass gespeicherte Metadaten immer gespeicherten Content beschreiben. Der Loop speichert das bereinigte Envelope mit der assemblierten Assistant-Message. Bei einem späteren Request übergibt `LlmRuntime` den State nur, wenn der historische Provider und der Ziel-Prozessor aktuell an exakt dieselbe Adapter-Instanz registriert sind. Dieser Adapter validiert den State und besitzt jede Cross-Model- oder Cross-Provider-Konvertierung; andere Adapter empfangen den Provider-neutralen Content plus Provider-/Modell-Felder ohne den privaten State. Persistenter Content bleibt autoritativ: ein gespeicherter State, den der lesende Adapter nicht verwenden kann, degradiert diese eine Message zu Provider-neutraler Konvertierung mit Diagnose, anstatt den Request fehlschlagen zu lassen.

## `ResolvedRetryPolicy`

Die Retry-Konfiguration wird vor der Route-Registrierung in eine unveränderliche discriminated-Union aufgelöst. Der Normal-Mode trägt `mode: 'normal'`, endliches `maxRetries`, `retryableCodes` sowie die erforderlichen `initialDelayMs`, `maxDelayMs` und `jitterRatio`; der Always-Mode trägt `mode: 'always'` und dieselben erforderlichen Backoff-Felder ohne endliches Maximum. Eine ausgelassene Provider-Policy verwendet den Normal-Default von fünf Retries. Geschichtete Settings können Normal-only `maxRetries` oder `retryableCodes` nach dem Wechsel in den Always-Mode beibehalten; der Resolver ignoriert diese inaktiven Felder und erfasst die reine Always-Policy. `LlmRuntime.providerRetryPolicy(provider)` gibt den registrierten Wert zurück, und `llmRetryPolicyOf(stream)` gibt den nach der Call-Auswahl aus der Service-Registrierung erfassten Wert zurück, sodass spätere Route-Disposal oder -Ersetzung die Recovery-Policy eines In-Flight-Fehlers nicht ändern kann. Der [generierte Config-Katalog](../config-catalog.de.md) listet die optionalen Eingabefelder auf.

## `AppIdentity` — App-Attribution

Die statische öffentliche App-Identität, die jeder Adapter an Provider sendet ([`packages/llm/llm/src/attribution.ts`](../../packages/llm/llm/src/attribution.ts)). `attributionHeaders(identity?)` bildet sie nur auf den Standard-`User-Agent`-Header ab; OpenRouter-spezifische App-Attribution-Header werden von diesem Contract bewusst nicht unterstützt. Der Default `APP_IDENTITY` bezieht seine Version aus dem Package-Manifest; jedes Feld ist eine öffentliche Produkt-Tatsache — keine Secrets, Pfade, Session-IDs oder pro-Benutzer-Identifikatoren, und nichts pro-Request darf diese Werte beeinflussen. Begründung: [Pflicht-`User-Agent`-Attribution](../../.agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.de.md).

```ts type-equiv
/**
 * Static public application identity sent to LLM providers.
 *
 * Every field is a public product fact, safe on every request: no secrets,
 * local paths, session ids, prompt text, or per-user identifiers belong here,
 * and nothing per-request may influence the values.
 */
interface AppIdentity {
  /** `User-Agent` product token (lowercase, hyphenated). */
  product: string
  /** Product version; sourced from package metadata, never hand-copied. */
  version: string
  /** Repository home URL of the app, used as the `User-Agent` comment. */
  url: string
}
```

<a id="tokenusage"></a>

## `TokenUsage`

Pro-Call-Token-Accounting. Die Zählungen sind **disjunkt**: `inputTokens` ist nur ungecachter Input; gecachter Input wird separat gemeldet, und abgerechneter Input ist die Summe aller drei. Adapter, deren Provider Cache-Hits in eine einzelne Prompt-Gesamtzahl falten (DeepSeeks `prompt_tokens`), ziehen sie wieder ab. Das optionale `totalTokens` ist eine exakte aggregierte Prompt-plus-Output-Zählung, die vom Provider bewahrt oder aus autoritativen Aggregat-Zählern rekonstruiert wird; Adapter lassen es weg, wenn es nicht verfügbar oder inkonsistent ist. `reasoningTokens`, wenn vorhanden, ist nur eine informative Detailangabe, bereits in `outputTokens` enthalten; Totale dürfen es nicht erneut addieren.

```ts type-equiv
/**
 * Token accounting for one model call (cache fields are optional).
 *
 * Counts are DISJOINT: `inputTokens` is uncached input only; cached input is
 * reported separately as `cacheReadTokens`/`cacheWriteTokens` (billed input =
 * sum of the three). Adapters whose providers fold cache hits into a total
 * prompt count (DeepSeek's `prompt_tokens`) subtract them out.
 */
interface TokenUsage {
  inputTokens: number
  outputTokens: number
  /**
   * Exact full-call total including aggregate prompt and output tokens.
   *
   * Adapters preserve a provider total or derive it from authoritative
   * aggregate prompt/output counters; they omit it when unavailable or
   * inconsistent.
   */
  totalTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
}
```

<a id="blockassembler"></a>

## `BlockAssembler`

`BlockAssembler` ([`packages/llm/llm/src/assembler.ts`](../../packages/llm/llm/src/assembler.ts)) ist die einzelne gemeinsame Implementierung, die einen `StreamChunk`-Stream zurück in `ContentBlock`s, Usage, Finish-Reason und Replay-State faltet. Der Loop protokolliert die rohen Chunks, während er dieselben Chunks durch einen Assembler führt, und speichert dann den assemblierten Assistant-Content zusammen mit dem Provider und Modell, die ihn erzeugt haben. Ein Consumer, der das assemblierte Ergebnis benötigt, ohne den Fold selbst zu implementieren, verwendet dies.

Eine Keep-/Drop-Entscheidung deckt Content und Metadaten gemeinsam ab: ein `max-tokens`-Finish verwirft jeden Tool-Call, weil ein abgeschnittener Call nicht sicher ausgeführt werden kann, und dieselbe Entscheidung bereinigt den Per-Block-Eintrag des Replay-Envelopes an jeder verworfenen Position. `blocks()` und `replayState` können daher nicht uneinig sein, was auch immer die Assembly entfernt.

```ts public-api
/**
 * Incrementally assembles raw {@link StreamChunk}s into complete
 * {@link ContentBlock}s and a final assistant {@link Message}.
 *
 * The agent loop feeds it while logging raw chunks for replay fidelity, then
 * reads `blocks()` / `message()` / `usage` / `finish` once the stream ends,
 * or `interruptedBlocks()` when cancellation cut the stream short.
 *
 * Tolerant of delta-only protocols (no block-start/end); deltas arriving for
 * an index already closed by `block-end` are ignored (malformed stream) so a
 * misbehaving adapter cannot grow memory or corrupt a completed block.
 */
declare class BlockAssembler {
  /**
   * Feed one chunk into the assembly state.
   * @param chunk - the next raw chunk, in stream order.
   */
  push(chunk: StreamChunk): void;
  /**
   * Assemble all blocks seen so far, in stream order.
   * @returns one block per seen index, except that max-token truncation drops
   *   tool calls that cannot be executed safely; an open block assembles from
   *   its accumulated deltas (an unknown block type never closed by `block-end` throws).
   */
  blocks(): ContentBlock[];
  /**
   * Assemble the prefix an interrupted stream can safely finalize: closed and
   * open text/reasoning blocks with non-whitespace content, in stream order.
   * Tool calls are omitted because interruption precedes dispatch; retaining
   * one would require a fabricated result. Open unknown blocks are also omitted.
   * @returns the kept blocks; empty when nothing streamed before the interruption.
   */
  interruptedBlocks(): ContentBlock[];
  /** Usage from the `usage` chunk; undefined until one arrives. */
  get usage(): TokenUsage | undefined;
  /** Finish reason from the `finish` chunk; `{kind: 'stop'}` when the stream ended without one. */
  get finish(): FinishReason;
  /**
   * Replay metadata from the terminal finish chunk, if any, with per-block
   * entries pruned in step with {@link blocks}. Undefined when the envelope's
   * entries do not align with the emitted blocks.
   */
  get replayState(): ReplayEnvelope | undefined;
  /**
   * The assembled assistant message.
   * @param source - producer attribution for the assembled message.
   * @returns a frozen assistant-role message over `blocks()` (same open-block assembly rules).
   */
  message(source: MessageSource = { kind: 'plugin', plugin: 'dsh-llm/assembler' }): Message;
}
```

<a id="the-model-request-and-result"></a>

## Der Modell-Request

Ein Modell-Call ist ein vollständig assemblierter `GenerateOptions`. Der Adapter antwortet mit einem rohen [`StreamChunk`](#streamchunk--the-raw-protocol)-Stream; der Consumer assembliert ihn mit [`BlockAssembler`](#blockassembler).

Source: [`packages/llm/llm/src/types.ts`](../../packages/llm/llm/src/types.ts)

Provider- und Modell-Discovery verwendet kleine Provider-neutrale Deskriptoren. Ein Modellkatalog ist nur informativ: Routing schlüsselt weiterhin auf einen registrierten Provider.

Die Registrierung eines Adapters gibt ein Handle zurück: den Disposer, plus die atomare Route-Ersetzung, die ein Plugin benötigt, dessen Route-Set vom Benutzer konfigurierbar ist.

```ts type-equiv
/**
 * What {@link LlmRuntime.registerAdapter} returns: the disposer, plus an
 * atomic route replacement for the same adapter instance.
 */
interface AdapterRegistrationHandle {
  /** Release every route this registration currently holds. */
  (): void
  /**
   * Replace this registration's routes with `providers`, keeping the same
   * adapter instance. The candidate set is validated in full first — a
   * conflict with another adapter, an invalid name, or bad provider metadata
   * throws and leaves the current routes untouched — and the swap itself is
   * one synchronous section, so no request can observe a gap. An empty array
   * is legal here (a settings section that emptied holds zero routes while
   * staying registered), unlike an empty initial registration.
   *
   * Throws `LlmError` with code `REGISTRATION_DISPOSED` once the registration
   * has been released: its routes are gone and its disposer has already run,
   * so anything registered afterwards would have no owner left to release it.
   * @param providers - the complete next route set for this registration.
   */
  replace(providers: string[]): void
}
```

```ts type-equiv
/** Display metadata for one registered provider route. */
interface LlmProviderInfo {
  /** Provider route key used by {@link GenerateOptions.provider}. */
  id: string
  /** Human-readable provider name for selectors and diagnostics. */
  name: string
}
```

Adapter-Plugins deklarieren zusätzlich über `registerConfigurableProviders()`, welche Routen *konfigurierbar* laufen könnten, und adressieren dabei den User-Settings-Abschnitt jeder Route, sodass Konfigurationsoberflächen schlafende Provider anbieten können, bevor eine Route registriert ist.

```ts type-equiv
/**
 * One provider route an adapter plugin can activate through configuration,
 * whether or not the route is currently registered. Configuration surfaces
 * merge this directory with `listProviders()` to offer every configurable
 * provider alongside its live/dormant state.
 */
interface LlmConfigurableProvider {
  /** Provider route key this entry activates when configured. */
  provider: string
  /** Human-readable provider name for configuration surfaces. */
  displayName: string
  /** User-settings namespace whose section configures this provider. */
  settingsNs: string
  /**
   * Path from that namespace's section root to this provider's profile
   * object; empty when the whole section is the profile.
   */
  settingsPath: readonly string[]
  /**
   * Whether the owning adapter knows this route only because configuration
   * declared it — a gateway or self-hosted server it ships nothing about.
   * Absent means the adapter draws no such distinction; false means it does
   * and this route is one of its own. Only the adapter can answer: a stored
   * profile is how a user-added route AND a corrected shipped one both look
   * from outside.
   */
  declared?: boolean
  /** Configuration diagnostic for repair; unaffected models may remain serviceable. */
  error?: string
}
```

```ts type-equiv
/** One adapter-discovered model; catalog membership is advisory, not request validation. */
interface LlmModelInfo {
  /** Provider route that owns this model entry. */
  provider: string
  /** Model id passed to {@link GenerateOptions.model}. */
  id: string
  /** Human-readable model name for selectors. */
  name: string
  /** Optional user-facing distinction from otherwise similar models. */
  description?: string
  /** Accepted request modalities; absent means unknown, while an explicit omission is negative capability. */
  inputModalities?: readonly ModelModality[]
}
```

Korrektheitssensible Metadaten werden separat vom informativen Katalog aufgelöst und gehören dem Adapter, der die exakte Route bedient. Context-Kapazität, Adapter-Call-Defaults, Reasoning-Auswahl und der System-Prompt-Update-Modus teilen ein exaktes Modell-Ergebnis, sodass Consumer die autoritative Modell-Auflösung nicht wiederholen. `SystemPromptUpdate` hat den einzelnen Wert `'in-history'`: das Modell liest die neueste `system`-Message an beliebiger Position in `messages` als vollständigen effektiven System-Prompt, sodass der Agent-Loop einen geänderten Prompt nach der gecachten Historie anhängen kann, anstatt Message 0 umzuschreiben ([Entscheidungsregel](../../packages/core/agent-loop/README.de.md#understand-the-implementation)); ein abwesender Modus bedeutet, dass nur eine führende System-Message gelesen wird, und `normalizeModelInfo` lehnt jeden anderen Wert mit `INVALID_MODEL_INFO` ab.

```ts type-equiv
/** Provider-owned context capacity for one exact provider/model route. */
interface LlmModelContext {
  /** Maximum combined request and response context in tokens. */
  contextWindow: number
}
```

Reasoning-Effort ist eine weitere exakte-Route-Capability. Der Core brandet Identifikatoren, zählt ihre Werte aber nicht auf; jede geordnete Menge, Anzeigenamen und optionalen Deployment-Default besitzt der jeweilige Adapter.

```ts type-equiv
/** Adapter-owned identifier for one model's selectable reasoning effort. */
type ReasoningEffortId = Branded<'ReasoningEffortId'>
```

```ts type-equiv
/** Display metadata for one adapter-owned reasoning effort. */
interface LlmReasoningEffortInfo {
  /** Opaque stable value accepted by {@link GenerateOptions.reasoningEffort}. */
  id: ReasoningEffortId
  /** Human-readable effort name for selectors and diagnostics. */
  name: string
  /** Optional user-facing distinction from otherwise similar efforts. */
  description?: string
}
```

```ts type-equiv
/** Selectable reasoning efforts for one exact provider/model route. */
interface LlmModelReasoningInfo {
  /** Supported efforts in adapter-preferred display order. */
  efforts: readonly LlmReasoningEffortInfo[]
  /**
   * Adapter-configured default materialized into requests when callers omit
   * an effort. Absence preserves the provider's own default.
   */
  defaultEffort?: ReasoningEffortId
}
```

```ts type-equiv
/** Exact-route model metadata resolved by its owning adapter. */
interface LlmResolvedModelInfo extends LlmModelInfo {
  /** Provider-owned context capacity when known. */
  context?: LlmModelContext
  /** Adapter-configured per-request output cap materialized when callers omit one. */
  defaultMaxTokens?: number
  /** Adapter-owned selectable reasoning levels when exposed. */
  reasoning?: LlmModelReasoningInfo
  /** Declared mid-conversation system prompt handling; absent means only a leading system message is read. */
  systemPromptUpdate?: SystemPromptUpdate
}
```

```ts type-equiv
/** A single model request, fully assembled. */
interface GenerateOptions {
  /** Registered provider route selecting the adapter instance. */
  provider: string
  model: string
  /** Adapter-owned reasoning effort selected for this exact model. */
  reasoningEffort?: ReasoningEffortId
  /**
   * Ordered conversation messages, exactly as the provider sees them. A
   * loop-built request passes the derived history (dsh-agent-loop), whose
   * leading system-role message carries the system prompt; a hand-built
   * one-shot passes any list.
   */
  messages: Message[]
  /**
   * System prompt text for one-shot callers; adapters map it to the provider's
   * system slot ahead of `messages`. Loop-built requests leave it undefined.
   */
  system?: string
  /** Tool schemas (adapters map to the provider's `tools` field). */
  tools?: ToolSchema[]
  temperature?: number
  maxTokens?: number
  /**
   * Stop sequences: generation halts as soon as the model produces any one of
   * these strings (adapters map to the provider's stop field, e.g. OpenAI
   * `stop`). The stop string itself is not included in the output.
   */
  stop?: string[]
  signal?: AbortSignal
  /**
   * Session identity stamped by the loop for request routing. Replay uses it
   * to separate cursors; adapters may map it to model-hidden transport metadata.
   */
  sessionId?: Branded<'SessionId'>
  /**
   * Provider-neutral classification for an auxiliary model call. Adapters may
   * map the purpose to model-hidden transport metadata or purpose-specific
   * generation policy. Ordinary conversation requests leave it unset.
   */
  purpose?: 'compaction' | 'session-title'
}
```

Warum eine Modell-Antwort stoppte, wird durch einen merge-extensiven Grund angegeben. Terminale Provider-Fehler tragen das [`LlmFailure`](#llmfailure) des Streaming-Contracts:

```ts type-equiv
/**
 * Why a model response stopped.
 * Merge-extensible so adapters can surface provider-specific reasons.
 */
interface FinishReasonMap {
  'stop': { kind: 'stop' }
  'tool-calls': { kind: 'tool-calls' }
  'max-tokens': { kind: 'max-tokens' }
  'aborted': { kind: 'aborted'; failure: LlmFailure }
  'error': { kind: 'error'; failure: LlmFailure }
}
```

`FinishReason = FinishReasonMap[keyof FinishReasonMap]`. `TokenUsage` (Pro-Call-Accounting mit disjunkten Cache-Feldern) ist [unten](#tokenusage) detailliert.

`GenerateOptions.tools` trägt `ToolSchema` — die JSON-Schema-Beschreibung eines Tools, wie sie an das Modell gesendet wird. Es wird in dsh-llm (nicht dsh-tools) deklariert, genau weil es Teil des Requests ist, den der Loop jeden Step assembliert:

```ts type-equiv
/**
 * JSON-schema description of a tool, as sent to the model.
 *
 * Declared here (not in dsh-tools) because it is part of {@link GenerateOptions};
 * dsh-tools' ToolDefinition and dsh-system-prompt's PromptAssembly both import
 * it from this package.
 */
interface ToolSchema {
  name: string
  description: string
  /** JSON Schema object for the arguments. */
  parameters: Record<string, unknown>
}
```

Das modellseitige `ToolSchema` ist der Wire-Typ; die registrierte `ToolDefinition`, die es erzeugt (Schema + `execute`), steht auf [tools.md](tools.de.md).

Ein Provider, den eine Oberfläche noch entwirft, hat keine Route und keinen Katalog, daher wird die Abfrage separat beschrieben: der Request trägt den Entwurf, den der Benutzer bearbeitet, und die Antwort sind Kandidaten, die eine Oberfläche annehmen kann, anstatt eines Katalogs, den sie bedienen muss.

```ts type-equiv
/**
 * One interrogation of a provider endpoint that configuration has not stored
 * yet. Configuration surfaces send the draft a user is still editing, so the
 * request carries the endpoint and credential directly instead of naming a
 * route: a provider being added has no route to name.
 */
interface LlmModelDiscoveryRequest {
  /**
   * Route the draft is editing, when it edits an existing one. A route whose
   * adapter already knows its models answers from that knowledge instead of
   * asking the endpoint — the adapter's own registry is the better answer, and
   * it costs no network call.
   */
  provider?: string
  /**
   * Endpoint to interrogate. Optional because a route the adapter already
   * describes needs none; a route it does not must supply one.
   */
  baseURL?: string
  /** Wire protocol the endpoint speaks, when the draft names one. */
  api?: string
  /** Credential for this interrogation alone; the harness never stores it. */
  apiKey?: string
}
```

```ts type-equiv
/**
 * One model an endpoint reports about itself. Every field but the id is
 * optional because most provider listings disclose an id and nothing else;
 * a surface adopting one of these still owes the capacities its adapter needs.
 */
interface LlmDiscoveredModel {
  /** Model id the endpoint accepts. */
  id: string
  /** Human-readable name when the endpoint supplies one. */
  name?: string
  /** Maximum combined request and response context, when disclosed. */
  contextWindow?: number
  /** Maximum output tokens, when disclosed. */
  maxTokens?: number
}
```

### Die Request-Hülle: `LlmCallConfig` und der protokollierte Header

Der Loop baut jeden Request aus protokolliertem State. `EpochHeader` zeichnet die Call-Konfiguration auf, markiert die vom Adapter-Default gelieferten Felder und protokolliert die autoritative zurückgegebene Tool-Reihenfolge (konfiguriert durch `toolOrder`, oder lexikografisch wenn nicht gesetzt) durch vollständige `request/header`-Snapshots. Der gerenderte Prompt ist abgeleitete Historie — das `system/message` an Surface-Node 0, plus jedwede spätere System-Node, die eine `in-history`-Route angehängt hat — sodass Header und abgeleitete Historie zusammen den Request aus dem Session-Log rekonstruierbar machen. Siehe [session.md](session.de.md#the-request-header-event-requestheader) und die [Rekonstruierbarkeits-Agent-Note](../../.agents/notes/implemented/architecture/2026-07-05-reconstructable-requests.de.md).

`agent/request` empfängt einen eingefrorenen Call-Konfigurations-Seed und kann eine Ersetzung zurückgeben, um Provider, Modell, Reasoning-Effort oder Sampling zu wechseln. Vor dem Waterfall entfernt der Loop die als Adapter-Defaults markierten Werte, sodass die exakte-Modell-Vorbereitung die aktuellen Werte der ausgewählten Route materialisiert; unmarkierte explizite Settings bleiben im Vorschlag. Nach dem Waterfall lehnt die Vorbereitung nicht unterstützte explizite Effort-IDs ohne Clamping ab und protokolliert die effektive Konfiguration sowie die vom Adapter-Default gelieferten Felder unter dem Turn-Signal. Bei der Step-Aufnahme laufen dieses Waterfall und die Vorbereitung nach Assembly und `step/start`, aber bevor der System-Prompt und die akzeptierte User-Batch committet werden; Abbruch während beider committet keines. Die vorbereitete Capability steuert die Prompt-Aussöhnung, und der Call behält eine Adapter-Registrierung bis zum Dispatch. Requests, die `llm/stream` erreichen, sind tiefgefroren, sodass Mutation wirft, und tragen eine prozesslokale Loop-Identität, sodass Beobachter separat protokollierte eingefrorene Hilfs-Calls nicht mit Konversations-Requests verwechseln.

Auf dem Wire ist ein Loop-gebauter Request nur die abgeleitete Historie: der gerenderte Prompt reist als führende `system`-Role-Message (Surface-Node 0, ein `system/message`-Event) und, wenn der vorbereitete Call `systemPromptUpdate: 'in-history'` deklariert, kann ein nicht-leerer geänderter Prompt der gecachten Historie als spätere `system`-Role-Message folgen, die das Modell als effektiven Prompt liest; das `system`-Feld des Requests ist nicht gesetzt — `GenerateOptions.system` dient direkten One-Shot-Callern wie Title-Providern. Eine leere Renderung hinterlässt keine System-Messages in der abgeleiteten Historie, selbst wenn frühere Requests mehrere Prompt-Versionen beibehielten. Der protokollierte Request endet mit der neuesten `user/message` beim ersten Step eines Turns und den Tool-Ergebnissen des vorherigen Schritts bei späteren Steps. Die Dev-Invariante rechnet genau diese Gleichung gegen jeden Loop-gebauten Request nach und lehnt einen Loop-Request ab, der ein `system`-Feld trägt.

FIXME(call-config-shape): revisit which remaining fields are genuinely epoch-level for cache purposes (`model` and the model-owned reasoning effort are explicit; the sampling scalars sit here out of caution).

```ts type-equiv
/**
 * Provider, model, reasoning effort, and sampling scalars of one conversation's
 * requests. Every field maps 1:1 onto the same-named `GenerateOptions` field;
 * the loop builds requests from the logged header rather than accepting these
 * per call.
 */
interface LlmCallConfig {
  provider: string
  model: string
  reasoningEffort?: ReasoningEffortId
  temperature?: number
  maxTokens?: number
  stop?: string[]
}
```

```ts type-equiv
/**
 * Effective config fields supplied by exact-model adapter resolution rather
 * than by the caller's request proposal.
 */
interface LlmCallConfigAdapterDefaults {
  reasoningEffort?: true
  maxTokens?: true
}
```

## Offizielle DeepSeek-Request-Erweiterungen

`ctx.deepseekLlmApiExtensions` ist die Provider-spezifische Registry für additive Top-Level-Felder auf `deepseek-official`-Requests. Contributor-Plugins verwenden `register(field, provider)`, um ein Feld zu beanspruchen; der Adapter ruft `prepare(request)` nach der Serialisierung des Basis-Bodys auf und merged die zurückgegebenen Felder vor HTTP. Die vorbereitete `accept()`-Transaktion läuft nach 2xx, sodass ein Contributor den Delivery-State committen kann, ohne einen Transport- oder Provider-Ablehnung als Akzeptanz zu behandeln. Vorbereitungs-, Kollisions- und Akzeptanzfehler verwenden `REQUEST_EXTENSION` und lassen den Modell-Request fehlschlagen.

Die [Wire-Referenz](../deepseek-llm-api-wire-extensions.de.md) definiert die exakten Request-Header, die Erweiterungs-Transaktion, Feld-Versionen und Empfänger-Pflichten. Die mitgelieferte Komposition registriert [`dsh_session_log`](../../packages/session/session-log-deepseek/README.de.md) als verlustfreien inkrementellen kanonischen Log-Suffix und [`dsh_plugin_packages`](../../packages/llm/plugin-package-inventory-deepseek/README.de.md) als vollständige aktive Loader-gestützte Package-Menge. Diese Felder bleiben außerhalb von Modell-Messages und fehlen im pi-ai-Adapter-Pfad.

## Service- und Provider-Contracts

`LlmAdapter` ist der Provider-Contract: Subclass erstellen, `stream()` implementieren und eine Adapter-Instanz mit `ctx.llm.registerAdapter(providers, adapter)` registrieren. `GenerateOptions.provider` wählt den registrierten Adapter; `GenerateOptions.model` wird an diesen Adapter übergeben und muss beim Lifecycle-Start nicht registriert sein. Duplizierte Provider-Routen schlagen atomar fehl. Optionales `providerRetryPolicy()` wird pro Route mit Normal-Defaults erfasst, während `providerInfo()` und asynchrones `listModels()` `LlmRuntime.listProviders()` / `listModels()` mit losgelösten Selector-Metadaten füttern. Dieser Katalog ist informativ, keine Request-Whitelist: Der Adapter bleibt autoritativ und kann ungelistete Modell-IDs akzeptieren. Eine asynchrone `resolveModel()`-Abfrage gibt exakte Modell-Identität plus optionale korrektheitssensible Context-Kapazität, einen Adapter-konfigurierten `defaultMaxTokens` und geordnete modellgehörige Reasoning-IDs mit optionalem Deployment-Default zurück; abwesende Felder bedeuten nicht verfügbare Metadaten oder Provider-eigenes Verhalten, nicht ungültige Katalog-Mitgliedschaft. Der Resolver empfängt optionale Stornierung und muss nach Abbruch umgehend settleln. `LlmRuntime.resolveModelInfo()` validiert und löst das Aggregat. An der finalen Adapter-Grenze materialisiert `resolveCallConfig()` den Output-Default nur, wenn `maxTokens` abwesend ist, und validiert und materialisiert Reasoning, sodass direkte Calls keines der konfigurierten Verhaltensweisen umgehen können; direkter Dispatch erfasst eine Registrierung, bevor er auf diese Auflösung wartet. Der Agent-Loop verwendet stattdessen `prepareCall()`, um dieselbe Registrierung über Modell-Auflösung, persistentes Header-Logging und Dispatch beizubehalten, losgelöste Context-Metadaten aus exakt dieser Abfrage beizubehalten und zu melden, welche Konfigurationsfelder der Adapter als Default gesetzt hat. Die Adapter-Suche geschieht an der terminalen Continuation des `llm/stream`-Waterfalls, sodass ein Listener den Call kurzschließen oder einen veränderlichen One-Shot-Request vor der Suche routen kann. AgentLoop beobachtet einen Request-Versuch, sobald das äußere Waterfall ein Stream-Handle zurückgibt; diese begrenzte Grenze beweist nicht, dass ein träger terminaler Adapter konstruiert wurde oder Provider-I/O begonnen hat. Die `block-start`-/`block-end`-`index`-Korrelation und der Assembler bedeuten gemeinsam, dass ein Adapter nur wohlgeformte Chunks emittieren muss — Block-Reassemblierung ist nicht das Problem jedes einzelnen Adapters. [architecture.md](../architecture.de.md#turn-flow) zeigt, wo `ctx.llm.stream()` und das `llm/stream`-Waterfall in einem Turn sitzen.

```ts type-equiv
/** One model call whose config and adapter registration were resolved together. */
interface PreparedLlmCall {
  /** Detached, deep-frozen config with any adapter-owned default materialized. */
  readonly config: LlmCallConfig
  /** Immutable retry policy captured with the adapter registration. */
  readonly retryPolicy: ResolvedRetryPolicy
  /** Detached context metadata resolved with the registration-bound call. */
  readonly context?: LlmModelContext
  /** Exact model modalities captured with the adapter dispatch generation. */
  readonly inputModalities?: readonly ModelModality[]
  /** Exact model system prompt update mode captured with the adapter dispatch generation. */
  readonly systemPromptUpdate?: SystemPromptUpdate
  /** Config fields materialized by the captured adapter rather than proposed by the caller. */
  readonly adapterDefaults: LlmCallConfigAdapterDefaults
  /**
   * Dispatch this call once through the registration captured during
   * preparation. The request's call-config fields must match {@link config};
   * reuse or mismatch fails with `INVALID_PREPARED_CALL`.
   * @param options - fully assembled request carrying the prepared config.
   * @returns the chunk stream, including the `llm/stream` waterfall.
   */
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
}
```

```ts public-api
/**
 * Provider-wire adapter for the harness message and stream vocabulary. Register implementations
 * with `ctx.llm.registerAdapter(providers, adapter)`. Every provider HTTP request must include
 * `attributionHeaders()`; prove the headers are added in the wire request or library header hook. The direct-fetch
 * DeepSeek and library-backed pi-ai adapters meet this contract through different internals.
 */
declare abstract class LlmAdapter {
  /**
   * Describe one provider route owned by this adapter.
   * @param provider - a route passed to `registerAdapter()` for this instance.
   * @returns detached display metadata whose id must equal `provider`.
   */
  providerInfo(provider: string): LlmProviderInfo;
  /**
   * Return the provider-owned retry policy captured with this route.
   * @param _provider - a route passed to `registerAdapter()` for this instance.
   * @returns a resolved policy, or `undefined` to use the normal defaults.
   */
  providerRetryPolicy(_provider: string): ResolvedRetryPolicy | undefined;
  /**
   * Resolve provider-side request-image pricing for one exact model route.
   * The default declares none, so consumers fall back to their own neutral
   * estimate. Implementations must answer synchronously without I/O; the
   * token meter resolves this per measurement.
   * @param _provider - a route passed to `registerAdapter()` for this instance.
   * @param _model - exact model id passed to {@link GenerateOptions.model}.
   * @returns route-owned image pricing, or `undefined` when the route declares none.
   */
  imageRequestPricing(_provider: string, _model: string): LlmImageRequestPricing | undefined;
  /**
   * List models this adapter can currently advertise for one owned provider.
   * The result is advisory: an adapter may accept unlisted model ids, and
   * consumers must not turn absence into request rejection.
   * @param _provider - one provider route owned by this adapter.
   * @returns discoverable models in adapter-preferred order.
   */
  listModels(_provider: string): Promise<readonly LlmModelInfo[]>;
  /**
   * Resolve all metadata available for one exact model. This query is
   * independent of the advisory catalog and does not validate request routing.
   * @param provider - one provider route owned by this adapter.
   * @param model - exact model id passed to {@link GenerateOptions.model}.
   * @param _signal - cancellation for this exact-model lookup; asynchronous
   *   implementations must settle promptly after it aborts.
   * @returns provider/model identity plus any context, call-default, and reasoning metadata.
   */
  resolveModel(
    provider: string,
    model: string,
    _signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo>;
  /**
   * Bind exact model metadata and the eventual request dispatch to one adapter generation.
   * Dynamic adapters override this so settings changes between preparation and
   * dispatch cannot combine one generation's capabilities with another's endpoint.
   * @param provider - registered provider route.
   * @param model - exact model id.
   * @param signal - cancellation for model resolution.
   * @returns model metadata and a one-generation stream entry point.
   */
  async prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall>;
  /**
   * Stream one model call as raw chunks. The only required method.
   * @param options - the fully-assembled request; implementations must honor `options.signal`.
   * @returns the chunk stream, obeying the adapter contract documented on `StreamChunk`.
   */
  abstract stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
```

`ContentBlockType` (die Schlüsselmenge, die die `index`-korrelierten Blocks tragen) wird von [`ContentBlockMap`](#content-blocks-and-messages) oben abgeleitet.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.de.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxdeepseekllmapiextensions--deepseekllmapiextensionregistry"></a>

### `ctx.deepseekLlmApiExtensions` — `DeepSeekLlmApiExtensionRegistry`

Registry unabhängig geführter Top-Level-Felder für offizielle DeepSeek-Requests.

```ts cordis-catalog
/**
 * Register the sole provider of one top-level request field. Registration is effect-scoped.
 * @param field - declaration-merged field owned by the provider.
 * @param provider - request-time field preparation and optional acceptance behavior.
 * @returns disposer that releases the field.
 */
register<K extends keyof DeepSeekLlmApiExtensionMap>( field: K, provider: DeepSeekLlmApiExtensionProvider<DeepSeekLlmApiExtensionMap[K]>, ): () => Promise<void>

/**
 * Prepare every currently registered field from one immutable base request.
 * Preparation failures reject before HTTP dispatch. Field values are cloned and frozen;
 * providers retain no mutable alias to the outgoing request.
 * @param request - exact serialized request facts before extension fields.
 * @returns detached fields and their idempotent joint acceptance transaction.
 */
async prepare(request: DeepSeekLlmApiExtensionRequest): Promise<PreparedDeepSeekLlmApiExtensions>
```

Source: [`packages/llm/deepseek-llm-api-extensions/src/index.ts`](../../packages/llm/deepseek-llm-api-extensions/src/index.ts)

<a id="ctxllm--llmruntime"></a>

### `ctx.llm` — `LlmRuntime`

Der abstrakte `llm`-Service: eine Adapter-Registry plus eine Streaming-Modell-Call-API, abfangbar über das `llm/stream`-Waterfall.

```ts cordis-catalog
/**
 * Register an adapter for the given provider routes. Throws `LlmError` with code
 * `DUPLICATE_ADAPTER` if any provider already has an adapter (all-or-nothing).
 * Disposed with the fiber.
 * @param providers - every provider route this adapter should serve.
 * @param adapter - the adapter that streams calls for those providers.
 * @returns the disposer, carrying {@link AdapterRegistrationHandle.replace}.
 */
registerAdapter(providers: string[], adapter: LlmAdapter): AdapterRegistrationHandle

/**
 * Describe provider routes with a registered adapter.
 * @returns detached provider metadata in registration order.
 */
@Remote listProviders(): LlmProviderInfo[]

/**
 * Declare provider routes an adapter plugin can activate through
 * configuration. Registration is all-or-nothing: an empty list, invalid
 * entry, or a provider already declared by any registration throws
 * `LlmError` without registering the rest. Disposed with the fiber.
 * @param entries - every configurable provider this plugin owns.
 * @returns a handle that withdraws all of them, and can atomically replace them.
 */
registerConfigurableProviders(entries: readonly LlmConfigurableProvider[]): DirectoryRegistrationHandle

/**
 * List every declared configurable provider, registered or dormant.
 * @returns detached directory entries in declaration order.
 */
@Remote listConfigurableProviders(): LlmConfigurableProvider[]

/**
 * Offer to interrogate provider endpoints on behalf of the settings
 * namespace this plugin owns. The namespace is the key because that is what
 * a configuration surface already holds from the configurable-provider
 * directory, and because a provider being *added* has no route to name yet.
 * Disposed with the fiber.
 * @param settingsNs - the namespace whose profiles this discovery serves.
 * @param discover - interrogates one endpoint and must honor the supplied signal.
 * @returns the disposer that withdraws the offer.
 */
registerModelDiscovery( settingsNs: string, discover: ( request: LlmModelDiscoveryRequest, signal?: AbortSignal, ) => Promise<readonly LlmDiscoveredModel[]>, ): () => void

/**
 * Interrogate one provider endpoint for the models it advertises. The
 * request describes a draft, not a stored route, so nothing here reads or
 * writes settings or credentials — the caller owns both, and the reply is
 * candidate metadata a surface may offer for adoption.
 * @param settingsNs - namespace whose registered discovery serves this draft.
 * @param request - the endpoint, protocol, and one-shot credential to use.
 * @param signal - caller cancellation.
 * @returns the advertised models, deduplicated in endpoint order.
 */
async discoverModels( settingsNs: string, request: LlmModelDiscoveryRequest, signal?: AbortSignal, ): Promise<LlmDiscoveredModel[]>

/**
 * Remote adapter for one draft provider interrogation.
 * @param settingsNs - namespace whose registered discovery serves this draft.
 * @param request - endpoint, protocol, and one-shot credential to use.
 * @param signal - caller cancellation supplied by the Remote carrier.
 * @returns advertised models in endpoint order.
 * @throws RemoteError with `llm/model-discovery-rejected` when discovery refuses or fails.
 */
@Remote('discoverModels') async remoteDiscoverModels( settingsNs: string, request: LlmModelDiscoveryRequest, signal: AbortSignal, ): Promise<LlmDiscoveredModel[]>

/**
 * Resolve the retry policy captured when one provider route was registered.
 * @param provider - registered provider route to inspect.
 * @returns the provider-owned policy, with normal defaults already resolved.
 */
providerRetryPolicy(provider: string): ResolvedRetryPolicy

/**
 * Resolve provider-side request-image pricing for one exact route, or
 * `undefined` when the provider is unregistered or declares none. Unknown
 * providers degrade to `undefined` rather than throwing because callers
 * price durable history whose route may no longer be mounted.
 * @param provider - provider route named by a request header.
 * @param model - exact model id named by the same header.
 * @returns the owning adapter's image pricing for the route, when declared.
 */
imageRequestPricing(provider: string, model: string): LlmImageRequestPricing | undefined

/**
 * Resolve the exact text one durable file occurrence contributes to every
 * provider request in the current execution environment.
 * @param ref - durable verbatim file reference from model history.
 * @returns the same deterministic handle text used at adapter dispatch.
 */
fileRequestText(ref: FileAttachmentRef): string

/**
 * Discover models advertised by one registered provider. Catalog membership
 * is advisory and never changes routing or request validation.
 * @param provider - registered provider route to inspect.
 * @returns detached model metadata in adapter-preferred order.
 */
async listModels(provider: string): Promise<LlmModelInfo[]>

/**
 * Resolve and validate all metadata from the adapter that owns one exact
 * route. The result is detached from adapter-owned objects; catalog
 * membership remains advisory and does not control request routing.
 * @param provider - registered provider route to inspect.
 * @param model - exact model id passed to the adapter.
 * @param signal - optional cancellation for adapter-owned asynchronous lookup.
 * @returns exact model identity plus available context and reasoning metadata.
 */
async resolveModelInfo( provider: string, model: string, signal?: AbortSignal, ): Promise<LlmResolvedModelInfo>

/**
 * Validate a conversation call config against its exact model capability and
 * materialize adapter-configured defaults. Unsupported explicit efforts
 * reject before provider I/O; no clamping or aliasing is performed. This
 * standalone query does not bind a later dispatch; use {@link prepareCall}
 * when logging and streaming must share one adapter registration.
 * @param config - provider/model route and optional request controls.
 * @param signal - optional cancellation for adapter-owned capability lookup.
 * @returns a detached config only when a default must be materialized.
 */
async resolveCallConfig(config: LlmCallConfig, signal?: AbortSignal): Promise<LlmCallConfig>

/**
 * Resolve one call under its current adapter registration. The returned
 * one-shot handle keeps that registration across header logging and dispatch,
 * so HMR cannot combine one adapter's capability result with another adapter.
 * @param config - provider/model route and optional request controls.
 * @param signal - optional cancellation for adapter-owned capability lookup.
 * @returns a prepared config and its registration-bound stream entry point.
 */
async prepareCall(config: LlmCallConfig, signal?: AbortSignal): Promise<PreparedLlmCall>

/**
 * Stream one model call as raw chunks (token-level deltas). Replay state is
 * retained only when the same adapter instance owns its historical provider
 * and the target provider. Final adapter selection remains fixed through
 * asynchronous exact-model resolution and dispatch. Adapter selection,
 * dispatch, and iteration failures become terminal `error` or `aborted`
 * finish chunks; middleware, nested-call, cleanup, and consumer failures
 * remain thrown.
 * @param options - the full request; `options.provider` selects the adapter.
 * @returns the chunk stream, possibly wrapped by `llm/stream` listeners.
 */
stream(options: GenerateOptions): AsyncIterable<StreamChunk>
```

Types: [FileAttachmentRef](attachment.de.md)

Source: [`packages/llm/llm/src/index.ts`](../../packages/llm/llm/src/index.ts)

<a id="llm-events"></a>

### `llm/*` events

<a id="llmadapters-updated--emit"></a>

#### `llm/adapters-updated` — emit

Die Provider-Topologie hat sich geändert: ein Adapter hat Routen registriert oder deregistriert, oder das Configurable-Provider-Verzeichnis hat Einträge hinzugewonnen oder verloren. Diese payload-freie Registry-Benachrichtigung feuert an jedem Commit-Punkt (einschließlich Registrierungs-Disposal); Consumer lesen `listProviders()`, `listModels()` oder `listConfigurableProviders()` für den neuen State neu. Observer-Fehler sind enthalten und können die Registry-Mutation nicht vetoieren.

```ts cordis-catalog
/**
 * The provider topology changed: an adapter registered or unregistered
 * routes, or the configurable-provider directory gained or lost entries.
 * This payload-free registry notification fires at each commit point
 * (including registration disposal); consumers re-read `listProviders()`,
 * `listModels()`, or `listConfigurableProviders()` for the new state.
 * Observer failures are contained and cannot veto the registry mutation.
 * @mode emit
 */
'llm/adapters-updated'(): void
```

Source: [`packages/llm/llm/src/types.ts`](../../packages/llm/llm/src/types.ts)

<a id="llmstream--waterfall"></a>

#### `llm/stream` — waterfall

Waterfall um jeden Streaming-Modell-Call (Retry, Replay, Routing). Gebunden an das LlmRuntime; `next()` aufrufen, um zum Stream des aufgelösten Adapters zu gelangen, oder eigene Chunks yielden, um kurzuschließen.

```ts cordis-catalog
/**
 * Waterfall around every streaming model call (retry, replay, routing).
 * Bound to the {@link LlmRuntime}; call `next()` to reach the resolved
 * adapter's stream, or yield your own chunks to short-circuit.
 * @param options - the full request. A LOOP-built request carries the
 *   process-local {@link markAgentLoopRequest} identity and arrives deep-frozen
 *   (mutation throws): its content is a pure function of the session log (the
 *   reconstructability Agent Note), so listeners read it, never rewrite it.
 *   Hand-built calls do not carry that marker; their messages already obey
 *   the immutable creation contract.
 * @mode waterfall
 */
'llm/stream'(this: LlmRuntime, options: GenerateOptions, next: () => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk>
```

Source: [`packages/llm/llm/src/index.ts`](../../packages/llm/llm/src/index.ts)
<!-- END GENERATED cordis-surface -->
