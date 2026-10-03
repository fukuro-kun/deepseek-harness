---
description: "React- und Slot-Adapter für Session-Controller-Listen, Interaktionszustand und pro-Session-Kontext."
kind: "package-reference"
---
# @deepseek-ai/dsh-client-ui-session
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

React- und Slot-Adapter für Session-Controller-State. Er trägt Session-List- und Pending-Interaction-Hooks auf Root-Scope bei, materialisiert pro-Session-Hooks und -Props und besitzt das Standard-`SessionProvider`-Rendering-Verhalten, ohne Ownership über Session-Transport- oder Lifecycle-State zu übernehmen. Verwende ihn, wenn ein Browser-Feature Session-State über Standard-React-Props und -Hooks benötigt.

## Inhaltsverzeichnis

- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Entwicklerhinweis](#dev-note)

-----

<a id="model-experience"></a>
## Model Experience

Keine, da dieses Paket browserseitigen Session-State adaptiert und nichts Modellseitiges registriert.

#### KV-Cache-Effekt

Keiner; Session-Selektoren und Slot-Scopes assemblieren keine Modell-Requests.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>

- **Pending Interactions sind prozesslokale Projektionen** — der zuständige Remote Waterfall muss eine ausstehende Anfrage nach einem Browser-Reconnect erneut abspielen.


<a id="dev-note"></a>
### Entwicklerhinweis

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Der Adapter-Materialisierungspfad erzwingt die Konsistenz der Session-Bindung.
