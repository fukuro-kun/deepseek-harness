# Agent Note: Web-Client-Agent-Scope-Parity-Modell und der Provisioning-Channel (agents/scope / Blank-Reuse / provide)
[English](2026-07-25-web-client-session-scope-and-provide-channel.md) | [中文](2026-07-25-web-client-session-scope-and-provide-channel.zh.md) | Deutsch

Status: implemented


> Arbeitsteilung: der Client-Agent-Scope (actx) und gezielte Events, das Client/Host-Materialisierungs-Parity-Modell, das Blank-Session-Bit und Reuse (`connectWorkspace`), der Per-Session-Provisioning-Channel (`sessions.provide`) und die Host-Wire-Kleinteile, die diese Capabilities tragen (die Summary-`blank`-Spalte, das `host/session-added`-Frame-Feld und der `host/commands-changed`-Frame). Die Input-State-Machine und die Slash-Pipeline leben in der [Input-Machine-Note](../../archived/architecture/2026-07-25-web-input-machine-and-slash-pipeline.md); die Command-Business-Flächen leben in der [Command-Surfaces-Note](../../archived/architecture/2026-07-25-web-command-surfaces-and-assembly.md).

## Problem

Der Web-Client hatte eine einzige globale Session-Fläche: Slots renderten alle aus dem Root-Context, sodass Plugins keine Vorstellung von „welcher Agent/welche Session ist aktuell" hatten; die wahre Kopie des Drafts lag vergraben im Session-Objekt, sodass jedes Plugin, das am Input teilnehmen wollte, keinen Einklinkpunkt hatte. Um ein Command/Input-System zu tragen, musste die Plattformschicht zuerst beantworten:

- Wer besitzt Session-Interaction-State (Menüs, Popups, Drafts, In-flight-Requests), und wie zwei Sessions strukturell isoliert sind;
- was eine „neue Session" ist, bevor die Host-Entität existiert — ob der Client ihr ein unabhängiges Leben fälschen muss;
- wie Session-Scope-Komponenten ihre eigenen Session-Daten fetchen statt Props, die Ebene für Ebene heruntergereicht werden;
- was eine vom User verlassene neue Session auf der Host-Seite hinterlässt und wer sie einsammelt.

Harte Constraints: Der Host ist die einzige Source of Truth; jede Registrierung läuft über einen `ctx.effect`-Disposer; der Scope-Mechanismus matcht die Agent-Scope-Architektur des Hosts; Model-sichtbar ⟺ bereits im Session-Log.

## Entscheidung

### Das Parity-Modell: Client und Host teilen eine Root-State-Achse

Host-seitig produziert `session.create(workspaceId)` Session + Agent + cwd in einem Stück (ein atomares Bündel, nie geteilt); die Client-Seite ist der Spiegel jener Geburt — in dem Moment, in dem eine Session-Zeile in den List-Mirror eintritt, minted der Client seinen Agent-Scope (actx + provide + die volle Input-Fläche gemountet):

- Session-Identität ist ab Geburt die wahre Form des Hosts: Die SessionId trifft über die `session.create`-Response / den `host/session-added`-Frame ein, und jede Client-seitige Adresse (das Scope-Tag, Slot-Store-Keys, RPC-Adressierung) nutzt dieselbe Id.
- Der Materialisierungsmoment = der Moment, in dem der User ein Workspace pickt (cwd settled): Der Client ruft vor Ort `session.create({workspaceId})` und erhält die vollständige Entität.
- „New Session ohne gepicktes Workspace" ist ein **reiner View-State** (eine Navigationsposition), der keiner Session/Scope-Entität entspricht; bis zum Pick ist der Composer als Ganzes gesperrt (kein Slash, kein Plain-Text).
- Eine „Blank-Session" ist schlicht eine gewöhnliche materialisierte Session, deren Log noch leer ist; für jedes Agent-Scope-Plugin auf dem Host (goal/plan/skill/…) ist sie von jeder Session ununterscheidbar, sodass Slash/Plan alle natürlich live sind.

### Agent-Scope: Der actx ist der alleinige Session-Träger in der Client-seitigen Cordis-Welt

Das `agents/scope.ts` der Runtime matcht das `dsh-scope` des Hosts auf Mechanismus-Ebene (Fiber + Tag + Filter; kein Value-Import: Das Host-Package trägt den Scoped-Events-`Events`-Merge, der mit dem Context-Merge innerhalb des Client-Programms kollidieren würde):

