# Session-Persistenz

[English](persistence.md) | [中文](persistence.zh.md) | Deutsch

Die **Durability-Seam** für das Event-Log. [session.md](session.de.md) beschreibt die in-memory `Session` — das append-only `SessionEvent`-Log, das die Quelle der Wahrheit ist. Diese Seite beschreibt, wie dieses Log dauerhaft gemacht wird: der abstrakte `SessionPersistence`-Service, sein Provider-Modell und der ausgelieferte JSONL-Backend, der Flush-Checkpoint, die Crash-Wiederherstellung und der Metadaten-Header, der neben dem Log mitgeführt wird. Das Event-Vokabular, das das Log trägt, wird im generierten [Persistence-Log-Event-Katalog](../persistence-catalog.de.md) Mitglied für Mitglied aufgezählt.

Die Seam ist eine [capability seam](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.de.md): ein abstrakter Service ([dsh-session-persistence](../../packages/session/session-persistence), `ctx.sessionPersistence`), der `create`/`open`/`stat`/`list` über dem bestehenden `SessionEvent` exponiert — **kein paralleler persistierter Event-Typ** — wobei `create` und `open` ein pro Session gebildetes `SessionHandle` (`read`/`append`/`flush`/`close`) zurückgeben, das den gesamten Log-Zugriff und die Single-Writer-Ownership trägt. Das Repository liefert [dsh-session-persistence-jsonl](../../packages/session/session-persistence-jsonl) als seinen Provider; Out-of-Tree-Provider können denselben Service-Contract implementieren. Siehe die [handle-based persistence Agent Note](../../.agents/notes/implemented/architecture/2026-08-27-handle-based-session-persistence.de.md) und die [session-persistence Agent Note](../../.agents/notes/implemented/architecture/2026-06-14-session-persistence.de.md).

## `SessionHandle` — ein offener Kanal zu einer gespeicherten Session

Jeder Log-Lese- und -Schreibvorgang fließt durch ein Handle, nie durch id-adressierte Service-Methoden: Das Handle ist die einzige Tür, die das Cross-Process-Write-Lease bewacht. Ein Lesen gibt einen caller-eigenen äußeren Slice und den vom Produzenten etablierten Aliasierungs-Status seiner Event-Werte zurück. Ein Handle-Typ dient beiden Zugriffen — eine Mutation auf einem `read`-Handle ist ein Runtime-`SessionReadOnlyError`, keine typisierte Aufteilung — und die In-Process-Single-Writer-Ownership lässt ein zweites `open(id, 'write')` mit `SessionAlreadyOwnedError` ablehnen, solange ein Owner aktiv ist.

```ts type-equiv
/** One persistence event slice returned by {@link SessionHandle.read}. */
interface SessionHandleReadResult {
  /**
   * Whether event values are exclusively owned or shared only after deep
   * freezing. Slicing preserves the producer's state even when no events remain.
   */
  readonly eventState: SessionSeedEventState
  /** Event values in a caller-owned outer array. */
  readonly events: readonly SessionEvent[]
}
```

