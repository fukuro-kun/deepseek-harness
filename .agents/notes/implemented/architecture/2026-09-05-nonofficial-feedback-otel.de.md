# Agent Note: Nur-Explicit-Feedback-Upload über OpenTelemetry
[English](2026-09-05-nonofficial-feedback-otel.md) | [中文](2026-09-05-nonofficial-feedback-otel.zh.md) | Deutsch

Status: implemented


## Problem

Feedback braucht den Session-Kontext, den es beschreibt, und einen Zustellpfad unabhängig vom Modell-Provider oder einem späteren Modell-Request. Gewöhnliche Aktivität darf keine Uploads autorisieren. Geerbtes Feedback darf nicht als Einwilligung einer Child-Session zählen.

## Entscheidung

Die Base mountet OTel in `FEEDBACK_ONLY` für alle Nutzer und Provider, einschließlich `deepseek-official` und Sessions ohne Request-Header. Nur neue eigene `feedback/record`-, `feedback/message-put`- und `feedback/message-delete`-Events autorisieren Capture über genau dieses kanonische Event. Text-Feedback, Ratings, materielle Notiz-Edits und Widerrufe zählen. Kalte `feedback/committed`-Benachrichtigungen liefern einen committeten Snapshot, ohne eine Live-Session oder einen Agent zu veröffentlichen.

Ein autorisierter Prefix umfasst den gesamten nicht übergebenen kanonischen Kontext von seq 0 bis zum Feedback, nicht nur dessen Payload. Ein Child braucht sein eigenes neues Feedback; sein Prefix umfasst dann geerbte History. Spätere Records warten auf das nächste explizite Feedback. Request-Aktivität, Request-Header, Session-Erzeugung oder -Adoption, Wiederherstellung, Plugin-Mount und HMR autorisieren nie Capture; gespeichertes Feedback allein triggert nichts.

Das Backend nutzt On-Demand-Capture mit vollständiger History und dem bestehenden Redaction-Waterfall. `DISABLED` konstruiert keinen Transport. `FULL` wird abgelehnt statt gealiast. Direkte `ctx.sessionTelemetry.emit()`-Aufrufe sind No-Ops, sodass Caller die Feedback-Autorisierung nicht umgehen können. SDK-Scheduled-Flush und Shutdown dürfen zuvor autorisierte Batches beenden, aber nie neue Records capturen. Das Senden nach der Übermittlung braucht keine weitere Nutzerinteraktion oder Modell-Call.

Die [Canonical-Feedback-Entscheidung](2026-09-05-canonical-feedback-log.de.md) besitzt Storage, Versionen, Löschung und schlichte Command-Bestätigung. Der [Opt-in-DeepSeek-Beitrag](../../../../packages/session/session-log-deepseek/README.de.md) bleibt unabhängig, mit seinem bestehenden Destination- und Acceptance-Verhalten.

## Erwogene Alternativen

**Nach Provider oder Endpunkt-Hostname filtern.** Feedback autorisiert denselben begrenzten Kontext für jeden Nutzer; eine Provider-Wahl, ein Gateway oder ein fehlender Header ändert diese Autorisierung nicht.

**Nur spätere DeepSeek-Requests nutzen.** Andere Provider tragen `dsh_session_log` nicht, und finales Feedback kann keinen nachfolgenden Request haben. Die bestehende OTel-Pipeline sendet unabhängig ohne Custom-Uploader oder Modell-Call.

**Kontinuierliches Capture beibehalten oder gespeichertes Feedback auf Lifecycle-Events replayen.** Deployment-Konfiguration und altes Feedback autorisieren kein neues Capture. Nur eine neue explizite Übermittlung tut das. Parent-Feedback kann ebenfalls keinen Child-Upload autorisieren.

## Konsequenzen

Handoff ist Best-Effort, nicht Collector-Acceptance. Same-Object-Cursor unterdrücken wiederholtes Capture, aber frische kalte Snapshots und neues Feedback nach Restart können Prefixes wiederholen; Empfänger deduplizieren auf `(session.id, session.format_version, event.seq)`. Es gibt keine durable OTel-Outbox, keinen Delivery-Watermark und kein Harness-HTTP-Retry-Versprechen. SDK-Batching- und Loss-Verhalten gilt nach dem Enqueue. OTel und der Opt-in-DeepSeek-Pfad können überlappen. Widerruf exportiert ein Deletion-Event, keine Remote-Löschung.

[OTel-Tests](../../../../packages/session/session-telemetry-otel/tests/otel.spec.ts) decken Explicit-Feedback-Capture, provider-unabhängiges Verhalten, Lifecycle-Silence, Fork-Consent, kalte Commits und Direct-Call-Ablehnung ab. [Coordinator-Tests](../../../../packages/session/session-telemetry/tests/telemetry.spec.ts) decken History-Capture ab; [Base-Tests](../../../../packages/bundle/base/tests/base.spec.ts) pinnen den gemounteten Default.
