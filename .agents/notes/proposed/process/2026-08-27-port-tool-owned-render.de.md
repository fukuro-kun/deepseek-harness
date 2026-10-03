# Agent Note: Tool-Ownership-Render in aktuelle DSH-APIs porten
[English](2026-08-27-port-tool-owned-render.md) | [中文](2026-08-27-port-tool-owned-render.zh.md) | Deutsch

Status: proposed


## Problem

Das `dsh-tool-owned-render`-Prototyp (`Chinesezjc/dsh-tool-owned-render`) liefert tool-eigene Render-Registrierungen für `read`, `bash`, `write`/`edit`, `grep`/`glob` und `web_search`/`web_fetch`, geschrieben gegen eine ältere API, in der `ToolCallBlock` `callView` / `resultView` exponierte und der Client Host-`presentResult`-Output empfing. Das aktuelle master leitet Client-Karten aus rohem `block.call` / `block.content` / `block.meta` ab, und `ctx.slots` erfordert die `@deepseek-ai/dsh-client-ui-renderer/client`-Modul-Erweiterung. Ein direkter Merge des Prototyps besteht nicht den Typecheck, daher können seine Registrierungen nicht ohne einen Port ausgeliefert werden.

## Vorschlag

- `packages/client/tool-owned-render` als Workspace-Package hinzufügen.
- Die `read`, `bash`, `write`/`edit`, `grep`/`glob` und `web_search`/`web_fetch`-Registrierungen porten, um aus aktuellen `ToolCallBlock`-Feldern abzuleiten.
- Eine `read_image`-Registrierung mit denselben ToolCard/Segment-Primitiven hinzufügen.
- Die `ctx.slots`-Typ-Erweiterung durch `dsh-client-ui-renderer` verdrahten.
- PR #2828 mergebar halten, während dieser Port separat fortschreitet.

## In Erwägung gezogene Alternativen

- **Den Prototyp mergen und seine Typfehler an Ort und Stelle beheben** — abgelehnt: jede Registrierung müsste ohnehin aus den aktuellen `ToolCallBlock`-Feldern neu abgeleitet werden, daher ist der Port dieselbe Arbeit, nur dass der überholte `callView` / `resultView`-Vertrag bereits verschwunden ist.
- **Den Port in PR #2828 einbetten** — abgelehnt: die Image-Karte ist eine Funktion mit definiertem Scope, und ein zweites Package plus fünf weitere Registrierungen würden die Review-Fläche eines bereits großen PRs vergrößern.

## Akzeptanzkriterien

- `packages/client/tool-owned-render` existiert als Workspace-Package.
- Die portierten Registrierungen leiten Karten-Zustand aus aktuellen `ToolCallBlock`-Feldern ab und bestehen den Typecheck auf master.
- Eine `read_image`-Registrierung rendert durch dieselben Primitiven wie `read`.
- Die `ctx.slots`-Typ-Erweiterung löst sich durch `dsh-client-ui-renderer` auf.
- PR #2828 merged unabhängig von diesem Port.

## Risiken

- Der Port kann die exakte visuelle Ausgabe des Prototyps nicht reproduzieren, weil die aktuellen Karten-Primitiven vom alten `callView` / `resultView`-Vertrag abweichen.
- API-Drift während des Port-Voranschritts kann diesen Vorschlag veralten; die Akzeptanzkriterien werden zum Port-Zeitpunkt gegen master nachgeprüft.
