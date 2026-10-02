# Storage

[English](storage.md) | [中文](storage.zh.md) | Deutsch

Das Storage-Subsystem persistiert alles, was kein Session-Event-Log ist (Session-Logs haben ihr eigenes Seam — [persistence.md](persistence.de.md)). Es ist eine optionale Capability, nicht Teil der Agent-Loop-Spine, aufgeteilt als [Capability-Seam](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.de.md): der Hub und die Service Definition ([dsh-storage](../../packages/storage/storage), `ctx.storage`), die Service Providers ([dsh-storage-json](../../packages/storage/storage-json), registriert als `json`, und [dsh-storage-sqlite](../../packages/storage/storage-sqlite), registriert als `sqlite`) und die Consumer-Datenform ([dsh-storage-domain](../../packages/storage/storage-domain), `ctx.storageDomain`, auch erreichbar als `ctx.storage.domain`) — der einzige Consumer des Backend-Contracts und die typisierte API, die alles andere verwendet. Der Hub führt selbst kein IO aus: Backends besitzen Medien, Datenformen besitzen Semantik, und Produktpakete berühren Backends niemals direkt. Design-Record: [Domain-KV-Storage Agent Note](../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.de.md).

Quellen: [`packages/storage/storage/src/backend.ts`](../../packages/storage/storage/src/backend.ts) · [`packages/storage/storage-domain/src/spec.ts`](../../packages/storage/storage-domain/src/spec.ts) · [`packages/storage/storage-domain/src/events.ts`](../../packages/storage/storage-domain/src/events.ts)

## Der Hub: `ctx.storage`

