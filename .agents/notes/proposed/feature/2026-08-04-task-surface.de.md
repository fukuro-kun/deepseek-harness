# Agent Note: Task Surface für strukturierte Session-Interaktion
[English](2026-08-04-task-surface.md) | [中文](2026-08-04-task-surface.zh.md) | Deutsch

Status: proposed


## Problem

Einige Aufgaben sind über abwechselnde Prosa-Nachrichten unangenehm zu beenden. Vergleichen mehrerer Optionen, Umsortieren eines Plans, Prüfen einer Tabelle oder Ausfüllen eines kleinen Satzes verwandter Felder — all das funktioniert besser als eine strukturierte Interaktion. Ein Agent kann eine solche Interaktion beschreiben, aber er kann den Web-Client nicht bitten, eine zu rendern, ohne ein permanentes Produkt-Komponenten-Element hinzuzufügen oder ausführbaren Client-Plugin-Code zu generieren. Diese beiden Workarounds legen die Ownership am falschen Ort an.

Produkt-spezifische Komponenten erfordern für jede Aufgabenform einen neuen Trigger und ein neues Release. Generierter Code hat deutlich mehr Autorität und höhere Lifecycle-Kosten, als ein Ein-Turn-Formular braucht. Außerdem macht er die Präsentation — nicht den Schluss des Nutzers — zum dauerhaften Artefakt.

Der fehlende Contract ist eine begrenzte, abspielbare Beschreibung einer temporären UI, die zu einer Session und einem Tool-Vorkommnis gehört. Das Produkt sollte Validierung, Platzierung, Interaktionsmechanik und Submission besitzen. Der Agent sollte die aufgabenspezifische Copy, die Daten und die Wahl der unterstützten Komponenten besitzen.

## Vorschlag

Füge **Task Surface** hinzu, ein versioniertes deklaratives Modell, das von einem gewöhnlichen Web-Client-Plugin gerendert wird. Ein stabiles Modell-Tool, `show_task_surface`, publiziert das Modell. Ein erfolgreicher Call beendet den aktuellen Turn. Der Nutzer bearbeitet das gerenderte Panel und sendet es ab; der Host recordet die Submission als eine gewöhnliche sichtbare Nutzer-Nachricht und startet den nächsten Turn.

Task Surface ist der Standard-Pfad für strukturierte UI, wenn alle Folgenden gelten:

- die Interaktion gehört zur aktuellen Session und zur aktuellen Aufgabe;
- ihr Verhalten passt in den deklarierten Komponenten-Satz;
- sie braucht keine Background-Ausführung und keine neuen Runtime-Autoritäten; und
- das nützliche dauerhafte Ergebnis ist der vom Nutzer gesendete Schluss, nicht das Panel selbst.

Das ist ein einzelner Trigger, keine Familie von Produkt-Heuristiken. Der Agent ruft `show_task_surface` explizit auf. Ein Nutzer kann den Agent in gewöhnlicher Sprache bitten, eine Task Surface zu verwenden. Produkte inspizieren keine Tool-Namen oder Aufgaben-Themen, um maßgeschneiderte Panels zu öffnen, und wiederholte Nutzung verwandelt eine Task Surface nicht automatisch in ein Plugin.

Kurze blockierende Fragen bleiben bei [`ask_user_question`](../../archived/feature/2026-07-29-ask-question-web-presentation.md). Reine Erklärung bleibt Chat. Cross-Session-Navigation, Background-Verhalten, neue Services oder dauerhafte benutzerdefinierte UI gehören zum Generated-Client-Plugin-Workflow.

## Deklaratives Modell

`TaskSurfaceModelV1` ist JSON. Es enthält Content-Blöcke, Eingabefelder und ein Submit-Label; es enthält keinen Code, keine Callbacks, keine Selektoren, kein HTML, kein CSS, keine URLs zu ausführbaren Assets und keine Ausdrucks-Sprache. Dieser Typ hat nichts mit den bestehenden `SurfaceManager`/`SurfaceOp`-Nachrichten-Reduktionstypen der Core-Session zu tun; Task Surface ist ein Produkt-Interaktions-Protokoll.

