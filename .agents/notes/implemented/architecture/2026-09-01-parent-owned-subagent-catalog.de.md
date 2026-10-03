# Agent Note: Eltern-verwaltete Subagent-Katalog-Events
[English](2026-09-01-parent-owned-subagent-catalog.md) | [中文](2026-09-01-parent-owned-subagent-catalog.zh.md) | Deutsch

Status: implemented


## Problem

Die Direct-Child-Discovery rekonstruierte einst einen Katalog aus dem globalen Session-Korpus und dem Log jedes ausgewählten Kindes. Die Erstellung kennt bereits den direkten Elternteil, die Kind-ID, den Modus und das Label; die Repository-weite Aufzählung und Kind-Log-Reads duplizierten daher einen bereits besessenen Fakt und ließen die Kosten eines Browser-Refreshs von unbeteiligten Sessions abhängen.

Der Kind-Deskriptor bleibt für Recovery und Komposition nötig, kann aber nicht die Discovery-Quelle sein, weil ein Leser das Kind finden und öffnen muss, bevor er den Deskriptor lesen kann. Forks stellen eine zusätzliche Anforderung: Eine geseedete Kopie eines Eltern-Logs darf die Kinder der Original-Session nicht erben.

## Entscheidung

Die erforderlichen `subagent/catalog`-Events der Eltern-Session sind die dauerhafte Autorität für die Direct-Child-Discovery. Jedes Event ist ein erfolgreicher Erstellungsfakt mit `childId`, `childCreatedAt`, Modus und dem modus-diskriminierten Label. Remote-One-Shot-Runs ohne lokale Session bleiben außerhalb dieses Katalogs. Ungültige eigene Fakten, einschließlich nicht unterstützter Payload-Versionen, lehnen die Projektions-Wiederherstellung ab, weil das stille Verwerfen eines erforderlichen Fakts einen unvollständigen Katalog liefern würde.

Die Erstellung publiziert nur erfolgreiche Fakten. Ein One-Shot-Run hängt das Katalog-Event an, nachdem sein Provider ein lokales Kind zurückgibt und bevor der Run seinen Aufrufer erreicht. Ein fortsetzbarer Run lässt den initialen Prompt zu, hängt das Katalog-Event an und gibt dann die Kind-ID zurück. Scheitern Admission oder Katalog-Append, scheitert die Erstellung und gibt die Aktivierung frei; es gibt kein kompensierendes Katalog-Event und kein Rollback-Protokoll.

Der Kind-Header und `subagent/descriptor` bleiben für Recovery und Komposition maßgeblich. Eine Activation und die exakte Elternrelation bleiben für Autorisierung und Zustellung maßgeblich. Modus und Label werden einmal gesnapshottet, und dieselben detachten Werte erreichen den Eltern-Katalog-Fakt und den Kind-Deskriptor.

Die registrierte `subagentCatalog`-Projektion materialisiert die Eltern-Fakten. Sie delegiert Speicher, Append, Iteration und Checkpoint-Validierung an [`dsh-chunked-list`](../../../../packages/util/chunked-list/README.de.md), das Fakten in einem persistenten Stack aus 64-Einträge-Chunks speichert, sodass ein Append höchstens den Head-Chunk in begrenzter O(1)-Arbeit kopiert. Die Materialisierung besucht Chunks vom ältesten zum neuesten und bewahrt die Eltern-Katalog-Event-Reihenfolge in O(D) Zeit für D Fakten. Nebenläufige Erstellung wird durch erfolgreichen Katalog-Append geordnet, unabhängig von Kind-Zeitstempeln und -IDs. Ein Projektions-Checkpoint klont den Zustand einmal in O(D); Projection-Cache-Schreibzugriffe bleiben asynchron und nutzen die bestehenden obligatorischen Erstellungs-, Turn-End- und Disposal-Punkte.

