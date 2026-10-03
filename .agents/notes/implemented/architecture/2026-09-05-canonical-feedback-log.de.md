# Agent Note: Kanonisches Feedback-Log und Request-Zustellung

Status: implemented

[English](2026-09-05-canonical-feedback-log.md) | [中文](2026-09-05-canonical-feedback-log.zh.md) | Deutsch

## Problem

Editierbare Message-Ratings brauchen eine durable Autorität, die Session-Export und Request-Zustellung beibehalten können. Ein separater Feedback-Store macht diese Consumer unvollständig und führt eine zweite Commit-Beziehung zur Ziel-Message ein. Das Aufzeichnen eines menschlichen Urteils darf weder Modell-Input ändern noch implizieren, dass ein Collector es akzeptiert hat.

## Entscheidung

Das kanonische Session-Log besitzt Feedback. Session-Ebene-Anmerkungen verwenden `feedback/record`; materielle Message-Edits und -Löschungen verwenden `feedback/message-put` und `feedback/message-delete`. Alle sind Log-only. Der Service faltet aktuelle Items aus Events, die der angefragten `sessionId` entsprechen, sodass geerbte Parent-Events nicht zum aktuellen Feedback eines Forks werden. Löschung entfernt das aktuelle Item, nicht frühere Ratings oder Notizen aus dem Log.

Live-Message-Feedback-Mutationen hängen über die besitzende Session an und warten deren Durability-Checkpoint ab; kalte Mutationen halten ein Persistence-Write-Handle über Read, Vergleich, Append und Flush, ohne eine Session oder einen Agent zu erzeugen. Ein matchender No-Op hängt nichts an, wartet aber trotzdem Persistence ab. Fehler propagieren, und ein fehlgeschlagener Live-Flush kann ein beobachtbares In-Memory-Item für Retry hinterlassen. Per-Item-Versionen verhindern, dass nicht verwandte Message-Edits konfliktieren; strikte Stale-Write-Ablehnung verhindert ABA-Überschreibungen selbst dann, wenn der gewünschte Wert übereinstimmt. Ziel-Validierung bindet ein Urteil an eine gesendete Assistant-Message, und Forks behalten unabhängige Urteile. Diese Entscheidungen behalten die in der [archivierten Sidecar-Entscheidung](../../archived/architecture/2026-08-10-message-feedback-sidecar.md) aufgezeichnete Begründung, deren Storage- und Commit-Mechanismus abgelöst ist.

Der bestehende Opt-in-[session-log-deepseek-Beitrag](../../../../packages/session/session-log-deepseek/README.de.md) nimmt Feedback im gewöhnlichen `dsh_session_log`-Suffix auf einem nachfolgenden eligible Request auf. Er verwendet die bestehende DeepSeek-Destination-Auswahl und Acceptance-Watermark. Es gibt keinen separaten `dsh_feedback`-Uploader, keinen feedback-getriggerten LLM-Request und kein Model-Input-Feld. Die [Explicit-Feedback-OTel-Entscheidung](2026-09-05-nonofficial-feedback-otel.de.md) besitzt den unabhängigen feedback-getriggerten Upload für alle Nutzer und Provider.

Das Command bestätigt die Aufzeichnung mit den Session- und anonymen User-IDs, ohne von Telemetrie abzuhängen oder deren Policy offenzulegen. Sein Append bleibt ungeflusht. Dies löst die Command-Copy-Entscheidung in der [archivierten Sharing-Disclosure-Note](../../archived/feature/2026-08-07-feedback-acknowledgement-sharing-disclosure.md) ab. Die [Policy-API des Telemetrie-Services](../../../../packages/session/session-telemetry/README.de.md#the-sharing-disclosure) bleibt unabhängig verfügbar: ein Backend legt seine Policy offen, nicht Zustellung oder Retention, und das optionale OTel-Package besitzt dieses Vokabular nicht.

## Erwogene Alternativen

**Den Sidecar behalten.** Er unterstützt destruktive lokale Edits, kann aber Feedback nicht ohne einen weiteren Join und eine weitere Durability-Beziehung zum Teil des gewöhnlichen Canonical-Log-Exports und der Zustellung machen.

**`feedback/record` für Message-Edits wiederverwenden.** Eine Freitext-Session-Anmerkung identifiziert keine Item-Mutation. Distinkte Events bewahren Message-Identität und Lösch-Semantik; Upload-Policy bleibt consumer-eigen.

**Einen dedizierten Feedback-Uploader oder sofortigen LLM-Request hinzufügen.** Der Opt-in-Log-Beitrag trägt kanonische Events auf eligible Requests. Die bestehende OTel-Pipeline behandelt Explicit-Feedback-Uploads unabhängig für alle Provider, ohne Custom-Feedback-Uploader oder weiteren Modell-Request.

## Konsequenzen

Feedback überlebt gewöhnlichen Log-Export und Replay, ohne Model-Input-Tokens zu verbrauchen oder den KV Cache zu ändern. Das Löschen des aktuellen Items ist keine Löschung des Verlaufs. Der DeepSeek-Request-Beitrag kann finales Feedback lokal lassen, bis ein weiterer eligible Request kommt; OTel sendet einen autorisierten Batch unabhängig unter seiner eigenen Policy. Der Web-Controller bleibt ein unary Remote-Consumer und konsumiert keine Feedback-Log-Events für Cross-Tab-Updates.

[Message-Feedback-Tests](../../../../packages/feedback/message-feedback/tests/message-feedback.spec.ts) decken materielle Events, No-Ops, strikte Versionen, Fork-Isolation und Persistence-Fehler ab. Die [Request-Contribution-Tests](../../../../packages/session/session-log-deepseek/tests) besitzen Suffix-Akzeptanz und Retry; die [Command-Tests](../../../../packages/feedback/command-feedback/tests/command-feedback.spec.ts) pinnen die schlichte Bestätigung.
