---
description: "Workspace-autorisierte, model-zugewandte Session-Verlaufstools für Agent-Entwickler und Maintainer, die Suche in früheren Sessions, Tracing und Event-Lesen auswählen, konfigurieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-session-query
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Mit `dsh-tool-session-query` kann ein Model frühere Sessions durchsuchen, Event-Treffer prüfen, Session- oder Event-Beziehungen nachverfolgen und exakte Event-Daten lesen. Die fünf schreibgeschützten Tools liefern cursor-freien Text und erlauben sessionübergreifenden Zugriff nur, wenn das `cwd` der Ziel-Session exakt mit dem des Aufrufers übereinstimmt; Aufrufer ohne `cwd` können nur sich selbst prüfen. Die Suche schließt die Aufrufer-Session aus und fordert das Model auf, die Abfrage einzugrenzen, wenn das Ergebnislimit des Deployments erreicht ist. Das Paket ist opt-in; seine Aktivierung fügt jeder Model-Anfrage eine feste Guidance plus fünf Tool-Schemas hinzu.

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

Dieses Paket mounten, wenn der Agent seine eigenen früheren Sessions durchsuchen und deren Beziehungen und Events prüfen können soll. Der übliche Weg ist explizit: Das Plugin über `ctx.sessionQuery` (gestützt auf `dsh-session-query-sqlite`) mounten und das Model die Tools aufrufen lassen.

### Wann es die richtige Wahl ist

Es ist die richtige Wahl, wenn ein Deployment model-gesteuerten Abruf früherer Arbeit will – etwa ein Coding-Agent, der vor dem Start einer Aufgabe nachsucht, was er in früheren Sessions getan hat. Nicht geeignet ist es, wenn nur programmatischer Abruf nötig ist: `ctx.sessionQuery` selbst bedient Code-Aufrufer ohne die model-zugewandte Schema-, Prompt- und Autorisierungsschicht.

### Konfiguration

| Feld | Standard | Bedeutung |
|---|---|---|
| `maxSearchResults` | `100` | Maximale autorisierte Treffer, die ein Suchaufruf zurückgibt |
| `searchTimeoutMs` | `30000` | Kooperative Deadline für beide Volltext-Suchtools |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-tool-session-query) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Was das Model kann

| Tool | Was das Model erhält |
|---|---|
| `session_search` | Sessions, die eine literale Abfrage erfüllen, gerankt, mit Titel und Best-Match-Auszug; lässt die Aufrufer-Session immer weg |
| `session_event_search` | Events, die eine literale Abfrage innerhalb einer autorisierten Session erfüllen; für die aktuelle Session stoppt es vor dem aufrufenden Schritt |
| `session_trace` | Die autorisierte Vorfahrenkette und der Nachfahrenbaum einer Session; nicht autorisierte Grenzen erscheinen als Marker ohne verborgene ids |
| `session_event_trace` | Die positionellen Ersetzungen eines Events und seine zitierten Quell-Event-Beziehungen |
| `session_event_read` | Ein vollständiges, ungekürztes Event als JSON, plus optionale Zusammenfassungen benachbarter Events |

Die Workspace-Autorität ist konservativ: Sessionübergreifender Zugriff erfordert exakte `cwd`-Gleichheit zwischen Ziel- und Aufrufer-Session, und ein Aufrufer ohne `cwd` kann nur sich selbst prüfen. Angefragte Eltern-ids werden vor der Suche dedupliziert und auf Autorität geprüft; fehlende und workspace-fremde Angaben verhalten sich identisch. Suchergebnisse sind cursor-frei: Ein begrenztes Ergebnis fordert das Model auf, die Abfrage einzugrenzen, und legt niemals Provider-Cursors, Offsets, Seitengrößen oder ein model-steuerbares Limit offen. Zeitstempel an der Tool-Grenze sind zeitzonenqualifiziertes ISO 8601 und werden zu inklusiven Epoch-Millisekunden-Filtern.

### Fehler und Wiederherstellung

