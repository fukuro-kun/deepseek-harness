---
description: "Die identity-Paketgruppe: anonyme, pro-Harness-Home-Korrelations-ids, die von Telemetrie, Feedback und DeepSeek-Provider-Anfragen geteilt werden."
kind: "package-group"
---

# identity/ — geteilte Identität

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Die identity-Gruppe stellt eine anonyme id pro Harness-Home bereit, die die Telemetrie-, Feedback- und DeepSeek-Anfragen der Installation an ihre Datensätze anhängen, sodass alles, was ein Home verlässt, als von derselben Installation stammend erkannt werden kann, ohne den Nutzer zu identifizieren. Es gibt nichts zu konfigurieren: Die id erscheint automatisch beim ersten Lauf eines dieser Features und bleibt stabil, bis ihre Datei gelöscht wird. Die Gruppe hat ein Paket; diese Seite kartiert es, und das Paket-README besitzt die Details.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

<a id="packages"></a>
## Pakete

| Paket | Rolle |
|---|---|
| [`anonymous-user-id`](anonymous-user-id/README.de.md) | Gibt jedem Harness-Home eine anonyme id, die Telemetrie, Feedback und DeepSeek-Anfragen an ihre Datensätze anhängen, sodass Datensätze einer Installation erkannt werden können, ohne den Nutzer zu identifizieren |

<a id="related-documentation"></a>
## Verwandte Dokumentation

- [Session-Telemetrie-Subsystem](../../docs/subsystems/session-telemetry.de.md) — das Telemetrie-Feature, das die id auf Exporten trägt.
- [dsh-llm-deepseek](../llm/llm-deepseek/README.de.md) — der DeepSeek-Provider, der die id auf Anfragen trägt.
- [dsh-command-feedback](../feedback/command-feedback/README.de.md) — der Feedback-Befehl, der die anonyme Installation in seiner Bestätigung benennt.

<a id="dev-note"></a>
## Dev Note

Keiner.
