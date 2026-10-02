# LSP-Navigation

[English](lsp.md) | [中文](lsp.zh.md) | Deutsch

Der LSP-Seam — ein [Capability Seam](../glossary.de.md#capability-seam), der semantische Code-Navigation über einen einzigen `ctx.lsp`-Service bereitstellt und auf mehrere Packages aufgeteilt ist: Service Definition ([dsh-lsp](../../packages/lsp/lsp), `ctx.lsp` + die Provider-Registry), ein generischer Service Provider ([dsh-lsp-stdio](../../packages/lsp/lsp-stdio), ein konfigurierter stdio-Language-Server-Host) und Consumer ([dsh-tool-lsp](../../packages/lsp/tool-lsp), das `lsp`-Tool-Schema). LSP ist **eine optionale Capability**, nicht Teil der Agent-Loop-Spine — deshalb lebt sein Vokabular hier und nicht in [core.md](core.de.md). Ein Provider-Wechsel ändert nichts daran, wie das Modell Navigation anfordert.

Quelle: [`packages/lsp/lsp/src/types.ts`](../../packages/lsp/lsp/src/types.ts)

## Operationen und Koordinaten

Der Seam und das Modell stellen genau vier semantische Abfragen bereit; die Union ist geschlossen, daher erzwingt eine neue Operation eine Compile-erzwungene Änderung über Seam, Provider und Tool hinweg. Positionen und Bereiche sind nullbasierte UTF-16-Koordinaten wie im Protokoll; das modellseitige Tool besitzt die einsbasierte Cursor-Konvention und konvertiert bei Ein- und Ausgabe.

```ts type-equiv
/**
 * The four semantic queries the seam and model expose. A closed union: adding an operation is a
 * compile-enforced change across the seam, providers, and the tool. Symbols and call hierarchy are
 * not operations here; they need different schemas.
 */
type LspOperation = 'goToDefinition' | 'findReferences' | 'goToImplementation' | 'hover'
```

```ts type-equiv
/** A zero-based UTF-16 cursor coordinate, matching the LSP wire convention. */
interface LspPosition {
  /** Zero-based line. */
  readonly line: number
  /** Zero-based UTF-16 code-unit offset within the line. */
  readonly character: number
}
```

```ts type-equiv
/** A zero-based UTF-16 half-open range `[start, end)`. */
interface LspRange {
  readonly start: LspPosition
  readonly end: LspPosition
}
```

## Anfrage

Jedes Feld ist erforderlich: `workspaceRoot` liefert der Aufrufer, `languageId` kommt aus der Provider-Registrierung (nicht aus der Anfrage), und Timeouts sowie Ergebnislimits gehören den Consumern — kein Feld braucht also implementierungsseitige Defaults, und es gibt keinen `resolve()`-Schritt. Der Provider erhält die Aufruferanfrage plus das abgeleitete `languageId`, das nur das transiente Dokument synchronisiert und niemals an der Auswahl beteiligt ist.

```ts type-equiv
/**
 * A caller's normalized query. Every field is required: `workspaceRoot` is caller-supplied,
 * `languageId` comes from the provider registration (not here), and consumers own timeouts and
 * result limits — so no field needs implementation defaulting and there is no `resolve()` step.
 */
interface LspQueryRequest {
  /** Which semantic query to run. */
  readonly operation: LspOperation
  /** The source file to query (relative to `workspaceRoot` or absolute; the provider canonicalizes). */
  readonly filePath: string
  /** The zero-based UTF-16 cursor position to query at. */
  readonly position: LspPosition
  /** The workspace root the provider resolves against and indexes; required, never defaulted. */
  readonly workspaceRoot: string
}
```

```ts type-equiv
/**
 * A request as a provider receives it: the caller's {@link LspQueryRequest} plus the `languageId`
 * the seam derived from the provider's extension mapping. The language id only synchronizes the
 * transient document; it does not participate in selection.
 */
interface LspProviderQuery extends LspQueryRequest {
  /** The LSP language id for `filePath`, from this provider's extension mapping. */
  readonly languageId: string
}
```

## Ergebnis

Eine geschlossene diskriminierte Union: Navigationsoperationen normalisieren zu `locations`, `hover` zu Inhalt oder `null`. Consumer schalten per `switch` auf `kind` bis zur Erschöpfung, sodass ein neuer Zweig die Kompilierung bricht, bis er behandelt ist. `findReferences` enthält immer Deklarationen — der Provider erzwingt das intern, Aufrufer bekommen also kein Flag. Die `locations`-Variante trägt `resolvedWorkspaceUri`, die kanonische Workspace-`file:`-URI des Providers. Ein Aufrufer, der Location-URIs relativiert, verwendet diese Koordinate, statt Host-Plattform-Pfadregeln auf den möglicherweise symlink-behafteten Request-Root anzuwenden.

```ts type-equiv
/** One resolved location: a document URI and the range within it. */
interface LspLocation {
  /** The target document URI (`file:` or otherwise), verbatim from the server. */
  readonly uri: string
  /** The range within the target document. */
  readonly range: LspRange
}
```

```ts type-equiv
/** Normalized hover content, or `null` for no hover at the position. */
interface LspHover {
  /** The normalized hover text (markdown or plaintext, provider-joined). */
  readonly contents: string
  /** The range the hover applies to, when the server supplied one. */
  readonly range?: LspRange
}
```

```ts type-equiv
/**
 * The closed result union. Navigation operations (`goToDefinition`, `findReferences`,
 * `goToImplementation`) normalize to `locations`; `hover` normalizes to content or `null`.
 * Consumers `switch` on `kind` to exhaustiveness so a new arm breaks compilation until handled.
 *
 * The `locations` variant carries `resolvedWorkspaceUri`: the provider's canonical `file:` URI for
 * the request's workspace root. A caller that relativizes location URIs MUST use this, not parse the
 * request's possibly symlinked process path with host-platform rules; the execution platform may
 * differ from the caller's.
 */
type LspQueryResult =
  | { readonly kind: 'locations'; readonly locations: readonly LspLocation[]; readonly resolvedWorkspaceUri: string }
  | { readonly kind: 'hover'; readonly hover: LspHover | null }
```

## Provider und Service

Ein Provider besitzt eine stabile gebrandete `id` und eine exklusive Map von kleingeschriebenen Extensions mit führendem Punkt. `registerProvider` reserviert die id und jede Extension atomar — eine ungültige oder konfliktbehaftete Registrierung publiziert nichts — und ihr Disposer gibt alle Reservierungen frei. Die Auswahl erfolgt pro Abfrage und ist reihenfolgeunabhängig; ohne Treffer wird `LspError` `LSP_UNAVAILABLE` geworfen. Der Seam stellt keine Protokolltypen, Prozess-/Dokumentsteuerung oder generische JSON-RPC-Escape-Luke bereit.

```ts type-equiv
/**
 * A language-server backend registered on `ctx.lsp`. Each provider owns a stable {@link
 * LspProviderId} and an extension-to-language-id map (lowercase, leading-dot keys).
 * `findReferences` always includes declarations — the provider enforces this internally; callers
 * get no flag.
 */
interface LspProvider {
  /** Stable provider identity, reserved atomically with the extension mappings. */
  readonly id: LspProviderId
  /** Lowercase leading-dot extension → LSP language id (e.g. `{ '.ts': 'typescript' }`). */
  readonly extensionToLanguage: Readonly<Record<string, string>>
  /**
   * Run one query. The seam has already selected this provider and derived `languageId`.
   * @param request - the resolved provider query (caller request + derived language id).
   * @param signal - optional cancellation; the provider stops its own work when it aborts.
   * @returns the normalized, closed-union result.
   */
  query(request: LspProviderQuery, signal?: AbortSignal): Promise<LspQueryResult>
}
```

```ts type-equiv
/**
 * The LSP capability seam (`ctx.lsp`). Owns provider registration/selection and normalized query
 * execution; exposes exactly the four operations and no protocol escape hatch.
 */
interface LspService {
  /**
   * Register a provider, atomically reserving its id and every normalized extension. Any conflict
   * or invalid input publishes nothing and throws `LspError`; the returned disposer releases all
   * reservations. Disposed with the calling fiber.
   * @param provider - the backend to register.
   * @returns a synchronous disposer releasing the id and all extension reservations.
   */
  registerProvider(provider: LspProvider): () => void
  /**
   * Select a provider by the file's extension and run one query. Selection is per-query and
   * order-independent; no match throws `LspError` `LSP_UNAVAILABLE`.
   * @param request - the normalized query.
   * @param signal - optional cancellation forwarded to the selected provider.
   * @returns the normalized, closed-union result.
   */
  query(request: LspQueryRequest, signal?: AbortSignal): Promise<LspQueryResult>
}
```

`LspProviderId` ist die gebrandete id des Seams (`Branded<'LspProviderId'>` aus [dsh-brand](../../packages/util/brand)); `LspError` erweitert `HarnessError` um stabile Codes wie `LSP_INVALID_PROVIDER`, `LSP_CONFLICT`, `LSP_UNAVAILABLE`, `LSP_DISPOSED`, `LSP_UNSUPPORTED_OPERATION` und `LSP_MALFORMED_RESPONSE`, auf die Aufrufer routen, statt `message` zu parsen.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.de.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxlsp--lspservice"></a>

### `ctx.lsp` — `LspService`

The LSP capability seam (`ctx.lsp`). Owns provider registration/selection and normalized query execution; exposes exactly the four operations and no protocol escape hatch.

```ts cordis-catalog
/**
 * Register a provider, atomically reserving its id and every normalized extension. Any conflict
 * or invalid input publishes nothing and throws `LspError`; the returned disposer releases all
 * reservations. Disposed with the calling fiber.
 * @param provider - the backend to register.
 * @returns a synchronous disposer releasing the id and all extension reservations.
 */
registerProvider(provider: LspProvider): () => void

/**
 * Select a provider by the file's extension and run one query. Selection is per-query and
 * order-independent; no match throws `LspError` `LSP_UNAVAILABLE`.
 * @param request - the normalized query.
 * @param signal - optional cancellation forwarded to the selected provider.
 * @returns the normalized, closed-union result.
 */
query(request: LspQueryRequest, signal?: AbortSignal): Promise<LspQueryResult>
```

Source: [`packages/lsp/lsp/src/types.ts`](../../packages/lsp/lsp/src/types.ts)
<!-- END GENERATED cordis-surface -->
