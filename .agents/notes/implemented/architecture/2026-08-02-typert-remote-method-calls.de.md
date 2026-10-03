# Agent Note: Typert Gateway gezielte Methodenaufrufe

Status: implemented

[English](2026-08-02-typert-remote-method-calls.md) | [中文](2026-08-02-typert-remote-method-calls.zh.md) | Deutsch

## Problem

Der Host API Proxy behandelte direkte Methodenaufrufe, zustandsbehaftete Interaktionen und Session-Event-Streams in einem Package. Diese Belange haben unterschiedliche Lebenszyklen, Routing-Semantiken und Client-Programmierschnittstellen. Alle Geschäftsoperationen weiterhin über ein Package zu exportieren, würde Geschäfts-Services, Transportprotokolle, Zustandsautomaten und Client-Typen koppeln.

Diese Entscheidung betrifft nur gezielte Methodenaufrufe, bei denen ein Request ein Ergebnis erzeugt. Zustandsbehaftete Interaktionen wie Permission und Approval sowie Session-Event-Streams bleiben eigene Designs.

Der Vertrag eines direkten Methodenaufrufs gehört dem Geschäfts-Service, der ihn implementiert. Geschäftsentwickler deklarieren nur, welche Methoden remote aufrufbar sind, ohne zusätzlich eine zentrale API-Schnittstelle, Routing-Tabelle, Parameterkonvertierungstabelle, Client-Stub und ein Zod-schema pflegen zu müssen.

Host und Browser-Client nutzen getrennte TypeScript-Programme, weil jede Seite den Cordis-`Context`-Typ anders erweitert. Eine Remote-Projektion darf weder die kompletten Host-Deklarationen in einen Konsumenten importieren noch von Browser-spezifischen Typen abhängen. Wenn das TUI diese Programmierschnittstelle später wiederverwendet, darf es ebenfalls nur als Remote markierte Methoden sehen. TUI-Integration liegt außerhalb des aktuellen Scopes, aber die Implementierungsgrenze muss diese isomorphe Wiederverwendung bewahren.

## Entscheidung

Ein Geschäfts-Service erweitert `TypertRemoteService` und deklariert aufrufbare Methoden mit `@Remote` oder `@RemoteScope()`. Ein Service, der bereits eine andere Basisklasse hat, kann stattdessen dieselbe Bindung über `bindTypertRemote()` exponieren. Typert erzeugt aus dem Host-Programm das Host-lokale Reflexionsartefakt und eine plattformunabhängige Remote-Konsumenten-Projektion. Das Client-Programm erzeugt weiterhin unabhängig sein eigenes lokales Reflexionsartefakt.

Die Remote-Konsumenten-Projektion enthält `.d.ts`-, `.d.ts.map`- und `.js`-Dateien. Die `.d.ts` exponiert nur mit einem Remote-Decorator markierte Methoden und verweist auf die einzelnen öffentlichen Typsymbole des Geschäfts-Packages. Die `.d.ts.map` navigiert Konsumenten-API-Methoden zurück zu ihren Host-Geschäftsmethoden-Implementierungen. Die `.js` trägt Endpoint-, Parameter-, Context- und Zod-Informationen für denselben Vertrag. Auf der Assembly-Ebene mountet der Browser-Client die benötigten Remote-JS-Beiträge auf den Client-Remote-Service. Projektion und Remote-Abstraktion bleiben plattformunabhängig, sodass ein künftiges TUI sie wiederverwenden kann.

`@deepseek-ai/dsh-api-gateway` unter `packages/api/gateway` bietet zwei symmetrische Gesichter: Sein Default-Entry stellt Host-seitig `ctx.typertGateway` bereit, sein `/client`-Entry das konsumentenseitige `ctx.remote`. Jede Seite konsumiert einen lokal erzeugten `InvocationDescriptor` aus demselben Modell; Descriptors werden nicht über die Leitung geschickt. Das Remote-Datenprotokoll läuft über Connections geteilten `/api`-RPC-Kanal. Die Geschäfts-Aufrufschnittstelle ändert sich nicht, wenn Connection von HTTP auf WebSocket migriert.

`@deepseek-ai/dsh-api-remotes` unter `packages/api/remotes` ist die BFF-Schicht über dem Gateway. Sein Host-Entry registriert die weitergeleitete Cordis-Event-Quelle der Anwendung und die Host-Fakten, die generation readiness trägt; sein `/client`-Entry wählt die generierten Remote-Beiträge aus, die die Anwendung exponiert. Der Client-Entry konsumiert den geteilten `TypertClientRemote`-Vertrag über Cordis statt die konkrete Gateway-Implementierung zu importieren.

## Komponenten und Cordis-Services

| Komponente | Cordis-Service | Verantwortung |
|---|---|---|
| `@deepseek-ai/dsh-typert-protocol` | Deklariert nur das minimale `ctx.typert`-Protokoll | `TypertRemoteService`, Decorators, Binding-Fallback, Descriptors, Lookup/Context und die Remote-Map; keine Abhängigkeit von Compiler, Zod, Connection oder Browser |
| Typert registry | `ctx.typert` | Speichert getrennt die Reflexion der aktuellen Umgebung, importierte Remote-Beiträge, Lookup-Provider und Context-Provider |
| Typert generator/loader | Kein neuer Geschäfts-Service | Erzeugt drei Arten von `lib`-Artefakten aus den Host-/Client-Programmen und registriert die Artefakte der aktuellen Umgebung bei `ctx.typert` |
| Host-Gesicht des API Gateway | `ctx.typertGateway` | Assoziiert Host-Definitionen mit live Services, dekodiert Parameter, löst Receiver auf, ruft Methoden auf und kodiert Ergebnisse |
| Connection | `ctx.connection` | Besitzt exklusiv den HTTP-Server/künftigen WebSocket, die geteilte `/api`-Route, RPC-Envelope, rpcId, Serialisierung, trust, Fehlertransport, Typert-Interception und owner-registrierte exakte Fetch-Routen auf demselben Kanal |
| Client-Gesicht des API Gateway | `ctx.remote`, `ctx.remote.<namespace>` | Mountet Remote-Beiträge, materialisiert jeden Namensraum als getrackten `remote.<namespace>`-Kind-Service und delegiert kanonische Aufrufe an `ctx.connection.rpc` |
| API Remotes | Kein neuer Service | Besitzt die Host-Agent/Session-Lookup-Policy und dient als einzige Client-Geschäftsfassade; wählt `/remote`-Beiträge aus und mountet sie, während die ausgewählten API-Deklarationen exponiert werden |
| Agent/Session-ownende Packages | Bestehende Domänen-Services | Stellen sowohl statische Interface-Merges als auch Runtime-Lookup/Context-Provider bereit |
| Geschäfts-Packages wie Goal | Bestehende Geschäfts-Services | Deklarieren nur Bindings, Remote-Methoden und kanonische DTOs und exportieren den generierten `/remote`-Subpath |

Das Host-Gateway hängt nicht von konkreten Implementierungen von `ctx.agents`, `ctx.sessions`, `ctx.goals` oder `ctx.webServer` ab. Der Client-Remote versteht den physischen Träger nicht, und Connection versteht Goal, Agent, Lookup, `InvocationDescriptor` oder Remote-Namensräume nicht.

## Geschäftsdeklarationen

Gewöhnliche direkte Aufrufe nutzen `@Remote`. Wenn Parameter und Ergebnis einer bestehenden Methode bereits der beabsichtigte Remote-Vertrag sind, wird diese Methode direkt dekoriert, ohne sie umzubenennen. Einen `remoteExport*`-Adapter nur dann hinzufügen, wenn der Wire-Vertrag eine eigene Request- oder Result-Form braucht, und über das Decorator-Argument seinen kurzen API-Namen deklarieren. Eine Methode deklariert jedes benötigte Geschäftsobjekt explizit in einer Top-Level-Parameterposition:

```text
export class GoalService extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'goals')
  }

  create(agent: Agent, request: CreateGoalRequest): GoalView {
    // Existing business method remains unchanged.
  }

  @Remote('create')
  remoteExportCreate(agent: Agent, request: CreateGoalRequest): CreateGoalResult {
    const view = this.create(agent, request)
    return { ref: { id: view.id, revision: view.revision } }
  }
}
```

