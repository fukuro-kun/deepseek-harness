# Agent Note: Tab-Typen und Navigation der rechten Sidebar

Status: implemented

[English](2026-09-05-sidebar-tab-types-and-navigation.md) | [中文](2026-09-05-sidebar-tab-types-and-navigation.zh.md) | Deutsch

## Problem

Die [Docking-Oberfläche](../feature/2026-09-04-right-sidebar-docking-infrastructure.de.md) gibt der rechten Sidebar Panes, Tabs und schwebende Panels, aber ein Pane voller Tabs ist nur nützlich, wenn andere Plugins Inhalt hineinlegen können. Das braucht drei Verträge, die die Oberfläche selbst nicht definiert: wie ein Plugin eine Art Tab und die Adressen deklariert, die es anzeigen kann; wie ein beliebiger Aufrufer — ein Produced-File-Chip in der Konversation, eine Zeile in einem Dateibaum, ein eigener Button eines Plugins — die Sidebar bittet, etwas anzuzeigen; und worauf sich der Body eines Tabs zur Laufzeit verlassen darf. Jeder Vertrag ist eine öffentliche Seite, gegen die Plugins geschrieben werden, die von außerhalb dieses Repositories ausgeliefert werden; jeder muss also feststehen, bevor diese Plugins existieren: Ein umbenanntes Feld, ein geänderter Enum-Wert oder eine andere Adressgrammatik bricht danach jedes einzelne.

Zwei Einschränkungen prägten die Antworten. Dynamische Client-Plugins dürfen keine Laufzeitwerte voneinander importieren — keine Funktion, keine Konstante, keine Klasse — nur Typen; nichts in diesen Verträgen darf daher eine Hilfsfunktion oder eine exportierte Konstante aus dem Sidebar-Package erfordern. Und der Web-Client hat bereits ein Komponentenmodell, das Slot-System; ein zweites für Tabs wäre ein paralleles Framework zum Lernen und Pflegen.

## Entscheidung

Ein Tab-Typ ist eine statische Registrierung in `ctx.sidebarRightTabs`; Body und Titel eines Tabs sind gewöhnliche keyed-Slot-Registrierungen; `ctx.sidebarRight` öffnet Inhalt auf genau zwei Arten — eine Ressource per Adresse oder eine Seite per Kind — und bedient sonst nur das Layout; Bodies lesen Vorkommensinformationen über das framework-injizierte `useTabInfo()`. Die vier Seiten sind unten in der Reihenfolge beschrieben, in der ein Plugin-Autor ihnen begegnet.

### Die Typ-Registry: `ctx.sidebarRightTabs`

`register(definition): () => void` zeichnet einen Tab-Typ auf und gibt den Disposer zurück, den der Aufrufer in seinem eigenen `ctx.effect` hält; ein Typ lebt also exakt so lange wie das Plugin, das ihn beigetragen hat. Die Definition ist statisch:

```ts ignore-check
interface SidebarRightTabDefinition {
  readonly id: string                                   // this implementation's identity in the tab system
  readonly kind: string                                 // what the tabs of this type are; what openTab names
  readonly patterns?: readonly string[]                 // resource-address globs; omitted by a page type
  readonly priority?: 'extension' | 'builtin' | 'fallback'   // defaults to extension
  readonly canOpen?: (address: string) => boolean       // veto after a glob matched
  readonly title: (address: string) => string           // chip text, captured at open time
  readonly guide?: readonly SidebarRightGuideEntry[]    // entry boxes on the guide page
}
```

`id` und `kind` sind verschiedene Dinge. `kind` ist der Typ-Diskriminator — was ein Tab *ist*, was `openTab` benennt, woraus die Tab-Identität gebaut wird. `id` ist die Identität einer *Implementierung* eines Kinds, eindeutig über alle Registrierungen hinweg; ein Package-Name ist der natürliche Wert. Die beiden sind getrennt, weil ein Kind nicht eindeutig ist: Eine `extension` darf das Kind registrieren, das ein `builtin` bereits hält, und die beiden Implementierungen koexistieren dann in der Registry, wobei die Extension gilt. Die Registry lehnt eine zweite Registrierung einer `id`, eine zweite Registrierung im selben Band eines Kinds und jede Registrierung ab, die einen `fallback` desselben Kinds trifft; sie akzeptiert exakt das extension-over-builtin-Paar, und das Builtin tritt wieder in Kraft, wenn die Extension sich abmeldet.

