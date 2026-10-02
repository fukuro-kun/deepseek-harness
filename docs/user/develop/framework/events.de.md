# Ereignissystem

[English](events.md) | [中文](events.zh.md) | Deutsch

Ereignisse sind der zentrale Kommunikationsmechanismus zwischen Cordis-Plugins. Harness setzt sie vielfach für lose gekoppelte Erweiterungspunkte ein.

## Grundlegende Verwendung

### Auf ein Ereignis lauschen

```ts ignore-check
ctx.on('event-name', (payload) => {
  // Handle the event.
})
```

### Ein Ereignis auslösen

```ts ignore-check
ctx.emit('event-name', payload)
```

## Ereignismodi

Cordis bietet mehrere Ereignismodi für verschiedene Interaktionsverträge.

### emit — Broadcast

Jeder Listener wird synchron ausgeführt; Rückgabewerte werden ignoriert:

```ts ignore-check
// Emit
ctx.emit('my-plugin/ready', { id: 'worker-1' })

// Listen
ctx.on('my-plugin/ready', ({ id }) => {
  console.log(`${id} is ready`)
})
```

### bail — Kurzschluss

Listener werden nacheinander ausgeführt; das erste Ergebnis, das nicht `null`, `false` oder `undefined` ist, wird zum finalen Ergebnis:

```ts ignore-check
// Dispatch
const result = ctx.bail('some-check', input)

// Listen: a returned value stops later listeners.
ctx.on('some-check', (input) => {
  if (shouldBlock(input)) return 'blocked'
  // Return null, false, or undefined to continue to the next listener.
})
```

### serial — geordnete Ausführung

Listener werden in Registrierungsreihenfolge ausgeführt und asynchrone Ergebnisse werden abgewartet. Das erste Ergebnis, das nicht `null`, `false` oder `undefined` ist, stoppt die weitere Ausführung:

```ts ignore-check
await ctx.serial('setup-phase', context)
```

### waterfall — Pipeline

Jeder Listener kann das Downstream-Ergebnis wrappen und so eine Verarbeitungskette bilden. Ein Listener **muss `next()` aufrufen, um an Downstream zu delegieren**; ohne diesen Aufruf wird die Pipeline kurzgeschlossen:

```ts ignore-check
// Dispatch
const output = await ctx.waterfall('my-plugin/transform', input, async () => input)

// Listen: next() is mandatory.
ctx.on('my-plugin/transform', async (_input, next) => {
  const downstream = await next()
  return downstream.trim()
})
```

::: warning
Ein waterfall-Listener **muss `next()` aufrufen**. Das Weglassen des Aufrufs kurzschließt die Pipeline bewusst und ermöglicht Interception- und Gateway-Verhalten.
:::

## Typsichere Ereignisse

Harness nutzt TypeScript Declaration Merging für typsichere Ereignisse:

```ts
import '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Events {
    'my-plugin/ready': (payload: { id: string }) => void
    'my-plugin/check': (input: string) => boolean | undefined
    'my-plugin/transform': (input: string, next: () => Promise<string>) => Promise<string>
  }
}

// ctx.on('my-plugin/ready', ...) and ctx.emit('my-plugin/ready', ...)
// are now inferred correctly.
```

## Cordis-Ereignisse und Session-Aufzeichnungen

Harness-Cordis-Ereignisse verwenden `namespace/action`-Namen, darunter `agent/pre-step`, `agent/request`, `agent/request-error`, `tools/result` und `session/event`. Die generierten `cordis-surface`-Bereiche auf den [Subsystem-Seiten](../../../subsystems/core.de.md) dokumentieren vollständige Signaturen und Modi.

`turn/*`, `step/*`, `tool/call`, `tool/result` und `compaction/*` sind dauerhafte Session-Ereignistypen, keine gleichnamigen Cordis-Ereignisse. Um sie zu beobachten, auf `session/event` lauschen und `event.type` prüfen.

## Ereignis-Listener sind Effects

Ein über `ctx.on()` registrierter Listener wird beim Entladen seines Plugins automatisch entfernt:

```ts ignore-check
export function apply(ctx: Context) {
  // This listener is removed when the plugin disposes.
  ctx.on('tools/result', handler)
}
```

## Beispiel: Logging-Plugin

Dieses Plugin protokolliert Tool-Aufrufe und -Ergebnisse:

```ts
import type { Context } from '@deepseek-ai/cordis'
import '@deepseek-ai/dsh-tools'

export const name = 'tool-logger'

export function apply(ctx: Context) {
  ctx.on('tools/result', (exec, result) => {
    console.log(`[tool] ${exec.name}(${JSON.stringify(exec.arguments)})`)
    const text = result.content
      .map(block => block.type === 'text' ? block.text : '')
      .join('')
    console.log(`[tool result] ${text.slice(0, 100)}`)
  })
}
```

## Nächste Schritte

- [Capability-Schichtung](../practice/index.de.md) — Ereignisse innerhalb von Capability-Schnittstellen verstehen
- [LLM-Adapter](../practice/llm-adapter.de.md) — ein vollständiges LLM-Backend implementieren
