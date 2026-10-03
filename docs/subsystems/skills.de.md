# Skills
[English](skills.md) | [中文](skills.zh.md) | Deutsch


Die [Skill-Capability-Familie](../../packages/skill) umfasst die Service Definition ([dsh-skill](../../packages/skill/skill), `ctx.skills`), den lokalen Service Provider ([dsh-skill-filesystem](../../packages/skill/skill-filesystem)), den optionalen paketierten Badge-Provider ([dsh-skill-badge](../../packages/skill/skill-badge)) und den Consumer ([dsh-tool-skill](../../packages/skill/tool-skill)). Die Registry mergt Provider-Kataloge über ihre Host- und Per-Scope-Ebenen hinweg; Provider liefern lokale oder paketierte Skills; der Consumer besitzt die initialen und Ersatzkataloge sowie das modellseitige `skill`-Tool. Skills sind optionale Anweisungen, keine Session-Events, daher lebt ihr Vokabular hier und nicht in [core.md](core.de.md).

Quelle: [`packages/skill/skill/src/index.ts`](../../packages/skill/skill/src/index.ts), [`packages/skill/skill-filesystem/src/index.ts`](../../packages/skill/skill-filesystem/src/index.ts), [`packages/skill/skill-badge/src/index.ts`](../../packages/skill/skill-badge/src/index.ts) und [`packages/skill/tool-skill/src/index.ts`](../../packages/skill/tool-skill/src/index.ts).

## Provider-Registry

`ctx.skills` kombiniert lokale, eingebettete, Remote- oder andere Provider. Die Registrierung ist synchron; Remote-Initialisierung und -Discovery gehören in ein awaited `list()`. Provider-Objekte, Optionen und Kandidaten werden readonly geliehen, während semantische Felder validiert werden.

Die Registry ist in Host- und Per-Scope-Ebenen geschichtet — die Form, die die [Tools-Registry](tools.de.md) über [dsh-scope](../../packages/core/scope) etabliert hat: Eine Registrierung fällt in die Ebene des Scopes ihres aufrufenden Kontexts, sodass Host-Zeilen und Repository-Plugins in der globalen Ebene landen, während ein Plugin, das von der stehenden Komposition eines Agent-Presets gemountet wird, in der Ebene dieses Presets landet; Provider-Namen sind pro Ebene eindeutig, nicht prozessweit. Eine Leseoperation mergt die globale Ebene mit der Kette des betrachtenden Scopes — der Eintrag der nächstgelegenen Ebene gewinnt einen doppelten Skill-Namen direkt, und die unten stehende Rangfolge entscheidet Duplikate nur innerhalb einer Ebene. Discovery-Caches sind über die aufgelöste Scope-Kette gekeyed, sodass ein Re-Parenting eines Scopes (eine Blank-Session-Recompose) für den nächsten Lesevorgang ohne Registry-Mutation sichtbar ist.

Innerhalb einer Ebene werden doppelte Namen nach Rang, Provider-Reihenfolge und dann lokaler Reihenfolge aufgelöst; Summaries sortieren nach Name. Ein rejected `list()` wird geloggt und aus einer unvollständigen Observation weggelassen, während eine explizit unvollständige Observation nutzbare Kandidaten beiträgt, ohne das Ergebnis cachebar zu machen; fehlerhafte Kandidaten schlagen sofort fehl. Jede Provider-Factory erhält ein registrierungsgebundenes Control, dessen `invalidate()` abgeschlossene Kataloge nur leert, solange genau diese Registrierung aktiv bleibt, und dessen Signal bei fehlgeschlagener Registrierung oder bei Dispose abbricht. Eine laufende Discovery wiederholt sich einmal, wenn sich ihre Provider-Generation ändert; eine zweite Änderung liefert die neuesten Kandidaten unvollständig und uncached zurück. Provider- und Runtime-Mutationen emittieren das ungefilterte Invalidierungs-Event `skills/change`; es trägt keinen Diff, daher holen Consumers `snapshot()` mit ihren eigenen Lookup-Optionen erneut ab.

Ein von `SkillProvider.list()` zurückgegebenes Array ist die Kurzform für vollständige Discovery. `SkillProviderObservation` erlaubt einem Provider, Kandidaten offenzulegen, die direkt ladbar bleiben, während er meldet, dass die Observation nicht autoritativ ist.