Das Utility besitzt das Chunk-Layout und seine gemeinsame Kapazitätskonstante; der Katalog besitzt Event-Validierung, Fork-Filterung und Zeilenkonvertierung. Die Katalog-Projektionszustandsversion 2 speichert generische Chunk-Werte, sodass die Projektions-Registry inkompatible Caches aus Session-Events neu aufbaut. Session-Event-Payloads und öffentliche Katalogzeilen behalten ihre Formate.

Die Fork-Isolation nutzt den exakten `Session.inheritedEventCount`, der der Projektionsinitialisierung übergeben wird. Der Fold ignoriert `subagent/catalog`-Events unterhalb dieses Offsets. Der Zustand speichert den geerbten Offset, aber nicht die Seq jedes Events, weil die Akzeptanz während des Foldings entschieden wird.

Die Headless-Snapshot-Sammlung weist Sibling-Fixture-Rollen nach ihrer Eltern-Katalog-Reihenfolge zu, unabhängig von Kind-Erstellungszeitstempeln: Der Provider-Start kann eine ältere Session nach einer neueren publizieren. Die Sammlung bewahrt jedes Log wörtlich.

Snapshot-Normalisierer nullen `childCreatedAt`, weil es aus der Prozessuhr stammt. Event-Reihenfolge und Source-Event-Referenzen bleiben intakt: Benachbarte Fakten können aus sequenzieller Erstellung stammen, sodass Nachbarschaft keine Kommutativität begründet.

Current-Writer-Snapshot-Erwartungen enthalten Katalog-Fakten auch dann, wenn der Replay-Input eine historische Session-Generation behält. Der Vergleich bewahrt den Katalog und seine Source-Event-Referenzen; historische Replay-Dateien bleiben unverändert.

## Erwogene Alternativen

**Ein flaches unveränderliches Array.** Append mit `[...facts, fact]` kopiert D Fakten; die Erstellung ist also O(D). Ein geteiltes Array zu mutieren würde Projektionszustands-Ownership und Checkpoint-Sicherheit verletzen.

**Eine verkettete Liste mit einem Knoten pro Fakt.** Sie liefert O(1)-Append und O(D)-Read, aber persistierte Projektions-Checkpoints bilden D Ebenen tiefes verschachteltes JSON. 64-Einträge-Chunks bewahren die asymptotischen Kosten bei geringerer Verschachtelung.

**Separates Host-State-Observation-Output.** Interne Projektionszustände zurückzugeben dupliziert den bestehenden Observation-Result-Mechanismus und kopiert Zustände, die nichts mit Kind-Discovery zu tun haben. Eine Katalog-View liefert die Direct-Child-Liste über die bestehende typisierte Projektions-Map.

**Ein dauerhafter SQLite-Kind-Index.** Ein Index würde einen weiteren Schreibpfad, ein Reconciliation-Protokoll, ein Schema und eine Korruptionsfläche für einen Fakt schaffen, der im Eltern-Session-Log bereits geordnet ist.

**Ein kompensierendes Fehlschlag-Event.** Katalog-Mitgliedschaft vor der Initial-Prompt-Admission aufzuzeichnen erfordert eine zweite Operation, Pairing-Regeln, Rollback-Aufräumung und Client-Reconciliation. Den Erfolgsfakt zu verzögern, bis die Admission abgeschlossen ist, beseitigt dieses Protokoll.

## Konsequenzen

Session-Observations und Client-Snapshots exponieren die Direct-Child-Liste über `projections.values.subagentCatalog`. Der Projektions-Change-Feed publiziert bei Katalogzustands-Änderungen eine vollständige Liste. Jede View kostet O(D), sodass D Erstellungen O(D²) kumulative View-Arbeit verursachen können; dies folgt dem bestehenden Projektionsmechanismus. Direct-Child- und Descendant-Listing nutzen weiterhin den Session-Korpus und die Kind-Identitäts-Projektion.

Backends, die das erforderliche Event nicht kennen, verweigern das Log unter dem bestehenden Session-Event-Mechanismus. Die Katalog-Projektion rekonstruiert fehlende Eltern-Fakten nicht durch Scannen alter Kind-Logs.