`goals` ist der explizite an `super()` übergebene Cordis-Service-Key und der Default-Wire-Namensraum. Eine `namespace`-Option als drittes Argument nur dann übergeben, wenn der Protokoll-Namensraum tatsächlich vom Service-Key abweichen muss.

`@RemoteScope()` verwenden, wenn der Service-Receiver innerhalb einer isolierten Art von Context aufgelöst werden muss. Scope-Identität geht nicht in die Parameter der Geschäftsmethode ein:

```text
export class ScopedGoalService extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'goals')
  }

  @RemoteScope('agent', 'create')
  remoteExportCreate(request: CreateGoalRequest): Promise<CreateGoalResult> {
    // Runs against the goals service resolved from the Agent Context.
  }
}
```

Ein Endpoint wählt genau einen Aufrufmodus. Ein Fluss, der einen expliziten `Agent`-Parameter braucht, nutzt `@Remote`. Ein Fluss, der zuerst in einen Agent-Context wechselt und dann einen gescopten Receiver auflöst, nutzt `@RemoteScope('agent')`. Typert leitet keinen der beiden Modi aus dem Methodenkörper oder einem fehlenden Parameter ab.

Geschäfts-Packages hängen nur vom leichtgewichtigen `@deepseek-ai/dsh-typert-protocol` ab. Es stellt `TypertRemoteService` und Deklarationsprotokolle für Decorators, den Binding-Fallback, Lookup, Remote Scope und Descriptors bereit, ohne vom TypeScript-Compiler, Zod, HTTP oder der Client-Laufzeit abzuhängen.

Eine Methode, die kooperative Abbruchunterstützung bietet, deklariert `signal: AbortSignal` als letzten Host-Parameter. Dieser reservierte Parameter ist weder Geschäftswert, Lookup noch JSON-Feld. Die generierte Konsumentenmethode exponiert ihn als letzten optionalen Parameter; gewöhnliche Aufrufe bleiben also unverändert, während Aufrufer, die Abbruch besitzen, ein signal übergeben können.

## Decorators und die explizite Gateway-Facette

Ein Decorator sagt nur aus, dass eine Methode am Remote-Vertrag teilnimmt. Er führt keine Runtime-Typreflexion aus und injiziert kein verstecktes Symbol in einen Service-Konstruktor. Die Argumente von `@Remote('create')` und `@RemoteScope('agent', 'create')` sind externe Methodennamen; das dekorierte Mitglied kann die Geschäftsmethode selbst oder ein Adapter wie `remoteExportCreate` sein. Der Mitgliedsname wird nur dann zum externen Methodennamen, wenn kein Alias angegeben ist. `TypertRemoteService` zu erben ist die normale explizite Deklaration, dass ein Service dem Gateway beigetreten ist; sein public-readonly-`typertGateway`-Feld hält die Bindung auf der Runtime-Instanz sichtbar.

Im SRC-Modus zeichnet der Decorator Methodenname und Aufrufmodus in einem versionierten Descriptor auf dem Service-Prototyp auf. Der Descriptor nutzt einen stabilen String-Property-Namen, sodass `remoteMethods()` Marker lesen kann, die eine andere installierte Kopie von `dsh-typert-protocol` erzeugt hat; er schreibt nichts auf Service-Instanz, Konstruktor oder Methodenfunktion.

Im LIB-Modus führt der Typert-Compiler strikte Methodenentdeckung, Typauflösung und Descriptor-Generierung durch. Er akzeptiert einen literalen Service-Key im direkten `super()`-Aufruf von `TypertRemoteService` oder den expliziten Binding-Fallback; die Generierung schreibt weder Geschäftsquellcode um noch injiziert sie versteckte Registrierungsmetadaten.

## Lookup- und Remote-Scope-Registrierung

Das Gateway hat keine eingebauten Verzweigungen für Agent, Session oder andere Geschäftsobjekte. Jedes objekt-ownende Package stellt sowohl eine statische Deklaration als auch einen Runtime-Provider bereit:

```text
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertLookupMap {
    agent: TypertLookup<Agent, SessionId>
  }
}

ctx.typert.lookups.register('agent', {
  parameter: 'agent',
  wire: 'agentId',
  resolve: sessionId => resolveAgent(sessionId),
})
```

Die statische Deklaration sagt Typert, dass `Agent` auf der Leitung `SessionId` entspricht. Der Runtime-Provider löst eine `agentId` in einem Request zum aktuell lebenden `Agent`-Objekt auf. Fehlt eine der beiden Seiten, schlägt der LIB-Build oder die früheste auflösbare Runtime-Registrierung sofort fehl.

Lookup-Objekte wie Agent und Session dürfen jeweils nur eine Top-Level-Parameterposition besetzen. Ein gewöhnlicher JSON-Request kann als weiterer vollständiger Parameter übergeben werden, aber dieses Design unterstützt weder `request.agent`, Objekt-Destrukturierung, Arrays von Objekten, verschachtelte Lookups noch das Durchsuchen beliebig komplexer Strukturen nach IDs.

Remote Scope nutzt eine eigene merge-erweiterbare Map und Context-Provider. Das Agent-Package registriert einen `agent`-Provider, der den Agent-Context aus seiner Wire-Identität lokalisiert und den vom Descriptor benannten Service-Key aus diesem Context auflöst. Das Gateway kennt die interne Struktur eines Agent-Context nicht.

Der Client registriert ebenfalls einen `agent`-Context-binder. Der binder holt nur eine `SessionId` aus dem Context, in dem ein Aufruf stattfindet; er enumeriert weder Scopes noch kopiert er Methoden in jeden einzelnen. Ein Cordis-Service-Tracker bindet einen gescopten Namensraum automatisch an den aktuellen Agent-Context um.

## InvocationDescriptor

Typert, der permissive SRC-Parser, das Host-Gateway und der Client-Remote tauschen eine kanonische Beschreibung aus:

```text
InvocationDescriptor {
  id: '@deepseek-ai/dsh-goal#goals/create'
  service: 'goals'
  namespace: 'goals'
  method: 'create'
  implementation: 'remoteExportCreate'
  invocation: direct | { context: 'agent', wire: 'agentId' }
  scope?: { context: 'agent', wire: 'agentId' }
  parameters: [
    { name, wire, source: json | lookup, lookup?, codec }
  ]
  cancellation?: { parameter: 'signal' }
  result: codec
  sourceLocation
}
```

`method` ist der externe Kurzname, den Endpoint und Client-Remote verwenden; `implementation` ist der tatsächliche Mitgliedsname auf dem Host-Receiver. `implementation` darf entfallen, wenn beide Namen übereinstimmen. Ein `direct`-Descriptor behält die ursprüngliche Service-Instanz als Receiver. Ein Context-Descriptor nutzt zuerst den entsprechenden Context-Provider, um den gescopten Context zu finden, und löst dann den Receiver über den Service-Key des Descriptors auf.

Der strikte Generator schreibt `scope` nur, wenn eine direkte Methode genau einen Lookup-Parameter hat, eine `TypertContextMap`-Deklaration mit demselben Namen existiert und beide dasselbe Wire-Typsymbol verwenden. `scope.wire` muss genau diesen Lookup-Parameter benennen. Es erklärt, dass ein Konsument diesen Parameter aus dem Context füllen darf, in dem der Aufruf stattfindet, ohne Host-Receiver oder Endpoint zu ändern. Keine gescopte Projektion wird erzeugt, wenn es mehrere Lookups gibt, keine Context-Deklaration existiert oder die Wire-Typen nicht übereinstimmen; eine Typ-Mismatch ist ein Build-Fehler.

Die Parameterreihenfolge kommt aus der Methodensignatur. HTTP-Felder kommen aus Parameternamen oder Lookup-Deklarationen. Ein Abbruch-Descriptor reserviert nur die letzte `signal`-Position und hält sie außerhalb der benannten `args`; Connection oder ein direkter Gateway-Aufrufer liefert das tatsächliche signal. Das Gateway leitet weder optionale Felder, Context-Typen, Lookup-Typen noch fehlende Argumente aus Request-Inhalten ab, und es synthetisiert keine Geschäfts-Defaults.

