# Cordis-Primer
[English](cordis-primer.md) | [中文](cordis-primer.zh.md) | Deutsch


Cordis ist das vendorte Plugin-Framework unter DeepSeek Harness. Dieser Primer lehrt die Cordis-Ideen, die ein Harness-Plugin-Autor braucht, bevor er die generierte Service-/Event-Referenz auf den [Subsystem-Seiten](subsystems/core.de.md) liest; das [Cordis-Tutorial](cordis-tutorial/index.de.md) geht dieselben Ideen praktisch durch. Der vendorte Source und die Sync-Prozedur leben in [vendor/README.md](../vendor/README.md).

## Cordis in fünf Ideen

- **Ein Plugin ist ein Objekt, das Service implementiert.** Es kann eine Funktion mit optionalen `inject`- und `apply(ctx)`-Feldern sein oder eine `Service`-Subclass, deren Lifecycle Cordis in den aktuellen Kontext mountet.
- **Ein Kontext ist ein Repository von Services.** Ein Service beansprucht einen stabilen `ctx.<key>` wie `ctx.tools`, `ctx.llm` oder `ctx.sessions` aus einem Kontext; andere Plugins finden Services über Key statt eine konkrete Implementierung zu importieren.
- **Deklariere Service-Dependency über `inject`.** Ein Plugin, das benötigte Services nennt, wartet, bis diese Services existieren, sodass die Load-Reihenfolge durch Service-Requirements ausgedrückt wird statt durch manuelle Boot-Sequenzierung.
- **Typisierte Events für Kommunikation.** Services deklarieren Event-Namen durch TypeScript Declaration-Merging und dispatchen sie als `emit`, `waterfall`, `parallel`, `serial` oder `bail`, je nachdem, ob Listener beobachten, wrappen, fan-out-en, in Reihenfolge laufen oder beim ersten Bail-Wert stoppen.
- **Registrationen sind reversible Effects.** Prompt-Sections, Tool-Schemas, Adapter, Provider und Listener werden über `ctx.effect()` oder `ctx.on()` installiert, sodass Reload und Teardown sie vorhersagbar zurückwickeln.

<a id="dispatch-modes"></a>

## Dispatch-Modi

Jedes Event kann einen der folgenden Dispatch-Modi haben und kann nur durch die entsprechenden Methoden dispatcht werden.

| Modus | Awaited? | Dispatch-Reihenfolge | Hat Return-Value? |
|---|---|---|---|
| `emit` | Nein | Listener beobachten in Registrationsreihenfolge | Nein |
| `waterfall` | Nein | Listener beobachten in Registrationsreihenfolge | Ja |
| `parallel` | Ja | alle Listener beobachten das Event parallel | Nein |
| `serial` | Ja | Listener beobachten in Registrationsreihenfolge | Ja |
| `bail` | Nein | Listener beobachten in Registrationsreihenfolge, bis einer bailed | Ja |

Der Dispatch-Modus ist Teil des öffentlichen Vertrags des Events. Neue Harness-Events dokumentieren ihn mit einem `@mode`-Tag, sodass der generierte Katalog Deklarationen gegen Dispatch-Stellen prüfen kann.

<a id="cordis-waterfall-semantics"></a>

## Cordis-Waterfall-Semantik

`ctx.waterfall` ist Around-Middleware. Ein Listener empfängt `(...args, next)`. Rufe `next()` auf, um das möglicherweise gewrappte Ergebnis an den nächsten Service zu delegieren; return ohne `next()`, um kurzuschließen. Werte propagieren über `next()`'s Return-Value.

Kooperative Listener mutieren normalerweise ein geteiltes Request- oder Decision-Objekt und delegieren dann. Ein Listener kann auch wählen, das Ergebnis vollständig zu ersetzen, und stromabwärtige Listener sehen nur das Ergebnis nach der Ersetzung. Verwende `prepend: true` nur, wenn der Listener vor gewöhnlichen Registrationen laufen muss.

Für Single-Decision-Events ist Short-Circuiting das Design. Ein Policy-Listener kann ohne `next()` returnen, wenn er die Decision besitzt, während ein Listener, der nur annotiert oder beobachtet, delegieren muss.

<a id="loader-configuration"></a>

## Loader-Konfiguration

`@deepseek-ai/cordis-plugin-include` parst `!!js` in Expression-Nodes. Der Loader interpoliert einen Entry's `config` (nachdem deklarierte Injections aktiviert wurden, gegen jenen Plugin-Kontext — `ctx.serviceName`) und sein `disabled`-Feld (bei jeder Mount-Decision, gegen den Loader-Kontext); Include bewahrt verschachtelte Row-Expressions bis zur Target-Aktivierung. Andere Entry-Metadaten bleiben literal. Verwende Overlays, wenn die Umgebung Plugins auswählt.

## Praktische Regeln

Kapsle Verhalten in Plugins: ein Tool-Pipeline-Event gehört zu `ctx.tools`, Modell-Streaming gehört zu `ctx.llm`, und Live-agent-Coordination gehört zu `ctx.agents`. Bevorzuge Events für Interception und Policy; bevorzuge Service-Methoden für direkte Capability-Calls.

Jede Registration sollte einen Disposer haben, entweder indem einer aus `ctx.effect()` returned wird oder ein Cordis-Helper verwendet wird, der es übernimmt. Wenn die Teardown-Reihenfolge matters, halte die verwandte Arbeit in einem Effect, sodass Disposal in der intendierten Sequenz zurückwickelt.
