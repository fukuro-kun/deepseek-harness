# Vendored-Package-Rescope

[English](rescope.md) | [中文](rescope.zh.md) | Deutsch

Das Cordis-Framework und seine Foundation-Libraries werden unter [`vendor/`](../vendor/README.md) vendored und unter dem `@deepseek-ai`-Scope veröffentlicht, weil jedes Harness-Paket das Framework als Peer-Dependency deklariert: das Veröffentlichen des Harness veröffentlicht diese Schicht mit, und unter den Upstream-Namen würde diese Veröffentlichung sie auf der Registry squatten. Diese Seite ist die Namens-Mapping; die Entscheidung und ihre Konsequenzen leben in der [Rescope-Agent-Note](../.agents/notes/archived/process/2026-08-10-vendor-package-rescope.md), und die Upstream-Commits in [`vendor/README.md`](../vendor/README.md).

## Namens-Mapping

| Verzeichnis | Upstream-Name | Veröffentlichter Name | Upstream-Version | Rolle |
|---|---|---|---|---|
| `vendor/cordis/` | `cordis` | `@deepseek-ai/cordis` | 4.0.0-rc.7 | Framework-Core: `Context`, `Service`, `Fiber`, Events |
| `vendor/cosmokit/` | `cosmokit` | `@deepseek-ai/cosmokit` | 1.8.1 | Geteilte Utilities, auf denen Framework und Schemastery aufbauen |
| `vendor/schemastery/` | `schemastery` | `@deepseek-ai/schemastery` | 3.18.0 | Config-Schemas (`Schema`) hinter jedem Plugin-`Config` |
| `vendor/loader/` | `@cordisjs/plugin-loader` | `@deepseek-ai/cordis-plugin-loader` | 1.0.0-rc.5 | `cordis.yml`-Loading, Plugin-Auflösung, Repository-Cache |
| `vendor/include/` | `@cordisjs/plugin-include` | `@deepseek-ai/cordis-plugin-include` | 1.0.4 | Config-Includes und Patch-Overlays |
| `vendor/group/` | `@cordisjs/plugin-group` | `@deepseek-ai/cordis-plugin-group` | 1.0.0 | Verschachtelte Plugin-Gruppen |
| `vendor/timer/` | `@cordisjs/plugin-timer` | `@deepseek-ai/cordis-plugin-timer` | 1.1.2 | Disposal-aware Timer auf `ctx` |
| `vendor/hmr/` | `@cordisjs/plugin-hmr` | `@deepseek-ai/cordis-plugin-hmr` | 1.0.15 | Hot Module Replacement für Plugins und Config |
| `vendor/logger-console/` | `@cordisjs/plugin-logger-console` | `@deepseek-ai/cordis-plugin-logger-console` | 1.0.0 | Console-Logger-Exporter |

Subpath-Exports behalten ihren Pfad: `@cordisjs/plugin-loader/repository` wird zu `@deepseek-ai/cordis-plugin-loader/repository`.

## Was das Rename nicht berührt

- **Verzeichnisnamen und Upstream-Source-Versionen.** `vendor/hmr/` bleibt `vendor/hmr/`, und die Tabelle zeichnet die Upstream-Version des gepinnten Source-Snapshots auf, sodass das Manifest als ein Upstream-Snapshot liest; das eigene `version`-Feld des vendored `package.json` ist die released Manifest-Version des Harness, die `pnpm run release:vendor` bumped und ein Re-Sync zur Upstream-Version restauriert.
- **Dependency-Ranges.** Ein Dependency-Eintrag ändert seinen Key, nie seine Range: `"cordis": "^4.0.0-rc.7"` wird zu `"@deepseek-ai/cordis": "^4.0.0-rc.7"`. `linkWorkspacePackages` resolved diese bewahrten Ranges zu den gepinnten Workspaces.
- **Das `cordis:`-Builtin-Präfix des Loaders.** `cordis:include` und `cordis:group` sind ein Protokoll-Präfix, kein Package-Name.
- **Die `cordis.yml`-Config-Familie**, einschließlich `*.cordis.yml`, `*.cordis.snapshot.yml` und `cordis.patch.yml`.
- **Harness-Pakete, deren eigene Namen das Wort enthalten**, wie `@deepseek-ai/dsh-tool-cordis`.
- **Upstream-Runtime-Identifiers**, wie Schemasterys `Symbol.for('schemastery')` und sein `vendor:`-Metadaten-Feld.
- **Prose außerhalb `docs/`.** `vendor/*/README.md`, Package-READMEs und Agent Notes behalten die Namen, mit denen sie geschrieben wurden; ein bloßes `cordis` dort kann auch der Options-Name des Python-SDK oder eine agent-preset-id sein. Innerhalb `docs/` folgen Prose und jeder Markdown-Fence dem Rename.

## Was dein Code ändern muss

| Stelle | Vorher | Nachher |
|---|---|---|
| Modul-Import | `import { Context } from 'cordis'` | `import { Context } from '@deepseek-ai/cordis'` |
| Typed-Event-Merge | `declare module 'cordis'` | `declare module '@deepseek-ai/cordis'` |
| `package.json`-Dependency-Key | `"@cordisjs/plugin-hmr": "^1.0.15"` | `"@deepseek-ai/cordis-plugin-hmr": "^1.0.15"` |
| `cordis.yml`-Plugin-Eintrag | `name: '@cordisjs/plugin-include'` | `name: '@deepseek-ai/cordis-plugin-include'` |

## Anwenden, Verifizieren und Revertieren

[`scripts/rescope-vendor.ts`](../scripts/rescope-vendor.ts) besitzt das Mapping oben und führt das Rename aus, sodass keine Referenz von Hand renamed wird:

```sh
pnpm run rescope-vendor            # report what would change
pnpm run rescope-vendor --apply    # rewrite every reference
pnpm run rescope-vendor:check      # assert the post-state; runs in the hygiene gate
pnpm run rescope-vendor --apply --reverse   # return to the upstream names
```

Re-apply es nach einem Upstream-Sync ([Prozedur](../vendor/README.md)), und folge ihm mit der Regeneration, die es printed: `pnpm install` für das Lockfile, `pnpm run gen-third-party-notices` und `pnpm run verify-translation-pairing --write` für die bilingual Paaren, die es berührte.
