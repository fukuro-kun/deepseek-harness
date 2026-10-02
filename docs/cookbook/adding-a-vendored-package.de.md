# Cookbook: Hinzufügen eines vendorten Pakets

[English](adding-a-vendored-package.md) | [中文](adding-a-vendored-package.zh.md) | Deutsch

Wenn der Harness ein weiteres Upstream-Cordis-Paket benötigt (z. B. `@cordisjs/plugin-http`), wird es als gepinnter Source unter `vendor/` **vendort**, nicht als NPM-Dependency hinzugefügt. [vendor/README.md](../../vendor/README.md) begründet das und behandelt das *Aktualisieren* eines bereits vendorten Pakets; dieser Guide ist die Datei-für-Datei-Checkliste für das Hinzufügen eines **neuen**. (Validiert gegen den bestehenden vendorten Set; bei Abweichung hier korrigieren.)

## 1. Source hineinkopieren

```
vendor/<dir>/
  package.json     # from upstream; rescope the name, keep exports/type (publishable release member, no private flag)
  tsconfig.json    # extends ../../tsconfig.base.json (see configuration below)
  src/             # the upstream src/ verbatim
  README.md LICENSE # if upstream ships them
```

`tsconfig.json` spiegelt die anderen vendorten Pakete — `rootDir: src`, `outDir: lib/types`, die Strictness-Relaxations, die der Upstream-Code benötigt, und einen `references`-Eintrag für jedes andere vendorte Paket, das es importiert:

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src", "outDir": "lib/types",
    "noUncheckedIndexedAccess": false, "exactOptionalPropertyTypes": false,
    "noImplicitOverride": false, "noUnusedLocals": false, "noUnusedParameters": false
  },
  "include": ["src"],
  "references": [{ "path": "../cordis" }, { "path": "../cosmokit" }]
}
```

`package.json`-Invariants: rescopen Sie den `name` ([Mapping](../rescope.de.md)), während Sie Upstream's `exports`/`type` beibehalten; Deklarations-Metadaten zeigen auf `lib/types`; publishen Sie `.d.ts`- und `.d.ts.map`-Deklarations-Outputs; und listen Sie seine Cordis-Deps in `peerDependencies` (passend zum Upstream-Manifest). Vendorte Pakete sind publishbare Release-Members, daher dürfen sie `private: true` nicht setzen und müssen `publishConfig.access: public` setzen; das `version`-Feld folgt der Harness-Release-Sequenz (siehe [vendor/README.md](../../vendor/README.md)). Transitive Upstream-Deps müssen selbst vendort oder bereits vorhanden sein — vendoren eines Pakets bedeutet oft, dessen gesamten Dependency-Tree zu vendoren (z. B. `@cordisjs/plugin-http` pullt `@cordisjs/fetch-file`).

Lokale relative Imports/Exports in vendortem TypeScript-Source verwenden nach dem Kopieren explizite `.ts`-Specifiers. Das ist ein Repo-lokaler Build-Unterschied zum Upstream: `rewriteRelativeImportExtensions` emittiert `.js`-Runtime-Imports, während Deklarationen explizite `.ts`-Specifiers behalten, die NodeNext/Node16-TypeScript-Consumer resolvieren können.

## 2. In den Root-Configs registrieren

| Datei | Änderung |
|---|---|
| `tsconfig.base.json` | füge `"<npm-name>": ["./vendor/<dir>/src"]` zu `paths` hinzu |
| `tsconfig.host.json` | füge `{ "path": "./vendor/<dir>" }` zu `references` hinzu (vor den `packages/*`-Einträgen; vendorter Code betritt den Graph nur über das Host-Aggregat) |
| `vendor/README.md` | füge eine Manifest-Tabellenzeile hinzu (dir, npm name, version, upstream repo, commit SHA) und logge alle lokalen Modifikationen |
| `scripts/publint-all.ts` | nur wenn das vendorte Paket selbst von hier gepublished wird (vendorte Deps normalerweise nicht — überspringen) |

Automatisch durch Globs abgedeckt — keine Edits nötig: Root-`package.json`-Workspaces (`vendor/*`), `tsdown.config.ts`, `vitest.config.ts`, `.oxlintrc.json`. Ein paketlokales `vendor/<dir>/tsdown.config.ts` wird NUR benötigt, wenn die Build-Konfiguration vom Root-Default abweicht (duales ESM/CJS oder multiple Entries — siehe `vendor/schemastery` und `vendor/logger-console`); sein Entry sollte das unter `lib/types` emittierte JS lesen.

## 3. Den Manifest-Guard beachten

`scripts/check-vendor-manifest.sh` (ein Pre-Commit-Hook) fehlschlägt, wenn etwas unter `vendor/*/src` gestagt ist, ohne dass `vendor/README.md` ebenfalls gestagt ist. Stagen Sie das Manifest-Update zusammen mit dem Source, damit der Commit durchgeht.

## 4. Verifizieren

```sh
pnpm install        # registers the workspace
pnpm run typecheck
pnpm run build && pnpm run constraints
```

Führen Sie die durch die [Teststrategie](../testing.de.md) ausgewählten Behavior-Checks aus. Die Source-`paths`-Map lebt einmal in `tsconfig.base.json` und bedient jeden Graph. Die wichtige Isolationsgrenze ist der Project-Reference-Graph: vendorter Source muss durch sein eigenes `vendor/<dir>/tsconfig.json` referenziert werden, nicht in das strenge Programm eines Aggregats gezogen werden ([Layout](../development.de.md#typescript-project-layout)).
