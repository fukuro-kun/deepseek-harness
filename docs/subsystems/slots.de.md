# Web Client Slots
[English](slots.md) | [中文](slots.zh.md) | Deutsch


Slots sind das typisierte React-Kompositionssystem des Web Client. [`dsh-client-ui-slots`](../../packages/client/ui-slots/README.de.md) definiert die React-freie Registry und die Typ-Algebra; [`dsh-client-ui-renderer`](../../packages/client/ui-renderer/README.de.md) bindet observable Quellen an Hooks, rendert den Baum und besitzt die React-Kontexte intern. Ein Feature-Plugin trägt UI über `ctx.slots.register()` bei und importiert niemals eine Komponente eines anderen Feature-Plugins.

Diese Seite dokumentiert Slot-Ownership, Komponenten-Inputs, die Erweiterungs-APIs und die ausgelieferte Hierarchie. Die umgebenden Boot-, Remote-, Client-Model- und Conversation-Pfade stehen in der [Web-Client-Architektur](web-client.de.md).

## Deklaration und Lebenszyklus

`SlotMap` ist die Compilezeit-Registry. Ein Package merged per Deklaration den Key, die Kardinalität, den Scope, die Owner-Props, die Keyed-Props und optional das slot-level inject face hinein. Die Laufzeitdeklaration ist der passende `children`-Eintrag auf der Komponente, die die Render-Position besitzt.

Die Deklaration eines Child hat drei Effekte: Sie macht den Child-Key live, autorisiert den `renderSlot`- oder `renderSlotChain`-Aufruf des Parent-Entry und zeichnet die Laufzeit-Dispatch-Spezifikation auf. Jede Deklaration hat genau einen lebenden Owner. Eine Registrierung in einen nicht deklarierten Slot oder die Deklaration eines Child, das bereits anderweitig vergeben ist, schlägt während der Plugin-Aktivierung fehl.

`root` ist die einzige eingebaute Deklaration und der einzige Key, der über den Cordis-Service selbst gerendert wird. `ui-renderer` ruft `ctx.slots.renderSlot('root', {})` auf; jeder Nachfahre wird über das `renderSlot`- oder `renderSlotChain`-Prop des Entry gerendert, der ihn deklariert hat.

Registrierungen und Deklarationen folgen den Cordis-Effect-Lifetimes. Das Disposen eines Entry entfernt dessen Beitrag und kollabiert rekursiv die Child-Slots, die er deklariert hat. Ein Feature, das in den Slot eines anderen Packages beiträgt, nutzt daher `ctx.slots.inject(key, callback)`: Der Callback läuft für jede Deklarations-Lifetime, seine Effekte werden entfernt, wenn der Owner kollabiert, und er läuft erneut, wenn der Owner wieder gemountet wird.

```tsx ignore-check
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

type HeaderActionProps = PropsRuntime<'conversation.session.header.actions'>

function HeaderAction({ useSession }: HeaderActionProps) {
  const running = useSession(snapshot => snapshot.running)
  return <button disabled={running}>Review</button>
}

export const inject = ['slots']

export function apply(ctx: Context): void {
  ctx.slots.inject('conversation.session.header.actions', () =>
    ctx.slots.register({
      name: 'conversation.session.header.actions',
      id: 'review',
      order: 100,
    }, HeaderAction))
}
```

## Kardinalität und Scope

Die Slot-Deklaration fixiert zwei unabhängige Achsen.

| Achse | Wert | Bedeutung |
|---|---|---|
| cardinality | `single` | Eine Zelle. Der aktuelle Priority-Sieger rendert. Für nebeneinander stehende Inhalte einen Child-Slot deklarieren statt dies als additive Liste zu behandeln. |
| cardinality | `list` | Zellen werden über das Pflicht-`id` adressiert und nach `order` geordnet, dann nach Registrierungsreihenfolge. |
| cardinality | `keyed` | Der Owner dispatcht einen `entryKey`; die passende Zelle rendert mit den key-spezifischen Props. |
| cardinality | `chain` | Jeder Entry liefert eine pure `select(owner)`-Funktion. Das erste Nicht-null-Ergebnis in Priority-Reihenfolge rendert und erhält dieses Ergebnis als `matched`; andernfalls rendert der Owner-Fallback. |
| scope | `root` | Eine root-scoped Komponenten- und Store-Instanz. |
| scope | `session-maybe` | Folgt der aktuellen Auswahl, bleibt aber ohne Session renderbar; Session-Werte sind optional. |
| scope | `session` | Erfordert ein aufgelöstes Session-Binding und erhält definite Session-Werte. |

`priority` ist ein Shadowing-Rang für `single`-, `list`- und `keyed`-Zellen und eine Wahlreihenfolge für `chain`. Kleinere Werte laufen oder rendern zuerst. Gewöhnliche additive Beiträge sollten eine frische List-`id` oder einen keyed `key` wählen; das absichtliche Wiederverwenden einer ausgelieferten Zelle ersetzt deren Darstellung.

