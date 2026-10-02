---
description: "Die Core-Gruppenkarte: Session-Log, System-Prompt-Assemblierung, Tool-Registry, agent-Vokabular und Standard-Loop, die gemeinsam die Produkt-API-Spine bilden."
kind: "package-group"
---

# packages/core

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Mit den Core-Paketen baust oder erweiterst du einen agent, der eine dauerhafte Session-Historie aufzeichnet, System-Prompts assembliert, Tools bereitstellt, ein Standardmodell auswählt und Modell-Turns ausführt. Diese Pakete definieren die geteilten APIs, die jede Komposition verwendet; ausführbare Produkt-Assemblies liegen unter [`packages/bundle`](../bundle/README.de.md). Wähle diese Gruppe, wenn du agent-Verhalten entwickelst oder eine dieser Fähigkeiten ersetzt; beginne mit [`dsh-base`](../bundle/base/README.de.md), wenn du die standardmäßig lauffähige Komposition brauchst.

## Inhalt

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev-Notiz](#dev-note)

-----

<a id="packages"></a>
## Pakete

| Paket | Rolle | ctx-Key |
|---|---|---|
| [`scope/`](scope/README.de.md) | Scoped-Registrierung und Event-Routing, die die Beiträge eines einzelnen agent isolieren | Bibliothek — kein ctx-Key |
| [`session/`](session/README.de.md) | Das Append-only-Session-Event-Log, aus dem die Historie jedes agent abgeleitet wird | `ctx.sessions` |
| [`system-prompt/`](system-prompt/README.de.md) | System-Prompt-Assemblierung aus geordneten Abschnitten, Tool-Schemas und Variablen | `ctx.systemPrompt` |
| [`tools/`](tools/README.de.md) | Die Tool-Registry und die abgesicherte Ausführungs-Pipeline, über die der Loop dispatcht | `ctx.tools` |
| [`agent-tool-presentation/`](agent-tool-presentation/README.de.md) | Pro-agent Tool-Präsentations-Selektor für Presets | kein ctx-Key |
| [`agent/`](agent/README.de.md) | Das `Agent`-Handle, gegen das Plugins programmieren, sowie dessen Live-Registry und Events | `ctx.agents` |
| [`agent-default-model/`](agent-default-model/README.de.md) | Die Deployment-Standard-Modellauswahl, die Einstiegspunkte auf neue agents anwenden | `ctx.agentDefaultModel` |
| [`agent-loop/`](agent-loop/README.de.md) | Der Standard-agent-Treiber: erzeugt agents und führt den Turn- und Step-Lebenszyklus aus | `ctx.agentLoop` |

`scope` liefert das geteilte Scoping-Primitiv; `agent` besitzt den öffentlichen `Agent`-Vertrag, während `agent-loop` dessen Standardimplementierung ist — Erweiterungs-Plugins hängen daher von `agent` ab, und der Treiber bleibt austauschbar. `agent-default-model` besitzt die Deployment-Auswahl, die ein Einstiegspunkt anwendet, wenn eine Session keine eigene hat. Lauffähige Kompositionen liegen unter [`packages/bundle`](../bundle/README.de.md); diese Gruppe besitzt nur die austauschbaren Spine-Teile.

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

- [Core-Subsystem](../../docs/subsystems/core.de.md) — die paketweise Loop-Karte und die `Agent`-Handle-Verträge.
- [Session-Subsystem](../../docs/subsystems/session.de.md) — das Session-Event-Vokabular und die abgeleitete Historie.
- [System-Prompt-Subsystem](../../docs/subsystems/system-prompt.de.md) — Prompt-Abschnitte, dynamischer Kontext und Tool-Schema-Typen.
- [Tools-Subsystem](../../docs/subsystems/tools.de.md) — die Tool-Ausführungs-Pipeline und das Präsentationsvokabular.
- [Scoped-Registration-Subsystem](../../docs/subsystems/scope.de.md) — das Scoped-Layer-Primitiv, auf dem diese Registries aufbauen.
- [Architektur](../../docs/architecture.de.md) — der Turn-Fluss und wohin neues Verhalten gehört.
- [Base-Bundle](../bundle/base/README.de.md) — die Standard-Produktkomposition.
- [SDK-Minimal-Bundle](../bundle/sdk-minimal/README.de.md) — eine vollständige, eigenständige Komposition mit bewusst kleinerem Funktionsumfang.

-----

<a id="dev-note"></a>
## Dev-Notiz

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
