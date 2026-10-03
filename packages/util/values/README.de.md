---
description: "Verlustfreie JSON-Validierung, losgelöste Snapshots, Deep-Freeze, strukturelle Gleichheit und Exhaustive-Union-Helfer für Laufzeitpakete."
kind: "package-library"
---

# @deepseek-ai/dsh-util-values

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`dsh-util-values` gibt Laufzeitpaketen eine Implementierung für verlustfreie JSON-Werte, unveränderliche Objektgraphen, strukturelle JSON-Gleichheit und erschöpfende Fehlerschläge bei geschlossenen Unions. Aufrufer können nicht vertrauenswürdige Werte validieren, einen JSON-Snapshot ablösen, einen zu veröffentlichenden Wert einfrieren, JSON-kompatible Daten vergleichen oder einen unerreichbaren Zweig terminieren, ohne ein Capability-Paket zu importieren. Die Helfer halten keine gemeinsame Registry, keine Konstruktor-Identität und keinen veränderlichen Modulzustand.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Entwicklerhinweis](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

### JSON-Daten validieren oder als Snapshot ablösen

`isJsonValue()` für ein Predicate verwenden und `snapshotJsonValue()`, wenn der Aufrufer zusätzlich eine losgelöste Kopie braucht. Beide akzeptieren nur verlustfreie JSON-Wurzeln: `null`, Booleans, endliche Zahlen außer negativer Null, Strings, dichte intrinsische Arrays sowie einfache oder null-prototype-Records mit aufzählbaren String-Schlüsseln. Zyklen, dünn besetzte Arrays, eigene Symbol- oder nicht aufzählbare Eigenschaften, Funktionen und Klasseninstanzen werden abgelehnt.

```ts
import { isJsonValue, snapshotJsonValue, type JsonValue } from '@deepseek-ai/dsh-util-values'

declare const input: unknown

if (!isJsonValue(input)) throw new TypeError('expected lossless JSON')
const snapshot = snapshotJsonValue(input) as JsonValue
```

### Werte veröffentlichen oder vergleichen

`deepFreeze(value)` friert einen Objektgraphen in-place ein und gibt denselben Wert zurück. Es durchläuft aufzählbare string-keyed Kinder und lässt lebende `AbortSignal`-Objekte bewusst veränderlich. `deepEqualJson(a, b)` vergleicht JSON-kompatible Arrays und Records strukturell; Aufrufer müssen feindliche oder unbeschränkte Werte vor dem Vergleich validieren.

### Eine Discriminated Union abschließen

`assertNever(value, context?)` im Default-Zweig einer geschlossenen Discriminated Union verwenden. Eine neu hinzugefügte Variante lässt dann jeden erschöpfenden Switch bei der TypeScript-Kompilierung scheitern, während ein Laufzeitwert, der seinem deklarierten Typ entkommen ist, mit dem optionalen Kontext-Label wirft.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Der JSON-Validator nutzt einen expliziten Arbeitsstack und verfolgt nur die aktive Vorfahrenkette, sodass tief verschachtelte Werte den JavaScript-Callstack nicht verbrauchen und wiederholte nicht-zyklische Referenzen gültig bleiben. Snapshot-Schreibzugriffe verwenden eigene Daten-Eigenschaften, auch für Namen wie `__proto__`. Die übrigen Helfer leiten ihr Ergebnis nur aus ihren Argumenten ab und halten zwischen Aufrufen keinen Zustand.

### Quell-Übersicht

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | JSON-Werttyp, Validierungs- und Snapshot-Traversierung, strukturelle Gleichheit, Deep-Freeze und Exhaustive-Union-Fehlerschlag |
| — | Es wird kein Runtime-Invariant-Companion veröffentlicht, da diese Wertoperationen keinen gemeinsamen Laufzeitzustand haben; Unit-Tests decken ihre Algebra ab. |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

- [Utility-Paketübersicht](../README.de.md) — benachbarte zustandslose Helfer.
- [Session-Subsystem](../../../docs/subsystems/session.de.md) — dauerhafte Events, die verlustfreies JSON erfordern.
- [Tools-Subsystem](../../../docs/subsystems/tools.de.md) — Schema-Validierung und kanonische Tool-Ergebnisse auf Basis von `JsonValue`.

-----

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- **`deepEqualJson` setzt JSON-kompatible Eingaben voraus** — es ist kein allgemeiner Objekt-Komparator und definiert keine Semantik für Prototypen, Symbole, Accessoren, Zyklen, Maps oder Sets.
- **`deepFreeze` folgt aufzählbaren string-keyed Kindern** — es verwandelt beliebige Host-Objekte nicht in unveränderliche Daten und überspringt lebende `AbortSignal`-Instanzen bewusst.

<a id="dev-note"></a>
### Entwicklerhinweis

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
