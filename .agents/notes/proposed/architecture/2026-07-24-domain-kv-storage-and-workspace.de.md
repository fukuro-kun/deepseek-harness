# Agent Note: Domain-KV-Storage als capability seam und die Workspace-Entität

Status: proposed

[English](2026-07-24-domain-kv-storage-and-workspace.md) | [中文](2026-07-24-domain-kv-storage-and-workspace.zh.md) | Deutsch

## Problem

Die einzige Persistenzfläche des Hosts ist das Session-Event-Log (`packages/session/session-persistence`: append-only, eine Datei pro Session). Alles, was nicht zu einer einzelnen Session gehört, hat keinen Ort, und es existieren zwei bereits umgesetzte Bedarfe:

- **Die Workspace-Entität.** Die GUI braucht Workspace als echtes Objekt: Pfad, Titel und die Liste der zugehörigen Sessions. Die Zugehörigkeit gehört dem Workspace — „welche Sessions zu diesem Workspace gehören" ist keine Tatsache einer einzelnen Session, sie ins Session-Log zu schreiben wäre also semantisch falsch. Vor diesem Design war Workspace nur eine visuelle Seitenleisten-Gruppierung, abgeleitet aus dem cwd, ohne Entität.
- **Dynamische Session-Metadaten** (der absehbare zweite Consumer). Kalte Session-Listings lesen nur die erste Log-Zeile (einen unveränderlichen Snapshot zum Erstellungszeitpunkt); Titel, Endstatus und alles, was sich mit der Session weiterentwickelt, ist nicht verfügbar. Die Lösungsrichtung ist eine Sidecar-Metadatentabelle — genau eine KV-Tabelle mit hochfrequenten Updates pro Schlüssel.

Separat braucht das Löschen von Sessions ein `SessionPersistence`-Delete-Primitiv und einen `session.delete`-Endpunkt. Das Design dieser Lücke ist in dieser Note festgelegt, ihre Implementierung bleibt jedoch zukünftige Arbeit.

Die spätere [Entscheidung zum Löschen von Workspace-Registrierungen](../../implemented/feature/2026-07-27-workspace-registration-deletion.de.md) ersetzt nur diese Kopplung: Das Löschen einer Workspace-Registrierung erhält deren Sessions und Logs, während das Session-Löschen separate zukünftige Arbeit bleibt. Das unten stehende Cascade-Design ist daher nicht die Delete-Semantik der Workspace-GUI.

## Vorschlag

Die Gruppe `packages/storage/` anlegen — den `ctx.storage`-Hub (Backend-Registry + Datenform-Mounts), zwei Backends, die Domain-Datenform — plus das Workspace-Consumer-Package; `SessionPersistence` um ein Delete-Primitiv erweitern.

| Package | Pfad | ctx-Fläche | Diese Phase |
| --- | --- | --- | --- |
| `@deepseek-ai/dsh-storage` | `packages/storage/storage/` | `ctx.storage` (der Hub) | ✓ |
| `@deepseek-ai/dsh-storage-json` | `packages/storage/storage-json/` | registriert Backend `json` | ✓ |
| `@deepseek-ai/dsh-storage-sqlite` | `packages/storage/storage-sqlite/` | registriert Backend `sqlite` | ✓ |
| `@deepseek-ai/dsh-storage-domain` | `packages/storage/storage-domain/` | mountet `ctx.storage.domain` | ✓ |
| `@deepseek-ai/dsh-workspace` | `packages/workspace/workspace/` | `ctx.workspaceRegistry` | ✓ |
| `SessionPersistence.delete`-Erweiterung + Cascade-Orchestrierung | `packages/session/session-persistence*` | neue Methode auf dem bestehenden seam | ✗ zukünftige Arbeit (Session-Seite in dieser Phase unangetastet) |
| `workspace.*` / `session.delete` RPC, GUI-Anbindung, Boot-Assembly | — | — | ✗ nächste Phase |

(Workspace liegt in einer eigenen Gruppe statt in `packages/host/`: Die Namensregel der Host-Gruppe verlangt das Präfix `dsh-host-*`, während dieses Package `dsh-workspace` heißt; und die Workspace-Entität ist ein Domain-Konzept, nicht an die Host-Assembly-Ebene gebunden. Unrelated zum bestehenden `agent-instructions`-Package — das ist ein AGENTS.md-Instruction-loader.)

Abhängigkeitsrichtung: `dsh-workspace` → `dsh-domain` → `dsh-storage` ← die beiden Backends. `dsh-workspace` hängt zusätzlich von der Read-only-Fläche von `ctx.sessionPersistence` ab (die cwd-Prüfung von attach liest den Session-Header; fehlt der Service, lehnt attach direkt ab — keine Verifikation, kein Buchführung). Der `ctx.sessions`-Running-Check für das Session-Löschen wandert zusammen mit der Cascade in die zukünftige Arbeit.

### `dsh-storage`: der Storage-Hub

