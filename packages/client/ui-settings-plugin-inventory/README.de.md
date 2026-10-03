---
description: "Scope-gruppierter Read-only-Plugin-Inventory-Tab in den Web-Plugins-Settings des dsh Web-Clients: Agent-Preset-Kompositionen zuerst, die globale Ebene hinter einem Disclosure, Suche über beide."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-plugin-inventory
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

Der Tab **Plugin-Liste** lässt Web-Nutzer Plugins einsehen, ohne ihre Konfiguration zu ändern. Er zeigt Agent-Presets zuerst und klappt das globale Inventar ein, bis es gebraucht wird. Karten behalten den Paketnamen als primären Titel, identifizieren Instanzen über eine stabile Entry-Id und zeigen Enablement, Provenienz, Runtime-Status, Disable-Bedingungen und Discovery-Fehler; preset-provided globale Einträge nennen ihre Presets. Die Suche deckt beide Gruppen ab und weist auf Treffer in anderen Presets. Der Tab behandelt Loading-, Empty-, No-Match-, Failure- und Retry-Zustände, ohne Transport-Details zu exponieren, und zeigt das globale Inventar auch ohne Preset-Roster.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Öffne den Abschnitt „Plugins“ in den Settings und wähle den Tab **Plugin-Liste**, um das Plugin-Inventar des Hosts einzusehen. Der Tab führt während der Plugin-Aktivierung keinen Remote-Read aus — die erste Auswahl mountet die Komponente und ruft lazy `ctx.remote.pluginInventory.list()` über `api-remotes` auf.

### Eine Karte lesen

Jede eingeklappte Karte nutzt den kurzen Modulnamen als primären Titel, zeigt die stabile Entry-Id darunter und trägt ein kleines Enablement-Tag; aktivierte Einträge zeigen zusätzlich einen farbigen Root-Fiber-Statuspunkt. Ein kompositionsgenerierter Untertitel lässt seine führende `include:`-Markierung weg, während Hover, Suche, der zugängliche Name und die aufgeklappten Details die vollständige Id behalten. Lange Entry-Ids werden in der Zeile abgeschnitten und bleiben per Hover verfügbar. Das Aufklappen einer Karte zeigt die deklarierte Entry-Id, den vollständigen Modul-Specifier und die Zustandsfakten: eine Preset-Row nennt das Preset, aus dem sie stammt, ihren Runtime-Status, wenn die Komposition live ist, und ihre Disable-Bedingung, wenn sie eine trägt; eine preset-provided globale Row erklärt, dass Agent-Presets sie pro Session bereitstellen, nennt die Presets, die sie aktivieren, und bietet einen Sprung in die Preset-Gruppe. Preset-Namen werden über den geteilten `presetDisplayText`-Fold (`dsh-agent-presets/display`) über den Dictionaries von [`ui-agent-preset`](../ui-agent-preset/README.de.md) aufgelöst: mitgelieferte Presets folgen der aktiven Locale, nutzerauthorte behalten ihre eigenen Metadaten, sodass eine englische Oberfläche nie die chinesischen Namen der Preset-Dateien wiedergibt. Die Suche filtert beide Gruppen nach Modulname und Entry-Id.

### Der Preset-Switcher

Der Switcher ist dasselbe Selector-Pill-plus-Menü-Control, das die General-Settings-Rows verwenden. Er listet jedes Roster-Preset — das Default als solches suffixiert, kaputte markiert — und ändert nur, was die Liste zeigt: er schreibt keine Settings, und die Auswahl eines kaputten Presets zeigt den von der Discovery gemeldeten Grund an Stelle der Rows. Die Wahl des Default-Presets oder eines Session-Presets bleibt an ihrem Ort: der Abschnitt Agent-Presets und der New-Session-Screen.

### Einen fehlgeschlagenen Read wiederholen

Ein fehlgeschlagener Read rendert einen generischen Failure-Zustand im Tab; Retry führt den lazy `list()`-Call erneut aus, ohne Transport-Details zu exponieren.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Der Tab ist eine Read-only-Projektion eines Host-owned Snapshots; er führt während der Plugin-Aktivierung keinen Remote-Read aus und nimmt den Snapshot bei der ersten Auswahl.

### Registrierung

Das Browser-Plugin registriert einen lokalisierten `settings.plugins.tab`-Beitrag mit der Id `all`; der Plugins-Abschnitt besitzt den Navigationseintrag und das Tab-Chrome. Die Registrierung verwendet `ctx.slots.inject()` und folgt daher später Tab-Deklaration, Redeklaration, Locale-Wechseln und Teardown, ohne den Abschnitts-Owner zu importieren.

### Rendering

Row-Keys sind scope-qualifiziert (`global:`, `preset:<id>:<index>`), sodass ein Modul, das in beiden Scopes erscheint, getrennten Disclosure-Zustand behält; eine deklarierte Entry-Id erscheint in den aufgeklappten Details und liefert den eingeklappten Untertitel, nachdem eine führende `include:`-Markierung der Komposition entfernt wurde, während eine Row ohne Id unbeschriftet bleibt. Die preset-provided-Markierung wird clientseitig abgeleitet: ein globaler Eintrag trägt sie, wenn er dort disabled ist, während mindestens eine Preset-Row für denselben Modul-Specifier tatsächlich enabled ist, sodass ein Modul, das jedes Preset deaktiviert (oder nur bedingt deklariert), schlicht disabled bleibt, statt eine Provision zu überbehaupten.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten behandeln den Settings-Abschnitt, den Remote-Call und die Host-seitige Projektion.

- [ui-settings-plugins](../ui-settings-plugins/README.de.md) — der Plugins-Abschnitt, in den sich dieser Tab registriert.
- [ui-settings](../ui-settings/README.de.md) — die Domain-Basis, die `settings.plugins.tab` deklariert.
- [api-remotes](../../api/remotes/README.de.md) — die Remote-BFF-Oberfläche hinter `pluginInventory.list()`.
- [plugin-inventory](../../host/plugin-inventory/README.de.md) — die Host-seitige Read-only-Loader-Projektion, die dieser Tab rendert.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da das Paket eine browserseitige Inventar-Projektion ist, die nichts Modell-zugewandtes registriert.

#### KV-Cache-Effekt

Keiner; dieses Paket assembliert weder einen Provider-Request noch sendet es einen.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren Freshness und Reichweite der Inventaransicht; sie sind aktuelle Paket-Constraints.

- **Ein Snapshot pro Settings-Mount oder Retry** — der Tab abonniert keine Loader-Änderungen und refetcht nach einem Reconnect nicht automatisch; ein Tab-Wechsel behält den aktuellen Snapshot, während ein erneutes Öffnen der Settings einen neuen holt.
- **Read-only in beiden Ebenen** — der Tab zeigt globales und Preset-Enablement, mutiert aber keines davon; Enable/Disable-Controls, die die eigene Kompositionsdatei eines Custom-Presets schreiben, sind bewusst zurückgestellte Arbeit.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Dieses Paket besitzt einen Read-only-Settings-Beitrag.
