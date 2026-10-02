# Plan Mode

[English](plan.md) | [中文](plan.zh.md) | Deutsch

Plan Mode ist ein geloggter, pro-Agent-Kollaborationszustand im Besitz von [dsh-plan-mode](../../packages/plan/plan-mode) (`ctx.planMode`, `PlanModeController`): Solange er aktiv ist, wird jeder Modellanfrage ein deployment-eigener Guidance-Abschnitt beigefügt. Plan Mode ist **weiche Führung**. [Sandbox Mode](sandbox.de.md) und die [Approval-Policy](approval.de.md) erzwingen Einschränkungen unabhängig; keine der beiden liest oder schreibt Plan-Zustand, daher konfigurieren Deployments sie getrennt. Das Paket ist optional, und der Agent Loop hängt nicht von ihm ab. Es trägt den `plan:policy`-Prompt-Abschnitt bei und registriert das `exit_plan_mode`-Tool und das `/plan`-Kommando. Die [Design-Notiz](../../.agents/notes/implemented/simplification/2026-07-22-plan-specific-collaboration-state.de.md) besitzt die Begründung; das [Paket-README](../../packages/plan/plan-mode/README.de.md) besitzt die Model-Experience- und Limitationsdetails.

Quelle: [`packages/plan/plan-mode/src/index.ts`](../../packages/plan/plan-mode/src/index.ts)

## Geloggter Zustand und Wiederherstellung

`plan/mode` (`{ active: boolean }`) ist ein nur-geloggtes, ganzwertig ersetzendes [Session-Event](session.de.md): durable und replaybar, niemals im Modell-Transcript. Die optional registrierte `plan`-Unit faltet den committed Mode, die Command-Abrechnung und den im letzten Request-Header aufgezeichneten Mode. `ctx.planMode` liest diesen Zustand über `stateOf()`; der erste abhängige Zugriff schlägt fehl, wenn die Registry, der `plan`-Key oder der `turnBoundary`-Key fehlt. Clients erhalten nur `{ active, pending }`; Resume, Fork und Compaction stellen beides aus dem Log wieder her. Die vollständige Event-Deklaration steht im [Persistence-Log-Eventkatalog](../persistence-catalog.de.md).

## Ausstehende Auswahlen und das Pre-Step-Append

Da jedes Session-Event turn-eingeschlossen ist, bleibt eine Benutzerauswahl ausstehend, bis der nächste akzeptierte In-Turn-Pre-Step sie vor der Request-Ableitung anhängt, in welchem Turn auch immer dieser liegt. Eine Auswahl erzwingt niemals eine Fortsetzung; eine nach dem letzten akzeptierten Pre-Step eines Turns getroffene Auswahl wird daher in einem späteren Turn angehängt. `set(agent, active)` zeichnet die ausstehende Auswahl auf (ein No-Op, wenn das Ziel dem geloggten oder bereits ausstehenden Zustand entspricht), und `get(agent)` gibt `{ active: boolean; pending?: boolean }` zurück: den geloggten Zustand, der zum Zusammensetzen des aktuellen Steps verwendet wird, plus den ausgewählten, aufs Anhängen wartenden Zustand.

