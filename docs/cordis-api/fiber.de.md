<!-- Die englische Quelldatei wird von scripts/gen-cordis-catalog.ts generiert; diese deutsche Datei ist die per双语配对 gepflegte, reviewte Gegenüber.
     Zum Aktualisieren zuerst `pnpm run gen-cordis-catalog` für die englische Seite ausführen, dann diese Datei aktualisieren und `pnpm run verify-translation-pairing --write docs/cordis-api/fiber.md` zum erneuten Aufzeichnen der Paarung ausführen. -->

# Fiber

[English](fiber.md) | [中文](fiber.zh.md) | Deutsch

Ein Fiber ist eine geladene Plugin-Instanz: ihr Lifecycle-Zustand, ihre validierte Config und ihre registrierten Effects. `ctx.fiber` ist der aktuelle Fiber, und `ctx.effect()` delegiert an ihn.

### ctx.effect(execute, label?)

```ts cordis-catalog
/**
 * Register a cleanup-aware effect on this fiber.
 *
 * `execute` runs immediately; the disposers it produces are collected and
 * run (in reverse order) either when the returned disposer is called or
 * when the fiber unloads, whichever comes first. Calling the disposer twice
 * is a no-op. Throws `CordisError('INACTIVE_EFFECT')` if the fiber is
 * already disposed, and `TypeError` if `execute` returns an invalid shape.
 *
 * @param execute — the effect body; see {@link Effect} for accepted shapes.
 * @param label — effect label shown in `getEffects()` diagnostics.
 * @returns a disposer that tears the effect down and settles once done.
 */
effect(execute: () => SyncEffect, label?: string): Disposable<Promise<void>>
effect(execute: () => Effect, label?: string): AsyncDisposable<Promise<void>>
```

Registriert einen Cleanup-fähigen Effect auf diesem Fiber.

`execute` läuft sofort; die von ihm erzeugten Disposer werden gesammelt und (in umgekehrter Reihenfolge) ausgeführt, sobald der zurückgegebene Disposer aufgerufen wird oder der Fiber entladen wird — je nachdem, was zuerst eintritt. Ein zweiter Aufruf des Disposers ist ein No-Op. Wirft `CordisError('INACTIVE_EFFECT')`, wenn der Fiber bereits disposed ist, und `TypeError`, wenn `execute` eine ungültige Shape zurückgibt.

- `execute` — der Effect-Body; akzeptierte Shapes siehe `Effect`.
- `label` — Effect-Label, das in `getEffects()`-Diagnosen angezeigt wird.

**Gibt** einen Disposer zurück, der den Effect abbaut und nach Abschluss settle.

