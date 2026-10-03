# Agent Note: JSONL-only First-Party-Session-Persistenz

Status: implemented

[English](2026-08-30-jsonl-only-session-persistence.md) | [中文](2026-08-30-jsonl-only-session-persistence.zh.md) | Deutsch

## Problem

Das Produkt liefert JSONL als autoritativen Session-Store aus und nutzt ihn tatsächlich, während der optionale SQLite-Session-Persistence-Provider denselben logischen Service über ein zweites physisches Format dupliziert. Jeder Session-Vertrag, jede Event-Envelope-Änderung, Recovery-Regel, Package-Graph, Platform-Lane und Format-Transition trägt daher eine zweite Implementierungs- und Testmatrix, obwohl die ausgelieferten Profile ihn nicht auswählen. Die Released-Session-Format-Migration braucht außerdem eine exakte Per-Session-Quell-Generation, die unangetastet bleibt, während ein versionsbenannter Nachfolger publiziert wird; der Einzel-Datenbank-Provider würde ein separates Immutable-Generation-Transaction-Design erfordern, ohne ein aktuelles Deployment zu bedienen.

Der SQLite-Fulltext-Session-Query-Provider ist kein alternativer autoritativer Store. Er beobachtet die Persistenz über `ctx.sessionPersistence` und pflegt einen separaten, wegwerfbaren abgeleiteten Index. Der generische SQLite-Domain-KV-Provider ist ebenfalls unabhängig von Session-Logs.

## Decision

`@deepseek-ai/dsh-session-persistence-jsonl` ist die einzige First-Party-Implementierung von `ctx.sessionPersistence`. Die abstrakte Service-Definition bleibt backend-neutral, sodass ein Out-of-Tree-Provider denselben Service implementieren kann, aber das Repository besitzt und testet ein autoritatives physisches Session-Format.

Das Package `@deepseek-ai/dsh-session-persistence-sqlite`, seine Schema-Ressourcen, backend-spezifischen Tests, die Konfigurationsoberfläche und die Windows-Differential-Lane sind nicht vorhanden. Package-übergreifende Persistenztests nutzen den echten JSONL-Provider oder einen owner-lokalen Fake. `@deepseek-ai/dsh-session-query-sqlite` bleibt der optionale FTS5-Query-Provider über einer separaten, rebuildbaren Datenbank, und `@deepseek-ai/dsh-storage-sqlite` bleibt der generische Domain-KV-Provider.

Bestehende Datenbanken, die vom entfernten Provider geschrieben wurden, werden vom aktuellen Build weder geöffnet noch migriert. Ein Operator, der ihre Inhalte braucht, muss einen Build verwenden, der diesen Provider noch enthält, und die logische Session vor dem Upgrade exportieren.

## Alternatives considered

- **SQLite als Opt-in-Differential-Backend behalten.** Abgelehnt, weil ein nicht ausgewählter Produktions-Provider weiterhin jede Durable-Format-, Lifecycle-, Plattform- und Migrationspflicht vervielfacht; Contract-Fakes und der JSONL-Provider decken den geteilten Service ab, ohne ein zweites autoritatives Format zu behalten.
- **Ein Read-Only-SQLite-Import-Package behalten.** Abgelehnt, weil es den Package-Graph und die Schema-Pflege ohne nachgewiesenen Deployment-Bedarf bewahren würde. Ein Recovery-Tool kann später entworfen werden, falls reale zurückbehaltene Datenbanken eines brauchen.
- **Die Session-Query-SQLite-Datenbank als Persistenz nutzen.** Abgelehnt, weil diese Datenbank eine wegwerfbare Projektion mit eigener Ownership, eigenem Schema und eigener Rebuild-Semantik ist; sie als Autorität zu behandeln würde zwei unverbundene Storage-Rollen verschmelzen.

## Consequences

Session-Persistenz hat ein First-Party-physisches Format und einen First-Party-Durability-Pfad. Der Migrations-Stack kann Pfad, Bytes und Inode einer Per-Session-JSONL-Generation unverändert lassen, während er ausschließlich einen finalen Nachfolger publiziert — ohne ein paralleles Datenbank-Transaction-Protokoll zu implementieren. SQLite-Search bleibt verfügbar, und seine Integrationstests beweisen, dass es JSONL beobachtet, statt eine autoritative Datenbank zu teilen.

Das Entfernen des Providers ist ein bewusster Kompatibilitätsschnitt für dessen Opt-in-Datenbankdateien. Die Änderung verkleinert die Implementierungs- und CI-Oberfläche, entfernt aber auch die stärkere Datenbank/WAL-Storage-Option; ein zukünftiger Provider braucht einen aktuellen Owner, Deployment-Bedarf, vollständige Shared-Contract-Evidenz und eine eigene Format-Transition-Policy.
