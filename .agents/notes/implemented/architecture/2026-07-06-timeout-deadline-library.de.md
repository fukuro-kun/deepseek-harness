# Agent Note: Ein gemeinsames Timeout-/Deadline-Primitiv, Hard-Kill bleibt bei der jeweiligen Fähigkeit

Status: implemented

[English](2026-07-06-timeout-deadline-library.md) | [中文](2026-07-06-timeout-deadline-library.zh.md) | Deutsch

## Problem

Die Timeout-Behandlung driftete über die tool-tragenden Fähigkeiten hinweg auseinander, und die Divergenz war nicht oberflächlich — es war dieselbe Logik, dreifach re-implementiert, jede mit ihrer eigenen subtilen Korrektheitslast.

- **bash** (damals in der bash-lokalen Implementierung in `run.ts`) hatte ein vollständiges, korrektes Timeout in der Prozess-Verarbeitung: ein config-geklemmtes `timeoutMs`, zwei unabhängige Auslöser — ein `killTimer` für das Timeout und ein `onAbort`-Listener für Upstream-Abbruch — die jeweils eine `kill()`-Closure aufriefen, die den Subprozess-Terminierungspfad steuerte, sowie zwei orthogonale Ergebnis-Booleans (`timedOut`, `aborted`), die unabhängig gesetzt wurden. Nach dieser Konsolidierung reagiert die Prozess-Verarbeitung — [packages/subprocess/subprocess-local/src/spawn.ts](../../../../packages/subprocess/subprocess-local/src/spawn.ts) — nur noch auf Abbrüche; [packages/shell/bash-local/src/index.ts](../../../../packages/shell/bash-local/src/index.ts) besitzt die fusionierte Deadline und die `timedOut`/`aborted`-Klassifikation.
- **web_fetch** ([packages/web/web-fetch-http/src/provider.ts](../../../../packages/web/web-fetch-http/src/provider.ts)) hatte ein korrektes, aber *handgeschriebenes* Timeout: Es konstruierte einen `AbortController`, verdrahtete `setTimeout(() => controller.abort(new WebError(…, 'WEB_FETCH_TIMEOUT')))`, fügte den Upstream-Signal-Listener manuell hinzu und entfernte ihn, räumte den Timer in einem `finally` auf und gewann den Timeout-Grund über einen `translateAbortOrNetwork`-Helper aus `signal.reason` zurück, weil der Reader ein nacktes `AbortError` an die Oberfläche gibt.
- **web_search** ([packages/web/tool-web/src/search.ts](../../../../packages/web/tool-web/src/search.ts)) hatte **überhaupt kein Timeout**: `WebSearchRequest` ([packages/web/web/src/types.ts](../../../../packages/web/web/src/types.ts)) trägt kein `timeoutMs`-Feld, und das `search()` jedes Providers reicht nur `exec.signal` weiter. (web_search bleibt hier ohne Timeout — siehe Konsequenzen.)

Jedes neue Externer-Prozess- oder Netzwerk-Tool leitete dieselben vier Dinge erneut her — den angefragten Wert klemmen, einen Timer starten, das Timeout mit Upstream-Abbruch fusionieren und „timed out" von „cancelled" auf dem Rückweg unterscheiden — und die Fusion sowie die Grund-Rückgewinnung sind genau die Teile, die man leicht subtil falsch macht (web_fetchs `signal.reason`-Tanz ist der Beleg). Gleichzeitig ist die *Terminierung*, die jede Fähigkeit ausführt, unvermeidbar verschieden: bash bittet seinen Subprocess-Provider, einen OS-eigenen Bereich zu terminieren, während web einen prozessinternen `fetch` abbricht und undici den Socket abbauen lässt. Die [Native-Containment-Entscheidung](2026-08-28-subprocess-native-containment.md) besitzt die lokalen Scope-, Job- und Fallback-Mechanismen; es gibt keinen einzelnen Mechanismus, der die Arbeit jeder Fähigkeit stoppen kann.

## Entscheidung

`@deepseek-ai/dsh-timeout` liegt unter `packages/util/` (peer zu `dsh-brand`) und besitzt die *Timing- und Klassifikations*-Hälfte von Timeout; die *Terminierungs*-Hälfte — der Hard-Kill — bleibt in der Implementierung jeder Fähigkeit. Es ist eine Bibliothek reiner Funktionen, **kein** Cordis-Service oder -Plugin: Sie nimmt kein `ctx`, registriert nichts, hält keinen aufrufübergreifenden Zustand und emittiert keine Events. Es gibt bewusst keinen zentralen „Timeout-Service", der wissen müsste, wie man die Arbeit jeder Fähigkeit stoppt — dieses Wissen ist genau das, was ein Mikrokernel aus gemeinsamen Schichten heraushält, und was Codex' nur-exec `ExecExpiration`-Scope demonstriert.

