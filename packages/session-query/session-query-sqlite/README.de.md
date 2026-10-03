---
description: "Das SQLite-FTS5-Volltextsuche-Backend für Session-Verläufe, für Deployments und Maintainer, die Volltextsuche über dem Query-Service auswählen, konfigurieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-session-query-sqlite
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Verwende dieses Paket, um gerankte SQLite-FTS5-Suche über den Session-Verlauf hinzuzufügen — sowohl über Sessions hinweg als auch innerhalb einer Session, mit Cursor-Pagination. Es indexiert Live- und persistierte Verläufe in einer separaten abgeleiteten Datenbank, sodass Suchen den aktuellen Stand widerspiegeln, ohne den Session-Persistenz-Speicher zu verändern. Exakte Reads, Filter und Traces bleiben über dieselbe Query-API verfügbar. Die Suche ist in ausgelieferten Kompositionen opt-in; `openAt` steuert, ob der Index beim Start, bei der ersten Suche oder nie geöffnet wird. Ergebnisse matchen Tokens und Phrasen statt beliebiger Teilstrings, und jeder Index-Pfad hat genau einen Prozess-Eigentümer.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Mounte dieses Paket, wenn eine Komposition gerankte Volltextsuche über den Session-Verlauf braucht — etwa die Web-Content-Suche oder die `/resume`-Suche nach früherer Arbeit. Der übliche Weg ist explizit: das Plugin mounten, ihm einen dedizierten Datenbankpfad geben und `ctx.sessionQuery.searchSessions` oder `searchEvents` aus dem Code aufrufen.

### Wann es die richtige Wahl ist

Wähle es, wenn du Volltext-Recall über frühere Sessions mit Ranking und Paging willst. Wähle es zusammen mit `dsh-session-query` und dem Session-Service; ein Persistenz-Backend ist optional, aber empfohlen, damit persistierte Verläufe nach Restarts durchsuchbar bleiben. Zeige `path` nicht auf die Session-Persistenz-Datenbank — dieses Paket besitzt einen separaten abgeleiteten Index.

### Minimale Konfiguration

```yaml

- name: '@deepseek-ai/dsh-session'

- name: '@deepseek-ai/dsh-session-query-sqlite'

  config:

    path: /absolute/path/to/session-search.db

```

| Feld | Default | Bedeutung |

|---|---|---|

| `path` | erforderlich | Dedizierter SQLite-Pfad des abgeleiteten Index oder `:memory:`; fehlende Pfade werden auf POSIX nur für den Eigentümer erstellt |

| `openAt` | `startup` | `startup` öffnet bei Aktivierung; `first-search` verschiebt das SQLite-Modul bis zur ersten Suche; `never` deaktiviert die Volltextsuche, während geerbte Reads verfügbar bleiben |

| `journalMode` | `wal` | `wal`, `delete`, `truncate` oder `persist` |

| `defaultLimit` | `20` | Seitengröße, wenn ein Request `limit` auslässt |

| `maxLimit` | `100` | Größte akzeptierte Seitengröße eines Requests |

| `snippetChars` | `240` | Maximale Snippet-Länge in Unicode-Codepoints |

| `readWindowMax` | `50` | Maximale `before`/`after`-Rohereignisse für das geerbte `readEvent()` |

| `persistedReadConcurrency` | `4` | Gleichzeitige Reads persistierter Logs für geerbte Batch-Reads |

| `preparedSessionCacheSize` | `5` | Kalte prepared-Session-Beobachtungen, die der geerbte `observeSession`-Reader zur Wiederverwendung behält |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-session-query-sqlite) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Suchverhalten

`searchSessions` durchsucht den gesamten Korpus und gruppiert Ergebnisse nach dem stärksten matchenden Event jeder Session; `searchEvents` durchsucht eine logische Session. Queries sind literale Phrasen: sie werden getrimmt und whitespace-normalisiert, und FTS5-Syntax wie Anführungszeichen, `OR`, `NEAR` und `*` wird als Daten behandelt, niemals als ausführbare Query-Syntax. Metadatenfilter (Session-ID, cwd, created-at, parent, Verfügbarkeit, Event-seq/-zeit/-typ/-surface) verengen die Ergebnisse vor dem Ranking. Standardmäßig sind alle `current`-, `shadowed`- und `log-only`-Events durchsuchbar; ein Surface-Filter verengt die Auswahl.

Das Ranking ist deterministisch: mehr tatsächliche FTS5-Highlight-Match-Spans zuerst, dann kürzere Dokumente; Event-Zeit, Session-ID und seq entscheiden Gleichstände. Ergebnisse tragen Klartext-Snippets, begrenzt auf `snippetChars` Unicode-Codepoints, ohne provider-spezifischen numerischen Score. Seiten setzen sich über einen opaken `SessionSearchCursor` fort, der an den exakt normalisierten Request gebunden ist; ein Cursor wird stale, wenn sich sein relevanter Korpus ändert (`SESSION_QUERY_STALE_CURSOR`) — ein session-interner Cursor überlebt Änderungen an unverwandten Sessions, ein Cross-Session-Cursor nicht.

