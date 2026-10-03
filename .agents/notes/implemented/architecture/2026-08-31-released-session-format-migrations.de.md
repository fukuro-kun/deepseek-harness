# Agent Note: Veröffentlichte Session-Formate migrieren über zustandsbehaftete Streaming-Stages

Status: implemented

[English](2026-08-31-released-session-format-migrations.md) | [中文](2026-08-31-released-session-format-migrations.zh.md) | Deutsch

## Problem

Session-Format v0 wurde in einem Alpha-Release ausgeliefert; eine strukturelle Writer-Änderung kann vorhandenes JSONL daher nicht mehr als verwerfbaren Pre-Release-Zustand behandeln. Die erste Whole-Artifact-Migrations-Implementierung machte diese Logs konvertierbar, aber ihr Datenmodell verwandelte eine 116-MB-Real-Session in eine Operation, die einen 16-GB-Node-Prozess erschöpfte, bevor sie ein Handle zurückgab.

### Whole-Artifact-Performanzversagen

- Zstandard-Input wurde in 317.540 Frames aufgeteilt, und jeder Frame nutzte einen eigenen asynchronen Dekompressionsaufruf. Die Implementierung hielt jeden Klartext-Frame zurück und konkatenierte sie anschließend vor dem JSON-Parsing, was dieselbe Anzahl an Promise-, Thread-Pool- und nativen Decode-Übergängen erzeugte.
- Das physische Decode materialisierte einen vollständigen Klartext-Buffer, einen vollständigen String, jede JSONL-Zeile, expandierte Quell-Events, migrierte Ziel-Events, enkodierte Zielzeilen, einen gejointen Ziel-String und physische Ziel-Buffer an sich überschneidenden Zeitpunkten in derselben Request.
- Jeder Codec und jede Migrationskante rief `snapshotSessionFormatJson()` oder `snapshotSessionFormatArtifact()` auf. Diese Operationen detachierten, kopierten rekursiv und froren vollständige Header, Zeilen, Payloads und Event-Arrays vor und nach benachbarten Migrationen tief ein.
- Ausgelieferte gepackte Assistant-Chunks expandierten zu etwa 9,14 Millionen logischen v0/v1-Events, bevor v1-zu-v2 sie zu 72.784 aktuellen Events faltete. Die Whole-Artifact-API verlangte, dass beide Repräsentationen und die Alt-zu-Neu-Sequenzabbildung koexistierten.
- Das Encoding baute das vollständige JSONL und die komprimierte Ausgabe im Speicher. Der Erfolgspfad dekodierte danach das gestagte Ziel, dekodierte das committete Ziel und dekodierte es in der Persistenz erneut, um das Business-Objekt zu konstruieren; er las außerdem die Quelle für einen vollständigen Fingerprint-Vergleich erneut.
- `await`-Aufrufe pro Frame lieferten kein nützliches begrenztes Scheduling. Der Pre-Migration-Reader nutzte stattdessen einen synchronen Decoder wieder und yieldete aus der äußeren Schleife etwa alle 500 ms, was Hunderttausende asynchrone Übergänge vermied.

### Die Schnittstellen verhinderten, dass lokale Fixes komponieren

`SessionFormatCodec` dekodierte und enkodierte vollständige Arrays, jede benachbarte `SessionFormatMigration` akzeptierte und lieferte ein vollständiges `SessionFormatArtifact`, und die kompilierte Kette konnte nur ein materialisiertes Artefakt an die nächste Kante übergeben. Ein schnellerer physischer Decoder traf daher downstream weiterhin auf Quellzeilen-Arrays, Arrays expandierter Events, Snapshots pro Kante und Zielzeilen-Arrays.

Die Migrationen sind zustandsbehaftet, obwohl die API sie als One-Shot-Funktionen präsentierte. v0-zu-v1 verfolgt Message- und Retry-Identität. v1-zu-v2 puffert einen unerledigten Assistant-Versuch, verfolgt dahinter blockierte Events und pflegt Alt-zu-Neu-Sequenzreferenzen. Diesen Zustand in Closures oder Push/Finish-Hilfsobjekte zu verpacken machte die Laufzeitstruktur verschieden von den statischen Deklarationen und ließ Produktion, Worker-Verifikation, Fixtures und Replay unterschiedliche Einstiegspfade verwenden.

## Entscheidung

