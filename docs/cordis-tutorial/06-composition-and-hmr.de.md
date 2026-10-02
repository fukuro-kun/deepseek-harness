# 6. Komposition und HMR

[English](06-composition-and-hmr.md) | [中文](06-composition-and-hmr.zh.md) | Deutsch

Jede bisher erstellte Capability ist ein Plugin, und `cordis.yml` wählt den Plugin-Baum der Anwendung. Dieses Kapitel ändert diese Komposition, hot-reloadet ein Plugin und diagnostiziert ein Plugin, das nie lädt.

## Entries sind mehr als ein Name

Eine Config-Entry akzeptiert Metadaten über `name` und `config` hinaus:

```yaml
- id: greeter          # stable identity for this entry
  name: './greeter.ts'
- id: consumer
  name: './consumer.ts'
  disabled: true       # keep the entry, skip mounting it
```

`id` gibt der Entry eine stabile Identität, sodass der Loader eine Bearbeitung einer bestehenden Entry von einer Entfernung plus Addition unterscheiden kann. `disabled: true` unmountet ein Plugin, ohne seine Entry zu löschen — zurückklappen und das Plugin (und alles, was PENDING auf seinen Services ist) lädt wieder.

Gruppen schachteln eine Sub-Liste von Entries, die als eine Einheit laden und entladen, und `isolate` gibt einer Gruppe ihre eigene Instanz eines Service-Namens — zwei Gruppen können je einen unterschiedlich konfigurierten `shell`-Provider sehen, ohne sich zu beeinflussen. Der [Cordis-Primer](../cordis-primer.de.md) und das [Service-Isolation-Beispiel](../user/develop/framework/service.de.md#service-isolation) behandeln die Details.

## Hot Module Replacement

Da Entladen Effects freigibt ([Kapitel 2](02-lifecycle-and-effects.de.md)) und Laden Dependencies folgt ([Kapitel 3](03-services.de.md)), kann HMR ein laufendes Plugin durch Entladen und Laden ersetzen. Das `@deepseek-ai/cordis-plugin-hmr`-Plugin überwacht deine Dateien und macht genau das beim Speichern.

Schreibe in `tmp/cordis-tutorial` die `cordis.yml`:

```yaml
- id: logger
  name: '@deepseek-ai/cordis-plugin-logger-console'
- id: timer
  name: '@deepseek-ai/cordis-plugin-timer'
- id: hmr
  name: '@deepseek-ai/cordis-plugin-hmr'
  config:
    root: ['.']
- id: hello
  name: './hello.ts'
```

Zwei Support-Plugins kamen zur Liste hinzu: HMR loggt durch den Cordis-Logger-Service, also würdest du ohne einen Console-Exporter seine Messages nicht sehen, und es `inject`et den `timer`-Service für Debouncing — ohne `@deepseek-ai/cordis-plugin-timer` sitzt es für immer in PENDING, lautlos. Diese Stille ist das Thema des nächsten Abschnitts.

HMR liest Nodes Loader-Interna über die native Helper des Loaders. Führe Cordis unter tsx aus:

```sh
node --import tsx ../../vendor/cordis/bin.js
```

Editiere nun `hello.ts` — ändere die Log-Message — und speichere:

```
hello from my first plugin
2026-07-22 15:44:36 [I] hmr watching [ '.' ]
2026-07-22 15:44:39 [I] hmr reload plugin at hello.ts
hello from my EDITED plugin
```

Die alte Instanz entlud (alle ihre Effects wickelten sich zurück), der neue Code lud, `apply` lief erneut. Stoppe den Prozess mit Ctrl-C. Das Editieren von `cordis.yml` selbst wird ebenfalls aufgegriffen: der Loader difft Entries nach `id` und mountet, unmountet oder rekonfiguriert nur das, was sich änderte. Deshalb tragen die Entries oben explizite `id`s — eine Entry ohne `id` bekommt bei jedem Lesen eine generierte id, also gilt sie nach jeder Config-File-Editierung als removed-plus-added und remountet, selbst wenn ihre eigenen Zeilen sich nicht änderten.

## Ein Plugin diagnostizieren, das nie lädt

Die Kehrseite Dependency-getriebenen Ladens: ein Plugin, dessen `inject` einen Service nennt, den niemand bereitstellt, wartet für immer und gibt nichts aus. Kein Fehler — PENDING ist ein legitimer Zustand, da der Provider möglicherweise später gemountet wird.

Du kannst die Zustände direkt sehen. Jeder Context kann die Plugin-Registry enumerieren; erstelle `diagnose.ts`:

```ts
import { FiberState, type Context } from '@deepseek-ai/cordis'

export const name = 'diagnose'

export function apply(ctx: Context) {
  setTimeout(() => {
    for (const runtime of ctx.registry.values()) {
      for (const fiber of runtime.fibers) {
        if (fiber.state === FiberState.PENDING) {
          console.log(`${fiber.name} is PENDING — a required service is missing`)
        }
      }
    }
  }, 500)
}
```

Und ein Plugin mit einer nicht erfüllbaren Dependency, `needs-timer.ts`:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'needs-timer'
export const inject = ['timer']

export function apply(ctx: Context) {
  console.log('needs-timer loaded')
}
```

```yaml
- name: './needs-timer.ts'
- name: './diagnose.ts'
```

Führe es aus (plain `node --import tsx ../../vendor/cordis/bin.js`; stoppe mit Ctrl-C):

```
needs-timer is PENDING — a required service is missing
```

`inject: ['timer']` hat keinen Provider. Füge `- name: '@deepseek-ai/cordis-plugin-timer'` zur Liste hinzu und das Plugin lädt. Wenn ein Plugin nichts tut und nichts meldet, inspiziere seinen Fiber-Zustand. Iterieren ohne den PENDING-Filter zeigt auch die eigenen Plugins des Loaders (Loader, Include) als ACTIVE-Fibers, weil Plugins die Config-Datei selbst mounten.

Weiter: [In den Harness](07-into-the-harness.de.md) — dieselben Patterns gegen echte Harness-Services.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
