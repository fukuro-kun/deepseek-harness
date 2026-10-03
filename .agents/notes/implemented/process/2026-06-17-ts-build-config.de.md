# Agent Note: TSC-first Build und eine Compiler-Zuständigkeit

Status: implemented

[English](2026-06-17-ts-build-config.md) | [中文](2026-06-17-ts-build-config.zh.md) | Deutsch

> Die Topologie des Root-Projekts nutzt einen Solution-Root über zwei Aggregate-Programmen; siehe die [Solution-Root-Note](../../archived/process/2026-07-22-tsconfig-solution-root-two-aggregates.md). Die [API-Remotes-Build-Note](../../archived/process/2026-08-08-api-remotes-generated-contract-build.md) definiert die aktuelle Befehlsreihenfolge, in der der Host die Remote-Contracts generiert, bevor der Client kompiliert. Die hier entschiedene tsc-first-Zuständigkeit ist unverändert.

## Problem

Das bisherige TypeScript-Build- und Typecheck-Setup hatte folgende Probleme:

- `build` nutzte `tsc`, um `.ts` für Pakete unter `packages/<group>/<pkg>` und `vendor/*` in `.d.ts`-Dateien zu transformieren, und danach `tsdown`, um `.ts` in gebündelte `.js`-Dateien zu transformieren. Damit führten zwei Tools die TypeScript-Transformation aus.
- `typecheck` validierte tendenziell Pakete, Vendor-Quellen, Examples, Tests und Skripte über eine einzelne Root-Typecheck-Config.

Build und Typecheck nutzen übereinstimmende tsconfig-Grenzen und dasselbe TypeScript-Auflösungs-/Transformationsverhalten. Der Build erzeugt `.js`, `.d.ts`, `.js.map` und `.d.ts.map` über einen Compiler und eine Config, sodass Publish-Output und Typvalidierung konsistent bleiben.

Konkrete Constraints:

- `tsdown` nutzt `oxc` für die TypeScript-Transformation, was nicht dasselbe Verhalten wie `tsc` ist.
    - Das von `tsdown` emittierte gebündelte `.d.ts` kollidiert mit Cordis' interner relativer Module-Augmentation-Struktur.
    - Der tsc-Output wird von `allowImportingTsExtensions` beeinflusst: Generierte `.js`-Dateien dürfen keine `.ts`-Dateien importieren, und generierte `.d.ts`-Dateien müssen explizite relative Specifier behalten, die NodeNext/Node16 akzeptiert. Daher nutzen paketinterne relative Imports explizite `.ts`-Specifier im TypeScript-Quelltext, und `rewriteRelativeImportExtensions` schreibt diese Specifier im emittierten JS zu `.js` um.
    - Das von `tsdown` emittierte gebündelte `.js` verhält sich nicht wie das per-File `.js` von `tsc -b`, etwa beim Decorator-Transform.
- `vendor/*/src`, Examples, Tests und Skripte können nicht alle plain in ein Root-Strict-Programm inkludiert werden.
    - Direktes Typechecking von `vendor/*/src` unter der Root-Strict-Config löst viele Typfehler außerhalb des Verantwortungsbereichs dieses Projekts aus.
    - Paketabhängigkeiten unter `packages/*/*` auf `vendor` werden wegen der unterschiedlichen tsconfig-Strictness auf `vendor/*/lib` aufgelöst.


## Entscheidung

Paketinterne relative Imports verwenden explizite `.ts`-Specifier.

`pnpm run build` ordnet Host lib, Client lib und Web; jede lib-Phase hält die tsc-Emission vor dem tsdown-Bundling:

- Host tsc führt `tsc -b` gegen `tsconfig.host.json` aus und emittiert per-Modul `.js`, `.d.ts`, `.js.map` und `.d.ts.map` in `lib/types` jedes Pakets im Host-Graphen; Host tsdown liest danach dieses JavaScript, erzeugt die publizierten Entries und führt Host Typert aus.
- Client tsc führt `tsc -b` gegen `tsconfig.client.json` aus, nachdem Host Typert die Remote-Client-Deklarationen generiert hat; Client tsdown liest dann das vom Client-Graphen emittierte JavaScript und erzeugt die Node-loader-Entries und Browser-Bundles der Client-Pakete.
- Der Web-Build startet erst, nachdem beide lib-Phasen abgeschlossen sind.

`tsdown` ist nicht mehr Eigentümer der TypeScript-Kompilierung oder der Deklarationsausgabe.

`pnpm run typecheck` führt zuerst die Host-lib-Phase aus, um die für das Client-Typechecking benötigten Remote-Deklarationen zu erzeugen, und danach `tsc -b` gegen `tsconfig.client.json`. Die beiden Aggregate selbst prüfen ihre jeweiligen Examples, Tests und Skripte mit `noEmit`; referenzierte Paket-/Vendor-Projekte behalten dasselbe Emit-Verhalten wie der Build.

