---
description: "Session-übergreifende Snapshot-Referenzen und dauerhafter, nicht vertrauenswürdiger Modellkontext, für Benutzer und Maintainer, die ctx.sessionReferenceResolver aktivieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-session-reference

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`dsh-session-reference` ermöglicht einer Konversation, andere Sessions zu referenzieren: Ein Host wandelt eine `@label`-Mention in eine kanonische URI um, und der Service bereitet einen begrenzten, schreibgeschützten Snapshot jeder referenzierten Session als dauerhaften, nicht vertrauenswürdigen Hintergrundkontext für das Modell auf. Die Kandidatensuche ordnet andere Sessions nach Working-Directory-Affinität und beschriftet sie mit ihren letzten Titeln. Snapshots sind nach der Erfassung unveränderlich und tragen eine feste Warnung, die das Befolgen von Anweisungen, Berechtigungsbehauptungen oder Tool-Anfragen darin verbietet. Es ist ein Opt-in-Service für Hosts, die Session-übergreifende Mentions unterstützen; er konsumiert `ctx.sessionQuery` und benötigt kein SQLite-FTS.

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

Aktiviere diesen Service, wenn Hosts einem Benutzer erlauben sollen, eine andere Session zu erwähnen und dem Modell ihren Kontext zu geben. Er funktioniert mit jedem session-query-Backend, weil er den backend-unabhängigen Compact-Checkpoint-Marker konsumiert.

### Mention-Syntax

Eine kanonische Mention ist `@[label](dsh-session:<base64url-encoded-id>)` in Markdown oder die nackte `dsh-session:`-URI; jede JavaScript-String-Session-id durchläuft den Roundtrip exakt. Der Service schreibt Mentions zu lesbarem `@label`-Text in der Nachricht um und gibt die strukturierten Referenzen zurück. Explizite Markdown-Mentions weisen fehlerhafte URIs zurück; leere oder nur aus Satzzeichen bestehende Scheme-Mentions bleiben gewöhnlicher Diskussionstext.

### Was der agent erhält

Auf eine Nachricht, die andere Sessions zitiert, folgt unmittelbar ein `## Referenced sessions`-Snapshot als zweite User-Rollen-Nachricht. Der Snapshot ist nicht vertrauenswürdiger Hintergrund: Die feste Warnung sagt dem Modell, keine Anweisungen, Berechtigungsbehauptungen oder Tool-Anfragen daraus zu befolgen, es sei denn, der aktuelle Benutzer wiederholt sie ausdrücklich. Jede Quell-Vorschau ist unabhängig begrenzt — höchstens `maxReferences` verschiedene Sessions pro Nachricht und ein konfiguriertes oder modellrelatives Budget an serialisierten JSON-Bytes pro Quelle. Die Retention verwirft zuerst ältere Nicht-Checkpoint-Nachrichten, bevor sie den behaltenen Text kürzt; die Aufbereitung schlägt nur fehl, wenn die Referenz auch nach der Retention nicht passt.

Für eine gekürzte Referenz speichert ein optionales spill-Backend die vollständige erfasste Textprojektion unter der Ziel-Session. Eine separate Auslassungsnotiz außerhalb des begrenzten Vorschau-JSON nennt die exakten `omittedMessages` und `omittedBytes`, dann den gespeicherten Locator und den `retrievalHint`, oder ein nicht verfügbares Ergebnis, das fehlenden Speicher von einem fehlgeschlagenen Speichern unterscheidet. Die Notiz ist Teil derselben dauerhaften Kontextnachricht. Vollständige Transkripte tragen dieselbe Warnung vor nicht vertrauenswürdigem Hintergrund und Erfassungsmetadaten, einschließlich `capturedFormatVersion`. Jede Nachricht verwendet JSON-Stringfragmente von höchstens 64 Unicode-Codepoints pro Zeile; dekodiere und verkette ihre Fragmente, um den exakten Text einschließlich der ursprünglichen Zeilenumbrüche wiederherzustellen. Dieses feste Speicherformat hält selbst langen einzeiligen Text über seitenweise Dateilesevorgänge lesbar.

### Sessions zum Referenzieren finden

`listCandidates(agent, query?, limit?)` listet andere Sessions als die des agent auf, filtert ohne Beachtung der Groß-/Kleinschreibung nach id, Working Directory oder dem projizierten Titel und ordnet Sessions im selben Verzeichnis zuerst ein. Jeder Kandidat trägt seinen letzten Titel als Mention-Label und fällt auf die Session-id zurück, wenn der Titel fehlt oder nicht lesbar ist, und meldet, ob sein Working Directory das des anfragenden agent ist, sodass ein Host einen Ort nur dann zeigen kann, wenn er die Zeile unterscheidet. Browser-Consumer rufen dieselbe Suche als `ctx.remote.sessionReferenceResolver.candidates` auf, die jeder Kandidatin ihre kanonische Mention anfügt.

