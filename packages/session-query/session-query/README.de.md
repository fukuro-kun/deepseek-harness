---
description: "Der einheitliche Session-Verlaufsabfragedienst für Consumers und Backend-Autoren: exakte Reads, Beziehungs-Traces und provider-unabhängige Filter über live und durable Session-Logs."
kind: "package-reference"
---

# @deepseek-ai/dsh-session-query

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

`dsh-session-query` lässt Anwendungscode Session-Verläufe auflisten, filtern, lesen und durchsuchen, begrenzten Event-Kontext prüfen und Session- oder Event-Beziehungen verfolgen. Reads bevorzugen live Sessions gegenüber persistierten Kopien und geben losgelöste Klone aus einer konsistenten Beobachtung zurück. Exakte Reads, Filter und Traces funktionieren mit jeder unterstützten Storage-Konfiguration; gerankte Volltextsuche erfordert ein Backend wie `dsh-session-query-sqlite`. Verwenden Sie es, wenn Anwendungscode programmgesteuerten Zugriff auf den dem Modell präsentierten Verlauf benötigt.

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

Verwenden Sie `ctx.sessionQuery` aus Anwendungscode, wenn Sie Session-Verläufe lesen oder durchsuchen müssen, ohne den Session-Service oder ein Storage-Backend direkt anzufassen. Der Service wird von einem konkreten Backend-Plugin bereitgestellt — die ausgelieferte Komposition mountet `@deepseek-ai/dsh-session-query-sqlite` ([README](../session-query-sqlite/README.de.md)) — daher wird dieses Paket nie allein gemountet. Sobald ein Backend komponiert ist, steht alles Folgende auf `ctx.sessionQuery` zur Verfügung.

### Was Sie tun können

| Operation | Was Sie erhalten |
|---|---|
| `listSessions()` | Jede logische Session, neueste zuerst, mit `live`- und `persisted`-Verfügbarkeitsflags |
| `readSession(id)` | Das vollständige replay-validierte rohe Event-Log, ohne die Session live zu machen |
| `filterSessions(filters)` | Sessions, die UND-verknüpfte Metadaten- und Verfügbarkeitsprädikate erfüllen |
| `filterEvents(id, filters)` | Semantische Event-Dokumente, die Metadaten- und Literaltext-Prädikate erfüllen |
| `readTitleSnapshots(ids)` | Der neueste gefoldete Titel pro Session, gebunden an seinen Quell-Header |
| `listEvents(id)` / `readSurface(id)` | Leichtgewichtige Per-Event-Records oder die vollständige aktuelle Modell-Oberfläche |
| `readEvent(request)` | Ein vollständiges Event plus ein begrenztes Roh-Log-Fenster darum herum |
| `traceSession(id)` | Die bekannte Vorfahrenkette und rekursive Nachfahrenbäume |
| `traceEvent(request)` | Die positionellen Ersetzungen eines Events und zitierte Quell-Event-Beziehungen |
| `searchSessions(request)` / `searchEvents(request)` | Volltext-Suchseiten, implementiert vom gemounteten Backend |

Body-freie Records legen nur `SessionHeader.isSeeded` offen. Reads, die Event-Bodies zurückgeben (`readSession`, `readSurface`, `readEvent`), und zurückbehaltene `SessionObservation`-Werte tragen außerdem den exakten `inheritedEventCount`, sodass Aufrufer geerbte und eigene Events unterscheiden können, ohne einen Schnitt aus dem Log abzuleiten.

### Filter

`SessionResultFilter` grenzt Sessions nach id, nullablem cwd, Erstellungszeitbereich, nullablem Parent oder Quellverfügbarkeit ein; `SessionEventResultFilter` grenzt Events nach seq-/Zeitbereich, Event-Typ, Oberfläche oder Literaltext ein. Filterarrays werden UND-verknüpft und Listenwerte innerhalb einer Klausel ODER-verknüpft; leere Listenwerte treffen nichts, Bereiche sind inklusiv, und fehlerhafte Bereiche oder unbekannte Closed-Union-Werte schlagen mit `SESSION_QUERY_INVALID_FILTER` fehl.

Die Textklausel ist ein literalen, groß-/kleinschreibungsunabhängiger, whitespace-flexibler Scan des extrahierten semantischen Textes — keine Volltextabfrage. Verwenden Sie sie für beliebige Substring-Treffer; verwenden Sie die Suchmethoden des gemounteten Backends, wenn Sie gerankte Volltextergebnisse benötigen.

### Konfiguration

Die geerbten Stellschrauben werden über die Config des gemounteten Backends gesetzt:

| Feld | Standard | Bedeutung |
|---|---|---|
| `readWindowMax` | `50` | Maximale `before`/`after`-Roh-Events, die `readEvent` akzeptiert |
| `persistedReadConcurrency` | `4` | Gleichzeitige Persisted-Log-Reads in einem Batch-Titel-Read |
| `preparedSessionCacheSize` | `5` | Für Wiederverwendung über `observeSession`-Reads zurückbehaltene kalte Prepared-Session-Beobachtungen |

### Fehler und Wiederherstellung

