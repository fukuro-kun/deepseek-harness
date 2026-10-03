---
description: "Oberflächen für Berechtigungs-Presets in der Web-GUI: die Standardzeile in den Allgemeinen Einstellungen und der /permission-Picker für die aktuelle Session; für Nutzer und Maintainer der Berechtigungsrichtlinie."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-permission-presets

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Mit diesem Paket wählen Nutzer im Web GUI Berechtigungs-Presets für künftige Sessions oder wechseln das Preset der aktuellen Session. Die Zeile in den Allgemeinen Einstellungen ändert nur den Standard für später erstellte Sessions, während der `/permission`-Picker nur die aktuelle Session ändert und ihr aktives Preset markiert. Eingebaute Presets verwenden lokalisierte Beschriftungen; explizite Host-Beschriftungen bleiben unverändert, und unbekannte kebab-case-Namen erscheinen in Title Case. Voller Zugriff erfordert immer eine ausdrückliche Risikobestätigung. Beide Oberflächen bestätigen Änderungen erst, nachdem der Host den resultierenden Berechtigungszustand gepusht hat.

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

Dieses Plugin zusammen mit den Settings- und Commands-Paketen mounten; die Berechtigungszeile erscheint dann in den Allgemeinen Einstellungen, und der `/permission`-Picker ersetzt den nackten Befehlsaufruf. Der Picker für die aktuelle Session ist genau dann verfügbar, solange der Projektionsschlüssel vorhanden ist; eine Komposition ohne Berechtigungen zeigt weder Picker noch Settings-Zeile.

### Der Picker

Eine Auswahl sendet die Befehlszeile `/permission <preset>`. Der Pfad mit Argument (direkt getipptes `/permission <preset>`) wechselt weiterhin direkt; die Dekoration ersetzt nur den nackten Aufruf. Die eingebauten Beschriftungen sind `Read Only`, `Workspace Write` und `Full access` auf Englisch sowie `仅可查看`, `工作区内修改` und `完全权限` auf Chinesisch; `custom` ist ein Anzeigezustand, niemals ein Ziel.

### Die Settings-Zeile

Die Zeile leitet ihre Optionen aus dem dynamischen `defaultPreset`-Enum des Hosts ab, verwendet dieselben lokalisierten Beschriftungen wie der Picker der aktuellen Session und schreibt eine einzige Settings-Mutation. Der Wert greift nur, wenn später eine Session erstellt wird; seine Änderung wechselt oder überschreibt niemals die aktuelle Session.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Die Zeile Allgemein liest den explizit exponierten `permission`-Settings-Deskriptor über `ctx.settingsScope` und schreibt eine `settings.mutate`-Pfadoperation mit der Deskriptor-Revision; ihr Observable läuft über das `hooks`-Compartment des Slot-Systems, sodass der Renderer das React-Hook-Binding besitzt und eine Push-Invalidierung den Deskriptor neu abruft. Der Wert wird nur gelesen, wenn später eine Session erstellt wird. Die Oberfläche der aktuellen Session ist eine popupSelect-Dekoration am Host-Befehl `/permission` (`ctx.commandUi.decorate`): Der Host-Befehl behält seine Slash-Menüzeile, den Pfad mit Argument und das dauerhafte Lifecycle-Logging, während die Dekoration nur den nackten Aufruf durch den Picker ersetzt. Optionen und die Aktiv-Markierung lesen die `permissions`-Projektion der Session — denselben Host-berechneten Select, den der Composer-Chip rendert. Die Option für vollen Zugriff trägt eine `confirmation`-Payload, die die gemeinsame Popup-Shell als seiteninterne Risikosperre rendert.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn die Berechtigungsoberfläche nicht ausreicht. Sie führen von den Browser-Oberflächen zur Host-Richtlinie und zur Command-Shell.

- [dsh-permission-presets](../../interaction/permission-presets/README.de.md) — die Host-seitige Berechtigungs-Preset-Richtlinie, die diese Oberflächen schreiben.
- [ui-commands](../ui-commands/README.de.md) — die popupSelect-Shell, in die sich die `/permission`-Dekoration registriert.
- [ui-conversation](../ui-conversation/README.de.md) — der Composer-Chip, der dieselbe Berechtigungsprojektion rendert.
- [Client-Paketübersicht](../README.de.md) — benachbarte Browser-UI-Pakete.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über die Berechtigungsfakten, die ihre beiden Oberflächen schreiben: Die Settings-Zeile bewirkt, dass eine künftige Session mit Ganzwert-Knob-Events startet, während der `/permission`-Picker dieselben Fakten anhängt, wenn er die aktuelle Session wechselt; diese Events bestimmen den Sandbox-Modus und die Genehmigungsrichtlinie, auf die spätere Tool-Aufrufe auflösen.

#### KV-Cache-Effekt

Keine direkte Invalidierung; die Knob-Konsumenten tragen etwaige Änderungen am Request-Präfix selbst.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren die aktuellen Berechtigungsoberflächen. Sie sind gegenwärtige Paket-Constraints, kein allgemeiner Richtlinienvergleich und kein Aufgabenrückstand.

- **Die Settings-Zeile ist Web-only** — Nicht-Web-Clients können die aktuelle Session weiterhin über `/permission` wechseln, erhalten aber diesen Browser-Beitrag nicht.
- **Preset-Beschreibungen kommen vom Host** — neben lokalisierten eingebauten Beschriftungen kann daher eine in einer anderen Sprache verfasste Beschreibung erscheinen.

<a id="dev-note"></a>
### Entwicklerhinweis

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Laufzeit-Invariante:** Es wird kein Companion veröffentlicht. Die Lifecycles von Command- und Slot-Contribution sind durch die HMR-Safety-Spec abgedeckt, während der reine Browser-Settings-Controller keine Host-Events oder pluginübergreifenden veränderlichen Zustand besitzt.