```ts
interface TaskSurfaceModelV1 {
  version: 1
  title: string
  description?: string
  sections: TaskSurfaceSection[]
  fields?: TaskSurfaceField[]
  submit: { label: string }
}

interface TaskSurfaceSection {
  id: string
  title?: string
  layout?: TaskSurfaceLayout
  blocks: TaskSurfaceBlock[]
}

type TaskSurfaceLayout =
  | { kind: 'stack' }
  | { kind: 'grid'; columns: 2 | 3 }

type TaskSurfaceBlock =
  | { kind: 'markdown'; text: string }
  | { kind: 'metrics'; items: { label: string; value: string; detail?: string }[] }
  | { kind: 'table'; columns: { id: string; label: string }[]; rows: Record<string, string | number | boolean | null>[] }
  | { kind: 'diff'; path?: string; before: string | null; after: string; language?: string }
  | { kind: 'notice'; tone: 'neutral' | 'info' | 'warning'; text: string }

type TaskSurfaceField =
  | { kind: 'text'; id: string; label: string; multiline?: boolean; required?: boolean; initial?: string }
  | { kind: 'choice'; id: string; label: string; options: TaskSurfaceOption[]; initial?: string }
  | { kind: 'multi-choice'; id: string; label: string; options: TaskSurfaceOption[]; initial?: string[] }
  | { kind: 'toggle'; id: string; label: string; initial?: boolean }
  | { kind: 'order'; id: string; label: string; options: TaskSurfaceOption[]; initial?: string[] }

interface TaskSurfaceOption { id: string; label: string; detail?: string }
```

Der Renderer steuert Typografie, Abstände, responsives Layout, Fokus-Reihenfolge, Tastaturverhalten und Theme-Tokens. Ein fehlendes Layout bedeutet `stack`; ein `grid`-Layout besitzt seine Spaltenzahl und kollabiert, wenn die verfügbare Breite sie nicht tragen kann. Unbekannte Versionen oder Union-Arme nutzen den generischen Tool-Result-Fallback, statt teilweise interpretiert zu werden.

Der `markdown`-Block wiederverwendet `MarkdownText` mit einer expliziten Modell-URL-Policy. `MarkdownText` erhält `remoteImages: 'render' | 'alt-only'` und behält `render` als gewöhnlichen Default; Task Surface übergibt immer `alt-only`, sodass Bild-Syntax nur ihren Alt-Text rendert. Rohes HTML und eingebettete Medien bleiben weggelassen, automatische Link-Vorschauen fehlen, und keine vom Modell gelieferte URL wird ohne explizite Nutzer-Aktivierung dereferenziert. Gewöhnliche HTTP(S)-Links können weiterhin navigieren, wenn der Nutzer sie wählt. Feste Anwendungs-Assets wie Syntax-Highlighting-Chunks bleiben unter der normalen Lade-Policy des Produkts.

Version 1 lässt bewusst konditionale Felder, client-seitiges Daten-Fetching, Charts, Datei-Uploads und beliebige Event-Handler aus. Eine neue Block- oder Feld-Art ist eine Protokoll-Änderung mit Parser, Renderer, Accessibility-Verhalten, Fallback und Replay-Fixture im selben Change.

Limits sind schema-gestützte Configuration auf dem Task-Surface-Service. Die initialen Defaults sind 64 KiB für das normalisierte Modell, 64 Blöcke, 32 Felder, 200 Tabellenzeilen und 32 KiB für eine Submission. IDs sind innerhalb des Modells eindeutig; Feldwerte müssen zu ihren Deklarationen passen; unbekannte Felder werden abgelehnt. Die Limits begrenzen Log-, DOM- und Prompt-Kosten, ohne das Protokoll zu ändern.

## Tool- und Präsentationsvertrag