Die Session-Format-Packages verwenden eine zustandsbehaftete synchrone Stage-API. Statische Migrations-Deklarationen beschreiben eine benachbarte Versionskante und erstellen für jedes wiederhergestellte Artefakt eine neue Stage. Eine Stage besitzt den veränderlichen Zustand dieses Artefakts; keine Stage-Instanz wird über Sessions hinweg geteilt.

### Stage- und Context-Protokoll

```text
interface SessionFormatMigrationContext {
  emitEvent(event: SessionFormatEvent): void
  emitRun(run: SessionFormatEventRun): void
}

interface SessionFormatMigrationStage {
  readonly headerInheritedEventCount?: number
  transformEvent(
    event: SessionFormatEvent,
    context: SessionFormatMigrationContext,
  ): void
  transformRun(
    run: SessionFormatEventRun,
    context: SessionFormatMigrationContext,
  ): void
  finish(context: SessionFormatMigrationContext): number
}
```

`SessionFormatMigrationContext.emitEvent()` und `emitRun()` sind synchron. Der Produzent deklariert, ob er ein skalares Event oder einen kompakten Run emittiert, sodass der Hot Path die Kategorie nie aus Eigenschaften eines geparsten Dateiobjekts ableitet. Der Aufrufer besitzt das Scheduling und reicht den Context an jede Operation, statt einen Callback in den Stage-Konstruktor zu injizieren. Ein Input kann null, einen oder viele Outputs emittieren, ohne ein temporäres Rückgabe-Array zu allozieren oder eine interne Output-Queue zurückzuhalten.

`SessionFormatMigration` bleibt eine unveränderliche Deklaration: Versionsnummern, Header-Migration, Ziel-Header-Validierung und `createStage()`. `CompiledSessionFormatChain` validiert einmal eine eindeutige lückenlose Kantensequenz, erstellt pro-Artefakt-Stages in Quell-zu-Ziel-Reihenfolge und verbindet sie mit Context-Objekten in umgekehrter Reihenfolge. `finish()` erledigt Stages in Quell-zu-Ziel-Reihenfolge, sodass jede Stage ihren Tail emittieren kann, bevor die Downstream-Stage schließt.

```text
JSONL record
  → released physical row decoder
  → v0-to-v1 stage
  → v1-to-v2 stage
  → v2-to-v3 stage
  → current event collector
```

Die Kette enthält kein `flatMap`, keine Spread-Expansion, kein intermediäres Event-Array und keinen Scheduler. Der finale Event-Collector expandiert einen kompakten Run erst, nachdem jede Migrations-Stage Gelegenheit hatte, ihn direkt zu konsumieren.

### Ownership benachbarter Versionen