Ein LIB-codec enthält ein Zod-schema und ein kanonisches `typeSymbol` aus „Package + öffentlicher Subpath + Exportname". Ein SRC-codec ist nur als `src-json` markiert. Wenn Host und Konsument in unterschiedlichen JavaScript-Realms laufen, hält jeder seine eigenen Zod-Instanzen, aber beide Sätze sind aus demselben Typert-Modell und denselben Symbolschlüsseln generiert.

Descriptors existieren nur in der lokalen registry jeder Seite. Die Leitung trägt nur den `/api`-Kanal, den Endpoint und die `{ args }`-Payload. Der Host nutzt seinen Descriptor zum Dekodieren und Aufrufen der Methode, während der Client seinen entsprechenden Descriptor zum Kodieren der Argumente und Validieren des Ergebnisses nutzt.

## Typert-Runtime-registry

```text
ctx.typert.local     Host or Client reflection for this process
ctx.typert.remotes   peer Remote contributions explicitly mounted by a consumer
ctx.typert.lookups   providers and composition policy from wire IDs to Host objects
ctx.typert.contexts  Host Context resolvers and Client Context binders
```

Jede Registrierung gibt einen disposer zurück, der dem Cordis-fiber des Aufrufers gehört. Das Mounten von Client-Beiträgen registriert Descriptor-Set und konkrete Methoden als eine owned Operation. Das Host-Gateway cached nur die Menge SRC-besessener Endpoint-Namen und verwirft sie bei jeder Änderung der Cordis-Service-Menge; es behält weder Descriptor, Service noch Provider. Der Aufruf löst alle live Objekte aus aktuellem State auf; das Entfernen einer strikten Definition, eines Services oder Providers macht den entsprechenden Aufruf also unverfügbar, ohne ein abgestandenes live Objekt zu hinterlassen.

Die Lookup-registry behält die stabile Wire-Deklaration, nachdem ihr live resolver entladen wurde. Das SRC-Parsing klassifiziert den Parameter weiterhin als Lookup, während der Aufruf mit `gateway/lookup-unavailable` fehlschlägt; die eingehende ID wird niemals als gewöhnliches JSON-Geschäftsobjekt umklassifiziert. Die erneute Registrierung desselben Keys mit anderem Parameter, anderer Wire- oder kanonischer Typsymbolik schlägt für die Lebensdauer dieses Typert-Service fehl.

Geschäftsobjekt- und gescopte-Context-Packages besitzen stabile Deklarationen und Default-Resolver über `lookups.register()` und `contexts.registerHost()`; die Host-Komposition liefert effekt-gescopte asynchrone Policies über `lookups.configure()` und `contexts.configureHost()`. Konfiguration darf der Provider-Registrierung vorausgehen, macht aber ohne einen live Provider keine Identität verfügbar; das Entladen der Konfiguration stellt den Default-Resolver des Providers wieder her. Der `ApiSessionAgentController` des Session-Controllers konfiguriert einen geteilten resolver für die `agent`- und `session`-Lookups und den `agent`-Host-Context: Live Agents werden wiederverwendet, gewöhnliche kalte Sessions werden automatisch resumt, konkurrierende Resumes werden per Session-ID dedupliziert, und der subagent-Ownership-Zaun gibt `session/agent-busy` zurück. Das `session`-Lookup gibt die Session des aufgelösten Agents zurück, während der `agent`-Host-Context dessen Context zurückgibt — alle drei Projektionen teilen also einen resume-Lebenszyklus.

Der Host-Root-Entry der registry trägt den kompletten `TypertRegistryContract`-Interface-Merge. Die von Host und Client geteilte registry-Implementierung lebt in einem separaten Modul ohne Umgebungsdeklarationen. Der `/client`-Entry der registry importiert nur jene geteilte Implementierung und läuft nicht durch den Host-Root-Entry; er kann also keine Host-Cordis-Deklarationen in das Client-Programm ziehen.

## Kanonische Typen, Symbole und Zod

Remote-Client-DTS kopiert weder Geschäfts-DTOs noch deklariert es strukturell identische Schattentypen neu. Es importiert Originalsymbole nur aus öffentlichen, rein typbezogenen Subpaths, die keine Host-Cordis-Merges tragen:

```text
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { CreateGoalRequest, CreateGoalResult } from '@deepseek-ai/dsh-goal/types'
```

Folglich verweisen `SessionId`, die Agent-Wire-ID, der Request und das Ergebnis in Host und Browser-Client auf dieselbe TypeScript-Deklaration. Ein künftiges TUI kann sie ohne einen zweiten Typsatz wiederverwenden. Go to Definition, Umbenennungen und Find References für ein DTO kehren zum einen Quellort des Geschäftstyps zurück statt an einer Kopie in einer generierten Datei zu stoppen.

Remote-Methoden selbst nutzen Declaration-Map-Navigation. Typert verankert `InvocationModel.location` am dekorierten Host-Methodennamen-Token und emittiert ein Source-Map-Segment auf der entsprechenden Property des Namensraum-Interface. Für einen adapter-gestützten Endpoint führt `typert.remote-client.d.ts.map`, nachdem der TypeScript-Editor `ctx.remote.models.list` zu seiner generierten Deklaration aufgelöst hat, zum `remoteExportList`-Einstiegspunkt des Host-Service. Jener Einstiegspunkt ruft explizit die bestehende, nicht umbenannte `list()`-Methode auf; die Map identifiziert weder Decorator, Klasse noch die volle Signatur fälschlich als Methodendefinition.

Typert generiert für denselben Symbolschlüssel einen Wire-Zod-codec. Das Host-Gateway nutzt ihn, um Input zu validieren und Ergebnisse zu kodieren, während der Client-Remote ihn nutzt, um Argumente zu kodieren und Antworten zu validieren. Kann ein komplexer Typ keinen strikten codec erzeugen, schlägt der LIB-Build fehl statt auf `unknown` oder ungeprüftes JSON zu degradieren.

Benannte Geschäftstypen, die von Remote-Methoden referenziert werden, müssen aus öffentlichen, rein typbezogenen Subpaths exportiert werden. Wenn der einzige erreichbare Entry auch Host-Services, Cordis-`Context`-Merges oder Host-only-Implementierungen importiert, schlägt der Build fehl und verlangt vom Geschäfts-Package einen sicheren Typ-Entry. Primitive, Literale und einfache, von Typert explizit unterstützte Kompositionen brauchen keine zusätzlichen Namen.

Ein Lookup-Parameter exponiert die `Agent`-Klasse nicht gegenüber Konsumenten. Die Remote-Projektion verweist auf den kanonischen ID-Typ in der Lookup-Deklaration, etwa `SessionId`, während der Host weiterhin Objekte über das kanonische `Agent`-Klassensymbol auflöst.

## Drei Artefaktarten und zwei TypeScript-Programme

Host und Client nutzen weiterhin nur zwei unabhängige TypeScript-Programme, aber Typert erzeugt drei semantisch getrennte Artefaktarten:

```text
Host Program
├─ typert.host.js / typert.host.d.ts
│  Host 自身的 Service、Event、Object、schema 和 inbound Gateway 信息
└─ typert.remote-client.js / typert.remote-client.d.ts / typert.remote-client.d.ts.map
   Host Remote 对任意消费环境的 wire 投影

Client Program
└─ typert.client.js / typert.client.d.ts
   Client 自身的 Service、Event、Object 和 schema 信息
```

`remote-client` ist der zweite Emitter des Host-Programms, kein drittes Programm und kein lokales Gesicht des Clients. Es enthält weder Host-Cordis-Merge, Service-Klasse, Context-Klasse noch Implementierungscode, und es geht nicht in die Host-lokale Reflexionsregistry ein.

Der Host-lib-Build führt die strikte Host-Analyse aus und emittiert sowohl die Host-lokalen als auch die Remote-Konsumenten-Artefakte. Die Client-lib konsumiert dann das Remote-DTS. Die vollständige Reihenfolge ist:

```text
Host lib build
→ 生成 typert.host.{js,d.ts}
→ 生成各业务包 lib/typert.remote-client.{js,d.ts,d.ts.map}
→ 完成 Client lib 和 typert.client 产物
→ Vite 构建 Web
```

Der bestehende Top-Level-`build` lässt weiterhin `build:lib` vor `build:web` laufen, aber `build:lib` muss Host- und Remote-Artefakte fertigstellen, bevor die Client-TypeScript-Kompilierung startet. Ein sauberer Build darf nicht von abgestandenen `.d.ts`-Dateien eines früheren Builds abhängen.

Compiler-gestützte Repository-Gates, die die Konsumentenoberfläche auflösen, haben dieselbe Voraussetzung, selbst wenn ihre primären Inputs Quelldateien sind. Die öffentlichen `typecheck`-, `lint`- und `doc-typecheck`-Kommandos führen zuerst den Host-Vertragsdurchlauf aus. Der Gate-Scheduler darf ihre `*:contracts-ready`-Varianten nur nach einer expliziten Typert-Vertrags- oder Komplett-Build-Abhängigkeit verwenden, damit parallele Lanes weder fehlende Deklarationen lesen noch konkurrierende Generatoren auf dieselben Outputs laufen lassen.

## Der `/remote`-Package-Entry

Jedes Geschäfts-Package, das Remote-Methoden bereitstellt, exportiert einen generierten `/remote`-Subpath:

```text
"./remote": {
  "types": "./lib/typert.remote-client.d.ts",
  "default": "./lib/typert.remote-client.js"
}
```

Konsumentencode wählt eine Fähigkeit über das Geschäfts-Package selbst:

```text
import goalsRemote from '@deepseek-ai/dsh-goal/remote'
```

Dieser Import bringt die `.d.ts`-Map-Erweiterung in das aktuelle TypeScript-Projekt und liefert zugleich den JS-Descriptor für denselben Vertrag als Wert an die Laufzeit. Ein Geschäfts-Package, das nicht importiert wird, erweitert die Remote-API-Typen des aktuellen Projekts nicht.

Die publizierten Dateien des Geschäfts-Packages müssen `lib/typert.remote-client.d.ts.map` enthalten. Das generierte DTS verweist mit `//# sourceMappingURL=typert.remote-client.d.ts.map` auf seine benachbarte Map; die Map-Quelle zeigt per relativem Pfad wie `../src/index.ts` von `lib` auf die Geschäftsquelle. Der `/remote`-Export listet die Map nicht separat; das `files`-Feld des Packages publiziert sie. Dieses Ziel ist ein Entwicklungszeit-Pfad: Ein Workspace-Konsument löst es über den Package-Link auf; die publizierte Payload schließt `src` also weiterhin aus, und eine publizierte Map löst schlicht nichts auf.

Code, der nur statische Typen braucht, darf `import type {} from '@deepseek-ai/dsh-goal/remote'` verwenden. Dieser Import wird zur Laufzeit entfernt, lädt kein JS und kann keine Runtime-Registrierung auslösen. Eine Umgebung, die echte Aufrufe macht, muss den Beitrag aus einem normalen Wert-Import an den Client-Remote-Service übergeben.

Die Workspace-Auflösung für `/remote` muss explizit auf generierte `lib`-Artefakte zielen und darf nicht von einer generellen Package-zu-`src`-Paths-Regel auf Host-Quelle umgeleitet werden. Gewöhnliche Geschäftsimports dürfen weiterhin je nach bestehenden Regeln der jeweiligen Umgebung auf SRC oder LIB auflösen.

## Strikte Konsumenten-API-Typen

Remote-DTS erweitert die flache Endpoint-Map, das direkte Namensraum-Interface, die Namensraum-Map und die gescopte Map, ohne den globalen Cordis-`Context` zu augmentieren:

```text
interface TypertRemoteNamespace$676f616c73 {
  create: (
    agentId: SessionId,
    request: CreateGoalRequest,
    signal?: AbortSignal,
  ) => Promise<RemoteResult<CreateGoalResult>>
}

interface TypertRemoteMap {
  'goals/create': (
    agentId: SessionId,
    request: CreateGoalRequest,
    signal?: AbortSignal,
  ) => Promise<RemoteResult<CreateGoalResult>>
}

interface TypertRemoteNamespaceMap {
  goals: TypertRemoteNamespace$676f616c73
}

interface TypertRemoteScopeMap {
  'agent:goals/create': (
    request: CreateGoalRequest,
    signal?: AbortSignal,
  ) => Promise<RemoteResult<CreateGoalResult>>
}
```

`TypertRemoteMap` bewahrt kanonische Endpoint-Signaturen für Protokoll-Typisierung und Reflexion. Der Root-Remote-Typ liest `TypertRemoteNamespaceMap` direkt statt Methoden indirekt über einen key-remappten Mapped Type abzuleiten; der TypeScript Language Service kann solche indirekten Properties nicht zuverlässig durch eine Declaration-Map navigieren. Ein Namensraum-Interface-Name kodiert die UTF-8-Bytes des Namensraums als Hexadezimal; `goals` wird also deterministisch zu `TypertRemoteNamespace$676f616c73`. Unterschiedliche Packages erzeugen für denselben Namensraum denselben Interface-Namen und mergen ihre Methoden per Module-Augmentation, während `TypertRemoteNamespaceMap.goals` immer auf genau diesen einen Typ verweist.

Typert projiziert `TypertRemoteScopeMap` entsprechend seinem Context-Key auf einen dedizierten Scope-Typ. Die finale Programmierschnittstelle bleibt:

```text
ctx.remote.goals.create(agentId, request)
agentCtx.remote.goals.create(request)
```

Der Agent-Scope liefert seine eigene `SessionId` automatisch. Eine `@Remote`-Methode mit einem `agent`-Lookup kann daher sowohl Root- als auch gescopte Konsumentensignaturen erzeugen. Eine `@RemoteScope('agent')`-Methode lässt ebenfalls eine separate Scope-Identität weg, erzeugt aber nur die gescopte Signatur. Der Root-`Context` exponiert direkte Namensräume über `ctx.remote`, während `AgentContext.remote` jene direkte Oberfläche mit der gescopten Oberfläche schneidet. Ein künftiges TUI muss dieselbe Unterscheidung bewahren.

Jede generierte Methode löst zu `Promise<RemoteResult<T>>` auf: Ein Aufruf meldet sein Ergebnis im `ok`-Zweig des Result statt zu rejecten; nur ein Assembly-Fehler (Arität, eine nicht gemountete Methode, ein fehlender Context-Adapter) wirft weiterhin. Ein Konsument verzweigt auf `result.ok` und liest `result.error.code`, wenn er Fehler unterscheiden muss; das Fehlervokabular selbst ist [eine Remote-Fehlerklasse plus eine gemergte Code-Tabelle](2026-08-28-ctx-remote-failure-vocabulary.md).

`TypertClientRemote` bleibt plattformunabhängig, und der Browser-Client exponiert es als `ctx.remote`. Wenn ein künftiges TUI diesen Typ wiederverwendet, muss es ihn ebenfalls über ein dediziertes Remote-Objekt und Agent-Scope zugreifen statt den Host-`Context` als breitere Service-Sammlung zu behandeln. Öffentliche Service-Methoden ohne Remote-Marker gehen nicht in die Remote-Maps ein. Neben den generierten Namensräumen fügt das Client-Gesicht des Gateways `$mount`, `$on`, `$stream` und `$host` hinzu — letzteres exponiert die fixierten Host-Fakten der Verbindung (`home`, `isLoopback`) als schlichte Reads, sodass ein Konsument nie den Träger injizieren muss, um sie zu erfahren.

## Client-Typert und das API-Gateway-Client-Gesicht

Typert in einer Konsumentenumgebung hält sowohl lokale Informationen als auch aus anderen Umgebungen importierte Remote-Informationen vor, speichert sie aber in getrennten registries:

```text
Typert.local    当前环境自己的反射模型
Typert.remotes  已导入的 Remote contribution
```

`@deepseek-ai/dsh-api-remotes/client` lädt die benötigten Remote-Beiträge zentral:

```text
import goalsRemote from '@deepseek-ai/dsh-goal/remote'
import sessionsRemote from '@deepseek-ai/dsh-session/remote'

await ctx.remote.$mount(goalsRemote)
await ctx.remote.$mount(sessionsRemote)
```

Client-Geschäfts-Packages hängen nur von `@deepseek-ai/dsh-api-remotes/client` ab, nicht direkt vom API Gateway oder dem Runtime-Entry jedes Geschäfts-`/remote`. API Remotes konsumiert den geteilten `TypertClientRemote`-Vertrag und den Cordis-`ctx.remote`-Service und re-exportiert dann Deklarationen, sodass die ausgewählte Remote-Map die Geschäftskompilierung erreicht. Das Hinzufügen oder Entfernen einer kompletten Client-Fähigkeit ändert nur diesen Assembly-Punkt.

`ctx.remote.$mount()` registriert einen Beitrag bei `Typert.remotes`, installiert seine Namensraum-Services und konkreten Methoden und löst erst auf, wenn sie bereit sind. Sein disposer gehört dem Cordis-fiber, der die Methode aufrief. Doppelte Endpoints, konfligierende Aufrufmodi für denselben Namensraum und dieselbe Methode oder Konflikte zwischen einem Descriptor und einer bestehenden Typidentität schlagen sofort fehl.

Der Client-Remote-Service materialisiert jeden `@Remote`-Descriptor als echte Funktion auf einem `remote.<namespace>`-Kind-Service. Die Funktion konstruiert benannte `args` in Descriptor-Parameterreihenfolge, wendet den strikten codec des Clients an und ruft dann `ctx.connection.rpc.call('/api', endpoint, { args }, signal)`. Bei einem abbruchfähigen Descriptor akzeptiert die generierte Funktion ein letztes optionales signal und kombiniert es mit der Lebensdauer des Beitrags-Mounts; unmounten bricht also jeden laufenden Carrier-Call ab, während ein Aufrufer einen einzelnen Call unabhängig abbrechen kann.

Weder ein direkter Descriptor mit `scope` noch ein `@RemoteScope`-Descriptor kopiert Funktionen in jeden Agent-Scope. Der Client-Remote-Service erzeugt pro Namensraum einen Cordis-Kind-Service, registriert als `remote.<namespace>`, und materialisiert darauf direkte und gescopte Varianten. Der Zugriff auf eine Methode über `agentCtx.remote.goals` fängt den aktuellen Agent-Context, bevor das aufrufbare Handle zurückgegeben wird. Die Methode fragt dann den entsprechenden Context-binder nach der Identität aus jenem Context. Eine direkte gescopte Projektion substituiert diese Identität an der von `scope.wire` benannten Lookup-Position; ein Remote-Scope-Descriptor schreibt die Identität in das separate Wire-Feld des Receivers. Beide setzen dieselbe Art von `/api`-Call ab.

```text
root ctx.remote.goals.create(agentId, request)
  → direct descriptor
  → ctx.connection.rpc.call('/api', 'goals/create', { args })

agentCtx.remote.goals.create(request)
  → remote.goals accessor 捕获 agent Context
  → agent binder 从 caller Context 取得 agentId
  → 用 agentId 补入同一 direct descriptor 的 lookup 参数
  → ctx.connection.rpc.call('/api', 'goals/create', { args })
```

Der Root-`Context` mergt nur die direkte `TypertClientRemote`-Oberfläche. `AgentContext` ersetzt jene Property durch den Schnitt von `TypertClientRemote` und `TypertRemoteScopeApi<'agent'>`, sodass nur-gescopte Methoden aus Root-Code nicht verfügbar bleiben. Umgeht ein Aufrufer das Typsystem und ruft eine nur-gescopte Methode dynamisch von Root auf, meldet der binder einen expliziten Fehler. Hat der Client bereits einen Cordis-Service namens `remote.<namespace>` oder beanspruchen zwei Beiträge denselben Namensraum und dieselbe Methode inkompatibel, schlägt das Mounten fehl statt den bestehenden Service zu überschreiben.

Generiertes Remote-JS enthält nur Descriptors, Symbolschlüssel und codecs; es bündelt keine Host-Service-Implementierungen. Der Client-Remote-Service erzeugt echte Funktionen aus diesen Daten; die Laufzeit hängt also nicht von einem JavaScript-Proxy ab. Ein Proxy bleibt eine Implementierungsoption, ist aber weder Quelle von Typen noch von Reflexion.

## Umgebungsübergreifende Isomorphie-Bedingungen

Remote-API ist eine Konsumentenfähigkeit, kein Synonym für Browser-API. Die ausgelieferte Laufzeit implementiert Browser-Client-Beitrags-Mounting, Connection-RPC-Calls und Agent-Scope-Assoziation.

Remote-DTS, Remote-JS, `TypertClientRemote`, `InvocationDescriptor`, das Remote-RPC-Datenprotokoll und Context-binder dürfen weder vom DOM, Browser-Modul-loadern noch von HTTP abhängen. Über Connection kodiert der Browser-Client descriptor-materialisierte Methoden als `/api`-RPC-Calls.

Ein künftiges TUI kann derselben Aufrufabstraktion beitreten, ohne Geschäfts-Decorators, Remote-Maps oder die Form der API-Calls zu ändern. Die TUI-sichtbare API muss weiterhin ausschließlich aus `@Remote` und `@RemoteScope` generiert werden; einen Prozess mit dem Host zu teilen darf ihm nicht erlauben, Remote-Beschränkungen zu umgehen und Service-Methoden direkt zu exponieren.

TUI-Runtime-Mounting, Träger, Agent-Scope-Verdrahtung und SRC-Start-Verdrahtung bleiben vertagt außerhalb dieser Entscheidung.

Das Web hängt bereits von Build-Artefakten wie `lib/client.js` ab und braucht daher vor dem Start einen kompletten `build:lib`. Nach einer Änderung des Host-Remote-Vertrags bauen Entwickler die lib neu und starten dann das Web (erneut). Inkrementelles Beobachten des Remote-Vertrags ist nicht implementiert.

## SRC- und LIB-Betriebsmodi

SRC unterstützt den lokalen Quell-Start. Die versionierten Prototyp-Descriptors, die `@Remote` und `@RemoteScope()` erzeugen, liefern Methodennamen und Aufrufmodi. Zur Laufzeit liest das System geordnete Parameternamen aus der JavaScript-Funktionssignatur und kombiniert sie mit registrierten Lookup-/Context-Providern zu einem permissiven Descriptor.

Zum Beispiel löst `@Remote('create') remoteExportCreate(agent, request, signal)` zur externen Methode `create`, Implementierungsmitglied `remoteExportCreate`, zwei Top-Level-Geschäftsparametern und einem Abbruch-Injektionspunkt auf. Die Lookup-Registrierung schreibt `agent` auf das Wire-Feld `agentId` um, `request` wird als gleichnamiger JSON-Parameter übergeben, und das letzte `signal` bleibt außerhalb der Payload. SRC startet kein `ts.Program`, nutzt keinen preload- oder loader-hook, generiert oder schreibt keine Quelle um und inspiziert nicht die interne Struktur eines gewöhnlichen JSON-Objekts.

Eine Signatur, die SRC nicht eindeutig auflösen kann, schlägt beim ersten Aufruf fehl, der ihren Descriptor auflöst; das Service-Mounting zeichnet nur den Decorator-Marker auf und inspiziert die JavaScript-Signatur nicht. SRC rät nicht bei Objekt-Destrukturierung, Ambiguität durch Default-Parameter, Rest-Parametern, verschachtelten Lookups oder komplexen Typen.

LIB unterstützt CI, Releases und den vorgelagerten Web-Build. Typert scannt das komplette Host-Projekt und prüft Remote-Decorators, explizite Bindings, Service-Keys, Endpoint-Konflikte, Lookup-/Context-Deklarationen, Public-Symbol-Erreichbarkeit, JSON-codecs, Result-codecs und ob ein reservierter letzter `signal`-Parameter den globalen `AbortSignal`-Typ hat, dann generiert es strikte Descriptors.

