<!-- Die englische Quelldatei wird von scripts/gen-cordis-catalog.ts generiert; diese deutsche Datei ist die per双语配对 gepflegte, reviewte Gegenüber.
     Zum Aktualisieren zuerst `pnpm run gen-cordis-catalog` für die englische Seite ausführen, dann diese Datei aktualisieren und `pnpm run verify-translation-pairing --write docs/cordis-api/context.md` zum erneuten Aufzeichnen der Paarung ausführen. -->

# Context

[English](context.md) | [中文](context.zh.md) | Deutsch

Der Context ist das Kern-Objekt von Cordis: Jeder Service, jedes Event und jede Lifecycle-API wird über `ctx` erreicht. Event-Methoden sind unter [Events](events.de.md) dokumentiert, Effects und der aktuelle Fiber unter [Fiber](fiber.de.md) und das Laden von Plugins unter [Registry](registry.de.md).

Root- und Child-Abhängigkeits-Container für Cordis-Plugins.

Ein Context ist ein Proxy: Normale Property-Reads gehen durch den Service-Resolver, während `extend()`, `isolate()` und `intercept()` Scoped-Child-Contexts erzeugen, ohne ihren Parent zu mutieren.

[Quelle](../../vendor/cordis/src/context.ts#L42)

### ctx.extend(meta?)

```ts cordis-catalog
/**
 * Create a child context with extra metadata on top of the current scope.
 *
 * The child prototypally inherits every property of this context; own
 * properties of `meta` shadow the inherited ones. The parent is not mutated.
 *
 * @param meta — own properties (including symbol keys) to define on the child.
 * @returns a child context inheriting from this one.
 */
extend(meta = {}): this
```

Erzeugt einen Child-Context mit zusätzlichen Metadaten auf dem aktuellen Scope.

Der Child erbt prototypal jede Property dieses Contexts; eigene Properties von `meta` shadowen die geerbten. Der Parent wird nicht mutiert.

- `meta` — eigene Properties (inklusive Symbol-Keys), die auf dem Child definiert werden.

**Gibt** einen Child-Context zurück, der von diesem erbt.

[Quelle](../../vendor/cordis/src/context.ts#L99)

### ctx.isolate(name, label?)

```ts cordis-catalog
/**
 * Create a child context with an independent service scope for `name`.
 *
 * Below the returned context, reads and writes of the service `name`
 * resolve against the new label instead of the parent's, so a different
 * implementation can be provided without affecting the parent scope.
 * Passing the same `label` to two `isolate()` calls joins their scopes.
 *
 * @param name — the service name to isolate.
 * @param label — scope label to join; defaults to a fresh unique symbol.
 * @returns a child context whose `name` service resolves in the new scope.
 */
isolate(name: string, label?: symbol)
```

Erzeugt einen Child-Context mit einem unabhängigen Service-Scope für `name`.

Unterhalb des zurückgegebenen Contexts werden Reads und Writes des Service `name` gegen das neue Label aufgelöst statt gegen das des Parents, sodass eine andere Implementierung bereitgestellt werden kann, ohne den Parent-Scope zu beeinflussen. Dasselbe `label` an zwei `isolate()`-Aufrufe verbindet ihre Scopes.

- `name` — der zu isolierende Service-Name.
- `label` — Scope-Label zum Verbinden; defaultet auf ein frisches, eindeutiges Symbol.

**Gibt** einen Child-Context zurück, dessen `name`-Service im neuen Scope auflöst.

[Quelle](../../vendor/cordis/src/context.ts#L121)

### ctx.intercept(name, config)

```ts cordis-catalog
/**
 * Add service-specific intercept config for plugins started below this
 * context.
 *
 * Plugins loaded under the returned context see `config` merged into the
 * service's resolved config (ancestor entries first; see
 * `Service[symbols.resolveConfig]`). The parent context is not affected.
 *
 * @param name — the service name whose config to intercept.
 * @param config — the intercept config to merge for that service.
 * @returns a child context carrying the additional intercept entry.
 */
intercept<K extends InjectKey>(name: K, config: Context[K] extends { [symbols.config]: infer T } ? T : never): this
intercept(name: string, config: any): this
```

Fügt Service-spezifische Intercept-Config für Plugins hinzu, die unterhalb dieses Contexts gestartet werden.

Plugins, die unter dem zurückgegebenen Context geladen werden, sehen `config` in die aufgelöste Config des Service eingemischt (Vorfahr-Einträge zuerst; siehe `Service[symbols.resolveConfig]`). Der Parent-Context ist nicht betroffen.

- `name` — der Service-Name, dessen Config abgefangen werden soll.
- `config` — die Intercept-Config, die für diesen Service eingemischt wird.

**Gibt** einen Child-Context zurück, der den zusätzlichen Intercept-Eintrag trägt.

[Quelle](../../vendor/cordis/src/context.ts#L139)

### ctx.root

```ts cordis-catalog
/** The root context of the application (every child context shares it). @experimental */
root: this
```

Der Root-Context der Anwendung (jeder Child-Context teilt ihn). @experimental

[Quelle](../../vendor/cordis/src/context.ts#L22)

### ctx.baseUrl

```ts cordis-catalog
/** Base URL used to resolve relative plugin/module specifiers, if the runtime sets one. */
baseUrl?: string
```

Basis-URL, die zum Auflösen relativer Plugin-/Modul-Specifier verwendet wird, sofern die Runtime eine setzt.

[Quelle](../../vendor/cordis/src/context.ts#L24)

### ctx.events

```ts cordis-catalog
/** The event bus. Its methods are also mixed onto `ctx` (`ctx.on`, `ctx.emit`, ...). */
events: EventsService
```

Der Event-Bus. Seine Methoden werden auch auf `ctx` gemischt (`ctx.on`, `ctx.emit`, ...).

[Quelle](../../vendor/cordis/src/context.ts#L26)

### ctx.logger

```ts cordis-catalog
/** The logging service. Call `ctx.logger(name)` for a named logger. */
logger: LoggerService
```

Der Logging-Service. Rufe `ctx.logger(name)` für einen benannten Logger auf.

[Quelle](../../vendor/cordis/src/context.ts#L28)

### ctx.reflect

```ts cordis-catalog
/** The reflection layer backing the context proxy (`ctx.get`, `ctx.provide`, ...). */
reflect: ReflectService
```

Die Reflection-Schicht, die den Context-Proxy stützt (`ctx.get`, `ctx.provide`, ...).

[Quelle](../../vendor/cordis/src/context.ts#L30)

### ctx.registry

```ts cordis-catalog
/** The plugin registry. Its methods are mixed onto `ctx` (`ctx.plugin`, `ctx.inject`). */
registry: RegistryService
```

Die Plugin-Registry. Ihre Methoden werden auf `ctx` gemischt (`ctx.plugin`, `ctx.inject`).

[Quelle](../../vendor/cordis/src/context.ts#L32)

## Statische Member

### Context.effect

```ts cordis-catalog
/** Symbol key under which a disposer exposes its {@link EffectMeta} diagnostics tree. */
static readonly effect: unique symbol
```

Symbol-Key, unter dem ein Disposer seinen EffectMeta-Diagnosebaum verfügbar macht.

[Quelle](../../vendor/cordis/src/context.ts#L44)

### Context.filter

```ts cordis-catalog
/** Symbol key for a context's listener filter, consulted on every event dispatch. */
static readonly filter: unique symbol
```

Symbol-Key für den Listener-Filter eines Contexts, der bei jedem Event-Dispatch befragt wird.

[Quelle](../../vendor/cordis/src/context.ts#L46)

### Context.isolate

```ts cordis-catalog
/** Symbol key of the isolation map (see the `Context[symbols.isolate]` property). */
static readonly isolate: unique symbol
```

Symbol-Key der Isolation-Map (siehe die `Context[symbols.isolate]`-Property).

[Quelle](../../vendor/cordis/src/context.ts#L48)

### Context.intercept

```ts cordis-catalog
/** Symbol key of the intercept map (see the `Context[symbols.intercept]` property). */
static readonly intercept: unique symbol
```

Symbol-Key der Intercept-Map (siehe die `Context[symbols.intercept]`-Property).

[Quelle](../../vendor/cordis/src/context.ts#L50)

### Context.is(value)

```ts cordis-catalog
/**
 * Returns true for Cordis context proxies and context prototypes.
 *
 * Works across realms and across multiple copies of cordis, because the
 * brand is keyed by a global symbol rather than by `instanceof`.
 *
 * @param value — the value to test.
 * @returns `true` if `value` is a Cordis context, narrowing its type.
 */
static is(value: any): value is Context
```

Gibt für Cordis-Context-Proxys und Context-Prototypen true zurück.

Funktioniert über Realms und mehrere Cordis-Kopien hinweg, weil die Brand über ein globales Symbol gekeyt ist statt über `instanceof`.

- `value` — der zu testende Wert.

**Gibt** `true` zurück, wenn `value` ein Cordis-Context ist, und engt seinen Typ ein.

[Quelle](../../vendor/cordis/src/context.ts#L61)

## Service-Store und Mixins

### ctx.get(name, strict?)

```ts cordis-catalog
/**
 * Read a service from the store without the inject requirement.
 *
 * @param name — the service name.
 * @param strict — when `true` (default), only return implementations
 * whose providing fiber is currently active.
 * @returns the service value, or `undefined` when not (yet) provided.
 */
get<K extends string & keyof this>(name: K, strict?: boolean): undefined | this[K]
get(name: string, strict?: boolean): any
```

Liest einen Service aus dem Store, ohne die Inject-Anforderung.

- `name` — der Service-Name.
- `strict` — wenn `true` (Default), nur Implementierungen zurückgeben, deren bereitstellender Fiber aktuell aktiv ist.

**Gibt** den Service-Wert zurück, oder `undefined`, wenn (noch) nicht bereitgestellt.

[Quelle](../../vendor/cordis/src/reflect.ts#L17)

### ctx.set(name, value)

```ts cordis-catalog
/**
 * Overwrite a provided service's value.
 *
 * Only the fiber that provided the service may set it; setting an
 * unprovided name throws.
 *
 * @param name — the service name.
 * @param value — the new service value.
 */
set<K extends string & keyof this>(name: K, value: undefined | this[K]): void
set(name: string, value: any): void
```

Überschreibt den Wert eines bereitgestellten Service.

Nur der Fiber, der den Service bereitgestellt hat, darf ihn setzen; das Setzen eines nicht bereitgestellten Namens wirft.

- `name` — der Service-Name.
- `value` — der neue Service-Wert.

[Quelle](../../vendor/cordis/src/reflect.ts#L29)

### ctx.provide(name, value)

```ts cordis-catalog
/**
 * Register a service implementation owned by the current fiber.
 *
 * The service becomes visible to dependents in the same isolation scope
 * once the fiber is active; it is unregistered (waking dependents) when
 * the returned disposer runs or the fiber unloads. Throws if the name is
 * already provided in this scope or declared as an accessor.
 *
 * @param name — the service name.
 * @param value — the service value.
 * @returns a disposer that unregisters the service.
 */
provide<K extends string & keyof this>(name: K, value: undefined | this[K]): () => void
provide(name: string, value?: any): () => void
```

Registriert eine Service-Implementierung, die dem aktuellen Fiber gehört.

Der Service wird für Dependents im selben Isolation-Scope sichtbar, sobald der Fiber aktiv ist; er wird unregistriert (weckt Dependents), wenn der zurückgegebene Disposer läuft oder der Fiber entladen wird. Wirft, wenn der Name in diesem Scope bereits bereitgestellt oder als Accessor deklariert ist.

- `name` — der Service-Name.
- `value` — der Service-Wert.

**Gibt** einen Disposer zurück, der den Service unregistriert.

[Quelle](../../vendor/cordis/src/reflect.ts#L44)

### ctx.accessor(name, options)

```ts cordis-catalog
/**
 * Define a computed context property backed by get/set hooks.
 *
 * The accessor is removed when the current fiber unloads. Throws if the
 * name is already declared.
 *
 * @param name — the context property name.
 * @param options — the `get` hook and optional `set` hook.
 */
accessor(name: string, options: Omit<Property.Accessor, 'type'>): void
```

Definiert eine berechnete Context-Property, die auf get/set-Hooks basiert.

Der Accessor wird entfernt, wenn der aktuelle Fiber entladen wird. Wirft, wenn der Name bereits deklariert ist.

- `name` — der Context-Property-Name.
- `options` — der `get`-Hook und der optionale `set`-Hook.

[Quelle](../../vendor/cordis/src/reflect.ts#L56)

### ctx.mixin(name, mixins)

```ts cordis-catalog
/**
 * Expose selected members of a service directly on `ctx`.
 *
 * Each mixed-in key becomes an accessor that forwards to the service
 * (binding methods to it), so e.g. `ctx.on` forwards to `ctx.events.on`.
 * Mixins are removed when the current fiber unloads.
 *
 * @param name — the context property holding the source service.
 * @param mixins — keys to forward, or a source-key → ctx-key map.
 */
mixin<K extends string & keyof this>(name: K, mixins: (keyof this & keyof this[K])[] | Dict<string>): void
mixin<T extends {}>(source: T, mixins: (keyof this & keyof T)[] | Dict<string>): void
```

Macht ausgewählte Member eines Service direkt auf `ctx` verfügbar.

Jeder gemixte Key wird zu einem Accessor, der an den Service weiterleitet (bindet Methoden an ihn), sodass z. B. `ctx.on` an `ctx.events.on` weiterleitet. Mixins werden entfernt, wenn der aktuelle Fiber entladen wird.

- `name` — die Context-Property, die den Quell-Service hält.
- `mixins` — Keys zum Weiterleiten, oder eine Source-Key → ctx-Key-Map.

[Quelle](../../vendor/cordis/src/reflect.ts#L67)
