---
description: "Der Standard-Agent-Treiber für Nutzer und Maintainer, die auswählen, konfigurieren oder debuggen, wie Agents erstellt werden und wie Turns und Steps laufen."
kind: "package-reference"
---

# @deepseek-ai/dsh-agent-loop
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`dsh-agent-loop` erstellt frische Agents oder nimmt persistierte Sessions wieder auf und treibt dann jeden Turn über Modell-Requests, gestreamte Antworten, Tool-Ausführung und durable Session-Historie. Mounten Sie es für Standard-Agent-Kompositionen; deklarative Einträge starten Agents beim Boot, während die öffentliche `ctx.agents`-API programmatisches Erstellen und Resume unterstützt. `maxParallelToolCalls` begrenzt gleichzeitige parallel-sichere Calls, und exklusive Calls behalten ihre Reihenfolge. Abbruch bewahrt bereits an den Nutzer gestreamten Text. Wählen Sie eine eigene `Agent`-Implementierung nur, wenn der Standard-Lifecycle "Modell aufrufen, Tools ausführen, wiederholen" nicht ausreicht.

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

Mounten Sie `dsh-agent-loop` in jeder Komposition, die Agents ausführen soll. Es liefert den Treiber hinter `ctx.agents` und startet alle Agents, die Sie in seiner Config deklarieren; sowohl [`dsh-base`](../../bundle/base/README.de.md) als auch [`dsh-sdk-minimal`](../../bundle/sdk-minimal/README.de.md) mounten es als explizite Zeile.

### Deklarative Agents konfigurieren

In der Config deklarierte Agents starten automatisch, wenn das Plugin lädt. Jeder Eintrag braucht ein `id`-Label; ein Modell-Call erfordert zusätzlich sowohl `provider` als auch `model` (`agent/request` kann ein fehlendes Paar vor dem Dispatch ergänzen).

