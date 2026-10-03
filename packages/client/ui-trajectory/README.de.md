---
description: "Trajectory-Ansicht für den dsh-Web-Client: ein turn-bewusstes Event-Journal mit interaktiver Zeitübersicht, registriert im Conversation-View-Ring."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-trajectory

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Der Trajectory-Tab lässt dich Agent-Aktivität als turn-bewusstes Journal und interaktive Zeitübersicht untersuchen. Er gruppiert User-, Assistant-, Tool-, verschachtelte Subtool- und Compaction-Einträge, markiert Turn- und Step-Grenzen und öffnet einen Eintrags-Inspektor für Token-Verbrauch, Dauer, Eingabe, Ausgabe, Timing, Bilder und Anhang-Zusammenfassungen. Lange Historien öffnen am aktuellen Ende, laden ältere Seiten bei Bedarf und rendern nur sichtbare Zeilen. Während des Streamings folgt die Ansicht dem Ende, bis du nach oben scrollst, und laufende Einträge zeigen eine Startmarke, ohne eine verstrichene Zeit zu erfinden.

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

Öffne den Trajectory-Tab im View-Ring der Conversation, um Agent-Aktivität als Event-Journal und Timeline zu betrachten. Das Journal überdeckt Einträge mit einer expliziten Ladezeile, bis das initiale Ende positioniert ist; solange ein älteres Präfix ungeladen bleibt, lädt ein Steuerelement in der ersten Zeile auf Klick eine frühere Seite und zeigt einen deaktivierten Ladestatus, solange diese Seite ansteht.

### Einträge untersuchen

Auswahl, Timeline-Navigation, Folding und Suche decken das React-sichtbare Fenster ab. Request-Nummern und kumulierter Verbrauch decken den vollständig residenten Snapshot ab. Das Auswählen eines Eintrags öffnet einen lokalen Inspektor für Token-Verbrauch, Dauer, Input, Output, Timing und dauerhafte Bilder. Bild-URLs nutzen den Conversation-eigenen Cache pro Session, sodass Chat und Trajectory pro Anhang eine autorisierte Lesung teilen. Ein User-Eintrag zeigt die Anzahl generischer Dateien neben seinem Text, während ein Eintrag ohne Text seine Bild- und Dateizahlen zeigt. Eine eigenständige Compaction-Anfrage erscheint chronologisch in ihrem eigenen `Between turns`-Abschnitt, während eine nummerierte Compaction in ihrem besitzenden Turn bleibt.

### Die Zeitübersicht

Eine feste Overview über dem Journal projiziert die reale Start-/Dauer-Zeit der Einträge von links nach rechts; Assistant-Spannen trennen aufgezeichnetes TTFT vom Decoding, und ein 500-ms-Hover enthüllt exakte Uhrzeit- und Dauerdetails. Das Ziehen eines Intervalls fokussiert das Journal auf jeden Eintrag, der zu irgendeinem Punkt in diesem inklusiven Bereich aktiv war; Radgesten zoomen die Zeitdomäne; ein Rechtsklick löscht das gewählte Intervall, und ein Rechts-Ziehen schwenkt einen bereits gezoomten Viewport. Die Anfangsansicht und Streaming-Updates bleiben am Ende; nach oben scrollen setzt das Folgen aus, damit neue Einträge die Untersuchung früherer Zeilen nicht unterbrechen.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Die Ansicht ist eine reine Projektion: Trajectory-eigene Definitions setzen Geschäftseinträge aus dem geteilten Session-Fenster zusammen — einschließlich dauerhafter, durch Abbruch finalisierter Präfixe, Chunk-only-Interruption-Fallbacks und unterbrochener Tool-Einträge —, sodass Trajectory den Chat-Conversation-Snapshot weder liest noch verändert. Sein Steering-Classifier behält durch persistenten Splice-Zustand nur Next-Step-Inbox-IDs und teilt jeden aktuellen Claimed-Batch über spätere Contexts.

