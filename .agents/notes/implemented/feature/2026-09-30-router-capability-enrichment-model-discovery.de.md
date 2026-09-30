# Agent Note: Modell-Entdeckung durch Router-Fähigkeits-Metadaten ergänzen

Status: implemented

[English](2026-09-30-router-capability-enrichment-model-discovery.md) | [中文](2026-09-30-router-capability-enrichment-model-discovery.zh.md) | Deutsch

## Problem

Die standardmäßige OpenAI-kompatible `/models`-Antwort identifiziert Modelle, berichtet aber weder deren Kontextfenster noch deren Ausgabegrenzen. Einige Router stellen Endpunkt-Fähigkeits-Metadaten separat zur Verfügung, sodass die bestehende Fetch-Aktion der Models-Seite Modell-IDs auflisten konnte, ohne genug Information zu liefern, um sie mit Sicherheit zu übernehmen.

## Decision

Die bestehende Modell-Fetch-Aktion ergänzt unvollständige Listings mit einem Best-Effort-`GET {root}/endpoints`-Request. Die Root ist die konfigurierte Listing-Basis ohne ein abschließendes `/v1`. Der Parser berücksichtigt alle gesunden Endpunkt-Einträge, die zu einer aufgelisteten Modell-ID passen. Der größte positive `n_ctx`-Wert liefert `contextWindow`; eine momentane Slot-Zahl bestimmt die Metadatenquelle nicht. Der Parser liefert `maxTokens` nur, wenn jeder gesunde passende Endpunkt einen positiven `max_tokens_cap` meldet, und verwendet die kleinste Obergrenze als gemeinsame Grenze. Er füllt nur Felder, die das Modell-Listing weggelassen hat. `max_tokens_default` ist ein Generierungs-Default, keine Ausgabegrenze.

Der primäre Modell-List-Request hat ein Zehn-Sekunden-Limit, der optionale Fähigkeit-Request ein Drei-Sekunden-Limit. Beide lehnen Redirects ab. Transport-, Timeout-, Antwortgrößen- und Parse-Fehler des Fähigkeit-Requests lassen das ursprüngliche Modell-Listing weiter nutzbar. Eine Absage durch den Caller bleibt ein `ABORTED`-Ergebnis. Schlägt der primäre Modell-List-Request fehl oder läuft in das Limit, liefert Discovery sein sichtbares `DISCOVERY_FAILED`-Ergebnis statt eines leeren Katalogs. Der gemeinsame Discovery-Typ trägt keine Eingabemodalitäten, daher übernimmt die Fähigkeitsabfrage kein `supports_vision`.

Die Models-Seite wählt neue Modelle und konfigurierte Modelle, deren gemeldete Kapazitäten abweichen, voraus; Anwender können jede Auswahl aufheben. Die Anwendung der Auswahl fügt neue Zeilen hinzu und aktualisiert nur die gemeldeten `contextWindow`/`maxTokens`-Felder der gewählten bestehenden Zeilen und erhält deren Namen und andere Felder. Discovery selbst schreibt keine Settings. Das Paket-Verhalten ist in [`llm-pi-ai`](../../../../packages/llm/llm-pi-ai/README.de.md#discover-models-from-endpoints) dokumentiert.

## Alternatives considered

**Handgepflegte Fähigkeit-Werte beibehalten oder ein Synchronisations-Skript laufen lassen.** Hand gewartete Werte können von den Router-Metadaten driften, und ein Skript verlangt immer noch, dass jemand daran denkt, es auszuführen. Die bestehende Fetch-Schaltfläche ist bereits die gelegentliche Anwender-Aktion für das Aktualisieren der Modell-Liste und kann die Ergänzung an dieser Stelle ausführen.

**Router-Fähigkeiten während der Modell-Auswahl oder Request-Ausführung aktualisieren.** Runtime-Discovery würde die vorübergehende Router-Verfügbarkeit Teil des normalen Adapter- und Katalog-Verhaltens machen und Cache-Aktualisierungs-Semantik erfordern. Die Models-Seiten-Aktion reicht aus, weil die Modell-Flotte sich selten ändert und Anwender nur beim Bearbeiten ihrer Konfiguration eine Aktualisierung brauchen.

**`max_tokens_default` als `maxTokens` verwenden.** Eine Standard-Größe für die Generierung ist keine von einem Endpunkt erzwungene Ausgabegrenze; ihre Verwendung würde die Router-Grenze falsch darstellen. Der Parser übernimmt nur `max_tokens_cap`.

## Consequences

- OpenAI-kompatible Listings bleiben die Autorität für Modell-IDs und jede Kapazität, die sie melden; Router-Metadaten füllen nur fehlende Felder.
- Router ohne `/endpoints` liefern weiterhin ihre üblichen Modell-Kandidaten. Ein festgefahenes Metadaten-Endpunkt kostet die Aktion höchstens drei Sekunden.
- Ein festgefahrenes primäres Listing kostet höchstens zehn Sekunden, bevor die UI einen wiederherstellbaren Discovery-Fehler erhält.
- Die Fähigkeits-Policy meldet den größten gesunden Kontext und nur eine gemeinsame Ausgabegrenze, die auf jedem gesunden Endpunkt vorliegt; sie meldet keine Eingabemodalitäten oder promptabhängige Restkontext-Berechnungen.
- Regressions-Tests üben Matching, Mehr-Endpunkt-Auswahl, Kapazitäts-Priorität, fehlende oder ungültige Metadaten, Redirects, Limits und Caller-Absage.
