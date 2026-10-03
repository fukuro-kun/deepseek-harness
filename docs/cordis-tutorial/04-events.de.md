# 4. Events
[English](04-events.md) | [中文](04-events.zh.md) | Deutsch


Services unterstützen direkte Aufrufe; **Events** erlauben einem plugin, etwas mitzuteilen, ohne zu wissen, welche plugins zuhören. Das harness verwendet Events für Interaktionen wie tool-Ergebnisse, Modell-Anfragen und Genehmigungsentscheidungen.

## Deklarieren, auslösen, zuhören

Erstelle `stats.ts` in `tmp/cordis-tutorial` — ein service, der zählt und jede Änderung bekannt gibt:

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    stats: StatsService
  }
  interface Events {
    'stats/report'(name: string, count: number): void
  }
}

export class StatsService extends Service {
  private counts = new Map<string, number>()

  constructor(ctx: Context) {
    super(ctx, 'stats')
  }

  bump(name: string) {
    const next = (this.counts.get(name) ?? 0) + 1
    this.counts.set(name, next)
    this.ctx.emit('stats/report', name, next)
  }
}

export const name = 'stats'

export function apply(ctx: Context) {
  ctx.plugin(StatsService)
}
```

Das `interface Events` merge ist das event-system-Pendant des `interface Context` merge aus Kapitel 3: Es deklariert den event-Namen und seine listener-Signatur, sodass `ctx.emit` und `ctx.on` vollständig typisiert sind. Die `namespace/action`-Namenskonvention hält den flachen event-Namespace lesbar.

Erstelle `reporter.ts`:

```ts ignore-check
import type { Context } from '@deepseek-ai/cordis'
import type {} from './stats.ts'

export const name = 'reporter'
export const inject = ['stats']

export function apply(ctx: Context) {
  ctx.on('stats/report', (name, count) => {
    console.log(`[stats] ${name} -> ${count}`)
  })
  ctx.stats.bump('tool_call')
  ctx.stats.bump('tool_call')
  ctx.stats.bump('prompt')
}
```

Die Zeile `import type {} from './stats.ts'` importiert nichts zur Laufzeit; sie existiert, damit TypeScript die declaration merges sieht. Komponiere und führe aus:

```yaml
- name: './stats.ts'
- name: './reporter.ts'
```

```
[stats] tool_call -> 1
[stats] tool_call -> 2
[stats] prompt -> 1
```

Da `ctx.on()` ein effect ist, verschwindet der listener mit dem plugin — `removeListener` muss nie manuell verwaltet werden.

## Dispatch-Modi

`emit` ist einer von fünf Dispatch-Modi. Welchen ein event verwendet, ist Teil seines contract — er entscheidet, ob listener Werte zurückgeben, nebenläufig laufen oder sich gegenseitig short-circuitieren können:

| Modus | Aufruf | Semantik |
|---|---|---|
| emit | `ctx.emit(name, ...args)` | Synchroner Broadcast; zurückgegebene Promises und Werte werden nicht awaited oder gesammelt. |
| parallel | `await ctx.parallel(name, ...args)` | Alle listener laufen nebenläufig und werden gemeinsam awaited. |
| serial | `await ctx.serial(name, ...args)` | listener laufen der Reihe nach und werden awaited; der erste nicht-`null`/`false`/`undefined`-Rückgabewert gewinnt und stoppt die restlichen. |
| bail | `ctx.bail(name, ...args)` | Synchrone Version von serial. |
| waterfall | `ctx.waterfall(name, ...args, next)` | Around-Middleware; siehe unten. |

Jedes harness-event dokumentiert seinen Modus in der generierten Referenz auf seiner [subsystem-Seite](../subsystems/core.de.md).

## waterfall: Transformieren oder short-circuit

waterfall ist der Modus, der Interception ermöglicht. Jeder listener empfängt die Argumente plus eine `next()`-Continuation; er kann transformieren, was `next()` zurückgibt, oder ohne `next()`-Aufruf zurückkehren und den Rest der Kette short-circuitieren — was die Cordis-Dokumentation das Veto nennt. Erstelle `waterfall-demo.ts`:

```ts
import type { Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Events {
    'demo/transform'(input: string, next: () => Promise<string>): Promise<string>
  }
}

export const name = 'waterfall-demo'

export function apply(ctx: Context) {
  // Listener 1: wrap the downstream result.
  ctx.on('demo/transform', async (input, next) => {
    const downstream = await next()
    return downstream.toUpperCase()
  })

  // Listener 2: short-circuit when it owns the decision.
  ctx.on('demo/transform', async (input, next) => {
    if (input.includes('blocked')) return '** blocked **'
    return next()
  })

  void (async () => {
    console.log(await ctx.waterfall('demo/transform', 'hello', async () => 'hello'))
    console.log(await ctx.waterfall('demo/transform', 'blocked words', async () => 'blocked words'))
  })()
}
```

Lass `cordis.yml` nur auf diese Datei zeigen und führe aus:

```
HELLO
** BLOCKED **
```

Gehe die zweite Zeile durch: listener 1 läuft zuerst, ruft `next()` auf, was listener 2 aufruft; listener 2 sieht `blocked` und kehrt ohne `next()`-Aufruf zurück — das innerste Standardverhalten (die an `ctx.waterfall` übergebene Funktion) läuft nie — und listener 1 wandelt die Ersatznachricht auf dem Rückweg in Großbuchstaben um.

Daraus folgt die Disziplin: **Ein waterfall-listener, der nur beobachtet oder annotiert, muss `next()` aufrufen**; ohne `next()` zurückzukehren ist ein bewusstes Short-Circuit. Vergisst ein Logging-listener `next()`, schluckt er unbemerkt das Standardverhalten für alle downstream. Das ist eine stehende Regel dieses Repositories ([waterfall-Semantik](../cordis-primer.de.md#cordis-waterfall-semantics)).

Das harness verwendet waterfalls für Entscheidungen, die kooperierende plugins umhüllen oder beantworten können: [`agent/request`](../subsystems/core.de.md#agentrequest--waterfall) erlaubt einem plugin, die Modellaufruf-Konfiguration zu ersetzen, und [`approval/request`](../subsystems/approval.de.md#approvalrequest--waterfall) erlaubt einer policy, anstelle des Benutzers zu antworten.

Weiter: [Konfiguration](05-config.de.md) — plugin-Optionen aus `cordis.yml`.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
