---
description: "Host- und Client-Workspace-Steuerung: Workspace-Navigation mutieren und ihrer vollständigen Projektion folgen."
kind: "package-reference"
---
# Workspace Controller
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`@deepseek-ai/dsh-api-workspace-controller` besitzt den Host-Service `ctx.workspaceController` und den generierten Client-Namespace `ctx.remote.workspace`. Seine Remote-Methoden erstellen, benennen um, entfernen und ordnen Workspaces neu, ordnen Sessions innerhalb eines Workspaces neu, archivieren und restaurieren Sessions aus der Workspace-Navigation und folgen der vollständigen Workspace-Projektion. Über das API Gateway verwenden, wenn ein Client die Workspace-Navigation ändern oder verfolgen muss. Das Paket besitzt außerdem `ctx.directoryPickerController` und den generierten `ctx.remote.directoryPicker`-Namespace, weil der Directory-Picking-Seam, den es trägt, abstrakt ist und nie ein eigener Loader-Entry.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Entwicklerhinweis](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Der Host-Controller serialisiert Mutationen, deren Korrektheit vom aktuellen Registry-Zustand abhängt, und wirft für erwartete Fehlschläge `RemoteError` mit einem stabilen `workspace/*`- oder `directory-picker/*`-Code. Sein `follow()`-Stream hängt sich synchron an durable Workspace-Änderungen, emittiert zuerst eine vollständige Baseline und danach geordnete `upsert`-, `remove`-, `order`- und `archived`-Inkremente. Ein Reconnect startet eine weitere Generation mit einer Ersatz-Baseline, sodass Consumer nicht darauf angewiesen sind, während der Trennung jedes Inkrement zu empfangen.

Der Client-Entry stellt `ClientWorkspaceModel` und `createWorkspaceStateStream()` bereit. Das Modell besitzt Workspace-Zeilen, Registry-Reihenfolge, archivierte Session-ids, unäre Mutations-Echos und die Auflösung von Stream-/Unär-Races. Eine neuere Host-Zeile gewinnt über `updatedAt`; eine committed Stream-Reihenfolge schlägt eine ältere unäre Antwort; eine entfernte Workspace-id kann durch verspätete Daten nicht wiederbelebt werden. Das Paket exponiert framework-neutrale Snapshots und Subscriptions und überlässt Navigationspolitik und React-Hooks dem UI-Owner.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da Workspace-Organisation Browser- und Host-Kontrollzustand ist und weder Prompt, Tool noch Session-Event registriert.

#### KV-Cache-Effekt

Kein direkter Effekt; Workspace-Mutationen verändern keine Model-Requests.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- `follow()` ersetzt die gesamte Projektion nach einem Reconnect und hat weder durable Cursor noch ein inkrementelles Aufholprotokoll.
- Prozesslokale Löschmarker verhindern, dass verspätete Daten einen entfernten Workspace wiederbeleben, nur für die Lebensdauer des Client-Modells.


<a id="dev-note"></a>
### Entwicklerhinweis

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Laufzeit-Invariante:** Es wird kein Companion veröffentlicht. Die Workspace-Registry besitzt die Persistenz; jede Stream-Generation ist eine vollständige Projektion.
