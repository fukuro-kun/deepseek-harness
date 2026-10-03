# Plugin-Konfiguration
[English](config.md) | [中文](config.zh.md) | Deutsch


Konfiguration akzeptieren, die über `cordis.yml` übergeben wird.

## Den Config-Typ definieren

Exportiere einen `Config`-Typ und ein gleichnamiges Schemastery-schema. Lege Standardwerte direkt auf die schema-Felder:

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'my-plugin'

export interface Config {
  greeting: string
  maxRetries: number
  verbose?: boolean
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
  maxRetries: Schema.number().default(3),
  verbose: Schema.boolean().default(false),
})

export function apply(ctx: Context, config: Config) {
  console.log(config.greeting)  // User value or schema default.
}
```

Füge die Konfiguration zur eingefügten lokalen Plugin-Zeile in `scratch-plugin/cordis.yml` hinzu:

```yaml
- insert:
    - id: hello
      name: './src/my-plugin.ts'
      config:
        greeting: 'Hi there'
        maxRetries: 5
```

Beim Laden des Plugins verwendet Cordis das exportierte schema, um die Konfiguration zu validieren und Standardwerte zu füllen. Exportiere kein einfaches Objekt als `Config`; es implementiert nicht das von Cordis geforderte Standard-Schema-Interface.

## Schema-Validierung

Verwende Schemastery, um strengere Validierung auszudrücken:

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'validated-plugin'

export interface Config {
  apiKey: string
  timeout: number
  mode: 'fast' | 'accurate'
}

export const Config = Schema.object({
  apiKey: Schema.string().required(),
  timeout: Schema.number().default(30000),
  mode: Schema.union(['fast', 'accurate']).default('fast'),
})

export function apply(ctx: Context, config: Config) {
  // config is validated and type-safe.
}
```

Das schema wird beim Laden des Plugins ausgeführt. Ungültige Konfiguration lässt das Laden mit einem handlungsrelevanten Fehler fehlschlagen.

## Design-Prinzipien

### Keine hartcodierten Tunables

Harness verlangt, dass **alles, was zwei Deployments unterschiedlich setzen wollen, ein Konfigurationsfeld ist**.

```ts
// Wrong: hardcoded timeout.
const TIMEOUT = 30000

// Correct: configurable.
export interface Config {
  timeoutMs: number  // Defaults to 30000.
}
```

Der Test: Kann `cordis.yml` den Wert ohne Codeänderung ändern?

### Bei ungültiger Konfiguration laut fehlschlagen

Drücke selbstenhaltene Constraints im schema aus, sodass ungültige Konfiguration beim Laden des Plugins fehlschlägt. Referenzen auf Services oder registrierte Ressourcen erfordern Dependency Injection; das [Services-Tutorial](../framework/service.de.md) stellt diesen Vertrag vor.

## Mit HMR arbeiten

Eine Konfigurationsänderung ersetzt das Plugin im laufenden Betrieb: Das Framework entlädt die alte Instanz und lädt eine neue. Da Registrations Effects sind und sich selbst aufräumen, behält die Ersetzung die Registrations der alten Instanz nicht bei.

## Nächste Schritte

- [Plugin packen und installieren](./publish.de.md) — das Plugin als installierbares Package ausliefern
- [Plugins und Lifecycle](../framework/index.de.md) — den vollständigen Plugin-Lifecycle verstehen
- [Services und Abhängigkeiten](../framework/service.de.md) — einem anderen Plugin einen Service anbieten