`show_task_surface` akzeptiert `{ model: TaskSurfaceModelV1 }`. Der Host parst und normalisiert das komplette Modell, lehnt den Call ab, wenn diese Session bereits eine offene Task Surface hat, prägt `surfaceId` und gibt kanonisches `{ surfaceId, model }` mit dem normalisierten Modell zurück. `presentationMeta` persistiert `value.model`, sodass Projector und Executor bei der Normalisierung nicht auseinanderfallen können. Das Native-Result benennt die Surface und erklärt, dass eine gewöhnliche Nachricht sie umgeht, wenn der Client das Panel nicht rendern kann. Das Tool ruft dann `exec.concludeTurn()` auf, damit der Agent nicht über den angeforderten menschlichen Checkpoint hinausfährt.

Die Tool-Definition lässt `isConcurrencySafe` aus. Unter dem bestehenden Tool-Registry-Contract klassifiziert das Auslassen jeden Call als exklusive Ordnungs-Barriere; es wird kein neues `ToolDefinition`-Feld eingeführt. Das Tool wird nur in Web-Profilen komponiert, die sowohl den Host-Service als auch den Web-Renderer mounten. Version 1 unterstützt die Tool-Modi `native` und `both`; ein nur-`ptc`-Profil bewirbt es nicht, weil PTC-Mode-Dispatch verschachtelt ist und seine Präsentations-Metadaten nicht zum äußeren Resultat tragen kann.

Das browser-sichere Domänen-Paket importiert die typ-nur-`Branded`-Primitiva aus `@deepseek-ai/dsh-brand` und besitzt alle drei Task-Surface-IDs. Der kanonische Wert ist unter dem [kanonischen Tool-Output-Contract](../../implemented/architecture/2026-07-20-canonical-tool-output-contract.de.md) ausführung-lokal. Replay nutzt daher `output.presentationMeta(args, value)`, um diese getaggte Payload mit `tool/result.meta` zu persistieren:

```ts
import type { Branded } from '@deepseek-ai/dsh-brand'

type TaskSurfaceId = Branded<'TaskSurfaceId'>
type TaskSurfaceSubmissionId = Branded<'TaskSurfaceSubmissionId'>
type TaskSurfaceDismissalId = Branded<'TaskSurfaceDismissalId'>

interface TaskSurfacePresentationMeta {
  kind: 'dsh/task-surface'
  version: 1
  surfaceId: TaskSurfaceId
  model: TaskSurfaceModelV1
}
```

Das Tool behält ein generisches [Render-Intent](../../implemented/architecture/2026-07-02-tool-render-intent-union.de.md). Die key-basierte Web-Zeile liest die bereits auf `ToolResultNode` getragene getaggte Metadaten; es wird kein neuer Render-Intent-Arm und keine Präsentations-Registry benötigt. Clients ohne Task-Surface-Unterstützung rendern den gewöhnlichen Result-Content.

Das Web-Plugin hat zwei statische, session-scoped Registrierungen gemäß den [toolview](../../archived/architecture/2026-07-23-toolview-dissolution.md)- und [Slot-Registrierungs](../../implemented/architecture/2026-07-22-slot-type-chain-implementation.de.md)-Contracts. Die key-basierte `conversation.chat.toolview`-Eintragung für `show_task_surface` rendert das dauerhafte Transcript-Vorkommnis als kompakte Zusammenfassung und read-only-Replay. Eine `TaskSurfaceDock`-Eintragung in der bestehenden `conversation.input.dock` ist der einzige actionable Mount: Sie liest die aktive Projection, ruft `getActive` für die exakte Identität auf und besitzt Felder, Drafts, submit und dismiss. Weil der Dock unabhängig von der Transcript-Paginierung ist, bleibt eine aktive Surface actionable, wenn ihr `ToolResultNode` außerhalb des geladenen Historien-Fensters liegt.

Der Dock folgt den bestehenden Composer-Chain-Fallback-Semantiken. Jeder `conversation.composer`-Takeover versteckt den Fallback-Composer-Stack, einschließlich `TaskSurfaceDock`, ohne ihn zu unmounten; derselbe Draft-Owner erscheint wieder, wenn der Takeover sich auflöst. Ein Takeover erhält keine Task-Surface-Actions und erstellt keinen anderen Editor.

