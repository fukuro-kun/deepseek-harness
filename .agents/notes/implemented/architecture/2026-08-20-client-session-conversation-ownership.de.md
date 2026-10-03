# Agent Note: Client-Session-, Conversation- und UI-Ownership-Schichten

Status: implemented

[English](2026-08-20-client-session-conversation-ownership.md) | [中文](2026-08-20-client-session-conversation-ownership.zh.md) | Deutsch

## Problem

Der Web Client legte einst Session- und Workspace-Objekte, Event-Fenster, Conversation-Assembly, React-Hooks, die Slot-Registry und die Store-Engine in einer allgemeinen Runtime ab. Protokollzustand, Geschäftsprojektionen, React-Bindings und Seitenpräsentation teilten einen Dependency-Hub, sodass eine Änderung in jeder Schicht sich über das gesamte Frontend ausbreiten konnte.

Session-Snapshots konnten außerdem Daten ansammeln, die sie nicht besaßen, einschließlich Event-Arrays, Conversation Views, Chat Nodes und Pending-Interaktionen. Gewöhnliche Verbraucher mussten dann Event-Replay und konkrete Views verstehen, während das Hinzufügen eines Conversation-Targets Änderungen an Session, Runtime und Renderer erfordern konnte.

Ohne explizite Schnittstelle zwischen React- und Session-Lebensdauern wurden Binding-Release, Hook-Quellenersatz und Slot-Store-Cleanup zu dedizierten Callback-Protokollen. Approval und Question beeinflussen beide Sidebar-Zustand und Composer-Übernahme; unabhängig gepflegter Zustand konnte diese Oberflächen unterschiedliche Pending-Anfragen auswählen lassen.

Der Client braucht Einbahn-Dependencies zwischen Dateneigentümern, React-Adaptern, generischer Rendering-Maschinerie und konkreten Views bei Erhalt des Anwendungsverhaltens.

## Entscheidung

Der Client verwendet die Schichtung „Controller und Domain-Objekt → UI-Adapter → Renderer → Slot-Komponente". Controller und Domain-Objekte veröffentlichen React-freie Observable-Quellen; ihre `ui-*`-Pakete deklarieren Standard-Props und registrieren Quellen; `ui-renderer` erstellt Selector-Hooks an Slot-Bindungspunkten; Komponenten lesen Daten und Aktionen nur aus Slot-Props.

```text
[Remote / Controller / domain object]
                  |
                  | bare observable source
                  v
             [ui-* adapter]
                  |
                  | standard source registration
                  v
              [ui-renderer]
                  |
                  | selector hook binding
                  v
            [Slot component]
```

Client-Session- und Workspace-Objekte gehören zu `api/session-controller/client` bzw. `api/workspace-controller/client`. Target-neutrale Conversation-Datenstrukturen und Assembly gehören zu `client/ui-conversation`; Chat und Trajectory gehören zu `client/ui-chat` bzw. `client/ui-trajectory`.

Die React-Adapter für Session und Workspace gehören zu `client/ui-session` bzw. `client/ui-workspace`. Die Store-Engine gehört zu `client/store`; die Slot-Registry, Scope-Materialisierung und Observable-to-Hook-Bindung gehören zu `client/ui-renderer`.

Das System hat kein aggregiertes `client/runtime`-Paket und keine zentrale Ersatz-Fassade. [Session history and event transport](2026-08-18-session-history-and-event-transport.de.md) definiert Session-History, Remote-Streams, Paginierungs-Cursors und Reconnect-Kontinuität; diese Note beginnt bei den Client-Objekten und von Controllern veröffentlichten Quellen.

## Schichtungsprinzipien

### Controller sind React-freie Logikeigentümer

Ein Controller darf als Cordis-Service installiert sein, aber er besitzt keine React-Contexts, React-Hooks, Slot-Props oder Komponenten. Ein Controller-Snapshot enthält nur Fakten, die er besitzt, und seine Befehle ändern nur Host- oder Domain-Objektzustand.

Die UI-Schicht darf mehrere Controller für eine Navigationsentscheidung lesen, aber sie schreibt das kombinierte Ergebnis nicht in einen Controller-Snapshot zurück. Ein UI-Adapter dupliziert die Geschäftsimplementierung eines Controller-Befehls nicht.

### UI-Adapter besitzen React-Integration

Jeder Standard-Hook gehört zum `ui-*`-Paket, das seinen Datensemantiken am nächsten ist.

| Hook | Eigentümer | Quelle |
| --- | --- | --- |
| `useSessions` | `client/ui-session` | Session Controller globale Liste |
| `useSession` | `client/ui-session` | Aktueller Session-Snapshot |
| `useProjection` | `client/ui-session` | Aktuelle Session Keyed-Projektion |
| `useSessionPendingInteraction` | `client/ui-session` | Aggregierte Pending-Domains |
| `useWorkspaces` | `client/ui-workspace` | Workspace Controller Liste |
| `useConversation` | `client/ui-conversation` | Conversation-Binding-Snapshot |
| `useChat` | `client/ui-chat` | `chat`-Target-Quelle |
| `useTrajectory` | `client/ui-trajectory` | `trajectory`-Target-Quelle |

`ui-renderer` implementiert nur generische Bindung. Es importiert keine Session-, Workspace-, Conversation-, Chat- oder Trajectory-Geschäftstypen oder -Werte.

