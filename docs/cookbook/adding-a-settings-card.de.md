# Cookbook: Hinzufügen einer Einstellungskarte
[English](adding-a-settings-card.md) | [中文](adding-a-settings-card.zh.md) | Deutsch


Wie ein Plugin seine eigene Konfiguration auf der Web-Einstellungsseite platziert. Kein Schritt auf diesem Pfad erfordert eine Änderung in diesem Repository: der Host bedient jeden registrierten Settings-Namespace, und die **Plugins**-Sektion schlüsselt ihre Karten nach dem Namespace, den sie bearbeiten — ein Plugin, das beide Hälften registriert, wird automatisch gepaart.

Die beiden Hälften leben in einem Paket — die Host-Hälfte unter `src/`, die Browser-Hälfte unter `src/client/`, als `./client` exportiert und mit `dsh.client` deklariert. [`packages/client/ui-theme`](../../packages/client/ui-theme) ist ein ausgearbeitetes Beispiel dieser Verpackung; die Karten, die diese Sektion mitliefert, leben in [`packages/client/ui-settings-plugins`](../../packages/client/ui-settings-plugins).

## 1. Den Namespace registrieren (Host-Hälfte)

Der Namespace ist der Verbindungsschlüssel, also wähle ihn einmal und schreibe ihn in beiden Hälften aus. Ein Consumer, der bereits einen `cordis.yml`-Eintrag hat, sollte über `ctx.settings.installSection()` registrieren — es schichtet den Eintrag unter das Benutzerdokument und funktioniert auch ohne gemounteten Settings-Provider:

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

declare function assertReachable(endpoint: string | undefined): void
declare function rebuildFromSettings(config: Config): void

export const MY_PLUGIN_NS = 'my-plugin'

export interface Config {
  endpoint?: string
  retries?: number
}

export const Config: z<Config> = z.object({
  endpoint: z.string(),
  retries: z.number().step(1).min(0).default(3),
})

export function apply(ctx: Context, config: Config) {
  let source = () => config
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, MY_PLUGIN_NS, Config, config, {
      // Constraints the schema cannot express refuse the write, not the next use.
      validate: value => void assertReachable(value.endpoint),
      setSource: (current) => { source = current },
      onChange: () => { rebuildFromSettings(source()) },
    })
  })
}
```

`role('secret')` auf einem Feld schließt seinen Wert aus jeder Antwort aus; die Karte schreibt ein solches Feld in eine `update`/`mutate`-Payload oder adressiert stattdessen eine Credential-Referenz über die `credentials`-Domain. `applies: 'restart'` teilt einer Konfigurationsoberfläche mit, dass der Eigentümer eine Änderung erst beim nächsten Start anwendet.

## 2. Die Karte registrieren (Browser-Hälfte)

Die Karte registriert sich unter ihrem Namespace in `settings.plugin.item` und besitzt alles darin — Chrome, Controls und Copy. Sie liest und schreibt über `ctx.settingsScope`, das jeden Schreibvorgang mit der gelesenen Revision absichert:

```ts ignore-check
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: the keyed slot's declaration. Cross-plugin collaboration goes
// through cordis services; a value import fails the client bundle-purity gate.
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'

export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope']

export function apply(ctx: ClientContext): void {
  const card = new MyPluginCardController(ctx.settingsScope.bind({ namespace: 'my-plugin' }))
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: 'my-plugin',
    locale: 'settings.myPlugin',
    inject: () => card.inject(),
  }, MyPluginCard),
  )
}
```

Der Scope-Snapshot trägt, was ein Formular braucht: den aufgelösten `value`, die Composition-`base` und die rohe `user`-Schicht, deren Schlüssel-**Präsenz** — nicht ihr Wert — ein Feld als überschrieben markiert. `scope.set(field, value)` speichert ein Feld und `scope.unset(field)` löscht es zurück auf die Composition-Schicht.

## 3. Was die Registerkarte damit macht

Die **Plugin-Konfiguration**-Registerkarte liest, welche Namespaces der Host bedient, und vergibt pro Namespace einen Slot-Key. Eine Karte wird gerendert, wenn der Host ihren Key bedient, und übersprungen, wenn nicht — eine Bereitstellung, die nie die Host-Hälfte komponierte, zeigt keine Spur der Karte. Ein bedienter Namespace, den keine Karte beansprucht, rendert nichts — so bleiben die Namespaces anderer Seiten (`ui-theme`, `permission`, `llm-*`) von dieser Registerkarte fern.

Karten erscheinen in der Reihenfolge, in der sie sich im Slot registriert haben; ein keyed entry deklariert kein eigenes `order`.

## Verpackung

Die Browser-Hälfte wird vom [Client-Modulsystem](../../packages/client/modules) an die Seite ausgeliefert: Es durchsucht die aktivierten Loader-Einträge nach Paketen, die `dsh.client` deklarieren, und bedient den gebauten `./client`-Export jedes Pakets. Das Plugin erscheint also auf der Seite, sobald ein `cordis.yml` es mountet — kein Rebuild der Web-Anwendung.

```jsonc
{
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" }
  },
  "dsh": { "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-client-ui-settings-plugins"] } }
}
```

Das Bundle muss das lazy-CJS-Factory-Artefakt des Loaders sein. In diesem Repository besteht `tsdown.config.ts` aus drei Zeilen auf Basis der gemeinsamen Voreinstellung:

```ts ignore-check
import { clientBundle } from '../tsdown.client.ts'

export default clientBundle('@deepseek-ai/dsh-client-my-plugin', ['lib/types/index.js', 'lib/types/invariant.js'])
```

Keine veröffentlichte Voreinstellung stellt dieses Paket bereit, daher muss ein Paket außerhalb dieses Repositorys dasselbe Ausgabeformat selbst reproduzieren. Die Bundle-Purity-Gate lehnt auch Wert-Importe über Plugins hinweg ab, sodass eine Karte weder das Karten-Chrome noch das Staged-Form-Modell dieser Sektion importieren kann — sie rendert ihr eigenes und besitzt ihr eigenes Staging und Revision-Fencing. Beide Grenzen sind unter [den bekannten Einschränkungen der Sektion](../../packages/client/ui-settings-plugins/README.de.md#known-limitations-and-deferred-work) dokumentiert.