Das Modell wählt keinen Conversations-Tab, keine Dock-Reihenfolge, keine Details-Spalte, kein Modal, keine Pixel-Position und keine z-Index. Eine spätere Platzierungs-Änderung bleibt eine Renderer-Entscheidung und ändert keine geloggten Modelle. Die Transcript-Zeile wird nie ein zweiter Editor, sodass eine Surface keine konkurrierenden Draft- oder Submission-Owner erhalten kann.

## Submission-Vertrag

Die Task-Surface-Domäne exponiert drei Operationen über den Host-Transport. `submit` ist die einzige, die eine Nutzer-Nachricht zulässt:

```ts ignore-check
type TaskSurfaceSubmissionPhase = 'queued' | 'claiming'

interface TaskSurfacePendingSubmission {
  submissionId: TaskSurfaceSubmissionId
  messageId: MessageId
  phase: TaskSurfaceSubmissionPhase
}

interface TaskSurfaceService {
  getActive(input: { sessionId: SessionId; surfaceId: TaskSurfaceId }): Promise<GetActiveTaskSurfaceResult>
  submit(input: SubmitTaskSurfaceRequest): Promise<SubmitTaskSurfaceResult>
  dismiss(input: DismissTaskSurfaceRequest): Promise<DismissTaskSurfaceResult>
}

interface SubmitTaskSurfaceRequest {
  sessionId: SessionId
  surfaceId: TaskSurfaceId
  submissionId: TaskSurfaceSubmissionId
  values: Record<string, JsonValue>
  note?: string
}

type SubmitTaskSurfaceResult =
  | { accepted: true; messageId: MessageId; phase: 'queued' }
  | { accepted: false; reason: 'not-open' | 'stale' | 'invalid-submission' | 'submission-pending' }

type GetActiveTaskSurfaceResult =
  | {
      active: true
      callId: ToolCallId
      surfaceId: TaskSurfaceId
      model: TaskSurfaceModelV1
      pending: TaskSurfacePendingSubmission | null
    }
  | { active: false; reason: 'not-open' }

interface DismissTaskSurfaceRequest {
  sessionId: SessionId
  surfaceId: TaskSurfaceId
  dismissalId: TaskSurfaceDismissalId
}

type DismissTaskSurfaceResult =
  | { dismissed: true; eventSeq: number }
  | { dismissed: false; reason: 'not-open' | 'stale' | 'submission-pending' }
```

Der Host löst das exakte erfolgreiche `show_task_surface`-Vorkommnis auf, revalidiert die gesendeten Werte gegen sein persistiertes Modell und lässt die Antwort durch die normale Session-Warteschlange zu. Die Antwort wird zu einer user-role-Nachricht mit einer merge-erweiterbaren source:

```ts ignore-check
interface TaskSurfaceCorrelation {
  version: 1
  submissionId: TaskSurfaceSubmissionId
  callId: ToolCallId
  surfaceId: TaskSurfaceId
  values: Record<string, JsonValue>
}

interface TaskSurfaceUserMessageSource {
  kind: 'user'
  rpcId: RpcId
  taskSurface: TaskSurfaceCorrelation
}
```

Das `session/queue`-Wire-Item trägt bereits die komplette `Message`. Die Client-Projektion wird explizit erweitert, ihre source beizubehalten, statt die Korrelation fallen zu lassen:

```ts ignore-check
interface QueuedMessage {
  id: InboxItemId
  messageId: MessageId
  placement: 'queued' | 'steering'
  source: MessageSource
  content: readonly ContentBlock[]
  preview: string
  text: string | null
}
```

