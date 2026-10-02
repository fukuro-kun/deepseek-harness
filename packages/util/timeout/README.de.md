---
description: "Gemeinsame Timeout-Arithmetik, Deadline-Fusion und Timeout-gegen-Cancel-Klassifizierung für Capabilities, die einen Aufruferhinweis begrenzen, eine Deadline scharf machen und beides später unterscheiden müssen."
kind: "package-library"
---

# @deepseek-ai/dsh-timeout

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

`dsh-timeout` lässt Aufrufer Arbeit mit begrenzten Deadlines versehen, lokale Timeouts von Upstream-Cancellation unterscheiden und gestreamte Lesevorgänge auf Inaktivität überwachen. `clampTimeout` füllt einen fehlenden Hinweis aus einem Backend-Default, deckelt ihn auf das erlaubte Maximum und lehnt ungültige Werte ab, bevor die Arbeit beginnt. `deadline` kombiniert den gewählten Timeout mit Upstream-Cancellation in einem Signal, während der Aufrufer weiterhin dafür verantwortlich ist, seinen Prozess, Socket oder Task tatsächlich zu stoppen. `idleWatchdog` zählt nur die Zeit, die auf Provider-Lesevorgänge gewartet wird, und Null bleibt backend-eigener unzeitlicher Arbeit vorbehalten statt öffentlicher Konfiguration.

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

Verwende `deadline`, wenn eine Capability eine Arbeitseinheit unter einem aufrufersichtbaren Timeout ausführt, und `idleWatchdog`, wenn sie einen gestreamten Transport liest. Validiere Aufruferhinweise zuerst mit `clampTimeout`, damit das `timeoutMs`, das `deadline` erreicht, immer positiv und endlich ist.

### Einen Timeout-Hinweis begrenzen

```ts
import { clampTimeout } from '@deepseek-ai/dsh-timeout'

declare const requested: number | undefined
declare const DEFAULT_TIMEOUT_MS: number
declare const MAX_TIMEOUT_MS: number

const timeoutMs = clampTimeout(requested, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS, 'bash-local: request.timeoutMs')
```

`clampTimeout` füllt den Backend-Default, wenn der Hinweis fehlt, deckelt das Ergebnis auf das Backend-Maximum und lehnt einen nicht positiven oder nicht endlichen Hinweis mit dem aufrufergelieferten Namen ab. Null wird hier nie akzeptiert: Es ist kein öffentlicher Timeout-deaktivierender Wert.

### Arbeit unter einer Deadline ausführen

```text
import { deadline, timeoutOf } from '@deepseek-ai/dsh-timeout'

using d = deadline(upstream, timeoutMs, 'BASH_TIMEOUT')
const outcome = await runWork({ signal: d.signal })   // work listens on d.signal and terminates itself
const timedOut = timeoutOf(d.signal, 'BASH_TIMEOUT') !== undefined
const aborted = d.signal.aborted && !timedOut
```

Das Signal benachrichtigt nur: Der Aufrufer muss seine eigene Terminierung anschließen — `d.signal` an `fetch` übergeben oder auf `abort` hören und das Kind killen. Ein Promise gegen einen Timer zu racen würde den Tool-Call auflösen, während der Kindprozess oder Socket weiterleakt.

### Das Ergebnis klassifizieren

`timeoutOf(signal, code)` stellt den Timeout-Grund nur wieder her, wenn der Timer dieser Deadline zuerst gefeuert hat. Übergib deinen eigenen `code`, damit die Klassifizierung unter Verschachtelung korrekt bleibt: Wenn `upstream` selbst ein Deadline-Signal ist, liest ein fremder Timeout als gewöhnliche Upstream-Cancellation statt zu behaupten, der lokale Timer sei abgelaufen.

### Mit einem Idle-Watchdog streamen

```ts
import { idleWatchdog } from '@deepseek-ai/dsh-timeout'

declare const upstream: AbortSignal | undefined
declare const idleMs: number
declare const providerIterator: AsyncIterator<unknown>

using watchdog = idleWatchdog(upstream, idleMs, 'LLM_STREAM_IDLE_TIMEOUT')
const next = await watchdog.next(providerIterator)    // timer runs only while this read is outstanding
```

Der Timer ist nur scharf, solange ein Iterator-`next()` aussteht, und wird bei `pulse()` für Transportaktivität ohne Wert wieder scharf gemacht, sodass Consumer-Denkzeit zwischen Lesevorgängen nie als Leerlauf zählt. Das Intervall muss positiv, endlich und nicht größer als `MAX_TIMER_DELAY_MS` sein.

