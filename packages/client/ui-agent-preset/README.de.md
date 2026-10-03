---
description: "Agent-Preset-Oberflächen für die Web-GUI: die Default-Preset-Einstellung, der New-Session-Chip, das Session-Header-Label und der Preset-Roster-Verwaltungsabschnitt; für Nutzer und Maintainer der Agent-Komposition."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-agent-preset

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Verwende dieses Paket, um das Agent-Preset für eine neue Web-GUI-Session zu wählen, das aktive Preset im Session-Header zu sehen und verfügbare Presets in den Einstellungen zu verwalten. Ein Preset wird beim Erstellen einer Session festgelegt, sodass das Ändern der Auswahl oder des Defaults nur spätere Sessions betrifft. Stellt das Deployment keine Presets bereit, bleiben diese Steuerungen verborgen und jede Session verwendet die Host-Komposition.

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

Mounte dieses Plugin zusammen mit den Settings- und Conversation-Paketen; die Preset-Oberflächen erscheinen dann dort, wo ihre Slots rendern. Der New-Session-Chip öffnet auf dem Deployment-Default und hält eine Wahl bereit, die auf der nächsten leeren Session landet; die Bereitstellung wird bei der ersten Verwendung verbraucht, sodass die folgende neue Session wieder auf dem Default öffnet.

### Das Roster verwalten

Der Settings-Abschnitt zeigt das Roster als Karten: Ein Kopierdialog ist der einzige Weg, ein Preset zu erstellen — der Browser bearbeitet keinen Kompositionstext —, und jede Custom-Karte behält eine Ort-Aktion, die die eigenen Dateien des Presets öffnet. Der Default lässt sich von jeder Oberfläche setzen; Löschen entfernt das Preset-Verzeichnis, während bereits daraus komponierte Sessions weiterlaufen. Ein mitgeliefertes Preset öffnet in einem schreibgeschützten Viewer und bietet weder Ort noch Löschen. Eine Roster-Zeile mit `broken` rendert als markierte Karte, deren Körper und Duplizieren deaktiviert sind, weil eine Kopie eines defekten Presets ein weiteres defektes Preset ist; defekte Custom-Zeilen behalten ihre Ort- und Lösch-Aktionen, damit die Dateien repariert und Geisterverzeichnisse entfernt werden können. Die Kartenfront zeigt weiterhin die eigene Beschreibung des Presets — ein Auswähler kann dort mit einem Paket-Spezifizierer nichts anfangen —, und der Grund des Hosts hängt als Tooltip am Badge, plus einem visuell verborgenen Alert, der ihn an assistive Technologie trägt, was ein deaktivierter Kartenkörper nicht kann.

### Der konversationelle Einstieg