Ein reiner Registrierungs-Hub, kein eigenes IO, kein Config. Der `Storage`-Service mountet auf `ctx.storage` mit zwei Flächen: `backend` (eine `BackendRegistry`: `register(name, backend)` gibt den Disposer zurück, doppelte Namen werfen; `get(name)` wirft `backend-not-found` für unbekannte Namen) und Datenform-Mounting (`mount(form, facility)` über die merge-erweiterbare `StorageForms`-Map, in die `dsh-domain` den Schlüssel `domain` merge-t; Zugriff auf nicht Gemountetes wirft `form-not-mounted`). Der Signaturtext liegt in `packages/storage/storage/src/index.ts` und `src/registry.ts`.

**Mehrere Backends bleiben nebeneinander gemountet**; welches Backend eine Domain bedient, ist Konfiguration von `dsh-domain` (unten), nie ein globales Entweder-oder. Disposer-Semantik = den Namen aus der Tabelle entfernen; das Schließen des Backends selbst gehört zum Effect-Closure des Backend-Packages — erst deregistrieren, dann schließen.

Ein Backend ist ein **Medium-Owner** (ein Dateibaum-Wurzel / eine DB-Datei), der Primitive über **Datenform-Facetten** anbietet — in dieser Phase nur `kv`; die Session-Migration fügt `log` hinzu (siehe Migrationsabschnitt). Eine Facette ist ein optionales Member: Fehlen bedeutet, das Backend kann diese Form nicht bedienen, und die Auflösung schlägt laut fehl. Die Primitive-Fläche der `kv`-Facette: `open(descriptor)` (descriptor = Name/Version/Tabellenliste/Global-Flag, wobei Namen und Tabellennamen auf `^[a-z][a-z0-9_]*$` eingeschränkt sind und doppelt als Dateinamen- und SQL-Identifier-Segmente dienen) gibt eine Einheit zurück mit `loadAll` / `putRecord` / `deleteRecord` (fehlender Schlüssel ist ein No-op) / `setGlobal` / `close` (idempotent); Werte sind für das Backend opakes JSON. Der normative Text (mit JSDoc pro Methode) ist `packages/storage/storage/src/backend.ts`.

Der Backend-Vertrag (Klausel für Klausel durch die gemeinsame Konformitätssuite abgesichert, eine Suite für beide Backends):

1. `open` erstellt, wenn das Medium nichts enthält (lazy Materialisierung erlaubt: darf bis zum ersten Schreibzugriff aufschieben, aber `loadAll` muss sofort leere Tabellen liefern); lädt, wenn das Medium existiert.
2. Eine gespeicherte Version ≠ descriptor.version → `StorageError('version-mismatch')`; keine Migration, kein Neuaufbau.
3. Durability: Nachdem ein Schreib-Primitiv resolved, muss ein Prozessabsturz mit anschließendem Re-open den Schreibvorgang in `loadAll` sehen.
4. Das Backend verspricht keine Schreibreihenfolge innerhalb einer Einheit — **der Aufrufer serialisiert**; das Backend garantiert nur, dass jeder einzelne Aufruf atomar ist (JSON-Ganzdatei-Ersatz / einzelnes SQLite-Statement).
5. `deleteRecord` ist idempotent; `putRecord` überschreibt.
6. Jeder String-Schlüssel / jeder JSON-Wert ist sicher (Schlüssel erreichen nie Dateipfade, eine strukturelle Eigenschaft).
7. `close` ist idempotent; jede Operation nach close → `StorageError('closed')`.

Das Fehlervokabular ist `StorageError` mit einem Code-Diskriminanten: `backend-not-found` / `form-not-mounted` / `duplicate-backend` / `duplicate-mount` / `version-mismatch` / `malformed-medium` / `closed` (`packages/storage/storage/src/error.ts`).

### `dsh-storage-json`

Config ist nur `root` (required, kein Default, schemastery); apply registriert Backend `json` innerhalb `ctx.effect()`, und der Disposer deregistriert den Namen vor `backend.close()`.

- Layout `<root>/<unitName>.json`, eine Datei pro Einheit; Verzeichnis 0o700, Dateien 0o600.
- Dateiformat (Versionsstempel im Header; die Datei ist immer der aktuelle Nettozustand, `JSON.stringify(…, null, 2)` menschenlesbar — diese Lesbarkeit ist die Existenzberechtigung dieses Backends):

```json
{
  "unit": { "name": "workspace", "version": 1 },
  "global": null,
  "tables": { "workspaces": { "<key>": {} } }
}
```

- Schreiben: Jedes Schreib-Primitiv = vollständige Serialisierung des In-memory-Zustands → Temp-Write + fsync → atomare Rename-Veröffentlichung (die Windows-Variante folgt dem win32-Pfad von session-persistence-jsonl). Der Speicher ist maßgeblich, die Platte ist seine Projektion.
- `loadAll`: Beim Open die ganze Datei parsen; ein fehlender `unit`-Header, nicht-objektartige tables usw. → `malformed-medium`. Eine fehlende Datei = eine leere Einheit, materialisiert beim ersten Schreiben.

### `dsh-storage-sqlite`

Config ist `path` (required, `':memory:'` erlaubt) plus `journalMode` (enum, Default `wal`); apply spiegelt json und registriert Backend `sqlite`.

