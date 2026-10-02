# Conversation-Assembly

[English](conversation.md) | [中文](conversation.zh.md) | Deutsch

Conversation ist der target-neutrale Assembly-Layer zwischen einem Client-`SessionEventLikeEntry`-Fenster und Browser-Views. [`ui-conversation`](../../packages/client/ui-conversation/README.de.md) besitzt die Event- und View-Registries, ein identity-stabiles Binding pro `SessionBinding`, Turn/Step-Locations, inkrementelle Context-Assembly, Target-Sources, die geteilte Shell und die Input-Orchestrierung. Target-Pakete wie [`ui-chat`](../../packages/client/ui-chat/README.de.md) und [`ui-trajectory`](../../packages/client/ui-trajectory/README.de.md) besitzen ihre Definitions, finalen Snapshots und das Rendering.

Diese Seite definiert das Datenmodell und den Erweiterungspfad für einen business-eigenen Conversation-Node. Die [Web-Client-Architektur](web-client.de.md) positioniert das Subsystem zwischen Client-Modellen und Slots; die [Conversation-Node-Assembly-Entscheidung](../../.agents/notes/implemented/architecture/2026-08-09-client-conversation-node-assembly.de.md) besitzt die Rationale.

## Datenmodell und Ownership

Der Session-Controller besitzt das zusammenhängende geladene Logical-Event-Fenster. Jedes `SessionEventLikeEntry` ist entweder `{ type: 'event', event: SessionEvent }` für ein durable Event oder `{ type: 'transient', event: AssistantLiveChunkEvent }` für eine Client-only `assistant/live-chunk`-Darstellung. Beide inneren Events exponieren `type`, `seq`, `time` und `data`. `ui-conversation` reicht diese Entries an den Assembler weiter, ohne einen zweiten History-Stream zu öffnen. Ein `ConversationNodeAssembler` pro Session wendet jede registrierte Definition an und publiziert eine unabhängige Source für jedes registrierte View-Target.

| Konzept | Owner und Zweck |
|---|---|
| Event Definition | Ein Business-Paket matcht je ein durable oder Client-only transient Event, korreliert es über eine stabile `(kind, id)`, foldet deterministischen State und materialisiert optional einen Target-Node. |
| Context | Die engine-eigenen geordneten Matches und der aktuelle State für eine `(kind, id)`. Ein transient Event belegt einen Update-Match; Update-only-Evidence darf pending bleiben, bis Pagination seinen eindeutigen durable Start liefert. |
| Location | Die engine-eigenen Session-, Turn- oder Step-Koordinaten, abgeleitet aus durable Boundary-Events. Definitions dürfen typisierte Daten auf einen Turn oder Step publizieren. |
| View Definition | Ein Target-Paket erzeugt einen inkrementellen Builder pro Session und besitzt den finalen Snapshot-Typ für dieses Target. |
| View | Ein Slot-Eintrag wie Chat oder Trajectory liest nur seinen Target-Snapshot und rendert target-eigene Nodes. |

Chat und Trajectory dürfen dieselbe durable Event-Familie erkennen, aber jede hält ihren eigenen Definition-State und finale Node-Payloads. Geteilte target-neutrale Maschinerie beschränkt sich auf Identity-Routing, geordnetes Replay, Location-Daten, Predecessor-Dependencies und Publication-Cadence.

## Target-Aktivierung

Jede Session hält eine monotone Menge aktiver Targets. Das Erstellen oder Lesen einer Target-Source aktiviert sie nicht. Die Shell aktiviert explizit ihre persistierte oder neu gewählte View, während ein anderer Consumer ein Target über seine erste Source-Subscription aktiviert. Die erste Aktivierung erzeugt den Builder dieses Targets und ruft einmal `replace()` aus den aktuellen target-indizierten Contexts auf. Spätere Flushes rufen `apply()` für jedes aktive Target, und eine Unsubscription entfernt keines.

Die Shell besitzt die View-Auswahl und resolved die registrierte bevorzugte View oder den Chat-Fallback vor dem Rendering, wenn ein Binding erstellt oder als current gewählt wird, sowie nach View-Roster-Änderungen. Der Assembler erhält nur die resolved Target-ID und wählt weder Chat noch ein anderes Default-Target. Eine Third-Party-View beteiligt sich über dieselben Auswahl- und Aktivierungsoperationen.

## Replayable Event-Familien

Wähle eine stabile Business-ID, bevor du die Definition schreibst. Jedes Event, das zum selben Node beiträgt, muss diese ID tragen oder sie unabhängig aus seinem eigenen Payload ableiten; der Client darf ein Update niemals „dem letzten unvollendeten" Context zuweisen.

