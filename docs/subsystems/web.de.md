# Web-Zugriff
[English](web.md) | [中文](web.zh.md) | Deutsch


Der Web-Zugriffs-seam — ein [capability seam](../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.de.md), der **zwei Operationen** (search und fetch) auf einem `ctx.web`-Service überspannt und über Packages aufgeteilt ist: Service Definition ([dsh-web](../../packages/web/web), `ctx.web` + die Provider-Registries), Service Providers ([dsh-web-search-exa](../../packages/web/web-search-exa), [dsh-web-search-perplexity](../../packages/web/web-search-perplexity), [dsh-web-search-deepseek](../../packages/web/web-search-deepseek), [dsh-web-fetch-http](../../packages/web/web-fetch-http)) und Consumer ([dsh-tool-web](../../packages/web/tool-web), die `web_search`/`web_fetch`-Tool-Schemas). Web ist **eine optionale Fähigkeit**, nicht Teil der agent-loop-Spine — daher lebt sein Vokabular hier, nicht in [core.md](core.de.md). Ein Wechsel des search-provider ändert nicht, wie das Modell eine Anfrage stellt, und ein Wechsel des fetch-provider ändert nicht, wie das Modell eine URL anfordert.

Quelle: [`packages/web/web/src/types.ts`](../../packages/web/web/src/types.ts)

## Warum eine Fähigkeit zwei Operationen hat

Search und fetch teilen weder ein Request-Schema noch Geschäftslogik, sind aber bewusst eine `ctx.web`-Zwischenschicht: ein Eigentümer der provider-Auswahlrichtlinie, ein Abbruch-/Fehler-Vokabular und eine produktseitige „wie dieser harness das Web erreicht"-Konfigurations-API. Der Preis sind die parallelen `searchX`/`fetchX`-Methodenpaare auf dem Service; diese Parallelität ist beabsichtigt, keine verpasste Extraktion. Provider registrieren **Fähigkeiten** (einen `WebSearchProvider` oder `WebFetchProvider`), keine Tools; die modellseitigen Namen, Schemas, Prompt-Hinweise und die Darstellung liegen alle im einzigen `dsh-tool-web`-Consumer.

## Search-Request und -Ergebnis

Jeder seam-Request trägt genau ein `query`. Der `dsh-tool-web`-Consumer akzeptiert ein erforderliches `queries`-Array und fächert es zu separaten seam-Requests auf; ein einelementiges Array führt eine Suche aus. `maxResults` ist eine consumer-eigene Obergrenze (`dsh-tool-web`s `searchMaxResults`-Config, Standard `8`), die durch den seam durchgereicht und auf dem Rückweg durchgesetzt wird — liefert ein provider zu viel, schneidet der seam `sources[]` ab und setzt `truncated`.

```ts type-equiv
/**
 * What one search-capable backend is asked to search. Each request carries one
 * query; a consumer may issue several requests. `maxResults` is a
 * `dsh-tool-web`-layer bound passed through unchanged and enforced on the way
 * back by the seam (see {@link WebSearchResult}).
 */
interface WebSearchRequest {
  readonly query: string
  /**
   * Upper bound on returned sources; the seam truncates to it. Omitted = no
   * bound. `dsh-tool-web` always sets it. A provider whose API supports a
   * result-count control (Exa's `numResults`) should apply it at the request
   * layer as a cost/latency optimization; the seam enforces the bound
   * regardless.
   */
  readonly maxResults?: number
}
```

```ts type-equiv
/**
 * Normalized search outcome. `content` is optional provider-generated answer
 * text or summary (Exa and DeepSeek return none; Perplexity returns a
 * generated answer).
 * `sources[]` is the portable citation shape. `truncated` is set by the seam
 * when it cut `sources[]` down to `maxResults`.
 */
interface WebSearchResult {
  /** Optional provider-generated answer text, search context, or summary. */
  readonly content?: string
  /** Citeable sources, already truncated to the request's `maxResults`. */
  readonly sources: readonly WebSearchSource[]
  /** True when the seam dropped sources to honor `maxResults`. */
  readonly truncated: boolean
}
```

```ts type-equiv
/**
 * One citeable source. A source always has a URL; `title`, `snippet`, and
 * `publishedAt` are optional because not every provider returns them — forcing
 * adapters to invent them would make the seam lie (Perplexity citations may be
 * URL-only). `dsh-tool-web` renders `title ?? hostname(url)` for display.
 */
interface WebSearchSource {
  readonly url: string
  readonly title?: string
  readonly snippet?: string
  /** Publication/crawl timestamp as a provider-supplied ISO-8601 string. */
  readonly publishedAt?: string
}
```