`patterns` sind Globs über Ressourcenadressen, gematcht mit `picomatch` unter VS Codes Editor-Resolver-Regel mit einer lokalen Änderung: Ein Pattern mit `:` wird gegen die ganze Adresse gematcht (`dsh-resource://file/**`), eines ohne gegen den Pfad des URI in beliebiger Tiefe (`*.md`); das Matching ignoriert Groß-/Kleinschreibung und versteckt keine Dotfiles, und eine Adresse, die kein URI ist, matcht kein Pfad-Pattern. Ein Seitentyp — der Guide, der Dateibaum — erkennt keine Adresse und lässt `patterns` weg; er wird per Kind geöffnet.

`priority` ist eines von drei literalen Bändern, als Strings geschrieben, damit ein Typ aus einem anderen Package keinen Laufzeitimport braucht: `extension` ist das Band eines Typs von außerhalb des Produkts und das höchste, sodass ein Typ, der nichts deklariert, jeden hier ausgelieferten Viewer übertrumpft; `builtin` ist das gewöhnliche Band für ausgelieferte Typen; `fallback` ist die Position für einfachen Inhalt, die alles Spezifischere schlagen soll — in VS Code hält der Texteditor sie implizit, unsere Textvorschau hält sie explizit. `candidates(address)` gibt jeden Typ zurück, dessen Globs matchen und dessen `canOpen` nicht vetot, gerankt nach Band, dann nach der Länge des längsten gematchten Patterns, dann nach Registrierungsreihenfolge. `claim(address, kind?)` nimmt den besten Kandidaten oder bei Override durch den Aufrufer den in Kraft befindlichen Typ des genannten Kinds (dessen Globs nicht konsultiert werden; den Typ zu nennen ist die Entscheidung) und wirft für eine Adresse, die nichts öffnen will — ein Verdrahtungsfehler, kein Nutzerfehler. `get(kind)` gibt den in Kraft befindlichen Typ zurück; `entries()` und `guide()` listen die Typen und ihre Guide-Boxen in Kraft; `subscribe` beobachtet Änderungen.

`title(address)`, `guide[].title()` und das optionale `guide[].description()` sind Thunks, die bei jeder Nutzung gelesen werden, sodass ein Sprachwechsel keine Neu-Registrierung braucht. [Guide-Startseite und Stat-Pill-Verfeinerungen](../feature/2026-09-10-guide-start-page-and-stat-pill-refinements.de.md) besitzt die aktuellen Regeln für Beschreibungssichtbarkeit und Fallback-Glyphen. Die Registry selbst ist ein schlichtes Objekt, das auf `apply`s oberster Ebene **ohne** `Service.tracker` bereitgestellt wird: Ein Tracker würde `this.ctx` auf den Kontext des Aufrufers umbinden, und ein packageübergreifendes `register()` würde dann seinen Effekt zur Fiber des Aufrufers hinzufügen, solange diese Fiber der aktive Scope ist — und damit den Browser-Boot ohne Fehler zum Stehen bringen.

### Bodies und Titel: keyed-Slot-Sitze unter der `id` der Definition

Die Typ-Registry sagt, was ein Typ ist; das Slot-System sagt, wie er aussieht. Ein Typ registriert seinen Body im keyed, session-scoped Sitz `sidebar.right.pane.tab` unter seiner eigenen `id` und darf eine Titelkomponente unter demselben Schlüssel in `sidebar.right.pane.tab.title` registrieren. Der Sitz, der einen Tab zeichnet, löst das `kind` des Tabs über die Registry zum in Kraft befindlichen Typ auf und dispatcht zu dessen `id`, sodass eine Extension, die das Kind eines Builtin übernimmt, gerendert wird, ohne dass eines der Packages vom anderen weiß und ohne dass eine Prioritätszahl eine Package-Grenze überquert. Ein Kind ohne Typ in Kraft rendert den „nichts kann dies anzeigen"-Hinweis des Owners; ein Typ ohne Titel-Registrierung bekommt den `title(address)`-Text, den die Registry beim Öffnen des Tabs erfasst hat.

Zwei weitere Sitze erweitern Guide und Menü: `sidebar.right.tab.guide` ist eine Chain, deren erster nicht-ablehnender Eintrag den ausgelieferten Guide-Body ersetzt, ohne den Tab zu ersetzen, und `sidebar.right.tab.menu.item` ist eine Liste, die hinter den eigenen Layout-Aktionen des Kits angehängt wird — für Aktionen, die etwas über den Inhalt eines Tabs bedeuten. Die Controls eines Typs — ein Reload, ein Wrap-Toggle — leben in seinem eigenen Body; der Strip gehört dem Panel und trägt nur die Controls des Panels. Der eigene Zustand eines Typs ist ein gewöhnlicher Slot-Store und ein Inject-Gesicht auf der Body-Registrierung; das Framework fügt dem Komponentenmodell nichts hinzu.