```ts type-equiv
/** Provider candidates plus whether the current discovery is authoritative. */
interface SkillProviderObservation {
  /** Candidates available from the current provider discovery. */
  readonly candidates: readonly SkillCandidate[]
  /** Whether discovery completed and these candidates may be cached. */
  readonly complete: boolean
}
```

```ts type-equiv
/** Provider interface for one source of skills, such as local directories or a remote registry. */
interface SkillProvider {
  /** Unique provider name in the `ctx.skills` registry. */
  readonly name: string
  /**
   * List available skill candidates for the current lookup context. Provider
   * plugins register synchronously during `apply()`; remote initialization,
   * authentication, and discovery are awaited inside this method. Implementations
   * should settle promptly when `options.signal` aborts.
   * @param options - lookup options; `cwd` selects workspace-sensitive skills and `signal` cancels work.
   * @returns provider candidates as a complete-array shorthand, or an explicit
   *   observation when usable candidates came from incomplete discovery.
   */
  readonly list: (options: SkillLookupOptions) => Promise<readonly SkillCandidate[] | SkillProviderObservation>
  /**
   * Load a complete skill body for a previously listed candidate.
   * @param candidate - the winning candidate originally returned by this provider.
   * @param options - lookup options; `cwd` selects workspace-sensitive skills and `signal` cancels work.
   * @returns the full skill body, or `undefined` if it is no longer loadable.
   */
  readonly get: (candidate: SkillCandidate, options: SkillLookupOptions) => Promise<SkillDefinition | undefined>
}
```

```ts type-equiv
/** Registration-scoped lifecycle and invalidation capability borrowed by one provider. */
interface SkillProviderControl {
  /** Aborts if registration fails or when the exact provider registration is disposed. */
  readonly signal: AbortSignal
  /** Invalidate completed catalogs and notify consumers only while the exact registration remains active. */
  readonly invalidate: () => void
}
```

## Lokale Discovery-Priorität

Der mitgelieferte lokale Provider scannt Roots in Rangfolge:

| Rank | Source | Root |
|---|---|---|
| 100 | `project-dsh` | `<projectRoot>/.dsh/skills` |
| 200 | `project-agents` | `<projectRoot>/.agents/skills` |
| 300 | `custom` | `Config.customSkillDirs` |
| 400 | `user-dsh` | `<dshHome>/skills` |
| 500 | `user-agents` | `<agentsHome>/skills` |
| 600 | `bundled` | `Config.bundledSkillDir` when configured |

Der Projekt-Root ist der nächste Vorfahre, der `.git` enthält; ohne einen solchen wird das aktuelle cwd verwendet. Wenn `ctx.fs` verfügbar ist, tastet der Git-Root-Walk `.git` über den Filesystem-Service ab, damit Remote- oder gesandboxte Workspaces nicht auf die Host-Dateisystemgrenze zurückfallen. Der User-DSH-Root überspringt sein `.system`-Kind. Der lokale Provider synthetisiert keine eingebauten System-Skills; Deployments stellen paketierte Skills über konfigurierte Bundled-Roots oder dedizierte Provider bereit.

`dsh-skill-badge` registriert einen unveränderlichen `bundled`-Kandidaten bei `BUNDLED_SKILL_RANK` und legt sein paketiertes Asset-Verzeichnis über `resourceBase` offen. Die ausgelieferte CLI deklariert das Plugin als deaktiviert, daher ist das Aktivieren seiner Kompositionszeile ein explizites Opt-in.

Chokidar beobachtet existierende Roots auf direkte Bundle-/Flat-Entry-Hinzufügungen und -Entfernungen sowie direkte Skill-Entry-Änderungen. Ein fehlender Root wird vom nächsten existierenden Vorfahren aus ein fehlendes Pfadsegment nach dem anderen verfolgt, bis Chokidar anhängen kann. Ressourcendateien unterhalb eines Bundles sind keine Katalogänderungen. Modellseitige `write`- und `edit`-Observations invalidieren den Provider synchron, wenn ihr Ziel katalogrelevant ist, während der Host-Watcher IDE-, Git-, Shell- und externe Prozess-Mutationen abdeckt. Watcher-Fehler machen die aktuelle Observation unvollständig, ohne lesbare Kandidaten vor direkten Loads zu verbergen; projekt-scoped Watcher nutzen eine konfiguriert begrenzte LRU.

