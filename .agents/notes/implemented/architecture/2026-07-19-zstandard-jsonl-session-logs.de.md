# Agent Note: Zstandard-JSONL-Session-Logs
[English](2026-07-19-zstandard-jsonl-session-logs.md) | [中文](2026-07-19-zstandard-jsonl-session-logs.zh.md) | Deutsch

Status: implemented


## Problem

Das JSONL-Persistence-Backend hält jedes `SessionEvent` wortgetreu fest, einschließlich Assistant-Settlements mit eingebetteten Model-Streams. Rohtext macht Logs inspizierbar, verbraucht aber Storage und I/O für wiederholte JSON-Keys und Modelltext. Die Kompression muss die bestehende append/fsync-Commit-Grenze, kollisionssichere erste Materialisierung, Crash-Reparatur und das Metadaten-only-Listing bewahren; das Neuschreiben einer ganzen komprimierten Datei nach jedem Turn würde diese Eigenschaften aufgeben.

Die Kodierung muss an der Deployment-Grenze ebenfalls explizit bleiben. Snapshot-Fixtures und externe Zeilenleser benötigen rohes JSONL, während ein Backend nicht sicher zwischen komprimierten und rohen Artifacts in einem Root raten oder Pre-Release-Session-Daten still migrieren kann.

## Entscheidung

### Konfiguration und Suffix-Ownership

`dsh-session-persistence-jsonl` akzeptiert `compression?: 'zstd' | 'none'` und löst Weglassen explizit zu `'zstd'` auf. Zstandard-Artifacts enden auf `.jsonl.zstd`; `'none'` behält die newline-delimitierte UTF-8-`.jsonl`-Darstellung. Innerhalb beider konfigurierten Suffixe verwendet v0 das suffixlose `session.jsonl[.zstd]` und jede positive Format-Generation das kleingeschriebene `session.vN.jsonl[.zstd]`. `SessionLocation.kind` bleibt `'jsonl'`, weil beide Kodierungen dasselbe logische Record-Format tragen. Session-Format-Migration nutzt das konfigurierte volle Suffix und eine gemeinsame logische Kette, sodass Kompression weder Generation-Auswahl noch Publication verzweigt.

Jeder Persistence-Root gehört genau einer Kodierung. Ein einmaliger Discovery-Preflight lehnt jedes gegensätzliche Suffix ab, und gezielte Load-, Live-Adoption-, Listing- und Materialisierungspfade wiederholen die relevante Suffix-Prüfung nach einem anfangs leeren Preflight. Der Fehler nennt das inkompatible Artifact und verweist das Deployment auf die passende Konfiguration oder einen separaten Root. Es gibt keine Kompressionskonvertierung, kein Dual-Read, kein Dual-Write und keinen Extension-basierten Fallback; logische Versionsmigration bleibt innerhalb des konfigurierten Suffix, bewahrt die Source-Generation und veröffentlicht ausschließlich den finalen version-benannten Nachfolger.

### Frame- und Write-Pfad