Der `unicode61`-Tokenizer matcht Tokens und Phrasen, nicht beliebige Teilstrings: `AI` matcht nicht das Token `BRAID`. Verwende `ctx.sessionQuery.filterEvents()` mit einer `text`-Klausel, wenn ein literaler, whitespace-flexibler Substring-Scan nötig ist.

### Wann Suche verschieben oder deaktivieren

Mit `openAt: first-search` aktiviert sich der Service, ohne `node:sqlite` zu importieren oder den Index zu öffnen, und verschiebt SQLites Experimental-Warnung bis zur ersten tatsächlichen Suche; eine ungültige Datenbank lässt diese erste Suche fehlschlagen statt der Service-Aktivierung. Mit `openAt: never` ist die Volltextsuche für das Deployment aus: `searchSessions` und `searchEvents` schlagen mit `SESSION_QUERY_SEARCH_DISABLED` fehl, bevor irgendeine Request-Normalisierung läuft, während jeder geerbte exakte Read, Filter und Trace weiter funktioniert. Requests, die das Compiled-Predicate-Budget (14 kombinierte Prädikate über Sessions hinweg, 13 innerhalb einer Session) oder SQLites portables Limit von 32.766 Bindings überschreiten, schlagen mit `SESSION_QUERY_INVALID_FILTER` fehl, bevor das Statement vorbereitet wird.

### Fehler und Recovery

Typisierte `SessionQueryError`-Fehler tragen stabile Codes: `SESSION_QUERY_SEARCH_DISABLED`, wenn Suche konfiguriert aus ist; `SESSION_QUERY_INDEX_FAILED`, wenn der Index nicht öffnen oder reconciliieren kann; `SESSION_QUERY_SESSION_NOT_FOUND`, wenn ein Suchziel fehlt; `SESSION_QUERY_STALE_CURSOR`, wenn sich der Korpus zwischen Seiten geändert hat — den kompletten Suchaufruf wiederholen; und `SESSION_QUERY_INVALID_CURSOR` für einen Cursor, der nicht zu diesem Request gehört. Cancellation wird zwischen synchronen SQLite-Aufrufen beachtet; ein bereits auf dem JavaScript-Thread laufendes Statement lässt sich nicht unterbrechen.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter dem Backend und zeigt auf den Code, der sie umsetzt; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) abgedeckt.

### Designphilosophie

Das Backend steht auf einer Trennung und drei Zusagen:

- **Abgeleiteter Index, niemals der Quellspeicher.** Die FTS-Zeilen liegen in einer dedizierten wegwerfbaren Datenbank; die Session-Persistenz-Datenbank wird hier nie geöffnet.
- **Live-bevorzugte Beobachtung.** Eine serialisierte Zustandsmaschine vergleicht Persistenz-Snapshot-Revisionen, liest nur neue oder geänderte Logs über kurzlebige Read-Handles und reconciliert in einer Transaktion, sodass eine Suche den neuesten stabilen Stand widerspiegelt.
- **Generationsgebundene Cursor.** Jede Korpus-Änderung erhöht eine Generation; Cursor tragen die Generation ihrer Erstellung und schlagen eher stale fehl, als eine verschobene Seite zurückzugeben.
- **Literale Phrasen als Daten.** Caller-Query-Text wird in eine einzige FTS5-Phrase gequotet, sodass Query-Syntax inert bleibt, und reservierte Highlight-Marker werden vor dem Indexieren aus Dokumenten entfernt.

Die Design-Historie liegt in der [SQLite-FTS5-Session-Search-Note](../../../.agents/notes/archived/feature/2026-07-10-sqlite-session-query-provider.md) und der [Unified-Service-Entscheidung](../../../.agents/notes/archived/architecture/2026-07-23-unified-session-query-service.md).

### Quellkarte

| Datei | Rolle |

|---|---|

| [`src/index.ts`](src/index.ts) | Service: Config, openAt-Lifecycle, serialisierte Reconciliation, Query-Ausführung, Cursor |

| [`src/query.ts`](src/query.ts) | Request-Normalisierung, parametrisierte Prädikate, Snippets, Prädikat- und Binding-Budgets |

| [`src/schema.ts`](src/schema.ts) | Datenbank-Schema, Application-ID-Eigentum, In-Place-Reset, Datei-Erstellung nur für den Eigentümer |

| — | Es wird kein Runtime-Invarianten-Companion veröffentlicht; Reconciliation, Cursor-Generationen und abgeleitetes Index-Eigentum werden an jeder serialisierten Query-Grenze validiert. |

### Index-Lifecycle

