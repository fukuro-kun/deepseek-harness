# Benutzerinteraktion

[English](user-questions.md) | [中文](user-questions.zh.md) | Deutsch

Der user-questions-seam von [dsh-user-questions](../../packages/interaction/user-questions). Er ist das provider-neutrale Vokabular, das ein Tool- oder Permission-Plugin verwendet, wenn es die Antwort eines Menschen braucht, bevor der Agent fortfahren kann. Agent-gescopte waterfall-Listener komponieren die verfügbaren UI-Oberflächen, einschließlich Listener, die an einen verbundenen Client weitergeleitet werden.

Quelle: [`packages/interaction/user-questions/src/index.ts`](../../packages/interaction/user-questions/src/index.ts)

## Frageoptionen

`AskUserQuestionOption` enthält eine wählbare Option. `label` ist der nutzerseitige Optionstext und zugleich der modellseitige ausgewählte Wert; `description` ist optionaler UI-Hilfetext.

```ts type-equiv
/** One selectable answer offered to the user. */
interface AskUserQuestionOption {
  /** User-facing label. */
  label: string
  /** Optional extra context rendered by capable UIs. */
  description?: string
}
```

## Präsentationsintention

`AskUserQuestionIntent` deklariert optional eine bekannte Entscheidungsart. Es ist über `kind` getaggt, damit Intentionen hinzugefügt werden können; eine UI, die einen Tag nicht kennt, rendert die generische Optionsliste. Eine Intention ändert nur die Präsentation — eine UI, die sie beachtet, antwortet mit denselben Optionslabels, die eine generische UI senden würde, sodass der Aufrufer in beiden Fällen dieselben Antwortfelder liest. `approve` benennt die bejahende Option, statt sich auf die Optionsreihenfolge zu verlassen. `ask()` lehnt die zwei Fälle ab, die kein Typ tragen kann: ein `approve`, das keine Option der eigenen Frage benennt, und eine Intention auf einer Frage ohne `detail`.

```ts type-equiv
/**
 * A caller-declared presentation intent: the question IS this kind of
 * decision, so a UI that recognises the tag may present it as such instead of as a
 * generic option list. Tagged so further intents can be added; a UI that does
 * not know a tag renders the generic flow, and the answer encoding is identical
 * either way — an intent changes presentation only, never the protocol.
 */
type AskUserQuestionIntent = {
  /** A plan submitted for review: `detail` is the plan markdown `ask()` requires, and the decision approves or declines it. */
  kind: 'plan-review'
  /**
   * The option label that approves the plan; every other option declines it.
   * Named rather than positional so no UI infers the verdict from option order.
   * An `approve` naming no option of its own question is rejected at `ask()`.
   */
  approve: string
}
```

## Frageelement

`AskUserQuestionItem` ist eine Frage in einer Anfrage. Der Aufrufer liefert eine stabile `id`, die mit der Antwort zurückgespiegelt wird, damit gebündelte Fragen routbar bleiben. Das optionale `detail` trägt begleitenden Text, den Provider mit der Frage rendern, aber aus den wählbaren Optionslabels heraushalten.

```ts type-equiv
/** One question in a user-questions request. */
interface AskUserQuestionItem {
  /** Stable caller-provided question id, echoed in the answer. */
  id: string
  /** The question to display. */
  question: string
  /** Optional supporting detail rendered with the question but kept out of option labels. */
  detail?: string
  /** Optional short heading/group label. */
  header?: string
  /** Optional choices the UI can render as a menu. */
  options?: AskUserQuestionOption[]
  /** Whether more than one option may be selected. Defaults to single-select. */
  multiSelect?: boolean
  /** Optional presentation intent for capable UIs; absent asks for the generic option list. */
  intent?: AskUserQuestionIntent
}
```

## Ask-Anfrage

`AskUserQuestionRequest` ist die paketübergreifende Anfrage. `questions` ist ein Array, damit eine UI zusammengehörige Fragen in einem Ablauf präsentieren kann und jede Antwort eine stabile id behält. Wenn vorhanden, ist `agent` der exakt aktive Aufrufer; der interaction-seam lässt ihn nur zu, solange die aktive Registry diese Instanz als Runtime-Root identifiziert.