Der einzige Append-Punkt, während ein Agent läuft, ist ein vorangestellter `agent/pre-step`-Listener. Er beobachtet jeden vorgeschlagenen Request-Step, einschließlich Turn 1 Step 1 und Request-Recovery-Retries, ruft zuerst nachgelagerte Listener auf und hängt erst an, nachdem diese den Step akzeptiert haben. Die Prompt-Aufnahme erfolgt vor einem Turn und kann `plan/mode` nicht anhängen; eine am Prompt getroffene Auswahl wird daher vom ersten akzeptierten In-Turn-Pre-Step des Turns angehängt, den sie startet. Ein Append-Fehler kann den Turn nicht blockieren, und die Auswahl bleibt für einen späteren akzeptierten In-Turn-Pre-Step ausstehend. Eine angehängte Benutzerauswahl zeichnet außerdem eine plugin-stammende `user/message`-Notiz auf, aber nur, wenn der zuletzt geloggte Request-Header den anderen Zustand beschrieb — so erfährt das Modell genau dann, wenn sich sein Kontext geändert hat, und niemals redundant. Eine nach dem letzten akzeptierten Pre-Step eines Turns getroffene Auswahl bleibt prozesslokal und geht verloren, wenn der Prozess vor einem weiteren akzeptierten In-Turn-Pre-Step endet ([README-Limitation](../../packages/plan/plan-mode/README.de.md#known-limitations-and-deferred-work)).

## Konfiguration

```ts type-equiv
/** Deployment-owned plan guidance. */
interface PlanModeConfig {
  /** Guidance rendered as the `plan:policy` prompt section while plan mode is active. */
  section: string
}
```

Ein fehlender, leerer oder nicht-string `section` sowie jeder unbekannte Key schlagen beim Plugin-Load fehl, statt ignoriert zu werden. Solange Plan Mode aktiv ist, rendert der exakte `section`-Text als `plan:policy`-[System-Prompt-Abschnitt](system-prompt.de.md) an Position 50; inaktiver Plan Mode trägt keinen Text bei.

## Das Exit-Tool und das `/plan`-Kommando

[`exit_plan_mode`](../tool-catalog.de.md#deepseek-aidsh-plan-mode) bleibt registriert, solange Plan Mode inaktiv ist; das Betreten oder Verlassen des Plan Mode ändert daher nur den Prompt-Abschnitt, niemals den Request-Tool-Katalog — eine Ausführung außerhalb des Plan Mode schlägt fehl. Im Plan Mode verlangt es einen vollständigen Markdown-Plan, der mit einer `#`-Überschrift beginnt, und legt ihn über die [User-Questions-Seam](user-questions.de.md) zur Prüfung vor. Ein Approval gibt `{ approved: true }` zurück und zeichnet einen stillen (nicht erzählten) ausstehenden Exit auf, der beim nächsten akzeptierten In-Turn-Pre-Step angehängt wird. Die Plan-Guidance bleibt daher für den Rest der aktuellen Tool-Batch des Assistant aktiv, und das Tool-Ergebnis selbst meldet den Übergang. Weiterplanen ist ein fehlgeschlagener Call, der das Feedback des Benutzers trägt, sodass das Modell überarbeitet und erneut vorlegt; ein fehlender Interaktionskanal und ein Service-Reload während der Prüfung lassen den Call ebenfalls fehlschlagen, statt den Plan Mode still zu verlassen.

Ist [`ctx.commands`](commands.de.md) komponiert, registriert das Plugin `/plan [off|message]`: Ein nacktes `/plan` wählt Plan Mode, jede andere nicht-leere Nachricht wählt ihn und reicht den Text anschließend über `agent.steer()` ein, sodass er zur gewöhnlichen geloggten Benutzernachricht des nächsten Steps unter Plan-Guidance wird, und das exakte Argument `off` wählt inaktiv — dies storniert außerdem einen ausstehenden Eintrag, bevor er angehängt und für eine Anfrage sichtbar wird.

## Der Service

`ctx.planMode` besitzt den geloggten Plan-Zustand, wendet den ausgewählten Zustand zum Step-Start an und erzählt ihn, und besitzt den `plan:policy`-Abschnitt, das `/plan`-Kommando und das stabil registrierte Exit-Tool; die `get`/`set`-Signaturen stehen im generierten [Service-Katalog](#ctxplanmode--planmodecontroller).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.de.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxplanmode--planmodecontroller"></a>

### `ctx.planMode` — `PlanModeController`

`ctx.planMode`: owns logged plan state, applies and narrates selected state at step start, the `plan:policy` section, the `/plan` command, and the stable exit tool. Client carriers expose the projection's cropped `{ active, pending }` view.

```ts cordis-catalog
/**
 * Read the logged plan state and any selected state awaiting the next
 * accepted in-turn pre-step.
 *
 * @param agent The agent to read.
 * @returns Current logged state plus a pending selection, when present.
 */
get(agent: Agent): { active: boolean; pending?: boolean }

/**
 * Select whether plan mode should be active. Between turns the method
 * appends the change immediately because no in-turn pre-step will run until
 * another prompt starts a turn. The open-turn fold is the idle signal:
 * agent status stays `running` through post-turn checkpointing, when no
 * further in-turn pre-step runs. During an open turn the selection remains
 * pending until the next accepted in-turn pre-step. Repeated selection of
 * the current or already-pending state is a no-op.
 *
 * @param agent The agent to switch.
 * @param active Whether plan mode should be active.
 * @returns what happened: `committed` (logged now), `queued` (awaiting the
 * next accepted in-turn pre-step), `cancelled` (an opposite pending selection
 * was cleared; the logged state already matches), or `noop` (already in that
 * state).
 */
set(agent: Agent, active: boolean): 'committed' | 'queued' | 'cancelled' | 'noop'
```

Types: [Agent](core.de.md)

Source: [`packages/plan/plan-mode/src/index.ts`](../../packages/plan/plan-mode/src/index.ts)
<!-- END GENERATED cordis-surface -->