- `node:sqlite` `DatabaseSync`; die Open-Sequenz ist mkdir 0o700 → `open(path,'wx',0o600)` exklusives Erstellen wenn fehlend → `PRAGMA foreign_keys=ON` → journal_mode → Versionsprüfung → Tabellen anlegen.
- Physische Layout-Version `STORAGE_SQLITE_SCHEMA_VERSION = 1` in `PRAGMA user_version`: 0 → stempeln; ≠ → `version-mismatch`.
- DDL (alle STRICT; Tabellennamen aus dem eingeschränkten Zeichensatz mit `u_`-Präfix konkateniert, keine externe Eingabe erreicht je DDL):

```sql
CREATE TABLE IF NOT EXISTS units (name TEXT PRIMARY KEY, version INTEGER NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS unit_globals (
  unit TEXT PRIMARY KEY REFERENCES units(name), value TEXT NOT NULL) STRICT;
-- One table per unit/table pair:
CREATE TABLE IF NOT EXISTS "u_<unit>_<table>" (
  key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;             -- value = record JSON document
```

- Unit-Versionen leben in `units`-Zeilen; ein Descriptor-Mismatch → `version-mismatch`. Zeilengranularität ist Dokument-pro-Zeile und erhält präzise durable Updates pro Schlüssel (der offen gehaltene Pfad für hochfrequente Punkt-Update-Tabellen wie den Session-Sidecar); wenn Query-Bedarfe auftauchen, liest JSON1 die value-Spalte direkt.
- Schreib-Primitive sind einzelne Statements und damit atomar; keine transaktionsübergreifenden Transaktionen nötig (die Domain-Schicht hat keine tabellenübergreifenden Transaktionen, siehe Out-of-scope-Liste).

### `dsh-domain`: die Domain-Datenform

Eine einzige Implementierung, nicht abstrahiert; Consumer hängen nur von dieser Schicht ab und berühren nie direkt Backends.

```ts ignore-check
export const Config = z.object({
  backend: z.string().required(),                // required default backend name
  routes: z.dict(z.string()).default({}),        // per-domain override: { workspace: 'sqlite' }
})

export function apply(ctx: Context, config: Config) {
  ctx.effect(() => ctx.storage.mount('domain', new DomainFacility(ctx, config)))
}
```

(Facility-Unmount-Reihenfolge: erst jede Domain disposen (ihre Schreibkette drainen), dann den Namen aus dem Hub entfernen — in-flight-Schreibvorgänge emittieren während des Drains noch `domain/changed`, und die Event-Konsistenz-Invariante löst Domains über die Facility zurück auf, der Name muss also zu diesem Zeitpunkt noch auflösbar sein.)

Domain-Deklarationen (das Spec-Objekt wird vom Package definiert und exportiert, das die Domain besitzt — die einzige Quelle für Typ- und Laufzeit-Wahrheit; Schemas nutzen zod mit `z.infer`, das die Typen ohne Neudeklaration ableitet — das Record-Modell projiziert nächste Phase in RPC-Wire-Schemas, und die Wire-Grenze ist durchgehend zod; schemastery besitzt weiterhin nur Plugin-Config):

```ts ignore-check
export interface DomainGlobalSpec<G> { readonly schema: ZodType<G>; readonly initial: G }
export interface DomainTableSpec<K extends string, V> { readonly valueSchema: ZodType<V> }

export interface DomainSpec {
  readonly name: string                          // ^[a-z][a-z0-9_]*$
  readonly version: number
  readonly global?: DomainGlobalSpec<unknown>
  readonly tables: Record<string, DomainTableSpec<string, unknown>>
}

export function defineDomain<S extends DomainSpec>(spec: S): S
export function domainTable<K extends string, V>(schema: ZodType<V>): DomainTableSpec<K, V>
```

`DomainFacility.open(spec)` exakte Semantik (sequenziell; jeder fehlschlagende Schritt scheitert das ganze Open):

1. Eine Domain mit diesem Namen bereits offen → `DomainError('already-open')`.
2. Backend-Name = `config.routes[spec.name] ?? config.backend`; `ctx.storage.backend.get(name)` (ein nicht gemounteter Name propagiert `backend-not-found` — Fehlkonfiguration schlägt laut fehl).
3. Backend ohne `kv`-Facette → `DomainError('facet-unsupported')`.
4. `kv.open(descriptorOf(spec))` (der Descriptor ist eine direkte Projektion des Specs).
5. `loadAll()`; jeder Record durchläuft `valueSchema.parse`, das Global durchläuft sein Schema (null nimmt `initial`, nicht persistiert — der erste Schreibvorgang materialisiert). Ein Fehlschlag → `DomainError('invalid-record', { table, key })` (die durable Grenze muss validieren; die Schreibseite validiert nicht erneut).
6. Die `Domain` konstruieren und `ctx.effect()` registrieren: Der Disposer drainet die Schreibkette → `unit.close()`.