Das komprimierte Artifact ist eine Standard-Konkatenation unabhängiger [Zstandard-Frames](https://datatracker.ietf.org/doc/html/rfc8878): ein gechecksummter Frame mit exakt der Header-Zeile, gefolgt von einem gechecksummten Frame für jeden durable Append-Batch. Normale Loop-Batches sind Turn-Commits, sodass Frame-Grenzen den bestehenden Persistence-Checkpoint bewahren, ohne die Storage-Schicht von Turn-Event-Typen abhängig zu machen.

Die Kompression nutzt Nodes eingebaute [`zstdCompress`- und `zstdDecompress`](https://nodejs.org/download/release/v22.19.0/docs/api/zlib.html)-Funktionen, verfügbar ab dem Node-22.19-Floor des Repositories. Das Backend aktiviert `ZSTD_c_checksumFlag`, akzeptiert ansonsten Nodes Defaults und stellt weder einen Compression-Level-Regler noch eine neue Dependency bereit. Die API ist von Node als experimentell markiert, daher prüft das Node-22.19-, -24- und -26-Kompatibilitäts-Gate exakt diese Helper.

Die erste Materialisierung komprimiert die zwei initialen Frames vor dem Öffnen der temporären Datei, schreibt und `fsync`t diese dann. POSIX veröffentlicht sie über einen kollisionssicheren Hardlink und Directory-`fsync`; Windows veröffentlicht sie ersetzungsfrei über `MoveFileExW(..., MOVEFILE_WRITE_THROUGH)`. Spätere Batches werden vor dem Öffnen des Ziels komprimiert und am EOF angehängt. Ein abgefangener Write- oder File-Sync-Fehler schließt den Append-Handle, öffnet das Log read/write erneut, trunkiert auf die vorherige Bytelänge, synct das Rollback und wirft erneut, damit der Coordinator den unveränderten Batch auf beiden Plattformen wiederholen kann.

### Read, Listing und Crash-Recovery

Ein Frame-Grenzen-Scanner liest die Standard-Magic, variable Header-Felder, Block-Header und Payload-Größen sowie den optionalen Checksum-Trailer. Er interpretiert keine komprimierten Blöcke. Vollständige Frames werden unabhängig checksum-validiert und durch die [Large-Session-Restore-Pipeline](../../archived/architecture/2026-08-05-large-session-jsonl-restore-pipeline.md) geleitet, die Decoder-Wiederverwendung, kooperatives Yielding und inkrementelles JSONL-Scannen besitzt. Ein Checksum-/Decompression-Fehler in einem vollständigen Frame, ein malformed Complete-Frame-JSONL-Tail oder eine invalide Frame-Struktur ist Korruption und wird abgelehnt.

Das Listing liest in begrenzten Chunks nur, bis der erste vollständige Frame verfügbar ist, validiert und dekomprimiert diesen Header-Frame und liest nie einen Event-Frame. Der dedizierte Header-Frame bewahrt daher das Metadaten-only-Listing selbst für sehr große Session-Logs.

EOF innerhalb des letzten Frames ist ein Torn Tail. Der Frame gehört zu einem Append, der nie aufgelöst wurde, sodass keiner seiner Records als durable bestätigt wurde: Die Reparatur trunkiert ab dem Startbyte dieses Frames, behält alle vorherigen vollständigen Frames und hängt die synthetischen Tool-, Step- und Turn-Closer des Coordinators als einen neuen gechecksummten Frame an ([Export- und Pre-Release-Trims](../../archived/simplification/2026-08-27-persistence-export-and-pre-release-trims.md) besitzt das Streichen des früheren Partial-Plaintext-Salvage).

### Consumers und Verifikation

Die CLI-, ACP- und Stdio-App-Bundles stellen symmetrische `persistenceCompression`-Passthrough-Konfiguration bereit. Die Web-Host-Assembly und gewöhnliche App-Kompositionen lassen die Option weg und nutzen den komprimierten Default. Snapshot-Recording- und -Replay-Kompositionen wählen explizit `'none'`, weil committete Fixtures rohe JSONL-Inputs für Replay und Normalisierung sind.

Die geteilten Persistence- und Coordinator-Contracts laufen gegen beide Kodierungen. Backend-Tests decken Standard-Framing- und Checksum-Interoperabilität, Header-only-Listing, Append-Rollback, Encoding-Mismatch-Ablehnung, Complete-Frame-Korruption und Final-Frame-Tears über Header, Blöcke und Checksum-Trailer ab. Default-Runtime-, Built-Bin-, Headless-, ACP- und Python-Smokes prüfen das komprimierte Suffix und die Zstandard-Magic oder dekodieren den Header; Raw-Content-Tests opten explizit aus.

## Erwogene Alternativen

- **Ein Frame pro JSONL-Record** — abgelehnt, weil er Frame-Header und Checksums für hochvolumige Chunk-Events vervielfacht und eine physische Grenze setzt, die nichts mit dem durable Append-Batch zu tun hat.
- **Einen ganzen komprimierten Stream nach jedem Append neu schreiben** — abgelehnt, weil die Kosten mit der Loggröße wachsen und Replacement das append/fsync-Rollback und die etablierte kollisionssichere Materialisierungsmechanik aufgeben würde.
- **Einen Streaming-Kompressor über Appends verwenden** — abgelehnt, weil ein unterbrochener Encoder-State keine unabhängig gechecksummten Append-Einheiten hinterlässt, was begrenztes Listing und Frame-Start-Reparatur verkompliziert.
- **Eine externe native Zstandard-Dependency hinzufügen** — abgelehnt, weil der unterstützte Node-Floor den benötigten Codec bereits bereitstellt; ein weiteres natives Artifact würde Installations- und Executable-Packaging-Risiko erhöhen, ohne ein benötigtes Verhalten zu liefern.
- **Compression-Level exposen oder rohes JSONL als Default behalten** — abgelehnt, weil es keine Deployment-Evidenz für eine zweite Tuning-Policy gibt, während `'none'` den zeilenlesbaren Pfad für Fixtures und Integrationen bewahrt, die ihn brauchen.

## Konsequenzen

- Gewöhnliche Session-Roots speichern `.jsonl.zstd` und bewahren Append-only-, Fsync-, Rollback- und Interrupted-Turn-Recovery-Semantik.
- Rohes JSONL bleibt eine bewusste Konfiguration, doch ein Kodierungswechsel erfordert einen frischen/separaten Root oder die Wahl des Modus, der zu bestehenden Artifacts passt.
- Ein Frame pro durable Batch fügt begrenzten Framing-/Checksum-Overhead hinzu und erlaubt Header-only-Listing plus Reparatur ab einer exakten Append-Grenze.
- Externe Tools müssen konkatenierte Zstandard-Frames verstehen oder Raw-Mode-Artifacts konsumieren; generisches One-Shot-Node-Dekomprimieren liest nur den ersten unabhängigen Frame, daher gehen Backend-Reads Frames durch die [Restore-Pipeline](../../archived/architecture/2026-08-05-large-session-jsonl-restore-pipeline.md).
- Die Implementierung hängt von Nodes experimenteller eingebauter Zstandard-API ohne npm-Dependency ab; das Supported-Version-Kompatibilitäts-Gate macht Drift sichtbar.
