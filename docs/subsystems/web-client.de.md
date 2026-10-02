# Web-Client-Architektur

[English](web-client.md) | [中文](web-client.zh.md) | Deutsch

Der Web Client ist eine browserseitige Cordis-Anwendung, die aus unabhängig geladenen Plugins zusammengesetzt wird. Ihre Architektur hat vier wiederverwendbare Grundlagen: [Client Modules](client-modules.de.md) lädt den Plugin-Graphen, das [API Gateway](../api-gateway.de.md) stellt typisierte Host-Kommunikation bereit, [Slots](slots.de.md) komponiert die React-UI, und [Conversation](conversation.de.md) verwandelt ein Session-Verlaufsfenster in target-eigene Ansichten. Diese Seite verbindet diese Systeme und legt fest, wo Client-Modelle und Feature-Pakete hingehören.

## Schichten und Zuständigkeit

| Schicht | Haupt-Owner | Verantwortung |
|---|---|---|
| Host-Anwendung | Business-Services und `packages/api/*-controller`-Host-Einträge | Besitzt den autoritativen Zustand, Persistenz, Mutationsreihenfolge, Zugriffsrichtlinie und Stream-Produktion. |
| Transport und API-Assembly | `client/connection`, `api/gateway`, `api/remotes` | Baut eine Client-Generation auf, stellt generierte `ctx.remote`-Methoden und -Streams bereit, leitet ausgewählte Cordis-Events weiter und trägt Abbrüche und Ergebnisse. |
| Client-Modelle | `api/session-controller/client`, `api/workspace-controller/client` | Pflegen React-freie Spiegel des Host-Zustands, lösen Stream/Unary-Race-Bedingungen auf, besitzen Objektidentitäten und Subscriptions und stellen schmale Command-Services bereit. |
| UI-Adapter | `client/ui-session`, `client/ui-workspace` | Wandeln Modell-Observables in Root- oder Session-scoped-Standard-Slot-Quellen um, ohne die Zuständigkeit für Geschäftszustand zu übernehmen. |
| Conversation-Daten | `client/ui-conversation`, Target-Pakete wie `ui-chat` und `ui-trajectory` | Setzen Standard-Events und kompakte historische Assistant-Läufe zu unabhängigen Target-Snapshots zusammen und besitzen die gemeinsame Conversation-Shell und den Eingabefluss. |
| Komposition und Rendering | `client/ui-slots`, `client/ui-renderer`, `client/ui-layout`, Feature-UI-Pakete | Deklarieren Erweiterungspositionen, leiten Komponenten-Props ab, binden Observables an React-Hooks und mounten den finalen Baum. |

Die Abhängigkeitsrichtung ist Host-Zustand → Remote-Transport → Client-Modell → UI-Adapter → Conversation oder Präsentation → Slots → React. Benutzeraktionen laufen über Callbacks zurück, die sich über einen injizierten Client-Service oder einen generierten Remote-Namespace schließen. Eine Präsentationskomponente erhält niemals einen Cordis-`ctx`, ein Transportobjekt oder die Implementierung eines anderen Feature-Plugins.

## Browser-Boot

Der Host schreibt den komponierten `WebBootGraph` nach `window.__DSH_BOOT__` und installiert die Browser-Module-Loader-Fassade, bevor vom Parser vorgeladene Skripte ausgeführt werden. Das Modulsystem ist eine lazy CommonJS-Tabelle: Das Laden eines Bundles registriert dessen Factory, während die Materialisierung eines Eintrags die Factory mit synchronem `require` über Plattformmodule und deklarierte dynamische Abhängigkeiten ausführt.

Der Web-Boot-Kernel erzeugt das Modulsystem, prefetched die `immediately`-Einträge, mountet den vendored Cordis Loader und erzeugt jeden Grapheintrag. Die Cordis-Service-Injection bestimmt die Aktivierung; die Modulgraph-Reihenfolge bestimmt nur, ob synchrone Imports materialisiert werden können. Nachdem das vollständige Roster einen konsistenten Zustand erreicht hat, hydratisiert `ui-renderer` das frameworkfreie Boot-DOM und ruft die einzige kontextweite `renderSlot('root')`-Operation auf. [Client Modules](client-modules.de.md) besitzt Graph, Bundle-Route, Cache-Revision und Loader-Details.

