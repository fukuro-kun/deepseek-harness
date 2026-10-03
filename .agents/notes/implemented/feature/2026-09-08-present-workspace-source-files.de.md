# Agent Note: Present deklariert Quelldateien im Workspace
[English](2026-09-08-present-workspace-source-files.md) | [中文](2026-09-08-present-workspace-source-files.zh.md) | Deutsch

Status: implemented


## Problem

Benutzer müssen die in ihrem Workspace erzeugten Dateien öffnen und bearbeiten können, einschließlich per Shell erstellter Dateien, für die keine Editor-Änderungsaufzeichnungen existieren. Das Aufbewahren einer unabhängigen ausgelieferten Version würde diesem Ablauf Inhaltsspeicherung, Kopien-Verifikation, Vorhalten temporärer Dateien und ein zweites Bearbeitungsziel hinzufügen.

## Entscheidung

Das [present-Tool](../../../../packages/fs/tool-present/README.de.md) deklariert vorhandene reguläre Quelldateien unter der [Session-Dateisystem-Zugriffsrichtlinie](2026-09-09-present-filesystem-access.de.md). Es zeichnet Pfade und optionale Beschreibungen auf, ohne Inhalte zu lesen oder zu kopieren. Das [Deliverables-Plugin](../../../../packages/client/ui-deliverables/README.de.md) öffnet aktuelle Workspace-Quelldateien in der Standardanwendung des Hosts. Bearbeitungen sind beim nächsten Öffnen sichtbar; Löschen oder Verschieben macht die Deklaration unverfügbar. Die Aufbewahrung von Dateiinhalten und Copy-on-Write-Speicherung sind verschoben, bis ein Persistenzdesign dafür zuständig ist.

Die Tool-Beschreibung verlangt `present` nach dem Schreiben einer Datei, die der Benutzer erhalten wollte, und vor der finalen Antwort, einschließlich Dateien, die über Bash oder Codeausführung erstellt wurden. Ein Pfadverweis im Fließtext ersetzt den Aufruf nicht. Das aufgezeichnete [SVG-Auslieferungsszenario](../../../../snapshots/web/present-svg/snapshot.yml) verwendet eine Benutzeranfrage, die `present` nicht nennt, und prüft die resultierende Datei, das Auslieferungs-Event und die Karte. Sein UI-Snapshot deckt das ausgeklappte Chat-Transcript ab; Navigations- und Composer-Steuerelemente gehören zu ihren eigenen Szenarien, sodass unbeteiligte Oberflächenänderungen die Erwartungen an die Dateiauslieferung nicht ungültig machen können.

Das Tool bleibt ein gewöhnliches Paket mit gemeinsamen Dateisystem- und Tool-Fehlerklassen. Sein reiner Type-Entry besitzt das Auslieferungs-Event, ohne Host-Code in den Browser zu importieren. Die Presets `standard`, `ptc` und `cordis` mounten es; `minimal` behält seine zwei Tools. Jede Plugin-Instanz korreliert ihre Ausführungen mit erfolgreichen finalen `tools/result`-Benachrichtigungen, bevor sie `deliverables/presented` anfügt. Native und verschachtelte Aufrufe teilen diese Regel. Ein späterer Fehlschlag des umschließenden Programms widerruft eine abgeschlossene verschachtelte Deklaration nicht; blockierte Ergebnisse veröffentlichen keine, und gleichnamige Scoped-Ersetzungen können keine Ergebnisse einer anderen Instanz veröffentlichen.

Ein authentifizierter POST wählt eine Deklaration anhand der betrachteten Session, der Event-Sequenz und des ursprünglichen Dateiindex aus. Das Event trägt keine besitzende Session-ID; relative Pfade in übernommener Historie werden gegen den Workspace der betrachteten Session aufgelöst. Der Host verifiziert vor dem nativen Öffnen die Existenz der regulären Datei und das Host-Pfad-Mapping. Beim Disposen der Route werden ausstehende Befehle abgebrochen und abgewartet. Die Zeile „Files changed“ listet erfolgreiche Datei-Tool-Mutationen und behält ihr separates Text-Vorschauverhalten. Ihr chinesisches Label ist „本轮文件改动“; keines der beiden Labels impliziert eine endgültige Auslieferung.

