# Agent Note: Letzte Aktivität im Session-Index aufzeichnen

Status: proposed

[English](2026-07-29-durable-last-activity-index.md) | [中文](2026-07-29-durable-last-activity-index.zh.md) | Deutsch

## Problem

Eine kalte (persistierte, nicht attachte) Session hat keine maßgebliche gespeicherte Antwort auf „wann hat der User hier zuletzt gepromptet". `dsh-host-apiproxy` bedient `updatedAt` aus dem `lastPromptAt` des optionalen Projektions-Caches, mit Fallback auf `createdAt`, und der Web-Client sortiert seinen Session-Baum nach diesem Wert. Der Cache ist fail-soft und wird asynchron gecheckpointet, also lässt eine fehlende oder verspätete Zeile eine kürzlich gepromptete Session zu alt sortieren.

Das Gateway nutzte früher die JSONL-Artefakt-mtime, wo verfügbar. mtime beantwortet eine andere Frage: wann das Artefakt zuletzt geschrieben wurde. Jeder durable Schreibvorgang frischt es auf, einschließlich eines Truncate-Repair eines zerrissenen Tails, synthetischer Closer, die einen unterbrochenen Turn ausgleichen, und der [`session/end-seed`-Grenze](../../implemented/architecture/2026-07-30-session-end-seed-log-boundary.md), die während des Pickups angehängt wird. Diese Approximation beförderte eine Session schon dadurch, dass sie geöffnet wurde. Die [Bounded-Cold-Blank-Verifikation](../../archived/bug-fix/2026-08-13-bounded-cold-blank-verification.md) entfernte die mtime-Ordnung und akzeptierte die konservative „zu alt"-Fehlerrichtung des Caches als Zwischenlösung.

Eine attachte Zusammenfassung kann das live Event-Log folden und die neueste menschenverfasste `user/message` auswählen, aber der kalte Pfad liest bewusst keine Logs: kalte Zusammenfassungen kommen allein aus dem Projektions-Cache, kalte Recency ist also nur so frisch wie der Cache.

Kalte Ordnung exakt zu machen bleibt eine Durable-Format-Entscheidung, weshalb sie hier statt im Gateway-Workaround gescoped ist.

## Vorschlag

Die neueste Human-Prompt-Zeit dort speichern, wo ein Listing bereits liest — im Session-Index — sodass `summarizeCold()` sie ohne Öffnen des Logs und ohne Abhängigkeit von einem Cache-Checkpoint bedienen kann. Der Coordinator berechnet den Wert, weil er jeden Append sieht und bereits Per-id-State besitzt; Backends persistieren ihn. Das macht ihn zu einem neuen `PersistenceBackend`-Vertragselement statt zu backend-lokaler Buchführung, mit demselben Event-Prädikat wie die attachte Projektion: `user/message`, deren `source.kind` `user` ist.

Das ausgelieferte JSONL-Backend bestimmt die konkrete Storage-Restriktion. Sein Header ist Zeile 1, einmalig bei der Materialisierung geschrieben, und das Log ist danach für immer zum Append geöffnet; `jsonl.spec.ts` pined, dass committete Bytes nie umgeschrieben werden. Ein Per-Append-Header-Feld würde eine abgesicherte Durability-Invariante verletzen, nicht bloß den Writer komplizieren. Eine Per-Session-Sidecar-Datei ist daher die Form, mit der ein belassen des JSONL als Approximation zu vergleichen ist. Ein Out-of-tree-Backend darf den Wert nur dann in seinem eigenen Index speichern, wenn es Update-Atomizität, Versionierung und Recovery-Semantik für diese Repräsentation definiert; dieser Vorschlag schreibt das Schema eines anderen Providers nicht vor.

Drei Fragen müssen vor der Implementierung beantwortet werden, und keine wird hier entschieden:

**Wie wird das geteilte Prädikat besessen?** Ein gespeichertes Feld kodiert die Regel zur Schreibzeit, wo der Writer einen Batch sieht, während die attachte Zusammenfassung ein ganzes Log foldet. Beide müssen ein exportiertes Event-Prädikat oder einen Reducer nutzen, damit neue Message-Source-Varianten attachte und kalte Ordnung nicht auseinanderlaufen lassen können.

**Wie verhalten sich Pre-Field-Logs?** Bestehende Artefakte haben keinen Wert. Fallback auf mtime hält sie auf der bestehenden mtime-basierten Genauigkeit; Fallback auf `createdAt` ist ehrlich, sortiert aber jede bestehende Session im Picker und im Baum um.

**Ist ein Sidecar für JSONL akzeptabel?** Er führt eine zweite Datei pro Session wieder ein, die mit dem Log auseinanderlaufen kann — was das Single-Artefakt-Design vermieden hatte.

## In Betracht gezogene Alternativen

**Das Log auf dem kalten Pfad lesen.** Konstruktionsbedingt korrekt und braucht keine Formatänderung, konterkariert aber das Header-only-Listing: `list()` würde mit der Gesamtloggröße skalieren, und der Web-Session-Baum fächert über jede Session im Store auf. Das ist die Option, deren Vermeidung die mtime-Approximation existiert.

