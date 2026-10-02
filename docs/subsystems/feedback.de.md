# Message Feedback

[English](feedback.md) | [中文](feedback.zh.md) | Deutsch

[`@deepseek-ai/dsh-message-feedback`](../../packages/feedback/message-feedback) besitzt das editierbare Feedback für einzelne Assistant-Nachrichten. Das kanonische Session-Log speichert `feedback/message-put` und `feedback/message-delete`; die unveränderliche Bemerkung auf Session-Ebene bleibt `feedback/record`, im Besitz von [`@deepseek-ai/dsh-command-feedback`](../../packages/feedback/command-feedback) zusammen mit der `FeedbackCategory`-Taxonomie, unter der beide Feedbackarten abgelegt werden. Alle drei sind rein logbasierte Events, die niemals in den Modellkontext gelangen.

Quelle: [`packages/feedback/message-feedback/src/types.ts`](../../packages/feedback/message-feedback/src/types.ts)

## Öffentliche Typen

```ts type-equiv
/** Opaque compare-and-set token for one exact feedback item revision. */
type MessageFeedbackVersion = Branded<'MessageFeedbackVersion'>
```

```ts type-equiv
/** The human's overall judgment of one assistant message. */
type MessageFeedbackRating = 'positive' | 'negative'
```

```ts type-equiv
/** One current feedback value and its opaque mutation token. */
interface MessageFeedbackItem {
  /** Stable identity of the assistant message inside the owning Session. */
  readonly messageId: MessageId
  /** Overall positive or negative judgment. */
  readonly rating: MessageFeedbackRating
  /** Optional explanation, preserved verbatim after validation. */
  readonly note?: string
  /** Category the human filed a negative judgment under. */
  readonly category?: FeedbackCategory
  /** Equality-only token replaced by every material create or update. */
  readonly version: MessageFeedbackVersion
  /** Host-assigned creation time in Unix epoch milliseconds. */
  readonly createdAt: number
  /** Host-assigned time of the most recent material update. */
  readonly updatedAt: number
}
```

```ts type-equiv
/** A material creation or edit, retaining its complete current value. */
interface MessageFeedbackPut {
  /** Owning Session; inherited feedback in a fork belongs to its parent. */
  readonly sessionId: SessionId
  /** Value after this mutation, including the original creation time. */
  readonly item: MessageFeedbackItem
}
```

```ts type-equiv
/** A material deletion of one current feedback item. */
interface MessageFeedbackDelete {
  /** Session that owns the deleted feedback. */
  readonly sessionId: SessionId
  /** Message whose feedback was removed. */
  readonly messageId: MessageId
}
```

```ts type-equiv
/** Read all message feedback belonging to one persisted Session lifecycle. */
interface MessageFeedbackListRequest {
  /** Session whose feedback events should be read. */
  readonly sessionId: SessionId
}
```

```ts type-equiv
/** Current feedback values for one Session, in first-creation order. */
interface MessageFeedbackListValue {
  /** Fresh immutable item snapshots. */
  readonly items: readonly MessageFeedbackItem[]
}
```

```ts type-equiv
/** Create or replace feedback for one assistant message. */
interface MessageFeedbackPutRequest {
  /** Persisted Session that owns the target message. */
  readonly sessionId: SessionId
  /** Target assistant-message identity. */
  readonly messageId: MessageId
  /** Desired overall judgment. */
  readonly rating: MessageFeedbackRating
  /** Optional non-blank explanation. */
  readonly note?: string
  /** Optional category; absent keeps the item uncategorized. */
  readonly category?: FeedbackCategory
  /** Observed item version, or `null` to require that no item exists. */
  readonly ifVersion: MessageFeedbackVersion | null
}
```

```ts type-equiv
/** Delete feedback for one message after observing its current version. */
interface MessageFeedbackDeleteRequest {
  /** Session that owns the feedback. */
  readonly sessionId: SessionId
  /** Message whose feedback should be absent after this operation. */
  readonly messageId: MessageId
  /** Observed item version; ignored when the item is already absent. */
  readonly ifVersion: MessageFeedbackVersion
}
```

```ts type-equiv
/** Idempotent deletion acknowledgement. */
interface MessageFeedbackDeleteValue {
  /** Stable postcondition shared by the first deletion and every retry. */
  readonly absent: true
}
```

