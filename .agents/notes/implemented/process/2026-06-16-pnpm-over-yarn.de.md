# Agent Note: pnpm als Package Manager statt Yarn 4
[English](2026-06-16-pnpm-over-yarn.md) | [中文](2026-06-16-pnpm-over-yarn.zh.md) | Deutsch

Status: implemented


## Problem

Das Repository lief ursprünglich mit **Yarn 4** und dem `node-modules`-Linker — eine bewusst konservative Wahl, die sich wie npm's flaches Layout verhält und gleichzeitig Yarns Workspaces und `yarn constraints` bietet. Es funktionierte. Aber Yarn 4's Plug'n'Play-Herkunft macht den `node-modules`-Linker zum abgelegenen Modus, und das breitere JS-Ökosystem — Tooling-Defaults, CI-Actions, Corepack-Beispiele, Vertrautheit der Contributors — zentriert sich zunehmend auf pnpm. Für ein Repository, das hauptsächlich von Agents gebaut und von gelegentlichen menschlichen Contributors gelesen wird, hat "der Package Manager, den die meisten Tools und Menschen erwarten" realen Wert: weniger Überraschungen, ausgetreteneren Fehlerpfade, mehr copy-pastefähige Antworten.

Die Wechselkosten sind gerade jetzt am niedrigsten. Nichts publiziert aus diesem Repository (jedes Package ist `private: true`); Entwicklung, Tests und Source-Mode-Demos laufen über ihre deklarierten TypeScript-Launcher, während Artifact-Checks explizit bauen. Der Package Manager muss daher nur (a) `node_modules` auflösen und verlinken, (b) die Workspace-Skripte ausführen und (c) die Workspace-Constraints durchsetzen. Das einzige Yarn-spezifische Asset ist `yarn.config.cjs` (die `@yarnpkg/types`-Constraints-Engine), die klein und mechanisch neu auszudrücken ist. Dies spiegelt die Begründung der [tsdown-Entscheidung](../../archived/process/2026-06-11-tsdown-over-dumble.md): Ein tragendes Tool gegen die Option mit dem gesünderen Ökosystem tauschen, solange der Explosionsradius noch klein ist.

## Entscheidung

**pnpm 11.7.0** wird übernommen, gepinnt über das `packageManager`-Feld. Das Contributor-Setup verwendet Corepack, während die CI den Pin über `pnpm/action-setup` installiert:

- **Workspaces** wandern vom `package.json`-`workspaces`-Array + `.yarnrc.yml` nach `pnpm-workspace.yaml`; vendored Packages, gruppierte Packages, Anwendungen, die Website, native Launcher und der Python-Runtime-Closure sind explizite Member.
- **Strenger Symlink-Linker** (pnpm-Default) ersetzt Yarns gehoisteten `node-modules`-Linker. Wir fügen bewusst **kein** `node-linker=hoisted` / `shamefully-hoist`-Schlupfloch hinzu: pnpm's nicht-flaches `node_modules` lässt Phantom-Dependencies (Import einer undeklarierten transitiven Dependency) laut fehlschlagen, was für ein Repository, dessen gesamte Qualitätsgeschichte mechanische Gates sind ([mechanische Quality Gates](2026-06-11-quality-gates.de.md)), ein *Feature* ist. Die Gate-Suite — Typecheck, Lint, Test und Build — ist das Sicherheitsnetz, das beweist, dass keine solchen Phantom-Imports existieren.
- **Build-Script-Allowlist.** pnpm 10+ führt Dependency-Lifecycle-Skripte nicht aus, sofern sie nicht allowlisted sind. `pnpm-workspace.yaml` trägt eine explizite `allowBuilds`-Map (`esbuild`, `lefthook`, `@google/genai`, `protobufjs`) — dieselbe Supply-Chain-Hardening-Haltung, die das Repository bereits gegenüber Modell-/Tool-Output einnimmt, nun auf Code-Ausführung zur Installationszeit angewendet. `peerDependencyRules.allowedVersions.typescript: '>=5 <7'` unterdrückt harmlose Peer-Range-Warnungen für das repo-eigene TypeScript.
- **Shell-freier Package-Manager-Wiedereintritt.** Repository-Skripte, die einen weiteren pnpm-Befehl starten, lösen `npm_execpath` nach Dateiform auf: `.js`-, `.cjs`- und `.mjs`-Einträge laufen unter dem aktuellen Node-Executable, während native und Shebang-Executables direkt laufen. Keiner der beiden Pfade verwendet eine Shell, sodass Befehlspfade und Argumente plattformübergreifend ihren literalen Inhalt behalten. Der [native Windows-Pull-Request-Job](2026-08-08-native-windows-pull-request-ci.de.md) stellt `@pnpm/exe` bereit, sodass sein vollständiges Inventar ein echtes PE-Entry-Integrationssignal liefert.
- **Constraints werden Package-Manager-unabhängig.** `yarn.config.cjs` (das `@yarnpkg/types` importierte und `Yarn.workspaces()` / `workspace.set()` verwendete) wird durch `scripts/check-workspace-constraints.ts` ersetzt, ein schlichtes tsx-Skript, ausgeführt als `pnpm run constraints`. Es setzt die identischen Invarianten durch — jedes Package `private: true`; `@deepseek-ai/dsh-*`-Packages deklarieren `cordis` als Peer- und Dev-Dependency mit übereinstimmenden Ranges, verwenden die Root-`package.json`-Version und setzen `type: module`; vendored Packages nur auf Privatheit geprüft — über denselben `vendor`- + `packages`-Scope.
- Alle `yarn …`-Verben in CI, lefthook-Hooks, `package.json`-Skripten und Docs werden zu `pnpm …` / `pnpm run …`. `yarn.lock` → `pnpm-lock.yaml` (Lockfile v9). `.gitignore` tauscht `.yarn/` gegen `.pnpm-store/`. Vendored READMEs (z.B. `vendor/cordis/README.md`) behalten ihre Upstream-`yarn`-Beispiele unverändert gemäß der Vendoring Policy.

