---
description: "Paketkarte der SDK-Familie: JSON-RPC-Protokollformat sowie TypeScript-Client und -Server für prozessexterne SDKs."
kind: "package-group"
---

# sdk/ — eine Harness-Runtime aus einem anderen Prozess steuern

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Die SDK-Familie lässt einen anderen Prozess eine vollständige DeepSeek-Harness-Runtime über zeilenbasiertes JSON-RPC steuern. Das Protokollpaket definiert die öffentlichen Nachrichten, der TypeScript-Client startet `dsh` mit einem benannten Profil und geordneten Patches, und der Server nimmt SDK-Anfragen über stdio entgegen. Clients können Sessions öffnen, Prompts senden und Session-Events, Agent-Statusänderungen und Subagent-Abschlüsse beobachten. Der TypeScript-Client und das [Python SDK](../../python/README.md) verwenden dasselbe Protokoll; diese Pakete erstellen keine Entwicklerprojekte und definieren keine weitere Anwendung.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Entwicklerhinweis](#dev-note)

-----

<a id="packages"></a>
## Pakete

Das README jedes Pakets beschreibt, was du mit seinem Teil des Stacks tun kannst.

| Paket | Rolle |
|---|---|
| [`protocol/`](protocol/README.de.md) | Wire Format: der zeilenbasierte JSON-RPC-Transport und die benannten Request-, Result- und Notification-Typen |
| [`client/`](client/README.de.md) | TypeScript-Client, der einen Runtime-Subprozess startet und Agent-Turns über die High-Level- und Protokoll-APIs steuert |
| [`server/`](server/README.de.md) | `jsonrpc`-Plugin, das prozessexterne SDK-Clients über stdio bedient |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

Beginne mit dem Python SDK (der Schwesterimplementierung des Client-Vertrags), dann der lauffähigen Anwendung und den Entscheidungsaufzeichnungen hinter der Gruppengrenze.

- [Python SDK](../../python/README.md) — das Python-Gegenstück, das dasselbe Protokoll spricht und eine gebündelte Runtime mitliefert.
- [SDK-Anwendungsbündel](../bundle/sdk-app/README.de.md) — die `dsh --profile sdk`-Anwendung, die den JSON-RPC-Server startet.
- [Architektur](../../docs/architecture.de.md) — warum der paketierte Python-Client dieselben benannten Profile startet.
- [Entfernung der SDK-Projekt-Toolchain](../../.agents/notes/archived/simplification/2026-08-11-remove-sdk-project-toolchain.md) — warum diese Gruppe niemals Entwicklerprojekte erstellt, konfiguriert oder baut.
- [SDK-Subagent-Provider](../subagent/subagent-dsh-sdk/README.de.md) — ein harness-interner Consumer des TypeScript-Clients.

<a id="dev-note"></a>
## Entwicklerhinweis

Keiner.