```yaml
- name: '@deepseek-ai/dsh-agent-loop'
  config:
    maxParallelToolCalls: 10
    agents:
      - id: 'main'
        provider: deepseek
        model: deepseek-chat
        reasoningEffort: high
        cwd: /workspace
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `maxParallelToolCalls` | `10` | Parallel-sichere Tool-Calls in Flight pro Step; `1` ist seriell |
| `agents[].id` | erforderlich | Stabiles Label; eine frische Session prägt `${id}-session-<uuid>`, sofern `sessionId` nicht gesetzt ist |
| `agents[].provider` / `agents[].model` | — | Modell-Route; beide vor dem Dispatch erforderlich |
| `agents[].reasoningEffort` | — | Nicht-leerer initialer Reasoning-Effort; `agent/request` kann ihn überschreiben |
| `agents[].maxTokens` | — | Positive Output-Token-Obergrenze pro Request |
| `agents[].cwd` | — | Workspace-Verzeichnis für eine frische Session |
| `agents[].sessionId` | — | Exakte Identität: erste Verwendung erstellt, ein Remount nimmt materialisierte Historie wieder auf |
| `agents[].resumeSessionId` | — | Diese persistierte Session laden statt eine zu erstellen; schließt `sessionId` gegenseitig aus |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-agent-loop) ist die erschöpfende Quelle für jedes akzeptierte Feld. Der Adapter validiert den effektiven Reasoning-Effort, und der Loop zeichnet ihn im Request-Header auf. `maxParallelToolCalls` ist zugleich der gesamte `agent-loop`-Settings-Abschnitt, sodass ein User-Layer über diesem Eintrag die nächste Tool-Gruppe ohne Neustart begrenzt.

### Agents programmatisch erstellen oder wiederaufnehmen

Plugins und Hosts erstellen Agents über `ctx.agents.create()` und nehmen persistierte Sessions über `ctx.agents.resume()` wieder auf; beide geben ein `AgentHandle` zurück, dessen `dispose()` den exakten Teardown besitzt. Der Loop führt jeden erstellten Agenten zu Ende — das Handle wird nur gebraucht, wenn der Aufrufer den Agenten selbst abreißen muss.

```text
const handle = await ctx.agents.create({
  sessionId,
  agentOptions: { provider: 'deepseek', model: 'deepseek-chat' },
  setup: (agentCtx, agent) => { /* scoped registrations plus explicit unpublished Agent */ },
})
```

Jede Inbox-Mutation committet ein normalisiertes `agent/inbox/spliced`-Event. Die Projektions-Registry folded dieses Event synchron, sodass die Live-Projektion den Splice widerspiegelt, wenn `Session.append()` zurückkehrt. Einfügungen, Bearbeitungen, Entfernungen, Claiming und Abbruch replayen über dieselben Standard-Splice-Koordinaten. Gewöhnliche Entfernungen tragen `outcome: 'canceled'` und emittieren `agent/inbox/discarded { message }`; Claiming verwendet reine Deletionen ohne Outcome und emittiert `agent/inbox/claimed`. Jede Einfügung emittiert `agent/inbox/inserted { message }`. `MessageId` bleibt über beide Pending-Listen eindeutig. Consumer, die eine entfernte Nachricht brauchen, verwenden die Claimed- oder Discarded-Notification, statt sich auf eine Pre-Splice-`session/event`-Sicht zu verlassen.

### Was ein Step tut

Jeder Step sendet die abgeleitete Historie der Session — mit dem jüngsten nicht-leeren `system/message`-Knoten als effektivem Prompt, oder ohne Systemnachrichten, wenn der gerenderte Prompt leer ist — und ihre sichtbaren Tool-Schemas; die Tool-Calls des Modells laufen durch die bewachte Tool-Pipeline, und jede akzeptierte Tatsache wird an das Session-Log angehängt, bevor der nächste Step daraus ableitet. Parallel-sichere Calls dürfen sich bis zu `maxParallelToolCalls` überlappen; exklusive Calls laufen allein als Ordnungsbarrieren. Abbruch ist kooperativ: `agent.cancel()` bricht die aktuelle Aktivität ab und räumt, sofern `keepInbox` nicht gesetzt ist, ausstehende Arbeit; ein abgebrochener Stream finalisiert den bereits an den Nutzer gelieferten Text.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie das Paket das obige Verhalten umsetzt; der beobachtbare Vertrag ist in [Dieses Paket verwenden](#use-this-package) behandelt.

### Design-Konzept

Das Paket ist die eine konkrete Implementierung des öffentlichen `Agent`-Vertrags. Es registriert sich selbst als `AgentFactory` auf `ctx.agents`, sodass Consumer dieses Paket nie importieren; die Eigentümerschaft jedes erstellten Agenten liegt bei der Caller-Fiber und dem Loop-Provider und konvergiert auf einer memoisierten Quiescence-Grenze. Jeder beobachtbare Effekt geschieht über Session-Events und die `agent/*`-Taxonomie — Paketinterna sind nie Teil der öffentlichen Oberfläche.

### Request-Header und Adapter-Defaults

Nach `agent/request` validiert `ctx.llm.prepareCall()` adapter-eigene Felder und löst Reasoning-Effort- und Output-Token-Defaults unter dem aktiven Turn-Signal auf. Der Loop behält exakt diesen Adapter durch Auflösung, `request/header`-Logging und Dispatch. Er schreibt einen vollständigen Header für den ersten Request, einen geänderten Envelope (Config oder Tools — der Prompt ist nicht Teil des Headers), einen expliziten Message-Series-Start, einen Request nach Surface-Ersetzung (eine In-place-Prompt-Ersetzung oder Compaction) und Resume; unveränderte Steps, Retries und gewöhnliche spätere Turns in derselben Series erben den jüngsten Header, und ein In-History-Prompt-Append ist keine Ersetzung, sodass auch der folgende Request den Header erbt. Neben dem Header loggt der Loop `request/context` — Provider, Model, `contextWindow` und den `systemPromptUpdate`-Modus der Route aus `prepareCall()` — nur wenn eines davon vom jüngsten Snapshot abweicht. Vor dem nächsten Waterfall entfernt der Loop Adapter-Default-Felder, sodass die aktuelle Route sie erneut auflöst, während explizite Settings persistieren. Eine unbehandelte Route scheitert weiterhin mit `NO_ADAPTER`.

Der Loop friert die Identität jeder abgeleiteten Nachricht bei ihrem ersten Request tief ein und verwendet diesen Nachweis nur innerhalb desselben Agenten wieder. Wiederhergestellte Nachrichten behalten ihre Identität; die Request-Konstruktion friert ihre enthaltenden Event-Wrapper nicht ein. Jeder Request friert seinen lokalen kanonischen Header, das frische Nachrichten-Array und den Envelope ein, während das Abbruchsignal lebendig bleibt. Die [Request-Freeze-Entscheidung](../../../.agents/notes/implemented/simplification/2026-09-06-agent-request-freeze-provenance.de.md) erklärt Eigentümerschaft und Messung.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `AgentLoop`-Service, Config-Schema, deklarativer Agent-Start, Factory-Registrierung |
| [`src/agent.ts`](src/agent.ts) | Der konkrete `ReactLoopAgent`-Treiber: Inbox, Turn-/Step-Maschine, Abbruch |
| [`src/inbox.ts`](src/inbox.ts) | Paketinterne `ReactLoopInbox`: durable Projektion, strukturelle Kommandos und loop-exklusiver Claim-Zustand |
| [`src/tool-calls.ts`](src/tool-calls.ts) | Tool-Scheduling: exklusive Barrieren und der begrenzte Parallel-Pool |
| [`src/runtime-context.ts`](src/runtime-context.ts) | Pro-Step-Runtime-Context-Snapshot-Behandlung |
| [`src/constants.ts`](src/constants.ts) | `DEFAULT_MAX_PARALLEL_TOOL_CALLS` |
| [`src/invariant.ts`](src/invariant.ts) | Invarianten-Begleiter: Request-Rekonstruktion aus dem Session-Log |

### Erstellung und Teardown

Erstellung ist eine rollback-gedeckte Transaktion: private Session, konkreten Agenten und gescopten Context konstruieren; optionales Setup mit getrennt übergebenem Context und Agent awaiten; beide Registries betreten; `session/created` dann `agent/created` ankündigen; `agent/session-start` emittieren; erst dann den Treiber starten. Ein Caller, der ein Runtime-Child erstellt, setzt `options.parentAgent`; der Caller-Context besitzt separat die Transaktion und das Live-Handle. Ein Setup-Throw, ein Commit-Fehler oder Owner-Disposal rollt die Transaktion zurück, ohne eine der beiden IDs zu veröffentlichen. Teardown führt Stop-and-Drain aus, schließt den Schreibpfad der Session, wickelt den Scope ab, detacht den Agenten, dann detacht die Session, und jedes Detach ist an das exakt betretene Objekt gebunden, sodass ein veralteter Disposer keinen späteren gleichnamigen Ersatz entfernen kann.

### Persistenz-Integration

Der Loop ist der produktive Akquisitionspunkt für Session-Write-Handles. Wenn `ctx.sessionPersistence` gemountet ist, rufen `create`/`createAgent` `persistence.create(header)` — sie speichern die durable Identität und nehmen Schreib-Eigentümerschaft vor der Veröffentlichung — und hängen den Konstruktor-Seed über das Handle an; `resume` ruft zuerst `persistence.open(id, 'write')` (was ein gleichzeitiges Resume derselben ID ausschließt), liest das physisch gültige Log über das Handle und hängt `interruptedTurnClosers` für ein mitten im Turn abgestürztes Log als gewöhnlichen Batch an — semantische Crash-Reparatur ist Aufgabe der Agent-Schicht, nicht ein Storage-Einstiegspunkt. Unmittelbar vor der Veröffentlichung speichert `appendUnstoredSuffix` alle während des Setup-Fensters angehängten Events (Seed-Marker, Delegation-Policy-Records), die nie über `session/event` erneut emittiert werden. Nach der Veröffentlichung routet das gemountete Backend die `session/event`-Batches, `session/flush`-Barrieren und `session/disposed`-Ruhestellung der Session per Session-ID in das aktive Write-Handle; der Loop berührt Storage nur über das Handle, das er besitzt. Der memoisierte Teardown schließt das Handle — Close drained jeden gerouteten Buffer — nachdem der Loop die abschließenden Events der Session committed hat, und gibt so nachweisbar die Schreib-Eigentümerschaft frei. Ohne Backend sind Sessions nur im Speicher, und sonst ändert sich nichts.

### Turn- und Step-Fluss

Der Treiber besitzt einen Agenten für dessen Lebensdauer und läuft innerhalb von `ctx.agents.withInitiator(agent, ...)`. Sein paketinterner `ReactLoopInbox`-Konstruktor registriert die Standard-`inbox`-Projektion auf dem Agent-Scope und verwendet diese Projektion dann für strukturelle Kommandos und loop-exklusive Claims. Registry-Referenzzählung hält den geteilten Schlüssel aktiv, bis der letzte Agent-Scope entlädt. An einer Turn-Grenze öffnet er den durable Turn und claimt dann atomar ausstehenden Next-Step-Input plus einen gequeueten Prompt; zwischen Steps claimt er nur Next-Step-Input. Der Treiber assembliert Prompt und Tools, projiziert Runtime-Kontext und führt `agent/pre-step` aus. Eine abgelehnte Entscheidung oder ein leerer erster Batch öffnet keinen Step. Beim ersten Versuch nach der Annahme geht `step/start` dem `agent/request`-Waterfall und `prepareCall()` voraus; keine der beiden async Phasen sieht den ausstehenden System-Prompt oder die akzeptierten Users in die Historie committet, und ein Abbruch während einer der beiden committet keines von beidem. Für jeden Versuch reconciliert der Loop dann synchron den gerenderten Prompt gegen die überlebenden `system/message`-Knoten unter Verwendung der Prepared-Call-Capability, hängt den akzeptierten `user/message`-Batch nur beim ersten Versuch an, loggt Header und Kontext nach Bedarf und leitet den Request ab und friert ihn ein, bevor er über diesen gebundenen Prepared Call streamt. Retries verwenden dieselbe gerenderte Assembly wieder, ohne Assembly, `agent/pre-step` oder User-Admission zu wiederholen. Die Reconciliation sieht Pre-Step- und Retry-Compaction; eine gebrochene Series konsolidiert den Prompt am Head, statt nach bereits committeten Users ein Update anzuhängen. Der Request ist `header.config`, `deriveMessages()` und `header.tools`; er trägt kein `system`-Feld. Jeder Modellversuch emittiert ein prozesslokales `start`, emittiert jedes `chunk` erst nach der zugehörigen durable Assistant-Frame-Abrechnung und emittiert exakt ein terminales `end`; ein Fehler bei finaler Assembly oder Message-Append rechnet es als `aborted` ab, während `committed` auf die durable `assistant/message` folgt. Jeder erfolgreiche Modell-Call hängt einen Message-Anchor an, und ein abgebrochener Stream hängt einen `interrupted: true`-Anchor mit dem gelieferten Präfix an, sodass der nächste Request enthält, was der Nutzer gesehen hat. Innerhalb eines Steps bilden exklusive Calls Barrieren, und parallel-sichere Calls nutzen den begrenzten Roll-Pool; Policy, durable Ergebnisse und Ergebniskontext bewahren die Modellreihenfolge.

Prompt-Admission verwendet das tatsächliche `prepareCall()`-Ergebnis, nicht das vorangehende `request/context`. Ohne System-Knoten wird sogar ein leerer Prompt angehängt (Knoten 0 wird reserviert, ohne eine Wire-Nachricht zu erzeugen). Auf einer incapablen Route oder bei einer neuen Request-Series wird ein nicht-leeres Rendering am ersten System-Knoten konsolidiert: Jeder nicht-leere spätere System-Knoten erhält eine geloggte leere Ersetzung pro Knoten, dann wird der Head bei Bedarf neu geschrieben. Dormant leere Tails brauchen keine Ersetzung und bestimmen den effektiven Text nicht. Konsolidierung gilt auch dann, wenn der jüngste effektive Text unverändert ist. Bei einer fortlaufenden `in-history`-Series erzeugt ein unveränderter effektiver Prompt kein Event, und eine nicht-leere Änderung hängt an. Ein leeres Rendering räumt jeden nicht-leeren späteren System-Knoten durch eine geloggte leere Ersetzung pro Knoten ab, dann leert es bei Bedarf den Head — unabhängig von Route oder Series-Zustand. Es bleiben keine älteren Anweisungen modellsichtbar. Ein leerer Head ohne aktiven späteren System-Knoten bedeutet kein Prompt; wiederholte Clears und Resume lassen ihn leer. Ein wiederhergestellter nicht-leerer Prompt folgt derselben Route-/Series-Regel: Eine fortlaufende capable Route darf ihn anhängen, während eine incapabele Route oder neue Series den Head neu füllt. Ein Step startet eine Series, wenn die Pre-Step-Entscheidung `startsRequestSeries` deklariert, wenn sich die Surface-Replace-Generation seit Attachment oder dem letzten Request geändert hat (Compaction oder irgendeine Ersetzung), oder wenn sich sichtbare Tool-Schemas geändert haben. Resume und ein reiner Provider- oder Modell-Wechsel setzen die Series fort; die Prepared Route regelt weiterhin die Admission. Leere Ersetzungen pro Knoten bewahren dazwischenliegende Historie ohne eine Surface-Delete-Operation.

### Fehler und Abbruch

Finale Adapter-Auswahl-, Dispatch- und Iterationsfehler kommen als terminale Finishes an und gehen in `agent/request-error` ein; ein behandelnder Listener gibt `{ kind: 'retry' }` zurück, ohne `next()` aufzurufen, während ein unbehandelter Fehler terminal ist. Middleware-, Ergebnisverarbeitungs-, Tool- und andere Extension-Fehler bleiben geworfen und schließen den Turn direkt — ein Plugin-Fehler beendet den Turn, nicht den Loop. Nicht-dispatchen Modell-Tool-Calls nach Abbruch erhalten synthetische `tool/call`- plus `ABORTED_BEFORE_DISPATCH`-Ergebnispaare. Die [Explicit-Cancellation-Entscheidung](../../../.agents/notes/implemented/architecture/2026-07-16-explicit-turn-cancellation.de.md) besitzt den Signal-Lifecycle.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Der Paketvertrag reicht für die meisten Consumer; lesen Sie diese Seiten, wenn Sie das umgebende Domänenwissen und die Design-Begründung brauchen.

- [Agent-Paket](../agent/README.de.md) — das `Agent`-Handle, die Registry und die `agent/*`-Events, die dieser Loop implementiert.
- [Core-Subsystem](../../../docs/subsystems/core.de.md) — der Turn-Fluss und die Interception-Entscheidungen.
- [Session-Subsystem](../../../docs/subsystems/session.de.md) — das durable Log, in das der Loop schreibt und aus dem er ableitet.
- [Tools-Subsystem](../../../docs/subsystems/tools.de.md) — die Pipeline, über die der Loop dispatchen.
- [Explicit-Cancellation-Agent-Note](../../../.agents/notes/implemented/architecture/2026-07-16-explicit-turn-cancellation.de.md) — Signal-Lebensdauer und Abbruch-Races.
- [Core-Gruppenkarte](../README.de.md) — wie die Core-Pakete zusammenwirken.

-----

<a id="model-experience"></a>
## Model Experience

### Vollständiger Konversations-Request

#### Was das Modell sieht

Für jeden Step sendet der Loop die abgeleiteten Nachrichten der Session und die sichtbaren Tool-Schemas. Nicht-leere `system/message`-Knoten tragen den Prompt, der jüngste ist die effektive Version; ein leeres Rendering räumt alle Prompt-Versionen aus der abgeleiteten Historie. Er liefert `provider`-, `model`- und `cwd`-Variablenwerte, aber keine zusätzliche feste Prosa.

#### Token-Effekt

Systemtext und Schemas werden bei jedem Step erneut bezahlt, und auf einer `in-history`-Route wird jede behaltene Prompt-Version bezahlt, bis Compaction sie abschattet oder die Prompt-Reconciliation sie leert. Per-Agent-Scoping wählt die Beiträge, während der maßgebliche Assembly-Waterfall den finalen Request verändern kann und seinen Listener für Protokollkohärenz verantwortlich macht.

#### KV-Cache-Effekt

Nur anhängend, solange Systemtext, Schemas und frühere Historie unter derselben Provider- und Modell-Route byte-identisch bleiben. Ein unveränderter gerenderter Prompt behält das gecachte Präfix, es sei denn, eine incapabele Route oder eine neue Request-Series muss behaltene In-History-System-Knoten konsolidieren. Eine Prompt-Änderung, die einen System-Knoten in-place ersetzt, lässt den Request ab dem ersten Token dieses Knotens abweichen — vollständig, wenn der Knoten Knoten 0 ist — sodass der Provider-Präfix-Cache ab dort verfehlt; wenn der Prepared Call `systemPromptUpdate: 'in-history'` deklariert, wird eine nicht-leere Prompt-Änderung innerhalb einer fortlaufenden Request-Series nach der gecachten Historie angehängt, sodass das Präfix durch diese Historie wiederverwendbar bleibt. Eine Schema- oder Kompositionsänderung macht die Wiederverwendung ab dem ersten geänderten Request-Token ungültig.

### Behaltene Nachrichten-Historie

#### Was das Modell sieht

Akzeptierte User-Nachrichten, Assistant-Nachrichten, Tool-Calls und -Ergebnisse, injizierter Kontext und Steering werden geloggt und in späteren Steps gesendet. Rohe Stream-Chunks, Lifecycle-Grenzen und andere Log-only-Events sind ausgeschlossen.

#### Token-Effekt

Die Eingabe wächst mit jeder Surface-Nachricht, bis eine Compaction-Ersetzung ältere Knoten abschattet; ein mehrstufiger Tool-Turn sendet die akkumulierte Historie bei jedem Step erneut.

#### KV-Cache-Effekt

Gewöhnliches Historienwachstum ist nur anhängend und bewahrt wiederverwendbare Einträge. Eine Surface-Ersetzung oder Compaction macht die Wiederverwendung ab dem ersten abgeschatteten Historien-Token ungültig.

### Nicht-dispatchen Calls nach Abbruch

#### Was das Modell sieht

Wenn ein späterer Request einen abgebrochenen Step replayt, hat jeder Tool-Call, dessen Dispatch der Abbruch verhindert hat, den Fehlercode `ABORTED_BEFORE_DISPATCH` und den Ergebnistext `Error: tool call aborted before dispatch`.

#### Token-Effekt

Pro übersprungenem Call bleibt ein festes Fehlerergebnis in der Historie, bis Compaction es abschattet.

#### KV-Cache-Effekt

Nur anhängend; jedes synthetische Ergebnis folgt dem wiederverwendbaren Request-Präfix und macht bestehende KV-Cache-Einträge nicht ungültig.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann der Loop besondere Sorgfalt erfordert. Sie sind aktuelle Paket-Einschränkungen, kein Aufgabenstapel.

- **Klassifizierung ist unär** — Calls, deren Sicherheit vom Vergleich von Geschwistern oder Ressourcen abhängt, müssen exklusiv bleiben ([Begründung](../../../.agents/notes/implemented/feature/2026-07-10-parallel-tool-call-execution.de.md)).
- **Config-Labels sind standardmäßig frisch** — das Weglassen von `sessionId` erstellt bei jedem Start ein frisches `${id}-session-<uuid>`; exaktes Resume-or-Create-Verhalten erfordert eine explizite stabile `sessionId`, während `resumeSessionId` bestehende persistierte Historie erfordert.
- **Config-Agents haben kein Per-Agent-Persona-Feld oder Setup-Hook** — sie verwenden die Deployment-Persona; gescopte Persona- und Tool-Komposition ist nur über die programmatischen `ctx.agents.create()`-/`resume()`-Factory-Optionen verfügbar.
- **Kein eingebautes Turn-Budget** — Tool-Calls oder Steering setzen den aktuellen Turn fort; eine Policy, die ausufernde Turns begrenzt, muss von einem bestehenden Lifecycle-Extension-Point wie `agent/turn-stopping` aus abbrechen.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
