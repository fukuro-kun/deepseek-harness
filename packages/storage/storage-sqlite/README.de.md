---
description: "SQLite-Storage-Backend für Hosts und Maintainer, die Document-per-Row-KV-Speicherung in einer Datenbankdatei wählen, konfigurieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-storage-sqlite
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`dsh-storage-sqlite` ist ein Storage-Backend, das jede geroutete Unit in einer SQLite-Datenbankdatei beherbergt und jeden Record als ein JSON-Dokument pro Zeile speichert; registriert als Backend `sqlite`. Ein einzelner Record-Update berührt exakt eine Zeile — genau das macht es zum richtigen Medium für hochfrequente, punktuelle Schreibvorgänge. Es ist zu wählen, wenn sich Domain-Daten häufig ändern oder das Deployment eine abfragbare Datenbank bevorzugt; das JSON-Backend ist zu wählen, wenn die Daten als einfache Dateien lesbar sein sollen. Das Backend ist reine Host-Seite: Es steuert keinen Prompt, kein Tool und kein Schema bei, sodass Modell und Agent Loop es nie sehen.

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

Dieses Paket verwenden, wenn eine Komposition häufig aktualisierte Domain-Daten in einer Datenbank hält: Die relevanten Domains zu diesem Backend routen, und jede Unit materialisiert sich als Tabellen in der konfigurierten Datenbankdatei.

### Wann es die richtige Wahl ist

Es ist zu wählen, wenn Schreibvorgänge häufig und punktuell sind — jeder Key mappt auf exakt eine Zeile, sodass ein Update eines Records eine Zeile berührt statt eine ganze Datei neu zu schreiben. Das JSON-Backend ist zu wählen, wenn Menschen die gespeicherten Daten als einfache Dateien prüfen oder bearbeiten. Der synchrone `node:sqlite`-Treiber blockiert den JavaScript-Thread für die Dauer jedes Einzel-Statement-Aufrufs, was auf Domain-Daten-Niveau in Ordnung ist, bei hohen Schreibraten aber mitzukalkulieren.

### Konfiguration

Zwei Felder: der Datenbankpfad und der Journal Mode. `:memory:` öffnet eine prozessinterne Datenbank, deren Inhalt mit dem Prozess verschwindet.

