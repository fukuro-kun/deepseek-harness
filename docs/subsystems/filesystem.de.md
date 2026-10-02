# Dateisystem

[English](filesystem.md) | [中文](filesystem.zh.md) | Deutsch

Die optionale Filesystem-Capability hat vier Teile: [dsh-fs](../../packages/fs/fs) besitzt `ctx.fs` und atomare Textoperationen mit optionalen Guards, [dsh-fs-local](../../packages/fs/fs-local) implementiert die lokale Platte, [dsh-fs-observation-policy](../../packages/fs/fs-observation-policy) zeichnet beobachtetes Vorhandensein oder Fehlen auf und fügt Freshness-Regeln über Events statt über einen Service hinzu, und [dsh-tool-fs](../../packages/fs/tool-fs) führt modellseitige read/write/edit-Calls direkt aus und rendert Fenster. Sie liegt außerhalb des Agent-Loop-Rückgrats; alternative Backends ändern weder Policy noch Tool-Schemas.

`dsh-fs-observation-policy` ist optional. Ohne es bilden die `FileSystem`-Service-Definition, ein Provider und der `dsh-tool-fs`-Consumer den vollständigen, unbeschränkten Filesystem-Seam: `write` erstellt oder überschreibt unbedingt, und `edit` ersetzt literalen Text unbedingt. Das Policy-Plugin ändert diese Operationen, indem es die `fs/*`-Waterfalls entscheidet. Seine Entfernung bricht das Tool nicht, weil das Tool `ctx.fs` aufruft und Events dispatcht; es ruft keine Policy-Methoden auf. Von einem Deployment, das `dsh-tool-fs` lädt, wird erwartet, dass es auch `dsh-fs-observation-policy` lädt, sodass das Default-Verhalten read-before-write/edit ist.

Provider-Quelle: [`packages/fs/fs/src/types.ts`](../../packages/fs/fs/src/types.ts) und [`packages/fs/fs/src/index.ts`](../../packages/fs/fs/src/index.ts). Policy-Quelle: [`packages/fs/fs-observation-policy/src/types.ts`](../../packages/fs/fs-observation-policy/src/types.ts). Read-Rendering-Quelle: [`packages/fs/tool-fs/src/read-render.ts`](../../packages/fs/tool-fs/src/read-render.ts).

## Target-Identität und Metadaten (Provider-Contract)

Jede Operation resolved einen vom Nutzer angegebenen Pfad zuerst zu einem opaken Backend-Target. Consumer dürfen `displayPath` anzeigen, dürfen aber `targetKey` (eine gebrandete opake ID) nicht parsen und nicht annehmen, dass es ein lokaler absoluter Pfad ist.

Consumer, die die Execution-World des Dateisystems teilen, beziehen Cross-Capability-Koordinaten über den Provider, statt diese Identität zu interpretieren: `processPath(target)` gibt den kanonischen absoluten Pfad zurück, den ein Subprocess öffnen kann, `processPathFromHostPath(hostPath)` mappt eine absolute Harness-Host-Datei nur, wenn diese Execution-World sie teilt, `fileUrl(target)` gibt dessen Provider-Plattform-`file:`-URI zurück, und `contains(parent, child)` prüft kanonische Identität oder Nachfahren-Enthaltensein.

```ts type-equiv
/**
 * A path resolved by a backend into a stable identity. `resolve()` produces
 * this; every other operation takes it.
 */
interface FsTarget {
  /** Opaque key for stale guards and target lookup. */
  targetKey: FsTargetKey
  /**
   * Path for model/UI-facing output. May be a local absolute path,
   * workspace-relative path, or remote URI depending on the backend.
   */
  displayPath: string
}
```

Das Backend besitzt die File-Version-Tokens — den Freshness-Token, gegen den ein write/edit guardet. Das Policy-Plugin speichert sie für Stale-Checks; Consumer interpretieren sie nicht. Beide IDs sind gebrandete opake Strings.

