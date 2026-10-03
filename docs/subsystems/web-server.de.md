# HTTP Server
[English](web-server.md) | [中文](web-server.zh.md) | Deutsch


[dsh-host-webserver](../../packages/host/webserver) ist der Browser-HTTP-Carrier des GUI-Host: ein einzelnes `node:http`-Plugin, das `ctx.webServer` bereitstellt — eine Named-Route-Registry, optionale gzip-Response-Kompression, index.html-Transform-Callbacks und einen Fallback-Handler, den ein Plugin beanspruchen kann. Er ist nicht Teil des agent loop und kein capability seam; er kennt keine Harness-Konzepte, und jedes Feature-Route — einschließlich der `/api`-Bridge, der Plugin-Bundles und des HMR-Event-Streams — registriert ein anderes Plugin ([Layering-Notiz](../../.agents/notes/implemented/architecture/2026-07-24-web-config-tree-boot-and-transport-layering.de.md)). Er bedient nur Browser: Electron lädt die gebauten Dateien über `file://` und schickt fetch-Requests über eine IPC-Bridge statt über diesen Server.

Quelle: [`packages/host/webserver/src/index.ts`](../../packages/host/webserver/src/index.ts)

## Routes

```ts type-equiv
/** Route match kind: 'exact' matches the pathname verbatim; 'prefix' p matches p and p/<anything>. */
type WebRouteKind = 'exact' | 'prefix'
```

```ts type-equiv
/** One named route registration. */
interface WebRoute {
  kind: WebRouteKind
  /** Absolute pathname, no trailing slash. */
  path: string
  /** Owns the full response lifecycle (may hold the response open, e.g. SSE). */
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}
```

Die Match-Reihenfolge ist fixiert: zuerst die Exact-Tabelle, dann das längste passende Prefix, dann der registrierte Fallback. Die Registrierungsreihenfolge trägt keine request-sichtbare Semantik — Named Routes werden disjoint komponiert, und der Fallback-Seat beantwortet alles, was keine Named Route beansprucht; nur ein Owner, eine zweite Registrierung wirft. Die ausgelieferte Web-Komposition beansprucht den Seat mit [`dsh-host-frontend-static`](../../packages/host/frontend-static/src/index.ts), dem SPA-dist-Server mit fixierter Semantik: Connection authentifiziert die dist-Root und das konfigurierte index, bevor deren HTML gelesen wird; Nicht-index-Assets bleiben öffentlich; Nicht-GET/HEAD ist 405, Traversal außerhalb der dist-Root ist 403, vorhandene Dateien werden direkt serviert, fehlende oder Nicht-Datei-Ziele sind leere 404-Responses, und unbekannte Extensions gehen als octet-stream raus.

## Config

```ts type-equiv
/** Web server listen and response-compression config. */
interface Config {
  /** Listen host; the two supported values are loopback and all-interfaces. */
  host: '127.0.0.1' | '0.0.0.0'
  /** Listen port; zero requests an OS-assigned port. */
  port: number
  /** Response compression for socket-backed HTTP requests. @default 'none' */
  compression?: 'none' | 'gzip'
  /** Gzip DEFLATE level from 0 through 9. @default 1 */
  compressionLevel?: number
  /** Minimum known response length eligible for gzip; unknown-length streams are eligible. @default 1024 */
  compressionThresholdBytes?: number
}
```

`host` akzeptiert nur `127.0.0.1` (Default-Haltung) und `0.0.0.0` (bewusste Netzwerk-Exposition). Der Carrier selbst besitzt kein TLS, keine Authentifizierung und keine Origin-Policy, sodass ein Nicht-Loopback-Bind den Server exponiert, es sei denn, die Komposition liefert diese Kontrollen. `compression` defaultet auf `none`; das ausgelieferte Web-Bundle wählt gzip Level 1 mit einer 1024-Byte-Schwelle. Das ausgelieferte `dsh web`-Kommando wählt Loopback und lehnt `--host 0.0.0.0` ab; sein Connection-Plugin liefert Host/Origin-Checks plus Browser-Session-Authentifizierung für jede Host-API-Route und jeden Stream. Andere Kompositionen besitzen ihre Bind- und Route-Authentifizierungs-Policy selbst. Der dist-Standort ist eine Assembly-Tatsache des Frontend-Plugins, das den Seat beansprucht.

## Der Service

