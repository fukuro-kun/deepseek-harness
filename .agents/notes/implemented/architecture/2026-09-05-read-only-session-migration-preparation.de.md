# Agent Note: Historische Session-Lesevorgänge bereiten vor der Schreibveröffentlichung vor
[English](2026-09-05-read-only-session-migration-preparation.md) | [中文](2026-09-05-read-only-session-migration-preparation.zh.md) | Deutsch

Status: implemented


## Problem

Die zustandsbehaftete Stage-Pipeline macht historisches Decode und Migration begrenzt und schnell, aber ein serielles Öffnen der Persistenz führt weiterhin Encode, Sync, Worker-Verifikation, Veröffentlichung und das erneute Öffnen des Commits aus, bevor es einen der beiden Handle-Typen zurückgibt. Ein leseexklusiver Consumer wartet daher auf etwa 2,2 Sekunden Arbeit, die er nicht benötigt, und verändert den Speicher nur, um Verlauf anzuzeigen.

### Serielle Bereitschaftskosten

- Verlaufs-Paginierung, Projektionsvorbereitung, Export und der einleitende `session.follow`-Snapshot benötigen nur das validierte aktuelle logische Artefakt.
- Ein historisches Lese-Öffnen erzeugt und synct dennoch eine temporäre v2-Generation, startet einen vollständigen Verifikations-Worker, prüft die Quelle erneut, veröffentlicht v2 und öffnet das Ziel wieder.
- Das Migrationsergebnis existiert vor dem Encode bereits im Speicher, aber die serielle API liefert nur den committeten physischen Snapshot. Die Persistenz muss die aktuellen Bytes erneut decodieren, um dieselben logischen Events zu rekonstruieren.
- `session.follow` kann seinen einleitenden Snapshot erst liefern, wenn die Veröffentlichung abgeschlossen ist, obwohl das Fortsetzen des Agents die erste Operation ist, die Append-Zugriff erfordert.
- Schreibgeschützter Speicher kann eine logisch gültige historische Session nicht bedienen, weil das Lese-Öffnen die Veröffentlichung einer Generation erfordert.

### Eine naive Aufspaltung würde die Lebenszyklusgarantien brechen

- Ein Schreib-Handle vor der Verifikation zurückzugeben würde Appends in eine unveröffentlichte temporäre Datei leiten und einen zweiten Dauerhaftigkeitszustand für akzeptierte Events schaffen.
- Nach jedem Lesen automatisch eine Veröffentlichung zu starten, würde Ownership des Backends für Task-Fehler, Shutdown, Aufräumen und einen später hinzukommenden Writer erfordern, der Arbeit übernimmt, die er nicht angefordert hat.
- Eine gemeinsame Vorbereitung kann nicht das AbortSignal des ersten Aufrufers erben. Ein abgebrochener Reader darf Arbeit nicht beenden, auf die ein anderer noch wartet.
- Ein Lese-Handle muss anfangs vorbereiteten Speicher bedienen, später aber eine aktuelle Datei und deren angehängten Tail beobachten, nachdem ein anderer Aufrufer veröffentlicht hat.
- Sobald Reader ein vorbereitetes Artefakt beobachtet haben, darf Quell-Drift nicht still die Migration erneut ausführen und einen anderen logischen Verlauf unterlegen.

## Entscheidung

Das JSONL-Backend trennt logische Vorbereitung von dauerhafter Veröffentlichung. Das Lese-Öffnen wartet nur auf die Vorbereitung. Das Schreib-Öffnen nutzt eine passende Vorbereitung wieder und wartet vor der Rückgabe eines schreibbaren Handles auf die Veröffentlichung.

### API für vorbereitete Generationen

```text
interface PreparedJsonlMigration {
  readonly sourceIdentity: JsonlPhysicalIdentity
  readonly artifact: SessionFormatArtifact
  publish(): Promise<JsonlPhysicalIdentity>
}
```