```ts type-equiv
/**
 * Opaque key for stale guards and target lookup. The local backend uses a
 * realpath-like string; a remote backend might use a workspace URI or file id.
 * Consumers MUST NOT parse it or assume it is a local absolute path.
 */
type FsTargetKey = Branded<'FsTargetKey'>
```

```ts type-equiv
/**
 * Opaque file-version token — the freshness token a write/edit guards against.
 * The local backend derives it from high-resolution stat identity and freshness
 * fields; a remote backend might use a revision id. The policy layer records it
 * for stale checks; consumers may display related metadata but MUST NOT
 * interpret this token.
 */
type FsVersion = Branded<'FsVersion'>
```

`stat` gibt Metadaten (niemals Content) zurück oder `undefined`, wenn das Target fehlt. `type` lässt Consumer Directories und Spezialdateien vor dem Lesen ablehnen, und `size` lässt Text-Consumer `readText` gegen `streamText` wählen, ohne per Fehler zu probieren. Ein Text-Consumer wendet beim Konsumieren von `streamText` seine eigene Retention-Obergrenze an. Raw-Byte-Consumer verwenden `readBytes(target, signal, maxBytes)`; dessen erforderliche Complete-Content-Obergrenze lässt einen bekannten oder entdeckten Überlauf mit `FS_TOO_LARGE` fehlschlagen, statt zu truncaten oder unbegrenzt zu puffern.

```ts type-equiv
/**
 * Metadata about a target — what {@link FileSystem.stat} returns. Lets the
 * policy layer reject directories/special files before reading and choose
 * `readText` vs `streamText` from `size` without probing by failure. `version`
 * is the freshness token. `undefined` from `stat` means the target is absent.
 */
interface FsInfo {
  /** Opaque freshness token of the target right now. */
  version: FsVersion
  /** Whether the target is a regular file, a directory, or something else. */
  type: 'file' | 'directory' | 'other'
  /** Byte size of a regular file, when the backend can report it. */
  size?: number
}
```

`lstat` ist das pfadbezogene No-Follow-Metadaten-Primitiv. Es nimmt einen Pfad statt eines `FsTarget`, weil `resolve` absichtlich Symlinks folgt, um eine stabile Identität zu erzeugen; Consumer, die Trust-Boundary-Checks brauchen, können `lstat` zuerst aufrufen und `symlink` vor dem Resolven ablehnen.

```ts type-equiv
/**
 * Metadata about a path without following the final path component when it is a
 * symbolic link. Unlike {@link FsInfo}, this path-level probe can report
 * `symlink` so consumers with trust-boundary rules can reject repository-owned
 * links before resolving a target.
 */
interface FsPathInfo {
  /** Opaque freshness token of the path entry right now. */
  version: FsVersion
  /** Whether the path entry is a regular file, directory, symlink, or other. */
  type: 'file' | 'directory' | 'symlink' | 'other'
  /** Byte size of the path entry, when the backend can report it. */
  size?: number
}
```

`listDir` gibt direkte Kind-Einträge in stabiler Namensreihenfolge zurück. Jeder Eintrag trägt den Child-Basename, den Typ, das resolved Target und billige Metadaten, wenn das Backend sie melden kann. Es darf keine Dateiinhalte lesen, daher gilt `size` nur für reguläre Dateien und `version` ist metadaten-abgeleitet. Kaputte oder verschwundene Children können als `other` ohne Metadaten zurückgegeben werden; Permission- oder Backend-I/O-Fehler beim Listen oder Resolven von Child-Metadaten lassen das gesamte Listing mit `FS_PERMISSION_DENIED` oder `FS_IO_ERROR` fehlschlagen.

```ts type-equiv
/**
 * One direct child returned by {@link FileSystem.listDir}. Listing returns
 * metadata and resolved targets only; it must not read file contents.
 */
interface FsDirEntry {
  /** Basename of the child inside the listed directory. */
  name: string
  /** Whether the child is a regular file, a directory, or something else. */
  type: 'file' | 'directory' | 'other'
  /** Resolved child target for follow-up operations. */
  target: FsTarget
  /** Opaque freshness token when the backend can report metadata cheaply. */
  version?: FsVersion
  /** Byte size of a regular file, when the backend can report it. */
  size?: number
}
```