Dateikarten verwenden dasselbe Split-Control-Muster wie der Session-Header. Die Karte und das linke Open-Segment zeigen die Quelle in der rechten Sidebar als Vorschau; der Pfeil öffnet das Standardmenü für Aktionen der Standardanwendung und des Dateimanagers. Der Host wählt die Datei im Finder oder Explorer aus oder öffnet ihren enthaltenden Ordner über den Standard-Dateimanager unter Linux. Beide nativen Aktionen lösen dieselbe gespeicherte Deklaration auf und verifizieren das Session-Dateisystem und den Host-Pfad; keine akzeptiert einen vom Browser gelieferten Ersatzpfad. Vom Host stammende Desktop-Metadaten halten Labels und Verfügbarkeit im Remote-Browser korrekt, und die Route erzwingt die konfigurierte Verfügbarkeit bei jeder nativen Geste. Eine Auslieferung spannt die ganze Zeile; mehrere Auslieferungen nutzen höchstens zwei Spalten, behalten jede Deklaration und klappen nach den ersten vier Karten zu, bis der Benutzer die Liste ausklappt. Desktop-Metadaten werden mit der Verbindungsgeneration invalidiert, damit ein alter Host native Aktionen nicht dauerhaft deaktiviert oder falsche Dateimanager-Labels liefert. Alte Metadaten-Anfragen werden abgebrochen und können die Antwort der neuen Generation nicht ersetzen.

## Betrachtete Alternativen

**Unveränderliche Attachment-Snapshots und bearbeitbare temporäre Kopien** bewahren ausgelieferte Versionen nach Quellbearbeitung oder -löschung, lassen Desktop-Bearbeitungen aber von den Workspace-Dateien abweichen und führen Aufbewahrungsarbeit ohne aktuelle Produktanforderung ein. Diese Entscheidung ersetzt das [Snapshot-Auslieferungsdesign](../../archived/feature/2026-09-08-web-explicit-file-delivery.md). Weder ein Download-Endpunkt noch eine Fallback-Kopie bleiben erhalten; beide erfordern eine explizite zukünftige Produktentscheidung.

**Direktes Öffnen von Dateien aus dem Attachment-Store** ließe Editoren unveränderliche Objekte mutieren. Ein zukünftiges persistentes Auslieferungssystem braucht eine eigene Bearbeitungs- und Aufbewahrungsrichtlinie, etwa Copy-on-Write, bevor gespeicherte Versionen Anwendungen ausgesetzt werden.

**Generische Artifact-Felder oder ein Host-Tool-Subpfad im UI-Paket** würden unbeteiligte APIs verbreitern oder die Preset-Installation an die Browser-Paketierung koppeln. Ein tool-eigenes Event und ein gewöhnliches Paket bewahren bestehende Extension Points und Veröffentlichungsregeln.

**Tool-Text als dauerhafter Index** kann Post-Processing oder Result-Spill nicht zuverlässig überstehen. Ausführungsidentität und finale erfolgreiche Ergebnisse bewahren die Zugehörigkeit der Deklaration unabhängig vom angezeigten Tool-Text.

**Deskriptor-gebundene Dateisystem-Erweiterungen** würden jeden Provider ändern, ohne das spätere Pfad-Lookup einer externen Desktop-Anwendung atomar zu machen. Aktuelle Prüfungen verifizieren Dateimetadaten und Pfad-Mapping; ein gleichzeitiges Austauschen-und-Zurücksetzen bleibt außerhalb der Garantien der Pfad-API.

## Konsequenzen

Das Session-Log persistiert Deklarationen, aber keine Attachment-Referenzen oder Dateiinhalte aus `present`. Session-ZIP-Exporte enthalten diese Deklarationen; das Übertragen des Logs überträgt keine Workspace-Dateien. Das Event bleibt beim Lesen erforderlich, weil ein stiller Verlust von Auslieferungs-Deklarationen rekonstruierte oder geforkte Historie verändern würde. Veröffentlichte Session-Format-Generationen bleiben unverändert.

Die entfernte Dateigrößen-Obergrenze hat bei einer reinen Metadaten-Deklaration keine Rolle; das konfigurierbare Limit für die Dateianzahl begrenzt weiterhin die Ergebnisgröße. Karten zeigen Dateinamen und Beschreibungen, mit Fallback auf Dateitypen, ohne veraltbare Byte-Größen-Metadaten. Es wird kein Artifact-Service und kein spekulativer Storage-Fallback eingeführt.

Fokussierte Tests decken inhaltsfreie Deklarationen, ungültige Eingaben, blockierte Ergebnisse, Quellpfad-Identität, aktuelle Bytes nach Bearbeitungen, fehlende Dateien, externe Pfade und nicht verfügbare Host-Mappings, fork-relative Pfade, Wiederholung, Abbruch und Dispose ab. Das aufgezeichnete Web-Szenario deckt verschachtelten Abschluss gefolgt von umschließendem Fehlschlag, Quellbearbeitungen, Reload, Löschfehler, Karten- und Prosa-Öffnungen ohne Browser-Downloads sowie inhaltsfreien Session-Export ab.