Fehler sind mit einem stabilen `SessionQueryError.code` typisiert. Diejenigen, denen Sie begegnen werden: `SESSION_QUERY_SESSION_NOT_FOUND`, wenn eine id fehlt; `SESSION_QUERY_SOURCE_CONFLICT`, wenn live und persistierte Beobachtungen einer Session bei unveränderlichen Headern auseinanderlaufen; `SESSION_QUERY_PERSISTENCE_FAILED`, wenn die gemountete Persistenz unlesbar ist; `SESSION_QUERY_CORRUPT_SESSION`, wenn ein durable Record die Session-Validierung nicht besteht; und `SESSION_QUERY_INVALID_SURFACE`, wenn ein geladenes Log den Surface-Vertrag bricht. Reads auf eine bekannte live Session konsultieren die Persistenz nie, sodass ein ausfallendes Backend den aktuellen In-Memory-Verlauf nicht unlesbar machen kann.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter dem Service und verweist auf den Code, der sie umsetzt; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) abgedeckt.

### Designphilosophie

Der Service baut auf einer Trennung und drei Verpflichtungen auf:

- **Live-bevorzugtes logisches Korpus.** Jeder Read löst eine konsistente Beobachtung auf: live `ctx.sessions` gewinnt, optionales `ctx.sessionPersistence` füllt den Rest, und konfliktierende unveränderliche Header schlagen fehl statt zu mergen.
- **Losgelöste Ergebnisse.** Alle zurückgegebenen Header, Events und Records sind Klone; nichts legt live State oder eine zurückbehaltene Subscription offen.
- **Exakte Reads konkret, Suche abstrakt.** Reads, Filter und Traces werden hier einmal implementiert; die zwei Volltextmethoden sind die einzige abstrakte Oberfläche, die ein Backend besitzt.
- **Ein kanonischer Surface-Fold.** `listEvents`, `readSurface` und `traceEvent` validieren das gesamte Log mit demselben `dsh-session`-Fold, sodass Suche und Traces mit der Modell-Verlaufsableitung übereinstimmen.

Die Entscheidungshistorie lebt in der [Entscheidung zum einheitlichen Service](../../../.agents/notes/archived/architecture/2026-07-23-unified-session-query-service.md), der [Tracing-Notiz](../../../.agents/notes/archived/feature/2026-07-13-session-query-tracing.md) und der [SQLite-Provider-Notiz](../../../.agents/notes/archived/feature/2026-07-10-sqlite-session-query-provider.md).

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Service-Definition: die abstrakte `SessionQueryEngine`, konkrete Reads, Config-Validierung |
| [`src/corpus.ts`](src/corpus.ts) | Live-bevorzugte Korpus-Auflösung, optionale Persistenzbindung, Batch-Projektionen |
| [`src/observation.ts`](src/observation.ts) | Live-bevorzugte Punktbeobachtungen mit einem begrenzten, revisionsbasiertem Prepared-Session-Cache |
| [`src/cold-read.ts`](src/cold-read.ts) | Handle-basierter kalter Log-Read mit In-Memory-Closern für unterbrochene Turns |
| [`src/types.ts`](src/types.ts) | Öffentliche Records, Filter, Requests und Seitentypen |
| [`src/config.ts`](src/config.ts) | Geerbte Config und die geschlossene `SessionQueryError`-Taxonomie |
| [`src/filters.ts`](src/filters.ts) | Provider-unabhängige Prädikate und der Literaltext-Scan |
| [`src/extraction.ts`](src/extraction.ts) | First-Party-Extraktion semantischen Textes pro Event-Typ |
| [`src/documents.ts`](src/documents.ts) | Surface-bewusste semantische Dokumentprojektion |
| [`src/tracing.ts`](src/tracing.ts) | Einmaliges Session-Lineage- und Event-Beziehungs-Tracing |
| [`src/sources.ts`](src/sources.ts) | Kompatibilitätsprüfung unveränderlicher Header |
| — | Es wird kein Runtime-Invariant-Begleiter veröffentlicht; Abfrageergebnisse sind unveränderliche Pro-Call-Projektionen, deren Lineage und Event-Beziehungen beim Aufbau validiert werden; der Service hält keinen beobachtbaren Ergebniszustand. |

### Korpus-Auflösung

`SessionCorpus` bindet optionales `ctx.sessionPersistence` über einen fiber und löst jeden Read live-first auf: ein bekanntes live Ziel wird gesnapshottet, ohne die Persistenz zu konsultieren; andernfalls wird die Session aufgelistet, über einen kurzlebigen Read-Handle vollständig gelesen und vor dem Klonen erneut auf eine live Anbindung geprüft. Ein kaltes Log, dessen Schreiber mitten im Turn abgestürzt ist, wird im Speicher mit `interruptedTurnClosers` ausgeglichen — die Persistenz wird durch einen Read nie mutiert. Header-Kompatibilität wird zwischen aufgelisteten und geladenen Beobachtungen geprüft. Batch-Titel-Reads führen eine Metadaten-Auflistung und nebenläufigkeitsbegrenzte Reads aus, isolieren Per-Session-Fehler, während eine Abbruch den gesamten Batch ablehnt.