### Vorkommensinformationen von Tabs

[Responsive Sidebar und Tab-Informationen](2026-09-07-sidebar-responsive-tab-info.md) ersetzt die Wahl flacher Owner-Props für Vorkommensinformationen aus dieser Note. Bodies, Titel und Guide-Ersetzungen erhalten das framework-injizierte `useTabInfo()`, um `{ sidebar, panel, tab }` zu lesen. Der Record, Navigation, Sichtbarkeit, Signal und gebundene Aktionen leben in `tab`; die exakten Felder gehören zur [Sidebar-Referenz](../../../../docs/subsystems/sidebar-right.de.md).

Die Tab-Domain besitzt weiterhin ein Vorkommen pro committetem Record, mit einem `AbortController`, einem Navigations-Snapshot und an seine Session gebundenen Aktionen. Sie pinnt die Adresse im [Ressourcenmodell](2026-09-05-client-resource-model.de.md) für die Lebensdauer des Records; Verstecken und Session-Wechsel beenden es nicht, während das Schließen des Records es abbricht und freigibt. Bestehende Framework-Store- und Navigations-Hooks liefern Live-Lesevorgänge, ohne Subscriptions in Tab-Implementierungen.

### Navigation: `ctx.sidebarRight`

Das Gesicht öffnet Inhalt auf zwei Arten und tut sonst nichts mit Inhalt:

```ts ignore-check
openResource(address: string, options?: { kind?: string; params?: SidebarRightResourceParams; paneId?; replaceTab?: TabId; revealIfOpened?: boolean }): void
openTab<K extends string>(kind: K, options?: { params?: SidebarRightTabParamsFor<K>; paneId?; replaceTab?: TabId; revealIfOpened?: boolean }): void
```

`openResource` nimmt eine Ressourcenadresse — einen `dsh-resource://<type>/…`-URI, das einzige Scheme, das das Ressourcenmodell hat — und fragt die Registry, wer sie zeigt: ohne `kind` wird jeder Typ konsultiert und das Ranking entscheidet; mit `kind` öffnet die in Kraft befindliche Implementierung dieses Typs. Eine Adresse mit einem anderen Scheme scheitert auf demselben Pfad wie eine Adresse, die nichts beansprucht. `openTab` öffnet einen Seitentyp per Kind und sieht niemals eine Adresse: Die Sidebar zeichnet den Tab unter `sidebar://<kind>` auf, an einer Stelle innerhalb des Packages komponiert, sodass ein Seiten-Tab wie jeder andere Tab eine `contentId` für Identität und Verlauf hat. Das Scheme ist Buchhaltung: Kein Aufrufer komponiert es, kein Business-Package enthält das Literal, und der Dateibaum und der Guide werden als `openTab('files')` und `openTab('guide')` geöffnet.

Beide Öffnungen laufen dieselben vier Schritte: den Typ auflösen (per Ranking oder per Kind), einen bestehenden Tab über `(kind, contentId)` lokalisieren, es sei denn `revealIfOpened` ist `false`, den Tab platzieren — in `replaceTab`s Pane- und Strip-Slot, in `paneId` oder im aktiven Pane — und die Expansion, das Öffnen-oder-Fokussieren und das `replaceTab`-Schließen als einen Verlaufseintrag aufzeichnen, bevor `{ address, params }` an die Tab-Domain übergeben wird. Platzierung ist Sache des Aufrufers, niemals eine Eigenschaft auf Typebene: Der Dateibaum öffnet in sein eigenes Pane, weil er es sagt, so wie VS Codes Explorer selbst `SIDE_GROUP` oder `ACTIVE_GROUP` übergibt. `replaceTab` bedeutet genau eines — an der Stelle dieses Tabs öffnen und ihn im selben Schritt schließen — und existiert für die Eintrittsboxen des Guides, die ihren Tab an die Seite übergeben, die sie benennen.

Parameter sind nach dem typisiert, was geöffnet wird, über zwei merge-erweiterbare Maps, die im Sidebar-Package deklariert und von den Ownern der Schlüssel augmentiert werden:

```ts
interface SidebarRightResourceParamsMap {}   // key: resource type — the text preview declares { line?: number }
interface SidebarRightTabParamsMap {}        // key: kind — a page type declares its own shape, or nothing
```