Die [V2-zu-V3-Delivery-Guards](../../../../packages/session/session-format-v2-to-v3/README.de.md#delivery-guards) verhindern, dass ein in der Quellgeneration ignorierter Marker allein durch die Header-Änderung zu einer aktiven Upload-Wassermarke wird. Python-Release-Smoke-Tests prüfen generierte Logs unabhängig vom generationsneutralen Golden-Vergleich gegen das Quell-`SESSION_FORMAT_VERSION`, sodass kohärente Dateinamen und Header keinen veralteten Writer verschleiern können.

Das [V2-zu-V3-README](../../../../packages/session/session-format-v2-to-v3/README.de.md#v2-to-v3-specification) ist die einzige Spezifikation für Transformationen, Bewahrung und Verweigerung dieser Kante; ihr separater [Native-Admission-Abschnitt](../../../../packages/session/session-format-v2-to-v3/README.de.md#native-v3-admission) verhindert, dass Nur-Current-Fähigkeiten mit historischen Transformationen verwechselt werden. Der ausgelieferte V2-Codec bleibt im Besitz von V1→V2 und wird wiederverwendet, nicht kopiert. Die [System-Prompt-](2026-09-02-system-prompt-as-surface-node.md), [PTC-](../feature/2026-06-15-ptc.de.md) und [Canonical-Envelope](2026-09-06-v3-canonical-session-envelopes.md)-Notizen behalten ihre unabhängige Begründung, statt Konvertierungsspezifikationen zu duplizieren. Das [Format-Versions-Cookbook](../../../../docs/cookbook/adding-a-session-format-version.de.md) besitzt Package-Verdrahtung, aktuelle Consumer, Snapshot-Nachfolger und Validierungskommandos.

Die Admission historischen Inhalts gehört zur eingehenden Kante, nicht zur nativen V3-Erweiterungsvalidierung. Einen unbekannten Block zu bewahren, ohne seine Felder zu verstehen, kann nicht begründen, dass die Migration seine Bedeutung erhält. Das [Quell-Audit](../../../../packages/session/session-format-v2-to-v3/README.de.md#source-audit) verwendet daher eine historische Kind-Menge über seine explizit besessenen Content-Positionen hinweg, einschließlich partieller Streams. Es inspiziert zugelassenen Inhalt, ohne ihn umzuschreiben, und lässt Owner-opakes JSON uninterpretiert. Native Akzeptanz einzuengen oder eingefrorene Vorgänger-Validatoren zu bearbeiten würde unabhängige Zusagen ändern, statt sichere Konvertierung zu begründen.

Preset-Umbenennungen decken den Erstellungs-Header und jedes Selektions-Event ab, weil die letzte Selektion das Resume steuert, während frühere Selektionen historische Forks steuern. Nur die letzte Selektion umzuschreiben verliert diese Unterscheidung. Die ausgelieferte `code`-ID bezeichnet das eingebaute Legacy-Preset; die Migration ist unabhängig vom installierten Roster, sodass dieselben Bytes auf jedem Host dasselbe Ergebnis liefern. Native V3-Custom-IDs bleiben ohne globalen Runtime-Alias verfügbar.

Eine geerbte Quellanzahl kann vor EOF unbekannt sein: V2 leitet sie aus Seed-Markern ab, und V1→V2 kann die Kardinalität ändern. Die Kette reicht diese Abwesenheit an die nächste Stage, statt eine Anzahl zu fabrizieren. Die [V2-zu-V3-Vererbungsregeln](../../../../packages/session/session-format-v2-to-v3/README.de.md#sequence-references) unterstützen diesen Fall; ältere Stages, die eine Header-gelieferte Anzahl verlangen, verweigern weiterhin bei deren Abwesenheit. Dies erlaubt geseedete Multi-Hop-Wiederherstellung, ohne ein intermediäres Artefakt-Array zurückzuhalten.

Die [Versions- und Release-Status-Referenz](../../../../docs/session-format-status.de.md) besitzt den Published-Format-Record und identifiziert die Writer-Autorität des Codes. Veröffentlichte Formate behalten ihre Semantik; committete Generationen bleiben während der Migration byte-erhalten. Eine spätere strukturelle Änderung verlangt die nächste benachbarte Kante unter der [Versionierungsregel](2026-08-10-session-log-version-mechanism.de.md), nicht eine Änderung an einer veröffentlichten Konvertierung. Gewöhnliche Event-Ergänzungen folgen dem Required-Event-Refusal-Mechanismus jener Regel, statt automatisch eine Version zuzuteilen. Eine Current-Format-Datei läuft ihre eingehende Migration nicht erneut; Integrationstests verwenden isolierte wegwerfbare Homes und unveränderte historische Inputs.

Das [Committed-Corpus-Inventar](../../../../packages/test-support/llm-replay/tests/session-format-corpus-inventory.ts) identifiziert absichtlich nicht unterstützte historische Konvertierungen nach Quellpfad, Generation und exaktem Verweigerungsgrund. Diese Artefakte zu behalten darf weder eine chronologieändernde Migration erzwingen noch ein pauschales Überspringen erlauben: Jedes gelistete Artefakt muss weiterhin die typisierte Migrationsverweigerung auslösen, und ungelistete Artefakte müssen wiederherstellbar sein. Native Current-Generation-Fixtures können nicht als nicht unterstützt klassifiziert werden, weil sie keine eingehende Kante durchlaufen. Headerlose Test-Harness-Protokollbeispiele bleiben eine separate explizite Klasse. Der Corpus-Test prüft Quell-Bytes nach erfolgreicher wie verweigerter Wiederherstellung; er schreibt historische Evidenz nicht um, um den aktuellen Leser zufriedenzustellen.

### Physische Codecs und gepackte Runs

Jeder ausgelieferte Codec erstellt einen Zeilen-Decoder mit explizitem `strict`- oder `recoverable`-Recovery. Der Decoder validiert und emittiert jeweils ein Event oder einen Codec-eigenen `SessionFormatEventRun` über separate Context-Methoden. v0-zu-v1 und v1-zu-v2 implementieren sowohl `transformEvent()` als auch `transformRun()`, sodass gepackte Assistant-Chunks die Faltkante erreichen können, ohne zuvor Millionen gewöhnlicher Events zu werden.

Die v0-zu-v1-Kante bewahrt logische Header, Sequenznummern, Referenzen, Zeitstempel und Payloads bis auf begrenzte Released-v0-Normalisierungen. Sie übersetzt die ausgemusterten `steering/message`- und `compact/*`-Event-Namen, akzeptiert ein ausgeliefertes `llm/retry` nach seinem passenden `step/end`, versorgt ein fehlendes `llm/retry.retryId` deterministisch pro Turn/Step/Provider/Policy-Kette und versorgt eine deterministische `compactionId` über eine Legacy-Compaction-Gruppe hinweg, die sie wegließ. Die v1-zu-v2-Kante besitzt Attempt-Faltung und Referenz-Remapping und emittiert nur erledigte v2-Events. Sie teilt eine Legacy-Goal-sourcte User-Message in `goal/change` plus der ursprünglichen modellsichtbaren Message. Sie fügt außerdem ein unterbrochenes `turn/end` für den begrenzten ausgelieferten Restart ein, bei dem auf einen offenen Turn ohne offenen Step ein nicht-leerer `next-turn`-Inbox-Splice und der nächste nummerierte `turn/start` folgen.

Der Katalog exponiert eine `createRestore()`-Operation für Produktions-, Worker-, Fixture- und Replay-Aufrufer. Recovery-Policy und finale Validierungs-Policy werden einmal bei der Restore-Erstellung gewählt. Historische Produktion nutzt recoverable Quell-Parsing mit Transformed-Current-Validierung; dies validiert das ausgelieferte aktuelle Ergebnis nach der Migration, während bereits aktueller Input nur Codec-Validierung erhält. Worker- und Fixture-Verifikation nutzen striktes Parsing mit vollständiger installierter Current-Restoration. Eine Migrations-Stage- oder Transformed-Current-Validierungsverweigerung bleibt `SessionFormatUnsupportedMigrationError`; physische Decode-Fehler bleiben Korruption. Der Test-Support behält nur Fixture-spezifische Token- und Envelope-Materialisierung.

### JSONL-Integration

Der JSONL-Provider scannt Frame-Grenzen einmal, verwendet einen Zstandard-Decoder wieder, parst vollständige JSONL-Records inkrementell und speist Zeilen direkt in den Katalog-Restore. Die äußere Schleife yieldet in begrenzter Kadenz; es gibt kein `await` pro Frame und kein vollständiges Klartext- oder Quellzeilen-Array.

Das aktuelle Encoding ist Record-basiert. Der Provider serialisiert etwa 1 MiB Klartext pro Main-Thread-Slice, streamt ihn durch einen Zstandard-Context mit Quellfehler-Propagation, schreibt komprimierte Ausgabe in 4-MiB-Batches in eine exklusiv erstellte temporäre Datei im selben Verzeichnis und synched sie vor der Publikation. Ein prozessweiter Scheduler lässt höchstens zwei vollständige Verifikations-Worker zu und reicht eine freigegebene Permit direkt an den ältesten Wartenden weiter.

Das ausgelieferte `lib/worker.cjs` bündelt seine JavaScript-Workspace-Dependencies, sodass jeder frische Verifizierer deren Runtime-Modulgraph nicht auflösen und kompilieren muss. Dies ist sicher, weil der Worker über schlichte Request/Result-Messages kommuniziert und keine Service- oder Klassenidentität mit seinem Host teilt. Der Host-Build wendet die bestehenden TypeScript- und Typert-Transforms an; der Client-Pass überspringt dieses Node-only-Package, statt seinen Worker durch untransformierte Quelle zu ersetzen. Native Add-ons bleiben extern. Verifikation, Scheduler-Zulassung, Terminierung und dauerhafte Publikation werden weiterhin abgeschlossen, bevor Writable-Open zurückkehrt. Der Built-Worker-Smoke kopiert Package-Manifest und Worker in ein isoliertes temporäres Package ohne umgebende Modulpfade, akzeptiert eine gültige Generation und lehnt eine falsche Event-Anzahl ab.

Die Vorbereitung leitet Cancellation durch Quell-Reads weiter und beobachtet sie an der bestehenden Decode-Yield-Grenze von etwa 500 ms. Sobald `publish()` startet, erhalten Encode, Worker-Verifikation und Publikation keine Aufrufer-Cancellation mehr und laufen bis zur Erledigung; Write-Open prüft danach das Aufrufer-Signal erneut. Eine publizierte Generation wird nie zurückgerollt.

Die Stage-Pipeline endet bei einem vorbereiteten aktuellen Artefakt. [Vorbereitung historischer Session-Reads](2026-09-05-read-only-session-migration-preparation.md) definiert, wie Read-Open dieses Artefakt sofort konsumiert, während Write-Open Encode, Verifikation und Publikation ausführt, bevor es Append-Zugriff zurückgibt.

### Dauerhafte Format- und Publikationsregeln

Kanonische Dateinamen kodieren die physische Formatgeneration: v0 ist `session.jsonl[.zstd]`, und positive Generationen verwenden `session.vN.jsonl[.zstd]`. Die Migration verschiebt, ersetzt oder löscht nie eine committete Generation und schreibt nur das finale aktuelle Ziel; Zwischenversionen existieren nur als Stage-Zustand.

POSIX-Publikation nutzt Hardlink-Erstellung plus Directory-Sync. Windows nutzt `MoveFileExW` mit No-Overwrite und Write-Through. Ein vorhandenes Ziel wird nur akzeptiert, wenn sein verifizierter Migrations-Präfix den gestagten Bytes entspricht; ein Append-Tail gehört zum Lesen der aktuellen Generation, nicht zur Verifikation des Migrationsgewinners.

Bestehende Write-Handles behalten den prozesslokalen Claim und das kernelgestützte prozessübergreifende `SessionWriteLease`. Header-only `stat` und `list` übersetzen unterstützte historische Header, ohne den Body zu öffnen oder eine Generation zu publizieren. Projection-Cache-Records binden ihren Fold an die Formatversion des Session-Headers, sodass eine Cache-Zeile keine kardinalitätsändernde Migration umgehen kann.

## Problem-zu-Lösung-Abbildung

| Whole-Artifact-Problem | Implementierter Mechanismus | Ergebnis |
|---|---|---|
| Ein asynchroner Decode-Aufruf pro Zstandard-Frame | Ein wiederverwendbarer Decoder; äußere 500-ms-Scheduling-Kadenz | Entfernt 317.540 asynchrone Übergänge |
| Vollständige Klartext-, String- und Zeilen-Arrays | Inkrementeller JSONL-Parser und Zeilen-Decoder | Behält nur ein Cross-Chunk-Record-Fragment |
| Vollständiges Event-Array zwischen jeder Kante | Context-verbundene zustandsbehaftete Stages | Keine Event-Arrays für Zwischenversionen |
| Gepackte Chunks expandieren vor der Faltung | `SessionFormatEventRun` plus `transformRun()` | 9,14 Millionen Quell-Events müssen nicht materialisieren |
| Whole-Artifact-Snapshot und Deep-Freeze an jeder Kante | Stage-besessene exklusive Werte und finale Validierung | Entfernt wiederholtes rekursives Kopieren/Einfrieren |
| One-Shot-Migrationsfunktionen verbergen Zustand | Per-Artefakt-Stage-Klassen aus unveränderlichen Deklarationen | Zustands-Ownership und Nebenläufigkeit sind explizit |
| Bulk-Current-Encode baut ganze Strings und Buffer | Record-Encoder, 1-MiB-Input-Slices, 4-MiB-Schreibbatches | Begrenzt Allokation und Main-Thread-Slices |
| Verifikation wiederholt sich auf dem Main-Thread | Höchstens zwei Complete-Generation-Worker | Hält Verifikations-CPU vom Main-Thread fern |
| Produktion und Fixture nutzen unterschiedliche Migrations-APIs | Katalog-`createRestore()` mit expliziten Policies | Eine Decoder-/Ketten-Implementierung |

## Verifikation

Die Migrationsspezifikation verlangt Evidenz für Transformationen, Bewahrung und Verweigerung getrennt. Direkte Kanten- und native V3-Tests können geseedete Multi-Hop-Publikation nicht begründen: Die vorhergehende Assistant-Stream-Faltung ändert Quellkoordinaten, bevor V3 System-Events einfügt. Tests über den realen Katalog und den JSONL-Provider brauchen daher rohe und komprimierte V0/V1-Inputs, gemappte Referenzen und geerbte Schnitte, Publish/Reopen-Äquivalenz, unveränderte Vorgänger-Bytes und keine Zwischengenerationen. Coverage-Prozente allein können diese Stage-übergreifenden Beziehungen nicht beweisen; kombinierte Assertions müssen die resultierende Historie und Verweigerungseffekte vergleichen.

Content-Admission-Evidenz muss jede in der Spezifikation benannte Position abdecken, verschachtelte Ergebnisse, partielle Starts und fehlerhafte bekannte Blöcke, mit Quellkoordinaten-Diagnosen. Erfolgreiche Migration muss zugelassenen Inhalt und opake Werte bewahren. Verweigerung über reale Persistenz muss die Quelle unverändert lassen und keinen Nachfolger publizieren. Native V3-Tests müssen unabhängig Erweiterungsakzeptanz unter beiden Katalog-Validierungs-Policies behalten; historische Verweigerung ist keine Evidenz für native Ablehnung.

### Benchmark-Input und Bedeutungen

Der Benchmark nutzt Node v24.18.0 und ein 116.228.655-Byte-v0-Zstandard-Log mit 317.540 Frames und 454.151 physischen Zeilen. Der alte Reader stellt 9.143.111 expandierte v0-Events wieder her. Die Migration erzeugt 72.784 aktuelle v2-Events mit Artefakt-SHA-256 `fa16ff9472ca350595a3112c20a3db79655bc2673973469987ecaf2a57ebd17c`.

Läufe nutzen gebaute Artefakte unter plain Node, einen Prozess pro Sample und ein 16-GB-V8-Heap-Limit. „Retained Heap" wird nach erzwungenem GC gemessen, während die wiederhergestellte Session lebt. Die folgenden Werte sind Mediane aus drei Läufen, außer dem Whole-Artifact-Versagen, das konsistent kein Handle erreicht.

### Physisches Decode

| Datenpfad | Decode-Zeit | Peak-RSS | Scheduling |
|---|---:|---:|---|
| Optimierter Pre-Migration-Reader | 1.553s | 916MB | Ein Decoder; 2–3 äußere Yields |
| Whole-Artifact-Migration | 7.527s | 7,219MB | 317.540 asynchrone Decoder-Aufrufe |
| Streaming-Stage-Pfad | 1.467s | 908MB | Ein Decoder; 2 äußere Yields |

### Cold-Open historischer Dateien

| Version | Zeit bis zur wiederhergestellten Session | CPU-Zeit | Peak-RSS | Retained Heap | Wiederhergestellte Events | Ergebnis |
|---|---:|---:|---:|---:|---:|---|
| Pre-Migration-Hochleistungs-v0-Reader | 4.594s | 6.048s | 2.720GB | 2.016GB | 9,143,111 | Liest v0; migriert nicht |
| Whole-Artifact-Migration | >72.8s | — | ≥7.219GB während Decode | — | — | OOM vor einem Handle |
| Streaming-Stage-Migration mit serieller Publikation | 6.241s | 8.493s | 2.107GB | 477MB | 72,784 | Publiziert und öffnet v2 |

Der alte Reader hat geringere einmalige Wall-Time, weil er keine Formatkonvertierung oder dauerhafte Publikation durchführt. Er hält außerdem die 9,14-Millionen-Event-Repräsentation am Leben. Der Stage-Pfad zahlt Encode und Verifikation einmal und behält dann den gefalteten v2-Zustand.

### Cold-Open im aktuellen Format

| Version, die ihr aktuelles Format liest | Zeit bis zur wiederhergestellten Session | Peak-RSS | Retained Heap |
|---|---:|---:|---:|
| Alter Reader auf v0 | 4.594s | 2.720GB | 2.016GB |
| Whole-Artifact-Ära-Reader auf v2 | 1.273s | 1.107GB | 476MB |
| Streaming-Stage-Reader auf v2 | 1.284s | 1.109GB | 476MB |

Der Current-v2-Fast-Path bleibt performanzäquivalent. Die Architekturänderung routet aktuelle Daten nicht durch historische Stages.

### Aufschlüsselung der seriellen Streaming-Migration

Diese Tabelle zeichnet den für diese Stage-Entscheidung gemessenen seriellen Open-Fluss auf. Das aktuelle Preparation-first-Scheduling und seine Messungen gehören zu [Vorbereitung historischer Session-Reads](2026-09-05-read-only-session-migration-preparation.md).

| Phase | Median |
|---|---:|
| Quell-Decode und Migration | 2.784s |
| Encode, Schreiben und Sync | 0.956s |
| Vollständige Staged-File-Worker-Verifikation | 1.415s |
| Quell-Recheck und No-Overwrite-Publikation | 0.106s |
| Committed-Präfix-Verifikation und Header-Reopen | 0.046s |
| Generation-Ensure-Current gesamt | 5.318s |
| Finales Current-Decode, von der Persistenz beobachtet | 0.620s |
| Session-Restoration | 0.594s |
| Ende-zu-Ende-wiederhergestellte Session | 6.241s |

Die Generations-Aufschlüsselung und die Ende-zu-Ende-Tabelle stammen aus separaten instrumentierten Läufen; gerundete Zeilen müssen daher nicht exakt aufsummieren.

Format-, Katalog-, Kanten-, JSONL-, Fixture-, Replay- und Built-Worker-Tests decken beide Encodings ab, gepackte Runs, Header-only-Klassifikation, Torn Tails, Migrationsverweigerung, deterministische Legacy-Normalisierung, Quelländerungen, Zielkollisionen, Write-Leases und Worker-Fehlschläge.

## Konsequenzen

Mindestens ein finales Current-Event-Array bleibt nötig, weil Session-Restoration und Agent-Ausführung die vollständige Historie zurückhalten. Die Stage-Architektur entfernt vollständige Quell- und Zwischenziel-Arrays; sie verspricht keinen Speicher proportional zu einem Page-Window.

Dekodierte skalare `assistant/chunk`-Zeilen erhalten Envelope-Validierung und finale Zielvalidierung, aber ihre vollständige Frozen-v1-Quell-Payload-Member-Validierung ist zurückgestellt, weil diese Per-Event-Prüfung Decode- und Migrationszeit auf ausgelieferten Logs wesentlich beeinflusst. Gepackte Assistant-Runs bleiben strikt dekodiert. Die skalare Prüfung darf nur mit Performanzevidenz wiederhergestellt werden, die das gemessene Verhalten dieses Migrationspfads bewahrt.

Read-only-Zugriff konsumiert das Stage-Ergebnis vor dauerhafter Publikation, während Write-Open dasselbe Ergebnis wiederverwendet und vor dem Append auf die Publikation wartet. Das Persistenz-Scheduling bleibt unabhängig von der Format-Pipeline.

Niedrigere Generationen bleiben für Operator-Inspektion erhalten. Retention verspricht weder Downgrade-Kompatibilität noch automatischen Fallback noch, dass eine ältere Runtime eine neuere Generation sicher interpretieren kann.

## Erwogene Alternativen

- **Nur Zstandard-Decode optimieren** — stellt die physische Decode-Geschwindigkeit wieder her, lässt aber Quellzeilen, expandierte Events, Snapshots, Zwischenartefakte und Bulk-Encode im Speicher.
- **Synchrone Generator-Stages** — behalten Execution-Frames und Batches an jedem Yield. Real-Log-Messungen erhöhten Migrationszeit und Migrate-Complete-RSS von etwa 1,0 GB auf etwa 1,2 GB.
- **Arrays von jeder Stage zurückgeben** — bewahrt die alten Allokations-, Traversierungs- und Flattening-Kosten unter einem neuen Namen.
- **Jeder Stage eine interne Output-Queue geben** — fügt Drain-, EOF- und Fehler-Ownership hinzu und hält weiterhin Zwischenwerte zurück.
- **Einen Emit-Callback über Konstruktoren injizieren** — erzwingt umgekehrte Konstruktion oder einen teilweise verbundenen Lebenszyklus. Einen Context an Operationen zu übergeben hält die Stage-Konstruktion unabhängig von Downstream-Verdrahtung.
- **Zustandsbehaftete Codec-Instanzen global teilen** — würde ausstehende Versuche, Mappings und Zähler über nebenläufige Session-Restores mischen.
- **Jede Zwischen-Formatversion persistieren** — erzeugt dauerhafte Zustände ohne Runtime-Consumer; nur die exakte Quelle und die finale aktuelle Generation werden gebraucht.
- **Gemounteten Plugins erlauben, Migrationen zu registrieren** — macht historische Lesbarkeit deployment-abhängig. Der statische Katalog muss veröffentlichte Formate wiederherstellen, bevor Feature-Plugins mounten.