## Write- und Edit-Guards (Provider-Contract)

Sowohl `writeText` als auch `editText` nehmen ihren Version-Guard OPTIONAL: weglassen für eine unbedingte (Bare-Provider-)Mutation, angeben zum Guarden. Der Guard von `writeText` ist ein `FsWriteIntent` — `createIfAbsent` erstellt ein fehlendes Target und lehnt ein existierendes mit `FS_NOT_OBSERVED` ab, einschließlich eines Targets, das nach dem initialen Probe des Providers erscheint, weil die Publication selbst no-replace sein muss; `replaceIfVersion` ersetzt nur, wenn das Target in der beobachteten Version existiert, sonst `FS_STALE_VERSION`. Weglassen von `expected` erstellt-oder-überschreibt unbedingt. Die Union selbst trägt nur die zwei guardeten Intents; „kein Guard" wird durch Weglassen ausgedrückt, daher verwenden write und edit beide dasselbe optionale `expected`-Feld.

```ts type-equiv
/**
 * Guarded write intent. `createIfAbsent` rejects an existing target with
 * `FS_NOT_OBSERVED`; `replaceIfVersion` rejects absence or mismatch with
 * `FS_STALE_VERSION`. Omitting the intent from `writeText` means unconditional
 * create-or-overwrite, not a third union arm.
 */
type FsWriteIntent =
  | { kind: 'createIfAbsent' }
  | { kind: 'replaceIfVersion'; version: FsVersion }
```

```ts type-equiv
/** Outcome of a full-file write. */
interface FsWriteOutcome {
  /** Whether the write created a new file or replaced an existing one. */
  operation: 'create' | 'update'
  /** Opaque version of the file after the write. */
  version: FsVersion
  /**
   * The file's content BEFORE the write, or `null` when the file did not exist
   * (a create) or the backend declined a contextual basis (for example, a
   * binary/non-UTF-8 prior file or either overwrite side reaching its exclusive limit).
   * LF-normalized storage text (the diff basis), never a diff — a consumer
   * computes the result-time contextual diff from `before`/`after` when
   * `before` is present, else falls back to a whole-file diff.
   */
  before: string | null
  /** The file's content AFTER the write, LF-normalized to share `before`'s diff basis. */
  after: string
}
```

`editText` ist eine Provider-Level-Mutation, kein anderswo komponiertes `read` plus `write`. Guarded verifiziert es die erwartete Version VOR dem literalen Matching (sodass ein stale Edit `FS_STALE_VERSION` meldet, nicht einen Match-Fehler gegen neueren Content); unguarded editiert es den aktuellen Content. In beiden Fällen wendet es den Ersatz an und schreibt atomar — Matching, Line-Ending-Behandlung, Stale-Check und atomarer Ersatz bleiben in einer Mutation-Critical-Section — und ein fehlendes Target meldet auf beiden Pfaden `FS_STALE_VERSION`.

```ts type-equiv
/** A literal-replacement edit request. */
interface FsEditRequest {
  /** Literal non-empty text to replace. Must match exactly (after line-ending normalization). */
  oldString: string
  /** Literal replacement text. An empty string deletes the matched text. */
  newString: string
  /** Replace every match instead of requiring exactly one. */
  replaceAll: boolean
}
```

```ts type-equiv
/** Outcome of a literal edit. */
interface FsEditOutcome {
  /** Opaque version of the file after the edit. */
  version: FsVersion
  /**
   * The file's content BEFORE the edit. Raw storage text (LF-normalized by the
   * backend), never a diff — a consumer computes the result-time contextual diff
   * (the applied hunk with context) from `before`/`after`.
   */
  before: string
  /** The file's content AFTER the edit. */
  after: string
}
```

## Die fs-Policy-Events (Provider-Contract-Vokabular)

