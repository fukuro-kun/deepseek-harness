# Plugins und Lebenszyklus

[English](index.md) | [中文](index.zh.md) | Deutsch

Diese Seite beschreibt das Cordis-Plugin-Modell und die Lebenszyklus-Zustandsmaschine.

## Fiber-Zustandsmaschine

Jedes geladene Plugin besitzt einen **Fiber**-Scope mit folgenden Zuständen:

```
PENDING → LOADING → ACTIVE
                 ↘ FAILED
ACTIVE → UNLOADING → DISPOSED
```

| Zustand | Bedeutung |
|------|------|
| PENDING | Deklariert, aber erforderliche Abhängigkeiten sind nicht bereit |
| LOADING | Abhängigkeiten sind bereit und `apply` läuft |
| ACTIVE | Das Plugin läuft |
| FAILED | `apply` hat einen Fehler geworfen |
| UNLOADING | Das Plugin wird entladen und gibt Ressourcen frei |
| DISPOSED | Das Plugin ist vollständig entladen |

## Abhängigkeitsgesteuertes Laden

Ein Plugin mit `inject` wartet auf jeden erforderlichen Service, bevor es lädt:

```ts ignore-check
export const inject = ['tools', 'llm']

export function apply(ctx: Context) {
  // ctx.tools and ctx.llm are ready here.
}
```

Wenn ein erforderlicher Service verschwindet, beispielsweise beim Austausch eines Providers, wird das Plugin automatisch entladen (ACTIVE → DISPOSED) und erneut geladen, sobald der Service zurückkehrt.

## Automatische Bereinigung

Jede über `ctx` vorgenommene Registrierung wird beim Entladen des Plugins rückgängig gemacht:

```ts ignore-check
export function apply(ctx: Context) {
  // Event listener: removed automatically on unload.
  ctx.on('some-event', handler)

  // Custom resource: the returned disposer runs on unload.
  ctx.effect(() => {
    const connection = createConnection()
    return () => connection.close()
  })
}
```

Das Framework verfolgt und bereinigt alle diese Operationen:
- `ctx.on(event, handler)` — Event-Listener
- `ctx.tools.register(tool)` — Tool-Registrierung
- `ctx.llm.registerAdapter(names, adapter)` — LLM-Adapter-Registrierung
- `ctx.effect(() => cleanup)` — benutzerdefinierte Ressource

Beim Entladen beginnt die Disposer-Ausführung in umgekehrter Registrierungsreihenfolge, aber mehrere asynchrone Disposer laufen nebenläufig und haben keine serialisierte Abschlussgarantie. Reihenfolgeabhängige Bereinigung muss in einen einzigen Disposer innerhalb eines `ctx.effect()` gepackt und dort serialisiert abgewartet werden.

## Verschachtelte Contexts

`ctx.plugin()` erzeugt einen Child-Fiber, der den Parent-Context erbt, aber einen unabhängigen Lebenszyklus hat:

```ts ignore-check
export function apply(ctx: Context) {
  // Register a child plugin.
  ctx.plugin(childPlugin)

  // The child has its own Fiber and unloads with its parent.
}
```

## dispose-Semantik

Um eine Plugin-Instanz vorzeitig zu stoppen:

```ts
import type { Context } from '@deepseek-ai/cordis'

declare const ctx: Context
declare function myPlugin(ctx: Context): void

const fiber = ctx.plugin(myPlugin)

// Dispose it manually later.
await fiber.dispose()
```

`dispose` garantiert:
1. Alle vom Plugin gehaltenen Registrierungen werden entfernt.
2. Child-Plugins werden rekursiv entladen.
3. Das zurückgegebene Promise wird aufgelöst, nachdem alle asynchronen Bereinigungen abgeschlossen sind.

## Hot Replacement (HMR)

Mit dem über `cordis.yml` geladenen `@deepseek-ai/cordis-plugin-hmr` löst das Bearbeiten einer Plugin-Quelldatei Folgendes aus:

1. Altes Plugin entladen und Registrierungen bereinigen.
2. Neuen Code laden.
3. Neues `apply` ausführen.

Da sich Plugin-Registrierungen selbst bereinigen, behält Hot Replacement keine Registrierungen aus der alten Instanz bei.

## Beispiel-Lebenszyklus

```ts ignore-check
export function apply(ctx: Context) {
  console.log('plugin loading')

  ctx.effect(() => {
    console.log('effect registered')
    return () => console.log('effect cleaned up')
  })
}
```

Beim Laden wird ausgegeben:
```
plugin loading
effect registered
```

Beim Entladen wird ausgegeben:
```
effect cleaned up
```

## Nächste Schritte

- [Services und Abhängigkeiten](./service.de.md) — eine Capability anderen Plugins bereitstellen
- [Ereignissystem](./events.de.md) — zwischen Plugins kommunizieren
- [Cordis-Tutorial](../../../cordis-tutorial/index.de.md) — derselbe Lebenszyklus, Services und Ereignisse schrittweise auf der Cordis-Runtime aufgebaut