`openResource` akzeptiert die Union jeder deklarierten Ressourcenform und `openTab<K>` die für `K` deklarierte Form; ein Body verengt `navigation.params` nach dem Protokoll oder Kind, von dem er weiß, dass er es bedient. Parameter gehören zum Ressourcentyp statt zum Viewer, weil eine Zeilennummer eine Tatsache über eine Dateiposition ist, nicht über die Textvorschau, und jeder Typ, der `file`-Adressen beansprucht, dieselbe Form erhält. Werte müssen JSON-serialisierbar sein, und ein Record muss aus Adresse und Parametern allein wiederaufbaubar sein, weil Undo, Redo, Reload und HMR Tabs wiederaufbauen, nachdem der Öffner weg ist.

Neben den zwei Öffnungen trägt das Gesicht `close(tabId)`, `active()`, `isExpanded()`, `toggleExpanded()` und vier operative Methoden — `focus(tabId)`, `split(paneId?)` (gibt das neue Pane zurück oder `undefined`, wenn das Pane-Budget oder die Breitenregel den Split verbietet, und zeichnet nichts auf), `float(tabId, rect?)` und `dock(paneId)` — jede zeichnet einen Verlaufseintrag auf und ist ein No-op bei fehlendem Ziel oder einem Ziel, das bereits im gewünschten Zustand ist. Es gibt keinen Layout-Snapshot, keine Subscription und kein Nachschlagen per Adresse: Das Gesicht gewährt Kontrolle über das Layout, nicht eine Ansicht davon. Der Sitz veröffentlicht seine Bindung — seine Session, die Actions seines Stores und seine Oberfläche — solange er gemountet ist; ein Kommando auf dem öffentlichen Gesicht wirkt auf die gemountete Session und wirft ohne gemountete Session-Oberfläche. Die eigenen Aktionen eines Tabs erreichen stattdessen den Store ihrer eigenen Session: Die Slot-Laufzeit prägt einen Store pro Session, das Plugin übernimmt jeden bei seiner Prägung, und der Controller routet nach Session-ID, sodass eine Aktion, die nach einem Session-Wechsel des Nutzers feuert, noch ankommt und für eine Session ohne je geprägten Store nichts tut.

### Adressen

Adressen kommen in zwei Familien, die sich nie mischen. Ressourcenadressen sind die `dsh-resource://<type>/…`-URIs des Ressourcenmodells (eine Workspace-Datei ist `dsh-resource://file/session/<sessionId>/<path relative to that session's workspace root>`, eine beliebige Datei `dsh-resource://file/absolute/<absolute path>`, beide gebaut und geparst von `dsh-util-workspace-path`); sie sind es, was `openResource` nimmt, was `patterns` matchen und was `useResource` liest. Navigationsadressen benennen Seiten statt Daten; heute ist die einzige der interne `sidebar://<kind>`, unter dem ein Seiten-Tab aufgezeichnet wird. Nur die Ressourcenfamilie ist ein Vertrag: Die Navigationsfamilie wird innerhalb der Sidebar komponiert und konsumiert, und ein umfassenderes Navigationsprotokoll ist eine spätere Entscheidung, für die diese hier Raum lässt, indem sie jedes Navigationsliteral an einer Stelle hält.

### Einstiegspunkte

Das `openFile(path, { line? })` der Konversation — Pfad-Links in Tool-Zeilen, Produced-File-Chips, Erwähnungen in Abschlussnachrichten — kodiert den Pfad als Datei-Ressourcenadresse für die Session und ruft `openResource` mit `params.line`, wenn der Aufrufer eine kennt; die `read`-Tool-Zeile übergibt die Zeile, ab der ihr `offset`-Argument begann. Das `+` des Strips ruft `openTab('guide', { paneId, revealIfOpened: false })` für das Pane, in dem es sitzt; eine Guide-Eintrittsbox ruft `tab.actions.openTab(entry.kind, { replaceTab: true })`; eine Dateibaum-Zeile ruft `tab.actions.openResource(address)`, was im eigenen Pane des Baums landet.

## Erwogene Alternativen

**Ein Chain-Slot für Tab-Dispatch oder ein keyed Slot allein.** Das `select` einer Chain ist nicht enumerierbar, und die Guide-Seite und das Navigationsgesicht müssen Typen enumerieren; ein keyed Slot trägt einen Body und sonst nichts, sodass Titel und Adresserkennung eines Typs nirgends zu leben hatten. Zwei Stufen — eine Definitions-Registry plus keyed Komponentensitze — sind das bestehende Muster des Repositories (`ConversationViewRegistry`).

