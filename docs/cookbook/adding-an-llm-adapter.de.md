# Cookbook: einen LLM-adapter hinzufügen

[English](adding-an-llm-adapter.md) | [中文](adding-an-llm-adapter.zh.md) | Deutsch

Wie ein neuer model provider angebunden wird. Referenzimplementierungen: `packages/llm/llm-deepseek` (direktes HTTP, SSE-Framing durch `eventsource-parser`) und `packages/llm/llm-pi-ai` (wrapt eine LLM-Bibliothek). Zuerst die `StreamChunk`-Dokumentation in `packages/llm/llm/src/types.ts` lesen — sie dokumentiert die Protokollkonventionen, gegen die beide adapter verifiziert wurden.

## Die Grundform

```ts ignore-check
class MyAdapter extends LlmAdapter {
  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> { … }
}

export const name = 'llm-myprovider'
export const inject = ['llm']
export const Config: z<Config> = z.object({ apiKey: z.string(), … })

export function apply(ctx: Context, config: Config) {
  ctx.llm.registerAdapter(['my-provider'], new MyAdapter(…))
}
```

Die Registrierung ist effect-basiert (HMR-sicher); ein adapter pro provider-Route — Duplikate werfen eine Ausnahme, und eine Multi-Route-Registrierung ist Alles-oder-Nichts. `options.provider` wählt den adapter und `options.model` ist die provider-Modell-ID, sodass ein dynamischer Katalog-adapter neue modelle ohne Lifecycle-Rekonfiguration bedienen kann. Secrets sind cordis-native: schemastery-Config mit Env-Fallbacks, aus cordis.yml über `!!js process.env.MY_KEY` gespeist. Niemals ad-hoc-Key-Dateien im Code lesen.

## Protokollverpflichtungen (der Vertrag, den zwei Implementierungen verifiziert haben)

- `usage` VOR `finish` emittieren; nach `finish` NICHTS emittieren. Die robuste Methode: finish/usage bis zur Stream-Ende-Markierung des providers puffern, dann flushen (behandelt provider, die am Ende nur-usage-Chunks senden).
- `arguments` von tool-calls sind End-zu-End rohe JSON-Strings; Stream-Fragmente als `argumentsDelta` senden. Wenn der provider geparste Objekte zurückgibt, am `block-end` neu stringifizieren.
- Block-`index`e in der Reihenfolge des ersten Auftretens im Stream vergeben; den Index für jedes Delta desselben Blocks wiederverwenden.
- Fehler haben genau zwei erlaubte Pfade: THROW aus `stream()` (Transport- und Protokollfehler — `LlmError` mit stabilem code verwenden), oder den Stream mit `finish {kind: 'error' | 'aborted'}` beenden (provider-In-Band-Fehler). consumer behandeln beide; pro Fehlerklasse wählen und dokumentieren.
- `options.signal` beachten (an fetch / das SDK weiterreichen).
- Ein `GenerateOptions`-Feld, das der provider nicht unterstützen kann (z. B. eine `stop`-Liste bei einem provider ohne Stop-Sequenzen): `LlmError(..., 'UNSUPPORTED_OPTION')` werfen statt es stillschweigend zu verwerfen.
- Wenn der provider bei Folgeaufrufen Response-IDs, Signaturen oder andere native Metadaten benötigt, die minimale verlustfreie JSON-Projektion als `finish.replayState` emittieren. Beim Wiederaufbau der History validieren. `LlmRuntime` reicht sie nur weiter, wenn die historische provider-Route und die Ziel-provider-Route aktuell von exakt derselben adapter-Instanz verwaltet werden; der adapter entscheidet, ob Same-Model-, Cross-Model- oder Cross-Provider-Wiederherstellung zulässig ist. Niemals native Replay-Daten allein aus provider-/Modellnamen ableiten, wenn der Zustand fehlt.

Provider-spezifische Thinking-Mode-Schalter verbleiben in der Config des adapters. Exakte Modell-Metadaten verwenden eine provider-neutrale capability seam: `resolveModel()` mit provider-/Modell-Identität und optionalen `context`- und `reasoning`-Feldern implementieren, ein konfiguriertes `defaultEffort` nur deklarieren, wenn eines existiert, und das optionale `AbortSignal` des resolvers beachten. reasoning-Stärken sind geordnete opake IDs, die vom adapter auf provider-Anfragen abgebildet werden. Die autoritative auswählbare Liste des adapters bewahren, einschließlich eines adapter-definierten `off` wenn unterstützt, ohne finale wire-Schreibweisen offenzulegen oder nicht unterstützte Werte zu clampen; eine ID muss nicht ihrer wire-Darstellung entsprechen.

## Implementierungsstruktur

wire-Typen, Request-Serialisierung, Transport-Parsing, Chunk-Übersetzung und die adapter-Klasse als separate Verantwortlichkeiten halten; [`llm-deepseek`](../../packages/llm/llm-deepseek/README.de.md) ist die Referenzanordnung.

## Verifikation

Der [Repository-Teststrategie](../testing.de.md) folgen, die adapter-Abdeckung, Real-Provider-Prüfungen und Anforderungen an veröffentlichte Einträge verantwortet.