## Komponenten-Inputs

Eine registrierte Komponente erhält Inputs, die an ihrer Binding-Stelle assembliert werden. Komponenten leiten diese Typen ab, statt deren Member zu kopieren.

| Input | Deklariert von | Komponententyp |
|---|---|---|
| Owner-Werte und Standard-Scope-Werte | die `SlotMap`-Zeile und installierte Scope-Adapter | `PropsRuntime<K>` |
| autorisierte Child-Renderer | die `children`-Keys der Registrierung | `PropsRenderSlots<S>` |
| Selector-Hook und Mutation-Callbacks für geteilten View-State | der `store` der Registrierung | `PropsStore<H>` |
| private Daten, Callbacks und observable Hooks | die `inject`-Factory der Registrierung | `InjectFace<I>` |
| lokalisierte `t`-Funktion | der `locale`-Namespace der Registrierung | `PropsLocale<N>` |
| ausgewählter Chain-Wert | das `select`-Ergebnis der Registrierung | `matched` über `ComposedProps` |

`SessionProvider` ist ebenfalls in `PropsRenderSlots` enthalten, wenn ein Entry ein striktes Session-Child deklariert. Er bindet diesen Teilbaum an die aktuelle Session-Identität und mountet den Body neu, wenn sich die Identität ändert.

Komponenten erhalten niemals `ctx`. Zeitpunktgebundene Werte, die dem Parent bekannt sind, kommen über das Owner-Argument von `renderSlot` herein; geteilter View-State nutzt einen deklarierten Store; Services und Model-Objekte bleiben im `apply`-Closure und werden in Callbacks oder observable Quellen projiziert.

## Vom Framework bereitgestellte Hooks

Die ausgelieferten Adapter fügen diese Standard-Props hinzu. Sie sind je nach Scope des Ziel-Slots verfügbar, unabhängig davon, welches Package die Komponente registriert hat.

| Verfügbarkeit | Props | Owner |
|---|---|---|
| jeder Scope | `useSessions`, `useSessionPendingInteraction` | `ui-session` |
| jeder Scope | `useWorkspaces` | `ui-workspace` |
| jeder Scope | `usePanelInfo` | `ui-layout` |
| `session` | `sessionId`, `useSession`, `useProjection` | `ui-session` |
| `session-maybe` | optionale `sessionId`-, `useSession`-, `useProjection`-Ergebnisse | `ui-session` |
| `session` | `useConversation`, `useInput`, `inputActions` | `ui-conversation` |
| `session-maybe` | optionale `useConversation`-, `useInput`-, `inputActions`-Ergebnisse | `ui-conversation` |
| `session` | `useChat` | `ui-chat` |
| `session` | `useTrajectory` | `ui-trajectory` |

Der Renderer erzeugt außerdem `useStore` aus einem deklarierten Store und `t` aus einem deklarierten Locale-Namespace. Diese sind registrierungsabgeleitete Props, keine globalen Standard-Props.

Framework- und Domain-Adapter-Owner können den Standard-Satz über `ctx.slots.provideRoot()` oder `ctx.uiSession.provide()` zusammen mit dem entsprechenden `GlobalStandardProps`-, `SessionStandardProps`- oder `SessionMaybeStandardProps`-Declaration-Merge erweitern. Eine Feature-Komponente sollte selbst kein React-Hook-Prop erzeugen und kein globales Standard-Prop für entry-private Daten hinzufügen.

## Entwicklerseitige Injection

Die `inject`-Option einer Registrierung ist der gewöhnliche feature-eigene Injection-Point. Ihre Factory läuft in der `apply`-Welt des Plugins, darf über injizierte Cordis-Services closen und gibt nur die Daten und Callbacks zurück, die die Komponente braucht. Für einen `session`-Slot erhält sie `sessionId`; für `session-maybe` erhält sie `sessionId | undefined`; bei deklariertem Store erhält sie zusätzlich die gebundenen Actions des Stores.

Ein reserviertes `hooks`-Objekt in diesem Rückgabewert nimmt bare `getSnapshot`/`subscribe`-Quellen entgegen. Der Renderer wandelt `hooks: { status }` in ein Komponenten-Prop `useStatus(selector)` um und cached das Binding nach Quell-Identität. Komponenten erhalten die Quelle selbst nicht und rufen `useSyncExternalStore` nicht direkt auf.

Der Owner eines Slots kann ein `inject`-Face in die Child-Deklaration legen, wenn jeder Occupant dieselbe Fähigkeit braucht. Einfache Member erreichen alle Occupants unverändert. Funktionswertige Member in seinem `hooks`-Objekt sind Hook-Factories; sie erhalten die Standard-Props des Slots und einen optionalen per-render `hookContext` und geben dann den eingeschränkten Hook zurück, der dem Occupant ausgesetzt wird. `conversation.chat.node` nutzt diesen Mechanismus, um `useTurnData(key)` für den gerade gerenderten Node bereitzustellen.

