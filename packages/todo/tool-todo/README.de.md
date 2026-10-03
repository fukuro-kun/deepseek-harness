---
description: "Das modellseitige todo_write-Tool über dem DeepSeek-Harness-Session-Log: Ganz-Listen-Ersetzung, Per-Session-Ownership und die todos-Projektion, für Nutzer und Maintainer, die das Tool wählen, konfigurieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-todo
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`dsh-tool-todo` gibt dem Agent eine strukturierte Aufgabenliste zum Planen: Zerlege Mehrschritt-Arbeit in konkrete Aufgaben, markiere die Aufgabe, an der du arbeitest, und hake Aufgaben ab, wenn sie fertig werden. Die Liste überlebt Turns und wieder geöffnete Sessions, sodass Agent und UI immer den neuesten Plan sehen. Ein Config-Flag entscheidet, ob mehrere Aufgaben gleichzeitig in Arbeit sein dürfen — für Agents, die Arbeit parallel ausführen. Setze es überall ein, wo ein Agent eine sichtbare Aufgabenliste führen soll; jedes Update ersetzt die ganze Liste, und nur die besitzende Agent-Session kann sie ändern.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Modell-Erfahrung](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev-Notiz](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Verwende dieses Paket, wenn der Agent während der Arbeit eine sichtbare Aufgabenliste führen soll: Mehrschritt-Arbeit planen, zeigen, was aktiv ist, und Abschluss aufzeichnen. Es mit dem Parallelismus-Flag zu mounten ist das einzige Setup; der Agent aktualisiert die Liste dann über sein eigenes Planning-Tool, wann immer sich der Plan ändert.

### Wann es wählen

Wähle es, wenn eine Agent-Session die Aufgabenliste besitzen soll und Ganz-Listen-Updates ausreichen — die übliche Form für Planning-Tools. Vermeide es, wenn mehrere Agents eine Liste teilen müssen oder wenn du Per-Item-Edits brauchst: Die Liste gehört einem Agent, und jedes Update ersetzt die ganze Liste. Es braucht überhaupt eine Agent-Session; reine Automatisierungs-Oberflächen, die nie einen Agent laufen lassen, können es nicht nutzen.

### Minimale Konfiguration

`allowParallelInProgress` ist Pflicht ohne Default: Eine Komposition, die es weglässt, schlägt beim Laden fehl, und ein Nicht-Boolean-Wert wird abgelehnt. Setze `true` für Agents, die Arbeit konkurrierend ausführen können (Subagents, Background-Commands, Workflow-Fan-out), und `false` für die Single-Active-Disziplin.

```yaml
- name: '@deepseek-ai/dsh-tool-todo'
  config:
    allowParallelInProgress: true
```

| Feld | Default | Bedeutung |
|---|---|---|
| `allowParallelInProgress` | Pflicht | Ob mehrere Todos gleichzeitig `in_progress` sein dürfen; wählt zugleich die Active-Status-Klausel der Modell-Beschreibung |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-tool-todo) ist die erschöpfende Quelle für das akzeptierte Feld.

### Was jeder Call tut

Der Agent sendet bei jedem Update die GESAMTE Liste; die neue Liste ersetzt die vorherige, es gibt also keine Teil-Updates oder Per-Item-Edits. Jedes Item ist eine kurze Aufgabenbeschreibung plus einem Status von `pending`, `in_progress` oder `completed`. Ein erfolgreiches Update liefert die neuen Zähler — `Updated todo list: <pending> pending, <inProgress> in progress, <completed> completed.` — und die UI zeigt den neuen Plan. Updates schlagen sichtbar fehl, wenn eine Aufgabenbeschreibung leer oder doppelt ist, wenn ein Item Felder jenseits von Beschreibung und Status trägt oder — bei deaktivierter Parallelarbeit — wenn mehr als eine Aufgabe als in Arbeit markiert ist.

### Einzelner Owner

