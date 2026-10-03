# Agent Note: Tote öffentliche API und Result-Felder beschneiden
[English](2026-07-04-prune-dead-core-spine-api.md) | [中文](2026-07-04-prune-dead-core-spine-api.zh.md) | Deutsch

Status: rejected — stale 2026-07 inventory: rows were pruned piecemeal or gained callers; a fresh audit must supersede it


## Problem

Mehrere Package-Root-Exports, Result-Felder und Komfortmethoden haben keinen Produktions-Consumer. Sie überleben, weil Tests Internals über öffentliche Einstiegspunkte importieren oder weil ein Typ einen Aufrufer vorwegnahm, der nie kam. Jedes Element ist isoliert klein, aber zusammen vergrößern sie den SDK-Vertrag, generierte Kataloge, Dokumentation und die Regressionsmatrix, ohne einen ausgelieferten Pfad zu ermöglichen.

Der Produktionskorpus ist `packages/*/*/src`, Beispielquellen/-konfigurationen und Runtime-Skripte. Tests, Paket-READMEs und Agent-Note-Prosa sind Beleg für Publikation, aber keine festen Aufrufer. `cordis_inspect` macht `packages/extensions/tool-cordis/src/api-catalog.ts` modellsichtbar, und `cordis_mount` kann injizierte Services über abgesicherte Real-Service-Proxys aufrufen; katalogisierte Service-Methoden und Rückgabeformen sind also eine echte dynamische Produktfläche. Die Tabelle unterscheidet daher das Fehlen eines festen Repo-Aufrufers von Unerreichbarkeit: Zeilen, die katalogisiertes Vokabular berühren, verengen bewusst, was modellgeschriebene Mounts entdecken und aufrufen können, während Package-Root-Implementierungshelfer über jene Service-Fassade nicht erreicht werden. Exaktsymbol-Suchen ergeben folgenden Bestand:

| API-Element | Produktionsbeleg | Vereinfachung |
| --- | --- | --- |
| `SurfaceManager.invalidate()` | Nur sein Unit-Test ruft es; Seeding endet, bevor der lazy erzeugte Manager existiert, und die Session ersetzt ihre Log-Referenz nie. | Es samt seinem unmöglichen Wholesale-Replacement-Vertrag löschen. |
| `ToolExecutionResult.callId` | Jeder Hook erhält bereits das immutable `ToolExecution`; Loop und ACP korrelieren über das Call-/Session-Event. Kein Consumer liest das duplizierte Result-Feld. | Das Feld, die Copy-/Mismatch-Guards und die Tests entfernen, die beweisen, dass das Duplikat nicht abweichen kann. |
| `ReactLoopAgent`-Root-Export | Named Imports außerhalb des Pakets sind Tests; Produktion programmiert gegen `Agent` und erzeugt/resumiert über `ctx.agents`. | Return-/Interface-Typ `Agent` machen und die konkrete Loop-Klasse paket-intern halten; den bewussten synchronen, config-only `AgentLoop.create()`-Pfad behalten. |
| `workflow-worker-thread`-protocol/runtime/session-Re-Exports und named `WorkerThreadWorkflowEngine` | Jeder Paketnamen-Consumer nutzt die Default-Engine; die Workflow-Agent-Note definiert das Worker-Wire-Protokoll bereits als privat. | Den Default-Plugin-Klassen-/Config-Vertrag behalten; den duplizierten Named-Class-Export fallen lassen und Protokollmodule source-privat halten. |
| `code-runtime-worker`-protocol/bootstrap-Re-Exports | Paketexterne Produktions-/e2e-Consumer nutzen `WorkerThreadCodeRuntime` und Config, nicht `BootstrapPort`, `PatchableStream` oder Worker-Message-/Boot-Typen. | Den Runtime-Klassen-/Config-Vertrag behalten und sein Wire-/Bootstrap-Vokabular source-privat machen. |
| ACP-`agentOptions`-Root-Export | Der Helfer hat nur Same-File- und ACP-Test-Consumer; der einzige paketexterne Produktions-Consumer mountet den Plugin-Namespace. | `name`, `inject`, `Config`, `AcpConfig` und `apply` behalten; `agentOptions` source-privat machen und über Bridge-Verhalten testen. |
| `providerWording`- und `completedTurnPrefix`-Root-Exports | Jeder hat einen same-package-Produktionsaufrufer; nur der Balanced-Prefix-Helfer hat einen same-package-Whitebox-Test. | Source-privat machen und Provider-Verhalten testen. |
| `depthOf`-, `SubagentDepthError`-, `waitForExit`- und `exitsWithin`-Root-Exports | Produktions-Subagent-Backends konsumieren den In-Process-Runner und die Subprocess-Construction-/Disposal-Helfer, nicht diese Enforcement-/Test-Internals. `SENSITIVE_ENV_PATTERN` ist ausgenommen, weil das SDK-Helper es auf caller-gelieferte Environments anwendet. | Depth- und Exit-Verhalten behalten, die übrigen Helfer und den Error source-privat machen; über Spawn und Disposal testen. Das geteilte Credential-Muster öffentlich behalten. |
| `LlmError.status` und Replay-Status | Adapter/Replay befüllen es, doch Produktion verzweigt auf stabilen Error-Code/-Message und liest den rohen Status nie. | Das ungelesene Feld und das Replay-Plumbing entfernen und die Fehlerklassifikation bewahren. |
| `BlockAssembler.push()`-Rückgabewert | Beide Produktionsaufrufer ignorieren den zurückgegebenen fertigen Block. | `void` zurückgeben; den bewusst öffentlichen `blocks()`/`message()`-Vertrag behalten. |
| `compactRegion`s separates `session`-Argument | Der feste Aufrufer übergibt dasselbe Objekt, das bereits als `agent.session` vorliegt; die modellsichtbare Mount-API kann die Methode ebenfalls rufen, aber zwei Identitäten zu akzeptieren erlaubt einem gemounteten Plugin, ein inkohärentes Paar zu liefern. | Die Manual-Region-API behalten und bewusst auf `agent.session` als einzige Source of Truth verengen. |
| `CompactionResult.startSeq`, `summarySeq`, `endSeq` und `summary` | Der Produktions-Consumer liest nur Shadowed-Range-/Seq-/Token-Buchführung; das dauerhafte Log besitzt Summary und Event-Identität. | Die vier Result-Echos entfernen und beide geteilten Transcript-Renderer behalten. |
| `BasicCompactionEngine`-Sichtbarkeit von Estimation/Summarization | Kein externer Produktionsaufrufer ruft die fünf Methoden; die implementierte Agent Note nennt nur `estimateContentTokens()` und `summarize()` als Subklassen-Hooks. | Diese zwei `protected` machen und die drei nur orchestrierenden Estimatoren privat. |
| `CodeLogEntry.source`/`level` und `RunCodeMeta.dispatches` | Jeder Produktions-Consumer bildet Logs auf Text ab; kein Presenter-/Modellpfad liest die anderen Felder oder die persistierte Dispatch-Zahl. | Code-Runtime-Logs zu Strings (oder Text-only-Einträgen) machen und Result-Meta-Dispatch-Plumbing entfernen; den lokalen Zähler behalten, der deterministische Dispatch-IDs prägt. |
| `CodeRuntime.language` und `CodeRuntime.isolation` | Das Worker-Backend liefert die einzigen Produktionswerte, während PTC-Modus und jeder andere Produktionsaufrufer nur `run()` aufrufen. | Die ungelesenen Deskriptoren entfernen und Language, Isolation, Budgets, Cancellation und Disposal des Workers bewahren. |
| `ToolNotFoundError.toolName`, `SystemPrompt.config` und `BashTask.command` | Jeder gespeicherte öffentliche Wert hat keinen Produktionsleser. | Das ungelesene Feld fallen lassen und Fehlermeldungen, aufgelöstes Konfigurationsverhalten und Task-Lebenszyklus bewahren. |
| Backend-Package-Root-Implementierungshelfer | Der exakte Bestand unten wird nur über relative Same-Package-Imports aufgerufen. Produktions-Namespace-Imports mounten den behaltenen Plugin-Vertrag, ohne diese Eigenschaften zu lesen; Named-Root-Consumer sind Tests. | Jeden Adapter/Provider/Service und seinen Config-/Error-Vertrag behalten; die gelisteten Helferfunktionen/-konstanten nicht mehr an Package Roots exportieren. |
| Consumer-Package-Root-Implementierungshelfer | Der exakte Bestand unten hat nur Same-Package-Produktionsaufrufer. Produktions-Namespace-Imports mounten Plugin-Verträge, ohne Helper-Eigenschaften zu lesen; Named-Root-Consumer sind Tests. | Plugin-Verträge und stabile Error-Codes behalten; Tests auf paketlokale Module oder öffentliches Verhalten umstellen und die gelisteten Helfer nicht mehr an Package Roots exportieren. |

### Gruppierter Helper-Export-Bestand

