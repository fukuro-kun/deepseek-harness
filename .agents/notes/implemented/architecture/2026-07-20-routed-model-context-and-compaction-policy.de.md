# Agent Note: Gerouteter Model-Kontext und Compaction-Policy

Status: implemented

[English](2026-07-20-routed-model-context-and-compaction-policy.md) | [中文](2026-07-20-routed-model-context-and-compaction-policy.zh.md) | Deutsch

## Problem

Compaction kann nicht sicher ein globales Kontextfenster anwenden, wenn ein Prozess Requests an Modelle mit unterschiedlichen Kapazitäten routet. Dieselbe Model-id kann zudem unter mehreren Providern existieren, und ein Adapter kann dynamische ids akzeptieren, die nicht in seinem Advisory-Katalog stehen. Eine falsche Kapazität komprimiert entweder zu spät und löst vermeidbaren Overflow aus oder komprimiert zu früh und verwirft nützlichen Kontext.

Keiner der naheliegenden Konfigurations-Owner genügt. Compact-basic ist optional und weiß nicht, welche Modelle ein Adapter akzeptiert. LLM-Adapter besitzen Model-Routing, dürfen aber nicht von einem optionalen Compaction-Plugin abhängen oder Consumer-spezifische Threshold-, Retention-, Summarizer- und Retry-Policy absorbieren. Das Design braucht einen maßgeblichen Kapazitätsfakt und optionale Per-Target-Compaction-Policy, ohne eine zweite Model-Registry zu erzeugen.

## Entscheidung

### Adapter besitzen Exact-Route-Kapazität

`LlmAdapter.resolveModel(provider, model, signal?)` gibt aggregierte Metadaten für eine exakte Route zurück, mit optionalem `LlmModelContext` unter seinem `context`-Feld. `LlmRuntime.resolveModelInfo()` wählt den registrierten Route-Owner, validiert ein positives ganzzahliges `contextWindow` und gibt detached Metadaten zurück. Die Abfrage ist unabhängig von `listModels()`: Ein ungelistetes dynamisches Modell kann Kapazitätsmetadaten haben, und ein fehlendes `context` bedeutet nur, dass der Adapter die Kapazität nicht beschreiben kann.

Der handgerollte DeepSeek-Adapter akzeptiert optionales `contextWindow` auf jedem konfigurierten Modell plus einen adapterweiten `defaultContextWindow`. Exakte Modellkapazität gewinnt; ein Eintrag ohne Kapazität und eine ungelistete Passthrough-id erben den Adapter-Default oder lassen `context` weg, wenn er fehlt. Die zwei eingebauten Modelleinträge veröffentlichen jeweils eine exakte Kapazität von 256.000 Tokens. Der pi-ai-Adapter löst Kapazität aus demselben Katalogdeskriptor auf, der das Request-Modell maßgeblich auflöst.

### Token-Messung bleibt modellagnostisch

`dsh-token-meter` hat keine Konfiguration und keine Modellprofile. Er besitzt einen festen Replay-Fold und gibt absolute geschätzte Token-Pressure plus positionale Surface-Preise zurück. Das Entfernen globaler Kapazität hält die Messung wiederverwendbar, wenn compaction-basic fehlt, und verhindert, dass die Replay-Buchführung zu einer weiteren Modell-Registry wird.

### Compact-basic löst eine Target-Spec auf

Compact-basic besitzt Consumer-Policy. Top-Level-Felder definieren Defaults; `modelPolicies` enthält partielle Overrides, keyed auf das exakte `{ provider, model }`-Paar. Doppelte Targets und unbekannte oder invalide Felder lassen den Plugin-Load fehlschlagen. `thresholdRatio` defaulted auf `0.8`, und Retention defaulted auf `retainRatio: 0.16`; Aufrufer können stattdessen ein absolutes `retainTokens` nutzen, doch die zwei Retention-Formen schließen sich gegenseitig aus. Nach der Vererbung schlägt eine Ratio-Retention, die nicht unter ihrer Threshold-Ratio liegt, ebenfalls beim Plugin-Load fehl, weil keine Modellkapazität diese Policy valide machen kann.

Für proaktive Pressure liest compaction-basic die letzte durable Request-Route, löst deren Adapter-Kapazität und Exact-Target-Policy auf und skaliert Ratios in ein `ResolvedCompactSpec`. Es führt diese Auflösung bei jedem Check durch, sodass ein Provider- oder Modellwechsel in einer Session Kapazität und Policy sofort ändert. Ein absolutes Retained-Budget, das nicht unter dem skalierten Threshold liegt, schlägt fehl, sobald die Zielkapazität diesen Vergleich erstmals ermöglicht.