### Die Bibliotheks-API

Vier Funktionen, ein Watchdog-Interface und ein Reason-Typ:

```ts ignore-check
/** The internal reason attached to a timeout abort, so consumers can classify it after the fact. */
export class TimeoutReason extends Error {
  override name = 'TimeoutReason'

  constructor(readonly code: string, readonly timeoutMs: number) {
    super(`${code} after ${timeoutMs}ms`)
  }
}

/** Validate/fill a caller's optional positive hint from the backend's default, then cap at its max. */
export function clampTimeout(
  requested: number | undefined,
  def: number,
  max: number,
  name = 'timeoutMs',
): number

/**
 * Build a deadline signal that aborts on upstream cancellation OR on timeout,
 * with the timeout carrying a `TimeoutReason`. `timeoutMs <= 0` means "no
 * timeout" (background jobs): forward only the upstream signal, arm no timer.
 * The returned object's `[Symbol.dispose]` clears the timer — `using` for a
 * scope-lifetime consumer, a manual call for an event-lifetime one.
 */
export function deadline(
  upstream: AbortSignal | undefined,
  timeoutMs: number,
  code: string,
): { signal: AbortSignal; [Symbol.dispose](): void }

/** A stable signal plus one-at-a-time, timer-guarded async-iterator demand. */
export interface IdleWatchdog {
  readonly signal: AbortSignal
  next<T>(iterator: AsyncIterator<T>): Promise<IteratorResult<T>>
  pulse(): void
  [Symbol.dispose](): void
}

/** Arm only while one iterator `next()` is outstanding; rearm on later demand or out-of-band activity. */
export function idleWatchdog(
  upstream: AbortSignal | undefined,
  timeoutMs: number,
  code: string,
): IdleWatchdog

/** Recover the TimeoutReason from an aborted signal (or error); `code` scopes the match to this deadline's timer. */
export function timeoutOf(x: AbortSignal | { reason?: unknown }, code?: string): TimeoutReason | undefined
```

`deadline` fusioniert ein Upstream-Signal mit einem Einmal-Timer über `AbortSignal.any`, fügt einen typisierten `TimeoutReason` hinzu und exponiert disposable Timer-Aufräumung. Nicht-positive Timeouts sind ein internes Kein-Timeout-Sentinel für Backend-eigene Hintergrundarbeit; externe Hinweise laufen durch `clampTimeout` und müssen positiv und endlich sein. Ohne Timer oder Upstream-Signal gibt die Funktion ein nie abbrechendes Signal mit derselben Disposal-Form zurück. `idleWatchdog` verlangt dagegen ein positives endliches Intervall, hält ein stabiles fusioniertes Signal für den gesamten Stream und armiert seinen Timer nur, solange ein Iterator-`next()` aussteht; Auflösung entwaffnet ihn, spätere Nachfrage armiert erneut, und `pulse()` armiert dieselbe ausstehende Nachfrage nach Out-of-Band-Transportaktivität erneut. Ein Puls außerhalb ausstehender Nachfrage oder nach Disposal ist ein No-Op; nebenläufige Nachfrage schlägt fehl, und Disposal räumt die aktive Armierung auf. Provider übersetzen Timeout-Gründe in seam-spezifische Ergebnisse. `timeoutOf(signal, code)` begrenzt die Klassifikation, sodass eine äußere verschachtelte Deadline als Upstream-Abbruch gelesen wird statt als Timeout der inneren Fähigkeit.

### Die Arbeitsteilung

| Belang | Eigentümer |
|---|---|
| Request-Hinweis validieren und Default/Max klemmen | `dsh-timeout` (`clampTimeout`) — reine Arithmetik plus der gemeinsame positiv-endliche Request-Vertrag |
| Einmal-Timer armieren, bei Deadline abbrechen, Grund tragen, mit Upstream-Abbruch fusionieren | `dsh-timeout` (`deadline`) |
| Nur um ausstehende Iterator-Nachfrage armieren und erneut armieren, einschließlich Out-of-Band-Aktivität | `dsh-timeout` (`idleWatchdog`) |
| Timer aufräumen | `dsh-timeout` (`[Symbol.dispose]` auf beiden Primitiven) |
| Ersten Abbruchgrund nach dem Abort klassifizieren | `dsh-timeout` (`timeoutOf`) |
| **Die Arbeit tatsächlich terminieren** | die Implementierung der Fähigkeit |
| Die Default/Max-*Werte* | die Config der Fähigkeit |
| Der Timeout-`code`-String | die Fähigkeit (`WEB_FETCH_TIMEOUT` ≠ `BASH_TIMEOUT`) |

