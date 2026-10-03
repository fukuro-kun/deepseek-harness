---
description: "Loader-Integration für generierte Typert-Artefakte: wie gemountete Pakete ihre Host-Face-Reflection und Schemas automatisch zur Runtime Registry beitragen."
kind: "package-reference"
---

# @deepseek-ai/dsh-typert-loader
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

Mit gemountetem `dsh-typert-loader` trägt jedes Paket, das in einer Loader-Composition mountet, seine generierte Typert-Reflection und Schemas automatisch zur Runtime Registry bei — und zieht sie wieder zurück, wenn das Paket oder das Plugin unmountet. Pakete ohne den generierten Export werden übersprungen, sodass das Hinzufügen des Plugins zu jeder Composition sicher ist. Eine explizite `packages`-Liste deckt Plugins ab, die hinter einem anderen Loader-Eintrag verschachtelt sind und deren fibers keinen auflösbaren Package Specifier tragen. Es ist ein Node-only-Plugin und braucht den Config-Tree-Resolution-Anchor, um Pakete aufzulösen.

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

Dieses Plugin in einer Host-Loader-Composition mounten, die Pakete lädt, die generierte Typert-Artefakte veröffentlichen. Die Registry selbst kommt von `dsh-typert-registry`; dieses Plugin entdeckt und registriert nur.

### Minimale Konfiguration

Registry und loader laden; der loader entdeckt standardmäßig jeden Loader-Eintrag:

```yaml
- name: '@deepseek-ai/dsh-typert-registry'
- name: '@deepseek-ai/dsh-typert-loader'
```

| Feld | Default | Bedeutung |
|---|---|---|
| `packages` | `[]` | Zusätzlich zu registrierende Paket-Artefakte für Plugins, die hinter einem anderen Loader-Eintrag verschachtelt sind; jedes muss aus dem Config Tree auflösbar sein und `./typert` exportieren |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-typert-loader) ist die erschöpfende Quelle für jedes akzeptierte Feld.

### Was registriert wird

Jeder qualifizierende Loader-Eintrag trägt seine generierte Host-Face-Reflection und Schemas zur Runtime Registry bei. Die Registrierung folgt dem Entry-Lifecycle: Sie wird zurückgezogen, wenn der Eintrag oder das Plugin unmountet, und eine Registrierung, deren Import erst nach dem Verschwinden beider settled, wird verworfen.

### Beobachtbares Verhalten und Fehler

Pakete ohne den Export werden still übersprungen. Resolution-Verdicts und importierte manifests werden für die Prozesslebensdauer gecacht, sodass das Hinzufügen eines `./typert`-Exports einen Restart erfordert. Ein malformed Artifact unter den bereits gemounteten Einträgen lässt die Aktivierung laut fehlschlagen; ein späterer Fehler wird pro Paket geloggt, ohne die Registrierung unbeteiligter Pakete zu verhindern. Ein expliziter `packages`-Eintrag, der sich nicht aus dem Config Tree auflösen lässt oder dem der Export fehlt, schlägt laut fehl und nennt das Paket.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie der loader scannt, validiert und registriert; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designkonzept

Das Plugin ist ein inkrementeller Scanner, der die Node-Hälfte der client-modules spiegelt: Jede Cordis `internal/plugin`-Emission markiert den Entry-Namen des fibers als dirty, und ein Microtask-Flush gleicht jeden dirty Namen gegen die Live-Loader-Einträge ab; der Aktivierungsdurchlauf seedet dieselbe dirty Menge mit allen aktuellen Einträgen.

### Manifest-Validierung

`validateTypertManifest()` ist die Modul/Datei-Grenze: Das manifest wandert von einem Build-Artefakt in die typisierte Registry, daher wird jedes Feld geprüft. Das manifest muss das exportierende Paket nennen, face `host` tragen, zod-v4-Schema-Instanzen enthalten und wohlgeformte Service-, Event-, Object-, Member-, Type- und Dokumentations-Records vorhalten; Invocation Descriptors müssen strikte Codecs verwenden. Jeder Fehler nennt Paket und Defekt.

### Caching und Ownership

Verdicts (auflösbarer Specifier, Export vorhanden) und importierte manifests werden pro Paketname gecacht und laufen nie ab. Registrierungen sind per Entry-Name gekeyt und werden über den exakten `ctx.typert.register()`-Disposer zurückgezogen; in-flight Tasks werden pro Eintrag getrackt, sodass ein später Import keinen Beitrag registrieren kann, nachdem sein Owner verschwunden ist.

### Source Map

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `Config`, Scanner, Manifest-Validierung, Registrierungs-Verdrahtung |
| — | Es wird kein Runtime-Invariant-Companion veröffentlicht; der Loader-Entry-Lifecycle besitzt direkt jeden exakten Registry-Disposer, und Integrationstests beobachten Registrierung und Entfernung. |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn der Paket-Contract nicht ausreicht; sie führen vom loader zu dem, was er registriert, und zu dem, was es erzeugt.

- [Typert Registry](../registry/README.de.md) — der Service, den dieses Plugin speist.
- [Typert Generator](../generator/README.de.md) — was die Artefakte produziert, die der loader importiert.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-typert-loader) — die `packages`-Felddeklaration und ihr JSDoc.
- [Typert-Gruppenübersicht](../README.de.md) — die vollständige Type-Reflection-Pipeline.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da die Loader-Integration nur generierte Artefakte registriert; jede modellsichtbare Projektion gehört den Consumern.

#### KV-Cache-Effekt

Kein direkter Effekt; Registrierungsänderungen erreichen einen Request nur über einen Consumer, der die Registry liest.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, was der loader nicht entdeckt oder registriert; sie sind aktuelle Paket-Constraints, kein Aufgabenstau.

- **Nur Host Face** — die Discovery importiert nur das Host-`./typert`-Artefakt; Client-Runtimes brauchen einen separaten Composition-Owner, bevor eine entsprechende Discovery ergänzt wird.
- **Explizite Einträge für verschachtelte Plugins** — Loader-Einträge werden automatisch entdeckt, aber Plugins, die hinter einem anderen Eintrag verschachtelt oder gar nicht vom Loader geladen sind, brauchen einen expliziten `packages`-Eintrag oder direktes `ctx.typert.register()`-Ownership.
- **Gecachte Verdicts laufen nie ab** — ein Paket, das mitten im Prozess einen `./typert`-Export erhält, braucht einen Restart, bevor der loader es registriert.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
