# System-Prompt-Assembly
[English](system-prompt.md) | [中文](system-prompt.zh.md) | Deutsch


Das [system-prompt-Paket](../../packages/core/system-prompt) besitzt die Daten, die zwischen Prompt-Beitragenden und einem Assembly-Aufruf ausgetauscht werden. Das Paket-[README](../../packages/core/system-prompt/README.de.md) dokumentiert Registrierung, Reihenfolge, Scoping und Rendering-Verhalten; diese Seite hält die exakten paketübergreifenden Typen fest, die Plugins implementieren oder übergeben.

Quelle: [`packages/core/system-prompt/src/index.ts`](../../packages/core/system-prompt/src/index.ts).

## Assembly-Kontext

`AssembleContext` identifiziert die Scope-Ebene, die ein Assembly auflöst, und kann das explizite Steuersignal für diese Anfrage tragen. Er ist merge-erweiterbar: `dsh-agent` fügt das optionale Feld `agent` für die aktive Agent-Instanz hinzu, und `assembleContextFor(agent, signal)` setzt die expliziten Felder gemeinsam. Ein nacktes Assembly hat weder Scope noch Signal.

```ts type-equiv
/** Merge-extensible context for one prompt assembly. */
interface AssembleContext {
  /**
   * Scope whose providers and waterfall listeners participate. When absent,
   * only global providers and subject-less listeners participate.
   */
  scope?: ScopeKey
  /** Explicit control signal for the turn that requested this assembly, when any. */
  signal?: AbortSignal
}
```

## Tool-Provider-Ergebnis

`ToolProviderResult.schemas` ist die modellseitig sichtbare Menge für das aktuelle Assembly. `knownNames` ist das vom Provider vor der Einschränkung bekannte Namensuniversum, mit dem sich ein Tippfehler in einem konfigurierten Namen von einem bekannten Tool unterscheiden lässt, das in diesem Scope absichtlich verborgen ist.

```ts type-equiv
/** Tool schemas visible in one assembly and their pre-restriction name set. */
interface ToolProviderResult {
  /** The schemas this provider contributes to THIS assembly. */
  readonly schemas: readonly ToolSchema[]
  /** The pre-restriction name universe for config validation (defaults to `schemas`' names). */
  readonly knownNames?: readonly string[]
}
```

## Prompt-Abschnitte