Die Aufgabenliste gehört der einen Agent-Session, die sie erzeugt hat — Subagents und andere Agents führen jeweils ihre eigene Liste, und es gibt keinen Weg, eine Liste zwischen Agents zu teilen. Ein Call von außerhalb einer Agent-Session wird abgelehnt, sodass der Agent erfährt, dass das Update fehlgeschlagen ist, statt still ins Nichts zu schreiben. Wenn du eine agent-übergreifend geteilte Liste brauchst, liefert dieses Paket sie nicht.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter dem Tool und zeigt auf den Code, der sie umsetzt; das beobachtbare Verhalten deckt [Dieses Paket verwenden](#use-this-package) vollständig ab.

### Designphilosophie

Das Tool baut auf vier Zusagen auf:

- **Ganz-Listen-Replace, Log-getragener Zustand.** Das Modell sendet die ganze Liste erneut; der `todo/write`-Snapshot lebt auf dem event-sourced Session-Log, sodass Durability, Replay und Resume-Rekonstruktion aus dem Log kommen statt aus einem Service.
- **Einzelner Owner.** Die Liste gehört der aufrufenden Agent-Session; es gibt keinen Shared- oder Swarm-Scope, und Nicht-Agent-Caller werden abgelehnt.
- **Deployment-Policy, keine codierte Regel.** `allowParallelInProgress` ist eine Pflicht-Kompositionswahl, weil das Tool Laufzeit-Konkurrenz nicht beobachten kann; die Durable-Log-Invariante schweigt bewusst zur Active-Count, damit ein unter einer Policy geschriebenes Log unter einer anderen noch replayt.
- **Validierung hält den geloggten Snapshot ehrlich.** Schema-Level-Ablehnung unbekannter Keys und `execute`-Level-Ablehnung leeren oder doppelten Contents halten den durable Snapshot gleich dem, was das Modell glaubt geschrieben zu haben.

Die [todo_write-Tool-Agent-Note](../../../.agents/notes/archived/feature/2026-06-29-todo-write-tool.md) protokolliert das ursprüngliche Design und die Alternativen; die [Parallel-In-Progress-Agent-Note](../../../.agents/notes/archived/feature/2026-07-26-todo-parallel-in-progress.md) protokolliert die Policy-Entscheidung.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `Config`-Schema, Tool-Registrierung, `todos`-Projektions-Unit |
| [`src/types.ts`](src/types.ts) | Das eine Zuhause der `todos`-Projektions-Key-Deklaration und ihrer Payload-Typen |
| [`src/client.ts`](src/client.ts) | Client-Namespace-Re-Export des Typen-Outlets |
| [`src/invariant.ts`](src/invariant.ts) | Invarianten-Begleiter: validiert durable Ganz-Listen-Snapshots und Open-Turn-Ownership |

### Export-Form

Das Plugin ist ein Function-/Namespace-Plugin: Es exportiert `name` / `inject` / `apply` und keinen Default-Export. Ein verirrtes `export default` ließe `unwrapExports` des Loaders das Modul kollabieren und `inject` fallen (siehe [Postmortem 0001](../../../docs/postmortem/0001-acp-default-export-drops-inject.de.md)).

### Session-Projektion

Wenn die Komposition `ctx.sessionProjections` mountet ([`@deepseek-ai/dsh-session-projection`](../../session/session-projection/README.de.md)), registriert dieses Paket die `todos`-Unit auf einem injizierten Child: Die Projektion ist der stehende Plan — die neueste ganze `todo/write`-Liste, `null` vor dem ersten Write, geleert beim Start des nächsten Turns, während `turn/end` die fertige Checkliste sichtbar hält. Der Key merged hier in `SessionProjectionMap`; Carrier liefern den Wert auf der History-Tail-Page und im `session/projection`-Push-Frame. Kompositionen ohne die Registry sind unbetroffen; siehe [src/index.ts](src/index.ts) für die Unit-Registrierung.

### Durable-Log-Invariante

Der Invarianten-Begleiter registriert sich auf `ctx.invariants`, validiert bestehende und neu angekündigte Sessions einmal und fährt dann eine committed Per-Session-Turn-Trace für Live-Appends fort. Er lehnt malformed Einträge, leeren oder doppelten Content, unbekannte Status und jedes durable `todo/write` außerhalb eines offenen Turns ab; Core-Session behandelt declaration-merged Events generisch, während dieses produzierende Paket die todo-spezifischen Regeln besitzt. Er sagt bewusst nichts darüber, wie viele Items `in_progress` sind, denn das ist die Per-Deployment-Policy des Tools, keine Durable-Data-Regel.

### Call-Mechanik

Jeder Call validiert die eingereichte Liste gegen das Schema, lehnt inkohärente Eingabe ab und hängt bei Erfolg den vollständigen Snapshot als `todo/write`-Session-Event an und liefert die neuen Zähler; die aktuelle Liste ist immer das jüngste `todo/write` im Log (Last-Write-Wins beim Replay). Siehe [src/index.ts](src/index.ts) für die exakten Validierungs- und Append-Schritte.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Level-Vertrag nicht reicht. Sie bewegen sich vom Session-Subsystem zu den generierten Katalogen und den Entscheidungs-Records hinter dem Tool.

- [Todo-Subsystem](../../../docs/subsystems/todo.de.md) — das `todo/write`-Event-Payload, Ownership-Regeln und `TodoItem`.
- [Todo-Gruppenkarte](../README.de.md) — die Sibling-Gruppenseite und ihre Paket-Tabelle.
- [Generierter Tool-Katalog](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-todo) — das `todo_write`-Schema, das das Modell erhält.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-tool-todo) — jedes akzeptierte Config-Feld und seine Quelldeklaration.
- [todo_write-Tool-Agent-Note](../../../.agents/notes/archived/feature/2026-06-29-todo-write-tool.md) — das ursprüngliche Design, Alternativen und gestrichene Felder.
- [Parallel-In-Progress-Agent-Note](../../../.agents/notes/archived/feature/2026-07-26-todo-parallel-in-progress.md) — warum das Active-Count-Cap eine Deployment-Policy ist.