Zur Laufzeit lädt LIB nur Definitionen aus `lib`; es startet den TypeScript-Compiler nicht. Die nachfolgende Assoziation von Services, Lookup, Context-Auflösung, Aufruf und Response-Kodierung im Host-Gateway hängt nicht davon ab, ob ein Descriptor aus permissivem SRC-Parsing oder strikter LIB-Generierung stammt.

CI und Releases nutzen LIB. Die gesamte Repository-Abdeckung auf LIB zu heben ist separate Folge-Arbeit und blockiert diese Implementierung direkter Methodenaufrufe nicht.

## Host-Gateway-Auflösung

Das Host-Gateway registriert einen `/api`-Interceptor bei Connection und pflegt keine zweite Endpoint-registry. Sein Ownership-Matcher prüft zuerst die aktuelle lokale Typert-registry und konsultiert dann eine invalidierungsbewusste Menge, die durch Scannen aktueller Cordis-Services nach `typertGateway`-Bindings und SRC-Remote-Markern gefüllt wird. Eine Cordis-Service-Änderung verwirft die Menge; Typert-Definitionen und Geschäfts-Services dürfen also in beliebiger Reihenfolge ankommen, ohne dass jeder Request alle Services rescannt oder beliebige Request-Pfade den Cache wachsen lassen.

Der Aufruf löst Descriptor, Receiver, Lookup-Provider und Context-Provider erneut aus aktuellem State auf. Ein aktueller strikter Descriptor hat Vorrang vor SRC. Nachdem ein strikter Endpoint erschienen ist, hält `TypertLocalRegistry.hasSeen()` ihn als owned fest, wenn jener Descriptor zurückgezogen wird, und verbietet SRC-Fallback für den Rest der registry-Lebensdauer; die erneute Registrierung des strikten Descriptors stellt Aufrufe wieder her. Das Entfernen eines Services oder Providers lässt den Aufruf explizit fehlschlagen, und das Gateway behält weder ungültige Objekte noch ruft es eine Methode mit einer rohen Lookup-ID auf.

Ein gewöhnlicher `@Remote`-Call behält die ursprüngliche Service-Instanz als Receiver. Nach erfolgreichen Lookups ruft das Gateway das von `implementation ?? method` benannte Mitglied mit Parametern in Descriptor-Reihenfolge auf, gefolgt vom Carrier-signal, wenn der Descriptor Abbruch deklariert.

Ein `@RemoteScope('agent')`-Call bittet zuerst den Agent-Context-Provider, die Wire-Identität aufzulösen, liest dann den Service-Key des Descriptors aus jenem Context und ruft den gescopten Receiver auf. Die Geschäftsmethode erhält weder einen versteckten Context-Parameter noch eine Agent-ID.

```text
ctx.typertGateway.invoke({ namespace, method, args, signal })
→ 查找本地 InvocationDescriptor 与 live receiver
→ 按参数 descriptor 读取具名 wire 字段
→ codec 解码普通值或 lookup ID
→ lookup provider 把 ID 解析为活对象
→ direct 使用原 Service；context 先解析 scoped Context 和 Service
→ cancellation descriptor 存在时把 signal 追加到业务参数末尾
→ Reflect.apply(receiver[implementation ?? method], receiver, orderedArgs)
→ result codec 编码业务结果
```

`ctx.typertGateway.invoke()` ist der trägerunabhängige Host-Einstiegspunkt. Es erzeugt weder rpcId, RPC-Envelope noch HTTP-Response. Es gibt nur das kodierte Ergebnis zurück oder wirft einen Gateway-Fehler, den der Connection-RPC-Adapter für den Transport mappt.

## Die geteilte `/api`-Aufrufkette

Connection besitzt eine `/api`-Route auf dem HTTP-Server. Das Gateway mountet einen synchronen Endpoint-Ownership-Test und den Remote-RPC-Handler in Connection:

```text
ctx.connection.rpc.intercept(
  '/api',
  endpoint => ownsRemoteEndpoint(endpoint),
  (endpoint, payload, signal) => {
    const { namespace, method } = parseEndpoint(endpoint)
    const { args } = parsePayload(payload)
    return ctx.typertGateway.invoke({ namespace, method, args, signal })
  },
)
```

Das Gateway beansprucht einen Endpoint, wenn die Host-registry seinen strikten Descriptor enthält, sich an einen zurückgezogenen strikten Descriptor erinnert oder einen passenden `@Remote`-Marker auf einer aktiven SRC-Service-Bindung findet. Ein beanspruchter Endpoint bleibt im Gateway, wenn Payload-Dekodierung, Descriptor-Auflösung oder der Aufruf fehlschlägt; ein Endpoint, den weder eine exakte Fetch-Route noch das Gateway beansprucht, antwortet 404.

Die Connection-Host-Hälfte übergibt einen kompositen FetchHandler an die HTTP-Bridge. Nachdem die Bridge einen Standard-`Request` erzeugt hat, matcht jener Handler den Pfadnamen gegen die exakten Fetch-Routen, die Owner auf dem Kanal registrierten, dann gegen den einzigen Interceptor des Kanals — das Gateway — und antwortet 404, wenn keiner ihn beansprucht. Jeder Pfad auf dem Kanal nutzt denselben Request/Response-Envelope, rpcId, Serialisierung, trust und Fehlertransport, und ein Fehler trägt die geteilten `{ code, message, details }`-Daten. Das aktuelle physische Mapping ist:

```text
POST /api/<namespace>/<method>
```

Die Remote-Payload ist ein benanntes JSON-Objekt, kein positionales Array, und trägt keinen `InvocationDescriptor`. Ein normaler Goal-Call hat diesen Payload-Slot:

```json
{
  "args": {
    "agentId": "session-1",
    "request": {
      "objective": "finish the migration"
    }
  }
}
```

Der komplette Pfad ist:

```text
ctx.remote.goals.create(sessionId, request, signal?)
→ Client InvocationDescriptor 编码 { args: { agentId, request } }
→ Client 合并 caller signal 与 contribution mount lifetime
→ ctx.connection.rpc.call('/api', 'goals/create', { args }, signal)
→ Connection 创建 rpcId 和既有 client-request envelope
→ 当前 carrier 发送 POST /api/goals/create
→ Connection Host half 执行共享 trust，再由 bridge 创建标准 Request
→ 复合 FetchHandler 判断 endpoint ownership 并选择目标 FetchHandler
→ Typert interceptor 调用 ctx.typertGateway.invoke(..., request.signal)
→ Host InvocationDescriptor 解码、lookup、receiver 解析并把 signal 注入 Reflect.apply
→ result codec 编码
→ Connection 写入既有 RPC result 并回送相同 rpcId
→ Client result codec 验证并返回 CreateGoalResult
```

Remote definiert keine zweischichtige `{ ok, value/error }`-Antwort auf der Leitung. Erfolgreiche Werte und Fehler nutzen direkt das `result` der bestehenden RPC-Antwort, und der Fehlerzweig trägt die geteilten `{ code, message, details }`-Daten. Owner, Resolver und das Gateway werfen alle eine Klasse, `RemoteError`, deren Code aus der gemergten `RemoteErrorDetailsMap` stammt: Der Host kodiert einen strukturell identifizierten `RemoteError` unverändert auf die Leitung — einschließlich der eigenen `gateway/*`-Assembly-Codes des Gateways und eines `session/not-found` oder `session/agent-busy` eines Resolvers — und faltet nur einen unklassifizierten Wurf in `gateway/internal`, wobei die Diagnose in der message bleibt. Das Client-Gesicht rekonstruiert eine Instanz für den `RemoteResult`-Fehlerzweig; `throw result.error` behält also Wurf-Semantik. [Die Failure-Vocabulary-Agent-Note](2026-08-28-ctx-remote-failure-vocabulary.md) besitzt die Code-Tabelle, ihre Ownership-Regeln und warum die Unterscheidung `code` statt `instanceof` liest.

