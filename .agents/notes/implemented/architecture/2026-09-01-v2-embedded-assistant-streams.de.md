# Agent Note: Assistant-Streams in v2-Versuchsabrechnungen einbetten
[English](2026-09-01-v2-embedded-assistant-streams.md) | [中文](2026-09-01-v2-embedded-assistant-streams.zh.md) | Deutsch

Status: implemented


## Problem

Token-große `assistant/chunk`-Events bewahren exakte Stream-Reihenfolge, Timing, Usage, Terminalzustand, Replay-Metadaten und partielle fehlgeschlagene Ausgabe, aber jeden Chunk zu einem Top-Level-Session-Event zu machen wiederholt Envelopes über Persistenz, Telemetrie, History-Transport, Indexierung und Client-Assembly hinweg. Physische gepackte Zeilen reduzieren JSONL-Bytes, ohne die logische Event-Anzahl oder die Arbeit der Consumer zu reduzieren, die den kanonischen Stream erhalten.

Nur assemblierte erfolgreiche Messages zu speichern würde diesen Overhead beseitigen, aber fehlgeschlagene und abgebrochene Ausgabe, Token-Grenzen, Zeitstempel und deterministisches Provider-Replay verlieren. Der dauerhafte Record braucht eine Einheit pro Modellversuch, ohne die Evidenz zu reduzieren, auf die Replay, Diagnostik, Cancellation-Recovery, Usage-Abrechnung, Snapshots und UI-History angewiesen sind.

Event-Kardinalität zu ändern ändert auch Session-Sequenznummern. Eine ausgelieferte Migration muss die relative Reihenfolge unbeteiligter Events bewahren, jede deklarierte Same-Session-Referenz umschreiben, den exakten Fork-Schnitt behalten und jede Beziehung verweigern, die sie semantisch nicht bewahren kann.

## Entscheidung

Die [V3-Canonical-Envelope-Entscheidung](2026-09-06-v3-canonical-session-envelopes.de.md) besitzt die aktuellen Replacement-Key- und Header-Akzeptanzregeln. Sie bewahrt die hier beschriebenen eingebetteten Streams, Versuchsabrechnungen und die eingefrorene v1-zu-v2-Konvertierung.

Session-Format v2 hat kein Top-Level-`assistant/chunk`-Event. Jeder Modellversuch committet eine dauerhafte Abrechnung mit `stream: AssistantStreamRecord[]`:

- `assistant/message` ist die Surface-Abrechnung für eine erfolgreiche Antwort oder eine abgebrochene Antwort mit sichtbarem assembliertem Inhalt. Sie bettet den exakten kompakten getimten Stream neben der assemblierten Message ein, optionale Usage und optionalen `interrupted: true`-Marker.
- `assistant/attempt` ist nur Log. Sie bewahrt den Stream für einen fehlgeschlagenen, wiederholten, abgebrochenen oder Stream-Fehler-Versuch, der die Abrechnung ohne Surface-Message erreicht, damit Diagnostik und Abrechnung keine modellsichtbare Historie fabrizieren.

`AssistantStreamAccumulator` snapshottet jeden Chunk einmal. Aufeinanderfolgende Text-, Reasoning- oder Tool-Argument-Deltas für denselben Block werden zu einem kompakten Run mit seinem ersten Zeitstempel, exakten Zeitstempel-Abständen und einem Array-Member pro ursprünglichem Delta. Jeder andere Chunk bleibt ein Zeitstempel-Roherrecord. `expandAssistantStream()` validiert strikt und rekonstruiert die exakte getimte Sequenz; die Compaction verbindet nie Delta-Grenzen.

Der Migrations-Publikations-Verifizierer und der eingefrorene v2-Fixture-Validator verlangen, dass der eingebettete Stream Inhalt, Usage und Replay-Zustand einer nicht-leeren `assistant/message` reproduziert. Ein leerer Stream bleibt für eine migrierte Legacy-Message gültig, die keine Quell-Chunks hatte. Die gewöhnliche Session-Restoration validiert die Abrechnungsfelder, die die Runtime braucht, ohne jeden historischen Stream zu expandieren; Consumer, die einen kompakten Stream expandieren, validieren seine Records beim Lesen. `assistant/message` kann keine veralteten Chunk-`sourceEventSeqs` tragen; die gewöhnliche User- und Tool-Surface-Provenienz bleibt verfügbar.