Für einen Review-Job könnte der Event-Contract lauten:

| Event | Rolle | Erforderliche durable Fakten |
|---|---|---|
| `review/start` | unique start | `reviewId`, Turn/Step-Koordinaten, Titel |
| `review/progress` | update | dieselbe `reviewId`, Koordinaten, replaybarer Fortschritt |
| `review/end` | update | dieselbe `reviewId`, Koordinaten, finale Zusammenfassung |

Verwende den producer-eigenen Branded-ID-Typ über die Prozessgrenze hinweg. Lege den `SessionEventMap`-Merge und die Payload-Typen auf den Type-only-Export des Producers und importiere diesen Export dann aus dem Client-Paket für Side-Effects. Jede `(kind, id)` darf höchstens ein Start-Event haben. Ein Single-Event-Business kann die stabile Identität des Events, etwa `event.seq`, als seine Definition-lokale ID verwenden.

Inkrementelle Events werden unterstützt. Bevorzuge Whole-Value-Checkpoints, wenn der Producer sie billig emittieren kann, weil sie nützlich bleiben, wenn der Start außerhalb des geladenen Fensters liegt. Jedes Delta muss die stabile ID tragen und deterministischen State erzeugen, wenn es in aufsteigender Log-`seq` replayt wird; es darf nicht von Live-only-Memory abhängen. Enthält das aktuelle History-Fenster nur Updates, hält der Assembler einen pending Context und baut keinen State, bis eine ältere Page den Start liefert. Muss das Produkt rendern, bevor der Start geladen ist, muss ein terminales oder Checkpoint-Event genug ganzen Fallback-State tragen, damit die Definition dieses Ergebnis direkt bauen kann; stelle es nicht durch Scans unverwandter Events wieder her.

Live-Assistant-Deltas kommen als Client-only `assistant/live-chunk`-Updates an. Reconnect-Baselines expandieren den aktiven prozesslokalen Compact-Stream in dieselben transient Events, während durable `assistant/message`- und `assistant/attempt`-Events vollständige Compact-Streams für das History-Replay einbetten. Transient Events können nur Updates sein; `start()` erhält ein Standard-`SessionEvent`. Eine Definition, die Assistant-Output konsumiert, behandelt Live-Chunks und durable Settlements in denselben `match()`- und `update()`-Methoden, während unverwandte Definitions `null` zurückgeben, ohne einen Stream zu expandieren.

## Definition und typisierte Chat-Payload

Das Beispiel hält Producer-Deklarationen und Client-Contribution in einem Block, damit die vollständige Beziehung sichtbar ist. In einer Paketfamilie bleiben Branded-ID und `SessionEventMap`-Deklaration beim Event-Producer, und Definition, Chat-Data-Merge und Renderer bleiben im Client-Plugin.

