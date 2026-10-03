---
description: "Das modellseitige ask_user_question-Tool über der user-questions-Seam, für Nutzer und Maintainer, die interaktive agent-Oberflächen komponieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-ask-user
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`ask_user_question` lässt ein Modell die Arbeit pausieren und den Menschen um eine Bestätigung, eine Auswahl oder fehlende Informationen bitten. Es akzeptiert eine oder mehrere Fragen und liefert deren Antworten als kompaktes JSON zurück. Der Aufruf wartet, bis eine Antwort akzeptiert oder der Turn abgebrochen wird; wenn kein Answer-Handler die Anfrage annimmt, erhält das Modell einen Fehler. Child-agents, die der Runtime gehören, können dieses Tool nicht aufrufen und müssen ungelöste Fragen in ihrem Endergebnis melden. Das Paket rendert nichts und sammelt keine Eingaben, daher müssen Aufrufer eine kompatible User-Interaction-Oberfläche bereitstellen.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Komponieren Sie dieses Plugin überall dort, wo das Modell für eine menschliche Entscheidung pausieren können soll: Es stellt das `ask_user_question`-Tool bereit und benötigt die `ctx.userQuestions`-Seam mit einem Answerer, der die gescopte Anfrage annimmt. Ohne einen solchen schlägt der Tool-Aufruf mit einem Fehler fehl, statt zu degradieren.

### Wann das Tool aufgerufen wird

Das Modell ruft `ask_user_question` auf, wenn es eine Bestätigung, eine Auswahl oder fehlende Informationen benötigt, bevor es fortfahren kann. Senden Sie eine oder mehrere Fragen, jede mit einer stabilen `id`, die in der Antwort gespiegelt wird; eine empfohlene Option steht an erster Stelle, mit `(Recommended)` am Ende ihres Labels.

```json
{
  "questions": [
    {
      "id": "cleanup",
      "question": "Proceed with the destructive cleanup?",
      "header": "Confirm",
      "options": [
        { "label": "Yes, delete them (Recommended)", "description": "Removes the three stale files." },
        { "label": "No, keep them", "description": "Aborts the cleanup." }
      ]
    }
  ]
}
```

### Was das Modell zurückbekommt

Das Tool liefert ein Antwort-Objekt pro Frage: `selected` enthält die gewählten Options-Labels, und `custom` trägt eine Freitext-Antwort — als Ergänzung zu `selected` bei einer Multi-Select-Frage und als dessen Überschreibung bei einer Single-Select-Frage. Der Native-Renderer bewahrt die kompakte JSON-Textform.

```json
{ "answers": [{ "id": "cleanup", "selected": ["Yes, delete them (Recommended)"] }] }
```

### Wann der Aufruf fehlschlägt

Der Tool-Aufruf blockiert, bis der Mensch antwortet, und wird nur über das Signal des Turns abgebrochen. Kein akzeptierender Answerer, ein abgebrochener Aufruf oder ein Aufrufer, der nicht die exakte lebende Runtime-Root ist, enden jeweils als Fehler, den das Modell im Tool-Ergebnis sieht — insbesondere wird ein lebender Child-agent, der einem anderen agent gehört, abgelehnt (`DELEGATED_CALLER`) und muss die ungelöste Frage oder Entscheidung in sein Endergebnis aufnehmen.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) behandelt; dieser Abschnitt erklärt die Tool-Definition und ihre Beziehung zur Seam.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Tool-Registrierung: `ask_user_question`-Schema, Execute-Pfad, Ergebnis-Rendering |
| — | Es wird kein Runtime-Invarianten-Begleiter veröffentlicht; dieser modellseitige Adapter hat keinen unabhängigen Lifecycle-Stream; Ausführungsrelationen gehören der Capability-Seam, die er aufruft. |

### Consumer-Rolle

