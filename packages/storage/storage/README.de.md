---
description: "Storage-Hub (ctx.storage) für Kompositionen und Maintainer, die benannte Storage-Backends und Data-Form-Facilities wählen, mounten oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-storage

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`dsh-storage` verwenden, um typisierte Anwendungsdaten durable zu halten, ohne sie der Session-Historie hinzuzufügen. Mit einem unterstützten Storage-Medium und Domain-Konfiguration mounten, dann können Aufrufer Records über die öffentliche `ctx.storageDomain`-API zugreifen. Es ist für Workspace-Records, Session-Sidecars oder anderen Anwendungszustand geeignet, der Neustarts überdauern muss, ohne Session-Events zu werden. Es steht nur Host-Code zur Verfügung und hat keinen modellsichtbaren Effekt; Kompositionen, die solche Daten nicht brauchen, können es weglassen.

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

Dieses Paket verwenden, um einer Komposition durable, nicht-session Storage zu geben: es zusammen mit Backend- und Data-Form-Paketen mounten, und Host-seitige Pakete lesen und schreiben validierte Records über `ctx.storageDomain`. Der Hub selbst fügt nichts Beobachtbares hinzu — er ist der Treffpunkt, der die Familie funktionieren lässt, und alles Folgende ist, was eine Komposition von ihm bekommt.

### Wann es zu verwenden ist

Den Hub immer dann mounten, wenn irgendein Paket der Komposition Daten persistiert, die kein Session-Event-Log sind — Workspace-Records, Session-Sidecars. Er wird von der Domain-Form und beiden mitgelieferten Backends benötigt, sodass die Storage-Zeilen einer Komposition `storage` plus ein Backend plus `storage-domain` sind. Die ganze Gruppe weglassen, wenn nichts solche Daten speichert; der Agent Loop braucht sie nie.

### Eine minimale Komposition

```yaml
- name: '@deepseek-ai/dsh-storage'
- name: '@deepseek-ai/dsh-storage-json'
  config:
    root: /var/lib/dsh/data
- name: '@deepseek-ai/dsh-storage-domain'
  config:
    backend: json
```

Mit diesen Zeilen registriert sich das `json`-Backend und die `domain`-Data-Form mountet; ein Consumer wie `dsh-workspace` öffnet dann seine Domain über das geroutete Backend und liest und schreibt Records über `ctx.storageDomain`. Mehrere Backends können nebeneinander gemountet bleiben; welches Backend welche Domain bedient, ist die Konfiguration der Data Form, nie eine hub-weite Wahl.

### Was man bekommt

- Ein gemountetes Backend wird per Name aufgelöst, sodass eine Komposition mit beiden mitgelieferten Backends jede Domain per Konfiguration an eines der beiden Medien routen kann.
- Eine gemountete Data Form löst als `ctx.storage.<form>` auf; die Domain-Form wird zusätzlich direkt als `ctx.storageDomain` bedient.
- Fehlkonfiguration schlägt mit einem stabilen `StorageError`-Code laut fehl statt still zu verzögern: ein unbekannter Backend-Name, ein Form-Read vor dem Mount des Owners oder eine doppelte Registrierung werfen alle.

### Fehler und Wiederherstellung

- `backend-not-found` — die Domain-Form routet an ein nicht gemountetes Backend; das Backend-Paket hinzufügen. Die Form wartet auf die Registrierung jedes konfigurierten Backends, sodass die Reihenfolge der Zeilen kein Failure-Modus ist.
- `form-not-mounted` — ein Consumer liest `ctx.storage.domain`, bevor `dsh-storage-domain` geladen ist; die Domain-Zeile vor den Consumer mounten.
- `duplicate-backend` / `duplicate-mount` — derselbe Name oder dieselbe Form registriert sich zweimal; das ist ein Kompositionsfehler und schlägt laut fehl.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Der Hub ist eine reine Registrierungstabelle mit zwei Faces, so ausgelegt, dass Backends und Data Forms austauschbar bleiben, ohne dass der Hub ihre Interna kennt.

### Designkonzept