**mtime behalten und Grenzschreibvorgänge daraus ausschließen.** Als unmöglich abgelehnt, nicht als unerwünscht: mtime gehört dem Dateisystem, nicht dem Backend. Nichts kurz vor dem Wiederherstellen des Timestamps nach jedem Grenzschreibvorgang würde es bewahren, und das racet jeden konkurrierenden Reader und lügt über das Artefakt.

**Die Grenze nur schreiben, wenn ein Repair stattfand.** Würde die Frequenz reduzieren, und die [Grenz-Note](../../implemented/architecture/2026-07-30-session-end-seed-log-boundary.md) hat es bereits abgelehnt: das Prädikat muss auch für einen ordentlichen Restart gelten. Eine Korrektheitsinvariante gegen Timestamp-Genauigkeit zu tauschen ist die falsche Richtung.

**Aktivität aus einem Projektions-Cache ableiten.** Das ist die aktuelle Zwischenimplementierung. `session-projection-cache` foldet Tails hinter einem Watermark, ohne das Persistenzformat zu ändern, ist aber optional und fail-soft. Seine Abwesenheit oder Checkpoint-Verzögerung macht die Ordnung von Cache-Verfügbarkeit und -Frische abhängig, es kann also nicht den hier vorgeschlagenen maßgeblichen Wert liefern.

## Akzeptanzkriterien

- `SessionSummary.updatedAt` für eine kalte Session entspricht demselben Wert, den die attachte Projektion für diese Session meldet, verifiziert durch Resume, Quit ohne Turn und die Assertion, dass die Ordnung über beide Pfade unverändert bleibt.
- Eine resumte-dann-verlassene Session sortiert nicht über einer danach bearbeiteten Session, im Web-Session-Baum und im TUI-Resume-Picker, gepinnt durch einen assembled Snapshot statt nur Unit-Tests.
- Die Prompt-Zeit-Regel hat eine Definition: ein Test beweist, dass das gespeicherte Feld und der attachte fold über einem Log mit Human-Prompts, injizierten User-Messages, Grenzen und Closern übereinstimmen.
- Pre-Field-Artefakte laden und listen fehlerfrei unter dem gewählten Fallback, mit der Ordnungskonsequenz des Fallbacks assertiert.
- Die gewählte JSONL-Repräsentation bewahrt committete Log-Bytes und aktualisiert den Aktivitätswert entweder atomar mit dem zugehörigen Append oder definiert einen konservativen, beobachtbaren Stale-Value-Fehlermodus.

## Risiken

**Zwei Definitionen der Prompt-Zeit driften auseinander.** Das gespeicherte Feld wird pro Batch berechnet, die Projektion über ein ganzes Log. Eine neue Message-Source, zur Schreibzeit so und zur Lesezeit anders klassifiziert, ergibt eine Session, deren kalte und attachte Ordnung auseinanderlaufen — ein Bug, der erst nach einem Restart erscheint.

**Ein JSONL-Sidecar kann mit seinem Log auseinanderlaufen.** Ein Crash zwischen dem Log-Append und dem Sidecar-Write hinterlässt einen stalen Wert ohne Torn-Tail-Marker zum Reparieren. Jeder Consumer müsste den Sidecar als Hint behandeln, was nah an dem ist, was mtime bereits ist.

**Der Fallback sortiert bestehende Sessions um.** Welcher Fallback auch gewählt wird: User mit bestehenden Logs sehen Picker und Baum einmalig beim Upgrade umsortiert. `createdAt` macht diese Umsortierung groß.

**Die Kosten können den Defekt übersteigen.** Der verbleibende Defekt ist konservative Fehlordnung, wenn Projektionsmetadaten fehlen oder verspätet sind. Wenn die ehrliche Antwort für JSONL „den Cache-Fallback behalten" lautet, kann das Ergebnis dieser Note die Dokumentation dieser Entscheidung sein statt der Implementierung eines Felds.

## Verwandtes

- [Bounded cold blank verification](../../archived/bug-fix/2026-08-13-bounded-cold-blank-verification.md) — entfernt die mtime-Ordnung und definiert die Cache-only-Kalt-Zusammenfassung der Zwischenlösung, die dieser Vorschlag exakt machen würde.
- [Die End-Seed-Log-Grenze](../../implemented/architecture/2026-07-30-session-end-seed-log-boundary.md) — einer der Nicht-Prompt-Schreibvorgänge, die mtime untauglich machten.
- [Session persistence](../../implemented/architecture/2026-06-14-session-persistence.de.md) — die append-only- und Never-Rewrite-Invarianten, die ein mutierbares JSONL-Header-Feld ausschließen.
- [Handle-based session persistence](../../implemented/architecture/2026-08-27-handle-based-session-persistence.md) — der Write-Handle-Append-Pfad, an den ein gespeichertes Feld andocken würde.
