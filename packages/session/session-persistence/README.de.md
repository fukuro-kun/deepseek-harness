---
description: "Die durable Session-Storage-Seam für Benutzer und Maintainer, die ein Persistence-Backend wählen, Sessions resumen oder ein Backend gegen den gemeinsamen Service-Vertrag bauen."
kind: "package-reference"
---

# @deepseek-ai/dsh-session-persistence
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

Dieses Paket lässt Anwendungen Session-Event-Logs über eine backend-unabhängige API persistieren und resumen. Reader können gespeicherte Sessions erstellen, öffnen, inspizieren, auflisten, an sie anhängen, sie lesen, flushen und schließen, während eine zusammenhängende append-only-Historie bewahrt bleibt. Ein abgeschlossener Flush ist die Durability-Barriere; Reader erhalten nie gerissene Enden oder ungültige Datensätze, und pro Session ist innerhalb einer Backend-Instanz nur ein Writer erlaubt. Verwenden Sie das ausgelieferte [JSONL-Backend](../session-persistence-jsonl/README.de.md) für ein komprimiertes Log pro Session, oder implementieren Sie ein anderes Backend mit denselben beobachtbaren Garantien.

## Inhaltsverzeichnis

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Das Paket verwenden

Mounten Sie ein Persistence-Backend, um Sessions durable zu machen. Das Backend registriert sich als `ctx.sessionPersistence` und routet die Live-Events jeder veröffentlichten Session in den aktiven Write-Handle dieser Session; agent-loop — der Produktions-Veröffentlichungspunkt für Sessions — erwirbt den Write-Handle jeder Session vor der Veröffentlichung, sodass sich sonst nichts in der Komposition ändert.

### Ein Backend wählen

