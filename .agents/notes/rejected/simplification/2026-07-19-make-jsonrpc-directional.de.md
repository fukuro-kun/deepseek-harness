# Agent Note: JSON-RPC-Abschluss und Transport richtungsbezogen machen

Status: rejected — session/prompt became an enqueue receipt without status (2026-07-30-followup-enqueue-and-owned-runs); transport narrowing may be re-proposed alone

[English](2026-07-19-make-jsonrpc-directional.md) | [中文](2026-07-19-make-jsonrpc-directional.zh.md) | Deutsch

## Problem

Die JSON-RPC-Bridge modelliert beide Endpunkte als symmetrische Peers, obwohl das ausgelieferte Protokoll gerichtet ist. Der gemeinsame Transport (jetzt `dsh-sdk-protocol`, genutzt vom Server und vom TypeScript-SDK-Client, der die Richtung Outbound-Request/Inbound-Notification ausübt) implementiert weiterhin zwei Hälften, die kein Endpunkt nutzt: server-originierte Requests und client-originierte Notifications. Das Python-SDK sendet Requests und empfängt Responses oder Notifications, reiht aber zugleich ungenutzte eingehende Server-Requests in eine Queue ein und exponiert Response-Helfer.

`session/prompt` meldet eine abgerechnete Turn außerdem über zwei Protokollformen. Der Server sendet `session.finished` und gibt danach die Konstante `{ accepted: true }` zurück; das Python-SDK verwirft diese Response und wartet auf die Notification, um den Status zu rekonstruieren. Da die Response erst nach Rückkehr des Handlers geschrieben wird, geht die Notification auf demselben Stream zwangsläufig der konstanten Response voraus.

Die ungenutzten Hälften bringen Pending-Request-Maps, generierte IDs, Request-Queues, Ablehnungspfade beim Schließen, Response-Helfer und einen zweiten Abschluss-Warter mit, ohne einem Produktionsaufrufer zu dienen.

## Vorschlag

Jeden Endpunkt auf seine tatsächliche Rolle spezialisieren. Der Server behält eingehende Requests sowie ausgehende Responses und Notifications; die TypeScript- und Python-Clients behalten ausgehende Requests sowie eingehende Responses oder Notifications. Die Richtung löschen, die kein Endpunkt nutzt — server-originierte Requests und client-originierte Notifications.

Das abgerechnete Ergebnis aus `session/prompt` nach `agent.whenIdle()` direkt als `{ status, reason }` zurückgeben. `session.finished`, die konstante Acceptance-Response und die Python-Completion-Schleife nach der Response löschen. `session.event` und Subagent-Notifications streamen weiter vor der Response, und dauerhafte Session-Events bleiben die Quelle für die Rekonstruktion der finalen Response.

## Umsetzungsplan

