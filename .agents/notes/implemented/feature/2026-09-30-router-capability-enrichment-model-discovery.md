# Agent Note: Enrich fetched models from router capabilities

Status: implemented

English | [中文](2026-09-30-router-capability-enrichment-model-discovery.zh.md) | [Deutsch](2026-09-30-router-capability-enrichment-model-discovery.de.md)

## Problem

The standard OpenAI-compatible `/models` response identifies models but does not report their context windows or output limits. Some routers expose endpoint-level capability metadata separately, so the existing Models-page fetch action could list model ids without enough information to adopt them confidently.

## Decision

The existing model-fetch action enriches incomplete listings with one best-effort `GET {root}/endpoints` request. The root is the configured listing base with one trailing `/v1` removed. The parser considers all healthy endpoint entries that match a listed model id. The largest positive `n_ctx` supplies `contextWindow`; a momentary slot count does not select the metadata source. The parser supplies `maxTokens` only when every healthy matching endpoint reports a positive `max_tokens_cap`, and uses the smallest cap as the shared limit. It fills only fields the model listing omitted. `max_tokens_default` is a generation default, not an output limit.

The primary model-list request has a ten-second deadline, and the optional capability request has a three-second deadline. Both reject redirects. Capability transport, timeout, response-size, and parse failures leave the original model listing usable. Caller cancellation remains an `ABORTED` result. If the primary model-list request fails or times out, discovery returns its visible `DISCOVERY_FAILED` result rather than an empty catalog. The shared discovery type does not carry input modalities, so the capability probe does not adopt `supports_vision`.

The Models page preselects new models and configured models whose reported capacities differ; users can clear any selection. Applying the selection adds new rows and refreshes only reported `contextWindow`/`maxTokens` fields on selected existing rows, preserving their names and other fields. Discovery itself does not write settings. The package behavior is documented in [`llm-pi-ai`](../../../../packages/llm/llm-pi-ai/README.md#discover-models-from-endpoints).

## Alternatives considered

**Keep hand-edited capability values or run a synchronization script.** Hand-maintained values can drift from router metadata, while a script still requires someone to remember to run it. The existing fetch button is already the occasional user action for refreshing the model list and can perform the enrichment at that point.

**Refresh router capabilities during model selection or request execution.** Runtime discovery would make transient router availability part of normal adapter/catalog behavior and require cache-refresh semantics. The Models-page action is sufficient because the model fleet changes infrequently and users only need a refresh when editing its configuration.

**Use `max_tokens_default` as `maxTokens`.** A default generation size is not an endpoint-enforced output cap; using it would misstate the router's limit. The parser adopts only `max_tokens_cap`.

## Consequences

- OpenAI-compatible listings remain authoritative for model ids and any capacities they report; router metadata fills only absent fields.
- Routers without `/endpoints` continue to return their ordinary model candidates. A stalled metadata endpoint adds at most three seconds to the action.
- A stalled primary listing adds at most ten seconds before the UI receives a recoverable discovery error.
- The capability policy reports the largest healthy context and only a shared output cap present on every healthy endpoint; it does not report input modalities or prompt-dependent remaining-context calculations.
- Regression tests exercise matching, multi-endpoint selection, capacity precedence, missing or invalid metadata, redirects, deadlines, and caller cancellation.
