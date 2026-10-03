---
description: "Die rechte Sidebar des dsh-Web-Clients: eine Docking-Fläche pro Session, zwei Darstellungen, der Navigations-Controller ctx.sidebarRight, die Tab-Typ-Registry ctx.sidebarRightTabs und die Tab-Domäne."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sidebar-right
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

Die rechte Sidebar: wo das Docking-Kit auf dieses Produkt trifft. Sie hält eine Docking-Fläche pro Session, zeichnet sie als ein randverankertes Panel in der rechten Spalte des Frames in einer von zwei Darstellungen, platziert den Expand-Button im Konversations-Header und besitzt den Navigations-Controller (`ctx.sidebarRight`), die Tab-Typ-Registry (`ctx.sidebarRightTabs`) und die Tab-Domäne, die jedem offenen Tab sagt, wie er angesteuert wurde und wie lange er lebt.

## Inhaltsverzeichnis

- [Was hier lebt und was nicht](#what-lives-here-and-what-does-not)
- [Darstellungen](#presentations)
- [Der Expand-Button](#the-expand-button)
- [State](#state)
- [Extension Seats](#extension-seats)
- [`ctx.sidebarRight`](#ctxsidebarright)
- [Die Tab-Domäne](#the-tab-domain)
- [Der Guide](#the-guide)
- [Copy](#copy)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="what-lives-here-and-what-does-not"></a>
## Was hier lebt und was nicht

Das Layout selbst — der Split-Baum, seine Operationen, die Drag-Gesten, die Floating Panels — gehört zu `@deepseek-ai/dsh-client-ui-dockkit` und bleibt host-agnostisch. Dieses Paket liefert alles, was das Kit nicht wissen will: die Copy des Produkts, was der `kind` eines Tabs bedeutet, mit welchem Tab ein frisches Pane befüllt wird, wo die Fläche gemountet ist und wie andere Plugins sie erreichen.

<a id="presentations"></a>
## Darstellungen

Normal- und Fullscreen-Darstellung teilen denselben Inhaltsbaum, sodass ein Wechsel Tabs nicht neu mountet. Das Normal-Panel verankert an der rechten Spalte; Fullscreen bedeckt den Viewport und behält die Breitbild-Spalten darunter bei. Ein Öffnen unter 768px nutzt automatisch Fullscreen; das Verlassen von Fullscreen auf einem schmalen Viewport schließt das Panel, und eine Verbreiterung öffnet ein geschlossenes Panel nicht erneut. Ein Fullscreen-Öffnen lässt die darunterliegenden Spalten unverändert, bis sein Slide endet, und bereitet dann den normalen Track ohne Spaltentransition vor. Bevor ein Fullscreen-Panel zurückweicht, bereitet ein Schließen eine konversationsbreite Fläche vor und ein Wiederherstellen den normalen rechten Track; der Hintergrund animiert während des Rückzugs nicht.

| Modus | Der Track | Das Panel |
|---|---|---|
| `push` (Standard) | Panel-Breite: Die Konversation macht Platz | Im Track; seine linke Kante und die rechte Kante der Konversation wandern gemeinsam auf der eigenen Kurve des Frames |
| `fullscreen` | Behält den normalen Breitbild-Track; automatisches Schmalbild-Fullscreen nimmt keinen Track | Bedeckt den gesamten Viewport |

Der Seat meldet die Darstellung über `ctx.layout.openRightbar(track, fullscreen)` / `closeRightbar()`; der Frame injiziert dieses Paket nicht. Ein Fullscreen-Wechsel auf einem breiten Viewport lässt die Mittenbreite unverändert, und der Breitengriff erscheint nur im expandierten Normalmodus. Unabhängige Floating Panels und `float`/`dock`-Operationen bleiben verfügbar.

Das Panel hat keine Header-Zeile. Seine beiden Controls — der Darstellungswechsler und der Collapse-Button — fahren auf dem Chrome-Seat des Kits am hinteren Ende der Tab-Leiste des oberen rechten Panes, sodass die Leiste die gesamte Oberkante des Panels ist. Jede Leiste liest sich von links nach rechts: die Tab-Kapseln mit Close-Controls, wo erlaubt, das Add-Control (nur gezeichnet, solange dieses Pane keinen Guide-Tab hält; es öffnet den Guide dort über `ctx.sidebarRight.openTab`), das Split-Control des Panes und im oberen rechten Pane die beiden Panel-Controls. In einem schmalen Pane weichen nur die Chips zurück; die Controls dahinter schrumpfen oder clippen nie.

<a id="the-expand-button"></a>
## Der Expand-Button

Während das Panel verborgen ist, ist ein Button im Corner-Seat des Konversations-Headers (`conversation.session.header.corner`, hinter der rechten Kante der Utilities und auf Höhe des Session-Log-Controls) der Weg zurück. Seine Glyphe ist das gespiegelte Collapse-Icon der linken Sidebar. Er teilt den Store des Panels (die Slot-Runtime erlaubt ein Handle über zwei Seats desselben Scopes hinweg); während das Panel sichtbar ist, rendert er nichts, und der Corner-Seat kollabiert mit. Eine kollabierte Sidebar kostet die Konversation also nichts: keine Rail, keine Breite, und die Scrollbar des Transkripts bleibt am Rand der Spalte. Ohne Session gibt es weder Button noch Panel.

Das Panel übernimmt Grundfarbe und Schriftgrößen der Konversation statt einer eigenen erhöhten Ebene: Es ist eine Spalte der Seite, keine Karte darüber.

Der `rightbar`-Eintrag ist ein Root-scoped Controller. Er liest `usePanelInfo` und mountet den Session-scoped `rightbar.session`-Subtree nur, solange die Conversation ausgewählt ist. Ein Wechsel zu einem globalen Panel verbirgt die rechte Sidebar und gibt ihren Frame-Track frei, ohne den Tab-State der Session zu löschen.

<a id="state"></a>
## State

Ein `SurfaceState` pro Session-ID — das Layout, seine aufgezeichnete Sequenz und wie viele IDs es geprägt hat — gehalten in einem Store, der bei der Registrierung deklariert wird. Jede Aktion folgt derselben Form: präge die IDs, die die Intention braucht, frage einen Kit-Planner, welche Operationen sie ausführen, zeichne sie auf und weise dann die gesamte Fläche der Session zurück. Keine Aktion editiert ein Layout in place, wodurch die reinen Funktionen des Kits das einzige bleiben, das eines berechnet.

Das Mitführen des Mint-Zählers in der Fläche macht eine aufgezeichnete Sequenz replaybar: Operationen betten die IDs ein, die sie erzeugen, sodass ein Replay aus demselben Anfangszustand denselben Baum reproduziert. Jede Aktion zeichnet einen History-Eintrag auf, egal wie viele Operationen sie brauchte. Expandieren, Kollabieren und Darstellungswechsel werden ebenfalls aufgezeichnet.

Nach jeder Aktion hält der Settle-Planner des Kits die expandierte Fläche befüllt: Ein gedocktes Pane, dessen letzter Tab herausbewegt oder gefloatet wurde, wird weggemerged, und ein geleertes Root-Pane erhält die Default-Page. Eine kollabierte Fläche hält kein solches Backfill — eine Session startet kollabiert und leer, und ein Schließen, das die Spalte kollabiert, lässt sie leer — die Expansion, die zuerst ein leeres Layout zeigen würde, befüllt die Default-Page. Explizites Schließen folgt [den Default-Page- und Close-Regeln](#the-guide). Während expandiert gibt es immer mindestens einen Tab und nie ein leeres Pane — daher gibt es keine eigene „Pane schließen"-Geste.

Der letzte Tab der gedockten Fläche trägt eine weitere Regel, entschieden im `closeTab` des Stores und über `canCloseTab` ans Kit gespiegelt: Der Guide als einziger gedockter Tab zeichnet kein Close-Control und keinen Menüpunkt zum Schließen — seine Chip bleibt ruhig, und ohne beigesteuerten Extension-Eintrag öffnet ein Sekundärklick kein Menü — und ein programmatisches Schließen von ihm zeichnet nichts auf; jeder andere alleinstehende Tab schließt zusammen mit der Spalte in einem Eintrag — das Layout bleibt leer, bis die nächste Expansion ihre aktuelle Default-Page befüllt. Floating Panels nehmen an der Regel nicht teil: Sie rendern unabhängig davon, ob die Spalte expandiert ist, und ihre Tabs schließen frei.

State ist nur im Speicher. Ein Reload setzt jede Session auf den kollabierten Default zurück; ein Session-Wechsel lässt jede Fläche, wo sie war.

<a id="extension-seats"></a>
## Extension Seats

Ein Tab-Typ registriert sich in zwei Stufen, und der mitgelieferte Guide-Typ durchläuft exakt denselben öffentlichen Pfad wie ein Typ aus einem anderen Paket (`ui-sidebar-documentpreview` ist der lebende Beweis). Beide Stufen sitzen im eigenen `ctx.effect` des Typs, sodass die Registrierung exakt so lange lebt wie das Plugin, das sie vornahm.

1. **Der Typ** — `ctx.sidebarRightTabs.register({ id, kind, patterns?, priority?, canOpen?, title, guide? })`, eine statische Deklaration ohne Runtime-Hook, die einen Disposer zurückgibt. `id` ist die Identität dieser Implementierung im Tab-System, eindeutig über alle Registrierungen hinweg (ein Paketname ist der natürliche Wert; der mitgelieferte Guide ist `@deepseek-ai/dsh-client-ui-sidebar-right/guide`): Ein kind ist nicht mehr eindeutig, sobald eine Extension den eines Builtin übernehmen kann, also benennt sich die Implementierung selbst, und eine zweite Registrierung einer `id` wirft. Ein Resource-Typ nennt `patterns`, Globs über `dsh-resource://`-Adressen: Einer, der `:` enthält, matcht die ganze Adresse (`dsh-resource://file/**`); einer ohne matcht den Pfad der URI in beliebiger Tiefe, case-insensitive (`*.md`), und eine Adresse, die keine URI ist, matcht kein solches Pattern. Ein Page-Typ — der Guide, ein File Tree — nennt keine und wird per kind geöffnet. `canOpen(address)` vetoes einen Match. `title(address)` ist der Text der Tab-Chip, erfasst beim Öffnen des Tabs. `guide` listet Entry-Boxen für die Guide-Page; die Auswahl einer öffnet den beitragenden Typ als Page. Ein `kind` trägt höchstens eine `builtin`- und eine `extension`-Registrierung (die Extension gilt; der Builtin kehrt zurück, wenn sie geht); jede andere Kollision auf einem kind wirft. Die `id` ist zugleich der Key, unter dem Body und Title des Typs registriert werden, sodass eine Extension und der von ihr übernommene Builtin eigene Zellen halten und der Seat die geltende rendert.
2. **Der Body** — `ctx.slots.register({ name: 'sidebar.right.pane.tab', key: definition.id }, Body)` liest `{ sidebar, panel, tab }` über das framework-injizierte `useTabInfo()`. `sidebar` liefert Expansion- und Fullscreen-Information; `panel.id` identifiziert sein Pane; `tab` enthält die Record-Felder, `visible`, `navigation`, `signal` und `actions`. Diese sind keine parallelen Owner-Props; der eigene Store des Typs nutzt weiterhin `useStore`/`actions`. Optionale Title-Registrierungen und Guide-Ersetzungen teilen diesen Hook; eine fehlende Title-Registrierung verwendet den beim Öffnen erfassten Text.

Welcher Typ eine Resource öffnet, folgt der Editor-Resolver-Konvention: Die Typen, deren `patterns` matchen, werden nach `priority`-Band gerankt — `extension` (ein Typ von außerhalb des Produkts, das höchste, und der Default, wenn keines genannt ist), `builtin`, `fallback` (schlichte Viewer, die jeder spezifischere schlagen sollte) — dann nach der Länge des gematchten Patterns, dann nach Registrierungsreihenfolge; `canOpen` entfernt einen Kandidaten. Die Bänder sind String-Literale, sodass ein Typ in einem anderen Paket keinen Runtime-Import von hier braucht. `candidates(address)` liefert das Ranking, `claim(address, kind?)` die Entscheidung; das Nennen eines `kind` überspringt seine Globs, behält aber sein `canOpen`.

Zwei weitere Seats erweitern das Vorhandene: `sidebar.right.tab.guide` (chain) ersetzt den Body des Guide-Tabs, ohne den Tab zu ersetzen, und `sidebar.right.tab.menu.item` (list) hängt Content-Level-Aktionen an das Menü eines Tabs, nach den eigenen Layout-Aktionen des Kits. Ein Seat für Pane-Level-Aktionen oder Collapsed-State-Controls existiert noch nicht, weil nichts einen braucht.

<a id="ctxsidebarright"></a>
## `ctx.sidebarRight`

`openResource(address, options?)` und `openTab(kind, options?)` sind der Navigations-Controller, und jeder Weg in die Spalte ruft einen der beiden auf: die File-Links der Konversation und die Zeilenreferenz einer Tool-Row (`openResource(fileAddress, { params: { line } })`), das Add-Control der Leiste und eine Guide-Entry-Box (`openTab`), die Rows eines File Tree (`tab.actions.openResource`). Eine Resource-Adresse ist eine `dsh-resource://<type>/…`-URI; ohne `options.kind` claimt die Registry sie (Globs und `canOpen`, bestes Band gewinnt), mit ihm öffnet der geltende Typ dieses kind sie. Eine Page wird per kind benannt; der Tab wird unter einer Adresse aufgezeichnet, die dieses Paket zusammensetzt und niemand sonst schreibt (`contract/seed.ts`). Beide laufen dieselben Schritte als einen History-Eintrag: Ein Resource-Tab, der bereits dasselbe (kind, contentId) zeigt, wird fokussiert, wo immer er sitzt, es sei denn `revealIfOpened: false`; Page-Tabs deduplizieren immer innerhalb des Ziel-Panes, unabhängig von dieser Option; sonst landet ein neuer Tab im Pane und Slot von `options.replaceTab` (und schließt diesen Tab), sonst `options.paneId`, sonst dem aktiven gedockten Pane; das Panel expandiert, weil Inhalt, den der Benutzer nicht sehen kann, nicht geöffnet ist. Dann zeichnet die Tab-Domäne die Navigation auf — `params` erreichen den Body als `navigation.params`, mit hochgezähltem `revision` — außerhalb der Layout-History. `params` ist typisiert nach dem, was geöffnet wird: Ein Viewer für einen Resource-Typ merged seinen Eintrag in `SidebarRightResourceParamsMap` (die Textvorschau deklariert `{ line?: number }`); ein Page-Typ, der Parameter nimmt, merged unter seinem kind in `SidebarRightTabParamsMap`; Werte sind konventionell JSON-förmig, zur Laufzeit ungeprüft. Eine Adresse außerhalb von `dsh-resource://`, eine, die kein Typ claimt, oder ein kind, den nichts registriert hat, wirft: Das ist ein Verdrahtungsfehler, kein Benutzerfehler.

`close(tabId)` schließt einen Tab; `active()` liest den aktiven Tab. `isExpanded()` und `toggleExpanded()` lesen und steuern die Expansion der Spalte; der Darstellungswechsler ist ein eigenes Control des Panels und nicht Teil dieses Face. Layout-Operationen, für Aufrufer, die die Spalte programmatisch arrangieren, werden jeweils wie die Geste aufgezeichnet, die sie vertreten: `focus(tabId)` fokussiert einen Tab und sein Pane; `split(paneId?)` splittet ein gedocktes Pane (standardmäßig das aktive) unter demselben Pane-Budget und Raum-Regel wie das Control der Leiste und gibt die id des neuen Panes zurück, oder `undefined` — ohne Aufzeichnung — wenn es nicht kann; `float(tabId, rect?)` holt einen gedockten Tab in ein Panel heraus; `dock(paneId)` gibt ein Floating Panel ins aktive gedockte Pane zurück. Ein Tab oder Pane, das nicht existiert oder bereits dort ist, wo der Aufruf es hinlegen würde, bleibt unberührt. Das Face exponiert nur Operationen: kein Layout-Snapshot, kein Operationslog, keine Suche per Adresse. `_undo()` / `_redo()` steppen die History der gemounteten Fläche; sie sind `@internal` — die Sequenz hat kein benutzerseitiges Control, und diese existieren für Tests. Kommandos brauchen eine gemountete Session-Fläche; ohne eine werfen sie, statt in eine Fläche zu schreiben, die niemand zeichnet.

<a id="the-tab-domain"></a>
## Die Tab-Domäne

Die Tab-Domäne hält Navigation, ein Abort-Signal und gebundene Aktionen pro (Session, Tab-id). Ein privater Assembly-Callback adoptiert den Store jeder Session und gleicht Records bei ihren Commits ab. Nur das Entfernen eines Records oder Plugin-Unload abortet das Signal; das Schließen der Sidebar und ein Session-Wechsel behalten Records, während Undo eine neue Occurrence wiederherstellt. `useTabInfo()` komponiert framework-gebundene Store- und Navigations-Hooks ohne manuelle Komponenten-Subscriptions oder Record-Erzeugung zur Renderzeit. `tab.actions` zielen immer auf ihre eigene Session; `tab.visible` unterscheidet Bodies von Titles, und Floating Tabs bleiben sichtbar, wenn die Sidebar schließt. `adopt` fehlt im öffentlichen Controller.

<a id="the-guide"></a>
## Der Guide

Default-Pages hängen von der Anzahl registrierter Guide-Einträge ab, nicht von der Anzahl der Tab-Typen oder offenen Tabs. Genau ein Eintrag öffnet seine Page direkt (Files in der mitgelieferten Komposition); null oder mehrere Einträge öffnen den Guide. Das explizite Hinzufügen eines Guide öffnet den Guide weiterhin, selbst bei einem Eintrag. Der einzige gedockte Guide ist der einzige Tab, der nicht schließen kann; das Schließen jedes anderen alleinstehenden Tabs kollabiert auch die Spalte. Chip, Kontextmenü und `close`-API wenden dieselbe Regel an.

Der Guide-Tab ist ein gedämpfter Kompass über einer Entry-Kapsel pro `guide`-Eintrag, den die registrierten Typen beisteuerten, in `order`, zentriert im Body; der Guide hat keine eigenen Worte. Eine Kapsel zeigt die Glyphe des Eintrags — oder den ruhigeren Cube-Platzhalter des Guide, wenn der Eintrag keine registrierte — und seinen Title; während höchstens vier Einträge gelistet sind, zeigt ein Eintrag mit registrierter `description` diese unter dem Title, und eine längere Liste lässt jede Description fallen. Die Auswahl einer Kapsel ruft `tab.actions.openTab(entry.kind, { replaceTab: true })` auf, sodass der Guide der von ihm geöffneten Page weicht. Ein Pane hält höchstens einen Guide-Tab. Das Add-Control der Leiste wird nur gezeichnet, solange sein Pane keinen hält, und öffnet dort einen mit `openTab('guide', { paneId, revealIfOpened: false })`, sodass ein Guide in einem anderen Pane den Klick nicht an sich zieht; das Öffnen des Guide in ein Pane, das bereits einen hat, fokussiert ihn stattdessen; ein in ein solches Pane gezogener, gedropter oder gedockter Guide merged hinein — der ankommende Guide schließt und der eigene des Panes wird fokussiert; `duplicateTab` auf dem Guide zeichnet nichts auf. Ein Split, ein expandiertes leeres Root-Pane und das Pane, das ein alleinstehender Tab durch Droppen auf die eigene Kante freiräumt, nutzen dieselbe Default-Page-Regel, ein Tab pro neuem Pane; der Self-Edge-Drop lässt den gezogenen Tab fokussiert. Ein schlichtes `openTab('guide')` öffnet oder fokussiert den Guide nur innerhalb des aktiven oder benannten Panes. Das Splitten eines leeren Panes tut nichts und gibt kein neues Pane zurück. Das Produkt erlaubt zwei horizontale Panes, anfangs gleich, mit Teiler-Verhältnissen begrenzt auf 20%–80%. Unzureichende Breite blockiert einen neuen Split; bei bereits zwei Panes bewegt ein Body-Drop den Tab zwischen den Panes statt ein drittes zu erzeugen. Am Zwei-Pane-Limit werden Split-Controls verborgen; das Zurückschließen auf ein Pane stellt sie wieder her.

<a id="copy"></a>
## Copy

Jeder String in der Spalte kommt aus dem `sidebarRight`-Locale-Namespace, einschließlich der zugänglichen Namen des Kits. Der Title eines Tabs wird beim Prägen des Tabs fixiert; der Anzeigename eines Typs folgt der aktuellen Sprache.

<a id="model-experience"></a>
## Model Experience

Keine, da das Paket eine browserseitige UI-Plugin-Schicht ist, die nichts Modellsichtbares registriert.

#### KV-Cache-Effekt

Keiner; dieses Paket assembliert und sendet keinen Provider-Request.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>

- **Nur im Speicher.** Nichts wird persistiert; ein Reload startet jede Session kollabiert.
- **Keine Fläche ohne Session.** State ist per Session-ID gekeyed, daher zeigt der Hero-Screen rechts nichts.
- **Hartcodiertes Stacking.** Das Panel und der Float-Host verwenden feste z-index-Werte, weil der Client noch keine z-index-Token-Schicht hat.
- **Undo ist nicht exponiert.** Die aufgezeichnete Sequenz wird nur über die `@internal`-Service-Methoden gesteppt; Produkt-Controls fehlen bewusst.
- **Titles werden zur Öffnungszeit fixiert.** Das `title(address)` eines Typs wird in den Record erfasst; ein live Title kommt nur vom optionalen Title-Seat.
- **Kein Content-Navigationsstack.** Zurücksteppen replayt Layout-Operationen; ein editorartiges Back/Forward über besuchte Inhalte ist nicht gebaut.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>

**Runtime-Invariant:** Es wird kein Companion veröffentlicht. Die beiden Services (`sidebarRight`, `sidebarRightTabs`) werden über `ctx.reflect.provide` innerhalb eines Effects bereitgestellt und mit ihm abgerissen; die Binding des Seats und die Occurrence-Lifetimes der Tab-Domäne werden direkt durch die Specs dieses Pakets asserted, und es existiert keine unabhängige Beobachtung, die von ihnen abweichen könnte.
