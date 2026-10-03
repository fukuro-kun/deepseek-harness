# Agent Note: Session-History, Control State und Remote-Event-Transport
[English](2026-08-18-session-history-and-event-transport.md) | [中文](2026-08-18-session-history-and-event-transport.zh.md) | Deutsch

Status: implemented


## Problem

Der Browser konsumiert drei Arten von Daten mit unterschiedlichen Lebenszyklen: persistierbare, paginierte Session-Logs; prozesslokalen Zustand, der eine öffnende Baseline braucht, um nach einem Reconnect zu konvergieren; und sofortige Benachrichtigungen, die kein Replay brauchen.

Diese Datenarten können keine Recovery-Regel teilen. Session-Logs haben stabile Sequenznummern und Persistenz, also kann ein Cursor Lücken füllen; Queue-, Jobs- und Workspace-Listen brauchen einen vollständigen Snapshot, um einen alten Spiegel zu ersetzen; gewöhnliche Benachrichtigungen versprechen nur Zustellung innerhalb der aktuellen Connection-Generation.

Das Beobachten von Session-History, Listen und Projektionen muss Cold Reads erlauben. Wenn der Transport bei jedem Argument, das eine Session oder einen Agent enthält, eine allgemeine Typert-Suche durchführt, führt das Öffnen einer Seite, das Wechseln eines Tabs oder ein Netzwerk-Reconnect implizit ein Agent-Resume aus — Beobachtung erhält so Ausführungs-Nebeneffekte.

Befehle wie prompt, create, fork und Model Selection müssen einen Agent gemäß ihrer eigenen Semantik tatsächlich erstellen oder resumen. Activation-Autorität muss jeder Remote-Methode gehören, nicht implizit vom Träger, den Parametertypen oder einer geteilten Suche entschieden werden.

Der Legacy-API-Proxy-All-Session-Mux, `HostFrame` und Workspace-Benachrichtigungen kodieren Domain-Daten, Baselines, Fehler und Verbindungslebenszyklus in einem handgeschriebenen Protokoll. Jeder zusätzliche Zustand dupliziert Frame-Deklarationen, eine Client-Bridge, Reconnect-Handling und Cleanup-Logik, während API Proxy nicht dahin zurückkehren kann, nur noch die noch nicht migrierten Geschäftsmethoden zu besitzen.

Host-to-Client-Cordis-Events haben außerdem zwei Aufrufmodi. Gewöhnliche Benachrichtigungen brauchen nur Broadcast-Zustellung; Agent-scoped Waterfalls wie Approval und Question müssen einem Client erlauben zu claimen, über `next()` zu delegieren, ein Ergebnis zurückzugeben oder abzulehnen, während eine Host-Aufrufidentität über mehrere Clients, Disconnects und Cancellation hinweg erhalten bleibt.

Diese Anforderungen brauchen einen allgemeinen Transport-Lebenszyklus, ohne dass Gateway Session-, Workspace-, Approval- oder Question-Geschäftsdaten verstehen muss.

## Entscheidung

API Gateway besitzt Remote-Transport, Stream-Lebenszyklen und Remote-Event-Koordination. Session Controller und Workspace Controller besitzen ihre Host-APIs, Wire-Typen und Client-Domain-Adapter. Client Runtime komponiert und konsumiert diese Objekte nur; sie implementiert keine weitere Carrier-State-Machine.

Der aktuelle Ownership ist:

```text
[client/connection]
|-- Host description
|-- Connection generation
`-- unary RPC transport

[api/gateway/client]
|-- RemoteStream
|-- RemoteSnapshotStream
|-- RemoteJournalStream
`-- ctx.remote.$on + $events pump

[api/session-controller]
|-- ctx.remote.session unary commands
|-- session.control snapshot stream
|-- session.page + session.follow journal
`-- Session Client adapters

[api/workspace-controller]
|-- ctx.remote.workspace unary commands
|-- workspace.follow snapshot stream
`-- Workspace Client model and adapter

[api/remotes]
`-- application Remote Event allowlist and Host Cordis source

[client/runtime]
`-- compose Session and Workspace domain state for consumers
```

API Proxy besitzt weder den Session- oder Workspace-Remote-Namespace noch den Host-Downlink-Event-Carrier. `/api/events.host`, `HostFrame`, `stream/error`, `ServerRequest` und ihre WebSocket/SSE-Zweige nehmen an diesem Datenpfad nicht teil.

### Connection Generation und physische Verbindungen

Das Client-Remote-Plugin des Browsers startet `RemoteStreamMuxClient` idempotent bei Aktivierung und verbindet sich sofort mit `/api/remote.mux`. Der physische WebSocket bleibt resident, auch wenn kein logischer Geschäfts-Stream existiert, aber der Mux führt keine eigene Retry-Planung durch.

Der Host sendet in jedem konfigurierten `websocketHeartbeatIntervalMs`-Intervall (standardmäßig zwei Sekunden) einen RFC-6455-Ping-Control-Frame an jeden offenen Mux-Socket. Der Browser antwortet auf Protokollebene mit Pong; keiner der Control-Frames betritt die Remote-Stream-JSON-Union oder ändert den Connection-Generation-Status. Vor jedem Ping markiert der Host den Socket als auf Pong wartend und terminiert ihn beim nächsten Intervall, wenn kein Pong ankam.