Persistierte FTS-Zeilen liegen in einer dedizierten abgeleiteten Datenbank und überleben Restarts; Live-Sessions nutzen verbindungslokale TEMP-Tabellen, die die dauerhafte Basis derselben Session überdecken und sie wieder freigeben, sobald sich der Live-Eigentümer abmeldet. Beide Tabellen behalten den exakten geerbten Schnitt im numerischen `seed_length`; rekonstruierte Header geben nur `isSeeded` preis, während der Schnitt an Live-Fingerprints und persistierten Quell-Revisionen teilnimmt. Jede Suche führt eine serialisierte Beobachtung aus: Persistenz-Snapshots auflisten, pro-Session-Revisionen mit den indexierten Zeilen vergleichen, nur neue oder geänderte Logs über ein Read-Handle lesen (einen unterbrochenen letzten Turn im Speicher ausbalancieren, niemals zurückschreiben), semantische Dokumente extrahieren und die Reconciliation in einer Transaktion committen, bevor die Query läuft. Wiederholte Queries und unveränderte Reopens lesen nichts; beim Wechsel von Stores oder beim Beobachten neuer, geänderter, gelöschter oder extern reparierter Quellen wird bei der nächsten stabilen Beobachtung reconciliert. Quell- oder Transaktionsfehler committen nichts, und die nächste Suche versucht es erneut.

### Schema-Eigentum

Die Datenbank trägt eine Application-ID und Schema-Version 8. Das Öffnen verweigert eine Datei, die einer anderen Anwendung gehört, oder eine kanonische Datenbank, lehnt unbekannte User-Tabellen ab, und nur ein erkanntes inkompatibles abgeleitetes Schema wird in-place zurückgesetzt — eine fremde oder Session-Persistenz-Datenbank wird also nie angefasst. Auf POSIX-Dateisystemen werden fehlende Verzeichnisse und Datenbankdateien nur für den Eigentümer erstellt (`0700` und `0600` vor der Prozess-umask). Genau ein Service in einem Prozess besitzt einen abgeleiteten Index-Pfad; Generationen und TEMP-Shadow-Zustand sind verbindungsgebunden.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Vertrag nicht ausreicht. Sie bewegen sich vom gemeinsamen Query-Service zum typ-level Vertrag und zur Design-Evidenz.

- [Session-Query-Subsystem-Referenz](../../../docs/subsystems/session-query.de.md) — der vollständige typ-level Vertrag, den dieses Backend implementiert.
- [dsh-session-query](../session-query/README.de.md) — die Service-Definition: exakte Reads, Filter und Traces, die dieses Backend erbt.
- [dsh-tool-session-query](../tool-session-query/README.de.md) — der model-facing Consumer, der diese Suchmethoden aufruft.
- [SQLite-FTS5-Session-Search](../../../.agents/notes/archived/feature/2026-07-10-sqlite-session-query-provider.md) — Suchsemantik, Reconciliation und die Tokenizer-Entscheidung.
- [JSONL-Session-Persistenz](../../session/session-persistence-jsonl/README.de.md) — der maßgebliche Session-Store, den dieser wegwerfbare Index beobachtet; halte seine Wurzel getrennt vom Datenbankpfad dieses Pakets.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da das Such-Backend Treffer nur an Aufrufer zurückgibt und nichts Model-facing registriert.

#### KV-Cache-Effekt

Keiner; dieses Paket assembliert oder sendet keinen Provider-Request.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann dieses Paket schlecht passt oder besondere Betriebsaufmerksamkeit braucht. Es sind aktuelle Paket-Constraints, kein allgemeiner SQLite-Vergleich und kein Aufgabenrückstand.

- **Keine Caller-Autorisierung** — dies ist ein vertrauenswürdiger kontext-weiter Service; ein Model-Tool oder eine UI muss ihre eigene Zugriffsrichtlinie durchsetzen.
- **Synchrone Query-Ausführung** — `DatabaseSync` blockiert den JavaScript-Thread während der MATCH-Ausführung und kann ein bereits laufendes Statement nicht unterbrechen.
- **Token-Recall, keine beliebigen Teilstrings** — der `unicode61`-Tokenizer matcht keine Teilstrings innerhalb eines größeren Tokens; für literale Scans `filterEvents()` verwenden.
- **Abgeleiteter Index mit Einzeleigentümer** — jeder Index-Pfad muss genau einem Service in einem Prozess gehören; externe Schreiber und Multi-Prozess-Sharing werden nicht unterstützt.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: offene Designfragen und Richtungen, die nicht entschieden sind. Sie ist ausdrücklich nicht maßgeblich — ausgeliefertes Verhalten, Grenzen und akzeptierte Begründungen liegen in den Abschnitten oben, dem Paket-Code und den verlinkten Agent Notes.

#### Zukunft: alternative Tokenizer und Such-Provider

Die Wahl des `unicode61`-Tokenizers tauscht Substring-Recall gegen Indexgröße und Zwei-Zeichen-Token-Support; die Trigram-Alternative wurde gemessen und verworfen. Ein Wechsel des Tokenizers oder ein zusätzliches Such-Backend würde den indexierten Recall verändern und eine eigene Reconciliation- und Generationsstory erfordern.

</details>
