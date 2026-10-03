# 7. In den Harness
[English](07-into-the-harness.md) | [中文](07-into-the-harness.zh.md) | Deutsch


Dieses Kapitel registriert ein modellaufrufbares Tool beim `tools`-Service des Harness, führt es durch die Tool-Pipeline des Harness aus und beobachtet das Ergebnis-Event. Es bleibt schlüssellos und ruft kein Modell auf.

## Ein Tool-Plugin

Erstelle `greet-tool.ts` in `tmp/cordis-tutorial`:

```ts
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'

export const name = 'greet-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet the named person.',
    parameters: {
      name: { type: 'string', required: true, description: 'Who to greet' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `Hello, ${args.name}!`
    },
  }))

  // Drive one call through the real execution pipeline, standing in for
  // the model. ToolCallId brands the correlation id a provider would issue.
  void (async () => {
    const result = await ctx.tools.execute({
      callId: brandString<ToolCallId>('demo-1'),
      name: 'greet',
      arguments: { name: 'Cordis' },
      signal: new AbortController().signal,
    })
    console.log('tool replied:', JSON.stringify(result.content))
  })()
}
```

Jedes Muster hier stammt aus früheren Kapiteln: `inject: ['tools']` ([Kapitel 3](03-services.de.md)) hält das Plugin zurück, bis die Tool-Registry existiert; `ctx.tools.register(...)` hängt den Registrierungs-Disposer an das Plugin ([Kapitel 2](02-lifecycle-and-effects.de.md)), sodass Entladen das Tool unregistriert. `defineTool` wandelt die `parameters`-Spec in das dem Modell gezeigte JSON Schema um, leitet den Typ von `args` her und validiert modellseitige Argumente, bevor `execute` läuft. Das Tool gibt den von `output.schema` deklarierten kanonischen Wert zurück; `output.render` erzeugt separat die Native und durable Ergebnis-Content.

## Ein Beobachter-Plugin

Erstelle `tool-logger.ts` — ein separates Plugin, das jeden Tool-Aufruf in der App über das `tools/result`-Event des Harness beobachtet:

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'

export const name = 'tool-logger'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.on('tools/result', (exec, result) => {
    const text = result.content
      .map(block => (block.type === 'text' ? block.text : ''))
      .join('')
    console.log(`[tool-logger] ${exec.name} -> ${text}`)
  })
}
```

Die Zeile `import type {} from '@deepseek-ai/dsh-tools'` zieht die Declaration-Merges des Pakets heran, sodass `'tools/result'` und sein Payload typisiert sind — derselbe Schritt wie der `stats.ts`-Import aus Kapitel 4, auf Paketebene.

## Komponieren und Ausführen

```yaml
- name: '@deepseek-ai/dsh-system-prompt'
- name: '@deepseek-ai/dsh-tools'
- name: './tool-logger.ts'
- name: './greet-tool.ts'
```

`@deepseek-ai/dsh-tools` injiziert den `systemPrompt`-Service, weil Tools Schemas zum System-Prompt beitragen, daher listet die Komposition auch dessen Provider. Ohne ihn bleibt das Tools-Plugin PENDING, wie in [Kapitel 6](06-composition-and-hmr.de.md) beschrieben.

```sh
node --import tsx ../../vendor/cordis/bin.js
```

```
[tool-logger] greet -> Hello, Cordis!
tool replied: [{"type":"text","text":"Hello, Cordis!"}]
```

Der Logger feuerte zuerst: `tools/result` wird als Teil der Ergebnis-Materialisierung emittiert, bevor das Promise von `execute` zum Aufrufer auflöst. Keines deiner Plugins weiß vom anderen — die Registry und das Event verbinden sie.

## Von hier zu einem vollständigen Agent

Ein echter Agent ist diese Komposition plus weitere Plugins: ein LLM-Adapter, der Agent-Loop, Persistence und ein Anwendungs-Einstiegspunkt. Vergleiche die [Base-Profile-Schicht](../../packages/bundle/base/cordis.patch.yml) und die [Headless-Schicht](../../packages/bundle/headless/cordis.patch.yml) — du kannst ihre Einträge jetzt lesen. Füge dein `greet-tool.ts` über ein kleines `--patch`-Overlay hinzu.

Wohin es als Nächstes geht:

- [Ein Tool bauen](../user/develop/basic/tool.de.md) — mehr zu `defineTool`, inklusive Präsentation und reicheren Schemas.
- [Drei-Schichten-Capability-Design](../user/develop/practice/index.de.md) — wie der Harness austauschbare Capabilities strukturiert.
- Die generierten `cordis-surface`-Regionen auf den [Subsystem-Seiten](../subsystems/core.de.md) — alles, was du injizieren und beobachten kannst, jeweils auf seiner besitzenden Seite.
- [Architektur](../architecture.de.md) — die System-Karte, in der diese Plugins leben.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