Nach einem anfänglichen Verbindungsfehler oder dem Verlust eines verbundenen Sockets beenden offene logische Streams ihre aktuelle physische Generation mit `RemoteStreamCarrierError`. `ConnectionController` besitzt den kontinuierlichen exponentiellen Retry-Plan mit gedeckeltem Delay; jeder Versuch bittet den Mux genau einmal, einen Kandidaten- oder aktiven Socket zu ersetzen, bevor `$events` wieder geöffnet wird. Ein vom Benutzer angeforderter Reconnect setzt die Versuchssequenz zurück und umgeht das Delay über denselben Pfad ([Entscheidung](../../archived/feature/2026-08-28-web-connection-recovery-control.md)).


Die Network-Status-Events des Browsers sind Inputs desselben Controllers. `offline` zieht die Connection Generation zurück und suspendiert automatische Retries; der nächste `online`-Übergang startet den Basis-Backoff neu. Diese Events stellen nie Konnektivität her: Nur ein frischer `$events`-Ready-Frame veröffentlicht eine Connection Generation.

In-process `connection.rpc.open` verwendet dieselbe logische Endpoint-Semantik und umgeht dabei den Browser-WebSocket-Mux.

Der Gateway-interne `$events`-logische Stream ist die einzige Generationsquelle für `ConnectionHandle`. Er hängt nicht davon ab, ob ein geschäftliches `$on`-Abonnement existiert, sodass die Verbindungsgesundheit nicht mit der Anzahl der UI-Listener variiert.

Die Host-Event-Quelle installiert inkrementelle Listener synchron, bevor sie ihren ersten Frame zurückgibt. Gateway sendet dann `{ type: 'ready', clientId, host: { home } }`; dieser Frame beweist, dass die aktuelle Generation Inkremente empfangen kann, und trägt den stabilen Host-Pfad-Anzeigefakt.

`ConnectionController` veröffentlicht `connected` erst nach der `$events`-Bereitschaft, sodass eine Session- oder Workspace-Baseline nicht gelesen werden kann, bevor die inkrementellen Host-Listener bereit sind.

Unerwartete normale Beendigung von `$events`, ein Host-Fehler, ein fehlgeformter Öffnungs-Frame oder ein Carrier-Fehler beendet die aktuelle Connection Generation. Connection zieht die Generation zurück und stellt `$events` dann unter ihrem begrenzten Backoff wieder her, es sei denn, der Browser ist offline oder ein Benutzer fordert einen sofortigen Retry an.

Gateway-Stream-Generation, Connection Generation und eine Session-Business-Open-Epoch sind drei unabhängige Zähler: Der erste identifiziert den physischen Ersatz eines logischen Streams, der zweite einen Host-Verfügbarkeits-Handshake und der letzte verhindert, dass ein veraltetes Session-Open in den aktuellen Zustand schreibt.

Die Entsorgung des Host-Plugins stoppt den Heartbeat-Timer, terminiert Mux-Sockets und wartet auf aktive Iteratoren. Die Entsorgung des Client-Plugins stoppt Retry-Delays, bricht Kandidaten- und aktive Sockets ab, beendet logische Streams und wartet Quiescence von Hintergrundschleifen und Verbrauchern ab.

### Allgemeines Remote-Stream-Modell

Gateway Client stellt drei React-unabhängige Single-Consumer-Lebenszyklusobjekte bereit:

```text
RemoteStream<Item>
|-- RemoteSnapshotStream<Snapshot, Delta>
`-- RemoteJournalStream<Page, Entry, Cursor>
```

Domain-Controller verwenden sie durch Komposition oder dünne Adapter; Session und Workspace erben keine gemeinsame Controller-Basisklasse, die Domain-Frames kennt.

#### `RemoteStream`

`ctx.remote.$stream(options)` gibt einen `RemoteStream<Item>` zurück, der für Reopen, Cancellation und Disposal eines logischen Streams über physische Generationen hinweg verantwortlich ist.

Jedes Item trägt eine monotone Generation, den `AbortSignal` dieser Generation und `accept()`. Ein Domain-Verbraucher ruft `accept()` erst nach Validierung des öffnenden Cursors oder der Baseline auf.

Nur `RemoteStreamCarrierError` erlaubt Retry. Solange der Host verfügbar bleibt, ist ein unabhängiges Reopen erlaubt; sonst wartet der Stream auf eine neue Connection Generation. Geschäftsfehler, Protokollfehler und Öffnungsfehler terminieren sofort.

`restart()` ersetzt nur die aktuelle physische Generation und erhält den logischen Stream. `dispose()` beendet den logischen Stream, ausstehende Retries und den Iterator dauerhaft und wartet dann auf Quiescence.

`RemoteStream` versteht keine Baselines, Deltas, Pages, Cursors, Sequenznummern oder irgendwelche Domain-Frames.

#### `RemoteSnapshotStream`

`RemoteSnapshotStream<Snapshot, Delta>` verlangt, dass jede Generation mit genau einem vollständigen Snapshot beginnt, gefolgt nur von Deltas.

Ein Update vor dem Snapshot oder ein zweiter Snapshot in derselben Generation ist ein terminaler Protokollfehler.

Die Generation wird erst akzeptiert, nachdem ihr Snapshot erfolgreich angewendet wurde. Der zuvor veröffentlichte Zustand bleibt lesbar, während der Carrier reconnectet, und der Snapshot der neuen Generation ersetzt den alten Spiegel atomar.

Der Domain-Adapter liefert Frame-Diskriminierung, Snapshot-Ersetzung, einen Delta-Reducer, Carrier State und eine terminale Fehler-Senke. Die allgemeine Schicht parst keine Session- oder Workspace-Felder.

Session Control und Workspace State verwenden jeweils einen unabhängigen `RemoteSnapshotStream`.

#### `RemoteJournalStream`

`RemoteJournalStream<Page, Entry, Cursor>` kombiniert ein Live-Follow mit einer Page-Methode im selben Namespace. Es gilt für ein append-only Journal mit stabiler Reihenfolge, paginierter History und einem Live-Ende.

Das initiale Öffnen etabliert das Follow und erhält dessen öffnenden Cursor, bevor die initiale Page gelesen wird. Live-Einträge, die während der ausstehenden Page-Anfrage entstehen, gelangen bereits in die Follow-Queue und schließen das Wettrennen zwischen History lesen und anschließendem Abonnieren.

Die allgemeine Schicht entfernt Überlappungen zwischen Page und gequeueten Einträgen per Cursor, verifiziert Kontinuität und veröffentlicht ein vollständiges Fenster, nachdem die Page den öffnenden Cursor abdeckt.

Zusammenhängende Live-Einträge veröffentlichen `append`; ältere History-Pages veröffentlichen `prepend`. Reconnect, Cursor-Sprünge oder nicht beweisbare Kontinuität lösen eine Tail-Page-Reparatur aus.

Das alte Fenster bleibt während der Reparatur lesbar. Die Page und die während des Reads akkumulierten Live-Einträge bilden ein kontinuierliches Fenster und veröffentlichen ein `replace`, ohne je einen halb reparierten Zustand zu exponieren.

Wird eine Page-Anfrage mit ihrer physischen Carrier-Generation abgebrochen, wartet das Journal auf den öffnenden Cursor der nächsten Generation und liest die Page an diesem Cursor erneut. Dieser Abbruch leakt nicht als terminale Page-Fehler an das Domain-Objekt.

`RemoteJournalStream` besitzt öffnenden Cursor, Resume-Cursor, Paginierung, Reconnect-Catch-up, Überlappungsentfernung und Gap-Reparatur. Ein Domain-Session-Objekt kopiert diese State Machines nicht.

### Session Controller

`packages/api/session-controller` stellt Host `ctx.sessionController` und den generierten `ctx.remote.session`-Namespace bereit.

Er besitzt Session-Liste, Suche, Erstellen, selectModel, Umbenennen, Fork, Prompt, Attachment, updateQueue, Cancel, Page, Follow und Control. Der Host-generierte Modellkatalog wird separat über `session/modelCatalog` exponiert, weil er nicht Session-spezifisch ist.

Das Paket trennt intern Agent-, Command-, Control-, History- und List-Controller, aber Session-Identity-Auflösung, Activation-Policy, Subagent-Ownership und Remote-Fehlerprojektion haben einen öffentlichen Eigentümer.

Andere Host-Remote-Namespaces verwenden dieselben Identitätsregeln über `ctx.sessionController.inspect()` oder `resolveAgent()` wieder; sie behalten keinen zweiten Session-Resolver.

#### Activation Policy

Session-Remote-Methoden übergeben `SessionId` oder `SessionAddress`; Parametertypen lösen keine allgemeine Typert-Session-Suche aus.

Jede Methode wählt explizit eine Cold Inspection, eine Live-only-Suche oder eine Resume-fähige Auflösung:

| Operation | Quelle oder Ergebnis ohne einen Live-Agent | Activation-Regel |
|---|---|---|
| `session.list`, `search` | Header und Projection-Cache; ein begrenzter Small-Log-Read kann unsichere Blankness auflösen | Resumiert nie einen Agent |
| `session.page(address)` | Attached Session oder Persistence-Log | Resumiert nie einen Agent |
| `session.follow(address)` | Eine Live- oder Prepared-Observation, die die öffnende Page und Projektionen trägt | Veröffentlicht zuerst den Snapshot, dann befördert es eine gewöhnliche Cold Session einmal im Hintergrund |
| `session.control()` | Aktuelle attached Agents, Pending-Registry und prozesslokale Registries | Baseline und Reconnect resumieren keinen Agent |
| `session.attachment`, Fork-Quell-Read | Autorisierte durable Session-Daten | Ein Read resumiert keinen Agent |
| `session.updateQueue`, `cancel` | Nur der aktuelle Live-Agent | Resumiert keinen verschwundenen Zustand |
| `models`, `selectModel`, `rename`, `prompt` | Befehl löst die Ziel-Session auf | Resumiert nur, wenn die Methode es explizit erlaubt |
| `create` und Fork-Ziel | Neue Session/Agent | Der Benutzerbefehl liefert die Erstellungsautorität |

Titel, Listen und Projektionen zu lesen erfordert keinen Agent. Eine Beobachtungsoperation kann Resume-Autorität nicht erben, nur weil ein anderer Remote-Endpoint Agent-Lookup verwendet.

`SessionQuery.observeSession()` wählt eine Attached Session oder bedient eine Cold aus dem eigenen Prepared-Cache des Readers, gefüllt über einen Persistence-Read-Handle. Der Cache teilt gleichzeitige Cold Reads und pinnt einen Eintrag, bis jeder Observation-Lease freigegeben ist. Eine Observation berechnet entweder alle registrierten Projektionen oder keine; Aufrufer dürfen eine Teilmenge exponieren, aber kein Aufrufer erzeugt einen partiellen Projektionszustand.

`session.list` führt nie einen unbegrenzten Cold-Log-Scan durch. Es verwendet gecachte Projection-Hints, sofern verfügbar, und darf nur ein einzeln gespeichertes Artifact innerhalb des konfigurierten Small-Log-Byte-Limits vollständig beobachten, um eine verlassene Blank Session zu unterscheiden. Fehlende oder unlesbare Hints lassen die Zeile mit unbekannten Metadaten sichtbar.

`model/selection` ist ein Required-on-Read-Permanent-Event, weil es die von der nächsten Anfrage verwendete Model Route ändert. Seine Projektion zeichnet sowohl die letzte Request-Auswahl als auch eine spätere Pending-Auswahl auf; die Prompt-Assembly konsumiert den Pending-Wert, wenn der passende `request/header` committet wird.

#### Session Journal

`session.page` gibt ein History-Fenster zurück, das an Nachrichtengrenzen mit zusammenhängenden internen Sequenznummern beschnitten ist. Jede Anfrage muss ein explizites `throughSeq` tragen; dieser Wert kommt vom öffnenden Cursor der entsprechenden `session.follow`-Generation und fixiert den Read am selben Log-Schnitt. Eine Tail-Page ohne `beforeSeq` muss exakt bei `throughSeq` enden, wobei `-1` ein leeres Log bezeichnet. `beforeSeq` wählt nur eine ältere Page vor diesem Schnitt und kann den Synchronisationscursor nicht ersetzen. `maxMessages` begrenzt die Anzahl der User/Assistant-Nachrichten, ohne Chunks, Tools oder State-Events zwischen diesen Nachrichten zu verwerfen.

Die Tail-Page trägt außerdem eine Projection-Baseline nicht später als `throughSeq`; ältere Pages tragen nur historische Einträge. Der Client mergt Pages und nachfolgende Live-Control-Updates per Projection-Watermark.

Gewöhnliche Sessions und Direct Subagents verwenden ein `SessionAddress`-Protokoll. Eine Direct-Subagent-Adresse trägt Parent Session, Child Session und Mode; ein Cold Host Read verifiziert durable Ownership und Descriptor statt Zugriff allein aus der Child-ID zu autorisieren.

`session.follow` installiert `session/event`- und `session/created`-Listener, bevor eine Attached oder Prepared Session beobachtet wird.

Die erste Follow-Antwort ist ein vollständiger `{ type: 'snapshot', header, cursor, events, hasMore, projections }`-Frame. Jeder Reconnect sendet eine weitere vollständige Snapshot-Ersetzung; das Protokoll hat kein `afterSeq`. Während der Observation committete Events bleiben gepuffert und werden nach dem Snapshot in Sequenzreihenfolge emittiert.

Eine Cold Ordinary Session kann ihren Prepared Snapshot sofort veröffentlichen. Nach diesem ersten Frame übergibt der Controller eine retained Observation an eine Hintergrund-Promotion; Follow wartet nicht auf Activation. Direct-Subagent-Adressen verwenden diesen Promotion-Pfad nie.

Client `SessionEventStream` erweitert `RemoteJournalStream` und liefert nur `session.follow`, `session.page`, den Session-Sequenzalgorithmus und Reparaturanfragen. Die allgemeine Schicht validiert und veröffentlicht den öffnenden Snapshot direkt. Sie ruft `session.page({ throughSeq })` nur für ältere History auf oder wenn ein späteres Event eine Sequenzlücke offenbart.

```text
ctx.remote.session.follow(address, pageArgs) ----------------|
  snapshot(header, cursor, page, projections), event*        |[]> SessionEventStream