Das Gateway behandelt weder pro-Methode-Permissions, Caller-Identität, Idempotenz noch langlebigen Verbindungs-State. Es propagiert nur kooperativen Abbruch von Connection in explizit abbruchfähige Geschäftsmethoden. Jeder Request auf dem geteilten Kanal — Typert-Endpoint oder exakte Fetch-Route — passiert Connections Browser-Authentifizierung und Trusted-Host-Policy vor dem Dispatch; das Gateway fügt keine zweite Policy hinzu. Connections WebSocket-Migration bleibt separate Folge-Arbeit.

## Connection- und Protokollgrenzen

Der Client-Remote-Service besitzt Remote-Beiträge, Namensraum-Service-Materialisierung, Scope-Bindung und die Entsprechung zwischen positionalen Parametern und Descriptors. Das Gateway besitzt Host-Descriptors, Endpoint-Ownership, Lookup, Context und den Geschäftsaufruf. Connection schickt `/api`, den Endpoint und `{ args }` als einen RPC-Call ans Ziel und gibt das bestehende RPC-Result zurück; es versteht weder Goal, Agent, Lookup, Descriptors noch Client-Remote-Typen.

Das Gateway registriert nur seinen Ownership-Matcher und RPC-Handler bei Connection; es registriert keine HTTP-Route. Connection mountet die geteilte `/api`-Route in den HTTP-Server und gibt der Bridge einen kompositen FetchHandler; jener Handler dispatcht einen exakt registrierten Pfad an seinen Route-Owner, einen beanspruchten Endpoint ans Gateway und alles andere an 404. Ein künftiger Connection-Transport kann diese Reihenfolge bewahren, ohne Remote-Payload, Geschäfts-Decorators, generiertes DTS, Remote-API-Typen oder die Agent-Scope-Programmierschnittstelle zu ändern.

## Package-Grenzen

- `@deepseek-ai/dsh-typert-protocol`: leichtgewichtige Protokolle für Decorators, Bindings, Lookup, Remote Scope und Descriptors.
- Typert generator: analysiert Host-/Client-Programme, generiert lokale Gesichter und Remote-Konsumenten-Projektionen und emittiert kanonische Symbol-/Zod-Informationen.
- Typert runtime: speichert getrennt die lokale Reflexion der aktuellen Umgebung und importierte Remote-Beiträge.
- `@deepseek-ai/dsh-api-gateway`: sein Default-Entry assoziiert Host-Definitionen mit Services, beansprucht Remote-Endpoints, führt Lookup aus, löst Context-Receiver auf, ruft Methoden auf, kodiert Ergebnisse und registriert einen `/api`-Interceptor bei Connection; sein `/client`-Entry mountet Remote-Beiträge, erzeugt strikte Remote-Namensraum-Services und -Methoden und delegiert Aufrufe an `ctx.connection.rpc`. Die Entries teilen das Remote-Protokoll, importieren aber nicht gegenseitig ihre Cordis-Interface-Merges.
- `@deepseek-ai/dsh-api-remotes`: die BFF-Schicht; registriert die weitergeleitete Cordis-Event-Quelle der Anwendung und das von generation readiness getragene Host-Home, wählt Client-`/remote`-Beiträge aus und exponiert die gemergten Remote-Typen gegenüber Geschäfts-Packages über den geteilten `TypertClientRemote`-Vertrag.
- Connection: besitzt den einzelnen HTTP-Server/künftigen WebSocket-Träger, die geteilte `/api`-Route und ihren kompositen FetchHandler, owner-registrierte exakte Fetch-Routen, den RPC-Envelope, rpcId, Serialisierung, trust und Fehlertransport.
- Geschäftsobjekt-Packages wie Agent/Session: besitzen Lookup, Context-Provider, kanonische ID-Typen und öffentliche, rein typbezogene Entries.
- `@deepseek-ai/dsh-api-session-controller`: konfiguriert den geteilten `agent`-/`session`-Lookup- und `agent`-Host-Context-resolver, sodass jeder Remote-Endpoint, der eines dieser Objekte akzeptiert, eine resume- und Ownership-Zaun-Policy teilt.
- Geschäfts-Service-Packages: deklarieren Bindings, Remote-Methoden und ihre Request/Result-Typen und exportieren den generierten `/remote`-Subpath.

## Ausgelieferter Scope und vertagte Arbeit

Der ausgelieferte vertikale Pfad ist `@deepseek-ai/dsh-goal/remote → Browser Client Remote → Connection RPC /api → Host Gateway → GoalService.remoteExportCreate()`. Derselbe direkte Descriptor mit einem Agent-Lookup unterstützt sowohl `ctx.remote.goals.create(agentId, request)` als auch `agentCtx.remote.goals.create(request)`. Gewöhnliche kalte Sessions werden vom geteilten Lookup-resolver resumt, während subagent-eigene Identitäten den `session/agent-busy`-Zaun behalten; `@RemoteScope('agent')` bleibt der eigene gescopte-Receiver-Modus.

Connection liefert den geteilten Kanal-Interceptor und das aktuelle HTTP-Träger-Mapping. WebSocket-Migration, die TUI-Laufzeit und -Träger, TUI-Agent-Scope-Verdrahtung, Permission/Approval-Zustandsautomaten, Session-Event-Streams, Aufrufautorisierung, Retries, Idempotenz und versionsübergreifende Protokollkompatibilität bleiben außerhalb dieser Entscheidung.

Die Package-Topologie ist `api/remotes → api/gateway → client/connection → host/webserver`. Connection und WebServer behalten ihre bestehenden Pfade in dieser Änderung; sie später nach `api/connection` und `api/webserver` zu verschieben ändert die Package-Platzierung, nicht diese Service-Grenzen.

## Erwogene Alternativen

**Das zentrale API-Proxy-Package weiterverwenden.** Das würde erfordern, Geschäftsmethoden, Host-Routen und Client-Schnittstellen wiederholt an mehreren Stellen zu deklarieren. Es hielte außerdem direkte Aufrufe, zustandsbehaftete Interaktionen und Event-Streams an denselben Lebenszyklus gebunden; diese Alternative ist daher abgelehnt.

**Strikte Reflexion zur Laufzeit über Decorators durchführen.** JavaScript-Decorators können gelöschte TypeScript-Typen, öffentliche Symbolidentität oder komplette Zod-codecs nicht wiederherstellen. Ein compiler-privates Symbol in einen Konstruktor zu injizieren würde außerdem die echten Abhängigkeiten der Geschäftsklasse verstecken; Typert generiert strikte Informationen daher zur Kompilierzeit.

**Einen preload, loader-hook oder ein komplettes `ts.Program` beim SRC-Start verwenden.** Das könnte LIB-Analyse wiederverwenden, würde aber jeder Quell-Start-Entry Anforderungen hinzufügen. SRC braucht nur einen brauchbaren permissiven Descriptor; es nutzt also Decorator-Marker, Funktionsparameternamen und explizite Provider; strikte Prüfungen bleiben im LIB-Vertragsdurchlauf.

**Die Client-Schnittstelle von Hand schreiben.** Eine handgeschriebene Schnittstelle kann nicht garantieren, nur Remote-markierte Methoden zu enthalten, und kann von Host-Signaturen, Lookup-IDs und Zod-schemas abdriften. Client-Typen werden daher automatisch aus dem Host-Programm projiziert.

**Ein TypeScript-Language-Service-/Compiler-Plugin verwenden, damit der Client Decorators direkt versteht.** Das würde erfordern, dass Editoren, Vite, tsc, tsx und publizierte Konsumenten ein zusätzliches Plugin installieren — zu invasiv. Das Design generiert stattdessen gewöhnliche `.d.ts`-Dateien und Standard-Declaration-Maps.

**Komplettes Host-DTS in Client oder TUI importieren.** Das würde Host-Services und Cordis-Interface-Merges hereinziehen und unmarkierte Methoden gegenüber Konsumenten exponieren. Remote-DTS verweist nur auf öffentliche, rein typbezogene Symbole und augmentiert dedizierte Remote-Maps.

**Nur Remote-DTS generieren, ohne JS.** Typen würden funktionieren, aber die Laufzeit könnte Endpoints, codecs und Context-Modi nicht ohne einen Proxy oder eine weitere handgeschriebene registry enumerieren. Dieselbe Host-Projektion emittiert daher auch einen Remote-JS-Beitrag.

