---
description: "Web-ask_user_question-Feature für den dsh Web-Client: die Composer-übernehmende Fragen-UI und die Plan-Review-Approval-Card."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-user-questions

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

Wenn ein Agent im Web-Client eine Frage stellt, ersetzt dieses Paket den Chat-Composer durch eine interaktive Fragen-Oberfläche. Nutzer können sich durch Fragen bewegen, eine oder mehrere Optionen wählen, Custom-Antworten eingeben, Items überspringen und einen strukturierten Antwort-Batch absenden. Single-Choice-Auswahlen schalten sofort weiter, während Drafts die Session-Navigation für die Lebensdauer der Seite überleben. Eine einzelne Frage mit einer unterstützten Presentation-Intent kann eine dedizierte Oberfläche nutzen, einschließlich der Plan-Review-Card mit den Aktionen `Chat about it`, `Refuse` und `Approve`.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Wenn der Agent eine Frage stellt, wird der Composer zur Fragen-Oberfläche: beantworte jede Frage, navigiere mit dem Pager oder überspringe sie. Single-Select-Auswahlen schalten sofort weiter; Enter setzt den Flow fort und sendet ab, sobald jede Frage beantwortet oder übersprungen ist, während Shift+Enter stattdessen eine Zeile umbricht (während einer IME-Composition bestätigt Enter nur den Eingabekandidaten, ohne weiterzuschalten).

### Antworten

Ein Multi-Select-Draft behält seine ausgewählten Labels, während der Nutzer die Custom-Antwort öffnet oder bearbeitet, sodass das abgesendete Item sowohl `selected` als auch `custom` tragen kann; eine Single-Select-Custom-Antwort bleibt exklusiv. Der Fragen-Detailtext nutzt das `MarkdownText`-Primitiv der Assistant-Ausgabe wieder, einschließlich seines GFM-Renderings und seiner Untrusted-Content-Policy. Die höhenbegrenzte Card hält Titel, Navigation und Submit-Aktionen fixiert, während langer Detailtext und Choices eine interne Scroll-Region teilen. „Diese Frage überspringen“ behält andere Drafts und emittiert das bestehende leere `{ selected: [] }`-Ergebnis für dieses Item, während Schließen den gesamten Wait als `ASK_CANCELLED` ablehnt.

### Die Plan-Review-Card

Eine `plan-review`-Intent — von `dsh-plan-mode` am `exit_plan_mode`-Review gesetzt — rendert das Waiting-Approval-Card-Layout: einen `Plan review`-Streifen, den Plan als scrollenden Markdown-Body und eine Entscheidungszeile aus `Chat about it` / `Refuse` / `Approve`. Approve und Refuse antworten mit den eigenen Options-Labels des Fragestellers; `Chat about it` lehnt den Wait als `ASK_CANCELLED` ab und gibt den Composer zurück, damit der Nutzer stattdessen sagen kann, was er will.

### Fehler und Recovery

Der generische Fragen-Flow hält aktuelle Seite, ausgewählte Labels, Custom-Text und explizite Skips in einem nicht-persistierten Slot-Store, der auf die besitzende Session scoped und auf die lokale Render-Identität des pending Request gekeyed ist. Ein Wechsel von Session A nach B remountet den strict Composer-Eintrag, aber die Rückkehr zu A nutzt A's Store wieder und stellt den unfertigen Draft wieder her. Eine andere Request-Identität liest einen leeren Draft und ersetzt den vorherigen Wert bei ihrer ersten Bearbeitung; eine erfolgreiche Antwort oder ein Abbruch löscht den passenden Wert. Der Host bleibt maßgeblich dafür, ob der Request pending ist.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Das Paket ist eine Ownership-Regel: eine Frage zu rendern ist eine Host-UI-Capability, das Tool zu besitzen eine Agent-Capability, also gehört die `tool-ask-user`-Row zu den Presets, die sie wollen (und zur TUI-Komposition, die keine Presets hat).

### Intent-Surface-Wahl

Die Card beansprucht einen Request nur, wenn sie jede Antwort senden kann, die dieser Request erlaubt: eine Frage, die deklarierte Intent, der Plan als `detail` vorhanden, das benannte Approve-Label angeboten und eine binäre Single-Choice (höchstens eine Option neben Approve, kein Multi-Select). Alles andere bleibt im generischen Flow, der es ausdrücken kann. Eine Intent ändert das Layout, nie welche Antworten erreichbar sind.

### Copy und Locale

Die Composer-Chrome-Copy (Pager, Buttons, Placeholder, Validierungsfeedback) ist bilingual: das Plugin registriert zh/en-Dictionaries unter dem `question`-Namespace von `dsh-client-locale` und reicht dem Eintrag seinen gebundenen Translator plus die Locale-Snapshot-Source über das Inject-Face, sodass ein Locale-Wechsel einen gemounteten Composer neu rendert. Fragen- und Options-Text kommt vom Modell und wird wörtlich gerendert; Carrier-Fehlermeldungen werden ebenfalls unübersetzt angezeigt.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten behandeln den Composer-Host, den Tool-Seam und den Plan-Mode-Consumer.

- [ui-conversation](../ui-conversation/README.de.md) — die Chat-Oberfläche, die die `conversation.composer`-Kette besitzt.
- [tool-ask-user](../../interaction/tool-ask-user/README.de.md) — das modell-zugewandte Tool, dessen Schema und Antworten diese UI rendert.
- [ui-plan](../ui-plan/README.de.md) — die Plan-Mode-Oberfläche, die die `plan-review`-Intent setzt.
- [user-questions](../../interaction/user-questions/README.md) — der Host-seitige Fragen-Seam und sein Answerer-Waterfall.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über `dsh-tool-ask-user`, dessen modell-sichtbares Schema und Antwort-Rendering dieses Paket im Web-Client präsentiert.

#### KV-Cache-Effekt

Keine direkte Invalidierung; `dsh-tool-ask-user` besitzt den modell-sichtbaren Tool Call und das Result.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren Draft-Durability und Composer-Ownership; sie sind aktuelle Paket-Constraints.

- **Unsubmitted Drafts haben Page-und-Session-Lebensdauer** — Session-Navigation bewahrt sie, solange dieser Session-Scope in der Seite bleibt, aber ein voller Page-Reload, Session-Pruning oder eine neu gelieferte Pending-Request-Identität startet mit einem leeren Draft. Der Store schreibt sie nie auf den Host, in `localStorage` oder auf Disk.
- **Ein Request besitzt den Composer zur gleichen Zeit** — spätere Pending-Requests bleiben im Session-Snapshot und werden sichtbar, nachdem der frühere Request sich aufgelöst hat.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Tool- und Slot-Registrierungen sind Effects, die von ihren jeweiligen Registries besessen und beobachtet werden; die Host-Pending-Table wird über das öffentliche Wire-Protokoll getestet.
