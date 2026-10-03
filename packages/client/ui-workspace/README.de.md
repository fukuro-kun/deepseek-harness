---
description: "Geteiltes Workspace-Browser- und Picker-Plugin für den dsh-Web-Client: gruppierte oder flache Session-Zeilen, Hinzufügen/Umbenennen/Umsortieren, Suche, Fork, Archivieren/Wiederherstellen und das Directory-Flow-Picking-Hole."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-workspace
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

Dieses Paket lässt Nutzer gruppierte oder flache Session-Listen durchsuchen, einen Workspace für eine neue Session wählen und Workspaces und Sessions über Hinzufügen, Umbenennen, Umsortieren, Suche, Fork, Archivieren, Wiederherstellen und Workspace-Löschung verwalten. Ausstehende Interaktionen erscheinen als Warnpunkte, aktive geplante Tasks als Wecker-Markierungen, und Sessions mit subagent-Ursprung bleiben verborgen. Kanonisch unterschiedliche Ordnerpfade bleiben getrennte Workspaces. Das Hinzufügen eines Workspaces erfordert einen komponierten Directory Picker; ohne einen ist die Add-Aktion nicht verfügbar.

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

Die Sidebar verwenden, um Workspaces und ihre Sessions zu durchsuchen, umzusortieren und neue zu starten; den Picker im Session-Intent-Hero verwenden, um einen Workspace für eine neue Session zu wählen. Ein offener Workspace zeigt standardmäßig fünf nicht-leere Sessions und behält die ausgewählte leere **New Session** als eine provisorische Extrazeile bis zu ihrem ersten Prompt. **Show more** enthüllt den verborgenen Rest; Schließen und Wiederöffnen des Workspaces stellt diese gefaltete Projektion wieder her.

### Umsortieren und Ansichtsoptionen

Ansichtsoptionen kombinieren Gruppierung mit einer browserpersistierten Session-Reihenfolge pro Account: **Manual** und **Last updated** gelten in beiden Darstellungen. Der Wechsel zu Last updated führt eine vollständige Recency-Sortierung aus, und spätere User-Prompts oder Steers befördern ihre Session einmal; der Wechsel zu Manual bewahrt jede aktuelle Position und deaktiviert spätere Beförderung. Dragging editiert die aktuelle Reihenfolge in beiden Modi; Manual-Mode-Drags für reale Workspaces aktualisieren auch den Host-Session-Account, während Ungrouped- und Flat-List-Reihenfolgen browser-lokal bleiben. In einer kollabierten Gruppe folgen Drag-Grenzen den gerenderten Zeilen und platzieren die Quelle vor dazwischenliegenden verborgenen Zeilen, sodass ein Drag seine Quelle nicht verbergen kann. Die Workspace-Drag-Reihenfolge ist in beiden Session-Order-Modi Host-durable.

### Suche

Die kollabierte Suche ist eine Header-Aktion neben den View- und Add-Aktionen: Ihre Aktivierung expandiert das Feld über den Header. Eine nicht-leere Query ersetzt jeden Browsing-Modus durch eine flache Ergebnisliste — case-insensitive Titel- und Workspace-Substring-Matches erscheinen sofort, während ein um 250 ms debounced Host-Request gerankte Content-Matches und Snippets der aktuellen Konversation hinzufügt. Jede neue Query bricht den vorherigen Request ab; eine fehlgeschlagene Content-Suche lässt Metadaten-Matches mit einer Warnung sichtbar. Die Liste ist auf 20 begrenzt. Die Wahl eines Ergebnisses leert und kollabiert die Suche, öffnet die Session und scrollt ihre Zeile im konfigurierten Browsing-Modus in den sichtbaren Bereich; gruppiertes Browsen expandiert bei Bedarf auch dessen Workspace und die vollständige Session-Liste.

### Sessions verwalten

Die Rename-Aktion der Session-Zeile öffnet einen mit dem Anzeigetitel der Zeile vorbefüllten Dialog; das Bestätigen eines unveränderten Titels ist absichtlich erlaubt — es pinnt den aktuellen automatischen Titel gegen Regenerierung. Archive committed ohne Bestätigungsdialog, und die Zeile verschwindet von jeder Grouping-Oberfläche, sobald das Archive-Set-Echo eintrifft. Fork forkt am letzten abgeschlossenen Turn der Quelle, inkrementiert den geerbten persistierten Titel auf dem Client und öffnet dann das Child. Workspace Delete öffnet eine Bestätigung, die die Retention-Grenze benennt; Erfolg entfernt die Gruppe, während ihre Sessions unter Ungrouped bleiben.

