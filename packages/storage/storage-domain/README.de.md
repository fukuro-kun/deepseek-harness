---
description: "Domain-Datenform (ctx.storageDomain) für Hosts und Maintainer, die schema-validierte, Change-emittierende KV-Domains über Storage-Backends auswählen, mounten oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-storage-domain
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

Verwende dieses Paket, um schema-validierte Key-Value-Domains zu deklarieren und sie über `ctx.storageDomain` auf einem konfigurierten Storage-Backend zu öffnen. Reads geben synchron aus validiertem In-Memory-Zustand zurück, während jeder Write durable wird, bevor er resolved, und `domain/changed` in Reihenfolge emittiert. Produkt-Pakete verwenden Domain-Handles statt direkt auf Storage-Backends zuzugreifen. Dieser hostseitige Zustand fügt keine Tools, Prompts oder Session-Events hinzu, bleibt also für Modell und Agent-Loop unsichtbar.

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

Verwende dieses Paket, wenn ein Host-Paket durable, schema-validierte Records hält — Workspace-Records, Session-Sidecar-Metadaten. Das besitzende Paket deklariert die Domain einmal; Consumer öffnen sie und erhalten synchrone Reads sowie durable, Change-emittierende Writes, ohne je ein Backend zu berühren.

### Wann es verwenden

Wähle es für alle hostseitigen Daten, die Neustarts überleben und gegen ein Schema gültig bleiben müssen: Die Domain-Form validiert jeden gespeicherten Record beim Öffnen, und jeder Write ist durable, bevor er resolved. Vermeide es, wenn die Daten in ein Session-Event-Log gehören — die Session-Persistence-Seam besitzt diese Oberfläche.

### Eine Domain deklarieren

Das besitzende Paket deklariert die Domain einmal mit `defineDomain` — Name, Version und zod-Record-Schemas — und exportiert sie. `defineDomain` schlägt beim Modul-Load laut fehl bei einem ungültigen Namen, einer nicht-ganzzahligen Version oder einem Global-Schema, das `null` akzeptiert.

```text
// Owning package, once:
const workspaceSpec = defineDomain({
  name: 'workspace',
  version: 1,
  tables: { workspaces: domainTable(workspaceRecordSchema) },
})
```

### Eine Domain öffnen und verwenden

Ein Consumer öffnet die deklarierte Domain über `ctx.storageDomain` und behält das zurückgegebene Handle; Reads sind synchron, Writes sind durable:

```text
const domain = await ctx.storageDomain.open(workspaceSpec)
await domain.table('workspaces').put(id, { path: '/work/demo' })
const record = domain.table('workspaces').get(id) // synchronous, from memory
domain.table('workspaces').update(id, (r) => ({ ...r, path: newPath }))
```

Der Aufrufer besitzt den Handle-Lifecycle und gibt ihn mit `domain.close()` frei, wenn das Feature herunterfährt (typischerweise als eigener `ctx.effect`-Disposer); Domains, die beim Unmount des Plugins noch offen sind, werden von der Facility geschlossen.

### Domains zu Backends routen

Die Konfiguration des Domain-Plugins entscheidet, welches Backend welche Domain bedient — nie der Hub. `backend` benennt die Default-Route; `routes` überschreibt sie pro Domain-Name. Eine Route, die ein unregistriertes Backend benennt, schlägt beim Öffnen laut mit `backend-not-found` fehl.

| Feld | Default | Bedeutung |
|---|---|---|
| `backend` | erforderlich | Default-Backend-Name für jede Domain ohne explizite Route |
| `routes` | `{}` | Pro-Domain-Überschreibungen: Domain-Name → Backend-Name |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-storage-domain) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Beobachtbares Verhalten und Fehlschläge

Jeder Write resolved erst, nachdem das Backend Durability bestätigt hat, und jeder emittiert ein `domain/changed`-Event in Schreib-Reihenfolge. Fehlschläge tragen stabile `DomainError`-Codes: `already-open` (der Name ist offen oder noch am Schließen), `facet-unsupported` (das geroutete Backend bedient kein `kv`-Facet), `invalid-record` (ein gespeicherter Record oder Global verletzt sein Schema, mit Tabelle und Key benannt), `missing-key` (ein `update` auf einem fehlenden Record) und `closed` (jede Nutzung nach close). Backend-Fehlschläge wie `version-mismatch` gehen unverändert durch.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Der Domain-Layer ist eine einzelne Implementierung, kein abstrahierter Seam: Consumer hängen von diesem Paket ab und berühren nie direkt Backends, was die gesamte Domain-Logik — Schema-Validierung, Write-Serialisierung, Change-Events — an einer Stelle konzentriert statt sie pro Backend zu verdoppeln.

### Designkonzept