Derselbe Exact-Target-Override kann Summarization-Provider/-Modell, Summarization-Output-Cap, Konvergenz-Retries und Overflow-Retry-Cap wählen. Dies sind Compaction-Belange und gelangen nie in einen LLM-Provider.

### Target-spezifische Pressure-Fehler bewahren optionale Komposition

Ein Adapter ohne Kapazitätsmetadaten bleibt eine valide LLM-Route. Manuelle proaktive Pressure schlägt mit einem target-spezifischen Konfigurationsfehler fehl; der automatische Listener warnt einmal pro exakter Route und fährt mit voller History fort. Dieselbe Per-Route-Unterdrückung gilt, wenn aufgelöste Kapazität ein invalides absolutes Retention-Budget aufdeckt, während unverbundene operationale Fehler unabhängig sichtbar bleiben. Kanonischer Provider-bestätigter Overflow braucht keine Kapazitätsmetadaten: Er umgeht den proaktiven Threshold und das normale Retention-Budget, versucht eine maximale balancierte Reduktion und bewahrt den ursprünglichen Provider-Fehler, sofern der Ersatz keinen Fortschritt beweist.

## Verifikation

Service-Tests decken detached Kontextmetadaten, invaliden Adapter-Output, Katalogunabhängigkeit und Default-Abwesenheit ab. Adapter-Tests decken DeepSeek-Exact/-Default/-Unlisted-Auflösung, invalide Kapazitäten und pi-ai-Exact-Descriptor-Auflösung ab. Compact-Tests decken Ratio-Skalierung, Exact-Provider/-Modell-Overrides, Load-Time-Ablehnung invalider gemergter Ratios, Runtime-Absolut-Budget-Validierung, Same-Model-id-Providerwechsel, target-spezifische Warnungsunterdrückung und kapazitätsunabhängige Overflow-Recovery ab. Loader-Fixtures lehnen die entfernte Token-Meter-Capacity-Einstellung ab, und Beispiele konfigurieren Kapazität auf Adaptern.

## Erwogene Alternativen

- **Kapazität und alle Policies in compaction-basic legen** — abgelehnt, weil compaction-basic Adapter-Modellwissen duplizieren würde, dynamische ungelistete Modelle parallele Registrierung erforderten und Kapazität verschwände, wenn Compaction nicht installiert ist.
- **Compaction-Policy in jeden LLM-Adapter legen** — abgelehnt, weil Adapter unabhängig von optionalen Consumers bleiben müssen, während Summarization- und Retry-Policy keine Provider-Fakten sind.
- **`listModels()` maßgeblich machen** — abgelehnt, weil Discovery advisory ist und einige Adapter absichtlich dynamische ids akzeptieren. Correctness-Metadaten dürfen Selector-Mitgliedschaft nicht in eine Routing-Whitelist verwandeln.
- **Per-Model-Folds zu token-meter hinzufügen** — abgelehnt, weil der Replay-Algorithmus geteilt ist; nur Kapazität und Consumer-Policy ändern sich. Mehrere Folds würden State duplizieren, ohne die Schätzung zu verbessern.
- **Eine eigenständige Model-Context-Registry schaffen** — abgelehnt, weil der Adapter bereits die maßgebliche Route-Auflösung besitzt. Eine zweite Registry würde Lifecycle-Ordering-, Duplicate-Key- und Drift-Probleme ohne unabhängiges Backend einführen.

## Konsequenzen

- Kapazität hat einen maßgeblichen Owner beim Provider-Contract, während Compaction-Policy im optionalen konsumierenden Plugin bleibt.
- Dieselbe compaction-basic-Instanz handhabt sicher unterschiedliche Windows, Providerwechsel und identische Model-ids unter verschiedenen Providern, ohne Discovery-Metadaten zu konsultieren.
- LLM-only- und Meter-only-Kompositionen bleiben valide; das Laden von compaction-basic fügt keine Rückwärtsdependency von Adaptern hinzu.
- DeepSeek-Deployments können exakte Per-Modell-Kapazitäten setzen oder `defaultContextWindow` für Einträge ohne Kapazität und ungelistete Passthrough-ids nutzen.
- Ratio-Defaults skalieren natürlich über Modelle, während Exact-Target-Absolut-Retention für deployment-spezifisches Verhalten verfügbar bleibt.

Diese Note ersetzt die Global-Capacity- und No-Model-Policy-Teile der [Replay-Token-Meter-Service-Agent-Note](../../archived/architecture/2026-07-15-replay-token-meter-service.md). Ihre Single-Fold-Messungsentscheidung bleibt unverändert.
