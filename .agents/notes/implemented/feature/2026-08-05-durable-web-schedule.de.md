# Agent Note: Durable Session-lokale Erinnerungen
[English](2026-08-05-durable-web-schedule.md) | [中文](2026-08-05-durable-web-schedule.zh.md) | Deutsch

Status: implemented


## Problem

Eine innerhalb einer Konversation erzeugte Erinnerung muss genau dieser Session zurechenbar bleiben und einen Prozessneustart überleben. Ein prozesslokaler Timer oder Inbox-Eintrag kann diese Dauerhaftigkeit nicht liefern, während ein globaler Scheduler oder eine private Datenbank ein zweites Identitäts-, Persistenz- und Lifecycle-System einführt.

Beschäftigte Agents, lange Wartezeiten, Wall-Clock-Änderungen, kalte Sessions, Forks, Persistenzfehler, absolute Kalendereingabe und Teardown machen einen einfachen Timeout unzureichend. Das Design muss einen durable Record von seinem einweg-Live-Wait unterscheiden, verhindern, dass ein Fork die aktiven Erinnerungen seines Elternteils erbt, und vermeiden, Schedule-spezifische Präsentation oder Zeitzonen-State auf nicht verwandte Komponenten zu verteilen.

## Entscheidung

Der [Schedule-Guide](../../../../docs/user/guide/schedule.de.md) verwendet ein Overlay, das explizit `@deepseek-ai/dsh-time-context` und `@deepseek-ai/dsh-schedule` lädt und die ansonsten deaktivierte `ui-schedule`-Row des Web-Bundles aktiviert. Der Default-Web-Startup-Graph bleibt für Schedule inaktiv. Schedule beobachtet nur Root-Agents, die nach dem Laden des Plugins veröffentlicht werden, und installiert seine drei Tools plus einen einweg-Owner in diesem Agent-Scope. Kalte History-Reads, bereits veröffentlichte Roots, Child-Agents und andere Hosts aktivieren die Runtime nicht.

Die usersichtbare Grenze ist `session-local`: Die originale Session führt eine pünktliche Erinnerung nur aus, solange sie live ist, sendet keine externe Benachrichtigung, solange sie kalt ist, und verarbeitet eine überfällige Erinnerung, nachdem sie wieder live wird. Fällige Arbeit wartet, bis der Agent vollständig idle ist, und tritt dann über `followup()` in die gewöhnliche Next-Turn-Warteschlange ein; sie steuert niemals den laufenden Turn und hat keine eigenständige Web-Quittung ([conversational delivery](../../archived/simplification/2026-08-09-conversational-schedule-delivery.md)).

| Szenario | Durable Tatsache | Live-Verhalten | Usersichtbares Ergebnis |
| --- | --- | --- | --- |
| Erzeugen und verwalten | `schedule/change`-Create/Delete in der originalen Session | Agent-gescopte Tools checkpointen vor Reads und nach Mutationen | Stabile ID, UTC-Ziel, Zustand und `session-local`-Offenlegung |
| Fällig während beschäftigt | Aktives Create bleibt im Fold | Owner wartet auf Idle-Maintenance, reiht ein Follow-up ein, hängt dann Dispatch an | Ein späterer gewöhnlicher Konversations-Turn |
| Mehrere Every-Records überfällig | Jeder aktive Record behält sein frühestes nicht akzeptiertes anchor-ausgerichtetes Ziel | Eine Entscheidung wählt je Record das neueste Vorkommnis und schiebt es hinter jetzt | Ein gewöhnliches Follow-up mit einem Vorkommnis pro Record |
| Prozess gestoppt oder Session kalt | Aktives Create bleibt persistiert | Kein Timer oder Hintergrund-Scan; Resume baut den Owner neu auf | Zukünftiges Ziel wartet; überfälliges Ziel wird versucht |
| Fork | Eltern-Events bleiben im geerbten Präfix | Child-Fold beginnt am exakten `inheritedEventCount` | Elternarbeit wird im Child nicht aktiv |