## Erwogene Alternativen

- **Yarn 4 behalten** — null Churn, setzt aber auf den weniger begangenen Linker-Modus und eine an einen Package Manager gebundene Constraints-Engine.
- **npm workspaces** — allgegenwärtig, aber keine Constraints-Story und schwächere Monorepo-Ergonomie.
- **pnpm mit gehoistetem Linker** — glattere Migration, verwirft aber die Phantom-Dependency-Sicherheit, die der zentrale Korrektheitsgrund für den Wechsel ist.
- **`npm_execpath` immer durch Node ausführen** — funktioniert für pnpm's JavaScript-Distribution, verlangt aber, dass Node das von `@pnpm/exe` gelieferte ELF-, Mach-O- oder PE-Executable parst.
- **Wiedereintrittsbefehle durch eine Shell ausführen** — akzeptiert mehr Launcher-Formen, ändert aber Quoting, Metazeichen-Expansion, Executable-Auflösung und Signalverhalten für jeden Child-Befehl.

## Konsequenzen

Der Constraints-Check verliert Yarns Auto-**Fix** (`workspace.set()` konnte ein Manifest in-place umschreiben); das tsx-Skript ist check-only und beendet stattdessen mit einer Meldung und Nicht-Null-Exit. Das ist akzeptabel — die CI lief nie `--fix`, und eine einzeilige manuelle Änderung ist selten. Contributors führen nun `corepack enable` für pnpm statt Yarn aus; `pnpm exec lefthook install` ersetzt `yarn lefthook install` (der `postinstall`-Hook führt weiterhin `lefthook install` aus).

Performance (zur Migrationszeit auf dem Dev-NFS-Dateisystem gemessen; einstellige Sample-Anzahlen, hohe Varianz — richtungsweisend, keine Benchmark-Suite):

| Szenario | Yarn 4 | pnpm 11 |
|---|---|---|
| Kalt (leerer Cache/Store, kein `node_modules`) | ~14 s | ~16 s |
| Warmes Relinken (Cache/Store warm, `node_modules` entfernt) | ~12–14 s | ~15–22 s |
| Frozen, `node_modules` vorhanden (No-op-Revalidierung) | ~2–8 s | ~0,5–7 s |

Auf einer schnellen lokalen Platte gewinnt pnpm's content-adressierter Store typischerweise bei Kalt-/Warm-Installs und insbesondere beim **Plattenbedarf** über mehrere Checkouts (ein globaler Store, per Hardlink in jedes `node_modules` eingebunden, vs. Yarn, das ~279 MB pro Worktree kopiert — einige Devs halten regelmäßig ~10 oder mehr Worktrees für dieses Repository). Dieser Dedup-Vorteil zeigte sich **nicht** in den Migrationszahlen oben, weil Test-Store und `node_modules` auf verschiedenen Dateisystemen lagen, was Hardlinks vereitelt; auf einer Single-Filesystem-Dev-Box oder einem CI-Cache greift er. Die ehrliche Zusammenfassung: Die Installationsgeschwindigkeit auf unserem NFS-Dev-Dateisystem ist innerhalb des Rauschens ein Patt; der Wechsel ist durch Ökosystem-Ausrichtung, Phantom-Dependency-Sicherheit und Checkout-übergreifendes Disk-Dedup gerechtfertigt — nicht durch einen rohen Install-Zeit-Gewinn.

Alle Quality Gates (Constraints, Typecheck, Lint, doc-sync, test:coverage bei 100 %, Build, publint und Built-Application-Smokes) bestehen unter pnpm, was der Korrektheitsbeweis dafür ist, dass der Linker-Tausch keinen Phantom-Dependency-Bruch einführt.