Wenn das Roster das selbstreferenzielle `cordis`-Preset trägt, hält eine gestrichelte Add-Karte es bereit und startet eine neue Session — der Abschnitt schließt das Settings-Panel, und der eigene Applier des New-Session-Chips komponiert die leere Session, die der Workspace-Flow erzeugt.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Die Anzeigeoptionen kommen aus einem `agentPresets/list`-Aufruf — das Roster meldet bereits, welche id eine Session ohne explizite Wahl erhält, sodass keine Oberfläche das Settings-Schema introspektiert —, und der Default-Schreibzugriff, die Make-Default-Aktion des Settings-Abschnitts, zielt auf das `default`-Feld des `agent-presets`-Settings-Namespace, das der Host beim Erstellen auflöst. Der Settings-Abschnitt fragt `settings.canOpenAgentPresetDirectory()` beim ersten Laden ab und joinet das Ergebnis mit dem Roster; eine fehlgeschlagene Abfrage entfernt nur die Native-Open-Affordance. Der New-Session-Chip und das Header-Label teilen einen Controller, weil die bereitgehaltene Wahl zum Flow gehört, nicht zu einer einzelnen Session; die Bereitstellung wird angewandt, wenn eine Session eintrifft (deckt sowohl die Session ab, die ein Workspace-Connect erstellt hat, als auch die leere, die er wiederverwendet hat), und bei Ablehnung verworfen. Eine Ablehnung meldet sich als transiente Banner über der Composer-Spalte, weil das Chip-Label bereits zurückgesprungen ist und ein Preset, das der Host zu mounten verweigert, eines ist, das die Discovery als gesund gemeldet hat — seine Roster-Karte trägt keinen Grund, den man noch einmal lesen könnte. Nur eine Wahl, die eine Person gerade getroffen hat, wird angemeldet; der Applier, der läuft, wenn eine Session aktuell wird, wird es nicht. [`dsh-client-connection`](../connection/README.de.md) authentifiziert `agentPresets/read`, `agentPresets/copy`, `settings/openAgentPresetDirectory`, `agentPresets/deletePreset`, `agentPresets/list` und jede andere Host-API-Methode mit derselben Browser-Session. Eine Komposition benennt weiterhin die Plugins, die eine Session ausführt, sodass ihr Lesen Aufklärung ist, während Copy, Delete und der settings-eigene Verzeichnisöffner das Roster verwalten und den Host-Desktop steuern. Der Abschnitt liest bei eigenen Aktionen, `settings/document-updated` und `connection/reset` neu, weil Kompositionsdateien außerhalb des Browsers bearbeitet werden und nichts auf dem Wire eine Dateiänderung ankündigt.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn die Preset-Oberfläche nicht genügt. Sie bewegen sich von den Browser-Oberflächen zur Preset-Domäne und zum Kompositionsmodell.

- [dsh-agent-presets](../../preset/agent-presets/README.de.md) — das Host-Roster und die Komposition, die die Oberflächen lesen und verwalten.
- [ui-conversation](../ui-conversation/README.de.md) — deklariert die Hero- und Session-Header-Slots, die Chip und Label füllen.
- [ui-settings](../ui-settings/README.de.md) — die Settings-Shell, die den Roster-Abschnitt beherbergt.
- [Client-Paketkarte](../README.de.md) — benachbarte Browser-UI-Pakete.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über das Preset, aus dem eine spätere Session komponiert wird; das gewählte Preset besitzt jeden modellseitigen Effekt.

#### KV-Cache-Auswirkung

Keine direkte Invalidierung. Das Ändern des Defaults berührt nie das Präfix einer laufenden Session; eine danach erstellte Session etabliert ihr eigenes Präfix aus ihrer eigenen Komposition.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren die aktuellen Preset-Oberflächen. Sie sind aktuelle Paketbeschränkungen, kein allgemeiner Kompositionsvergleich oder ein Task-Backlog.

- **Ein Preset ohne Metadaten wird nach id gelistet** — Anzeigetext ist optional, und eine Kopie ohne Namen fällt bewusst auf ihren Verzeichnisnamen zurück, statt sich identisch zu ihrer Quelle zu präsentieren. Die Auflösung selbst ist das geteilte `presetDisplayText`-Fold aus [`dsh-agent-presets/display`](../../preset/agent-presets/README.de.md), das die Settings-Plugin-Liste über die Dictionaries dieses Plugins legt, um mitgelieferte Presets in der aktiven Locale anzuzeigen, ohne nutzererstellte Metadaten zu übersetzen.
- **Ein aufgedeckter Pfad ist Anzeigetext, kein Link** — wo der Host keinen Desktop-Öffner hat, zeigt die Zeile das Verzeichnis zum manuellen Kopieren; der Browser kann einen Host-Dateisystem-Ort nicht selbst öffnen.
- **Kompositionsänderungen sind für die Seite unsichtbar** — die Dateien werden außerhalb des Browsers bearbeitet, und nichts auf dem Wire kündigt eine Dateiänderung an, sodass das Roster bei eigenen Aktionen, `settings/changed` und `connection/reset` neu liest, nicht bei jeder Plattenbearbeitung.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Begleiter veröffentlicht. Dies ist ein browserseitiges Oberflächen-Plugin, dessen Node-Hälfte weder Event-Stream noch veränderliche Runtime-Daten besitzt; das Roster und der Settings-Schreibzugriff sind Host-Verträge, die dort abgedeckt sind.