## Remote-Kommunikation

Host-Business-Services annotieren aufrufbare Methoden mit Typert-Remote-Decorators. Die Host-Generierung erzeugt strikte Deskriptoren, Laufzeit-Codecs, Declaration Merges und Source Maps. Die clientseitige `api-remotes`-Assembly wählt diese generierten Beiträge aus und mountet konkrete Methoden unter `ctx.remote.<namespace>` sowie im Session-Scope unter `agentCtx.remote.<namespace>`. Feature-Pakete hängen vom generierten Service-Face ab, nicht von der Gateway-Implementierung oder einem Laufzeit-Eintrag eines Host-Pakets.

Die Connection besitzt Request-Korrelation, den `/api`-Carrier, Trust-Prüfungen, exakte Fetch-Routen und Connection-Generationen. Das API Gateway besitzt Remote-Dispatch, Abbruch, logische Streams und die Weiterleitung ausgewählter Host-Events. Controller-Operationen gehören auf generierte Remote-Methoden oder explizite Remote-Streams; feature-eigene Downloads registrieren exakte Fetch-Routen. Die [API-Gateway-Referenz](../api-gateway.de.md) definiert Generierung und Aufruf, während das [Connection-README](../../packages/client/connection/README.de.md) den physischen Carrier und die Trust-Policy definiert.

Der interne logische `$events`-Stream ist die Quelle der Connection-Generation. Sein eröffnender `ready`-Frame trägt das Host-Home für die Pfadanzeige und etabliert die Generation, nachdem die Host-Listener angehängt sind und bevor ein Controller einen Baseline-Read beginnt. `ctx.remote.$on()` liefert erlaubte gewöhnliche Events an den Root-Client-Context und scoped Waterfall-Events an den aufgelösten Session-Context; ein Waterfall-Listener gibt ein Ergebnis zurück, ruft `next()` oder lehnt ab.

## Client-Modelle

Jedes API-Controller-Paket besitzt ein gepaartes Host- und Client-Face. Die Host-Seite besitzt autoritative Mutation und Stream-Produktion. Die Client-Seite besitzt ein identitätsstabiles, React-freies Modell über denselben generierten Wire-Typen und stellt Observable-Snapshots plus Commands bereit. UI-Pakete konsumieren diese Client-Services und reproduzieren keinen Transportzustand in Komponenten-Stores.

### Sessions

[`api/session-controller`](../../packages/api/session-controller/README.de.md) stellt Host-Commands für Liste, Suche, Erstellung, Selection-Daten, Prompt, Queue, Abbruch, Paginierung sowie Follow-/Control-Streams bereit. Die Client-Seite ist als `ClientSessions → SessionManager → Session` organisiert:

- `ClientSessions` stellt `ctx.sessions` bereit, besitzt Session-Scopes und stabile `SessionBinding`-Objekte und projiziert den ausgewählten Listenzustand.
- `SessionManager` besitzt die Listen-Baseline, Live-Listen-/Control-Updates, lazy Session-Instanzen, Queues, Projection-Stores, Subagent-Kataloge und die Konfliktreihenfolge zwischen Pulls und späteren Updates.
- Jede `Session` besitzt ein zusammenhängendes Fenster logischer Events, das durch `SessionEventLikeEntry`-Werte repräsentiert wird, sowie Paging, Follow, Prompt-/Control-Zustand und den von Adaptern konsumierten Observable-Snapshot.