`prepareJsonlMigration()` liest eine stabile historische Revision, durchläuft die vollständige Stage-Kette einmal und gibt das aktuelle Artefakt zurück, ohne zu kodieren oder zu schreiben. `publish()` ist idempotent: gleichzeitige und spätere Aufrufe teilen sich ein terminales Promise einschließlich dessen Rejection und können dasselbe vorbereitete Artefakt nicht zweimal kodieren.

`publish()` streamt aktuelle Datensätze in eine exklusiv angelegte temporäre Datei im selben Verzeichnis, synct sie, wartet auf den begrenzten Worker-Verifier, vergleicht die von der Vorbereitung erfasste Quellidentität und veröffentlicht den kanonischen Pfad ohne Überschreiben. Der erfolgreiche Publisher nutzt das vorbereitete logische Artefakt wieder, statt sein Ziel zu decodieren. Ein unterlegener Publisher verifiziert, dass der Gewinner mit dem exakt bereitgestellten Migrationspräfix beginnt; die Validierung des Append-Tails bleibt Aufgabe des aktuellen Readers.

Die Veröffentlichung läuft nach dem Aufruf bis zum Abschluss und wird vom schreibenden Aufrufer nicht mittendrin abgebrochen. Das Schreib-Öffnen prüft das Signal seines Aufrufers vor und nach der Veröffentlichung, sodass ein Abort das Öffnen nach dem Commit des Nachfolgers ablehnen kann, ohne das Schreib-Lease zu verlieren. Eine Änderung der Quellidentität wirft `JsonlGenerationSourceChangedError`, entfernt die temporäre Datei und wiederholt weder Decode noch Migration.

### Ownership und Abbruch der Vorbereitung

Das Persistenz-Backend hält einen In-flight-Eintrag pro Session-ID, gewähltem Quellpfad und aus `stat` abgeleiteter Revision:

```text
interface MigrationPreparation {
  sourcePath: string
  sourceRevision: SessionPersistenceRevision
  controller: AbortController
  promise: Promise<PreparedStoredLog>
  settled: boolean
  waiters: number
}
```

Ein neues Lese- oder Schreib-Öffnen schließt sich dem bestehenden Eintrag nur an, wenn Quellpfad und Revision noch übereinstimmen. `waitWithAbort()` lässt das AbortSignal jedes Aufrufers gegen das gemeinsame Promise laufen, ohne dieses Signal an die gemeinsame Arbeit weiterzugeben. Der Backend-eigene Controller wird nur abgebrochen, wenn der letzte Wartende geht, während die Vorbereitung noch läuft. Der Abbruchtest hält den physischen Lesevorgang an und beobachtet zwei registrierte Wartende, bevor er einen Aufrufer abbricht; ein Event-Loop-Yield allein kann die Aufnahme nach der asynchronen Pfad- und Revisionsermittlung nicht herstellen.

Abgeschlossene Ergebnisse wandern in den bestehenden begrenzten `coldLogMemo`. Der `StoredLog`-Diskriminator trennt veröffentlichten aktuellen Zustand von `PreparedStoredLog`, dessen `publication`-Feld die aktuellen logischen Events an ihre passende Veröffentlichungsoperation bindet. Eine Abfrage gefolgt vom Fortsetzen des Agents nutzt daher dasselbe Decode- und Migrationsergebnis wieder. Die In-flight-Map besitzt nur laufende Arbeit; sie ist kein zweiter Cache abgeschlossener Ergebnisse.

`SessionHandle.read()` meldet, ob seine Event-Werte detached oder shared-frozen sind. Das JSONL-Backend friert jeden dekodierten Event-Graphen einmal vor der Memoisierung tief ein und erzeugt dort das `shared-frozen`-Ergebnis; spätere Lesevorgänge und Slices bewahren diesen vom Erzeuger gesetzten Zustand, selbst wenn der Slice leer ist. `readColdSessionLog()` kombiniert diese Werte mit lokal gehaltenen Abschlüssen unterbrochener Turns und reicht den `eventState` durch `SessionObservationReader`; `Session.fromRestore()` validiert und übernimmt den Seed ohne Kopieren oder Einfrieren. Gewöhnliche Create- und Fork-Seeds behalten ihren defensiven Snapshot-Pfad.

