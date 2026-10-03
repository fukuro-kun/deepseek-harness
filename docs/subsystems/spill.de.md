# Spill-Speicher
[English](spill.md) | [中文](spill.zh.md) | Deutsch


Der Spill-Speicher-[Fähigkeits-Seam](../../.agents/notes/implemented/architecture/2026-07-08-tool-output-spill-files.de.md) hält aufruferseitig gelieferten Text persistent vor und gibt einen modellseitigen Locator mit Abrufhinweis zurück. Seine Service Definition ist [dsh-spill](../../packages/spill/spill) (`ctx.spillStore`), sein lokaler Service Provider ist [dsh-spill-local](../../packages/spill/spill-local). Konsumenten sind die [Tool-Result-Richtlinie](../../packages/spill/spill-policy) und [Sitzungsreferenzen](../../packages/context/session-reference/README.de.md). Spill ist optional und nicht Teil des [Agent-Loop-Spine](core.de.md); Vorschau- und Spill-Entscheidungen liegen bei den Konsumenten, während der Speicher den gelieferten Text unverändert ablegt.

Quelle: [`packages/spill/spill/src/types.ts`](../../packages/spill/spill/src/types.ts)

## Die Speicheranfrage

`saveText` ist die einzige Dienstoperation: `content` unverändert persistieren und einen opaken Locator, einen backendseitigen Abrufhinweis und die exakte Bytezahl zurückgeben. Die Anfrage trägt den Speicher-Namensraum zum Zeitpunkt des Speicherns (`owner`), die beschreibende Herkunft des Erzeugers (`source`, niemals Zugriffskontrolle) und einen `suggestedName`, den das Backend als Namenshinweis nutzen darf, nicht als Pfad. Werkzeug-Herkunft identifiziert den tatsächlichen Werkzeugaufruf; Sitzungsreferenz-Herkunft identifiziert die erfasste Quellsitzung, während ihr Owner die Zielsitzung ist, die den Kontext erhält.

```ts type-equiv
/** One request to persist text to a spill artifact. */
interface SaveTextSpill {
  owner: SpillOwner
  source: SpillSource
  /**
   * A caller-suggested base name (e.g. `web_fetch.txt`). The backend sanitizes
   * it to a single safe path segment before use — it is a hint, never a path.
   */
  suggestedName: string
  /** The full text to persist (UTF-8). */
  content: string
}
```

```ts type-equiv
/**
 * Save-time storage namespace for a spilled artifact. The session id lets a
 * backend group storage under the producing session, but the returned
 * {@link SpillLocator} is the model-facing handle. Forked sessions inherit
 * locators already present in the seeded log; those artifacts are not copied or
 * re-owned, and spills produced after the fork use the child session id.
 */
interface SpillOwner {
  sessionId: SessionId
}
```

Eine Bereinigung nach Aufbewahrungsfrist kann alte Locator zusammen mit anderen alten Sitzungsartefakten verfallen lassen; der Spill-Seam definiert keine sitzungsbezogene Bereinigungsrichtlinie.

```ts type-equiv
/**
 * Producer of a spilled artifact. Tool results carry their model-issued call id;
 * session references identify the captured source session instead. Descriptive
 * provenance only, never access control.
 */
type SpillSource = {
  kind: 'tool'
  /** The tool whose result was spilled (e.g. `web_fetch`). */
  toolName: string
  /** The model-issued call id the result belongs to. */
  callId: ToolCallId
  /** A short human label for the artifact (e.g. `result`). */
  label: string
} | {
  kind: 'session-reference'
  /** Session whose projected conversation was captured. */
  sessionId: SessionId
  /** Host-provided label for the referenced session. */
  label: string
}
```

## Das Ergebnis

```ts type-equiv
/** A saved spill artifact: its locator, byte length, and backend-specific retrieval guidance. */
interface SpillRef {
  locator: SpillLocator
  bytes: number
  retrievalHint: string
}
```

