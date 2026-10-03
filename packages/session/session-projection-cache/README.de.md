---
description: "Der persistierte Session-Projection-Cache für Deployments und Maintainer, die durable Checkpoints, Zero-I/O-Listenreads und beschleunigte kalte Projection-Folds wählen, konfigurieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-session-projection-cache
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Dieses Paket hält durable per-Session-Projection-Checkpoints, damit History-Listen, Statistiken und Goal-Snapshots gecachte Werte lesen können, ohne jedes Session-Log zu laden. Kalte Projection-Folds können hinter dem checkpointeten Präfix fortsetzen und reduzieren so die Restart-Arbeit. Das Session-Log bleibt autoritativ: Ein Crash kann einen Checkpoint stale hinterlassen, aber niemals vor den committed Events, und inkompatible Records werden ignoriert oder gesichert. Wähle es für restarted Sessions mit häufigen Projection-Reads; überspringe es, wenn Projections nur live sind oder zusätzliche Storage-Writes und unbegrenzte Checkpoint-Aufbewahrung die eingesparte Arbeit aufwiegen.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Modell-Erfahrung](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev-Notiz](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Mounte dieses Paket neben der Projection-Registry und dem Storage-Stack, wenn Clients Projection-Werte für kalte Sessions auflisten sollen, ohne deren Logs zu laden. Ohne es müssen Consumer das Log beschaffen, bevor sie kalte Projection-Werte rekonstruieren können.

### Wann es wählen

Wähle es, wenn ein Deployment Sessions restartet und durable Projection-Werte für History-Listen, Statistiken oder Goal-Snapshots braucht. Überspringe es, wenn Projections nur Live-Sessions bedienen oder die zusätzlichen Storage-Writes mehr kosten als die eingesparte Projection-Arbeit.

### Minimale Konfiguration

Beide Throttle-Felder sind erforderlich — die Flush-Kadenz ist eine Deployment-Entscheidung ohne universell richtigen Wert:

Der Cache öffnet seine Domain über den Storage-Stack, daher mountet die Base `storage`, `storage-json` (Root `dshHomePath('storages')`) und `storage-domain` (`backend: json`) vor ihm:

```yaml
- id: session-projection-cache
  name: '@deepseek-ai/dsh-session-projection-cache'
  config:
    writeEveryEvents: 200
    writeIntervalMs: 5000
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `writeEveryEvents` | erforderlich | Committed Events pro Session, die zwischen den Pflichtpunkten einen durable Checkpoint-Write erzwingen |
| `writeIntervalMs` | erforderlich | Längste Zeit, die ein dirty Checkpoint zwischen den Pflichtpunkten ungeschrieben bleiben darf |

Das Plugin injiziert `storageDomain`, `sessionProjections` und `sessions`. Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-session-projection-cache) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Wie Checkpoints geschrieben werden

Drei Pflichtpunkte schreiben immer: Die Session-Erzeugung persistiert den aus dem Seed abgeleiteten Cut, `turn/end` persistiert den Wert, den Listing-Reads wollen, und das Session-Disposal persistiert den finalen Live-Cut. Dazwischen schreiben die konfigurierten Count- und Intervall-Throttles, während Events akkumulieren. Jeder Write ersetzt den vollständigen Record der Session atomar über die Domain-Write-Chain; ein Fehlschlag loggt eine Warnung und lässt den Cache stale, und der nächste Write heilt sich selbst.

### Gecachte Werte lesen

`cachedSnapshot(meta, inheritedEventCount)` liefert Client-Werte synchron mit null I/O aus den In-Memory-Tabellen der Storage-Domain. Es akzeptiert nur einen identitätsgleichen Record und versions- und schema-gleiche Keys und liefert dann einen `{ asOfSeq, values }`-Cut am niedrigsten bedienten Row-Watermark. `cachedPredecessorTitle(meta, inheritedEventCount)` ist die engere, nur dem Listing vorbehaltene Ausnahme: Ein strukturell zugelassener Predecessor-Record, dessen Lifecycle passt, darf nur eine current-version-kompatible `title`-Row exponieren. Der Title ist ein möglicherweise stale Fakt aus einem durable Präfix, kein Fold-Seed; er trägt das Sentinel `asOfSeq: -1`, weil eine kardinalitätsändernde Session-Migration die numerische Sequenz der Predecessor-Row invalidieren kann. Alle anderen Predecessor-Rows bleiben unverfügbar. Ein unseeded Listing weiß, dass sein Cut null ist; ein seeded, nur aus dem Header bestehendes Listing kennt den numerischen Cut nicht und überspringt beide Fast-Paths, bis ein autoritativer Body-Read ihn liefert. `coldSnapshot(meta, inheritedEventCount, events)` akzeptiert den exakten Cut mit einem vollständigen geordneten Log, überspringt beim Folden das checkpointete Präfix und frischt den Record auf, ohne selbst Persistence zu lesen.

### Was der Cache garantiert

Das Log führt, der Cache folgt: Ein Live-Checkpoint flusht die gepufferten Events der Session durably, bevor die Cache-Row landet, sodass ein Crash den Cache hinter das Log zurückfallen lassen kann, aber nie vor es. Reads und Writes teilen sich den kohärenten In-Memory-State der Storage-Domain; die per-Unit-Write-Chain mutiert den Speicher erst nach Durability. Jeder version-gestempelte Record muss zum Live-Unit-Schema und zur vollständigen Lifecycle-Identität (`formatVersion`, `createdAt`, `cwd`, `isSeeded` und `inheritedEventCount`) passen, sodass eine aus einer anderen Session-Format-Generation oder einem Fork-Cut gefaltete Row den Caller nicht seeden kann. Das JSON-Backend speichert jeden Record unter `<root>/session_projcache/sessions/<id>.json` in einem Owner-only-Verzeichnisbaum.

Upgrades kosten niemals den Boot und exponieren keinen unbewiesenen Fold. Records, die mit einer Version aus `compatibleVersions` des Specs gestempelt sind, bleiben für ein aktuelles Checkpoint-Rewrite strukturell lesbar, aber eine fehlende oder ältere `formatVersion` passt nie zu einer aktuellen Session und kann daher keine Hydration seeden. Ein lifecycle-passender Predecessor-Title bleibt nur über den obigen Listing-Hint verfügbar, weil Title-Text über die benachbarten Session-Format-Kanten hinweg invariant ist und seine Row weiterhin die aktuelle Projection-`stateVersion` und das Schema besteht. Sobald das Format passt, dekodieren fehlende Lineage-Felder als die unseeded Lineage — exakt für unseeded Sessions, während ein seeded Caller den Identity-Match nicht besteht und kalt refoldet. Ein gespeicherter Record, der die Schema-Validierung weiterhin nicht besteht, wird als `<id>.json.bak.<stamp>` beiseitegelegt — gemäß der `invalidRecords: 'backup-and-skip'`-Policy der Domain —, mit seiner Ursache geloggt und vom nächsten Checkpoint neu gebaut.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen</summary>

Dieser Abschnitt erklärt Durability und Storage-Ownership des Caches; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) abgedeckt.

### Designkonzept

Der Cache ist ein Fold-Shortcut über dem Checkpoint-Gesicht der Projection-Registry, gespeichert in einer `per-record`-Domain-Datentabelle. Er bindet sich an sechs Konsequenzen: Reads umgehen nie die Domain-Write-Chain; jeder Background-Write ist fail-soft; ein `ver`-Mismatch verwirft eine Row statt sie zu migrieren; ein Record muss das `stateSchema` der Live-Unit bestehen; Writes ersetzen einen vollständigen Session-Record über die lossless-JSON-Grenze; und das Log führt, der Cache folgt.

### Read- und Write-Ownership

Der Cache speichert ein version-gestempeltes Dokument pro Session in der `session_projcache`-Domain. Er hängt nicht von einem Session-Persistence-Backend ab, ruft `locate` nicht auf und inspiziert keine per-Session-Verzeichnisse. Ein malformed oder stale Record liest sich als abwesend, und Consumer, die einen kalten Wert brauchen, besitzen jeden Log-Refold.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `SessionProjectionCache`-Service, Write-Behind-Listener, Cache-Reads |
| [`src/spec.ts`](src/spec.ts) | Der `session_projcache`-Domain-Spec und die Record-Identity-Typen |
| — | Es wird kein Runtime-Invariant-Companion veröffentlicht; die Korrektheitsrelation des Caches (eine gespeicherte Row gleicht dem Registry-Fold an ihrem `seq`-Watermark) ist nur durch erneutes Ausführen des Folds über das persistierte Log prüfbar — das würde die Implementierung duplizieren statt Drift zu erkennen —, und seine Staleness ist by design (fail-soft Writes). Die durable Grenze wird durch den eigenen Zod-Parse des Caches bei jedem Read schema-validiert, und die Versions-/Watermark-Guards der Read-Ladder sind durch den Paket-Spec bewiesen. |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der paketweite Vertrag nicht ausreicht. Sie führen vom Cache zur Registry, die er checkpointet, und zur Storage-Domain, die seine Records hält.

- [Session-Projection-Subsystem](../../../docs/subsystems/session-projection.de.md) — der Projection-Unit-Vertrag und die Drive-Semantik, die dieser Cache checkpointet.
- [Session-Projection-Registry](../session-projection/README.de.md) — der `ctx.sessionProjections`-Service, dessen Checkpoints dieser Cache persistiert.
- [Storage-Subsystem](../../../docs/subsystems/storage.de.md) — das Domain-Routing und Backend-Verhalten, die Cache-Records speichern.
- [Session-Paketkarte](../README.de.md) — benachbarte Persistence-, Title- und Telemetrie-Pakete.
- [Session-Projection-RFC](../../../.agents/notes/proposed/architecture/2026-07-27-session-projection-and-command-log.de.md) — die Design-Begründung des persistierten Projection-Cache.

-----

<a id="model-experience"></a>
## Modell-Erfahrung

Keine, da der persistierte Cache host-seitige Reads des Projection-State beschleunigt und nichts Modellseitiges registriert.

#### KV-Cache-Effekt

Keiner; der Cache assembliert oder sendet niemals Provider-Requests.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wo der Cache betriebliche Sorgfalt braucht. Sie sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Keine Eviction- oder Retention-Oberfläche** — Records akkumulieren pro Session; das Entrümpeln gespeicherter Checkpoints ist Out-of-Band-Wartung, dieselbe Haltung wie bei der Session-Persistence selbst.
- **Intervall-Throttle ist per-Session grob** — der Timer armt beim ersten dirty Event nach einem sauberen Write; ein stetiger Rinnsal unter dem Schwellwert schreibt einmal pro Intervall, kein Sliding Window.
- **Kein cache-seitiger Cold-Refold** — der Cache bedient und erfrischt seine Rows, liest aber nie das Session-Log (er hängt nicht von der Persistence-Schicht ab); ein Consumer, der einen garantierten kalten Snapshot braucht, refoldet selbst aus dem Log.
- **Jede Schema- oder Domain-Versions-Änderung muss ihre Upgrade-Story beweisen** — eine Änderung am gespeicherten Record-Schema oder an der Domain-Version landet im selben PR mit einem archivierten Fixture des zuvor ausgelieferten On-Disk-Formats unter `tests/fixtures/` und Testfällen in `tests/fixtures.spec.ts`, die die gewählte Disposition beweisen: Read-kompatible Recovery (`compatibleVersions`), Current-Version-Rewrite oder Backup-and-Skip-Salvage. Ein Bump, dessen alte Records schlicht verworfen werden, beweist weiterhin, dass das Verwerfen weder den Boot scheitern lässt noch den Baum vergiftet.

<a id="dev-note"></a>
### Dev-Notiz

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen</summary>

Keine.

</details>