Die schreibgeschützte Wiederherstellung validiert die Event- und Settlement-Felder, die das Session-Laufzeitverhalten erfordert, expandiert aber nicht jeden eingebetteten Assistant-Stream. Der Veröffentlichungs-Worker behält die vollständige Stream-Wiedergabe und prüft Übereinstimmung von Inhalt, Nutzung und Replay-Zustand, bevor ein migrierter Nachfolger committet wird. Bestehende Dateien im aktuellen Format verlassen sich auf ihren Writer; Consumers, die einen kompakten Stream expandieren, validieren dessen Datensätze beim Lesen.

### Übergang des Lese-Handles

Ein Lese-Öffnen übernimmt ein Handle mit vorbereiteten Events in `state.primed`, solange keine aktuelle Generation existiert. Jedes spätere `read()` löst den aktuellen Pfad auf:

```text
if current generation is absent:
  return slice of primed events
else:
  clear primed events
  read current generation and enforce non-shrinking history
```

`resolveCurrentLog()` kann daher für eine existierende historische Session `undefined` zurückgeben: Es beantwortet, ob eine aktuelle kanonische Datei existiert, nicht ob die Session lesbar ist. Die öffentlichen `stat` und `list` finden weiterhin den historischen Header.

### Veröffentlichung beim Schreib-Öffnen

Das Schreib-Öffnen erwirbt den prozesslokalen Anspruch und das kernelgestützte prozessübergreifende Lease, bevor es die gewählte Generation erneut auflöst. Bleibt sie historisch, holt es den vorbereiteten `StoredLog` oder nutzt ihn wieder und wartet auf `publish()`. Erst dann gibt es ein mit den vorbereiteten Events vorgeladenes Schreib-Handle zurück.

```text
write open
  → claim process-local ownership
  → acquire SessionWriteLease
  → re-resolve generation
  → join or create preparation
  → encode + sync temp
  → Worker verify
  → source identity check
  → no-overwrite publish
  → return writable handle
```

Kein externer Aufrufer kann anhängen, bevor das Handle existiert. `append`, `flush` und `close` behalten daher ihr gewöhnliches Verhalten auf der aktuellen Generation und brauchen niemals einen „publishing"-Zweig. Das Service-`flush()` flusht weiterhin nur bereits übernommene Writer; es verwandelt eine leseexklusive Vorbereitung nicht in einen Schreibvorgang.

### Follow und Agent-Promotion

`session.follow` öffnet den Verlauf über den Lesepfad, stellt Session und Projektionen wieder her, sendet den einleitenden Snapshot und startet dann die Agent-Promotion. Das Fortsetzen des Agents nutzt das Schreib-Öffnen, wartet also auf die Veröffentlichung, bevor der Agent einen neuen Turn annimmt. Sichtbarkeit des Verlaufs und Schreibbereitschaft sind getrennte Zeitpunkte, ohne dass ein unveröffentlichter Append-Zustand eingeführt wird.

## Abbildung von Problem auf Lösung

