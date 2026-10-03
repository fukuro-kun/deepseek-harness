# Agent Note: pi-ai-Upgrade-Kompatibilität
[English](2026-09-05-pi-ai-upgrade-compatibility.md) | [中文](2026-09-05-pi-ai-upgrade-compatibility.zh.md) | Deutsch

Status: implemented


## Problem

Der pi-ai-Adapter klassifiziert Upstream-Kompatibilitätsfelder explizit und persistiert nur die Replay-Metadaten, die spätere Requests benötigen. Ein SDK-Upgrade kann zu beiden Mengen Felder hinzufügen, ohne die provider-neutrale Harness-API zu ändern. Unklassifizierte Konfigurationsfelder lassen die Kompilierung fehlschlagen; ausgelassene Replay-Metadaten können spätere Provider-Requests still verändern.

## Entscheidung

Der Adapter folgt [pi-ai 0.85.1](https://github.com/earendil-works/pi/blob/v0.85.1/packages/ai/CHANGELOG.md). `thinkingTokenBudgetField`, `vllmPriority` und `supportsMaxOutputTokens` sind opt-in Gateway-Steuerungen; `thinking.budget` gesellt sich zu den vorhandenen Template-Platzhaltern. Das SDK besitzt Budget-Auflösung und -Serialisierung. `supportsMidConvoEffort` und `allowedFallbackModels` bleiben katalogeigen, weil ihre Korrektheit von exakten Anthropic-Transports, Modellfähigkeiten und Fallback-Preisen abhängt.

Das optionale `providerThinkingLevel` bleibt in den replay-v2-Antwortmetadaten des Adapters, damit Anthropic-History ihren provider-nativen effort behält. Fehlen bleibt gültig; weder die Replay-Version noch das veröffentlichte Session-Format ändern sich. Die Replay-Herkunft behält das angeforderte Modell, während `responseModel` eine Anthropic-Alias-Auflösung oder einen Fallback behält. Die Rekonstruktion stellt dieses native Modell wieder her, damit pi-ai weiterhin seine modellübergreifenden Signaturregeln anwendet. Die provider-neutrale LLM-API bleibt unverändert; die [provider-gerouteten Replay-Ownership-Regeln](../architecture/2026-07-14-provider-routed-llm-adapters.de.md) gelten weiterhin. Der Anthropic-Adapter 0.84.2 [initialisiert `model` aus dem Request](https://github.com/earendil-works/pi/blob/v0.84.2/packages/ai/src/api/anthropic-messages.ts#L510-L515) und [zeichnet zu Nachrichtenbeginn nur Antwort-ID und Nutzung auf](https://github.com/earendil-works/pi/blob/v0.84.2/packages/ai/src/api/anthropic-messages.ts#L589-L605). Er schreibt niemals `responseModel`; seine Replay-Records behalten daher das angeforderte Modell ohne Native-Model-Metadaten.

## Erwogene Alternativen

**Jedes neue Feld zurückhalten.** Das würde deployment-eigene Gateway-Steuerungen fälschlich als Katalogfakten klassifizieren: Upstream lässt die Auswahl des Budget-Felds und die vLLM-Priorität ausdrücklich aus seinem generierten Katalog heraus.

**Jedes neue Feld exponieren.** Das ließe beliebige Gateways modellspezifische Anthropic-effort- und Fallback-Unterstützung beanspruchen, ohne die Katalogbelege, die diese Features gültig machen.

## Konsequenzen

Die Compile-Zeit-Abdeckung behält die explizite Feldklassifikation. [Kompatibilitätstests](../../../../packages/llm/llm-pi-ai/tests/compat-upgrade.spec.ts) decken Schema-Akzeptanz, ungültige Werte, Protokollanwendbarkeit und Materialisierung ab, ohne Defaults zu ändern. [Replay-Konvertierungstests](../../../../packages/llm/llm-pi-ai/tests/convert.spec.ts) decken die Erhaltung des optionalen effort ab. Mixed-Protocol-Katalogtests verwenden den installierten OpenCode-Katalog. Provider-Verhalten bleibt upstream-eigen; die Verifikation echter Provider ist von den schlüssellosen Adapter-Tests getrennt.