## Fetch-Request und -Ergebnis

```ts type-equiv
/**
 * What one fetch-capable backend is asked to retrieve. The request deliberately
 * omits timeout, format, prompt, and extraction controls: cancellation is a
 * direct execution argument, while presentation and higher-level LLM concerns
 * belong outside safe retrieval.
 */
interface WebFetchRequest {
  readonly url: string
}
```

Der HTTP-Status ist Teil des Zustands der abgerufenen Ressource, nicht automatisch ein Fehlschlag: ein erfolgreicher Netzwerkabruf eines `404`/`500` liefert ein `WebFetchResult` mit Statuscode und einem begrenzten dekodierten Body. `url` ist die finale URL nach erlaubten Redirects. `WebError` ist für Fälle reserviert, in denen die Ressource nicht sicher abgerufen oder dargestellt werden kann.

```ts type-equiv
/**
 * Normalized fetch outcome. A successful network fetch of a non-2xx response is
 * a result, not an error: the status code is part of the fetched resource
 * state. {@link WebError} is reserved for failures to safely retrieve or
 * represent the resource.
 */
interface WebFetchResult {
  /** The final URL after allowed redirects (the request URL is in the request). */
  readonly url: string
  /** HTTP status code of the fetched response. */
  readonly statusCode: number
  /** Decoded body, classified by content kind. */
  readonly body: WebFetchBody
  /** True when the provider capped the decoded body. */
  readonly truncated: boolean
}
```

```ts type-equiv
/**
 * The decoded body of a fetched resource. A CLOSED discriminated union owned by
 * `dsh-web`: the provider decodes the kind and `dsh-tool-web` renders it, so a
 * new kind is a coordinated change across known packages, not a plugin
 * extension. Consumers `switch` on `kind` ending in `default: assertNever(...)`
 * so adding a kind breaks compilation at every consumer until handled. Each arm
 * stays its own object literal even where fields coincide, so an arm can gain
 * fields the others lack.
 */
type WebFetchBody =
  | { readonly kind: 'html'; readonly content: string }
  | { readonly kind: 'text'; readonly content: string }
```

## Provider-Verfügbarkeit

Das `available(): boolean` eines provider ist eine billige LOKALE Prüfung (Vorhandensein von Credentials, parsbare Config) und **darf keine Netzwerkaufrufe machen**. Es ist eine Eingabe für die Auswahl zur Ausführungszeit, kein Gesundheitssystem: `search()`/`fetch()` lesen es, um einen brauchbaren provider zu wählen, und ein Auswahlfehlschlag zeigt sich als der strukturierte `WebError`, auf den der Aufrufer verzweigt — er trägt das verzweigbare Detail (die fehlende id oder die mehrdeutige Kandidatenmenge) in seinem Code und seiner Meldung.

Die Auswahl hängt nie von Registrierungs-, Config- oder HMR-Reihenfolge ab: eine Fähigkeit hat eine explizite provider id (Config `searchProvider`/`fetchProvider` oder die passende Env-Var, die dasselbe Feld füllt), oder wählt automatisch, wenn genau ein brauchbarer provider registriert ist; mehrere brauchbare provider ohne konfigurierte id ergeben `WEB_PROVIDER_AMBIGUOUS`, nicht first-wins.

## Fetch-Netzwerkrichtlinie

Die ausgelieferten Cordis-, Code- und Standard-Presets stellen `web_fetch` in jedem sandbox- und approval-Modus ohne Aufruf-für-Aufruf-Bestätigung bereit. File-sandbox-Presets regeln den Web-Netzwerkzugriff nicht. Ein Deployment, das eine Bestätigung braucht, muss eine `tools/pre-execute`-Policy hinzufügen oder fetch deaktivieren.

Der HTTP-provider löst jeden tatsächlichen Request auf, lehnt nicht-öffentliche Antworten ab — einschließlich privater IPv4, die über das aktive DNS64-Präfix erreicht werden —, pinnt die validierte Adressmenge und wiederholt die Durchsetzung für jeden same-origin-Redirect. Ein cross-origin-Redirect erfordert einen neuen Tool Call und eine frische Public-Address-Validierung. Diese Prüfungen verhindern SSRF-Zugriff auf nicht-öffentliche Ziele, halten aber ein Modell nicht davon ab, Daten an eine öffentliche URL zu senden.

## Fehler