- `createScope(ctx, key)`: ein No-op-Plugin-Fiber plus `extend({[kScope]: key, [Context.filter]: …})` — der Filter lebt direkt am actx: Ungetaggte Listener empfangen global, getaggte empfangen nur ihren eigenen Scope.
- Dispatch ist die Cordis-Primitives mit thisArg = dem actx selbst: `actx.bail(actx, event, req)` / `actx.emit(actx, event, payload)`.
- `Session.bindScope(actx)`: exakt einmal gepaart, wenn Resolve den Scope minted (Rebinding wirft; dropScope unbindet), spiegelt das `Agent.loopCtx` des Hosts — die Session nutzt ihn, um ihre eigenen Scoped-Events zu dispatchen. Die umgekehrte Richtung actx→Session ist ein Hop über `sessions.sessionOf(actx)` (spiegelt den `agent.session`-Gebrauch von Host-Plugins).

Drei bewusste Divergenzen vom Host-dsh-scope:

- Der Filter lebt am actx selbst statt an einem separaten Träger: Der Host-Wrapper-Layer guardet das Business-Agent-Subjekt gegen Driften vom Scope-Key (Host-Events injizieren den Agent selbst als erstes Argument), während Client-Event-Payloads nur eine Id tragen — es gibt kein Subjekt zu schützen.
- Keys vergleichen per gebrandmarktem `SessionId`-Wert statt Objektidentität: Auf dem Host gilt agent.id === session id (1:1 auf derselben Achse), Agent-Identität reused direkt das `SessionId`-Brand, und die Identität eines Client-Scopes ist seine Wire-Id.
- Der Client-Scope ist ein **Agent-Identity**-Scope, kein Live-Object-Scope: Während einer Cold-Session ist das Host-Agent-Objekt bereits disposed, während der Client-actx (in View) am Leben bleibt — die Identitätsachse ist in strikter Parität, während Object-Hot/Cold bewusst unsynchronisiert ist.

id→ctx-Handoff ist nur an drei Arten von Stellen erlaubt (Business-Provider übergeben nie):

- Slot-Inject-Factories: Der ctx tritt nie in den Render-Layer ein; die Identität, die das Slot-Framework einer Komponente reicht, ist die SessionId, über Service-Maps zurück in Objekte/Controller getauscht.
- Root-Koordinations-Services-Self-Adressierung: von der SessionId einer Projection zurück zum actx via `sessions.scope(id)`.
- Root-ungetaggte Listener: ihren eigenen Store anhand der SessionId des Payloads nachschlagen.

### Scope-Lifecycle: am List-Mirror verankert — Geburt ist Eintreten in View, Tod ist Prune

Session-Instanzen teilen den Scope-Lifecycle; Liveness-Eligibility = Host-gelistet (ein Kriterium, geteilt von Mint und Prune):

- Geburt = eine Session-Zeile tritt in die Client-View ein (der List-Baseline-Pull / das lokale `create()`-Echo / der `host/session-added`-Frame); ein lazies First-Resolve minted den Scope (Resolution ist eine reine Funktion, render-safe).
- Ein Prune reißt drei Dinge gemeinsam ab: die Session-Instanz, den Scope-Fiber (kaskadierend durch jeden Consumer, der am actx hängt) und den Session-keyed Slot-Store. Die gestagte Session (= `list.current`) ist die Ausnahme: Wird sie entfernt, während sie noch auf der Stage steht, behält sie eine gefrorene Read-only-View, erst abgerissen, sobald die Stage weiterzieht.
- Wiederöffnen = die Instanz lazy neu bauen + `open()` pullt History (das Host-Session-Log ist die durable Wahrheit).
- Verbleibender TODO: Approval/Question-Frames treten nie in History ein und können über einen Prune hinweg nicht zurückgewonnen werden (die Manager-ebenen pendingBuffers decken nur das nie-instanzierte Fenster ab).

### Das Blank-Bit: die sichtbare Projection, Konversion und Reuse der leeren Session

Eine Session „materialisiert, aber ohne ersten Prompt" wird vom Summary-abgeleiteten Bit `blank` governed (eine abgeleitete Spalte, kein Header-Feld; SessionHeader bleibt immutable):