Ein gefalteter **Archive**-Abschnitt am Fuß der Session-Liste hält archivierte Zeilen erreichbar: Sein Expandieren zeigt jede archivierte Session abgedunkelt und inert gegen Öffnen oder Draggen, und ihr Zeilenmenü trägt nur **Restore**, das die Session in ihren behaltenen Workspace-Slot zurückbringt — kein Reorder-Write, kein Bestätigungsdialog, und der Abschnitt löst sich auf, wenn die letzte Zeile ihn verlässt.

### Ausstehende Interaktionen

Session-Zeilen rendern die Live-`pendingInteraction`-Klassifikation der Runtime: Approvals melden **Waiting for approval**, Plan-Reviews melden **Plan awaiting review**, und gewöhnliche Fragen melden **Waiting for answer**. Jede ausstehende Interaktion verwendet einen bernsteinfarbenen Warnpunkt, der Vorrang vor dem Running-Indikator hat.

### Aktive Schedule-Markierungen

Gruppierte und flache Session-Zeilen sowie Suchergebnisse zeigen einen Outline-Wecker, wenn `SessionSummary.projectionValues.schedule` ein nicht-leeres Array ist. Die Markierung sitzt hinter dem Titel; eine gewöhnliche Zeile behält ihre Update-Zeit hinter der Markierung, während ein Suchergebnis keine Update-Zeit hat. Sie ist kein Button, hat keine eigene Pointer-Aktion und keinen Tab-Stop, und ein Klick auf ihren Bereich öffnet trotzdem die Zeile. Der lokalisierte Tooltip und das passende Screenreader-Label sagen **Has active scheduled task**.

Der Wert ist für Cold Sessions absichtlich best effort. Eine identitätsmatchende, verwendbare Projection-Cache-Zeile kann den Wecker vorwärmen, ohne die Session zu öffnen; ein fehlender oder staler Cache kann sie kurz auslassen oder behalten. Die Markierung bedeutet nur, dass der aktuelle Listenwert einen undispatcheden oder ungelöschten Schedule-Record enthält. Sie meldet nicht, ob eine Schedule-Runtime live ist oder die Session wecken kann.

-----

`ctx.uiWorkspace.openSession(id)` selektiert die Session und bringt den Main-Bereich als eine UI-Navigationsaktion zur Conversation zurück, auch wenn diese Session bereits aktuell war. `openWorkspace(id, beforeOpen?)` und `forkSession(id)` öffnen ihr Ergebnis nur, wenn keine spätere Navigation die Anfrage überholt hat; New Session verwendet `openWorkspace`. Der optionale synchrone Preparation-Callback läuft nur für eine aktuelle Workspace-Anfrage, sodass überholte Anfragen keine Composer-Drafts verschieben. Navigation oder Owner-Disposal unterdrückt den späten UI-Commit, nicht die zugrunde liegende Session-Erstellung. Ein Selection-Fehler lässt ein globales Panel sichtbar. Session-Zeilen lesen `usePanelInfo`, um ihr ausgewähltes Aussehen zu unterdrücken, solange ein globales Panel aktiv ist; allein der Fokus auf Suche oder Directory Picker verlässt dieses Panel nicht.

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Das Paket ist eine Composition: Beide Ziel-slots werden von anderen Plugins deklariert, daher verwendet `apply` `slots.inject()`, um sich für jede Deklarationslebensdauer zu registrieren und nach Wiederherstellung eines deklarierenden slots erneut zu registrieren.

### Das Directory-Flow-Hole

Jede Registrierung deklariert ein **Directory-Flow-Child-Hole** (`single`-Kind: `conversation.hero.workspace.directoryFlow` / `sidebar.workspaces.directoryFlow`), das die Client-Hälfte des komponierten Picker-Pakets mit seiner Picking-Interaktion füllt — den renderlosen OS-Chooser-Treiber des `-native`-Backends, einen In-App-Browsing-Dialog unter einer `-browse`-Composition. Die flache **Add workspace...**-Aktion rendert nur, solange das Hole der Oberfläche besetzt ist; ein leeres Hole bedeutet, dass die Composition keine Picking-Affordanz hat. Dieses Paket besitzt den Trigger und die Adoption: Der Occupant meldet pro open einen gepickten Pfad über die Owner-Conversation des holes (`open`/`busy`/`onPicked`/`onCancel`/`onError`), und der Owner adoptiert ihn über die Object Layer und selektiert den committed Workspace erst, nachdem dessen Listenprojektion aktualisiert wurde.

