# Laufzeit-Invarianten

[English](invariants.md) | [中文](invariants.zh.md) | Deutsch

[dsh-invariants](../../packages/runtime-diagnostics/invariants) ist der konfigurierbare Registry-Service (`ctx.invariants`) für paketeigene Laufzeit-Invariantenprüfungen. Es ist ein einzelnes Support-Gruppen-Paket, keine Capability Seam aus drei Paketen und nicht Teil der Agent-Loop-Spine: Die Registry besitzt Auswahl, Namensreservierung, Child-Fiber-Lebenszyklus und paketattribuierte Fehler, während jedes Workspace-Paket ein `./invariant`-Begleit-Plugin veröffentlicht, das Prüfungen unter seinem exakten npm-Paketnamen registriert. Was eine Prüfung asserten darf — autoritative Event-Streams oder mutable Daten, niemals die Anwesenheit eines Services oder einer Methode — ist die Laufzeit-Invarianten-Konvention in [AGENTS.md](../../AGENTS.md#conventions).

Quelle: [`packages/runtime-diagnostics/invariants/src/index.ts`](../../packages/runtime-diagnostics/invariants/src/index.ts)

## Auswahl

```ts type-equiv
/** Runtime invariant selection configured on the service plugin. */
interface Config {
  /** Global switch; defaults to `true`. */
  readonly enabled?: boolean
  /** Case-sensitive JavaScript regex sources that admit package names; empty admits all. */
  readonly package_allowlist?: string[]
  /** Case-sensitive JavaScript regex sources that exclude package names after allowlist matching. */
  readonly package_blocklist?: string[]
}
```

Ein Paket ist ausgewählt, wenn der Service aktiviert ist, die Allowlist leer ist oder mindestens ein Muster seinen vollständigen npm-Namen matcht und kein Blocklist-Muster matcht — ein Blocklist-Match setzt einen Allowlist-Match außer Kraft. Einträge werden mit `new RegExp(source)` kompiliert: Das Matching ist unverankert, sofern die Quelle nicht `^` und `$` liefert, und die `/pattern/flags`-Syntax wird nicht geparst. Die Validierung schlägt beim Service-Start laut fehl: Ein leerer, mit Whitespace ummantelter, doppelter oder ungültiger Eintrag wirft, statt übersprungen zu werden. Ein gültiges Muster darf kein aktuell geladenes Paket matchen, sodass späteres Laden und HMR deterministisch bleiben; Filter sind für die Service-Lebensdauer fixiert ([README](../../packages/runtime-diagnostics/invariants/README.de.md)).

## Der Installer

```ts type-equiv
/**
 * Throw a package-attributed invariant failure.
 * @param message - violated package contract without the standard prefix.
 * @returns never because reporting a violation throws.
 */
type InvariantFailure = (message: string) => never
```

```ts type-equiv
/** Install one package's checks into the registration's child context. */
interface InvariantInstaller {
  /**
   * Install the package contribution.
   * @param ctx - child context owned by this invariant registration.
   * @param fail - reporter bound to the registering package name.
   * @returns nothing, or a promise settling after asynchronous checks finish.
   */
  (ctx: Context, fail: InvariantFailure): void | Promise<void>
  /** Services the child installer fiber may access. */
  readonly inject?: Inject
}
```

Ein aktivierter Installer läuft in einem dedizierten Child-Cordis-Fiber; `installer.inject` deklariert die Services, auf die dieser Fiber zugreifen darf, und der synchrone oder asynchrone Abschluss des Installers wird abgewartet, bevor die Registrierung erfolgreich ist. `fail(message)` wirft `InvariantError` — `extends Error` mit stabilem `code: 'INVARIANT'`, dem besitzenden `packageName` und einer Nachricht mit dem Präfix `invariant violated by "<package>": …` — sodass eine Verletzung attribuierbar ist, ohne dass die Registry ein Produktpaket importieren muss.

## Der Service

`ctx.invariants.register(packageName, installer)` reserviert eine aktive Registrierung für den vollständigen npm-Paketnamen und gibt deren effect-gebundenen Disposer zurück. Die Reservierung hält auch dann, wenn Filter den Installer inaktiv halten, sodass zwei Plugins niemals still denselben Paketnamen beanspruchen können; ein doppelter, leerer oder Whitespace enthaltender Name wirft. Ein Installer-Fehler dispost den Child-Fiber und gibt die Reservierung atomar frei. Der Service besitzt jeden Registrierungs-Fiber, während der zurückgegebene Disposer zugleich zum Begleit-Fiber gehört: Das Entladen einer der beiden Seiten entfernt Listener, Trace-Zustand und die Reservierung, sodass ein Begleiter neu laden und denselben Namen erneut registrieren kann, ohne zurückbehaltenen Zustand.

## Der Begleiter-Vertrag

Jedes Workspace-Paket besitzt einen `./invariant`-Begleiter ([Paketvertrag](../../packages/AGENTS.md)); Veröffentlichung und Registrierung sind erschöpfend, Assertions sind bewusst nicht synthetisch. Ein Begleiter installiert eine Prüfung nur, wenn sein Paket eine beobachtbare Event- oder Mutable-Data-Beziehung besitzt; andernfalls exportiert er einen leeren Installer, dessen führender Kommentar mit `No runtime invariant:` beginnt und paketspezifisch erklärt, warum nichts prüfbar ist. `pnpm run verify-package-invariants` weist mechanisch generierte Marker, unerklärte leere Installer, nicht-leere Installer, die den Reporter auslassen oder ignorieren, falsche Registrierungsnamen sowie unvollständige Export-, Veröffentlichungs-, Abhängigkeits- oder Bundle-Verdrahtung zurück ([Agent Note zu den mechanischen Regeln](../../.agents/notes/implemented/architecture/2026-07-19-package-invariant-runtime-contracts.de.md)). Der Katalog ausführbarer Begleiter und die Standard-Komposition stehen im [Paket-README](../../packages/runtime-diagnostics/invariants/README.de.md).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.de.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxinvariants--invariantregistry"></a>

### `ctx.invariants` — `InvariantRegistry`

Package-owned invariant registry with global and regex-based selection.

```ts cordis-catalog
/**
 * Register one package's invariant installer. The package name is reserved
 * even when filtering disables its checks. Enabled installers run in a child
 * fiber; failure disposes that fiber and releases the reservation.
 * @param packageName - full npm package name that owns the contribution.
 * @param installer - listener or startup-check installer for the child context.
 * @returns an effect-scoped disposer for the registration.
 */
register(packageName: string, installer: InvariantInstaller): () => void
```

Source: [`packages/runtime-diagnostics/invariants/src/index.ts`](../../packages/runtime-diagnostics/invariants/src/index.ts)
<!-- END GENERATED cordis-surface -->
