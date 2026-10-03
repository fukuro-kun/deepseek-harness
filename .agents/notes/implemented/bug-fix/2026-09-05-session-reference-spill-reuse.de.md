# Agent Note: Reuse spill storage for truncated session references

Status: implemented

[English](2026-09-05-session-reference-spill-reuse.md) | [中文](2026-09-05-session-reference-spill-reuse.zh.md) | Deutsch

## Problem

Eine begrenzte Cross-Session-Vorschau kann ganze Messages oder den Großteil einer behaltenen Message auslassen. Ein Modell, das nur die Vorschau sieht, braucht eine genaue Rechenschaft über die Auslassung und einen Weg, den erfassten Text einzusehen, ohne die Instruktionen einer anderen Session als aktuelle Autorität zu behandeln. Ein späteres erneutes Lesen der Quelle würde dieselbe Beobachtung nicht wiederherstellen, wenn die Quelle fortschreitet oder kompaktiert.

## Decision

Die [Session-Reference-Vorbereitung](../../../../packages/context/session-reference/README.de.md) behält ihre bestehende Vorschau-Policy und ihr per-Referenz-JSON-Byte-Budget. Jede abgeschnittene Referenz versucht `saveText` über das optionale `ctx.get("spillStore")`; eine nicht abgeschnittene Referenz schreibt kein Artefakt. Vollständiges Transkript und begrenzte Vorschau leiten sich aus derselben erfassten User-/Assistant-Textprojektion ab, einschließlich Compaction-Checkpoints, aber ohne Tools, Reasoning und anderen injizierten Kontext. Es findet kein zweiter Quell-Read statt.

Das Artefakt gehört der Ziel-Session, die den Kontext empfängt. Seine beschreibende Quelle ist `{ kind: "session-reference", sessionId, label }`, wobei `sessionId` die referenzierte Session identifiziert. [Spill-Storage](../../../../packages/spill/spill/README.de.md) akzeptiert diese minimale Alternative neben der bestehenden Tool-Quelle; es erfordert weder einen erfundenen Tool-Namen noch eine Call-Id. Storage-Ownership autorisiert keinen Abruf.

Eine separate Omission-Notiz außerhalb des begrenzten Vorschau-JSON zeichnet exakte `omittedMessages` und `omittedBytes` auf. Sie trägt den gespeicherten Locator und den `retrievalHint` des Backends oder ein Unavailable-Ergebnis, das fehlenden Storage von einem fehlgeschlagenen Save unterscheidet. Diese Notiz ist modellsichtbarer Content in derselben durable Referenz-Message, keine metadata-only UI-Dekoration. Ein winziges Vorschau-Budget kann sie nicht entfernen. Das gespeicherte Transkript trägt Capture-Metadaten einschließlich `capturedFormatVersion` und dieselbe Untrusted-Background-Warnung wie die Vorschau. Pro-Message-JSON-String-Fragmente enthalten höchstens 64 Unicode-Codepoints pro Zeile; sie zu dekodieren und zu verketten stellt den exakten Text wieder her, einschließlich der ursprünglichen Zeilenumbrüche. Dieses feste Artefaktformat hält lange einzeilige Mitten mit gewöhnlichen paginierten Datei-Reads abrufbar, ohne die Vorschau-Aufbewahrung zu ändern.

Cancellation nach einem asynchronen Save verhindert die Kontext-Publikation, selbst wenn der Storage das Artefakt bereits erzeugt hat. Der Consumer fügt keine Rollback- oder Lösch-APIs hinzu; die bestehende Backend-Expiry-Policy regelt dieses Artefakt. Replay nutzt die geloggte Vorschau und Notiz und wiederholt nie den Save oder den Quell-Read.

## Alternatives considered

**Einen separaten Session-Reference-Dateistore schreiben.** Verworfen, weil private Benennung, session-scoped Ownership, Locator-Guidance und Artefakt-Lebensdauer bereits zum Spill-Storage gehören. Ein zweiter Store würde diese Policies duplizieren.

**Die Quelle beim Speichern oder Abrufen erneut lesen.** Verworfen, weil Quell-Mutation das Artefakt mit der Vorschau und seiner erfassten Sequenz uneinig machen könnte. Das Speichern der Originalprojektion bewahrt die Beobachtung.

**Omission- und Abrufdaten in das begrenzte Vorschau-JSON legen.** Verworfen, weil das das Konversationsbudget für Metadaten ausgibt und die Notiz genau dann verbergen kann, wenn das Budget am kleinsten ist. Separater durabler modellsichtbarer Text bewahrt beide Verpflichtungen.

**Tool-Provenance für jeden Spill verwenden.** Verworfen, weil eine Session-Referenz keinen modellseitigen Tool-Call hat. Erfundene Tool-Ids würden das Artefakt falsch zuschreiben statt seinen Producer zu beschreiben.

## Consequences

Das Modell kann aus einer Vorschau ausgelassenen Text einsehen, ohne das Vorschau-Budget zu erhöhen. Notizen fügen Request-Tokens außerhalb dieses Budgets hinzu, und der Abruf fügt später den angeforderten Transkripttext hinzu. Storage ist Best-Effort: Eine Unavailable-Notiz ist ehrlich über den Verlust des Abrufs, während die begrenzte Vorschau nutzbar bleibt. Ein gespeicherter Locator kann ablaufen, auch während seine Notiz in der durable Historie bleibt; dieses Feature verspricht keine permanente Archivierung und stellt keinen Content wieder her, den die Quell-Compaction bereits entfernt hat.

## Verification

Die [Unit-Suite](../../../../packages/context/session-reference/tests/session-reference.spec.ts) pinnt Omission-Zählungen, vollständige Unicode- und Steuerzeichen-Wiederherstellung, Ganz-Message-Drops, Drei-Referenzen-Isolation, fehlenden und fehlschlagenden Storage, Quell-Ausschlüsse und Mutationsisolation sowie Cancellation vor der Publikation. Der [Loader-Kompositionstest](../../../../packages/context/session-reference/tests/loader-composition.spec.ts) übt den echten lokalen Store und das paginierte `read`-Tool gegen die Mitte einer riesigen einzeiligen Message mit Ziel-Session-Storage-Ownership. Das [schlüssellose Recorded-Session-Szenario](../../../../snapshots/session/session-reference-spill/snapshot.yml) pinnt den durable modellsichtbaren Referenzkontext. Nested-Windows-Locator-Regressionen decken sowohl serialisierte Extraktion als auch Normalisierung ab, ohne unbeteiligte Backslashes umzuschreiben. Replay [normalisiert bekannte gequotete Spill-Locators](../../../../packages/test-support/session-snapshot/README.de.md) und bewahrt dabei gespeicherte Byte-Längen und Omission-Zählungen.

## Related decisions

Die [Tool-Output-Spill-Entscheidung](../architecture/2026-07-08-tool-output-spill-files.de.md) bleibt aktiv: Ihre Storage-/Policy-Trennung, Failure-Degradation, Provider-Caps und Abrufalternativen schränken Tool-Consumer weiterhin ein. Diese Note erweitert ihr Producer-Vokabular, ohne jene Begründung zu ersetzen. [Separate context injection from turn execution](../architecture/2026-07-24-separate-context-injection-from-turn-execution.de.md) bleibt die Autorität für die durable Message-Admission, und [producer-declared context forms](../feature/2026-08-05-context-form-vocabulary.de.md) bleibt die Autorität für die Recall-Präsentation.
