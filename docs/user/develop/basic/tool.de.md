# Ein Tool entwickeln
[English](tool.md) | [中文](tool.zh.md) | Deutsch


Dieses Tutorial fügt der Web UI ein `greet`-Tool hinzu. Schließe zuerst [Dein erstes Plugin](./index.de.md) ab und behalte dessen `scratch-plugin`-Verzeichnis.

## Das Tool-Plugin erstellen

Ersetze `scratch-plugin/src/my-plugin.ts` durch:

```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'greet-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet someone by name.',
    parameters: {
      name: { type: 'string', required: true, description: 'The name to greet' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `Hello, ${args.name}!`
    },
  }))
}
```

`inject` bewirkt, dass Cordis auf die Tool-Registry wartet. `defineTool` leitet `args` aus `parameters` ab und validiert sie; `execute` gibt den kanonischen Wert zurück, den `output.schema` deklariert, und `output.render` wandelt diesen Wert in modellseitigen Inhalt um.

## Tool ausführen und aufrufen

Starte den Entwicklungsbefehl neu, falls er nicht läuft:

```sh
pnpm dsh web --patch ./scratch-plugin/cordis.yml
```

Öffne `http://127.0.0.1:3080` und frage: `Use the greet tool to greet Ada.` Das Modell kann `greet` aufrufen und erhält `Hello, Ada!` als tool result.

## Nächste Schritte

- [Plugin-Konfiguration](./config.de.md) — die Begrüßung konfigurierbar machen.
- [Tool-Autoring-Referenz](../../../cookbook/adding-a-tool.de.md) — verschachtelte schemas, kanonische Werte, Hintergrundarbeit, policy hooks, PTC mode und UI-Karten nachschlagen.
- [Capability-Layering](../practice/index.de.md) — eine austauschbare Capability in Service Definition-, Service Provider- und Consumer-Pakete aufteilen.
