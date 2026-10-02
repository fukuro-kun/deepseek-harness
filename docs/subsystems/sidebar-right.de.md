# Rechte Sidebar

[English](sidebar-right.md) | [中文](sidebar-right.zh.md) | Deutsch

Die rechte Sidebar ist die per-Session-Docking-Fläche des Web Client: eine Spalte aus Panes und Tabs neben der Conversation, in der adressierter Inhalt — eine Workspace-Datei, ein Directory-Tree, die eigenen Seiten des Produkts — geöffnet, gesplittet, gefloatet und geschlossen wird. [`dsh-client-ui-sidebar-right`](../../packages/client/ui-sidebar-right/README.de.md) besitzt die Fläche, die Tab-Type-Registry und den Navigation-Service; [`dsh-client-ui-dockkit`](../../packages/client/ui-dockkit/README.de.md) ist seine interne Layout-Engine; [`dsh-client-resources`](../../packages/client/resources/README.de.md) wandelt Adressen für jede Komponente in Live-Werte um; [`dsh-api-workspace-files`](../../packages/api/workspace-files/README.de.md) stellt sowohl den Host-Workspace-Service als auch den Client-`file`-Resource-Provider bereit.

Diese Seite ist die Referenz für die Contracts des Subsystems: Adressen, Tab-Type-Registrierung, der Navigation-Service, die Extension-Slots und ihre Owner-Props, das Resource-Model, der Workspace-Files-Service, die ausgelieferten Typen und was bewusst nicht gebaut ist. Wie Layout-Engine, Frame und Fläche zusammenpassen, steht im [Agent Note](../../.agents/notes/implemented/feature/2026-09-04-right-sidebar-docking-infrastructure.md); die Slot-Mechanik steht in der [Slots-Referenz](slots.de.md).

## Position und Ownership

