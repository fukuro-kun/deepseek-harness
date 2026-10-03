# Agent Note: Globale Main-Panels ohne Default-UI-Ergänzungen

Status: implemented

[English](2026-09-08-global-main-panels.md) | [中文](2026-09-08-global-main-panels.zh.md) | Deutsch

## Problem

Plugins benötigen anwendungsweite Ansichten, die nicht zu einer Session gehören. Eine Session-scoped Conversation-Ansicht kann diese Lebensdauer nicht bieten, und das Ersetzen des einzigen Slots der Conversation entfernt die gewöhnliche Conversation-Oberfläche. Das Hinzufügen dieser Erweiterung darf der Default-Anwendung weder Navigationssteuerungen noch reservierten Platz hinzufügen.

## Entscheidung

Das Layout deklariert einen root-scoped, gekennzeichneten `main`-Slot. Der reservierte Schlüssel `conversation` gehört dem Conversation-Plugin, dessen `main.conversation`-Child die optionale Session-Bindung behält. Andere Main-Einträge erhalten keine implizite Session-Bindung.

Die Sidebar besitzt die root-scoped `sidebar.panellist`-Liste. Jeder Listeneintrag liefert sein Icon und eine id, die zu seinem Main-Eintrag passt; sein String- oder locale-bewusstes Label liefert den sichtbaren Text, den Accessibility-Namen und den Collapsed-Tooltip. Die ausgelieferte Komposition registriert keinen Panel-Eintrag, sodass die leere Liste kein DOM und keinen Abstand hat. Die Auswahl validiert den aktiven Main-Eintrag und lehnt einen fehlenden Schlüssel ab, ohne das aktuelle Panel zu ersetzen.

Ein eager erzeugter Root-Store wird von Renderer und Layout-Controller geteilt. Seine Objekte `panelInfo` und `layoutInfo` erhalten unabhängige Referenzen. Das Framework stellt `usePanelInfo` bereit; einzelne Zeilen und Main-Inhalte abonnieren ihre benötigten Auswahlwerte, während AppFrame nur Layout-Informationen liest. Der Root-Controller der rechten Sidebar entscheidet, ob er ihren Session-Subtree montiert, und meldet die resultierenden Spuranforderungen an den Frame.

`uiWorkspace.openSession(id)` wählt die Session, bevor es den Main-Bereich zur Conversation zurückführt, auch wenn dieselbe Session erneut gewählt wird. `openWorkspace` und `forkSession` nutzen das `beginNavigation()`-Abort-Signal des Layouts und ihre eigene Service-Lebensdauer, um nur die neueste Navigation zu committen. Der Workspace-Preparation-Callback verschiebt Drafts synchron nur solange, wie die Anfrage aktuell bleibt. Supersession verhindert einen späten UI-Commit, nicht die Session-Erzeugung. Panel-Navigation bricht weder die gehaltene Session ab noch schreibt sie ein Session-Event.

DOM-Fokus ist keine Navigationsauswahl. Such- und Verzeichnis-Picker-Steuerungen können Fokus erhalten, während das globale Panel und seine ausgewählte Sidebar-Zeile sichtbar bleiben; das Öffnen einer Session ändert die Main-Auswahl.

## Betrachtete Alternativen

**Session-scoped Main-Ansichten.** Ihre Lebensdauer und Standard-Props binden anwendungsweiten Zustand an die jeweils gerade aktuelle Session.

**Ein zweiter Navigations-Stack.** Zurück-Buttons und gespeicherte Rückkehrziele sind unnötig, wenn New Session und Workspace-Session-Zeilen bereits explizite Ziele bieten.

**React-Titel-Slots.** Navigationseinträge nutzen dasselbe schlichte Label für sichtbaren Text und Accessibility; eine getrennte Titel-Registrierung liegt außerhalb dieser Darstellung.

**Flacher Auswahl- und Layout-Zustand mit Shallow-Vergleich.** Das Trennen der beiden Store-Objekte erhält Referenzgleichheit direkt und vermeidet, bei jeder Panel-Auswahl eine frische Layout-Projektion zu allozieren und zu vergleichen.

## Konsequenzen

Die Default-Sidebar-Snapshots bleiben unverändert. Erweiterungs-Panels haben keine rechte Sidebar, und die Auswahl eines anderen globalen Panels ändert keine Layout-Präferenzen. Das Wechseln zwischen einer Conversation mit sichtbarer rechter Sidebar und einem globalen Panel ändert weiterhin die benötigten Spaltenbreiten; dies ist kein Versprechen von null Browser-Layout-Arbeit.

Panel-Auswahl ist transient und wird beim Reload zurückgesetzt. Das Disposen eines Plugins entfernt seine Beiträge; das Entfernen des ausgewählten Main-Eintrags führt den Main-Bereich zur Conversation zurück. Tests registrieren echte temporäre Panels und decken Zeilen-Interaktion, Fokus, unabhängige Store-Referenzen, ungültige ids, ersetzte asynchrone Navigation, Deklarations-Lebensdauern und die leere Default-Sidebar ab. Die [Slots-Referenz](../../../../docs/subsystems/slots.de.md) besitzt die Kompositions-API.
