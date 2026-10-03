# Agent Note: Node-Compile-Cache auf das Runner-Temp-Verzeichnis des Datenvolumes umleiten
[English](2026-08-28-ci-node-compile-cache-data-disk.md) | [中文](2026-08-28-ci-node-compile-cache-data-disk.zh.md) | Deutsch

Status: implemented


## Problem

Die selbstgehostete Linux-CI-VM (`vm-backup`-Pool, 32 Runner-Instanzen auf einem Host) erschöpft die Inode-Kapazität der Root-Partition. Die Rückstände aus Issue #3134 (`/tmp/dsh-*`) sind eine Quelle; eine zweite, größere Quelle ist der Node.js-Modul-Compile-Cache. Werkzeuge der CI-Toolchain rufen `module.enableCompileCache()` explizit auf: pnpm 11.7.0 aktiviert den Cache bei jedem Aufruf in seinem Entry (`module.enableCompileCache?.()` in `bin/pnpm.mjs`), und TypeScript tut dies in `tsc`/`tsserver`; vitest reicht die API weiter, aktiviert sie aber nicht selbst. Jeder solche Aufruf schreibt den serialisierten V8-Bytecode-Cache nach `os.tmpdir()/node-compile-cache`. Auf der geteilten VM ist das `/tmp` der Root-Partition: am 2026-08-28 gemessen **697.389 Inodes und 9,2 GB**, davon 34.110 Dateien jünger als eine Stunde — der Cache wächst bei jedem CI-Lauf und wird nie bereinigt, sodass die 3.276.800 Inodes der Root-Partition auch nach Bändigung der `dsh-*`-Rückstände auf Erschöpfung zusteuern.

## Entscheidung

Jede Linux-Lane, die unter Failover auf dem `vm-backup`-Pool laufen kann (`ci.yml` static/coverage/snapshots — standardmäßig hosted, selbstgehostet nur bei `DSH_CI_FAILOVER_LINUX=selfhosted` — und `ci-master.yml` serial standby, immer selbstgehostet), leitet `NODE_COMPILE_CACHE` auf das Runner-spezifische Temp-Verzeichnis des Datenvolumes `${{ runner.temp }}/node-compile-cache` um. `runner.temp` liegt auf `/data_local` (1 TB, ~1 % Inode-Nutzung) und ist pro Runner (`_workNN/_temp`), sodass der Cache keine Inodes der Root-Partition mehr verbraucht.

Die Umleitung ist ein Step direkt nach `actions/checkout`, der `NODE_COMPILE_CACHE=${{ runner.temp }}/node-compile-cache` in `$GITHUB_ENV` schreibt, sodass jeder spätere Step der Lane — `pnpm/action-setup`, die Store-Pfad-Probe, install, Playwright-Installation und das Test-Gate — die Variable erbt. Die Injektion ist nötig, weil der `runner`-Kontext im Job-level-`env` nicht verfügbar ist (dieselbe Einschränkung wie bei der früheren TMPDIR-Arbeit), und ein Step-level-env nur am Gate-Step würde die früheren pnpm-Aufrufe weiterhin in das `/tmp` der Root-Partition schreiben lassen. Ein eingesperrtes Kind (bwrap/Landlock), dessen Sandbox den `runner.temp`-Pfad nicht gewährt, erbt die Variable, **überspringt das Caching aber stillschweigend** — auf der VM verifiziert: Zeigt `NODE_COMPILE_CACHE` auf einen innerhalb von bwrap nicht gewährten Pfad, läuft `node` normal (Exit 0), anders als `mkdtemp`, das mit einem Read-only-Dateisystemfehler hart fehlschlägt. Der Compile-Cache ist per Design best-effort; ein fehlgeschlagener Schreibvorgang ist ein Cache-Miss, kein Absturz.

## Verifikation