### View State

Sobald die Workspace-Listen-Baseline bereit ist, behalten browserpersistierte Expansion- und Session-Order-Records nur aktuelle Workspace-Ids plus Ungrouped und den Flat-List-Account. Reale Workspaces initialisieren aus `WorkspaceView.sessionIds`, während Ungrouped und die workspaceübergreifende Flat List aus Recency initialisieren. Die geteilte Sidebar-Projektion verbirgt Zeilen, deren durable Session Summary `origin: 'subagent'` trägt, und jede sichtbare gewöhnliche Zeile erbt den blauen Aktivitätsindikator, solange ein über ununterbrochene subagent-Ursprungslinie erreichbarer Descendant läuft. Dieselbe reine Ableitung liest den Schedule-Key aus Listen-Projektionswerten für gruppierte, flache und Suchknoten; das Paket verwendet nur die Type-only-Dependency `@deepseek-ai/dsh-schedule/client` und importiert weder die Schedule-Runtime noch `ui-schedule`.

### Hover Cards

Workspace- und Session-Hover-Cards kopieren den Wert, den ihre Zeile clippt: Das Aktivieren einer Workspace-Card schreibt ihren vollständigen Verzeichnispfad, während das Aktivieren einer nicht-leeren Session-Card ihren vollständigen Anzeigetitel schreibt. Eine provisorische leere New-Session-Card bleibt read-only, weil ihr lokalisiertes Label ein Platzhalter ist, kein Session-Inhalt.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten decken den Sidebar-Host, die Hero-Oberfläche und die Picking-Backends ab.

- [ui-sidebar](../ui-sidebar/README.de.md) — die Sidebar-Shell, die das `sidebar.workspaces`-Hole hostet.
- [ui-conversation](../ui-conversation/README.de.md) — die Chat-Oberfläche, die das Picker-Hole des Session-Intent-Hero hostet.
- [directory-picker-native](../../host/directory-picker-native/README.de.md) — das OS-Chooser-Backend, das das Directory-Flow-Hole füllt.
- [Workspace Controller](../../api/workspace-controller/README.de.md) — die Host-Mutations und die framework-neutrale Client-Projektion, die Workspaces und Ordering besitzen.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da das Paket eine browserseitige UI-Plugin-Schicht ist, die nichts Modellzugewandtes registriert.

#### KV-Cache-Effekt

Keiner; dieses Paket assembliert oder sendet keinen Provider-Request.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren die Suchtiefe, die Archive-Oberfläche und den Picking-Träger; sie sind aktuelle Paket-Constraints.

- **Keine Fuzzy-Content-Suche oder Event-Deep-Links** — das Content-Backend verwendet literales Token-/Phrase-Matching, und die Wahl eines Ergebnisses öffnet die Session statt des matchenden Events.
- **Kein Session-Löschen** — Sessions können archiviert und aus dem Archive-Abschnitt wiederhergestellt werden, aber es gibt keine Delete-Oberfläche, und das Löschen einer Workspace-Registrierung löscht keine Sessions.
- **Ausstehende User-Interaktion wird nicht in kollabierte Gruppen aggregiert** — eine wartende Zeile innerhalb einer kollabierten Gruppe zündet keinen Gruppen-Header-Indikator und wird erst nach Expandieren dieser Gruppe sichtbar.
- **Native Ordnerwahl hängt vom lokalen Host-Träger ab** — unter der `-native`-Composition können In-Process- oder Remote-Browser-Deployments keinen lokalen Betriebssystemdialog öffnen; remote-fähiges Picking ist der In-App-Flow der `-browse`-Composition.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Ein Pure-Consumer-Plugin, das Presentation Components in zwei Host-deklarierte slots plus seine Locale-Dictionaries registriert — seine inject-Face sind stateless RPC-Wrapper plus ein Create-and-Open-Call; es emittiert keine Cordis-Events und besitzt keinen pluginübergreifenden mutablen State.