### Live-Präsentation und dauerhaftes Replay

`agent/assistant-stream` publiziert prozesslokale Start-, transiente Chunk- und End-Frames. Der Loop hängt die vollständige `assistant/message` oder `assistant/attempt` an, bevor ein committetes End-Frame ihren Typ und ihre Sequenz nennt. Ein abgebrochenes Ende hat keine Abrechnung.

Der Web-Follow-Adapter optet in diese prozesslokalen Frames und fügt die zuletzt bei jedem Start beobachtete dauerhafte Sequenz hinzu. Er präsentiert Chunks als Client-only-`assistant/live-chunk`-Updates zwischen dauerhaften Cursorn, staget nur eine spätere passende Abrechnung bis zum committeten Ende und öffnet Follow bei einer Revisions-Lücke neu. Ein committetes Ende publiziert ein benanntes Abrechnungs-Delta, das die transienten Treffer des Versuchs entfernt, den dauerhaften Eintrag hinzufügt und nur betroffene Conversation Contexts replayt; ein abgebrochenes Ende publiziert dasselbe Delta ohne Eintrag. Eine Reconnect-Baseline trägt den dauerhaften Start-Cursor und das kompakte Präfix des aktiven Versuchs.

Die Client-Event-Quelle reicht dauerhafte Abrechnungen unverändert durch. Die Chat- und Trajectory-Assistant-Knoten folden `assistant/live-chunk`, solange ein Versuch aktiv ist, bauen abgerechnete Ausgabe direkt aus `assistant/message` und replayen keinen `assistant/attempt`-Stream für die Präsentation. Kalte abgerechnete Präsentation rekonstruiert daher kein Per-Token-Timing; andere Consumer können den dauerhaften Stream expandieren, wenn sie seine exakte Evidenz brauchen.

### Ausgelieferte v1-zu-v2-Migration

Die benachbarte Migration validiert das vollständige eingefrorene v1-Artefakt, gruppiert Chunks nach Turn, Step, Terminal-Boundary und exakter Message-Provenienz und substituiert dann eine Abrechnung pro Versuch. Die Chunks einer erfolgreichen Gruppe wandern in ihre Message. Eine unzugeordnete Gruppe wird zu `assistant/attempt` an der Position des zuletzt konsumierten Chunks. Unbeteiligte verschachtelte Events behalten ihre relative Reihenfolge, und Überlebende erhalten dichte v2-Sequenznummern. Die Kante kompaktiert eingebettete Streams über den Runtime-`AssistantStreamAccumulator` aus `dsh-llm` statt über eine eingefrorene Kopie, weil dieses Package die v2-Stream-Enkodierung besitzt. Der isolierte Publikations-Verifizierer expandiert und reassembliert den geschriebenen Stream über `expandAssistantStream()` und `BlockAssembler` und prüft dann jede migrierte `assistant/message` dagegen vor der Publikation. Ein späteres Format, das die Stream-Enkodierung ändert, muss Kopien dieser Helfer in diese Kante einfrieren.

Die Kante remappt das endliche deklarierte Referenz-Inventar: Envelope-Provenienz, Surface-Replacement-Endpunkte, Command-Source-Events, Compaction-Ranges und beschattete Listen sowie Title-Message-Listen. Der modellsichtbare Text einer validierten `session/title-llm-request` bleibt byte-identisch im Quell-Sequenz-Namensraum, während sein `messageSeqs`-Feld in den v2-Namensraum wandert; die Zielvalidierung rekonstruiert diesen Text daher nicht aus remappten Sequenzen. Eine Referenz auf einen konsumierten Chunk verweigert die Migration; sie wird nie auf eine Abrechnung mit anderer Bedeutung umgeleitet. Die Kante verweigert außerdem einen geerbten Schnitt, der einen Versuch teilt.

