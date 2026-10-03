# SessionTelemetryBackend
[English](session-telemetry.md) | [中文](session-telemetry.zh.md) | Deutsch


Die ausgehende Session-Berichterstattung ist als [capability seam](../capability-seams.de.md) aufgeteilt: Service Definition und Capture-Koordinator ([dsh-session-telemetry](../../packages/session/session-telemetry), `ctx.sessionTelemetry`) besitzen die vollständige Erfassung kanonischer Events, den `session-telemetry/record`-Redaktions-waterfall, den Handoff-Cursor und den minimalen Backend-Contract; der Service Provider, den ein Deployment lädt ([dsh-session-telemetry-otel](../../packages/session/session-telemetry-otel)), ist die wortgetreu konfigurierte Log-Pipeline des OpenTelemetry JS SDK. Es ist eine optionale Fähigkeit, nicht Teil der agent-loop-Spine, und nichts davon erreicht einen Model-Request. Das Boundary-Axiom — die Zuständigkeit des Harness endet bei `emit()`; Batching, Retry, Queueing und Verlustpolitik gehören dem Reporting-SDK — und die verworfenen Alternativen sind im [Revival-Agent-Note](../../.agents/notes/implemented/feature/2026-07-23-session-telemetry-otel-revival.de.md) festgehalten; die Capture- und Cursor-Contracts stehen im [Service-Definition-README](../../packages/session/session-telemetry/README.de.md).

Quelle: [`packages/session/session-telemetry/src/index.ts`](../../packages/session/session-telemetry/src/index.ts)

## Der logische Datensatz

```ts type-equiv
/**
 * Severity of a telemetry record, pre-mapped at capture so a receiver can
 * alert with zero configuration: `error` for events whose own outcome flag
 * says so (the tool-result block's `isError`, `turn/end` error reasons) and for
 * `agent-error` operational records. Captured events otherwise default to
 * `info`; `warn` remains available to `session-telemetry/record` policies and
 * backends.
 */
type SessionTelemetrySeverity = 'info' | 'warn' | 'error'
```

```ts type-equiv
/**
 * One logical record handed to a backend — the capture contract's whole outbound
 * vocabulary. Ledger records mirror session-log events one-to-one;
 * operational records (`channel: 'ops'`) carry the two signals with no log
 * home (`agent-error`, `shutdown`) and deliberately omit `event.seq`-style
 * identity so they can never be mistaken for ledger rows.
 */
interface SessionTelemetryRecord {
  /** Ledger (session-log mirror) or ops (operational signal) channel; backends keep the two under separate instrumentation scopes. */
  channel: 'ledger' | 'ops'
  /** Unix epoch milliseconds — the source event's append time for ledger records, the emission time for ops records. */
  time: number
  /** Pre-mapped alerting severity; see {@link SessionTelemetrySeverity}. */
  severity: SessionTelemetrySeverity
  /**
   * Identity attributes, deliberately minimal: ledger records carry
   * `session.id`, `session.format_version`, `event.type`, `event.seq`, plus optional
   * `session.cwd` / `session.parent_id`; a seeded Session also carries
   * `session.seed_length` from its exact inherited event count;
   * ops records carry `telemetry.op`, `session.id`, and (for `agent-error`)
   * `agent.id`, `turn`, `step`, `error.name`. Anything recoverable from the
   * body is intentionally NOT duplicated here.
   */
  attributes: Record<string, string | number>
  /**
   * The complete payload: a deep copy of the session event's `data` for
   * ledger records (JSON-serializable by `Session.append`'s own
   * validation), or the op payload for ops records. Never mutated after
   * handoff.
   */
  body: unknown
}
```

Jedes kanonische [Session-Event](session.de.md) — einschließlich jeder `assistant/message` oder `assistant/attempt` mit ihrem vollständigen kompakten Stream und jedes vom Plugin zusammengeführten Typs, den der seam nie kannte — passiert vollständig als ein geordneter Ledger-Datensatz. Prozesslokale `agent/assistant-stream`-Frames gelangen nicht in dieses durable Feed. Ein neues Session-Objekt beginnt an seiner Lebenszyklusgrenze, es sei denn, das Backend wählt `includeHistory`; die erneute Übernahme desselben Objekts setzt nach seinem Handoff-Cursor fort. Die Zustellung ist best-effort: Der Cursor markiert übergeben, nicht zugestellt, und Datensätze können verloren gehen (Absturz, Reload-Fenster) oder dupliziert werden (Replay eines neuen Objekts, SDK-Retries), daher deduplizieren Empfänger Ledger-Datensätze anhand von `(session.id, session.format_version, event.seq)`; Ops-Datensätze lassen diese Identität absichtlich weg — sie sind Signale zum Alerten, keine Einträge zum Summieren, und tolerieren Duplikate.

