# `@deepseek-ai/dsh-client-locale-de`

German (Deutsch) language pack for the DeepSeek Harness web client. Fork-local
package — registers `de` through `ctx.locale.addLanguage` instead of extending
the built-in `LOCALE_IDS`, so the upstream locale plugin stays untouched.

## What it does

- Publishes the language definition `{ id: 'de', label: 'Deutsch', fallback: 'en' }`
  into the client's language picker.
- Contributes `de` dictionaries for ~40 `dsh-client-ui-*` namespaces plus the
  shared `common`/`conversation` namespaces, via `ctx.locale.register(ns, 'de', dict)`.
- Registration order is irrelevant: namespace maps accumulate locales
  independently of the owning package's own `zh`/`en` registrations.

## Structure

- `src/index.ts` — type surface.
- `src/client/index.ts` — client plugin body (`inject: ['locale']`, `immediately: true`).
- `src/client/dicts.ts` — the dictionary data (extracted from the generated
  runtime dictionaries that previously lived as a hand patch in
  `release/dsh/node_modules`).

## Deploying into a runtime installation

Pack and reference from the runtime's `package.json`/`package-lock.json`, then
load it from the target profile's `cordis.patch.yml`:

```yaml
- insert: [{"id": "client-locale-de", "name": "@deepseek-ai/dsh-client-locale-de"}]
```

and add a `link:` dependency in the profile's own `package.json` so the loader
can resolve the package name.

## Known limitations

- Only `web`-platform client dictionaries are covered; host-side strings are
  not translated.
- Dictionary keys drift when upstream UI packages add keys — missing keys fall
  back to `en` by design.