```ts type-equiv
/** No persisted Session header exists for the requested id. */
interface MessageFeedbackSessionNotFound {
  readonly code: 'session-not-found'
  readonly sessionId: SessionId
}
```

```ts type-equiv
/** The id does not name a derived, append-origin assistant message. */
interface MessageFeedbackTargetNotFound {
  readonly code: 'target-not-found'
  readonly sessionId: SessionId
  readonly messageId: MessageId
}
```

```ts type-equiv
/** A material mutation did not match the addressed item's current version. */
interface MessageFeedbackVersionConflict {
  readonly code: 'version-conflict'
  /** Authoritative current item, or `null` when it does not exist. */
  readonly current: MessageFeedbackItem | null
}
```

```ts type-equiv
/** A supplied note contains no non-whitespace character. */
interface MessageFeedbackNoteBlank {
  readonly code: 'note-blank'
}
```

```ts type-equiv
/** A supplied note exceeds the configured UTF-8 byte limit. */
interface MessageFeedbackNoteTooLarge {
  readonly code: 'note-too-large'
  readonly maxBytes: number
  readonly actualBytes: number
}
```

```ts type-equiv
/** Failures shared by the public message-feedback operations. */
type MessageFeedbackFailure =
  | MessageFeedbackSessionNotFound
  | MessageFeedbackTargetNotFound
  | MessageFeedbackVersionConflict
  | MessageFeedbackNoteBlank
  | MessageFeedbackNoteTooLarge
```

```ts type-equiv
/** Successful public operation result. */
interface MessageFeedbackSuccess<T> {
  readonly ok: true
  readonly value: T
}
```

```ts type-equiv
/** Rejected public operation result with a stable business failure. */
interface MessageFeedbackRejected<E extends MessageFeedbackFailure> {
  readonly ok: false
  readonly error: E
}
```

```ts type-equiv
/** Result returned by the message-feedback `list` operation. */
type MessageFeedbackListResult =
  | MessageFeedbackSuccess<MessageFeedbackListValue>
  | MessageFeedbackRejected<MessageFeedbackSessionNotFound>
```

```ts type-equiv
/** Result returned by the message-feedback `put` operation. */
type MessageFeedbackPutResult =
  | MessageFeedbackSuccess<MessageFeedbackItem>
  | MessageFeedbackRejected<
    | MessageFeedbackSessionNotFound
    | MessageFeedbackTargetNotFound
    | MessageFeedbackVersionConflict
    | MessageFeedbackNoteBlank
    | MessageFeedbackNoteTooLarge
  >
```

```ts type-equiv
/** Result returned by the message-feedback `delete` operation. */
type MessageFeedbackDeleteResult =
  | MessageFeedbackSuccess<MessageFeedbackDeleteValue>
  | MessageFeedbackRejected<MessageFeedbackSessionNotFound | MessageFeedbackVersionConflict>
```

## Session-Feedback-Typen

Quelle: [`packages/feedback/command-feedback/src/types.ts`](../../packages/feedback/command-feedback/src/types.ts)

```ts type-equiv
/** One of the fixed feedback categories; the ids are durable log vocabulary. */
type FeedbackCategory =
  | 'task-result'
  | 'instruction-following'
  | 'product-interaction'
  | 'service-stability'
  | 'resource-cost'
  | 'security-privacy-permission'
  | 'other'
```

```ts type-equiv
/**
 * One recorded human remark about a Session. Both members are optional: a
 * submission with neither still records that the human asked for the
 * Session to be reviewed, which is what authorizes log delivery.
 */
interface FeedbackRecord {
  /** Free-text remark with surrounding whitespace removed; never empty when present. */
  readonly text?: string
  /** Category the human filed the remark under. */
  readonly category?: FeedbackCategory
}
```

```ts type-equiv
/** Record one Session-level remark through the Host Remote. */
interface SessionFeedbackRecordRequest {
  /** Live Session the remark describes. */
  readonly sessionId: SessionId
  /** Free-text remark; blank text is recorded as absent. */
  readonly text?: string
  /** Category the human filed the remark under. */
  readonly category?: FeedbackCategory
}
```