```ts type-equiv
/**
 * One open channel onto a stored session. A handle is single-owner state, not
 * a shared service: `read` never backtracks below what this handle already
 * observed, a `write` handle reads its own successful appends, and `close()`
 * is the one teardown (idempotent, uncancellable; `Symbol.asyncDispose`
 * delegates to it). Every operation on a closed handle rejects with
 * `SessionHandleClosedError`.
 *
 * Freshness across handles: once an `append` or `flush` resolves on a write
 * handle, every read STARTED afterwards on the same backend instance — on any
 * handle, or through `stat`/`list` — observes at least that prefix.
 * Reads concurrent with a mutation carry no ordering promise beyond the valid
 * contiguous prefix.
 */
interface SessionHandle extends AsyncDisposable {
  /** The stored session this handle addresses. */
  readonly id: SessionId
  /** The immutable stored header, fixed at `create`/`open`. */
  readonly header: SessionHeader
  /**
   * Exact fork-inherited prefix length stored with the log; `0` when
   * `header.isSeeded` is false. Storage metadata paired with the header for
   * every body read, never part of the replayable event log.
   */
  readonly inheritedEventCount: SessionLogOffset
  /** Whether this handle may mutate the log. */
  readonly access: SessionAccess

  /**
   * Read a slice of the valid contiguous logical log. The slice is a legal log
   * prefix segment: a torn physical tail is never returned, and repeated reads
   * on this handle never observe an older state than a prior read.
   * @param offset - first logical event seq to include; defaults to `0`.
   * @param length - maximum number of events to return; defaults to the rest
   *   of the log. An offset at or past the end returns an empty list.
   * @param options - optional cancellation.
   * @returns the caller-owned outer slice plus the ownership state of its event values.
   */
  read(offset?: number, length?: number, options?: SessionHandleReadOptions): Promise<SessionHandleReadResult>

  /**
   * Append a contiguous batch continuing the current logical end. The first
   * event's `seq` MUST equal the stored next-seq; committed events are never
   * rewritten. Persistence is best-effort: on resolution the batch is
   * accepted, ordered, and visible to reads on this backend instance, but
   * only a resolved {@link flush} promises it survives a crash — a backend
   * may buffer or batch physical writes behind append. Rejects with
   * `SessionReadOnlyError` on a read handle and `SessionOwnershipLostError`
   * when write ownership is gone.
   * @param events - the contiguous batch, in seq order.
   * @param options - optional cancellation observed before the write starts.
   */
  append(events: readonly SessionEvent[], options?: SessionHandleAppendOptions): Promise<void>

  /**
   * The durability barrier — the one operation that promises storage: on
   * resolution every acknowledged append is durable and the session is
   * materialized for other processes; an empty created session becomes
   * durably listable here. Callers that must survive a crash flush; a backend
   * whose `append` already persists on resolution treats this as
   * materialize-if-needed. Rejects with `SessionReadOnlyError` on a read
   * handle.
   * @param options - optional cancellation observed before the barrier starts.
   */
  flush(options?: SessionHandleFlushOptions): Promise<void>

  /**
   * Release the handle: a read handle frees local resources; a write handle
   * completes pending durability and releases write ownership. Idempotent,
   * asynchronous, and deliberately not cancellable.
   */
  close(): Promise<void>
}
```

Eine erstellte Session ist in diesem Prozess ab dem Moment beobachtbar, in dem `create` aufgelöst ist, während ein Backend die physische Materialisierung (eine reine Optimierung) bis zum ersten `append` oder `flush` verschieben darf; andere Prozesse sehen nur materialisierte Sessions, und eine Session, die vor einem Crash nie materialisiert wurde, hat nie existiert.

## Der Flush-Checkpoint

`session/event` ist eine *synchron*e Benachrichtigung; der montierte Backend leitet sie nach Session-id in das begrenzte write-behind-Fenster des aktiven Write-Handles weiter, ohne den Produzenten zu blockieren (der Backend installiert diese Listener einmal, weil die Persistenz bereits ein aktives Write-Handle pro id durchsetzt). Das erste ausstehende Event startet ein festes internes Batch-Fenster, und spätere Events treten ein, ohne seine Deadline zurückzusetzen. Die Ablaufzeit startet einen dauerhaften `append` durch das Write-Handle der Session; während dieses Schreibvorgangs zugelassene Events erhalten ihre eigene Deadline und bilden ein Folge-Batch. `session/flush` bricht das Warten ab und leert bis zur Quiescence, daher nutzt die Schleife es weiterhin als Orderings- und Fehlerbeobachtungs-Checkpoint, bevor sie den nächsten gewöhnlichen Turn beansprucht. Ein abgelehnter Hintergrund-Schreibvorgang behält seine Events in der Reihenfolge, pausiert den automatischen Weg und wird über den Logger berichtet; der nächste explizite Flush wiederholt und lehnt laut gegenüber seinem Aufrufer ab. `session/disposed` führt denselben abschließenden Drain durch und schließt das Handle, und `close()` selbst leert den geleiteten Puffer durch den noch offenen Speicher, sodass die Close-Sweep des Backend-Teardowns nichts verliert. Das Fenster begrenzt nur das bewusste Batch-Warten, nicht die Event-Loop-Scheduling oder die Durability-Latenz des Backends.