### Slot-Scopes und Standard-Props sind getrennt

`ui-slots` deklariert Root-, Session- und Session-Maybe-Scopes plus declaration-merge-erweiterbare Standard-Prop-Typen. Es entscheidet nicht, welche Hooks jeder Scope installiert.

`ui-renderer` implementiert generische Scope-Adapter und Quellmaterialisierung. `ui-session` installiert den Session-Scope und liefert seine eingebauten Quellen; andere Domain-Pakete registrieren nur ihre eigenen Quellen und die Slot-Einträge, die sie konsumieren.

Ein Target hinzuzufügen fügt dem Renderer oder Session Controller keinen Zweig hinzu. Der Dateneigentümer handhabt Zustandsidentität, Updates, Fehler und Release; der UI-Adapter besitzt den Hook; der Präsentationseigentümer besitzt Target-spezifische Projektionen und Interaktionszustand.

## Paket-Ownership

| Paket | Besitzt | Besitzt explizit nicht |
| --- | --- | --- |
| `api/session-controller/client` | Session-Objekte, Liste, Auswahl, Befehle, Projektionen, Queue, Event-Fenster und Agent Contexts | Conversation-Targets, React, Slots, Workspace |
| `api/workspace-controller/client` | Workspace-Objekte, Reihenfolge, Archiv-Zustand, Befehle und Snapshots | React, Session-Navigations-Policy, Directory-UI |
| `client/ui-session` | Session-Scope, Standard-Quellen, `SessionProvider` und Pending-Interaktions-Aggregation | Session-Transport, Conversation-Assembly, Approval/Question-Ergebnisse |
| `client/ui-workspace` | Workspace-Hook, Browser-UI und Cross-Controller-Navigations-Policy | Workspace-Transport, Kopien von Session-Daten |
| `client/ui-conversation` | Conversation-Core, Registries, Bindings, Shell, Input, Composer, Queue und View-Navigation | Session-Transport, Chat/Trajectory-Snapshots |
| `client/ui-chat` | Chat-Target, Node-Definitionen, Renderer, Auswahl, Details und Locale | Session-Lebenszyklus, generische View-Navigation, Trajectory, Historical-Image-Cache |
| `client/ui-trajectory` | Trajectory-Target, Event-Record-Projektion und Inspection-View | Session-Snapshots, Chat-Snapshots |
| `client/ui-approval` | Pending Approval, Remote-Listener, Composer und Approval-UI | Session Control, generische Composer-Election |
| `client/ui-user-questions` | Pending Question, Remote-Listener, Composer und Question-UI | Session Control, generische Composer-Election |
| `client/store` | React-freier Store-Vertrag und Implementierung | Domain-Objekte, React-Hooks, Slot-Lebensdauern |
| `client/ui-renderer` | SlotRegistry, Scope-Bindung, Selector-Hooks, Outlets und React-Root | Session-, Workspace- und Conversation-Geschäftslogik |

## Gesamtdatenfluss

Session-Daten erreichen die UI über diesen Pfad:

```text
[ctx.remote.session]
          |
          v
[api/session-controller/client]
  |-- SessionListState --------------------------> [ui-session] -> useSessions
  |-- SessionSnapshot ----------------------------> [ui-session] -> useSession
  |-- ProjectionValueSource ----------------------> [ui-session] -> useProjection
  `-- per-Session SessionEventSource
                    |
                    v
             [client/ui-conversation]
                    |
                    | assemble
                    v
             ConversationSnapshot ----------------> useConversation
                    |
          |---------+----------|
          v                    v
      [ui-chat]           [ui-trajectory]
          |                    |
       useChat            useTrajectory