`Storage` ([Signaturen](#ctxstorage--storage)) ist ein Treffpunkt, kein Store. `ctx.storage.backend` ist eine Name → Backend-Tabelle: Mehrere Backends bleiben nebeneinander gemountet, und welches Backend welchen Consumer bedient, ist die Konfiguration dieses Consumers (die Routing-Tabelle des Domain-Layers), niemals eine hub-globale Wahl. `register(name, backend)` gibt den Disposer zurück; doppelte Namen und unbekannte Lookups werfen `StorageError`. Dispose meldet nur den Namen ab — das besitzende Plugin schließt das Backend nach der Abmeldung. Jedes Backend-Plugin publiziert außerdem einen Lifecycle-only Service Key (`storageBackendServiceKey(name)`), den Form-Provider injizieren, damit ihre Aktivierung nicht mit der Backend-Registrierung racen kann.

Datenformen mounten auf dem Hub unter einer merge-erweiterbaren Key-Map:

```ts type-equiv
/**
 * Data forms mountable on the hub, keyed by form name. Form owners extend
 * this map via declaration merging (the domain layer merges
 * `domain: DomainFacility`) and mount the facility in their `apply`.
 */
interface StorageForms {}
```

`mount(form, facility)` ist ein Effect, dessen Disposer unmountet; ein zweites Mounten desselben Keys wirft `duplicate-mount`. `form(form)` resolved eine gemountete Facility und wirft `form-not-mounted`, bis das besitzende Plugin lädt — Assemblies ordnen Plugins entsprechend, statt still zu verzögern. Der Domain-Layer merged `domain: DomainFacility`, sodass `ctx.storage.domain` und `ctx.storageDomain` dasselbe Objekt sind.

## Der Backend-Contract

```ts type-equiv
/**
 * One registered backend. A backend owns exactly one medium and shares its
 * lifecycle across all facets; facets are optional members — a backend that
 * cannot serve a data kind simply omits it, and resolution fails loud instead.
 */
interface StorageBackend {
  /** Key-value operations; absent when this backend cannot serve them. */
  readonly kv?: KvFacet

  /**
   * Drain in-flight writes across all open units and release the medium.
   * Idempotent; concurrent and repeated calls resolve once teardown finishes.
   * @returns resolution after the medium is released.
   */
  close(): Promise<void>
}
```

Ein Backend besitzt ein Medium (einen File-Tree-Root, eine Datenbankdatei) und exponiert optionale Operationsgruppen; `kv` ist die einzige ausgelieferte Gruppe. `KvFacet.open(descriptor)` öffnet eine benannte Unit — `KvUnitDescriptor` trägt den Namen, die aktuelle Formatversion, optionale kompatible Record-Versionen, Tabellennamen und ob ein globaler Singleton-Slot existiert — und gibt eine `KvUnit` mit `loadAll`, `putRecord`, `deleteRecord`, `setGlobal` und `close` zurück. Unit- und Tabellennamen müssen `UNIT_NAME_RE` matchen (sicher als Dateiname und als SQL-Identifier-Segment); Record-Keys sind beliebige Strings, die niemals Dateipfade erreichen. Eine Unit serialisiert keine konkurrierenden Writes — die Reihenfolge liegt beim Aufrufer — aber jeder einzelne Call ist atomar auf dem Medium und durable, sobald er resolved. Ein `single`-Medium, das mit einer anderen Version gestempelt ist, lehnt mit `version-mismatch` ab; ein `per-record`-Dokument, das außerhalb der akzeptierten Menge gestempelt ist, liest sich als abwesend. Ein Medium, das nicht als die Unit geparst werden kann, lehnt mit `malformed-medium` ab. [`backend.ts`](../../packages/storage/storage/src/backend.ts) ist der normative Klausel-für-Klausel-Contract, und die geteilte Conformance-Suite in [`tests/contract.ts`](../../packages/storage/storage/tests/contract.ts) prüft jede Klausel gegen jedes Backend. Das [json-Backend](../../packages/storage/storage-json/README.de.md) republiziert pro Unit atomar eine ganze menschenlesbare Datei; das [sqlite-Backend](../../packages/storage/storage-sqlite/README.de.md) speichert ein Dokument pro Zeile in einer Datenbank für häufig aktualisierte Daten.

## Eine Domain deklarieren

Eine Domain wird einmal von ihrem besitzenden Paket als Spec-Objekt deklariert — die einzige Quelle für Identität, Layout und Record-Schemas der Domain (zod, sodass `z.infer` Consumer-Typen un-dupliziert hält):

```ts type-equiv
/** Static declaration of one domain: identity, version, and record layout. */
interface DomainSpec {
  /** Domain name; must match `UNIT_NAME_RE` (doubles as the backend unit name). */
  readonly name: string
  /** Current domain format version; reads enforce it according to the selected layout. */
  readonly version: number
  /**
   * Medium layout for the backend unit: `single` (the default) stores the
   * whole unit as one document; `per-record` stores each record as its own
   * document, for units whose records are large, sparse, or individually
   * disposable — the projection cache — and scopes version checks per record
   * (an unaccepted record document is discarded, never migrated).
   */
  readonly layout?: 'single' | 'per-record'
  /**
   * Older domain versions whose stored records the current record schemas
   * also accept (the declaring owner vouches for that, typically by
   * declaring the fields older records lack as optional). `per-record` backends
   * read documents stamped with a listed version instead of discarding them,
   * and accept a legacy whole-unit file so stamped for the one-time
   * bootstrap; writes always stamp {@link version}.
   */
  readonly compatibleVersions?: readonly number[]
  /**
   * What `open` does with a stored table record that fails its zod schema.
   * Absent (the default), the whole open rejects with `invalid-record` —
   * right for authoritative data. `'backup-and-skip'` is for domains whose
   * records are disposable derived data: the backend moves the record's
   * document aside (`KvUnit.backupRecord`), the failure is logged with
   * its cause, and the open continues with the record absent. A backend
   * without `backupRecord` (no per-record document to move) falls back
   * to the rejecting default. The global slot always rejects.
   */
  readonly invalidRecords?: 'backup-and-skip'
  /** Optional global singleton slot. */
  readonly global?: DomainGlobalSpec<unknown>
  /** Table declarations keyed by table name; each name must match `UNIT_NAME_RE`. */
  readonly tables: Record<string, DomainTableSpec>
}
```

`defineDomain(spec)` pinnt die Literal-Typen der Spec und schlägt laut fehl beim Modul-Load des Owners, bevor irgendein Medium berührt wird: ein Domain- oder Tabellenname außerhalb von `UNIT_NAME_RE`, eine Version, die kein nicht-negativer Integer ist, oder ein Global-Schema, das `null` akzeptiert, werfen alle (`null` ist das "nie geschrieben"-Sentinel des Mediums, sodass ein gespeichertes nullable Global nicht round-trippen könnte). `domainTable<K, V>(schema)` deklariert eine Tabelle mit einem Phantom-Compile-Time-Key-Typ (typischerweise eine [branded id](core.de.md#branded-ids)); `descriptorOf(spec)` projiziert den backend-seitigen Unit-Deskriptor.

## Die offene Domain

```ts type-equiv
/** One open domain, typed by its spec. */
interface Domain<S extends DomainSpec> {
  /** Domain name from the spec. */
  readonly name: string
  /** Global singleton handle; a spec without `global` has no usable handle (`never`). */
  readonly global: DomainGlobalHandleOf<S>
  /**
   * Resolve one declared table handle. Handles are stable — repeated calls
   * return the same instance.
   * @param name - Declared table name.
   * @returns the typed table handle.
   */
  table<N extends keyof S['tables'] & string>(name: N): KvTable<TableKeyOf<S, N>, TableValueOf<S, N>>

  /**
   * Close this domain: reject new writes immediately, drain already-queued
   * writes (their events still emit), release the backend unit, then free
   * the domain name for a later open. Idempotent — repeated calls share one
   * teardown. The consumer owns this call (typically as its own `ctx.effect`
   * disposer); the facility closes any domain left open when it unmounts.
   * @returns resolution after the unit is released.
   */
  close(): Promise<void>
}
```

Reads sind synchron aus dem autoritativen In-Memory-State: `KvTable` exponiert `get`/`entries`/`keys`/`size` (Snapshot-Iteratoren, die stabil bleiben, während gequeuete Writes landen), und das `get()` des Global-Handles liefert das `initial` der Spec, bis das erste `set` den Slot auf dem Medium materialisiert. Jeder Write — `put`, `delete`, `update`, `global.set` — queuet auf einer Per-Domain-Chain und erreicht zuerst die Backend-Durability, mutiert dann den Speicher und emittiert dann `domain/changed`; ein rejected Backend-Write lässt den Speicher unberührt, sodass Reads niemals vom Medium divergieren. `update(key, fn)` ist ein atomarer Read-Modify-Write an seinem Chain-Slot (ein fehlender Key rejected `missing-key`); `delete` eines abwesenden Keys resolved `false` ohne Write und ohne Event. Zurückgegebene Records sind die gespeicherten Objekte selbst, keine Kopien — via `put`/`update` ersetzen, niemals in-place mutieren.

## Die Domain-Facility: `ctx.storageDomain`

`DomainFacility` ([Signaturen](#ctxstoragedomain--domainfacility)) öffnet deklarierte Domains über geroutete Backends. Routing ist die Konfiguration des Domain-Plugins, niemals die des Hubs: `backend` benennt die erforderliche Default-Route und `routes` überschreibt sie pro Domain-Name. `open(spec)` läuft eine strikte Sequenz, jeder Schritt lässt den ganzen Call fehlschlagen: Es lehnt einen bereits offenen oder noch schließenden Namen ab (`already-open`), resolved die Route (`backend-not-found`), verlangt das `kv`-Facet des Backends (`facet-unsupported`), öffnet die Unit (Backend-`version-mismatch`/`malformed-medium` gehen durch) und validiert jeden gespeicherten Record und Global gegen die Zod-Schemas der Spec (`invalid-record` mit der betroffenen Tabelle und dem Key). Der Aufrufer besitzt das zurückgegebene Handle und gibt es mit `Domain.close()` frei; Domains, die beim Unmounten des Plugins noch offen sind, werden von der Facility geschlossen, und der Name einer geschlossenen Domain wird erst zum Re-Open frei, nachdem der Teardown vollständig abgeschlossen ist. `get(name)` ist ein untypisierter diagnostischer Lookup auf die package-private `DomainImpl`-Runtime hinter jedem typisierten Handle; `closeAll()` ist der Unmount-Pfad.

## Das Change-Event: `domain/changed`

Jeder durable Write emittiert ein Event strikt nachdem das Backend Durability bestätigt hat, in der Write-Chain-Reihenfolge der Domain ([Event-Eintrag](#domainchanged--emit)):

```ts type-equiv
/** Shared location fields of one durable domain change. */
interface DomainChangedBase {
  /** Owning domain name. */
  readonly domain: string
  /** Table name; `''` for a global-singleton write. */
  readonly table: string
  /** Record key; `''` for a global-singleton write. */
  readonly key: string
}
```

```ts type-equiv
/** One durable domain change; a closed union — switch on `operation`. */
type DomainChanged = DomainChangedPut | DomainChangedDeleted
```

`put` (Inserts, Overwrites und Global-Writes) trägt den neuen Snapshot in `value` — niemals den alten Wert; ein diffender Consumer behält seinen eigenen vorherigen Snapshot. `deleted` ist ein Tombstone ohne Wert. Das Event ist eine Benachrichtigung, kein Transaktionsteilnehmer: Der Commit-Punkt ist bei der Emission bereits vorbei, sodass ein synchron werfender Listener mit einer geloggten Warnung eingedämmt wird, statt den bereits durablen Write rejecten zu lassen, und emittierte Werte entsprechen dem In-Memory-State bei Emission. Das Event ist nur prozessintern; Cross-Process-Change-Push ist eine dokumentierte Einschränkung ([Package-README](../../packages/storage/storage-domain/README.de.md)).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.de.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxstorage--storage"></a>

### `ctx.storage` — `Storage`

The storage hub service. Backends register under `backend`; data forms mount under their `StorageForms` key and are reached as `ctx.storage.<form>`.

```ts cordis-catalog
/**
 * Mount a data-form facility on the hub. Mounting is an effect: the
 * returned disposer unmounts the form.
 * @param form - Form key declared in {@link StorageForms}.
 * @param facility - The facility instance to expose.
 * @returns the disposer that unmounts the form.
 */
mount<K extends keyof StorageForms>(form: K, facility: StorageForms[K]): () => void

/**
 * Resolve a mounted data form.
 * @param form - Form key declared in {@link StorageForms}.
 * @returns the mounted facility.
 */
form<K extends keyof StorageForms>(form: K): StorageForms[K]
```

Source: [`packages/storage/storage/src/index.ts`](../../packages/storage/storage/src/index.ts)

<a id="ctxstoragedomain--domainfacility"></a>

### `ctx.storageDomain` — `DomainFacility`

The mounted domain facility. Opens declared domains over routed backends; one facility instance owns the open-domain table and enforces single-open per domain name.

```ts cordis-catalog
/**
 * Open one declared domain. Steps, each failing the whole call: reject a
 * name that is already open (`already-open`); resolve the backend route
 * (`backend-not-found` passes through from the hub); require its `kv` facet
 * (`facet-unsupported`); open the unit projected from the spec (backend
 * `version-mismatch`/`malformed-medium` pass through); load and validate
 * every stored record against the spec's zod schemas (`invalid-record`
 * with the offending table and key — unless the spec declares
 * `invalidRecords: 'backup-and-skip'` and the unit can move documents aside, in
 * which case the failing record is backed up, logged, and skipped);
 * construct the domain.
 *
 * Lifecycle: the CALLER owns the returned handle and closes it via
 * `Domain.close()` (typically as its own `ctx.effect` disposer) — the
 * facility does not tie the domain to any consumer fiber. Domains still
 * open when the facility unmounts are closed by the plugin disposer.
 * @param spec - The domain declaration, typically from `defineDomain`.
 * @returns the opened domain handle, typed by the spec.
 */
async open<S extends DomainSpec>(spec: S): Promise<Domain<S>>

/**
 * Look up an open domain by name, untyped. Diagnostic surface (the package
 * invariant cross-checks change events against live domain state); typed
 * consumers hold the handle returned by {@link open}.
 * @param name - Domain name.
 * @returns the open domain runtime, or `undefined` when not open.
 */
get(name: string): DomainImpl | undefined

/**
 * Close every domain still open on this facility. The unmount path for
 * consumers that never called `Domain.close()` themselves; closing is
 * idempotent, so double-closing an already-closed domain is harmless.
 * @returns resolution after every unit is released.
 */
async closeAll(): Promise<void>
```

Source: [`packages/storage/storage-domain/src/index.ts`](../../packages/storage/storage-domain/src/index.ts)

<a id="domain-events"></a>

### `domain/*` events

<a id="domainchanged--emit"></a>

#### `domain/changed` — emit

A domain record or the global singleton changed, emitted once per write strictly after the backend acknowledged durability. Events of one domain arrive in its write-chain order.

```ts cordis-catalog
/**
 * A domain record or the global singleton changed, emitted once per write
 * strictly after the backend acknowledged durability. Events of one
 * domain arrive in its write-chain order.
 * @param change - domain, table (`''` for global), key (`''` for global),
 * operation discriminant, and on `put` the new snapshot.
 * @mode emit
 */
'domain/changed'(change: DomainChanged): void
```

Source: [`packages/storage/storage-domain/src/events.ts`](../../packages/storage/storage-domain/src/events.ts)
<!-- END GENERATED cordis-surface -->