Das Signal *benachrichtigt* nur; Terminierung ist immer Aufgabe des Listeners, und der Listener unterscheidet sich je Fähigkeit. bash schreibt sein eigenes `addEventListener('abort', kill)`, weil der OS-Prozess außerhalb dieser Runtime lebt und sein Subprocess-Provider den eigenen Bereich zur Abrechnung treiben muss; web reicht `d.signal` an `fetch` und undici baut den Socket ab. Deshalb nehmen Datei-Lese/Schreib/Edit **kein** `timeoutMs`: Ein lokaler Syscall ist bestenfalls best-effort-abbrechbar, ein Timeout könnte `fsync`/`rename` nicht zum Stoppen zwingen, und eines hinzuzufügen wäre ein impliziter Default, der explizit-vor-implizit verletzt. Beide Referenz-Agenten lassen Datei-I/O aus demselben Grund ungetimet.

### Wie jede Fähigkeit es konsumiert

- **web_fetch** — das Tool bleibt validieren-und-weiterreichen; der handgeschriebene Controller + `setTimeout` + manueller Listener + `finally` + `signal.reason`-Rückgewinnung des Providers wird durch Provider-eigenes `deadline`/`timeoutOf` ersetzt. Ein vorab abgebrochenes Upstream-Signal wirft weiterhin `WEB_ABORTED` vornweg; sonst läuft `fetch` gegen das fusionierte `d.signal`, und `translateAbortOrNetwork` klassifiziert einen geworfenen Fehler am Signal (`timeoutOf` → `WEB_FETCH_TIMEOUT`, sonst aborted → `WEB_ABORTED`, sonst Netzwerk → `WEB_PROVIDER_ERROR`). Der öffentliche Fehlercode-Vertrag ist unverändert, und `TimeoutReason` überschreitet nie als öffentlicher Fehler den Web-Seam.
- **bash** — `resolve()` klemmt den Request in eine explizite Spec. Vordergrund-`run()` erzeugt die Deadline und reicht ihr Signal an die Prozessausführung, deren Abort-Listener `SubprocessHandle.terminate()` aufruft und denselben Provider-verwalteten Bereich abwartet. Der Executor klassifiziert den ersten Abort als Timeout oder Abbruch. Hintergrund-Starts bleiben timeout-frei und reichen nur Upstream-Abbruch weiter.
- **LLM-Adapter** — `dsh-llm-deepseek` und `dsh-llm-pi-ai` umhüllen die tatsächliche Transport-Iteration mit `idleWatchdog`. Das konfigurierte Fünf-Minuten-Intervall deckt nur ausstehende Provider-Nachfrage ab, nicht die Zeit, die der Downstream-Konsument zwischen Chunks verbringt. Der direkte DeepSeek-Adapter pulst diese ausstehende Nachfrage zusätzlich, wenn sein SSE-Parser einen Kommentar beobachtet, ohne den Kommentar als `StreamChunk` zu yielden oder ins Session-Log zu schreiben. Das pi-ai SDK exponiert keine Kommentar-Aktivität an seinen Adapter, sodass dieser Pfad nur rearmieren kann, wenn das SDK yieldet. Das stabile Signal erreicht `fetch` oder das SDK für den gesamten Call, sodass Timeout den zugrundeliegenden Request schließt und auf `TIMEOUT` abbildet, während ein früherer Caller-Abort auf `ABORTED` abbildet.

## Konsequenzen

- Das Ergebnis von `runBash` setzt `timedOut` und `aborted` nicht mehr unabhängig; ein Timeout und ein User-Abort, die vor Prozessende racen, melden jetzt eine einzelne erste Abort-Ursache statt beide wahr. Timeout-Klassifikation ändert Provider-eigene Terminierung nicht: Lokale POSIX-Bereiche nutzen TERM→Gnadenfrist→KILL, während gewöhnliche Windows-Bereiche sofort terminieren. Der Service-Definition-Typ `ShellRunResult` behält beide Booleans (jetzt wechselseitig exklusiv), sodass die Ergebnisdarstellung von `dsh-tool-bash` unberührt bleibt.
- `SpawnSpec.timeoutMs` und `SpawnOutcome.timedOut`/`aborted` wurden entfernt statt als immer-null/immer-false-Überreste behalten: Da `runBash` keinen Timer besitzt und der Executor die Klassifikation besitzt, wurden sie nirgends gelesen. Ein immer-0-Feld, das nichts liest, ist totes Gewicht unter der Per-Datei-Coverage-Gate.
- web_fetch legte seinen maßgeschneiderten Controller/Timer/Listener/Grund-Rückgewinnung ab; der Klassifikator schlüsselt jetzt am Deadline-Signal (`timeoutOf` + `aborted`) statt an der Form des geworfenen Fehlers, was sowohl über die Request-Phase reject-with-reason als auch über die Read-Phase bare-`AbortError` robust ist.
- `AbortSignal.any` und `using`/`Symbol.dispose` kommen hier zum ersten Mal ins Repo (Node ≥ 24 Baseline, bereits erfüllt).
- Modell-Streams teilen jetzt einen rearmierbaren Timer-Vertrag, ohne ein gleitendes Idle-Intervall in eine Gesamt-Call-Deadline zu verwandeln oder Konsumenten-Denkzeit zu belasten. Adapter, die Out-of-Band-Transportaktivität beobachten können, dürfen eine ausstehende Nachfrage pulsen; unterdrückte Aktivität bleibt für den Watchdog unsichtbar. Das Primitiv benachrichtigt weiterhin nur; Adapter-Tests beweisen, dass ihre Transporte sein stabiles Signal beobachten und terminieren.