**Laufzeit-Hooks oder ein Instanzobjekt pro Tab.** Mehrere Formen wurden auf Papier versucht — eine Cordis-Fiber pro Tab, eine abstrakte Basisklasse, ein `initial`/`create`-Paar, das eine Instanz mit `dispose` zurückgibt, ein Satz `useTab*`-Hooks, ein framework-verwaltetes `useTabResource(fetch)`, ein `useTabStream`. Der Reihe nach abgelehnt: Eine Fiber pro Tab ist viel zu schwer; dynamische Packages können weder Basisklasse noch exportierte Konstante teilen; eine Instanzschicht dupliziert, was ein Slot-Store und Inject-Gesicht bereits sind; Per-Tab-Hooks erneuern Owner-Props nur; ein framework-eigenes Fetch hat keinen guten Cache-Schlüssel; und ein Stream-Hook auf der Tab-Domain fragt den falschen Owner — Chat-Daten müssen aus der Chat-Domain kommen, Dateidaten aus dem Workspace-Dateiservice. Übrig bleiben Owner-Props plus ein clientweites `useResource`. `visible` wurde später aus demselben Grund als Prop statt als Hook hinzugefügt: Es ist eine weitere Tatsache über das Vorkommen, und die Props tragen das Vorkommen bereits. Die Ablehnung vorkommenslesender Hooks wird von der [Tab-Informations-Entscheidung](2026-09-07-sidebar-responsive-tab-info.md) ersetzt; die unabhängige Begründung zu Instanz-, Fiber- und Datenstrom-Ownership gilt weiterhin.

**Ein Per-Pane-Tools-Sitz für die Controls des aktiven Tabs (`sidebar.right.pane.tab.tools`).** Für eine Review-Runde ausgeliefert, dann entfernt: Er setzte typprivate Buttons auf den Strip des Panels neben die Split- und Einklapp-Controls, wo sie als Panel-Chrome lasen. Die Controls eines Typs gehören in seinen eigenen Body.

**Platzierung auf Typebene (`opensInto`) und eine Heuristik mit verstecktem Geschwisterelement.** Abgelehnt: Wo ein Tab landet, ist Sache des Öffners, genau wie VS Codes Explorer `sideBySide` selbst entscheidet.

**Extension-Listen und numerische Prioritäten.** `claims.extensions` kann `.d.ts`, `Dockerfile`, eine Verzeichnisbedingung oder ein ganzes Scheme nicht ausdrücken — es ist ein degeneriertes Glob; numerische Prioritäten brauchen eine exportierte Konstante, die dynamische Packages nicht importieren können. Literale Bänder über Globs. VS Codes eigene Bänder wurden von fünf auf drei reduziert: Ein `option`-Band (gelistet, nie automatisch gewählt) hat keinen Consumer, bis eine „Öffnen mit…"-Affordanz existiert, und ein `default`-Band wurde in `extension` umbenannt, weil der Name als niedrigste Stufe las, während er die höchste ist.

**Ein `open(address)` für alles, mit einem Helper, der Seitenadressen baut.** Der erste Entwurf öffnete Seiten ebenfalls per Adresse, sodass ein Business-Package ein `sidebar://<kind>`-Literal oder einen `sidebarAddress(kind)`-Helper aus dem Sidebar-Package brauchte. Beides ist durch die Wert-Import-Regel verboten, und beides leakt ein Navigationsscheme, das noch nicht entworfen ist. Das Gesicht in `openResource` und `openTab` zu spalten legt das einzige Literal ins Package und lässt jeden Modus seine Parameter typen.

**Beim Öffnen eine bestimmte Implementierung benennen (`?impl=`), `find(address)`, `mode()`/`setMode()`, ein Layout-Snapshot, eine `features`-Liste.** Alles erwogen und weggelassen. Eine Implementierung zu benennen gehört zu einem Navigationsprotokoll, das noch nicht existiert; `find` und ein Snapshot würden das Gesicht zu einer Ansicht des Layouts machen, wo es Kontrolle darüber sein soll; der Präsentationsmodus ist ein UI-Toggle, kein Plugin-Anliegen; eine Fähigkeitenliste ist verfrüht, solange sich das Gesicht noch setzt.