Pro Session existiert eine Docking-Fläche, gehalten in einem session-scoped Slot-Store und gezeichnet von `rightbar.session`. Der root-scoped `rightbar`-Controller mountet diesen Seat nur, solange Conversation ausgewählt ist; ein Reload versetzt jede Session in den collapsed Default zurück, und beim Session-Wechsel bleibt jede Fläche, wo sie war ([State](../../packages/client/ui-sidebar-right/README.de.md#state)). Jede Änderung der Fläche ist ein aufgezeichneter History-Eintrag, den die puren Planner des Kit berechnen; ein gedocktes Pane bleibt nie leer, und ein leeres Root-Pane erhält die aus registrierten Guide-Einträgen ausgewählte Default-Page.

Ein Tab-Type besteht aus zwei Registrierungen, die sich die `id` der Definition teilen: eine statische Definition in `ctx.sidebarRightTabs`, die sagt, welche Adressen ihr `kind` öffnet, und eine keyed Slot-Registrierung, die ihren Body liefert. Das Framework injiziert `useTabInfo()` für Live-Informationen zu Sidebar, Pane und Tab; jeder Type hält seinen eigenen State in seinem Slot-Store. Packages importieren die Deklarationen der anderen nur als Types.

| Package | Rolle |
|---|---|
| [`client/ui-sidebar-right`](../../packages/client/ui-sidebar-right/README.de.md) | Die Panel- und Rail-Seats, der Layout-Store, `ctx.sidebarRightTabs`, `ctx.sidebarRight`, die Tab-Domain, der Guide-Type |
| [`client/ui-dockkit`](../../packages/client/ui-dockkit/README.de.md) | Pure Layout-Engine und React-Fläche; interne Dependency von `ui-sidebar-right`, kein stabiles Interface |
| [`client/resources`](../../packages/client/resources/README.de.md) | `ctx.resources`, `useResource`, das Protokoll → Wert-Roster `ResourceProtocolMap` |
| [`api/workspace-files`](../../packages/api/workspace-files/README.de.md) | Host-`ctx.workspaceFiles`, der `workspaceFiles`-Remote-Namespace und der Client-`file`-Resource-Provider |
| [`util/workspace-path`](../../packages/util/workspace-path/README.de.md) | Die Datei-Adress-Grammatik: `fileAddressFor`, `parseFileAddress` |
| [`client/ui-sidebar-documentpreview`](../../packages/client/ui-sidebar-documentpreview/README.de.md), [`client/ui-sidebar-files`](../../packages/client/ui-sidebar-files/README.de.md) | Die ausgelieferten `text`- und `files`-Typen |

## Adressen

Jeder Tab wird über einen Adress-String geöffnet, und die Adresse ist die Content-Identität des Tabs. Es gibt zwei Familien.

Eine **Resource-Adresse** ist eine `dsh-resource://<type>/…`-URL. Der Host benennt das Resource-Protokoll — den Key von `ResourceProtocolMap` — und alles danach ist der protokolleigene Pfad; ein Scheme bedient jedes Protokoll, sodass ein neues Protokoll einen Host hinzufügt, nie ein Scheme. Der Pfad des `file`-Protokolls beginnt mit seinem Scope: `session/<sessionId>` gefolgt vom Pfad relativ zur Workspace-Root dieser Session (`dsh-resource://file/session/abc/src/notes.txt`), oder `absolute` gefolgt vom absoluten Pfad ohne führendes `/` (`dsh-resource://file/absolute/home/ys/notes.txt`, unter Windows `dsh-resource://file/absolute/C:/x/y.txt`). Jede Id und jedes Pfadsegment ist component-encoded, wobei `:` für Drive-Letter literal bleibt. `fileAddressFor(sessionId, cwd, path)` baut eine — ein relativer Pfad oder ein absoluter Pfad innerhalb der Workspace wird `session`-relativ, jeder andere absolute Pfad wird `absolute` — und `parseFileAddress(address)` liest sie zurück oder gibt `undefined` zurück ([Grammatik](../../packages/util/workspace-path/README.de.md)).

Eine **Page-Adresse** ist das, was die Sidebar für einen Tab aufzeichnet, der per kind statt per Resource geöffnet wurde: `sidebar://<kind>`, geschrieben von der Sidebar selbst, wenn `openTab(kind)` läuft. Caller bauen sie nie — der Guide und der File-Tree werden als `openTab('guide')` und `openTab('files')` geöffnet — und es existiert keine weitere Navigationsadresse ([nicht gebaut](#not-built)).

Die Tab-Identität ist das Paar `(kind, address)`: Der Claim der Registry verwendet die Adresse wörtlich als `contentId` des Records, sodass das Öffnen derselben Adresse über denselben Type den vorhandenen Tab findet, und dieselbe Adresse über zwei Types zwei Tabs ergibt.

## Tab-Type-Registrierung

`ctx.sidebarRightTabs.register(definition)` registriert eine Implementierung eines Types für die Lifetime des Callers und gibt den Disposer zurück; der Caller hält sie in seinem eigenen `ctx.effect`, sodass eine Implementierung genau so lange lebt wie das Plugin, das sie beigetragen hat, und eine zweite Registrierung derselben `id` wirft ([Extension-Seats](../../packages/client/ui-sidebar-right/README.de.md#extension-seats)). Die Definition ist statisch: kein Runtime-Hook, nichts pro Tab oder pro Session.

| Feld | Bedeutung |
|---|---|
| `id` | Die Identität der Implementierung, eindeutig über alle Registrierungen; ein Package-Name ist der natürliche Wert (`@deepseek-ai/dsh-client-ui-sidebar-files`). Es ist der Key, unter dem Body und Title registriert werden. |
| `kind` | Der Diskriminator des Types: was seine Tabs sind und was `openTab` benennt. Nicht eindeutig — eine Extension kann das kind eines Builtin übernehmen. Die ausgelieferten kinds sind `guide`, `text`, `files`. |
| `patterns` | Optionale Resource-Adress-Globs, die der Type erkennt; ein per kind geöffneter Page-Type lässt sie weg. Ein Pattern mit `:` matcht die gesamte Adresse (`dsh-resource://file/**`); eines ohne matcht den Pfad der URL in beliebiger Tiefe (`*.md`), und eine Adresse, die keine URL ist, matcht kein solches Pattern. Das Matching ist case-insensitive und versteckt keine Dotfiles; die Syntax ist der POSIX-Dialekt von picomatch. |
| `priority` | Eine von drei Literal-Bands: `extension` (der Default und die höchste: ein Type von außerhalb des Produkts übertrumpft jeden ausgelieferten Viewer), `builtin` (mit dem Produkt ausgelieferte Types), `fallback` (Plain-Content-Viewer, die jeder spezifischere schlagen soll). |
| `canOpen(address)` | Optionales synchrones Veto gegen einen Glob-Match; läuft bei jeder Routing-Entscheidung. |
| `title(address)` | Der Text des Chip, beim Öffnen des Tabs in den Layout-Record übernommen und nie umgeschrieben. |
| `guide` | Optionale Entry-Boxen für die Guide-Page: `{ order, title(), description?(), icon? }`. Die Auswahl einer Box öffnet den beitragenden Type als Page; weglassen, um nicht auf der Page zu erscheinen. |

Routing ist ein gerankter Claim. `candidates(address)` rankt die Types, deren Patterns matchen und deren `canOpen` nicht vetoes: nach Band, dann nach der Länge des längsten gematchten Patterns, dann nach Registrierungsreihenfolge. `claim(address, kind?)` wählt den ersten Kandidaten oder direkt das benannte `kind` — dessen Globs werden übersprungen, dessen `canOpen` gilt weiterhin — und gibt `{ kind, contentId: address, title }` zurück. Eine Adresse, die kein Type claimt, wirft: Das ist ein Wiring-Fehler, kein User-Fehler.

Ein `kind` darf gleichzeitig eine `builtin`- und eine `extension`-Registrierung tragen. Die Extension ist die für Claims, `get(kind)`, `openTab(kind)` und die Guide-Page geltende, und der Seat findet Body und Title eines Tabs unter der `id` der geltenden Definition, sodass keine Slot-Priority im Spiel ist; meldet sich die Extension ab, übernimmt wieder das Builtin. Jede andere Kollision auf einem kind und jede duplizierte `id` wirft.

```ts ignore-check
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'

export const inject = ['sidebarRightTabs', 'slots']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: '@acme/dsh-client-ui-image',
    kind: 'image',
    patterns: ['*.png', '*.jpg', '*.gif', '*.svg'],
    canOpen: address => address.startsWith('dsh-resource://file/'),
    title: address => address.slice(address.lastIndexOf('/') + 1),
  }), 'image type')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: '@acme/dsh-client-ui-image' },
    ImageBody,
  )), 'image body')
}
```

## Navigation: `ctx.sidebarRight`

Zwei Opens bilden den Navigation-Controller, und jeder Weg in die Spalte ruft einen davon auf: `openResource(address, options?)` für eine `dsh-resource://`-Adresse — die File-Links der Conversation, die Zeilenreferenz einer Tool-Row, die Zeilen eines File-Tree — und `openTab(kind, options?)` für eine Page — das Add-Control des Strip, eine Guide-Entry-Box. Beide laufen vier Schritte als einen History-Eintrag — claimen (die Registry rankt die Types der Resource, oder die geltende Implementierung des benannten `kind` antwortet); einen Tab fokussieren, der bereits dasselbe `(kind, address)` zeigt; sonst einen neuen Tab seaten; die Spalte expandieren — und zeichnen dann die Navigation in der Tab-Domain auf ([Service](../../packages/client/ui-sidebar-right/README.de.md#ctxsidebarright)). Inhalt, den der User nicht sehen kann, wird nicht geöffnet, sodass eine collapsed Spalte im selben Schritt expandiert. `openResource` wirft für eine Adresse außerhalb von `dsh-resource://` oder eine, die kein Type claimt; `openTab` wirft für ein kind, das nichts registriert hat: Beides sind Wiring-Fehler, keine User-Fehler.

| Option | Bedeutung |
|---|---|
| `paneId` | Neuen Tab in diesem Pane landen; Default ist das aktive gedockte Pane (das erste gedockte Pane, solange ein floating Pane aktiv ist). |
| `replaceTab` | Pane und Strip-Slot dieses Tabs übernehmen und ihn im selben Schritt schließen; ein floating Tab stellt keinen Platz zur Verfügung, sodass der neue Tab landet, als wäre kein Platz angegeben. |
| `revealIfOpened` | Default `true`: Ein Tab, der bereits dasselbe `(kind, address)` zeigt, wird fokussiert und erhält `params`. `false` öffnet unabhängig davon einen weiteren Tab. |
| `kind` (nur `openResource`) | Den öffnenden Type benennen statt Claims zu ranken; dessen geltende Implementierung öffnet die Adresse, und dessen `canOpen` gilt weiterhin. |
| `params` | Navigationsparameter für den Body, geliefert als `navigation.params`. `openResource` typisiert sie per Resource-Type über die merge-erweiterbare `SidebarRightResourceParamsMap` (die Text-Preview deklariert `{ line?: number }`); `openTab<K>` typisiert sie per kind über `SidebarRightTabParamsMap`, `undefined` für ein kind, das keine deklariert; ein Body liest `SidebarRightNavigationParams`, die Union beider. Werte sind konventionell JSON-förmig und werden zur Laufzeit nicht validiert. |

Die Platzierung ist die Option des Callers, nie eine Eigenschaft eines Types. Die Conversation ruft `openResource(fileAddressFor(sessionId, cwd, path))` und fügt aus einer `read`-Tool-Row `{ params: { line } }` aus dem 1-basierten `offset` des Calls hinzu; eine Guide-Entry-Box ruft `tab.actions.openTab(entry.kind, { replaceTab: true })`; eine File-Tree-Row ruft `tab.actions.openResource(address)`; das Add-Control des Strip ruft `openTab('guide', { paneId, revealIfOpened: false })`.

`close(tabId)` schließt einen Tab; `active()` gibt den aktiven Tab des aktiven Panes zurück; `isExpanded()` und `toggleExpanded()` lesen und flippen die Spalte, wobei der Flip in der Sequenz aufgezeichnet wird. Reads beantworten den No-Session-Fall mit `undefined` oder `false`; Writes brauchen eine gemountete Session-Fläche und werfen ohne eine, statt in eine Fläche zu schreiben, die niemand zeichnet.

`focus(tabId)` macht einen Tab zum aktiven Tab seines Panes; `split(paneId?)` splittet das aktive gedockte Pane oder das benannte und gibt die Id des neuen Panes zurück — oder `undefined`, ohne etwas aufzuzeichnen, wenn das Pane-Budget oder die Spaltenbreite einen Split verbietet; `float(tabId, rect?)` hebt einen Tab in ein floating Pane; `dock(paneId)` führt ein floating Pane in den gedockten Bereich zurück. Alle vier laufen über die bestehenden Actions des Stores und zeichnen je einen History-Eintrag auf; ein Ziel, das nicht existiert oder bereits im gewünschten Zustand ist, ist ein No-op, und wie `open` werfen sie ohne eine gemountete Session-Fläche. `TabId`, `PaneId`, `TabRecord` und `FloatRect` werden aus dem `/client`-Entry des Packages re-exportiert, sodass ein Caller keinen dockkit-Import braucht.

## Slots und Owner-Props

Die Sidebar deklariert vier Extension-Slots; ihr Document-Tab deklariert zusätzlich den keyed Document-Body unten ([Hierarchie](slots.de.md)).

| Slot | Kardinalität | Zweck |
|---|---|---|
| `sidebar.right.pane.tab` | keyed nach `id` der Definition, Session-Scope | Der Body eines Tabs. Der Seat dispatcht einen Tab an die `id` der geltenden Implementierung seines kind, sodass der Registrant jeden Tab seines kind erhält, gedockt oder floating. Ein kind, dessen Implementierung keinen Body registriert hat, rendert den „nothing can view this"-Hinweis des Owners. |
| `sidebar.right.pane.tab.title` | keyed nach `id` der Definition, Session-Scope | Der Title des Chip, mit demselben Owner-Share wie der Body. Optional: Ohne Entry zeigt der Chip den beim Öffnen erfassten `title(address)`-Text; ein Type mit live Title liest hier seinen eigenen Store. |
| `sidebar.right.tab.guide` | chain, Session-Scope | Ersetzt den Inhalt des Guide-Tabs, ohne den Tab zu ersetzen; der erste nicht ablehnende Entry übernimmt den Body, sonst rendert der ausgelieferte Guide. |
| `sidebar.right.tab.menu.item` | list, Session-Scope | Content-level Actions, angehängt hinter den eigenen Layout-Actions des Kit. Ein Item, das handelt, muss das `dismiss()` des Owners aufrufen. |
| `sidebar.right.tab.document` | keyed nach `id` der Document-Implementierung, Session-Scope | Der ausgewählte File-Renderer innerhalb des Document-Tabs; der Parent besitzt die geteilten Lade- und Toolbar-Controls. |

Body, Title und Guide-Ersatz erhalten das framework-injizierte `useTabInfo()`. Es gibt `{ sidebar, panel, tab }` zurück: `sidebar` hält `expanded` und `fullscreen`, `panel.id` benennt das enthaltende Pane, und `tab` enthält dessen Record-Felder plus `visible`, `navigation`, `signal` und `actions`. Gedockte Bodies sind nur sichtbar, solange expanded und aktiv; gedockte Titles brauchen nur Expansion; Floats bleiben sichtbar. `signal` aborted, wenn der Record verschwindet oder das Plugin entlädt, nicht beim Verstecken oder beim Session-Wechsel. `tab.actions` stellt `openResource`, `openTab` und `close` bereit, gebunden an die eigene Session des Tabs. Die Open-Platzierung defaultet auf sein aktuelles Pane; `revealIfOpened` defaultet auf `true`, und `replaceTab: true` ersetzt diesen Record im selben History-Eintrag. Menu-Entries behalten die einfachen Owner-Parameter `tab` und `dismiss`.

`navigation.revision` inkrementiert bei jeder Navigation zum Tab, ob sich `params` geändert hat oder nicht, sodass ein Body allein auf „erneut navigiert" reagieren kann; es ist `1` für einen per Adresse geöffneten Tab und `0` für einen Record, den niemand per Adresse geöffnet hat — ein geseedeter Guide oder ein per Undo wiederhergestellter Tab. Die Tab-Domain hält eine Occurrence pro offenem Record: Ein Record, der erscheint, wird im Resource-Model gepinnt, sodass ein Tab-Wechsel einen Body unmountet, ohne seinen Inhalt fallen zu lassen; ein Record, der verschwindet, wird aborted und gedroppt; ein per Undo wiederhergestellter Record ist eine neue Occurrence ([Tab-Domain](../../packages/client/ui-sidebar-right/README.de.md#the-tab-domain)).

## Document-Renderer

Der `text`-Tab ist der geteilte Document-Preview-Owner. Seine [Root-Registrierung](../../packages/client/ui-sidebar-documentpreview/src/client/index.ts) deklariert `sidebar.right.tab.document` und stellt `ctx.documentPreviews` bereit. Ein Renderer registriert `DocumentPreviewDefinition`-Metadaten in seinem eigenen Effect, wartet dann über `ctx.slots.inject('sidebar.right.tab.document', ...)` und registriert seine Komponente mit `key: definition.id` und seinem Locale-Namespace. Ein Wechsel des Renderers ändert weder Tab noch Resource-Adresse; die [Extension-Entscheidung](../../.agents/notes/implemented/architecture/2026-09-08-document-preview-operations.md) trennt Preview-Policy von Resource-Ownership.

Die [Registry](../../packages/client/ui-sidebar-documentpreview/src/client/document/registry.ts) zeichnet die eindeutige `id`, `extensions`, lokalisiertes `title()`, `loading`, optionales `priority` und optionales `wrap` auf. Case-insensitive Suffix-Matching rankt `extension` (der Default) vor `builtin`, dann längere Suffixe vor kürzeren, dann Registrierungsreihenfolge. Anders als beim Tab-kind-Ersatz hält die Registry alle Implementierungen verfügbar; die Toolbar listet passende Alternativen und merkt sich die Auswahl pro Tab. Unbekannte Extensions nutzen Plain Text. `loading` ist `text-pages` oder `bytes-complete`; `wrap` bewirbt Support für das geteilte Source-wrap-Control.

[`DocumentPreviewProps`](../../packages/client/ui-sidebar-documentpreview/src/client/document/contract.ts) leitet sich von `PropsRuntime<'sidebar.right.tab.document'>` ab. Der Owner liefert die ursprüngliche `resourceAddress`, `content` und das aktuelle `wrap`: Text-Content ist `{ kind: 'text', text, pages: [{ offset, text, lines }], eof }` mit kumulativem `text`; vollständige Bytes sind `{ kind: 'bytes', data }` mit `Uint8Array<ArrayBuffer>`-Daten. Diese transienten Buffer werden read-only geliehen und dürfen nicht in durable Layout- oder Session-JSON gelangen. PDF kopiert die Bytes vor dem Worker-Transfer und erhält so den Buffer des Owners. Das Child erhält dasselbe framework-gebundene `useTabInfo` und das globale, nur Metadaten liefernde `useResource`. Der Parent liest über gewöhnliche inject-Callbacks nach `remote.workspaceFiles.read`/`readAll` und besitzt Page-Appends, per-Tab-Refresh und den Ladestatus. Der eigene inject-Callback von HTML nutzt `readRelated`; Pfade löst Host-Code auf. Markdown und Code behalten über Appends hinweg einen incremental Renderer und settlen bei EOF; HTML und PDF erhalten vollständige Bytes.

Preview zeichnet die geladene Version und die beim Start eines Reads beobachtete Version auf. Refresh liest nur diesen Tab erneut, ohne geteilte Metadaten oder den Inhalt eines anderen Tabs zu ändern. Reads sind nicht transaktional; Versionen sind opake Gleichheits-Token, keine geordneten Timestamps ([Resource-Observation und Preview-RPC](../../.agents/notes/implemented/architecture/2026-09-08-document-preview-operations.md)).

## Resource-Model

Das Model ist in [Client Resources](client-resources.de.md) dokumentiert; dieser Abschnitt nennt, worauf die Sidebar sich verlässt. Eine Resource ist eine Adresse, und eine Resource-Adresse ist eine `dsh-resource://<type>/…`-URL, deren kleingeschriebener Host der Protokoll-Key ist. Das besitzende Client-Package des Protokolls registriert einen Provider mit `ctx.resources.register(provider)` für seine eigene Lifetime; ein zweiter Provider für dasselbe Protokoll wirft ([ein Protokoll bereitstellen](../../packages/client/resources/README.de.md#provide-a-protocol)). Ein Provider ist `{ protocol, open(address, { signal }) }`: `open` liefert `RemoteResult`-Frames — zuerst den aktuellen Zustand, dann einen Frame pro späterer Änderung — und stoppt, wenn `signal` abortet; ein Fehlschlag ist ein `{ ok: false, error }`-Frame, nie ein Throw, und ein Throw innerhalb des Streams ist ein Programmierfehler, den das Model nicht fängt.

`useResource<P>(address)` ist ein globales Standard-Prop auf jeder Slot-Komponente, unabhängig vom Scope. Es gibt `{ status, value, failure }` zurück: `none`, wenn das Protokoll der Adresse keinen Provider hat oder die Adresse keine Resource-Adresse ist (`sidebar://guide` benennt keine Resource), `loading` bis zum ersten Frame, `live` mit dem letzten `ok`-Wert, `failed` mit dem Fehlschlag des letzten Frames neben dem letzten Wert. ([eine Resource lesen](../../packages/client/resources/README.de.md#read-a-resource)).

Eine Resource bleibt offen, solange sie einen Holder hat — ein subscribed `useResource` oder ein `ctx.resources.pin(address, signal)`; der erste Holder öffnet den Stream des Providers, spätere Holder teilen ihn und lesen sofort den letzten Wert, und das letzte Release abortet den Stream und verwirft den Wert. Streams tragen Metadaten, nicht Content: Der `file`-Wert ist `{ absolutePath, version, bytes? }`, und ein Consumer liest Datei-Text selbst, seitenweise, über den Workspace-Files-Service ([Lifecycle](../../packages/client/resources/README.de.md#lifecycle)).

## Workspace Files

Der Host-`ctx.workspaceFiles`-Service und der generierte `workspaceFiles`-Remote-Namespace lesen Dateien, die das Session-Filesystem-Backend erlaubt: `stat(path)` gibt `{ absolutePath, version, bytes? }` zurück; `read(path, { offset?, limit? })` gibt eine Seite Zeilen zurück (`offset` 1-basiert, `limit` durch die konfigurierte Seitengröße gedeckelt) als `{ …stat, offset, text, eof }`; `readBytes(path, { offset?, length? })` gibt ein rohes Byte-Fenster zurück (`offset` 0-basiert, `length` durch das konfigurierte Byte-Limit gedeckelt) als base64 `{ …stat, offset, data, eof }` ohne Text-Decoding. `list(path)` bleibt innerhalb der Workspace-Root und gibt die direkten Children eines Directory zurück (`name`, `type: 'file' | 'directory' | 'other'`, `size?`), auf die konfigurierte Obergrenze gekürzt mit gesetztem `truncated`. `changes()` bleibt ebenfalls workspace-scoped und liefert `{ kind: 'ready' }`, sobald subscribed, dann `{ kind: 'change', change }`-Frames, deren Payload `{ absolutePath, version }` oder `{ absolutePath, absent: true }` ist ([README](../../packages/api/workspace-files/README.de.md#use-this-package)). Dateioperationen lehnen finale Symlinks ab und erzwingen Transfer-Limits; `read` erfordert zusätzlich UTF-8-Text. Fehlschläge nutzen `workspace-file/*`-Codes ([Fehlschläge](../../packages/api/workspace-files/README.de.md)).

[`dsh-api-workspace-files`](../../packages/api/workspace-files/README.de.md) registriert den `file`-Provider, wobei `ResourceProtocolMap.file` direkt `WorkspaceFileStat` benennt. Eine Session-Adresse trägt die autorisierende Session und einen relativen oder absoluten Pfad, unverändert an den Host zur Auflösung weitergereicht. Der Provider wartet vor dem stat auf Host-`ready` und filtert Changes nach `stat.absolutePath`. Bare `absolute`-Adressen haben keine autorisierende Session und schlagen mit `workspace-file/unknown-workspace` fehl, ohne die aktuelle oder Tab-Session zu leihen. Jedes UI, einschließlich Global-Komponenten, teilt die Observation für dieselbe vollständige Adresse. Die gewöhnlichen Remote-Callbacks der Preview nutzen die Session aus dieser Adresse; Host-`readAll` und `readRelated` bleiben bestehen, und das `rpc.ts` der Preview decodiert Byte-Ergebnisse.

## Ausgelieferte Types

- **`guide`** — `builtin`, geöffnet als `openTab('guide')`. Ein gedämpfter Kompass sitzt über einer Kapsel pro beigetragenem `guide`-Entry, in `order`; kurze Listen zeigen registrierte Beschreibungen, und jedes fehlende Icon nutzt den ausgelieferten Platzhalter. Die Auswahl einer Kapsel öffnet den beitragenden Type als Page an der Stelle des Guide-Tabs. Ein Pane hält höchstens einen Guide-Tab, und das Add-Control des Strip erscheint nur, solange sein Pane keinen hat. Ein neues Pane erhält die registrierte Default-Page: direkt den einzigen Guide-Entry oder den Guide, wenn die Entry-Anzahl nicht eins ist ([Guide](../../packages/client/ui-sidebar-right/README.de.md#the-guide)).
- **`text`** — `fallback`, `dsh-resource://file/**`, claimt nur Session-Adressen. Document Preview beobachtet Metadaten über `useResource<'file'>`, lädt Inhalt über Remote-Callbacks und besitzt Renderer-Auswahl, Toolbar, per-Tab-Refresh, Scroll und Source-Navigation; unbekannte Extensions rendern als Plain Text ([README](../../packages/client/ui-sidebar-documentpreview/README.de.md)).
- **`files`** — `builtin`, geöffnet als `openTab('files')`. Der Workspace-Directory-Tree, lazy über `list` gelistet, öffnet eine Datei mit `tab.actions.openResource(fileAddressFor(sessionId, root, path))` in sein eigenes Pane ([README](../../packages/client/ui-sidebar-files/README.de.md)).

<a id="not-built"></a>
## Nicht gebaut

- Persistence: Der Layout-State liegt nur im Speicher; ein Reload startet jede Session collapsed, und die Tabs einer Session sind von keiner anderen aus sichtbar.
- Ein Read-only-Layout-Snapshot oder -Subscription auf `ctx.sidebarRight`: Der Service exponiert nur Operationen, und dockkits `LayoutState`/`LayoutOp` sind intern.
- Ein Capability-Discovery-Array (`features`) auf dem Service.
- Eine `option`-Priority-Band für Tab-Types: Nichts listet einen Tab-Type, ohne ihn claimen zu lassen.
- Retitling eines Records: `title(address)` wird einmal erfasst; ein live Chip kommt aus dem Title-Slot, nicht aus dem Record.
- Einen Tab-Implementierung beim Öffnen benennen: `openResource` benennt höchstens ein kind; die Document-Renderer-Auswahl gehört der Toolbar des File-Tabs.
- Eine Adress-Suche auf dem Service (`find`): Ein Caller öffnet mit `revealIfOpened` und lässt die Fläche deduplizieren.
- Navigationsadressen jenseits der eigenen `sidebar://<kind>`-Buchführung der Sidebar; ihre Grammatik wartet auf den Navigation-Controller als Ganzes.
- Ein User-facing Undo, ein Content-Navigation-Stack und Tab-Icons ([zurückgestellt](../../.agents/notes/implemented/feature/2026-09-04-right-sidebar-docking-infrastructure.md#deferred)).
