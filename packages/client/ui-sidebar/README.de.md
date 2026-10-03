---
description: "Sidebar-Shell-Plugin für den dsh-Web-Client: Brand-Zeile, New-Session-Aktion, Collapse-Control, scrollbewusster Regions-Sitz und am unteren Rand gepinnter Settings-Sitz."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sidebar
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

Die Sidebar des dsh-Web-Clients lässt Nutzer den aktiven Build erkennen, eine neue Session starten, die Navigation zu einer 56px-Rail einklappen, Workspaces und Sessions durchsuchen und Settings öffnen. Sie hält den Settings-Eintrag am unteren Rand gepinnt und verbirgt inaktive Scrollbars, ohne Browser-Zeilen zu verschieben. New Session verwendet zuerst einen explizit gewählten Workspace, dann den Workspace der aktuellen Session, dann den zuletzt aktiven Workspace; existiert keiner, öffnet sie eine leere New-Session-Seite. Deployments können Brand-Mark oder -Name ersetzen und behalten dabei die Navigationscontrols und die Rail-Geometrie.

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

Die Sidebar ist die Navigations-Shell: Nutzer sehen die Brand, starten neue Sessions, klappen die Rail ein und erreichen Settings. Feature-Plugins füllen ihre Sitze — ui-workspace füllt `sidebar.workspaces`, ui-settings registriert die Trigger-Zeile und das Settings-Panel an `sidebar.settings`.

### Brand und New Session

Die expandierte Brand-Zeile rendert `sidebar.brand.mark` und `sidebar.brand.name` als unabhängige Single-Slots; die eingeklappte Rail rendert denselben Mark-Slot. Ohne Occupants verwendet die Shell die Fisch-Marke und ein lokalisiertes Local-Build-Label. Ein vollständiger Build stapelt ein Code-Badge unter dem Label als `version[-commit][-dirty]` aus `DSH_CLIENT_VERSION`, dem optionalen 7-stelligen `DSH_CLIENT_COMMIT_HASH` und `DSH_CLIENT_GIT_DIRTY=true`; fehlende Versionsmetadaten lassen das Badge weg. New Session zielt auf den expliziten Workspace einer scoped Action, sonst auf den Workspace der aktuellen Session, sonst auf den zuletzt aktiven Workspace; existiert keiner, leert sie sich in die leere New-Session-Seite.

### Globale Panel-Einträge

Plugins fügen der root-scoped `sidebar.panellist`-List eine Icon-Komponente mit einer `id`, optionalem `order` und einem String- oder locale-bewussten `label` hinzu. Dieselbe Id adressiert die im root-scoped `main`-Keyed-Slot des Layouts registrierte Komponente; die Auswahl eines fehlenden Main-Eintrags wirft, ohne die aktuelle Auswahl zu ändern. Das Label liefert den sichtbaren Text, den Accessible Name und den Collapsed-Tooltip. Jede Zeile liest ihren eigenen Selected-State über `usePanelInfo`; das Verschieben des DOM-Fokus auf Suche oder einen Directory Picker ändert weder das angezeigte Panel noch seine ausgewählte Zeile. Ohne Registrierungen wird weder die Liste noch Platz für sie gerendert. Die ausgelieferte Composition registriert kein Beispiel-Panel.

### Collapse-Verhalten

Während eines Live-Collapse fadet der expandierte Inhalt auf seiner aktuellen Breite aus, die oberen Controls teilen sich einen Fade und eine Linkstranslation in die 56px-Rail, und der Spalten-Slide des Layouts beendet die Bewegung. Eine Seite, die eingeklappt startet, rendert die Rail statisch, und der Reduced-Motion-Modus deaktiviert beide Transitionen. Das am unteren Rand gepinnte `sidebar.settings`-Control teilt das Fade-Timing, hat aber keine horizontale Translation.

### Scrollbars

Scrollbars in der Spalte sind eine Pointer-Affordanz: Die Shell bindet die Scrollbar-Indirektion auf `transparent` um, sobald der Pointer außerhalb der Spalte ist, und hält den Thumb noch 2 s nach dem Verlassen gezeichnet, sodass eine Liste, auf die niemand zeigt, keinen Balken trägt. Die Reservierung, die Zeilen am Verschieben hindert, gehört der scrollenden Region (ui-workspace), sodass das Einblenden eines Thumbs nie ein Reflow auslöst.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Die Shell ist reine Composition: `SidebarRootComponentProps` komponiert den Layout-Owner-Share, die globalen `useSessions`- und `useWorkspaces`-Hooks, die deklarierte Brand, die `sidebar.workspaces`- und `sidebar.settings`-Child-Slots und injizierte Navigations-Callbacks. Panel-Einträge und ihre optionalen Titel nutzen denselben Compositionspfad. Panel-Metadaten werden aus List-Registrierungen und Locale-Wechseln abgeleitet; die Auswahl gehört dem Layout-Store.

### Slot-Disziplin

Das deklarationsbewusste `slots.inject()` lässt ein ersetzendes Paket vor oder nach der Sidebar aktivieren. Der Fuß ist der `sidebar.settings`-Sitz: Die Sidebar rendert nur den unten gepinnten Layout-Slot und teilt seinen Spalten-State (`wide`). Die `/client`-Exports sind der Plugin-Body (`apply`/`inject`) plus ausschließlich die Contract-Typen; SidebarRoot, die Zeilen-Komponenten und die Baum-Ableitung bleiben paketintern hinter der Slot-Registrierung.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten decken die Oberflächen ab, die die Sitze der Shell füllen, sowie das Compositionsmodell.

- [ui-workspace](../ui-workspace/README.de.md) — der Workspace- und Session-Browser, der in `sidebar.workspaces` rendert.
- [ui-settings](../ui-settings/README.de.md) — die Settings-Domain-Basis, die die Trigger-Zeile an `sidebar.settings` registriert.
- [ui-layout](../ui-layout/README.de.md) — der Layout-Owner, dessen Rail- und Spalten-State der Collapse nutzt.
- [ui-theme](../ui-theme/README.de.md) — die Scrollbar-Token-Indirektion, die die Shell umbindet.
- [Slot-System-Standard](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.de.md) — das Compositionsmodell hinter den Sitzen.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da das Paket eine browserseitige UI-Plugin-Schicht ist, die nichts Modellzugewandtes registriert.

#### KV-Cache-Effekt

Keiner; dieses Paket assembliert oder sendet keinen Provider-Request.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, was die Shell besitzt und was ihre Occupants besitzen; sie sind aktuelle Paket-Constraints.

- **Das Rendering der Session-Status-Punkte gehört ui-workspace** — dieser Shell stehen keine Done/Error-Notification-Quellen zur Verfügung.
- **Das Workspace-Browser-Verhalten gehört der Composition** — Gruppierung, Ordering, Suche und Zeilen-State gehören ui-workspace, nicht dieser Shell.
- **Die Ungelesen-Markierung „New task completed“ ist lokaler Viewing-State** — completion-time > last-seen erreicht den Host nie.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Panel-Metadaten sind eine Read-only-Presentation-Projektion der Slot-Registry und der Locale, ohne eigenständige Write-API. Die Registry besitzt Entry-Identität und Disposal; die Assembly-Tests dieses Pakets asserten die Projektion, nachdem Registrierungs- und Locale-Notifications abgerechnet sind. Die Shell besitzt keinen separaten Navigations-State, der mit diesen Quellen abgeglichen werden müsste.
