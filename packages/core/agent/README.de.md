---
description: "Das Agent-Handle, die Live-Registry, der prozess-lokale Initiator-Scope und das agent/*-Event-Vokabular für Plugins, UI und Orchestratoren, die Agents bauen oder erweitern."
kind: "package-reference"
---

# @deepseek-ai/dsh-agent

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Mit `dsh-agent` lassen sich Live-Agents erstellen oder fortsetzen, Follow-up- oder Steering-Eingaben senden, model-sichtbaren Kontext injizieren, Arbeit canceln und auf den Idle-Abschluss warten. Plugins, UI, Hooks und Orchestratoren können Agent-Aktivität außerdem beobachten oder abfangen und Fähigkeiten auf genau einen Agent anwenden, ohne andere zu beeinflussen. Es ist die richtige Wahl, wenn Code Live-Agents über die öffentliche `Agent`-API steuern oder erweitern muss. Es wird mit einem Agent-Driver wie `dsh-agent-loop` kombiniert; das Paket erzeugt selbst keine Model-Anfragen. Die Initiator-Zuordnung ist prozess-lokal und muss über Worker, Prozesse, durable Queues und Neustarts hinweg explizit weitergegeben werden.

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

`dsh-agent` überall dort mounten, wo Live-Agents existieren: Es stellt `ctx.agents` und das `Agent`-Handle bereit, gegen das Plugins, UI, Hooks und Orchestratoren arbeiten. Der Service ist inert, bis ein Driver eine Factory registriert — der ausgelieferte Driver ist `dsh-agent-loop`, sodass die kleinste brauchbare Komposition beide lädt.

### Einen Agent erstellen oder fortsetzen

`ctx.agents.create()` baut einen frischen Agent und eine Session unter einer Identität; `ctx.agents.resume()` lädt eine persistierte Session und baut den Agent darauf neu auf. Beide delegieren an die registrierte Factory und geben ein `AgentHandle` zurück — das einzige Objekt, das diesen Agent abreißen kann. `parentAgent` in den Options einer der beiden Operationen setzen, um das Ergebnis zum Runtime-Kind zu machen; weglassen ergibt eine Runtime-Root. `get(id)`, `list()` und `roots()` finden Live-Agents, und `isOwnedBy(id, parent)` prüft diese exakte Live-Beziehung.

```text
const handle = await ctx.agents.create({
  sessionId,
  agentOptions: { provider: 'deepseek', model: 'deepseek-chat' },
})
// later:
await handle.dispose()   // stops the loop, unregisters, removes the session, unwinds the scope
```

`AgentOptions` liefert die initiale Provider/Model-Route, ein optionales adapter-eigenes `reasoningEffort` und ein optionales positives `maxTokens`-Ausgabelimit. Die Loop validiert die Reasoning-Unterstützung des exakten Modells, löst Adapter-Defaults auf, protokolliert die effektiven Werte im Anfrage-Header und wendet sie auf jede Konversationsanfrage an. Ein optionaler `setup(agentCtx, agent)`-Callback komponiert die Scoped-Welt des Agents, bevor er veröffentlicht wird: `agentCtx` besitzt Registrierungen, während der explizite, unveröffentlichte Agent seine Session bereitstellt; der Context hat keine rückwärtige Agent-Property. Scoped Tools, Prompt-Abschnitte und Listener existieren vor jeder Erstellungs-Ankündigung. Setup ist rein Komposition: Den Agent erst nach aufgelöster Erstellung treiben.

### Die Konversation eines Agent treiben

Die Methoden des Handles routen identifizierte User-Role-Nachrichten in die Inbox des Agents. `followup()` reiht einen gewöhnlichen Next-Turn-Prompt ein und weckt den Driver; `steer()` reicht Next-Step-Eingabe ein und weckt ihn; `inject()` fügt model-sichtbaren Kontext hinzu, ohne den Driver zu wecken, sodass er im nächsten zugelassenen Schritt landet. `cancel(cause)` bricht die aktive Aktivität ab und räumt — sofern `keepInbox` nicht gesetzt ist — ausstehende Arbeit ab; `whenIdle()` löst auf, sobald der gesamte Agent Quiescence erreicht.

```text
handle.agent.followup({
  content: [{ type: 'text', text: 'Summarize this workspace.' }],
  source: { kind: 'user' },
})
handle.agent.steer({
  content: [{ type: 'text', text: 'Focus on the tests.' }],
  source: { kind: 'plugin', plugin: 'my-plugin' },
})
await handle.agent.whenIdle()
```

### Registrierungen auf einen Agent scopen

