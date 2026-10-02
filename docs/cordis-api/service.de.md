<!-- Die englische Quelldatei wird von scripts/gen-cordis-catalog.ts generiert; diese deutsche Datei ist der über die Paarung gepflegte, begutachtete Gegenpart.
     Aktualisiere zuerst das Englische mit `pnpm run gen-cordis-catalog`, dann diese Datei und zeichne die Paarung mit `pnpm run verify-translation-pairing --write docs/cordis-api/service.md` neu auf. -->

# Service

[English](service.md) | [中文](service.zh.md) | Deutsch

Die Basisklasse für Context-Services. Eine als Plugin geladene Unterklasse registriert sich als `ctx.<name>`.

Basisklasse für Services, die eine benannte API auf `ctx` bereitstellen.

Unterklassen rufen `super(ctx, name)` aus ihrem Konstruktor auf. Der Service wird sofort registriert und mit dem besitzenden fiber automatisch entfernt.

[Quelle](../../vendor/cordis/src/service.ts#L11)

### service.name

```ts cordis-catalog
/** The service name this instance is registered under. */
public name!: string
```

Der Service-Name, unter dem diese Instanz registriert ist.

[Quelle](../../vendor/cordis/src/service.ts#L30)

## Statische Member

### Service.init

```ts cordis-catalog
/** Symbol key of an instance method run after construction (class plugins). */
static readonly init: unique symbol
```

Symbol-Schlüssel einer Instanzmethode, die nach der Konstruktion ausgeführt wird (Klassen-Plugins).

[Quelle](../../vendor/cordis/src/service.ts#L13)

### Service.check

```ts cordis-catalog
/** Symbol key of the availability predicate passed to `ctx.provide()`. */
static readonly check: unique symbol
```

Symbol-Schlüssel des Verfügbarkeitsprädikats, das an `ctx.provide()` übergeben wird.

[Quelle](../../vendor/cordis/src/service.ts#L15)

### Service.config

```ts cordis-catalog
/** Symbol key of the phantom intercept-config type parameter. */
static readonly config: unique symbol
```

Symbol-Schlüssel des phantom intercept-config-Typparameters.

[Quelle](../../vendor/cordis/src/service.ts#L17)

### Service.invoke

```ts cordis-catalog
/** Symbol key of the call body making a service callable (e.g. `ctx.logger()`). */
static readonly invoke: unique symbol
```

Symbol-Schlüssel des Aufrufkörpers, der einen Service aufrufbar macht (z. B. `ctx.logger()`).

[Quelle](../../vendor/cordis/src/service.ts#L19)

### Service.extend

```ts cordis-catalog
/** Symbol key of the helper deriving an extended service instance. */
static readonly extend: unique symbol
```

Symbol-Schlüssel der Hilfsfunktion, die eine erweiterte Service-Instanz ableitet.

[Quelle](../../vendor/cordis/src/service.ts#L21)

### Service.tracker

```ts cordis-catalog
/** Symbol key of the tracker metadata used for context tracing. */
static readonly tracker: unique symbol
```

Symbol-Schlüssel der Tracker-Metadaten für Context-Tracing.

[Quelle](../../vendor/cordis/src/service.ts#L23)

### Service.resolveConfig

```ts cordis-catalog
/** Symbol key of the intercept-config resolution helper below. */
static readonly resolveConfig: unique symbol
```

Symbol-Schlüssel der untenstehenden intercept-config-Auflösungshilfe.

[Quelle](../../vendor/cordis/src/service.ts#L25)