- **Das Spec-Objekt ist die einzige Source of Truth.** `defineDomain` pinnt die Literal-Typen des Specs und validiert seine Felder beim Modul-Load des besitzenden Pakets, bevor irgendein Medium berührt wird. Record-Schemas sind zod, damit `z.infer` Consumer-Typen un-dupliziert hält; Plugin-`Config` bleibt schemastery.
- **Memory ist maßgeblich; das Medium ist die durable Projektion.** Reads sind synchron aus validiertem In-Memory-Zustand. Jeder Write queued auf einer Write-Chain pro Domain: erst Backend-Durability, dann Memory-Mutation, dann `domain/changed` — ein rejected Backend-Write lässt Memory unberührt, sodass Reads nie vom Medium abweichen.
- **Eine Write-Chain pro Domain.** `put`, `delete`, `update` und `global.set` queuen alle darauf; `update`s Transform läuft in seinem Chain-Slot, sodass parallele Updates nie interleaven. Records sind schlichte immutable Daten — zurückgegebene Werte sind die gespeicherten Objekte selbst und dürfen nicht in-place mutiert werden.
- **Writes emittieren nach dem Commit-Punkt.** `domain/changed` ist eine Notification, kein Transaktions-Teilnehmer: Ein werfender Listener wird mit geloggter Warnung eingedämmt statt den bereits durablen Write zu rejecten.

### Open-Sequenz

`DomainFacility.open(spec)` führt eine strikte Sequenz aus, wobei jeder Schritt den ganzen Aufruf fehlschlagen lässt: einen bereits offenen oder noch schließenden Namen verweigern (`already-open`); die Route auflösen (`backend-not-found`); das `kv`-Facet verlangen (`facet-unsupported`); die Unit öffnen (Backend-`version-mismatch`/`malformed-medium` gehen durch); jeden gespeicherten Record und das Global gegen die Schemas des Specs laden und validieren (`invalid-record`); die Domain konstruieren. Der Aufrufer besitzt das Handle; die Facility schließt jede beim Unmount noch offene Domain, und der Name einer geschlossenen Domain wird erst nach abgeschlossenem Teardown für das Wiederöffnen frei.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `DomainFacility`, Routing, `Config`, Form-Mounting |
| [`src/spec.ts`](src/spec.ts) | Domain-Deklarationen: `defineDomain`, `domainTable`, Deskriptor-Projektion |
| [`src/domain.ts`](src/domain.ts) | Open-Domain-Runtime: Write-Chain, Table- und Global-Handles, Close |
| [`src/events.ts`](src/events.ts) | Das `domain/changed`-Event-Vokabular |
| [`src/error.ts`](src/error.ts) | `DomainError`-Codes |
| [`src/invariant.ts`](src/invariant.ts) | Invariant-Begleiter: jedes `domain/changed` stimmt mit dem In-Memory-Zustand überein |

### Invariant

Der `storage-domain-invariant`-Begleiter registriert die besessene Beziehung: Jedes `domain/changed`-Event muss mit dem maßgeblichen In-Memory-Zustand der emittierenden Domain zum Emissionszeitpunkt übereinstimmen — eine Divergenz bedeutet, dass ein Write-Pfad die Chain übersprungen oder einen stale-Wert emittiert hat.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn die Sicht des Domain-Layers nicht reicht: Die Subsystem-Referenz ist der maßgebliche Contract, und die Agent Note hält Design und zurückgestellte Arbeit fest.

- [Storage-Subsystem](../../../docs/subsystems/storage.de.md) — der Domain-Contract, Backend-Contract, Change-Events und generierte API.
- [Storage-Paketkarte](../README.de.md) — die Pakete der Familie und ihre Repository-Position.
- [Domain-KV-Storage-Agent-Note](../../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.de.md) — warum Domains existieren, der Workspace-Consumer und zurückgestellte Arbeit wie prozessübergreifendes Change-Push.
- [Workspace-Subsystem](../../../docs/subsystems/workspace.de.md) — der erste Consumer der Domain-Datenform.

-----

<a id="model-experience"></a>
## Model Experience

### Durable Domain-Zustand

#### Was das Modell sieht

Nichts. Das Paket registriert keine Tools, injiziert keine Prompts und hängt keine Session-Events an; es speichert Nicht-Session-Daten hinter `ctx.storageDomain` und emittiert nur das prozessinterne `domain/changed`-Event, das ein Modell nur erreicht, wenn ein Consumer es über seine eigene dokumentierte Oberfläche rendert.

#### Token-Effekt

Null: Kein Text dieses Pakets gelangt in eine Modellanfrage.

#### KV-Cache-Effekt

Unabhängig: Domain-Reads und -Writes berühren nie Request-Prefixe, sodass hier nichts die Provider-Cache-Wiederverwendung invalidieren kann.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann der Domain-Layer schlecht passt oder besondere betriebliche Sorgfalt braucht. Sie sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Change-Sichtbarkeit nur im Einzelprozess** — `domain/changed` ist ein prozessinternes Event; ein zweiter Host-Prozess oder eine sich neu verbindende GUI beobachtet keine Änderungen, bis das prozessübergreifende Revisionsmuster landet ([Agent Note](../../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.de.md)).
- **Keine Cross-Table-Transaktionen, Sekundärindizes oder mehrteilige Keys** — jeder Write berührt einen Record; diese Erweiterungen sind in der Out-of-Scope-Liste der Agent Note zurückgestellt.
- **Keine Datenmigration** — eine Domain, deren gespeicherte Version von ihrem Spec abweicht, lehnt beim Öffnen ab (`version-mismatch`); ein Schema zu ändern erfordert, die gespeicherten Daten von Hand zu migrieren.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
