---
description: "Beobachtbare Browser-State-Stores mit expliziten Snapshots, Subscriptions und Lifecycle-Ownership."
kind: "package-library"
---
# @deepseek-ai/dsh-client-store
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

React-freie Observable- und Snapshot-Store-Primitiven, die von Client-Controllern und Renderer-Adaptern geteilt werden. Das Paket besitzt synchrone und Animation-Frame-Publikation, Immer-gestützte Updates, flache Gleichheit und optionale Browser-Persistenz; die Konstruktion von React-Hooks bleibt in `@deepseek-ai/dsh-client-ui-renderer`. Verwende es, wenn Client-Status stabile Snapshots veröffentlichen muss, ohne von React abzuhängen.

## Inhaltsverzeichnis

- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Entwicklerhinweis](#dev-note)

-----

<a id="model-experience"></a>
## Model Experience

Keine, da dieses Paket browserseitige State-Primitiven bereitstellt und nichts Modellseitiges registriert.

#### KV-Cache-Effekt

Keiner; die Stores stellen weder Modell-Requests zusammen noch senden sie welche.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>

- **Persistenz ist browser-lokal** — persistierte Stores verwenden JSON in `localStorage`; Nicht-Browser-Runtimes deaktivieren die Persistenz, und das Paket bietet keine geräteübergreifende Synchronisation.
- **Build-Eingabe für die Web-Shell** — das statische ESM behält Drittanbieter-Imports für Vite; unabhängige Consumer liefern seine Entwicklungsabhängigkeiten mit ([Abhängigkeitsregeln](../AGENTS.md#dependency-declaration)).


<a id="dev-note"></a>
### Entwicklerhinweis

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Das Paket exportiert eine Bibliotheks-Engine und erzeugt keinen prozessglobalen Zustand; jede Store-Instanz ist durch ihre eigenen Tests abgedeckt.
