# Agent Note: Der Slot-System-Standard — ein einziges register, vier Props-Shares und der Framework-Store-Seat

Status: implemented

[English](2026-07-22-slot-type-chain-implementation.md) | [中文](2026-07-22-slot-type-chain-implementation.zh.md) | Deutsch

> Geltungsbereich: das definitive Slot-System-Design für den Web-Client — wie UI-Plugins die Seite komponieren, wo Render-Authority liegt, wie Komponenten-Props typisiert sind und wo Business-Live-Daten leben. Das [Web-Client-Architektur-RFC](2026-07-19-gui-web-client-architecture.md) besitzt den umgebenden Kontext (Ladekette, Objektschicht, Services) und verweist seine Slot-Abschnitte hierher.

## Problem

Die Seite wird zur Laufzeit aus unabhängig geladenen Plugins komponiert, daher braucht die UI einen Kompositionsmechanismus, der vier Fragen mit statischer Kraft beantwortet. Wer darf in eine Region rendern — und ist diese Authority erzwingbar oder nur konventionell? Wie erhält eine Komponente alles, was sie braucht, während sie eine pure Funktion bleibt (kein ctx, keine Framework-Imports), ohne dass jeder Wert per Hand durch Assembly-Code gefädelt wird? Wo leben Business-Live-Daten, damit Streaming-Updates präzise die Subscriber neu rendern — ohne dass jedes Plugin seine eigene Subscription-Maschinerie baut? Und wie viel davon kann der Compiler prüfen, sodass eine gedriftete Komponente, ein übergriffiger Render-Call oder ein unpassendes Store-Schema ein Compile-Error an einer sichtbaren Call-Site ist statt einer Runtime-Überraschung?

## Entscheidung

Globale Main-Panel-Auswahl und deren Root-Lifetime definiert die [Global-Main-Panels-Entscheidung](2026-09-08-global-main-panels.md).

Ein Satz: **der ui-renderer rendert nur `'root'`; ein Plugin komponiert UI über einen einzigen `register`-Call, der gleichzeitig einen Slot besetzt, seine Child-Slots deklariert+autorisiert, seinen Store deklariert und seine Business-Face injiziert; Komponenten sind pure Funktionen, deren Props in vier Shares ankommen, jeder automatisch aus seiner einzigen Quelle abgeleitet.**

### 'root' ist der einzige a-priori-Slot

`SlotRegistry` (Client-Runtime) deklariert `'root'` bei Konstruktion — single/root, `owner: {}` — und sein `SlotMap`-Merge lebt im Runtime-Package. Die gesamte Assembly des ui-renderers ist `ctx.slots.renderSlot('root', {})`: der einzige ctx-level Render-Einstieg; jeder andere Key, ein fehlender Renderer oder ein unregistriertes Root schlägt laut fehl (kein Fallback).

### register ist die einzige API; children = Deklaration + Autorisierung + Runtime-Spec

```ts ignore-check
ctx.slots.register({
  name: 'root',
  children: {
    'sidebar':      { kind: 'single', scope: 'root' },
    'main':         { kind: 'keyed', scope: 'root' },
  },
  store: createLayoutStore,      // StoreHandle or factory (below)
  inject: injectFrame,           // business face (below)
}, AppFrame)
```

Es gibt keine separate Slot-Definition-API. Das `children`-Objekt **deklariert die Child-Slots in die Existenz** und **autorisiert diese Komponente, sie zu rendern** — ein Slot ist eine Lücke im Render-Baum, die existiert, weil jemand sie rendern wird, daher ist sein Lifecycle der Lifecycle des deklarierenden Entry (Entry disposed → Slots weg, Contributions geleert). Die Werte sind die Runtime-Spec (`kind`/`scope` treiben Outlet-Iteration und Binding-Auswahl; `SlotMap` ist types-only und zur Laufzeit eradiert, weshalb ein Array von Keys nicht funktionieren könnte), statisch gegen den `SlotMap`-Eintrag geprüft, sodass Typ und Wert an einer Stelle deklariert und gegengeprüft werden.

Parity-Regel: **der deklarierende Entry hält das exklusive Recht, seine Child-Slots zu rendern**, vollständig zur Register-Zeit entschieden (Misconfiguration schlägt laut beim Load fehl; der Render-Hot-Path trägt keine Checks). Loud-at-Load-Fälle: ein zweiter Entry, der einen bereits deklarierten Slot deklariert; Registrierung in einen undeklarierten Slot; ein Store-Handle unter zwei Scopes gemountet; eine Chain-Registrierung ohne ihr `select`.

