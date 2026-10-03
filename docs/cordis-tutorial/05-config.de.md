# 5. Konfiguration
[English](05-config.md) | [中文](05-config.zh.md) | Deutsch


Jeder `cordis.yml`-Eintrag kann einen `config`-Block enthalten. Das Plugin deklariert ein schema, das diesen Block vor der Ausführung von `apply` validiert. Ungültige Konfiguration lässt den Laden mit einer präzisen Fehlermeldung scheitern — das Plugin startet nie halb konfiguriert.

## Ein konfigurierbares Plugin

Erstelle `config-demo.ts` in `tmp/cordis-tutorial`:

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'config-demo'

export interface Config {
  greeting: string
  targets: string[]
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
  targets: Schema.array(String).default(['world']),
})

export function apply(ctx: Context, config: Config) {
  for (const target of config.targets) {
    console.log(`${config.greeting}, ${target}!`)
  }
}
```

Das exportierte `Config` ist sowohl ein TypeScript-Interface als auch ein gleichnamiges Laufzeit-schema: Die Consumer erhalten den Typ, Cordis erhält den Validator. Dieses Repo verwendet [Schemastery](https://github.com/shigma/schemastery) für schemas; Cordis selbst akzeptiert jeden [Standard Schema](https://standardschema.dev/)-Validator, daher funktioniert ein als `Config` exportiertes einfaches Objekt nicht.

Konfiguriere es:

```yaml
- name: './config-demo.ts'
  config:
    targets: ['alpha', 'beta']
```

Ausgabe:

```
Hello, alpha!
Hello, beta!
```

`greeting` wurde weggelassen, daher füllt der schema-Standardwert es aus — `apply` erhält immer eine vollständige, validierte Konfiguration.

## Laut fehlschlagen

Jetzt übergebe etwas Ungültiges:

```yaml
- name: './config-demo.ts'
  config:
    targets: 'not-an-array'
```

```
ValidationError: invalid config:
  - $.targets expected array but got not-an-array (at targets)
```

Der fiber des Plugins wechselt in den Zustand FAILED, und der Launcher dieses Tutorials beendet sich nach Ausgabe des Fehlers mit Status 1. Ein Plugin sollte außerdem eine schema-gültige Konfiguration, die eine nicht verfügbare Ressource oder einen nicht verfügbaren provider benennt, ablehnen, sobald es diese Referenz auflösen kann.

## Berechnete Konfigurationswerte

Der in diesem Repo verwendete loader unterstützt ein `!!js`-Tag für Konfigurationswerte, die zur Ladezeit berechnet werden müssen:

```yaml
- name: './config-demo.ts'
  config:
    greeting: !!js process.env.DEMO_GREETING ?? 'Hello'
```

`!!js` wirkt nur innerhalb von `config` und im `disabled`-Feld eines Eintrags. `disabled: !!js ...` wird bei jeder Mount-Entscheidung gegen den loader-Kontext ausgewertet (eine Erweiterung dieses Repos), sodass ein Eintrag sich nach Plattform oder Umgebung selbst steuern kann; die übrigen Metadaten (`name`, `id`, `inject`, ...) bleiben statisch, wobei ein Ausdruck dort gewöhnliche wahrheitswertige Daten sind. Siehe [loader-Konfiguration](../cordis-primer.de.md#loader-configuration).

Weiter: [Komposition und HMR](06-composition-and-hmr.de.md) — `cordis.yml` als Anwendung behandeln.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