```ts ignore-check
import { createElement } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type {
  ConversationLocation, ConversationNodeContext,
  ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-chat/client'

type ReviewId = Branded<'ReviewId'>

interface ReviewStartData {
  readonly reviewId: ReviewId
  readonly turn: number
  readonly step: number
  readonly title: string
}

interface ReviewProgressData {
  readonly reviewId: ReviewId
  readonly turn: number
  readonly step: number
  readonly completed: number
}

interface ReviewEndData {
  readonly reviewId: ReviewId
  readonly turn: number
  readonly step: number
  readonly summary: string
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Opens one durable review job.
     * @mode emit
     * @param data - stable identity, location, and initial display state.
     */
    'review/start': ReviewStartData
    /**
     * Records replayable progress for one review job.
     * @mode emit
     * @param data - stable identity, location, and latest progress.
     */
    'review/progress': ReviewProgressData
    /**
     * Closes one review job with its final summary.
     * @mode emit
     * @param data - stable identity, location, and final display state.
     */
    'review/end': ReviewEndData
  }
}

interface ReviewChatData {
  readonly title: string
  readonly completed: number
  readonly status: 'running' | 'completed'
  readonly summary?: string
}

declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap {
    'review-job': ReviewChatData
  }
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationStepDataMap {
    'review-job': ReviewChatData
  }
}

interface ReviewState extends ReviewChatData {
  readonly turn: number
  readonly step: number
}

function locationOf(context: ConversationNodeContext): ConversationLocation {
  return context.start?.location ?? context.matches[0]?.location ?? { kind: 'unresolved' }
}

function viewData(state: ReviewState): ReviewChatData {
  return {
    title: state.title,
    completed: state.completed,
    status: state.status,
    ...state.summary === undefined ? {} : { summary: state.summary },
  }
}

const reviewDefinition: ConversationNodeDefinition<ReviewState> = {
  kind: 'review-job',
  target: 'chat',
  match: (event) => {
    if (event.type === 'review/start') {
      return { id: String(event.data.reviewId), role: 'start' }
    }
    if (event.type === 'review/progress' || event.type === 'review/end') {
      return { id: String(event.data.reviewId), role: 'update' }
    }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'review/start') throw new Error('review-job requires review/start')
    return {
      turn: match.event.data.turn,
      step: match.event.data.step,
      title: match.event.data.title,
      completed: 0,
      status: 'running',
    }
  },
  update: (context, match) => {
    if (match.event.type === 'review/progress') {
      return { ...context.state, completed: match.event.data.completed }
    }
    if (match.event.type === 'review/end') {
      return { ...context.state, completed: 100, status: 'completed', summary: match.event.data.summary }
    }
    return context.state
  },
  publication: match => match.event.type === 'review/progress'
    ? 'animation-frame'
    : 'immediate',
  buildLocationData: (context, scope) => {
    if (scope !== 'step' || context.state === undefined) return null
    return {
      kind: 'step',
      turn: context.state.turn,
      step: context.state.step,
      key: 'review-job',
      value: viewData(context.state),
    }
  },
  buildViewNode: (context) => {
    if (context.state === undefined) return null
    return {
      key: context.key,
      kind: 'review-job',
      id: context.id,
      target: 'chat',
      anchorSeq: context.start?.event.seq ?? context.matches[0]?.event.seq ?? 0,
      location: locationOf(context),
      visibility: 'visible',
      data: viewData(context.state),
    }
  },
}

function ReviewNodeView({ node }: ChatNodeViewProps<'review-job'>) {
  const text = node.data.summary ?? `${node.data.title}: ${node.data.completed}%`
  return createElement('p', null, text)
}

export const inject = ['uiConversation', 'slots']

export function apply(ctx: ClientContext): void {
  ctx.uiConversation.events.register(reviewDefinition)
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'review-job',
  }, ReviewNodeView))
}
```

`match(event)` ist ein Identity-Extractor, kein Fold: Es erhält nur das aktuelle `SessionEventLike` und gibt die Definition-lokale ID und die Lifecycle-Rolle zurück. Nach einem Match lokalisiert der Assembler den Context über `(kind, id)` und ruft `start` einmal für ein Standard-Event oder `update` für ein Standard- oder Packed-Event auf. Beide Funktionen geben den State zurück, den die Engine übernimmt; die Rückgabe eines neuen immutable Werts ist bevorzugt, aber eine Funktion, die mutiert und dasselbe Objekt zurückgibt, hat dieselbe Adoption-Semantik.

`buildLocationData(context, scope)` publiziert optional Definition-eigene Daten auf einen engine-eigenen Turn oder Step. Verwende Declaration Merging, um jedem Key einen präzisen Value-Typ zu geben. Ein anderer Node in derselben Location kann diesen Wert über seinen constrained Slot-Hook konsumieren, etwa `useTurnData(key)`, ohne die Session zu erhalten oder `snapshot.chat.nodes` zu scannen.

`target` und `buildViewNode(context)` deklarieren einen target-eigenen Rendering-Beitrag und müssen zusammen auftreten. Bewahre `context.key` als React-seitige Identität, wähle `anchorSeq` aus durable Ordering-Evidence und gib nur renderer-fertige Daten zurück. Sobald ein Target-Node publiziert wurde, gib weiterhin denselben Key zurück; verwende `visibility: 'hidden'`, wenn er den sichtbaren Fluss vorübergehend verlassen muss, statt ihn mit `null` zurückzuziehen.

## Predecessor-Reads

Manche Definitions brauchen den neuesten früheren State einer anderen Business-Kind. `start` erhält einen `ConversationContextReader`; rufe dort `reader.previous<State>(kind)` auf, statt eine Context-Collection zu akzeptieren oder Events zu scannen. Der Reader gibt den nächsten gestarteten Context vor der aktuellen Start-`seq` als Read-only-Daten zurück.

Der Assembler zeichnet diese Dependency auf. Liefert ein späteres älteres Prepend einen näheren Predecessor, schließt eine zuvor unbekannte Fensterlücke oder revidiert den Predecessor-State, führt er den abhängigen Context ab `start` erneut aus und replayt seine Updates in aufsteigender `seq`. Die abgefragte Definition bleibt dafür verantwortlich, nützlichen State zu schreiben; der Reader exponiert keine business-spezifischen Query-Methoden und gewährt keine Mutations-Autorität über einen anderen Context.

