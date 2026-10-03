---
description: "Paketkarte für verifizierte externe Events, programmatische Regeln und Fire-and-Forget-DSH-Session-Erzeugung."
kind: "package-group"
---

# webhook/ — verifizierte externe Events zu DSH-Sessions

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Die Webhook-Familie empfängt authentifizierte Provider-Events und führt vertrauenswürdige programmatische Regeln aus. Eine Regel kann eine gewöhnliche Root-Session innerhalb eines Web-Workspace erzeugen. Der Dispatch ist prozesslokal und Fire-and-Forget, ohne Zustelldatenbank, Queue, Retry, Deduplizierung oder Agent-Abschlusszustand.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Entwicklerhinweis](#dev-note)

-----

<a id="packages"></a>
## Pakete

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`webhook/`](webhook/README.de.md) | Regel-Registry, Callback-Lifecycle und Workspace-gestützte Session-Erzeugung | `ctx.webhookRuntime` |
| [`webhook-github/`](webhook-github/README.de.md) | Signierter GitHub-HTTP-Adapter | konsumiert `ctx.webhookRuntime` und `ctx.webServer` |

<a id="related-documentation"></a>
## Verwandte Dokumentation

Provider-Adapter authentifizieren und normalisieren Zustellungen. Regeln besitzen beliebige Bedingungen und externe Aufrufe und geben dann `null` oder einen Session-Request zurück. Die [Webhook-Subsystem-Referenz](../../docs/subsystems/webhook.de.md) besitzt die geteilten Typen und Timing-Garantien.

<a id="dev-note"></a>
## Entwicklerhinweis

Keiner.
