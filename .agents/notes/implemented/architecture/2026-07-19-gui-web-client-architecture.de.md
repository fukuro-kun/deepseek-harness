# Agent Note: Web-Client-Architektur — der Client-Cordis-Plugin-Baum, das Slot-System und die React-freie Objektschicht

Status: implemented

[English](2026-07-19-gui-web-client-architecture.md) | [中文](2026-07-19-gui-web-client-architecture.zh.md) | Deutsch

> Arbeitsteilung: Das historische channel-unabhängige Layering-Modell und das RPC-Protokoll sind in der [archivierten Layering- und RPC-Protokoll-Note](../../archived/architecture/2026-07-19-gui-layering-and-rpc-protocol.md) festgehalten; dieses Dokument = die Browser-Seite: wie der Client-Cordis-Baum lädt, wie UI-Plugins über Slots und Services komponieren und wie die React-freie Objektschicht React über immutable Snapshots speist.

## Problem

Zwei Kräfte formen den Browser-Client. Erstens Streaming: Wenn in einer eventgetriebenen Konversations-UI Business-State (das Event-Fenster, Streaming-Akkumulation, ausstehende Interaktionen, die Connection-State-Machine) über React-Komponenten und einen globalen Store verstreut ist, erschüttert jedes Token-Chunk den Render-Tree, und der Austausch der UI-Library bedeutet, die Geschäftslogik neu zu schreiben. Zweitens Modularität: UI-Features (Layout, Sidebar, Conversation, Theme, Locale) müssen unabhängig ladbare Plugins sein — zur Laufzeit aus einem Host-geservten Manifest komponiert, nicht in ein Bundle kompiliert — ohne Compile-Time-Typsicherheit über Plugin-Grenzen hinweg aufzugeben.

## Entscheidung

Beide Enden laufen Cordis. Der Host ist ein Cordis-Plugin-Baum; der Browser betreibt einen zweiten, Client-seitigen Cordis-Baum, dessen jede UI-Capability ein Plugin ist, das dynamisch von einem Shell-gehaltenen Loader geladen wird. Innerhalb jenes Baums hostet Cordis-ctx alle Runtime-Fakten (Services, Stores, Session-Scopes), und React ist reine Projektion: Komponenten importieren nichts vom Framework, erhalten alles über Props und abonnieren immutable Snapshots via `useSyncExternalStore` (unten uSES).

```
┌─ Host ─────────────────────────┐   ┌─ Browser ─────────────────────────────────────────┐
│ sessions/agents/SessionLog     │   │ client cordis root ctx                             │
│ Connection + Gateway: RPC/events│◀─▶│  ├ vendored Loader + ctx.modules（内核，壳静态持有）│
│ webserver:                     │   │  ├ immediately entries: connection/runtime/        │
│  ├ GET /plugins/<id>/client.js │   │  │   ui-theme/i18n（fetch bundle，boot 预拉）       │
│  └ GET / 注入 __DSH_BOOT__ 图  │   │  ├ lazy entries: layout/sidebar/                   │
│                                │   │  │   conversation/trajectory（fetch bundle，按需） │
└────────────────────────────────┘   │  ├ ui-renderer（fetch bundle，React 根）       │
                                     │  └ session scope ×N（观看驱动，惰性建）            │
                                     │ DOM loading 页 → settled → React UI 一次成型       │
                                     └────────────────────────────────────────────────────┘
```

## Der Client-Cordis-Baum und die Ladekette

