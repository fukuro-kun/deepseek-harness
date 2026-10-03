# Agent Note: Feedback-gesteuerte Session-Telemetrie als Default

Status: implemented

[English](2026-08-25-feedback-gated-telemetry-default.md) | [中文](2026-08-25-feedback-gated-telemetry-default.zh.md) | Deutsch

## Problem

Die Diagnose eines `/feedback`-Berichts braucht die Session-Daten, die der Bericht beschreibt. Da die geteilte Basis ein ungesetztes `DSH_TELEMETRY_MODE` als `DISABLED` auflöste, erreichte das Feedback einer Standardinstallation seinen Empfänger ganz ohne Session-Daten, und der Melder hatte keine Möglichkeit, Zugriff zu gewähren in dem Moment, in dem er um Hilfe bat; nur Deployments, die `DSH_TELEMETRY_MODE` vorher exportiert hatten, lieferten je einen diagnostizierbaren Bericht.

## Entscheidung

Die [Explizites-Feedback-OTel-Entscheidung](../architecture/2026-09-05-nonofficial-feedback-otel.de.md) besitzt die Upload-Autorisierung für alle Nutzer, einschließlich `deepseek-official`. Diese Notiz behält die Begründung für den Basis-Default: Feedback-gesteuerte Freigabe statt kontinuierlichem Export.

Die geteilte Basis löst ein ungesetztes oder leeres `DSH_TELEMETRY_MODE` als `FEEDBACK_ONLY` auf. Der eigene Default des Plugins bei weggelassenem `mode` ist `DISABLED`; `FULL` wird abgelehnt, und ein nicht-leeres `DSH_TELEMETRY_DISABLED` ist der Pre-Load-Hard-Opt-out. Neues eigenes Text-Feedback, Message-Rating-Bearbeitungen und Widerrufe geben das noch nicht übergebene kanonische Präfix über dieses Event frei, einschließlich gespeichertem Kontext. Geerbtes Eltern-Feedback autorisiert keinen Kind-Export.

Feedback-gesteuerte Freigabe lässt einen Melder die Session teilen, die das Problem zeigte, ohne es zu reproduzieren. Sie tauscht kontinuierlichen Export gegen einen expliziten Feedback-Trigger. Die [archivierte Default-off-](../../archived/feature/2026-08-10-telemetry-default-off.md) und [Default-Mount-](../../archived/feature/2026-07-31-web-telemetry-default-mount.md)Notizen halten die frühere Komposition fest; der [Basis-Patch](../../../../packages/bundle/base/cordis.patch.yml) und die [OTel-README](../../../../packages/session/session-telemetry-otel/README.de.md) besitzen die aktuelle Konfiguration.

## Erwogene Alternativen

**Von Meldern verlangen, nach Telemetrie-Aktivierung erneut zu laufen.** Als Feedback-gesteuerter Workflow verworfen: Die Session, die das Problem zeigte, ist die brauchbare Evidenz, und ein erneuter Lauf verliert sie.

**Kontinuierlichen Export erlauben.** Verworfen: Die Deployment-Konfiguration autorisiert keine Erfassung ohne explizites Feedback.

**Nur nachfolgende DeepSeek-Requests für die Lieferung nutzen.** Der unabhängige Opt-in-Beitrag kann kanonisches Feedback tragen, aber ein letzter Feedback-Eintrag hat eventuell keinen späteren Request. OTel gibt es für jeden Provider frei, ohne einen weiteren LLM-Request auszulösen.

## Konsequenzen

- Die ausgelieferte Basis gibt ein begrenztes Präfix nur bei neuem explizitem Feedback frei. Gewöhnliche Requests, Lifecycle-Events und gespeichertes Feedback lösen keine Erfassung aus. Spätere Records warten auf das nächste explizite Feedback.
- On-Demand-Erfassung kopiert und redigiert das kanonische Log zum Feedback-Zeitpunkt. Ohne eine Deployment-Redaktionsregel können exportierte Daten Nachrichtentext, Tool-Argumente und -Ergebnisse sowie Workspace-Pfade enthalten.
- Die Kommando-Bestätigung bestätigt die Aufzeichnung, nicht das Teilen oder die Lieferung. Ein Deployment, das vorherige informierte Einwilligung erfordert, muss sie vor Aktivierung der Uploads bereitstellen; die OTel-Übergabe bleibt der Batching-, Retry- und Loss-Policy des SDKs unterworfen.
