---
description: "Slot-Registry-Pure-Core für den dsh Web-Client: SlotMap-Deklarations-Merging, die einzige register-Kompositions-API, Four-Share-Props-Typen, Store-Seats und der Renderer-Install-Vertrag."
kind: "package-library"
---

# @deepseek-ai/dsh-client-ui-slots
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

`dsh-client-ui-slots` lässt Web-Client-Plugins getypte UI-Regionen definieren und komponieren. Caller können über eine compile-time-geprüfte API Komponenten hinzufügen, verschachtelte Regionen deklarieren, scoped State anhängen und Business-Props liefern. Es unterstützt Single-, Ordered-List-, Keyed- und Self-Selecting-Chain-Komposition und meldet konfligierende Kompositionen während des Plugin-Loadings. Wähle es für framework-neutrale Slot-Komposition; paare es mit `ui-renderer`, wenn der Client React-Rendering braucht.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Komponiere UI über dieses Paket, wann immer du ein Client-Plugin schreibst: registriere eine Komponente in einen Slot, den dein Parent deklariert hat, oder deklariere Child-Slots, die deine Komponente rendert. Die vier Kinds decken die Kompositionsformen ab — `single` (ein Occupant), `list` (geordnete Einträge), `keyed` (Dispatch über einen Key) und `chain` (Einträge wählen sich selbst).

### Die vier Props-Shares

Jede registrierte Komponente erhält Props, die aus vier Shares komponiert sind: dem Runtime-Share (`owner` vom renderSlot-Call-Site des Parents, plus dem Session-Standard-Kit und dem Global-Seat), dem Child-Render-Share (`renderSlot`, statisch auf die deklarierten Children-Keys eingegrenzt), dem Store-Share (der Selector-Hook des deklarierten Handle und die draft-bereinigten Actions) und dem Business-Share (aus dem Rückgabewert der `inject`-Factory inferiert). Komponenten referenzieren `ComposedProps`; sie typen einen Share nie lokal neu.

### Store-Seats

Ein register-Call darf einen Store-Seat mit `store: defineStore(...)` deklarieren: `init` inferiert das State-Schema und `actions` ist das vollständige Draft-Transform-Write-Set. Komponenten lesen über den Selector-Hook und schreiben über die gebackten Callbacks; die Engine-Implementierung von `defineStore` lebt im Runtime-Paket und erfüllt den hier exportierten `DefineStore`-Vertrag.

### Deklarationsdisziplin

Einen Slot zu deklarieren heißt, ihn zu beanspruchen: der registrierende Eintrag wird der einzige Eintrag, der diesen Key rendern darf, und das Registrieren in einen undeklarierten Slot, das Deklarieren eines bereits deklarierten Child, das Mounten eines geteilten Handle unter zwei Scopes oder das Registrieren einer Chain ohne `select` wirft zur Ladezeit. Der Disposer eines Eintrags kollabiert seine deklarierten Child-Slots rekursiv — Ledger-Rows, Contributions und Store-Mounts sterben auf einer Lifecycle-Achse.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Das Design ist eine Tabelle: Deklaration = Render-Autorisierung = Runtime-Spec. `SlotMap` wird hier leer deklariert und von Consumern via `declare module`-Augmentation gemergt, genau wie die Standard-Kit-Interfaces (`SessionStandardProps`, `GlobalStandardProps`), die das Runtime-Paket mit echten Membern mergt.

### Registrierung und Routing

`SlotCore` seedet den a-priori-`'root'`-Slot bei der Konstruktion und erzwingt Load-Time-Validierung. `ChainSelect`-Selektoren laufen in aufsteigender `priority`-Reihenfolge (Gleichstände in Registrierungsreihenfolge); der erste nicht-null-Rückgabewert wählt seinen Eintrag und wird zum `matched`-Prop der Komponente, und all-null fällt auf den `renderSlotChain`-Fallback des Owners (`ChainRenderOpts`). Jeder Key trägt eine Declaration-Epoch, die nur bei Deklaration und Kollaps fortschreitet; `ui-renderer` nutzt sie für `ctx.slots.inject`, unabhängig von den gewöhnlichen Entry-Versionen.

### Der Renderer-Vertrag

`renderer.ts` trägt den Installationsvertrag (`SlotRenderer`, `SlotRendererHost`) plus `StaleAuthorizationError`/`SlotOwnershipError`; ui-renderer besitzt sowohl die Implementierung als auch deren Plugin-Lifecycle-Installation. Engine-Produkte und der Renderer-Host-Vertrag tragen bare Snapshot-Sources (`getSnapshot`/`subscribe`), nie React-Hooks — Hook-Binding gehört der Render-Maschinerie.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten behandeln die Engine, den Renderer und das Kompositionsmodell.

- [ui-renderer](../ui-renderer/README.de.md) — der React-Slot-Renderer, der den Install-Vertrag dieses Pakets implementiert.
- [Slot-System-Standard](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.de.md) — das definitive Kompositionsmodell.
- [Web-Client-Architektur](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.de.md) — die Loading-Chain und Object Layer, in die sich diese Registry einsteckt.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da das Paket eine browserseitige UI-Plugin-Schicht ist, die nichts Modell-zugewandtes registriert.

#### KV-Cache-Effekt

Keiner; dieses Paket assembliert weder einen Provider-Request noch sendet es einen.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren das Skalierungsverhalten der Registry und akzeptierten Type-Noise; sie sind aktuelle Paket-Constraints.

- **`isLive` scannt alle Records linear** — bei UI-Plugin-Registrierungszahlen (Dutzende) unkritisch; mit einer Entry→Record-Backref erneut angehen, falls Ledger je heiß werden.
- **Der `__renders`-Phantom-Anchor ist auf `PropsRenderSlots` sichtbar** — derselbe akzeptierte Noise wie das `__accepts` des Type-Chain-Designs: generische Methodensignaturen vergleichen locker über Key-Unions, sodass der kontravariante Marker das erzwingt, was „Komponenten-Key-Menge ⊆ Children-Deklaration“ durchsetzt.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Ein Zero-Dependency-Pure-Registry-Core — er emittiert selbst keine Cordis-Events (die `ui-renderer`-SlotRegistry besitzt die Event-Bridge und ihre Invarianten); die Define/Register/Dispose-Sequenzierung wird direkt von den Behavior-Specs dieses Pakets geprüft.