`WebServer` (`ctx.webServer`) listened sofort bei der Aktivierung; ein Listen-Fehler (EADDRINUSE …) lässt die Initialisierung rejecten, und der Boot-Prozess meldet die fehlgeschlagene Fiber. `register(route)` fügt eine Named Route hinzu und gibt ihren Disposer zurück; ein dupliziertes `(kind, path)` wirft, weil Route-Muster ein kompositionsebener Vertrag sind und eine Kollision eine Fehlkonfiguration ist. Gzip wrappt eligible socket-backed Responses innerhalb des Servers, sodass Route-Handler das direkte `ServerResponse`-Ownership behalten und dem Service keine Response-Schreib-API hinzugefügt wird. Vorhandene Content-Encodings, `Cache-Control: no-transform`, Ranges, SSE, ZIP und das gepackte `.gz`-Worker-Image bleiben Identity-Responses. `collectIndexInjections()` sammelt strukturierte `IndexInjection`-Zeilen über einen `webserver/index-inject`-Emit, und `renderIndex(html)` rendert sie in erfolgreiche Root- und konfigurierte Index-Responses, bevor die rohen `tapIndex(transform)`-Escape-hatch-Transforms in Registrierungsreihenfolge angewendet werden; [dsh-client-modules](../../packages/client/modules) beantwortet das Event mit den Boot-Manifest-Zeilen. `port` liest den Listen-Port, einschließlich des vom OS zugewiesenen Ports, wenn `config.port` 0 ist.

Ein Request, dessen Verarbeitung wirft (ein malformed %-Escape, das `decodeURIComponent` trifft, ein Client, der mitten im Body abbricht), wird als Warnung geloggt und mit 400 beantwortet — oder der Socket wird zerstört, wenn die Header schon raus sind — niemals ein Prozess-Exit. Das Disposal paart `close()` mit `closeAllConnections()`, weil ein Handler seine Response offen halten kann (SSE) und solche Verbindungen nie von selbst enden; ohne das Force-Close würde das Teardown hängen. Das Package printed nie: Die URL-Zeile gehört der Shell. Per-Package-Betriebsdetails, einschließlich der Dev-Mode-Bundle-Watch-Pipeline, bleiben im [README](../../packages/host/webserver/README.de.md).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.de.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxwebserver--webserver"></a>

### `ctx.webServer` — `WebServer`

The browser HTTP carrier service. Activation listens immediately. Route registration order does not affect requests because configured named routes must be distinct, and the fallback handler answers anything not yet claimed during startup with 404 until its owner registers. A listen failure rejects initialization, and the boot process reports the failed fiber.

```ts cordis-catalog
/**
 * Register a named route. Duplicate (kind, path) throws — route patterns are
 * a composition-level contract, so a collision is a misconfiguration.
 * @param route - kind, path, and the owning handler.
 * @returns the disposer removing the route.
 */
register(route: WebRoute): () => void

/**
 * Register an exact-path HTTP upgrade route. Duplicate paths throw because
 * one socket can have only one protocol owner.
 * @param route - pathname and handler owning negotiation plus socket use.
 * @returns the disposer removing the route.
 */
registerUpgrade(route: WebUpgradeRoute): () => void

/**
 * Claim the fallback seat: the handler answering every request no named
 * route matches (the SPA dist server in the shipped Web composition). One
 * owner only — a second registration throws, because two fallbacks cannot
 * compose.
 * @param handler - owns the full response lifecycle of unmatched requests.
 * @returns the disposer releasing the seat.
 */
registerFallback(handler: WebRoute['handler']): () => void

/**
 * Register a raw-HTML index transform, the escape hatch for markup no
 * {@link IndexInjection} row expresses: {@link renderIndex} applies taps in
 * registration order after rendering the structured rows.
 * @param transform - pure html-to-html function.
 * @returns the disposer removing the transform.
 */
tapIndex(transform: (html: string) => string): () => void

/**
 * Run an index.html body through the registered taps in registration order
 * — called by the fallback owner on every index response it renders.
 * @param html - the raw index.html body.
 * @returns the transformed body.
 */
applyIndexTaps(html: string): string

/**
 * Gather the structured injection table: one `webserver/index-inject` emit,
 * every subscriber pushes its current rows. Fresh per call, so subscribers
 * read live state (module graph, theme preference) at emit time.
 * @returns rows in subscriber activation order.
 */
collectIndexInjections(): IndexInjection[]

/**
 * Render one index.html body: the structured injection table first, then
 * the raw `tapIndex` transforms over the result.
 * @param html - the raw index.html body.
 * @returns the transformed body.
 */
renderIndex(html: string): string
```

Source: [`packages/host/webserver/src/index.ts`](../../packages/host/webserver/src/index.ts)

<a id="webserver-events"></a>

### `webserver/*` events

<a id="webserverindex-inject--emit"></a>

#### `webserver/index-inject` — emit

Collect the structured index injection table. Emitted on every index render and every worker boot-payload request; listeners push their current rows, so a row's data is read fresh at emit time.

```ts cordis-catalog
/**
 * Collect the structured index injection table. Emitted on every index
 * render and every worker boot-payload request; listeners push their
 * current rows, so a row's data is read fresh at emit time.
 * @param table - Mutable row table; listeners append in activation order.
 * @mode emit
 */
'webserver/index-inject'(table: IndexInjection[]): void
```

Source: [`packages/host/webserver/src/index.ts`](../../packages/host/webserver/src/index.ts)
<!-- END GENERATED cordis-surface -->