Die exportierten `PERSONA_PREFIX_SECTION` (`deployment:persona-prefix`) und `PERSONA_SUFFIX_SECTION` (`deployment:persona-suffix`) benennen die Slots, die globale Konfiguration und gescopte Beiträge teilen. Ihre `PromptSectionOrderName`-Einträge sind `DEPLOYMENT_PERSONA_PREFIX` und `DEPLOYMENT_PERSONA_SUFFIX`; das [Paket-README](../../packages/core/system-prompt/README.de.md#configure-the-prompt) besitzt ihre Platzierung und Template-Konfiguration.

`PromptSection` ist ein schreibgeschützter prozessinterner Registrierungsvertrag. Sein Text kann statisch sein oder aus dem aktuellen Assembly-Kontext aufgelöst werden. Abschnitte sortieren nach aufsteigendem order und danach nach Code-Unit-Namen; Beitragende im Repository lösen die service-seitige benannte Zuteilung über `getSectionOrder()` auf. Runtime-Kontext-Beitragende lösen ihre unabhängige Zuteilung über `getContextOrder()` auf. Ein wirksamer `complete`-Abschnitt wird nach dem kooperativen Assembly der einzige Prompt-Abschnitt. Die Agent-Loop rendert die assemblierten Abschnitte mit `renderPrompt` und committet den Text als `system/message`-Surface-Knoten — im ersten Step als Surface-Knoten 0 angehängt, danach bei geändertem gerendertem Text in-place ersetzt oder, wenn der vorbereitete Aufruf `systemPromptUpdate: 'in-history'` deklariert, bei nicht-leeren Updates in einer fortgesetzten Serie nach dem zwischengespeicherten Verlauf angehängt — sodass der Prompt das Modell als Nachricht des abgeleiteten Verlaufs erreicht, nicht als Request-Feld ([Entscheidung](../../.agents/notes/implemented/architecture/2026-09-02-system-prompt-as-surface-node.de.md); [Entscheidungsregel](../../packages/core/agent-loop/README.de.md#understand-the-implementation)).

```ts type-equiv
/** One contributed section of the system prompt (registry input). */
interface PromptSection {
  /** Unique name — a duplicate registration throws (see {@link SystemPrompt.section}). */
  readonly name: string
  /**
   * Sections are concatenated in ascending order. Equal orders use code-unit
   * name order.
   */
  readonly order: number
  /**
   * Static text or a provider evaluated at each assembly with that assembly's
   * {@link AssembleContext}. The text may reference `{{variable}}`s — they are
   * interpolated later, by {@link renderPrompt}.
   */
  readonly text: string | ((context: AssembleContext) => string)
  /**
   * Treat this contribution as the complete system prompt. Assembly still
   * runs the cooperative waterfall so tools, contexts, and variables can be
   * resolved, then restores this exact section as the sole prompt section.
   * More than one effective complete section makes assembly fail.
   */
  readonly complete?: boolean
}
```

## Dynamischer Prompt-Kontext

`PromptContext` ist das cache-sichere Gegenstück zu `PromptSection`. Das Assembly löst diese Beiträge auf und ordnet sie, während die Agent-Loop ihren vollständigen aktuellen Snapshot nur dann nach dem behaltenen Modellverlauf protokolliert, wenn er sich geändert hat oder eine Compaction ihn entfernt hat.

```ts type-equiv
/** Dynamic model context materialized as a durable user-role snapshot. */
interface PromptContext {
  /** Unique name — a duplicate registration throws (see {@link SystemPrompt.context}). */
  readonly name: string
  /** Contexts are joined in ascending order. */
  readonly order: number
  /** Static text or a provider evaluated for each assembly. Empty text contributes nothing. */
  readonly text: string | ((context: AssembleContext) => string)
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.de.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsystemprompt--systemprompt"></a>

### `ctx.systemPrompt` — `SystemPrompt`

Registry service for the prompt inputs assembled before each model step.

```ts cordis-catalog
/**
 * Register an ordered prompt section in the calling context's scope. A scoped
 * section shadows a global section with the same name; duplicates within one
 * layer and non-finite orders throw. Registration and disposal emit
 * `system-prompt/change`.
 * @param section - the section to register.
 * @returns the exact Cordis effect disposer.
 */
section(section: PromptSection): () => void

/**
 * Resolve the centrally owned placement of a repository prompt section.
 * @param name - stable section placement name.
 * @returns the section's numeric sort order.
 */
getSectionOrder(name: PromptSectionOrderName): number

/**
 * Resolve the centrally owned placement of a repository runtime context.
 * @param name - stable context placement name.
 * @returns the context's numeric sort order.
 */
getContextOrder(name: PromptContextOrderName): number

/**
 * Register ordered dynamic context in the calling context's scope. Scoped
 * entries shadow global entries with the same name.
 * @param context - the context contribution to register.
 * @returns the exact Cordis effect disposer.
 */
context(context: PromptContext): () => void

/**
 * Suppress every dynamic runtime-context contribution in the calling
 * context's scope without changing the services that own or enforce those
 * facts. Multiple suppressors remain independently disposable.
 * @returns the exact Cordis effect disposer.
 */
suppressRuntimeContext(): () => void

/**
 * Register a tool-schema provider in the calling context's scope. Global and
 * matching scoped providers both contribute; returning the reserved
 * {@link TOOL_ORDER_REST} name makes assembly fail.
 * @param provider - evaluated for each assembly with its context.
 * @returns the exact Cordis effect disposer.
 */
tools(provider: (context: AssembleContext) => ToolProviderResult): () => void

/**
 * Register a prompt variable in the calling context's scope. Scoped values
 * shadow globals; invalid or duplicate names throw. A provider may return
 * `undefined`, but rendering a section that references that value then fails.
 * @param name - the `[a-z][a-z0-9_]*` reference name.
 * @param provider - evaluated for each assembly.
 * @returns the exact Cordis effect disposer.
 */
variable(name: string, provider: (context: AssembleContext) => string | undefined): () => void

/**
 * Assemble global and scoped providers, detach tool parameters, apply
 * canonical ordering, then run the assembly waterfall. Scoped sections and
 * variables shadow globals. The returned waterfall value is authoritative
 * except that an effective complete section is restored afterwards as the
 * sole prompt section.
 * @param context - the optional scope and plugin-defined assembly fields.
 * @returns the post-waterfall assembly with any complete prompt enforced.
 */
async assemble(context: AssembleContext = {}): Promise<PromptAssembly>
```

Source: [`packages/core/system-prompt/src/index.ts`](../../packages/core/system-prompt/src/index.ts)

<a id="system-prompt-events"></a>

### `system-prompt/*` events

<a id="system-promptassemble--waterfall"></a>

#### `system-prompt/assemble` — waterfall

Expert waterfall over the assembled sections, contexts, tools, and variables. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): scoped listeners receive only that scope's assemblies. The returned value is authoritative. A supplied signal controls only this explicit assembly request and must not be retained to control later turns. A registered complete section is restored after this waterfall, so listeners cannot add to or replace that scope's system prompt.

```ts cordis-catalog
/**
 * Expert waterfall over the assembled sections, contexts, tools, and variables.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): scoped listeners
 * receive only that scope's assemblies. The returned value is authoritative.
 * A supplied signal controls only this explicit assembly request and must not
 * be retained to control later turns. A registered complete section is
 * restored after this waterfall, so listeners cannot add to or replace
 * that scope's system prompt.
 * @param assembly - the mutable assembly built from registered providers.
 * @param context - the caller's per-assembly context.
 * @mode waterfall
 */
'system-prompt/assemble'(this: Scoped<SystemPrompt>, assembly: PromptAssembly, context: AssembleContext, next: () => Promise<PromptAssembly>): Promise<PromptAssembly>
```

Types: [Scoped](scope.de.md)

Source: [`packages/core/system-prompt/src/index.ts`](../../packages/core/system-prompt/src/index.ts)

<a id="system-promptchange--emit"></a>

#### `system-prompt/change` — emit

Emitted when any prompt provider changes. This registry notification is unfiltered because a global change affects every scope.

```ts cordis-catalog
/**
 * Emitted when any prompt provider changes. This registry notification is
 * unfiltered because a global change affects every scope.
 * @mode emit
 */
'system-prompt/change'(): void
```

Source: [`packages/core/system-prompt/src/index.ts`](../../packages/core/system-prompt/src/index.ts)
<!-- END GENERATED cordis-surface -->