Der physische v2-Header verlangt `isSeeded` und speichert keinen numerischen Schnitt. Ein geseedetes Artefakt markiert seinen exakten Schnitt mit `session/end-seed { inherited: true }`; das Decoding leitet den Schnitt aus dem letzten getaggten Marker ab. Der v2-Codec schreibt ein dauerhaftes Event pro physischer Zeile, range-enkodiert nur `sourceEventSeqs` und validiert physische Envelopes, ohne gewöhnliches Event-Vokabular oder Payload-Ergänzungen einzufrieren. Der v1-zu-v2-Zielvalidator friert separat das Released-v2-Inventar ein, während die aktuelle Restoration das installierte Session-Vokabular verwendet. Eingefrorene v0- und v1-Codecs behalten Packed-Row-Decoding für ihre unveränderlichen historischen Generationen.

Der Konstruktor-Seed eines frischen Subagent-Kindes ist exakt das geerbte Eltern-Präfix. `Session` hängt den getaggten Schnitt-Marker an, dann hängt das Subagent-Setup den Kind-eigenen Deskriptor und die delegierten Policies an. Der frühere Descriptor-Seed-Helfer ist entfernt, sodass ein Deskriptor nie als geerbt gezählt wird und Cold-Resume das persistierte Kind-eigene Setup replayt. Historische Snapshot-Fixtures, die einen ungetaggten Marker hinter dem Deskriptor platzierten, werden an ihrer Quelle korrigiert; der aktuelle Vergleich hält Marker-Anzahl und Sequenzreferenzen sichtbar.

Die `dsh_session_log`-Request-Erweiterung behält ihr eigenes äußeres Schema auf Version 1: Ihre Session-Header-Projektion leitet `seedLength` weiterhin aus dem logischen geerbten Schnitt ab, und nur ihr `sessionFormatVersion`-Member identifiziert die eingebettete logische Session-Generation. Projektionseinheiten behalten ebenso ihre `stateVersion`; der Projektions-Cache bindet jeden Checkpoint an die Session-Formatgeneration, sodass ein Generationswechsel nie einen Unit-Versions-Bump braucht.

Generationsauswahl und Publikation folgen der [Released-Session-Migrationsentscheidung](2026-08-31-released-session-format-migrations.de.md): Quellpfad, Bytes und Inode bleiben unverändert, nur der finale versionsbenannte Nachfolger wird publiziert, und behaltene Vorgänger bieten weder Fallback noch Downgrade-Support.

## Verifikation

Die Compact-Stream-Tests pinnen exakte Akkumulation und Expansion für Text, Reasoning, Tool-Argumente, Roh-Chunks, Zeitstempel-Abstände, fehlerhafte Records und detachte Snapshots. Die v1-zu-v2-Tests decken erfolgreiche und fehlgeschlagene Versuche, Interleaving, dichte Sequenz- und Referenz-Remapping, Source-Sequenz-Title-Framing, Seed-Cut-Einfügung und Split-Verweigerung, strikte Quell- und Zielvalidierung, One-Row-v2-Enkodierung, Backend-kompatible Provenienz-Ranges, rohe und Zstandard-Publikation sowie No-Write-Current-Reads ab.

Die Pre-Merge-Performanz-Akzeptanz maß statischen Katalog-Routing-Overhead gegen direkte Released-v2-Restoration derselben bereits geparsten physischen Zeilen über drei Läufe, 100 Warmup-Paare und 600 gemessene Paare; sie verglich nicht v1 mit v2 und maß kein Backend-I/O. Jeder gepoolte Median und jede p95-Regression blieb innerhalb des 5%-Budgets, mit einer schlimmsten p95-Regression von 3,150 %.

Agent-Loop-Tests pinnen Durable-before-End-Reihenfolge, unterbrochene sichtbare Präfixe, fehlgeschlagene und Retry-Versuche, Abbruch, Usage und Replay-Metadaten. Session-Controller- und Conversation-Tests pinnen Live-Transient-Anzeige, Reconnect-Baselines, Committed-Settlement-Freigabe und History-Replay. Chat- und Trajectory-Tests pinnen Live-Partial-Präsentation und direkte Final-Message-Projektion, während TypeScript- und Python-SDK-Snapshots die externe Event-Repräsentation pinnen.