- Das Host-Kriterium: `session.seq === 0` (null Log-Events = noch keine User-Message). Eine Live-Session liest `summarize()` direkt aus dem Memory; eine Cold-Session ist immer `false` — der Lazy-Create-Contract des JSONL-Providers garantiert, dass eine nie-appended Session nie in `persistence.list()` eintritt, sodass Blank nie Disk berührt.
- Der Wire trägt es an zwei Stellen: die required `SessionSummary.blank`-Spalte und das required `blank`-Feld am `host/session-added`-Frame (bei Erzeugung immer true, sodass andere Tabs denselben Blank-Session-State in ihre Mirrors eintragen können).
- Der Client-Mirror senkt nur, hebt nie (monoton), aus drei Quellen umgeflippt, alle reusing bestehender Wire-Signale:
  - Der eigene Tab des Senders: Die **erfolgreiche Response** zum ersten `prompt()` flippt auf false (Acceptance beweist, dass die user/message bereits im Host-Log ist — dieser Flip ist Bestätigung, kein Optimismus; `onEngaged` aktualisiert synchron den List-Mirror, konvertiert die aktuelle `New Session`-Zeile in-place zu einem gewöhnlichen Titel, fügt keine List-Row hinzu). Ein rejected First-Prompt hält die Session blank: aligned mit Host-Authority, weiterhin als `New Session` gezeigt, behält ihre connectWorkspace-Reuse-Eligibility, solange sie ein Workspace-Mitglied bleibt.
  - Andere Tabs: Der `host/session-status (running:true)`-Frame flippt es — eine Blank-Session läuft nie, sodass das erste Running notwendigerweise nicht-mehr-blank bedeutet;
  - Reconnect-Alignment: `session.list`s summary.blank ist autoritativ, sodass ein Tab, der Frames verpasst hat, beim nächsten Pull natürlich aligned; ein stale blank:true kann eine konvertierte Session nie zurück auf blank markieren.
- List-Disziplin: Der Store behält jede Zeile; das Grouping des Workspace-Browsers, Flat-View, Search und Counts teilen eine sichtbare Projection — jede non-blank Session zeigt sich, während Blank-Sessions nur die eine mit `session.id === sessions.current` zeigen, deren Titel auf `New Session` gezwungen wird. Nach einem Workspace-Wechsel bleibt die alte Blank-Entität im Mirror, ist aber in der Liste verborgen, während das aktuelle Blank des Ziel-Workspace zeigt; die User-sichtbare Fläche hält daher global höchstens eine Blank-Row.
- Das Residue-Ledger nimmt null GC: Nach einem Refresh kommen Blank-Sessions mit intaktem Bit zurück und werden beim nächsten Same-Workspace-Connect reused, solange sie Mitglieder bleiben, sodass der gewöhnliche Single-Tab-Pfad höchstens eine pro Workspace hält; nach einem Host-Restart hinterlassen Blanks keine Disk-Spur und verdampfen schlicht; die extra leeren Shells aus Multi-Tab-Races werden nur zu non-current verborgenen Rows, verdaut durch spätere Reuse, ohne Koordination.

### connectWorkspace: der alleinige Entry-Point von New Session

`workspaces.connectWorkspace(workspaceId): Promise<SessionId>` (im Besitz von WorkspaceRuntime — es hält sowohl den kanonischen Workspace-Pfad als auch die Sessions-Referenz):