## Skill-Identität

Skill-Namen sind kebab-case (`^[a-z0-9]+(?:-[a-z0-9]+)*$`). Der lokale Provider akzeptiert Verzeichnis-Bundles (`<name>/SKILL.md`) und flache Markdown-Dateien (`<name>.md`). Verschachtelte rekursive `**/SKILL.md`-Discovery wird nicht unterstützt.

```ts type-equiv
/** Origin bucket for a skill contribution. The value is prompt-visible metadata, not precedence by itself. */
type SkillSource = 'project-dsh' | 'project-agents' | 'runtime' | 'user-dsh' | 'user-agents' | 'custom' | 'bundled' | (string & {})
```

## Summaries, Kandidaten und vollständige Definitionen

`SkillSummary` ist die aufrufneutrale Summary-Form der Registry. Consumers wählen, welche Einträge und Felder sie rendern; der Model-Session-Katalog nutzt nur `name` und `description` model-invocable Skills, niemals den Body oder den absoluten Dateipfad. `SkillInvocationPolicy` normalisiert die zwei unabhängigen Invocation-Controls zu positiven Booleans, und jede aufgelöste Summary, jeder Kandidat und jede Definition trägt sie, ohne beliebiges Frontmatter zum Domänenmodell zu machen.

```ts type-equiv
/** Invocation controls shared by skill discovery consumers. */
interface SkillInvocationPolicy {
  /** Whether model-facing catalogs and loaders include this skill. */
  readonly modelInvocable: boolean
  /** Whether human-facing command catalogs and loaders include this skill. */
  readonly userInvocable: boolean
}
```

```ts type-equiv
/** Invocation-neutral skill metadata returned by `ctx.skills.list()`. */
interface SkillSummary {
  /** Kebab-case identifier used to address the skill. */
  readonly name: string
  /** Short routing description shown by discovery consumers. */
  readonly description: string
  /** Optional extra routing guidance. */
  readonly whenToUse?: string
  /** Resolved model and user invocation controls. */
  readonly invocation: SkillInvocationPolicy
  /** Discovery source that produced this winning skill. */
  readonly source: SkillSource
  /** Provider that owns this skill body. */
  readonly provider: string
  /** Provider-specific base for relative resources. */
  readonly resourceBase?: SkillResourceBase
}
```

`ctx.skills.list()` erhält alle vier Policy-Kombinationen. `isModelInvocable(skill)` und `isUserInvocable(skill)` lesen das jeweilige Pflichtfeld. Ein reines Model-Skill setzt `{ modelInvocable: true, userInvocable: false }`, ein reines User-Skill setzt `{ modelInvocable: false, userInvocable: true }`, und beide Felder auf `false` lassen das Skill nur über vertrauenswürdige `ctx.skills.get()`-Aufrufer verfügbar. Der lokale Provider liest die exakt passenden kebab-case-Frontmatter-Keys `disable-model-invocation` und `user-invocable`, defaulted ausgelassene Felder auf `true` und projiziert jedes geparste Skill in diese normalisierte Policy.

`SkillCatalogSnapshot` unterscheidet autoritative Abwesenheit von transientem Provider-Versagen oder einem Katalog, der sich während der Discovery weiter verändert hat. `skills` enthält die in dieser Observation gesammelten sortierten aufrufneutralen Summaries; `complete` ist nur dann true, wenn jeder registrierte Provider ohne konkurrierende Katalogrevision abgeschlossen hat. Unvollständige Snapshots werden nicht gecacht, sodass jeder Consumer seinen letzten guten gefilterten Katalog behalten und es erneut versuchen kann.

```ts type-equiv
/** One catalog observation plus whether discovery completed within a stable catalog revision. */
interface SkillCatalogSnapshot {
  /** Sorted invocation-neutral summaries collected in this observation. */
  readonly skills: SkillSummary[]
  /** Whether every registered provider completed without a concurrent catalog revision. */
  readonly complete: boolean
}
```

`SkillCandidate` ist die Provider-zu-Registry-Form. `locator` ist opaker Provider-State; die Registry speichert ihn nur und reicht ihn an das `get()` des gewinnenden Providers zurück.