Owner-Props für Werte, die bei einem Render-Vorkommnis bereits bekannt sind; Registrierungs-`inject` für Callbacks und private Observables eines einzelnen Entry; slot-level `inject` für eine vom Slot-Owner kontrollierte Fähigkeit; und einen deklarierten Store für veränderlichen View-State, der über Entries geteilt oder über Remounts hinweg erhalten wird. React-Nodes komponieren über Child-Slots, nicht über injizierte Werte.

## Aktuelle Hierarchie

Die folgende Hierarchie ist der ausgelieferte Deklarationsbaum. Ein Child existiert nur, solange der benannte Parent-Entry gemountet ist; optionale Feature-Entries können einen Teilbaum daher als eine Lifecycle-Einheit erscheinen oder verschwinden lassen.

```text
root
├─ sidebar
│  ├─ sidebar.brand.mark
│  ├─ sidebar.brand.name
│  ├─ sidebar.panellist
│  ├─ sidebar.footer.action
│  ├─ sidebar.workspaces
│  │  └─ sidebar.workspaces.directoryFlow
│  └─ sidebar.settings
│     ├─ settings.trigger
│     ├─ settings.header
│     ├─ settings.action
│     ├─ settings.close
│     ├─ settings.onboarding
│     └─ settings.section
│        ├─ settings.general.item
│        ├─ settings.models.provider-card
│        ├─ settings.models.footer
│        └─ settings.plugins.tab
│           └─ settings.plugin.item
├─ main
│  └─ main.conversation
│     ├─ conversation.session
│     │  └─ conversation.view
│     │     ├─ conversation.chat.node
│     │     │  ├─ conversation.chat.assistant-actions
│     │     │  ├─ conversation.chat.commandview
│     │     │  ├─ conversation.chat.turnTail
│     │     │  └─ tool.call.toolview
│     │     │     ├─ tool.call.images
│     │     │     └─ tool.view.cordis
│     │     ├─ conversation.message.images
│     │     └─ conversation.trajectory.images
│     ├─ conversation.session.header
│     │  ├─ conversation.session.header.lineage
│     │  ├─ conversation.session.header.actions
│     │  ├─ conversation.session.header.utilities
│     │  └─ conversation.session.header.corner
│     ├─ conversation.composer
│     │  └─ conversation.approval.detail
│     ├─ conversation.composer.bar
│     │  ├─ conversation.input.attachments
│     │  ├─ conversation.input.plan
│     │  └─ conversation.input.model
│     ├─ conversation.input.overlay
│     ├─ conversation.input.dock
│     ├─ conversation.composer.dock
│     ├─ conversation.input.left
│     ├─ conversation.input.right
│     ├─ conversation.hero.brand.mark
│     ├─ conversation.hero.workspace
│     │  └─ conversation.hero.workspace.directoryFlow
│     └─ conversation.hero.agentPreset
├─ rightbar
│  └─ rightbar.session
│     ├─ sidebar.right.pane.tab
│     │  └─ sidebar.right.tab.guide
│     ├─ sidebar.right.pane.tab.title
│     └─ sidebar.right.tab.menu.item
└─ shell.overlay
```

Der generierte Client-inspect-Katalog ist der erschöpfende Vertrag für jeden Key: Kardinalität, Scope, Owner-Props, Standard-Props, aktuelle Occupants, Deklarations-Owner und Ersetzungsrisiko. Ein laufendes dynamisches Package kann den Live-Baum und einen exakten Key mit `cordis_inspect what:"client"` abfragen; der Quell-Katalog wird von `pnpm run gen-client-catalog` aus `SlotMap`-Deklarationen und `slots.register()`-Aufrufstellen generiert.

## Erweiterungsregeln

- Ein anderes Feature-Package nur für Deklarationen per `import type` importieren; niemals dessen Laufzeitwerte importieren oder re-exportieren.
- Einen neuen Child-Slot nur in der Komponente deklarieren, die diese Position besitzt und rendert. Andere Packages warten mit `ctx.slots.inject()` und tragen über `ctx.slots.register()` bei.
- Business- und Transport-State in ihren besitzenden Cordis-Services oder Client-Modellen halten. Slot-Stores halten nur geteilten Viewing- und Interaktions-State.
- Identitäten von observable Quelle und Snapshot zwischen Änderungen stabil halten. Bei Wertänderung über dieselbe Quelle republishen.
- Zwischen UI-Domains nur JSON-kompatible Daten und Callbacks übergeben. Das `hooks`-Compartment ist die einzige Ausnahme für bare Observables; React-Inhalte reisen über Slots.
- `single` und eine besetzte keyed Zelle als Ersetzungspunkte behandeln. Für additive Erweiterungen List-Ids oder einen unbesetzten Key verwenden.
