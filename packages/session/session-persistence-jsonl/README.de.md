---
description: "Das ausgelieferte JSONL-Session-Persistenz-Backend für Deployments und Maintainer, die persistente Logs pro Session mit optionaler Zstandard-Kompression auswählen, konfigurieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-session-persistence-jsonl

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`dsh-session-persistence-jsonl` speichert jede Session in einem aktuellen, append-only JSONL-Log und bewahrt unveränderliche historische Format-Generationen — standardmäßig Zstandard-Frames mit Prüfsumme, bei deaktivierter Kompression rohe zeilengetrennte Textzeilen. Es stellt den aktuellen logischen `SessionEvent`-Stream über Persistence-Handles bereit, sodass Format-Migration, Kompression, historische Dekodierung und Crash-Recovery interne Speicherdetails bleiben. Wähle es, wenn Consumers eine Datei pro Session auf der Festplatte brauchen; bei `compression: 'none'` sind die Logs als reine Textzeilen lesbar. Ein Root-Verzeichnis ist die einzige erforderliche Konfiguration; Durability, Lazy-Materialisierung, [unterstützte Migration historischer Formate](../session-format-catalog/README.de.md) und Crash-Recovery bei abgerissenen Tails liefert das Backend mit.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Modell-Erfahrung](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev-Notiz](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Mounte dieses Backend, wenn eine Komposition persistente Sessions braucht, die durch Dateien pro Session abgesichert sind. Der übliche Weg ist explizit: Session-Service laden, Backend mounten und ein Root-Verzeichnis angeben.

### Wann es wählen

Wähle dieses Backend, wenn Consumers von einem Artifact pro Session profitieren — Navigation, externe Werkzeuge oder ein roh zeilenlesbares Log. Es ist der einzige First-Party-Provider für Session-Persistenz. Das Backend legt Sessions unter einem deployment-kontrollierten Root ab: projektlokal, geteilt, temporär oder zentralisiert.

### Minimale Konfiguration

```yaml
- name: '@deepseek-ai/dsh-session'
- name: '@deepseek-ai/dsh-session-persistence-jsonl'
  config:
    root: /absolute/path/to/session-logs
```

`root` ist erforderlich und hat keinen Default: Ein `process.cwd()`-Default würde Session-Dateien je nach cwd des Prozesses verstreuen. Ein existierender Root muss ein lesbares Verzeichnis sein; ein fehlender Root wird bei der ersten Materialisierung angelegt.

| Feld | Default | Bedeutung |
|---|---|---|
| `root` | erforderlich | Root-Verzeichnis für alle Session-Dateien |
| `compression` | `'zstd'` | Physische Kodierung: `'zstd'` geprüfte Frames oder `'none'` zeilengetrennter UTF-8-Text |

Das Batching von Live-Event-Schreibvorgängen ist keine Konfiguration: Das Batching-Fenster ist die interne Scheduling-Policy des Seam innerhalb jedes Write-Handles.

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-session-persistence-jsonl) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Layout auf der Festplatte

Jede Session erhält ein session-eigenes Verzeichnis unter einem lesbaren Projektverzeichnis. Jede kanonische Generation beginnt mit einem physischen Header, dessen Version ihrem Dateinamen entspricht. Das aktuelle Format speichert eine physische Zeile pro durablem Event; die eingefrorenen v0- und v1-Reader verstehen außerdem ihre historischen gepackten Assistant-Delta-Zeilen. Das aktuelle Format speichert `isSeeded` im Header und leitet den geerbten Cut aus dem letzten markierten `session/end-seed`-Marker ab, während historische Codecs ihren numerischen `seedLength` übersetzen. Der Format-Katalog schließt diese Übersetzung ab, bevor ein Handle aktuelle logische Werte bereitstellt. Aktuelle Speicher-Records verwenden die unten beschriebene verlustfreie Provenance-Darstellung:

```text
<root>/
  --<normalized-cwd>--/          # readable project directory (or _no-cwd/)
    <encoded-id>/                # session-owned directory
      session.jsonl.zstd         # released v0, compressed root
      session.v1.jsonl.zstd      # released v1, compressed root
      session.v2.jsonl.zstd      # released v2, compressed root
      session.jsonl              # released v0, raw root
      session.v1.jsonl           # released v1, raw root
      session.v2.jsonl           # released v2, raw root; later versions use vN
```

Session-IDs werden vor Verwendung injektiv in ein sicheres Pfadsegment escaped (kein Traversal, keine Kollision). Der normalisierte cwd hält das Projektverzeichnis für die Navigation lesbar; cwd-Strings, die gleich normalisieren, teilen sich ein Projektverzeichnis, während Session-IDs weiterhin unterschiedliche Session-Verzeichnisse auswählen. Runtime-Operationen wählen die numerisch höchste kanonische Generation, und Format-Ablehnungsdiagnosen nennen deren absoluten Pfad, damit ein Operator das rohe Log findet, das ein Build zu interpretieren verweigerte.