```ts type-equiv
/** Stable postcondition of a recorded remark. */
interface SessionFeedbackRecordValue {
  /** The remark is appended to the Session log; flushing follows the Session's own schedule. */
  readonly recorded: true
}
```

```ts type-equiv
/** No live Session carries the requested id. */
interface SessionFeedbackSessionNotFound {
  readonly code: 'session-not-found'
  readonly sessionId: SessionId
}
```

```ts type-equiv
/** Result returned by the `sessionFeedback.record` operation. */
type SessionFeedbackRecordResult =
  | { readonly ok: true; readonly value: SessionFeedbackRecordValue }
  | { readonly ok: false; readonly error: SessionFeedbackSessionNotFound }
```

## Daten und Nebenläufigkeit

Aktuelle Einträge werden aus kanonischen Feedback-Events gefaltet, deren Payload-`sessionId` zur besitzenden Session passt. Jeder Eintrag trägt eine positive oder negative Bewertung, eine optionale Notiz, eine optionale Kategorie, Host-zugewiesene `createdAt`/`updatedAt`-Zeitstempel und eine eigene opaque version. Versionen werden nur auf Gleichheit und nur gegen die adressierte Nachricht verglichen; Aufrufer ordnen oder synthetisieren sie nicht.

`put` verwendet strikte optimistische Nebenläufigkeit: Jede Anfrage für einen existierenden Eintrag muss dessen aktuelle `ifVersion` treffen, auch bei einem No-op (ein put, der gespeicherte Bewertung, Notiz und Kategorie wiederholt). Ein Konflikt liefert den maßgeblichen aktuellen Eintrag (oder `null`), sodass ein Aufrufer eine verlorene Antwort oder eine nebenläufige Änderung ohne weiteren Lesevorgang abgleichen kann. Das Löschen eines bereits fehlenden Eintrags ist erfolgreich. Eine Warteschlange pro Session serialisiert Lese- und Änderungsoperationen; kalte Änderungen halten einen Persistence-Schreib-Handle über Lesen, Vergleichen, Append und Flush hinweg. Passende No-ops fügen kein Event an.

## Ziel- und Lebenszyklus-Autorität

Das In-Memory-Log eines live Owners liefert die Beobachtung der Ziel-Session direkt; kalte Lesevorgänge nutzen einen `SessionPersistence.open(id, 'read')`-Handle, Änderungen einen Schreib-Handle. Kein Pfad konstruiert eine Session oder einen Agent. Ein `stat(id)`-Preflight klassifiziert das definitive Fehlen; ein Lesefehler für eine von `stat` bestätigte Session propagiert als Infrastrukturfehler. `put` akzeptiert nur eine nicht-leere, append-origin `assistant/message` mit der angefragten `MessageId`; replacement-origin-, nur-usage-leere und nicht-assistant-Einträge sind keine Feedback-Ziele.

Fork-Saatgut kann Feedback-Events des Parents enthalten, doch deren Payload behält die parent-`sessionId`, sodass sie nicht zum aktuellen Feedback des Kindes werden. Das Löschen eines Eintrags fügt einen Tombstone an; frühere Bewertungen und Notizen bleiben im Log.

## Persistenz- und Remote-Kontrakt

Erfolgreiche Message-Feedback-Mutationen warten die kanonische Persistenz ab: Live-Operationen appenden über die besitzende Session und erfordern einen teilnehmenden `ctx.sessions.flush`-Listener; kalte Operationen appenden und flushen über ihren Schreib-Handle. Persistenzfehler propagieren, statt Erfolg zu melden. `maxNoteBytes` ist erforderlich und begrenzt den Notiztext in UTF-8-Bytes; die Web-Host-Komposition setzt `8192`. Das Paket publiziert den Host-Remote-Kontrakt `messageFeedback.list`, `messageFeedback.put` und `messageFeedback.delete` als unäre Operationen über `TypertRemoteService` und `@Remote`; `command-feedback` publiziert `sessionFeedback.record` auf demselben Weg für Bemerkungen auf Session-Ebene an live Sessions. Die unten generierte Cordis-API ist die Autorität auf Methodenebene.

Beim dispose des Plugins wird die Aufnahme von Operationen geschlossen und akzeptierte Arbeit der per-Session-Warteschlangen abgedräht.