`SpillLocator` ist ein [gebrandetes](core.de.md#branded-ids), modellseitiges Handle, das das Backend zurückgibt. Das lokale Backend rendert es als Dateisystempfad; ein Remote- oder Datenbank-Backend kann eine URI, einen Schlüssel oder ein Befehls-Token rendern. Konsumenten behandeln es als opak und rendern es mit `retrievalHint`, statt anzunehmen, dass `read` immer der richtige Abrufmechanismus ist.

```ts type-equiv
/**
 * Opaque model-facing handle for one spilled artifact. A local backend may use a
 * filesystem path; a remote or database backend may use a URI or key. Consumers
 * render it with {@link SpillRef.retrievalHint}, but do not parse it.
 */
type SpillLocator = Branded<'SpillLocator'>
```

## Der Dienst

`SpillStore` (`ctx.spillStore`, definiert in [`packages/spill/spill/src/index.ts`](../../packages/spill/spill/src/index.ts)) ist ein abstrakter Dienst mit einer Methode: `saveText(input) → Promise<SpillRef>`. Er persistiert den vollständigen `content` und REJEKTIERT bei einem echten Speicherfehler (Berechtigungen, ENOSPC, Backend nicht verfügbar). Der Seam besitzt nur die Speicherung: keine Aufbewahrungsrichtlinie, keinen Tool-Result-Ersatz, keine Abruf-/Such-API.

Das lokale Backend ([dsh-spill-local](../../packages/spill/spill-local)) schreibt unter `<root>/session-<hash>/<random>-<safeName>` — ein konfiguriertes oder träge angelegtes privates (0700) Wurzelverzeichnis, ein `sha256(sessionId)`-Sitzungsunterverzeichnis und einen exklusiven, nur dem Owner zugänglichen Schreibvorgang (`open(path, 'wx', 0o600)`), sodass ein platzierter Symlink ihn nicht umleiten kann. Sein `locator` ist der lokale Pfad, und sein `retrievalHint` weist das Modell an, `read` oder `grep` auf diesem Pfad zu verwenden. Der Richtlinien-Konsument ([dsh-spill-policy](../../packages/spill/spill-policy)) ersetzt ein `maxInlineBytes` überschreitendes reines Text-Endergebnis durch eine Head/Tail-Vorschau aus der Retention-Bibliothek plus die Spill-Referenz — best-effort: Ein Speicherfehler behält das ursprüngliche Inline-Ergebnis bei, statt einen erfolgreichen Aufruf in ein `isError` zu verwandeln.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.de.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxspillstore--spillstore-abstract-seam"></a>

### `ctx.spillStore` — `SpillStore` (abstract seam)

Abstract spill storage service. Subclass, implement saveText, and load the subclass as a plugin — it registers as `ctx.spillStore` (one implementation per context; loading a second throws, cordis' standard duplicate-service behavior).

Semantics every implementation must honor:

- saveText persists the FULL `content` verbatim and returns an opaque locator, exact byte length, and model-facing retrieval guidance.
- Storage is scoped by the request's SaveTextSpill.owner session; the backend chooses a private (not world-readable) location and a collision-free name derived from — never equal to — the caller's `suggestedName`.
- `saveText` REJECTS on a real storage failure (permissions, ENOSPC, backend unavailable); the caller decides how to degrade (the spill policy treats a rejection as best-effort and keeps the inline result).

```ts cordis-catalog
/**
 * Persist `input.content` to a session-scoped spill artifact.
 * @param input - the owner, caller-supplied source fields, suggested name, and full text to save.
 * @returns the saved artifact's {@link SpillRef}; rejects on a storage failure.
 */
abstract saveText(input: SaveTextSpill): Promise<SpillRef>
```

Source: [`packages/spill/spill/src/index.ts`](../../packages/spill/spill/src/index.ts)
<!-- END GENERATED cordis-surface -->