- `dsh-llm-deepseek`: `httpErrorCode`, `serializeMessages`, `serializeRequest`, `DONE`, `parseSse`, `mapFinishReason`, `mapUsage` und `translate`; `dsh-llm-pi-ai`: `buildModel`, `mapStopReason`, `mapUsage`, `toPiContext` und `toStreamChunks`.
- `dsh-bash-local`: `DEFAULT_GRACE_MS`, `ENV_OVERRIDES`, `killGroup`, `OutputCollector` und `runBash`; `dsh-bash-sandbox`: `shellQuote`, `classifyDenial` und `classifyRunnerFailure`; `dsh-sandbox-local`: `bwrapProfileArgs`, `landlockProfileArgs` und `seatbeltProfileArgs`. Die öffentlichen mutablen Test-Injection-Felder und ihre Typen liegen außerhalb dieses Vorschlags.
- `dsh-fs-local`: `applyLiteralEdit`, `listDirectory`, `probe`, `readForEdit`, `readTextForDiff`, `readWholeText`, `resolveLocalTarget`, `restoreLineEndings`, `streamWholeText` und `writeFileAtomic`.
- `dsh-web-fetch-http`: `classifyContentType`, `decoderForCharset`, `isSameOrigin`, `parseCharset` und `validateFetchUrl`; `dsh-web-search-exa`: `mapExaResponse` und `mapExaResult`; `dsh-web-search-deepseek`: `citationSnippets` und `mapAnthropicResponse`; `dsh-web-search-perplexity`: `mapPerplexityResponse` und `mapPerplexityResult`.
- `dsh-tool-fs`: `READ_LIMIT`, `STREAM_MIN_SIZE`, `READ_MAX_BYTES`, `READ_MAX_LINE_LENGTH`, `DIFF_CONTEXT`, `applyReadTool`, `parseReadArgs`, `applyWriteTool`, `formatWriteOutput`, `parseWriteArgs`, `applyEditTool`, `formatEditOutput`, `parseEditArgs`, `buildWindow`, `formatReadOutput`, `computeHunkDiffs` und `diffsFromMeta`.
- `dsh-tool-web`: `WEB_SEARCH_MAX_RESULTS`, `applyWebSearchTool`, `formatSearchOutput`, `parseSearchArgs`, `presentSearchCall`, `applyWebFetchTool`, `formatFetchOutput`, `parseFetchArgs`, `presentFetchCall`, `renderBody` und `htmlToMarkdown`; `dsh-tool-call-timeout-policy`: `toolTimeoutResult`; `dsh-compaction-basic`: `resolveConfig`; `dsh-tool-bash`: `renderResult`.

## Vorschlag

Jede Zeile als eine begrenzte, koordinierte Public-Surface-Bereinigung entfernen oder degradieren. Paket-READMEs, JSDoc, generierte API-/Event-Kataloge, Type-Equivalence-Records, Exports-Maps wo nötig und Tests aktualisieren, sodass sie den besitzenden öffentlichen Vertrag ausüben statt reine Test-Einstiegspunkte zu erhalten. Keine Capability Seam, keinen LLM-Adapter, keinen Persistence-Provider und keinen Lifecycle-Quiescence-Vertrag kollabieren.

## In Betracht gezogene Alternativen

**Test-Bequemlichkeiten und in sich geschlossene Results öffentlich behalten.** Öffentliche Helfer können Whitebox-Tests bequem machen, in sich geschlossene Result-Felder können ergonomisch wirken, und künftige Embedder könnten den konkreten Loop oder Enumerationsmethoden wollen. Diese Vorteile sind hypothetisch; sie zu behalten zwingt jede Implementierung und jedes Dokument, Zustände zu erklären, die kein ausgelieferter Aufrufer beobachten kann. Ein realer Consumer kann den kleinsten Vertrag einführen, den er braucht — mit bekannter Verantwortung und bekannten Fehlersemantiken.

**Jedes katalogisierte Mitglied für modellgeschriebene Mounts behalten.** Das selbstreferenzielle Toolset ist ein realer generischer Consumer-Pfad, kein Generierungsrauschen. Sein Wert kommt jedoch aus einer korrekten, komponierbaren Service-API, nicht daraus, Duplikatfelder oder inkohärente Argumentpaare unbegrenzt zu bewahren; jede katalogisierte Kontraktion oben entfernt eine Tatsache, die anderswo auf derselben Execution, demselben Agent oder Result verfügbar ist, und aktualisiert die API-Referenz im selben Change.

## Akzeptanzkriterien

- Exaktsymbol-Suchen zeigen keine entfernte API außerhalb dieser Agent Note und etwaiger Ergänzungen implementierter Agent Notes.
- Jedes in dieser Agent Note gelistete API-Element ist wie angegeben entfernt oder degradiert; bewusst behaltene Erweiterungs-/Testverträge außerhalb des Bestands sind unverändert.
- Tool-Ausführung, Compaction, beide LLM-Adapter, der Persistence-Provider, Workflow-Isolation sowie Agent-Erzeugung/-Resume behalten ihr ausgeliefertes Verhalten.
- Typecheck, Coverage, Snapshots, doc-sync, Module-Graph-Verifikation, Build und Hygiene bestehen.

## Risiken

Die meisten Entfernungen sind compile-sichtbar, aber runtime-neutral. Die Compaction-Argument-Bereinigung verbietet bewusst einen Session-/Context-Mismatch und behält die Manual-Region-API. Externe Pre-Release-Embedder und bestehende modellgeschriebene Mounts könnten weniger Helfer importieren, weniger Argumente übergeben oder engere Result-Formen erhalten; das ist eine bewusste Produktflächen-Kontraktion, nicht bloß Katalog-Kosmetik. Das Repository ist unveröffentlicht, sodass ungestützte Fläche mitzuführen die größere Grundkostenlast ist.