- VM-Probe: `NODE_COMPILE_CACHE=/data_local/ci/compile-cache-probe node -e 'require("node:fs")'` schrieb ein `v22.23.2-x64-*`-Cache-Unterverzeichnis auf die Datenplatte (Ortswechsel wirksam).
- VM-Probe (bwrap): Mit `NODE_COMPILE_CACHE` auf einem vom bwrap-Profil nicht gewährten Pfad lief `node` normal (Exit 0) — ein fehlgeschlagener Cache-Schreibvorgang wird toleriert.
- `scripts/ci-workflow.spec.ts` stellt sicher, dass jede Linux-Lane `NODE_COMPILE_CACHE=${{ runner.temp }}/node-compile-cache` (eine `KEY=VALUE`-Zeile für `$GITHUB_ENV`) vor `pnpm/action-setup` in `$GITHUB_ENV` injiziert; die Positionszusicherung schlägt fehl, wenn die Injektion hinter den ersten pnpm-Aufruf wandert.
- CI-Lanes: Die drei erforderlichen Linux-Jobs (standardmäßig hosted, selbstgehosteter `vm-backup` unter `DSH_CI_FAILOVER_LINUX`) laufen unter der neuen Env die volle Suite; eine Regression im Cache-Verhalten würde als Lane-Fehler sichtbar.

## Erwogene Alternativen

### Warum den Compile-Cache nicht ganz deaktivieren?

`NODE_DISABLE_COMPILE_CACHE=1` würde das Wachstum der Root-Partition sofort stoppen, verwirft aber bei jedem Lauf den Startbeschleunigungsgewinn — und der Cache ist ein legitim nützliches Node-Feature (von pnpm und TypeScript explizit aktiviert). Die Umleitung bewahrt den Nutzen und verlagert die Kosten von der begrenzten Partition weg.

### Warum `node-compile-cache` nicht in die `dsh-*`-Rückstands-Bereinigung aufnehmen?

Die CI-Bereinigung (in der Rückstands-Cleanup-Änderung eingeführt) zielt auf Testrückstände; der Compile-Cache ist ein Cache, kein Rückstand. Ihn bei jedem Lauf zu löschen würde genau die Beschleunigung wegwerfen, für die der Cache existiert. Die Umleitung ist der strukturelle Fix: Das Wachstum des Caches wandert auf das dafür dimensionierte Volume.

### Warum nicht Job-level-env oder Env nur am Gate-Step?

Der `runner`-Kontext ist nur im Step-level-`env` verfügbar; Job-level-`env` wertet ihn zu einem leeren String aus (GitHub-Kontextverfügbarkeit), was den Cache still auf der Root-Partition belassen würde. Ein Step-level-env nur am Gate-Step deckt nur diesen Step ab: Jeder frühere pnpm-Aufruf der Lane (setup, Store-Pfad-Probe, install) würde weiterhin in das `/tmp` der Root-Partition schreiben. Die Injektion in `$GITHUB_ENV` in einem Step zwischen Checkout und `pnpm/action-setup` setzt die Variable vor dem ersten pnpm-Aufruf der Lane — ein Step deckt die ganze Lane ab.

## Konsequenzen

- **Gewonnen**: Der Node-Compile-Cache verbraucht keine Inodes der Root-Partition mehr; der Inode-Druck aus dieser Quelle ist beseitigt, ohne den Startvorteil des Caches zu verlieren. Der Cache liegt nun im Runner-spezifischen `_workNN/_temp` auf dem Datenvolume.
- **Kosten**: Der Cache sammelt sich in `runner.temp` an, das der Runner zwischen Jobs nicht leert (früher gemessen) — auf dem Datenvolume (~1 % Inode-Nutzung) ist das harmlos.
- **Kosten**: Eingesperrte Kinder ohne `runner.temp`-Gewährung überspringen das Caching für ihre eigenen `node`-Aufrufe; das ist ein Cache-Miss, kein Fehler, und entspricht Nodes Best-effort-Vertrag.
- **Kosten**: Die Änderung betrifft nur die CI-Konfiguration; die lokale Entwicklung behält den Standard-`os.tmpdir()`-Ort.
