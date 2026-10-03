# Agent Note: Abgerufene Modelle mit Router-Fähigkeiten ergänzen

Status: implemented

[English](2026-09-30-router-capability-enrichment-model-discovery.md) | [中文](2026-09-30-router-capability-enrichment-model-discovery.zh.md) | Deutsch

## Problem

Die Standard-OpenAI-kompatible `/models`-Antwort identifiziert Modelle, berichtet aber keine Kontextfenster oder Ausgabeobergrenzen. Einige Router stellen endpointbezogene Fähigkeitsmetadaten separat zur Verfügung, sodass die bestehende Abrufaktion der Modelle-Seite Modell-IDs auflisten konnte, ohne genügend Informationen für ein sicheres Übernehmen.

## Entscheidung

Die bestehende Modellabrufaktion ergänzt unvollständige Auflistungen mit einer bestenfalls `GET {root}/endpoints`-Anfrage. Die Wurzel ist die konfigurierte Auflistungsbasis mit einem abschließenden `/v1` entfernt. Der Parser berücksichtigt alle gesunden Endpoint-Einträge, die eine aufgeführte Modell-ID Matchen. Der größte positive `n_ctx`-Wert liefert `contextWindow`; eine momentane Slot-Anzahl wählt nicht die Metadatenquelle. Der Parser liefert `maxTokens` nur, wenn jeder gesunde, matchinge Endpoint einen positiven `max_tokens_cap` meldet, und verwendet die kleinste Obergrenze als gemeinsame Grenze. Er füllt nur Felder, die die Modellauflistung weggelassen hat. `max_tokens_default` ist ein Generierungs-Standardwert, keine Ausgabeobergrenze.

Die primäre Modellauflistungsanfrage hat eine Zehn-Sekunden-Frist, und die optionale Fähigkeitsanfrage hat eine Drei-Sekunden-Frist. Beide lehnen Weiterleitungen ab. Fähigkeits-Transport-, Timeout-, Antwortgrößen- und Parse-Fehler lassen die ursprüngliche Modellauflistung nutzbar. Aufruf-Abbruch bleibt ein `ABORTED`-Ergebnis. Wenn die primäre Modellauflistungsanfrage fehlschlägt oder die Frist überschreitet, gibt Discovery sein sichtbares `DISCOVERY_FAILED`-Ergebnis zurück, statt eines leeren Katalogs. Der gemeinsame Discovery-Typ trägt keine Eingabemodalitäten, daher übernimmt der Fähigkeits-Prüfungslauf `supports_vision` nicht.

Die Modelle-Seite vorwählt neue Modelle und konfigurierte Modelle, deren gemeldete Kapazitäten sich unterscheiden; Benutzer können jede Auswahl aufheben. Das Anwenden der Auswahl fügt neue Zeilen hinzu und aktualisiert nur die gemeldeten `contextWindow`/`maxTokens`-Felder in ausgewählten bestehenden Zeilen, wobei ihre Namen und anderen Felder erhalten bleiben. Discovery selbst schreibt keine Einstellungen. Das Paketverhalten ist in [`llm-pi-ai`](../../../../packages/llm/llm-pi-ai/README.de.md#discover-models-from-endpoints) dokumentiert.

## In Betracht gezogene Alternativen

**Handeditierte Fähigkeitswerte beibehalten oder ein Synchronisationsskript ausführen.** Handgepflegte Werte können von den Router-Metadaten abweichen, während ein Skript weiterhin jemanden erfordert, der sich daran erinnert, es auszuführen. Die bestehende Abruftaste ist bereits die gelegentliche Benutzeraktion zum Aktualisieren der Modellliste und kann die Ergänzung an diesem Punkt vornehmen.

**Router-Fähigkeiten während der Modellauswahl oder Anfrageausführung aktualisieren.** Laufzeit-Discovery würde vorübergehende Router-Verfügbarkeit zum normalen Adapter-/Katalogverhalten machen und Cache-Aktualisierungssemantiken erfordern. Die Modelle-Seitenaktion ist ausreichend, weil die Modellflotte selten wechselt und Benutzer nur bei Konfigurationsänderungen eine Aktualisierung benötigen.

**`max_tokens_default` als `maxTokens` verwenden.** Eine Standard-Generierungsgröße ist keine von der erzwungene Ausgabeobergrenze; ihre Verwendung würde die Router-Obergrenze falsch darstellen. Der Parser übernimmt nur `max_tokens_cap`.

## Folgen

- OpenAI-kompatible Auflistungen bleiben maßgeblich für Modell-IDs und alle gemeldeten Kapazitäten; Router-Metadaten füllen nur abwesende Felder.
- Router ohne `/endpoints` liefern weiterhin ihre gewöhnlichen Modellanwärter. Ein steckender Metadaten-Endpoint verlängert die Aktion um höchstens drei Sekunden.
- Eine steckende primäre Auflistung verlängert um höchstens zehn Sekunden, bevor die UI eine wiederherstellbare Discovery-Fehlermeldung erhält.
- Die Fähigkeitsrichtlinie meldet den größten gesunden Kontext und nur eine gemeinsame Ausgabeobergrenze, die auf jedem gesunden Endpoint vorhanden ist; sie meldet keine Eingabemodalitäten oder promptabhängige Restkontext-Berechnungen.
- Regressionstests üben Matching, Multi-Endpoint-Auswahl, Kapazitäts-Priorität, fehlende oder ungültige Metadaten, Weiterleitungen, Fristen und Aufruf-Abbruch.