Wenn explizit aktiviert, überträgt [`session-log-deepseek`](../../packages/session/session-log-deepseek/README.de.md) Feedback als Teil des gewöhnlichen `dsh_session_log`-Suffix auf nachfolgenden berechtigten DeepSeek-Anfragen. Das Aufzeichnen von Feedback löst weder eine LLM-Anfrage noch einen separaten `dsh_feedback`-Upload aus. Für Nicht-DeepSeek-Routen kann das [OTel-Backend](../../packages/session/session-telemetry-otel/README.de.md) das kanonische Präfix über aufgezeichnetes Feedback freigeben. Die Befehlsbestätigung bestätigt die Aufzeichnung und identifiziert Session und anonymen Benutzer; sie meldet weder Telemetrie-Policy noch Zustellung.

## Web-Oberfläche

[`@deepseek-ai/dsh-client-ui-message-feedback`](../../packages/client/ui-message-feedback) ist der Browser-Consumer. `@deepseek-ai/dsh-api-remotes` mountet die generierten `messageFeedback`- und `sessionFeedback`-Beiträge, sodass das Plugin `ctx.remote.messageFeedback` und `ctx.remote.sessionFeedback` aufruft und den Transport nie berührt.

Die Steuerelemente sind der `feedback`-Eintrag (order 10) des `conversation.chat.assistant-actions`-list-slots, den `ui-conversation` deklariert und innerhalb der IconActions-Zeile der finalisierten Assistant-Nachricht rendert. `AssistantMessageNode` trägt die optionale `messageId` aus dem `assistant/message`-Event. Das Feld fehlt bei durch Unterbrechung eingefrorenen Partials, und die Render-Stelle überspringt den slot, wenn es fehlt. Die Leiste rendert einmal pro Turn, auf der abschließenden Assistant-Nachricht: Der Host akzeptiert jede append-origin-Schrittnachricht als Ziel, doch frühere Schritte eines mehrstufigen Turns rendern Tool-Zeilen statt eines bewertbaren Bodys, sodass die UI eine engere Menge anbietet als der Host-Kontrakt erlaubt.

Ein `MessageFeedbackController` pro Session bedient jedes Nachrichtensteuerelement in dieser Session: Ein einziger `list`-Lesevorgang befüllt den gesamten Transcript, aufgeschoben bis zum ersten Hover oder Focus statt beim Mount ausgelöst. Jede Mutation sendet die zuletzt vom Controller beobachtete Version als `ifVersion`; eine `version-conflict`-Antwort trägt den maßgeblichen Eintrag, sodass der Controller aus der Antwort abgleicht statt neu zu laden. Mutationen serialisieren pro Session, sodass eine eingereihte Operation gegen die committete Version vergleicht. Ein `connection/reset` aktualisiert nur bereits gelesene Sessions.

Like zeichnet die nackte positive Bewertung sofort auf und zeigt den Bestätigungs-Toast. Dislike öffnet den Feedback-Dialog der Session, den `feedback-dialog`-Eintrag von `conversation.input.overlay`: die gemeinsame Modal-Karte mit sieben Kategorie-Chips und einem Detailfeld. Submit puttet eine negative Bewertung mit der gewählten Kategorie und der getrimmten Beschreibung — oder ohne beides. Derselbe Dialog öffnet sich für die Session über ein nacktes `/feedback` — eine Dekoration, die `ui-commands` als `action` routet — und zeichnet anschließend über `sessionFeedback.record` auf; `/feedback <text>` behält den Host-Kommando-Pfad. Ein Klick auf eine aufgezeichnete Bewertung zieht sie zurück.

## Grenzen und Einschränkungen

