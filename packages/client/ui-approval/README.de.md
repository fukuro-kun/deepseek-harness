---
description: "Browser-Approval-UI, die Host-Berechtigungsanfragen über den scoped Interaction-Pfad beantwortet."
kind: "package-reference"
---
# @deepseek-ai/dsh-client-ui-approval
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Browser-Approval-Darstellung über dem Agent-scoped Remote Event Waterfall. Das Plugin veröffentlicht jede ausstehende Anfrage über `ctx.uiSession`, übernimmt den Conversation-Composer, rendert optional korrelierte Tool-Details und gibt die Entscheidung des Nutzers an die wartende Host-Anfrage zurück. Verwende es, wenn ein Browser die Genehmigung für eine wartende Host-Operation einholen muss.

## Inhaltsverzeichnis

- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Entwicklerhinweis](#dev-note)

-----

<a id="model-experience"></a>
## Model Experience

Keine, da dieses Paket Approval-Anfragen im Browser darstellt und nichts Modellseitiges registriert.

#### KV-Cache-Effekt

Keiner; das Rendern von Approval-Anfrage und -Antwort verändert keinen Modell-Request.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>

- **Das Panel bietet nur transiente Entscheidungen** — es unterstützt Einmal-Erlauben und Ablehnen; die persistente Berechtigungs-Policy bleibt im Besitz hostseitiger Approval-Pakete.


<a id="dev-note"></a>
### Entwicklerhinweis

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Registries besitzen und beobachten den Remote-Listener und den temporären Slot-Eintrag.
