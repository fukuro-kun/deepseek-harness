---
description: "Read-only-Projektion des aktuellen Cordis-Loader-Plugin-Status mit der Zusammensetzung jedes Agent-Presets daneben: der pluginInventory-Service und sein pluginInventory/list-Remote für Web-GUI-Host-Clients."
kind: "package-reference"
---

# @deepseek-ai/dsh-host-plugin-inventory

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

Clients können `pluginInventory/list` aufrufen, um die aktuellen Plugins des Hosts in Ladereihenfolge anzuzeigen, einschließlich Kennung, Modulbezeichner, effektivem Aktivierungsstatus und laufender Phase jedes Eintrags. Deployments mit einem Agent-Preset-Roster melden zusätzlich Metadaten, Gesundheitszustand und die abgeflachte Plugin-Zusammensetzung jedes Presets; ohne Roster fehlen die Preset-Daten. Jede Antwort ist ein schreibgeschützter Moment-Snapshot für Anzeige und Diagnose: Er kann keine Plugins verändern und bietet weder Verlauf noch Herkunft oder eine Änderungssubskription.

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

Rufen Sie `pluginInventory/list` auf, wenn ein Client oder eine Einstellungsseite anzeigen muss, was derzeit im Host zusammengesetzt ist — welche Plugins geladen, aktiviert und lebendig sind und was jedes Agent-Preset einer Session geben würde. Das Remote ist der einzige Einstiegspunkt: Der Service ist Remote-only und deklariert bewusst keinen prozessinternen Cordis-`Context`-Merge.

### Was ein Snapshot enthält

Jede Zeile ist ein Nicht-Gruppen-Loader-Eintrag: seine Eintrags-ID, der exakte Modulbezeichner, der effektive Aktivierungsstatus (einschließlich deaktivierter Vorfahrengruppen) und die aktuelle Root-Fiber-Phase. `pending` bedeutet, dass der Eintrag auf das Laden wartet, `loading`, dass er gelesen wird, `active`, dass er läuft, `failed`, dass seine fiber abgelehnt wurde, und `unloading`, dass er abgebaut wird; `null` bedeutet, dass überhaupt keine lebendige Root-Fiber existiert. Strukturelle Gruppenzeilen werden übersprungen.

### Zusammensetzungen pro Preset

Mit einem zusammengesetzten Roster trägt `agentPresets` eine Gruppe pro Preset in Roster-Reihenfolge: seine ID, ob das Deployment es mitliefert oder der Benutzer es besitzt (`trust`, das Clients zum Lokalisieren mitgelieferter Namen verwenden), den veröffentlichten Anzeigenamen, ob eine Session ohne benanntes Preset es zusammensetzt, sowie abgeflachte Plugin-Zeilen — Eintrags-ID (null, wenn die Dateizeile keine deklariert), Modulbezeichner, effektiver Aktivierungsstatus, der eigene `!!js`-disabled-Ausdruck der Zeile, falls vorhanden, und eine Root-Fiber-Phase, wenn die Zusammensetzung live ist. Ein Preset, das eine Session bereits zusammengesetzt hat, antwortet aus seiner neuesten bestehenden Generation — selbst wenn seine Datei seither beschädigt wurde, denn das Mount ist das, was diese Sessions ausführen; ein seit dem Start nie zusammengesetztes Preset antwortet aus seiner Zusammensetzungsdatei, wobei disabled-Gates gegen den Loader-Kontext ausgewertet werden, und ein Lesen mountet niemals ein Preset. `conditional` kennzeichnet ein Gate, das der Host nicht auswerten konnte, und ein beschädigtes Preset, das nichts zusammengesetzt hat, bleibt mit seiner Begründung und ohne Zeilen gelistet. Ohne Roster fehlt das Feld.

### Was Sie damit tun können und was nicht

