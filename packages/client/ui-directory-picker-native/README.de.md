---
description: "Native Directory-Picker-Oberfläche: die Browser-Hälfte, die den OS-Chooser des Hosts für Workspace-Verzeichnis-Flows treibt; für Nutzer und Maintainer, die eine Picking-Interaktion wählen."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-directory-picker-native
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Dieses Paket stellt die native Directory-Picking-Oberfläche der Web-GUI bereit: Wenn ein Workspace-Flow ein Verzeichnis anfragt, öffnet ein renderloser Browser-Insasse den eigenen Chooser des Betriebssystems auf der Maschine, auf der der Host läuft, und meldet das eine Ergebnis — einen gepickten Pfad, einen Abbruch oder einen Fehlschlag. Es füllt die beiden von `ui-workspace` deklarierten Directory-Flow-Slots und komponiert in einer cordis.yml-Zeile die Client-Seite der nativen Picking-Interaktion. Es ist die richtige Wahl, wenn der Browser auf derselben Maschine wie der Host läuft; prozessinterne und Remote-Browser-Deployments brauchen stattdessen die [`-browse`](../ui-directory-picker-browse/README.de.md)-Oberfläche.

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

Dieses Plugin zusammen mit `ui-workspace` und dem Host-Backend [`dsh-host-directory-picker-native`](../../host/directory-picker-native/README.de.md) mounten; eine cordis.yml-Zeile komponiert dann die gesamte native Picking-Interaktion. Wenn ein Workspace-Add- oder Picker-Flow eine Verzeichnisanfrage öffnet, sieht der Nutzer den Ordnerdialog des Betriebssystems; der gepickte Pfad wird vom Workspace-Flow übernommen, und ein Abbruch schließt den Dialog.

### Wann es zu wählen ist

Diese Oberfläche wählen, wenn der Browser auf derselben Maschine wie der Host läuft und dort ein OS-Dialog öffnen kann. Die [`-browse`](../ui-directory-picker-browse/README.de.md)-Oberfläche wählen, wenn der Browser remote oder prozessintern läuft und kein lokaler Chooser existiert. Die beiden Oberflächen füllen dieselben Slots, sodass der Wechsel eine Kompositionsänderung ist, keine Codeänderung.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Beide Slot-Registrierungen installieren sich über verschachtelte `ctx.slots.inject()`-Aufrufe als ein transaktionaler Effect, weil jeder deklarierende Eintrag später aktiviert werden oder seine Deklaration ersetzen kann. Der Insasse armiert einmal pro steigender `open`-Flanke, sodass Re-Renders nie einen zweiten Chooser starten; die Abrechnungen laufen über ein Ref, damit die Antwort die aktuellsten Handler des Owners erreicht. Ein Unmount (HMR ersetzt den Insassen) verwirft die Abrechnung als Ganzes: Der Wire kennt keinen Abbruch pro Request, sodass der hostseitige Chooser bis zur Antwort überlebt und seine Antwort nirgendwo landet. Die Node-Hälfte ist ein leeres `apply`, das das Plugin in der Host-Liste hält.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn die Picking-Oberfläche nicht ausreicht. Sie führen von der Browser-Hälfte zum Host-Backend und zu den Slots, die es füllt.

- [dsh-host-directory-picker-native](../../host/directory-picker-native/README.de.md) — das OS-Chooser-Backend, das diese Oberfläche treibt.
- [ui-workspace](../ui-workspace/README.de.md) — deklariert die Directory-Flow-Slots und besitzt die Picking-Konversation.
- [ui-directory-picker-browse](../ui-directory-picker-browse/README.de.md) — die In-App-Browsing-Alternative für Remote- und prozessinterne Deployments.
- [Web-Client-Architektur](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.de.md) — wie Browser-Plugin-Zeilen laden und Slots registrieren.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da der Verzeichnis-Chooser Browser-Chrome ist; nichts hier erreicht einen Model-Request.

#### KV-Cache-Effekt

Keiner; dieses Paket stellt weder einen Provider-Request zusammen noch sendet es einen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann der native Chooser passt. Sie sind gegenwärtige Paket-Constraints, kein allgemeiner Picker-Vergleich und kein Aufgabenrückstand.

- **Kein Abbruch eines offenen Choosers** — der Wire kennt keinen Abbruch pro Request, sodass ein bereits auf dem Host-Display offener Chooser nicht vom Browser geschlossen werden kann; eine verworfene Abrechnung wird ignoriert.
- **Nur lokale Host-Träger** — ein OS-Dialog öffnet auf der Maschine, die den Host ausführt, sodass prozessinterne und Remote-Browser-Deployments stattdessen die `-browse`-Komposition brauchen. Plattformfehler erscheinen über den wiederholbaren Ordnerdialog des Owners.

<a id="dev-note"></a>
### Entwicklerhinweis

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Laufzeit-Invariante:** Es wird kein Companion veröffentlicht. Das Plugin registriert einen renderlosen Flow-Insassen in zwei Workspace-Holes als einen transaktionalen Effect, dessen Freigabe die HMR-Sicherheits-Spec beweist, und hält zwischen Picks keinen Zustand.