- Der Reuse-Arm: Der List-Mirror wird nach `blank && cwd == workspace.path && sessionIds.includes(id)` durchsucht — die eigene Membership-Regel des Hosts, nie cwd allein. Ein cwd-Match ohne den Account-Slot (eine CLI/TUI-Session, geboren am Host-cwd, oder eine gelöschte/neu-erzeugte Registrierung) würde eine Session öffnen, die keine Grouping-Fläche unter diesem Workspace zeigen kann, sodass er stattdessen in den Create-Arm fällt (siehe den [Membership-Reuse-Fix](../../archived/bug-fix/2026-08-05-workspace-blank-session-reuse-membership.md)); ein Hit gibt jene Id direkt zurück, erzeugt nichts.
- Der Create-Arm: Bei einem Miss gibt `session.create({workspaceId})` die neue Id zurück.
- Ein unbekanntes workspaceId failt laut (nie still woanders erzeugend).
- Die Resolution-Garantie (ein Contract für beide Arme): Wenn das Promise resolved, ist die zurückgegebene Id bereits im List-Store, und `sessions.binding(id)` resolved synchron — `SessionRuntime.create` projiziert die Liste synchron nach RPC-Erfolg, bevor es resolved, sodass ein Draft-Mover Text in die Machine des neuen Scopes schreiben kann, bevor open, ohne auf einen Notifier-Flush zu warten.
- Der Caller nimmt die Id und macht sein eigenes `sessions.open`; das Senden des ersten Prompts ist ein gewöhnliches `session.prompt` — die Session existiert bereits, ein Failure ist ein gewöhnlicher Prompt-Failure, der Draft-Text steckt noch in der Machine, und ein Retry ist schlicht erneutes Senden.
- Der globale New-Session-Button defaulted zu `recentWorkspaceId`: zuerst die `updatedAt` der neuesten Session jedes Workspace vergleichend, auf Workspace-`createdAt` zurückfallend, wenn er keine Sessions hat, und Host-Order bei Gleichstand bewahrend; nur mit gar keinem Workspace geht er per `sessions.clear()` in die No-Session-View. Create-Actions innerhalb einer Workspace-Gruppe treffen jenes Workspace weiterhin explizit.
- Beim Startup subskribiert die Runtime die erste vollständige Baseline: Eine erfolgreich restored Current-Session bleibt in Place; andernfalls ruft sie automatisch `connectWorkspace(recentWorkspaceId)` und öffnet die zurückgegebene Blank-Session. Die Policy settlt nur einmal; ein späterer User-initiierter Clear wird nie wieder durch Auto-Selection überschrieben, und ein Connect-Failure wartet auf die nächste Baseline-Projection zum Retry.
- Das erneute Picking des Workspace im Blank-Hero läuft ebenfalls über `connectWorkspace`; wenn die Ziel-Id von der aktuellen abweicht, zieht der nicht-leere Draft der aktuellen Input-Machine zuerst zum Ziel-Scope, dann `sessions.open(nextId)`. Die alte Blank-Entität wird nicht gelöscht — sie verlässt die Liste lediglich dadurch, dass sie nicht mehr current ist.

### Per-Session-Provisioning: der `sessions.provide`-Standard-Kit-Channel

Der alleinige Provisioning-Pfad, über den Session-Slot-Komponenten ihre eigenen Session-Daten fetchen. Plugins deklarieren eine feste Key-Map über den statischen Descriptor `sessions.provide({hooks, props, resolve})` (ein Duplicate-Key wirft bei der Registrierung); `resolve(binding)` materialisiert Values für eine spezifische Session und reißt sie mit dem Scope ab. ui-renderers `standardKit`-Single-Loop bindet das Hooks-Compartment zu `use<Name>`-Selector-Hooks (`observableHook`→uSES, Anti-Tearing) und reicht das Props-Compartment as-is durch.

Slot-Scope ist die geschlossene Menge `root | session-maybe | session`:

- `root` empfängt nur das globale Standard-Kit, ohne Session-Identität oder Provisioning.
- `session-maybe` folgt der aktuellen Session mit ADOPTION-Identität (das einzige Verhalten — es gibt keinen Hold-Identity-Forever-Modus): Eine Session-los geborene Incarnation behält ihre React-Instanz über das Eintreffen der ERSTEN Session hinweg (die Blank-Shell adoptiert sie — kein Remount, das DOM überlebt) und verhält sich von da an exakt wie ein strikter Session-Entry — der Wechsel zu einer anderen Session remountet, und der Rückfall zu No-Session remountet in eine frische Blank-Incarnation, die wieder adoptieren wird. Komponenten-lokaler Per-Session-State cleart daher by construction; State, der einen Wechsel überleben muss, gehört in Session-gebundene Quellen (Machine, Store, Hooks). Ohne Session können `sessionId`, die Ergebnisse von `useSession`/`useInput` und `inputActions` alle absent sein. Der unkeyed Root-`SessionMaybeProvider` treibt diese Updates, indem er die atomare `currentProvide`-Projection der Runtime subskribiert — Selection-Moves und Provider-Roster-Änderungen publizieren über dieselbe Source, sodass eine Roster-Änderung unter einer stabilen Current-Id das gemountete Bündel republiziert, statt Entries auf einem obsoleten Hook/Prop-Schema zu stranden — während `SessionMaybeProvideInfo` die statische Key-Map nutzt, um die vollständige Hook/Prop-Form auch ohne Session zu behalten; die Per-Entry-Adoption-Bookkeeping (Incarnation-Counter-Key) lebt im `SessionMaybeEntry` des Renderers.
- `session` garantiert, dass `sessionId`, jede Hook-Source und jeder Prop existieren; die Error-Boundary jedes strikten Entrys ist per `sessionId` gekeyt, sodass Session-Wechsel jenes Entry und seinen Session-Store neu erzeugt.

