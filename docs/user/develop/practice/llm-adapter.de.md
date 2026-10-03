# LLM-Adapter
[English](llm-adapter.md) | [中文](llm-adapter.zh.md) | Deutsch


Dieser Leitfaden verbindet einen neuen LLM-Provider mit Harness.

## Überblick

Ein LLM-Adapter erweitert `LlmAdapter` und implementiert `stream()`, übersetzt Harness' provider-neutrale Anfrage in einen Provider-API-Aufruf und übersetzt die Antwort zurück in Harness-Chunk.

## Minimale Implementierung

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'

class MyAdapter extends LlmAdapter {
  private apiKey: string

  constructor(apiKey: string) {
    super()
    this.apiKey = apiKey
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    // 1. Convert options.messages to the provider format.
    // 2. Call the streaming API.
    // 3. Convert the response into StreamChunk values.
  }
}

export interface Config {
  apiKey: string
  providers: string[]
}

export const Config: Schema<Config> = Schema.object({
  apiKey: Schema.string().required(),
  providers: Schema.array(Schema.string()).required(),
})

export const name = 'my-llm-adapter'
export const inject = ['llm']

export function apply(ctx: Context, config: Config) {
  const adapter = new MyAdapter(config.apiKey)
  ctx.llm.registerAdapter(config.providers, adapter)
}
```

## StreamChunk-Protokoll

`stream()` liefert Chunks nach diesem Protokoll:

```ts
import { brandString } from '@deepseek-ai/dsh-brand'
import type { StreamChunk, ToolCallId } from '@deepseek-ai/dsh-llm'

async function* exampleChunks(): AsyncIterable<StreamChunk> {
  // 1. Start each content block with block-start.
  yield { type: 'block-start', index: 0, blockType: 'text' }

  // 2. Stream text through text-delta.
  yield { type: 'text-delta', index: 0, text: 'Hello' }
  yield { type: 'text-delta', index: 0, text: ' world' }

  // 3. End each content block with block-end and the complete block.
  yield {
    type: 'block-end',
    index: 0,
    block: { type: 'text', text: 'Hello world' },
  }

  // 4. Tool-call block.
  yield { type: 'block-start', index: 1, blockType: 'tool-call' }
  yield {
    type: 'tool-call-delta',
    index: 1,
    id: brandString<ToolCallId>('call-123'),
    name: 'bash',
    argumentsDelta: '{"command":"ls"}',
  }
  yield {
    type: 'block-end',
    index: 1,
    block: {
      type: 'tool-call',
      id: brandString<ToolCallId>('call-123'),
      name: 'bash',
      arguments: '{"command":"ls"}',
    },
  }

  // 5. Token usage.
  yield { type: 'usage', usage: { inputTokens: 100, outputTokens: 50 } }

  // 6. Finish reason.
  yield { type: 'finish', reason: { kind: 'stop' } }
  // Alternatively, { kind: 'tool-calls' } requests tool execution.
}
```

### Schlüsselregeln

- Jedes `block-start` hat ein passendes `block-end`.
- `index` wächst ab 0 und identifiziert die Content-Block-Reihenfolge.
- Ein `tool-call-delta` trägt rohen JSON-Text in `argumentsDelta`, entweder auf einmal oder über mehrere Chunks.
- `finish` ist der letzte Chunk.
- Emit `usage` vor `finish`.

## GenerateOptions

`stream()` empfängt den exportierten `GenerateOptions`-Typ. Er umfasst das Modell, die adapter-eigene Reasoning-Effort-ID, die Konversationshistorie, den System-Prompt, Tool-Schema, Generierungsparameter, Stop-Sequenzen und das Abort-Signal; behandle den von `@deepseek-ai/dsh-llm` exportierten TypeScript-Typ als autoritativ. Mappe unterstützte Felder auf die Provider-API. Wenn der Provider ein Feld nicht erfüllen kann, wirf `LlmError` mit einem stabilen Code, anstatt es still zu verwerfen.

Überschreibe `resolveModel(provider, model, signal?)`, um die exakte Provider-/Modell-Identität plus optionale `context`- und `reasoning`-Metadaten in einem Lookup zurückzugeben. Reasoning-Metadaten enthalten geordnete opake IDs und Display-Namen plus einen optionalen konfigurierten Default; bewahre die autoritative auswählbare Liste des Adapters, einschließlich `off`, wenn seine Upstream-Capability-API es zurückgibt, anstatt diese Werte in einen Core-Enum zu befördern. Ehre das optionale Signal für asynchronen Lookup, sodass Cancellation und Disposal Quiescence erreichen. Der Service validiert das Aggregat und lehnt nicht unterstützte explizite Efforts vor `stream()` ab; das Weglassen von `reasoning` bedeutet, dass dieses Modell keine auswählbare Reasoning-Effort-Capability hat.

## Einen Adapter registrieren

```ts ignore-check
ctx.llm.registerAdapter(['my-provider'], adapter)
```

Das erste Argument listet Provider-Routen, die der Adapter handhabt. `GenerateOptions.provider` wählt den registrierten Adapter, während `GenerateOptions.model` eine adapter-eigene Modell-ID ohne Lifecycle-Registrierung übergibt. Überschreibe `listModels()`, wenn der Adapter Modellauswahlen an Selektoren bekanntgeben kann.

## In cordis.yml verwenden

```yaml
- id: my-llm
  name: './src/my-llm-adapter.ts'
  config:
    apiKey: !!js process.env.MY_API_KEY
    providers:
      - my-provider

- id: agent-loop
  name: '@deepseek-ai/dsh-agent-loop'
  config:
    agents:
      - id: main
        provider: my-provider
        model: my-model-v1
```

## Referenzimplementierungen

Das Repository enthält vollständige Implementierungen:

- `packages/llm/llm-deepseek/` — DeepSeek-API-Adapter im OpenAI-kompatiblen Format
- `packages/llm/llm-pi-ai/` — Pi-AI-Adapter mit einem anderen API-Format

Vergleiche die beiden mitgelieferten Adapter, um denselben Harness-Vertrag über verschiedene Provider-SDKs implementiert zu sehen.

## Fehlerbehandlung

Adapter werfen Transport- und Protokollfehler als `LlmError`-Werte mit stabilen Codes. Der agent loop bewahrt den Fehler und den Code für Diagnose und Policy; er konvertiert keinen gewöhnlichen `Error` automatisch. Jede Provider-HTTP-Anfrage muss auch `attributionHeaders()` mergen und `options.signal` weiterleiten.

```ts
import {
  attributionHeaders,
  LlmAdapter,
  LlmError,
  type GenerateOptions,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'

class HttpAdapter extends LlmAdapter {
  constructor(private readonly endpoint: string) {
    super()
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...attributionHeaders(),
      },
      body: JSON.stringify({ model: options.model, messages: options.messages }),
      ...options.signal ? { signal: options.signal } : {},
    })
    if (!response.ok) {
      throw new LlmError(`Provider API error: ${response.status}`, 'PROVIDER_HTTP_ERROR')
    }
    // A real adapter parses the response and emits the complete chunk sequence.
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
```
