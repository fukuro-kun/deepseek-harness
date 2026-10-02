# 3. Services

[English](03-services.md) | [中文](03-services.zh.md) | Deutsch

Ein **Service** ist eine benannte Capability, die ein Plugin bereitstellt und andere Plugins über `ctx` konsumieren. Im Harness sind `ctx.tools`, `ctx.llm` und `ctx.agents` Services. Ein Consumer benennt die Capability, etwa `'tools'`, anstatt seinen Provider zu importieren, sodass die Config einen Provider wählen kann, ohne den Consumer zu ändern.

## Einen Service bereitstellen

Erstellen Sie `greeter.ts` in `tmp/cordis-tutorial`:

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    greeter: GreeterService
  }
}

export class GreeterService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'greeter')
  }

  greet(who: string) {
    return `Hello, ${who}!`
  }
}

export const name = 'greeter'

export function apply(ctx: Context) {
  ctx.plugin(GreeterService)
}
```

Zwei Teile arbeiten zusammen:

- **Runtime**: `super(ctx, 'greeter')` registriert die Instanz unter dem Namen `greeter`. Ab dann kann jedes Plugin sie als `ctx.greeter` erreichen. Die Registrierung ist ein Effect — beim Entladen des Providers wird der Service entfernt.
- **Compile-Zeit**: Der `declare module '@deepseek-ai/cordis'`-Block ist TypeScript Declaration Merging. Er fügt `greeter` zum `Context`-Interface hinzu, sodass `ctx.greeter` überall typecheckt. Er generiert keinen Code; ohne ihn funktioniert der Service zur Laufzeit noch, aber Consumer verlieren die Typsicherheit.

Eine `Service`-Subklasse ist selbst ein Plugin (die Klassen-Form aus Kapitel 1), daher mountet `ctx.plugin(GreeterService)` sie wie jedes andere Plugin.

## Einen Service mit `inject` konsumieren

Erstellen Sie `consumer.ts`:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'consumer'
export const inject = ['greeter']

export function apply(ctx: Context) {
  console.log(ctx.greeter.greet('world'))
}
```

`inject` listet die Services, die dieses Plugin benötigt. Cordis hält das Plugin in PENDING, bis jeder gelistete Service existiert, sodass innerhalb von `apply` `ctx.greeter` garantiert bereit ist. Die Ladereihenfolge in `cordis.yml` ist unerheblich — Abhängigkeiten, nicht die Dateireihenfolge, entscheiden, wann Plugins starten.

Componieren und ausführen:

```yaml
- name: './greeter.ts'
- name: './consumer.ts'
```

```
Hello, world!
```

Tauschen Sie die beiden Zeilen in `cordis.yml` und führen Sie es erneut aus: gleiche Ausgabe. Entfernen Sie `./greeter.ts` komplett: Der Consumer bleibt PENDING und gibt nichts aus — kein Crash, kein partieller Lauf. Ein PENDING-Fiber hält auch Node's Event Loop nicht am Leben, sodass eine Composition ohne weitere laufende Prozesse still mit Exit-Code 0 endet. [Kapitel 6](06-composition-and-hmr.de.md) zeigt, wie dieser Zustand zu diagnostizieren ist.

## Abhängigkeiten werden nach dem Laden verfolgt

`inject` ist kein einmaliger Boot-Check. Wenn ein benötigter Service während des App-Laufs verschwindet — sein Provider wurde entladen oder hot-replaced — wird jedes abhängige Plugin ebenfalls entladen und erneut geladen, sobald der Service zurückkehrt. Kombiniert mit Effects ([Kapitel 2](02-lifecycle-and-effects.de.md)) verhindert dies, dass ein laufender Consumer eine Referenz auf einen nicht verfügbaren Service behält: Seine eigenen Registrierungen werden abgewickelt, wenn die Abhängigkeit verschwindet.

Das ist auch der Grund, warum Service-Austausch in der Config funktioniert: Entladen Sie den `dsh-bash-local`-Eintrag, mounten Sie einen anderen `shell`-Provider, und jedes Plugin, das `'shell'` injiziert, startet sauber gegen die neue Implementierung neu.

## Optionale Abhängigkeiten

`inject` ist für harte Anforderungen. Für eine Capability, auf die das Plugin verzichten kann, lassen Sie `inject` weg und prüfen an der Verwendungsstelle:

```ts ignore-check
export function apply(ctx: Context) {
  // undefined when no provider is loaded; the plugin still runs.
  const greeter = ctx.get('greeter')
  console.log(greeter?.greet('maybe') ?? 'no greeter available')
}
```

## Namensgebung

Service-Namen teilen sich einen flachen Namespace pro Applikation. Präfixen oder namespacen Sie eigene Services deutlich (der Harness beansprucht einfache Namen wie `tools` und `llm`); die generierten `cordis-surface`-Regionen auf den [Subsystem-Seiten](../subsystems/core.de.md) listen jeden Namen, den der Harness registriert.

Weiter: [Events](04-events.de.md) — Kommunikation ohne gemeinsamen Service.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