```ts type-equiv
/** Provider catalog entry used by the registry to merge and later load skills. */
interface SkillCandidate extends SkillSummary {
  /** Lower ranks win duplicate skill names before provider registration order is considered. */
  readonly rank: number
  /** Opaque provider-owned handle passed back to `provider.get()`. */
  readonly locator: unknown
  /** Absolute file path when the provider has one. */
  readonly path?: string
  /** Parsed optional metadata object from provider-specific skill frontmatter. */
  readonly metadata?: Readonly<Record<string, unknown>>
}
```

`SkillDefinition` ist das vollständige geparste Ergebnis, das `ctx.skills.get()` zurückgibt und das das `skill`-Tool verwendet. `resourceBase` sagt dem Tool, wie es Relative-Resource-Guidance für lokale, URL- oder provider-verwaltete Skills rendert.

```ts type-equiv
/** Optional provider-specific base used by loaded skill bodies to resolve relative resources. */
type SkillResourceBase =
  | { readonly kind: 'directory'; readonly path: string }
  | { readonly kind: 'url'; readonly url: string }
  | { readonly kind: 'opaque'; readonly description: string }
```

```ts type-equiv
/** Complete parsed skill definition, including the body loaded by `ctx.skills.get()`. */
interface SkillDefinition extends SkillSummary {
  /** Markdown instruction body after any provider-specific metadata removal. */
  readonly content: string
  /** Absolute file path when the skill came from disk. */
  readonly path?: string
  /** Parsed optional metadata object from frontmatter. */
  readonly metadata?: Readonly<Record<string, unknown>>
}
```

Runtime-Skill-Eingaben dürfen Invocation-Controls und das Provider-Label auslassen. Die Registry löst beide Defaults einmal auf und nutzt dann dieselbe vollständige Definitionsform und First-Wins-Sammelreihenfolge wie Provider. Der zurückgegebene Disposer entfernt den Beitrag und invalidiert Discovery-Caches.

```ts type-equiv
/** Runtime skill contribution accepted by `ctx.skills.register()`. */
type SkillRegistration = Omit<SkillDefinition, 'invocation' | 'provider'> & {
  /** Invocation controls; omission permits both model and user surfaces. */
  readonly invocation?: SkillInvocationPolicy
  /** Provider label; omission uses the registry-owned runtime provider. */
  readonly provider?: string
}
```

## Lookup und Konfiguration

Skill-Lookup ist cwd-sensitiv, weil Provider workspace-lokale Skills offenlegen können, und sein optionales Signal bricht Provider-Arbeit für den Aufrufer ab. Registry-Lesevorgänge nehmen zusätzlich den betrachtenden Scope — Consumers übergeben den aufrufenden Agent, der sein eigener Scope-Key ist — über `SkillViewOptions`; die Registry konsumiert `scope` zur Ebenenauswahl, und Provider lesen aus demselben geliehenen Optionsobjekt nur ihren `SkillLookupOptions`-Kontrakt. Cancellation wird vor und nach der Katalogauswahl geprüft, einschließlich Cache-Treffern, und raced gegen Discovery und das Laden vollständiger Definitionen. Wird kein Git-Root gefunden, behandelt der lokale Provider das gelieferte cwd selbst als Projekt-Root.

Vollständige Definitionen werden von der Registry nicht gecacht. Jedes `get()` ruft den gewinnenden Provider mit dem ausgewählten Kandidaten auf, sodass der lokale Provider den aktuellen Body neu liest. Eine Definition, deren Name nicht mehr zu diesem Kandidaten passt, wird abgelehnt und invalidiert genau diesen Provider zur Wiederentdeckung.

```ts type-equiv
/** Caller context used for cwd-sensitive and abortable provider work. */
interface SkillLookupOptions {
  /** Workspace selector for the current lookup. */
  readonly cwd?: string | undefined
  /** Abort discovery or loading work for the current caller. */
  readonly signal?: AbortSignal | undefined
}
```

```ts type-equiv
/**
 * Registry read options: provider lookup context plus the viewing scope.
 * The registry consumes `scope` to select layers; providers receive the same
 * borrowed options object and read only their {@link SkillLookupOptions}
 * contract from it.
 */
interface SkillViewOptions extends SkillLookupOptions {
  /** Viewing scope (the calling agent); omitted reads the global layer alone. */
  readonly scope?: ScopeKey | undefined
}
```