ctx.remote.session.page(address, throughSeq, pageArgs) -------|    |-- replace(window)
                                                                  |-- prepend(history)
                                                                  `-- append(live entry)
```

Jede Client Session besitzt nur ein aktuelles `events: SessionEventStream | undefined`. Das schreibgeschützte `SessionEventSource` gibt das materialisierte Event-Fenster an Conversation-Verbraucher.

Der `openGeneration` einer Session verhindert nur, dass ein durch Resync, Adressersatz oder Disposal ausgemusterter asynchroner Result in den aktuellen Zustand schreibt. Er nimmt am Transport-Retry nicht teil.

Ein terminaler Fehler aus der Initial-Page, Repair-Page oder dem Follow gelangt in den `openError` der aktuellen Session. Eine stale Business Epoch oder ein stale Stream kann neueren Zustand nicht überschreiben.

#### Session Live Control

`session.control()` ist ein Host-weiter Snapshot-Stream. Ein Browser kann transienten Zustand für alle aktuellen Live-Sessions beobachten, ohne für jedes Transcript ein Journal zu öffnen.

Jede Generation emittiert zuerst eine vollständige Baseline, gefolgt von Queue-, Jobs- und Projection-Deltas. Die Baseline liest attached Agents und prozesslokale Registries, ohne Cold Agents zu resumieren.

