# Scoped Registration
[English](scope.md) | [中文](scope.zh.md) | Deutsch


Das [Scope-Paket](../../packages/core/scope) liefert das Identitäts-, Carrier- und Scoped-Layer-Vokabular, mit dem ein Registrierungskontext zugleich pro-Agent-Sichtbarkeit und geteilten Lebenszyklusbesitz bedeutet. Es ist eine Bibliotheksprimitive, kein Cordis-Service; der [Agent-Scope-Runtime-Design-Agent-Note](../../.agents/notes/implemented/architecture/2026-07-12-agent-scope-runtime-design.de.md#scope-routing-one-opaque-key-selects-one-layer) besitzt die Lebenszyklusbegründung, und das Paket-[README](../../packages/core/scope/README.de.md) besitzt die aufrufbare API und die Filtersemantik.

Quellen: [`packages/core/scope/src/index.ts`](../../packages/core/scope/src/index.ts) und [`packages/core/scope/src/store.ts`](../../packages/core/scope/src/store.ts).

## Identität und Dispatch-Carrier

`ScopeKey` ist eine opake Objektidentität. Der ausgelieferte Loop verwendet das lebende `Agent`-Objekt als seinen eigenen Key, aber die Primitive inspiziert das Objekt niemals.

```ts type-equiv
/** An opaque, identity-compared scope key. */
type ScopeKey = object
```

`Scoped<T>` ist das Compile-Zeit-Brand auf dem opaken Routing-Receiver, den `scopeTarget(base, key)` zurückgibt. Scope-gefilterte Event-Deklarationen verlangen diesen Carrier als ihren `this`-Typ, während das eigentliche Event-Subjekt ein explizites Argument bleibt.

```ts type-equiv
/**
 * A routing-only event receiver built by {@link scopeTarget}. The type
 * parameter records the subject type for dispatch checking; the carrier does
 * not expose the subject's properties. Event payloads carry the real subject.
 */
type Scoped<T extends object> = object & { readonly [ScopedBrand]: T }
```

## Registrierungskontext mit Besitz

`Scope` paart den getaggten Registrierungskontext mit zwei Teardown-Pfaden. `rawDispose` bewahrt die exakte Cordis-Disposer-Identität, die ein geordneter Composite-Effekt braucht; `dispose()` ist die öffentliche geteilte Quiescence-Grenze für direkte und konkurrierende Aufrufer.

```ts type-equiv
/** A minted registration scope and its quiescent disposal boundaries. */
interface Scope {
  /** Context through which scope-owned registrations are made. */
  ctx: Context
  /** Exact Cordis disposer, used when nesting this scope in an ordered composite effect. */
  rawDispose: () => Promise<void> | void
  /** Dispose every scope-owned registration; racing calls await the same completion. */
  dispose(): Promise<void>
}
```

## Scoped-Registry-Layer

`ScopeLayer` repräsentiert den vollständigen Beitrag einer Registry auf globaler oder Exact-Scope-Ebene. Ein konkreter Layer darf mehrere benannte und anonyme Tabellen aggregieren; Ganz-Layer-Leere erlaubt `ScopedLayers`, Scoped-Zustand zurückzufordern, ohne eine Geschwistertabelle zu verwerfen.

```ts type-equiv
/** One scope's aggregate contribution to a registry. */
interface ScopeLayer {
  /** Whether every table in this layer is empty. */
  isEmpty(): boolean
}
```

`ScopedLayers<L>` besitzt den eifrig erzeugten globalen Layer und die lazy erzeugten Exact-Scope-Layer. Reads erzeugen keine Layer: `peek(undefined)` bedeutet kein Overlay, während `merge()` einfügegeordnete globale benannte Einträge gefolgt von Scoped-Shadows materialisiert. Registrierungen verwenden einen Kontext sowohl für Sichtbarkeit als auch für Cordis-Effect-Besitz, sammeln ein synchrones Undo vor der optionalen Benachrichtigung, geben den exakten Cordis-Disposer zurück und fordern einen Scoped-Layer nur zurück, wenn sein vollständiges `ScopeLayer` leer ist.

`NamedEntries<V>` liefert einfügegeordneten Lookup und Live-Iteration mit caller-eigenen Duplikatfehlern. `AnonymousEntries<V>` gibt jedem Append eine eindeutige Identität, sodass gleiche Werte unabhängig bleiben. Die Iteration bleibt innerhalb einer nicht-leeren Tabellengeneration live; das Leeren der Tabelle löst bestehende Iteratoren von späteren Einfügungen ab. Beide geben idempotente, eintragsexakte Undos zurück; das geteilte `EntryValues`-Implementierungsinterface ist nicht öffentlich.
