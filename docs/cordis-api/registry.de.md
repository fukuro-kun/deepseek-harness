<!-- Die englische Quelldatei wird von scripts/gen-cordis-catalog.ts generiert; diese deutsche Datei ist die per双语配对 gepflegte, reviewte Gegenüber.
     Zum Aktualisieren zuerst `pnpm run gen-cordis-catalog` für die englische Seite ausführen, dann diese Datei aktualisieren und `pnpm run verify-translation-pairing --write docs/cordis-api/registry.md` zum erneuten Aufzeichnen der Paarung ausführen. -->

# Registry

[English](registry.md) | [中文](registry.zh.md) | Deutsch

Plugin-Laden und Dependency Injection.

### ctx.inject(deps, callback)

```ts cordis-catalog
/**
 * Run a callback once the requested services are available.
 *
 * Shorthand for `ctx.plugin({ inject, apply: callback })`: the callback
 * is unloaded and re-run whenever a required service changes.
 *
 * @param deps — required services, as an array or a name → config map.
 * @param callback — plugin body called with `(ctx, config)`.
 * @returns the fiber; awaiting it settles once loading finished.
 */
inject(deps: Inject, callback: Plugin.Function<void>): Fiber & PromiseLike<Fiber>
```

Führt einen Callback aus, sobald die angeforderten Services verfügbar sind.

Kurzform für `ctx.plugin({ inject, apply: callback })`: der Callback wird entladen und neu ausgeführt, sobald sich ein erforderlicher Service ändert.

- `deps` — erforderliche Services, als Array oder als Name-→-Config-Map.
- `callback` — Plugin-Body, aufgerufen mit `(ctx, config)`.

**Gibt** den Fiber zurück; ein await darauf settle nach Abschluss des Ladens.

[Quelle](../../vendor/cordis/src/registry.ts#L176)

### ctx.plugin(plugin, ...args)

```ts cordis-catalog
/**
 * Load a plugin in the current context.
 *
 * @param plugin — a function, class, or `{ apply }` object plugin.
 * @param args — the plugin config, validated against its `Config` schema.
 * @returns the fiber; awaiting it settles once loading finished
 * (rejecting on config or startup errors).
 */
plugin<P extends Plugin>(plugin: P, ...args: Spread<GetPluginConfig<P>>): Fiber & PromiseLike<Fiber>
```

Lädt ein Plugin im aktuellen Context.

- `plugin` — ein Plugin als Funktion, Klasse oder `{ apply }`-Objekt.
- `args` — die Plugin-Config, validiert gegen ihr `Config`-Schema.

**Gibt** den Fiber zurück; ein await darauf settle nach Abschluss des Ladens (bei Config- oder Startup-Fehlern wird rejected).

[Quelle](../../vendor/cordis/src/registry.ts#L185)

## Plugin

Unterstützte Plugin-Entrypoint-Shapes.

```ts cordis-catalog
/** Supported plugin entrypoint shapes. */
type Plugin<T = any> =
  | Plugin.Function<T>
  | Plugin.Constructor<T>
  | Plugin.Object<T>

/** Types associated with plugin entrypoints and runtime records. */
namespace Plugin {
  /** Shared metadata understood by the plugin registry and related tooling. */
  export interface Base<T = any> {
    /** Display name used for fiber diagnostics and logger names. */
    name?: string
    /** Standard-schema validator applied to config before the plugin starts. */
    Config?: StandardSchemaV1<any, T>
    /** Services the plugin requires; it only loads while all are available. */
    inject?: Inject
    /** Service name(s) the plugin provides (read by `Service` and by loaders). */
    provide?: string | string[]
    /** Service names whose intercept config the plugin declares it consumes. */
    intercept?: Dict<boolean>
  }

  export interface Transform<S, T> {
    /** Marks the transform object as a schema/config transform. */
    schema?: true
    /** Convert user-facing config to runtime config. */
    Config: (config: S) => T
  }

  /** Function plugin called with `(ctx, config)`. */
  export interface Function<T = any> extends Base<T> {
    (ctx: Context, config: T): any
  }

  /** Class plugin constructed with `(ctx, config)`. */
  export interface Constructor<T = any> extends Base<T> {
    new (ctx: Context, config: T): any
  }

  /** Object plugin with an `apply(ctx, config)` method. */
  export interface Object<T = any> extends Base<T> {
    apply(ctx: Context, config: T): any
  }

  /** Mutable registry record shared by all fibers of one plugin callback. */
  export interface Runtime {
    /** Display name copied from the first registered plugin shape. */
    name?: string
    /** Every live fiber of this plugin (one per `ctx.plugin()` call). */
    fibers: DisposableList<Fiber>
    /** The executable entrypoint all fibers share (registry identity key). */
    callback: globalThis.Function
    /** Standard-schema validator applied to each fiber's config. */
    Config?: StandardSchemaV1
  }
}
```

[Quelle](../../vendor/cordis/src/registry.ts#L92)

## Inject

Service-Abhängigkeitsdeklaration, die von Plugins und dem `@Inject`-Decorator akzeptiert wird.

Die Array-Form fordert Services ohne Intercept-Config an. Die Objekt-Form mappt jeden Service-Namen auf eine optionale Intercept-Config für den Plugin-Context.

```ts cordis-catalog
/**
 * Service dependency declaration accepted by plugins and the `@Inject`
 * decorator.
 *
 * Array form requests services without intercept config. Object form maps each
 * service name to optional intercept config for the plugin context.
 */
type Inject<M = Dict> = (keyof M)[] | { [K in keyof M]?: M[K] }

/** Utilities for normalizing plugin dependency declarations. */
namespace Inject {
  /**
   * Convert array/object/class-inherited inject metadata into a plain map.
   *
   * @param inject — the declaration to normalize; `null`/`undefined` add nothing.
   * @param result — the map to fill (service name → intercept config or `null`).
   * @returns `result`.
   */
  export function resolve(inject: Inject | null | undefined, result: Dict = Object.create(null))
}
```

[Quelle](../../vendor/cordis/src/registry.ts#L19)