Das inventory ist ein Snapshot für Anzeige und Diagnose: Ein Client kann den Roster rendern, fehlgeschlagene Einträge markieren und Änderungen durch Vergleich von Snapshots erkennen. Es kann Plugins weder aktivieren, deaktivieren, hinzufügen noch entfernen, und es enthält keinen Verlauf — eine fiber, die bereits fehlgeschlagen und entfernt wurde, fehlt. Da der Service bei jedem Aufruf den Loader liest, spiegelt die Antwort immer die aktuelle Zusammensetzung wider, nicht eine gecachte Ansicht.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

### Designkonzept

Das Gateway ist eine direkte Projektion ohne zweite Lebenszyklus-Wahrheitsquelle: Jeder `list()`-Aufruf liest `ctx.loader.entries()` und bildet jeden Nicht-Gruppen-Eintrag auf seine öffentliche Zeile ab. Cordis' interne Plugin-/Status-Events pflegen `Entry.fiber` und `Fiber.state` bereits, sodass ein Cache nur eine weitere zu synchronisierende Lebenszyklus-Wahrheitsquelle hinzufügen würde. Der Agent-Preset-Roster ist ein optionaler Peer, der pro Aufruf über `ctx.get('agentPresets')` aufgelöst wird: Sein `compositionInventory()` besitzt jeden Preset-Read, und dieses Paket bildet lediglich Root-Fiber-Zustände auf das öffentliche Phasenvokabular ab.

### Die Phasenabbildung

Fiber-Zustände werden auf das öffentliche Phasenvokabular abgebildet, wobei `disposed` zu `null` zusammenfällt — ein Eintrag, dessen fiber verschwunden ist, hat keine lebendige Wurzel zu melden. Die Phase unterscheidet daher nie, warum keine lebendige Wurzel existiert: Der Eintrag wurde möglicherweise nie gestartet, oder seine fiber wurde bereits disposed.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | `PluginInventoryGateway`: der `pluginInventory`-Remote-Service und die Loader-Projektion |
| [`src/types.ts`](src/types.ts) | Öffentliche Payload-Typen: `PluginInventoryEntry`, `PluginInventorySnapshot`, `PluginFiberPhase` |
| — | Es wird kein Companion für Laufzeit-Invarianten veröffentlicht; jeder Snapshot wird direkt aus dem Loader-gehörigen Zustand projiziert. |

Typert generiert die Host- und Client-Remote-Artefakte, die von `./typert` und `./remote` exportiert werden.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese, wenn der inventory-Vertrag nicht ausreicht: wie das Remote Clients erreicht, dann der Loader, den es projiziert, und die Oberfläche, die es rendert.

- [Remote-Assembly](../../api/remotes/README.md) — wie Clients `pluginInventory/list` konsumieren, ohne die Host-Implementierung zu importieren.
- [Cordis plugin loader](../../../vendor/loader/README.md) — der Loader, dessen Einträge dieses Paket projiziert.
- [Plugin-inventory-Einstellungsoberfläche](../../client/ui-settings-plugin-inventory/README.md) — die browserseitige Projektion, die das inventory rendert.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da die hostseitige Read-only-Loader-Projektion nichts Modellzugewandtes registriert.

#### KV-Cache-Effekt

Keiner; dieses Paket stellt weder eine Provider-Anfrage zusammen noch sendet es eine.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, was ein Moment-inventory einem Client nicht sagen kann. Sie sind aktuelle Paketbeschränkungen, kein Aufgabenrückstand.

- **Nur Momentzustand** — das Ergebnis enthält keinen dauerhaften Fehlerverlauf und keine Subskription; eine fehlende Root-Fiber wird als `null` gemeldet, unabhängig davon, warum keine lebendige Wurzel existiert.
- **Keine Herkunft oder Mutation** — der Service identifiziert nicht, welches Bundle, Profil oder Override einen Eintrag eingeführt hat, und kann Plugins in keiner der beiden Ebenen aktivieren, deaktivieren, hinzufügen oder entfernen.
- **Presets erscheinen nur mit einem Roster** — ein Deployment ohne `dsh-agent-presets` liefert allein Loader-Einträge; das `agentPresets`-Feld fehlt, statt leer zu sein.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