Der durable Event-Pfad öffnet `follow()`, dessen erster Frame den aktuellen Header, die Tail-Page, den Cursor und die vollständige Projection-Baseline enthält. Verlaufsdatensätze haben einen expliziten `event`- oder `chunks`-Diskriminator und ein ausgerichtetes inneres `event`; das Journal validiert jede inklusive logische Sequenz-Range, bevor der Client die Datensätze ohne Datensatz-Konversion als `SessionEventLikeEntry`-Werte behält. Jede physische Generation ersetzt das gehaltene Fenster atomar aus diesem Snapshot; anschließend hängen Standard-Live-Events sequenziell an. `page()` ist für älteren Verlauf und Gap-Reparatur reserviert. Der transiente Control-Stream beginnt jede Generation mit einer vollständigen Baseline und wendet danach Queue-, Job- und Projection-Updates an.

### Workspaces

[`api/workspace-controller`](../../packages/api/workspace-controller/README.de.md) hält die Workspace-Mutationsrichtlinie und den autoritativen Follow-Feed auf dem Host. `ClientWorkspaceModel` besitzt die Browser-Zeilen, Reihenfolge, archivierte Session-IDs, Command-Echos und die Auflösung von Stream/Unary-Races. Jede Stream-Generation beginnt mit einer vollständigen Baseline, gefolgt von `upsert`-, `remove`-, `order`- und `archived`-Inkrementen; ein Reconnect ersetzt das Modell aus der neuen Baseline. `WorkspaceController` stellt dieses Modell als `ctx.workspaces` bereit, während `ui-workspace` `useWorkspaces` und Navigations-Callbacks zur UI beiträgt.

Diese Paarung ist keine zweite Quelle geschäftlicher Wahrheit. Host-Controller entscheiden über durable Zustände und Mutationsergebnisse; Client-Modelle pflegen die neueste nutzbare lokale Projektion, bewahren Objektidentität, wo sie dem Rendering nützt, und kodieren, wie verzögerte Antworten und ersetzende Baselines zusammengeführt werden.

## Conversation und Präsentation

`ui-session` installiert den `session`-Scope-Adapter und publiziert `useSessions`, `useSession`, `sessionId` und `useProjection`. Domänen-Adapter fügen weitere Standard-Quellen hinzu, ohne React-Hooks auf die Modellobjekte zu setzen.

`ui-conversation` bindet sich genau einmal an jede `SessionBinding.eventSource`. Seine Event-Registry korreliert durable Session-Events und Client-only-`assistant/live-chunk`-Updates zu stabilen Geschäfts-Contexts, und seine View-Registry materialisiert Target-Snapshots. Chat Assistant, Trajectory Assistant und Turn Tail interpretieren sowohl Live-Chunks als auch die in durable Settlements eingebetteten kompakten Streams, sodass Reconnect und paginierter Verlauf denselben Assistant-Zustand ohne durable Token-Zeilen reproduzieren. `ui-chat` und `ui-trajectory` registrieren getrennte Definitions und Builder: Sie dürfen dieselbe Event-Familie interpretieren, importieren oder teilen aber nicht das finale Anzeigemodell des jeweils anderen. Die Shell wählt eine registrierte View aus und reicht ihren Snapshot über Standard-Hooks und Slots weiter. [Conversation](conversation.de.md) definiert Context-Identität, Replay, Location-Daten, Target-Builder und keyed Renderer.

`ui-slots` stellt die typisierte Registry und das Lifecycle-Ledger bereit; `ui-renderer` ist das einzige Paket, das bare Observables über `useSyncExternalStore` bindet, React-Contexts besitzt und den Root-Baum rendert. Feature-Komponenten erhalten Framework-Hooks, Owner-Props, Store-Actions und explizite Injection über ihre abgeleiteten Props. [Web Client Slots](slots.de.md) listet diese Eingaben, Erweiterungs-APIs und die aktuelle Slot-Hierarchie.

## Datenpfade