Die Registry besitzt nur ihre Discovery-Cache-Obergrenze. Der lokale Provider besitzt Dateisystem-Roots (`dshHome`, `agentsHome`, `customSkillDirs` sowie optional `bundledSkillDir`/`DSH_BUNDLED_SKILL_DIR`) plus Watcher-Aktivierung, Polling-, Stabilitäts-, Symlink- und Projektkapazitäts-Controls. Der Consumer besitzt seine Katalog-Description-Obergrenze. Exakte Defaults und Validierung stehen im generierten [Config-Katalog](../config-catalog.de.md).

```ts type-equiv
/** Skill registry configuration. */
interface Config {
  /** Maximum number of completed cwd/provider catalogs kept in memory. */
  readonly collectCacheMaxEntries?: number
}
```

## Session-Katalog und Tool-Kontrakt

`dsh-tool-skill` injiziert beim ersten `agent/pre-step` einer live Session, die eine nicht-leere vollständige View beobachtet, den initialen durable User-Role-`<system-reminder>`. Der Katalog enthält nur sortierte Skill-`name` und normalisierte, XML-escapte `description`; er lässt Bodies, Pfade, Sources, Provider und Routing-Hints weg. Die Discovery reicht das Abort-Signal des Steps über `SkillLookupOptions` weiter. `catalogDescriptionMaxLength` ist die Consumer-Config für die Description-Obergrenze, mit Default `500` und Integer-Minimum `3`.

Vor jedem späteren Model-Step wendet der Consumer die exakte Tool-Sichtbarkeit an und berechnet einen Digest der exakt gerenderten Einträge zwischen den `<available_skills>`-Tags aus einem vollständigen Snapshot. Er leitet die Vergleichsbasis aus denselben Einträgen in der neuesten erkennbaren sichtbaren Katalog-Message ab, die vom Plugin stammt. Ein geänderter Digest hängt über `agent.inject()` einen durable vollständigen Ersatz an; das Löschen aller Skills hängt einen expliziten leeren Ersatz an. Unvollständige Snapshots bewahren die letzte gute Model-View. Wenn Compaction jede historische Katalog-Message verbirgt, stellt der nächste vollständige Snapshot den aktuellen Katalog wieder her; eine leere View ohne vorherigen Katalog emittiert nichts. Diese Katalog-Messages sind Session-Historie, nicht World State.

Das modellseitige `skill({ name })`-Tool validiert den kebab-case-Namen, findet die Summary im aufrufneutralen Katalog, lehnt sie vor dem Laden ab, sofern `isModelInvocable` den Zugriff nicht erlaubt, liest dann die vollständige Definition für das cwd des aufrufenden Agent erneut und prüft die Policy vor der Rückgabe des Inhalts nochmals. Es meldet ein unauflösbares Skill als unbekannt oder nicht mehr verfügbar und liefert ein Tool-Result mit `<skill_content name="...">`, `<skill_resources>` und `<skill_instructions>`. `resourceBase` löst explizit referenzierte Skripte, Referenzen und Assets nur bei Bedarf auf; das geladene Ergebnis enumeriert kein Skill-Verzeichnis. Nur-Body-Änderungen ändern daher spätere Tool-Calls, ohne Katalog-Messages zu erzeugen oder frühere Tool-Results umzuschreiben.

## Browser-Session-Katalog

`SkillListRequest` adressiert eine Session über `sessionId`; `SkillListValue` gibt die user-invocable Einträge mit Name, Description, optionalem Nutzungshinweis und Model-Invocation-Verfügbarkeit zurück. `SessionSkillCatalog` liest das Session-cwd und das aufgezeichnete Preset, ohne einen Agent zu aktivieren. Ein live Agent kann seine gescopete Registry liefern, während eine kalte Session den stehenden Scope des Presets nutzt.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.de.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsessionskillcatalog--sessionskillcatalog"></a>

### `ctx.sessionSkillCatalog` — `SessionSkillCatalog`

Host service backing `ctx.remote.skills` without activating a cold Agent.

```ts cordis-catalog
/**
 * List the user-invocable skills visible to one Session composition.
 * @param request - Session identity whose cwd and preset select the catalog view.
 * @param signal - caller lifetime carried by the Remote transport; admitted catalog reads retain their existing completion semantics.
 * @returns user-invocable skill metadata without loading skill bodies.
 * @throws RemoteError when the Session cannot be inspected or no registry can serve it.
 */
@Remote async list(request: SkillListRequest, signal: AbortSignal): Promise<SkillListValue>
```