**Slot-Prioritäten, um auszudrücken, dass eine Extension ein Builtin übernimmt, dann Registry-geprägte Slot-Keys.** Der erste Versuch ließ den übersteuernden Typ seinen Body mit niedrigerer Slot-Priorität über eine exportierte Konstante registrieren — ein Wert-Import über dynamische Plugins hinweg und ein zweites Regelsystem (Slot-Priorität), das für das der Registry einspringt. Der zweite Versuch ließ die Registry einen Schlüssel pro Registrierung prägen und aus `register()` zurückgeben, was die Registrierung zu einem zweistufigen Tanz mit relevanter Reihenfolge machte. Die Implementierung ihre eigene `id` deklarieren zu lassen — erforderlich, eindeutig, derselbe String, unter dem sie ihre Sitze registriert — braucht keine Konstante, keine Prägung und keine Reihenfolge und gibt der Registry die Identität, die sie braucht, um Duplikate abzulehnen.

## Konsequenzen

- Ein Typ ist ein statisches Objekt plus eine oder zwei keyed-Sitz-Registrierungen; seine Vorkommensinformationen werden über das injizierte `useTabInfo()` gelesen. Das Framework wächst um keine Per-Typ-API-Oberfläche, und ein von außerhalb dieses Repositories ausgelieferter Typ importiert nur Typen aus dem Sidebar-Package.
- Zwei Öffnungen mit zwei Parameter-Maps bedeuten, dass ein Aufrufer weder eine Seite per Adresse noch eine Ressource nur per Kind öffnen kann, und der Compiler sagt ihm das; der Preis ist, dass jeder neue Ressourcentyp oder Seiten-Kind, der typisierte Parameter will, eine Map augmentiert.
- Dass `id` und `kind` verschieden sind, lässt eine Extension einen ausgelieferten Typ an Ort und Stelle ersetzen, pro Kind, wobei das Builtin wieder in Kraft tritt, wenn die Extension sich abmeldet; der Preis ist ein weiteres erforderliches Feld auf jeder Definition.
- Das Navigationsgesicht ist nur Kontrolle. Ein Plugin, das das Layout kennen muss, kann nicht danach fragen, was die Form des Layouts aus dem Vertrag jedes Plugins heraushält, bis ein Navigationsprotokoll entscheidet, was es offenlegt.
- Das `sidebar://<kind>`-Literal lebt in einer Datei. Die Navigationsgrammatik später zu ändern berührt das Sidebar-Package und sonst nichts.
- Diese Gesichter sind der Teil der Sidebar, der feststeht: Adressen, Registrierungsfelder und Bänder, die zwei Öffnungen und ihre Parameter-Maps, Sitznamen und injizierte Tab-Informationen. Alles, was ein Nutzer als Verhalten sieht — wo ein Float einrastet, wann ein Split-Control ergraut, die Texte, die Ordnung des Baums — ist eine Produktregel außerhalb jedes hier beschriebenen Vertrags und ändert sich ohne Ankündigung an irgendein Plugin.

## Tests

`ui-sidebar-right`-Specs decken die Registry ab (Bänder, extension-over-builtin mit Wiederinkrafttreten, `id`- und Same-Band-Kollisionen, Glob- und Pfad-Matching, `canOpen`, Ranking und Tiebreaks), beide Öffnungen (normale, Rand- und Fehlerpfade einschließlich falschem Scheme und nicht registriertem Kind), `replaceTab` als einen Verlaufseintrag, den Sitz, der ein Kind zur in Kraft befindlichen Implementierung auflöst und zurück, `useTabInfo()` einschließlich `tab.visible` unter Collapse und Floating, und die operativen Methoden mit ihren No-op- und Throw-Fällen. Die Web-e2e-Suite treibt den Guide, den Dateibaum und ein Datei-Öffnen durch den echten Plugin-Graphen in Chromium. Beide Suites sind schlüssellos.

## Zurückgestellt

- Ein Navigationsprotokoll jenseits von `sidebar://<kind>`: Sub-Routen innerhalb einer Seite, das Benennen einer Implementierung und die ökosystemzugewandten Regeln für andere Navigationsschemes.
- Parameter für die ausgelieferten Seitentypen, die heute keine deklarieren.
- Öffnen in eine andere Session als die auf dem Bildschirm über das öffentliche Gesicht, das nur auf die gemountete Session wirkt; die eigenen Aktionen eines Tabs wirken bereits auf die Session ihres Tabs.
- Eine lokalisierte Meldung, wenn ein Öffnen aus der Konversation scheitert; der Fehlschlag ist derzeit der Text des geworfenen Fehlers.