- Die Operations-Warteschlange ist prozesslokal; die Exklusivität kalter Schreiber hängt vom gewählten Persistence-Provider ab.
- Das Löschen entfernt den aktuellen Eintrag, nicht früheren Notiztext aus dem append-only Log oder einem bereits zugestellten Suffix.
- Eine Anfrage im schmalen Intervall nach dem live detach, aber bevor der Persistence-Katalog den Header materialisiert, kann `session-not-found` erhalten; Aufrufer wiederholen nach der Retirement-Materialisierung.
- Kalte Anfragen lesen das komplette Log; der Dienst hat keine Obergrenze für Eintragszahl oder aggregierte Bytes. `maxNoteBytes` begrenzt nur jede Notiz.
- Der Host-Kontrakt zeichnet keinen authentifizierten Actor und keine Audit-Identität auf und setzt daher eine vertrauenswürdige Aufrufergrenze voraus.
- Die Web-Steuerelemente erscheinen nur in der Chat-Ansicht. Die Trajectory- und Waterfall-Ansichten rendern keinen Feedback-Eintrag, obwohl ihre Assistant-Knoten dieselbe `messageId` tragen.
- Der Web-Controller konsumiert keine Feedback-Log-Events, sodass die Bewertung eines zweiten Tabs erst beim Reconnect oder bei der nächsten Konfliktantwort sichtbar wird.
- Der Dialog prüft `maxNoteBytes` nicht vorab; eine überlange Beschreibung für eine Nachricht schlägt beim Submit mit `note-too-large` fehl, nicht während der Eingabe. Eine Session-Bemerkung hat keine Größengrenze, da das `/feedback`-Kommando nie eine hatte.
- `sessionFeedback.record` bedient nur live Sessions und antwortet sonst `session-not-found`; der Dialog meldet diesen Fehlschlag, wenn seine Session retiriert, während er offen ist.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.de.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxmessagefeedback--messagefeedbackservice"></a>

### `ctx.messageFeedback` — `MessageFeedbackService`

Session-log service; cold operations never construct a Session or Agent.

```ts cordis-catalog
/**
 * Read current feedback from the canonical log.
 * @param request - Session to inspect.
 * @returns immutable items or a definite persistence miss.
 */
@Remote('list') list(request: MessageFeedbackListRequest): Promise<MessageFeedbackListResult>

/**
 * Create or replace feedback after checking its current version.
 * Matching no-ops retain the version and append no event.
 * @param request - Target, desired value, and observed item version.
 * @returns the durable item or an explicit business failure.
 */
@Remote('put') put(request: MessageFeedbackPutRequest): Promise<MessageFeedbackPutResult>

/**
 * Delete one item after checking its version; absence succeeds without an event.
 * @param request - Session, message, and observed item version.
 * @returns the stable absent postcondition or an explicit failure.
 */
@Remote('delete') delete(request: MessageFeedbackDeleteRequest): Promise<MessageFeedbackDeleteResult>
```

Source: [`packages/feedback/message-feedback/src/index.ts`](../../packages/feedback/message-feedback/src/index.ts)

<a id="ctxsessionfeedback--sessionfeedbackservice"></a>

### `ctx.sessionFeedback` — `SessionFeedbackService`

Host Remote through which a product surface records a Session-level remark.

```ts cordis-catalog
/**
 * Record one remark on a live Session.
 * @param request - target Session plus the optional text and category.
 * @returns the recorded postcondition, or `session-not-found` when no live
 * Session carries the id.
 */
@Remote('record') record(request: SessionFeedbackRecordRequest): Promise<SessionFeedbackRecordResult>
```

Source: [`packages/feedback/command-feedback/src/index.ts`](../../packages/feedback/command-feedback/src/index.ts)

<a id="feedback-events"></a>

### `feedback/*` events

<a id="feedbackcommitted--parallel"></a>

#### `feedback/committed` — parallel

Observe a durable cold feedback mutation without publishing a live Session. Observers run before write ownership is released and must not await another message-feedback operation for this Session. The payload is borrowed read-only; deep-clone it before transferring ownership (for example, to Session.fromRestore).

```ts cordis-catalog
/**
 * Observe a durable cold feedback mutation without publishing a live Session.
 * Observers run before write ownership is released and must not await
 * another message-feedback operation for this Session. The payload is borrowed
 * read-only; deep-clone it before transferring ownership (for example, to Session.fromRestore).
 * @param inspection - committed canonical prefix, including the feedback as its last event.
 * @mode parallel
 */
'feedback/committed'(inspection: SessionInspection): void
```

Types: [SessionInspection](persistence.de.md)

Source: [`packages/feedback/message-feedback/src/index.ts`](../../packages/feedback/message-feedback/src/index.ts)
<!-- END GENERATED cordis-surface -->