### Session-Log-Autorität und Tools

Der Version-1-`schedule/change`-Stream ist die einzige durable Schedule-Autorität. Ein Create-Record besitzt eine Session-lokale, nicht wiederverwendete Branded-ID, den getrimmten Prompt, seinen Regel-Diskriminator und das UTC-Ziel. Delete und One-Shot-Dispatch sind terminale Transitionen. Jeder Dispatch speichert seine ID und Entscheidungszeit, sodass der Fold diesen Record direkt hinter verpasste Vorkommnisse schiebt. Der strikte Decoder und der reine Fold lehnen unbekannte Versionen, Zusatzfelder, wiederverwendete IDs, Dispatch-Form-Mismatches und Transitionen gegen inaktive Records ab. Eine normale Session faltet ihren vollständigen Stream; ein Fork faltet nur Events ab dem `inheritedEventCount`, der in die Projektionsinitialisierung gereicht wird.

Wenn `ctx.sessionProjections` existiert, registriert Schedule eine strikte Unit, die dieselbe Transition verwendet und das vollständige aktive `ScheduleRecord[]` veröffentlicht; die gemeinsame [Projection-State-Entscheidung](../../archived/architecture/2026-08-19-session-projection-state-and-client-views.md) besitzt deren Initialisierungs- und Restore-Vertrag. Korrupte durable Eingabe lässt den bestehenden Read-Pfad fehlschlagen statt ein Teil-Array zu liefern. Das browser-sichere Record-Vokabular wird über den Type-only-Subpath `@deepseek-ai/dsh-schedule/client` exponiert.

Die aktuelle Regel-Union akzeptiert einen nicht-leeren Prompt und genau einen Selektor. `after_seconds` ist ein positiv-sicherer ganzzahliger Delay, dessen Record `{ id, kind: 'after', prompt, afterSeconds, scheduledAt }` ist. `at` ist entweder strenges RFC 3339 mit `Z` oder numerischem Offset oder ein strukturiertes `{ date, time, time_zone }` mit expliziter Zone; sein Record ist `{ id, kind: 'at', prompt, scheduledAt }`. `every_seconds` ist ein Safe Integer von mindestens 300, dessen `{ id, kind: 'every', prompt, everySeconds, scheduledAt }`-Record auf seiner Creation-plus-Interval-Sequenz ausgerichtet bleibt. One-Shot-Dispatch speichert nur die ID; Every-Dispatch speichert `id + acceptedAt`. Tool-Werte leiten `scheduled` oder `overdue` ab und enthalten `deliveryMode: 'session-local'`.

Ein Agent-gescopte FIFO serialisiert Management-Transaktionen und die Due-Transaktion des Live-Owners vom Preflight bis zu den Post-Append-Barriers. Jeder Tool-Read wartet zuerst auf `ctx.sessions.flush(session)`. Create lehnt Input-Form-Fehler möglichst vor der FIFO ab, preflightet, alloziert eine ID, hängt an und checkpointet erneut. Delete validiert seine ID vor der FIFO, preflightet, bevor es über Aktivität entscheidet, und checkpointet erst nach dem Append erneut. List und Not-Found-Delete antworten niemals aus einem unbestätigten Live-Suffix. Fehlgeschlagene Barriers liefern `persistence_uncertain`, statt zu raten, ob ein Eager-Write committet hat.

Jeder erfolgreiche Management-Preflight bittet den Live-Owner um Neuberechnung. Ein späteres List kann daher ein zurückbehaltenes Create nach einer früheren Post-Append-Ablehnung bestätigen und es ohne privaten Persistenz-Retry-Timer scharf machen.

### Explizite Absolute-Time-Grenze