Ein vollständig angehängter Prompt ohne geladenen Request-Header erscheint als eigenständige Systemzeile; nur sein bekannter Text ist verfügbar, ohne abgeleitete Request-Optionen oder Tool-Katalog. Das Voranstellen seiner Request-Historie ersetzt diese eigenständige Darstellung, ohne den Prompt zu duplizieren. System-Prompt-Änderungen innerhalb der Historie vergleichen gegen den jüngsten Request-Zustand, einschließlich früherer Prompt-Updates ohne neuen Request-Header. Jeder Request behält den Prompt und die Änderung, die an seiner eigenen Position galten. Surface-Ersetzungen, einschließlich Compaction, stellen den letzten nichtleeren überlebenden System-Prompt auch ohne neues System-Event wieder her; ein ungeladener Prompt bleibt verfügbar erst, wenn seine Seite eintrifft.

### Virtuelle Zeilen

Lange Journale leiten React-Daten anfangs aus 50 Ziel-Nodes ab, die am Mount-Zeitpunkt-Ende enden. Spätere Nodes erweitern dieses verankerte Fenster, ohne sein Präfix zu verdrängen, und das bestehende Lade-Control enthüllt frühere residente Nodes, bevor es eine weitere Session-Seite anfordert. Die Virtualisierung mountet nur das sichtbare Zeilenfenster plus einen kleinen Overscan; request-only Separatoren teilen sich das nächste messbare virtuelle Item, während semantische Zeilenschlüssel und ARIA-Indizes Prepends überleben. Der Virtualizer besitzt das Bottom-Following für strukturelle Appends; nicht-virtuelle Journale verwenden einen direkten Tail-Positions-Schreibzugriff. Rein inhaltliche Stream-Frames bewahren virtuelle Zeilenschlüssel und -höhen, verwenden Messungen wieder und geben keine wiederholten Tail-Scroll-Schreibzugriffe ab. Abgeschlossene Antworten behalten zusammengesetzte Blöcke, Timing und Verbrauch im Trajectory-Zielzustand, während das geteilte Session-Fenster die rohen Events behält.

### Layout

Trajectory bittet die Conversation-Shell, den Composer über das Journal in voller Höhe zu legen, während seine responsiven vertikalen Scroller die Live-Höhe des Composers reservieren, damit die letzten Zeilen erreichbar bleiben. Scrollbare Summary-Regionen halten ihre Scrollbar-Thumbs transparent, bis sie gehovt oder fokussiert werden, ohne die reservierte Scrollgeometrie zu ändern. Das Paket stellt keinen Dienst bereit und deklariert kein Context-Merge.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten behandeln den Conversation-Host und die Session-Daten, die diese Ansicht projiziert.

- [ui-conversation](../ui-conversation/README.de.md) — die Chat-Oberfläche, die den `conversation.view`-Ring beherbergt.
- [session-projection](../../session/session-projection/README.de.md) — die Projektions-Registry, die clientseitige Lesemodelle des Session-Zustands liefert.
- [session](../../core/session/README.de.md) — der Session-Seam, dessen Fenster die rohen Events hält.
- [compaction](../../compaction/compaction/README.de.md) — der Compaction-Seam, dessen Anfragen im Journal erscheinen.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da das Paket eine browserseitige UI-Plugin-Schicht ist, die nichts Modellseitiges registriert.

#### KV-Cache-Auswirkung

Keine; dieses Paket setzt weder eine Provider-Anfrage zusammen noch sendet es eine.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, was die Ansicht zeigen kann, während Arbeit in Flight ist; sie sind aktuelle Paketbeschränkungen.

- **In-Flight-Zeit bleibt leer** — `partial`- und `runningCalls`-Zeilen zeigen ihren laufenden Zustand ohne erfundene Dauer, sodass die Overview eine Startmarke rendert statt eine Live-Spanne zu erfinden. Eintrags- und Timeline-Auswahl sind lokal in Trajectory, ohne Anker-Deeplinks.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Begleiter veröffentlicht. Ein reines Consumer-Plugin — es emittiert keine Cordis-Events und besitzt keinen veränderlichen pluginübergreifenden Zustand; seine View-Slot-Registrierung ist ein einfacher Effect, dessen Disposal die eigenen Specs des Slot-Ledgers und die Verhaltensspecs dieses Pakets direkt beobachten.
