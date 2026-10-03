---
description: "Package map for the web access capability family: the search/fetch service, its provider backends, and the model-facing tools that consume them."
kind: "package-group"
---

# web/ — Web-Zugriffs-Capability-Familie
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Die `web/`-Pakete lassen Modelle über die tools `web_search` und `web_fetch` das öffentliche Web durchsuchen und HTTP(S)-Seiten abrufen. Deployments können für die Suche Exa, Perplexity oder DeepSeek wählen und für den Abruf anonymen HTTP(S)-Zugriff; Verfügbarkeit und Ressourcenlimits hängen vom konfigurierten Provider ab. Diese Familie ist für Suche und Seitenabruf gedacht, nicht für interaktives Browsen, Inhaltsextraktion oder Policy-Durchsetzung pro URL. Modelle erhalten konsistentes tool-Verhalten, Cancellation und Fehlerreporting, wenn Provider wechseln.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

Sechs Pakete übernehmen die Web-Rollen; die Subsystem-Referenz besitzt das erschöpfende Vokabular und die Verträge.

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`web/`](web/README.de.md) | Search/Fetch-Service: Suchen und Abrufen von URLs über austauschbare Backends, eine Auswahl- und Fehler-Policy | `ctx.web` |
| [`web-search-exa/`](web-search-exa/README.de.md) | Durchsucht das Web über Exa | registriert auf `ctx.web` |
| [`web-search-perplexity/`](web-search-perplexity/README.de.md) | Durchsucht das Web über Perplexity | registriert auf `ctx.web` |
| [`web-search-deepseek/`](web-search-deepseek/README.de.md) | Durchsucht das Web über die native DeepSeek-Suche | registriert auf `ctx.web` |
| [`web-fetch-http/`](web-fetch-http/README.de.md) | Ruft öffentliche HTTP(S)-Seiten anonym ab | registriert auf `ctx.web` |
| [`tool-web/`](tool-web/README.de.md) | Stellt `web_search` und `web_fetch` dem Modell bereit | registriert auf `ctx.tools` |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

Beginne mit der Subsystem-Referenz für das gemeinsame Vokabular, dann die Designentscheidung hinter dem einzelnen Provider-Auswahl-Service.

- [Web-Subsystem](../../docs/subsystems/web.de.md) — die Search/Fetch-Anfragen und -Ergebnisse, Provider-Verfügbarkeit, `WebError` und die Durchsetzung öffentlicher Adressen.
- [Entscheidung zur Web-Capability-seam](../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.de.md) — warum Suche und Abruf einen gemeinsamen Provider-Auswahl-Service teilen.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