Die Ladekette — die zwei Package-Arten (plain versus dsh.client-Plugin), die Modulsystem-/Plugin-Governor-Trennung, der Zwei-Phasen-Boot über den Host-verfassten Entry-Graph mit Revisionen und Hot-Reload — gehört der [Client-Plugin-Loading-Note](2026-07-23-client-plugin-loading-model.md). Die tragenden Fakten für dieses Dokument: Der Browser bootet denselben vendored `@cordisjs/plugin-loader` wie der Host mit einem Client-Modulsystem (`ctx.modules`, `packages/client/modules`), das seinen `internal`-Contract erfüllt; jede Einheit mit Produktverhalten ist ein Entry im Host-verfassten `__DSH_BOOT__`-Graph — jedes Produktions-Plugin-Package (Infrastruktur eingeschlossen) trägt die `dsh.client`-Deklaration und kommt als gefetchtes `./client`-tsdown-Closure-Bundle an, wobei sich `immediately`-Zeilen nur durch das Boot-Phase-Eins-Prefetch unterscheiden, während plain Packages (React-Familie, Cordis, die noch nicht promovierten Libraries) Shell-gebündelt, geseedet und für den Graph unsichtbar bleiben; Bundles führen `window.__ModuleLoader__.load({ id, factory })` aus, und ihr `require` wird aus der lazien CJS-Modultabelle beantwortet (Seed-Wörter + registrierte Factories, beim ersten Require materialisiert und memoized — Cross-Plugin-Value-Imports sind ein Build-Fehler, Kooperation läuft über Cordis-Services); globale Styles und CSS-Modules sind in ihr besitzendes Plugin-Bundle inlined und werden bei der Materialisierung als `<style data-plugin="<id>">` injiziert (CSS-Modules erhalten außerdem gehashte Namen; Ownership-Tags ermöglichen Reload-Entfernung); Hot-Reload ist in Dev-Graphen live — der Webserver stat-pollt die Bundles, die er serviert, und broadcastet `rebuilt`-SSE-Frames, und das `client-hmr`-Plugin tauscht einen Fiber pro Frame. Nach `loader.await()` und einem All-ACTIVE-Sweep ruft der Framework-freie Kernel einmal `ctx.uiRenderer.mount(container)` des dynamischen UI-Renderers auf — jeder Entry ist erzeugt und jeder Fiber hat ACTIVE erreicht, FAILED/PENDING-Fibers werden laut gelistet; es gibt keinen Partial-Availability-Modus (progressives Rendering ist zurückgestellte Arbeit).

Die Typ-Universen bleiben auf Aggregate-Ebene getrennt — `tsconfig.host.json` ist das Host-Programm und `tsconfig.client.json` das Client-Programm, beide referenziert von der Solution-Root-`tsconfig.json` — weil beide Seiten Cordis-`Context` unter denselben Keys (`sessions`, `loader`) mit unterschiedlichen Services mergen; Client-Packages konsumieren das Wire-Vokabular über reine Typ-Subpaths (`@deepseek-ai/dsh-session/types` und Verwandte), sodass keine Host-Augmentation ins Client-Programm reitet.

## Das Slot-System: Wie die Seite komponiert