### Beobachtungscache

`observeSession` baut Punktbeobachtungen ohne Auflistungs-Preflight. Eine live Beobachtung fixiert ihren Schnitt als aktuelle Log-Länge und materialisiert `events` erst beim ersten Read, sodass Header-, Cursor- oder nur-projektionsartige Consumers das Log nie kopieren; das Log wird nur appended, sodass ein später erster Read immer noch genau dieses Präfix liefert. Der kalte Pfad führt zuerst ein `stat` auf die gespeicherte Session aus und konsultiert dann einen eigenen begrenzten Cache, keyed nach Persistenzinstanz und `stat`-Revision: eine unveränderte Revision verwendet die wiederhergestellte, nicht veröffentlichte Session erneut, ohne das Log neu zu lesen; eine geänderte Revision oder eine ersetzte Persistenzinstanz lädt über den Handle-Seam neu und ersetzt den Eintrag. Der Cache hält `preparedSessionCacheSize` Einträge mit least-recently-used-Eviction; Einträge, die von aktiven Beobachtungs-Leases gepinnt werden, werden nie evictet, und eine Session, die mitten im Read live geht, versucht den live Pfad erneut.

### Reads und Traces

`readSession` replayt das Log durch `Session.create`, um die resume-Validierung wiederzuverwenden. `readSurface`, `listEvents` und `traceEvent` teilen einen `foldSurface`-Durchlauf, der Events als `current`, `shadowed` oder `log-only` klassifiziert und nullbasierte, lückenlose seqs, Surface-Marker-Eignung sowie Ersetzungs- oder Zitationsintegrität validiert; jede Verletzung schlägt mit `SESSION_QUERY_INVALID_SURFACE` fehl. Traces sind einmalig: Session-Lineage liest das Korpus einmal und geht Parents und Nachfahrenbäume deterministisch durch; Event-Traces folgen positionellen Ersetzern bis zum finalen Knoten und halten zitierte Quell-Event-Links nicht-transitiv.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der paketweite Vertrag nicht ausreicht. Sie bewegen sich vom gemeinsamen Abfrage-Vokabular zum konkreten Backend und zur Entscheidungsevidenz.

- [Session-Query-Subsystem-Referenz](../../../docs/subsystems/session-query.de.md) — der vollständige typbasierte Vertrag: Records, Filter, Suchseiten, Lineage, begrenzte Reads und Fehler.
- [dsh-session-query-sqlite](../session-query-sqlite/README.de.md) — das ausgelieferte Volltext-Backend und sein Index-Lebenszyklus.
- [dsh-tool-session-query](../tool-session-query/README.de.md) — der modellseitige Consumer, der auf diesem Service aufbaut.
- [Session-Query-Beziehungs-Tracing](../../../.agents/notes/archived/feature/2026-07-13-session-query-tracing.md) — Trace-Semantik und die Validierungsgrenze.
- [SQLite-FTS5-Session-Suche](../../../.agents/notes/archived/feature/2026-07-10-sqlite-session-query-provider.md) — wie die Suchoberfläche implementiert und abgeglichen wird.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da der vertrauenswürdige Abfrageservice den Aufrufern nur geklonte Records bereitstellt und nichts Modellseitiges registriert.

#### KV-Cache-Effekt

Keiner; dieses Paket assembliert oder sendet keinen Provider-Request.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Einschränkungen definieren, wann dieses Paket schlecht passt oder besondere betriebliche Aufmerksamkeit benötigt. Sie sind aktuelle Paket-Constraints, kein Aufgaben-Backlog.

- **Keine Aufrufer-Autorisierung** — dies ist vertrauenswürdige kontextweite Infrastruktur; ein Modell-Tool oder eine UI muss einschränken, welche Sessions sein Aufrufer einsehen darf.
- **Kein Provider-Koordinator oder Fallback** — der Service ist über die Suche abstrakt, daher muss eine Komposition ein konkretes Backend mounten; es gibt keine Search-Provider-Registry oder Fallback-Implementierung.
- **Exakte Reads replayen ganze Logs** — `readSession`, `readSurface`, `filterEvents` und Event-Traces laden und validieren das vollständige logische Log, sodass sehr große Verläufe pro Call die volle Inspektion zahlen; `listSessions` bleibt leichtgewichtig.
- **Literaltext-Scan, keine Volltextsuche** — der `text`-Filter scannt extrahierte Dokumente mit einem regulären Ausdruck und rankt nicht; gerankte Suche erfordert das gemountete Backend.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: offene Designfragen und Richtungen, die nicht entschieden sind. Sie ist explizit nicht autoritativ — ausgeliefertes Verhalten, Einschränkungen und akzeptierte Begründungen leben in den Abschnitten oben, dem Paketcode und den verlinkten Agent Notes.

#### Zukunft: Extractor- und Search-Provider-Registries

Rekursive Traversierung über zitierte Quell-Events, Extractor- und Search-Provider-Registries sowie zusätzliche modellseitige Oberflächen sind zurückgestellt; das [tool-session-query-README](../tool-session-query/README.de.md) dokumentiert die aktuelle Consumer-Oberfläche.

</details>