Außerhalb des Scopes, benannt zur Markierung der Grenze: `web_search` kann ein optionales modellseitiges `timeout_ms` bekommen, sobald seine Tool-Schema/Snapshot-Abdeckung geplant ist; die ripgrep-gestützten fs-Discovery-Tools ([packaged ripgrep search](../../archived/architecture/2026-08-01-packaged-ripgrep-search.md)) konsumieren dieselbe Provider-eigene Deadline-Form über `dsh-tool-call-timeout-policy` und `exec.signal`; eine `tools/execute`-Waterfall-Middleware könnte eine Default-Deadline für jeden Tool-Call armieren, indem sie `exec.signal` treibt — das wäre ein Plugin, das diese Bibliothek *konsumiert* und trotzdem nur benachrichtigt, während der Hard-Kill Aufgabe jeder Fähigkeit bleibt.

## Erwogene Alternativen

**Ein vereinheitlichtes Timeout-*Plugin* / `ctx.timeout`-Service.** Auf Mikrokernel-Gründen abgelehnt. Ein Service, der die Arbeit jedes Tools stoppen könnte, müsste jeden Terminierungsmechanismus jeder Fähigkeit verstehen (nativer Scope- oder Job-Termination, Fallback-Prozessgruppen-Signalisierung, Socket-Teardown, Syscall-Grenzen-Checks) — das „Kernel weiß zu viel", das die Architektur verbietet. Codex' `ExecExpiration` ist genau deshalb auf die Exec-Familie begrenzt, weil der Kill, den es treibt (`killpg`), prozessfamilien-spezifisch ist; MCP und Modell-Stream behalten ihre eigenen. Es gibt keine kohärente Mittelschicht, die Terminierung für alles besitzt, also kann das gemeinsame Stück nur die reine Timing/Klassifikations-Hälfte sein — eine Bibliothek, kein Service.

**Ad-hoc-Timeout pro Tool, kein gemeinsamer Code (der bisherige Status quo und Claude Codes Wahl).** Abgelehnt, weil es bereits Divergenz und duplizierte Korrektheitslast produzierte: web_fetch schrieb genau die Controller/Reason-Logik von Hand, die zukünftige Netzwerk-/Prozess-gestützte Tools jeweils neu herleiten müssten, und die Fusion + `signal.reason`-Rückgewinnung sind die fehleranfälligen Teile. Claude Code toleriert vollständige Duplikation; dieses Repo hat einen einzigen gemeinsamen Abort-Kanal (`exec.signal` auf jedem `execute`), der ein kleines gemeinsames Primitiv strikt sauberer macht, sodass die Kosten/Nutzen-Rechnung anders ausfällt.

**Ein `withTimeout(promise, ms)`-Wrapper statt einer Signal-Fabrik.** Abgelehnt, weil das Racen eines Promises gegen einen Timer das *Tool-Call*-Promise bei Deadline auflöst, ohne die zugrundeliegende Arbeit zu stoppen — der Child-Prozess oder Fetch-Socket leckt weiter. Ein Signal auszugeben und von der Fähigkeit zu verlangen, zuzuhören, ist das, was einen echten Terminierungspfad erzwingt. Das spiegelt die defensive Regel „dispose muss Quieszenz erreichen, nicht nur anfordern".

**Getrennte bash-Timeout- und Cancellation-Auslöser beibehalten.** Abgelehnt, weil ein Deadline-Signal den maßgeschneiderten Timer entfernt und die Klassifikation standardisiert. Racer-Ursachen melden, welcher Abort zuerst ankam, während der Provider-eigene Terminierungspfad unabhängig davon ist, welche Ursache gewann.