## Erwogene Alternativen

**Nur assemblierte erfolgreiche Messages persistieren.** Dies verliert partielle fehlgeschlagene Ausgabe, Timing, Token-Grenzen, Usage aus Versuchen ohne Message und exaktes deterministisches Replay. `assistant/attempt` und der eingebettete kompakte Stream bewahren diese Fakten, ohne sie der Modell-Historie hinzuzufügen.

**Top-Level-Chunks behalten und nur physische Zeilen packen.** Dies bewahrt die logische v1-Repräsentation, lässt aber Sequenzdichte, Telemetrie-Volumen, Wire-Envelopes, Client-Einträge und Consumer-Dispatch proportional zur Token-Anzahl. Historische Codecs dekodieren diese Repräsentation weiterhin; sie ist nicht das aktuelle Event-Modell.

**Gepackte Chunk-Zeilen durch die History-API führen.** Dies reduziert Wire- und Client-Arbeit für v1, gibt dem Client aber ein zweites Event-Vokabular und hält den Transport an die Token-Zeilen-Kardinalität gekoppelt. Die aktuelle API trägt skalare dauerhafte Abrechnungen plus einen separaten Live-Transient-Stream.

**Eingebettete Streams im Session Controller strippen.** Dies reduziert den zurückbehaltenen Client-Speicher, erzeugt aber einen zweiten dauerhaften Event-Typ und lässt einen transportseitigen Owner entscheiden, welche Evidenz Präsentations-Consumer brauchen. Der gemessene Engpass ist wiederholte Expansion; daher entscheidet jeder UI-Consumer, ob er die unveränderte Abrechnung inspiziert.

**Den Stream in einer Sidecar- oder Replay-only-Fixture speichern.** Dies verteilt Message und Evidenz eines Versuchs über Durability-Owner und kann gewöhnlichen resumierten Sessions nicht dieselben Failed-Output- und Timing-Fakten geben. Die Abrechnung ist der atomare Owner.

**Referenzen von konsumierten Chunks auf ihre Abrechnung umleiten.** Ein Chunk und eine Versuchsabrechnung sind keine austauschbaren Fakten. Die Verweigerung verhindert, dass eine Migration die Bedeutung Plugin-eigener Referenzen still ändert.

## Konsequenzen

Aktuelle Logs, Telemetrie und History-Seiten skalieren nach Modellversuchen statt Token-Chunks, während exakte Stream-Evidenz in jeder Abrechnung erhalten bleibt. Das Client-Event-Window behält diese kompakte Evidenz, aber die Chat- und Trajectory-Assistant-Knoten expandieren abgerechnete Streams nicht zu Per-Delta-Objekten. Die Live-Präsentation bleibt inkrementell und absichtlich prozesslokal.

Anders als v1-Top-Level-Chunks, die der gepufferte Persistenz-Writer vor Versuchsende flushen konnte, hat v2 bis zur Abrechnung keine dauerhafte Versuchsevidenz. Ein harter Prozess- oder Host-Verlust vor der Abrechnung verwirft den vollständigen In-Flight-Stream; `agent/assistant-stream` ist kein Write-Ahead-Log. Dieser Tradeoff vermeidet einen zweiten Durability-Owner für Live-Ausgabe.

Eine Abrechnung kann groß sein, und die v1-zu-v2-Migration materialisiert das ganze Artefakt plus seine Sequenz-Map. Das geschlossene Alpha-Inventar verweigert unbekannte v1-Events und undeklarierte Referenzen, statt zu raten. Consumer, die einzelne Chunks brauchen, rufen `expandAssistantStream()` auf und dürfen aus `agent/assistant-stream` keine Durability ableiten.

Die Migration ändert Sequenznummern nach konsumierten v1-Chunks; jede Same-Session-Referenz gehört daher zu einer expliziten Rewrite-Regel. Diese Bedingung macht zukünftige kardinalitätsändernde Migrationen bewusst teuer und hält stille semantische Umleitung aus der Formatkette.