Queue und Jobs verwenden vollständige Ersatzwerte und wenden Last-Wins an. Agent Attach, Detach, Session Disposal und Owner Disposal können alle einen stale Mirror durch einen leeren Wert oder eine neue Baseline löschen.

Die ursprünglichen `approval/request`- und `user-questions/request`-Events sind weiterleitbare Waterfalls. Wenn ein Agent-scoped Client-Listener eine Anfrage claimt, returniert sie direkt. Wenn alle zugestellten Clients `next()` aufrufen, setzt der ursprüngliche Cordis-Waterfall zu späteren Host-Listenern fort. Session Control speichert oder replayt diese Anfragen weder.

Die Projection-Baseline und der Log-Schnitt einer Tail-Page werden unabhängig erzeugt. Der Client behält immer den Wert mit der höheren Sequenznummer. Das Abonnieren der Live-Projektion startet keinen Agent nur, um einen Wert zu erhalten.

Session Added, Removed, Activity, Running Status und Agent-Fehler ohne Turn-Position gehen nicht in den Stateful-Control-Stream; sie sind `ctx.remote.$on`-Benachrichtigungen, die entweder aus einer Listen-Baseline reparierbar sind oder kein Replay brauchen.

Session-Listen-`updatedAt` ist `max(header.createdAt, sessionListMetadata.lastPromptAt)`. Nur ein benutzerseitiges `user/message` aktualisiert `lastPromptAt`; es kann aus einer Cold Projection wiederhergestellt werden und hängt nicht davon ab, ob ein Browser dieser Session folgt.

### Workspace Controller

`packages/api/workspace-controller` stellt Host `ctx.workspaceController` und den generierten `ctx.remote.workspace`-Namespace bereit.

Er besitzt Create, Rename, Delete, insertBefore, insertSessionBefore, archiveSession, unarchiveSession und `follow`. Die Workspace-Registry bleibt die durable Source of Truth; der Controller besitzt Remote-Befehle, Projektion und Fehlerabbildung.

`WorkspaceFeed` beobachtet synchron das Storage `domain/changed`, und jede Follow-Generation emittiert eine vollständige Baseline vor `upsert`-, `remove`-, `order`- und `archived`-Deltas.

Ein vollständiger `order`-Frame ist autoritativ für die Workspace-Reihenfolge. Es vermeidet, dass der Client Anzeigereihenfolge aus der Upsert-Ankunftsreihenfolge ableiten muss, und konvergiert nach einer Reconnect-Baseline.

`createWorkspaceStateStream()` assembliert `workspace.follow` als `RemoteSnapshotStream`. Client Runtime startet und besitzt diesen Stream nur.

`ClientWorkspaceModel` lebt auf der Client-Face des Workspace Controllers. Es besitzt Baseline-/Inkrement-Parsing, die materialisierte Liste, das Archived-Set, Command-Result-Echo und Merge-Regeln für Wettrennen zwischen Unary- und Stream-Ankünften.

Ein erfolgreicher Unary-Befehl kann das lokale Modell sofort aktualisieren; ein späterer Stream-Commit korrigiert den Zustand trotzdem mit der Host-Projektion und der vollständigen Order. Gelöschte Workspace-IDs werden aufgezeichnet, sodass ein verzögertes Ergebnis sie nicht wieder einfügen kann.

```text
ctx.remote.workspace.follow() -|[]> RemoteSnapshotStream
                                      |-- replace(baseline)
                                      |-- upsert/remove(view)
                                      |-- replace(order)
                                      `-- replace(archived ids)