Source: [`packages/api/session-controller/src/skill-catalog.ts`](../../packages/api/session-controller/src/skill-catalog.ts)

<a id="ctxskills--skillregistry"></a>

### `ctx.skills` — `SkillRegistry`

Layered registry of skill providers, the host+per-scope shape the tools registry established. A registration files into the layer of its calling context's scope (scopeOf): host rows and repository plugins land in the global layer, while a plugin mounted by an agent preset's standing composition lands in that preset's layer. A read merges the global layer with the viewing scope's chain — the nearest layer's entry wins a duplicate name outright, and the rank order decides duplicates only within one layer. It exposes sorted invocation-neutral summaries and loads full skill bodies on demand.

```ts cordis-catalog
/**
 * Register a borrowed same-process provider synchronously during plugin
 * apply, into the calling context's layer: a scoped context (an agent
 * preset's standing mount) registers for that scope alone, an unscoped
 * context registers globally. Duplicate names within one layer and reserved
 * names throw; remote initialization belongs in `list()`. Fiber disposal
 * unregisters the provider and invalidates catalog caches.
 * @param create - synchronous factory receiving this registration's lifecycle and invalidation control.
 * @returns the exact Cordis effect disposer that unregisters this provider;
 *   composite effects may yield it directly to preserve teardown ordering.
 */
registerProvider(create: (control: SkillProviderControl) => SkillProvider): () => void

/**
 * Register a borrowed readonly runtime skill into the calling context's
 * layer. Project entries outrank runtime entries, which outrank user
 * entries, within one layer. Same-name runtime entries in one layer are
 * first-wins; a duplicate logs a warning and receives a no-op disposer so
 * it cannot remove the winner.
 * @param skill - the skill definition input; omitted invocation and provider fields receive defaults.
 * @returns the exact Cordis effect disposer, preserving composite teardown order and invalidating caches.
 */
register(skill: SkillRegistration): () => void

/**
 * List invocation-neutral skill summaries for a workspace. Consumers apply
 * model or user invocation policy at their operational boundary. Lookup
 * options and provider candidates are readonly same-process values borrowed
 * throughout discovery.
 * @param options - view options; `scope` selects the viewing agent's layers, `cwd` selects project roots, and `signal` cancels discovery.
 * @returns all sorted winning summaries.
 */
async list(options: SkillViewOptions = {}): Promise<SkillSummary[]>

/**
 * Observe the current invocation-neutral catalog and whether discovery completed within a stable revision.
 * Incomplete observations are never cached, allowing consumers to retain last-good state and
 * retry on their next request boundary.
 * @param options - view options; `scope` selects the viewing agent's layers, `cwd` selects project roots, and `signal` cancels discovery.
 * @returns sorted summaries plus discovery-completeness state.
 */
async snapshot(options: SkillViewOptions = {}): Promise<SkillCatalogSnapshot>

/**
 * Load and validate the winning candidate, passing its opaque discovery locator back to the
 * provider. Cancellation is rechecked after selection, including cache hits, and raced against
 * loading so an uncooperative provider cannot hang the caller.
 * @param name - kebab-case skill name.
 * @param options - view options; `scope` selects the viewing agent's layers,
 *   `cwd` selects workspace-sensitive skills, and `signal` cancels work.
 * @returns the full skill, including body content, or `undefined`.
 */
async get(name: string, options: SkillViewOptions = {}): Promise<SkillDefinition | undefined>
```

Source: [`packages/skill/skill/src/index.ts`](../../packages/skill/skill/src/index.ts)

<a id="skills-events"></a>

### `skills/*` events

<a id="skillschange--emit"></a>

#### `skills/change` — emit

A skill provider, runtime contribution, or provider-backed catalog may have changed. This is an unfiltered invalidation notification; consumers refetch the catalog for their own lookup options. Listener failures are contained and cannot veto the registry mutation.

```ts cordis-catalog
/**
 * A skill provider, runtime contribution, or provider-backed catalog may
 * have changed. This is an unfiltered invalidation notification; consumers
 * refetch the catalog for their own lookup options. Listener failures are
 * contained and cannot veto the registry mutation.
 * @mode emit
 */
'skills/change'(): void
```

Source: [`packages/skill/skill/src/index.ts`](../../packages/skill/skill/src/index.ts)
<!-- END GENERATED cordis-surface -->
