---
description: "Die LLM-Capability-Gruppe: ein provider-neutraler Modellaufruf-Service, die DeepSeek- und pi-ai-Provider-Adapter, Request-Retry-Ausführung und replay-fähige Token-Messung."
kind: "package-group"
---

# llm/ — LLM-Capability-Familie
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Die llm-Gruppe stellt die Modellaufruf-Capability des Harness bereit: einen provider-neutralen Service, über den jede Komposition Requests an einen Model-Provider streamt, plus Adapter, provider-spezifische Request-Metadaten, Retry-Ausführung und Messung. Das Kernpaket `llm` definiert das Vokabular für Messages, Content Blocks und Stream Chunks, das jedes Plugin und das Session-Log verwenden; Provider-Adapter übersetzen das Wire Format eines Providers in dieses Vokabular; DeepSeek-Request-Erweiterungs-Plugins tragen lifecycle-verwahrte Metadaten außerhalb der Modelleingabe bei; `llm-retry` führt fehlgeschlagene Requests an durable Agent-Step-Grenzen erneut aus; und `token-meter` misst Request- und Kontextdruck aus dem durable Log. Diese Seite kartiert die Gruppe; das README jedes Pakets besitzt seinen paketweiten Vertrag.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Entwicklerhinweis](#dev-note)

-----

<a id="packages"></a>
## Pakete

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`llm/`](llm/README.de.md) | Streamt einen Modellaufruf durch einen registrierten Provider-Adapter und teilt das Harness-Vokabular für Messages, Blocks und Chunks | `ctx.llm` |
| [`llm-deepseek/`](llm-deepseek/README.de.md) | Bedient die Route `deepseek-official` mit direkten DeepSeek-Chat-Completions, Thinking und Bildeingabe | registriert auf `ctx.llm` |
| [`llm-pi-ai/`](llm-pi-ai/README.de.md) | Bedient konfigurierte Provider-Routen über pi-ai-Kataloge und Wire Formats, einschließlich handdeklarierter Gateways | registriert auf `ctx.llm` |
| [`deepseek-llm-api-extensions/`](deepseek-llm-api-extensions/README.de.md) | Registriert lifecycle-verwahrte Top-Level-Felder auf offiziellen DeepSeek-Requests | `ctx.deepseekLlmApiExtensions` |
| [`plugin-package-inventory-deepseek/`](plugin-package-inventory-deepseek/README.de.md) | Trägt das aktive Loader-Paketinventar zu offiziellen DeepSeek-Requests bei | trägt `dsh_plugin_packages` bei |
| [`llm-retry/`](llm-retry/README.de.md) | Wiederholt fehlgeschlagene Modell-Requests nach der Policy des jeweiligen Providers an durable Agent-Step-Grenzen | hört auf `agent/request-error` |
| [`token-meter/`](token-meter/README.de.md) | Misst Request- und Kontextdruck aus dem durable Session-Log mit einer festen Heuristik | `ctx.tokenMeter` |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

- [LLM-Streaming-Subsystem](../../docs/subsystems/llm-streaming.de.md) — die Message- und Block-Typen, der assemblierte Modell-Request, das `StreamChunk`-Protokoll und der Adapter Contract.
- [Token-Meter-Subsystem](../../docs/subsystems/token-meter.de.md) — die Messsemantik hinter `ctx.tokenMeter`.
- [Zwillings-LLM-Adapter](../../.agents/notes/implemented/architecture/2026-06-13-twin-llm-adapters.de.md) — warum die DeepSeek-Route zwei strukturell verschiedene Adapter ausliefert.
- [Gerouteter Modellkontext](../../.agents/notes/implemented/architecture/2026-07-20-routed-model-context-and-compaction-policy.de.md) — wie der Loop Modell-Requests routet und Kontext kompaktiert.

<a id="dev-note"></a>
## Entwicklerhinweis

Keiner.