## Fenster-Update-Pfade

History kann vom Tail rückwärts seitenweise angefordert werden. Das Session-Journal validiert zuerst nicht-überlappende logische Sequence-Ranges; der Assembler ordnet akzeptierte Inputs dann nach ihrer ersten `seq`, bevor das State-Replay beginnt.

| Pfad | Engine-Arbeit | Definition-sichtbares Verhalten |
|---|---|---|
| Replace bei Open, Resync oder Gap-Repair | Das geladene Fenster neu bauen, jedes Standard-Event oder Packed-Run einmal pro Definition matchen, dann jeden gestarteten Context replayen | `start`, gefolgt von seinen Updates in aufsteigender logischer `seq`; pending Update-only-Contexts bleiben ohne State |
| Eine ältere Page prependen | Nur frische ältere Inputs matchen, sie über `(kind, id)` in Contexts mergen, bestehende keyed Nodes bewahren und nur betroffene Contexts und Dependencies replayen | Ein neu gefundener scalar Start aktiviert seine gesammelten scalar und packed Updates; eine geänderte Location oder ein Predecessor kann den Context erneut laufen lassen |
| Ein Live-Event appenden | `match` jeder Definition einmal aufrufen, den gematchten Context per Key nachschlagen und nur diesen Context updaten | Ein scalar `update` und eine angeforderte Publication für ein matchendes Post-Start-Event; kein Scan bestehender Contexts |

Mit `D` registrierten Definitions führt ein eingehendes scalar Event oder Packed-Run `D` Current-Input-Matches und einen Constant-Time-Context-Key-Lookup nach einem Match aus. Definitions-Code muss diese Eigenschaft bewahren: Durchlaufe auf dem normalen Append-Pfad weder das komplette Event-Fenster, noch jeden Context, `context.matches` oder die gerenderte Node-Collection. Verwende State für akkumulierte Fakten, Location-Daten für Same-Turn/Step-Sharing und `reader.previous()` für indizierte Predecessor-Dependencies.

`publication` steuert, wann geänderter State materialisiert wird. Verwende `immediate` für strukturelle oder terminale Änderungen, `animation-frame` für hochfrequente sichtbare Deltas und `none`, wenn die State-Änderung nur eine spätere Publication speist. Die Engine wendet jedes scalar Update in Log-Reihenfolge und jeden Packed-Run in einem Batch-Update an; die Cadence koalesziert nur die View-Publication.

## Verifikationspflichten

Füge fokussierte Tests hinzu, die diese Ergebnisse herstellen:

1. Ein komplettes Fenster, das durch Replace läuft, erzeugt den erwarteten finalen State, Location-Daten, Node-Payload und `anchorSeq`.
2. Ein Update-only-Tail bleibt pending; das Prependen des unique Start erzeugt dasselbe Ergebnis wie ein kompletter Replace.
3. Initiale History gefolgt von Live-Append erzeugt dasselbe Ergebnis wie das Replay des kombinierten Fensters.
4. Das Prependen einer älteren Page fügt frühere Rows hinzu, ohne bestehende keyed Node-Values zu ersetzen, deren Daten sich nicht änderten.
5. Wiederholte sichtbare Deltas bewahren `context.key` und publizieren auf Anfrage höchstens einmal pro Animation-Frame.
6. Der keyed Renderer konsumiert nur `node.data` und constrained Location-Hooks; er scannt weder das Session-Event-Fenster, Contexts noch Chat-Nodes.
7. Scalar und packed Assistant-History erzeugen denselben finalen State, dieselben Timing-Boundaries und denselben Target-Snapshot, während ein Packed-Run durch Replace, Prepend, Location-Replay und Registry-Rebuild ein Match bleibt.
8. Das Erstellen einer Target-Source führt keine Builder-Arbeit aus; explizite Auswahl oder die erste Subscription führt einen kompletten Replace aus, spätere Updates erreichen jedes aktive Target, und wiederholte Aktivierung führt keinen Replace aus.

Verwende [`packages/client/ui-chat/src/client/conversation-nodes/assistant.ts`](../../packages/client/ui-chat/src/client/conversation-nodes/assistant.ts) für Streaming und Interruption, [`inbox.ts`](../../packages/client/ui-chat/src/client/conversation-nodes/inbox.ts) plus [`message.ts`](../../packages/client/ui-chat/src/client/conversation-nodes/message.ts) für Predecessor-Queries und [`packages/client/ui-deliverables`](../../packages/client/ui-deliverables) für eine Definition, die Turn-Daten publiziert, ohne einen eigenen Node zu erstellen.