## Crash-Wiederherstellung erhält einen unterbrochenen Turn

Ein Log, das mitten im Turn gecrasht ist, endet mit einem offenen `turn/start` und ohne `turn/end`. Die Persistenz truncatiert es **nicht** und repariert es nicht — ein einzelner Turn kann in einer Long-Horizon-Aufgabe riesig sein (viele Steps, große Tool-Outputs), und diese Events wurden vor dem Crash dauerhaft angehängt. Sie gibt das physisch gültige zusammenhängende Log zurück; nur das unvollständige Fragment eines zerrissenen physischen Schwanzes, das zu einem nie aufgelösten Append gehört, wird verworfen — vollständige Aufzeichnungen, die daraus wiederhergestellt werden (der JSONL-Backend dekodiert einen zerrissenen Zstandard-Frame teilweise), werden vom Schreibweg vor dem ersten neuen Append des Handles dauerhaft neu geschrieben. Reparatur ist die Aufgabe des Lesers: resume (agent-loop) liest das gespeicherte Log durch sein Write-Handle, berechnet `interruptedTurnClosers` — fehlende Tool-Fehler, jedes offene `step/end` und ein synthetisches `turn/end { reason: { kind: 'interrupted' } }` — und hängt sie durch dasselbe Handle als gewöhnliches Batch an, bevor er die Session veröffentlicht. `interrupted` ist der eine `TurnEndReason`, den keine Schleife emittiert (siehe [session.md](session.de.md#why-a-turn-ended-turnendreasonmap)).

Reparatur schreibt daher nur unter Write-Ownership: Das Write-Handle einer live Session wird von ihrem Lifecycle-Owner gehalten, daher lehnt ein gleichzeitiges `open(id, 'write')` mit `SessionAlreadyOwnedError` ab, statt dass die Reparatur mit einem live Turn konkurriert. Read-only-Beobachter (session-query) balancieren ein unterbrochenes kaltes Log nur in Memory mit denselben Closers und schreiben nichts zurück.

Read-only-Beobachtung ist `open(id, 'read')`: Das Handle dient validierte zusammenhängende Präfix-Slices, nie einen zerrissenen Schwanz, und wiederholte Lesungen auf einem Handle beobachten nie einen älteren Zustand als eine frühere Lesung. Es gibt keinen persistence-seitigen prepared-Session-Cache: session-query besitzt seinen Cold-Read-Cache, keyt eine balancierte kalte Session pro id auf dem `stat().revision`-Change-Token und liest nur neu, wenn sich das Token ändert. Die [handle-based persistence Agent Note](../../.agents/notes/implemented/architecture/2026-08-27-handle-based-session-persistence.de.md) besitzt diesen Lifecycle; die archivierte [Session preparation record](../../.agents/notes/archived/architecture/2026-08-05-session-preparation.md) dokumentiert die ursprüngliche publication-boundary-`SessionPreparation`-Entscheidung.

## `SessionLocation` — Artefakt-Ziel der Refusal-Diagnostik

`SessionLocation` ist keine consumer-facing Query: Der Log-Zugriff geht durch das `read` eines Session-Handles. Es überdauert nur als Refusal-Diagnostik, indem es einem `SessionFormatUnsupportedError` erlaubt, das rohe Log zu benennen, das ein Build nicht zu interpretieren bereit war. JSONL liefert den absoluten Transcript-Pfad innerhalb seines project/session-Verzeichnisses; ein Backend ohne ein Artefakt pro Session liefert nichts.

```ts type-equiv
/**
 * A backend-resolved, per-session local artifact location. Carried only by
 * refusal diagnostics ({@link SessionFormatUnsupportedError}) so a user can
 * find the raw log a build refused to interpret; it is not a consumer-facing
 * query — log access goes through a session handle's `read`.
 */
interface SessionLocation {
  /** Backend-specific artifact kind, for example `jsonl`. */
  readonly kind: string
  /** Absolute path to this session's backend-owned artifact. */
  readonly path: string
}
```

<a id="sessionheader--metadata-beside-the-log"></a>

## `SessionHeader` — Metadaten neben dem Log

Pro-Session-Metadaten reisen **getrennt** vom Event-Log: Der Header trägt die Format-Version, den cwd und das `isSeeded`-Lineage-Bit, während body-tragende Speicher-Werte den exakten ererbten Cut daneben tragen. Keines gehört zu `SessionEventMap` oder erreicht `deriveMessages()`. Der logische Header wird über `session.header` angehängt; die Session exponiert ihren Cut als `inheritedEventCount`.

Source: [`packages/core/session/src/types.ts`](../../packages/core/session/src/types.ts)

```ts type-equiv
/**
 * Immutable validated storage metadata, kept outside the conversation event log.
 */
interface SessionHeader {
  /**
   * Current logical format version, stamped from {@link SESSION_FORMAT_VERSION}.
   * Historical physical headers are translated before entering this interface.
   */
  readonly version: typeof SESSION_FORMAT_VERSION
  /** The session's id (mirrors the {@link Session}'s id). */
  readonly id: SessionId
  /** Non-negative safe-integer Unix epoch milliseconds when the session was created. */
  readonly createdAt: number
  /** Absolute working directory the session was created in (if any). */
  readonly cwd?: string
  /** The session this one was forked from (seed lineage), if any. */
  readonly parentSession?: SessionId
  /**
   * Whether this Session contains a fork-inherited event prefix. The exact prefix
   * length is Session state rather than ordinary header metadata.
   */
  readonly isSeeded: boolean
  /**
   * Coarse product classification for a session created as a subagent child.
   * This is presentation metadata, not proof that the child is continuable.
   */
  readonly origin?: 'subagent'
  /**
   * Delegation depth: absent (zero) for a top-level session, parent depth + 1
   * for a subagent child. Persisted so a recursion budget survives restart and
   * resume — a runtime-only depth would reset a resumed child to top-level.
   */
  readonly delegationDepth?: number
  /**
   * Id of the agent preset this session's agent was composed from, when the
   * deployment composes per session. Durable because the preset decides the
   * session's tools and prompt: a resume that restored a different composition
   * would replay history the model can no longer act on.
   */
  readonly agentPreset?: string
}
```

## Format-Refusal — Logs, die ein Build nicht treu lesen kann

Ein Backend lehnt ein Log, das es nicht treu interpretieren kann, mit `SessionFormatUnsupportedError` ab, getrennt von `SessionPersistenceCorruptionError`, weil nichts beschädigt ist. `stat` und `list` klassifizieren die höchste kanonische Generation und übersetzen einen unterstützten historischen Header, ohne seinen Body zu lesen oder zu verändern. Historische `open`-Aufrufe teilen eine pro-Session-Migrationsvorbereitung, bevor sie aktuelle logische Werte zurückgeben, und lassen jeden Quell-Pfad, jedes Byte und jede Inode unverändert. Der JSONL-Provider gibt ein Read-Handle aus diesem in-memory-Ergebnis zurück, ohne zu publizieren; ein Write-Open hält seinen Single-Writer-Anspruch und sein Datei-Lease, während er die Vorbereitung wiederverwendet, publiziert exklusiv die finale aktuelle Generation und gibt erst dann das schreibbare Handle zurück. Eine zukünftige höchste Generation lehnt ab, selbst wenn eine ältere lesbare Generation bleibt. Die Wiederherstellung im aktuellen Format behält installierte Erweiterungen und unbekannte Events mit `ignorable: true` bei; die historische v0/v1/v2-Migration lehnt einen unbekannten Typ ab, selbst wenn er als ignoriert markiert ist. Die Nachricht hängt den gewählten rohen Log-Pfad an, wenn der Backend ein Artefakt pro Session hält. Ein Out-of-Tree-Backend muss äquivalente current-only-Handle-Werte und richtungs-bewusste Ablehnungen an seinem physical-format-Eingang durchsetzen. Die [released-format migration decision](../../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.de.md) besitzt die Kette und die immutable-publication-Regeln.

## `CreateSessionOptions` — Seeding und Metadaten

Das Erstellen einer `Session` durch den Store nimmt ein `seed` (anfänglicher Replay oder Fork-Historie), ein optionales exaktes `inheritedEventCount` und `meta` (die storage-level-Felder, die der Store in einen `SessionHeader` faltet). Der Store füllt `version`/`id` aus und setzt `createdAt` auf den Default; der Aufrufer kann den validierten absoluten `cwd`, die `parentSession`-Lineage, das `isSeeded`-Lineage-Bit, das optionale grobe `origin`, `delegationDepth`, `agentPreset` und ein bestehendes `createdAt` liefern. Eine geseedete Erstellung erfordert ein explizites seed, das seinem ererbten Präfix entspricht, und einen exakten Cut; der Constructor hängt den child-eigenen markierten end-seed-Marker an diesem Cut an, bevor setup child-eigene Events hinzufügt. `origin: 'subagent'` erlaubt der Produkt-Navigation, doppelte Child-Rows zu verstecken; es beweist nicht, dass ein Descriptor gültig ist oder dass das Kind resumed werden kann.

```ts type-equiv
/**
 * Options for creating a {@link Session} via the store. `seed` replays/forks
 * an existing event log; `meta` carries the caller-supplied storage fields the
 * store folds into a {@link SessionHeader}.
 */
interface CreateSessionOptions {
  /** Initial replay or fork history supplied at construction. */
  readonly seed?: readonly SessionEvent[]
  /**
   * Exact fork-inherited prefix length when `meta.isSeeded` is true. The
   * constructor seed is exactly this inherited prefix; the constructor
   * appends the child-owned tagged marker at the cut.
   */
  readonly inheritedEventCount?: SessionLogOffset
  /**
   * Storage metadata read once before publication. `isSeeded` marks fork
   * lineage; supplying replay history alone does not make it inherited.
   */
  readonly meta?: {
    readonly cwd?: string
    readonly parentSession?: SessionId
    readonly createdAt?: number
    readonly isSeeded?: boolean
    readonly origin?: 'subagent'
    readonly delegationDepth?: number
    readonly agentPreset?: string
  }
}
```

Replay/Fork ist daher `ctx.agents.create({ sessionId, seed, meta })` — ein Fork liefert zusätzlich `inheritedEventCount` mit `meta.isSeeded: true`, und nur von agent-loop publizierte Sessions persistieren, und die Schleife speichert das seed durch das Write-Handle der neuen Session vor der Publikation; das Resumieren einer *persistierten* Session in einen live Agent ist `ctx.agents.resume({ resumeSessionId })`.

## Vorbereitung und Ownership der Wiederherstellung

`SessionStore.prepare()` akzeptiert gewöhnliche Creation-Options oder ein adoptierbares seed durch `RestoredSessionOptions`. Sein `eventState` sagt, ob Event-Werte unabhängig besessen sind oder nur nach tiefem Freezing geteilt werden; der Produignant etabliert diesen Zustand, und Slicing leitet keinen anderen Zustand aus der Ergebnis-Länge ab. Wiederherstellung validiert und adoptiert diese Werte ohne eine weitere Kopie oder Freeze-Passage. `SessionPreparation` besitzt dann die exakte unveröffentlichte Session bis zur Publikation oder Rollback; Disposal ist synchron und idempotent. Das resume von agent-loop liest dieses Ergebnis durch das Write-Handle der Session und hängt unabhängig besessene `interruptedTurnClosers` vor der Vorbereitung an.

```ts type-equiv
/**
 * Aliasing state of an adoptable Session seed. `shared-frozen` permits deeply
 * frozen aliases plus independently owned unfrozen values in the same seed.
 */
type SessionSeedEventState = 'detached' | 'shared-frozen'
```

```ts type-equiv
/**
 * Adoptable storage values transferred to {@link SessionStore.prepare}
 * without another copy or freeze pass.
 */
interface RestoredSessionOptions {
  /** Events that are independently owned or already deeply frozen. */
  readonly seed: SessionEvent[]
  /** Independently owned storage metadata to validate and freeze in place. */
  readonly meta: SessionHeader
  /** Exact number of fork-inherited leading events decoded from storage. */
  readonly inheritedEventCount: SessionLogOffset
  /** Aliasing state carried from the operation that produced the seed. */
  readonly eventState: SessionSeedEventState
}
```

```ts type-equiv
/** Inputs accepted while constructing an unpublished Session. */
type PrepareSessionOptions =
  | (CreateSessionOptions & { readonly eventState?: undefined })
  | RestoredSessionOptions
```

```ts type-equiv
/** Options for a preparation whose provider retains unpublished state. */
interface SessionPreparationOptions {
  /** Release provider-owned state when the Session was not published. */
  readonly release?: () => void
}
```

```ts public-api
/**
 * One exact unpublished Session and the provider state that keeps it usable.
 * Disposal is synchronous and idempotent. Providers decide whether release
 * returns the Session to a cache or discards it; publication may consume that
 * state before disposal, making the callback a no-op.
 */
declare class SessionPreparation implements Disposable {
  /** The exact Session to use for setup and publication. */
  readonly session: Session;
  /**
   * Wrap an unpublished Session in one preparation lifetime.
   * @param session - exact unpublished Session.
   * @param options - optional provider release behavior.
   * @returns a preparation disposed after publication or rollback.
   */
  static create(session: Session, options?: SessionPreparationOptions): SessionPreparation;
  /** Release provider state once when this preparation leaves its caller. */
  [Symbol.dispose](): void;
}
```

## Leichtgewichtige Source-Revisions

Consumer abgeleiteter Read-Model vergleichen eine billige opake Revision, bevor sie ein vollständiges Event-Log laden. Die Revision ist ein per-Backend-Instanz-Change-Token aus `stat`/`list`: Gleiche Revisionen dürfen als unverändertes Log behandelt werden; ungleiche Revisionen versprechen nichts, und Write-Ownership-Churn verändert nie eine. session-query keyt seinen Cold-Read-Cache darauf; das Token spielt keine Rolle in open, read oder resume.

```ts type-equiv
/**
 * Backend-owned token that identifies both one storage source and one revision
 * of a persisted session log.
 */
type SessionPersistenceRevision = Branded<'SessionPersistenceRevision'>
```

```ts type-equiv
/**
 * Lightweight stored-session observation returned by {@link SessionPersistence.stat}
 * and {@link SessionPersistence.list} without reading the full event log.
 */
interface SessionPersistenceSnapshot {
  /** Detached metadata for one stored session. */
  readonly header: SessionHeader
  /** Opaque change token; see {@link SessionPersistence.stat}. */
  readonly revision: SessionPersistenceRevision
  /** Logical event count, when the backend can provide it cheaply from metadata; otherwise absent. */
  readonly eventCount?: number
  /** Physical artifact byte size, when the backend can provide it cheaply (JSONL); otherwise absent. */
  readonly sizeBytes?: number
}
```

Die optionalen `eventCount`/`sizeBytes`-Felder bleiben billige Backend-Beobachtungen für Consumer, die sie explizit benötigen. Die Session-Liste verwendet kein Feld, um kalte Logs zu öffnen: Sie liest nur Header plus identity-geprüfte projection-cache-Hinweise, sodass ein Cache- oder Session-Format-Upgrade den Start nie in einen Body-Scan verwandelt.

## Der Backend

Der ausgelieferte Provider implementiert den abstrakten `SessionPersistence`-Contract (`create`/`open`/`stat`/`list`, mit pro-Session-`SessionHandle`s, die `read`/`append`/`flush`/`close` tragen und durchgängig optionale Cancellation) und besteht die geteilte persistence contract suite:

- **[dsh-session-persistence-jsonl](../../packages/session/session-persistence-jsonl)** — ein append-only logisches JSONL-Log pro Session, standardmäßig als geprüfte, konkatentierte Zstandard-Frames gespeichert oder nach Konfiguration als rohe Zeilen, mit crash-sicherer atomarer Materialisierung, per-Batch-`fsync`-Appends und zerrissenen-Schwanz-Trunkation vor dem ersten neuen Append. `stat`/`list` tragen `sizeBytes` und eine best-effort-`fs.stat`-abgeleitete Revision.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.de.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsessionpersistence--sessionpersistence-abstract-seam"></a>

### `ctx.sessionPersistence` — `SessionPersistence` (abstract seam)

Durable append-only session storage addressed through per-session handles.

Storage semantics shared by every backend: events are contiguous from seq 0 and never rewritten; a torn physical tail is never returned to a reader and is truncated by the write path before its first append; reads validate current-format records only and refuse unknown vocabulary fail-closed. `append` persists best-effort; `flush` — per handle or service-wide — is the durability barrier.

Visibility: a created session is observable through `stat`/`list`/`open` in this process from the moment `create` resolves, even while a backend defers physical materialization (a pure optimization); other processes see the session only once it materializes, and a session that never materialized before a crash never existed. `SessionHandle.flush` forces materialization.

Freshness: once an `append` or `flush` resolves, reads started afterwards on this backend instance observe at least that prefix.

```ts cordis-catalog
/**
 * Create a new stored session and take its write ownership.
 * @param header - the immutable header (id, version, cwd, lineage) to store.
 * @param options - optional cancellation.
 * @returns a `write` handle owned by the caller; close it to release ownership.
 * @throws {SessionAlreadyExistsError} when the id already exists.
 */
abstract create(header: SessionHeader, options?: SessionPersistenceCreateOptions): Promise<SessionHandle>

/**
 * Open an existing stored session.
 *
 * `read` never takes ownership and works while another handle (or process)
 * holds write ownership. `write` atomically claims single-writer ownership;
 * an existing active owner rejects.
 * @param id - the stored session to open.
 * @param access - `read` or `write`.
 * @param options - optional cancellation.
 * @returns the open handle.
 * @throws {SessionPersistenceNotFoundError} when the session does not exist.
 * @throws {SessionAlreadyOwnedError} for `write` when ownership is taken.
 */
abstract open(id: SessionId, access: SessionAccess, options?: SessionPersistenceOpenOptions): Promise<SessionHandle>

/**
 * Flush every active write handle owned by this service instance in one
 * durability barrier: each handle's routed live events drain durably and
 * its session materializes, exactly as that handle's own
 * `SessionHandle.flush` would. Read handles buffer nothing and are
 * untouched. A handle closed concurrently counts as flushed — close itself
 * drains durably.
 * @returns resolution once every write handle active at the call has flushed.
 * @throws {AggregateError} naming each session whose flush failed; the
 *   remaining handles still flush.
 */
abstract flush(): Promise<void>

/**
 * Observe one stored session without reading its event log or taking
 * ownership.
 *
 * The snapshot's `revision` is an opaque change token comparable only
 * against revisions from the same service instance and session id: equal
 * revisions may be treated as an unchanged log; unequal revisions promise
 * nothing. Write-ownership churn does not change a revision. It exists for
 * derived read-model caches keyed off `stat`/`list`; it plays no part in
 * open, read, or resume.
 * @param id - the stored session to observe.
 * @param options - optional cancellation.
 * @returns the snapshot, or `undefined` when the session does not exist.
 */
abstract stat(id: SessionId, options?: SessionPersistenceStatOptions): Promise<SessionPersistenceSnapshot | undefined>

/**
 * List every stored session visible to this process, in no promised order.
 * @param options - optional cancellation.
 * @returns one snapshot per stored session.
 */
abstract list(options?: SessionPersistenceListOptions): Promise<readonly SessionPersistenceSnapshot[]>
```

Types: [SessionId](core.de.md)

Source: [`packages/session/session-persistence/src/index.ts`](../../packages/session/session-persistence/src/index.ts)
<!-- END GENERATED cordis-surface -->