`dsh-fs` besitzt drei Events, die das Tool dispatcht und auf die das Policy-Plugin hört, sodass Emitter (`dsh-tool-fs`) und Listener (`dsh-fs-observation-policy`) ein Vokabular teilen, ohne dass der Emitter vom Policy-Plugin abhängt. Sie tragen nur `dsh-fs`-Vokabular plus einen opaken `object`-Actor — keine modellseitigen Konzepte und keine Agent/Session-Owner-Struktur.

`fs/write-intent` und `fs/edit-intent` sind **Single-Slot-Decision-Waterfalls**: das Tool dispatcht jeden mit einem Default-Thunk, der `undefined` zurückgibt (der Bare Provider), und ein Listener entscheidet vollständig, ohne `next()` aufzurufen. Der Slot ist first-wins nach Registrierungsreihenfolge — dass das Policy-Plugin ihn besitzt, ist Deployment-Konvention, kein erzwungenes Invariant. `fs/observed` ist ein Fire-and-Forget-Recording-Event, das eine `FsObservation` trägt: present mit einer Version oder confirmed absent. Es wird mit einem schlichten `ctx.emit` dispatcht; sein Listener MUSS synchron und nur Side-Effects sein, weil das Tool den Emit NICHT guardet — ein werfender Listener kann einen Read-Fehler ersetzen oder als `isError`-Ergebnis des Tools auftauchen, nachdem eine Mutation bereits erfolgreich war. Der generierte [Cordis-Surface](#cordis-surface) unten zeigt die exakten Signaturen.

```ts type-equiv
/**
 * One authoritative observation of a target. A present observation carries the
 * version used by guarded replacement; an absent observation authorizes only a
 * guarded create, never an edit.
 */
type FsObservation =
  | { readonly kind: 'present'; readonly version: FsVersion }
  | { readonly kind: 'absent' }
```

## Execution-Kontext (Policy-Plugin)

Das Policy-Plugin braucht gerade genug Execution-Kontext, um den Observed-State-Owner abzuleiten, indem es den opaken `object`-Actor narrowt, den die `fs/*`-Events tragen. `ToolExecution` hat die erforderlichen Felder, daher reicht `dsh-tool-fs` sein Execution-Objekt als Actor durch, ohne dass `dsh-fs-observation-policy` die Tool-, Agent- oder Session-Packages importieren muss.

```ts type-equiv
/**
 * Minimal structural view of a tool execution the policy plugin needs to derive
 * an observed-state owner. `@deepseek-ai/dsh-tools`' `ToolExecution` contains
 * these fields, so the tool passes its `exec` straight through as the opaque
 * `object` actor on the `fs/*` events; this plugin narrows that actor to
 * `FsObservationActor` without importing `dsh-tools`, `dsh-agent`, or `dsh-session`.
 *
 * The owner is `agent.session` when present. It is treated as an opaque object
 * identity (a `WeakMap` key); this package never reads any of its fields.
 */
interface FsObservationActor {
  /** The agent on whose behalf the call runs, when there is one. */
  agent?: {
    /** The session that owns observed-file state, used as an opaque key. */
    session?: object
  }
}
```

## Read-Outcome (Consumer / Read-Rendering)

Ein Text-Read ist durch Line-Window, Byte-Cap und Backend-Limits begrenzt. Nachdem das Byte-Cap erreicht ist, läuft das Scannen weiter, ohne weitere Lines zu behalten, sodass `totalLines` exakt bleibt. Das Ergebnis, das das modellseitige `read`-Tool rendert, ist rein präsentational; es gibt keine `full`/`partial`-View — die Autorisierung ist freshness-basiert (das Tool emittiert ein present `fs/observed` direkt mit der Version des stats), sodass jeder windowed Read einen späteren write/edit autorisieren kann, wenn die Datei unverändert ist. Ein Metadata-Miss emittiert eine absent-Observation, bevor das Tool `FS_NOT_FOUND` zurückgibt, was einem späteren guardeten Write erlaubt, ein extern gelöschtes Target neu zu erstellen, ohne einen Edit zu autorisieren. `dsh-tool-fs`, der Executor, der den Read besitzt, implementiert das Read-Windowing und konstruiert dieses Ergebnis; das Policy-Plugin tut es nicht.

```ts type-equiv
/** Outcome of a bounded text read — what {@link formatReadOutput} renders. */
interface FileReadOutcome {
  /** 1-based first line requested. */
  offset: number
  /** Returned lines, already numbered. */
  lines: FileTextLine[]
  /** Exact total line count in the file. */
  totalLines: number
  /** Whether selected output hit the byte cap. */
  truncatedByBytes?: true
}
```

## Observed-File-State (Policy-Plugin)

Der Observed-State ist eine `WeakMap<owner, Map<targetKey, FsObservation>>`, die im `dsh-fs-observation-policy`-Plugin gehalten wird. Ein fehlender Map-Eintrag bedeutet unseen; `{ kind: 'absent' }` bedeutet, dass ein `read`- oder `str_replace_editor`-`view`-, `str_replace`- oder `insert`-Metadata-Miss die Abwesenheit bestätigt hat; `{ kind: 'present', version }` bedeutet, dass ein read, write oder edit diese Version beobachtet hat. Die Write-Decision mappt unseen und absent auf `createIfAbsent`, während present auf `replaceIfVersion` mappt; die Edit-Decision mappt unseen auf `FS_NOT_OBSERVED`, absent auf `FS_NOT_FOUND` und present auf ihren Version-Guard. Der Owner wird aus dem Event-Actor abgeleitet (normalerweise `exec.agent.session`), als opak behandelt und nie gelesen. Disposal verwirft alles (HMR-Sicherheit), und die Policy führt kein Filesystem-I/O aus.

## Fehler-Taxonomie (Provider-Contract)

Filesystem-Fehler verwenden stabile `FsErrorCode`-Strings, getragen von `FsError` (`HarnessError`). Die Tool-Registry bewahrt `{ name, code }` auf Error-Results, sodass Retry-, Permission- und UI-Schichten branchen können, ohne Text zu parsen.

```ts type-equiv
/**
 * Stable, machine-routable codes for filesystem failures. Carried on
 * {@link FsError}; the tool registry exposes `{ name, code }` on `isError`
 * results so retry/permission/UI layers can branch without parsing messages.
 */
type FsErrorCode =
  | 'FS_NOT_FOUND'
  | 'FS_NOT_DIRECTORY'
  | 'FS_NOT_TEXT'
  | 'FS_NOT_REGULAR_FILE'
  | 'FS_TOO_LARGE'
  | 'FS_PERMISSION_DENIED'
  | 'FS_SANDBOX_DENIED'
  | 'FS_IO_ERROR'
  | 'FS_STALE_VERSION'
  | 'FS_NOT_OBSERVED'
  | 'FS_AMBIGUOUS_EDIT'
  | 'FS_EDIT_NOT_FOUND'
  | 'FS_ABORTED'
```

`FS_NOT_DIRECTORY`, `FS_PERMISSION_DENIED` und `FS_IO_ERROR` werden vom Directory-Listing verwendet, um ein existierendes Nicht-Directory-Target, ein verweigertes Listing und einen unerwarteten Backend-I/O-Fehler zu unterscheiden. `FS_SANDBOX_DENIED` ist eine POLICY-Verweigerung eines Sandbox-erzwingenden Backends (`dsh-fs-sandbox`) — der Mode-Fence hat einen write/edit verweigert — distinct von `FS_PERMISSION_DENIED` (der Host-Kernel verweigert). `FS_NOT_OBSERVED` bedeutet, dass das Policy-Plugin keinen Prior-Observation-Record für diesen Owner hat (oder ein `createIfAbsent` auf eine existierende Datei traf). `FS_NOT_FOUND` repräsentiert auch einen aus confirmed Absence abgelehnten Edit. `FS_STALE_VERSION` bedeutet, dass die Backend-Version nicht mehr zur beobachteten passt (oder der Provider selbst einen Edit für ein fehlendes Target erhält). Freshness-Autorisierung kennt keine partial/full-Unterscheidung, daher gibt es kein `FS_PARTIAL_OBSERVATION`.

## Keine Timeouts auf File-IO

`read`/`write`/`edit` nehmen **kein** `timeoutMs`, und der Provider-Contract armt keine Deadline — anders als bash und web (die [`@deepseek-ai/dsh-timeout`](../../packages/util/timeout/README.de.md) konsumieren) und die subprocess-backed `glob`/`grep` (deren deklariertes `timeoutMs` von `@deepseek-ai/dsh-tool-call-timeout-policy` erzwungen wird): jene sind process-backed, wo eine Deadline die Arbeit wirklich killen kann. Ein lokaler Syscall ist bestenfalls best-effort-abortbar — ein Timeout könnte ein laufendes `fsync`/`rename` nicht zum Stoppen zwingen, daher wäre ein `timeoutMs` hier eine Deadline, die der Seam nicht erzwingen kann, und ein impliziter Default genau an der Stelle, die explicit-over-implicit verbietet. Cancellation propagiert weiterhin durch das Tool-Execution-Signal für best-effort Abort an Syscall-Grenzen.

## Service und Plugin

`FileSystem` (`ctx.fs`, abstract) besitzt die Provider-Primitiven: `resolve`, `processPath`, `processPathFromHostPath`, `fileUrl`, `contains`, `stat`, `lstat`, `readText`, `streamText`, `readBytes`, `listDir`, `writeText` und `editText`. `dsh-fs-observation-policy` registriert **keinen Service** — es ist ein Plugin, das Policy über das `fs/*`-Event-Gate hinzufügt: es entscheidet die write/edit-Intent-Waterfalls aus unseen/absent/present-State und zeichnet `FsObservation`-Werte auf. Der Executor ist `dsh-tool-fs`: er liest/schreibt/editiert über `ctx.fs`, dispatcht die Waterfalls und emittiert das Recording-Event. Der generierte [`ctx.fs`-Abschnitt](#ctxfs--filesystem-abstract-seam) unten zeigt die exakten Signaturen.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.de.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxfs--filesystem-abstract-seam"></a>

### `ctx.fs` — `FileSystem` (abstract seam)

Abstract filesystem provider. Targets must preserve identity across aliases; reads expose regular UTF-8 text or typed errors, listings are stable and content-free, and mutations are atomic. Optional guards add stale protection without changing the unguarded provider contract.

```ts cordis-catalog
/**
 * Resolve a model/plugin-supplied path into a stable {@link FsTarget}. May perform I/O (a
 * remote/sandboxed backend may need a round-trip to map a path to a stable identity), hence
 * async even though the local backend only normalizes + realpaths.
 *
 * @param path - the path to resolve; relative paths resolve against `opts.cwd`.
 * @param opts - optional cwd override and cancellation signal.
 * @returns the stable target; the same file yields the same `targetKey`.
 */
abstract resolve(path: string, opts?: { cwd?: string; signal?: AbortSignal }): Promise<FsTarget>

/**
 * Return the canonical absolute path a subprocess in this filesystem's
 * execution world can open. The path is deliberately separate from
 * {@link FsTarget.targetKey}: consumers may pass this value to another OS
 * capability, but must continue treating the target key as opaque.
 * @param target - the resolved target whose process path is required.
 * @returns an absolute path in the backend's execution world.
 */
abstract processPath(target: FsTarget): string

/**
 * Map an absolute path from the harness host into this filesystem's
 * execution world when both paths identify the same file. The base provider
 * exposes no mapping; host-backed or explicitly shared backends override it.
 * @param hostPath - absolute path in the harness host filesystem.
 * @returns the process path for the same file, or undefined when this
 *   execution world cannot read that host file.
 */
processPathFromHostPath(hostPath: string): string | undefined

/**
 * Return the canonical `file:` URI for a target in this filesystem's
 * execution world. Backends own URI encoding because the host platform may
 * differ from the execution platform.
 * @param target - the resolved target to encode.
 * @returns the target's canonical file URI.
 */
abstract fileUrl(target: FsTarget): string

/**
 * Test canonical containment without exposing or parsing backend target
 * keys. Both targets must come from this provider.
 * @param parent - canonical directory target.
 * @param child - canonical candidate target.
 * @returns true when `child` is `parent` or a descendant of it.
 */
abstract contains(parent: FsTarget, child: FsTarget): boolean

/**
 * Return target metadata, or `undefined` when the target does not exist.
 * @param target - the resolved target to stat.
 * @param signal - aborts the metadata round-trip.
 * @returns metadata only, never content; undefined for an absent target.
 */
abstract stat(target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined>

/**
 * Return path metadata without following the final path component when it is a
 * symbolic link. This is intentionally path-shaped, not target-shaped:
 * {@link resolve} follows symlinks to produce the stable identity used by
 * normal reads/writes, while `lstat` lets a consumer reject the path itself
 * before that follow happens.
 *
 * `opts.cwd` follows {@link resolve}'s cwd rules. `undefined` means the path is
 * absent.
 * @param path - the path to inspect; relative paths resolve against `opts.cwd`.
 * @param opts - `cwd` overrides the backend's default base for relative paths.
 * @param signal - aborts the metadata round-trip.
 * @returns metadata only, never content; undefined for an absent path.
 */
abstract lstat(path: string, opts?: { cwd?: string }, signal?: AbortSignal): Promise<FsPathInfo | undefined>

/**
 * Read the whole regular text file as a single decoded string.
 * @param target - the resolved target to read.
 * @param signal - aborts the read.
 * @returns the full decoded UTF-8 content.
 */
abstract readText(target: FsTarget, signal?: AbortSignal): Promise<string>

/**
 * Stream the whole regular text file as decoded text chunks (same text
 * semantics as {@link readText}, for large files). The backend owns
 * cross-chunk UTF-8 decoding and binary rejection so the policy layer never
 * touches raw bytes.
 * @param target - the resolved target to read.
 * @param signal - aborts the stream, including between chunks.
 * @returns the chunk iterable, decoded and validated like {@link readText}.
 */
abstract streamText(target: FsTarget, signal?: AbortSignal): Promise<AsyncIterable<string>>

/**
 * Read the whole regular file as raw bytes with no decoding or binary
 * rejection. The bound lives at this seam so a backend can never buffer an
 * unbounded file: a target known or discovered to exceed `maxBytes` fails
 * with `FS_TOO_LARGE` instead of returning a truncated result.
 * @param target - the resolved target to read.
 * @param signal - aborts the read.
 * @param maxBytes - inclusive byte cap on the complete content.
 * @returns the full raw content, at most `maxBytes` long.
 */
abstract readBytes(target: FsTarget, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array>

/**
 * Read one byte window of the regular file as raw bytes with no decoding or
 * binary rejection: the bytes at `[offset, offset + length)`, shorter when
 * the file ends inside the window and empty when `offset` lies at or past
 * its end. The window is the bound here, not the file: a backend transfers
 * at most `length` bytes of content beyond the prefix it skips to reach
 * `offset` and never buffers the whole file, so the caller's cap on `length`
 * is the guard against unbounded buffering.
 * @param target - the resolved target to read.
 * @param range - `offset`, the 0-based first byte, and `length`, the largest byte count; both non-negative integers.
 * @param signal - aborts the read.
 * @returns the window's bytes, at most `length` long.
 */
abstract readByteRange(target: FsTarget, range: { offset: number; length: number }, signal?: AbortSignal): Promise<Uint8Array>

/**
 * List direct children of a directory in stable name order. Returns resolved
 * child targets plus cheap metadata only; never reads file contents.
 * @param target - the resolved directory target.
 * @param signal - aborts the listing.
 * @returns one entry per direct child, in stable name order.
 */
abstract listDir(target: FsTarget, signal?: AbortSignal): Promise<FsDirEntry[]>

/**
 * Atomically create or replace UTF-8 text. `expected` guards intent and
 * staleness; omission allows unconditional overwrite.
 * @param target - the resolved target to write.
 * @param content - the full new file content.
 * @param expected - the write intent guarding the write; omit for unconditional.
 * @param signal - aborts before atomic publication takes effect.
 * @param sandboxPolicy - the per-call mode and workspace root this write
 *   runs under; a sandboxing backend fences the write by it, the bare backend
 *   ignores it. Omit to leave the backend its own default.
 * @returns the outcome, including the version the write produced.
 */
abstract writeText( target: FsTarget, content: string, expected?: FsWriteIntent, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy, ): Promise<FsWriteOutcome>

/**
 * Atomically edit literal text. When supplied, the version guard is checked
 * before matching so stale content reports `FS_STALE_VERSION`; omission edits
 * the current content without a freshness precondition.
 * @param target - the resolved target to edit.
 * @param edit - the literal search/replace request.
 * @param expected - the version guard; omit for an unconditional edit.
 * @param signal - aborts before atomic publication takes effect.
 * @param sandboxPolicy - the per-call mode and workspace root this edit runs
 *   under; a sandboxing backend fences the edit by it, the bare backend
 *   ignores it. Omit to leave the backend its own default.
 * @returns the outcome, including the version the edit produced.
 */
abstract editText( target: FsTarget, edit: FsEditRequest, expected?: { version: FsVersion }, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy, ): Promise<FsEditOutcome>
```

Types: [SandboxExecutionPolicy](sandbox.de.md)

Source: [`packages/fs/fs/src/index.ts`](../../packages/fs/fs/src/index.ts)

<a id="fs-events"></a>

### `fs/*` events

<a id="fsedit-intent--waterfall"></a>

#### `fs/edit-intent` — waterfall

Single-slot decision for the next FileSystem.editText. Calling `next()` yields an unconditional edit; the first returned guard wins.

```ts cordis-catalog
/**
 * Single-slot decision for the next {@link FileSystem.editText}. Calling
 * `next()` yields an unconditional edit; the first returned guard wins.
 * @param target - the resolved target about to be edited.
 * @param actor - the opaque tool-execution context the decider keys off.
 * @mode waterfall
 */
'fs/edit-intent'(target: FsTarget, actor: object | undefined, next: () => { version: FsVersion } | undefined | Promise<{ version: FsVersion } | undefined>): Promise<{ version: FsVersion } | undefined>
```

Source: [`packages/fs/fs/src/index.ts`](../../packages/fs/fs/src/index.ts)

<a id="fsobserved--emit"></a>

#### `fs/observed` — emit

Record an authoritative positive or negative observation. Listeners must be synchronous recorders: throws fail the tool call and returned promises are not awaited.

```ts cordis-catalog
/**
 * Record an authoritative positive or negative observation. Listeners must
 * be synchronous recorders: throws fail the tool call and returned promises
 * are not awaited.
 * @param target - the target whose presence or absence was observed.
 * @param observation - present with its version, or confirmed absent.
 * @param actor - the observing tool-execution context; undefined records nothing useful.
 * @mode emit
 */
'fs/observed'(target: FsTarget, observation: FsObservation, actor: object | undefined): void
```

Source: [`packages/fs/fs/src/index.ts`](../../packages/fs/fs/src/index.ts)

<a id="fswrite-intent--waterfall"></a>

#### `fs/write-intent` — waterfall

Single-slot decision for the next FileSystem.writeText. Calling `next()` yields the bare provider's unconditional write; the first listener that returns an intent owns the decision rather than composing with peers.

```ts cordis-catalog
/**
 * Single-slot decision for the next {@link FileSystem.writeText}. Calling
 * `next()` yields the bare provider's unconditional write; the first listener
 * that returns an intent owns the decision rather than composing with peers.
 * @param target - the resolved target about to be written.
 * @param actor - the opaque tool-execution context the decider keys off.
 * @mode waterfall
 */
'fs/write-intent'(target: FsTarget, actor: object | undefined, next: () => FsWriteIntent | undefined | Promise<FsWriteIntent | undefined>): Promise<FsWriteIntent | undefined>
```

Source: [`packages/fs/fs/src/index.ts`](../../packages/fs/fs/src/index.ts)
<!-- END GENERATED cordis-surface -->