| Pfad | Reihenfolge |
|---|---|
| durable Session-Anzeige | Host Session Log → gepackter Remote-`follow`/`page`-Verlauf → Client-`SessionEventLikeEntry`-Fenster → Conversation-Contexts → Target-Snapshot (`chat`, `trajectory` oder ein anderes registriertes Target) → Slot-View → React |
| transiente Session-Control | Host-Control-Baseline → Remote-Snapshot-Stream → `SessionManager`-Queue-/Job-/Projection-Stores → Session- und Listen-Snapshots → Standard-Hooks → Komponenten |
| Workspace-Zustand | Host-Workspace-Baseline und -Inkremente → `ClientWorkspaceModel` → `ctx.workspaces.list` → `useWorkspaces` → Sidebar-, Hero- und Navigationseinträge |
| scoped Interaktion | Host Cordis Waterfall → API Remotes `$events` → `ctx.remote.$on()` auf dem Session-Context → zuständiges UI-Paket → Ergebnis oder `next()` |
| Benutzer-Command | Komponenten-Callback → Registration-Inject-Face oder Slot-Owner → `ctx.sessions`, `ctx.workspaces` oder generierter scoped Remote → Host-Controller → autoritatives Update → Stream- oder Event-Projektion zurück zum Client |

## Wiederverbindung

Physische und logische Wiederherstellung sind getrennt. Der Gateway-Mux stellt den physischen WebSocket wieder her; jeder `RemoteStream` öffnet seine eigene logische Quelle neu, sobald die Connection eine nutzbare Generation veröffentlicht. Ein Carrier-Fehler ist wiederholbar, während ein Business-Fehler, ein fehlerhaftes eröffnendes Element oder eine Protokollverletzung für den zugehörigen logischen Stream final ist.

Die Wiederherstellung folgt der Semantik der Daten:

- Ein durables Session-Journal validiert logische Sequenz-Ranges und ersetzt sein Fenster aus dem eröffnenden Snapshot jeder Generation; `page()` liefert älteren Verlauf und repariert jede spätere Range-Lücke.
- Session-Control- und Workspace-Streams behalten den zuletzt veröffentlichten Wert, solange sie getrennt sind, und ersetzen ihn dann atomar aus einer frischen eröffnenden Baseline.
- Gewöhnlich weitergeleitete Benachrichtigungen werden nicht wiedergegeben. Stateful-Domänen brauchen eine Baseline, einen Cursor oder eine explizite Abfrage; scoped Waterfalls behalten ihre eigene Request-Lebensdauer.

Es gibt keinen monolithischen Client-`Runtime`, kein `HostFrame`, kein `events.mux`, kein `events.host` und keine universelle `resync()`-API. Die Connection stellt den Generationszustand bereit, das Gateway besitzt die Supervision logischer Streams, und jedes Client-Modell definiert die für seine Daten passende Ersetzungs- oder Resume-Semantik.

## Paketgrenzen

Feature-Plugin-Pakete dürfen Deklarationen über `import type` teilen; sie importieren oder re-exportieren zur Laufzeit keine Werte eines anderen Feature-Plugins. Paketübergreifendes Verhalten nutzt injizierte Cordis-Services, paketübergreifende UI nutzt Slots. Target-spezifische Conversation-Definitions, Projection-Helper und finale View-Daten bleiben beim jeweiligen Target-Paket, selbst wenn Chat und Trajectory bewusst parallele Logik implementieren.

Geteilte Laufzeitwerte brauchen einen schmalen statischen Owner ohne Feature-Lebenszyklus, etwa `client/store`, `ui-primitives` oder ein browser-sicheres Utility-Paket. Transport und generierte API-Assembly dürfen Laufzeit-Beiträge importieren, weil das Zusammensetzen eines Protokolls ihre explizite Aufgabe ist. Ein Feature-Paket fügt `dsh.client.external` nicht hinzu, nur um diese Regel zu umgehen.

Nutze die vier detaillierten Referenzen je nach der Erweiterung, die hinzugefügt wird:

- [Client Modules](client-modules.de.md) für Package-Discovery, Laden, geteilte Modul-Identitäten und Boot-Reihenfolge.
- [API Gateway](../api-gateway.de.md) für Host-Methoden, generierte Remote-Beiträge, Streams und weitergeleitete Events.
- [Web Client Slots](slots.de.md) für Komponenten, Hooks, Stores, Injection und Platzierung.
- [Conversation](conversation.de.md) für durable Event-Korrelation, Target-Snapshots und Chat- oder Trajectory-View-Beiträge.