Das browser-sichere Domänen-Paket besitzt `TaskSurfaceId`, die Submission- und Dismissal-IDs, `TaskSurfaceCorrelation` und die Pending-Submission-Shape. ApiProxy besitzt die Transport-Erweiterung, die die Korrelation mit `rpcId` kombiniert. `kind: 'user'` zu behalten bewahrt die gewöhnliche Nutzer-Bubble und die Prompt-Semantik, während das zusätzliche Feld dauerhafte Korrelation bereitstellt. Der Nachrichten-Content ist eine produkt-formatierte lesbare Zusammenfassung: Panel-Titel, Labels und gesendete Werte, plus die optionale Notiz. Das Modell erhält denselben Text. Die strukturierte source ist keine zweite versteckte Anweisung.

Die Produkt-Shell besitzt collapse und dismiss. Collapse ist lokaler View-State und sendet nichts. Wenn keine Submission pending ist, hängt `taskSurface.dismiss({ sessionId, surfaceId, dismissalId })` ein `task-surface/dismissed`-Session-Event an und startet keinen Turn; das exakte Event schließt die Projection und aktualisiert Dock und Transcript-Zeile. Retries wiederverwenden `dismissalId` und geben das ursprüngliche Result zurück, ohne ein weiteres Event anzuhängen. Dismiss ist deaktiviert, während eine Submission `queued` oder `claiming` ist, und der Host lehnt eine solche Anfrage mit `submission-pending` ab.

Submission ist an der Client-Grenze transaktional. Akzeptanz gibt die exakte `messageId` in Phase `queued` zurück; der Dock deaktiviert jede Mutation durch `queued` und `claiming` hindurch und räumt den persistierten Draft erst auf, nachdem die passende Nutzer-Nachricht durable geworden ist. Eine Ablehnung lässt die Werte editierbar und zeigt den zurückgegebenen Grund. Doppelklicks und Transport-Retries wiederverwenden `submissionId` und geben das erste Result zurück; eine andere Submission-ID erhält `submission-pending`, solange die erste live ist. Der Host lässt genau eine Nutzer-Nachricht pro akzeptierter Surface zu.

Der Task-Surface-Service recordet akzeptierte Submission-Koordination als `pending.phase: 'queued'`, während der Client die noch vorhandene Queue-Zeile über ihre beibehaltene `source` korrelieren kann. Wenn der Agent dieses Vorkommnis für die gewöhnliche Prompt-Zulassung aus der Queue nimmt, ändert der Service dasselbe Pending-Record synchron zu `claiming`, bevor ApiProxy den gewöhnlichen Queue-Snapshot ohne die claimed Zeile publiziert. Der Service behält diesen prozess-lokalen Claim über asynchrone Zulassung und Reconnect hinweg, bis eine passende durable `user/message` publiziert wird oder der Agent einen terminalen Discard meldet.

Die passende `user/message` schließt die durable Projection und räumt den Claim auf. Ablehnung, Abbruch oder Disposal vor der Durability melden den Discard, räumen den Claim auf und lassen die Surface offen. Der Dock interpretiert das Verschwinden einer Queue-Zeile nie als eines dieser Ergebnisse: Er liest `getActive` neu; `pending.phase: 'claiming'` bleibt deaktiviert, `pending: null` stellt den Draft wieder her, und `not-open` schließt den Dock. `getActive` verbindet das aus dem Log abgeleitete aktive Vorkommnis mit diesem einen prozess-lokalen Pending-Record. Das Record ist Koordinations-State, keine zweite durable Autorität; nach einem Host-Neustart ist ein uncommitteter Claim abwesend und die noch offene geloggte Surface wird wieder editierbar.

`session.updateQueue` lehnt `edit` und `steer` für eine Task-Surface-korrelierte Zeile ab. Bearbeiten würde den formatierten Content von seinen source-getragenen strukturierten Werten trennen, und Steering würde eine `steering/message` persistieren, die den Submission-Lebenszyklus nicht erfüllt. `remove` ist erlaubt, solange die Zeile queued ist; es meldet den Discard und stellt die offene Surface wieder her. Sobald claimed, hat die Zeile die generische Queue verlassen, und Queue-Mutationen geben `queue-item-not-found` zurück. Der Task-Surface-Service hält ein einzelnes single-flight-Pending-Record bis zum Commit oder Discard.

