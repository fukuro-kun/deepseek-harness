# 2. Lebenszyklus und Effects
[English](02-lifecycle-and-effects.md) | [中文](02-lifecycle-and-effects.zh.md) | Deutsch


Ein Cordis-Plugin kann durch eine Config-Änderung, Hot Reload, expliziten Dispose oder Verlust eines benötigten Service entladen werden. Registrierungen über Cordis-APIs sind Effects und werden beim Entladen des besitzenden Plugins rückgängig gemacht; Ressourcen, die außerhalb dieser APIs verwaltet werden, müssen in `ctx.effect()` gewrappt werden.

## Effects

Für eine Ressource, die Cordis noch nicht verwaltet — einen Timer, eine Connection, einen Watcher — wickeln Sie sie in `ctx.effect()` ein und geben einen Disposer zurück:

Erstellen Sie `lifecycle.ts` in `tmp/cordis-tutorial`:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'lifecycle-demo'

function heartbeat(ctx: Context) {
  console.log('heartbeat plugin loading')
  ctx.effect(() => {
    const timer = setInterval(() => console.log('tick'), 200)
    return () => {
      clearInterval(timer)
      console.log('heartbeat cleaned up')
    }
  })
}

export function apply(ctx: Context) {
  // Mount a child plugin and keep its fiber to dispose it later.
  const fiber = ctx.plugin(heartbeat)
  // The demo timer is itself an effect: if THIS plugin is unloaded first,
  // the pending callback is cancelled instead of firing on a dead app.
  ctx.effect(() => {
    const timer = setTimeout(async () => {
      await fiber.dispose()
      console.log('disposed')
      process.exit(0)
    }, 700)
    return () => clearTimeout(timer)
  })
}
```

Lassen Sie `cordis.yml` darauf zeigen:

```yaml
- name: './lifecycle.ts'
```

Führen Sie es aus (`node --import tsx ../../vendor/cordis/bin.js`) und Sie erhalten:

```
heartbeat plugin loading
tick
tick
tick
heartbeat cleaned up
disposed
```

Drei Dinge sind zu beachten:

- `ctx.plugin(heartbeat)` mountet eine Funktion **aus Code** als Plugin — dieselbe Operation, die der YAML-Loader für jeden Config-Eintrag ausführt. Ein Funktions-Plugin benötigt keine `apply`-Methode: Cordis ruft die Funktion direkt auf und verwendet ihren Namen nur für Diagnostik. Eine `apply`-Methode ist nur für die Objekt-Form erforderlich, `ctx.plugin({ apply(ctx) { /* ... */ } })`. Der Aufruf gibt einen **Fiber** zurück, das Runtime-Handle für eine geladene Plugin-Instanz.
- Der Effect-Body läuft während des Ladens; der Disposer, den er zurückgibt, läuft während des Entladens. Für eine Ressource mit Plugin-Lebensdauer rufen Sie den Disposer niemals selbst auf.
- `fiber.dispose()` wird aufgelöst, nachdem die gesamte Bereinigung des Plugins — einschließlich asynchroner Disposer — abgeschlossen ist, und entlädt rekursiv alle Child-Plugins, die es gemountet hat.

## Die Fiber-Zustandsmaschine

Jede geladene Plugin-Instanz besitzt einen Fiber, der folgende Zustände durchläuft:

```
PENDING → LOADING → ACTIVE → UNLOADING → DISPOSED
                 ↘ FAILED
```

- **PENDING** — deklariert, aber ein benötigter Service (Kapitel 3) ist noch nicht verfügbar.
- **LOADING / ACTIVE** — `apply` läuft / ist abgeschlossen.
- **FAILED** — `apply` oder die Config-Validierung hat eine Exception geworfen.
- **UNLOADING / DISPOSED** — Disposer laufen / alles abgebaut.

Sie werden PENDING in [Kapitel 6](06-composition-and-hmr.de.md) wieder treffen, wo es die übliche Antwort auf „Warum gibt mein Plugin nichts aus?" ist.

## Was bereits ein Effect ist

Sie schreiben `ctx.effect()` selten selbst, da die eingebauten Registrierungs-APIs bereits Effects sind:

- `ctx.on(event, listener)` — der Listener wird beim Entladen entfernt ([Kapitel 4](04-events.de.md)).
- `ctx.plugin(child)` — das Child wird mit seinem Parent zusammen disposed.
- Service-Registrierungen sind Effects. Harness-Registries wie `ctx.tools.register(...)` binden auch ihre zurückgegebenen Disposer an das aufrufende Plugin, sodass sie sich automatisch abwickeln ([Kapitel 7](07-into-the-harness.de.md)).

Für eine Ressource, die Cordis nicht verwaltet, erwerben Sie sie innerhalb von `ctx.effect()` und geben einen Disposer zurück, der sie freigibt. Cordis ruft diese Freigabe dann beim Entladen auf, einschließlich Hot Reload.

Ein Hinweis zur Reihenfolge: Disposer starten in umgekehrter Registrierungsreihenfolge, aber mehrere **asynchrone** Disposer laufen gleichzeitig. Wenn Teardown-Schritte sequenziell ausgeführt werden müssen, halten Sie sie in einem Disposer zusammen und awaiten Sie sie dort.

Weiter: [Services](03-services.de.md) — wie Plugins Capabilities teilen.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
