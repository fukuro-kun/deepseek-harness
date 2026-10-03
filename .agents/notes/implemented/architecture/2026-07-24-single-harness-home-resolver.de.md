# Agent Note: Ein Harness-Home-Resolver

Status: implemented

[English](2026-07-24-single-harness-home-resolver.md) | [中文](2026-07-24-single-harness-home-resolver.zh.md) | Deutsch

## Problem

Der Harness hatte zwei inkonsistente Konventionen für „wo liegen DeepSeek-Harness-User-Daten":

- `@deepseek-ai/dsh-home` löste `configured ?? $DSH_HOME ?? ~/.dsh` auf.
- `@deepseek-ai/dsh-home-paths` lieferte einen **zweiten** `resolveDshHome` mit derselben Precedence plus Tilde-Expansion — ein Nahe-Duplikat von `dsh-home`, das kein Gate anmahnte, weil beide in verschiedenen Packages lebten und bereits auseinandergelaufen waren (nur einer expandierte Tilden).

Zwei Resolver für dieselbe querschnittliche Tatsache bedeuteten, dass es keine einzige Home-Policy gab.

## Entscheidung

Ein Resolver besitzt das Harness-Home, in `@deepseek-ai/dsh-home-paths`, mit einer Root:

```
explicit configured path  >  $DSH_HOME  >  ~/.dsh
```

Ein leeres oder nur aus Whitespace bestehendes `$DSH_HOME` wird als unset behandelt; andernfalls würde `resolve('')` das Home still auf das aktuelle Arbeitsverzeichnis legen. Der Harness hält alle User-Daten unter einer Root; es gibt keine XDG-config/data/cache-Aufteilung. `dshHomePath(...segments)` hängt Deployment-eigene Kinder an diese Root, und `dsh-app-boot` exponiert sie an Loader-`!!js`-Config-Ausdrücke, bevor Entries gemountet werden, sodass ausgelieferte Compositions `sessions` und `storages` ableiten, ohne den Resolver zu kopieren. `dshHomeDisplay()` benennt eine aufgelöste Root symbolisch für User-facing-Pfade — `~/.dsh` für das Default-Home, `$DSH_HOME` für jedes konfigurierte Home — damit das User-globale `AGENTS.md`-Label nie einen absoluten Maschinenpfad leakt. Es ersetzt die maßgeschneiderte Default-vs.-`$DSH_HOME`-Prüfung von agent-instructions.

`@deepseek-ai/dsh-home` ist gelöscht. Home-besitzende Provider und Boot-Packages importieren `resolveDshHome` aus `dsh-home-paths`; Composition-Bundles enthalten nur die aufgelösten Config-Zeilen.

`dsh-telemetry` und seine separate Home-Policy fehlen unter der [Entfernung der SDK-Projekt-Toolchain](../../archived/simplification/2026-08-11-remove-sdk-project-toolchain.md), womit dieser Resolver die alleinige Home-Policy bleibt.

## Erwogene Alternativen

**Die zwei `resolveDshHome`-Kopien belassen.** Sie waren bereits auseinandergelaufen (eine expandiert Tilden, eine nicht) und kodieren dieselbe querschnittliche Tatsache zweimal. Konsolidierung ist der Sinn der `util/`-Ebene; ein duplizierter Resolver ist ein latenter Divergenz-Bug.

**XDG übernehmen (`$XDG_CONFIG_HOME` beachten oder config/data/cache in getrennte Bäume aufteilen).** Erwogen und zugunsten einer offensichtlichen Root verworfen. Eine einzige `$DSH_HOME || ~/.dsh`-Grundwahrheit entspricht `~/.claude` / `~/.aws`, braucht keine Per-Kind-Umklassifizierung jedes `~/.dsh`-Consumers und hinterlässt keine Resolver-Asymmetrie, die ausgeglichen werden müsste.

## Konsequenzen

- Eine Home-Tatsache, ein Resolver. `dsh-home-paths` ist der alleinige Owner; die `util/`-Gruppe verliert das `home`-Package.