1. In `packages/sdk/server/src/server.ts` `SessionPromptResult.accepted` durch `status: 'ok' | 'error' | 'aborted'` und den erfassten `TurnEndReason` ersetzen. `HarnessSdkJsonRpcServer.prompt()` bildet `completed` auf `ok`, `aborted` auf `aborted` und jeden anderen aktuellen oder merge-erweiterbaren Reason auf `error` ab; Idle ohne `turn/end` bleibt ein Invariantenfehler. Nur `session.finished` entfernen; `session.event`, `subagent.started` und `subagent.finished` bleiben unverändert.
2. In `packages/sdk/protocol/src/transport.ts` die gemeinsame Klasse auf die Richtungen mit Consumer verengen — Inbound-Requests/Outbound-Responses (Server) und Outbound-Requests/Inbound-Responses plus Inbound-Notifications (TypeScript-SDK-Client) —, wobei nur server-originierte `request()`-Nutzung und client-originierte Notification-Dispatch entfernt werden, oder die Klasse in einen server- und einen clientseitigen Transport aufteilen. Request-Result-, Method-Not-Found- und Handler-Error-Responses behalten ihr bisheriges Verhalten und bleiben hinter den vom erwarteten Handler emittierten Notifications angeordnet.
3. In `python/sdk/src/deepseek_harness/client.py`, `models.py` und `__init__.py` `IncomingRequest`, `_requests`, `notify()`, `next_request()`, `respond()` und `respond_error()` entfernen. Eine öffentliche validierte `SessionPromptResponse` hinzufügen, die Status und Reason trägt, sie aus `session_prompt()` zurückgeben und einen expliziten Reader-Guard behalten, der unerwartete Server-Request-Frames ignoriert, statt sie mit einem Response-Warter zu verheiraten.
4. In `python/sdk/src/deepseek_harness/api.py` `TurnResult.status` und ein neues `TurnResult.reason` aus `SessionPromptResponse` aufbauen, danach den `session.finished`-Zweig und die zweite Completion-Schleife löschen. Die Subscription während des Requests offen halten und den abschließenden Notification-Drain von `_request_raw()` bewahren, damit das letzte `turn/end`-Event und jede vor der Response geschriebene Subagent-Notification gesammelt werden, bevor `Session.run()` die finale Assistant-Message rekonstruiert.
5. Die symmetrischen Transport-Paar-Fälle in `packages/sdk/protocol/tests/transport.spec.ts` durch richtungsbezogene Abdeckung ersetzen und `server.spec.ts`, `plugin-apply.spec.ts` und `built-scope-carrier.e2e.ts` für direkte Ergebnisse, Reihenfolge, Überlappung, Shutdown und das verengte Fake aktualisieren; den TypeScript-SDK-Client (`packages/sdk/client`) und seine Suiten auf response-basierte Abrechnung umstellen. `python/sdk/tests/test_client.py` für response-basierte Abrechnung, Unerwartete-Request-Frame-Behandlung, Callback- und Nebenläufigkeitsverhalten sowie die entfernten öffentlichen Helfer aktualisieren. Die JSON-RPC- und die zweisprachigen Python-SDK-READMEs, Export-JSDoc und -Deklarationen, `scripts/smoke-python-runtime.py` und den Python-Single-Executable-Snapshot aktualisieren.

## In Betracht gezogene Alternativen

**Einen generischen symmetrischen JSON-RPC-Peer für künftige Methoden behalten.** Server-initiierte Requests könnten irgendwann interaktive Permissions tragen, doch es gibt weder eine getypte Methode noch einen Produktions-Consumer. Das Pre-Release-Protokoll kann die kleinste benötigte Richtung hinzufügen, sobald dieses Feature entworfen ist, statt einen ungenutzten Peer im ausgelieferten Protokoll mitzuführen.

**`session.finished` für Streaming-Clients behalten.** Turn-Abrechnung ist keine inkrementelle Information: Die Request-Response markiert bereits dieselbe Grenze und folgt auf dem geordneten Stream allen früheren Notifications. Eine zweite terminale Notification erzeugt zwei Darstellungen, die Clients miteinander abgleichen müssen.

## Akzeptanzkriterien

- Der TypeScript-Endpunkt kann weder Requests originieren noch Notifications konsumieren.
- Der Python-Endpunkt kann weder Notifications originieren noch Server-Requests konsumieren.
- `session/prompt` liefert nach der Turn-Abrechnung das maßgebliche Ergebnis `ok`, `error` oder `aborted` samt Reason.
- Während der Turn emittierte Session-Events und Subagent-Lifecycle-Notifications treffen vor der Response ein.
- Overlap-Ablehnung derselben Session, Framing, Multibyte-Input, Handler-Fehler, Flush, Shutdown-Reihenfolge und finale Response-Rekonstruktion behalten ihr Verhalten.
- TypeScript-Bridge-Tests, Python-SDK-Tests, gebaute JSON-RPC-Abdeckung, Snapshots und generierte API-Dokumentation bestehen.

## Risiken

Dies verengt bewusst das Pre-Release-Wire-Format. Rohclients, die nur auf `session.finished` hören, oder Embedder, die die ungenutzten symmetrischen Transportmethoden verwenden, müssen auf die Prompt-Response umstellen. Ein künftiger server-initiierter Request erfordert einen neuen getypten Protokollzusatz statt der Wiederverwendung generischer, ruhender Maschinerie.