Natürlichsprachliche Interpretation und Schedule-Parsing sind bewusst getrennt ([Zeitzonen-Simplification](../simplification/2026-08-09-explicit-schedule-time-zone.de.md)). Jeder Browser-Prompt trägt seine Host-validierte IANA-Zone nur auf genau dieser durable User-Message. Time-Context sagt dem Modell, diese Zone für ansonsten unqualifizierte Daten und Zeiten anzunehmen. Schedule importiert dieses Plugin weder noch speichert es eine Session-Zone: Das Modell muss seine Interpretation in einen Offset-tragenden RFC-3339-Wert oder ein lokales Objekt mit explizitem `time_zone` verwandeln.

Schedule validiert exakte Kalenderformen, Offsets, Zonennamen und einen strikt zukünftigen Zeitpunkt mit vierstelliger Jahreszahl. Eine lokale Zeit in einer Sommerzeit-Lücke wird abgelehnt; eine Überlappung wählt ihr erstes, früheres Zeitpunkt. Ein erfolgreiches Create speichert nur kanonisches UTC-`scheduledAt`, nicht den ursprünglichen Offset, die lokalen Felder oder die Zone.

### Begrenzte Fixed-Rate-Semantik

Every ist ein Festdauer-Intervall, keine Kalenderregel. Das erste Ziel ist Creation-Zeit plus Intervall. Bei einer Due-Entscheidung wählt Ganzzahldivision den spätesten Sequenzpunkt am oder vor der gesampelten Wall Clock und den ersten Sequenzpunkt danach. Das gewählte Vorkommnis wird einmal präsentiert, und der Record rückt direkt auf das zukünftige Ziel vor, sodass eine kalte Session nie einen Replay-Rückstand anhäuft und verzögerte Modellarbeit die Sequenz nie verschiebt.

Alle unterschiedlichen überfälligen Every-Records nehmen an einem Batch teil, jeder mit einem neuesten Vorkommnis und einem geteilten `acceptedAt`. Es gibt keinen Record-übergreifenden Cooldown, Gate, Quota oder zurückbehaltenen Batch-Timestamp. Ein Fünf-Minuten-Minimum begrenzt Wake- und Model-Request-Frequenz. Würde der nächste Sequenzpunkt den vierstelligen Jahres-Speicherbereich überschreiten, terminiert Dispatch diesen Record.

Kalender- und Cron-Ausdrücke sind bewusst abwesend ([Bounded-Recurrence-Simplification](../../archived/simplification/2026-08-09-bounded-fixed-rate-schedule.md)); ihre Unterstützung würde eine zeitzonensensitive Kalendersprache, eine Evaluator-Dependency, eine Validierungsoberfläche und eine tzdata-Replay-Policy hinzufügen, die mit Fixed-Rate-Erinnerungen nichts zu tun haben.

### Live-Delivery-Lifecycle

Der Agent-gescopte Owner leitet sein frühestes Ziel aus dem durable Fold ab. Lange Ziele verwenden begrenzte Timer-Segmente, und jeder Wake liest die Wall Clock erneut, sodass ein Rücksprung nicht früh feuern kann und ein Vorwärtssprung überfällig wird. Fällige One-Shots haben Priorität und werden einzeln zugelassen; andernfalls tritt jeder überfällige Every-Record in einen Batch in Ziel- und Creation-Reihenfolge ein. Besitzt ein Turn oder eine Maintenance-Aufgabe den Agent, lehnt `runMaintenance()` den Claim ab; die Records bleiben aktiv und ein `whenIdle()`-Wait löst einen weiteren Versuch aus. Ein abgelehnter Preflight oder ein enthaltener Framing-/Enqueue-Fehler lässt sie ebenfalls aktiv, ohne einen privaten Retry-Timer zu starten.