## Lifecycle und Wiederherstellung

Das Session-Log ist die Autorität. Eine kleine `taskSurface`-Unit in der bestehenden [Session-Projektion](../architecture/2026-07-27-session-projection-and-command-log.de.md) faltet erfolgreiche Surface-Result-Metadaten und spätere Nutzer-Nachrichten-Quellen in diesen State:

```ts ignore-check
interface TaskSurfaceProjection {
  active: { callId: ToolCallId; surfaceId: TaskSurfaceId } | null
}
```

Eine Session hat höchstens eine offene Task Surface. Ein erfolgreiches Result öffnet sie. Eine passende Task-Surface-Nutzer-Nachricht oder ein Dismissal-Event schließt sie. Eine spätere gewöhnliche Nutzer-Nachricht schließt sie ebenfalls als expliziten Bypass; ein weiterer `show_task_surface`-Call schlägt fehl, bis eines dieser Events das aktive Vorkommnis schließt. Rewind und fork leiten ihr aktives Vorkommnis ab, indem sie das resultierende Log falten; die transiente Queue-Phase wird nicht kopiert, und keine separate Surface-Datenbank nimmt teil.

Das komplette Modell bleibt auf seinem `tool/result.meta`; die Projection trägt nur die aktive Identität. `TaskSurfaceDock` existiert unabhängig von Historien-Zeilen und reagiert auf diese Identität. `taskSurface.getActive({ sessionId, surfaceId })` liest das exakte Vorkommnis aus dem Session-Log, revalidiert seine Metadaten, verbindet das Pending-Koordinations-Record des Task-Surface-Services und gibt `{ callId, surfaceId, model, pending }` zurück. Ein fehlendes oder geschlossenes Vorkommnis gibt `not-open` zurück. Refresh und Reconnect stellen daher eine actionable Surface und ihre prozess-interne Pending-Phase wieder her, selbst wenn das Result außerhalb des Historien-Tails liegt, ohne das Modell in jede Projection-Baseline zu kopieren.

Das Web-Plugin behält ungesendete Werte in einem begrenzten, pro-Session-persistierten Slot-Store, key-basiert über `surfaceId`; sie gelangen nie in das Session-Log, den Prompt oder den Langzeit-Speicher. Gesendete Werte leben in der akzeptierten Nutzer-Nachricht, sodass der Verlust eines Browser-Drafts keinen Schluss löschen kann.

## Paketgrenzen und Abhängigkeiten

Die Capability wird dort getrennt, wo die Ownership wechselt:

| Paket | Verantwortung |
|---|---|
| `packages/core/agent` und `packages/core/agent-loop` | Generisches terminales Outcome für ein claimed Next-Turn-Inbox-Vorkommnis, das es einem Host-Beobachter erlaubt, durable Zulassung von Discard zu unterscheiden, ohne Task-Surface-spezifische Typen |
| `packages/task-surface/task-surface` | Browser-sicheres Modell, branded IDs, Korrelations- und Pending-Typen, Parser, Limits, Submission-Validator/-Formatter, Session-Event-Erweiterung, Projections-Unit und Host-Service-Contract |
| `packages/task-surface/tool-task-surface` | `show_task_surface`, kanonischer Output, Präsentations-Metadaten, generisches Render-Intent, aktive-Surface-Prüfung und `concludeTurn()`-Verhalten |
| `packages/client/runtime` | Generische queued-Nachrichten-`source`-Projection und session-scoped aktiver-Projektions-Zugriff |
| `packages/client/ui-primitives` | Task-Surface-agnostische `MarkdownText.remoteImages`-Policy, einschließlich des `alt-only`-Bild-Zweigs und der URL-Policy-Tests |
| `packages/client/ui-task-surface` | Statische actionable `TaskSurfaceDock`, read-only key-basierte Transcript-Zeile, deklarative Web-Renderer, der das Task-Surface-Modell und `MarkdownText` im `alt-only`-Mode konsumiert, pro-Session-Draft-Store und Submit-Client |
| `packages/host/apiproxy` | Getypeter active-read/submit/dismiss-Transport, Nutzer-Source-Erweiterung und -Carriage, Queue-Action-Beschränkungen und Routing von Claim- und terminalen Outcomes; delegiert Validierung, Pending-Koordination und Zulassung an den Task-Surface-Service |