`WebError extends HarnessError` ([core.md](core.de.md) Fehlertaxonomie) mit einem `code: string` (offen, wie der Fehler jedes anderen seam — `LlmError`, `SubagentError`), nicht eine geschlossene Union: ein provider darf eigene Codes werfen, ohne `dsh-web` zu ändern, und Consumers müssen einen unbekannten Code tolerieren. Die Codes teilen sich nach Eigentümer auf. Seam-neutrale Codes wirft der gemeinsame `WebRuntime`-Contract: `WEB_PROVIDER_UNAVAILABLE`, `WEB_PROVIDER_CONFIGURED_MISSING`, `WEB_PROVIDER_CONFIGURED_UNAVAILABLE`, `WEB_PROVIDER_AMBIGUOUS`, `WEB_DUPLICATE_PROVIDER` (ein Programmierfehler zur Registrierungszeit, das Analogon zu `LlmRuntime`s `DUPLICATE_ADAPTER`), `WEB_ABORTED` und `WEB_PROVIDER_ERROR` (der Catch-all für einen provider-eigenen Fehlschlag, der durch den seam sichtbar wird, einschließlich Netzwerk-/Transportfehler — DNS, connection refused, TLS). Fetch-Transport-Codes gehören der `dsh-web-fetch-http`-Implementierung, und ein anderes fetch-Backend muss sie nicht werfen: `WEB_INVALID_URL`, `WEB_BLOCKED_URL`, `WEB_REDIRECT_BLOCKED`, `WEB_FETCH_TOO_LARGE`, `WEB_FETCH_TIMEOUT`, `WEB_UNSUPPORTED_CONTENT_TYPE`.

## Der Service

`WebRuntime` registriert search- und fetch-provider, lehnt doppelte ids mit `WEB_DUPLICATE_PROVIDER` ab und löst provider zur Ausführungszeit mit strukturierten Auswahlfehlern auf. Das lokale fetch-Backend akzeptiert nur HTTP(S), lehnt Credentials ab, löst jeden Hostnamen einmal auf, lehnt jede Antwortmenge mit einem nicht-öffentlichen IPv4- oder IPv6-Ziel oder einer NAT64-Übersetzung auf nicht-öffentliche IPv4 über das aktive Präfix ab, pinnt die Request-Verbindung auf die validierten Adressen, wiederholt diese Prüfungen für jeden same-origin-Redirect-Hop, begrenzt Redirects, Bytes, Zeichen und Zeit und dekodiert den Body; die Darstellung gehört dem Tool.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.de.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxweb--webruntime"></a>

### `ctx.web` — `WebRuntime`

The web access service. Registered as `ctx.web` (one instance per context).

Selection semantics (resolved at execution time, never order-dependent):

- A configured id that is registered and `available()` → that provider.
- A configured id not registered → `WEB_PROVIDER_CONFIGURED_MISSING`.
- A configured id registered but unavailable → `WEB_PROVIDER_CONFIGURED_UNAVAILABLE`.
- No id configured, exactly one registered usable provider → that provider.
- No id configured, multiple usable providers → `WEB_PROVIDER_AMBIGUOUS`.
- No id configured, no usable provider → `WEB_PROVIDER_UNAVAILABLE`.

```ts cordis-catalog
/**
 * Register a search provider. Throws {@link WebError} `WEB_DUPLICATE_PROVIDER`
 * if its id is already registered for search. Returns a disposer; disposed
 * with the calling fiber.
 * @param provider - the provider; its `id` is the registry key.
 * @returns the disposer that unregisters the provider.
 */
registerSearchProvider(provider: WebSearchProvider): () => void

/**
 * Register a fetch provider. Throws {@link WebError} `WEB_DUPLICATE_PROVIDER`
 * if its id is already registered for fetch. Returns a disposer; disposed
 * with the calling fiber.
 * @param provider - the provider; its `id` is the registry key.
 * @returns the disposer that unregisters the provider.
 */
registerFetchProvider(provider: WebFetchProvider): () => void

/**
 * Run one search through the selected provider. Resolves the provider at call
 * time with the selection rules above; throws {@link WebError} when the
 * capability cannot run. The seam enforces `request.maxResults` on the result:
 * if the provider over-returns, `sources[]` is truncated and `truncated` set.
 * @param request - the query and optional result limit.
 * @param signal - optional cancellation signal forwarded to the provider.
 * @returns the provider's results, capped to `request.maxResults`.
 */
async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>

/**
 * Retrieve one URL through the selected provider. Resolves the provider at
 * call time with the selection rules above; throws {@link WebError} when the
 * capability cannot run. A non-2xx response is a result, not a throw.
 * @param request - the URL plus retrieval options.
 * @param signal - optional cancellation signal forwarded to the provider.
 * @returns the retrieval outcome; non-2xx responses resolve descriptively.
 */
async fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult>
```

Source: [`packages/web/web/src/index.ts`](../../packages/web/web/src/index.ts)
<!-- END GENERATED cordis-surface -->