### Konfiguration

| Feld | Standard | Bedeutung |
|---|---|---|
| `maxReferences` | `3` | Maximale Anzahl verschiedener Quell-Sessions in einer aufbereiteten Nachricht; darf `3` nicht überschreiten |
| `candidateLimit` | `50` | Anzahl der an einen Host zurückgegebenen Standardkandidaten |
| `maxReferenceBytes` | automatisch | Explizites Maximum serialisierter JSON-Bytes pro Quelle; überschreibt das automatische Budget exakt |
| `referenceContextFraction` | `0.2` | Anteil am Kontextfenster pro Quelle, von `0` bis `1` |

Das automatische Budget beträgt `max(65536, floor(contextWindow × 4 × referenceContextFraction))` Bytes pro Quelle. Die Modellkontextkapazität wird in Tokens gemessen; vier Bytes pro Token ist eine Größenheuristik, keine exakte Token-Umrechnung. Eine fehlende Route, LLM-Service, adapter oder Kapazität verwendet 64 KiB; andere Fehler beim Nachschlagen von Modellmetadaten und Abbrüche lassen die Aufbereitung fehlschlagen.

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-session-reference) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Design des Service; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) behandelt.

### Designkonzept

Die Aufbereitung liest die aktuelle Oberfläche jeder referenzierten Session genau einmal, wenn die Zielnachricht `agent/pre-step` erreicht. Vorschau und spill verwenden dieselbe erfasste Projektion: direkter User-Text, Assistant-Text und User-Checkpoints mit dem kanonischen Compaction-Marker; Tools, Reasoning und anderer injizierter Kontext sind ausgeschlossen. Dies verhindert rekursive Referenzpropagation und verhindert, dass eine spätere Quellmutation das gespeicherte Transkript verändert. Das Vorschau-JSON escapt jedes `<` als `\u003c`, sodass Quelltext den `<referenced-sessions>`-Rahmentag nicht bilden kann.

Der Resolver entdeckt optionalen Speicher über `ctx.get("spillStore")` und speichert nur gekürzte Referenzen. Speicher-Ownership liegt bei der Ziel-Session; die Herkunft identifiziert die referenzierte Quell-Session und das Label, ohne einen erfundenen Tool-Aufruf. Der Abbruch wird nach dem asynchronen Speichern geprüft und verhindert die Veröffentlichung, selbst wenn ein Artifact geschrieben wurde. Das Ablaufen von Artifacts bleibt die bestehende Policy des Backends.

Das Budget verwendet den provider und das model, die nach Abschluss von `system-prompt/assemble` für den Ziel-agent erfasst wurden. Direkte `prepare`-Aufrufe vor jeder Assemblierung verwenden agent-Optionen; Session-Header wählen das Budget-Modell nicht. Diagnostische Assemblierungen ohne agent beeinflussen erfasste Routen nicht.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | `SessionReferenceResolver`: pre-step-Listener, Kandidatensuche, Aufbereitung |
| [`src/config.ts`](src/config.ts) | `Config`-schema, `SessionReferenceError`-Taxonomie |
| [`src/uri.ts`](src/uri.ts) | `dsh-session:`-URI-Codec, Mention-Formatierung und -Parsing |
| [`src/projection.ts`](src/projection.ts) | Projektion der aktuellen Oberfläche und Byte-Budget-Retention |
| [`src/serialization.ts`](src/serialization.ts) | Tag-sicheres JSON-Escaping für Snapshot-Payloads |
| [`src/spill.ts`](src/spill.ts) | Vollständige Transkript-Serialisierung und modellsichtbare Auslassungsnotizen |
| [`src/types.ts`](src/types.ts) | `SessionReferenceInput`/`Candidate` und Quelltypen |
| — | Es wird kein Runtime-Invarianten-Begleiter veröffentlicht; die Aufbereitung gibt unveränderliche, pro Aufruf validierte Snapshots zurück, und die agent-/session-Ebenen besitzen die Zulassung, das Einfrieren und das Replay dauerhaften Kontexts. |

### Hauptfluss

Der äußere `agent/pre-step`-Listener akzeptiert den Schritt, parst kanonische Mentions aus direkten User-Nachrichten und ruft dann `prepare` auf, das Referenzen normalisiert (Reihenfolge der ersten Mention, Deduplizierung, Selbstreferenz- und Anzahlabweisung), jede Oberfläche parallel liest, jede unter ihrem aufgelösten Byte-Budget behält und den aggregierten Prompt rendert. Jeder dauerhafte Quell-Eintrag behält den eingefrorenen `capturedThroughSeq` und zeichnet eine von null verschiedene `capturedFormatVersion` auf; Fehlen bedeutet Format v0. Jeder Snapshot wird unmittelbar nach der Nachricht eingefügt, die ihn zitiert, und das Ziel-Log zeichnet die lesbare direkte Nachricht gefolgt von ihrem Quellkontext auf, sodass eine Quellmutation nach der Erfassung das Ziel-Replay nicht verändern kann.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paketvertrag nicht ausreicht. Sie führen von der gemeinsamen Referenzoberfläche zur Designentscheidung und dem Lesedienst dahinter.