**Einen Top-Level-`/remote`-Import globalen State implizit registrieren lassen.** Der Ziel-Cordis-Context existiert zur ESM-Evaluierungszeit möglicherweise nicht, und die Ownership wird über mehrere Contexts, HMR und disposal hinweg mehrdeutig. Ein normaler Wert-Import gibt daher nur einen Beitrag zurück, den die Umgebungs-Assembly explizit über den Client-Remote-Service mountet.

**Einen separaten Transport, HTTP-Route oder `/api2`-Kanal für Remote erzeugen.** Das würde Connections Server-Ownership, rpcId, Serialisierung, trust, Fehler und den künftigen WebSocket-Lebenszyklus duplizieren oder spalten. Der geteilte `/api`-Interceptor hält stattdessen eine physische Route und lässt Connection sie aus owner-registrierten exakten Fetch-Routen und dem einzigen Interceptor des Kanals komponieren.

## Verifikation

- Der Goal-Service dekoriert Mutationsmethoden direkt, deren Geschäftssignaturen bereits dem Remote-Vertrag entsprechen, und behält `remoteExportCreate(...)` nur, um `GoalView` in `CreateGoalResult` zu adaptieren — ohne zweite Route, codec oder Client-Methodenliste.
- Ein sauberer `build:lib` emittiert Host- und Konsumenten-Remote-Artefakte vor der Client-Kompilierung, einschließlich JS, DTS und Declaration-Map des Geschäfts-Packages unter `/remote`.
- Nach `clean` regenerieren eigenständige `typecheck`-, `lint`- und `doc-typecheck`-Läufe die Remote-Verträge; der Pre-Push-Hook nutzt denselben vorbereiteten typecheck, und CI-Quellkonsumenten warten auf einen geteilten Vertragsdurchlauf.
- Das Importieren von `@deepseek-ai/dsh-goal/remote` fügt den strikten `ctx.remote.goals.create(...)`-Typ und Deklarationsnavigation zu `remoteExportCreate` hinzu; das Weglassen des Imports lässt den Namensraum weg.
- Das Mounten des JS-Beitrags desselben Imports liefert Endpoint-, Parameter-, Result-, Lookup-, Context- und Zod-Reflexion und materialisiert den Aufruf ohne handgeschriebenen Stub.
- Root- und Agent-gescopte Aufrufe queren den echten geteilten `/api`-Träger, lösen `agentId` zum live Agent auf, rufen den ursprünglichen Goal-Receiver auf und kehren durch den bestehenden RPC-Envelope zurück.
- Agent- und Session-Lookups teilen einen einzigen laufenden Cold-Session-resume; gewöhnliche kalte Sessions erhalten wiederhergestellte Objekte, während kalte und live subagent-Identitäten `session/agent-busy` vor dem Geschäftsaufruf zurückgeben.
- Die Remote-Artefakte und -Maps enthalten nur markierte Methoden und keine Browser-Abhängigkeit; dieselbe Konsumentengrenze bleibt für ein künftiges TUI erhalten.
- Lebenszyklus-Tests ziehen Descriptors, Services, Lookups, Context-Provider und Client-Namensräume zurück und mounten sie erneut; nicht verfügbare Abhängigkeiten schlagen ohne abgestandene Aufrufe oder Raw-ID-Fallback fehl.
- Abbruch-Tests decken strikte Generierung, SRC-Erkennung des letzten Namens, Client-signal-Fusion, Connection-zu-Gateway-Propagation und Host-Injektion außerhalb der Wire-`args` ab.
- Ein Request, der weder eine exakte Fetch-Route noch einen beanspruchten Remote-Endpoint matcht, antwortet 404 auf demselben Kanal, während eine zurückgezogene Route nicht mehr bedient wird.

## Konsequenzen

Remote-API-Typen hängen von generierten `lib`-Deklarationen ab. Build- und Gate-Orchestrierung müssen den Host-Vertragsdurchlauf beenden, bevor Host- und Client-Konsumenten kompiliert oder semantisch analysiert werden; eine falsche Reihenfolge lässt ein sauberes Kommando von abgestandenen Artefakten abhängen.

Quellnavigation erfordert, dass ein Remote-Package sowohl seine Declaration-Map als auch die von der Map referenzierte `src`-Datei publiziert. Lässt das `files`-Feld des Packages eine der beiden Seiten weg, kompilieren Typen weiterhin, aber Konsumentennavigation stoppt am generierten DTS. Der Workspace-manifest-Check muss beide daher als einen Publikationsvertrag behandeln.

Der permissive SRC-Descriptor validiert die interne Struktur gewöhnlichen JSONs nicht. Nach einer Änderung einer Host-Remote-Signatur müssen Web und strikte Typkonsumenten die lib neu bauen, weil kein inkrementeller Vertrags-Watcher existiert.

Kanonische öffentliche Typen erfordern, dass Geschäfts-DTOs rein typbezogene Entries haben, was Packages exponieren kann, deren Host-Typen und Implementierungs-Entries derzeit gemischt sind. Der Build lehnt jene Grenzen ab statt Typen zu kopieren, um sie zu verdecken.

Typ-Imports und Runtime-Beiträge haben unterschiedliche Wirkungen. `import type {}` erweitert nur die statische Remote-Oberfläche. Lässt eine echte Aufrufumgebung den Wert-Beitrag weg, muss der Client-Remote-Service mit einem expliziten „Remote not mounted"-Fehler scheitern.

Browser und Host halten jeweils eigene Zod-Instanzen und können Objektidentitäten nicht über Realms hinweg vergleichen. Konsistenz ist nur über kanonische Symbolschlüssel, dasselbe generierte Modell und Wire-Verhalten garantiert.

Ein Konsument darf einen Remote-Vertrag importieren, der aktuell nicht auf dem Host gemountet ist. Die Typen bedeuten „diese Protokollfähigkeit wurde vom Konsumenten ausgewählt", nicht dass ein entsprechender Service im Zielprozess existiert; ein nicht verfügbarer Endpoint muss zur Laufzeit explizit scheitern.

Connections generelle Kanal-API muss sowohl zum aktuellen HTTP-Träger als auch zu einem künftigen WebSocket-Träger passen. Exponiert der Client-Remote oder das Gateway `fetch`, einen HTTP-Request oder ein Route-Handle, wird die WebSocket-Migration die Remote-Schicht erneut durchstoßen. Diese physischen Objekte müssen daher Connection-intern bleiben.

Remote-Endpoints nutzen Connections `trusted-host`-Autorität. Loopback wird standardmäßig akzeptiert, und LAN-Aufrufer brauchen eine explizite Trusted-Host-Konfiguration, aber diese Schicht fügt keine pro-Methode-Caller-Autorisierung hinzu; jeder vertrauenswürdige Host kann einen gemounteten Remote-Endpoint aufrufen.

`hasSeen()` bevorzugt Strikte-Definition-Sicherheit gegenüber SRC-Verfügbarkeit. Solange ein strikter Descriptor zurückgezogen ist — etwa während HMR — beansprucht das Gateway den Endpoint weiter und meldet ihn als nicht verfügbar, statt auf einen schwachen SRC-Descriptor zurückzufallen. Erneute Registrierung stellt ihn wieder her; nur ein Neustart der Typert-registry vergisst die historische strikte Definition.

Abbruchfähige Remote-Signaturen erhalten Connections Request-`AbortSignal`; ein HTTP-Disconnect oder Client-seitiger Abbruch erreicht laufende Geschäftsarbeit also, ohne in das JSON-Protokoll einzutreten. Abbruch bleibt kooperativ: Methoden ohne den reservierten letzten Parameter laufen weiter, und eine Methode, die das signal erhält, muss es an ihre eigenen abbrechbaren Operationen weiterreichen oder direkt beobachten.

Die Lookup-Konfiguration wirkt derzeit auf Key-Granularität; jeder `agent`- oder `session`-Parameter nutzt also dieselbe Cold-Resume-Policy. Ein spezifisches Remote, das nur-live-Semantik braucht, muss auf eine explizite pro-Parameter- oder pro-Endpoint-Policy warten; die Geschäftsimplementierung kann nicht raten lassen, ob das Objekt gerade resumt wurde.
