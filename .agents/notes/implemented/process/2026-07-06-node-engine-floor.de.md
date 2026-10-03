# Agent Note: Anheben der Node-LTS-Engine-Untergrenze auf 22.19

Status: implemented

[English](2026-07-06-node-engine-floor.md) | [中文](2026-07-06-node-engine-floor.zh.md) | Deutsch

## Problem

Der Node-22-Zweig des Root-`engines.node`-Ranges ist ein Vertrag für den installierten Workspace, nicht nur für die Runtime-APIs, die der Harness-Quellcode direkt aufruft. Er darf nicht niedriger liegen als die `engines.node`-Deklarationen der Abhängigkeiten, die der Workspace auf diesem Zweig installiert; andernfalls schlägt `pnpm install --engine-strict` auf einer beworbenen LTS-Version fehl, und nicht-strikte Installationen laufen außerhalb der von einer Abhängigkeit unterstützten Runtime.

## Entscheidung

`engines.node` auf `^22.19.0 || >=24.0.0` gesetzt und keyless CI auf `['22.19', 24, 26]` getestet. Die primären Node-24-Jobs besitzen das vollständige Typecheck- und Unit-Coverage-Inventar; jede Version führt fokussierte source-worker-, Zstandard-, source-launch- und [jsdom-storage](../../archived/testing/2026-07-30-vitest-jsdom-webstorage-ownership.md)-Smoke-Tests aus, ohne dieses Inventar zu wiederholen. Der echte API-e2e-Workflow bleibt auf Node 24, weil er API-Integration prüft und nicht die Runtime-Untergrenze.

Zwei Node-Features begrenzen die Source-Runtime:

- **`node:sqlite`** — `packages/storage/storage-sqlite` führt ein Top-Level `import { DatabaseSync } from 'node:sqlite'` aus, und der optionale Session-Query-Provider lädt es bei der ersten Suche. Das Modul ließ die Anforderung des `--experimental-sqlite`-Flags bei **22.13** (LTS) und **23.4** (Current) fallen; davor wirft sein Import beim Laden.
- **Natives TypeScript-Type-Stripping** — der Built-Mode-Smoke `apps/cli/tests/profiles/headless/tests/keyless-smoke.e2e.ts` startet den `.ts`-Treiber aus test-support unter plain `node` (kein tsx) und lädt den `.ts`-Testadapter (`cli-mock-llm.ts`). Type-Stripping ist Standard ab **22.18** (LTS) und **23.6** (Current); davor benötigt es `--experimental-strip-types`.

Diese Source-Features sind auf der 22.x-Linie ab **22.18** frei, aber die installierte Pi-Adapter-Abhängigkeit hebt die beworbene LTS-Untergrenze an. `@deepseek-ai/dsh-llm-pi-ai` hängt von `@earendil-works/pi-ai@0.79.3` ab, dessen Paket `engines.node >=22.19.0` deklariert, also liegt die LTS-Untergrenze bei **22.19**. Der 24.x-Zweig bleibt `>=24.0.0`. Der disjunkte Range schließt Node 23 vollständig aus: Node 23.0–23.5 hat noch mindestens ein geflaggtes Source-Feature, und die 23er-Linie ist non-LTS/EOL, sodass ein beworbenes `>=23.6` eine tote Release-Linie und einen CI-Leg hinzufügen würde, den kein Deployment nutzen sollte.

`@types/node` bleibt auf der 22.x-Linie gepinnt (`^22.20.0`), passend zur LTS-Support-Linie: Das Greifen nach einer Node-23+/24+/25+-API lässt `tsc` auf jeder Maschine und in der Typecheck-Gate fehlschlagen, statt sauber zu kompilieren und erst zur Laufzeit zu scheitern, wo es nur ein Floor-Matrix-Leg auffangen könnte. Der gesamte Baum typecheckt sauber gegen die Node-22-Typ-API, sodass der Pin nichts kostet.

## Konsequenzen

- Der beworbene LTS-Zweig unterschreitet die Untergrenze der Pi-Adapter-Abhängigkeit nicht mehr.
- CI beweist die Node-22-LTS-Untergrenze direkt mit Node 22.19, hält die primäre Coverage auf `node: 24` und prüft Node 26 als nächste gerade Linie; fokussierte Kompatibilitäts-Smokes laufen auf allen drei Versionen.
- Der Built-Mode-Smoke braucht kein versionsbedingtes Flag: Ab 22.19 ist Type-Stripping bereits Standard, sodass der example-eigene TypeScript-Treiber ein plain `node fixture.ts`-Pfad bleibt.
- Eine künftige Abhängigkeit oder Source-API, die die Runtime-Untergrenze anhebt, muss `engines.node`, die Kompatibilitätsmatrix und diese Agent Note in derselben Änderung mitziehen.

## Berücksichtigte Alternativen

- **`^22.18.0 || >=24.0.0` beibehalten.** Abgelehnt: Es bewirbt eine LTS-Version unterhalb der Untergrenze der Pi-Adapter-Abhängigkeit. `@earendil-works/pi-ai@0.79.3` verlangt `>=22.19.0`.
- **`@earendil-works/pi-ai` downgraden oder pinnen, um den beworbenen 22.18-Range zu halten.** Abgelehnt: Die aktuelle Pi-Adapter-Abhängigkeit ist Teil des vorgesehenen Workspace, und 22.19 liegt noch innerhalb der Node-22-LTS-Linie.
- **Untergrenze `>=22.13` (die `node:sqlite`-Grenze) plus `--experimental-strip-types` im Built-Bin-Smoke auf 22.13–22.17.** Abgelehnt: Es fügt ein versionsbedingtes Test-Flag für einen schmalen Bereich hinzu und gibt einer Experimental-Flag-Abhängigkeit den Anschein erstklassiger Unterstützung. Die Pi-Adapter-Abhängigkeit verlangt ohnehin eine höhere LTS-Untergrenze.
- **Offenes `>=22.19`.** Abgelehnt: Es bewirbt Unterstützung für Node 23.0–23.5, wo `node:sqlite` (bis 23.4) bzw. Type-Stripping (bis 23.6) noch geflaggt ist.
- **Node 23.6+ aufnehmen (`^22.19.0 || >=23.6.0`).** Abgelehnt: 23.6+ führt beide Source-Features zwar ungeflaggt aus, aber Node 23 ist end-of-life; eine tote Release-Linie zu bewerben fügt einen Range-Term und einen CI-Leg für eine Runtime hinzu, die kein Deployment nutzen sollte.
- **Matrix `[22, 24, 26]` statt Pin auf `22.19`.** Abgelehnt: Fließende Major-Version-Einträge driften mit der Zeit nach oben und prüfen dann still nicht mehr die deklarierte LTS-Untergrenze.
- **`@types/node` vor der Untergrenze halten (`^25`).** Abgelehnt: Typen vor der Runtime-Untergrenze lassen eine nur in Node 24/25 vorhandene API sauber kompilieren und erst zur Laufzeit auf 22.x scheitern. Der Pin von `@types/node` auf die 22.x-Linie macht daraus überall einen Kompilierfehler.
