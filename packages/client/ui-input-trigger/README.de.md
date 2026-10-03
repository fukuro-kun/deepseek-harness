---
description: "Input-Trigger-Pipeline für die Web-GUI: /- und @-Erkennung am Caret, das gruppierte Kandidatenmenü und das Pick-Routing zu registrierten Quellen; für Nutzer und Maintainer von Slash-Commands und Referenzen."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-input-trigger
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Wenn Nutzer in der Web-GUI am Caret `/` oder `@` tippen, öffnet dieses Paket ein gruppiertes Menü für Slash-Commands, Dateireferenzen und Session-Referenzen. Es unterstützt Tastatur- und Zeigerauswahl, einschließlich Drill-down-Optionen und Launcher, die eine einzelne Kandidatengruppe über der aktuellen Auswahl öffnen. Ein Pick ruft entweder einen Command-Flow auf oder fügt eine Referenz ein, die die konsumierende Eingabefläche verarbeitet. Das Paket wirkt nur auf die Browser-Darstellung; es stellt keine Model-Requests zusammen und sendet keine.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Entwicklerhinweis](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Dieses Plugin zusammen mit `ui-conversation` mounten; das Menü erscheint dann im Input-Overlay, wenn der Nutzer einen Trigger am Caret tippt. Gruppierte Kandidaten rendern unter Titelzeilen; ein Pick wird zur Quelle geroutet, und die konsumierende Fläche wendet das Ergebnis an — ein Slash-Command öffnet sein Popup oder führt aus, eine Referenz fügt ihr Inline-Token ein.

### Tastatur und Maus

Die Composer-Fläche behält den Fokus, solange das Menü offen ist: Zeilen picken auf mousedown, die Hervorhebung läuft über `aria-activedescendant`, und ein Zeigerdruck außerhalb von Menü und Composer-Card schließt es. Die Leertaste- und Enter-Entscheidung pollt die optionalen `matchSpace`-/`matchEnter`-Hooks in Registrierungsreihenfolge; die erste nicht-undefined-Antwort gewinnt, und eine Quelle kann einen Submit ablehnen, den sie nicht vollständig konsumieren kann. Tab wirkt auf die hervorgehobene Vervollständigung: Ein Kandidat mit `drill: true` läuft über `onPick` mit `action: 'drill'`, ein gewöhnlicher Kandidat über `action: 'pick'`; ohne Hervorhebung reicht Tab unverändert weiter, sodass die native Fokus-Navigation erhalten bleibt. Der abschließende Chevron einer drillbaren Zeile bietet Zeigernutzern dasselbe zweite Verb. Eine Quelle, die den optionalen `header`-Hook implementiert, veröffentlicht zusätzlich Breadcrumbs über ihrer Gruppe: Die Pipeline pollt ihn bei jedem Treffer erneut mit der Live-Query und der Angabe, ob ein Drill statt Tippen sie erzeugt hat, und ein Crumb-Pick läuft über `onPick` mit `action: 'drill'` zurück.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

`src/core/` ist der reine Kern — Trigger-Erkennung, Menü-Reduktion und exaktes Matching, ohne React/DOM/Cordis — während `src/client/service.ts` den Kern an den Menü-Snapshot-Store, den Kandidaten-Fetch pro Treffer (generation-gated, per `AbortSignal` abgelöst, fehlgeschlagene Quellen werden still fallengelassen und hinterlassen einen Konsoleneintrag) und die Pick-Pfade anbindet. Ein `InputTriggerController` wird pro Session-Scope aufgelöst (`sessionOf`); die Conversation-Verdrahtungsschicht treibt `track`/`arbitrate`/`onSpace`/`adjudicate` auf dem Controller. Eine Quelle wird in jeden erreichbaren Session-Controller vorgewärmt; Quellen, deren `lexicon` sich nach dem Warmen ändert, implementieren `subscribeLexicon`, und der Controller pollt bei jeder Benachrichtigung neu. `MenuView` registriert sich selbst in `conversation.input.overlay` (Listenart, Session-Scope) und rendert null, solange es geschlossen ist. Die `listbox`-Rolle sitzt auf seinem scrollenden Viewport statt auf der begrenzten Shell, weil ein Breadcrumb-Header keine Option ist und eine Listbox keinen tragen darf; die Crumbs laufen über einen eigenen Snapshot-Store neben dem Menü-Store, sodass der eingefrorene Reducer sie nicht kennt. Der Overlay-SlotMap-Merge lebt hier, weil die Abhängigkeitsrichtung (ui-conversation → ui-input-trigger) keinen umgekehrten Type-Import zulässt.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn die Trigger-Pipeline nicht ausreicht. Sie führen von der Pipeline zu den Quellen, die sich in sie registrieren, und zur Shell, die die Eingabe besitzt.

- [ui-commands](../ui-commands/README.de.md) — registriert die `/`-Command-Quelle in diese Pipeline und besitzt die Command-Popup-Shell.
- [ui-reference](../ui-reference/README.de.md) — registriert die `@`-Datei- und Session-Referenzquellen.
- [ui-conversation](../ui-conversation/README.de.md) — deklariert den Input-Overlay-Slot und besitzt Composer und Input-Maschine.
- [Web-Client-Architektur](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.de.md) — wie Browser-Plugin-Zeilen laden und Slots registrieren.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da die Trigger-Pipeline reine Browser-Darstellung ist — Picks erzeugen Command-Ansprüche und Referenz-Einfügungen, deren modellsichtbare Folgen die konsumierenden Host- und Input-Maschine-Pakete besitzen.

#### KV-Cache-Effekt

Keiner; dieses Paket stellt weder einen Provider-Request zusammen noch sendet es einen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren die aktuelle Trigger-Pipeline. Sie sind gegenwärtige Paket-Constraints, kein allgemeiner Menüvergleich und kein Aufgabenrückstand.

- **Nur globale Quellenebene** — Quellen-Registrierung mit Session-Scope (sessionweise Überlagerung) ist entworfen, aber nicht aktiviert; das Journal verfolgt die Trigger-Bedingung, einen echten Bedarf für sessionweise Quellen.
- **`InputTriggerCandidate.icon` rendert als Text** — `MenuView` legt den String wortwörtlich in den Icon-Slot; die Anbindung an das Design-System-Icon-Enum landet, sobald dieses Enum shippt.
- **Der Overlay-SlotMap-Merge ist vom Slot-Besitz getrennt** — der einzige `conversation.input.overlay`-Merge lebt hier, während ui-conversation Anker, children-Deklaration und Lifecycle besitzt, weil die Abhängigkeitsrichtung ui-conversation → ui-input-trigger ist.

<a id="dev-note"></a>
### Entwicklerhinweis

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Laufzeit-Invariante:** Es wird kein Companion veröffentlicht. Die Trigger-Pipeline ist ein browserseitiger reiner Kern (detect/reduce/match) plus eine Registry, deren Freigabe die HMR-Sicherheits-Spec beweist; sie emittiert keine Cordis-Events und besitzt keinen pluginübergreifenden veränderlichen Zustand.
