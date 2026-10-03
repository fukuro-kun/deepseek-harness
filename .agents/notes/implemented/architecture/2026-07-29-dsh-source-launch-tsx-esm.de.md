# Agent Note: dsh-Source-Launch über den tsx-ESM-Hook
[English](2026-07-29-dsh-source-launch-tsx-esm.md) | [中文](2026-07-29-dsh-source-launch-tsx-esm.zh.md) | Deutsch

Status: implemented


> Ersetzt [nativer TypeScript-Source-Launch](../../archived/architecture/2026-07-28-dsh-native-typescript-source-launch.md): Node hat die Capability entfernt, auf der jene Entscheidung aufbaute.

## Problem

Die [archivierte Native-Source-Launch-Entscheidung](../../archived/architecture/2026-07-28-dsh-native-typescript-source-launch.md) lief `apps/cli/src/bin.ts` unter `node --experimental-transform-types` mit einem Resolve-only-Paths-Loader, sodass Node die TypeScript-Transformation besaß. Node 26.0.0 entfernte `--experimental-transform-types` (der Prozess lehnt das Flag mit `bad option` ab) und behielt nur den Strip-Modus, und der Strip-Modus lehnt Syntax ab, die dieser Source-Graph benötigt: vendored Cordis Parameter Properties (`constructor(private ctx: Context)`), die `@Inject`-Decorators in `vendor/hmr` sowie Runtime-Enums/-Namespaces in ganz `vendor/` und `packages/workflow`. Die Engines-Range des Repositorys (`^22.19.0 || >=24.0.0`) umfasst Node 26, sodass die native Launch-Kette dort überhaupt nicht starten konnte — und kein CI-Job führte den echten Launch-Vektor aus, sodass die Inkompatibilität lautlos ausgeliefert wurde.

Auch die Startup-Latenz spielte eine Rolle: Der Off-Thread-`module.register()`-Hooks-Worker serialisierte jede Resolution über Threads hinweg (~440ms `makeSyncRequest`-Wait während des TUI-Boots), und der volle tsx-Default (`--import tsx`) zahlt ~0,4s in der Resolution-Amplifikation seines CJS-Hooks.

## Entscheidung

Die `dsh`-TUI-, Web- und Headless-Source-Launches laufen `node --import tsx/esm`: Der ESM-only-Hook von tsx besitzt sowohl die TypeScript-Transformation als auch die tsconfig-`paths`-Projektion. Das Root-`dsh`-Script nutzt diesen Vektor direkt ab Repository-Root; Artefakt-Generierung ist eine separate Operation unter der [Source-Launch/Build-Trennungs-Entscheidung](../../archived/simplification/2026-08-12-separate-source-launch-from-build.md). Der CJS-Hook bleibt aus, weil der CLI-Source-Graph ESM-only ist; der gemessene Runtime-Launch bis zum TUI-Banner liegt bei ~0,7s versus ~1,1s unter dem vollen tsx-Default und ~0,75s unter der entfernten nativen Kette.

`scripts/tspath-loader.ts` und `apps/cli/src/tsconfig-paths-loader.ts` sind gelöscht. Mit ihnen ging die Runtime-Regel des Loaders, einen Workspace-Import nur für deklarierte Runtime-Dependencies zu mappen — tsx wendet die `paths`-Map bedingungslos an. Deklarations-Vollständigkeit ruht nun allein auf den statischen Gates: `verify-cordis-config` für konfigurierte Bare Plugins und Workspace-Constraints für Manifeste. (Diese Runtime-Regel fand echte Bugs: `dsh-plan-mode` und `dsh-tool-jobs` importierten `@deepseek-ai/dsh-llm`, während sie es nur in devDependencies deklarierten; inzwischen gefixt.)

Die Node-Compat-CI-Matrix (Node 22.19 und 26) gewinnt `dsh-source-launch-smoke` (`apps/cli/tests/source-launch.compat.spec.ts`): ein keyloser Piped-Stdio-Launch des exakten Produktions-Runtime-Vektors, der die Non-Zero-Exit-TTY-Verweigerung assertiert. Jede zukünftige Node-Änderung an Module Hooks oder TypeScript-Handling lässt dieses Gate rot werden, statt das `pnpm dsh` der Entwickler zu brechen.

## Erwogene Alternativen

**Die native Kette auf Node ≤25 behalten und nach Version branchen.** Abgelehnt: Zwei Transformations-Semantiken (amaro versus esbuild) divergieren bei Edge-Syntax, der Launcher bekommt Version-Probing, und die Node-Compat-Matrix müsste beide Pfade abdecken — schwerer Maintenance-Aufwand für ein experimentelles Flag, das sich bereits unter uns geändert hat. Amaro lehnt außerdem die `@Inject`-Decorators ab, die `vendor/hmr` nutzt, sodass der native Pfad die ausgelieferte Default-TUI-Config ohnehin nicht booten könnte.

**Den Source-Graph erasable-only machen, damit Node-26-Strip-Modus ihn akzeptiert.** Abgelehnt: Parameter Properties und Value Namespaces durchziehen vendored Cordis/cosmokit/loader/schemastery; sie umzuschreiben ist unbegrenzter Churn, der bei jedem Vendor-Sync erneut anfällt.

**Ein Repo-eigener In-Thread-Loader (`module.registerHooks()` plus ein esbuild- oder `@swc/core`-Transform).** Abgelehnt: Prototypen maßen etwa 0,45s, während dem esbuild-Pfad End-to-End-Validierung fehlte und SWC an `vendor/hmr`s Decorator-plus-Namespace-Merge in beiden Decorator-Modi scheiterte. Diese Option lässt das Repository außerdem Transform-Korrektheit und einen Resolve-Hook besitzen, den tsx bereits liefert. Nur wieder aufgreifen, falls die gemessene 0,3s-Lücke zu einem materiellen Kostenfaktor wird.

**Built `lib/` für Node 26 laufen lassen und native für 24 behalten.** Abgelehnt: Verliert den Zero-Build-Development-Loop auf der neuesten Node-Linie und mischt Source- und Artefakt-Ebenen.

## Konsequenzen

- Ein Launch-Vektor über die gesamte Engines-Range, einschließlich zukünftiger Node-Linien, die natives TypeScript-Support ändern; das Smoke-Gate erzwingt ihn pro Matrix-Zeile.
- Die TypeScript-Transformation wird wieder an tsx/esbuild delegiert und kehrt damit das Ziel der vorherigen Note um, Node-native Transformation zu beweisen; dieses Ziel ist unerreichbar, solange vendored Sources nicht-eradbare Syntax nutzen und Node keinen Transform-Modus ausliefert.
- Die Runtime-Declared-Dependency-Enforcement in Source-Launches ist weg; undeklarierte Workspace-Imports zeigen sich jetzt nur noch über statische Gates oder Built-Mode-Resolution-Failures.
- Der Runtime-Launch verbessert sich um ~0,4s gegenüber dem vollen tsx-Default; ACP behält `--import tsx`, weil sein Graph nicht auf CJS-Hook-Dependence auditiert wurde und seine Launch-Latenz nicht auf dem interaktiven Pfad liegt.