`ui-task-surface` hängt ab von der browser-sicheren Task-Surface-Domäne, Client-Verbindung und Runtime, Locale, `ui-conversation` für die deklarierten Slot-Contracts, `ui-slots` für die Registrierung und `ui-primitives`; `ui-primitives` hängt nicht von Task Surface ab. ApiProxy hängt vom Task-Surface-Service-Contract und dem generischen AgentLoop-terminalen Outcome ab. Core-Agent-Pakete importieren keine Task-Surface-Typen.

Die Implementierung hängt ab von dem bestehenden Nachrichten-Log, kanonischen Tool-Output, getaggten Render-Intents, Session-Projektion, pro-Session-deklarierten Slot-Stores und Slot-Lifecycle. Sie hängt nicht von der Laufzeit-Erstellung von Client-Plugins ab. Der generierte Client-Plugin-Workflow kann Task Surface nutzen, um ein Review-Formular darzustellen, aber keines der Protokolle besitzt oder aktiviert das andere.

## Auslieferungsphasen

1. Lande das Modell/den Parser, die `MarkdownText`-Modell-URL-Policy, die Projections-Unit, `show_task_surface`, die Präsentations-Metadaten, die read-only-Web-Zeile, die statische `TaskSurfaceDock`, die aktive Abholung und den generischen Fallback mit read-only-Blöcken.
2. Füge Felder, persistierte Drafts, Host-validierte submit/dismiss, branded Korrelation, Client-queued-Source-Carriage, Task-Surface-`queued`/`claiming`-Koordination, terminale Meldungen für claimed Vorkommnisse, Queue-Action-Beschränkungen und sichtbare Nutzer-Nachrichten-Zulassung hinzu.
3. Füge nur Komponenten-Arten hinzu, die durch echte Aufgaben und zwei Consumer oder einen klaren generischen Fallback gerechtfertigt sind. Eine separate explizite Nutzer-Aktion kann den generierten Plugin-Authoring-Workflow starten, aber sie erstellt nur einen Kandidaten; sie befördert nie Code direkt.

## Erwogene Alternativen

**Ein Produkt-Komponenten-Element pro Aufgabenform.** Abgelehnt, weil es die Interaktionsform an ein Release bindet, eine permanente UI-Ownership schafft und jede neue Aufgabenform einen neuen Produkt-Trigger erfordert. Es bleibt der Pfad für dauerhafte, wiederverwendete Produkt-Interaktionen, die über eine Session hinausleben.

**Generierter Client-Plugin-Code.** Abgelehnt, weil er ausführbare Autorität, höhere Lifecycle-Kosten und eine Präsentation als Artefakt einführt, während die nützliche Persistenz die Nutzer-Submission ist. Er bleibt der Pfad für Cross-Session-Navigation, Background-Verhalten, neue Services und dauerhafte benutzerdefinierte UI.

**Erweiterte `ask_user_question`.** Abgelehnt, weil das bestehende Tool für kurze blockierende Fragen kalibriert ist und ein breites deklaratives Modell seine Semantik, seine Presentation und seinen Fallback verkomplizieren würde.

**Eine neue Render-Intent-Art pro Task Surface.** Abgelehnt, weil das generische Render-Intent plus die getaggte `presentationMeta`-Payload die Web-Zeile bereits erreichen lässt, ohne die Intent-Union zu vergrößern.

**Ein zweiter Editor in der Transcript-Zeile.** Abgelehnt, weil zwei Mutation-Owner für dieselbe Surface konkurrierende Drafts und Submissions erlauben würden; die Zeile bleibt eine read-only-Zusammenfassung, während der Dock der einzige actionable Mount ist.

