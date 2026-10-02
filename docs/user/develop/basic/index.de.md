# Dein erstes plugin

[English](index.md) | [中文](index.zh.md) | Deutsch

Dieses Tutorial erstellt ein minimales Harness-plugin und lädt es in die Web-UI. Starte von einem Repository-Checkout, der den [Run-from-Source-Pfad](../../../../README.de.md#run-from-source) abgeschlossen hat.

## Ein lokales Projekt erstellen

Erstelle vom Repository-Root aus ein Scratch-Projekt für das Tutorial:

```sh
mkdir -p scratch-plugin/src
```

## Was ist ein plugin?

In Harness ist ein plugin ein TypeScript-Modul, das eine `apply`-Funktion exportiert. Das Framework ruft `apply` beim Laden des plugins auf und übergibt ein `ctx`-context-Objekt, über das das plugin capabilities registriert:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'my-plugin'

export function apply(ctx: Context) {
  // Register capabilities here.
}
```

Das ist die vollständige Konfiguration.

## Die plugin-Datei erstellen

Erstelle `scratch-plugin/src/my-plugin.ts`:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello-plugin'

export function apply(ctx: Context) {
  // Required dependencies are ready before apply runs.
  console.log('[hello-plugin] plugin loaded!')
}
```

## In cordis.yml registrieren

Führe `pwd` vom Repository-Root aus aus, dann erstelle `scratch-plugin/cordis.yml` als Web-Overlay, das das lokale plugin einfügt. Ersetze `/absolute/path/to/deepseek-harness` unten durch den ausgegebenen Pfad:

```yaml
- insert:
    - id: hello
      name: '/absolute/path/to/deepseek-harness/scratch-plugin/src/my-plugin.ts'
```

Der plugin-Pfad muss absolut sein. Eine patch-Datei trägt Konfiguration bei, ändert aber nicht das profile-Verzeichnis, aus dem der loader Modulpfade auflöst.

Starte die Web-UI mit diesem Overlay:

```sh
pnpm dsh web --patch ./scratch-plugin/cordis.yml
```

Öffne `http://127.0.0.1:3080`. Das Terminal gibt während des Starts `[hello-plugin] plugin loaded!` aus.

## Automatische Bereinigung

Alles, was über `ctx` registriert wurde — event-listener, tools oder Timer — wird beim Entladen des plugins bereinigt. Du musst nicht manuell removeListener oder clearInterval aufrufen.

Verwende für eine Ressource, die explizite Bereinigung benötigt (etwa eine Netzwerkverbindung), `ctx.effect()`, um ihren disposer bereitzustellen:

```ts
import type { Context } from '@deepseek-ai/cordis'

export function apply(ctx: Context) {
  ctx.effect(() => {
    const timer = setInterval(() => {
      console.log('heartbeat')
    }, 5000)

    // The returned function runs when the plugin unloads.
    return () => clearInterval(timer)
  })
}
```

## Abhängigkeiten deklarieren

Wenn das plugin einen anderen service wie `tools` oder `llm` verwendet, deklariere ihn in `inject`:

```ts ignore-check
import type { Context } from '@deepseek-ai/cordis'

export const name = 'my-tool-plugin'
export const inject = ['tools']

export function apply(ctx: Context) {
  // ctx.tools is ready here.
  ctx.tools.register(/* ... */)
}
```

Das Framework wartet auf jeden erforderlichen service, bevor das plugin geladen wird.

## Drei plugin-Formen

Zusätzlich zur Funktionsform kann ein plugin die Objekt- oder Klassenform verwenden.

### Objektform

```ts
import type { Context } from '@deepseek-ai/cordis'

export default {
  name: 'my-plugin',
  inject: ['tools'],
  apply(ctx: Context) {
    // ...
  },
}
```

### Klassenform

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

export default class MyService extends Service {
  static inject = ['tools']

  constructor(ctx: Context) {
    super(ctx, 'myService')
    // Perform synchronous initialization in the constructor.
  }
}
```

Die Funktionsform reicht in den meisten Fällen. Verwende die Klassenform, wenn das plugin einen service für andere plugins bereitstellt; siehe [services und Abhängigkeiten](../framework/service.de.md).

## Nächste Schritte

- [Ein tool entwickeln](./tool.de.md) — die tool-Definitions-DSL kennenlernen
- [plugin-Konfiguration](./config.de.md) — Benutzerkonfiguration akzeptieren
- [Cordis-Tutorial](../../../cordis-tutorial/index.de.md) — das plugin-Framework darunter, aus einem Scratch-Verzeichnis ohne API-Schlüssel aufgebaut
