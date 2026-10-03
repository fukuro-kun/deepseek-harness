---
description: "Unveränderliche Append-only-Listen für Projection State, mit begrenztem Kopieren beim Anhängen, Iteration in Einfügereihenfolge und Zod-Checkpoint-Validierung."
kind: "package-library"
---

# @deepseek-ai/dsh-chunked-list
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`dsh-chunked-list` lässt Aufrufer Werte anhängen und dabei frühere Listenversionen behalten, ohne die gesamte Sammlung zu kopieren. Aufrufer können jeden Wert in Einfügereihenfolge iterieren und JSON-Checkpoints mit ihrem eigenen Wert-Schema validieren. Der Subagent-Katalog nutzt es für unveränderlichen Projection State.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Entwicklerhinweis](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Diese Liste verwenden, wenn eine Append-only-Sammlung unveränderliche Versionen und JSON-kompatible Speicherung braucht. Eine leere Liste ist `undefined`; das Anhängen liefert einen neuen Kopf, ohne bestehende Knoten zu verändern. Die Liste teilt gespeicherte Werte per Referenz, daher müssen Aufrufer sie als unveränderlich behandeln.

```ts
import { appendChunkedList, iterateChunkedList } from '@deepseek-ai/dsh-chunked-list'

const first = appendChunkedList(undefined, 'first')
const second = appendChunkedList(first, 'second')
console.log([...iterateChunkedList(second)])
```

Das Beispiel erzeugt `['first', 'second']`; `first` enthält weiterhin nur seinen ursprünglichen Wert. `chunkedListSchema(valueSchema)` validiert JSON-Checkpoints und lehnt unbekannte Felder, ungültige Werte sowie leere oder übergroße Chunks ab. `.optional()` auf dem Schema verwenden, wenn das umgebende Feld ebenfalls eine leere Liste erlaubt. Die Operationen sind unter den [Quellkontrakten](src/index.ts) beschrieben.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Der neueste Chunk speichert bis zu 64 Werte. Anhänge kopieren höchstens diesen Chunk und teilen ältere Knoten — ein begrenzter O(1)-Aufwand. Die Kapazität steuert das Speicherlayout, nicht die Gesamtlänge der Liste. Die Iteration besucht alle N Werte in O(N) Zeit und nutzt O(N / 64) Scratch-Speicher, um die Chunks vom ältesten zum neuesten zu besuchen. Eine einzige Kapazitätskonstante steuert Chunk-Rollover beim Anhängen und die rekursive Zod-Validierung.

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Persistente Listenoperationen und Checkpoint-Validierung |
| [`tests/chunked-list.spec.ts`](tests/chunked-list.spec.ts) | Versionsisolation, Reihenfolge, strukturelles Teilen und Checkpoint-Akzeptanz |

Es wird kein Runtime-Invariant-Companion veröffentlicht, da diese Bibliothek keine unabhängig veränderlichen Beobachtungen hat; ihre Operationen liefern unveränderliche Werte im Besitz des Aufrufers.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

- [Utility-Paketübersicht](../README.de.md) — gemeinsame Primitive.
- [Subagent-Katalog-Entscheidung](../../../.agents/notes/implemented/architecture/2026-09-01-parent-owned-subagent-catalog.de.md) — warum Projection State Chunks verwendet.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da diese Sammlung nichts Modellseitiges registriert.

#### KV-Cache-Effekt

Nichts davon gelangt in einen Model-Request, daher bleibt die Provider-Cache-Wiederverwendung unberührt.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- **Nur Append-Zugriff** — Aufrufer, die Entfernen oder wahlfreien Zugriff brauchen, benötigen eine andere Sammlung.
- **Rekursive Checkpoints** — JSON-Serialisierung und Schema-Validierung unterliegen weiterhin den Verschachtelungsgrenzen der Laufzeit. Gespeicherte Werte müssen selbst das Serialisierungsformat des Aufrufers unterstützen.

<a id="dev-note"></a>
### Entwicklerhinweis

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
