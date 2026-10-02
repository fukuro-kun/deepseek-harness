# Sessions

[English](session.md) | [中文](session.zh.md) | Deutsch

Das in-memory, ereignisgesteuerte Modell von [dsh-session](../../packages/core/session). Eine `Session` ist ein **append-only-Log** typisierter `SessionEvent`s — die einzige Quelle der Wahrheit für die gesamte Interaktionshistorie eines Agents. Der LLM-Nachverlauf wird *abgeleitet* aus dem Log, nie separat gespeichert; Replay ist die erneute Ableitung aus denselben Ereignissen. Wie das Log **dauerhaft** gemacht wird (die Persistence-Seam, Backends, Crash-Wiederherstellung) ist das Schwestenthema auf [persistence.md](persistence.de.md).

Quellcode: [`packages/core/session/src/types.ts`](../../packages/core/session/src/types.ts)

## `SessionEventMap` — the event vocabulary

Die append-only-Ereignistypen. Merge-erweiterbar: Ein Plugin erklärt zusätzliche Ereignistypen per Deklarations-Merging — z. B. fügt die [Compaction-Seam](compaction.de.md) `compaction/start` / `compaction/summary` / `compaction/end` hinzu, und `@deepseek-ai/dsh-hook-protocol` fügt log-only-`hook/invoked` / `hook/result`-Datensätze für eine Hook-Brücke hinzu. Wie `compaction/*` sind diese keine `SurfaceEventType`s (kein `surfaceOp`). Der generierte [Persistence-Log-Event-Katalog](../persistence-catalog.de.md) enumeriert jedes Mitglied — Kern und gemergt — mit seinem Payload, Surface-Badge und Deklarationsort.

```ts type-equiv
/** A user-role specialization of the one shared message representation. */
interface UserMessage extends Message {
  readonly role: 'user'
}
```

```ts type-equiv
/**
 * The merge-extensible, append-only source of truth for an agent interaction.
 * Message history is derived from this log. Every event is lossless JSON and
 * sequence numbers stay contiguous. Assistant attempt events embed their exact
 * compact raw streams so persistence stores one durable settlement per attempt.
 */
interface SessionEventMap {
  /**
   * Opens turn `turn` before the loop claims queued input or runs pre-step.
   * Rejection, empty input, cancellation, or failure may close it with no
   * step; otherwise the following identified `user/message` event or batch
   * records the messages entering the step.
   */
  'turn/start': { turn: number }
  /**
   * Closes turn `turn` with the {@link TurnEndReason} that ended it. A turn
   * with no entered step has no `step/start` or `step/end`. The loop does not await a
   * flush at turn boundaries: `dsh-session-checkpoint-policy` owns the
   * per-request durability checkpoint, and consumers that read storage after
   * `whenIdle()` flush themselves. Success commits the turn; rejection is
   * reported live and does not prevent later work.
   */
  'turn/end': { turn: number; reason: TurnEndReason }
  /** Opens step `step` of turn `turn` — one model call plus the tool executions it requested. */
  'step/start': { turn: number; step: number }
  /** Closes step `step` of turn `turn`. */
  'step/end': { turn: number; step: number }
  /**
   * A user-role message on the model-visible surface: a direct human prompt
   * (the queued message claimed for this turn), a synthetic `agent.inject()`
   * context (file-change notices, subdir AGENTS.md, skill content, cron
   * notifications, …), or an entered goal continuation round. All three
   * project their `content` verbatim; `source` tells them apart.
   */
  'user/message': UserMessage
  /**
   * The rendered system prompt on the model-visible surface. The loop appends
   * the first one as surface node 0 before the step's first `user/message`.
   * A prepared in-history route can append nonempty changes in a continuing
   * series. An incapable route or new series normalizes text to the first system
   * node. Normalization empties nonempty later nodes, then rewrites the head if
   * needed, through logged per-node replacements. An empty rendering always
   * clears all active system nodes, leaving no older instructions model-visible.
   * Empty later nodes are dormant and project to no message; an empty head with
   * no active later node records "no system prompt". Restored nonempty text follows
   * the same route and series rule; empty nodes never restore older text.
   */
  'system/message': { turn: number; step: number; message: SystemMessage }
  /**
   * Assembled assistant message for one step (derived history uses this).
   * Carries the step's `usage` when the adapter reported token accounting, so
   * the model output and its accounting travel together (there is no separate
   * usage record). `usage` is absent when the adapter reported none. A turn
   * cancelled mid-stream finalizes its delivered text/reasoning prefix as this
   * event with `interrupted: true`; undispatched tool calls are absent. The
   * marker distinguishes that prefix without re-deriving interruption from turn
   * boundaries. An aborted turn with no such event streamed no visible content.
   */
  'assistant/message': {
    turn: number
    step: number
    message: AssistantMessage
    /** Exact timed model stream, compacted without joining delta boundaries. */
    stream: AssistantStreamRecord[]
    usage?: TokenUsage
    interrupted?: true
  }
  /**
   * One model attempt that committed no surface message. The embedded stream
   * preserves a failed, retried, cancelled, or stream-error attempt that
   * reached settlement without fabricating model-visible history.
   */
  'assistant/attempt': { turn: number; step: number; stream: AssistantStreamRecord[] }
  /**
   * The model requested one tool invocation: `name` with the raw `arguments`
   * JSON string exactly as the model produced it (unparsed). `callId` pairs the
   * call with its `tool/result`.
   */
  'tool/call': { turn: number; step: number; callId: ToolCallId; name: string; arguments: string }
  /**
   * A completed tool call's model-facing result, optional internal failure
   * identity, and optional tool-private `meta` presentation payload. `meta` is
   * opaque to the core (the producing tool owns its shape and reads it back in
   * `presentResult`) but MUST be JSON-serializable: `Session.append`
   * runtime-validates all event data with `isJsonValue`, so a non-serializable
   * `meta` is rejected at the source, and the durable log reproduces the
   * identical card on replay. Absent
   * unless the tool attaches one (e.g. `dsh-tool-fs` carries its result-time
   * contextual diff here).
   */
  'tool/result': {
    turn: number
    step: number
    message: ToolResultMessage
    /** Optional failure identity; allowed only when the tool-result block has `isError: true`. */
    error?: { name: string; code: string }
    meta?: JsonValue
  }
  /**
   * Full header for the next request, appended inside its step before dispatch.
   * It is log-only; the latest snapshot reconstructs the request header.
   */
  'request/header': {
    header: EpochHeader
    reason: RequestHeaderReason
    /** A changed header also begins a distinct model-message series. */
    startsSeries?: true
  }
  /**
   * Route metadata for the next request, logged only when the route, capacity,
   * or system prompt update mode changes. It does not participate in request
   * reconstruction or header equality. Prompt admission uses the bound prepared
   * call's capability, not this snapshot from an earlier request.
   */
  'request/context': RequestContext
  /**
   * Marks the end of a constructor seed. Events before it have smaller seq
   * values and came from the seed (resume, fork, or replay); this lifecycle
   * produced none of them. This log-only event is the durable projection of
   * {@link Session.firstLiveSeq}.
   *
   * A fresh fork child owns one `{ inherited: true }` marker at its exact
   * inherited-prefix cut, even when that prefix ends in an ancestor marker.
   * The last tagged marker is the current Session's cut; untagged markers keep
   * ordinary restore and replay lifecycle boundaries.
   *
   * `Session`'s constructor is the only legitimate writer. The invariant
   * companion deliberately constrains nothing here, so a plugin appending one
   * would silently classify every live bracket before it as seed history.
   *
   * An owner of a standalone open/close bracket (`compaction/start` …
   * `compaction/end`) reads it because seed history and live work are otherwise
   * byte-identical: an unmatched opening marker before this event belongs to
   * an ended lifecycle, whatever ended it. NOT a liveness signal about other
   * writers — a concurrently live session holds its own boundary elsewhere,
   * so tolerating concurrent writers needs a signal beyond the log.
   */
  'session/end-seed': { inherited?: true }
}
```

`UserMessage` ist der identifizierte, eingefrorene User-Rollen-Wert, der von normalen Prompts, injizierten Kontexten, Steering und Live-Inbox-Ereignissen geteilt wird. Ereignis-Wrapper fügen nur ereignislokale Positions- oder Ergebnisfakten hinzu; die Loop fügt nur Driver-eigenen Routing-Zustand hinzu, solange ein Element ausstehend ist.

<a id="the-request-header-event-requestheader"></a>

### The request header event: `request/header`