-----

<a id="model-experience"></a>
## Modell-Erfahrung

### Tool-Schema

#### Was das Modell sieht

Das Modell sieht das generierte [`todo_write`-Schema](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-todo): ein Objekt mit einem erforderlichen `todos`-Array aus `{ content, status }`-Items, wobei `status` `pending`, `in_progress` oder `completed` ist. Die Beschreibung ist die komponierte Ganz-Listen-Instruktion, deren Active-Status-Klausel `allowParallelInProgress` folgt.

#### Token-Effekt

Feste Schema-Kosten bei jedem Request, in dem das Tool sichtbar ist; Beschreibung und Schema sind für eine gegebene Konfiguration stabil.

#### KV-Cache-Effekt

Präfix-stabil, solange Definition und Sichtbarkeit unverändert sind. Plugin-Lifecycle oder Scoped-Restriktionen können die Wiederverwendung ab diesem Schema invalidieren.

### Tool-Call-Historie und -Result

#### Was das Modell sieht

Jeder Assistant-Tool-Call behält die ganze Ersetzungsliste in seinen Argumenten. Erfolg liefert exakt `Updated todo list: <pending> pending, <inProgress> in progress, <completed> completed.` Stabile Fehler sind ``Error: invalid todo: `content` must be a non-empty string``, `Error: invalid todos: duplicate content "<content>"`, `Error: todo_write requires an owning agent session` und — nur wo das Deployment `allowParallelInProgress: false` gesetzt hat — `Error: invalid todos: at most one task may be in_progress (got <n>)`. Das vollständige `todo/write`-Session-Event ist UI- und Replay-Zustand, keine zweite Modell-Message.

#### Token-Effekt

Das Token-Wachstum skaliert mit jeder vollen Liste, die das Modell einreicht, und diese Call-Argumente bleiben bis zur Compaction. Das Result selbst ist klein und von fester Form.

#### KV-Cache-Effekt

Append-only; neu sichtbarer Inhalt folgt auf das wiederverwendbare Request-Präfix und invalidiert keine bestehenden KV-Cache-Einträge.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann das Tool schlecht passt. Sie sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Nur Single-Owner-Scope** — die Liste gehört der einen aufrufenden Agent-Session; Subagent-, Shared- und Swarm-Scopes sind ein bewusster Schnitt, und ein Nicht-Agent-Caller wird abgelehnt.
- **Die Item-Form ist bewusst minimal** — `content` plus drei-Zustands-`status`; Ganz-Listen-Ersetzung braucht keine stabile ID, Priorität oder Active-Form-Felder.
- **Ganz-Listen-Ersetzung ist die einzige Operation** — keine Teil-Updates, kein Read-Back-Tool und keine Per-Item-Edits; das Modell muss bei jedem Call die ganze Liste erneut senden.

<a id="dev-note"></a>
### Dev-Notiz

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen</summary>

Diese Dev-Notiz ist Arbeitskontext für Maintainer: offene Fragen und Richtungen, die nicht entschieden sind. Sie ist explizit nicht-autoritativ — ausgeliefertes Verhalten, Grenzen und akzeptierte Begründungen leben in den Abschnitten oben, im Paket-Code und in den verlinkten Agent Notes.

#### Zukunft: Agent-übergreifende und geteilte Listen

Der Single-Owner-Scope ist ein bewusster Schnitt, und Agent-übergreifende oder geteilte Listen bleiben ein separates Zukunftsdesign: Sie bräuchten Per-Item-Log-Deltas und explizite Scope-Auswahl und würden den modellsichtbaren Vertrag ändern. Es existiert noch kein Design.

</details>