Der akzeptierte Pfad löscht ausstehende Persistenz und claimt die echte Idle-Phase. Er faltet das exakte Session-Suffix neu, sampelt die Entscheidungsuhr, konstruiert festes Reminder-Framing mit JSON-escaped Werten, reiht synchron ein `followup()` ein und hängt Dispatch an, bevor er Maintenance freigibt. Ein One-Shot hängt einen nur-ID-terminierenden Dispatch an. Ein Fixed-Rate-Batch hängt eine `id + acceptedAt`-Transition pro teilnehmendem Record an. Weckender Input bleibt bis zur Freigabe geparkt, sodass die Nachricht nicht geclaimt werden kann, bevor Dispatch im Log steht; danach checkpointet der Owner den Dispatch.

Dispatch zeichnet Queue-Admission auf, nicht Modellvollendung oder User-Empfang. Framing- oder synchroner Enqueue-Fehler hängt keinen Dispatch an. Ein Append-Fehler faultet diesen Owner, weil die Nachricht bereits eingereiht sein kann. Agent- oder Plugin-Disposal bricht Timer ab, stoppt neue Arbeit, wickelt Tool-Registrierungen ab und wartet In-Flight-Arbeit ab, ohne durable Records zu löschen. Ein Crash nach Follow-up-Admission aber vor durablem Dispatch kann die Erinnerung nach Recovery wiederholen; das Design verspricht kein Exactly-Once.

### Read-only-Web-Katalog

Das Schedule-Overlay aktiviert den ansonsten deaktivierten [`dsh-client-ui-schedule`](../../../../packages/client/ui-schedule/README.de.md)-Client zusammen mit dem Host-Service. Die vollständige aktive Projektion speist auch [`dsh-client-ui-workspace`](../../../../packages/client/ui-workspace/README.de.md). Diese Note besitzt diese Opt-in-Read-only-Präsentationsgrenze: Die Projektion ist aktueller aktiver Zustand, keine Dispatch- oder Delivery-Quittung, sodass gewöhnliche Assistant-Turns die Delivery-Präsentation bleiben. Der Katalog ist ein festes `document.body`-Portal, dessen linke Kante dem Trigger folgt, wenn Platz reicht, und nach links weicht, um einen 16px-Viewport-Rand nahe der rechten Kante zu halten. `useAnchoredPosition` besitzt Messung sowie Resize-, Captured-Scroll-, Panel-Resize- und Cleanup-Verhalten; Schedule liefert Trigger- und Portal-Refs, Bottom-Placement, einen 5px-Abstand und die bestehende Inside-/Outside-Dismissal-Grenze, ohne eine generelle Popover-Abstraktion hinzuzufügen.

## Erwogene Alternativen

**`ctx.jobs` verwenden.** Jobs besitzen prozesslokale Arbeit, Outcomes und Benachrichtigungen statt Session-Log-State und Konversations-Follow-ups.

**Erinnerungen in einer privaten Datenbank oder einem globalen Scheduler speichern.** Das könnte kalte Sessions laufen lassen, braucht aber eine zweite Identitätsmappe, Startup-Scan, Ownership-Lease, Crash-Protokoll und Benachrichtigungs-Policy.

**Eine Session-Zeitzone persistieren und lokales `at` ableiten.** Das verteilt einen interpretativen Default über Session Core, Host-Create/Fork, Persistenzformate, Clients und Mismatch-Recovery. Request-lokale Modell-Guidance plus eine explizite Tool-Grenze löscht diese Kopplung.

**Eine unabhängige durable Web-Quittung behalten.** Dispatch ist ein internes Queue-Fakt, nicht die Erinnerung des Users. Das Rendern der gewöhnlichen Assistant-Antwort vermeidet eine zweite Delivery-Bedeutung und entfernt Schedule-Code aus Host- und Client-Ebenen.

**Eine generelle Recurring-Rule-Engine hinzufügen.** Festdauer-Intervalle brauchen nur Anchor-Arithmetik. Eine geteilte Recurrence-Abstraktion, ein globales Admission-Gate und ein Kalender-Evaluator würden Replay- und Runtime-State aufblähen, ohne dem zurückbehaltenen Produktverhalten zu dienen.