Die Request-Envelope — der `EpochHeader` (Aufrufkonfiguration + Marker für Adapter-Vorgaben + assemblierte Tool-Schemata) — ist protokollierter Session-Zustand, sodass jede Konversationsanfrage eine reine Funktion des Logs ist (die Rekonstruierbarkeit-Agent-Note). Der gerenderte System-Prompt ist kein Teil des Headers: Er ist abgeleitete Historie, das `system/message`-Ereignis am Surface-Knoten 0 und jeder spätere In-History-System-Knoten ([Entscheidung](../../.agents/notes/implemented/architecture/2026-09-02-system-prompt-as-surface-node.md)), sodass eine Prompt-Änderung einen System-Knoten ersetzt oder einen neuen anhängt und den Header unverändert lässt. Ein vollständiger `request/header`-Snapshot mit dem Grund `'initial'` oder `'resume'` protokolliert jede Loop-Instanzen-Grenze; eine geänderte Anfrage hängt einen Snapshot mit dem Grund `'change'` an; und eine unveränderte Envelope, die eine explizit deklarierte Nachrichtenserie beginnt oder auf eine Surface-Ersatzfolge folgt, hängt einen Snapshot mit dem Grund `'series'` an. Ein geänderter Snapshot trägt `startsSeries: true`, wenn diese Anfrage auch eine Serie beginnt. Ordentliche append-only-spätere Turns, weitere Steps und Retries in derselben Modell-Nachrichtenserie erben den neuesten Snapshot. `foldRequestHeader(events)` rekonstruiert den Header, indem er den neuesten Snapshot auswählt. Das Ereignis ist kein `SurfaceEventType`: Es erzeugt keine LLM-Nachricht.

```ts type-equiv
/**
 * Logged request state outside derived history: call config and tools. The
 * system prompt is derived history — surface node 0, a `system/message` event.
 * The latest full `request/header` snapshot reconstructs the header; canonical
 * empty optional fields are absent.
 */
interface EpochHeader {
  /** The conversation's call configuration (provider, model, reasoning effort, and sampling scalars). */
  config: LlmCallConfig
  /** Effective config fields materialized from the exact adapter rather than proposed by a caller. */
  adapterDefaults?: LlmCallConfigAdapterDefaults
  /** Assembled tool schemas; absent for a tool-less request. */
  tools?: ToolSchema[]
}
```

Der aktuelle Ereignis-Empfang erfordert den kanonischen `request/header.header`: jedes `system`-Feld ist verboten, und `tools: []` sowie `adapterDefaults: {}` müssen weggelassen werden. Leerraum-allein-System-Nachrichteninhalte, `config.stop: []` und verschachtelte Erweiterungen bleiben unverändert. Seed-, Append- und aktuelle Persistence-Lesungen lehnen nicht-kanonische Header ab, statt sie still zu normalisieren; [die V3-Envelope-Entscheidung](../../.agents/notes/implemented/architecture/2026-09-06-v3-canonical-session-envelopes.md) besitzt die historische Konversion. Legacy-v0-Logs mit `request/header-delta` oder deren Voll-Snapshot-`fallback`-Grund werden abgelehnt, statt unvollständig regeplayt zu werden.

### The route capacity event: `request/context`

