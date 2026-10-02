---
description: "Die Laufzeit-Typert-Registry: speichert generierte Paket-Reflexion, live Zod schemas und Remote-Aufrufdeskriptoren und löst sie für Consumern auf."
kind: "package-reference"
---

# @deepseek-ai/dsh-typert-registry

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`dsh-typert-registry` macht generierte Typert-Artefakte zur Laufzeit abfragbar: die Reflexion jedes Pakets — Services, Events und Objekte —, seine live Zod schemas und Remote-Aufrufdeskriptoren liegen unter stabilen Schlüsseln, die Consumer bei Bedarf abfragen oder auflösen können. Registrierungen sind atomar und fiber-scoped: ein Beitrag landet ganz oder gar nicht und wird automatisch zurückgezogen, wenn die registrierende Komponente entlädt. Derselbe Service hostet die lookup- und scoped-Context-Provider-Registries, über die Remote-Aufrufe aufgelöst werden. Er führt keine TypeScript-Analyse aus und erzeugt keine schemas; dafür sind Generator und loader zuständig.

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

Mounten Sie die Registry in jeder Host- oder Client-Komposition, die generierte Typert-Artefakte speichert oder konsumiert; sie stellt `ctx.typert` bereit. Es gibt keine Konfiguration.

### Minimales Setup

Laden Sie das Registry-Plugin; die Client-Seite wird von den eigenen Metadaten der Client-Laufzeit auf dieselbe Weise installiert, und beide Seiten führen dieselbe Implementierung aus:

```yaml
- name: '@deepseek-ai/dsh-typert-registry'
```

### schemas und Reflexion abfragen

Consumer lesen schemas mit `get(key)`, `resolve(key)` oder `list(filter?)` und Paket-Reflexion mit `getPackage(name, face?)` oder `listPackages(filter?)`. `resolve()` unterscheidet einen fehlerhaften Schlüssel, ein fehlendes Paket und ein registriertes Paket, das unter diesem Namen kein schema beiträgt — jeweils mit eigenem Fehler. `toJSONSchema(key)` projiziert ein live Zod schema auf JSON Schema, ohne zu cachen.

### Einen Beitrag registrieren

Generierte Artefakte registrieren sich in Loader-Kompositionen über den [loader](../loader/README.de.md); jeder andere Eigentümer ruft `ctx.typert.register(contribution)` direkt auf und erhält genau den disposer, der den Beitrag zurückzieht. Doppelte Paket-face-Identitäten, schema-Schlüssel, Aufruf-ids oder Endpunkte lehnen den gesamten Batch ab, bevor irgendetwas committed wird.

### lookup- und Context-Provider

Remote-Aufrufe lösen Host-Objekte und scoped Contexts über `ctx.typert.lookups` und `ctx.typert.contexts` auf. `registerHost()` installiert die Host-wire-Deklaration und ihren wire-zu-Context-resolver, während `configureHost()` nur diesen resolver ersetzt. `registerClient()` installiert den bidirektionalen Client-Adapter für dieselbe merge-deklarierte Art. Host-zu-Client-Eventquellen tragen ihre Domain-Identität explizit, statt sie aus einem Context zurückzuprojizieren.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie die Registry Beiträge speichert und besitzt; die Consumer-API wird in [Dieses Paket verwenden](#use-this-package) behandelt.

### Designkonzept

Die Registry beruht auf einem Prinzip: ein Beitrag ist ein atomarer, fiber-eigener Commit. `register()` validiert zuerst die Paket-face-Identität, schemas und Aufrufdeskriptoren und committed dann alles unter einem einzigen Cordis effect, dessen disposer genau diesen Beitrag zurückzieht. Doppelte Identitäten scheitern an der besitzenden Operationsgrenze, bevor sich irgendein Zustand ändert.

### Unterregistries

- `ctx.typert.local` — Aufrufdefinitionen der aktuellen Umgebung, einschließlich `hasSeen()`-Historie für den source-mode-Fallback.
- `ctx.typert.remotes` — vom Consumer ausgewählte Beiträge, gemountet in der aufrufenden fiber.
- `ctx.typert.lookups` — lookup-Provider plus kompositionseigene resolver-Overrides pro Schlüssel.
- `ctx.typert.contexts` — Host-Context-Provider und Client-Context-binder pro scoped Schlüssel.

Jede Unterregistry publiziert `TypertRegistryChange`-Events an abonnierte Listener; ein werfender Listener wird geloggt und stoppt spätere Listener nicht.

### Identität und Validierung

Schlüssel sind stabil: `<package>#<face>` für Reflexion, `<package>#<name>` für schemas und `<namespace>/<method>` für Endpunkte. Die Validierung lehnt Namen mit `#`, wire-Namen außerhalb der RPC-Segmentgrammatik, doppelte Schlüssel und lookup-Definitionen ab, deren wire-Deklaration sich während der Registry-Lebensdauer ändert; strikte Codecs müssen ein parsebares schema tragen.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/service.ts`](src/service.ts) | `TypertRegistry`-Service, Stores, Validierung, effect-Verdrahtung |
| [`src/types.ts`](src/types.ts) | Beitrags-, Record- und Filtertypen |
| [`src/client/index.ts`](src/client/index.ts) | Client-Seite, die dieselbe Registry installiert |
| — | Es wird kein Runtime-Invarianten-Begleiter veröffentlicht; schema- und package-reflection-Records mutieren gemeinsam innerhalb von register/dispose, ohne unabhängiges Event oder zweite Datenquelle zum Gegenprüfen; doppelte Identitäten scheitern an der besitzenden Operation. |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der paketweite Vertrag nicht reicht; sie führen von der Registry zu dem, was sie speist und was sie konsumiert.

- [Typert loader](../loader/README.de.md) — automatische Registrierung generierter Host-Artefakte.
- [Typert-Generator](../generator/README.de.md) — was die Beiträge erzeugt, die die Registry speichert.
- [Typert-Protokoll](../protocol/README.de.md) — die Deskriptoren, Codecs und Provider-Verträge, die die Registry bedient.
- [Typert-Subsystem-Referenz](../../../docs/subsystems/typert.de.md) — der wörtliche `ctx.typert`-Vertrag.
- [API-Gateway-Referenz](../../../docs/api-gateway.de.md) — der Hauptkonsument von Aufrufdeskriptoren und Providern.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da die Consumer dieser Laufzeit-Typregistry (cordis_inspect, wire faces, Gates) jede modellsichtbare Projektion des Registry-Inhalts besitzen.

#### KV-Cache-Auswirkung

Keine direkte Auswirkung; ein Consumer, der Reflexion oder schemas in einen Request legt, besitzt die daraus resultierende Präfixänderung.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, was die Registry speichert und ablehnt; sie sind aktuelle Paketrestriktionen, kein Aufgabenrückstand.

- **Kein Graph-Merging** — die Registry speichert generierte Reflexion pro face, mergt aber keine Host- und Client-Graphen und löst keine TypeScript-Referenzen auf; das ist Sache von Analyzer und Emitter.
- **schema-Schlüssel ohne face** — Host und Client laufen in getrennten Kontexten; das Registrieren gleichnamiger schemas aus beiden faces in einem Kontext wird daher als Duplikat abgelehnt.
- **JSON-Schema-Projektion ungecached** — `toJSONSchema()` liefert pro Aufruf ein frisches Dokument; Consumer, die wiederholt projizieren, besitzen das Caching.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