Composite-Projekte halten ihre inkrementellen Build-Informationen in ihrem projektlokalen `lib/`-Output. `pnpm run clean` leitet aktive Output-Verzeichnisse aus dem TypeScript-Project-Reference-Graphen des Roots ab, entfernt veraltete Build-Informationen im Root und entfernt gelöschte `packages/*/*`-Verzeichnisse, die nur bekannte generierte Rückstände enthalten. Vor dem Entfernen eines existierenden Ziels löst es den Parent des Ziels auf und verweigert die Löschung, wenn dieser aufgelöste Parent außerhalb des Repositories liegt, damit ein per Symlink referenziertes Projekt die Bereinigung nicht aus dem Checkout heraus umleiten kann. Es erhält `node_modules` für jedes Paket, das noch ein `package.json` hat, und verweigert das Entfernen eines manifest-losen Verzeichnisses mit unbekannten Dateien. Der Build ruft clean nicht automatisch auf, sodass gewöhnliche Builds ihren inkrementellen Zustand behalten.

Die Orchestrierungsform der Befehle ist:

```sh
pnpm run build:
tsc -b tsconfig.host.json
tsdown --env.DSH_BUILD_FACE host
tsc -b tsconfig.client.json
tsdown --env.DSH_BUILD_FACE client
pnpm run build:web

pnpm run verify-node-next-types:
tsx scripts/verify-node-next-types.ts

pnpm run typecheck:
pnpm run build:lib:host
tsc -b tsconfig.client.json

pnpm run clean:
tsx scripts/clean.ts
```

Die Source-Mode-Demos laufen über ihre deklarierten TypeScript-Launcher und die Root-Paths-Map. Die `dsh`-TUI-Kette nutzt Nodes native Transformation plus den app-eigenen Paths-loader, die Web-Demo baut ihre benötigten Artifacts, bevor sie in dieselbe CLI-Source-Kette einsteigt, und die übrigen Source-Demos verwenden weiterhin tsx.

## Berücksichtigte Alternativen

- **`tsdown`/oxc als TypeScript-Transformer beibehalten** — oxc' Transform ist nicht das `tsc`-Verhalten (Decorator-Transform weicht ab, gebündeltes JS unterscheidet sich von per-File-Emission), und sein gebündeltes `.d.ts` kollidiert mit Cordis' interner relativer Module-Augmentation-Struktur.
- **Ein Root-Strict-Programm über Pakete, Vendor, Examples, Tests und Skripte** — Vendor-Quellen lösen unter den Root-Strict-Flags Typfehler außerhalb des Verantwortungsbereichs dieses Projekts aus; Project References mit Strictness pro Projekt sind die funktionierende Grenze.
- **Clean vor jedem Build** — würde den von `tsc` und dem Bundler gehaltenen inkrementellen Zustand verwerfen, selbst wenn das Workspace-Layout unverändert ist.
- **Jedes paketbezogene `node_modules` entfernen** — gültige Paket-Dependency-Links verursachen den Workspace-Discovery-Fehler nicht, und ihr Löschen würde die Build-Bereinigung in eine Neuinstallation der Abhängigkeiten verwandeln.

## Konsequenzen

Die Build-Zuständigkeiten sind klarer:

- Jedes gewöhnliche Modul unter `packages/<group>/<pkg>` und `vendor/*` hat eine lokale tsconfig für Build, Typecheck und Tools, die Quellen direkt ausführen, wie den `dsh`-Source-loader, `tsx` und `vitest`. `api/remotes` ist die einzige Ausnahme: Die Ordering der generierten Contracts erfordert eine Solution und zwei sich gegenseitig ausschließende emittierende Projekte.
- Der `build`-Befehl führt die Host- und Client-Project-Reference-Graphen der Reihe nach aus. In jeder Phase ist `tsc -b` für den publizierbaren per-Modul `.js`- und `.d.ts`-Output zuständig, während der Bundler nur die publizierten Runtime-Bundles besitzt.
    - `lib/types/*.d.ts` ist der Publish-Deklarationsoutput; `.d.ts.map` bleibt nur als lokales Kompilierungsartifact.
    - `lib/types/*.d.ts` verwendet explizite `.ts`-relative Specifier, die TypeScripts NodeNext/Node16-Resolver auf benachbarte `.d.ts`-Dateien abbildet.
    - `lib/types/*.js` ist normalerweise nur Bundler-Input. Es wird nur publiziert, wenn ein expliziter Runtime-Export in den emittierten Baum zeigt.
    - `lib/index.*` ist der Publish-Runtime-Output und wird vom Bundler erzeugt, derzeit `tsdown`.
- `pnpm run verify-node-next-types` scannt gebaute Deklarationen nach relativen Specifiern ohne Dateiendung und typecheckt danach einen temporären externen ESM-Consumer mit `moduleResolution: "NodeNext"` gegen die gebaute `types`/`exports`-Fläche, sodass Deklarations-Specifier-Regressionen vor dem Publish fehlschlagen.
- Der `typecheck`-Befehl verwendet `tsconfig.json`. Examples, Tests und Skripte werden vom Root-No-Emit-Projekt geprüft, während Pakete und Vendor-Module dasselbe Emit-Verhalten wie `build` behalten. Paket- und Vendor-Quellen bleiben hinter Project-Reference-Grenzen.
- Nach einem Branch-Wechsel oder dem Aktualisieren eines Checkouts, der Pakete gelöscht hat, können Contributors vor dem Rebuild `pnpm run clean` ausführen, um veraltete Paketverzeichnisse zu entfernen. Unbekannte Dateien in einem manifest-losen Paketverzeichnis erfordern manuelle Einordnung statt Löschung.

Die Cordis-Vendor-Kopie hat nun eine weitere Typstruktur-Divergenz vom Upstream. Beim Upstream-Sync muss diese Divergenz erneut angewendet oder explizit aufgegeben werden.