Die Kontextmetadaten der Route, auf die eine Anfrage aufgelöst wurde, sind separater protokollierter Zustand, neben `request/header` im selben Step angehängt und nur dann, wenn sich Provider, Modell, Kapazität oder `systemPromptUpdate`-Modus vom vorherigen Datensatz unterscheidet. Er bleibt außerhalb von `EpochHeader`, weil dieser Typ der Rekonstruktionsvertrag ist, der feldweise von `headerEquals` verglichen wird: Kapazität und das Update-Modus beschreiben eine Route, keine Eingabe der Anfrage, sodass deren Einbeziehen eine Routenänderung als `change` der Request-Envelope registrieren ließe und Adapter-Metadaten in die Rekonstruktionsinvariante der Loop ziehen würde. Wie `request/header` ist es kein `SurfaceEventType` und erzeugt keine LLM-Nachricht. `session.requestContext()` faltet den neuesten Datensatz inkrementell; die Agent-Loop liest dessen `systemPromptUpdate`, wenn sie entscheidet, ob ein geänderter System-Prompt den neuesten System-Knoten ersetzt oder nach dem zwischengespeicherten Verlauf angehängt wird ([Entscheidungsregel](../../packages/core/agent-loop/README.md#understand-the-implementation)). Eine Route, deren Adapter keine Kapazität anzeigt, wird mit abwesendem `contextWindow` protokolliert, sodass der neue Datensatz die Kapazität einer älteren Route löscht; eine Route ohne deklariertes Update-Modus löscht analog das `systemPromptUpdate` einer älteren Route.

```ts type-equiv
/** Registration-bound metadata for one resolved model route. */
interface RequestContext {
  /** Registered provider route the metadata belongs to. */
  provider: string
  /** Provider-owned model id the metadata belongs to. */
  model: string
  /** Maximum combined request and response context in tokens, when advertised. */
  contextWindow?: number
  /** `'in-history'` when the route reads the latest `system` message at any position as the effective system prompt. */
  systemPromptUpdate?: SystemPromptUpdate
}
```

## `SessionEvent<T>` — one log entry

Eine ordnungsgemäße diskriminierte Union über `type` (keine unabhängigen `type`/`data`-Unions), sodass `switch (event.type)` `event.data` ohne Casts eingrenzt. `seq` ist die monotone Position im Log (`seq = log.length`); `time` ist Epoch-ms.

```ts type-equiv
/** Sequence number of one existing event in a Session log. */
type SessionSeq = BrandedNumber<'SessionSeq'>
```

```ts type-equiv
/** A Session log gap, prefix length, or read offset, which may equal the event count. */
type SessionLogOffset = BrandedNumber<'SessionLogOffset'>
```

```ts type-equiv
/** Inclusive Session event watermark, or `-1` before any event exists. */
type SessionSeqCursor = SessionSeq | -1
```

```ts type-equiv
/** One existing Session event position, or explicit absence. */
type OptionalSessionSeq = SessionSeq | null
```

`SessionSeq(value)` und `SessionLogOffset(value)` akzeptieren nur nicht-negative sichere Ganzzahlen und lehnen negativen Null ab. Sie fügen Compile-Time-Brands hinzu, ohne die serialisierte Zahl zu ändern; Arithmetik liefert eine gewöhnliche `number`, die Aufrufer erneut über den Konstruktor für ihre beabsichtigte Rolle zulassen müssen.

```ts type-equiv
/**
 * One immutable entry in the session log.
 *
 * A proper discriminated union over `type` (not independent `type`/`data`
 * unions), so `switch (event.type)` narrows `event.data` without casts.
 *
 * The {@link sourceEventSeqs} and {@link surfaceOp} fields are conditional:
 * they only exist on {@link SurfaceEventType} variants (`system/message`, `user/message`,
 * `assistant/message`, `tool/result`).
 * Non-surface events (boundary markers, attempts, errors) never carry
 * surface metadata — the compiler enforces this at `Session.append()`
 * call sites.
 */
type SessionEvent<T extends SessionEventType = SessionEventType> = {
  [K in SessionEventType]: {
    type: K
    /** Monotonic sequence number within the session. */
    seq: SessionSeq
    /** Unix epoch milliseconds. */
    time: number
    data: SessionEventMap[K]
    /**
     * Marks an event a reader may safely skip when it does not recognize
     * `type`. Absent means required: a reader meeting an unrecognized type
     * without this marker MUST refuse to reconstruct the session instead of
     * silently dropping the event, because an unrecognized required event may
     * change how the rest of the log is interpreted. A writer sets `true` only
     * on purely informational records whose loss cannot affect reconstruction;
     * defaulting to required means a forgotten marker over-refuses (an
     * inconvenience) rather than silently resuming a gutted session.
     */
    ignorable?: true
  } & (K extends SurfaceEventType ? SurfaceIntent<K> : {
    surfaceOp?: never
    sourceEventSeqs?: never
  })
}[T]
```

`SessionEventType = keyof SessionEventMap`. Weil `SessionEventMap` merge-erweiterbar ist, dürfen Switches über `SessionEvent` `assertNever` NICHT verwenden — eine plugin-hinzugefügte Variante ist ein gültiger unbekannter Wert; handele die bekannten Fälle ab und falle durch `default`.

Jedes Surface-Ereignis erfordert `surfaceOp`; bekannte log-only-Ereignisse verbieten beide Surface-Metadatenfelder. Natürliche unbekannte oder veraltete ignorable-Envelopes bleiben opak. `assistant/message` bettet seinen Provider-Stream ein und verbietet `sourceEventSeqs`. System-, User- und Tool-Surface-Ereignisse können eine vollständige nicht-leere Menge eindeutiger früherer Ereignisse zitieren, wenn ihre Herkunft oder ihre Ersatzoperation es erfordert. Ein `tool/result` kann `data.error` nur dann tragen, wenn sein Tool-Ergebnis-Block `isError: true` hat; die Fehleridentität bleibt für fehlerhafte Ergebnisse optional.

## Surface types

Die vier nachrichtenerzeugenden Typen (`SurfaceEventType` — `system/message`, `user/message`, `assistant/message`, `tool/result`) tragen Surface-Metadaten, die erklären, wie sie die geordnete abgeleitete Surface betreten. `system/message` hält den gerenderten System-Prompt: Die Loop hängt den ersten als Surface-Knoten 0 an und ersetzt bei einer Prompt-Änderung genau den neuesten System-Knoten oder hängt auf einer In-History-Route einen neuen an; der Surface-Fold lehnt jede andere Ersatzabdeckung einer `system/message` am Knoten 0 ab, während ein späterer System-Knoten gewöhnliche Historie ist, die ein Compaction-Ersatz verschatten darf. Siehe die [Session-Surface-Agent-Note](../../.agents/notes/implemented/architecture/2026-06-18-session-surface.md).

### `SurfaceEventType` — the message-producing subset of event types

```ts type-equiv
/**
 * The subset of {@link SessionEventType} values whose events produce LLM
 * messages and are eligible to appear on the ordered surface. Only these
 * event types may carry {@link SurfaceOp}; system, user, and tool events may also cite
 * earlier sources through {@link SessionEvent.sourceEventSeqs}.
 */
type SurfaceEventType =
  | 'system/message'
  | 'user/message'
  | 'assistant/message'
  | 'tool/result'
```

### `SurfaceOp` — how an event entered the surface

```ts type-equiv
/**
 * How a session event entered the ordered surface. Only valid on
 * {@link SurfaceEventType} events.
 *
 * - `'append'`: added to the tail — normal path for user/assistant/tool
 *   messages.
 * - `{ op: 'replace', startSeq, endSeq }`: replaces surface nodes from `startSeq`
 *   (inclusive) through `endSeq` (inclusive) with this node. Both must exist as
 *   surface nodes in the current surface. `startSeq === endSeq` replaces a single
 *   node. The node's {@link SessionEvent.sourceEventSeqs} must include every
 *   shadowed surface node. Used by compaction; any surface-replacing producer
 *   may use it.
 */
type SurfaceOp =
  | 'append'
  | { op: 'replace'; startSeq: SessionSeq; endSeq: SessionSeq }
```

`'append'` ist der normale Anhängeweg ans Ende. `replace` enthält genau `op`, `startSeq` und `endSeq`, ohne Aliase oder zusätzliche Schlüssel. Er verschattet den inkludierenden Span zwischen diesen aktuellen Surface-Ereignissequenzen und inseriert das neue Ereignis an deren Stelle; gleiche Endpunkte ersetzen einen Eintrag. Endpunkte müssen das ersetzende Ereignis vorangehen, aber ihre relative Ordnung ist Surface-Ordnung, nicht numerische Sequenzordnung.

### `SurfaceIntent` — the parameter to `session.append()`

```ts type-equiv
/**
 * Surface placement and cited source-event seqs for {@link Session.append}. Required on
 * message-producing events and forbidden on log-only events.
 */
type SurfaceIntent<T extends SurfaceEventType = SurfaceEventType> = {
  surfaceOp: SurfaceOp
} & (T extends 'assistant/message' ? {
  /** Assistant messages embed their provider stream instead of citing source events. */
  sourceEventSeqs?: never
} : {
  /** Complete non-empty set of known earlier source-event seqs. */
  sourceEventSeqs?: SessionSeq[]
})
```

Erforderlich für `SurfaceEventType`-Ereignisse — jedes nachrichtenerzeugende Ereignis muss erklären, wie es die Surface betritt, die einzige Quelle des abgeleiteten Modell-Verlaufs. Ein benutzerorientiertes Transkript ist die andere Projektion und liest die Append-Ursprungs-Ereignisse des Logs, weil die Surface die Bereiche, die ein Ersatz zusammenfasst, bewusst verschattet (`isAppendSurfaceEvent` in [dsh-session](../../packages/core/session/README.md)). Nicht-Surface-Typen lehnen es zur Compile-Zeit ab.

`assistant/message` kann `sourceEventSeqs` nicht tragen; sein `stream` besitzt den exakten Provider-Nachweis. Andere Surface-Ereignisse lassen das Feld weg, wenn sie kein früheres Ereignis zitieren, und verwenden eine vollständige nicht-leere Liste, wenn sie es tun.

### `SessionSurface` — the live readonly surface projection

`Session.surface` liefert die stabile `SessionSurface`-Ansicht der Session. derselbe inkrementelle Manager validiert Append-Kandidaten vor dem Commit und advances diese Projektion von committeten Ereignissen; Aufrufer können Mitgliedschaft und Ersatz-Generation beobachten, aber keine Validierung aufrufen.

`SurfaceManager(log, baseSeq?)` kann stattdessen ein zusammenhängendes geladenes Fenster falten, dessen erstes Ereignis die absolute Sequenz `baseSeq` hat. Jedes Ereignis bleibt in diesem absoluten Sequenzraum zusammenhängend, und ein Ersatz, der den Fensterkopf überschreitet, schlägt fehl, weil sein deklariertes Fehlen nicht vorhanden ist.

```ts type-equiv
/** Readonly live projection of the message-producing session events. */
interface SessionSurface {
  /** Current surface event sequences in model-visible order. */
  readonly nodes: readonly SessionSeq[]
  /** Monotonic count of committed positional replacements. */
  readonly replaceGeneration: number
}
```

### `SurfaceFoldReplacement` and `SurfaceFoldResult` — a complete surface replay

`foldSurface(events)` liefert getrennte aktuelle Ereignissequenzen zusammen mit den tatsächlichen Sequenzen, die von jedem deklarierten Ersatzbereich verschattet werden. Der Live-Manager verwendet dieselben Übergänge, ohne Ersatzhistorie zu behalten. Seine `replaceGeneration` inkrementiert für jeden committeten Ersatz, sodass inkrementelle Konsumenten reines Endwachstum von einem Rewrite unterscheiden können.

```ts type-equiv
/** One replacement operation observed while folding a session surface. */
interface SurfaceFoldReplacement {
  /** Seq of the event that replaced the prior surface range. */
  seq: SessionSeq
  /** Declared inclusive start seq of the replaced surface range. */
  start: SessionSeq
  /** Declared inclusive end seq of the replaced surface range. */
  end: SessionSeq
  /** Actual surface entries removed by the operation, in surface order. */
  shadowedSeqs: SessionSeq[]
}
```

```ts type-equiv
/** Complete result of replaying the surface operations in a session log. */
interface SurfaceFoldResult {
  /** Current surface event sequences in model-visible order. */
  nodes: SessionSeq[]
  /** Replacement operations in event order. */
  replacements: SurfaceFoldReplacement[]
}
```

## `Session` public API

Die declaration mit entfernten Body hält die getrennte Factory, die Zustands-Accessoren, die Append-Methode und die Verlauf-Projektionen der gewöhnlichen Klasse mit dem Quellcode synchron. Store-Operationen bleiben im generierten [`ctx.sessions`-Abschnitt](#ctxsessions--sessionstore).

```ts public-api
/**
 * An event-sourced session: an append-only log of {@link SessionEvent}s.
 *
 * Plain class (not a Service) — create live instances via
 * `ctx.sessions.create()` and detached instances via {@link create}.
 * Seeding with an existing event log replays/forks a session.
 * @typert object
 */
declare class Session {
  /** The ordered surface over this session's event log. */
  get surface(): SessionSurface;
  /**
   * Detached, deep-frozen creation metadata (format version, cwd, lineage,
   * and whether fork history exists). Supplied by the store via `ctx.sessions.create()`. When a
   * `Session` is created without a store-owned header, a minimal header is
   * synthesized (stamped with the current {@link SESSION_FORMAT_VERSION}) so
   * `session.header` is always present. Kept out of the event log — it is a
   * storage concern, not replayable conversation state.
   */
  readonly header: SessionHeader;
  /** Number of leading events inherited from this Session's fork parent. */
  readonly inheritedEventCount: SessionLogOffset;
  /** The session identity, derived from its durable header's single copy. */
  get id(): SessionId;
  /**
   * The first seq appended IN THIS PROCESS: the length of the constructor
   * seed (0 without one). Events with smaller seq values entered through
   * construction — replay, fork, or resume — and were never published on the
   * `session/event` firehose (constructor seeds do not emit). This offset marks
   * the constructor-input boundary for lifecycle ownership and persistence
   * adoption; consumers that need complete canonical history still start at
   * seq 0. Distinct from {@link inheritedEventCount}, the DURABLE
   * fork-lineage cut: a resumed session's constructor seed is its full stored
   * log, while the inherited count keeps the original fork value — this field is the
   * in-process construction fact.
   *
   * Not persisted itself: a seeded session projects it into the log as the
   * `session/end-seed` event, which is what a consumer reading STORED history
   * reads. Locate the LAST such event, not necessarily one at this seq — a
   * seed already ending in one is not re-marked, so reopening an untouched
   * session leaves that event at a smaller seq than `firstLiveSeq`. Prefer
   * this field in-process: it is exact before the marker reaches storage.
   *
   * When this lifecycle appends the marker, it occupies this seq before the
   * store attaches and therefore does not publish either. Otherwise this seq
   * holds an ordinary published write.
   */
  readonly firstLiveSeq: SessionLogOffset;
  /**
   * Create a detached session by validating and snapshotting borrowed seed
   * events and storage metadata.
   * @param id - session identity.
   * @param seed - optional borrowed replay or fork events.
   * @param header - optional borrowed storage metadata.
   * @param inheritedEventCount - exact fork-inherited prefix length for a seeded header.
   * @returns a detached session.
   */
  static create(
    id: SessionId,
    seed?: readonly SessionEvent[],
    header?: SessionHeader,
    inheritedEventCount?: SessionLogOffset,
  ): Session;
  /**
   * Restore a detached session by adopting an independently owned or deeply frozen seed.
   * Runtime-required event fields, event envelopes, sequence continuity, surface
   * transitions, and header fields are validated without copying or freezing events.
   * Embedded Assistant streams remain opaque until a stream consumer or storage
   * verifier reads them.
   * @param id - restored session identity.
   * @param seed - independently owned or deeply frozen events.
   * @param header - independently owned storage metadata.
   * @param inheritedEventCount - exact fork-inherited prefix length decoded from storage.
   * @param eventState - aliasing state carried from the operation that produced the seed.
   * @returns a restored detached session.
   */
  static fromRestore(
    id: SessionId,
    seed: readonly SessionEvent[],
    header: SessionHeader,
    inheritedEventCount: SessionLogOffset,
    eventState: SessionSeedEventState,
  ): Session;
  /**
   * Return the immutable event stored at one exact sequence number.
   * @param seq - event sequence number.
   * @returns the accepted event, or undefined when the log does not contain it.
   */
  eventAt(seq: SessionSeq): SessionEvent | undefined;
  /**
   * Materialize an immutable snapshot of a half-open event sequence range.
   * A full current snapshot is reused until the next append; every previously
   * taken snapshot remains stable after later appends.
   * @param fromSeq - non-negative inclusive sequence number; defaults to the log start.
   * @param toSeqExclusive - non-negative exclusive sequence number; defaults to the current end.
   * @returns a frozen array of the selected deeply frozen events.
   */
  snapshotEvents(
    fromSeq: SessionLogOffset = SessionLogOffset(0),
    toSeqExclusive: SessionLogOffset = this.seq,
  ): readonly SessionEvent[];
  /**
   * Return this Session's events after its fork-inherited prefix.
   * @returns a fresh array containing child-owned events in log order.
   */
  ownEvents(): readonly SessionEvent[];
  /**
   * Whether one existing event position is outside the fork-inherited prefix.
   * @param seq - event position in this Session.
   * @returns true when the event belongs to this Session rather than its parent.
   */
  isOwnSeq(seq: SessionSeq): boolean;
  /** The next event's sequence number — always the log length (the `seq = log.length` contiguity contract). */
  get seq(): SessionLogOffset;
  /**
   * Append one typed event to the log and synchronously notify observers via
   * the store-owned, module-private publication hooks. The hot path never blocks
   * on I/O — persistence plugins buffer asynchronously. Once the event enters
   * the log, the append is committed: observer failures are logged and
   * contained per listener, so they do not change the return value or prevent
   * later listeners from observing the same accepted event.
   *
   * @param type - The event type (key of {@link SessionEventMap}).
   * @param data - The event payload; must be JSON-serializable.
   * @param opts - Surface metadata: `surfaceOp` controls how the event enters
   *   the ordered surface; `sourceEventSeqs` lists the seq numbers of earlier
   *   events this one derives from. REQUIRED for
   *   {@link SurfaceEventType} events (every message-producing event must
   *   declare how it joins the surface, the sole source of derived model
   *   history) and
   *   rejected by the compiler for non-surface types like `turn/start` or
   *   `assistant/attempt`. Assistant messages embed their exact provider
   *   stream and cannot cite top-level source events.
   * @returns the logged event — its assigned `seq`/`time` plus the SNAPSHOT of
   *   `data` that entered the log, so reading `event.data` back sees the logged
   *   value, never the caller's still-mutable input.
   * @throws if `data` or surface metadata is not losslessly JSON-serializable
   *   (BigInt, function, symbol, undefined, negative zero, non-finite number,
   *   circular reference, sparse array, or an exotic object such as
   *   Map/Set/Date/class instance), or when the candidate violates the
   *   request-header empty-field or tool-error consistency rules, or the
   *   canonical surface contract (marker shape and eligibility, unique
   *   earlier source-event references, positional replacement validity, and complete
   *   shadowed-node coverage). One iterative pass reads, validates, and
   *   copies each nested value once, so a stateful getter cannot supply one value
   *   to validation and another to storage. The event log is the durable source
   *   of truth, so a bad event fails at the append site rather than later during
   *   a backend flush. A synchronous internal dispatch validation failure or an
   *   append reentered while this acceptance/publication boundary is open also
   *   rejects before the log changes.
   */
  append<T extends SessionEventType>(
    type: T,
    data: SessionEventMap[T],
    ...opts: T extends SurfaceEventType ? [opts: SurfaceIntent<T>] : []
  ): SessionEvent<T>;
  /**
   * The {@link EpochHeader} in force after the log's last header event — the
   * header the NEXT request will be compared against — or undefined before
   * the first `request/header` snapshot. The live, incrementally-maintained
   * form of `foldRequestHeader(session.snapshotEvents())`: each header event is folded
   * once, when first seen, so a per-step read costs O(new events).
   * @returns the folded header, or undefined when no header event exists yet.
   */
  requestHeader(): EpochHeader | undefined;
  /**
   * Return the latest resolved route metadata, or `undefined` before the first
   * `request/context` event. Each event is folded once.
   * @returns the latest immutable route metadata.
   */
  requestContext(): RequestContext | undefined;
  /**
   * Derive the LLM message history by walking the ordered sequences of
   * message-producing events maintained by `surfaceOp` markers. The
   * surface is the single source of derived history: every message-producing
   * append records its `surfaceOp`, so a raw event with no marker (a chunk, a
   * turn boundary) is correctly absent, and a compaction `replace` deletes the
   * shadowed nodes from the derivation. The projection rules are
   * {@link deriveEventMessage}, folded per node.
   *
   * CACHED: each surface node is projected exactly once, when first seen — a
   * call costs O(new nodes), and a surface rewrite (a `replace`;
   * {@link SessionSurface.replaceGeneration}) rebuilds. The returned array is
   * a fresh snapshot per call (later appends never grow an array a caller
   * already holds); the `Message` objects in it are SHARED and **deep-frozen**.
   * Their content reuses the already frozen durable event data, so the cache
   * needs no second deep clone and consumers still cannot mutate the log.
   * @returns a fresh array of the shared, frozen derived history.
   */
  deriveMessages(): Message[];
  /**
   * Instance face of the pure per-node `deriveEventMessage` export from
   * `surface.ts`.
   * @param event - the event to project.
   * @returns the derived message, or null when the event produces none.
   */
  deriveEventMessage(event: SessionEvent): Message | null;
}
```

## Derived history: `deriveMessages()` and `deriveEventMessage()`

`Session.deriveMessages()` projiziert das Ereignis-Log in das `Message[]`, das das Modell sieht — zwischengespeichert (jeder Surface-Knoten genau einmal projiziert, wenn er zum ersten Mal gesehen wird; ein Surface-Rewrite baut neu) und eingefroren (ein frisches Array pro Aufruf über geteilte, tief-eingefrorene Nachrichten, sodass das Mutieren protokollierter Historie durch eine Projektion darstellbar ist). `deriveEventMessage(event)` ist die pro-Knoten-reine Funktion, die der Fold anwendet — öffentlich, damit externe Rekonstruktoren und die Dev-Invariante einen Log-Präfix mit genau denselben Regeln projizieren und nicht mit dem Cache widersprechen können. Die Projektionsregeln:

- `user/message` → eine User-Nachricht mit exaktem `content`; ein optionales Envelope bleibt log-only-Anzeigemetadaten.
- `assistant/message` → eine Assistant-Nachricht mit dem Provider und Modell, die sie erzeugt hat, plus optionalem Adapter-privatem Replay-Zustand. Ihr eingebetteter kompakter Stream ist Replay-, Nutzungs- und UI-Nachweis, keine zweite Nachricht. Eine **leerinhalts** `assistant/message` wird ebenfalls übersprungen — ein max-tokens-Step, der ohne Inhalt abgeschnitten wurde, protokolliert trotzdem eine `assistant/message`, um ihren Stream, ihre Nutzung, ihren Provider und ihr Modell zu halten, aber ein inhaltsloser Assistant-Turn darf nicht in den Provider-Verlauf eintreten.
- `tool/result` → eine User-Nachricht mit einem `tool-result`-Block.
- `user/message` (injizierter Kontext, d. h. nicht-`user`-Quelle) → eine User-Rollen-Nachricht, die ihren `content` wortwörtlich an ihrer chronologischen Position trägt; ihre typisierte Quelle benennt den Produzenten und trägt alle produzenten-spezifischen Daten.

Alles andere (`turn/*`, `step/*`, `assistant/attempt`, plugin-eigenes `llm/retry`) ist strukturell und projiziert nicht in eine Nachricht. Token-Accounting expandiert den eingebetteten Stream bei jeder `assistant/message` oder `assistant/attempt`, während die Top-Level-`usage` der Nachricht die committete-Nachrichten-Autorität bleibt, wenn vorhanden. Ein fehlgeschlagener Modell-Anfragerversuch behält daher seine Provider-Nutzung, ohne eine Assistant-Nachricht zu fabrizieren. Die aktuelle logische Validierung lehnt Request-Header und Assistant-Nachrichten ab, die Provider/Modell weglassen, statt eine Route zu raten; unterstützte historische Darstellungen werden an ihrem benachbarten Format-Edge normalisiert und validiert, bevor eine aktuelle Session existiert.

## Live-session fork API

`ctx.sessions.create(id, { seed, meta })` ist das Low-Level-Replay/Fork-Primitive. Für gewöhnliche Live-Session-Forks bietet `SessionStore` eine Policy-API:

- `fork(source, boundary?, childSessionId?)` akzeptiert ein Live-`Session`-Objekt oder eine Live-`SessionId`, wählt Quellereignisse bis zur inkludierenden `SessionSeq`-Grenze (Standard: aktuelles letztes Ereignis), erfordert, dass der gewählte Präfix außerhalb eines offenen Turns endet, und erstellt dann ein Live-Kind-Session mit tief-geklonten Seed-Ereignissen, `parentSession`, `isSeeded: true`, dem exakten `inheritedEventCount` und geerbtem `cwd`.

Eine explizite `boundary` erlaubt Aufrufern, von jeder stabilen zwischen-Turn-Position zu forken, einschließlich eines vorherigen `turn/end` oder eines späteren eigenständigen log-only-Ereignisses, selbst wenn die Quelle neuere Ereignisse oder einen offenen aktuellen Turn hat. Die API lehnt einen Präfix ab, der innerhalb eines offenen Turns endet, statt still zu kürzen. Breitere Ausführungs-Beziehungssanity bleibt im bestehenden `dsh-invariants`-Plugin und dem Persistence-Reparaturweg, statt in `fork()` dupliziert zu werden. `dsh-subagent-fork-in-process` behält sein abgeschlossenen-Präfix-Kürzen, weil Tool-Zeit-Delegation normalerweise beginnt, während der Parent-Turn offen ist; gewöhnliche Session-Verzweigungen sollten die angeforderte Grenze explizit machen.

## Why a turn ended: `TurnEndReasonMap`

`turn/start` hat kein Trigger-Feld. Das eingetretene `user/message`-Batch protokolliert, was jeden Step betrat, `llm/retry` protokolliert die Anfrage-Wiederherstellung, und Idle-Injektion bleibt ausstehend, bis eine Wach-Überlieferung zu einem späteren Pre-Step gelangt. Live-Turns behalten die typisierte [`AgentCancelCause`](core.de.md#the-agent-handle), die den Driver stoppte; Persistence verwendet die zusätzliche `{ kind: 'legacy' }`-Ursache nur bei der Import eines unterstützten groben Abbruch-Datensatzes, der seinen Aufrufer nicht speicherte.

```ts type-equiv
/** Durable cancellation cause, including imports whose original coarse record carried no cause. */
type TurnEndCancelCause = AgentCancelCause | { readonly kind: 'legacy' }
```

```ts type-equiv
/**
 * Why a turn ended. Merge-extensible sum type.
 */
interface TurnEndReasonMap {
  completed: { kind: 'completed' }
  /** A cancellation request interrupted the live turn. */
  aborted: { kind: 'aborted'; reason: TurnEndCancelCause }

  blocked: { kind: 'blocked' }
  /**
   * The turn failed. `error` is always a structured failure: the `LlmError`
   * facts verbatim, or `{ message: errorChain(error), code: 'UNKNOWN' }`
   * flattened from any other error.
   */
  error: { kind: 'error'; error: LlmFailure }
  /** At least one step reached its output-token ceiling, even if a plugin continued the turn. */
  'max-tokens': { kind: 'max-tokens' }
  /**
   * A crash-orphaned turn was closed after the fact: agent-loop resume appends
   * this closer for a stored log whose last turn never ended, and session-query
   * synthesizes it on cold reads. The loop never emits this marker live, and
   * the events recorded before the crash remain intact.
   */
  interrupted: { kind: 'interrupted' }
}
```

`max-tokens` spiegelt den Modell-Aufruf-`FinishReason` mit demselben Namen: jeder `max-tokens`-Step in einem Turn beendet den ganzen Turn mit `max-tokens` statt `completed` (die Abschnit-tatsache schlägt eine spätere Fortsetzung), sodass ein Konsument einen sauberen Stopp von einem abgeschnittenen unterscheiden kann. Abbruch und Fehler bleiben getrennte Ergebnisse. `interrupted` ist der einzige Grund, den keine Loop emittiert — er wird von der Crash-Wiederherstellung synthetisiert (siehe [persistence.md](persistence.de.md)). Die Map ist merge-erweiterbar.

## Execution enclosure and standalone events

Ein Turn umschließt eine Modell-Loop-Ausführung, nicht das ganze Session-Log. AgentLoop protokolliert injizierte `user/message`-Ereignisse nur von eintretenden Pre-Step-Batches innerhalb eines Turns; plugin-eigene log-only-Ereignisse können weiterhin zwischen `turn/end` und dem nächsten `turn/start` erscheinen, die Ereignissequenzen verbrauchen, ohne Turn-Nummern zu inkrementieren. Persistence lässt jedes zusammenhängende akzeptierte Ereignis in ein begrenztes dauerhafter Batch zu, während Crash-Reparatur nur einen wirklich offenen Nachfolge-Turn schließt. Ein Produzent, der eine sofortige Dauerhaftigkeitsbarriere benötigt, wartet explizit auf `ctx.sessions.flush(session)`.

Das optionale `dsh-session/invariant`-Companion erzwingt die von Core besessenen Beziehungen: Turn- und Step-Nummerierung, Ausführungs-Ereignis-Umschließung und Same-Step-Tool-Aufruf/Ergebnis-Paarung. Merge-erweiterbare Ereignis-Beziehungen gehören zum Plugin, das sie deklariert, sodass Core ein unbekanntes Ereignis nicht allein deshalb ablehnt, weil kein Turn offen ist. Siehe [die Eigenständiges-Ereignis-Entscheidung](../../.agents/notes/implemented/simplification/2026-07-28-remove-synthetic-log-only-turns.md).

## The end-seed boundary: `session/end-seed`

Ein frischer Fork-Konstruktor erfordert, dass sein Seed dem geerbten Präfix gleich ist, und hängt `session/end-seed { inherited: true }` am exakten dauerhaften Cut an. Ein Restore behält diesen markierten Marker und hängt ein gewöhnliches `session/end-seed {}` nur dann an, wenn sein vollständiger gespeicherter Seed nicht bereits in einem Marker endet. Beide Formen sind log-only und erzeugen keine Nachricht; `Session`'s Konstruktor ist der einzige legitime Schreiber.

Für Fork-Abstammung: lokalisieren den LETZTEN Marker, dessen Payload `inherited: true` trägt; die aktuelle Format-Dekodierung erfordert ihn genau dann, wenn `SessionHeader.isSeeded` true ist, und leitet `inheritedEventCount` von seiner Sequenz ab. Für Lifecycle-Eigentum: lokalisieren das letzte `session/end-seed` beider Formen. Das Wiederöffnen eines Seeds, der bereits in einem Marker endet, hängt keinen weiteren gewöhnlichen Marker an.

Er existiert, weil Seed-Historie und Live-Arbeit andernfalls byte-identisch wären, was jedes Plugin, das eine eigenständige Open/Close-Klammer besitzt, zunichte macht: ein unpassendes `compaction/start` liest sich gleich, ob der Schreiber während der Kompaktion abgestürzt ist oder gerade kompaktiert. Ein öffnender Marker vor `session/end-seed` kam vom Konstruktor-Seed und gehört zu einem beendeten Lifecycle, was auch immer es beendete (ein Crash, ein erfolgreicher Prozess oder ein Fork aus einem noch laufenden Parent), sodass sein Besitzer ihn als tot behandeln darf. Das deckt nur Klammer *dieser* Session ab: eine gleichzeitig live Session, die eine offene Klammer über dieselbe Historie hält, hat ihre eigene Grenze woanders, sodass das Tolerieren paralleler Schreiber ein Liveness-Signal über das Log hinaus benötigt. Core schreibt die Grenze und liest nichts von ihr — das Klammer-Vokabular bleibt bei ihrem besitzenden Plugin, weshalb Crash-Reparatur Turn/Step/Tool-Grenzen schließt und nie `compaction/*`.

Konsumenten, die Sessions nach menschlicher Aktivität ordnen, schließen diese Grenze aus: das Aufheben einer Session ist keine Arbeit, sodass die Ordnung nach dem Log-Ende jede geöffnete Session nach oben bringen würde.

## Plugin-contributed log-only events

Ein Plugin kann per Deklarations-Merging zusätzliche `SessionEventMap`-Typen erklären. Diese sind **log-only**: KEINE `SurfaceEventType`s (sie tragen kein `surfaceOp` und steuern nichts zum abgeleiteten Verlauf bei). Ihr Besitzer entscheidet, ob sie zu einem offenen Ausführungsturn gehören oder zwischen Turns stehen dürfen, und erzwingt jede Beziehung in seinem eigenen Invariante-Companion. Der generierte [Persistence-Log-Event-Katalog](../persistence-catalog.de.md) enumeriert jedes Kern- und Plugin-Beitrag-Ereignis; die Compaction-Seam-`compaction/*`-Semantik wird auf [compaction.md](compaction.de.md) besprochen.

Wenn mehrere Ereignisse in einer plugin-eigenen Familie zu einem Web-Client-Conversation-Knoten assemblieren, trägt jedes Start-, Update-, Ergebnis-, Ressourcen- oder Unterbrechungs-Ereignis in dieser Familie oder leitet unabhängig dieselbe stabile Geschäftskennung ab. Diese Anforderung gilt für korrelierte Knoten-Familien, nicht für jedes Session-Ereignis; sie ermöglicht dem Client, jedes Ereignis zu gruppieren, ohne aus Nachbarschaft oder Historie-Scanning zu raten. Siehe das [Conversation-Subsystem](conversation.de.md).

Die Hook-Brücken-`hook/invoked` / `hook/result`-Paare (von `@deepseek-ai/dsh-hook-protocol`) korrelieren über `handlerId`. `UserPromptSubmit`, `PreToolUse`, `PostToolUse` und `Stop` feuern innerhalb des offenen Turns der Loop, sodass ihre `hook/*`-Datensätze konstruktionsbedingt turn-umschlossen sind. `SessionStart` erhält keinen `hook/*`-Datensatz, weil es vor Turn 1 läuft; sein Kontext bleibt in der Inbox ausstehend, bis eine Wach-Überlieferung einen Turn öffnet.

## Durability contract

Worauf ein Persistence-Backend sich verlässt: Das dauerhafte Log persistiert jedes Ereignis verlustfrei, und jeder Assistant-Versuch ist eine `assistant/message` oder `assistant/attempt`, deren eingebetteter kompakter Stream die originalen zeitgestempelten Chunks erhält. `seq` bleibt über diese Abrechnungen und alle dazwischenliegenden Ereignisse zusammenhängend. Ein Backend kann seine eigene Speicher-Rahmung für einen Ereignis-Batch wählen, solange ein Handle-`read()` die exakten angehängten Ereignisse zurückgibt; aktuelle JSONL schreibt eine Zeile pro Ereignis (siehe [persistence.md](persistence.de.md)). Alle `event.data` müssen JSON-serialisierbar sein; `Session.append` erzwingt dies an der Quelle (wirft bei nicht-serialisierbaren Daten), sodass ein schlechtes Ereignis nie das Log betritt und `session.snapshotEvents()` immer dem gleicht, was ein Backend persistieren kann. Das Hinzufügen eines Ereignistyps, der nicht-serialisierbare Daten trägt, die Kern-Ausführungs-Nestung beschädigt oder die von seinem Besitzer deklarierte Beziehung verletzt, ist eine brechende Änderung des On-Disk-Formats.

Die Backends, die diesen Vertrag konsumieren, stehen auf [persistence.md](persistence.de.md).

## Remote catalog and workspace opening

`ModelCatalog` ist das Host-Generierungs-Modell-Verzeichnis, das von `session/modelCatalog` zurückgegeben wird: Es trägt den Deployment-Standard, routierbare Provider-IDs, erfolgreiche Provider-Gruppen und isolierte Provider-Fehler. Es wird nicht von einer Session abgeleitet und bleibt getrennt von Session-Projektionen.

`SessionOpenWorkspacePathRequest` trägt einen absoluten oder workspace-aufgelösten `path`; optionales `action: "reveal"` wählt Dateimanavigator-Navigation statt Standardanwendungs-Öffnung. `SessionOpenWorkspacePathValue` bestätigt, dass der Host die native Übergabe akzeptiert hat. Ein Session-bewusster Client löst relative Pfade gegen seinen aktuellen Session-cwd auf, wenn bekannt; der Controller übergibt den Pfad unverändert an den Öffner und meldet ungültige Anfragen, Abbrüche und Öffner-Fehler über das Session-Remote-Fehler-Vokabular.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Von `scripts/gen-cordis-catalog.ts` aus dem Quellcode generiert (frischheit-geprüft durch `pnpm run verify-cordis-catalog` in doc-sync; regenerieren mit `pnpm run gen-cordis-catalog`) — die Sprachseiten unterscheiden sich nur in den lokalspezifischen gepaarten Dokumentenpfaden. Signaturblöcke verwenden ein `ts cordis-catalog`-Fence und behalten die originalen Quell-JSDoc; Dispatch-Modi sind in der [Einleitung](../cordis-primer.de.md#dispatch-modes) definiert, und die framework-geerbte `ctx`-API steht in [cordis-api/inherited.md](../cordis-api/inherited.de.md).

<a id="ctxsessioncontroller--sessioncontroller"></a>

### `ctx.sessionController` — `SessionController`

Host-Dienst, der den generierten `ctx.remote.session`-Namespace trägt.

```ts cordis-catalog
/**
 * Resolve or resume one ordinary Session for another Host API domain.
 * @param sessionId - Session identity whose Agent owns the operation.
 * @returns the live Agent or the stable Session-domain failure.
 */
resolveAgent(sessionId: SessionId): Promise<ApiSessionAgentResult>

/**
 * Inspect one attached or persisted Session without activating its Agent.
 * @param sessionId - durable Session identity.
 * @param signal - optional caller cancellation for persistence reads.
 * @returns the current attached state or persisted header and event prefix.
 */
inspect( sessionId: SessionId, signal?: AbortSignal, ): Promise<SessionInspection>

/**
 * Read all visible Session rows without resuming an Agent.
 * @param _request - reserved empty list request.
 * @param signal - cancellation for persistence reads.
 * @returns visible Session summaries ordered by activity.
 */
@Remote('list') async list(_request: SessionListRequest, signal: AbortSignal): Promise<SessionListValue>

/**
 * Search visible Session content without resuming an Agent.
 * @param request - literal message-content query.
 * @param signal - cancellation for list and search reads.
 * @returns authorized bounded Session search results.
 */
@Remote('search') search(request: SessionSearchRequest, signal: AbortSignal): Promise<SessionSearchValue>

/**
 * Create or idempotently adopt one ordinary Session.
 * @param request - requested identity, location, and Agent preset.
 * @returns the Session identity and resolved preset when configured.
 */
@Remote('create') create(request: SessionCreateRequest): Promise<SessionCreateValue>

/**
 * Select one Session-local model after explicitly resuming the Session.
 * @param request - Session identity and requested model selection.
 * @returns the normalized selection installed for the Session.
 */
@Remote('selectModel') selectModel(request: SessionSelectModelRequest): Promise<SessionSelectModelValue>

/**
 * Describe every currently routable model for Host-generation selectors.
 * @returns provider-grouped models, the deployment default, and isolated provider failures.
 */
@Remote('modelCatalog') modelCatalog(): Promise<ModelCatalog>

/**
 * Report whether this deployment can hand a Session workspace path to a native desktop.
 * @returns true when the matching open operation is available.
 */
@Remote canOpenWorkspacePath(): boolean

/**
 * Describe the serving desktop for authenticated file-action routes.
 * @returns Host name, configured availability, and platform-specific file-manager behavior.
 */
workspaceDesktop(): { name: string; available: boolean; fileManager: 'finder' | 'explorer' | 'directory' | null }

/**
 * Open one path prepared by a Session-aware caller on the Host desktop.
 * @param request - path after best-effort Session workspace resolution.
 * @param signal - caller lifetime; abort terminates the native command.
 * @returns confirmation after the native opener accepts the path.
 * @throws RemoteError when the request is invalid, cancelled, or the opener fails.
 */
@Remote('openWorkspacePath') async openWorkspacePath( request: SessionOpenWorkspacePathRequest, signal: AbortSignal, ): Promise<SessionOpenWorkspacePathValue>

/**
 * Rename one Session after explicitly resuming it.
 * @param request - Session identity and proposed title.
 * @returns the accepted title and durable event sequence.
 */
@Remote('rename') rename(request: SessionRenameRequest): Promise<SessionRenameValue>

/**
 * Fork one cold-readable completed-turn prefix into a new Session.
 * @param request - source Session and optional event anchor.
 * @returns the new Session identity.
 */
@Remote('fork') fork(request: SessionForkRequest): Promise<SessionForkValue>

/**
 * Admit one prompt after explicitly resuming its Session.
 * @param request - Session identity, prompt content, source metadata, and delivery mode.
 * @param signal - caller cancellation before prompt admission begins.
 * @returns acknowledgement that the Agent accepted the prompt.
 */
@Remote('prompt') prompt(request: SessionPromptRequest, signal: AbortSignal): Promise<SessionPromptValue>

/**
 * Read one image proven reachable from the addressed Session log.
 * @param request - Session and attachment identities used for authorization.
 * @returns the durable attachment reference and base64-encoded bytes.
 */
@Remote('attachment') attachment(request: SessionAttachmentRequest): Promise<SessionAttachmentValue>

/**
 * Mutate one still-pending queue occurrence on a live Agent.
 * @param request - Session, queue item, and requested mutation.
 * @returns acknowledgement that the queue mutation was applied.
 */
@Remote('updateQueue') updateQueue(request: SessionUpdateQueueRequest): SessionUpdateQueueValue

/**
 * Cancel one active Agent turn without dropping its pending inbox.
 * @param request - Session whose active Agent turn is cancelled.
 * @returns acknowledgement that cancellation was requested.
 */
@Remote('cancel') cancel(request: SessionCancelRequest): SessionCancelValue

/**
 * Read one cold-safe, message-aligned Session history page.
 * @param request - durable address, backward cursor, and page budget.
 * @param signal - cancellation for persistence reads.
 * @returns one chronological page.
 */
@Remote('page') page(request: SessionPageRequest, signal: AbortSignal): Promise<SessionPage>

/**
 * Follow one Session log from its opening or resume cursor.
 * @param request - durable address and last committed sequence already held by the caller.
 * @param signal - cancellation owned by the Remote stream carrier.
 * @returns a complete opening snapshot followed by gap-free durable event
 *   frames and optional cursorless assistant-stream frames.
 */
@Remote({ mode: 'stream' }) follow(request: SessionFollowRequest, signal: AbortSignal): AsyncIterable<SessionFollowFrame>

/**
 * Stream a complete live-control baseline followed by replacement frames.
 * @param signal - cancellation owned by the Remote stream carrier.
 * @returns one complete baseline followed by live replacement frames.
 */
@Remote({ mode: 'stream' }) control(signal: AbortSignal): AsyncIterable<SessionControlFrame>
```

Typen: [SessionId](core.de.md) · [SessionInspection](persistence.de.md) · [SessionSearchRequest](session-query.de.md)

Quellcode: [`packages/api/session-controller/src/index.ts`](../../packages/api/session-controller/src/index.ts)

<a id="ctxsessions--sessionstore"></a>

### `ctx.sessions` — `SessionStore`

In-memory-Session-Store (`ctx.sessions`).

Persistence ist hier bewusst nicht implementiert — der Agent-Lifecycle hängt einen Session-Log-Schreiber an jedes veröffentlichte Session-Schreib-Handle; eine außerhalb dieses Lifestyles veröffentlichte Session persistiert nichts.

```ts cordis-catalog
/**
 * Create a session owned by the calling fiber: disposing that fiber stops
 * event notification and removes the session from the store. `options.seed`
 * populates the session with a copy of those events (replay/fork);
 * `options.meta` attaches creation metadata (validated absolute `cwd`, seed
 * and parent lineage, and delegation depth) as the immutable
 * {@link SessionHeader} (the store fills `version`/`id`/`createdAt`).
 *
 * For an agent whose session must be torn down IN ORDER with its loop (so the
 * loop's final events are published before the store attachment ends), do NOT use this
 * — fold the session lifecycle into the agent's own effect via
 * {@link prepare} + {@link enter} + {@link announce} (see
 * `dsh-agent-loop`'s creation transaction).
 *
 * @param id - the session id; omitted, the store mints `session-<n>`.
 * @param options - seed events and/or creation metadata for the header.
 * @returns the live session, already entered and announced.
 * @throws if a session with `id` already exists, metadata is not a plain
 *   lossless-JSON record with valid scalar fields, or `meta.cwd` is a
 *   non-absolute path (storage backends key directories off it).
 */
create(id?: SessionId, options?: CreateSessionOptions): Session

/**
 * Build a session WITHOUT entering it into the store — validate the id/cwd and
 * construct the {@link Session} (with its immutable {@link SessionHeader}).
 * Pairs with {@link enter} + {@link announce}: a caller that owns a composite
 * `ctx.effect` (the agent factory) folds the session lifecycle into that ONE
 * effect so a fiber unload tears the session + agent down as a single ORDERED
 * chain rather than as racing sibling effects — which would remove the publication hooks
 * before the driver's closing events commit, dropping them.
 *
 * @param id - the session id; omitted, the store mints `session-<n>`.
 * @param options - seed events and/or creation metadata for the header. With
 *   `eventState`, every seed event is either independently owned or any
 *   shared value is deeply frozen; {@link Session.fromRestore} validates and
 *   adopts those values without copying or freezing them.
 * @returns the constructed session, NOT yet in the store.
 * @throws if a session with `id` already exists, metadata is not a plain
 *   lossless-JSON record with valid scalar fields, or `meta.cwd` is a
 *   non-absolute path.
 */
prepare(id?: SessionId, options?: PrepareSessionOptions): Session

/**
 * Enter a {@link prepare}d session into the store: install the module-private
 * append publication hooks and add it to the store. Returns the DETACH
 * disposer (hooks + store removal). Does NOT emit `session/created` —
 * the caller yields this disposer inside its effect and THEN calls
 * {@link announce}, so a throwing `session/created` listener rolls the attach
 * back instead of leaking it.
 *
 * Re-checks the id for a duplicate: `prepare` and `enter` are public
 * cross-package primitives and a caller may interleave arbitrary work (or
 * another create) between them, so a stale prepared session must NOT overwrite
 * a live store entry of the same id — its detach disposer would later delete
 * the REAL session. The {@link create} convenience and the agent factory call
 * the two back-to-back so they never trip this, but the public API cannot
 * assume that.
 *
 * @param session - a {@link prepare}d session not yet in the store.
 * @returns the detach disposer (publication hooks + store removal). When called from
 *   a synchronous `session/created` listener, removal and disposal wait until
 *   that creation dispatch unwinds.
 * @throws if a session with this id is already in the store.
 */
enter(session: Session): () => void

/** Emit `session/created` exactly once for an {@link enter}ed session (with
 * the carrier {@link enter} captured). Separate from {@link enter} so the
 * caller can yield the detach disposer first (rollback safety — see
 * {@link enter}).
 * @param session - the entered session to announce to listeners.
 * @throws if the session is not live or its announcement already began,
 *   including a reentrant call from a creation listener. */
announce(session: Session): void

/**
 * Dispatch the awaited `session/flush` durability checkpoint for `session`,
 * with the carrier captured at {@link enter}. THE flush entry point: the
 * store owns the carrier, so callers (the checkpoint policy's per-request
 * barrier, goal-round-driver's idle checkpoint, teardown drains, and consumers
 * that flush themselves before reading storage) must come through here
 * rather than dispatch a raw `ctx.parallel('session/flush', …)` — one owner,
 * one spelling, and the scoped-dispatch invariant can pin it.
 * @param session - the session whose buffered events must reach durable storage.
 * @returns whether at least one durability listener participated, after every
 *   listener has settled successfully.
 * @throws the first registered listener failure after every listener settles.
 */
async flush(session: Session): Promise<boolean>

/**
 * Look up a live session.
 * @param id - the session id to look up.
 * @returns the session, or undefined when no live session has that id.
 */
get(id: SessionId): Session | undefined

/**
 * All live sessions, in creation order.
 * @returns a fresh array; mutating it does not affect the store.
 */
list(): Session[]

/**
 * Create a live child session from a stable prefix of a live source.
 * `boundary` is an inclusive source event seq; omitted means the source's
 * current last event. The selected slice may end with a between-turn event
 * but must not end inside an open turn.
 *
 * @param source - Live source session object or id.
 * @param boundary - Inclusive source event seq to fork through; omitted means
 *   the source's current last event, and omitted on an empty source forks an
 *   empty child.
 * @param childSessionId - Optional child session id; omitted delegates to
 *   `SessionStore`'s id policy.
 * @returns The created live child session.
 */
fork(source: SessionForkSource, boundary?: SessionSeq, childSessionId?: SessionId): Session
```

Typen: [CreateSessionOptions](persistence.de.md) · [PrepareSessionOptions](persistence.de.md) · [SessionId](core.de.md)

Quellcode: [`packages/core/session/src/index.ts`](../../packages/core/session/src/index.ts)

<a id="api-session-events"></a>

### `api-session/*` events

<a id="api-sessionactivity--emit"></a>

#### `api-session/activity` — emit

Eine nutzer-autorendurable Nachricht hat die Session-Listen-Aktivität vorangebracht.

```ts cordis-catalog
/**
 * One user-authored durable message advanced Session list activity.
 * @mode emit
 * @param sessionId - addressed Session identity.
 * @param updatedAt - durable message time used for list ordering.
 */
'api-session/activity'(sessionId: SessionId, updatedAt: number): void
```

Typen: [SessionId](core.de.md)

Quellcode: [`packages/api/session-controller/src/types.ts`](../../packages/api/session-controller/src/types.ts)

<a id="api-sessionadded--emit"></a>

#### `api-session/added` — emit

Eine Session wurde für Session-Listen-Konsumenten sichtbar.

```ts cordis-catalog
/**
 * A Session became visible to Session list consumers.
 * @mode emit
 * @param summary - initial list row for the Session.
 */
'api-session/added'(summary: SessionSummary): void
```

Quellcode: [`packages/api/session-controller/src/types.ts`](../../packages/api/session-controller/src/types.ts)

<a id="api-sessionerror--emit"></a>

#### `api-session/error` — emit

Ein Agent ist außerhalb einer dauerhaften Turn-Position fehlgeschlagen.

```ts cordis-catalog
/**
 * One Agent failed outside a durable turn position.
 * @mode emit
 * @param sessionId - Agent and Session identity.
 * @param message - user-safe failure chain.
 */
'api-session/error'(sessionId: SessionId, message: string): void
```

Typen: [SessionId](core.de.md)

Quellcode: [`packages/api/session-controller/src/types.ts`](../../packages/api/session-controller/src/types.ts)

<a id="api-sessionremoved--emit"></a>

#### `api-session/removed` — emit

Eine Session verließ das Live-Host-Register.

```ts cordis-catalog
/**
 * A Session left the live Host registry.
 * @mode emit
 * @param sessionId - removed Session identity.
 */
'api-session/removed'(sessionId: SessionId): void
```

Typen: [SessionId](core.de.md)

Quellcode: [`packages/api/session-controller/src/types.ts`](../../packages/api/session-controller/src/types.ts)

<a id="api-sessionstatus--emit"></a>

#### `api-session/status` — emit

Ein Agent hat seinen Laufzustand geändert.

```ts cordis-catalog
/**
 * One Agent changed running state.
 * @mode emit
 * @param sessionId - Agent and Session identity.
 * @param running - whether the Agent is running.
 */
'api-session/status'(sessionId: SessionId, running: boolean): void
```

Typen: [SessionId](core.de.md)

Quellcode: [`packages/api/session-controller/src/types.ts`](../../packages/api/session-controller/src/types.ts)

<a id="session-events"></a>

### `session/*` events

<a id="sessioncreated--emit"></a>

#### `session/created` — emit

Erstellungs-Ankündigung während der Session-Veröffentlichung. Ein synchroner Wurf vetoes und rollt mit einer gepaarten Entsorgung zurück; ein während der Dispatch angeforderter Detach wird aufgeschoben. Eine zurückgegebene Promise-Ablehnung wird protokolliert, kann diese synchrone Grenze aber nicht rückwirkend vetieren. Scope-gefilterter Dispatch (`@deepseek-ai/dsh-scope`): agent-scope Listener erhalten nur Sessions, die durch den Kontext dieses Agents eintreten.

```ts cordis-catalog
/**
 * Creation announcement during session publication. A synchronous throw vetoes and rolls
 * back with a paired disposal; detach requested during dispatch is deferred.
 * A returned-promise rejection is logged but cannot retroactively veto this
 * synchronous boundary.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners
 * receive only sessions entered through that agent's context.
 * @param session - the session just entered and announced.
 * @dshScopeScan unsupported
 * @mode emit
 */
'session/created'(this: Scoped<Session>, session: Session): void
```

Typen: [Scoped](scope.de.md)

Quellcode: [`packages/core/session/src/index.ts`](../../packages/core/session/src/index.ts)

<a id="sessiondisposed--emit"></a>

#### `session/disposed` — emit

Wird einmal emittiert, wenn eine angekündigte Session den Store verlässt, einschließlich Veröffentlichungs-rollback, aber nie für einen Eintrag, dessen Erstellungs-Ankündigung nicht begann. Listener-Fehler werden protokolliert und eingedämmt. Scope-gefilterter Dispatch (`@deepseek-ai/dsh-scope`) wiederverwendet den Besitzer-Scope.

```ts cordis-catalog
/**
 * Emitted once when an announced session leaves the store, including
 * publication rollback, but never for an entry whose creation announcement
 * did not begin. Listener failures are logged and contained.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`) reuses the owner scope.
 * @param session - the session that is no longer live in the store.
 * @dshScopeScan unsupported
 * @mode emit
 */
'session/disposed'(this: Scoped<Session>, session: Session): void
```

Typen: [Scoped](scope.de.md)

Quellcode: [`packages/core/session/src/index.ts`](../../packages/core/session/src/index.ts)

<a id="sessionevent--emit"></a>

#### `session/event` — emit

Post-Commit, Fire-and-Forget-Append-Feed. Der Listener-Snapshot wird vor dem Log-Push aufgelöst, aber Callbacks laufen danach; Observer-Fehler werden protokolliert und eingedämmt, ohne den committeten Append zu versagen. Scope-gefilterter Dispatch (`@deepseek-ai/dsh-scope`): agent-scope Listener erhalten nur Ereignisse von Sessions, die durch den Kontext dieses Agents eintreten.

```ts cordis-catalog
/**
 * Post-commit, fire-and-forget append feed. The listener snapshot resolves
 * before the log push, but callbacks run after it; observer failures are
 * logged and contained without making the committed append fail.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners
 * receive only events from sessions entered through that agent's context.
 * @param session - the session whose log grew.
 * @param event - the appended event, exactly as recorded.
 * @dshScopeScan unsupported
 * @mode emit
 */
'session/event'(this: Scoped<Session>, session: Session, event: SessionEvent): void
```

Typen: [Scoped](scope.de.md)

Quellcode: [`packages/core/session/src/index.ts`](../../packages/core/session/src/index.ts)

<a id="sessionflush--parallel"></a>

#### `session/flush` — parallel

Gewarteter paralleler Dauerhaftigkeits-Checkpoint: Jeder Listener läuft und der Aufrufer wartet auf alle, ohne Wasserfall-Veto. Scope-gefilterter Dispatch (`@deepseek-ai/dsh-scope`) wiederverwendet den Besitzer-Scope der Session.

```ts cordis-catalog
/**
 * Awaited parallel durability checkpoint: every listener runs and the
 * caller awaits all of them, with no waterfall veto. Scope-filtered dispatch
 * (`@deepseek-ai/dsh-scope`) reuses the session's owner scope.
 * @param session - the session whose buffered events must reach durable storage.
 * @dshScopeScan unsupported
 * @mode parallel
 */
'session/flush'(this: Scoped<Session>, session: Session): Promise<void> | void
```

Typen: [Scoped](scope.de.md)

Quellcode: [`packages/core/session/src/index.ts`](../../packages/core/session/src/index.ts)
<!-- END GENERATED cordis-surface -->
