---
description: "Nominale String- und Number-Typen mit zustandslosen Konstruktoren für Pakete, die verwechselbare Domain-Werte besitzen."
kind: "package-library"
---

# @deepseek-ai/dsh-brand

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

`dsh-brand` macht strukturell identische Strings oder Numbers auf Typebene nicht austauschbar: Eine `SessionId` kann nicht dort übergeben werden, wo eine `ToolCallId` erwartet wird, und eine Event-Sequenznummer kann nicht dort übergeben werden, wo ein Log-Offset gefordert ist. `brandString<T>()` und `brandNumber<T>()` vergeben nominale Brands ohne geteilten Runtime-State, sodass besitzende Pakete Domain-Typen definieren können, ohne eine unzugehörige Capability zu importieren.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Brande einen Domain-Wert, wenn er eine Paketgrenze überschreitet und plausibel mit einem anderen Wert verwechselt werden könnte, der durch dasselbe Primitiv repräsentiert wird; nicht jeder String und jede Number braucht einen Brand. Ein gebrandeter Wert ist ein Contract für TypeScript-Caller: Er gelangt nur in Funktionen, die seine Domain erwarten, und ein anderer Brand wird zur Compile-Zeit zurückgewiesen.

### Einen String branden

Deklariere den gebrandeten Typ im besitzenden Paket und wende ihn an der Stelle an, an der dieses Paket einen String zulässt:

```ts
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'

export type SessionId = Branded<'SessionId'>

const sessionId = brandString<SessionId>('session-1')
```

`brandString()` ändert nur den statischen Typ und führt keine Runtime-Validierung durch. Validiere die Domain-Grammatik vor dem Aufruf, wenn der besitzende Typ eine hat. Einmal gebrandet, vergleicht, loggt und serialisiert sich die Id wie ein gewöhnlicher String und überquert so die Wire.

### Eine Number branden

Deklariere einen numerischen Brand in seinem besitzenden Paket und wende ihn erst an, nachdem dieses Paket die Number zugelassen hat:

```ts
import { brandNumber, type BrandedNumber } from '@deepseek-ai/dsh-brand'

export type SessionSeq = BrandedNumber<'SessionSeq'>

const seq = brandNumber<SessionSeq>(7)
```

`brandNumber()` gibt die ursprüngliche Number zurück und führt keine Validierung durch. Das besitzende Paket validiert Anforderungen wie den nicht-negativen Safe-Integer-Bereich vor dem Branding. Vergleich, Arithmetik, Logging, JSON-Serialisierung und Wire-Transport behalten gewöhnliches Number-Verhalten; Arithmetik erzeugt eine ungebrandete Number, die der Owner erneut zulassen muss, bevor sie wieder in die Domain eintritt.

### Wann branden

Brande Werte, die Paketgrenzen überschreiten und plausibel verwechselt werden könnten — `ToolCallId` in `dsh-llm`, die geteilte Agent/Session-`SessionId` in `dsh-session`, `JobId` in `dsh-jobs` und `SessionSeq` gegenüber `SessionLogOffset` in `dsh-session`. Werte, die lokal bleiben oder nicht verwechselt werden können, brauchen diese Abstraktion nicht.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Das Paket definiert zwei Intersection-Typen, `string & { readonly [BRAND]: B }` und `number & { readonly [BRAND]: B }`, wobei `BRAND` ein modulprivates `unique symbol` ist.

### Source Map

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Gebrandete String- und Number-Typen mit zustandslosen Konstruktoren |
| — | Es wird kein Runtime-Invarianten-Companion veröffentlicht; dieses reine Utility besitzt weder einen Event-Stream noch mutable Runtime-Daten; seine Wertealgebra wird durch Unit-Tests abgesichert. |

### Wie Werte portabel bleiben

Das private Symbol existiert zur Laufzeit nie: TypeScript löscht es, sodass gebrandete Werte weder Tag noch Prototype haben. `brandString()` und `brandNumber()` geben ihre Eingaben unverändert zurück. Getrennt installierte Kopien erzeugen daher austauschbare Werte, ohne eine Registry oder Konstruktor-Identität zu teilen.

### Warum es dependency-frei bleibt

Diese Helper in einem eigenen Paket zu halten bedeutet, dass `dsh-jobs` `JobId` branden kann, ohne ein unzugehöriges Capability-Paket zu importieren, während jede Capability weiterhin die Bedeutung und Validierung ihrer konkreten Ids besitzt.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn du die Werte brauchst, die diese Primitive branden, oder die Typkonventionen um sie herum.

- [Core-Subsystem](../../../docs/subsystems/core.de.md) — wo der geteilte `SessionId`-Brand und die Typregeln dokumentiert sind.
- [LSP-Subsystem](../../../docs/subsystems/lsp.de.md) — `LspProviderId`, eine gebrandete Provider-Id auf Basis dieses Primitivs.
- [Jobs-Paket](../../jobs/jobs/README.de.md) — der `JobId`-Brand, im Besitz der Jobs-Capability.

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