**Dispatch vor `followup()` claimen oder Exactly-Once-Fencing hinzufügen.** Claim-first kann eine Erinnerung bei Enqueue-Fehler still verlieren. Prozessübergreifendes Exactly-Once braucht Lease, Outbox, Acknowledgement und eine Downstream-Idempotenz-Grenze außerhalb dieses Session-lokalen Scopes.

**Bestehende Roots adoptieren oder globale Tools registrieren.** Späte Adoption lässt die Plugin-Ladereihenfolge ungesehene Timer aktivieren und legt Tools außerhalb der unterstützten Root-Composition offen.

## Verifikation

Paket-Tests pinnen striktes Replay, One-Shot- und Every-Transitionen, Creation-Anchor-Arithmetik, Latest-only-Catch-up, Multi-Record-Batching, Fork-Suffixe, ID-Reuse, Offset- und Lokal-Kalender-Profile, IANA-Validierung, Sommerzeit-Lücken und -Überlappungen, Zeitgrenzen, Timer-Segmentierung, Wall-Clock-Bewegung, Overdue-Admission, festes Framing, Enqueue- und Append-Fehler, Barrier-Recovery, Projektionsregistrierung und -wiederherstellung, Registrierungs-Rollback und quiescentes Disposal bei 100 % Per-File-Coverage. Ein Property-Test vergleicht Every-Berechnung und Replay über variierte Intervalle und übersprungene Spannen hinweg. Ein Production-JSONL-Restart-Test beweist, dass eine überfällige Erinnerung durch den echten Agent-Lifecycle dispatched und nach einem weiteren Restart nicht erneut dispatched. Fokussierte Client-Suites besitzen Katalog- und Sidebar-Verhalten, einschließlich Body-Portal, großzügiger Links-Ausrichtung, Portal-inside-Pointer-Handling, Outside-Dismissal, Escape, Live-Empty und Timer-Cleanup. Die gemeinsame Primitive-Suite besitzt den Resize-, Captured-Scroll-, Panel-Resize- und Cleanup-Lifecycle des Positioning-Hooks. Schlüssellose Assembled-Web-Szenarien behalten die gewöhnliche After-/At-/Every-Delivery-Evidenz plus einen 900×900-Schedule-Katalog-Smoke für Overlay-Erreichbarkeit, festes Portal-Placement, Right-Edge-Clamping, Breite und Overflow, Ordinary-/Search-Alarms, schmales Dark-Layout, einen Light-Theme-Browser-Screenshot und ein Live-Empty-Update.

## Konsequenzen

- Erinnerungs-State überlebt Restarts durch gewöhnliche Session-Persistenz ohne neue Datenbank oder öffentlichen Service.
- Kalte Sessions leisten keine Arbeit und senden keine externe Benachrichtigung; das Wiederöffnen kann überfällige Arbeit zustellen.
- Absolute Eingabe ist deterministisch ohne persistenten Session-Zonen-State oder eine Dependency von Schedule zu Time-Context.
- Users sehen normalen Konversations-Output; Dispatch überzeichnet weder Modellerfolg noch Acknowledgement.
- Opt-in-Web-Users können das vollständige aktive Set einsehen und cache-bekannte aktive Sessions in gewöhnlichen oder Search-Rows erkennen, ohne einen zweiten durable State, ein Runtime-Signal oder eine zweite Delivery-Bedeutung zu erzeugen.
- Jeder Live-Root fügt nur Fold-abgeleitete Timer, einen optionalen Idle-Wait und eine In-Flight-Operation hinzu.
- Fixed-Rate-Recurrence ist begrenzt durch ein Fünf-Minuten-Minimum, Latest-only-Catch-up und ein gebatchtes Vorkommnis pro überfälligem Record; Kalender-Recurrence bleibt außerhalb dieser Produktgrenze.
