---
description: "JSON-Storage-Backend für Hosts und Maintainer, die Whole-Unit- und Per-Record-Dateien unter einer konfigurierten Root auswählen, konfigurieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-storage-json

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`dsh-storage-json` speichert Domain-Daten als lesbares JSON unter einer konfigurierten Root und registriert sich als Backend `json`. Sein Default-Layout `single` hält eine vollständige `<unit>.json`-Datei pro Unit; sein `per-record`-Layout hält ein versioniertes Dokument pro Record. Beide Layouts publizieren jede geänderte Datei atomar, während die Domain-Schicht Aufrufe ordnet. Wählen Sie es, wenn Betreiber inspizierbare Dateien brauchen und das gewählte Layout zum Schreibvolumen passt; wählen Sie SQLite für größere oder hochgradig nebenläufige Daten. Das Backend ist nur host-seitig und trägt keinen Prompt, kein Tool und kein Schema bei.

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

Verwenden Sie dieses Paket, wenn eine Komposition lesbaren, editierbaren JSON-Storage braucht. Routen Sie die relevanten Domains zum Backend `json`; jede Domain-Spezifikation wählt das `single`- oder `per-record`-Layout.

### Wann Sie es wählen

Wählen Sie das Default-`single`-Layout für kleine Units, die von einer vollständigen, pretty-printed Datei profitieren. Wählen Sie `per-record`, wenn Punkt-Schreibzugriffe nur ein Record-Dokument ersetzen sollen. Wählen Sie das SQLite-Backend, wenn Daten groß sind, Schreibzugriffe häufig sind oder mehrere Records transaktionale Updates brauchen.

### Konfiguration

Das einzige Plugin-Feld ist `root`, das die Unit-Dateien und -Verzeichnisse hält. Es ist erforderlich, weil das Backend nicht auf `process.cwd()` zurückfällt. Das Backend erstellt die Root bei Bedarf mit Modus `0o700`. Eine Domain-Spezifikation wählt ihr Layout; dieses Plugin hat keinen Layout-Override.

```yaml
- name: '@deepseek-ai/dsh-storage'
- name: '@deepseek-ai/dsh-storage-json'
  config:
    root: /var/lib/dsh/data
- name: '@deepseek-ai/dsh-storage-domain'
  config:
    backend: json
```

| Feld | Default | Bedeutung |
|---|---|---|
| `root` | erforderlich | Verzeichnis, das `<unit>.json`-Dateien und `<unit>/`-Bäume hält; bei Bedarf mit `0o700` erstellt |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-storage-json) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Beobachtbares Verhalten

Eine fehlende `single`-Datei oder ein fehlendes `per-record`-Verzeichnis öffnet als leere Unit und materialisiert beim ersten Schreibzugriff. In `single` wird malformed Inhalt mit `malformed-medium` abgelehnt, und eine abweichende gespeicherte Version mit `version-mismatch`. In `per-record` liest jedes malformed oder unlesbare Dokument — und jedes Dokument, dessen Version außerhalb der aktuellen und kompatiblen Versionen des Descriptors liegt — als abwesender Record, sodass ein einzelnes schlechtes Dokument die Unit nicht ablehnt. Record-Keys müssen `[a-zA-Z0-9_-]+` matchen; ein unsicherer Key wird vor jeder Dateioperation abgelehnt. Jeder aufgelöste Schreibzugriff ist durable, und Operationen nach dem Schließen werden mit `closed` abgelehnt.

Ein leerer `per-record`-Baum kann seine deklarierten Tabellen aus einem validen `<root>/<unit>.json`-Whole-Unit-Dokument nur dann initialisieren, wenn der Source-Unit-Name übereinstimmt und seine Version aktuell oder deklariert-kompatibel ist. Das Backend lässt diese Source-Datei unverändert und stempelt migrierte Records mit der aktuellen Version. Eine Source-Version außerhalb des akzeptierten Sets lässt den neuen Baum leer. Jeder Dokumentpfad in einer deklarierten Tabelle — oder ein deklariertes `global.json` — unterdrückt diese Initialisierung für die komplette Unit, selbst wenn dieses Dokument unlesbar oder stale ist.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Die beiden Layouts teilen atomare Publikation, weisen State-Ownership aber unterschiedlich zu. `single` besitzt eine In-Memory-Unit-Projektion; `per-record` behandelt seinen Verzeichnisbaum als autoritativ.

### Design-Konzept