### Durability und Crash-Semantik

Eine Session wird lazy materialisiert: `create(header)` schreibt nichts und liefert das eigene Write-Handle; das erste `append` des Handles schreibt den kodierten Header und den ersten Batch mit `fsync` über ein überschreibfreies Publish — eine erstellte, aber nie beschriebene Session hinterlässt daher nichts auf der Festplatte, es sei denn, ihr Besitzer ruft `handle.flush()` auf, das einen Header-Frame ohne Event publiziert. Jeder weitere Batch hängt Zeilen oder einen komprimierten Frame an und führt `fsync` aus, bevor das Append aufgelöst wird; ein abgefangener Schreib- oder Sync-Fehler rollt die Datei auf ihre vorherige Länge zurück. Committete Events werden nie neu geschrieben. Nach einem Crash behält das gespeicherte Log seinen unterbrochenen letzten Turn — jeder Record im committeten Prefix überlebt, und der resumende Reader hängt synthetische Closer über sein Write-Handle an. Eine unvollständige letzte Rohzeile wird verworfen. Ein abgerissener letzter Zstandard-Frame trägt nur seine vollständig dekodierten JSONL-Records bei; ein Write-Handle schneidet die abgerissenen Bytes ab und schreibt diese wiederhergestellten Records durable neu, bevor sein erster neuer Batch folgt. Prüfsummen-, Dekompressions- oder Strukturfehler in einem vollständigen committeten Frame werden als Korruption abgelehnt.

Der Scanner der aktuellen Generation wendet die strukturellen Admission-Checks des aktuellen Codec-Besitzers an, bevor er den wiederherstellbaren Tail behandelt. Ausgemusterte erforderliche PTC-Tags und `request/header.header.system` lehnen die Datei selbst nach einer früheren fehlerhaften Zeile ab; die Recovery kürzt sie nie als gewöhnliche beschädigte Tail-Daten.

### Die Logs lesen

`open(id, 'read'|'write')` wählt die höchste kanonische Generation. Aktuelle Eingabe folgt dem gewöhnlichen schnellen Pfad. Bei historischer Eingabe dekodiert und migriert ein Read-Open die Quelle einmal, validiert das aktuelle logische Ergebnis und gibt es zurück, ohne einen Nachfolger zu publizieren. Ein Write-Open nutzt diese revision-keyed Preparation wieder, sofern verfügbar, oder führt dieselbe Preparation aus, kodiert dann eine temporäre Datei im selben Verzeichnis in begrenzten Chunks, verifiziert sie in einem Worker-Thread, prüft die Quell-Revision erneut und publiziert den aktuellen Nachfolger ohne Überschreiben, bevor es zurückkehrt. Die Quelle bleibt byte-identisch. Drift der Quelle nach der Preparation lehnt dieses Write-Open ab, ohne die bereits an Reader zurückgegebene logische Historie zu ersetzen; ein späteres Write-Open bereitet die neue Revision auf. Das Backend markiert dekodierte Event-Graphen als `shared-frozen`, wenn es sie vor der Memoisierung einfriert; Handle-Reads und Slices bewahren diesen Zustand, einschließlich leerer Slices. Nur ein unmaterialisiertes Pending-Log meldet `detached`. `stat(id)` und `list()` wählen nur den Header der höchsten Generation und übersetzen ihn, ohne Event-Zeilen zu lesen oder eine Migration zu starten; Snapshots tragen `sizeBytes` und eine best-effort, aus stat abgeleitete Revision für die ausgewählte Datei. Mit `compression: 'none'` ist das Log zeilengetrennter Text, den ein externer Reader direkt konsumieren kann; der komprimierte Default muss über das Backend gelesen werden.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die physische Kodierung und den Schreibpfad; der beobachtbare Vertrag ist in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designkonzept