Ein Contributor, dessen Aktivierungsreihenfolge vom deklarierenden Entry unabhängig ist, nutzt `ctx.slots.inject(key, callback)` und behält das direkte `register()`-Fail-Loud. Die Deklarations-, Contributor-, Replacement- und Failure-Lifetimes spezifiziert die [Slot-Declaration-Injection-Entscheidung](../../archived/architecture/2026-08-05-slot-declaration-injection.md).

`SlotMap`-Declaration-Merging bleibt die Typ-Authority, und ein Entry deklariert nur seine eigenen Achsen plus den **Owner-Share** — die injizierten Props des Registranten gelangen nie in die globale Tabelle („wer sie injiziert, besitzt ihren Typ").

### Komponenten-Props: vier Shares, jeder aus seiner eigenen Quelle

| Share | Typ | Quelle | Inhalte |
|---|---|---|---|
| runtime | `PropsRuntime<K>` | SlotMap-Eintrag für K | `OwnerOf<K>` (Render-Site-Params) + Session-Scope-Standard `useSession`/`sessionId` + global `useSessions`/`useWorkspaces` |
| child render | `PropsRenderSlots<S>` | `children`-Keys von register | `renderSlot(key, owner)`, Key statisch auf S verengt; Chain-Keys fügen `renderSlotChain` hinzu |
| store | `PropsStore<H>` | Return-Typ der Store-Factory | `useStore`-Selector-Hook + `actions.*` (Draft-Param gestrippt) |
| business | `I` | Inject-Return-Typ | plain Data + Callbacks; ein reserviertes `hooks`-Kompartiment nackter Observables kommt gebunden als `use<Name>`-Selector-Hooks an (`InjectFace<I>`) |

`sessionId` wird framework-geliefert, wo immer `scope: 'session'` deklariert ist — Owner-Params tragen es nicht. Die Register-Call-Site ist der Double-Lock-Choke-Point: Eine Komponente, deren renderSlot-Keys die `children`-Deklaration überschreiten, die eine deklarierte Face verfehlt oder deren Store-/Inject-Formen driften, ist ein Compile-Error auf dieser Zeile. Delegation ist gewöhnliches Props-Passing (die `renderSlot`-Funktion weiterreichen, optional hinter einer engeren Signatur) — es gibt kein Whitelist-Face-Objekt und keine Minting-API.

### Das chain-kind: Entries nominieren sich selbst, der erste Match rendert

Das vierte `SlotKind`, `'chain'`, invertiert die Routing-Authority relativ zu `keyed`: Eine keyed Dispatch-Site wählt ihren Occupant per `entryKey`, während ein Chain-Entry sich selbst nominiert — der Owner dispatched eine gemeinsame Währung von Owner-Props und erfährt nie, wer übernimmt, sodass ein neues Takeover-Package mit null Owner-Edits registriert. Eine Chain-Registrierung trägt einen `select`-Pure-Selektor (`ChainSelect<O, M>`: `(owner) => matched | null`) und eine optionale `priority` (aufsteigend; Gleichstände behalten Registrierungs- = Assembly-Reihenfolge — die deployment-steuerbare Inject-Topologie — unter demselben stabilen Sort wie List-`order`); Registrierung ohne `select` ist einer der obigen Loud-at-Load-Fälle. Beim Rendern führt das Outlet die Selektoren in Chain-Reihenfolge aus: Die erste non-null-Rückgabe wählt ihren Entry, und der zurückgegebene Wert tritt den Komponenten-Props als `matched` bei (die Komponente leitet ihren eigenen Match nie neu ab), `null` reicht den Zug an den nächsten Entry weiter, und All-null rendert den Fallback-Body des Owners (`ChainRenderOpts`).

Die Ablehnungsentscheidung lebt in `select`, nie in einer gemounteten Komponente, die ihre eigenen Props sondiert: Eine Komponente, die nur mountet, um null zu rendern, führt ihre Hooks und Effects umsonst aus, und der resultierende Mount-/Unmount-Churn bricht Memoization und React-Key-Semantik, während ein Selektor eine pure Funktion ist — unit-testbar, null Mount-Seiteneffekte — dieselbe Disziplin wie „Presentationsmethoden sind pure Funktionen von `args`". Purity ist der Contract des Selektors: Er liest keinen externen veränderlichen State und erzeugt keine Seiteneffekte, sodass die Routing-Entscheidung vollständig eine Funktion der Owner-Props ist und sicher bei jedem Dispatch laufen kann. Selektoren routen; sie minten nie — Per-Dispatch-Objektkonstruktion würde bei jedem Render Identity churnen, daher geschieht das Wrappen eines gematchten Werts in eine reichere Face innerhalb der gewählten Komponente (`useMemo` keyed auf `matched`).

In der Type-Chain ist die SlotMap-Form eines Chain-Entry `{ kind: 'chain'; scope; owner }` mit `owner` als Währung der Chain; `M` — der Typ des `matched`-Props — wird aus dem Select-Return inferiert (ein Selektor, der ein Union-Member verengt, typisiert `matched` automatisch), und die Komponentenposition bleibt aus der `M`-Inferenz heraus, dasselbe NoInfer-Ruling, das den Inject-Share pinnt (Rulings unten). Auf der Owner-Seite gesellt sich `renderSlotChain(key, owner, { fallback })` zu `renderSlot` im `PropsRenderSlots`-Share, seine Key-Domäne statisch auf die Chain-Kind-Keys der Children-Deklaration des Entry verengt (`ChainKeysOf`); die Dispatch-Site ist eine Zeile und hält keine eigene Derivation oder Routing-Logik.

### Der Store-Seat: Framework-Engine, Registranten-Schema

Das Framework besitzt exakt eine Subscription-Maschine: Die Snapshot-Store-Engine (zustand vanilla + immer + optionale localStorage-Persistenz) lebt im **Runtime-Package** (`./client`-Main-Entry — kein Subpath) und erzeugt nackte Observable-Quellen; ui-renderer bindet sie am Outlet zu Hooks (per-Source gecachtes uSES-Binding). Was ein Store *enthält*, ist die Deklaration des Registranten, als Factory geschrieben, damit kein Module-Level-Handle existiert (ein module-scoped Handle wäre ein De-facto-Singleton, der Plugin-Reloads überlebt):

```ts ignore-check
export function createChatStore() {
  return defineStore({
    init: () => ({ selection: null as SelectionTarget | null, draft: '' }),
    persist: 'dsh.conversation.chat',
    actions: {
      select:    (d, t: SelectionTarget) => { d.selection = t },
      clearDraft:(d) => { d.draft = '' },
    },
  })
}
```

Eine Factory, drei Konsumstellen: (a) `register` — die Factory für einen exklusiven Store übergeben, oder sie einmal in `apply` aufrufen und dasselbe Handle an mehrere Registers übergeben, um die Instanz zu teilen (Cross-Plugin-Sharing ist konstruktiv unmöglich: Das Handle verlässt das Package nie); (b) `PropsStore<ReturnType<typeof createChatStore>>` leitet den Store-Share der Komponente ohne handgeschriebene Members ab; (c) Tests rufen die Factory auf und `.create()`en eine echte Engine-Instanz und füttern `useSelector`/`actions` direkt als Props — Produktions-Outlets laufen denselben `create`-Pfad, sodass es keine zweite Maschinerie gibt.

Store-Scope wird **aus dem Scope des mountenden Entry abgeleitet** (Session-Slot → eine Instanz pro Session, die mit der Session lebt und stirbt; Root-Slot → eine pro Entry). Read = `props.useStore`; Write = nur `props.actions.*` — die rohe Instanz (mit `update`/`set`) erreicht nie eine Komponente, sodass die deklarierten Actions die vollständige, auditierbare Mutations-API sind. Produktionscode ruft die Factory oder `create` nie außerhalb von `apply` auf.

### inject: die Business-Face des Registranten, auf seinem eigenen ctx

Eine Inject-Factory nimmt, was ihre Deklarationen ihr einbringen — `sessionId` für Session-Slots, gebundene `actions` bei deklariertem Store, sonst nichts — und liest Services über den **eigenen ctx der apply-Closure**, sodass ihre Capability-Grenze die deklarierte `inject`-Topologie des Plugins ist (der Cordis-Property-Proxy greift nativ; es gibt kein Assembly-Handle, das einen weiteren ctx trägt). Ihr Rückgabewert ist plain Data und Callbacks, plus höchstens das reservierte `hooks`-Kompartiment: eine Map nackter Observable-Quellen (getSnapshot+subscribe), die der Renderer zu `use<Name>`-Selector-Hooks bindet, bevor die Face die Komponente erreicht — der registrant-private Zwilling des Hooks-Kompartiments des Provide-Kanals, für reaktive Fakten, die zu nischig für das globale Standard-Kit sind (Composer-Notices/-Lexikon, die Settings-Nav-Rows). Komponenten erhalten nie die rohen Quellen, sodass Business-Code weiterhin keine Subscription-Maschinerie enthält. Alles andere bleibt plain: die verengte Read-/Write-Face der eigenen Services des Plugins, Cross-Service-Orchestrierung (z. B. `send` = `actions.clearDraft()` + `ctx.conversation.send(...)`) und Per-(Entry×Session)-Assembly-Seiteneffekte. Keine handgemachten Hooks, keine ReactNode-Produzenten, keine Whole-Service-Objekte — Verengung ist der Wert: Was eine Komponente kann, ist exakt die Return-Form der Factory.

### Data-Boundary-Disziplin

Hooks sind nur framework-gemacht: `useSession`, `useSessions`, `useWorkspaces`, `useStore`, `renderSlot` plus die aus Provide-Contributions und Inject-`hooks`-Kompartimenten gebundenen Hooks — jeder von der einzigen Binding-Maschinerie des Renderers synthetisiert; Business-Code reicht plain Data und Callbacks zwischen Eltern und Kind (die eigenen behavioral Hooks einer Komponente, die nichts Externes subscriben, bleiben in Ordnung). Live-Daten haben exakt drei Kanäle: Was der Parent weiß, reist als Owner-Props an der RenderSlot-Site; was nur die Komponente weiß, ist lokaler State; was über Entries geteilt werden oder Remounts überleben muss, ist ein deklarierter Store. Derivation ist eine pure Funktion über Framework-Hook-Daten (`useMemo`), nie eine eigene Subscription.

### Tree-Kontext und der Renderer-Contract

`SessionProvider` ist eine Framework-Komponente, **als Standard-Kit-Seat geliefert**: Ein Entry, dessen `children` einen Session-Scope-Slot deklarieren, erhält sie als Prop (Typ in ui-slots, Wert vom Renderer injiziert) — Komponenten importieren sie nie als Wert. Sie ist selbst-verdrahtet (liest intern den Current-Session-State der Runtime; der Assembler übergibt nichts), render-prop-förmig — `children(sessionId)` mit einem `empty`-Branch, remountend unter `key={sessionId}`. `BindingContext` ist machinery-intern; Business-Komponenten sehen null React-Contexts. Inject-Factories laufen absichtlich innerhalb des Outlets (Per-Entry-Error-Boundaries fangen sie; ein abstürzender Registrant schwärzt nur seinen eigenen Entry, während Assembly-Errors rethrown); das Outlet liest Tree-Kontext als machinery-only impliziten Parameter — die „Identität aus der Register-Closure, Situation aus der Baumposition"-Trennung.

Rendering lebt hinter einem Installations-Contract, damit die Runtime React-frei bleibt: `SlotRenderer` (Interface in ui-slots, Implementierung `createSlotRenderer()` in ui-renderer) wird einmal beim Shell-Boot via `ctx.slots.install(...)` installiert; doppelte Installation und Render-vor-Install werfen. Ownership-Buchführung ist eine einzige `Map<key, entry>` im Service — Ledger, Slots, Contributions, Render-Bindings und Store-Instanzen leben und sterben alle auf der einen Entry-Achse, was das Stale-Authority-Fenster über Plugin-Reloads konstruktionsbedingt schließt (das gefangene `renderSlot` eines disposed Entry wirft beim Eintritt einen Stale-Authorization-Error).

### Type-Chain-Implementierungsrulings

Zwei Härtungsentscheidungen in der Register-Signatur existieren, weil die naheliegende Alternative auf eine spezifische, reproduzierbare Weise scheitert; ein künftiger Bearbeiter sollte sie nicht neu verhandeln:

1. **`SlotComponent<P>` (nackte Call-Signatur) statt `FC<P>` an der Registrierungsposition.** Reacts `FC` trägt statische Felder (`propTypes`, `defaultProps`), deren Typen `P` in kovarianten Positionen referenzieren; Assignability zwischen zwei `FC`-Instantiierungen prüft diese Statics ebenfalls und lehnt Komponenten ab, die das Design akzeptieren will. Die nackte Call-Signatur prüft nur durch saubere Parameter-Kontravarianz; Komponenten bleiben gewöhnliche Funktionen.
2. **`NoInfer<I>` pinnt die Inferenz des Business-Shares auf die Inject-Factory.** Ohne es sammelt TS auch Inferenzkandidaten aus der Komponenten-Parameterposition, und eine gedriftete Komponente (die einen Key konsumiert, den die Factory nicht liefert) verbreitert `I` still, sodass der Call prüft — und absorbiert exakt den Drift, den die Chain fangen soll. Die Negative-Sample-Spec pinnt dies: Wird das `NoInfer` je „wegsimplifiziert", geht die Expect-Error-Site zuerst rot.

## Konsequenzen

Render-Authority ist erzwingbar statt konventionell: Wer was rendert, ist ein Load-Time-Fakt, und das Auditieren der UI-Struktur = das Lesen der Register-Calls; für Chain-Slots ist WER rendert zusätzlich ein Render-Time-Fakt, doch die entscheidenden Selektoren sind Register-Site-Deklarationen, sodass der Audit-Scope die Register-Calls bleibt. Jede Props-API wird statisch aus einer Quelle abgeleitet (SlotMap-Eintrag, Children-Keys, Store-Factory, Inject-Return), sodass sich eine Schema-Änderung per Compiler statt per Grep propagiert. Plugins tragen keine eigene Subscription-Maschinerie — Store-Lifecycle (Per-Session-Instanzen, Disposal, Persistenz) ist Framework-Semantik auf die Entry-Achse gekeyed. Kosten: Registrierungsoptionen sind dicht (Children-Spec-Objekte); das Framework trägt reale Inferenzmaschinerie (`defineStore`s Init-/Actions-Same-Round-Inferenz kann einen Curry-Fallback brauchen); und die Compile-Time-Double-Locks bedeuten, dass Prototyp-Stadium-Drift ein harter Error ist, keine Warnung.

## Erwogene Alternativen

| Abgelehnt | Ein-Zeilen-Grund |
|---|---|
| Separate define/register-Zweischritt-API | Die Trennung lässt Render-Authority unerzwungen und lädt Ordering-Bugs ein; Children-in-Register klärt Deklaration, Autorisierung und Spec an einer sichtbaren Stelle |
| Whitelist-Face-Objekte (`ScopedSlots` + Narrowing-Helpers) | Da die Whitelist bereits im Props-Typ der Komponente steht, ist die Face maschinell ableitbar; ein mintbares Face-Objekt ist eine dritte Authority-API mit Runtime-only-Checks |
| Assembly-Handles, die Root-ctx in inject tragen | Umgeht deklarierte Inject-Topologie — jede Factory könnte jeden Service erreichen, sodass package.json-Dependency-Deklarationen nichts mehr bedeuten |
| `children` als Key-Array | kind/scope sind Runtime-Dispatch-Daten; SlotMap ist eradiert, sodass ein Array eine zweite Spec-Registrierungs-API erzwingt — eine Definition-API wiedergeboren |
| Business-handgemachte Hooks / rohe Observables in Komponenten-Props | Jedes Plugin wird zu seiner eigenen Subscription-Maschine; das Inject-`hooks`-Kompartiment trägt dieselben Fakten durch die eine auditierte Binding-Maschinerie |
| Module-Level-Store-Handles | Ein Module-Scope-Handle ist ein Singleton über Plugin-Reloads und Testfälle; die Factory-Form scopet Identität auf den Apply-/Test-Aufruf |
| Komponenten, die die Store-Instanz erhalten | `update`/`set` im Render-Code macht die Mutations-API unauditierbar; deklarierte Actions halten „was sich ändern kann" einen Register-Site-Fakt |
| `FC` an der Register-Position / `I` aus der Komponente inferieren | FC-Statics erzeugen kovarianten Noise, der valide Komponenten ablehnt; komponentenseitige Inferenz absorbiert Props-Drift still (siehe Rulings oben) |
| Keyed-Dispatch mit Owner-seitigem Routing für Takeover-Slots | Der Owner akkumuliert Per-Entry-Contracts und eine hardcoded Routing-Tabelle (`find` + `entryKey` pro Takeover); die Chain-Währung hält neue Takeover-Registrierungen bei null Owner-Edits |
| Komponenten, die durch Null-Render ablehnen | Ablehnen erfordert erst Mounten — Hooks und Effects laufen umsonst, und Mount-/Unmount-Churn bricht Memoization und Key-Semantik; ein purer Selektor entscheidet ohne Komponenteninstanz |
