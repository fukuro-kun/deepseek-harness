# Services und Abhängigkeiten

[English](service.md) | [中文](service.zh.md) | Deutsch

Ein service ist eine capability, die ein plugin anderen plugins zur Verfügung stellt. `inject` deklariert die services, die ein plugin benötigt.

## Was ist ein service?

In Harness sind `tools`, `llm` und `agents` services. Jeder service ist eine benannte capability, die auf `ctx` bereitgestellt wird:

```ts ignore-check
ctx.tools    // ToolRuntime service
ctx.llm      // LLM service
ctx.agents   // Agent service
```

Jedes plugin kann einen service für andere plugins bereitstellen.

## Einen service nutzen

Deklariere `inject`, um einen bestehenden service zu nutzen:

```ts ignore-check
export const inject = ['tools']

export function apply(ctx: Context) {
  // ctx.tools exists and is ready here.
  ctx.tools.register(/* ... */)
}
```

Wenn `apply` ausgeführt wird, ist jeder service bereit, den `inject` deklariert. Wenn ein service nicht bereit ist, wartet das plugin, anstatt zu laufen.

## Einen service bereitstellen

### Service erweitern

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

export default class MetricsService extends Service {
  static inject = ['llm']  // A service may depend on other services.

  constructor(ctx: Context) {
    super(ctx, 'metrics')  // 'metrics' is the service name.
  }

  // Public service method.
  record(event: string, value: number) {
    // ...
  }
}
```

Nach dem Laden dieses plugins greifen consumer über `ctx.metrics` auf den service zu:

```ts ignore-check
export const inject = ['metrics']

export function apply(ctx: Context) {
  ctx.metrics.record('tool_call', 1)
}
```

### Typ deklarieren

Verwende TypeScript declaration merging, um `ctx.metrics` zu typisieren:

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    metrics: MetricsService
  }
}

export default class MetricsService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'metrics')
  }

  record(event: string, value: number) { /* ... */ }
}
```

## Verhalten von Abhängigkeiten

### Erforderliche und optionale Abhängigkeiten

```ts ignore-check
// Required: the plugin does not load while the service is absent.
export const inject = ['tools']

// Optional: omit inject and query with ctx.get() at the use site.
export function apply(ctx: Context) {
  const metrics = ctx.get('metrics')
  metrics?.record('plugin_loaded', 1)
}
```

### Wenn ein service verschwindet

Wenn ein erforderlicher service während der Laufzeit der Anwendung verschwindet, beispielsweise weil sein provider entladen wird:

1. Abhängige plugins werden automatisch disposed.
2. Sie laden erneut, wenn der service zurückkehrt.

Das verhindert, dass ein plugin einen service aufruft, der nicht mehr existiert.

## Service-Isolation

`cordis.yml` kann services isolieren, sodass separate plugin-Gruppen separate Instanzen desselben service sehen:

```yaml
- id: group-a
  name: '@deepseek-ai/cordis-plugin-group'
  group: true
  isolate:
    shell: true
  config:
    - name: '@deepseek-ai/dsh-bash-local'
      config:
        timeoutMs: 5000
    - name: './src/plugin-a.ts'

- id: group-b
  name: '@deepseek-ai/cordis-plugin-group'
  group: true
  isolate:
    shell: true
  config:
    - name: '@deepseek-ai/dsh-bash-local'
      config:
        timeoutMs: 60000
    - name: './src/plugin-b.ts'
```

`plugin-a` und `plugin-b` sehen jeweils die Bash-Instanz in ihrer eigenen Gruppe, ohne gruppenübergreifende Effekte.

## Eingebaute Harness-Services

Das Repository generiert die service-Namen, öffentlichen Methoden und Quelltextpositionen in die [subsystem-Seite](../../../subsystems/core.de.md) jedes service. Verwende beim Entwickeln eines plugins diese generierten Bereiche und die TypeScript-Schnittstelle des service; erstelle keine zweite statische Liste.

## Nächste Schritte

- [Event-System](./events.de.md) — Kommunikation zwischen plugins ohne enge Kopplung
- [Capability-Schichtung](../practice/index.de.md) — services als capability-Schnittstellen verwenden