Das Backend besitzt seine komplette Storage-Runtime (`src/storage.ts`): `JsonlSessionHandle` trägt die Mutationskette pro Handle, den gerouteten Live-Event-Puffer mit festem Batching-Fenster und Single-Flight-Drain, monotone Reads und idempotentes Close; ein Tracker hält die prozessinternen Single-Writer-Claims, die Menge der offenen Handles, die der Teardown durchläuft, und die erstellten, aber unmaterialisierten Pending-Sessions, in die die eigenen Session-Listener des Backends routen. Historische Body-Reads teilen sich eine Decode/Migrate-Preparation pro Session, und ein begrenzter, revision-keyed Memo erlaubt einem unmittelbaren Observe-to-Resume-Handoff die Wiederverwendung dieses Parsens; das Backend friert jeden Event-Graphen einmal vor der Memoisierung tief ein, sodass spätere Handle-Reads ihn ohne Kopieren oder erneutes Einfrieren wiederverwenden. Nur ein Write-Open publiziert den vorbereiteten Nachfolger. Das Paket exponiert bewusst nur seinen Default-Plugin-Export plus Konfigurationstypen — die konkrete Klasse ist kein benannter Export, sodass Consumers an `ctx.sessionPersistence` koppeln und die geteilten Seam-Suiten (`runPersistenceContract`/`runLiveWritePathContract`) ihr beobachtbares Verhalten festnageln. Ihr Change-Token ist eine best-effort Datei-Revision: Device, Inode, Größe und Nanosekunden-Timestamps identifizieren ein Log für `stat`/`list`, für die Stable-Read-Schleife, die einen durch ein gleichzeitiges Append zerrissenen Read wiederholt, und für den Quell-Check vor der Publikation.

### Physische Kodierung

Das Default-Artifact ist eine Standard-Verkettung unabhängiger [Zstandard-Frames](../../../.agents/notes/implemented/architecture/2026-07-19-zstandard-jsonl-session-logs.de.md): ein geprüfter Frame nur mit der Header-Zeile, dann ein geprüfter Frame pro durablem Append-Batch, unter Verwendung der eingebauten Zstandard-API von Node auf deren Default-Kompressionslevel (kein Level-Regler). Das aktuelle Format schreibt ein Event pro Zeile; `sourceEventSeqs` verwendet eine verlustfreie Speicherform, in der aufeinanderfolgende Läufe von mindestens drei Sequenznummern zu `[start, end]`-Paaren werden, jede andere Liste bleibt unverändert, und beim Lesen wird das exakte In-Memory-Array expandiert. Die historische Migration verwendet einen Zstandard-Decoder wieder, leitet geparste Zeilen durch zuständige Format-Stages und streamt aktuelle Records über einen Kompressionskontext in etwa 1 MiB großen Main-Thread-Slices, wobei nur finale aktuelle Events, begrenzter Decoder-Zustand und die benötigte Sequenz-Remap-Tabelle zurückbehalten werden. Das Listing liest und validiert nur den Header-Frame. `compression: 'none'` behält dieselben logischen Zeilen in Speicherform ohne Frame-Kompression bei. Ein Root gehört zu genau einer Kodierung: Startup-Discovery und gezieltes Lookup lehnen Generationen mit dem anderen Suffix ab; Format-Migration bewahrt die konfigurierte Kodierung, während Kompressionskonvertierung, Mixed-Root-Fallback und Dual-Write nicht unterstützt werden. Die eingefrorenen v0- und v1-Codecs behalten ihre Packed-Row-Decoder ausschließlich für historische Generationen.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `Config`-Schema, die Backend-Service-Klasse und Datei-Speicherprimitive |
| [`src/storage.ts`](src/storage.ts) | Das JSONL-Handle, gerouteter Live-Event-Puffer, prozessinterne Writer-Buchführung, Listener, Teardown |
| [`src/format.ts`](src/format.ts) | Log-Pfad-Ableitung, Header-Kodierung und Scan aktueller Records |
| [`src/generation.ts`](src/generation.ts) | Single-Pass-Restore historischer Daten, begrenzte Stage-Kodierung, Quell-Revisionsprüfung und exklusive Nachfolger-Publikation |
| [`src/migration-verifier.ts`](src/migration-verifier.ts) | Worker-Lifecycle für Staged- und Competing-Generation-Verifikation |
| [`src/zstd.ts`](src/zstd.ts) | Zstandard-Frame-Kompression, Dekodierung und Frame-Scan |
| [`src/win32.ts`](src/win32.ts) | Windows-Write-Through-Publish und Verzeichniserstellung |
| — | Es wird kein Runtime-Invariant-Companion publiziert; Persistenz-Korrektheit erfordert Backend-Round-Trip- und Crash-Tail-Tests; dieses Paket exponiert keine kontinuierlich beobachtbare prozessinterne Relation. |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Vertrag nicht ausreicht. Sie führen vom geteilten Persistenz-Modell zum Geschwister-Backend und den Entscheidungen zum physischen Format.

- [Session-Persistenz-Subsystem](../../../docs/subsystems/persistence.de.md) — backend-neutrale Service-Semantik und Provider-Beziehungen.
- [Session-Persistenz-Seam](../session-persistence/README.de.md) — der Service-Vertrag, den dieses Backend implementiert.
- [Entscheidung zu Projekt-Session-Verzeichnissen](../../../.agents/notes/implemented/architecture/2026-07-24-project-session-directories.de.md) — der Layout-Tradeoff hinter Projekt- und Session-Verzeichnissen.
- [Zstandard-JSONL-Session-Logs](../../../.agents/notes/implemented/architecture/2026-07-19-zstandard-jsonl-session-logs.de.md) — die Begründung der Kodierung mit geprüften Frames.
- [Veröffentlichte Session-Format-Migrationen](../../../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.de.md) — unveränderliche Generationen, benachbarte Migrationskanten und Publikationsregeln.