[Quelle](../../vendor/cordis/src/fiber.ts#L415)

### ctx.fiber

```ts cordis-catalog
/** The fiber (plugin runtime instance) that owns this context. */
fiber: Fiber
```

Der Fiber (Plugin-Runtime-Instanz), der diesen Context besitzt.

[Quelle](../../vendor/cordis/src/fiber.ts#L12)

## Die Fiber-Klasse

Runtime-Instanz einer Plugin-Anwendung.

Ein Fiber verfolgt Abhängigkeitszustand, validierte Config, Lifecycle-Effects und Cleanup für den Plugin-Context, den `ctx.plugin()` zurückgibt.

[Quelle](../../vendor/cordis/src/fiber.ts#L184)

### fiber.uid

```ts cordis-catalog
/** Unique id within the registry; 0 for the root fiber, `null` once disposed. */
public uid: number | null
```

Eindeutige id innerhalb der Registry; 0 für den Root-Fiber, `null` sobald disposed.

[Quelle](../../vendor/cordis/src/fiber.ts#L186)

### fiber.ctx

```ts cordis-catalog
/** The context this fiber's plugin runs in (extends the parent context). */
public readonly ctx: Context
```

Der Context, in dem das Plugin dieses Fibers läuft (erweitert den Parent-Context).

[Quelle](../../vendor/cordis/src/fiber.ts#L188)

### fiber.config

```ts cordis-catalog
/** The validated plugin config (updated by `update()`). */
public config: any
```

Die validierte Plugin-Config (wird durch `update()` aktualisiert).

[Quelle](../../vendor/cordis/src/fiber.ts#L190)

### fiber.state

```ts cordis-catalog
/** Current lifecycle state; transitions emit `internal/status`. */
public state
```

Aktueller Lifecycle-Zustand; Übergänge emittieren `internal/status`.

[Quelle](../../vendor/cordis/src/fiber.ts#L194)

### fiber.dispose

```ts cordis-catalog
/** Dispose this fiber: unload the plugin, then settle once cleanup finished. */
public readonly dispose: () => Promise<void>
```

Disposed diesen Fiber: entlädt das Plugin und settle, sobald Cleanup abgeschlossen ist.

[Quelle](../../vendor/cordis/src/fiber.ts#L196)

### fiber.store

```ts cordis-catalog
/** Snapshot of required service implementations while loaded; `undefined` otherwise. */
public store: Dict<Impl> | undefined
```

Snapshot der benötigten Service-Implementierungen während geladen; andernfalls `undefined`.

[Quelle](../../vendor/cordis/src/fiber.ts#L198)

### fiber.inertia

```ts cordis-catalog
/** The in-flight load/unload transition, if one is currently running. */
public inertia: Promise<void> | undefined
```

Die laufende Load-/Unload-Transition, falls gerade eine ausgeführt wird.

[Quelle](../../vendor/cordis/src/fiber.ts#L200)

### fiber.name

```ts cordis-catalog
/** The plugin's display name, inherited from the nearest named ancestor, else `'root'`. */
get name()
```

Der Anzeigename des Plugins, geerbt vom nächsten benannten Vorfahren, sonst `'root'`.

[Quelle](../../vendor/cordis/src/fiber.ts#L336)

### fiber.assertActive()

```ts cordis-catalog
/**
 * Throw if the fiber has already been disposed.
 *
 * @returns nothing when the fiber is still active.
 * @throws {CordisError} `INACTIVE_EFFECT` when the fiber's uid has been cleared.
 */
assertActive()
```

Wirft, wenn der Fiber bereits disposed wurde.

**Gibt** nichts zurück, wenn der Fiber noch aktiv ist.

[Quelle](../../vendor/cordis/src/fiber.ts#L351)

### fiber.effect(execute, label?)

```ts cordis-catalog
/**
 * Register a cleanup-aware effect on this fiber.
 *
 * `execute` runs immediately; the disposers it produces are collected and
 * run (in reverse order) either when the returned disposer is called or
 * when the fiber unloads, whichever comes first. Calling the disposer twice
 * is a no-op. Throws `CordisError('INACTIVE_EFFECT')` if the fiber is
 * already disposed, and `TypeError` if `execute` returns an invalid shape.
 *
 * @param execute — the effect body; see {@link Effect} for accepted shapes.
 * @param label — effect label shown in `getEffects()` diagnostics.
 * @returns a disposer that tears the effect down and settles once done.
 */
effect(execute: () => SyncEffect, label?: string): Disposable<Promise<void>>
effect(execute: () => Effect, label?: string): AsyncDisposable<Promise<void>>
```

Registriert einen Cleanup-fähigen Effect auf diesem Fiber.

`execute` läuft sofort; die von ihm erzeugten Disposer werden gesammelt und (in umgekehrter Reihenfolge) ausgeführt, sobald der zurückgegebene Disposer aufgerufen wird oder der Fiber entladen wird — je nachdem, was zuerst eintritt. Ein zweiter Aufruf des Disposers ist ein No-Op. Wirft `CordisError('INACTIVE_EFFECT')`, wenn der Fiber bereits disposed ist, und `TypeError`, wenn `execute` eine ungültige Shape zurückgibt.

- `execute` — der Effect-Body; akzeptierte Shapes siehe `Effect`.
- `label` — Effect-Label, das in `getEffects()`-Diagnosen angezeigt wird.

**Gibt** einen Disposer zurück, der den Effect abbaut und nach Abschluss settle.

[Quelle](../../vendor/cordis/src/fiber.ts#L415)

### fiber.getEffects()

```ts cordis-catalog
/**
 * Return metadata for currently registered effects.
 *
 * @returns one {@link EffectMeta} tree per labeled live effect.
 */
getEffects()
```

Gibt Metadaten für aktuell registrierte Effects zurück.

**Gibt** pro gelabeltem Live-Effect einen `EffectMeta`-Baum zurück.

[Quelle](../../vendor/cordis/src/fiber.ts#L568)

### fiber.await()

```ts cordis-catalog
/**
 * Wait for current lifecycle work and rethrow startup errors.
 *
 * @returns this fiber, once it has settled into a stable state.
 * @throws the config-validation or plugin-startup error, if any.
 */
async await()
```

Wartet auf aktuelle Lifecycle-Arbeit und wirft Startup-Fehler erneut.

**Gibt** diesen Fiber zurück, sobald er einen stabilen Zustand erreicht hat.

[Quelle](../../vendor/cordis/src/fiber.ts#L704)

### fiber.restart()

```ts cordis-catalog
/**
 * Dispose and immediately reload this plugin with its current config.
 *
 * @returns a promise resolving once the reload settled.
 * @throws {CordisError} `INACTIVE_EFFECT` when the fiber is already disposed.
 */
async restart()
```

Disposed und lädt dieses Plugin sofort mit seiner aktuellen Config neu.

**Gibt** ein Promise zurück, das eingelöst wird, sobald das Neuladen settle.

[Quelle](../../vendor/cordis/src/fiber.ts#L718)

### fiber.update(config, noSave?)

```ts cordis-catalog
/**
 * Validate and apply new config, then restart the plugin.
 *
 * Runs the `internal/update` waterfall first, so update hooks (and HMR)
 * can veto or replace the restart.
 *
 * @param config — the new raw config; validated before anything restarts.
 * @param noSave — hint for persistence hooks not to write the change back.
 * @returns the update waterfall result; the default restart returns a promise.
 * @throws when validation, an update listener, or the restarted plugin fails.
 */
update(config: any, noSave = false)
```

Validiert und wendet neue Config an und startet das Plugin dann neu.

Läuft zuerst den `internal/update`-Waterfall, sodass Update-Hooks (und HMR) den Neustart vetoen oder ersetzen können.

- `config` — die neue rohe Config; wird validiert, bevor etwas neu startet.
- `noSave` — Hinweis für Persistence-Hooks, die Änderung nicht zurückzuschreiben.

**Gibt** das Ergebnis des Update-Waterfalls zurück; der Standard-Neustart gibt ein Promise zurück.

[Quelle](../../vendor/cordis/src/fiber.ts#L736)

## Effect

Effect-Body-Ergebnis, das von `ctx.effect()` und Plugin-Startup akzeptiert wird.

Entweder ein einzelner Disposer, ein Promise auf einen, oder ein (möglicherweise asynchrones) Iterable, das mehrere liefert — Generator-Effects registrieren jeden gelieferten Disposer, sobald er erzeugt wird.

```ts cordis-catalog
/**
 * Effect body result accepted by `ctx.effect()` and plugin startup.
 *
 * Either a single disposer, a promise of one, or a (possibly async) iterable
 * yielding several — generator effects register each yielded disposer as it
 * is produced.
 */
type Effect<T = any> =
  | SyncEffect<T>
  | AsyncEffect<T>
```

[Quelle](../../vendor/cordis/src/fiber.ts#L83)

## Disposable

Funktion, die von einem Effect zurückgegeben wird, um während des Disposens Ressourcen freizugeben.

Disposer laufen in umgekehrter Registrierungsreihenfolge, wenn der besitzende Fiber entladen wird; sie können asynchron sein, woraufhin das Entladen auf sie wartet.

```ts cordis-catalog
/**
 * Function returned by an effect to release resources during disposal.
 *
 * Disposers run in reverse registration order when the owning fiber unloads;
 * they may be async, in which case unloading awaits them.
 */
type Disposable<T = any> = () => T
```

[Quelle](../../vendor/cordis/src/fiber.ts#L74)

## EffectMeta

Baumknoten, der verschachtelte Effect-Labels für Diagnosen verfügbar macht.

```ts cordis-catalog
/** Tree node used to expose nested effect labels for diagnostics. */
interface EffectMeta {
  /** Human-readable effect label, e.g. `ctx.on("event")` or `ctx.provide("name")`. */
  label: string
  /** Metadata of nested effects registered while this effect ran. */
  children: EffectMeta[]
}
```

[Quelle](../../vendor/cordis/src/fiber.ts#L96)

## CordisError

Framework-Fehler mit einem stabilen, maschinenlesbaren Code.

```ts cordis-catalog
/** Framework error with a stable machine-readable code. */
class CordisError extends Error {
  /**
   * @param code — the stable error code; also the default message.
   * @param message — optional human-readable override.
   */
  constructor(public code: CordisError.Code, message?: string)
}

/** Cordis error code definitions. */
namespace CordisError {
  export type Code = keyof typeof Code

  export const Code = {
    INACTIVE_EFFECT: 'cannot create effect on inactive context',
  } as const
}
```

[Quelle](../../vendor/cordis/src/fiber.ts#L157)

## ValidationError

Fehler, der erhoben wird, wenn die Plugin-Config die Standard-Schema-Validierung nicht besteht.

```ts cordis-catalog
/** Error raised when plugin configuration fails standard-schema validation. */
class ValidationError extends TypeError {
  name = 'ValidationError'

  /**
   * Build the aggregated message from schema issues.
   *
   * @param issues — the standard-schema issues, one message line each.
   */
  constructor(issues: readonly StandardSchemaV1.Issue[])
}
```

[Quelle](../../vendor/cordis/src/fiber.ts#L19)