### Was kein Timeout bekommt

Lokale Datei-`read`/`write`/`edit` nehmen kein `timeoutMs`: Datei-I/O läuft unzeitlich, weil eine Deadline Arbeit töten würde, die das Betriebssystem noch zu Ende bringt.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Die Bibliothek baut auf einer Grenze auf: Timing und Klassifizierung teilen, den harten Kill lokal behalten.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | `clampTimeout`, `deadline`, `idleWatchdog`, `timeoutOf`, `TimeoutReason`, `MAX_TIMER_DELAY_MS` |
| — | Es wird kein Runtime-Invariant-Begleiter veröffentlicht; dieses reine Utility besitzt keinen Event-Stream und keine veränderlichen Laufzeitdaten; seine Wertalgebra wird durch Unit-Tests erzwungen. |

### Wie eine Deadline Quellen fusioniert

`deadline` armiert einen Timer und fusioniert seinen Abort über `AbortSignal.any` mit dem Upstream-Signal, das den Grund der zuerst abbrechenden Quelle übernimmt — ein Race löst also zu einer einzigen Ursache auf. Der `TimeoutReason` trägt den capability-eigenen `code` und das verstrichene `timeoutMs`; `timeoutOf` liest ihn nur, wenn der Timeout gewann, und ein Upstream-Sieg hinterlässt einen gewöhnlichen Abort-Grund. `[Symbol.dispose]` räumt den Timer ab.

### Das No-Timeout-Sentinel

`timeoutMs <= 0` armiert keinen Timer und leitet nur das Upstream-Signal weiter — oder ein nie abbrechendes Signal, wenn es keins gibt — sodass jeder Aufrufer dieselbe Aufrufform behält. Das Sentinel existiert für backend-eigene Hintergrundarbeit; externe Request-Hinweise werden validiert positiv und endlich, bevor sie `deadline` erreichen.

### Warum ein Idle-Watchdog neu arm

`idleWatchdog` hält ein stabiles fusioniertes Signal und armiert den Timer nur, solange `next()` aussteht; Auflösung entwaffnet, spätere Nachfrage oder `pulse()` armiert neu, Disposal räumt ab, und gleichzeitige Nachfrage wird abgelehnt. Nur der Transport beobachtet das Signal, daher muss der echte Provider-Read darauf hören — die DeepSeek- und pi-ai-Adapter schließen ihren Response-Body oder SDK-Request bei Abort.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn du die Consumer oder die Grenzentscheidung hinter der Bibliothek brauchst.

- [Timeout-Deadline-Bibliothek-Agent-Note](../../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.de.md) — die Shared-Timing-/Local-Kill-Grenze.
- [Tool-Call-Timeout-Policy](../../guard/timeout-policy/README.de.md) — der Consumer, der deklarierte Tool-Timeouts durchsetzt.
- [Bash-Provider](../../shell/bash-local/README.de.md) — ein Foreground-Deadline-Consumer, der eine Prozessgruppe killt.
- [Filesystem-Subsystem](../../../docs/subsystems/filesystem.de.md) — warum lokale Datei-I/O unzeitlich läuft.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt über die Timeout-Consumer, die Timeout-Ergebnisse rendern.

#### KV-Cache-Wirkung

Keine direkte Invalidierung; die Timeout-Consumer besitzen alle Request-Präfix-Änderungen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen beschreiben, was die Bibliothek bewusst nicht tut. Sie sind aktuelle Paketbedingungen, kein Task-Backlog.

- **Nur Benachrichtigung** — eine Deadline kann Arbeit nicht stoppen, die ihr Signal ignoriert; jede Capability braucht weiterhin ihren eigenen Socket-, Prozess- oder Task-Terminierungspfad.
- **`timeoutMs <= 0` ist internes Vokabular** — es deaktiviert den lokalen Timer nur, nachdem ein zuständiges Backend die Policy aufgelöst hat, nie als öffentlicher modell- oder pluginseitiger Schalter.
- **Der erste Abort-Grund gewinnt die Klassifizierung** — wenn eine Upstream-Cancellation den lokalen Timer schlägt, kann diese Schicht später nicht melden, dass ihr eigener Timeout ebenfalls abgelaufen wäre.
- **Ein Idle-Watchdog ist keine Gesamt-Deadline** — er armiert pro ausstehender Iterator-Nachfrage neu und schließt Consumer-Denkzeit bewusst aus.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