```

Workspace-Remote-Methoden, State Feed und Client-Datenmodell gehen nicht durch API Proxy und hängen nicht von `host/workspace-*`-Benachrichtigungen ab.

### Remote Event

Remote Event verwendet die Cordis `Events`-Deklarationen der Eigentümer-Pakete wieder. Das ursprüngliche Host-Event ist die einzige Geschäftssignatur, und Client `ctx.remote.$on(event, listener)` leitet seine Parameter, das Waterfall-Ergebnis und `next()` aus dieser Deklaration ab.

Die Allowlist in `packages/api/remotes` ist die einzige Quelle der Anwendungsauswahl. Jeder Eintrag markiert explizit `emit` oder `waterfall`; dieser Modus bestimmt Host-Listening, die legale Client-Schlüsselmenge und den Wire-Frame-Typ gemeinsam.

Das System deklariert kein `RemoteInvocationMap`, erfordert kein zweites Client-`@Remote` und leitet den Aufrufmodus nicht dadurch ab, ob das letzte Runtime-Argument eine Funktion ist.

Remote-Event-Downlink-Frames bilden eine explizite diskriminierte Union:

```text
ready     { type, clientId }
emit      { type, event, args }
waterfall { type, event, eventId, agentId, request }
cancel    { type, eventId }
```

Sowohl WebSocket-JSON- als auch In-Process-Carrier-Einstiegspunkte starten von `unknown` und validieren den Diskriminanten plus exakte Felder. Dispatch nach Validierung akzeptiert nur die typisierte Union. TypeScript-Statiktypen ersetzen keine Wire-Validierung.

Gewöhnliche `emit`-Argumente müssen verlustfreies JSON sein. Der Client ruft `parallel()` auf einem für jede Remote-Instanz privaten Cordis-Key auf, erhält Registrierungsreihenfolge, Calling-Fiber-Ownership und Listener-Fehlerisolation.

Der private Key verhindert, dass Host-Events und gleichnamige Client-lokale Cordis-Events einander auslösen. Client Remote führt weder eine eigene Subscription-Registry noch eine handgeschriebene Listener-Kette.

Returnende Waterfalls unterstützen derzeit nur Agent Scope. Die Event-Signatur muss eine Anfrage mit einem direkten `agent`-Feld enthalten, gefolgt von einem `next()`, das denselben Ergebnistyp zurückgibt, und das ganze Event gibt ein Promise zurück.

Der Host projiziert nur die Top-Level-Felder `agent` und `signal` aus der Anfrage: `agent` wird im Frame zu Top-Level-`agentId`, `signal` wird die Zustellungslebensdauer, und alle übrigen Felder müssen als Ganzes verlustfreies JSON sein.

Der Client löst synchron aus `agentId` einen Agent Context auf oder materialisiert ihn, stellt das aktuelle Zustellungssignal in das direkte `signal`-Feld der Anfrage wieder her und ruft Cordis `waterfall()` auf dem privaten Key des Zielkontexts auf. Vor der ersten erfolgreichen Session-Listen-Baseline lässt der Session-backed Adapter den Transport einen Scope materialisieren; nach dieser Baseline besitzt der Listenlebenszyklus die Scope-Liveness.

Das System scannt keine beliebig tiefen Objekte, überträgt keine Pfad-Arrays oder Platzhalter, führt kein Deep-Clone/Restore von Context und AbortSignal durch und wartet nicht auf einen zukünftigen Agent Context.

Wenn kein Client-Adapter registriert ist, sein Resolver keinen Context zurückgibt oder die Auflösung wirft, retourniert dieser Client sofort `next`. Er abonniert keine Registry, prüft keine Races nach Auflösung und erstellt keinen temporären Fiber für eine Zustellung.

Gateway Host behält `eventId`, die Host-Continuation und zugestellte Client-Generationen für jeden unvollendeten Waterfall. Eine neue Client-Generation erhält ein Replay desselben ausstehenden Events.

Die Queue jeder Generation garantiert eine Zustellung, also speichert der Client kein `seen`-Set. `clientId + eventId` bindet ein Ergebnis an die aktuelle Generation; eine Antwort aus einer alten Verbindung kann die Zustellung auf einer neuen nicht abschließen.

Wenn mehrere Clients einen Waterfall empfangen, vollendet das erste Ergebnis oder die erste Ablehnung den Host-Aufruf und sendet `cancel` an die anderen Clients. Gateway setzt die ursprüngliche Cordis-Kette erst fort, nachdem jeder zugestellte Client `next` zurückgegeben hat.

Host-Caller-Signal-Cancellation, Agent-Context-Disposal, Client-Generation-Completion und Losing-Client-Cancellation terminieren jeweils ihre zugehörigen Waits.

Der Client gibt `next`, Ergebnis oder Ablehnung über das bestehende HTTP-Unary-RPC `$events/result` zurück; Downlink-Events teilen weiterhin den Remote-WebSocket-Mux, ohne Duplex-WebSocket für Antworten.

Gateway verifiziert nur, dass ein Waterfall-Rückgabewert eine verlustfreie JSON-Repräsentation hat; es interpretiert keine Geschäftsfelder. Semantiken wie die, ob eine Question-Antwort zu einer angebotenen Option gehört, bleiben im Eigentum des Requesters oder der UI-Domain und werden vom Transport nicht neu validiert.

Wenn `UserQuestionService` beobachtet, dass der `AbortSignal` des Aufrufers während einer Anfrage abgebrochen wurde und der Provider einen gewöhnlichen Fehler warf, normalisiert es diesen Fehler zu `UserQuestionError` mit `ASK_ABORTED` unter Beibehaltung des ursprünglichen Fehlers als `cause`. Ein vom Provider bereits gelieferter Domain-Fehler bewahrt seine Identität.

Ein Fehler von `$events/result` scheitert die aktuelle Connection Generation. Der Host zieht die Zustellung dieses Clients mit der Generation zurück, das ausstehende Event wird in der nächsten Generation replayt, und der Client führt keine zweite Result-Retry-Queue.

Gewöhnliche `$on`-Benachrichtigungen werden nach einem Disconnect nicht replayt. Zustand, dessen Korrektheit von Recovery abhängt, muss eine Query, einen Cursor oder eine öffnende Baseline haben und kann sich nicht auf schließliche Remote-Event-Zustellung verlassen.

Ein Event wird nicht replayt, wenn sich sein Client-Listener nach der Ankunft registriert. HMR hat keine dedizierten Redelivery-Semantiken.

### API Proxys verbleibende Grenze

Session Controller und Workspace Controller stellen generierte Remote-Namespaces direkt bereit; API Remotes und API Gateway stellen Host-to-Client-Events direkt bereit.

Client Connection führt nur Host-Generation, Description und generisches RPC. Es parst keine Domain-Frames.

Client Runtime empfängt nur Domain-Änderungen, die von Controller-Adaptern produziert werden. Es kennt kein `HostFrame`, `session/subscribed`, `session/event`-Mux-Frame oder `host/workspace-*`-Frame.

API Proxy trägt nur unabhängige Geschäfts-APIs, die es besitzt. Session, Workspace, Remote Event und Connection Generation hängen nicht davon ab.

## Alternatives considered

**Einen Agent resumieren, wann immer ein Session-Stream öffnet.** History ansehen, einen Titel lesen, einen Tab reconnecten oder Hintergrundzustand beobachten würde Ausführungs-Nebeneffekte erhalten, und mehrere Browser könnten doppelte Resumes auslösen. Cold Logs und Projektionen haben bereits Persistenzquellen.

**`session.follow` nur für Live-Agents erlauben.** Das erste Transcript-Rendering müsste einen Agent resumieren oder das Wettrennen zwischen Unary-History und Live-Subscription wieder einführen. Folgen per Identität vor einem Cold Read deckt sowohl History als auch zukünftige explizite Activation ab.

**Session-Transport und Session-Befehle in zwei öffentliche Pakete teilen.** Beide hängen von Session-Adresse, Agent-Activation-Policy, Subagent-Ownership, Fehlerabbildung und Client-Mount-Reihenfolge ab. Ein öffentlicher Controller erhält vereinheitlichte Ownership, während interne Klassen unabhängig evolvieren können.

**Queue, Jobs, Projektion, Workspace und Logs auf gewöhnliches `$on` verschieben.** Gewöhnliche Events haben keine Reconnect-Baseline, keinen Cursor und keine Gap-Reparatur, also hinterlässt eine verpasste Zustellung dauerhaft stale State. Nur Benachrichtigungen, die keine Recovery brauchen, durch eine unabhängige Query reparierbar sind oder ihre eigene Lebensdauer als Waterfall tragen, passen zu `$on`.

**Jeden Domain-Controller von einer Page/Follow/Retry-Basisklasse erben lassen.** Session-Journals und Workspace-Snapshots haben unterschiedliche Öffnungs-, Recovery- und Reihenfolgeregeln. Gateways drei kompositionelle Stream-Objekte verwenden den Transport-Lebenszyklus wieder, während Domain-Adapter nur ihre eigenen Frame-Semantiken deklarieren.

**Eine separate Client-Invocation-Map für Remote Event deklarieren.** Eine zweite Map oder ein Client-`@Remote` würde Eigentümer-Cordis-Event-Signaturen kopieren und einen Drift-Punkt erzeugen. `$on`-Listener und Ergebnisse aus derselben `Events`-Deklaration abzuleiten erhält Äquivalenz von Konstruktion aus.

**Agent Scope durch beliebige Objekttiefe projizieren.** Rekursive Context- und AbortSignal-Scans brauchen Pfad-, Platzhalter-, Clone- und Restore-Protokolle und machen zufällige Objektstruktur zu einem Wire-Versprechen. Top-Level `agent` und `signal` decken aktuelle Waterfalls ab.

**Vor dem Dispatch auf einen Client Agent Context oder Adapter warten.** Registry-Waiter, Post-Resolution-Race-Checks und temporäre Delivery-Fibers fügen einem Client Lebenszyklus hinzu, der sein Ziel synchron auflösen oder materialisieren kann. `next` zurückzugeben, wenn der Resolver kein Ziel sofort liefern kann, erhält die Cordis-Waterfall-Semantik.

**Einen unabhängigen physischen WebSocket oder Duplex-Stream für Remote Event verwenden.** Gateway Mux stellt bereits authentifizierte Upgrades, Multiplexing, Cancellation, Fehlerabbildung und Reconnect bereit. Downlink `$events` plus HTTP `$events/result` drückt Request/Response ohne dritte Verbindung aus.

**Application-Level-JSON-Heartbeat-Frames senden.** Dies würde die strikte Remote-Stream-Message-Union erweitern und Browser-Handling für Verkehr ohne Geschäftsbedeutung erfordern. WebSocket Ping/Pong liefert Carrier-Aktivität ohne Änderung der Logical-Stream-Semantik.

**API Proxys Host-Mux behalten.** Dies behält die handgeschriebene Union, Schema, Response-Envelope und den zweiten Stream-Lebenszyklus und verhindert, dass Session- und Workspace-Controller ihre Datenprotokolle unabhängig besitzen.

**Session-Listen-Zeit aus aggregiertem `session/event` aktualisieren.** Listenkorrektheit würde davon abhängen, welche Sessions ein Browser konsumiert, und würde beliebige Plugin-Events für Benutzeraktivität halten. Die durable `lastPromptAt`-Projektion drückt den Reihenfolgefakt direkt aus.

## Verifikation

Gateway-Mux-Tests pinnen Verbindung ohne logische Streams, Idle-Residency, einen physischen Versuch pro Anfrage, konfigurierbares Ping/Pong ohne Anwendungsnachrichten, Carrier-Fehler des aktiven Streams, Cancellation und kein Reconnect nach Disposal.

Connection-Tests pinnen fehlende, doppelte und zurückgezogene Generationsquellen, Readiness-Timeout sowie Generationsentzug und Wiederaufbau nach Fehler.

`RemoteStream`-Tests pinnen einzelnen Konsum, Retry-Reset nach Öffnungsakzeptanz, Generations-only-`restart()`, kein Retry für terminale Fehler und Disposal-Quiescence.

`RemoteSnapshotStream`-Tests pinnen genau einen öffnenden Snapshot pro Generation, Ablehnung eines Updates vor einem Snapshot, Ablehnung doppelter Snapshots und Reconnect-Ersetzung.

`RemoteJournalStream`-Tests pinnen Snapshot-first-Öffnung, zusammenhängendes Append, historisches Prepend, Reconnect-Ersetzung, Gap-Reparatur und eine atomare Ersetzung.

Session-Host-Tests pinnen Cold Page/Follow ohne Erhöhung der attached Agents, zusammenhängende Events, die ein Cold Follow nach einem expliziten Prompt erreichen, Direct-Subagent-Ownership, Message-aligned Pagination und Terminal-Error-Projektion.

Session-Control-Tests pinnen Baseline-first-Zustellung, kein Cold-Session-Resume, Attach/Detach-Cleanup, Queue- und Jobs-Ersetzung und das Projection Watermark.

Session-Client-Tests pinnen einen Journal-Eigentümer pro Session, kein Writeback aus stale Open Epochs, unabhängige Cancellation von Control und Journal und Erhalt des veröffentlichten Fensters während Carrier-Retry.

Workspace-Host-Tests pinnen Baseline-first-Zustellung, Upsert/Remove, autoritative Order, Archived-Set und Follower-Disposal.

Workspace-Client-Tests pinnen Snapshot-Ersetzung, Unary/Stream-Races, keine Wiederauferstehung nach Delete, stabile Reihenfolge und terminales Fehlschlagen.

Remote-Event-Typ-Tests lehnen nicht ausgewählte Events, Nicht-void-unscoped-Events, Nicht-Agent-scoped-Waterfalls und Modi ab, die mit Signaturen nicht übereinstimmen.

Remote-Event-Host-Tests pinnen Listener-before-ready, Payload-Validierung, Pending-Replay, erstes Ergebnis über mehrere Clients, All-Next-Delegation, Ablehnung, Host-Cancellation, Context-Release und Losing-Client-Cancellation.

Remote-Event-Client-Tests pinnen instanzprivate Keys, Cordis-Registrierungsreihenfolge, Agent-Context-Auflösung, `next`, Ergebnis, Ablehnung, Cancellation, Ablehnung stale-Generation-Antworten und Connection-Generation-Fehlschlag, wenn `$events/result` scheitert. User-Question-Tests pinnen Normalisierung der In-Progress-Signal-Cancellation und Erhalt ihrer Cause.

Fehlende, doppelte und zurückgezogene Quellen; nicht bereite erste Items; unbekannte Diskriminanten; zusätzliche Felder; und Nicht-JSON-Werte scheitern alle laut an ihren jeweiligen Wire-Eingängen.

Statische Checks pinnen, dass API Proxy keinen Session/Workspace-Host-Frame-Carrier exportiert und Client Runtime keine entsprechende Bridge enthält.

## Konsequenzen

Der Browser kann eine durable Session lesen, während ihr Agent gestoppt ist. Das Öffnen einer gewöhnlichen Session veröffentlicht den Prepared Snapshot, bevor eine Hintergrund-Promotion beginnt; List, Search, Page und andere Observation-only-Reads aktivieren sie nie.

Durable Logs reparieren ein fehlendes Suffix per Sequenznummer und Page; Session Control und Workspace State konvergieren durch öffnende Snapshots; gewöhnliche Remote Events versprechen kein Replay. Recovery-Semantiken folgen der Datenart statt einander zu imitieren.

Gateway besitzt nur Transport, Generation, Pending Waterfalls und strikte Wire-Validierung, nicht Session- oder Workspace-Geschäftsfelder. Ein Domain-Controller liefert nur Opener, Cursor-Regeln, Baseline-Reducer und Fehlerdarstellung.

Session- und Workspace-Host-APIs, Stream-Adapter und Client-Datenmodelle haben jeweils einen expliziten Eigentümer. API Proxy ist nicht mehr ihr Vermittler.

Die allgemeinen Stream-Objekte fügen drei explizite Schichten hinzu und löschen die Retry-, Cancellation-, Generation-, Baseline- und Gap-Repair-Hüllen, die zuvor jeder Controller duplizierte.

Remote-Waterfalls erhalten First Claim über mehrere Clients, Fortsetzung der Host-Kette nachdem jeder Client `next` aufruft, Reconnect-Replay ausstehender Aufrufe und End-to-End-Cancellation. Das aktuelle Protokoll unterstützt nur Top-Level Agent Scope und verlustfreie JSON-Anfragen und -Ergebnisse.

Diese Entscheidung erweitert die Allowlist und das Single-Cordis-Signature-Design aus [Remote event delivery](2026-08-10-remote-event-delivery.de.md): Gewöhnliche Benachrichtigungen verwenden `emit`, während Agent-scoped Async-Waterfalls dieselbe `ctx.remote.$on`-Fläche mit explizitem `waterfall`-Modus verwenden. Sie erzeugt keine zweite Invocation Map.

Diese Entscheidung übernimmt die von [simple unary API Proxy migration](../../archived/architecture/2026-08-10-unary-apiproxy-remote-migration.md) beibehaltenen Session-, Workspace- und Host-Event-Carrier und erhält dabei den vollständigen Jobs-Snapshot, den prozesslokalen Lebenszyklus und die „Beobachtung resumiert keinen Agent"-Semantik, die [background job display](../feature/2026-08-08-web-background-job-display.de.md) verlangt.