Das Slot-System hat seine eigene Note — den [Slot-System-Standard](2026-07-22-slot-type-chain-implementation.md) — und dieses Dokument verweist vollständig dorthin. Die Ein-Absatz-Zusammenfassung zur Orientierung: ui-renderer rendert nur `'root'`; ein Plugin komponiert UI über einen einzigen `register`-Call, der einen Slot besetzt, seine Child-Slots deklariert + autorisiert (`children`-Spec-Objekt), seinen Store deklariert und sein Business-Face injiziert; Komponenten-Props kommen in vier auto-abgeleiteten Anteilen (`PropsRuntime<K>` / `PropsRenderSlots<S>` / `PropsStore<H>` / inject), jeder aus seiner einzigen Wahrheitsquelle. `SlotMap`-Declaration-Merging ist die Typ-Autorität, und Entries tragen nur den Owner-Anteil („wer es injiziert, besitzt seinen Typ"); jeder gerenderte Entry sitzt in einer Per-Entry-Error-Boundary.

Implementierungs-Heimaten: Registry-Core und die Props-Share-Typen leben in `packages/client/ui-slots`; der Outlet-Renderer, die uSES-Bridge, Application-Level-Installation und Root-Mounting leben in `packages/client/ui-renderer`.

## Services und Scope-Adressierung

Ein Service ist die einzige API eines Plugins gegenüber anderen Plugins (UI-Komponenten und Injection-Faces sind keine APIs; ein Plugin, das niemand aufruft, mountet keinen Service — ui-trajectory ist das Minimal-Plugin-Exemplar: kein ctx-Service, nur View-Slot-Registrierungen). Der Kader: `ctx.connection` (RPC-Transport + Generation-State), `ctx.slots` (Registry-Wrapper, der `slots/changed` emittiert, Render-Entry, Renderer-Installation-Contract), `ctx.sessions` (List-Store, Current-Session-State, Scope-Baum), `ctx.loader`, `ctx.theme`, `ctx.i18n`, `ctx.layout` (Cross-Plugin-View-Navigation), `ctx.conversation` (send/cancel/startSession). Viewing-State, der früher in Service-Stores lebte (Panel-Breiten, Selection, Drafts), lebt nun in Entry-deklarierten Stores gemäß dem [Slot-System-Standard](2026-07-22-slot-type-chain-implementation.md).

Es gibt kein Komponenten-Registrierungsmodell neben Slots — die früheren View- und Tool-Ringe lösten sich beide darin auf. Conversation-Views sind Entries des `'conversation.view'`-List-Slots, den ui-conversation deklariert; Tab-Metadaten fahren auf den Registrierungs-Optionen mit (`id`/`order`/`label`), und Per-View-Chrome lebt innerhalb der View-Komponenten selbst. Finale Chat-Business-Nodes dispatchen über den keyed/session `'conversation.chat.node'`-Slot; ui-tool besitzt seinen `tool-call`-Entry, rendert die gelieferten `subCalls` rekursiv und deklariert den keyed/session `'tool.call.toolview'`-Child-Slot. Der Key-Raum bleibt runtime-offen (SlotMap deklariert Slots, niemals Keys), und Roots und Descendants dispatchen per `entryKey: toolName` mit `GenericToolCard` als Fallback. Business-Packages registrieren atomare Views über `ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: '<tool>' }, Row))`; die Deklaration ist die Load- und Reload-Abhängigkeit ([Entscheidung](../../archived/architecture/2026-08-05-slot-declaration-injection.md)). Die rechte Spalte ist der `rightbar`-Seat, den ui-sidebar-right mit einer Docking-Surface pro Session füllt; die frühere Details-Spalte und ihr `'conversation.details.tool'`-Seat sind weg ([Entscheidung](../feature/2026-09-04-right-sidebar-docking-infrastructure.de.md)). Die target-neutralen Event- und View-Registries sind Data-Assembly-Seams statt paralleler Komponenten-Registries ([Entscheidung](2026-08-09-client-conversation-node-assembly.md)).

**Scope-Adressierung** spiegelt das Agent-Scope-Idiom des Hosts: Services sind Root-Singletons, deren Methoden keine sessionId nehmen — sie lesen die Scope-Markierung des Callers (`scopeOf(ctx)`). Innerhalb eines Session-Scopes zielt `ctx.conversation.send('hi', 'queue')` auf jene Session; Cross-Session-Calls zielen durch ctx-Wechsel um (`ctx.sessions.scope(id)!.conversation.send(...)`); der Aufruf einer Scoped-Methode vom Root-ctx wirft. Client-Session-Scopes werden wie Host-Agent-Scopes geminted (ein No-op-Plugin-Fiber + ein Scope-Key-Extend), lazy beim ersten Viewing gebaut und nur dann abgerissen, wenn die Session entfernt und unwatcht ist — Host-Session-Tod allein reißt einen Scope nicht ab (er friert zu einem Read-Only-Viewport ein).

## Die Daten-Objektschicht (`packages/api/session-controller/src/client/`)

Frames treten ein, Snapshots treten aus, der Conversation-Assembler sitzt dazwischen — React-frei (null React-Imports, grep-assertierbar):

```
$events frames (ConnectionController pump, injected sinks)
        │
        ▼
SessionManager.handleMuxEnvelope / handleHostEnvelope
        │ session frames target existing instances (requested waits buffer)
        ▼
Session.handleMuxEnvelope ──► contiguous Event window
        │                        │ replace / prepend / append
        │                        ▼
        │                ConversationNodeAssembler
        │                  Definitions -> Contexts -> view builders
        ▼
Notifier 微任务合批 ──► ConversationSnapshot 缓存 ──uSES──► 组件
```

- **Session** (session.ts): lazy gebaut, resident — einmal erzeugt frisst sie weiterhin Frames im Hintergrund, sodass Weg-und-zurück-Wechsel sofort rendert. Operationen: `prompt`/`cancel` (RPC-Passthrough; Fehler landen im `promptError` des Snapshots), `open` (die Tail-History-Seite pullen, idempotent), `loadOlder` (aufwärts paginieren, reentry-guarded), `resync` (Reconnect = Fenster clearen und open erneut laufen lassen). Subscription: `subscribe`/`getSnapshot` (immer die gecachte Referenz) — `implements ObservableSnapshot<ConversationSnapshot>`, mit `useSelector = bindSnapshotSelector(this)` bei der Konstruktion attached, sodass eine Session direkt eine uSES-Quelle ist. Frame-Dispatch ist ein Switch: `session/event`-Frames dedupen per seq (der einzige Dedup-Key), puffern während open in-flight ist, sonst append + inkrementelle Projektion; open/stitch mergt den Live-Puffer per seq und füllt einmal nach, wenn `subscribed.lastSeq` das Fenster-Ende überholt.
- **ConversationSnapshot** (conversation.ts): der Top-Level-immutable-Snapshot-Contract. `chat` enthält strukturelle `order`, einen identitätsstabilen keyed Node-Reader, Turn-/Step-Indizes und die Timeline; `nodes`, `partial`, `runningCalls`, `turnTimings` und `turnEnds` sind die Kompatibilitäts-Schicht für unmigrierte Trajectory-Consumers. Ausstehende Interaktionen, Queue, Running, Removal, Open-State, Paging und Prompt-Fehler bleiben Session-Fakten. **Referenz-Disziplin** (die Prämisse von memo und uSES): Unveränderte Substrukturen und Node-Werte behalten ihre Referenzen; ein Business-Update ersetzt nur den Wert des entsprechenden Keys, es sei denn, dessen Order oder Location ändert sich. React abonniert weiterhin die Session als einzige beobachtbare Quelle, während das Framework-bereitgestellte `useSession(selector)` Node- und Location-Aggregat-Updates isoliert.
- **SessionManager** (manager.ts): Instanz-Cluster + Frame-Einstieg + die Session-Liste. sessionId-tragende Frames gehen nur an bestehende Instanzen (ein Mux-Broadcast darf nicht jede Session instanziieren); Approval-/Question-`requested`-Frames sind die Ausnahme — sie landen nie in History, puffern daher in `pendingBuffers` und replayen bei Instanziierung.
- **Notifier** (notifier.ts): zwei Kanäle, gewählt nach Änderungsquelle. `markDirty()` (Default; frame-getriebene Änderungen immer) batched pro Microtask — N Änderungen, eine Benachrichtigung, ein Re-Render; der Flush baut den Snapshot-Cache vor dem Benachrichtigen neu. `notifyNow()` (nur direkte Echos von User-Gesten) baut neu und benachrichtigt im selben Tick — Controlled Inputs rollen das DOM zurück und versetzen den Caret, wenn ihr Echo auf einen Microtask vertagt wird. Frame-getriebener Code, der notifyNow nutzt, kollabiert Batching zurück auf Per-Frame-Renders; verboten.
- **ConversationNodeAssembler** (`runtime/src/client/conversation/`): die Session-eigene inkrementelle Engine läuft unabhängig registrierte Definitions über rohe Events. `match(event)` wählt `(kind, id)` ohne Context-Scans; Start/Update bauen Definition-State; Engine-berechnete Locations tragen Turn-/Step-Closure; rückwärtige Context-Reads zeichnen Abhängigkeiten auf, die spätere Prepends reparieren; `buildViewNode(target)` materialisiert nur dirty Contexts. Der Chat-Builder bewahrt strukturelle Order und Per-Key-Value-Identität, `useSession`-Selektoren isolieren Konsum, und Assistant-Token-Publikation koalesziert auf einen Animation-Frame. Die [Conversation-Node-Entscheidung](2026-08-09-client-conversation-node-assembly.md) besitzt Assembly, während [Tool-Presentation-Ownership](../../archived/architecture/2026-08-08-client-tool-presentation-ownership.md) rekursives Tool-Rendering besitzt.
- **ConnectionController** (in `packages/client/connection`): öffnet den `$events`-Remote-Stream, pumpt per for-await und reconnectet mit exponentiellem Backoff (500 ms verdopplend bis 10 s, Jitter, unbegrenzt) hinter einem Generation-Fence; Sinks werden einweg injiziert (der Controller kennt Session nicht). Reconnect = Rebuild: `onConnected` → List-Refresh + Per-Open-Session-Resync. Die Objektschicht ruft generierte Namespaces über `ctx.remote` auf; Web-Carriage nutzt HTTP-POST für unäre Remote-Calls und API-Gateways WebSocket-Mux für logische Streams, während Connection Request-Transport und Generationen besitzt.

## Das React-Face (`packages/client/ui-renderer`)

Das dynamische ui-renderer-Plugin besitzt den ctx↔React-Adapter, Application-Level-Installation, Root-Mount und Title-Projektion. Business-Komponenten erhalten gebundene Hooks über Slot-Props und value-importieren den Renderer nicht.

- Die Snapshot-Store-Engine **lebt im Runtime-Package** (Zustand vanilla mit Draft-basierten Updates, `flush: 'sync'` per Default mit opt-in-`'raf'`-Batching, opt-in-Whole-Value-localStorage-Persistence, Dev-Mode-Deep-Freeze — alles aus `runtime`s `./client`-Main-Entry exportiert, kein Subpath): Store-Produkte sind nackte beobachtbare Quellen ohne Hook-Members. Plugins erreichen die Engine nur durch `defineStore`-Deklarationen gemäß dem [Slot-System-Standard](2026-07-22-slot-type-chain-implementation.md). ui-renderer komponiert jeden Hook an der Bindungsstelle (`bindSnapshotSelector`, pro Quelle gecacht) aus dem einen Daten-Contract, den React konsumiert: `ObservableSnapshot<T>` (`getSnapshot`/`subscribe`) — ein Session-Objekt und ein Snapshot-Store erfüllen ihn beide.
- `bindSnapshotSelector(source)`: bindet eine Quelle in einen getypten Selektor-Hook über uSES-mit-Selektor. Die vier uSES-Contract-Klauseln gelten per Konstruktion: getSnapshot gibt die gecachte Referenz zurück; subscribe ist eine Bind-Zeit-Closure (referenzstabil für immer); reines CSR übergibt keinen Server-Snapshot; Equality defaulted zu `Object.is` mit `shallowEqual`-Opt-in pro Call.
- Equality-Protokoll, ganze Kette: Produzenten nutzen Structural Sharing; Konsumenten kurzschließen mit `Object.is` oder `shallowEqual`; `React.memo` shallow. Deep-Comparison ist überall verboten.

## Verzeichnisform

Client-Packages leben unter `packages/client/*`, mit `apps/web` als dünne Vite-Anwendung über dem Boot-Export der Shell. Plugin-Packages halten ihre Browser-Hälfte unter `src/client/`; **jedes Build-Artefakt landet in `lib/`** — die Node-Hälfte als `lib/index.js`/`lib/invariant.js`, das Browser-Bundle als `lib/client.js` (das geteilte tsdown-Client-Preset emittiert beides; es gibt kein `dist/`-Verzeichnis, und `exports["./client"]` zeigt auf `./lib/client.js`). `ui-slots`, runtime und ui-renderer bilden die Infrastruktur-Richtung; Feature-Plugins kooperieren über Services und Slots, statt Präsentations-Implementierungen zu importieren.

Ein Multi-Domain-Plugin-Package teilt seine Client-Hälfte zusätzlich nach künftigen Package-Grenzen — ui-conversation ist das Exemplar:

```
src/client/
  contract/    shared slot and cross-domain types
  service.ts   cross-domain orchestration
  skeleton/    conversation shell and details host
  conversation-nodes/ independently registered business Definitions and Chat builder
  chat/        ordered conversation view
  input/       composer state machine
  queue/       queued-message presentation
  settings/    conversation settings rows
  apply.ts     cross-domain assembly point
  index.ts     public contract surface
```

Domain-Implementierungsdateien importieren niemals eine Geschwister-Domain; geteilte Oberflächen routen über `contract/`. `scripts/verify-client-domain-graph.ts` setzt das Layering durch (contract=0, domains=1, apply/index=2; Imports dürfen nur auf Ebenen ≤ der eigenen zeigen; Geschwister-Domain-Kanten schlagen fehl). Tool-Präsentation ist bereits ein separates `ui-tool`-Package und erreicht Chat und Details nur über die Slots, die ui-conversation deklariert.

## Wie entwickelt man

- **Ein neues UI-Feature** = ein neues Plugin-Package: `dsh.client` (+ `inject`-Topologie) in package.json deklarieren, die Browser-Hälfte unter `src/client/` schreiben (apply mountet Services/Stores und registriert Slots), die Node-Hälfte ein leeres apply lassen, sofern keine Host-Logik existiert, mit dem geteilten Preset bauen. Das Plugin zur Host-Config hinzufügen; Manifest und Laden folgen automatisch.
- **Ein neuer Slot**: siehe die [Slot-System-Standard-Note](2026-07-22-slot-type-chain-implementation.md) — den Contract in `SlotMap` mergen, ihn in den `children` des Parent-Entry deklarieren, über die auto-injizierte `renderSlot`-Prop rendern. Niemals Komponenten global exportieren.
- **Einen neuen Frame-Typ konsumieren**: rein-transport Session-Frames → Sessions Dispatch-Switch; Host-Level-Frames → die Manager-Routing-Tabelle; geloggte Conversation-Business-Events → eine Definition plus ein keyed View-Renderer, ohne einen Session-Business-Branch.
- **Wo lebt dieser State**: Business-Daten (Events, Streaming, Pending) → immer die Objektschicht; was der Parent weiß → Owner-Props an der renderSlot-Stelle; privat für eine Komponente (Scroll, Suchtext, Expansion) → Komponenten-State; über Entries geteilt oder Remounts überlebend (Selection, Drafts, Panel-Breiten) → ein Entry-deklarierter Store ([Slot-System-Standard](2026-07-22-slot-type-chain-implementation.md)).
- **Benachrichtigungskanal**: frame-getrieben/async = `markDirty`-Batching; direktes User-Gesten-Echo, dessen Controlled Input denselben Tick braucht = `notifyNow`.

## Konsequenzen

Token-Streams erschüttern den Render-Tree nicht mehr: Assistant-Chunks aktualisieren einen Business-Context und veröffentlichen seinen keyed Node höchstens einmal pro Animation-Frame; die Selektor-Ergebnisse fremder Zeilen behalten ihre Referenzen, sodass jene Zeilen nicht re-rendern. UI-Features laden, fehlschlagen und werden als unabhängige Plugins deaktiviert — ein crashender Slot-Entry schwärzt eine Karte, ein fehlgeschlagenes Bundle schlägt laut fehl, bevor die UI umkippt. Die akzeptierten Kosten: Die Loader-/Modultabellen-Maschinerie ist maßgeschneiderte Infrastruktur, die das Team Ende-zu-Ende besitzt; der One-Flip-Boot (kein progressives Rendering) tauscht First-Paint-Granularität gegen Assembly-Einfachheit; und die dualen Typ-Programme machen „welches Aggregat sieht diese Datei" zu einer Frage, die Entwickler gelegentlich beantworten müssen.

## Erwogene Alternativen

| Abgelehnt | Ein-Zeilen-Begründung |
|---|---|
| Ein statisch gelinktes SPA-Bundle | Plugins müssen zur Laufzeit Host-komponierbar sein (config-getrieben); ein Monolith rekoppelt jedes UI-Feature an einen Build |
| window-Globals / Import-Maps für geteilte Deps | Die DI-Require-Tabelle hält Sharing explizit, laut-fehlschlagend und austauschbar; Globals leaken Identität und Version still |
| Business-Daten in Zustand-Slices | Das Event-Fenster/die Akkumulation ist eine verhaltenssteuernde State-Machine, kein flaches Slice; die Objektschicht hält Snapshot-Granularität und Batching kontrollierbar |
| Parallele string-keyed Komponenten-Registry für Tool-Zeilen | ui-tools keyed Child-Slot trägt die runtime-offene Tool-Namen-Menge durch das eine Slot-Registrierungsmodell ([Toolview-Auflösung](../../archived/architecture/2026-07-23-toolview-dissolution.md)) |
| Progressive-/Suspense-Boot in der initialen Web-Client-Lieferung | One-Flip-Boot ist strikt einfacher; das Per-Plugin-Status-Face des Loaders bleibt erhalten, sodass progressives Anleuchten später ohne Re-Architektur landen kann |