Die Seam liefert das [JSONL](../session-persistence-jsonl/README.de.md)-Backend: ein append-only `.jsonl.zstd`-Log pro Session. Ein Drittanbieter-Backend kann den Service direkt implementieren; der unten stehende [Backend-Vertrag](#understand-the-implementation) ist das, was es einhalten muss.

### Was der Service bietet

Mit gemountetem Backend adressieren fünf Service-Methoden gespeicherte Sessions:

```text
const handle = await ctx.sessionPersistence.create(header)     // store a new session, take write ownership
const handle = await ctx.sessionPersistence.open(id, 'write')  // claim single-writer ownership of an existing session
const reader = await ctx.sessionPersistence.open(id, 'read')   // observe without ownership
const snap = await ctx.sessionPersistence.stat(id)             // header + revision (+ eventCount / sizeBytes) without a log read
const all = await ctx.sessionPersistence.list()                // one snapshot per visible stored session
await ctx.sessionPersistence.flush()                           // backend-wide durability barrier over every active write handle
```

Service-Level-`flush()` leert die gerouteten Events jedes aktiven Write-Handles und materialisiert seine Session, genau wie der eigene `flush` jedes Handles es täte; Fehler aggregieren pro Session als `AggregateError`, ohne den Sweep abzubrechen, und ein mid-Sweep geschlossener Handle gilt als geflusht, weil close selbst durable leert.

Jeder Log-Read und -Write fließt durch den zurückgegebenen `SessionHandle`; es gibt keine id-adressierten append- oder load-Methoden. `handle.read(offset?, length?)` gibt `{ eventState, events }` zurück: Das äußere Slice gehört dem Aufrufer, während `eventState` einen exklusiv `detached` Event-Graphen von einem `shared-frozen`-Graphen unterscheidet, der auch in einem Backend-Cache liegen kann. Der Produzent etabliert diesen Zustand, und Slices bewahren ihn selbst wenn leer. Beide Zustände sind ohne Kopieren sicher übernehmbar; ein Consumer, der mutable Events braucht, klont sie zuerst. Reads enthalten nie ein gerissenes Ende, wiederholte Reads auf einem Handle beobachten nie einen älteren Zustand als ein früherer Read, und ein Write-Handle liest seine eigenen erfolgreichen Appends. `handle.append(events)` hängt einen zusammenhängenden Batch an, dessen erste `seq` der gespeicherten Next-seq entspricht; Persistenz ist bei Auflösung best-effort — der Batch wird akzeptiert, geordnet und für Reads auf dieser Backend-Instanz sichtbar, und nur ein aufgelöster `flush` verspricht, dass er einen Crash überlebt (das ausgelieferte JSONL-Backend persistiert zufälligerweise jeden Batch sofort). `handle.flush()` ist die Durability-Barriere und materialisiert zugleich eine leere erstellte Session, sodass sie durable listbar wird. `handle.close()` ist idempotent und nicht abbrechbar: Ein Read-Handle gibt lokale Ressourcen frei; ein Write-Handle vollendet ausstehende Durability und gibt das Write-Ownership frei. Sobald ein `append` oder `flush` aufgelöst ist, beobachten danach auf derselben Backend-Instanz gestartete Reads — auf jedem Handle oder über `stat`/`list` — mindestens dieses Präfix.

### Ownership und Sichtbarkeit

`create` und `open(id, 'write')` nehmen prozessinternes Single-Writer-Ownership: Ein zweiter Write-Open, solange ein Owner aktiv ist, rejectet mit `SessionAlreadyOwnedError`, `create` auf einer belegten id rejectet mit `SessionAlreadyExistsError`, und eine Mutation auf einem `read`-Handle rejectet mit `SessionReadOnlyError` — ein Handle-Typ, Laufzeit-Verweigerung. Jede Operation auf einem geschlossenen Handle rejectet mit `SessionHandleClosedError`, und `SessionOwnershipLostError` markiert einen Write-Handle, dessen Ownership dauerhaft weg ist (schließen und neu öffnen). Eine erstellte Session ist in diesem Prozess ab dem Moment beobachtbar, in dem `create` auflöst, während das Backend die physische Materialisierung bis zum ersten `append` oder `flush` aufschieben darf; andere Prozesse sehen nur materialisierte Sessions, und eine Session, die vor einem Crash nie materialisiert wurde, hat nie existiert.

### Der Live-Write-Pfad und der Shutdown-Drain

Das Backend besitzt den Live-Write-Pfad: Es installiert die Session-Listener einmal und routet die Events jeder veröffentlichten Session per id zum aktiven Write-Handle dieser Session — `session/event` kopiert in ein begrenztes internes Batching-Fenster, `session/flush` ist die sofortige Durability- und Fehlerbeobachtungs-Barriere, und `session/disposed` führt den finalen Drain aus und schließt den Handle. Eine veröffentlichte Session ohne aktiven Write-Handle persistiert nichts. Ein Background-Write-Fehler behält seine Events in Reihenfolge, pausiert den automatischen Pfad und wird geloggt; der nächste explizite Flush versucht es erneut und rejectet hörbar. `close()` selbst leert den gerouteten Buffer durch den noch offenen Storage, bevor es das Ownership freigibt, sodass der Close-Sweep des Backend-Teardowns den Anwendungs-Shutdown verlustfrei hält, obwohl die Root-fiber-Disposal die Disposer der fibers nebenläufig ausführt.

### Resume und Crash Recovery

Persistenz gibt das physisch gültige Log zurück; semantische Reparatur liegt beim Reader. Eine mid-Turn gecrashte Session behält ihren offenen finalen Turn — ein einzelner Turn kann groß sein, und diese Events wurden vor dem Crash durable angehängt; nur das unvollständige Fragment eines nie bestätigten gerissenen Endes wird verworfen — daraus wiederhergestellte vollständige Datensätze werden vom Write-Pfad durable neu geschrieben, bevor der erste neue Append des Handles erfolgt. Resume (agent-loop) liest das gespeicherte Log über seinen Write-Handle, berechnet `interruptedTurnClosers` — synthetische `tool/result`-Fehler, etwaiges offenes `step/end` und `turn/end {interrupted}` — und hängt sie über denselben Handle als gewöhnlichen Batch an. Read-only-Observer (session-query) balancieren ein unterbrochenes kaltes Log mit denselben Closern nur im Speicher.

### Fehler und Wiederherstellung

Ein gespeichertes Log, das der aktuelle Build nicht getreu interpretieren kann, wird mit einem richtungsbewussten Fehler verweigert, nie falsch gelesen. `SessionHandle` exponiert nur aktuelle logische Datensätze, die durch `SESSION_FORMAT_VERSION` identifiziert werden; ein Provider muss jeden unterstützten historischen Storage konvertieren, bevor er einen Handle zurückgibt, und der ausgelieferte JSONL-Provider migriert unterstützte historische Generationen über seinen statischen Katalog. Ein neueres Format weist den Operator an, den Harness zu aktualisieren. Ein diesem Build unbekannter Event-Typ wird verweigert, sofern sein Envelope ihn nicht `ignorable` markiert, und Korruption im committed Präfix rejectet als `SessionPersistenceCorruptionError`.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie die Seam durable Storage umsetzt und wie Backends einsteigen; der beobachtbare Vertrag ist unter [Das Paket verwenden](#use-this-package) und der generierten [Cordis-API](../../../docs/subsystems/persistence.de.md#cordis-surface) beschrieben.

### Designkonzept

Das Paket ist eine Seam, kein Backend-Framework: Es exportiert den abstrakten `SessionPersistence`-Service, den `SessionHandle`-Vertrag, die stabilen Fehlerklassen, die Consumer fangen, die reinen Stored-Record-Validierungshelfer (`storage-contract`) und die gebrandete Revision — sonst nichts. Jeder Provider besitzt seine vollständige Storage-Runtime (Handle-Klasse, Mutationsordnung, Single-Writer-Buchführung, Live-Event-Routing, Teardown), und zwei geteilte Test-Suites — `runPersistenceContract` und `runLiveWritePathContract` unter `tests/` — fixieren das beobachtbare Verhalten, auf das sich jeder Provider einigen muss. Bewusste Konsequenz: Provider dürfen einander ähneln, wo ihr Storage zufällig ähnlich ist, aber keine Implementierungsmaschinerie überschreitet die Paketgrenze.

### Die Invarianten, die jedes Backend einhält

- **Append-only, zusammenhängende `seq`.** Committed Events werden nie neu geschrieben; die erste `seq` von `append` muss der gespeicherten Next-seq entsprechen, und eine Lücke rejectet.
- **Ein gerissenes physisches Ende erreicht nie einen Reader.** Es gehört zu einem Append, der nie aufgelöst wurde; der Write-Pfad kürzt es durable vor seinem ersten neuen Append.
- **Verlustfreie JSON-Daten.** Batches und Header durchlaufen die geteilte einmalige Validate-and-Snapshot-Grenze (`materializeAppendBatch`/`materializeCreateHeader`); nicht serialisierbare Payloads rejecten am Call-Site.
- **Durability.** `append` persistiert best-effort; `flush` — pro Handle oder service-weit — ist die Barriere, die Storage verspricht und zugleich eine leere Session materialisiert.
- **Fail-closed-Reads.** `validateStoredEvents` verweigert unbekanntes Event-Vokabular und ausgemusterte Pre-Release-Formen; `assertVersion` verweigert fremde Formatversionen.
- **Single Writer pro Backend-Instanz.** Der prozessinterne Claim des Providers wird bei `create`/`open('write')` genommen und beim Handle-Close freigegeben.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: der abstrakte `SessionPersistence`-Service und re-exportiertes Seam-Vokabular |
| [`src/handle.ts`](src/handle.ts) | Der `SessionHandle`-Vertrag: read/append/flush/close-Semantik und Freshness-Regeln |
| [`src/storage-contract.ts`](src/storage-contract.ts) | Geteilte Validierung: Version-Gate, fail-closed-Vokabular, Batch-Materialisierung, Zusammenhang |
| [`src/errors.ts`](src/errors.ts) | Stabile Handle-/Ownership-Fehler und Format-Verweigerungen |
| [`src/revision.ts`](src/revision.ts) | Das gebrandete opake Revision-Token |
| — | Es wird kein Runtime-Invariant-Begleiter veröffentlicht; Persistenzkorrektheit erfordert Backend-Roundtrip- und Crash-Tail-Tests; dieses Paket exponiert keine kontinuierlich beobachtbare prozessinterne Relation. |

### Der Write-Pfad im Überblick

Jedes `session/event` für die Session des Writers kopiert in den internen Buffer dieses Handles. Das erste ausstehende Event startet ein festes Batching-Fenster; spätere Events treten bei, ohne seine Deadline zurückzusetzen. Ablauf leert das ausstehende Präfix durch die Mutationskette des Handles; während eines Drains zugelassene Events werden der Reihe nach zum nächsten verketteten Batch zusammengeführt. `session/flush` bricht das Warten ab und leert bis zur Quiescence, dann läuft `handle.flush()`, sodass der Loop es als Ordnungs- und Fehlerbeobachtungs-Checkpoint vor dem nächsten Turn nutzt. Ein rejecteter Background-Drain behält seine Events und pausiert den automatischen Timer; expliziter Flush, Writer-Close oder Backend-Teardown versucht sofort erneut und rejectet hörbar. Konstruktor-Seed-Events emittieren nie `session/event`, sodass ein vor der Veröffentlichung über den Handle angehängter Seed nie erneut eingereiht wird.

### Stored-Record-Validierung

Die geteilten Helfer der Seam validieren aktuelle logische Datensätze, die durch `SESSION_FORMAT_VERSION` identifiziert werden, und Appends schreiben nur das aktuelle Format ([Begründung](../../../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.de.md)). Historische Dekodierung und unveränderliche Nachfolger-Veröffentlichung gehören in jeden Provider, bevor er einen Handle zurückgibt. Jedes Backend führt `storage-contract`-Validierung bei Handle-Reads und Write-Open-Priming aus, verweigert einen unbekannten Event-Typ als `SessionFormatUnsupportedError` und einen fehlerhaften aktuellen Datensatz als `SessionPersistenceCorruptionError`, mit dem Raw-Log-`SessionLocation` angehängt, wenn das Backend ein Artefakt pro Session hält.

</details>
-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Paketvertrag nicht ausreicht. Sie führen vom geteilten Durability-Modell zu den ausgelieferten Backends und der Entscheidungsdokumentation.

- [Session-Persistence-Subsystem](../../../docs/subsystems/persistence.de.md) — der vollständige Service-Vertrag, Handle-Semantik, Flush-Checkpoint, Crash Recovery und generierte Cordis-API.
- [Handle-basierte Persistence-Agent-Note](../../../.agents/notes/implemented/architecture/2026-08-27-handle-based-session-persistence.de.md) — das Seam-Design und sein Ownership-Modell.
- [JSONL-Persistence-Backend](../session-persistence-jsonl/README.de.md) — das ausgelieferte Pro-Session-Datei-Backend.
- [Session-Checkpoint-Policy](../session-checkpoint-policy/README.de.md) — das Plugin, das an semantischen Grenzen über `session/flush` flusht.
- [Session-Paketkarte](../README.de.md) — benachbarte Persistence-, Projection-, Title- und Telemetry-Pakete.

-----

<a id="model-experience"></a>
## Model Experience

### Resumierte Konversationshistorie

#### Was das Modell sieht

Die Seam fügt keinen Prompt und kein Schema hinzu. Resume stellt gespeicherte Surface-Events als Nachrichtenhistorie wieder her; gespeicherte Request-Header rekonstruieren frühere Aufrufe, während der neue Loop den aktuellen System-Prompt, die Tools und das Session-Präfix für seinen nächsten Request komponiert. Crash Repair markiert einen Assistant-Request ohne durable Aufruf als `TOOL_NOT_STARTED`; ein durabler Aufruf ohne Ergebnis wird `TOOL_OUTCOME_UNKNOWN`, dessen Text dem Modell erlaubt, read-only oder idempotente Arbeit erneut zu versuchen, es aber anweist, Seiteneffekte zu verifizieren oder den Benutzer zu fragen, statt blind zu wiederholen.

#### Token-Effekt

Null Token während gewöhnlicher Persistenz. Resume stellt die retained Historienkosten wieder her und bezahlt den aktuellen Request-Envelope normal; jeder reparierte Aufruf fügt den zitierten retained Fehlertext hinzu.

#### KV-Cache-Effekt

Persistenz verändert keine Live-Request-Präfixe. Ein resumierter Loop kann Provider-Cache nur wiederverwenden, wenn seine rekonstruierte Historie, der aktuelle Envelope und die Model-Route übereinstimmen; Crash-Repair-Ergebnisse hängen an, ohne frühere Historie neu zu schreiben.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wo die Garantien der Seam enden. Es sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Write-Ownership ist nur prozessintern** — die Writer-Tabelle des Providers schließt einen zweiten Writer innerhalb einer Backend-Instanz aus; der durable prozessübergreifende Lease ist die geplante nächste Schicht auf derselben Handle-Form, und bis er landet, darf kein anderer Prozess dieselbe Session schreiben.
- **Ein Backend-Plugin-Reload unter Live-Sessions lässt ihre Writer hörbar fehlschlagen** — ein reloaded Backend kann keine Handles bedienen, die die alte Instanz ausgestellt hat; Writes schlagen fehl, bis die Sessions neu starten, und nichts übernimmt die Logs still erneut.
- **Nur per Handle erworbene Sessions persistieren** — `ctx.sessions.create` + `session/flush` allein speichert nichts; agent-loop ist der Produktions-Akquisitionspunkt, und Tests seeden Storage über `create`/`append`/`close`.
- **Keine Delete- oder Retention-API** — das Zurückschneiden gespeicherter Sessions ist out-of-band-Backend-Wartung.
- **`list()` ist unpaginiert und ungefiltert** — es gibt den Snapshot jeder gespeicherten Session zurück; gut für lokale Stores, unindiziert bei Skalierung.
- **Synthetische Closer sind die einzige Crash-Geschichte** — Resume hängt `interruptedTurnClosers` über den Write-Handle an; es gibt kein Partial-Turn-Resume, das einen unterbrochenen Turn fortsetzt statt ihn zu schließen.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