## Die Sharing-Offenlegung

Jedes Backend legt seinen vom Deployment gewählten Modus über das erforderliche abstrakte `sharing`-Member auf `ctx.sessionTelemetry` offen ([Service-Definition-README](../../packages/session/session-telemetry/README.de.md#the-sharing-disclosure)). Es ist weder eine admission-Entscheidung pro Session noch eine Zustellbestätigung. Die `/feedback`-Bestätigung konsultiert sie nicht.

```ts type-equiv
/**
 * Deployment-selected session-sharing mode, not confirmation of SDK delivery.
 */
type SessionTelemetrySharingStatus = 'full' | 'feedback-only' | 'disabled'
```

## Erfassungsrichtlinie

```ts type-equiv
/** Whether capture follows live events or reads the canonical log only when requested. */
type SessionTelemetryCapture = 'live' | 'on-demand'
```

```ts type-equiv
/** Backend-selected capture mode and history policy. */
interface SessionTelemetryCaptureOptions {
  /** Follow live events, or wait for explicit capture; defaults to live. */
  capture?: SessionTelemetryCapture
  /** Include stored history before this lifecycle; defaults to false. */
  includeHistory?: boolean
}
```

`includeHistory` erlaubt gespeicherte und vererbte Datensätze, autorisiert aber selbst keine Erfassung. Das [OTel-Backend](../../packages/session/session-telemetry-otel/README.de.md) nutzt On-Demand-Erfassung und verlangt ein neues eigenes explizites Feedback; es gibt nur das vollständige Präfix bis zu diesem Feedback frei, für jeden provider.

## Der Backend-Contract

```ts type-equiv
/**
 * The minimum backend contract the coordinator requires. {@link SessionTelemetryBackend} is
 * its service-registered form; tests compose the coordinator with a bare
 * implementation of this interface.
 */
interface SessionTelemetrySink {
  /**
   * Hand one record to the backend's pipeline. MUST be a non-blocking
   * enqueue — the coordinator calls this synchronously from the
   * `session/event` hot path or an explicit canonical-log capture, so anything
   * slower than a queue push would tax the agent loop or feedback handling.
   * Errors thrown here are contained by the coordinator and logged; they
   * never reach the loop.
   * @param record - the logical record to report; owned by the backend after the call.
   */
  emit(record: SessionTelemetryRecord): void
  /**
   * Optional hint that a turn ended. A backend may forward it to its SDK's
   * flush so records are exported after each turn. Called
   * fire-and-forget; implementations must not block and must not throw
   * meaningfully (the coordinator contains exceptions). Most backends should
   * leave this unimplemented and let their SDK's own batching cadence govern
   * export timing: a backend that does implement it owns the interaction
   * between its concurrent flushes and {@link shutdown}'s drain (the OTel
   * backend leaves it unimplemented for exactly that hazard — see the
   * revival Agent Note).
   */
  flush?(): void
  /**
   * Forward the fiber's disposal to the SDK: flush whatever is queued and
   * reach quiescence, per the SDK's own shutdown contract. Everything
   * emitted before this call must still be delivered — including records
   * enqueued while a {@link flush} hint is in flight, so a backend whose SDK
   * guards against concurrent flushes orders behind the outstanding one (the
   * coordinator emits its dispose-time `shutdown` markers immediately before
   * calling this). Awaited by the coordinator's dispose; a rejection is
   * logged as a warning and never fails application teardown.
   * The coordinator captures dispose-time shutdown markers immediately before
   * this call for live capture; on-demand capture creates no ops records.
   * @returns resolves when the backend's pipeline has quiesced.
   */
  shutdown(): Promise<void>
}
```

`SessionTelemetryBackend` (`ctx.sessionTelemetry`, [Signaturen](#ctxsessiontelemetry--sessiontelemetrybackend-abstract-seam)) ist die ladbare Form des Contracts — eine Implementierung pro Kontext, doppeltes Laden wirft — und ein Backend komponiert den `SessionTelemetryCoordinator` des seam in seinem Konstruktor, um die Capture-Seite zu installieren.

## Der Redact-waterfall: `session-telemetry/record`

Jeder Datensatz durchläuft den `session-telemetry/record`-[waterfall](../cordis-primer.de.md#cordis-waterfall-semantics) zwischen der Kopie des kanonischen Events und `emit()` ([Event-Eintrag](#session-telemetryrecord--waterfall)). Der seam liefert KEINE eigenen Regeln: Ohne gemountete Listener erreichen die Datensätze das Backend exakt wie erfasst, sodass exportierte Daten genau so sauber sind wie die Regeln, die ein Deployment mountet. Listener stapeln sich, indem sie den Rückgabewert von `next()` transformieren; ein Return ohne `next()` ersetzt alles darunter; ein werfender Listener hält diesen einen Datensatz fail-closed innerhalb der Containment des Koordinators zurück. Die Redaktion gilt nur für die exportierte Kopie — das kanonische Session-Log wird nie umgeschrieben.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.de.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsessiontelemetry--sessiontelemetrybackend-abstract-seam"></a>

### `ctx.sessionTelemetry` — `SessionTelemetryBackend` (abstract seam)

Loadable form of the backend contract: one implementation per context — the cordis `Service` registration under the `telemetry` key throws on a duplicate, cordis' standard behavior. A backend composes a SessionTelemetryCoordinator in its constructor to install the capture side.

```ts cordis-catalog
/**
 * See {@link SessionTelemetrySink.emit} — that declaration is the contract's one home.
 * @param record - the logical record to report; owned by the backend after the call.
 */
abstract emit(record: SessionTelemetryRecord): void

/** See {@link SessionTelemetrySink.flush}. */
flush?(): void

/**
 * See {@link SessionTelemetrySink.shutdown}.
 * @returns resolves when the backend's pipeline has quiesced.
 */
abstract shutdown(): Promise<void>
```

Source: [`packages/session/session-telemetry/src/index.ts`](../../packages/session/session-telemetry/src/index.ts)

<a id="session-telemetry-events"></a>

### `session-telemetry/*` events

<a id="session-telemetryrecord--waterfall"></a>

#### `session-telemetry/record` — waterfall

Transform one outbound record before it reaches the backend. This waterfall is the Service Definition's redaction extension point. It ships NO rules of its own: the innermost `next()` passes the record through unchanged, and with no listener mounted records reach the backend as captured, so exported data is exactly as clean as the rules a deployment mounts. Listeners stack by transforming `next()`'s return value; returning without `next()` replaces everything beneath. Dispatched synchronously on the capture hot path inside the coordinator's containment: a throwing listener withholds that one record (fail-closed) and never reaches the agent loop. Live capture dispatches at append time; on-demand capture dispatches while reading the canonical log. Redaction applies to the exported copy only; the canonical session log is never rewritten.

```ts cordis-catalog
/**
 * Transform one outbound record before it reaches the backend. This
 * waterfall is the Service Definition's redaction extension point. It ships NO rules
 * of its own: the
 * innermost `next()` passes the record through unchanged, and with no
 * listener mounted records reach the backend as captured, so exported
 * data is exactly as clean as the rules a deployment mounts. Listeners
 * stack by transforming `next()`'s return value; returning without
 * `next()` replaces everything beneath. Dispatched synchronously on the
 * capture hot path inside the coordinator's containment: a throwing
 * listener withholds that one record (fail-closed) and never reaches the
 * agent loop. Live capture dispatches at append time; on-demand capture
 * dispatches while reading the canonical log. Redaction applies to the
 * exported copy only; the canonical session log is never rewritten.
 * @param record - the candidate record, already the coordinator's own deep
 *   copy; listeners return a (possibly new) record and must not mutate it.
 * @mode waterfall
 */
'session-telemetry/record'(record: SessionTelemetryRecord, next: () => SessionTelemetryRecord): SessionTelemetryRecord
```

Source: [`packages/session/session-telemetry/src/index.ts`](../../packages/session/session-telemetry/src/index.ts)
<!-- END GENERATED cordis-surface -->
