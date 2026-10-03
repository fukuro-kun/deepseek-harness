# Drei-Rollen-Capability-Design
[English](index.md) | [中文](index.zh.md) | Deutsch


Diese Seite hat zwei Teile: eine Konzeptreferenz für das Drei-Rollen-Capability-Muster, gefolgt von einem fortgeschrittenen Tutorial, das eine Capability aufbaut. Schließe zuerst den [grundlegenden Plugin-Pfad](../basic/index.de.md) und das [Services-Tutorial](../framework/service.de.md) ab.

## Konzeptreferenz

Wenn eine Capability allgemein genug ist, um austauschbare Provider zu benötigen (wie Bash-Ausführung), trennt Harness drei Rollen: eine **Service Definition**, einen **Service Provider** und einen **Consumer**. Packe die Rollen in separate Packages, wenn sie unabhängig voneinander weiterentwickelt oder ersetzt werden müssen; andernfalls kann ein Package mehrere Rollen übernehmen. Die vollständige Capability bildet den seam. Keine einzelne Rolle ist ein seam.

## Bash-Beispiel

Die Bash-Ausführungs-Capability besteht aus:

- **Service Definition** (`dsh-shell`) — definiert den Cordis-Service sowie Bash-Request- und -Result-Typen
- **Service Provider** (`dsh-bash-local`) — führt Befehle auf der lokalen Maschine aus
- **Consumer** (`dsh-tool-bash`) — stellt die Capability als modell-aufrufbares Tool bereit

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│  dsh-shell   │────▶│  dsh-bash-local  │     │ dsh-tool-bash│
│(definition) │     │    (provider)     │     │(consumer/tool)│
└─────────────┘     └──────────────────┘     └──────────────┘
       ▲                                            │
       └────────────────────────────────────────────┘
                    inject: ['shell']
```

## Vorteile der Trennung

### Provider austauschen

Eine Service Definition kann mehrere Provider haben, die über `cordis.yml` ausgewählt werden:

```yaml
# Local execution
- name: '@deepseek-ai/dsh-bash-local'

# Replace this row with another package that provides the same service.
```

Service Definition und Tool bleiben unverändert, während der Provider wechselt.

### Unabhängig weiterentwickeln

- Die Service Definition ändert sich selten, nachdem Aufrufer von ihrem Vertrag abhängen.
- Service Provider können Performance und Sicherheit unabhängig verbessern.
- Consumer können ändern, wie sie die Capability dem Modell präsentieren.

### Abhängigkeiten entkoppeln

- Der Service Provider hängt von der Service Definition ab.
- Der Consumer hängt von der Service Definition ab.
- Service Provider und Consumer **hängen nicht voneinander ab**.

Die [Capability-seam-Referenz](../../../capability-seams.de.md) ist zuständig für die aktuellen eingebauten Familien und Package-Links.

## Tutorial: eine Drei-Rollen-Capability entwickeln

### Schritt 1: die Service Definition schreiben

```ts ignore-check
// packages/my-cap/my-cap/src/index.ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    myCap: MyCapService
  }
}

export abstract class MyCapService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'myCap')
  }

  /** Execute the capability. */
  abstract execute(request: MyCapRequest): Promise<MyCapResult>
}

export interface MyCapRequest {
  input: string
}

export interface MyCapResult {
  output: string
}
```

### Schritt 2: einen Service Provider schreiben

```ts ignore-check
// packages/my-cap/my-cap-local/src/index.ts
import type { Context } from '@deepseek-ai/cordis'
import { MyCapService, type MyCapRequest, type MyCapResult } from '@deepseek-ai/dsh-my-cap'

class MyCapLocal extends MyCapService {
  async execute(request: MyCapRequest): Promise<MyCapResult> {
    // Local provider behavior.
    return { output: request.input.toUpperCase() }
  }
}

export const name = 'my-cap-local'

export function apply(ctx: Context) {
  ctx.plugin(MyCapLocal)
}
```

### Schritt 3: einen Consumer schreiben

```ts ignore-check
// packages/my-cap/tool-my-cap/src/index.ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'tool-my-cap'
export const inject = ['tools', 'myCap']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'my_cap',
    description: 'Execute my capability.',
    parameters: {
      input: { type: 'string', required: true },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      const result = await ctx.myCap.execute({ input: args.input })
      return result.output
    },
  }))
}
```

### In cordis.yml zusammenführen

```yaml
- name: '@deepseek-ai/dsh-my-cap-local'
- name: '@deepseek-ai/dsh-tool-my-cap'
```

## Designpunkte

- **Nicht präventiv aufteilen** — verwende separate Packages nur, wenn die Rollen unabhängig weiterentwickelt werden müssen. Ein einfaches Tool-Plugin tut das nicht.
- **Die Service Definition besitzt Request/Result-Typen** — Service Provider und Consumer hängen nur vom Service-Definition-Package ab.
- **Explizit > implizit** — löse Defaults in einem expliziten `resolve(request): Spec`-Schritt auf, statt `?? default`-Ausdrücke innerhalb von `run()` zu verbergen.

## Nächste Schritte

- [LLM-Adapter](./llm-adapter.de.md) — implementiere einen LLM-Provider