```

Workspace-Daten gelangen vom `ctx.remote.workspace` in den Workspace Controller, dann exponiert `ui-workspace` sie als `useWorkspaces`. Für Cross-Domain-Navigation liest `ui-workspace` vorübergehend den Session Controller und gibt eine Auswahl oder einen Befehl aus.

Approval und Question kommen vom Host-Waterfall über `ctx.remote.$on` bei ihren jeweiligen UI-Eigentümern an. Jeder Eigentümer veröffentlicht ein Pending-Objekt; `ui-session.pendingInteractions` liefert dann dasselbe Objekt an Session-Navigationszustand und Conversation-Composer-Auswahl.

## Session Controller Client

### Umfang von SessionSnapshot

`SessionSnapshot` repräsentiert Control- und Lebenszyklus-Fakten, die zu einer Session gehören. Es darf Identität, Running, Removed, Blank, Subagent-Adresse, Open-Phase, History-Phase, Prompt-Fehler, Agent-Fehler und Queue-Zustand enthalten.

Es enthält nicht:

- ein rohes Event-Array;
- Conversation Views;
- Chat Nodes;
- Trajectory-Zeilen;
- Pending-Approval- oder Question-Objekte;
- Präsentationszustand, der von Aufrufern verlangt, Events zu traversieren.

Ob ein Feld aus einem Event, einem Control-Frame oder einem lokalen Befehl stammt, bestimmt seinen Eigentümer nicht automatisch; Konsumsemantiken bestimmen Ownership. `composerPhase` hängt sowohl vom Session-Lebenszyklus als auch von Conversation-Target-Aktivität ab, also komponiert `ui-conversation` es, statt es in `SessionSnapshot` zu legen.

### Drei Read Faces

Der Session Controller exponiert drei getrennte Read Faces:

1. Die globale Session-Liste und die Current-Selection-Quelle, verwendet von Navigation und `useSessions`.
2. Ein logisches Binding pro Session mit `sessionId`, einer `SessionSnapshot`-Quelle, Befehlen und Projektionsquellen.
3. Ein Conversation-facing `SessionEventSource`, das nur vom Conversation-Assembly-Core verwendet wird.

Gewöhnliche UI-Komponenten lesen `SessionEventSource` nicht direkt. `ui-session` liest keine privaten Event-Fenster, und der `ui-conversation`-Core erhält weder React-Bindings noch Slot-APIs.

### SessionEventSource

`SessionEventSource` exponiert ein materialisiertes Event-Fenster, keinen Transport.

Das Fenster trägt geordnete `entries`, `hasMore`, eine monotone `revision` und eine `replace | prepend | append`-Änderungsbeschreibung. Append verknüpft ein unveränderliches Segment in konstanter Zeit; ein Verbraucher, der das vollständige `entries`-Array braucht, materialisiert und cached es für diesen Snapshot.

Initiales Öffnen, Reconnect, Gap-Reparatur und Updates, deren Kontinuität nicht bewiesen werden kann, veröffentlichen `replace`; History-Paginierung veröffentlicht `prepend`; ein kontinuierliches Live-Event veröffentlicht `append`. Der Conversation-Core wählt inkrementelles Update oder kompletten Rebuild aus Revision und Änderung.

`MutableSessionEventSource` ist die interne Write Face des Session Controllers. Verbraucher hängen nur vom schreibgeschützten `SessionEventSource` ab.

### Session-Binding-Lebenszyklus

Jedes Session-Binding besitzt einen Cordis Context und Fiber. Der Session Controller erstellt und gibt das Binding frei.

Objekte, die von einer Session abhängen, registrieren Cleanup über `binding.ctx.effect()`. Die Freigabe eines Bindings räumt Conversation-Bindings, UI-Materialisierungen und Scoped Slot Stores auf, ohne ein dediziertes `onBindingRelease`- oder `onRelease`-Callback-Protokoll.

Dieses Cleanup erfordert nicht, dass der Session Controller das Roster der Upper-Layer-Verbraucher kennt.

## UI Session

### Service-Verantwortlichkeiten

`client/ui-session` ist der einzige Session-Adapter zwischen dem Session Controller und dem React/Slot-System. Es stellt `ctx.uiSession` bereit und:

- beobachtet die Session-Liste, aktuelle Auswahl und Per-Session-Bindings;
- installiert die Session- und Session-Maybe-Scope-Adapter;
- liefert `SessionProvider`-Rendering-Semantiken;
- liefert eingebaute Session-Snapshot-, Projektions- und sessionId-Quellen;
- akzeptiert Session-scoped Quellbeiträge anderer Domain-Pakete;
- aggregiert von Geschäftspaketen registrierte Pending-Interaktionen.

Es besitzt weder Session-Transport, Event-Folding, Conversation-Targets noch konkrete Geschäftsergebnisse.

### Standard-Quellregistrierung

Ein Domain-Paket ruft `ctx.uiSession.provide()` auf, um eine bare Quelle zu registrieren. Der Deskriptor deklariert statisch seine Hook-, Keyed-Hook- und Prop-Rosters; `resolve(binding)` gibt genau diese Werte für ein Session-Binding zurück. Zum Beispiel registriert `ui-conversation` den Snapshot jedes Bindings als `conversation`-Hook-Quelle.

Der Renderer wandelt eine gewöhnliche Quelle in `use<Name>` um. Offene Schlüsselräume wie Projektionen verwenden einen Keyed-Hook-Resolver, während stabile Werte Props verwenden.

Die Runtime lehnt undeklarierte, fehlende oder doppelte Standard-Props ab. `ui-session` materialisiert seine eigenen Built-ins durch denselben Mechanismus, sodass der Renderer keine Session-spezifischen Namenszweige hat.

### Scope-Bindung

session und session-maybe verwenden denselben Adapter mit unterschiedlichen Bindungssemantiken:

- ein strikter Session-Scope weigert sich zu rendern ohne aktuelles Binding;
- session-maybe verwendet ein stabiles Absent-Binding, um die Hook-Aufrufreihenfolge zu erhalten;
- das Ändern der aktuellen Session baut den strikten Session-Subbaum unter dem `sessionId`-Key neu auf;
- Root- und Session-Maybe-Einträge dürfen über Session-Wechsel hinweg gemountet bleiben.

Jedes reale materialisierte Binding behält den Context des Controller-Bindings. `ui-session` entfernt den Cache-Eintrag und zieht das aktuelle Binding über `binding.ctx.effect()` zurück.

Das Ändern des Contribution-Rosters rematerialisiert bestehende Bindings und veröffentlicht eine neue Quellmenge. Quellidentität bleibt innerhalb einer Binding-Lebensdauer stabil, wie von `useSyncExternalStore`-Caching verlangt.

### SessionProvider

`SessionProvider` ist ein von `PropsRenderSlots` aus einer Session-scoped Child-Deklaration abgeleiteter Standard-Sitz, kein React Context, den Geschäftskomponenten direkt importieren.

Es akzeptiert gewöhnliche `ReactNode`-Kinder statt einer `(sessionId) => ReactNode`-Render-Funktion; Aufrufer wrappen `renderSlot('details', {})` direkt.

Session-Identität kommt aus der Scope-Bindung und dem Standard-`sessionId`-Prop. Der Provider handhabt nur den Absent-Zweig und Subbaum-Isolation per Session-Identität; Komponenten erhalten keine Session-Daten über einen Provider-Callback.

### Pending-Interaktionen

Geschäftspakete erweitern `SessionPendingInteractionMap` durch Declaration Merging. Jedes Pending-Objekt trägt mindestens einen stabilen `key`, eine Domain-`kind` und eine `sessionId`; `ui-session` importiert keine konkreten Approval- oder Question-Typen.

Ein Geschäfts-Plugin ruft `registerPendingInteraction(precedence)` in `apply()` auf, um eine stabile Registrierung für seine Pending-Domain zu erstellen. Die zurückgegebene Per-Request-Publikationsfunktion veröffentlicht ein exaktes Objekt zusammen mit seinem Waterfall-Delegations-Callback und gibt einen idempotenten Disposer für dieses Objekt zurück. Plugin-Teardown entfernt alle veröffentlichten Objekte, bevor ihre Delegations-Callbacks aufgerufen und abgewartet werden, sodass aktive Host-Anfragen nicht suspendiert bleiben können, nachdem ihr Client-Antworter entladen wurde.

Gleichzeitige Objekte mit demselben Key werden abgelehnt; Ersatzanfragen verwenden einen neuen Key. Eine Session darf mehrere Domains oder Anfragen gleichzeitig halten.

`ui-session` wählt das effektive Objekt jeder Session per Domain-Präzedenz aus. Höhere Präzedenz gewinnt; bei gleicher Präzedenz gewinnt das später gültige Objekt in Traversierungsreihenfolge.

Das Aggregat wird als `pendingInteractions: ObservableSnapshot<ReadonlyMap<SessionId, SessionPendingInteraction>>` veröffentlicht; `useSessionPendingInteraction` ist seine React-Read-Face.

Session-Navigationszustand und Composer-Übernahme lesen dasselbe effektive Objekt. Sie führen keine separaten Status-Maps oder Übernahme-Rosters.

## Workspace Controller und UI Workspace

### Umfang von WorkspaceSnapshot

`WorkspaceSnapshot` enthält nur Host-autoritative Daten im Besitz des Workspace Controllers, einschließlich Workspace-Zeilen, Reihenfolge, Archiv-Set, Follow-Phase und Fehlern. Das `sessionIds` einer Workspace-Zeile ist ein Assoziationsfeld, keine Kopie von Session-Objekten im Workspace-Snapshot.

Diese kombinierten Fakten gehen nicht in `WorkspaceSnapshot` ein:

- ob die Workspace- und Session-Baselines beide bereit sind;
- der jüngste aus Session-Update-Zeiten abgeleitete Workspace;
- ob die aktuelle Session gelöscht wird, weil sie archiviert wurde;
- welche Blank Session New Session wiederverwenden soll;
- welche Session der initiale Startup auswählen soll.

### UI-Workspace-Kompositionsverantwortlichkeiten

`client/ui-workspace` registriert die Workspace-Listenquelle als Root-Standardquelle `workspaces`, aus der der Renderer `useWorkspaces` bereitstellt.

Initiale Auswahl, Blank-Session-Wiederverwendung, New-Session-Navigation, Concurrent-Create-Koaleszierung und Navigation nach Archivierung sind UI-Navigations-Policy. Diese Policy darf zur Entscheidungszeit sowohl `ctx.workspaces` als auch `ctx.sessions` lesen, gibt aber nur Controller-Befehle und Auswahlaktionen aus und veröffentlicht keinen kombinierten Snapshot.

Directory-Picker, Directory-Browsing und `openPath` sind separate Directory-Fähigkeiten und gehen nicht in den Workspace Controller ein.

## UI Conversation

### Assembly-Core

`client/ui-conversation` enthält sowohl den React-freien Conversation-Assembly-Core als auch den React-Adapter derselben Domain.

Der Core besitzt `ConversationSnapshot`, die Definition-Registry, die View-Registry, den Event-Assembler, den Location-Index, Per-Session-Bindings, Target-Quellen und Target-Aktivität.

Der Core erhält `SessionEventSource` aus einem Session-Binding. Append- und Prepend-Änderungen mit kontinuierlichen Revisionen verwenden inkrementelle Assembly; Replace-Änderungen oder Revisionslücken bauen aus dem vollständigen Fenster neu.

Definition- oder View-Roster-Änderungen bauen nur das Conversation-Binding neu; sie bauen keine Session neu oder öffnen einen Remote-Stream neu. Der Core importiert kein React und kann Event-Folding, inkrementelle Updates und Registry-Lebensdauern unabhängig testen.

`ConversationSnapshot` kopiert weder `SessionSnapshot` noch exponiert es rohe Events. Es veröffentlicht nur das Target-neutrale View-Roster, Target-Aktivität und Target-Quellen-Lookup.

`useSession` und `useConversation` kommen aus separaten Quellen und sind nicht garantiert atomar in einem React-Commit veröffentlicht. Komponenten, die beide lesen, rechnen rein aus ihren aktuellen Snapshots und behandeln Benachrichtigungsreihenfolge nicht als Geschäftskausalität.

### Definition- und View-Registries

`UiConversation.events` ist die einzige Registry für Event-Definitions, und `UiConversation.views` ist die einzige Registry für Target-Snapshot-Builder.

Die Registries lehnen doppelte Keys ab, erhalten Registrierungsreihenfolge und geben idempotente Disposer zurück. Bestehende Conversation-Bindings bauen aus ihren aktuellen Event-Fenstern neu, wenn sich ein Roster ändert; Änderungen in einer synchronen Registrierungsrunde werden zu einem Microtask-Rebuild koalesziert.

Ein Target-Paket erweitert Snapshot- und Location-Data-Maps durch Declaration Merging und registriert dann seine Definitions, Builder und View. Registrierungen folgen Cordis-Effect-Disposal.

`ui-conversation` importiert keine konkreten Target-Pakete.

### Conversation React Adapter

Der React-Adapter registriert jeden Conversation-Binding-Snapshot als Session-Standardquelle `conversation`, aus der der Renderer `useConversation` bereitstellt.

Das Paket besitzt außerdem Shell, Input, Composer-Kette, Queue-UI, Drafts, View-Navigation und Phase-Komposition. Der Core liest keinen React Context, keine Slot-Props oder Komponentenzustand.

Die View-Auswahlreihenfolge ist eine gültige persistierte Auswahl, registriertes `chat`, dann keine View. Eine ungültige Auswahl überschreibt den persistierten Wert nicht, und das System fällt nicht auf die erste registrierte View zurück.

Ohne `ui-chat` kann die Shell trotzdem aktivieren und mounten, wählt aber nicht implizit Trajectory oder ein anderes Target.

Die Shell-Phase ist eine reine Komposition aus Session-Lebenszyklus und Conversation-Target-Aktivität. Eine aktive Session oder ein Target, das sichtbaren Inhalt meldet, ergibt Active; ein fehlgeschlagener erster Prompt bleibt Engaging.

### Input und Composer

Die Composer-Kette gehört zu `ui-conversation`; eine konkrete Übernahme gehört zu ihrem Geschäftspaket. `ConversationRoot` liest das effektive Objekt der aktuellen Session über `useSessionPendingInteraction` und liefert es als `ComposerChainProps.pendingInteraction` an Ketten-Selektoren.

Ein Selektor ist eine reine Funktion der Eigentümer-Aktualität. Sein Nicht-Null-Ergebnis erreicht die ausgewählte Komponente als `matched`. Ein stabiler Composer-Eintrag und der Default-Composer bleiben gemeinsam gemountet, während die Kette eine effektive Präsentation auswählt.

Draft- und Input-Zustand gehören zur Conversation-UI und gehen nicht in den Session-Snapshot ein. Queue-Befehle verwenden einen Session-scoped Service zur Adressierung und schreiben Queue-UI nicht in den Conversation-Core.

## Chat- und Trajectory-Targets

### Chat-Eigentümer

`client/ui-chat` registriert Target-ID `chat` und besitzt den Chat-Snapshot-Builder, Conversation-Node-Definitionen, Keyed-Node-Renderer, Auswahl, Details, Statistiken, Locale und Tool-Inspection-Zusammenarbeit.

Es registriert die `chat`-Target-Quelle über `ctx.uiSession.provide()`. `ChatView` verwendet `useChat` für Aggregate-Order-, Navigations- und Timeline-Reads; jedes `ChatNodeSeat` erhält identitätsstabile Node- und Turn-Process-Quellen aus diesem Snapshot und abonniert nicht die Aggregatquelle.

Nur sichtbare Nicht-Command-Chat-Nodes aktivieren Chat. Gewöhnliche nur-Command-History hält das Hero sichtbar; der `/goal`-`command-input`-Node aktiviert eine frische Conversation.

Der Historical-Image-Cache zog zu `ui-conversation` (`ctx.uiConversation.imageUrl`), sodass Chat und Trajectory einen autorisierten Read und eine Browser-URL pro Session-Attachment teilen ([Trajectory durable image attachments](../../archived/feature/2026-08-24-trajectory-image-attachments.md)); Draft-Bilder bleiben Teil von Conversation Input.

### Trajectory-Eigentümer

`client/ui-trajectory` registriert `trajectory` über dasselbe Target-Protokoll. Es besitzt Event-Record-Projektion, Timelines, virtuelle Zeilen, Auswahl und die Inspection-View und exponiert `useTrajectory` über eine Standard-Quelle.

Session-Lebenszyklus liest `useSession`, während Trajectory-Daten `useTrajectory` lesen. Trajectory erhält seine eigenen Daten nicht über einen Session- oder Chat-Snapshot.

Andere Targets verwenden denselben Registrierungsfluss ohne den Renderer, Session Controller oder ui-session zu ändern.

## Approval und Question

### Stabile Registrierung

Die Plugin-Installation von Approval und Question trennt stabile Registrierungen von Per-Request-Handling. `apply()` registriert Locale-Daten, ruft `registerPendingInteraction()` einmal für seine Pending-Domain auf und registriert einen stabilen Eintrag in `conversation.composer`.

Der stabile Approval-Eintrag deklariert außerdem seinen Detail-Child-Slot. Gleichzeitige Anfragen und Session-Anzahl fügen keine Composer-Einträge hinzu oder deklarieren Slots neu, und jede Registrierung folgt Plugin-Fiber-Disposal.

### Eine Waterfall-Anfrage

Ein Remote-Event-Listener löst die Session aus seinem eigenen Agent Context auf. Ohne Session-Scope ruft er `next()` auf, um den Waterfall fortzusetzen; mit Session-Scope erstellt er ein `PendingApproval` oder `PendingQuestion`.

Der Listener veröffentlicht das Objekt über die registrierte Domain-Publikationsfunktion, wartet auf Benutzervollendung, Cancellation oder Request-Signal-Abbruch und entfernt das exakte Objekt in `finally`.

Eine Anfrage registriert keinen Slot, erstellt keinen weiteren Lebenszyklus-Effect oder mutiert den Session-Snapshot.

Approval exponiert Allow und Reject; Question exponiert Answer und Cancel. Benutzer-Cancellation einer Question gibt `ASK_CANCELLED` zurück; Unterbrechung einer Pending-Anfrage durch `AbortSignal` gibt `UserQuestionError(ASK_ABORTED)` zurück statt den `AbortError` des Carriers oder einen gewöhnlichen `Error` zu leaken.

Das Gateway verlangt nur, dass Remote-Event-Argumente und -Ergebnisse gültige JSON-Transportwerte sind. Es dupliziert keine Domain-Validierung von Question-Optionen.

### Eine Pending-Projektion

Sidebar und Composer konsumieren denselben `pendingInteractions`-Snapshot. Navigation zeigt Approval-, Plan-Review- oder Question-Zustand aus der `kind` des effektiven Objekts; jeder Composer-Eintrag wählt sein eigenes Panel per Objektidentität.

Dieselbe Request-Identität steuert beide UI-Flächen. Eine Anfrage, die eine andere Anfrage desselben Typs ersetzt, verwendet einen neuen Key, sodass Selektoren und Subscribers den Identitätswechsel beobachten.

`ui-session` implementiert nur Cross-Domain-Präzedenz und interpretiert keine Approval- oder Question-Felder.

## UI Renderer und Store

### UI Renderer

`client/ui-renderer` besitzt den `SlotRegistry`-Service und den React-Renderer. Es ist verantwortlich für:

- `ctx.slots.register()`, `inject()`, `renderSlot()` und Deklarationslebensdauern;
- Root-, Session- und Session-Maybe-Scope-Adapter;
- Bindung von Standard-Observable-Quellen an Selector-Hooks;
- Slot-Outlets, Fehlerisolation, Root-Mount und Hydration;
- Verwaltung von Slot-Store-Instanzlebensdauern per Scope-Key.

Der Renderer darf generische Scope-Namen und Bindungsprotokolle kennen, liest aber keine Domain-Services. Das Rendern eines Session-Scopes ohne installierten Adapter ist ein Assembly-Fehler, der sofort scheitert.

### Store

`client/store` ist eine schlichte React-freie Bibliothek, die `ObservableSnapshot`, `SnapshotStore`, `defineStore`, `createSnapshotStore` und `shallowEqual` besitzt.

`ui-slots` referenziert den Store-Vertrag; `ui-renderer` verwaltet Store-Instanzen und liefert `useStore`.

Stores halten Betrachtungs- und Interaktionszustand wie Drafts, View-Auswahl, Chat-Auswahl, Inspection-Anfragen und Panelgröße. Session, Workspace, Conversation, Remote-Streams und Connection-Generationen gehen nicht in Stores ein.

### Registrierungs- und Release-Reihenfolge

Wenn ein Plugin sowohl eine Quelle als auch einen Slot-Eintrag bereitstellt, registriert es die Quelle zuerst und den Eintrag als Zweites. Umgekehrtes Cordis-Disposal entfernt dann den Eintrag vor der Quelle, sodass ein gemounteter Eintrag nie kurzzeitig einen erforderlichen Hook verliert.

Die Freigabe eines Session-Bindings räumt UI-Materialisierung und Scoped Stores über `binding.ctx.effect()` auf. Die Freigabe eines Plugin-Fibers räumt Quellen, Listener und Slot-Einträge über Registrierungs-Disposer auf.

Jeder Disposer ist idempotent und hängt von keinem impliziten Callback außerhalb des Cordis-Lebenszyklus ab.

## Komposition und Dependency-Richtung

Das Anwendungsbundle installiert explizit die erforderlichen Controller-, Adapter-, Target- und Renderer-Plugins. Jedes Eigentümer-`apply()` installiert nur seinen eigenen Service, Listener und Beiträge.

Runtime-Konsum fließt als `session-controller → ui-session → ui-conversation → target UI`, `workspace-controller → ui-workspace` und `store → ui-slots → ui-renderer`; Approval und Question hängen nur vom Pending-Registrierungspunkt ab, den `ui-session` exponiert.

Pfeile in dieser Beschreibung repräsentieren Runtime-Konsum und schließen Type-only-Declaration-Merge-Kanten nicht ein. Controller hängen nicht zurück von UI-Adaptern, der Renderer hängt nicht zurück von Domain-Paketen, und der Conversation-Core hängt nicht von einem konkreten Target ab.

UI-Komponenten erhalten kein `ctx`. Cross-Package-Kollaboration verwendet Cordis-Services, Standard-Quellen oder Slot-Registrierungen ohne eine Aggregat-Fassade einzuführen.

## Entwicklerleitfaden

### Zuerst den Dateneigentümer wählen

Bevor Zustand hinzugefügt wird, wähle seinen einzigen Eigentümer aus seinen Konsumsemantiken: Host-Kommunikation, Befehle und Entitätslebenszyklus gehören zu einem API-Controller; aus Session-Events assemblierte, aber von einem Target unabhängige Daten gehören zum Conversation-Core; nur einer View dienende Projektionen gehören zu diesem Target-Paket; Drafts, Auswahlen und Panel-Zustand gehören zum UI-Paket, das die Interaktion besitzt.

Derselbe Fakt darf nicht gleichzeitig in einem Controller-Snapshot, Conversation-Snapshot und Store gehalten werden. Eine Cross-Domain-Entscheidung liest mehrere Quellen und gibt sofort einen Befehl aus; sie erstellt keinen Joined-Snapshot oder cached das Objekt einer anderen Domain.

Dies sind Zeichen falscher Ownership: Ein Controller importiert React; der Renderer verzweigt auf Geschäftstypen; eine Komponente traversiert Session-Events; ein Store hält Session- oder Workspace-Entitäten; das Ändern eines Targets erfordert das Ändern des Session Controllers.

### Session-scoped Daten hinzufügen

1. Stelle eine React-freie Observable-Quelle im Domain-Eigentümer bereit.
2. Declaration-merge den Standard-Prop-Typ im besitzenden UI-Adapter.
3. Deklariere ein festes Roster über `ctx.uiSession.provide()` und löse seine Quelle aus einem Session-Binding auf.
4. Lasse die Slot-Komponente den generierten Hook über `PropsRuntime` empfangen; gib `ctx` nicht an eine Komponente.
5. Hänge das Cleanup jeder Binding-Ressource an `binding.ctx.effect()` und überlasse Registrierungs-Cleanup dem Plugin-Fiber.
6. Teste fehlende Werte, doppelte Namen, Roster-Ersatz, Session-Wechsel und Binding-Disposal.

Nur offene Schlüsselräume verwenden Keyed Hooks. Endliche stabile Quellen verwenden gewöhnliche Hooks, und unveränderliche Identifikatoren verwenden Props. Hartkodiere keine Geschäftsnamen im Renderer, um eine Registrierung zu sparen.

### Ein Conversation-Target hinzufügen

1. Erweitere die Conversation-Snapshot- oder Location-Data-Map im Target-Paket.
2. Registriere die erforderlichen Event-Definitions mit `UiConversation.events`.
3. Registriere den Snapshot-Builder, die Target-ID, die View und die Aktivitätsregel mit `UiConversation.views`.
4. Exponiere den Standard-Selector-Hook des Targets über `ctx.uiSession.provide()`.
5. Registriere den Renderer, die Locale und Target-spezifische Slot-Einträge im selben Paket.
6. Verifiziere, dass das Entladen des Targets nur das Conversation-Binding neu baut, ohne die Session, andere Targets oder den Remote-Stream zu ändern.

Ein Target darf nicht den Snapshot eines anderen Targets als Datenquelle verwenden. Optionale Kollaboration verwendet einen schmalen Port oder Slot; wenn ein Target abwesend ist, bleibt die Shell bootbar und rät kein Fallback.

### Eine Pending-Interaktions-Domain hinzufügen

1. Definiere das Pending-Objekt und seine Vollendungs-, Cancellation- und Unterbrechungssemantiken im Geschäftspaket.
2. Füge das Objekt zu `SessionPendingInteractionMap` durch Declaration Merging hinzu.
3. Rufe `registerPendingInteraction()` einmal in `apply()` auf und registriere einen stabilen Composer-Eintrag.
4. Löse die Session aus dem Agent Context im Remote-Waterfall-Listener auf; rufe `next()` auf, wenn der Listener die Anfrage nicht handhaben kann.
5. Wenn er die Anfrage handhaben kann, erstelle das Pending-Objekt, veröffentliche es über die Publikationsfunktion, warte sein Ergebnis ab und entferne es in `finally`.
6. Teste gleichzeitige Keys, Präzedenz, Benutzer-Cancellation, Transport-Abbruch, Plugin-Disposal und Delegation ohne eine Session.

Eine Anfrage registriert keine Slots, deklariert keine Child-Slots, mutiert nicht den Session-Snapshot oder erstellt keinen separaten Zustandsindex. Sidebar und Composer lesen beide ein effektives Objekt aus `useSessionPendingInteraction`.

### Review-Checks

- Jede neue Quelle, jeder Registry-Beitrag, Listener und Cache hat einen expliziten Cordis-Fiber- oder Session-Binding-Eigentümer.
- Jeder öffentliche Hook lässt sich zu einer React-freien Quelle zurückverfolgen; kein Selektor wird durch Schichten weitergeleitet nur, um Argumente weiterzureichen.
- Jede Komponente erhält Daten und Aktionen aus Standard-Props oder der Inject-Face ihres besitzenden Slots.
- Jedes Target hat definiertes Verhalten bei Abwesenheit, dynamischer Registrierung und Entladung.
- Jeder Cross-Layer-Import schreitet in der Einbahn-Richtung Controller, Adapter, Renderer, Komponente fort.
- Jeder Fehler wird vom frühesten Eigentümer klassifiziert, der seine Semantik erklären kann; Carrier-Fehler leaken nicht direkt als Geschäftsfehler.

## Verifikation

Von jeder Schicht besessene Tests pinnen Controller-Bindings und Event-Quellen, UI-Scopes und Pending-Präzedenz, inkrementelle Conversation-Assembly und View-Fallback, Target-Projektionen, Waterfall-Ergebnisse und Renderer-Scope/Store-Lebensdauern. Anwendungskompositions-Tests decken sowohl das vollständige Roster als auch Startup ohne konkretes Target ab; Komponententests ersetzen keine Objektschicht-, Replay- und Lebenszyklustests.

## Alternatives considered

- **Eine Runtime-Fassade behalten.** Ein einziger Einstiegspunkt würde den Dependency-Hub behalten und neuem Code erlauben, Domain-Eigentümer zu umgehen, also stellt das System weder die Fassade noch einen Kompatibilitäts-Export bereit.
- **Allen Client-State in API-Controller legen.** Protokollobjekte würden dann React, Views und Präsentations-Policy besitzen, also behalten Controller nur React-freien Domain-State.
- **Controller direkt React-Hooks bereitstellen lassen.** Nicht-React-Verbraucher könnten dieselben Objekte nicht wiederverwenden, und Transport- und Renderer-Lebensdauern würden voneinander abhängig.
- **Conversation in SessionSnapshot legen.** Dies würde die Session-API aufblähen und gewöhnliche Session-Verbraucher zwingen, Event-Folding und Target-Rosters zu verstehen.
- **Chat und Trajectory Session-Events unabhängig replayen lassen.** Reihenfolge, Locations und Registry-Rebuild würden dupliziert, also bleibt der geteilte Assembly-Core in `ui-conversation`.
- **Den Conversation-Core in ein weiteres Nicht-UI-Paket extrahieren.** Core und Adapter evolvieren derzeit gemeinsam und haben keinen anderen Nicht-UI-Paket-Verbraucher; Verzeichnistrennung innerhalb eines Pakets hält den Core React-frei.
- **Workspace und Session zu einem Snapshot kombinieren.** Dies würde einen weiteren Cross-Domain-Eigentümer erzeugen, also bleibt Cross-Domain-Logik eine sofortige Entscheidung in `ui-workspace`.
- **Jeden Standard-Hook in den Renderer bauen.** Generische Infrastruktur müsste jede Domain kennen, also hält die Standard-Quellregistrierung den Renderer von Geschäftstypen unabhängig.
- **Für jede Pending-Anfrage dynamisch einen Composer-Eintrag registrieren.** Dies würde Child-Slots neu deklarieren und gleichzeitige Anfragen über Registrierungsreihenfolge konkurrieren lassen, also sind stabile Einträge von der Request-Publikation getrennt.
- **Pending-Interaktionen in eine Session-Projektion schreiben.** Ein unbeantworteter Waterfall ist kein committeter durable Session-Fakt; Remote-Event-Replay stellt ihn nach Refresh wieder her, also bleibt er in einer Geschäfts-UI-Quelle.
- **Einen dedizierten Release-Callback zu Bindings hinzufügen.** Dies würde den Cordis-Lebenszyklus duplizieren; `binding.ctx.effect()` hängt Verbraucher-Cleanup bereits an denselben Eigentümer.
- **Die Session-ID von SessionProvider über eine Render-Funktion weitergeben.** Dies würde einen weiteren Dateninjektionspfad erzeugen; gewöhnliche Kinder und das Standard-`sessionId`-Prop behalten einen Einstieg für Scoped-Daten.
- **Store im Renderer behalten.** Der Store-Vertrag hängt nicht von React ab und wird von Objekten und Testinfrastruktur wiederverwendet, also hält `client/store` die Engine getrennt von Rendering-Lebensdauern.

## Konsequenzen

Session, Workspace, Conversation und jedes konkrete Target besitzen einen autoritativen Zustand. Nicht-React-Verbraucher können Controller und den Assembly-Core direkt wiederverwenden. Ein neues Conversation-Target registriert seine Definition, seinen Builder, seine View, Standard-Quelle und Slot-Einträge; eine neue Pending-Interaktions-Domain deklariert ihren Typ, registriert ihre Domain und stellt einen stabilen Composer-Eintrag bereit.

Der Renderer und Session Controller erhalten für eine neue Geschäftsdomain keinen Zweig, während Session-Bindings und Plugin-Fibers zwei explizite, komponierbare Release-Pfade bieten. Die UI kann unabhängige Session- und Conversation-Quellpublikationen beobachten, und Verbraucher können sich nicht auf ihre Benachrichtigungsreihenfolge verlassen.

Kompositionspakete müssen die erforderlichen Adapter- und Target-Plugins explizit laden. Die Shell bleibt ohne ein konkretes Target betriebsbereit, erstellt oder rät aber weder dessen View. Mehr Pakete und explizite Registrierungen fügen Assembly-Arbeit hinzu, während Dependency-Richtung, Testumfang und Fehler-Ownership lokal identifizierbar werden.
