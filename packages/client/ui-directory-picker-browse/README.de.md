---
description: "In-App-Verzeichnis-Browsing-Oberfläche: der Miller-Column-Dialog „Arbeitsverzeichnis auswählen“, der die Workspace-Verzeichnis-Flows füllt; für Nutzer und Maintainer der Web-Auswahlerfahrung."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-directory-picker-browse

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Dieses Paket stellt die In-App-Verzeichnis-Browsing-Oberfläche der Web-GUI bereit: einen Dialog „Arbeitsverzeichnis auswählen“, der Ordner über den lokalen Host auflistet, durch sie navigiert und sie anlegt — ganz ohne Betriebssystem-Auswahldialog. Es füllt die beiden von `ui-workspace` deklarierten Directory-Flow-Slots und komponiert in einer cordis.yml-Zeile die Client-Seite der Browse-Picking-Interaktion. Es ist die richtige Wahl, wenn der Browser remote oder prozessintern läuft und kein lokaler OS-Chooser existiert; lokale Deployments bevorzugen eventuell die [`-native`](../ui-directory-picker-native/README.de.md)-Oberfläche.

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

Dieses Plugin zusammen mit `ui-workspace` und dem Host-Backend [`dsh-host-directory-picker-browse`](../../host/directory-picker-browse/README.de.md) mounten; eine cordis.yml-Zeile komponiert dann die gesamte Browse-Picking-Interaktion. Wenn ein Workspace-Flow eine Verzeichnisanfrage öffnet, sieht der Nutzer den In-App-Dialog: einen Header mit Pfad-Breadcrumb und editierbarer Pfadzone, dann eine einzelne ebenebreite Spalte, bis eine Zeile ausgewählt wird; danach teilt sich die Zeile in Ebenen- und Kindspalten.

### Navigieren und Anlegen

Durch Ordner steigen, den Pfad direkt editieren oder die letzte Spalte per Präfix filtern; ein vom Host als versteckt markierter Eintrag bleibt verborgen, bis der Footer-Schalter ihn aufdeckt. **Neuer Ordner** öffnet einen verschachtelten Anlegedialog, der auf den ausgewählten Ordner zielt, und wählt aus, was er anlegt; **Öffnen** übernimmt den ausgewählten Ordner und fällt sonst auf die gelistete Ebene zurück. Ein Verzeichnis zu bestätigen ist der gepickte Pfad; den Dialog zu schließen ist der Abbruch.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Der Dialog ist eine 680×500-Miller-Column-Ansicht (auf niedrigen oder schmalen Viewports geclamped), getrieben von den Host-Primitiven `listDirectory` und `createDirectory` über `ctx.workspaces`. Beide Registrierungen installieren sich über verschachtelte `ctx.slots.inject()`-Aufrufe als ein transaktionaler Effect, weil jeder deklarierende Eintrag später aktiviert werden oder seine Deklaration ersetzen kann; die Dialog-Texte leben im eigenen Locale-Namespace dieses Pakets, sodass die beiden Wörterbücher als Einheit landen. Browse-Fehler bleiben in den eigenen Alert-Flächen des Dialogs, sodass dieser Insasse den `onError`-Arm des Owners nie treibt. Die Node-Hälfte ist ein leeres `apply`, das das Plugin in der Host-Liste hält.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn die Picking-Oberfläche nicht ausreicht. Sie führen von der Browser-Hälfte zum Host-Backend und zu den Slots, die es füllt.

- [dsh-host-directory-picker-browse](../../host/directory-picker-browse/README.de.md) — das Directory-Listing-Backend, das diese Oberfläche treibt.
- [ui-workspace](../ui-workspace/README.de.md) — deklariert die Directory-Flow-Slots und besitzt die Picking-Konversation.
- [ui-directory-picker-native](../ui-directory-picker-native/README.de.md) — die native OS-Chooser-Alternative für lokale Deployments.
- [Web-Client-Architektur](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.de.md) — wie Browser-Plugin-Zeilen laden und Slots registrieren.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da der Verzeichnis-Browser Browser-Chrome ist; nichts hier erreicht einen Model-Request.

#### KV-Cache-Effekt

Keiner; dieses Paket stellt weder einen Provider-Request zusammen noch sendet es einen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren die aktuelle Browse-Oberfläche. Sie sind gegenwärtige Paket-Constraints, kein allgemeiner Datei-Browser-Vergleich und kein Aufgabenrückstand.

- **Keine Suche, keine Mehrfachauswahl und kein Umbenennen oder Löschen** — der Dialog listet Verzeichnisse und legt sie an; ein Ziel wird durch Navigieren, Editieren des Pfads oder Präfixfiltern der letzten Spalte erreicht.
- **Das Filtern versteckter Einträge läuft clientseitig** — der Host listet versteckte Einträge immer und markiert sie, sodass der Schalter nur ändert, was der Dialog rendert.

<a id="dev-note"></a>
### Entwicklerhinweis

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Laufzeit-Invariante:** Es wird kein Companion veröffentlicht. Das Plugin registriert einen Workspace-Directory-Flow-Owner, dessen Freigabe die HMR-Sicherheits-Spec beweist, und jede angezeigte Auflistung wird bei Bedarf erneut vom Host gelesen statt hier gehalten.