| Problem des seriellen Flusses | Implementierter Mechanismus | Garantie |
|---|---|---|
| Leseexklusive Aufrufer warten auf Encode und Verifikation | Lese-Öffnen gibt vorbereitete Events zurück | Erster Inhalt wartet nur auf Decode und Migration |
| Gleichzeitige historische Öffnungen wiederholen Arbeit | Single-flight nach Session/Quellrevision | Eine Migration pro gewählter Revision |
| Erster Aufrufer besitzt gemeinsamen Abbruch | Aufrufer-lokales `waitWithAbort()` plus Backend-Controller | Ein Abbruch tötet keine anderen Wartenden |
| Vorbereitung geht zwischen Abfrage und Fortsetzen verloren | `PreparedStoredLog.publication` im begrenzten Memo | Schreib-Öffnen nutzt dasselbe Artefakt wieder |
| Kein aktueller Pfad existiert für ein Lese-Handle | Vorgeladenes In-memory-Lesen | Historische Daten sind vor Veröffentlichung lesbar |
| Lese-Handle muss späteres Append beobachten | Erneut auflösen und von vorgeladenen Daten auf die aktuelle Datei wechseln | Bestehende Handles konvergieren nach Veröffentlichung |
| Append vor Verifikation ist unsicher | Veröffentlichung innerhalb des Schreib-Öffnens vor Rückgabe des Handles | Zurückgegebener Writer ist sofort dauerhaftigkeitsbereit |
| Automatische Hintergrundveröffentlichung hat keinen Owner | Nur das Schreib-Öffnen ruft `publish()` | Kein verwaister Schreib-Task durch leseexklusiven Zugriff |
| Quelle ändert sich, nachdem Reader das Artefakt sahen | Veröffentlichung ohne erneute Migration scheitern lassen | Ausgelegte logische Verläufe werden nie still ersetzt |

## Verifikation

Der Benchmark verwendet dieselbe 116.228.655-Byte-v0-Zstandard-Session wie die Stage-Entscheidung. Die erste Tabelle vergleicht jede relevante Implementierung; der detaillierte Scheduling-Vergleich hält anschließend die Codec/Stage-Kette zwischen #3585 und dem Preparation-first-Scheduling konstant.

### Erstes Öffnen historischer Daten

| Implementierung | Session wiederhergestellt | CPU | Peak-RSS | Retained Heap | Ergebnis |
|---|---:|---:|---:|---:|---|
| Ursprünglicher Hochleistungs-v0-Reader | 4.594s | 6.048s | 2.720GB | 2.016GB | Liest etwa 9,14 Millionen v0-Events ohne Migration |
| Master-Gesamtartefakt-v0-zu-v2-Migration | >72.8s | — | Decode-Stage erreichte mindestens 7.219GB | — | OOM vor Rückgabe eines Handles |
| #3585 Streaming-Migration mit serieller Veröffentlichung | 6.241s | 8.493s | 2.107GB | 477MB | Erzeugt und veröffentlicht eine v2-Session mit 72.784 Events |
| #3586 Preparation-first-Scheduling | 2.954s | — | 1.026GB | 463MB | Erzeugt dieselbe v2-Session und verschiebt die Veröffentlichung bis zum Schreib-Öffnen |

Preparation-first-Wiederherstellung ist 53 % schneller als #3585 und 36 % schneller als der ursprüngliche Hochleistungs-Reader, obwohl sie das Artefakt zusätzlich nach v2 migriert.

### Beobachtungspunkte des Schedulings

| Nutzersichtbarer Punkt | Serielle Veröffentlichung | Preparation-first | Änderung |
|---|---:|---:|---:|
| Lese-Öffnen plus Session-Wiederherstellung | 6.241s | 2.954s | -53% |
| `session.follow`-Einleitungssnapshot | 7.587s | 2.912s | -62% |
| Agent erhält schreibbare Session | 6.246s | 5.161s | -17% |
| Wiederöffnen einer bereits aktuellen v2-Session | 1.284s | 0.964s | -25% |
| Peak-RSS des Follow-Einleitungssnapshots | 2.353GB | 1.059GB | -55% |

Die Vorbereitung verbringt etwa 2,61 Sekunden in Decode und Migration. Die verschobene Veröffentlichung dauert etwa 2,56 Sekunden: 0,83 Sekunden für Encode/Write/Sync, 1,72 Sekunden für die strenge Worker-Verifikation und etwa 0,005 Sekunden für Quellprüfung und atomare Veröffentlichung. Eine leseexklusive Anfrage führt nichts dieser Veröffentlichungsarbeit aus.