Jeder vertrauenswürdige Query-Service-Aufruf durchläuft einen Fehler-Sanitizer: Aufrufer-Cancellation wird exakt bewahrt, Korpus- und Provider-Diagnosen gehen ins interne Log, und unsichere oder nicht druckbare Fehler fallen auf den festen Code `SESSION_QUERY_TOOL_FAILED` und seine Meldung zurück. Lokale Argument-Validierungs- und Autorisierungsfehler behalten ihre präzisen, dem Tool gehörenden Meldungen (`SESSION_QUERY_TOOL_UNAUTHORIZED` für ein Ziel außerhalb des Aufrufer-Workspaces). Das Paket führt keine Byte- oder Zeichen-Trunkierung durch und importiert kein Spill-Backend; Deployments, die begrenzte Inline-Ausgabe brauchen, mounten `@deepseek-ai/dsh-spill-policy`, das überdimensionierten gerenderten Text ersetzen und dabei das vollständige Ergebnis behalten kann.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter den Tools und verweist auf den Code, der sie umsetzt; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) behandelt.

### Designphilosophie

Der Consumer baut auf einer Trennung und drei Verpflichtungen auf:

- **Schmale, schreibgeschützte Tools.** Fünf Tools mit flachen Snake-Case-Schemas, jedes leitet einen Folgeschritt an; kein Cursor, Offset, keine Seitengröße oder model-steuerbares Limit erreicht je das Model.
- **Autorität vom Aufrufer abgeleitet, niemals vom Model.** Die Aufrufer-Identität kommt aus `ToolExecution.exec.agent`; der Workspace ist String-exakte `cwd`-Gleichheit, die mit jedem Ergebnis erneut gegen den beobachteten Header geprüft wird.
- **Ein Sanitizer an der Model-Grenze.** Jeder vertrauenswürdige `ctx.sessionQuery`-Aufruf läuft über die Service-Grenze, die Cancellation bewahrt und Diagnose- sowie Klassifizierungsfehler eindämmt.
- **Kein zweites Trunkierungsformat.** Ergebnisse bleiben vollständig; die generische Spill-Policy ist Eigentümerin der begrenzten Inline-Ausgabe.

Die Designgeschichte steht in der [Agent Note zu den model-zugewandten Session-Query-Tools](../../../.agents/notes/archived/feature/2026-07-24-model-facing-session-query-tools.md) und der [session-search-not-shipped-default-Note](../../../.agents/notes/archived/feature/2026-08-02-session-search-not-shipped-default.md).

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: Config, Prompt-Abschnitt, fünf Tool-Registrierungen |
| [`src/input.ts`](src/input.ts) | Model-Schemas, Argument-Normalisierung, Filter-Konstruktion |
| [`src/workspace-access.ts`](src/workspace-access.ts) | Aufrufer-Identität, Workspace-Autorisierung, Titelzugriff, Lineage-Projektion |
| [`src/service-boundary.ts`](src/service-boundary.ts) | Vertrauenswürdige Aufrufe und model-sichere Fehlerübersetzung |
| [`src/operations.ts`](src/operations.ts) | Die fünf Operations-Workflows |
| [`src/presentation.ts`](src/presentation.ts) | Textergebnis-Rendering und Tool-Call-Cards |

### Operationsablauf

Jeder Executor leitet den Aufrufer ab, normalisiert die Model-Argumente zu Service-Filtern, autorisiert das Ziel (oder die angefragten Eltern-ids) gegen den Aufrufer-Workspace und sammelt Ergebnisse über die Service-Grenze. Beide Suchtools blättern intern über Provider-Cursors, solange die beobachtete Generation gültig bleibt, und stoppen bei `maxSearchResults`; da eine Suche generationsgebundene Provider-Cursors verbraucht, laufen die beiden Suchtools exklusiv zu Geschwister-Tool-Calls, während die drei exakten Trace-/Read-Tools Parallel-Ausführung wählen. Die Lineage-Ausgabe ersetzt nicht autorisierte Vorfahren- und Nachfahrengrenzen durch Marker ohne verborgene Session-id.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn der Paket-Vertrag nicht ausreicht. Sie führen von der Tool-Oberfläche zum darunterliegenden Service, zum Schema-Katalog und zum Design-Nachweis.

