# Permission Presets
[English](permission-presets.md) | [中文](permission-presets.zh.md) | Deutsch


Die Permission-Preset-Schicht von [dsh-permission-presets](../../packages/interaction/permission-presets) (`ctx.permissionPresets`, `PermissionPresetService`) bündelt die zwei unabhängigen Enforcement-Regler — [Sandbox-Modus](sandbox.de.md) (`sandbox/mode`) und [Approval-Policy](approval.de.md) (`approval/policy`) — zu benannten Presets, die ein Client als einen einzigen Permissions-Selektor anbietet. Es ist eine optionale Capability, kein Teil des Agent-Loop-Spines, und besitzt kein eigenes Enforcement: Ausführung, Prompt-Narration und Replay lesen weiterhin die gefalteten Werte ihrer Regler; ein Preset-Wechsel zeichnet nur die Absicht auf und schreibt über den kanonischen Setter jedes Reglers. Das [Package-README](../../packages/interaction/permission-presets/README.de.md) trägt den Kompositionsstatus und die Einschränkungen; das [Sandbox-Switching-Design](../../.agents/notes/implemented/feature/2026-07-06-sandbox.de.md) trägt die Begründung.

Quelle: [`packages/interaction/permission-presets/src/index.ts`](../../packages/interaction/permission-presets/src/index.ts)

## Die Preset-Tabelle

Ein Preset ist ein Tabellenschlüssel, der auf ein Sandbox/Approval-Bündel plus optionale Client-Präsentation abbildet; die mitgelieferte Tabelle enthält `workspace-write` (`workspace-write` + `ask`) und `danger-full-access` (`danger-full-access` + `never`).

```ts type-equiv
/** One preset's sandbox/approval bundle and optional client presentation. */
interface PresetSpec {
  /** The `sandbox/mode` value the preset writes through. */
  sandbox: SandboxMode
  /** The `approval/policy` value the preset writes through. */
  approval: ApprovalPolicy
  /** The display label a client shows for this preset; the raw table key when omitted. */
  name?: string
  /** One user-facing sentence on what the preset means; omitted when not configured. */
  description?: string
}
```

```ts type-equiv
/** The {@link PermissionPresetService} config: preset table and composition default. */
interface Config {
  /**
   * The preset table: name → knob bundle. Defaults to `workspace-write`
   * (workspace-write + ask) and `danger-full-access` (danger-full-access +
   * never). The name `custom` is reserved for the derived not-a-preset state.
   */
  presets?: Record<string, PresetSpec>
  /**
   * Default for new sessions. When omitted, the preset matching the composed
   * sandbox and approval defaults is used.
   */
  defaultPreset?: string
}
```

Der Service erfordert einen isolierenden `ctx.shell`-Executor und `ctx.approval`; Fehlkonfiguration schlägt bereits beim Plugin-Laden fehl: Ein Tabelleneintrag namens `custom` wirft einen Fehler (der Name ist für den abgeleiteten Kein-Preset-Zustand reserviert), und die Komposition über einem bash-Executor ohne Isolation (kein `sandboxMode`-Capability-Fakt) wirft ebenfalls, weil Presets einen Sandbox-Modus bündeln.

## Aktuelles Preset und das abgeleitete `custom`

`current(session)` leitet das effektive Preset aus der optional registrierten `permissions`-Projektion ab. Die Einheit faltet Sandbox-Modus, Approval-Policy und die aufgezeichnete Auswahl der Session; in diesem Zustand fehlende Werte fallen auf den konfigurierten Modus des Executors und die Config des Approval-Service zurück, danach auf `ask`. Eine fehlende Registry oder ein fehlender Projektions-Key schlägt explizit fehl. Der Service bevorzugt eine noch passende Auswahl, dann den ersten passenden Tabelleneintrag in Deklarationsreihenfolge, und liefert sonst `CUSTOM_PRESET` (`'custom'`). `custom` ist reine Ableitung: Clients dürfen es als aktuellen Wert anzeigen, aber es ist niemals ein Wechselziel oder ein Event-Payload.

