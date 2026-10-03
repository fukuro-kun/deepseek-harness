# Agent Note: Sidebar- und Preview-Interaktionspolitur

Status: implemented

[English](2026-09-09-sidebar-and-preview-interaction-polish.md) | [中文](2026-09-09-sidebar-and-preview-interaction-polish.zh.md) | Deutsch

## Problem

Fünf kleine Interaktionsdefekte rund um die rechte Sidebar und die Dokumentvorschau. Die Oberfläche jeder Session wurde mit einer vorgegebenen Standardseite geboren, sodass eine eingeklappte Spalte, die der Nutzer nie geöffnet hatte, bereits eine Seite enthielt, und das erste Öffnen in einer frischen Oberfläche den Seed neben dem geöffneten Inhalt zeigte. Seiten-Tabs deduplizierten oberflächenweit: Das Öffnen einer Seite, deren Tab in der anderen Pane saß, zog den Fokus über die Panes hinweg, statt sie wie angefragt zu öffnen. Das Ziehen des einzigen Tabs einer Pane auf ihre eigene Kante tat nichts, obwohl der Nutzer eindeutig einen Split wollte. Ein Dropdown über der HTML-Vorschau schloss nicht bei einem Klick ins Sandbox-Iframe, weil dieser pointerdown das Eltern-Dokument nie erreicht. Und das Copy-Banner sowie der Kartenhintergrund der Code-Vorschau scrollten bei horizontalem Scrollen davon, während der Code die graue Füllung der Chat-Karte behielt, statt auf dem eigenen Hintergrund der Pane zu liegen.

## Entscheidung

**Standardseiten werden lazy geseedet.** `createSurface` in [stores.ts](../../../../packages/client/ui-sidebar-right/src/client/stores.ts) prägt eine eingeklappte, leere Oberfläche; das `advance` des Stores reicht die Seed-Factory nur dann an `planSettle`, wenn der Intent die Spalte ausgeklappt lässt. Die Expansion, die ein leeres Layout erstmals zeigen würde, ist das, was die dann aktuelle Standardseite seedet; das Schließen des letzten schließbaren Tabs klappt die Spalte ein und lässt das Layout leer bis zur nächsten Expansion. Die [Last-Tab-Close-Regel](2026-09-08-sidebar-last-tab-close-rules.de.md) und die [Standardseiten-Auswahl](2026-09-08-sidebar-default-pages.de.md) bleiben wie beschlossen; Standardseiten werden bei der Expansion erzeugt. Das Splitten einer leeren Pane ist ein No-Op: Es prägt keine Tabs, zeichnet keine History auf und meldet keine neue Pane.

**Seiteneindeutigkeit ist pane-scoped.** Das guide-only Merge verallgemeinerte sich auf jede Seitenart (`pageKind`/`panePage`): Das Öffnen einer Seite fokussiert einen bestehenden Tab nur innerhalb der Pane, auf die das Öffnen zielt, und eine Seite, die in eine Pane gezogen, gedroppt oder angedockt wird, die diese Art bereits zeigt, merged in den eigenen Tab der Pane. Ressourcen-Tabs behalten das oberflächenweite Reveal des Kits.

**Ein einziger Tab splittet seine eigene Pane, wenn eine Factory sie auffüllt.** `planDropTab` in [planner.ts](../../../../packages/client/ui-dockkit/src/engine/planner.ts) nimmt eine optionale `TabFactory`; mit einer solchen splittet das zuvor verweigerte Release auf die eigene Kante, und der Tab der Factory füllt die freiwerdende Pane vor dem Move auf, sodass der gezogene Tab fokussiert endet. Ohne Factory ändert das Release weiterhin nichts.

**Menüs schließen, wenn der Fokus in ein Iframe eintritt.** [Menu.tsx](../../../../packages/client/ui-primitives/src/Menu.tsx) fügt einen window-`blur`-Listener hinzu, der auf `document.activeElement instanceof HTMLIFrameElement` gated ist — der Fokuswechsel ist das einzige Signal, das ein pointerdown in einem Cross-Origin-Iframe hinterlässt, und das Gate verhindert, dass App- oder Tab-Wechsel die Liste schließen.

**Die Code-Vorschau trennt ihr Banner vom scrollenden Quelltext und lässt die Kartenfüllung fallen.** Der geteilte CodeBlock verpackt seinen gerenderten Quelltext in einen stabilen `data-code-block-content`-Knoten, der standardmäßig `display: contents` verwendet, sodass bestehende Consumers ihr Layout behalten. [CodeBody.module.css](../../../../packages/client/ui-sidebar-documentpreview/src/client/code/CodeBody.module.css) materialisiert diesen Knoten als vollhöhen-inneren Scrollport unterhalb des Banners; der Code-Renderer meldet ihn über ein Callback-Ref, sodass der Dokument-Owner dem Slot-Ersatz für Positionswiederherstellung, Paging und Zeilennavigation folgt. Die Füllung des geteilten CodeBlocks läuft über `--dsl-code-block-background` (Default unverändert, sodass der Chat seine graue Karte behält), während die Vorschau sie auf `transparent` setzt, damit der Code auf dem eigenen Hintergrund der Pane liegt.

## Erwogene Alternativen

**Seeden bei Surface-Erzeugung beibehalten.** Eine eingeklappte Spalte hielt eine Seite, die niemand angefragt hatte, und der Seed belegte Slot 0 jeder frischen Oberfläche vor dem ersten echten Öffnen.

**Oberflächenweite Seiten-Dedupe beibehalten.** Der Fokus sprang bei einem expliziten „hier öffnen" zur anderen Pane — genau die Beschwerde, die die Änderung auslöste.

**Ein nacktes window-blur-Schließen für Menüs.** Schließt die Liste bei jedem App- oder Tab-Wechsel; das `activeElement`-Gate begrenzt das Schließen auf den einen Fall, den das Dokument nicht sehen kann.

**Code im geteilten Dokument-Scroller belassen.** Ein Kind-Banner kann die native Scrollbar seines Elternteils nicht abdecken. Wenn der stabile Quelltext-Wrapper beide Scroll-Achsen trägt, bleibt die Scrollbar am sichtbaren Viewport-Rand unterhalb des benachbarten Banners, statt am Ende eines langen Codeblocks.

## Konsequenzen

Der Factory-Parameter von `planDropTab` ist neue Kit-API, die jeder Embedder übergeben darf; `planSettle` akzeptierte bereits eine fehlende Factory, die nun auch das Eingeklappt-Verhalten der Sidebar benennt. Die Variable `--dsl-code-block-background` bewahrt die graue Standardkarte des Chats, während die Vorschau den Pane-Hintergrund nutzt, und `data-code-block-content` erlaubt einem Owner, einen dedizierten Quelltext-Viewport zu materialisieren, ohne andere CodeBlock-Layouts zu ändern. Kit-Planner-Specs decken den aufgefüllten Self-Split und seine Fokusreihenfolge ab; Sidebar-Store-, Service- und Seat-Specs decken Lazy-Seeding, pane-scoped Seiten-Merges und das leere eingeklappte Layout ab; Dokumentvorschau-Specs decken inneres Scrollen und Zeilennavigation ab; eine Menu-Spec deckt das gegatete Blur-Schließen ab. Die READMEs von `ui-sidebar-right`, `ui-dockkit` und `ui-sidebar-documentpreview` formulieren die Regeln nach.