`conversation` ist die residente `session-maybe`-Shell: `ConversationRoot`, HeroShell, der Workspace-Picker, der Root-eigene Scrollport und Composer-Stack und der Fallback-Frame der Overlay-Chain behalten ihre React-Instanzen über den No-Session → Blank-Session-Wechsel hinweg. Zwei strikte Entries füllen fixe Regionen, ohne jenen Baum umzuparenten: `conversation.session.header` trägt Breadcrumb/Tabs/Actions über dem Scrollport, während `conversation.session` den View-Ring und den Draft-Mirror darin trägt; beide teilen denselben Session-scoped Chat-Store. Die Composer-Bar (`conversation.composer.bar`) ist selbst `session-maybe`: Ohne Session sind ihre Machine-Faces und Message-Actions inert, während die ganze gestrichelte Karte den bestehenden Workspace-Picker per Pointer öffnet und ihre Read-only-Textarea dasselbe über Enter oder Space tut. Dieselbe Instanz — Textarea eingeschlossen — geht live, wenn eine Session erscheint; die übrigen Input-Slots bleiben strikt `session` und dispatchen bis dahin nichts. Der Blank → Engaging/Active-Übergang rebuildet die InputBar nie bei einem Phase-Flip.

- Der erste Built-in-Entry der Runtime: der `'session'`-Hook — `useSession` selbst reitet denselben Mechanismus, kein Special-Casing.
- Concurrent-Disziplin: Die Render-Ebene liest nur aus dem Hooks-Compartment (uSES-Konsistenzgarantie); Props-Compartment-Callbacks werden nur im Event-Handler-Raum benutzt; Descriptor-Resolution ist render-safe (idempotentes Caching, wobei Prune Residuen aus verlassenen Renders erntet).
- Third-Party-Komponenten nehmen null Value-Dependencies; Types sind ein Ein-Zeilen-Type-only-Import (Declaration-Merging in `SessionStandardProps` / `SessionMaybeStandardProps`).

### Der Read-only-Queue-Mirror

- Queue-Semantik: Running sperrt Input nicht; gewöhnliche Messages queuen über `session.prompt {mode:'queue'}`, und Commands queuen nie.

### Host-Wire-Kleinteile

- Die Summary-`blank`-Spalte und das `blank`-Feld des `host/session-added`-Frames (siehe das Blank-Bit oben).
- Der SSE-Frame `host/commands-changed` (ein reines Invalidation-Signal); der Client routet ihn in die typisierten Events `commands/changed` und `connection/reset` (broadcast nachdem jede Connection-Generation etabliert ist; Wire-derived-Caches behandeln früheren State uniform als stale). Der Commands-Frame und sein typisiertes Client-Event wurden später durch verbatim-Forwarding von `commands/change` über `ctx.remote.$on` ersetzt ([Forwarded-Remote-Events](2026-08-10-remote-event-delivery.de.md)); `connection/reset` ist unverändert, und der Invalidation-not-Diffing-Contract, den dieser Bullet benennt, gilt weiterhin.
- `command.list/execute` und `skills/list` sind uniform per `sessionId` single-adressiert (eine Session hat immer einen Agent; `agentFor`s Resume-Semantik kommt fertig mit); das Command-Surface-Narrativ lebt in der [Command-Surfaces-Note](../../archived/architecture/2026-07-25-web-command-surfaces-and-assembly.md).
- Die `session.create`-Request-Form: workspaceId/cwd als Entweder-oder, plus eine optionale Caller-vorallokierte SessionId (ein Same-Id-Same-cwd-Retry ist idempotent; ein anderer cwd reportet `session-conflict`).

## Erwogene Alternativen

