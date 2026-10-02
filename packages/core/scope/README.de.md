---
description: "Die Scoped-Registration-Bibliothek für Plugin-Autoren und Maintainer, die Registries oder Event-Oberflächen bauen, die Contributions pro Agent oder pro Gruppe isolieren."
kind: "package-library"
---

# @deepseek-ai/dsh-scope

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

`dsh-scope` lässt Plugin-Autoren jedem Agent oder jeder Gruppe ein isoliertes Contribution-Set mit geteilter Lebensdauer geben. Child-Scopes erben Ancestor-Contributions, wobei die nächstliegende Definition Vorrang hat, während Ancestor-Scopes Descendant-Aktivität beobachten können; keine der beiden Beziehungen gilt in umgekehrter Richtung. Das Dispose eines Scopes entfernt alles, was er besitzt. Verwende diese dependency-freie Bibliothek, wenn Pro-Agent- oder Pro-Gruppen-Isolation ohne Abhängigkeit vom Agent Loop oder von Presets funktionieren muss.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Plugin-Autoren verwenden `dsh-scope`, um einem Agent (oder einer Gruppe) seine eigene Registrierungswelt zu geben. Die Registries der Core-Gruppe bauen darauf auf — ein über `agent.ctx` registriertes Tool ist nur für diesen Agent sichtbar — und dasselbe Primitive bedient jede Custom-Registry oder jedes scope-gefilterte Event.

### Einen Scope minten

`createScope(ctx, key)` erzeugt einen Scope unter dem Fiber von `ctx`: sein `ctx` trägt den Scope-Tag, und alles, was darüber registriert wird, ist sowohl scope-sichtbar als auch scope-lebensdauer-gebunden. `dispose()` wickelt jede Registrierung über den Scope ab; `rawDispose` ist der exakte Cordis-Disposer, um den Teardown in einen geordneten zusammengesetzten Effect zu verschachteln.

```text
const scope = createScope(ctx, agent)
scope.ctx.on('agent/status', ({ agent, status }) => track(agent, status))
// later:
await scope.dispose()   // unwinds every registration made through scope.ctx
```

### Scoped Events routen

`scopeTarget(base, key)` baut den opaken Carrier, mit dem ein scope-gefiltertes Event dispatched. Ungetaggte Listener bleiben global; ein mit `key` getaggter Listener empfängt Events für diesen Key und seine Descendants. Der Carrier trägt nur Routing-State — das eigentliche Subjekt reist in den Event-Argumenten.

### Eine Scoped-Registry-Schicht bauen

Registry-Autoren verwenden `ScopedLayers`, `NamedEntries` und `AnonymousEntries`, um einen eager globalen Layer plus lazy erzeugte Exact-Scope-Layer zu halten: Reads erzeugen nie Layer, `merge()` materialisiert einfügungsgeordnete Named Shadows entlang der Scope-Kette, und `effect()` leitet Sichtbarkeit und Ownership aus demselben Kontext ab. Ein Scoped Layer wird nur zurückerobert, wenn sein gesamtes Aggregat leer ist.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie das Paket das obige Verhalten realisiert; der beobachtbare Vertrag ist in [Dieses Paket verwenden](#use-this-package) abgedeckt.

### Designkonzept

Der Registrierungskontext bestimmt sowohl Sichtbarkeit als auch Ownership: Eine über einen Scoped Context vorgenommene Registrierung ist in diesem Scope sichtbar und wird mit ihm disposed, was verhindert, dass eine Contribution in einem Scope sichtbar ist, aber mit einem anderen abgerissen wird. Das Primitive routet vertrauenswürdige Same-Process-Plugins; es ist weder Sandbox noch Autoritätsgrenze. Einen Scoped Context herauszugeben gibt auch die Service-Resolution-API des mintenden Plugins heraus (Resolution läuft die Dependency-Kette des mintenden Fibers entlang), sodass ein Scope von dem Plugin gemintet wird, dessen Dependencies die scoped Registrierungen brauchen.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | `createScope`, `scopeOf`, `scopeTarget`, `bindScopeParent`/`scopeParentOf`/`scopeChainOf`, Carrier-Marks |
| [`src/store.ts`](src/store.ts) | `ScopedLayers`, `NamedEntries`, `AnonymousEntries`, `ScopeLayer` |
| [`src/invariant.ts`](src/invariant.ts) | Invariant-Companion über der generierten Scoped-Event-Map |
| [`src/scoped-events.generated.ts`](src/scoped-events.generated.ts) | Generierte Resolver-Map deklarierter Scoped Events |

### Die Parent-Kette

Eine Relation trägt beide Richtungen: Registrierungssichten erben die Kette ABWÄRTS (ein Child-Scope sieht die Layer seiner Ancestors), während die Event-Admission die Kette AUFWÄRTS erweitert (ein mit einem Ancestor getaggter Listener empfängt an einen Descendant-Key dispatche Events). Das Binding ist einmalig — ein Key, der bereits einen Parent hat, wirft, und nur das zurückgegebene Binding darf ihn neu verlinken — und jeder Link lehnt einen Zyklus ab. `scopeChainOf` liefert `[key, parent, …]` mit dem nächstliegenden zuerst.

### Event-Filterung

`scopeTarget` komponiert den vorhandenen `Context.filter` der Basis mit dem Scope-Prädikat: Ein ungetaggter Listener wird zugelassen; ein getaggter Listener wird zugelassen, genau dann wenn sein Tag der Dispatch-Key oder ein Ancestor davon ist; `key === undefined` lässt nur ungetaggte Listener zu. `{ global: true }`-Listener umgehen die Filterung. Der `Scoped<T>`-Brand verlangt den Carrier als `this`-Typ eines scope-gefilterten Events, sodass ein Dispatch mit einem nackten Subjekt ein Compile-Fehler ist.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Der Paketvertrag reicht für die meisten Consumer; lies diese Seiten, wenn du die umgebende Domain und die Designbegründung brauchst.

- [Scoped-Registration-Subsystem](../../../docs/subsystems/scope.de.md) — die Identitäts-, Carrier- und Layer-Typen.
- [Agent-Scope-Contexts Agent Note](../../../.agents/notes/implemented/architecture/2026-07-08-agent-scope-contexts.de.md) — die Security-Nicht-Ziele und das Context-Design.
- [Agent-Scope-Runtime-Design Agent Note](../../../.agents/notes/implemented/architecture/2026-07-12-agent-scope-runtime-design.de.md) — wie der Loop Pro-Agent-Scopes baut.
- [Core-Gruppenkarte](../README.de.md) — wie die Core-Pakete komponieren.

-----

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>

Diese Grenzen definieren, wann das Primitive besondere Sorgfalt braucht. Sie sind aktuelle Paket-Constraints, kein Aufgaben-Backlog.

- **Nur scope-bewusste APIs isolieren State** — Registries müssen nach `scopeOf()` ablegen, und Events müssen über `scopeTarget()` dispatchen; ein beliebiger Cordis-Service bleibt context-global, auch wenn er über einen Scoped Context aufgerufen wird.
- **Ein Context trägt einen einzigen nächstliegenden Scope-Key** — die Hierarchie lebt in der Key-Level-Parent-Relation, nicht in Context-Tags; verschachtelte Scope-Contexts shadown weiterhin auf einen einzigen Tag, und Multi-Membership-Policy-Sets bleiben nicht unterstützt.
- **Service-Erreichbarkeit kommt vom Scope-Minters** — `Scope.ctx` herauszugeben gibt auch die injizierten Services des mintenden Plugins heraus, sodass ein breiterer Minter vom Halter später nicht eingeengt werden kann.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
