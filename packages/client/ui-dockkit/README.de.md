---
description: "Docking-Layout-Kit für den dsh-Web-Client: ein Split-Tree aus tabbed Panes mit invertierbaren Operationen, Planners, einer linearen History und den Komponenten, die ihn rendern und antreiben."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-dockkit
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

Ein Docking-Layout-Kit: ein Split-Tree aus tabbed Panes mit invertierbaren Operationen und den Komponenten, die ihn rendern und antreiben. Der Harness-Web-Client ist sein erster Embedder; nichts hier weiß das.

> **Interne Engine.** Dieses Paket wird veröffentlicht, weil die Sidebar es statisch linkt, nicht als stabile API: seine Exports — `LayoutState`, `LayoutOp`, die Planners, `DockIntents`, `DockLabels`, `DockMode` — können sich in jedem Release ändern, und keiner von ihnen erscheint in einem Service-Interface (`ctx.sidebarRight` exponiert Operationen, nie Layout-Snapshots oder Operations-Logs).

## Inhaltsverzeichnis

- [Die zwei Schichten](#the-two-layers)
- [Einbettung](#embedding-it)
- [Erhaltenswerte Interaktionsregeln](#interaction-rules-worth-keeping)
- [Build-Form](#build-shape)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="the-two-layers"></a>
## Die zwei Schichten

**Die Engine** ist reine Logik — kein UI-Framework, kein DOM, keine Host-Konzepte.

- Ein normalisierter rekursiver Split-Tree: `nodes` keyed by id, `rootId` für die gedockte Wurzel, `floats` von unten nach oben. `PaneId`, `SplitId` und `TabId` sind gebrandete Strings: Nur ein `Mint` (oder der eigene DOM-Roundtrip des Kits) erzeugt eine, sodass eine Pane, ein Split und ein Tab nie füreinander oder für einen nackten String einstehen. Ein Floating Panel ist kein zweites Konzept — es ist eine Pane, deren `host` `'float'` ist, Kapazität ein Tab, gezeichnet ohne Tab-Strip.
- `applyOp(state, op)` gibt den nächsten State **und die Operationen, die ihn rückgängig machen** zurück. Inverse werden beim Ausführen einer Operation erfasst, weil der Pre-Operation-State zur Undo-Zeit weg ist.
- Jede Operation trägt die Ids, die sie erzeugt, sodass `replay(initial, ops)` denselben Tree reproduziert. Die Engine liest weder Uhr noch Zufallsquelle.
- `Sequencer` hält eine lineare History mit einem Eintrag pro Intent: Die Operationen, die eine Geste oder ein Command erzeugte, treten gemeinsam zurück und vor, eine Folge aufeinanderfolgender Focus-only-Einträge tritt als einer, und ein neuer Eintrag nach dem Zurücktreten verwirft den Forward-Branch.
- `planSettle` ist die Opt-in-Regel, die jede gedockte Pane nach einem Intent gefüllt hält: Panes, die ein Intent leerte, werden weggemergt, und eine geleerte Root-Pane wird über die Factory des Embedders neu beseedet — das Vorenthalten der Factory behält den Merge und lässt die Root-Pane leer. Ein Embedder, der leere Panes will, ruft es schlicht nicht auf oder ruft es ohne Factory. `planDropTab` nimmt dieselbe Factory: Mit einer splittet ein einzelner Tab, der auf der Kante seiner eigenen Pane losgelassen wird, und der Tab der Factory füllt die Pane nach, die er räumt (der gedraggte Tab bleibt fokussiert); ohne eine ändert dieses Release nichts.
- `DockController` ist die Intent-Schicht und eine Observable-Quelle (`subscribe` + `getSnapshot`, deren Referenz sich nur ändert, wenn es das Layout tut).

**Die Komponenten** rendern einen Layout-Snapshot und melden gesettelte Intents — einer pro Geste, nie ein Drag-Frame. Ein Drag previewt in lokalem State, während die eigenen Fakten der Geste in ihrer Closure bleiben; beim Release verlässt das Nettoergebnis durch einen `DockIntents`-Call — ein Strip-Release meldet den Caret-Slot wie gezeichnet, den gedraggten Chip mitgezählt, und `planPlaceTab` übersetzt das in das Reorder oder den Move. Genau das lässt einen Embedder pro Geste exakt einen History-Eintrag aufzeichnen. Der Strip folgt dem WAI-ARIA-Tabs-Pattern mit manueller Aktivierung: Der selektierte Chip steht in der Tab-Reihenfolge; Links und Rechts (wrap-around), Home und End bewegen den Fokus zwischen Chips, ohne zu selektieren; Enter oder Space selektiert den fokussierten Chip über denselben Intent wie ein Click. Ein Chip ist eine Kapsel, die ein Control trägt, sein Close; das Context-Menü (ein Secondary-Press auf dem Chip) trägt dasselbe Close plus die Einträge des Embedders — ein Menü, das gar keinen Eintrag hielte, erscheint nie — und rendert in einem Portal, das gegen den Chip positioniert ist, weil die Chip-Box ihr Overflow absichtlich clippt (siehe unten). Hinter den Chips sitzt das Add-Control, das den Embedder (`DockIntents.addTab`) bittet, seinen geseedeten Tab zu platzieren; das `canAddTab(paneId)` des Embedders entscheidet pro Pane, ob das Control überhaupt gezeichnet wird. Einen Tab zu kopieren hat kein Kit-Control — es ist die API des Embedders — und Floating ist der Drag, der frei von der Oberfläche losgelassen wird.

<a id="embedding-it"></a>
## Einbettung

Alles Hostspezifische kommt über Props herein:

| Contract | Trägt |
|---|---|
| `DockLabels` | jeden gerenderten String, bereits lokalisiert, Accessible Names eingeschlossen |
| `TabRenderer` | den Body eines Tabs (`renderTab`), bündig an die Kanten der Pane und die Unterkante des randlosen Strips gezeichnet mit den Insets seiner Wahl, und optional, was sein Chip oder Panel-Header als Titel zeigt (`renderTabTitle`, mit Fallback auf das `title` des Records); der Embedder dispatcht auf `tab.kind` |
| `DockIntents` | die gesettelten Ergebnisse jeder Geste |

`DockController` erfüllt `DockIntents` wie geschrieben, sodass die einfachste Einbettung den Controller direkt an `DockSurface` übergibt. Ein Embedder, der über einen eigenen Store routet, implementiert stattdessen dieselben Methodennamen. Drei Props tragen Control-Policy statt Gesten: `canSplit` (surface-weit, das Pane-Budget; deaktiviert das Split-Control mit `splitPaneDisabled`), `canAddTab(paneId)` (pro Pane, lässt das Add-Control weg; weglassen, um in jeder Pane eines zu zeichnen) und `canCloseTab(tabId)` (pro Tab, hält das Close-Control des Chips und den Close-Eintrag des Menüs gemeinsam zurück; weglassen, um jeden Tab schließbar zu halten). Das Verbergen des Add-Controls verschiebt nichts anderes im Strip, und ein zurückgehaltenes Close verschiebt nichts im Chip — das Close-Control zeichnet über dem Ende des Titels statt daneben. Ein einzelner Chip einer Pane, dessen Close zurückgehalten wird, zeichnet leise — keine Kapsel, kein Hover-Fill —, weil es nichts gibt, wogegen man selektieren, und nichts, was man ihm antun könnte. Das Kit fügt eine eigene Policy hinzu, die Room-Regel unten, die das Split-Control einer Pane mit `splitPaneNarrow` deaktiviert; `onRoom(fits)` meldet seine Messwerte, sodass ein programmatisch splittender Embedder dieselbe Regel einhalten kann.

`dropZones="horizontal"` bietet zwei Halb-Pane-Hints; sobald Budget oder Breite einen weiteren Split verbietet, akzeptiert der gesamte Body einen Move. Ein Hint ist eine gestrichelte Card mit 8px Inset innerhalb seiner Region, die das Glyph der Zone und `labels.dropZone[zone]` zeigt; der Preview-Layer bedeckt den gesamten Tab-Body-Content, während die Card unter dem Pointer den Accent erhält und ihr Nachbar eine leise Outline bleibt. `minPaneFraction` setzt das Preview-Minimum, und `planResizeSplit` akzeptiert dasselbe Minimum für die committed Operation. Die Sidebar verwendet 0.2 und erzwingt zwei Panes in ihrem eigenen Store. Die generische Engine behält ihren Tree und andere Split-Richtungen. `hideSplitWhenBlocked` verbirgt ein blockiertes Split-Control — Pane-Budget erschöpft oder Pane zu schmal —, statt es deaktiviert zu rendern; sein Default ist false.

Der `kind` eines Tabs ist ein opaker String. Geseedete Tabs sind Factories (`DockControllerOptions`), sodass der Inhalt einer frischen Pane die Entscheidung des Embedders ist, nicht die dieses Pakets. Content-Identität ist das Paar (`kind`, `contentId`): `findContentTab(state, contentId, kind?)` findet den Tab, der es irgendwo zeigt, und `findPaneContentTab(state, paneId, contentId, kind?)` innerhalb einer Pane, und `planOpenContent` fokussiert diesen Tab, statt einen weiteren zu öffnen, es sei denn, ihm wird `revealIfOpened: false` gesagt; ein explizites `index` setzt einen neuen Tab auf einen Strip-Slot statt ans Ende.

`DockSurface` ist die gedockte Fläche. Chrome um sie herum — eine Rail, eine eingeklappte Darstellung, History-Controls — gehört dem Embedder, der `state.expanded` liest und entscheidet; das Kit liefert kein eigenes Undo/Redo-Control. Surface-weite Controls, die der Embedder auf der Surface haben will, gehen über das `chrome`-Prop, das das Kit am fernen Ende des Tab-Strips der oberen rechten Pane platziert (das letzte Child jedes Row-Splits, das erste jedes Column-Splits), sodass eine Surface keine eigene Header-Zeile braucht. `FloatLayer` besitzt seine eigenen Gesten und positioniert Panels in Viewport-Koordinaten, sodass es überall gemountet werden kann, einschließlich in einem Portal.

<a id="interaction-rules-worth-keeping"></a>
## Erhaltenswerte Interaktionsregeln

Diese sind nicht stilistisch; jede behebt einen Defekt, der in einem echten Browser gefunden wurde.

- **Capture den Pointer**, wenn eine Geste beginnt. Ohne das kann jeder Scroll-Container, den der Pointer kreuzt, die Geste beanspruchen, was der Browser als cancelled Pointer und abgebrochenen Drag meldet. Capture ist Härtung — die Window-Listener tragen die Geste so oder so, sodass eine Umgebung ohne die API weiterhin funktioniert.
- **Die Chips weichen; die End-Controls des Strips weichen nie.** Die Chip-Box ist der einzige schrumpfende Teil des Strips (`flex: 0 1 auto; min-width: 0; overflow-x: auto`): Chips schrumpfen bis zu einem 80px-Floor und scrollen dann auf dem Wheel ohne gezeichnete Scrollbar, und die Box fadet ihre Chips über 24px an jeder Seite aus, die welche verbirgt (`data-dockkit-strip-scroll`, geschrieben aus dem Scroll-Messwert der Box nach jedem Commit, Scroll und Resize). Wann immer sich der aktive Tab oder die Reihe der Chips ändert, scrollt die Box so, dass der aktive Chip frei von der Fade-Zone steht; ein bereits sichtbarer Chip bewegt nichts. Der Titel eines Chips wird nie ellipsisiert: `TabTitle` liest seinen Text gegen seine Box und setzt `data-dockkit-tab-clipped`, solange der Text breiter ist, was den Text über seine letzten 16px ausfadet. Das Close-Control eines Chips zeigt sich, solange der Chip aktiv ist, gehovert wird oder Fokus hält, über den letzten 14px des Titels, die darunter ausfaden, sodass der Chip in beiden Fällen dieselbe Breite hat. Die zwei Slots neben dem aktiven Chip zeichnen keine Hairline, sodass die gefüllte Kapsel zwischen nackten Chips steht. Die Add-, Split- und Chrome-Controls sind `flex: none`, behalten also ihre Breite und Position in jeder Pane, die mindestens so breit ist wie sie (etwa 130px mit dem Chrome, 72px ohne). Das `min-width: 0` der Surface und das `overflow: hidden` der Pane verhindern, dass die längste unumgebrochene Zeile eines Bodys die Pane über ihre Box hinaus aufweitet — genau das hatte die Controls und die Scrollbar des Bodys aus dem Bildschirm getragen.
- **Die Chip-Box scrollt, beansprucht aber nie eine Geste.** Ein horizontaler Scroller würde Press-and-Move für sich beanspruchen und den Pointer canceln; die Box, die Chips und der Strip setzen `touch-action: none`, und die Geste captured den Pointer, sodass ein Press-and-Move auf einem Chip ein Drag ist und nur das Wheel die Box scrollt.
- **Ein Split braucht Raum für zwei arbeitsfähige Hälften.** Eine Pane splittet in gleiche Hälften, also muss jede Hälfte das Nicht-Schrumpfbare fassen: den fixen Teil des Strips — gemessen als Strip-Breite minus Chip-Box und Fill, also Padding, Gaps und jedes Control, das diese Pane zeichnet (ihr eigenes Chrome eingeschlossen, sodass die obere rechte Pane mehr verlangt) — plus einen Chip in seiner Minimalgröße — `.tab` deklariert `min-width: 80px` auf einer Content-Box, sein Footprint ist also 80px plus 10px + 10px Padding, 100px, gelesen aus dem Computed Style eines gerenderten Chips (der Stylesheet-Wert, wenn keiner gelesen werden kann); der Divider zwischen den Hälften nimmt seine gerenderte Dicke (0 — seine Hairline zeichnet über die Fuge, ohne Layout-Raum zu nehmen, sodass die eigenen Rules eines Bodys ungebrochen an ihr vorbeilaufen). Ein Column-Split, den nur ein Edge-Drop erzeugt, braucht pro Hälfte Platz für den Strip (34px) plus einen 48px-Body: eine 13px-Secondary-Zeile mit 1.6 Line-Height innerhalb von 12px eigenen Insets des Bodys — der Pane-Body selbst ist ungepolstert, sodass der Body eines Tabs bis zur Unterkante des Strips und zu den Kanten der Pane reicht und seine eigenen Insets zeichnet. `halvesFit` in `geometry.ts` ist die Arithmetik; `measure.ts` liest die Rechtecke nach jedem Commit und bei jedem Resize der Surface, weil der Layout-State Fractions trägt, nie Pixel, und die Planners der Engine dabei bleiben. Eine Pane ohne Raum behält ihr Split-Control, deaktiviert mit `splitPaneNarrow` (stattdessen verborgen unter `hideSplitWhenBlocked`), und bietet keine Edge-Drop-Zone für diese Achse (das Release ist dann kein Move). Unter `hideSplitWhenBlocked` wird der eigene Footprint des Split-Controls — seine Box plus die Gap des Strips — aus dem fixen Teil herausgelassen: Das Verbergen des Controls nimmt genau diesen Footprint vom Strip, sodass ein Messwert, der ihn zählte, mit der Sichtbarkeit des Controls flippte und ewig neu renderte; ihn wegzulassen ist auch das, was die befragte Hälfte tragen würde, da eine zu schmale Hälfte zum Splitten ihr eigenes Control verbirgt. Eine Pane, die der Nutzer nachträglich verschmälert — ein Divider oder die Spalte des Embedders gedraggt — behält ihre Größe: Die Regel entscheidet nur ihren nächsten Split.
- **Fokus landet auf Click, nicht auf Press.** Ein State-Wechsel zwischen `pointerdown` und dem ersten `pointermove` baut den gedrückten Subtree neu auf, und ein ersetztes Element cancelt den Pointer. Es verhindert auch, dass ein Drag zuerst eine redundante Focus-Operation aufzeichnet. Clicks auf den Chips, den Controls des Strips und dem Chrome des Embedders halten am Strip: Der Intent, den jeder meldet, entscheidet bereits die aktive Pane oder ist die eigene Angelegenheit des Embedders, sodass das Click-to-Focus der Pane nichts extra aufzeichnet. Grip und Ecke eines Floating Panels melden auf demselben Weg über ihre Geste — ein an Ort losgelassener Press ist ein Click, der das Panel anhebt, und ein Drag zeichnet nur den Move oder Resize auf, dessen Operation es anhebt — während ein Press auf dem Panel-Body es direkt anhebt. Ein Click auf die bereits aktive Pane, ein Click oder eine Taste auf dem bereits selektierten Chip dieser Pane oder ein Press auf dem bereits aktiven und obersten Panel ändert nichts und zeichnet nichts auf.
- **Ein Control, das in einem draggbaren Chip verschachtelt ist, hält seinen eigenen Press an.** Sonst startet der Press einen Drag, captured den Pointer, und der Click des verschachtelten Controls landet nie.
- **Emphasis nimmt den Accent der Plattform, nie `--dsw-alias-brand-primary`.** Diese Plattform bindet `brand-primary` an seinen fast schwarzen (light) bzw. fast weißen (dark) Foreground, sodass der Drop-Caret und der Drop-Zone-Hint `--dsw-alias-brand-primary-new-colorprimary-new-color` verwenden, wie es die Trajectory-Views tun; ein gehoverter Divider nimmt stattdessen die Caption-Label-Ink und liest sich als Griff statt als Highlight. Ein Floating Panel zeichnet keinen Border — der Schatten des Menüs (`--dsw-elevation-prominent`) umreißt es — und das aktive Panel bekommt keinen schwereren Rahmen: Es ist bereits oben und wirft denselben Schatten; ein dunklerer Rahmen darum las sich als Defekt.

<a id="build-shape"></a>
## Build-Form

Das Paket ist statisch gelinkt: tsdowns `staticLinked`-Preset emittiert ein Browser-ESM-Bundle unter `lib/index.js` (jeder bare Specifier bleibt ein Import, Sourcemaps ketten zu den Quellen) und liefert das Stylesheet unter `lib/` an seinem `src`-relativen Pfad, und die Web-Shell resolved den Paketnamen und bündelt das Artifact selbst, sodass vite der einzige Owner des Class-Hashings bleibt. Eine Konsequenz ist tragfähig — das Kit behält **ein** Stylesheet, `dockkit.module.css`, weil ein Consumer injizierte Sheets nach Dateiname dedupliziert und eine Kollision eines still fallen ließe.

<a id="model-experience"></a>
## Model Experience

Keine, da das Paket eine browserseitige Docking-Layout-Engine und Komponentensammlung ist, die nichts Modellzugewandtes registriert.

#### KV-Cache-Effekt

Keiner; dieses Paket assembliert oder sendet keinen Provider-Request.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- **Size-Semantik ist bewusst klein**: Fraction-Weights mit einer Minimum-Size-Klemme. Kein Snap, keine Priority und keine Preferred Size, sodass das Cascading-Squeeze-Verhalten eines vollen Splitviews fehlt.
- **Touch ist nicht getunt.** Gesten sind Pointer-basiert, und `touch-action` ist dort gesetzt, wo ein Scroller sonst stören würde, aber es wurde kein Touch-spezifisches Tuning vorgenommen.
- **Accessibility ist unvollständig**: keine `separator`-Role auf Dividers und kein Keyboard-Pfad zum Splitten, Movens oder Floaten.
- **Kein veröffentlichter Stylesheet-Contract.** Consumer erhalten gehashte Modul-Klassennamen; das Kit exponiert keine Theming-API über die `--dsw-*`-Custom-Properties hinaus, die es liest.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Die Engine ist reine Funktionen über plain Data, und die Komponenten melden nur Intents; die Invertierbarkeit der Operationssequenz und die Settle-Regel werden direkt durch die Engine-Specs dieses Pakets assertiert, und es wird kein Cordis-Service bereitgestellt oder beobachtet.