`names` listet die schaltbaren Presets in Tabellen-Deklarationsreihenfolge; `optionOf(name)` baut die Option, die ein Client für einen Tabellenschlüssel (das Label fällt auf den Schlüssel zurück) oder für `custom` rendert, und wirft für jeden anderen Namen.

```ts type-equiv
/** The select-option shape a presentation layer advertises for one preset (or for the derived `custom` state). */
interface PresetOption {
  /** Stable option value: the table key, or `custom`. */
  value: string
  /** The display label. */
  name: string
  /** One user-facing sentence on what the value means; omitted when not configured. */
  description?: string
}
```

## Umschalten und das `permission/preset`-Event

`set(session, name)` löst das Preset auf (unbekannte Namen werfen), hängt ein reines Log-Event `permission/preset` an, sofern `name` nicht bereits das effektive Preset ist, und schreibt dann jeden Regler über seinen eigenen Setter — `setSandboxMode` aus [dsh-sandbox-policy](../../packages/sandbox/sandbox-policy) und `setApprovalPolicy` aus [dsh-user-approval](../../packages/interaction/user-approval) — nur wenn sich der effektive Wert dieses Reglers ändert. Das Auswahl-Event steht in derselben Turn vor den Regler-Events; die erneute Auswahl des effektiven Presets hängt nichts an.

`permission/preset` ist durable, nur geloggte Nutzerabsicht: Es bleibt außerhalb des Model-Transcripts (die Regler-Events tragen die modellsichtbaren Folgen über ihre Consumers), und es existiert, damit `current()` festhalten kann, WELCHES Preset der Nutzer gewählt hat, wenn zwei Presets dasselbe Bündel teilen. Die `permissions`-Projektion faltet diese Auswahl mit beiden Regler-Events und behält die `session/end-seed`-Grenze, die einen wiederhergestellten leeren Seed von einer neuen Session unterscheidet; Replay benötigt keinen Aufholzustand und kein erneutes Scannen des Rohlogs. Die vollständige Event-Deklaration steht im [Persistence-Log-Event-Katalog](../persistence-catalog.de.md); die Methodensignaturen stehen im generierten [Service-Katalog](#ctxpermissionpresets--permissionpresetservice).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.de.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxpermissionpresets--permissionpresetservice"></a>

### `ctx.permissionPresets` — `PermissionPresetService`

Owns the deployment's permission presets and their write path. Requires a confining `ctx.shell` executor and `ctx.approval`; unmatched knob values are reported as CUSTOM_PRESET, not an error.

```ts cordis-catalog
/**
 * Resolve the preset matching the effective knob values. A still-matching
 * last selection wins shared-bundle ties; otherwise the first table match
 * wins, or {@link CUSTOM_PRESET} when no entry matches.
 * @param session - the session whose knob state is read.
 * @returns the effective preset name, or `custom` when nothing matches.
 */
current(session: Session): string

/**
 * Build the whole select value for one folded knob state: every table
 * option in declaration order, `custom` appended exactly while derived.
 * @param state - the folded knob overrides.
 * @returns the `permissions` projection payload.
 */
selectFor(state: KnobState): PermissionSelect

/**
 * Resolve a preset's knob bundle.
 * @param name - the preset name to resolve.
 * @returns the configured bundle.
 * @throws when `name` is not in the table.
 */
resolve(name: string): PresetSpec

/**
 * Build the client option for a table entry or {@link CUSTOM_PRESET}. A
 * missing label falls back to the table key.
 * @param name - a table key, or `custom`.
 * @returns the option a client renders.
 * @throws when `name` is neither a table key nor `custom`.
 */
optionOf(name: string): PresetOption

/**
 * Record a changed preset, then update each changed knob through its own
 * setter. Selecting the effective preset again appends nothing.
 * @param session - the session the switch belongs to.
 * @param name - the preset to switch to; unknown names throw.
 */
set(session: Session, name: string): void
```

Types: [Session](session.de.md)

Source: [`packages/interaction/permission-presets/src/index.ts`](../../packages/interaction/permission-presets/src/index.ts)
<!-- END GENERATED cordis-surface -->