Das vorbereitete Artefakt und die Session-Wiederherstellung erreichen ihren Höchstwert bei etwa 1,03 GB RSS. Vorbereitung und Worker-Verifikation erreichen zusammen etwa 2,19 GB, weil der Parent das logische Artefakt hält, während der Worker die physische Generation unabhängig validiert.

Tests decken Abbruch mit gemeinsamen Wartenden, Abbruch aller Wartenden, Memo-Übergabe, Wechsel des Lese-Handles, Quell-Drift, Gewinnerkollision, Idempotenz der Veröffentlichung, Reihenfolge des Schreib-Öffnens, Worker-Versagen und den gebündelten Worker-Eintrag unter plain Node ab.

## Konsequenzen

Leseexklusiver Body-Zugriff veröffentlicht keine Generation. Der erste Writer zahlt die Veröffentlichung einmal vor dem Append. Ein konfiguriertes JSONL-Root muss weiterhin lesbar und strukturell gültig sein, aber die Migration historischer Bodies erfordert selbst keinen Nachfolger-Write.

Das begrenzte Memo hält ein migriertes Event-Array, um Lese- und Schreib-Öffnungen zu überbrücken. Das ist beabsichtigt: Ohne dieses gehaltene Artefakt wäre ein zweites Decode und eine zweite Migration nötig, oder die frühe Leseverfügbarkeit wäre unmöglich.

Ein Fehlschlag der Veröffentlichung lehnt das Fortsetzen des Agents und andere Schreib-Öffnungen ab, entwertet aber keine Leseergebnisse, die bereits aus der unveränderten historischen Quelle geliefert wurden. Quell-Drift ist für diesen Schreibversuch terminal und kein Auslöser, verborgenen Zustand neu zu berechnen.

Das Backend hat weiterhin eine breitere, bereits bestehende Lebenszykluslücke: dispose besitzt nicht jede `create()`- oder `open()`-Operation, die noch kein Handle zurückgegeben hat. Diese Entscheidung fügt `flush()` kein migrationsspezifisches Tracking hinzu und löst dieses allgemeine Problem ausstehender Operationen nicht.

## Erwogene Alternativen

- **Serielle Veröffentlichung für jedes Öffnen beibehalten** — ist das einfachste physische Zustandsmodell, fügt aber etwa 2,2 Sekunden zum ersten leseexklusiven Inhalt hinzu und erfordert schreibbaren Speicher.
- **Nach dem Lesen automatisch im Hintergrund veröffentlichen** — braucht Task-Ownership des Backends, Shutdown-Quieszenz, Fehlerberichte und das Beitreten von Writern, selbst wenn kein Aufrufer einen Schreibvorgang angefordert hat.
- **Writer vor der Verifikation zurückgeben** — erfordert Append auf eine unveröffentlichte Stufe und schafft einen zusätzlichen Dauerhaftigkeits- und Fehlerzustand für akzeptierte Events.
- **Jedem Aufrufer eine eigene Vorbereitung geben** — wiederholt die dominante Decode- und Migrationsarbeit und vervielfacht den Speicherhöchstwert unter gleichzeitigen list-/follow-/resume-Operationen.
- **Das Signal des ersten Aufrufers die gemeinsame Arbeit abbrechen lassen** — macht spätere Aufrufer von einem fremden Abbruchzeitpunkt abhängig.
- **Migration nach Quell-Drift erneut ausführen** — kann Verlauf ersetzen, der Readern bereits gezeigt wurde, und lässt eine logische Operation dieselbe große Datei mehr als einmal verarbeiten.
- **Lese-Handles immer auf vorgeladenem Speicher halten** — verhindert, dass ein bestehendes Handle spätere Appends sieht, und weicht vom gewöhnlichen Persistenz-Refresh-Verhalten ab.
