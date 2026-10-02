---
description: "Shell-Layout für das Web-GUI: das dreispaltige AppFrame, dessen rechte Spalte eine Track für ein kantenverankertes Panel ist, der Panel-Geometrie-Service und die Theme-Präsentation; für Nutzer und Maintainer der Window-Chrome."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-layout

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Dieses Paket stellt das dreispaltige AppFrame des Web-GUI, die Kanten-Spaltenbreiten und die `ctx.layout`-Präsentationssteuerung bereit. Die rechte Spalte räumt Platz vor der Mitte ein; ihr Occupant rendert fullscreen, während das Frame die Wide-Screen-Track darunter behält. Der Theme-Presenter besitzt Farbschema, Alias-Tokens, Content-Fontgröße und Document-Metadata. Layout-State wird bei Reload zurückgesetzt.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Der Root-Slot komponiert die Sidebar, den Hauptinhalt und die rechte Spalte. Die Sidebar spannt 264–420px, defaultet auf 280px und behält eine 56px-Rail, wenn sie collapsed ist; unter 1024px collapsed sie automatisch, und das Öffnen des rechten Panels collapsed eine manuell expandierte Sidebar. Das rechte Panel öffnet zuerst auf 45% des Viewports, dann behält es die Pixel-Präferenz des Nutzers, gedeckelt auf 70%. Um 400px für die Mitte zu schützen, reduziert das Frame das rechte Panel zuerst auf 300px, meldet dann unzureichenden Platz, sodass sein Occupant es schließt, und komprimiert erst dann die Mitte weiter. Dragging hat keine Transition-Verzögerung; der rechte Handle fehlt, solange geschlossen oder fullscreen.

Globale Panels besetzen den root-scoped `main`-Keyed-Slot; `conversation` ist der reservierte Key für die Conversation. `ctx.layout.selectPanel(id)` wählt ein registriertes Panel, und `null` wählt die Conversation, ohne die aktuelle Session zu ändern. Die ausgelieferte Komposition registriert kein globales Panel.

### Theme-Präsentation

Der Presenter konsumiert resolved Theme-Snapshots und projiziert sie auf das Document: `html { color-scheme }` für native UA-Chrome, `body[data-ds-dark-theme]` aus dem aktiven Farbschema, die Alias-Tokens des Themes und `--dsh-content-font-size` als Inline-Variablen auf body sowie einen eigenen `<meta name="theme-color">`, dessen Inhalt dem berechneten body-Hintergrund folgt. Das Disposen des Presenters entfernt seinen Metadata-Knoten zusammen mit seinen anderen globalen Writes.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

`selectPanel(id)` prüft das Live-`main`-Registry, bevor es die Auswahl ändert; ein fehlender Key wirft und lässt das aktuelle Panel intakt. `beginNavigation()` gibt ein Abort-Signal für eine asynchrone UI-Navigation zurück. Ein späterer Call, eine gültige Panel-Auswahl (einschließlich wiederholter Auswahl) oder Layout-Disposal aborted dieses Signal, ohne die zugrunde liegende Session-Erzeugung abzubrechen. Consumer prüfen das Signal, bevor sie Navigation committen oder Drafts verschieben.

Eine Registrierung deklariert vier Child-Slots und bindet die `ctx.layout`-Methoden `selectPanel`, `toggleSidebar`, `openRightbar(track, fullscreen)` und `closeRightbar`. Ein Root-Store trennt `panelInfo`-Auswahl von `layoutInfo`-Messungen, Breiten-Präferenzen und Präsentations-Reports. `usePanelInfo` abonniert das stabile Auswahl-Objekt; AppFrame abonniert das stabile Layout-Objekt. Der `rightbar`-Owner liefert die tatsächlichen `width`, `viewportWidth` und die Normal-Präsentations-Eignung `canShow`; unzureichender Platz verursacht ein deterministisches Schließen, niemals automatisches Wiederöffnen bei Verbreiterung. Fullscreen versteckt den Breiten-Handle, ohne eine Track freizugeben, die der Occupant behält. AppFrame hält die Spalten-Container gemountet. Der Root-Controller der rechten Spalte rendert `rightbar.session` über `SessionProvider` nur, solange die Conversation ausgewählt ist; sein Unmount-Report gibt die Track frei. Die unabhängige Titel-Komponente verwendet den ausgewählten Session-Titel nur, solange die Conversation sichtbar ist, mit dem build-konfigurierten Produkt-Titel oder dem lokalisierten `common.brand.localBuild` als Fallback; Locale-Revisionen aktualisieren diesen Fallback. Der Theme-Presenter ist ein zweiter Effect: reine DOM-Writes aus resolved Snapshots — Initial-State einmal über den Getter, danach nur event-getrieben, ohne React-Pfad. Er wendet Palette-, Fontgrößen- und Token-Variablen an, bevor er den gerenderten Hintergrund als einzige Farb-Autorität misst. Die Fullscreen-Präsentation unterdrückt Grid- und Handle-Transitions; ihr Occupant meldet die neuen Spalten erst, nachdem er das Frame überdeckt hat. Der Fullscreen-Exit hält Transitions unterdrückt, während das Frame seine Ziel-Geometrie installiert: Schließen entfernt die rechte Track, Restore behält sie. Nachfolgende normale Geometrie-Aktionen stellen gewöhnliche Transitions wieder her.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn die Layout-Oberfläche nicht ausreicht. Sie führen vom Frame zu den Spalten, die es rendert, und dem Theme, das es präsentiert.

- [ui-sidebar](../ui-sidebar/README.de.md) — besetzt die `sidebar`-Spalte und ihre Seats.
- [ui-conversation](../ui-conversation/README.de.md) — besetzt den `main`-Key `conversation`.
- [ui-sidebar-right](../ui-sidebar-right/README.de.md) — besetzt die `rightbar`-Spalte mit einer Docking-Oberfläche pro Session.
- [ui-theme](../ui-theme/README.de.md) — die Theme-Seam, deren resolved Snapshots der Presenter konsumiert.
- [Web-Client-Architektur](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.de.md) — wie Browser-Plugin-Zeilen laden und Slots registrieren.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da die Layout-Shell Browser-Viewing-State verwaltet; nichts davon erreicht einen Modell-Request.

#### KV-Cache-Effekt

Keiner; dieses Paket assembliert oder sendet keinen Provider-Request.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren das aktuelle Layout-Verhalten. Sie sind aktuelle Paket-Einschränkungen, kein allgemeiner Window-Manager-Vergleich und kein Task-Backlog.

- **Panel-Geometrie ist transient** — Reload stellt den Sidebar-Default und das versteckte rechte Panel wieder her; jede gedragte Breite ist eine Frame-weite Präferenz, kein Per-Session-Fakt.
- **Extrem schmale Fenster** — nach dem Schließen des rechten Panels kann die Mitte immer noch unter 400px fallen; die linke 56px-Rail bleibt.
- **Track und Panel fahren auf einer geteilten Kurve** — die Track-Transition des Frames und der Slide des Occupants lesen dieselben Duration- und Easing-Variablen; ein Occupant mit eigenen würde die Kante des Panels beim Zusammendrücken von der der Conversation lösen.
- **Kein Scroll-Anchoring während Squeeze-Reflow** — Layout-Änderungen können den Viewport des Lesers verschieben.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>

**Runtime-Invariante:** Es wird kein Begleiter veröffentlicht. Der Viewing-State-Store hinter ctx.layout emittiert keine Cordis-Events; Clamp- und Track-Sequenzierung wird direkt durch die Columns- und Service-Specs dieses Pakets asserted.
