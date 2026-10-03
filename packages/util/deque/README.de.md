---
description: "Zirkuläre Deque für Host- und Browser-Pakete, die amortisiert konstante Queue-Operationen, sofortige Freigabe entfernter Einträge und begrenzten freien Speicher brauchen."
kind: "package-library"
---

# @deepseek-ai/dsh-deque

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

`dsh-deque` lässt Host- und Browser-Pakete langlebige In-Process-Queues entleeren, ohne nach jeder Entfernung jeden verbleibenden Eintrag zu verschieben. Caller können Einträge anhängen oder voranstellen und sie mit amortisiert konstanten Operationen von vorn entfernen. Die Deque besitzt Eintragsreihenfolge und Freigabe des Backing-Storages; jeder Consumer besitzt weiterhin Wake-up-, Failure-, Cancellation-, Capacity- und Overload-Verhalten.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

### Wann verwenden

Verwende `Deque<T>`, wenn sich Einträge über asynchrone Arbeit hinweg ansammeln können und der Consumer FIFO-Entfernung, optionales Einfügen vorn oder explizites Queue-Clearing braucht. Endliche lokale Worklists können Arrays bleiben, wenn ihre maximale Größe die Kosten der Head-Entfernung irrelevant macht.

### Einstiegspunkt

Importiere die Deque, hänge Einträge am Tail an und prüfe `size`, bevor du einen Eintrag entfernst, dessen Typ `undefined` enthalten darf:

```ts
import { Deque } from '@deepseek-ai/dsh-deque'

const frames = new Deque<string>()
frames.pushBack('first')
frames.pushFront('before-first')

while (frames.size > 0) {
  console.log(frames.popFront())
}
```

Die Methoden erzwingen kein Queue-Limit und übersetzen keine Consumer-Fehler. Siehe [`src/index.ts`](src/index.ts) für den exakten TypeScript-Vertrag.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Die Deque speichert Einträge in einem zirkulären Array. Das Entfernen eines Eintrags leert diesen Slot sofort, während geometrisches Wachstum und Viertelvoll-Schrumpfen die Kopierarbeit amortisiert konstant halten und verhindern, dass ein Head-Cursor unbegrenzt wachsenden freien Speicher zurückhält.

### Source-Map

| File | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Zirkuläre Deque-Operationen und Backing-Storage-Lifecycle |
| — | Es wird kein Runtime-Invarianten-Companion veröffentlicht, weil diese Collection keinen Event-Stream und keinen geteilten mutablen Zustand besitzt; Unit-Tests decken ihre Ordering- und Storage-Lifecycle ab. |
| [`tests/deque.spec.ts`](tests/deque.spec.ts) | FIFO-, Front-Insertion-, Wrapping-, Growth-, Compaction-, Clearing- und Reuse-Abdeckung |
| [`benchmarks/drain.ts`](benchmarks/drain.ts) | Reproduzierbares Backlog-Drain-Timing über wachsende Queue-Größen |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

- [Utility-Paket-Karte](../README.de.md) — die übrigen Zero-Dependency-Primitive, die paketgruppenübergreifend geteilt werden.
- [Linear-Stream-Queue-Entscheidung](../../../.agents/notes/archived/bug-fix/2026-08-28-linear-stream-queue-drain.md) — warum Produktions-Streams diese Deque statt Array-Head-Entfernung nutzen.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da diese In-Process-Collection nichts Modell-zugewandtes registriert.

#### KV-Cache-Effekt

Nichts hiervon gelangt in einen Model-Request, sodass Provider-Cache-Reuse unbeeinflusst bleibt.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>

- **Keine Capacity-Policy** — die Deque begrenzt, merged oder lehnt keine Einträge ab; jeder Consumer muss ein zu seinem Stream passendes Overload-Verhalten definieren.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