- **`single` hält den Speicher autoritativ.** Jeder Schreibzugriff ändert die In-Memory-Unit, serialisiert ihren vollständigen State und ersetzt `<unit>.json` atomar. Eine fehlgeschlagene Publikation stellt den vorherigen In-Memory-Wert wieder her.
- **`per-record` hält das Verzeichnis autoritativ.** Jedes Put oder Delete ändert ein `<unit>/<table>/<key>.json`-Dokument, und `loadAll()` liest den Baum erneut. Jedes Dokument stempelt die Unit-Version und trägt einen Record-Wert.
- **Publikation ist pro Aufruf durable.** Ein Schreibzugriff verwendet eine temporäre Datei, fsync, atomaren `rename()`-Ersatz und ein Parent-Directory-fsync unter POSIX. Die Write-Chain der Domain-Schicht liefert die Ordnung über Aufrufe hinweg.

### Dateiformate

Ein `single`-Dokument trägt die Unit-Identität, das Global-Singleton und alle Tabellen:

```json
{
  "unit": { "name": "workspace", "version": 1 },
  "global": null,
  "tables": { "workspaces": { "<key>": { "path": "/work/demo" } } }
}
```

Ein `per-record`-Tabellendokument unter `<root>/<unit>/<table>/<key>.json` hat die Form `{ "version": 1, "record": <value> }`; der optionale Global-Wert verwendet `<root>/<unit>/global.json`. Die Formatversion kommt aus der Domain-Spezifikation.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: Backend-Registrierung, `root`-Config, Unit-Open/Close-Tabelle |
| [`src/single-unit.ts`](src/single-unit.ts) | Eine `single`-Unit: autoritativer Speicher, Write-Primitives, Publish-Rollback |
| [`src/per-record-unit.ts`](src/per-record-unit.ts) | Eine `per-record`-Unit: Baum-Reads, pfadsichere Records und Ein-Dokument-Schreibzugriffe |
| [`src/format.ts`](src/format.ts) | Whole-Unit- und Record-Serialisierung mit Versions-Validierung |
| [`src/atomic.ts`](src/atomic.ts) | Atomarer Datei-Ersatz: Temp-Write, fsync, rename, Directory-fsync |
| — | Es wird kein Runtime-Invarianten-Begleiter veröffentlicht; Korrektheit hier ist Write-Durability und Publish-then-Reparse-Äquivalenz, die Medium-Roundtrip-Tests (die geteilte Backend-Conformance-Suite) erfordern; das Backend exponiert keine kontinuierlich beobachtbare In-Process-Relation. |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn die Sicht dieses Backends nicht ausreicht: Die Subsystem-Referenz ist der autoritative Vertrag, und das Sibling-Backend zeigt das alternative Medium.

- [Storage-Subsystem](../../../docs/subsystems/storage.de.md) — der Backend-Vertrag, Domain-Semantik und die generierte API.
- [Storage-Paketkarte](../README.de.md) — die Pakete der Familie und ihre Position im Repository.
- [SQLite-Storage-Backend](../storage-sqlite/README.de.md) — das Punkt-Update-Medium für hochfrequente Daten.
- [Domain-KV-Storage-Agent-Note](../../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.de.md) — das Design hinter der Backend-Familie und ihrer zurückgestellten Arbeit.

-----

<a id="model-experience"></a>
## Model Experience

### Gespeicherte Domain-Records

#### Was das Modell sieht

Nichts. Dieses Backend trägt keinen Prompt, kein Tool und kein Schema bei; es persistiert Nicht-Session-Domain-Daten hinter `ctx.storage` ausschließlich für host-seitige Consumer.

#### Token-Effekt

Null Live-Request-Tokens.

#### KV-Cache-Effekt

Keiner — das Backend berührt nie Live-Request-Präfixe.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann dieses Backend schlecht passt oder besondere betriebliche Sorgfalt braucht. Sie sind aktuelle Paket-Einschränkungen, kein Aufgaben-Backlog.

- **`single` schreibt die ganze Unit neu** — jeder Schreibzugriff republiziert die komplette Unit-Datei; verwenden Sie `per-record` oder routen Sie die Domain zu SQLite, wenn diese Kosten zu hoch sind.
- **Kein prozessübergreifendes Write-Locking** — zwei Prozesse, die dieselbe Unit schreiben, können Ersatzvorgänge verschränken; Schreibzugriffe auf dieselbe Datei folgen Last-Completion-Wins.
- **Windows-rename ohne explizites Write-Through** — Durability beruht auf libuvs `rename()` (`MoveFileExW` mit Ersatz); das strengere Win32-Write-Through-Publish-Helper des Session-Log-Backends soll hierher nach unten wandern, wenn die `log`-Facette landet.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Die Agent Note markiert die Skalen-Prämisse des Whole-Unit-Rewrite als Risiko: Wenn ein zweiter Consumer mit tausend-Records-Skalierung auf diesem Backend landet, bevor er zu SQLite geroutet wird, treten Rewrite-Kosten früher auf als erwartet. Die Mitigation ist Konfiguration — `routes` auf das SQLite-Backend zeigen —, keine Änderung an diesem Paket.

</details>
