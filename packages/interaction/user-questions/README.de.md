---
description: "Waterfall-basierter Frage-und-Antwort-Service für Tools, Permission-Plugins, lokale Answerer und Agent-scoped Web-Interaktionen."
kind: "package-reference"
---

# @deepseek-ai/dsh-user-questions

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

User-Interaction-Service-Definition. Sie besitzt `ctx.userQuestions`, den Service, den ein modellseitiges Tool oder Permission-Plugin nutzt, wenn es die Arbeit pausieren und den Menschen um eine Entscheidung bitten muss. Verwende sie, wenn ein Consumer eine Operation suspendieren muss, bis der Nutzer antwortet.

## Inhaltsverzeichnis

- [Service: `UserQuestionService` (ctx key: `userQuestions`)](#service-userquestionservice-ctx-key-userquestions)
- [Rolle](#role)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Hinweis für Entwickler](#dev-note)

-----

<a id="service-userquestionservice-ctx-key-userquestions"></a>
## Service: `UserQuestionService` (ctx key: `userQuestions`)

### Public API

- `ctx.userQuestions.ask(request): Promise<AskUserQuestionAnswer>` Dispatcht den Answerer-Waterfall und wartet auf die erste akzeptierte Antwort.

### Zentrale Typen

- `AskUserQuestionRequest` — `{ questions: [{ id, question, detail?, header?, options?, multiSelect?, intent? }], agent?, signal? }`; `detail` liefert unterstützenden Text, den Provider zusammen mit der Frage rendern, ohne daraus ein Option-Label zu machen. Falls vorhanden, muss `agent` exakt die live Runtime-Root der Registry sein.
- `AskUserQuestionOption` — `{ label, description? }`.
- `AskUserQuestionIntent` — `{ kind: 'plan-review', approve }`; die unten markierte Presentation-Intent.
- `AskUserQuestionAnswer` — `{ answers: [{ id, selected, custom? }] }`.
- `UserQuestionError` — `HarnessError`-Subklasse mit Codes wie `EMPTY_QUESTIONS`, `BAD_INTENT`, `NO_PROVIDER`, `ASK_ABORTED`, `CALLER_NOT_LIVE` und `DELEGATED_CALLER`.

Bei einer Single-Select-Frage überschreibt `custom` die gewählte Auswahl und `selected` ist leer. Bei einer Multi-Select-Frage kann `custom` die Labels in `selected` ergänzen. Eine UI kann ein übersprungenes Item als `{ id, selected: [] }` bewahren und so die bestehende Antwortform halten, während die übrigen Antworten des Stapels erhalten bleiben.

Trägt ein Request einen Agent, authentifiziert `ask()` dessen exakte Identität über die live `AgentRegistry` und lässt nur eine Runtime-Root zu. Durable Lineage ist keine Autorität: Eine Session mit historischer Delegationstiefe darf fragen, sobald sie als neue Runtime-Root fortgesetzt wird, während ein live Child, das einem anderen Agent gehört, selbst dann abgelehnt wird, wenn seine durable Tiefe null ist. Der Web-Answerer empfängt nur Agent-scoped Requests; ein agentloser programmatischer Request bleibt für unscoped lokale Waterfall-Listener verfügbar und scheitert mit `NO_PROVIDER`, wenn keiner ihn annimmt.

### Presentation-Intent

`intent` deklariert, dass eine Frage eine bekannte Entscheidungsart IST, sodass eine UI, die das Tag kennt, sie entsprechend präsentieren kann — `plan-review` besagt, dass `detail` ein zu reviewender Plan ist, und `dsh-plan-mode` setzt es auf der `exit_plan_mode`-Frage. Ein Intent ändert nur die Präsentation: Eine UI, die ihn beachtet, antwortet mit denselben Option-Labels, die eine generische UI senden würde, und eine UI, die das Tag nicht kennt, rendert die generische Optionsliste, sodass Aufrufer in beiden Fällen dieselben Antwortfelder lesen. `approve` benennt das Label, das genehmigt, statt sich auf die Optionsreihenfolge zu verlassen. `ask()` lehnt mit `BAD_INTENT` die zwei Aussagen ab, die kein Typ tragen kann: ein `approve`, das keine der eigenen Optionen dieser Frage benennt, und ein Intent auf einer Frage ohne `detail` — das Ding, dessen Review sie zu sein behauptet.

<a id="role"></a>
## Rolle

Dies ist das Service-Definition-Paket. Consumers wie `@deepseek-ai/dsh-tool-ask-user` hängen von diesem Service ab; der Web-Client steuert über Remote Events einen Agent-scoped Answerer bei. Der Loop bleibt unverändert: Ein Tool-Call awaited das Waterfall-Ergebnis, und dieses Ergebnis setzt den normalen Agent Loop fort.

<a id="model-experience"></a>
## Model Experience

Indirekt, über `dsh-tool-ask-user`, das eine erfolgreiche Antwort als kompaktes JSON behält oder einen dieser Fehler: `Error: ask_user_question was aborted before the user answered`, `Error: ask_user_question requires at least one question`, `Error: human interaction requires the exact live calling agent when an agent is supplied`, `Error: human interaction is unavailable while the calling agent is owned by another live agent; include the unresolved question or decision in the child agent's final result`, `Error: no user-questions answerer accepted the request` oder `Error: <message>`. Das Warten auf den Menschen fügt keine Tokens hinzu.

#### KV-Cache-Effekt

Keine direkte Invalidation; der genannte Consumer besitzt etwaige Änderungen am Request-Präfix.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- **Agent-scoped Web-Beantwortung** — Remote Events routen den ausgelieferten Web-Answerer nur, wenn der Request einen live Agent-Scope trägt; agentlose Aufrufer brauchen einen unscoped lokalen Waterfall-Listener.
- **Das Vokabular ist nur die Frageformular-Form** — wählbare Optionen plus optionaler Freitext; reichere Interaktionsformen (Dateiwähler, Diff-Vorschau-Bestätigungen) haben noch kein Seam-Vokabular.


<a id="dev-note"></a>
### Hinweis für Entwickler

<details>
<summary>Arbeitskontext für Maintainer — zum Ausklappen klicken</summary>

Keiner.

</details>

**Laufzeitinvariante:** Es wird kein Companion publiziert. Der einzelne Provider-Slot wird bei der Registrierung validiert, und Asks kehren direkt zu ihrem Aufrufer zurück; der Seam publiziert keinen unabhängigen Request-/Answer-Audit-Stream.