```ts type-equiv
/** Request for a human answer. */
interface AskUserQuestionRequest extends AskUserQuestionRequestEvent {}
```

## Antwort

Provider geben pro Frage-id ein Antwortelement zurück. `selected` enthält ausgewählte Optionslabels, und `custom` trägt eine freie „Other"-Antwort, wenn der Nutzer eine eingegeben hat. Bei einer Single-Select-Frage überschreibt `custom` die getroffene Wahl und `selected` ist leer. Bei einer Multi-Select-Frage kann `custom` die Labels in `selected` ergänzen. Eine UI kann auch ein Element mit leerem `selected` und ohne `custom` verwenden, um eine übersprungene Frage in einem ansonsten abgeschlossenen Batch zu bewahren.

```ts type-equiv
/** Answer to one question. */
interface AskUserQuestionAnswerItem {
  /** The answered question id. */
  id: string
  /** Selected option labels. May accompany custom text for a multi-select question. */
  selected: string[]
  /** Optional free-text "Other" answer. */
  custom?: string
}
```

```ts type-equiv
/** The human's answer. */
interface AskUserQuestionAnswer {
  /** Structured answers keyed by question id. */
  answers: AskUserQuestionAnswerItem[]
}
```

## Fehler

`UserQuestionError` erweitert `HarnessError`, sodass `ctx.tools.execute()` `{ name, code }` für modellseitige Tool-Fehler wie `EMPTY_QUESTIONS`, `NO_PROVIDER`, `ASK_ABORTED` oder UI-seitigen Abbruch bewahrt.

```ts type-equiv
/** Stable error taxonomy for user-questions failures. */
class UserQuestionError extends HarnessError {
  constructor(message: string, code: string, options?: ErrorOptions) {
    super(message, code, options)
    this.name = 'UserQuestionError'
  }
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.de.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxuserquestions--userquestionservice"></a>

### `ctx.userQuestions` — `UserQuestionService`

`ctx.userQuestions`: validation plus the scoped answerer waterfall.

```ts cordis-catalog
/**
 * Ask the scoped answerer waterfall and wait for the user's answer.
 *
 * When a caller supplies an agent, human interaction is valid only for the
 * exact live runtime root. Runtime ownership, not durable session lineage,
 * decides this boundary: an owned child has no human answerer and would
 * block forever, while a lineage-bearing session resumed as a new runtime
 * root may ask normally.
 *
 * @param request Questions, owner agent, and abort signal.
 * @returns The answer chosen or typed by the human.
 * @throws {UserQuestionError} code `ASK_ABORTED` when the supplied signal
 *   is already or becomes aborted, `CALLER_NOT_LIVE` when a supplied agent
 *   is not the registry's exact live instance, or `DELEGATED_CALLER` when
 *   that live agent is owned by another agent.
 */
async ask(request: AskUserQuestionRequest): Promise<AskUserQuestionAnswer>
```

Source: [`packages/interaction/user-questions/src/index.ts`](../../packages/interaction/user-questions/src/index.ts)

<a id="user-questions-events"></a>

### `user-questions/*` events

<a id="user-questionsrequest--waterfall"></a>

#### `user-questions/request` — waterfall

Ask composed answerers for structured user input. Return an answer to claim the request or call `next()` to delegate. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.

```ts cordis-catalog
/**
 * Ask composed answerers for structured user input. Return an answer to
 * claim the request or call `next()` to delegate. Scope-filtered dispatch
 * (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @param request - pending user-question request.
 * @mode waterfall
 */
'user-questions/request'( this: Scoped<Agent>, request: AskUserQuestionRequestEvent, next: () => Promise<AskUserQuestionAnswer>, ): Promise<AskUserQuestionAnswer>
```

Types: [Agent](core.de.md) · [Scoped](scope.de.md)

Source: [`packages/interaction/user-questions/src/types.ts`](../../packages/interaction/user-questions/src/types.ts)
<!-- END GENERATED cordis-surface -->
