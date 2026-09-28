# Changelog

Fork-local log of changes in `fukuro-kun/deepseek-harness` on top of upstream
`deepseek-ai/deepseek-harness`. Upstream itself records no changelog; release
commits (`release(dsh): X.Y.Z`) mark its states. Entries below list the fork's
own commits, newest first, each anchored to the upstream base it builds on.

## hydra/0.1.5 (base: upstream 0.1.5-rc.1)

### 2026-09-28

- **feat(ui-workspace)** — dedicated collapsed Archive section at the foot of the session list plus symmetric `workspace/unarchiveSession` through registry, Remote API, client model, and UI. Archived rows are inert (no open, no drag) and expose only "Restore session"; archiving stays a pure archive-set edit that preserves session log, identity, and workspace slot. Permanent deletion deliberately deferred. (`f730c23d59`, follow-up `ed5e18bdc4`)
- **fix(ui-schedule)** — catalog spec's locale-contrast assertion no longer depends on the host locale (pre-existing environment-dependent failure). (`318b55e0f6`)
- **fix(locale-de)** — the German language pack now conforms to the repository's documentation and build-graph gates: package-reference README pair (en/zh + sidecar), JSDoc on exports, `tsconfig.base.json` alias and `tsconfig.client.json` project reference so `lib/types` no longer goes stale. (`25b23dd7bd`)

### 2026-09-27

- **feat(client-locale-de)** — German language pack `packages/client/locale-de` (`@deepseek-ai/dsh-client-locale-de`): ~41 namespaces registered via `ctx.locale.addLanguage` + `register(ns,'de',dict)`; core `LOCALE_IDS` stays `["zh","en"]`. (`510c6b109c`)
- **fix(llm-deepseek)** — DeepSeek provider and model catalog only surface when a usable API key resolves; re-checks on credential/settings changes. (`739faa1e8b`)
- **refactor(agent-instructions)** — condensed workspace-context prose (intro −43%, section prose −40%); semantics unchanged. (`a6ae187d46`)