```yaml
- name: '@deepseek-ai/dsh-storage'
- name: '@deepseek-ai/dsh-storage-sqlite'
  config:
    path: /var/lib/dsh/data.db
- name: '@deepseek-ai/dsh-storage-domain'
  config:
    backend: sqlite
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `path` | erforderlich | SQLite-Datenbankdateipfad oder `:memory:` |
| `journalMode` | `wal` | Journal Mode: `wal`, `delete`, `truncate` oder `persist` |

`wal` passt zu lokalen Disks; ein Rollback-Journal-Modus (`delete`/`truncate`/`persist`) passt zu Dateisystemen, auf denen WALs Shared-Memory-Dateien nicht funktionieren, etwa Netzwerk-Mounts. Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-storage-sqlite) ist die erschöpfende Quelle für jedes akzeptierte Feld und dessen JSDoc.

### Beobachtbares Verhalten

Fehlende Verzeichnisse und Datenbankdateien werden Owner-only erzeugt (`0o700`/`0o600`); eine existierende Datenbank behält ihre Modi. Eine Unit, deren gespeicherte Formatversion vom Descriptor abweicht, lehnt mit `version-mismatch` ab, und eine Datenbank mit einer anderen als der aktuellen physischen Layout-Version wird ganz abgelehnt — keine Migration, Pre-Release-Haltung. Fehler tragen stabile `StorageError`-Codes, und Schreibvorgänge sind nach Auflösung durable.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Das Backend ist ein Document-per-Row-Layout über einer `node:sqlite`-Verbindung, so ausgelegt, dass ein Per-Key-Update ein einzelnes Prepared Statement ist.

### Designkonzept

- **Ein Dokument pro Zeile.** Jede Unit-Tabelle wird eine physische STRICT-Tabelle `u_<unit>_<table> (key TEXT PRIMARY KEY, value TEXT)`, deren `value`-Spalte den JSON-Text des Records hält; das globale Singleton lebt in einer gemeinsamen `unit_globals`-Tabelle. Ein Key-Update berührt exakt eine Zeile — der Grund, eine hochfrequent geänderte Domain hierher zu routen.
- **Einzel-Statement-Atomarität.** Jede Schreibprimitive ist ein Prepared Statement, sodass SQLites Per-Statement-Atomarität den KV-Contract ohne explizite Transaktionen erfüllt; die Schreibreihenfolge bleibt Aufgabe des Aufrufers (die Write-Chain der Domain-Schicht).
- **Namen vor DDL validiert.** Unit- und Tabellennamen müssen `UNIT_NAME_RE` erfüllen, bevor sie DDL erreichen, sodass keine externe Eingabe je in SQL-Identifier interpoliert wird.
- **Versionen schlagen laut fehl.** Die physische Layout-Version lebt in `PRAGMA user_version` (frische Datenbanken stempeln sie zuletzt); Unit-Formatversionen leben in der `units`-Tabelle. Jeder andere gestempelte Wert wird abgelehnt — keine Migrationen.

### Öffnungssequenz

Das Öffnen der Datenbank erzeugt das Elternverzeichnis als `0o700`, erzeugt eine fehlende Datei exklusiv als `0o600`, setzt `PRAGMA foreign_keys = ON` und den Journal Mode, prüft `user_version`, erzeugt die `units`- und `unit_globals`-Metadatentabellen und stempelt frische Datenbanken zuletzt, sodass ein Fehler das Medium ungestempelt hinterlässt.

### Source Map

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: Backend-Registrierung, `path`/`journalMode`-Config, Unit-Tabelle |
| [`src/schema.ts`](src/schema.ts) | Öffnungssequenz, physische Layout-Version, Metadatentabellen, Record-Tabellenbenennung |
| [`src/unit.ts`](src/unit.ts) | Eine geöffnete Unit: Prepared Statements, JSON-Wert-Parsing, Schließen |
| — | Es wird kein Runtime-Invariant-Begleitmodul veröffentlicht; Schema-Versions- und Unit-Versions-Konsistenz sind Open-Zeit-Prüfungen, die ablehnen, bevor eine Unit existiert, und Durability braucht die Backend-Roundtrip-Tests der gemeinsamen KV-Conformance-Suite; dieses Paket legt keine kontinuierlich beobachtbare in-process Relation offen. |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn die Sicht dieses Backends nicht ausreicht: Die Subsystem-Referenz ist der autoritative Contract, und das Schwester-Backend zeigt das alternative Medium.

- [Storage-Subsystem](../../../docs/subsystems/storage.de.md) — der Backend-Contract, Domain-Semantik und die generierte API.
- [Storage-Paketkarte](../README.de.md) — die Pakete der Familie und ihre Position im Repository.
- [JSON-Storage-Backend](../storage-json/README.de.md) — das menschenlesbare Medium für kleine, prüfbare Daten.
- [Agent Note zur Domain-KV-Speicherung](../../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.de.md) — das Design hinter der Backend-Familie und die zurückgestellte Session-Backend-Migration.

-----

<a id="model-experience"></a>
## Model Experience

### Gespeicherte Domain-Records

#### Was das Modell sieht

Nichts. Dieses Backend steuert keinen Prompt, kein Tool und kein Schema bei; es persistiert nicht-session Domain-Daten hinter `ctx.storage` ausschließlich für Host-seitige Consumer.

#### Token-Effekt

Null Live-Request-Tokens.

#### KV-Cache-Effekt

Keiner — das Backend berührt nie Live-Request-Prefixe.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen bestimmen, wann dieses Backend ungeeignet ist oder besondere Betriebspflege braucht. Sie sind aktuelle Paketbedingungen, kein Aufgabenrückstand.

- **Der synchrone Treiber blockiert den Event Loop** — jeder Schreibvorgang ist ein synchroner `DatabaseSync`-Aufruf; die Blockade dauert ein einzelnes Statement, was auf Domain-Daten-Niveau akzeptabel ist.
- **Keine Busy-Wait- oder Retry-Policy** — eine konkurrierende Verbindung mit Write-Lock lehnt die Operation sofort ab statt zu warten; die Write-Chain der Domain-Schicht serialisiert Schreibvorgänge innerhalb eines Prozesses, und prozessübergreifende Koordination ist außerhalb des Scope.
- **Nur die aktuelle physische Layout-Version öffnet** — jede andere gestempelte `user_version` wird abgelehnt statt migriert (Pre-Release-Haltung).
- **Öffnungssequenz mit dem Query-Provider dupliziert** — `openDatabase` und `session-query-sqlite` erzwingen beide SQLite-Datei-Ownership, aber jedes Paket besitzt eine eigene Application Identity und ein eigenes Schema; kein gemeinsamer Medium-Helper koppelt sie.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