`Agent.ctx` ist der Scoped-Context des Agents: Darüber vorgenommene Registrierungen (Tools, Prompt-Abschnitte, Variablen, Event-Listener, Restriktionen) gelten nur für diesen Agent und werden beim Dispose zurückgebaut. Derselbe Mechanismus gibt Agent-Presets die Möglichkeit, einer Session einen anderen Fähigkeitssatz zu geben, ohne ihre Nachbarn zu beeinflussen.

### Laufende Arbeit abfangen oder beobachten

Die `agent/*`-Events lassen Plugins auf laufende Arbeit einwirken, ohne vom Loop-Paket abzuhängen. `agent/pre-step` kann einen vorgeschlagenen Schritt ablehnen oder die in ihn eintretenden Nachrichten ersetzen; `agent/request-error` lässt einen Listener eine fehlgeschlagene Model-Anfrage wiederholen; `agent/turn-stopping` läuft, bevor eine ansonsten abgeschlossene Turn schließt, und kann per Steering offenhalten. `agent/assistant-stream` trägt die geordneten Start-, transienten Chunk- und End-Frames eines prozess-lokalen Assistant-Versuchs. Start nennt Turn und Schritt des Versuchs, Chunk-Indizes sind dicht ab null, und `end.index` ist die nächste Chunk-Position. Die Loop committet den vollständigen kompakten Stream als eine `assistant/message` oder `assistant/attempt` vor einem committed End-Frame, sodass das Live-Event Präsentationsdaten bleibt statt der Replay-Quelle. `agent/status`, `agent/created` und `agent/disposed` treiben UI- und Koordinationszustand, und die pro-Nachricht-`agent/inbox/*`-Benachrichtigungen halten Inbox-Projektionen synchron. Exakte Signaturen, Dispatch-Modi und Payload-Verträge stehen in der generierten Region der [Core-Subsystem-Seite](../../../docs/subsystems/core.de.md#cordis-surface).

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie das Paket das obige Verhalten umsetzt; der beobachtbare Vertrag ist in [Dieses Paket verwenden](#use-this-package) behandelt.

### Designkonzept

Das Paket baut auf einer Trennung auf: Die öffentliche `Agent`-Oberfläche und Registry leben hier, während Konstruktion und Treiben im Loop-Paket hinter einer registrierten Factory liegen. Consumer hängen daher von `dsh-agent` ab und niemals von `dsh-agent-loop`, womit der Driver austauschbar bleibt. Die zweite Idee ist der Initiator-Scope: eine `AsyncLocalStorage`-Kette, die den exakten Live-`Agent` durch die von ihm gestartete asynchrone Driver-Arbeit trägt, sodass Helfer unterhalb eines Drivers ihre Arbeit zuordnen können, ohne den Agent durch jeden Aufruf weiterzureichen.

### Schritt-Zulassung

`PreStepDecision` ist entweder `{ kind: 'reject' }` oder `{ kind: 'enter', messages, startsRequestSeries? }`. Der Enter-Zweig enthält den vollständigen, identifizierten, eingefrorenen Nachrichten-Batch. Zulassung committet ihn nicht: Nach Assembly und `step/start` lösen `agent/request` und `prepareCall()` die Route auf, bevor die Loop System-Prompt und User-Batch committet. Cancellation in einer der beiden asynchronen Phasen committet keines von beiden. `startsRequestSeries: true` deklariert eine eigenständige Model-Nachrichten-Serie; ein umhüllender Listener bewahrt diese Deklaration und den Batch, es sei denn, er ersetzt absichtlich eines davon. Claiming entfernt angebotene Nachrichten aus der Inbox, während nach dem Claim eingefügte Nachrichten für eine spätere Grenze ausstehend bleiben.

### Durable Inbox

`Agent.inbox` exponiert nur das strukturelle `Inbox`-Interface, und das Projektions-Vokabular bleibt in diesem Paket. dsh-agent-loop besitzt die paket-interne `ReactLoopInbox` und die Standard-`inbox`-Projektion; die Konstruktion ihrer konkreten Inbox stellt sicher, dass die Projektions-Registry genau eine Registrierung für den durable `agent/inbox/spliced`-Fold hält. Die Registry bleibt alleinige Eigentümerin des Live-`{ 'next-turn', 'next-step' }`-Zustands. Die Rekonstruktion weist unsichere oder out-of-range-Splice-Koordinaten sowie doppelte `MessageId`-Werte über beide Pending-Listen hinweg zurück und meldet die Event-seq des verletzenden Events.

`Inbox` exponiert ausstehende `nextTurn`- und `nextStep`-Nachrichten und mutiert sie über `append`, `prepend`, `replace`, `remove`, `clear` und `splice`. Gewöhnliche Entfernungen und `clear()` sind durable Cancellations. An einer Schritt-Grenze claimt die Loop-interne Implementierung ausstehende Eingabe über reine Deletion-Splices. Live-Benachrichtigungen sind bewusst pro-Nachricht und minimal: `agent/inbox/inserted { message }`, `agent/inbox/claimed { message, turn }` und `agent/inbox/discarded { message }`.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `AgentRegistry`, Factory-Slot, Initiator-Scope, `CreateAgentOptions`/`ResumeAgentOptions` |
| [`src/runtime-types.ts`](src/runtime-types.ts) | `Agent`, strukturelle `Inbox`, `AgentStatus` und die `agent/*`-Event-Deklarationen |
| [`src/types.ts`](src/types.ts) | `AgentOptions`, Cancellation-Causes und Inbox-Projektions-Vokabular |
| [`src/dispatch.ts`](src/dispatch.ts) | `agentEvents`-Fused-Dispatcher und `assembleContextFor(agent)` |
| [`src/consumed-work.ts`](src/consumed-work.ts) | `foldConsumedWork(events)`: was aus der verbrauchten Arbeit des Logs wurde |
| [`src/model-selection.ts`](src/model-selection.ts) | `installModelSelection`: eine Auswahl an Assembly und Routing koppeln |
| [`src/invariant.ts`](src/invariant.ts) | Invarianten-Companion: No-op-`agent/status`-Übergänge schlagen fehl |

### Registry und Lifecycle

`AgentRegistry` hält einen Eintrag pro Live-Agent mit dessen Träger und Erzeuger-Beziehung. `register()` protokolliert einen bereits konstruierten Agent; die asynchrone Factory nutzt das geteilte `enter()`/`announce()`-Paar, damit Setup und Publikation rollback-abgedeckt bleiben. Ein während eines Erstellungs-Dispatch angefordertes Detach wartet, bis dieser Dispatch abgewickelt ist, und jedes Detach ist an den exakten Eintrag gebunden, sodass ein veralteter Disposer keinen späteren Same-id-Ersatz entfernen kann. Die Teardown-Reihenfolge ist: Loop stoppen und entleeren, Scope abwickeln, Agent detachen, Session detachen; die id wird nach privater Bereinigung wiederverwendbar.

### Initiator-Scope

Jeder Driver läuft seine gesamte Lebensdauer innerhalb von `ctx.agents.withInitiator(agent, ...)`, sodass geerbte asynchrone Ketten diesen Agent beobachten; `withoutInitiator()` verbirgt ihn für unverwandte prozess-lokale Arbeit wie geteilte Timer. Die Grenze ist nur prozess-lokale Zuordnung — ambiente Anwesenheit ist weder Lebensnachweis noch Autorisierung, und explizite Identität bleibt an Worker-, Prozess-, Persistenz- und Wire-Grenzen maßgeblich. Teardown lehnt neue Grenzen ab, lässt zurückgegebene-Promise-Grenzen ablaufen und deaktiviert dann den zugrunde liegenden Storage. Die [Initiator-Scope-Entscheidung](../../../.agents/notes/implemented/architecture/2026-07-15-agent-initiator-scope.de.md) besitzt den detaillierten Vertrag.

### Besitz-Invarianten

Der `AgentHandle`-Disposer ist eine Fähigkeit: Unter den Consumern kann nur sein Halter den Agent abreißen. Der registrierte Factory-Provider ist struktureller Mitbesitzer, weil Scoped-Agents von dessen Service-API abhängen; Provider-Unload stoppt und entleert jedes von ihm erzeugte Live-Handle. `ctx.agents.get(id)` gibt weiterhin ein nacktes `Agent` zurück — das Handle wird nur dem Consumer exponiert, der es erstellt hat.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Der Paket-Vertrag reicht für die meisten Consumer; diese Seiten lesen, wenn die umgebende Domäne und die Design-Begründung gebraucht werden.

- [Core-Subsystem](../../../docs/subsystems/core.de.md) — die Loop-Karte, das `Agent`-Handle, Abfang-Entscheidungen und die generierte Service-API.
- [agent-loop-Paket](../agent-loop/README.de.md) — der Standard-Driver, der Agents erstellt, treibt und abreißt.
- [Session-Subsystem](../../../docs/subsystems/session.de.md) — das durable Log und die abgeleitete History hinter dem Handle.
- [Initiator-Scope-Agent-Note](../../../.agents/notes/implemented/architecture/2026-07-15-agent-initiator-scope.de.md) — der Grenz- und Teardown-Vertrag.
- [Core-Gruppenkarte](../README.de.md) — wie die Core-Pakete komponieren.

-----

<a id="model-experience"></a>
## Model Experience

### User-, Steering- und injizierte Nachrichten

#### Was das Model sieht

`followup`, `steer` und `inject` speisen die besitzende Session als identifizierte User-Role-Nachrichten; akzeptierter Inhalt wird Teil der abgeleiteten History, die das Model in späteren Schritten liest. `agent/pre-step` und die anderen deklarierten Events lassen Plugins einen vorgeschlagenen Schritt ablehnen oder durable Anfrage-Material hinzufügen. `installModelSelection` fügt dem ersten für eine andere Provider/Model-Route assemblierten Schritt, der eine Model-Anfrage senden würde, `[model changed: assistant turns above this point were generated by <previous>; the session continues with <next>]` hinzu; Provider-Namen erscheinen nur, wenn der Wechsel Provider überspannt, und reine Reasoning-Effort-Änderungen fügen nichts hinzu. Eine leere erste Entscheidung und eine Entscheidung, die angebotene Nachrichten entfernt, bleiben No-Request-Ergebnisse. Schlägt ein Anfrage-Schritt fehl, bevor er seinen Header protokolliert, erhält der nächste Anfrage-Schritt den Hinweis erneut, weil sich die durable vorherige Route nicht geändert hat.

#### Token-Auswirkung

Akzeptierter Inhalt wird behaltene History oder ein wiederholtes Session-Präfix; blockierter Inhalt trägt keine Anfrage-Tokens bei. Jede emittierte Model-Wechsel-Notiz fügt ihren Text der behaltenen History hinzu. Die Größe ist aufrufer- und plugin-abhängig.

#### KV-Cache-Auswirkung

Akzeptierte History und Steering sind Append-only; eine blockierte Einreichung sendet keine Anfrage. Ein Session-Präfix bleibt innerhalb seiner Loop-Instanz stabil, während eine neue oder fortgesetzte Instanz ein anderes Präfix etablieren kann.

### Agent-scoped Anfrage-Komposition

#### Was das Model sieht

Registrierungen über `agent.ctx` können Prompt-Abschnitte oder Tools überlagern und während des unveröffentlichten Setups Agent-exklusive Interceptoren installieren, sodass ein Agent einen anderen Prompt und einen anderen Tool-Satz sieht als seine Nachbarn. Die Model-Auswahl erfasst einen Provider/Model/Effort-Wert vor der Prompt-Assembly und wendet ihn auf die Anfrage desselben Schritts an; eine spätere gleichzeitige Änderung wartet auf einen anderen Schritt.

#### Token-Auswirkung

Jeder Provider/Model-Wechsel fügt eine kurze behaltene User-Role-Notiz hinzu. Andere Scoped-Beiträge betreffen nur diesen Agent und verschwinden beim Dispose.

#### KV-Cache-Auswirkung

Die Wechsel-Notiz hängt nach der bisherigen History an und bewahrt dieses Präfix, während die Routen-Änderung verhindern kann, dass der neue Provider oder das neue Model es wiederverwendet. Setup oder Reload, das Prompt-Abschnitte, Tool-Definitionen oder Anfrage-Listener ändert, kann die Wiederverwendung ab dem ersten betroffenen Anfrage-Token ungültig machen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann das Paket besondere Sorgfalt braucht. Sie sind aktuelle Paket-Einschränkungen, kein Aufgaben-Backlog.

- **Der Initiator-Scope ist prozess-lokal** — Worker, Kindprozesse, HTTP, durable Queues und Neustarts müssen jede benötigte Identität explizit materialisieren.
- **Ambiente Identität kann die Lebendigkeit überdauern** — Consumer prüfen weiterhin `agent.status`, Cancellation und den Vertrag der besitzenden Fähigkeit vor lebenszyklus-sensibler Arbeit.
- **`agent/session-start` kann den Start nicht gaten** — es bleibt eine synchrone, veto-lose Benachrichtigung; asynchrone Komposition, die vor Publikation fertig sein muss, gehört stattdessen in die `setup(agentCtx, agent)`-Transaktion der Factory.
- **`cancel()` leert standardmäßig die Inbox** — es bricht die laufende Turn sowie eingereihte und Steering-Arbeit ab; `cancel(cause, { keepInbox: true })` bricht nur die Turn ab und bewahrt ausstehende Elemente, und es gibt keinen reinen Schritt-Abbruch, der die Turn weiterlaufen lässt.
- **Jede zusätzliche `UserMessage` trägt genau eine `MessageSource`** — Beiträge mehrerer Plugins, die auf einer Nachricht zusammengeführt werden, fallen unter eine Quelle zusammen, sodass die Nachricht nicht mehrere Produzenten nennen kann.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer; sie ist ausdrücklich nicht autoritativ. Offene, unentschiedene Richtungen: Inter-Agent-Kanäle jenseits von Delegation — geteilter Zustand, gestreamte Kind-Ausgabe und Hintergrund- oder Poll-Semantik bleiben außerhalb des aktuellen Delegations-Seam; und die `SessionStartSource`-Werte `'clear'`/`'compact'` sind ohne bisherigen Emitter reserviert, bis die treibenden Subsysteme vorliegen.

</details>
