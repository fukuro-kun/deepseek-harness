---
description: "Paketkarte der durable Session-Datenebene: der Persistence-Seam und seine Backends, Checkpoint-Policy, Projektionen, log-gestützte Titel und ausgehende Session-Telemetrie."
kind: "package-group"
---

# session/ — durable Session-Datenebene

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Die Session-Gruppe hält Konversationen dauerhaft fest, stellt freigegebene Log-Formate wieder her und macht committete Historie nach einem Neustart verfügbar. Ihre Storage- und Checkpoint-Pakete schützen Requests, Tool-Seiteneffekte und abgeschlossene Steps; Projektionspakete leiten client-fertige Werte ab; Titelpakete benennen Sessions; Telemetriepakete melden Aktivität. Beginne mit dem ausgelieferten JSONL-Storage und füge dann Checkpointing sowie nur die Projektionen, die Titel-Policy oder die Telemetrie hinzu, die dein Deployment braucht. Jedes Paket-README besitzt seine Garantien und Konfiguration, während eine benachbarte Query-Gruppe unabhängigen Lese- und Tool-Zugriff bereitstellt.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Zugehörige Dokumentation](#related-documentation)
- [Hinweis für Entwickler](#dev-note)

-----

<a id="packages"></a>
## Pakete

Die Gruppe gliedert sich in vier Familien: durable Storage (Persistence-Seam, Backends, Checkpoint-Policy), Projektionen, Titel und Telemetrie. Jedes Paket-README besitzt seinen Vertrag und seine Konfiguration.

### Persistenz

| Paket | Rolle | ctx key |
|---|---|---|
| [`session-format/`](session-format/README.de.md) | Reine Adjacent-Format-Kette und Artefakt-Validierungsbibliothek | Bibliothek — kein ctx key |
| [`session-format-v0-to-v1/`](session-format-v0-to-v1/README.de.md) | Eingefrorener released-v0-Decoder und Identitätsmigration nach released v1 | Bibliothek — kein ctx key |
| [`session-format-v1-to-v2/`](session-format-v1-to-v2/README.de.md) | Eingefrorener released-v1-Decoder und kardinalitätsändernde Assistant-Stream-Migration nach released v2 | Bibliothek — kein ctx key |
| [`session-format-catalog/`](session-format-catalog/README.de.md) | Generierter statischer Katalog der ausgelieferten Adjacent-Migrationen | Bibliothek — kein ctx key |
| [`session-persistence/`](session-persistence/README.de.md) | Definiert den durable Session-Storage-Service und die geteilte Write-Koordination, die jedes Backend komponiert | `ctx.sessionPersistence` |
| [`session-persistence-jsonl/`](session-persistence-jsonl/README.de.md) | Ausgeliefertes Backend: immutable kanonische Generation-Dateinamen pro Session mit exklusiver Nachfolger-Publikation, optional Zstandard-komprimiert | registriert auf `ctx.sessionPersistence` |
| [`session-checkpoint-policy/`](session-checkpoint-policy/README.de.md) | Macht Model-Requests, Top-Level-Tool-Seiteneffekte und abgeschlossene Steps vor der nächsten Aktion durable | wrappt `ctx.llm` und `ctx.tools` |
| [`session-log-deepseek/`](session-log-deepseek/README.de.md) | Lädt das inkrementelle kanonische Log als optionale offizielle DeepSeek-Request-Metadaten hoch | trägt `dsh_session_log` bei |

### Projektion

| Paket | Rolle | ctx key |
|---|---|---|
| [`session-projection/`](session-projection/README.de.md) | Definiert und treibt Projektionseinheiten, die committete Events zu ganzen aktuellen Werten falten | `ctx.sessionProjections` |
| [`session-projection-cache/`](session-projection-cache/README.de.md) | Persistiert Projektions-Checkpoints, damit kalte Reads volle Log-Loads überspringen | `ctx.sessionProjectionCache` |
| [`session-stats/`](session-stats/README.de.md) | Liefert ganze Log-Konversationszählungen und Wall-Zeiten über die Einheit `sessionStats` | registriert auf `ctx.sessionProjections` |
| [`session-turn-outline/`](session-turn-outline/README.de.md) | Liefert das ganze Log-Turn-Outline (Turn, `turn/start`-Seq, Prompt-Vorschau) über die Einheit `turnOutline` | registriert auf `ctx.sessionProjections` |

### Titel

| Paket | Rolle | ctx key |
|---|---|---|
| [`session-title/`](session-title/README.de.md) | Log-gestützte Session-Titel mit deterministischem Fallback und einem optionalen Provider | `ctx.sessionTitle` |
| [`session-title-llm/`](session-title-llm/README.de.md) | Geteilte modellgestützte Titel-Generierungspolicy für die Provider-Pakete | Bibliothek — kein ctx key |
| [`session-title-first-prompt-llm/`](session-title-first-prompt-llm/README.de.md) | Betitelt eine Session aus ihrer ersten eligible Human-Message | registriert auf `ctx.sessionTitle` |
| [`session-title-all-prompts-llm/`](session-title-all-prompts-llm/README.de.md) | Betitelt eine Session aus allen eligible Human-Messages | registriert auf `ctx.sessionTitle` |

### Telemetrie

| Paket | Rolle | ctx key |
|---|---|---|
| [`session-telemetry/`](session-telemetry/README.de.md) | Erfasst Session-Aktivität und übergibt Records an ein konfiguriertes Reporting-Backend | `ctx.sessionTelemetry` |
| [`session-telemetry-otel/`](session-telemetry-otel/README.de.md) | Liefert Telemetrie über OpenTelemetry-Logs im Modus `FEEDBACK_ONLY` oder `DISABLED` | registriert auf `ctx.sessionTelemetry` |

Es darf sich jeweils nur ein Titel-Provider registrieren; ohne einen behält der Titel-Service seinen deterministischen Fallback. Die folgenden Subsystem-Seiten sind die backend-neutralen Referenzen für jede Familie.

-----

<a id="related-documentation"></a>
## Zugehörige Dokumentation

- [Session-Persistence-Subsystem](../../docs/subsystems/persistence.de.md) — backend-neutrale Service-Semantik, der Flush-Checkpoint und Crash Recovery.
- [Session-Projections-Subsystem](../../docs/subsystems/session-projection.de.md) — der Projektionseinheiten-Vertrag und die Drive-Semantik.
- [Session-Titles-Subsystem](../../docs/subsystems/session-title.de.md) — Titel-Eligibility, Fallback und Provider-Fluss.
- [Session-Telemetry-Subsystem](../../docs/subsystems/session-telemetry.de.md) — Erfassung, Redaktion und Delivery-Modi.
- [Session-Subsystem](../../docs/subsystems/session.de.md) — das Live-Event-Log, das jedes Paket dieser Gruppe persistiert oder aus dem es ableitet.

<a id="dev-note"></a>
## Hinweis für Entwickler

Keiner.
