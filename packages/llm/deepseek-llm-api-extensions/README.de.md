---
description: "Offizielle DeepSeek-Request-Extension-Registry für Provider-Plugins, die lifecycle-eigene Top-Level-API-Felder beitragen."
kind: "package-reference"
---

# @deepseek-ai/dsh-deepseek-llm-api-extensions
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Providerspezifische Registry für additive Top-Level-Felder auf offiziellen DeepSeek-LLM-API-Requests. `DeepSeekLlmApiExtensionRegistry` registriert `ctx.deepseekLlmApiExtensions`; Contributor-Plugins beanspruchen je ein declaration-merged Feld, und `dsh-llm-deepseek` bereitet die aktuellen Beiträge vor, nachdem es seinen Basis-Request serialisiert hat. Nutze es, wenn ein Plugin ein validiertes providerspezifisches Feld hinzufügen muss, ohne den Basis-Adapter zu ändern.

## Inhaltsverzeichnis

- [Service](#service)
- [Modell-Erfahrung](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev-Notiz](#dev-note)

-----

<a id="service"></a>
## Service

- `register(field, provider)` reserviert ein Feld für die aufrufende Fiber. Doppelte oder missgebildete Namen schlagen synchron fehl; das Disposen der Registrierung gibt sie für einen späteren Provider frei.
- `prepare(request)` snapshotet die registrierten Provider, bereitet sie nebenläufig vor, klont und friert zurückgegebene JSON-Werte ein und gibt `{ fields, accept }` zurück. Ein Preparations-Fehlschlag rejectet vor dem HTTP-Dispatch; Request-Cancellation hört auf, Provider abzuwarten, selbst wenn einer sein Signal ignoriert.
- `accept()` führt jeden erfassten Post-2xx-Callback einmal aus. Nebenläufige Aufrufe joinen dasselbe Settlement, jeder Callback setzt sich, bevor Fehlschläge gemeldet werden, und mehrere Fehlschläge werden zu einem `AggregateError`.

Jeder Provider sieht den exakten serialisierten Basis-Body, das `AbortSignal` des Requests plus optionale `sessionId` und den `purpose` des Hilfsaufrufs. Er muss seine eigene Arbeit nach Cancellation prompt stoppen und gibt `undefined` zurück, wenn sein Feld auf diesen Request nicht zutrifft. Eine vorbereitete Operation behält die von ihr erfassten Provider, selbst wenn HMR ihre Registrierungen vor der HTTP-Annahme entfernt.

Die Registry besitzt Hinzufügung und Lifecycle, nicht die Feldsemantik. `@deepseek-ai/dsh-session-log-deepseek` besitzt `dsh_session_log`; `@deepseek-ai/dsh-plugin-package-inventory-deepseek` besitzt `dsh_plugin_packages`. Die providerneutrale LLM-Seam und `llm-pi-ai` konsumieren diese Registry nicht.

<a id="model-experience"></a>
## Modell-Erfahrung

Indirekt, über `@deepseek-ai/dsh-llm-deepseek`, das registrierte Felder außerhalb der `messages`, des System-Prompts und der Tool-Schemas des Modells sendet.

#### KV-Cache-Effekt

Keiner; Registry-Felder sind modellverborgene Provider-Metadaten und ändern das serialisierte Modell-Input-Präfix nicht.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>

- **Nur offizielle DeepSeek-Requests** — die Registry hat absichtlich kein providerneutrales Routing und keine pi-ai-Adapter-Integration.
- **Kein Feldordnungs-Vertrag** — die Member-Reihenfolge des JSON-Objekts folgt der Registrierungs-Preparation, aber Empfänger adressieren Felder nach Name.


<a id="dev-note"></a>
### Dev-Notiz

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen</summary>

Keine.

</details>

**Runtime-Invariante:** Es wird kein Begleiter publiziert. Doppeltes Ownership, detached Output und ein einziges Acceptance-Settlement werden innerhalb der Registry-Operation durchgesetzt, die jede Entscheidung besitzt.