- **Backends besitzen Medien, Data Forms besitzen Semantik.** Der Hub führt nie IO aus; er hält nur die Name → Backend-Tabelle und die Form-Name → Facility-Map. Backend-Pakete registrieren ihren Medium-Owner, Data-Form-Pakete mounten ihre Facility, und keins braucht die Details des anderen.
- **Mehrere Backends bleiben nebeneinander.** Welches Backend welchen Consumer bedient, ist die Konfiguration des Consumers (die Route-Tabelle der Domain-Form), nie ein hub-globales Entweder-oder.
- **Registrierung und Mounting sind Effects.** `register()` und `mount()` geben Disposer zurück; die Disposal entfernt nur den Beitrag dieser einen Registrierung und schließt das Backend nicht — das besitzende Plugin schließt es nach der Abmeldung.
- **Aktivierung kann nicht mit Registrierung racen.** Jedes Backend-Plugin veröffentlicht zusätzlich einen reinen Lifecycle-Service-Key (`storage.backend.<name>`); Form-Provider injizieren diese Keys, sodass die Domain-Form erst aktiviert wird, nachdem jedes konfigurierte Backend registriert ist, während Aufrufer Backends weiterhin per Name über den Hub auflösen.

### Der Backend-Contract

[`src/backend.ts`](src/backend.ts) ist der normative Contract für Backend-Implementierer, klauseweise geprüft von der gemeinsamen Conformance-Suite in `tests/contract.ts`. Ein Backend besitzt exakt ein Medium und legt optionale Data-Shape-Facets offen; `kv` ist das einzige Facet, und das Öffnen einer Unit ergibt ein versioniertes, global-singletones Schema-Handle, dessen Einzelaufrufe atomar und nach Auflösung durable sind. Unit- und Tabellennamen müssen `UNIT_NAME_RE` erfüllen; Record-Keys sind beliebige Strings, die nie Dateipfade erreichen. Die Unit serialisiert keine gleichzeitigen Schreibvorgänge — die Reihenfolge gehört dem Aufrufer — und eine gespeicherte Version, die vom Descriptor abweicht, lehnt mit `version-mismatch` ab (keine Migration).

### Source Map

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `Storage`-Service, Form-Mounting, `StorageForms`-Map |
| [`src/registry.ts`](src/registry.ts) | `BackendRegistry`: Name → Backend-Tabelle, Registrierungs-Disposer |
| [`src/backend.ts`](src/backend.ts) | Der Backend-Contract: Facets, Units, `UNIT_NAME_RE` |
| [`src/error.ts`](src/error.ts) | `StorageError`-Codes, die Hub und jedes Backend teilen |
| — | Es wird kein Runtime-Invariant-Begleitmodul veröffentlicht; der Hub ist eine reine Registrierungstabelle (Namen → Backends, Forms → Facilities), deren Konsistenz vollständig an den Call Sites erzwungen wird (doppelte/fehlende Einträge schlagen synchron laut fehl); er besitzt keinen Event Stream und kein veränderbares Medium zum Gegenprüfen. |
| [`tests/contract.ts`](tests/contract.ts) | Die gemeinsame Conformance-Suite, die gegen jedes Backend läuft |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn die Sicht des Hubs nicht ausreicht: Die Subsystem-Referenz ist der autoritative Contract, und die Agent Note hält das Familiendesign und seine zurückgestellte Arbeit fest.

- [Storage-Subsystem](../../../docs/subsystems/storage.de.md) — der Backend-Contract, Domain-Semantik, Change-Events und die generierte API.
- [Storage-Paketkarte](../README.de.md) — die Pakete der Familie und ihre Position im Repository.
- [Agent Note zur Domain-KV-Speicherung](../../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.de.md) — das Design hinter Hub, Domain-Form und Session-Backend-Migration.

-----

<a id="model-experience"></a>
## Model Experience

### Backend- und Form-Registrierungen

#### Was das Modell sieht

Nichts. `ctx.storage` ist eine Host-seitige Registrierungstabelle: Der Hub registriert keine Tools, injiziert keine Prompts und schreibt keine Session-Events, sodass kein Request-Feld je Daten dieses Pakets trägt.

#### Token-Effekt

Null direkte Tokens pro Request.

#### KV-Cache-Effekt

Unabhängig von Live-Requests: Der Hub berührt nie ein Request-Prefix und kann daher die Provider-Cache-Wiederverwendung nicht invalidieren.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen bestimmen, was der Hub nicht kann. Sie sind aktuelle Paketbedingungen, kein Aufgabenrückstand.

- **`kv` ist die einzige Data Shape** — ein Backend implementiert ein Facet; das `log`-Facet für Session-Event-Logs ist auf die Session-Backend-Migration zurückgestellt ([Agent Note](../../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.de.md)).
- **Forms lösen lazy auf** — ein Read auf `ctx.storage.domain` vor dem Mount des Domain-Plugins wirft `form-not-mounted`; Assemblies ordnen die Plugins entsprechend an, statt still zu verzögern.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