- [Generierter Tool-Katalog](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-session-query) — die fünf Tool-Schemas, wie das Model sie sieht.
- [dsh-session-query](../session-query/README.de.md) — der Service, den diese Tools aufrufen.
- [dsh-session-query-sqlite](../session-query-sqlite/README.de.md) — das Volltext-Backend hinter den beiden Suchtools.
- [Session-Query-Subsystem-Referenz](../../../docs/subsystems/session-query.de.md) — der typbasierte Vertrag unter den Tools.
- [Model-zugewandte Session-Query-Tools](../../../.agents/notes/archived/feature/2026-07-24-model-facing-session-query-tools.md) — Workspace-Autorität, cursor-freie Ergebnisse und Spill-Entscheidungen.

-----

<a id="model-experience"></a>
## Model Experience

### System-Prompt

#### Was das Model sieht

Das Model erhält einen festen Guidance-Abschnitt zum früheren Verlauf.

##### Guidance zum früheren Verlauf

```markdown
Use session_search to find relevant work from prior sessions, or session_event_search to search earlier events in one session. Search results are cursor-free and workspace-scoped. Follow a useful hit with session_trace, session_event_trace, or session_event_read when you need lineage, relationships, or exact data.
```

#### Token-Auswirkung

Ein fester, knapper Abschnitt ist bei jeder Anfrage vorhanden, solange das Plugin gemountet ist.

#### KV-Cache-Auswirkung

Präfix-stabil, solange Plugin und Guidance-Text unverändert sind.

### Tool-Schemas

#### Was das Model sieht

Das Model sieht die generierten [`session_search`-, `session_event_search`-, `session_trace`-, `session_event_trace`- und `session_event_read`-Schemas](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-session-query). Suchfilter fügen feste Schema-Tokens hinzu, während Cursors, Workspace-Pfade, Ausgabe-Paginierung und model-steuerbare Ergebnislimits weiterhin fehlen.

#### Token-Auswirkung

Fünf feste, schreibgeschützte Schemas werden bei jeder Anfrage gesendet, solange sie sichtbar sind.

#### KV-Cache-Auswirkung

Präfix-stabil, solange Tool-Sichtbarkeit und -Definitionen unverändert sind.

### Tool-Ergebnisse

#### Was das Model sieht

Jeder erfolgreiche Aufruf gibt einen Klartext-Block aus. Suchergebnisse enthalten Titel und Best-Match-Auszüge; Traces enthalten alle autorisierten Beziehungen; Event-Reads enthalten ungekürztes Ziel-JSON. Die generische Spill-Policy kann überdimensionierten Inline-Text durch ihre Vorschau, den opaken Locator und den Abrufhinweis ersetzen.

#### Token-Auswirkung

Ergebnisse sind datenabhängig und bleiben bis zur Compaction in der protokollierten Tool-History; `maxSearchResults` begrenzt die Trefferzahl.

#### KV-Cache-Auswirkung

Append-only-Ergebnistext folgt auf das wiederverwendbare Anfrage-Präfix und macht frühere Cache-Einträge nicht ungültig.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann das Paket schlecht passt oder besondere Betriebsaufmerksamkeit braucht. Sie sind aktuelle Paket-Einschränkungen, kein Aufgaben-Backlog.

- **Suche mit Limit ohne Fortsetzung** — die Suche liefert höchstens das Deployment-Limit und fordert das Model auf, die Abfrage einzugrenzen, wenn mehr Treffer existieren; es gibt kein Fortsetzungstoken.
- **Konservative Workspace-Identität** — Workspace-Identität ist String-exakte `cwd`-Gleichheit, sodass symlink-äquivalente Pfade keine Autorität teilen.
- **Inline-Payloads ohne Spill-Policy** — eigene Kompositionen ohne die generische Spill-Policy akzeptieren vollständige Trace- und Event-Payloads inline.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: offene Designfragen und Richtungen, die nicht entschieden sind. Sie ist ausdrücklich nicht autoritativ — ausgeliefertes Verhalten, Grenzen und akzeptierte Begründungen stehen in den Abschnitten oben, im Paket-Code und in den verlinkten Agent Notes.

#### Zukunft: breitere Workspace-Semantik

String-exakte `cwd`-Gleichheit ist bewusst konservativ; symlink-bewusste oder kanonische-Pfad-Workspace-Identität würde ändern, welche Sessions Autorität teilen, und ist unentschieden.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Dieser schreibgeschützte Model-Adapter besitzt keine Event- oder veränderliche Datenbeziehung über die Registries hinaus, die die Registrierung bereits validieren.