- [Session-reference-Subsystem](../../../docs/subsystems/session-reference.de.md) — kanonische URIs, Projektionsregeln und die stabile Fehlertaxonomie.
- [Session-reference spill-Wiederverwendung](../../../.agents/notes/implemented/bug-fix/2026-09-05-session-reference-spill-reuse.de.md) — Snapshot-Identität, Auslassungsnotizen, Speicher-Ownership und Alternativen.
- [Session-query-Subsystem](../../../docs/subsystems/session-query.de.md) — der Lesedienst, der Session-Oberflächen liefert.
- [Context-Gruppenkarte](../README.de.md) — benachbarte Request-Context-Pakete.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-session-reference) — jedes akzeptierte Config-Feld und seine Quelldeklaration.

-----

<a id="model-experience"></a>
## Model Experience

### Referenzierter Session-Hintergrund

#### Was das Modell sieht

Das Modell sieht zwei aufeinanderfolgende User-Rollen-Nachrichten: die aktuelle Nachricht mit ihrem lesbaren `@label`, dann den `## Referenced sessions`-Snapshot als nicht vertrauenswürdigen Hintergrund. Die Warnung verbietet das Befolgen von Anweisungen, Berechtigungsbehauptungen oder Tool-Anfragen aus dem Snapshot, es sei denn, der aktuelle Benutzer wiederholt sie ausdrücklich. Labels, cwd-Werte, ids und Konversationstext werden als JSON innerhalb von `<referenced-sessions>`-Tags serialisiert; jedes Daten-`<` wird als verlustfreies JSON-Escape `\u003c` ausgegeben, sodass Quelltext keinen Rahmentag bilden kann.

#### Token-Wirkung

Jede referenzierte Nachricht fügt die feste Warnung plus bis zu drei serialisierte Vorschauen hinzu, jede unabhängig durch das konfigurierte oder modellrelative Byte-Budget begrenzt. Gekürzte Referenzen fügen separate Auslassungsnotizen außerhalb dieses Budgets hinzu; ein gespeichertes vollständiges Transkript fügt nur dann Tokens hinzu, wenn es abgerufen wird. Der exakte Kontext bleibt in der Ziel-History, bis die Ziel-Compaction ihn überdeckt oder zusammenfasst; Änderungen an der Quell-Session fügen keine weiteren Tokens hinzu.

#### KV-Cache-Wirkung

Anfrage und Snapshot sind aufeinanderfolgende, append-only Zielnachrichten und erhalten frühere cachebare History. Unterschiedliche Referenzen oder Quell-Erfassungsinhalte ändern nur das neue Suffix; eine spätere Ziel-Compaction kann die Wiederverwendung ab ihrer Ersetzungsgrenze ungültig machen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann Session-übergreifende Referenzen ungeeignet sind. Sie sind aktuelle Paketbeschränkungen.

- **Keine Body-Suche** — Kandidatenabfragen prüfen Titel, durchsuchen aber keine Nachrichtentexte.
- **Labels kommen nur aus Projektionen** — eine angehängte Session wird aus ihrem Live-Projektionsschnitt beschriftet, eine kalte aus ihrem dauerhaften Checkpoint, und eine Session, für die beides nichts liefert, wird über ihre id beschriftet und kann nicht über ihren Titel gefunden werden. Die Suche liest nie ein Log: Das Einfalten eines Titels kostet ein ganzes Log, und dies läuft bei jedem Vervollständigungs-Tastenanschlag. Eine Session, die persistiert wurde, bevor der Projektionscache zusammengesetzt war, erhält ihren Titel beim ersten Öffnen zurück, was sie checkpointet.
- **Vertrauenswürdige Caller-Grenze** — der Service setzt voraus, dass sein Host berechtigt ist, jede von `ctx.sessionQuery` exponierte Session zu lesen; er ist kein modellseitiges Suchtool.
- **Nur Textprojektion** — nicht-textuelle user- und assistant-Blöcke werden nicht über Sessions hinweg propagiert.
- **Kein Live-Link** — Referenzen sind Snapshots, keine Forks, Resumes, Abonnements oder Quell-Session-Mutationen.
- **Transkriptsuche ist zeilenbasiert** — eine Literalphrase kann JSON-Fragmentzeilen überspannen oder escapte Zeichen enthalten; dekodiere und verkette die Fragmente einer Nachricht für exakte Textübereinstimmung. Gespeicherte Artifacts können unter der Policy des Backends ablaufen.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