-----

<a id="model-experience"></a>
## Modell-Erfahrung

### Wiederhergestellte Konversationshistorie

#### Was das Modell sieht

JSONL-Speicher liefert kein Live-Prompt und kein Schema. Das Laden stellt die gespeicherte Oberflächenhistorie wieder her und bewahrt frühere Request-Header für die Rekonstruktion; der neue Loop komponiert seinen aktuellen Envelope. Die Recovery balanciert einen Assistant-Request ohne durablem Call mit `TOOL_NOT_STARTED`; ein durabler Call ohne Ergebnis wird zu `TOOL_OUTCOME_UNKNOWN`, was dem Modell sagt, nur Read-only- oder idempotente Arbeit zu wiederholen und mögliche Seiteneffekte zu verifizieren oder den Nutzer zu fragen. Eingebettete Assistant-Streams und Log-only-Versuche duplizieren keine Nachrichten.

#### Token-Effekt

Null Live-Request-Tokens. Ein resumter agent zahlt für die zurückbehaltene Historie und seinen aktuellen Envelope plus das zitierte Reparaturergebnis für jeden unterbrochenen Call.

#### KV-Cache-Effekt

JSONL-Speicher verändert keine Live-Request-Prefixe. Ein resumter Loop kann Provider-Cache nur wiederverwenden, wenn rekonstruierte Historie, aktueller Envelope und Model-Route übereinstimmen; Crash-Repair-Ergebnisse werden angehängt.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann dieses Backend schlecht passt oder besondere Betriebsaufmerksamkeit braucht. Sie sind aktuelle Paket-Constraints, kein Aufgaben-Backlog.

- **Format-Migration bewahrt die konfigurierte Kodierung und unterstützt nur die katalogisierte Kette** — dieser Build migriert unterstützte historische Generationen ins aktuelle Format; ein Kompressionswechsel erfordert einen separaten Root, und zurückbehaltene Vorgänger bieten kein automatisches Fallback oder Downgrade.
- **Das Flat-File-Speicherlayout wird nicht geladen** — verwende einen separaten Root oder verschiebe Pre-Release-Artifacts vor dem Laden in das Projekt-/Session-Verzeichnislayout.
- **Komprimierte Dateien sind nicht direkt zeilenlesbar** — lade sie über das Backend oder wähle `compression: 'none'` vor dem Schreiben eines frischen Roots, wenn externe Zeilenleser benötigt werden.
- **Nichts löscht Session-Dateien** — Logs akkumulieren unter `root`, bis sie extern entfernt werden; der Seam hat keine Lösch-API.
- **Ein Live-Writer pro Session** — der Write-Handle-Claim schließt einen zweiten Writer innerhalb der besitzenden Backend-Instanz aus, und ein Kernel-Lock (nicht-blockierendes `flock(2)` auf `session.lock`; unter Windows eine von diesem Pfad abgeleitete benannte Kernel-Semaphore ohne Dateisystem-Fußabdruck) schließt jede andere Instanz und jeden anderen Prozess aus; der Lock wird beim Write-Open eines bestehenden Artifacts genommen und bei einer erstellten Session erst unmittelbar vor ihrem ersten materialisierenden Schreibvorgang, sodass eine unmaterialisierte Session keinen Dateisystem-Fußabdruck hinterlässt. Der Lock eines gecrashten Halters stirbt mit seinem Prozess, sodass seine Session sofort wieder beschreibbar ist, während ein lebender, aber verklemmter Halter Writer blockiert, bis sein Prozess endet (unter POSIX verwirkt das Entfernen der Lock-Datei diesen Ausschluss; der Release selbst entfernt sie nie). Advisorisches `flock` ist auf manchen Netzwerk-Dateisystemen (NFSv3) unzuverlässig, und der Windows-Semaphore-Name gilt pro Login-Session.
- **POSIX-Materialisierung erfordert Hardlink-Unterstützung** — das erste Append verwendet `link()`, sodass Same-ID-Races fehlschlagen statt ein committetes Log zu überschreiben; Windows verwendet Write-Through-Rename ohne Ersetzen.
- **POSIX-Schreibvorgänge erfordern das passende vorgefertigte System-Addon** — [`node-addon-system`](../../../native/system/README.de.md) liefert asynchrones flock ohne Consumer-seitige Kompilierung. Ein fehlendes Addon lehnt die Write-Ownership ab; Windows behält seine Semaphore-Implementierung.

<a id="dev-note"></a>
### Dev-Notiz

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