**Eine separate Surface-Datenbank oder ein breiterer Projection-State.** Abgelehnt, weil das Session-Log bereits die exakte Vorkommnis-Autorität ist; die Projection trägt nur die aktive Identität, und der Service hält nur seinen einen prozess-lokalen Pending-Koordinations-Record.

## Akzeptanzkriterien

- `show_task_surface` akzeptiert ein valides `TaskSurfaceModelV1`, prägt `surfaceId`, persistiert die normalisierte Modell-Payload in `tool/result.meta` und beendet den Turn, ohne eine zweite Anweisung zu senden.
- Der Web-Client rendert `stack`/`grid`-Sektionen und die Version-1-Blöcke `markdown`, `metrics`, `table`, `diff` und `notice`; `markdown` rendert `remoteImages: 'alt-only'`, und unbekannte Versionen oder Arme fallen auf den generischen Result-Content zurück.
- Der Dock und die Transcript-Zeile rendern dasselbe Vorkommnis aus derselben Source-of-Truth; die Zeile ist read-only, und der Dock bleibt bei Paginierung, Refresh und Reconnect actionable.
- `submit` validiert Werte gegen das persistierte Modell, sendet eine sichtbare `kind: 'user'`-Nachricht mit `source.kind: 'task-surface'` und den strukturierten Werten, und zeigt denselben lesbaren Text im Transcript und im Prompt.
- `dismiss` hängt ein `task-surface/dismissed`-Event an, schließt die Projection und aktualisiert beide Web-Darstellungen, ohne einen Turn zu starten; es ist idempotent über `dismissalId` und deaktiviert, während eine Submission pending ist.
- `session.updateQueue` lehnt `edit` und `steer` für eine korrelierte Zeile ab; `remove` während `queued` meldet den Discard und stellt die offene Surface wieder her.
- Die Queue-Projektion behält die Task-Surface-source der Zeile, und die Claim-Phase zeigt dem Agenten ein leeres Inbox-Result, bis die passende `user/message` durable wird.
- `getActive` verbindet das aus dem Log abgeleitete Vorkommnis mit dem Pending-Record; `claiming` übersteht Reconnect, `pending: null` stellt den Draft wieder her, und `not-open` schließt den Dock.
- Ein Host-Neustart vor dem Commit lässt die geloggte Surface wieder editierbar, ohne eine zweite durable Surface-Autorität zu erzeugen.
- Limits, IDs, Feld-Deklarationen und Submission-Größen werden an den deklarierten Grenzen erzwungen, und `maxDepth`-unabhängige Depth- und Concurrency-Regeln bleiben unverändert.
- Das Plugin-Register zeigt die Task-Surface-Registrierung nur in Profilen, die sowohl den Host-Service als auch den Web-Renderer mounten; ein nur-`ptc`-Profil bewirbt das Tool nicht.

## Risiken

Das Produkt-gerichtete Submission-Format kann redundant werden, wenn viele Felder ausgefüllt sind. Der Formatter braucht eine deterministische kompakte Form und muss jeden gesendeten Wert bewahren, ohne das komplette Display-Modell zu wiederholen.

Ein prozess-lokaler Claim bis zur durable Übergabe fügt eine Invariante für den terminalen Zustand hinzu. Jeder Admission-Exit muss entweder die passende `user/message` oder einen expliziten Discard erzeugen; andernfalls könnte ein Reconnect einen deaktivierten Dock dauerhaft behalten.

Browser-lokale Draft-Persistenz kann sensible ungesendete Texte behalten. Der Store braucht das deklarierte Byte-Limit, pro-Session-Keys, explizites Löschen nach der Akzeptanz und dieselbe Storage-Position wie der bestehende Conversations-Draft.

Der Dock und die Transcript-Zeile zeigen dasselbe Vorkommnis in unterschiedlichen Rollen. Die Zeile read-only und der Dock als einziger Mutation-Owner zu halten, verhindert konkurrierende Drafts auf Kosten einer zweiten kompakten Darstellung, solange die Surface aktiv ist.
