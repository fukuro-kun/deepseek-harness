# Agent Note: Bind JSONL session identity before mutation

Status: implemented

[English](2026-07-20-jsonl-storage-identity.md) | [中文](2026-07-20-jsonl-storage-identity.zh.md) | Deutsch

## Problem

Das JSONL-Lookup wählt über die angeforderte Session-Id projektverzeichnisübergreifend ein physisches Log aus, während der geparste `SessionHeader` die Metadaten liefert, die spätere Repair- und Append-Operationen verwenden. Ohne die Bindung dieser beiden Fakten kann ein für Session A ausgewähltes Log die Id oder das cwd von Session B deklarieren und einen Repair oder späteren Append auf Bs Pfad umleiten. Der Projekt-Scan braucht außerdem ein definiertes Ergebnis, wenn dieselbe encodierte Id in mehr als einem Projektverzeichnis existiert. Ein Medium, das Records über einen autoritativen Schlüssel auflöst, mag diese Mehrdeutigkeit vermeiden, aber der ausgelieferte JSONL-Provider muss seinen gewählten Pfad explizit binden.

## Decision

`findLog(id)` ist der einzige physische Resolver des JSONL-Providers. Er scannt jedes Projektverzeichnis und verlangt höchstens ein passendes encodiertes Session-Verzeichnis mit einem Transcript. Für einen unterstützten historischen Snapshot übersetzt die Generation-Operation dessen Header im Speicher und validiert dann `header.id === id` sowie, dass der gewählte Pfad entweder `logPath(root, header.cwd, header.id)` entspricht oder die Dateisystem-Kanonisierung beide Schreibweisen zu demselben Transcript auflöst, bevor irgendein Write erfolgt. Das fusionierte `loadCurrentStored(id)` dekodiert das resultierende aktuelle Präfix ohne erneuten Datei-Read; ein bereits aktueller Snapshot nimmt den No-Write-Fast-Path und wendet bei diesem Decode denselben Identity-Check an. Der gewöhnliche `loadStored(id)`-Hook behält die Identity-Validierung für Coordinator-Fallbacks. `list()` wendet dieselbe Pfadvalidierung an und lehnt doppelte Ids über Projektverzeichnisse hinweg ab.

Der Coordinator assertiert unabhängig die zurückgegebene Id und vergleicht das gespeicherte cwd mit dem cwd einer Live-Session vor Repair, State-Publikation oder Suffix-Persistenz. Er hält eine losgelöste Kopie der validierten Metadaten; JSONL-Append und -Repair leiten ihren Pfad aus dieser Kopie ab. Das `PersistenceBackend<TornMarker>`-Interface braucht daher weder einen scope-spezifischen Live-Lookup noch einen Storage-Locator-Typ.

Ein bestehendes konfiguriertes JSONL-Root muss beim Laden des Plugins ein lesbares Verzeichnis sein. Ein abwesendes Root bleibt gültig und wird bei der ersten Materialisierung erzeugt. Das Backend unterstützt einen Live-Writer pro Session; eine andere Backend-Instanz oder ein anderer Prozess darf diese Session nicht mutieren, bis der Owner den Disposal beendet hat und alle Writes gestoppt sind.

## Alternatives considered

**Storage nach Session-Id flachlegen.** Ein flacher Namespace lässt doppelte Publikation auf einem Pfad kollidieren, aber Pfadvalidierung und Duplikat-Ablehnung schließen den Identitätsdefekt, ohne den Check von einem flachen globalen Namespace abhängig zu machen.

**Einen opaken Storage-Locator durch den Coordinator tragen.** Ein Locator bindet JSONL-Mutationen direkt an einen gewählten Pfad, aber JSONL kann diesen Pfad aus bereits validierten Metadaten reproduzieren. Ein weiteres Generic und Argument für Coordinator, Test-Backends, Append und Repair ließe jede Implementierung ein Konzept tragen, das nur das Datei-Backend braucht; ein Out-of-tree-Provider behält seinen mediumspezifischen Locator in seinen eigenen Primitiven.

**Mehrere Live-Writer koordinieren.** Ein dedizierter Koordinationsdienst, eine prozessglobale Registry oder ein Cross-Process-Lock würde eine neue Deployment-Topologie definieren statt die Identitätsvalidierung zu reparieren. Die unterstützte Topologie hat einen Live-Writer; No-Overwrite-Hardlink-Publikation schlichtet weiterhin eine initiale Same-Id-Creation-Race.

## Consequences

Nicht passende, falsch platzierte und doppelte JSONL-Logs failen vor Repair oder Coordinator-State-Mutation. Das Lookup bleibt proportional zur Anzahl der Projektverzeichnisse, und One-Live-Writer-Ownership bleibt eine explizite Einschränkung. Coordinator- und JSONL-Tests pinnen die Ablehnung vor Repair, unveränderte Bytes für beide betroffenen Logs, Pfadvalidierung beim Listing, Duplicate-Id-Ablehnung, Kollisionen durch Projekt-Normalisierung und Case-Aliase sowie die Load-Time-Root-Validierung.
