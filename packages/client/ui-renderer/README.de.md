---
description: "Browser-UI-Renderer: React-Slot-Bindings, ctx.uiRenderer und die assemblierte Application-Root für den dsh Web-Client."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-renderer

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

`dsh-client-ui-renderer` mountet die assemblierte dsh-Web-Client-GUI: nachdem sich das vollständige Client-Plugin-Roster settled hat, ruft der Boot-Kernel `ctx.uiRenderer.mount(container)` auf, der die framework-freie Boot-Page hydriert und vor dem nächsten Paint zur vollen React-Applikation wechselt. Business-Plugins bleiben schlichte React-Komponenten, die Session- und Workspace-Daten über getypte Props erhalten und nie selbst Subscriptions verdrahten — der Renderer bindet die bare Observable-Sources der Runtime an den Slot-Outlets zu Selector-Hooks. Die Web-Shell und der Boot-Kernel sind seine einzigen direkten Consumer, sodass eine Komposition ihn genau dann braucht, wenn sie eine React-gerenderte GUI will.

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

Dieses Paket ist Infrastruktur: die Web-Shell und der Boot-Kernel sind seine einzigen direkten Consumer. Eine Komposition braucht es, wann immer sie eine React-gerenderte GUI will — `dsh-client-web` lädt das Roster, wartet auf die Aktivierung jedes Eintrags und ruft dann `ctx.uiRenderer.mount(container)` auf.

### Was das Mounten tut

`mount(container)` installiert den Slot-Renderer, hydriert das vorhandene Boot-DOM, wenn vorhanden, rendert die assemblierte Applikation vor dem nächsten Paint in den Container und gibt einen Disposer zurück, der die React-Root unmountet. Der Renderer führt den einzigen context-level `renderSlot('root')`-Call aus; der registrierte Root-Occupant besitzt Produkt-Layout und Dokument-Metadaten.

### Für Business-Plugins

Ein Business-Plugin registriert eine Komponente über das Slot-System; der Renderer bindet die Session- und Workspace-Observable-Sources der Runtime am Outlet zu Selector-Hooks. Das Plugin erhält die Standard-Session-Props (Session-Id, Conversation-Snapshot-Hooks) über seine komponierten Props — es importiert nie den Renderer und berührt keine React-Interna.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Das Paket realisiert eine Boundary: die Object Layer (Runtime, React-frei) besitzt den Business-Zustand; dieser Renderer ist der einzige Ort, an dem ctx-zu-React-Integration stattfindet — Slot-Renderer, `SessionProvider` und der `useSyncExternalStore`-Adapter.

### Aktivierung und Mount

Das Plugin aktiviert nach `slots`, `sessions` und `layout`; es installiert `createSlotRenderer()` und reflected den `uiRenderer`-Service. `mountApp` sucht das `[data-dsh-boot]`-Element des Boot-Kernels: wenn vorhanden, hydriert es über `BootHandoff` (ein One-Frame-Pass-through, das das Loading-DOM bewahrt), andernfalls erzeugt es eine frische Root und flusht das Rendering synchron.

### Slot-Bindings

`createSlotRenderer` verbindet die Slot-Registry mit React: Entry-Listen werden reaktive Sources, und jedes Outlet rendert über den installierten Renderer. Business-Plugins reichen bare Observable-Sources über getypte Slot-`hooks`; der Renderer bindet sie am Outlet über den uSES-Adapter.

### Identität

React, React DOM, Cordis, ui-slots und ui-primitives behalten eine Browser-Identität über die statische Modul-Tabelle der Web-Shell; dieses Paket kommt als dynamisches Client-Bundle an.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten behandeln die umliegende Maschinerie und das Kompositionsmodell.

- [ui-slots](../ui-slots/README.md) — der Slot-Registry-Pure-Core, den dieser Renderer an React bindet.
- [web](../web/README.de.md) — die Shell, die das Roster lädt und `mount` aufruft.
- [ui-session](../ui-session/README.md) — der Adapter, der die Standard-Session-Sources und -Hooks liefert, die dieser Renderer bindet.
- [Web-Client-Architektur](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.md) — die Loading-Chain, Object Layer und Layering-Redlines.
- [Slot-System-Standard](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md) — das definitive Kompositionsmodell.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da das Paket eine browserseitige Render-Assemblierung ist, die nichts Modell-zugewandtes registriert.

#### KV-Cache-Effekt

Keiner; dieses Paket assembliert weder einen Provider-Request noch sendet es einen.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann der Application-Frame erscheint und wie weit Per-Region-Readiness geht; sie sind aktuelle Paket-Constraints.

- **Der erste Application-Frame wartet auf jeden Client-Eintrag** — der Boot-Kernel übergibt den Mount-Point erst, nachdem sich das Loader-Roster settled hat; Per-Region-Readiness bleibt zurückgestellt.
- **Slot-Rendering hat keine Suspense-Integration oder Per-Entry-Lazy-Loading** — das vollständige Plugin-Roster settled, bevor der Renderer die Root mountet.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
