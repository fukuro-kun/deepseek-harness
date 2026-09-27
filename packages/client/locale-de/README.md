---
description: "German language pack for the web GUI: registers the `de` locale and its namespace dictionaries through the locale service, for operators localizing an installation."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-locale-de

English | [中文](README.zh.md)

## Summary

Mount `dsh-client-locale-de` to offer Deutsch in the web client's language picker. The plugin publishes the language definition `{ id: 'de', label: 'Deutsch', fallback: 'en' }` and contributes `de` dictionaries for the shipped `dsh-client-ui-*` namespaces plus `common`/`conversation`, all through the public `ctx.locale` surface. The package is fork-local: it adds a locale from outside instead of touching the built-in `LOCALE_IDS`, so the upstream locale plugin stays unmodified.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount it wherever a deployment wants a German UI; nothing is needed at runtime beyond loading the plugin — language selection itself stays in Settings → General.

### Mounting in a composition

Insert the plugin row into the target profile's `cordis.patch.yml` and declare a `link:` dependency in that profile's `package.json` so the loader resolves the package name:

```yaml
- insert: [{"id": "client-locale-de", "name": "@deepseek-ai/dsh-client-locale-de"}]
```

The package accepts no configuration fields; the language becomes selectable as soon as the client tree activates.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The client plugin body declares `inject: ['locale']` and runs `immediately: true`: it registers the `de` language definition and each translated namespace dictionary as owned effects through `ctx.locale.addLanguage` and `ctx.locale.register(ns, 'de', dict)`. Registration order is irrelevant because the locale service accumulates namespace maps per language independently of the owning package's own `zh`/`en` registrations; a missing `de` key resolves through the declared `en` fallback chain.

| File | Role |
|---|---|
| `src/index.ts` | Type surface |
| `src/client/index.ts` | Client plugin body |
| `src/client/dicts.ts` | Dictionary data (extracted from the generated runtime dictionaries that previously lived as a hand patch in `release/dsh/node_modules`) |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read the owning service and the surfaces this pack localizes:

- [Locale service](../locale/README.md) — the `ctx.locale` API this plugin registers into.
- [Client group map](../README.md) — the browser half this package belongs to.
- [Web client architecture](../../../docs/subsystems/web-client.md) — how client plugins mount into the shell.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side language pack that registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These constraints describe what the pack does not translate and where coverage drifts; they are current package constraints, not a task backlog.

- **Only `web`-platform client dictionaries are covered** — host-side strings (CLI output, log messages, host-rendered prompts) are not translated.
- **Dictionary keys drift when upstream UI packages add keys** — missing keys fall back to `en` by design, so an upstream copy change silently renders English until the dictionary catches up.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Fork-local package without an upstream counterpart; it is published by packing a tarball and referencing it through `overrides` in `release/dsh/package.json`. Rebuild and repack after editing `dicts.ts` — the runtime serves the compiled bundle, and a stale build previously shipped a tree-shaken bundle that referenced a dropped constant.

</details>