Das Plugin registriert einen `defineTool`-Eintrag auf `ctx.tools` mit den Injects `['tools', 'userQuestions']`. `execute` bildet Modell-Argumente auf einen `AskUserQuestionRequest` ab, reicht den exakten aufrufenden agent und das Signal des Turns weiter und bildet die akzeptierte Antwort zurück auf das kanonische `answers`-Array ab. Die Seam besitzt Identitätsprüfungen, Intent-Validierung, Waterfall-Dispatch und die Fehlertaxonomie; dieses Paket übersetzt nur.

### Ergebnis-Rendering

Die `render`-Ausgabe projiziert den strukturierten Wert über `JSON.stringify` auf einen einzelnen Textblock, weshalb das modellseitige Ergebnis kompaktes JSON ist und kein reichhaltigeres Content-Block-Vokabular.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Paket-Vertrag nicht ausreicht. Sie führen von der Tool-Oberfläche zum Seam-Vertrag und seinem Answerer-Waterfall.

- [User-Interaction-Subsystem-Referenz](../../../docs/subsystems/user-questions.de.md) — der Service-Vertrag, das Frage-Vokabular und der Answerer-Waterfall hinter diesem Tool.
- [Tool-Katalog](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-ask-user) — das generierte `ask_user_question`-Schema.
- [user-questions-Paket](../user-questions/README.de.md) — die Seam, die dieses Tool konsumiert.
- [Interaction-Gruppenkarte](../README.de.md) — benachbarte Approval- und Command-Oberflächen.

-----

<a id="model-experience"></a>
## Model Experience

### Tool-Schema

#### Was das Modell sieht

Das Modell sieht das generierte [`ask_user_question`-Schema](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-ask-user), einschließlich Frage-IDs, Prompts, Überschriften, Optionen und Multi-Select-Flags.

#### Token-Effekt

Feste Schema-Kosten auf jedem Request, bei dem das Tool sichtbar ist.

#### KV-Cache-Effekt

Präfix-stabil, solange Definition und Sichtbarkeit unverändert bleiben. Plugin-Lifecycle oder Scoped-Restriktionen können die Wiederverwendung ab diesem Schema invalidieren.

### Tool-Aufruf-Historie und Ergebnis

#### Was das Modell sieht

Die vollständigen Fragen des Modells bleiben in den Assistant-Tool-Call-Argumenten. Nach der Antwort des Menschen sieht der nächste Step kompaktes JSON in der exakten Form `{"answers":[{"id":"<id>","selected":["<label>"],"custom":"<text>"}]}`; `custom` wird weggelassen, wenn es ungenutzt ist, und `selected` kann null, ein oder mehrere Labels enthalten. UI-Interaktion, während der Aufruf aussteht, ist kein Modell-Kontext.

#### Token-Effekt

Argumente und Antwort-JSON sind datenabhängige zurückbehaltene Tokens; während des Wartens auf den Menschen entstehen keine Token-Kosten.

#### KV-Cache-Effekt

Nur anhängend; neu sichtbarer Inhalt folgt dem wiederverwendbaren Request-Präfix und macht bestehende KV-Cache-Einträge nicht ungültig.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann das Tool schlecht passt. Sie sind aktuelle Paket-Einschränkungen, kein UI-Backlog.

- **Eine ausstehende Frage blockiert den Tool-Aufruf, bis der Mensch antwortet** — das Tool deklariert kein `timeout-policy`-Budget; Abbruch läuft ausschließlich über das `exec.signal` des Turns.
- **Runtime-eigene subagents können den Nutzer nicht fragen** — `ask_user_question` lehnt ein lebendes Child, das einem anderen agent gehört, mit `DELEGATED_CALLER` ab; das Child muss die ungelöste Frage oder Entscheidung in sein Endergebnis aufnehmen. Durable Lineage entscheidet diese Grenze nicht, daher darf eine mit Lineage versehene Session, die als Runtime-Root fortgesetzt wird, normal fragen.
- **Native-Antworten rendern als JSON-Text** — der kanonische Wert bleibt strukturiert, aber das modellseitige Ergebnis verwendet kompaktes JSON statt eines reichhaltigeren Content-Block-Vokabulars.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