| Abgelehnt | Ein-Zeilen-Begründung |
|---|---|
| Ein Client-lokales Intent + Materialize (published CAS / die pendingPrompt-Attach-Transaktion / die Before-Create-Kette) | Der Client wird gezwungen, die erste Halbwertszeit zu simulieren, die dem Host fehlt, und züchtet einen Haufen State-Machinerie — published CAS, die Attach-Transaktion, partielle Publikation |
| Host-reservierte IDs (eine Draft-Map) | Der Host acknowledged nur eine Nummer; die State-Machine bleibt unberührt auf dem Client |
| Eine Host-Draft-Session (eine Session ohne Agent) | Jede Host-Fläche, die den Agent nachschlägt, müsste für Drafts forken; Core bräuchte ein `attachAgent`-API plus late-written Header-cwd |
| Einen Agent vor cwd binden (ungegruppiert) | Kippt die Readonly-Header.cwd-„created in"-Invariante um, plus die Launch-Dir-Side-Effect-Produktfalle |
| Session-Context über React Context nach unten reichen | Plugins sollten ein mentales Modell über Host und Client hinweg halten; der Scope-Mechanismus ist isomorph zum Host-dsh-scope |
| Ein `scopeTarget`-Carrier + fused Dispatcher (spiegelt das Host-`agentEvents`) | Der Host-Wrapper-Layer guardet das Business-Agent-Subjekt gegen Driften vom Scope-Key; Client-Events haben kein Subjekt zu guarden — der Filter am actx plus Cordis-Primitives deckt jedes Bedürfnis |
| Sessions ohne ctx (eine Cordis-freie Objektschicht) | Eine rote Linie, nur geboren, damit die Filtering-Unit-Tests Cordis nicht importieren, zum Preis von Two-Hop-Contribute-Callbacks plus mutablen Public-Fields; der Host-Agent hält bereits loopCtx |
| Residente Session-Instanzen (resident-instance) | Das Host-Session-Log ist die durable Wahrheit; Residency ist bloße Identitäts-Bequemlichkeit, und ihre Misalignment mit dem Scope-Lifecycle ist eine Komplexitätsquelle |
| Komponenten, die Wiring-Callback-Bundles empfangen (Two-Layer-inject→props-Pass-down) | Der Standard-Kit-Channel lässt Komponenten ihre eigenen fetchen; das Public-API konvergiert zu Hooks + stable Props |
| Die No-Session-Hero-View gegen die gesamte Session-Conversation tauschen | Selbst bei unverändertem äußerem Layout würden die Hero-, Picker- und Composer-Subtrees gemeinsam remounten und die ganze UI-Region springen lassen |
| InputBar selbst zu `session-maybe` machen | Die Input-State-Machine, die Keyboard-Command-Fläche und Actions müssten alle absent Values akzeptieren; nur den disabled Input-Body zu ersetzen hält Optionalität an der Shell-Boundary |
| Ein dedizierter Conversion-Frame | `session-status(running:true)` impliziert semantisch Conversion (eine Blank-Session läuft nie); ein Frame mehr kauft null Information für einen weiteren Wire-Typ |

## Konsequenzen

- Plugins gewinnen Session-Context isomorph zum Host: Per-Session-State hängt am actx und mountet/reißt ab in einem Stück mit dem Scope-Fiber, was Leaks strukturell unmöglich macht; Two-Session-Isolation ist durch den Scope-Filter strukturell garantiert.
- Die Client-Objektschicht konvergiert zu einem Wire-Mirror: Session-Identität, Lifecycle und Capability-Adjudication deferieren alle an die Host-Entität — das Input-System (die nächste Schicht) steht immer einer Session mit echtem Agent gegenüber, und Provider wie Slash/Skill adressieren uniform direkt per sessionId.
- Blank-Session-Governance nimmt null dedizierte Mechanismen: State reitet auf einem abgeleiteten Bit, Sichtbarkeit reitet auf der unified List-Projection (nur das aktuelle Blank zeigt, als `New Session`), Reclamation reitet auf dem bestehenden Contract von Lazy-Persistence (Verdampfen beim Restart), und die gewöhnliche Obergrenze reitet auf Same-Workspace-Reuse.
- Der Preis: Die id→ctx-Handoff-Disziplin und provides Concurrent-Disziplin sind Konventionen statt Type-erzwungen, gepinnt durch Review und Tests. Die einzelne State-Achse verweigert Machine-Faces weiterhin, bis eine Session existiert; die [residente Conversation-Shell](../../../../packages/client/ui-conversation/README.de.md) routet Aktivierung während dieses Intervalls zum Workspace-Picker.
- Bekannte Lücken: Approval/Question-Recovery über Prune hinweg (TODO); Model-Selection kehrt in Live-Mutation-Form zurück (das Host-`selectModel`-Trio ist fertig, sein Client-Consumer noch nicht gebaut).