```ts ignore-check
export interface Domain</* inferred from spec */> {
  readonly name: string
  readonly global: { get(): G; set(value: G): Promise<void> }   // only when spec.global exists
  table<N extends keyof S['tables']>(name: N): KvTable<KeyOf<N>, ValueOf<N>>
}

export interface KvTable<K extends string, V> {
  get(key: K): V | undefined                     // synchronous in-memory snapshot
  entries(): IterableIterator<[K, V]>
  keys(): IterableIterator<K>
  readonly size: number
  put(key: K, value: V): Promise<void>
  delete(key: K): Promise<boolean>               // false when already absent
  /** Atomic read-modify-write on the domain's single write chain; fn is sync-pure. */
  update(key: K, fn: (current: V) => V): Promise<V>   // missing key -> DomainError('missing-key')
}
```

Regeln:

- **Single-Level-Mapping**: Schlüssel → Record, keine verschachtelten Tabellen; hierarchische Bedarfe nutzen zusammengesetzte Schlüssel oder Felder innerhalb des Werts. Die beiden Backends bleiben dadurch isomorph (eine JSON-Objektebene ↔ eine SQLite-Zeile).
- **Records sind schlichte Daten**: immutable, direkt JSON-serialisierbare POJOs; von `get`/`entries` zurückgegebene Werte dürfen nicht in-place mutiert werden (TypeScript-readonly-Projektion, kein Runtime-Freezing). Verhaltenstragende Domain-Objekte gehören in Consumer-Packages.
- **Serialisierte Schreibvorgänge**: eine Promise-Kette pro Domain; `put`/`delete`/`update`/`global.set` reihen sich alle darauf ein; `update`s fn läuft auf der Kette, Concurrency kann sich also nicht verzahnen. Kein Active-Record (ein mutierbares Objekt herausziehen, das sich selbst persistiert — unkontrollierbarer Persistenz-Zeitpunkt, im Konflikt mit dem Ganz-Einheit-Atomic-Rewrite-Modell).
- **Version schlägt laut fehl**: eine gespeicherte Version, die vom Spec abweicht, wirft direkt; keine Migration, kein Neuaufbau (die Daten sind nicht regenerierbar; pre-release lehnt alte Formate ab).
- **Change-Events**: nachdem die Durability eines Schreibvorgangs resolved ist, `domain/changed` emittieren (`@mode emit`), eines pro Record, ohne alten Wert (entsprechend der Repository-Konvention „neuer Snapshot + Operations-Diskriminant", Vorlage `goal/changed`); das Payload `DomainChanged` ist eine put/deleted-Discriminated-Union — Domain + Tabelle + Schlüssel (beide `''` für Global-Änderungen) + Operation, wobei der put-Zweig den neuen Snapshot-Wert trägt und der deleted-Zweig keinen (`packages/storage/storage-domain/src/events.ts`). Das ist die Push-Frame-Eventquelle der nächsten Phase für RPC. Das Fehlervokabular ist `DomainError`, Codes: `already-open` / `facet-unsupported` / `invalid-record` (mit `{ table, key }`) / `missing-key` / `closed`.

### Zukünftige Arbeit: Session-seitiges Löschen (Design festgelegt, in dieser Phase nicht implementiert)

Dieser Abschnitt ist die festgelegte Bauanleitung; die Implementierungsphase ändert nur Code, nicht Semantik. Keine Session-Persistence-Datei wird in dieser Phase verändert.

```ts ignore-check
export abstract class SessionPersistence extends Service {
  /**
   * Permanently delete one session's stored log.
   * Queued on the per-id write chain (serialized with in-flight appends).
   * Unknown id → reject; un-materialized create intent → cancel it and resolve.
   * After deletion the id behaves as unknown for every subsequent operation.
   */
  abstract delete(id: SessionId): Promise<void>
}
```

- JSONL-Backend: die Datei der Session entlinken (einschließlich der `.zstd`-Variante); weder Datei noch Intent → reject.
- Ein Out-of-tree-Backend löscht atomar in seinem eigenen Medium und bewahrt dieselben unknown-id- und canceled-intent-Ergebnisse; dieser Vorschlag definiert keinen weiteren first-party physischen Pfad.
- Nach einem erfolgreichen Delete `'session-persistence/deleted'(id: SessionId)` emittieren (`@mode emit`; die Session-Persistence-Eventfläche, unrelated zu `domain/changed`). Abgeleitete Daten (der Session-Query-Volltextindex und ähnliches) abonnieren und räumen sich selbst auf; die Persistenzschicht greift nie in Indizes hinein, und das Crash-Fenster ist dadurch abgedeckt, dass abgeleitete Indizes wegwerf- und wiederaufbaubar sind.

Orchestrierungsregeln (implementiert zusammen mit der Cascade; der `session.delete`-RPC und die Workspace-Cascade nutzen dieselben Regeln wieder):

| Prüfung (in Reihenfolge) | Bei Fehlschlag |
| --- | --- |
| Kein Ziel (der ganze Subtree bei recursive) läuft in `ctx.sessions` | werfen, nichts löschen; Aufrufer canceln erst, dann löschen — die Persistenzschicht greift nie zurück in die Laufzeit |
| Nicht-rekursiv: das Ziel hat keine Nachfahren (Nachfahren = der `parentSessionId`-transitive Abschluss, aus `list()`-Headern abgeleitet) | werfen: standardmäßig sind nur Blätter löschbar; `recursive: true` opt-inet in Rekursion |
| Rekursive Reihenfolge ist bottom-up (Blätter → Wurzel) | — ein Crash auf halbem Weg hinterlässt nur „halber Subtree gelöscht, Vorfahren intakt"; ein erneutes Ausführen desselben Deletes konvergiert, und zu keinem Zeitpunkt existiert ein hängender Parent |
| Eine id in der Cascade ist bereits von der Platte weg | überspringen (idempotente Wiederaufnahme); jeder andere Fehler bricht ab |

### `dsh-workspace`

Das Package besitzt das `WorkspaceId`-Brand und stellt `ctx.workspaceRegistry` bereit. Der Record-Schlüssel ist eine generierte uuid — der Pfad ist nicht der Schlüssel: Normalisierung schreibt ihn um, und Referenzanker müssen stabil sein.

```ts ignore-check
export type WorkspaceId = Branded<'WorkspaceId'>
export function WorkspaceId(id: string): WorkspaceId

const workspaceRecord = z.object({
  path: z.string(),                              // realpath，见下
  title: z.string(),
  sessionIds: z.array(z.string().transform(SessionId)),
  createdAt: z.string(),                         // ISO
  updatedAt: z.string(),
})
export type WorkspaceRecord = z.infer<typeof workspaceRecord>

export const workspaceDomainSpec = defineDomain({
  name: 'workspace', version: 1,
  tables: { workspaces: domainTable<WorkspaceId, WorkspaceRecord>(workspaceRecord) },
})

declare module 'cordis' { interface Context { workspace: WorkspaceRegistry } }

export interface Workspace {
  readonly id: WorkspaceId
  readonly path: string
  readonly title: string
  readonly sessionIds: readonly SessionId[]      // 唯一真相且有序：数组序即展示序
  setTitle(title: string): Promise<void>
  /** Record a session under this workspace (idempotent). Rejects when the session
   *  header's cwd (realpath) differs from this workspace's path. */
  attachSession(sessionId: SessionId): Promise<void>
  detachSession(sessionId: SessionId): Promise<void>
  /** Live directory check, uncached. */
  status(): Promise<'ok' | 'missing-dir'>
}

export class WorkspaceRegistry extends Service {
  constructor(ctx: Context)                      // super(ctx, 'workspaceRegistry')
  // start(): this.domain = await ctx.storage.domain.open(workspaceDomainSpec)
  //          实体缓存 Map<WorkspaceId, WorkspaceEntity> 重建
  create(path: string, title?: string): Promise<Workspace>   // realpath 后撞已有 → reject
  get(id: WorkspaceId): Workspace | undefined
  list(): Workspace[]
  resolveByPath(path: string): Promise<Workspace | undefined> // 同 realpath 口径，故 async
  delete(id: WorkspaceId): Promise<boolean>      // 只删注册记录；目录与 session 日志保留
}
```

- **Pfad-Kanon**: der gespeicherte Wert = `fs.realpath(input)` (Trailing-Slashes, `..` und Symlinks alle aufgelöst); Eindeutigkeit = String-Gleichheit nach Normalisierung (ein Symlink, der auf dasselbe Verzeichnis zeigt, gilt als Kollision). Ein fehlendes Verzeichnis lässt create direkt ablehnen (realpath schlägt fehl — ein Workspace muss auf ein existierendes Verzeichnis zeigen; „Neu anlegen = Verzeichnis erstellen" ist Interaktion der oberen Schicht: erst mkdir, dann create). Der Session-cwd in attach-Prüfungen folgt demselben Kanon. Einwertiger cwd + eindeutiger Pfad ⇒ eine Session gehört strukturell zu höchstens einem Workspace; doppelte Buchführung ist auf der Schreibseite unmöglich.
- **Titel**: ein Anzeigename, Default `basename(path)`, mutierbar, Duplikate erlaubt. Ownership wird nie als Fallback aus cwd abgeleitet — cwd kann keine Reihenfolge ausdrücken, und Ownership ist von Anfang an eine Workspace-seitige Tatsache; headless gestartete Sessions gehören zu keinem Workspace.
- Consumer sehen nur das `Workspace`-Interface; `WorkspaceEntity` bleibt package-intern (eine einzige Implementierung splittet einen seam nicht vor). Entitäten sind pro id eindeutig (Registry-Cache); der Record-Snapshot wird nach jedem Schreibvorgang in-place getauscht, und außen sieht man nur Getter. Jeder Schreibvorgang läuft durch das entitätsinterne `mutate(fn)` → `table.update`, mit `updatedAt`-Refresh innerhalb von mutate. Domain-Objekte überqueren nie RPC; nächste Phase projiziert die Wire-Schicht Records in zod-Wire-Schemas.
- **Session-Löschen bleibt zukünftige Arbeit.** Die spätere [Entscheidung zum Löschen von Workspace-Registrierungen](../../implemented/feature/2026-07-27-workspace-registration-deletion.de.md) liefert `ctx.workspaceRegistry.delete(id)` als reinen Metadaten-Vorgang, der Sessions und Logs erhält. Rekursives Session-Löschen, Running-Checks und Crash-Rerun-Konvergenz gehören zu einer separaten `session.delete`-Capability.

Konsistenz-Doktrin (das Ledger = die einzige Ownership-Autorität; die Implementierungs- und Test-Baseline):

| Situation | Verhalten |
| --- | --- |
| Eine Ledger-id hat keine Session auf der Platte | gefiltert bei `list()`/Entitätsprojektion; vom nächsten mutate entfernt; kein Fehler (ein normales Produkt der Lösch-Crash-Konsistenz) |
| Der cwd einer Session passt zu einem Workspace, steht aber nicht im Ledger | nicht zugehörig: kein Merging, keine Adoption. Die GUI kann später einen „orphan sessions"-Bereich bauen (Orphans = das Komplement aller Ledger) |
| Eine Session in zwei Ledgern | strukturell auf der Schreibseite blockiert (attach-Prüfung); beim Load erkannt → werfen (extern hand-editierte Daten, nie maskiert) |
| Das Workspace-Verzeichnis existiert nicht | Record und Ledger bleiben; `status()` = `'missing-dir'`; die Storage-Schicht löscht nie automatisch (das Verzeichnis könnte nur vorübergehend verschoben sein) |

### Reuse und die Migrationsaussicht des Session-Backends

**Langfristige Richtung**: Die reinen Medium-Operationen im Session-Persistence-JSONL-Provider können in eine `dsh-storage`-`log`-Facette sinken (die Session-Packages bleiben; der `SessionPersistence`-seam und die Coordinator-Semantik bewegen sich nicht — nur die Dateioperationsschicht darunter). Das Motiv für Reuse: Die Medium-Schicht besitzt Dateisystemoperationen und plattformübergreifende Arbeit wie atomare Windows-Veröffentlichung, fsync-Semantik und exklusives Dateierstellen; Geschäftssemantik (wie eine Session appendet, wann und was) bleibt darüber. Ein Session-Log ist ein append-only Stream, eine andere Form als KV, daher behält das Interface **Medium-Owner + Datenform-Facetten**, statt beides durch einen Primitive-Satz zu zwingen.

Das aktuelle Reuse-Audit (eine schon vor der Migration lesbare Bestandsaufnahme):

| Bestehende Session-Persistence-Logik | Natur | Disposition |
| --- | --- | --- |
| JSONL: Temp-Write + fsync + link/unlink atomare Veröffentlichung, 0o700/0o600-Berechtigungen, Windows-Variante (win32.ts) | reines Medium | in dieser Phase von `dsh-storage-json` kopiert (Ganzdatei-Atomic-Rewrite ist dasselbe Protokoll); wird bei Migration die gemeinsame Implementierung |
| JSONL: Zeilen-Append, First-Line-Header-Schnellread, zstd-Per-Frame-Kompression | Log-Form | bleibt; wandert bei Migration in die `log`-Facette |
| coordinator (Per-id-Schreibkette, lazy Materialisierung, Crash-Repair, Flush-Barrier) | Session-Semantik | sinkt nie — Event-Log-Domain-Logik, deren Gegenstück hier die Schreibkette der Domain-Schicht ist; jede besitzt ihre eigene |
| encodeSegment (id-zu-Pfad-Escaping) | Medium-Utility | auf der Domain-Seite ungenutzt (Schlüssel erreichen nie Pfade); sinkt bei Migration zusammen mit der `log`-Facette (eine Datei pro Session) |

**Diese Phase berührt keinen Session-Persistence-Medium-Code** (nur das Delete-Primitiv kommt hinzu). Eine zukünftige Log-Facetten-Änderung braucht ihren eigenen Consumer und Belege; die Tabelle hält die verbleibende JSONL-Reuse-Grenze fest, ohne die Extraktion zu versprechen.

### Testmatrix

| Suite | Abdeckung | Backends |
| --- | --- | --- |
| Backend-Vertrag (gemeinsame Suite, einmal geschrieben, auf beiden ausgeführt) | die sieben Vertragsklauseln + Versionsablehnung + Close-Idempotenz | json, sqlite (`:memory:` + Temp-Verzeichnisse) |
| registry/mount | Doppelregistrierung, Zugriff auf Nicht-Gemountetes, Disposer-Entfernung | — |
| Domain-Schicht | die sechs Open-Schritte, Schema-Ablehnung, Update-Serialisierung (Concurrent-Interleaving-Stress), `domain/changed` pro Record, lazy Global-Initialwert-Materialisierung, Routing und `facet-unsupported` | beliebig (json) |
| workspace | create/Eindeutigkeit/realpath, attach-Prüfungen (einschließlich Ablehnung bei fehlendem sessionPersistence), die vier Konsistenz-Doktrin-Fälle | mock domain oder json |
| Session-Delete-Vertrag (zukünftige Arbeit, schließt sich bei Implementierung runPersistenceContract an) | unknown id, Reuse gelöschter ids, unmaterialisierter Intent, Serialisierung mit in-flight-Appends, das deleted-Event | jsonl |

Snapshots: keine model-sichtbare oder Assembly-Fläche in dieser Phase, keine hinzugefügt; die RPC-Verdrahtung der nächsten Phase bringt sie mit der `workspace.*`-Domain mit.

### Out-of-scope-Liste

| Nicht enthalten | Trigger | Rework-Stelle | Vorarbeit |
| --- | --- | --- | --- |
| Session-Löschen (`SessionPersistence.delete`, das deleted-Event, rekursives Löschen, Running-Checks) | ein destruktiver Session-Delete-Produktfluss startet | das Session-Primitiv plus `session.delete` implementieren; unabhängig vom Löschen von Workspace-Registrierungen halten | Orchestrierungsregeln und Ablehnungstabelle oben bleiben Vorarbeit; Workspace-Löschen erhält Sessions und Logs |
| Die `log`-Facette und Session-Provider-Migration | jede Phase nach dieser | JSONL-Medium-Operationen versenken, wenn ein echter Consumer die Facette rechtfertigt | die Facettenorganisation lässt die Option offen, ohne sich zur Extraktion zu verpflichten |
| Multi-Prozess-Schreibschutz | zwei Host-Prozesse schreiben ein Medium | JSON-Backend-Dateisperren; SQLite WAL ist nativ multi-prozessfähig | alle Schreibvorgänge laufen bereits durch den einzigen Punkt der Domain; Locking berührt nur Backends |
| Prozessübergreifende Änderungsbeobachtung | GUI-Reconnect-Bewusstsein | das Revision-Pattern (Kopie von session-persistence) | `domain/changed` existiert bereits in-process |
| Datenmigration | Modelländerungen nach dem ersten getaggten Release | versionsgetriebene Per-Domain-Migration | Versionen liegen von Tag eins an auf dem Medium |
| Large-table-Performance | eine Tausend-Record-Domain auf json geroutet | `routes` auf sqlite zeigen lassen, Daten einmal von Hand migrieren | Routing ist Konfiguration; Consumer unverändert |
| Mehrsegment-Schlüssel | ein echter Zwei-Segment-Consumer erscheint (Per-Workspace-Per-Session-Dimensionsdaten) | Schlüssel-Generics werden Tupel, SQLite-Composite-Primary-Keys, JSON-Verschachtelungsebenen | Single-Level-Tabellen sind der Ein-Segment-Sonderfall; keine Nesting beliebiger Tiefe; keine string-konkatenierten Schlüssel |
| Die Scope-Dimension | eine „eine pro Workspace"-Domain erscheint und Composite-Keys können es nicht ausdrücken | DomainSpec erhält eine Scope-Deklaration + ein Scope-Segment in Dateinamen (encodeSegment) | der Namenszeichensatz ist bereits eingeschränkt; Dateinamen können nicht kollidieren |
| Tabellenübergreifende atomare Transaktionen | eine Geschäftsoperation berührt atomar zwei Tabellen einer Domain | `domain.transact(fn)`; JSON-Ganz-Einheit-Rewrite ist natürlich atomar, SQLite wrappt eine Transaktion | — |
| Sekundärindizes / bedingte Queries | In-memory-Filterung skaliert nicht mehr (Zehntausende Records) | SQLite JSON1 über die value-Spalte, eine Read-only-Query-Facette auf dem seam | das JSON-Backend folgt nicht |
| Session zwischen Workspaces verschieben | ein Produktbedarf erscheint | die attach-Prüfung zu einer „erst detach, dann attach"-Orchestrierung aufweichen | — |
| Session-Delete-RPC/GUI | ein destruktiver Session-Delete-Produktfluss startet | `session.delete`-Endpunkt, Wire-Schema und explizite Bestätigungs-UI | Workspace-RPC/GUI wird separat geliefert; keine Cascade-Kopplung mehr |

## In Betracht gezogene Alternativen

- **Wiederverwendung von Coordinator/Backends aus session-persistence**: Event-Log-Semantik (append-only, Turn-Crash-Repair, lazy Materialisierung) passt nicht zu KV-Überschreib-Semantik; nur die Schichtungsidee wird übernommen (eine Koordinationsschicht besitzt Schreibordnung, Backends implementieren minimale Primitive).
- **Ein Workspace-spezifisches Storage-Package, seam später extrahiert**: der zweite Consumer (der Session-Sidecar) ist bereits absehbar; späteres Verallgemeinern bedeutet, das Interface zweimal anzufassen.
- **Domain und Storage in einer Schicht verschmelzen**: Backends würden gezwungen, Schema-Validierung, Change-Events und Schreibserialisierung zu berühren — Domain-Concerns; getrennt implementieren Storage-Backends nur opake Primitive (die kleinste ersetzbare Fläche), während die einzige Domain-Implementierung die gesamte Domain-Logik konzentriert (zod/Events/Serialisierung einmal geschrieben, nicht pro Backend verdoppelt).
- **JSON-Backend als jsonl-Append + Tombstones + Compaction**: temp+fsync+rename-Crashsicherheit ist Append äquivalent; Umschreiben hält die Datei den aktuellen Nettozustand, menschenlesbar, ohne Folding/Compaction/Torn-Line-Toleranz; auf Domain-Scale kostet ein vollständiges Rewrite dasselbe wie das Anhängen einer Zeile.
- **JSON eine Datei pro Tabelle**: Bei Ganzdatei-Rewrites beeinflusst die Dateigranularität die Schreibkosten nicht; Zusammenführen pro Domain bedeutet weniger Dateien und gibt dem globalen Singleton ein Zuhause.
- **SQLite speichert eine ganze Domain als eine Blob-Zeile**: jede Einzel-Record-Änderung schreibt die ganze Domain neu und verspielt präzise Per-Key-Updates — SQLites einziger Vorteil gegenüber JSON auf null reduziert.
- **SQLite generiert typisierte Spalten aus dem Schema**: ein DDL-Generator ist Over-Engineering; Dokument-pro-Zeile genügt, erneut prüfen wenn echte Query-Bedarfe auftauchen.
- **Eine sqlite-DB-Datei pro Domain**: widerspricht der One-Database-Many-Tables-Konvention des Repositorys.
- **Eine einzige Whole-Store-Backend-Wahl (das Session-Persistence-Single-Slot-Pattern)**: abgelehnt — der Hub wird mehrere Datenformen tragen, deren Backend-Präferenzen (menschenlesbar vs. hochfrequente Punkt-Updates) zwangsläufig divergieren, und ein einzelner Slot erzwingt den groben Zug „alles tauschen + Daten von Hand migrieren". Die Kosten sind eine zusätzliche Namenssuche, abgesichert durch fail-loud.
- **Pfad als Workspace-Schlüssel**: Normalisierung/Symlink-Auflösung schreibt den Pfad um; Referenzanker müssen stabil sein.
- **Ownership aus cwd abgeleitet (oder mit dem Ledger gemergt)**: zwei Quellen der Wahrheit; cwd kann keine Reihenfolge ausdrücken; Ownership ist von Anfang an eine Workspace-seitige Tatsache.
- **Change-Events, die den alten Wert tragen**: die Change-Event-Konvention des Repositorys ist „neuer Snapshot + Operations-Diskriminant" (die einzige Ausnahme, fs' before/after, ist ein Methoden-Rückgabewert statt eines Events, weil der alte Wert danach nicht wiederherstellbar ist und einen Diff-Consumer hat); Consumer, die Diffs brauchen, halten ihren eigenen vorherigen Snapshot.
- **Delete cancelt automatisch eine laufende Session**: dass die Persistenz-/Orchestrierungsschicht zurück in die Laufzeit greift, verschmutzt die Schichtung; cancel existiert bereits, Aufrufer komponieren es.

## Akzeptanzkriterien

- Die vier Testsuites dieser Phase alle grün: die gemeinsame Backend-Vertragssuite auf json und sqlite, registry/mount-Disposer-Semantik, die Domain-Schicht (einschließlich der sechs Open-Schritte und fail-loud-Routing) und die volle Workspace-Semantik (create/attach-Prüfungen/Konsistenz-Doktrin).
- `ctx.workspaceRegistry` vollzieht den create → attach → list → metadaten-only delete-Lebenszyklus unter einer Test-Assembly.
- Null Diff in den Session-Persistence-Packages (die Acceptance-Linie dafür, die Session-Seite in dieser Phase nicht anzufassen).
- Keine neuen Snapshots in dieser Phase (keine model-sichtbare oder Assembly-Fläche); kommen nächste Phase mit der RPC-Verdrahtung hinzu.

## Risiken

- **Das erste Push-Mode-Change-Event des Repositorys auf einer Persistenzfläche** (session-persistence pollt Revisionen): die Form hat die `goal/changed`-Vorlage, aber „die Storage-Schicht emittiert Events" ist ein neuer Präzedenzfall, der erst validiert wird, wenn der RPC der nächsten Phase ihn konsumiert.
- **Die Whole-Unit-Rewrite-Scale-Prämisse des JSON-Backends**: wenn der zweite Consumer (der Session-Sidecar) auf dem JSON-Backend bei Tausend-Record-Scale landet, bevor er auf SQLite geroutet wird, treten die Rewrite-Kosten früher als erwartet auf; die Mitigation ist genau `routes`, das auf sqlite zeigt.
- **Die schwache Abhängigkeit der Lösch-Orchestrierung von `ctx.sessions`**: eine headless Assembly ohne Runtime-Registry behandelt es als „keine heißen Sessions" und hinterlässt ein Fenster (ein externer Prozess, der die Session laufen lässt); Multi-Prozess ist bereits out of scope, akzeptiert.
- **Facetten-Generalisierung, designed gegen die zukünftige `log`-Facette, ohne sie in dieser Phase zu implementieren**: ein Risiko „reservierte Form passt nicht"; mitigiert dadurch, dass der Medium-Code beider Backends in der versenkbaren Form aus dem Reuse-Audit organisiert ist, sodass beim Landen der `log`-Facette nur die Facettenschicht wandert.
