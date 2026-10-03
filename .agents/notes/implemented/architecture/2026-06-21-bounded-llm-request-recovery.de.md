# Agent Note: Begrenzte Wiederherstellung vorübergehender LLM-Anfragefehler

Status: implemented

[English](2026-06-21-bounded-llm-request-recovery.md) | [中文](2026-06-21-bounded-llm-request-recovery.zh.md) | Deutsch

Die [pro-provider-Anfrage-Retry-Policy](../../archived/feature/2026-07-24-provider-retry-policies.md) erweitert dieses Fundament um exakte provider-Konfiguration und einen expliziten unbegrenzten mode. Diese note behält die ownership strukturierter failure-facts, der failed-attempt-recovery-Grenze, der transient-defaults des normal mode, sichtbarer einzelner attempts und des durable retry status. [Terminal LLM stream failures](2026-07-29-terminal-llm-stream-failures.de.md) ersetzt seine thrown-error-identity und den stream-sidecar-Mechanismus.

## Problem

Provider-adapter können fehlschlagen, indem sie beim dispatch oder der Iteration werfen, oder indem sie mit `finish { kind: 'error' | 'aborted' }` enden. Die finale adapter-Grenze normalisiert geworfene Werte auf dieses terminale finish-Protokoll, bevor `dsh-agent-loop` sie empfängt; middleware- und result-processing-Defekte bleiben geworfen. Der loop übergibt einen terminalen model-request-Fehler an `agent/request-error`. Ein nicht behandelter Fehler ist terminal; ein ihn behandelter listener repariert den policy-eigenen state, gibt `{ kind: 'retry' }` zurück und stoppt die waterfall-Delegation. Die [retry-action decision](../simplification/2026-07-27-request-error-retry-action.de.md) besitzt diesen Rückgabecode.

Diese Grenze ist bereits sicher für einen weiteren request-attempt. Jeder fehlgeschlagene stream committet einen einzigen log-only `assistant/attempt` mit seinem exakten kompakten stream, die message derivation ignoriert ihn, tool calls werden nur nach einem erfolgreichen terminalen finish und einem assemblierten `assistant/message` dispatched, und ein retry rekonstruiert seinen nächsten attempt aus dem durable surface. Der harness benötigt daher keinen zweiten response-lifecycle oder ein tentative-output-Protokoll, um zwei attempts zu trennen.

Die frühere Grenze ließ drei engere Lücken.

- Provider-Fehler behalten nur eine message und meist einen code. HTTP-Status, retry-delay und provider-request-id werden verworfen oder sind nur über provider-spezifische error-Objekte wiederherstellbar, sodass generische Wiederherstellung ohne Textauswertung keine Entscheidung treffen oder erklären kann.
- Die retry-ownership unterscheidet sich je nach adapter. Der handgeschriebene DeepSeek-adapter unternimmt einen einzigen attempt, während pi-ai-profiles intransparente library-retries aktivieren können. Das Kombinieren verborgener transport-retries mit einem `agent/request-error`-listener würde attempts vervielfachen und Zwischenfehler aus dem session log weglassen.
- Ein wiederhergestellter Fehler hat keine durable status-fact. Der fehlgeschlagene step und chunks bleiben rekonstruierbar, aber ein observer kann nicht feststellen, ob der agent absichtlich zurückweicht, wie lange, oder warum. Ein langes stilles Warten sieht wie ein steckender loop aus.

Die Default-Policy bietet begrenzte Wiederherstellung von vorübergehenden Fehlern derselben expliziten provider/model-Anfrage. Provider- oder model-Failover, response-splicing und semantische output-Reparatur sind andere Probleme und haben keinen aktuellen consumer.

## Entscheidung

### Failure-facts bewahren, ohne policy einzubetten

`@deepseek-ai/dsh-llm` exportiert eine einzelne JSON-serialisierbare `LlmFailure`-payload:

```ts ignore-check
type ProviderRequestId = Branded<'ProviderRequestId'>

interface LlmFailure {
  message: string
  code: string
  status?: number
  providerRetryAfterMs?: number
  requestId?: ProviderRequestId
}
```

`code` bleibt die von `HarnessError` etablierte provider-neutrale machine-routing-taxonomy; die neuen Felder sind Beobachtungen von der provider-Grenze. `ProviderRequestId` wird von `dsh-llm` besessen und konstruiert und serialisiert dann als seine von provider ausgestellte string. Die payload enthält bewusst keine `retryable`-, `failover`-, `partialOutput`-, provider-, model-, phase- oder route-id-Felder. Retryability gehört zur policy, provider/model sind bereits im durable request header, und partial output wird durch den eingebetteten stream des fehlgeschlagenen attempts bewahrt.

`LlmError` trägt `failure: LlmFailure` und erhält `failure.code === error.code`. `FinishReasonMap.error` und `FinishReasonMap.aborted` tragen dieselbe payload statt paralleler failure-shapes. Die finale adapter-Grenze löst diese facts von adapter-geworfenen Werten und emittiert das passende terminale finish; unbekannte SDK-Ausnahmen erhalten eine `UNKNOWN`-payload. Exakte geworfene Objekt-identity überschreitet die LLM-stream-seam nicht.

Der agent loop übergibt die `LlmFailure` des terminalen finishes an `agent/request-error` und verwendet dieselbe payload, wenn er einen nicht wiederhergestellten `turn/end.reason` aufzeichnet.

Adapter extrahieren strukturierte facts, bevor sie auf message-Inspektion zurückfallen. Sie validieren HTTP-Status, parsen `Retry-After`-Sekunden oder -daten in eine positive endliche Millisekunden-Verzögerung, branden die provider-request-id, wenn sie offengelegt wird, und unterscheiden ihren eigenen timeout vom caller-abort. Provider-spezifische codes und messages können ein Mapping verfeinern, aber kein recovery-listener parst sie.

Die geteilte transient-code-Menge ist bewusst klein: adapter-Mappings für `RATE_LIMIT` und `SERVER`, explizite `TIMEOUT`- und `TRANSPORT`-codes für Remote-Fehler und `EMPTY_RESPONSE` für eine abgeschlossene provider-Antwort ohne content blocks. Beide adapter klassifizieren den letzten Fall als error finish; siehe [leere model-Antworten sind retrybar](../../archived/bug-fix/2026-07-24-empty-model-response-is-retryable.md). Authentifizierung, Quota, ungültige Anfrage, Kontextüberlauf, Protokoll, Abbruch und unbekannte Fehler behalten unterschiedliche stabile codes und sind nicht standardmäßig transient. Das Hinzufügen eines codes erfordert adapter-fixtures und eine dokumentierte policy-Entscheidung; es erfordert keine Erweiterung einer zweiten failure-class-enum.

### Retry-policy an der bestehenden failed-step-Erweiterungspunkt

`@deepseek-ai/dsh-llm-retry` ist ein function plugin, das auf `agent/request-error` lauscht. Es führt keinen service oder neuen loop-ast ein; das agent-loop-paket ändert nur die Daten, die durch seine bestehende failed-step-recovery-Steuerfluss getragen werden.

Die `agent/request-error`-waterfall trägt die aktuelle `LlmFailure`, eine unveränderliche Liste vorheriger Fehler, die retries in der aufeinanderfolgenden recovery-Sequenz autorisierten, und die unveränderliche retry-policy der serving-Registrierung. Der loop transportiert, aber interpretiert diese policy nicht, besitzt die aufeinanderfolgende Fehlerhistorie und räumt sie nach einer erfolgreichen model-Anfrage auf. Die normal-Policy von `dsh-llm-retry` zählt durable retry-records, die von derselben exakten provider-policy geplant wurden, während `dsh-compaction-basic` sein eigenes context-overflow-Budget verwaltet. Abwechselnde transient- und context-overflow-Fehler verbrauchen daher ihre jeweils eigenen endlichen Budgets unabhängig voneinander; die maximale Anzahl an Anfragen beträgt eins plus die Summe der geladenen endlichen Budgets.

Die [llm-retry README](../../../../packages/llm/llm-retry/README.de.md) dokumentiert die aktuelle Konfigurationsform. Provider-adapter registrieren ihre verschachtelte `retryPolicy`; Auslassung verwendet normale Standardwerte: zwei transient-retries, eine Anfangsverzögerung von 500 Millisekunden, eine Verzögerungsobergrenze von 10 Sekunden, 10 Prozent jitter und die oben genannten fünf transient-codes. Die Grenzen für Anzahl und Verzögerung entsprechen der konservativen Kante der untersuchten Implementierungen: [OpenCode verwendet zwei request-retries mit 500 ms/10 s-Grenzen](https://github.com/anomalyco/opencode/blob/9976269ab1accfc9f9dc98a4a688c516934de422/%70ackages/llm/src/route/executor.ts#L36-L39), [Pi trennt drei agent-Level-retries von provider-retries und standardisiert provider-retries auf null](https://github.com/earendil-works/pi/blob/3da591ab74ab9ab407e72ed882600b2c851fae21/%70ackages/coding-agent/docs/settings.md#L139-L147), und [Codex verwendet endliche request/stream-Budgets plus einen fünfstündigen idle-timeout](https://github.com/openai/codex/blob/0fb559f0f6e231a88ac02ea002d3ecd248e2b515/codex-rs/model-provider-info/src/lib.rs#L25-L33). Zehn Prozent folgt [Codex' begrenztem jitter](https://github.com/openai/codex/blob/0fb559f0f6e231a88ac02ea002d3ecd248e2b515/codex-rs/codex-client/src/retry.rs#L40-L47).

Für einen qualifizierten Fehler mit übrigem Budget verwendet die einsbasierte transient-retry-Anzahl begrenztes exponentielles Backoff. Ein gültiger `providerRetryAfterMs` ersetzt das exponentielle Backoff nur, wenn er `maxDelayMs` nicht überschreitet; eine längere provider-Verzögerung führt zu Delegation statt zu einem früheren retry, der die provider-Anweisung verletzt. Lokales Backoff multipliziert mit einem injizierten Zufallsfaktor in `[1 - jitterRatio, 1 + jitterRatio]` und clampet den Endwert auf `maxDelayMs`; provider-Verzögerung wird nicht jittert.

Das plugin besitzt einen lebenslangen `AbortController` und verfolgt jeden aktiven recovery-callback, einschließlich delegierter waterfall-Arbeit und Backoff. Effect-cleanup registriert zuerst den listener ab, bricht dann die aktiven callbacks ab und wartet sie ab; abort gewinnt über eine verspätete delegierte retry-Entscheidung, und ein erfasster callback kann weder retryen noch den Rest seiner waterfall nach disposal betreten. Dies macht HMR-disposal quiescent, obwohl Cordis den listener bereits erfasst hat.

Bevor es schläft, hängt `dsh-llm-retry` ein einzelnes nicht-surface `llm/retry`-session-event an, das den turn, den fehlgeschlagenen step, den provider, den policy-mode, den vollständigen aufgelösten policy-key, die provider-policy-retry-Nummer, die modus-spezifische endliche Obergrenze (falls vorhanden), die geplante Verzögerung und die `LlmFailure` enthält. Der key sortiert die code-Menge und trennt retry-Historien, wenn eine provider-route durch eine verhaltensunterschiedliche gleichmodus-policy ersetzt wird. Das plugin besitzt die `SessionEventMap`-Erweiterung und exportiert die payload über seinen browser-sicheren `./types`-Subpfad; `dsh-session` bleibt generische persistence und absorbiert nicht die Vokabular der optionalen policy. Das event sagt, was geplant wurde, nicht dass die nächste Anfrage abgeschlossen wurde; Abbruch während der Verzögerung ist anschließend auf `turn/end` sichtbar. Das event wird zusammen mit Produktions-renderern und replay/snapshot-Abdeckung ausgeliefert, da sein Zweck operativer state und nicht Trace-Sammlung ist.

Der listener ruft für einen nicht-transienten code, ein erschöpftes policy-Budget oder eine über die Obergrenze hinausgehende provider-Verzögerung `next()` auf. Dies erhält die Komposition mit context-overflow-recovery und späteren policy-plugins. Für einen besessenen Fehler zeichnet er die Verzögerung auf und wartet sie ab, gibt dann `{ kind: 'retry' }` zurück, ohne zu delegieren. Turn-abbruch und plugin-disposal beenden das Warten, ohne einen retry zurückzugeben; die Abbruch-/disposal-Checks des loops bleiben autoritativ.

Die `dsh-base`- und `dsh-sdk-minimal`-Patches laden das plugin als explizite Zeile, sodass base-gestützte profiles und das standalone-SDK-Profil dieselbe provider-geroutete policy verwenden. Library-consumer behalten explizite plugin-Komposition bei: Das Auslassen des plugins lässt anfragefehler terminal.

### Eine Schicht sichtbare attempts besitzen lassen

Adapter führen pro `stream()`-Aufruf einen einzigen provider-request aus. Der pi-ai-adapter entfernt die öffentlichen `maxRetries`- und `maxRetryDelayMs`-profile-Felder und deaktiviert library-retries; der handgeschriebene adapter behält sein aktuelles Single-attempt-Verhalten. Dies verhindert, dass ein SDK-Budget das agent-Budget vervielfacht, und stellt sicher, dass jeder transient-retry durch seinen aufgezeichneten fehlgeschlagenen attempt plus `llm/retry` repräsentiert wird.

`ctx.llm.stream()` bleibt die rohe Single-attempt-waterfall. Direkte caller wie compaction-Zusammenfassung erhalten die strukturierte failure, erhalten aber keinen automatischen retry, da sie keine agent-step-Grenze oder allgemeinen durable Ort haben, um attempts zu trennen. Ein zukünftiger direct-call-consumer kann einen puffenden Helper rechtfertigen, der nur vor der Emission eines chunks retryt; diese Entscheidung fügt keinen solchen Helper hinzu.

### Stehende streams begrenzen, wo sie gestoppt werden können

Jeder adapter exponiert ein validiertes `streamIdleTimeoutMs`-Konfigurationsfeld mit dem oben zitierten fünfminütigen prior-art-Standard. Das Intervall ist auf die maximale Node-Timer-Verzögerung begrenzt, sodass es nicht auf eine Millisekunde geklemmt werden kann. Es deckt jedes offene iterator `next()` von der Nachfrage bis zur adapter-erkannten provider-Aktivität ab; die Zeit, die ein consumer zwischen `next()`-Aufrufen verbringt, ist keine provider-idle-Zeit. DeepSeek SSE-Kommentare zählen als transport-Aktivität, werden aber nie zu `StreamChunk`-Werten oder session-log-events.

`@deepseek-ai/dsh-timeout` exponiert ein neu armbares idle-watchdog-Primitiv. Ein stabiler lokaler `AbortController` wird mit dem caller-signal fusioniert und für den gesamten adapter-Aufruf an den transport übergeben; jedes offene `next()` armed das watchdog, Auflösung disarmt es, und die nächste Nachfrage armed es neu. Transport-Aktivität außerhalb der Bänder ruft `pulse()` auf, um eine offene Nachfrage neu zu armieren, ohne einen Wert zu liefern. Timeout bricht diesen stabilen controller mit einem capability-eigenen `TimeoutReason` ab, und `finally` räumt den timer auf. Der adapter klassifiziert sein watchdog als `TIMEOUT` und einen früheren upstream-abort als `ABORTED`. Die bestehende Einweg-`deadline()` wird nicht als gleitender timer präsentiert.

Grenztests beweisen Terminierung an beiden tatsächlichen transports. Der handgeschriebene adapter bricht seinen fetch/reader ab, und der pi-ai-adapter mappt das stabile signal durch das SDK und beweist, dass das SDK die Antwort schließt. Ein timer, der lediglich ein consumer-promise verwirft, während die Anfrage weiterläuft, erfüllt den contract nicht.

### Attempts im bestehenden Log getrennt halten

Ein fehlgeschlagener attempt hängt `assistant/attempt` mit seinem eingebetteten stream an, hängt aber nie ein surface `assistant/message` an und dispatcht kein tool. Ein retry setzt innerhalb des fehlerhaften turns und steps fort, rekonstruiert die Anfrage aus dem durable surface und erzeugt seine eigene settlement; nur das finale Ergebnis schließt den turn. UIs können transient `assistant/live-chunk`-Updates rendern, während ein step offen ist, und dann den fehlgeschlagenen attempt settle lassen, wenn `llm/retry` ihn identifiziert oder `turn/end` den Fehler aufzeichnet. Web validiert den vollständigen retry-payload-contract, projiziert jede producer-korrelierte `retryId`-Kette in eine einzige stabile Zeile, die auf den neuesten attempt aktualisiert wird, und leitet geplanten, gestarteten oder abgebrochenen Status aus `llm/retry-started` und den Abschluss der owning turn- und step-Grenzen ab. Seines Countdown verankert die geplante Verzögerung am Browser-Empfang statt an der Host-event-Uhr, verwendet nach oben gerundete Sekunden mit einer Sekunde als Untergrenze, animiert nur, während ungelöst, und behält exakte letzte Fehlerdetails zusammengeklappt hinter der Zeile. Retry-Knoten verankern ihren eigenen trajectory-turn, selbst wenn der fehlgeschlagene attempt keinen surface-Assistant-Knoten hat. Message derivation ignoriert `assistant/attempt`, und Web wendet während des History-rebuild dasselbe Projektion an, sodass ein Refresh fehlgeschlagene Partialitäten nicht in die model-Historie befördern oder retry-Zeilen duplizieren kann.

Wenn die Wiederherstellung erschöpft ist, wird der finale Fehler einmal in `turn/end.reason` mit den strukturierten facts gespeichert. Web leitet an dieser Sequenzposition einen `turn-error`-Knoten ab und rendert seine anzeigesichere message und den optionalen code inline; AUTH-Projektionen ersetzen provider-Texte, die Credential-Fragmente wiederholen können, durch `API key is invalid`, während die rohe Diagnose im session log bleibt. Dieselbe Faltung läuft für live-events und history-replay. Während die transient-Wiederherstellung andauert, ist `llm/retry` der durable Ort für jeden Zwischenfehler und jede Verzögerung; die terminale Zeile existiert nur, wenn `turn/end` den Fehler aufzeichnet, und da erschöpfte Wiederherstellung den fehlerhaften turn teilt, unterdrückt die retry-Historie des turns diese Zeile nie — die gesettelte retry-Kette und der terminale Fehler werden nebeneinander gerendert. Es wird kein eigenständiges final-error-event oder response-id-Vokabular hinzugefügt.

## Außerhalb des Scopes

- Automatisches provider- oder model-Failover. Anfragen wählen bereits einen expliziten provider und model, und das provider-registry besitzt bewusst einen einzigen adapter-owner pro provider.
- Retry oder Fortsetzen nach einem erfolgreichen terminalen finish, oder Splicing von chunks aus zwei attempts in eine einzige assistant-message.
- Reparatur von fehlerhaften tool-Argumenten, Verweigerungen, Inhaltsfiltern oder anderer semantischer model-Output.
- Circuit Breaker, geteilter provider-Health oder cross-agent-retry-Budgets.
- Umwandeln von `llm/stream` in einen response-lifecycle oder Hinzufügen von Komfort-generation-APIs ohne Produktions-consumer.

## In Betracht gezogene Alternativen

- **Retry innerhalb von `llm/stream` oder dem provider-SDK** — abgelehnt, da ein roher stream nach der Emission von chunks keine durable attempt-Grenze hat, verborgene SDK-retries Budgets vervielfachen und kein Pfad jeden fehlgeschlagenen attempt konsistent aufzeichnen kann.
- **Response start, interrupted, discarded, failed und committed events zu `dsh-llm` hinzufügen** — abgelehnt, da das agent-Log bereits rohe chunks, erfolgreiche messages und nummerierte attempts trennt. Eine zweite State-Maschine würde ownership duplizieren, ohne den begrenzten gleichroutigen retry zu ermöglichen.
- **Logische routes, capability-Matrizen und Failover-Auswahl hinzufügen** — abgelehnt, da aktuelle Anfragen bereits provider und model explizit benennen, ein adapter jeden provider besitzt und kein aktueller consumer automatisches Fallback erfordert oder semantische Kompatibilität nachweisen kann.
- **`retryable` oder `failover` auf `LlmFailure` setzen** — abgelehnt, da adapter facts melden, während die Deployment-policy die Aktion entscheidet. Derselbe 429 kann in einem interaktiven bundle retryt und in einem kostenbegrenzten batch verworfen werden.
- **Für immer retryen, während der caller aktiv bleibt** — die [pro-provider-policy](../../archived/feature/2026-07-24-provider-retry-policies.md) ersetzt diese Ablehnung für explizite `always`-Einträge, während begrenzter normal mode als Standard beibehalten wird.
- **Retry-Status nur über den Prozess-logger aufzeichnen** — abgelehnt, da Prozess-Logs das session-Verhalten nicht rekonstruieren und keinen replayten UI-state antreiben können.
- **Nur flache codes behalten** — abgelehnt, da retry-delay und provider-request-id strukturierte provider-facts sind und HTTP-Status für die Diagnose erforderlich ist, wenn verschiedene wire-Fehler einen einzigen stabilen code teilen.

## Verifikation

- `LlmFailure` ist die einzige serialisierbare payload für adapter-würfe, error finishes und abgebrochene finishes; Normalisierung erhält stabilen code, status, retry-delay, gebrandeten provider-request-id und die Klassifizierung von caller-abort gegenüber adapter-timeout, wo verfügbar.
- Adapter-würfe werden zu terminalen failure-chunks, bevor sie consumer erreichen; middleware- und consumer-Ausnahmen bleiben außerhalb der model-request-Wiederherstellung geworfen.
- DeepSeek- und pi-ai-adapter-Tests decken repräsentative 400, 401/403, 429, 5xx, Verbindungs-, fehlerhafte/abgeschnittene stream-, Timeout-, Abbruch-, retry-after-Sekunden/-Datum-, request-id- und unbekannte-SDK-error-Pfade ab, ohne dass die recovery-policy den message-Text parst.
- Pi-ai pinnt die SDK-Option auf null retries und führt einen beobachteten wire-attempt für eine retrybare provider-Antwort aus; separate Tests lassen das Entfernen einer der Grenzen fehlschlagen.
- `agent/request-error` trägt aktuelle failure-facts, unveränderliche vorherige retryte failure-facts und die unveränderliche retry-policy der serving-Registrierung; ein Erfolg räumt die Historie auf, und abwechselnde transient/context-overflow-Integrationstests beweisen, dass die beiden policies nur ihre eigenen endlichen Budgets verbrauchen.
- Jeder provider-adapter validiert seine verschachtelte retry-policy beim Loader-Start, und `ctx.llm` erfasst sie mit der route; normal mode delegiert unqualifizierte Pfade und stellt höchstens `maxRetries + 1` provider-Anfragen, wenn keine andere policy gilt.
- HMR-während-Backoff-Tests beweisen, dass disposal den listener abmeldet, seine erfassten callbacks abbricht und wartet, nach disposal keine retry-Entscheidung emittiert und keinen timer oder promise am Leben lässt.
- Reine Unit-Tests decken transient-code-Auswahl, exponentielles Backoff und jitter-Grenzen, gültige und über die Obergrenze hinausgehende `Retry-After`, erschöpfte Budgets, deterministische timer/random-Hooks und Abbruch während Backoff ab.
- Echte agent-loop-Tests decken Fehler vor chunks, Partial-Chunks dann Fehler, geworfene und in-band-Fehler, retry bis zum Erfolg innerhalb desselben turns, Erschöpfung bis zu strukturiertem `turn/end.reason` und Komposition mit `dsh-compaction-basic` context-overflow-recovery ab.
- Der Partial-chunk-Integrationstest beweist, dass fehlgeschlagene chunks dem fehlgeschlagenen step zugeordnet bleiben, dass für diesen step keine assistant-message oder tool-Nebenwirkung committet wird und dass der erfolgreiche retry seine eigenen chunk-seqs und provider/model-route aufzeichnet.
- Das plugin-eigene `llm/retry`-event ist nicht-surface, überlebt einen JSONL-Roundtrip, wird von der message derivation ignoriert und steuert TUI- und Web-Rücknahme plus geplante-retry-Renderung. Client-Tests decken vollständige wire-Validierung, uhr-unabhängigen Countdown, Abbruch- gegenüber abgeschlossenen-retry-Labels und trajectory-Zuordnung ab; keyless-UI-Snapshots decken Web-Planung und -Erfolg ab, echte Web-Kompositionstests decken Partial-Transport-Fehler bis zur Wiederherstellung und den terminalen Fehlerzeile der erschöpften Wiederherstellung neben der gesettelten retry-Kette ab, und ACP-Automatisierungs-Snapshots bestätigen, dass ein verworfener attempt draussen bleibt, während die wiederhergestellte Antwort emittiert wird.
- Idle-watchdog-Tests beweisen, dass das stabile signal nur neu armed wird, während `next()` offen ist, während consumer-Denkzeit und in `finally` disarmt wird und separat von einer Gesamt-aufruf-deadline und einem früheren caller-abort klassifiziert wird; adapter-Tests beweisen, dass das signal die zugrunde liegende Anfrage stoppt, statt sie lediglich zu trennen.
- Direkte `ctx.llm.stream()`-caller bleiben Single-attempt und erhalten dieselben strukturierten failure-facts.

## Konsequenzen

- Jeder retry-attempt ist innerhalb seines owning turns als die chunks des fehlgeschlagenen attempts plus `llm/retry` sichtbar, und das adapter-Level-Single-attempt-Verhalten verhindert, dass verborgene SDK-retries policy-Entscheidungen vervielfachen. Ein retry kann die provider-Abrechnung duplizieren, selbst wenn kein chunk angekommen ist; normal mode begrenzt dieses Risiko, während expliziter always mode es bis zum Abbruch oder Erfolg akzeptiert.
- Provider-SDKs können Status- oder retry-Header verbergen. Diese adapter behalten die stabilen facts, die sie offenlegen, und verwenden andernfalls einen groben code, anstatt die recovery-policy zerbrechlichen Text parsen zu lassen.
- Durable retry-events erweitern das session-Protokoll und die UI-State-Maschine. Die Lieferung des events und seines consumers gemeinsam verhindert ein ungenutztes Telemetrie-Vokabular, aber spätere Schemaänderungen erfordern weiterhin persistence- und replay-Arbeit.
- Das Räumen der live-chunks eines fehlgeschlagenen steps kann sichtbar output zurückziehen. Das ist vorzuziehen, verworfenen Text oder partial tool-JSON als committete Historie darzustellen, und Snapshots fixieren den Übergang.
- Adapter-lokale idle-Durchsetzung stoppt steckende transports, ohne consumer-Denkzeit zu zählen. Contract-Tests an jeder transport-Grenze bewahren vor SDK-Drift.
- Mehrere normal-recovery-plugins addieren ihre endlichen Budgets. Always mode delegiert zuerst und liefert dann einen unbegrenzten fallback; überlappende Klassifizierer bleiben registration-order-policy und müssen von den plugins, die sie einführen, dokumentiert und getestet werden.

## Verwandt

- [Strukturierte Fehler-Taxonomie](../../archived/architecture/2026-06-11-structured-error-taxonomy.md) besitzt stabile machine-routable codes und cause-chaining.
- [Rekonstruierbare Anfragen](../../implemented/architecture/2026-07-05-reconstructable-requests.de.md) macht provider/model und vollständige request-Inputs vor dem dispatch durable.
- [Timeout-deadline-Bibliothek](../../implemented/architecture/2026-07-06-timeout-deadline-library.de.md) trennt geteilte deadline-Klassifizierung von capability-eigener Terminierung.
- [After-call-compaction-Druck und Kontextüberlauf-Wiederherstellung](../../implemented/architecture/2026-07-10-after-call-compaction-pressure-and-overflow-recovery.de.md) besitzt den aktuellen closed-step-request-recovery-Erweiterungspunkt und begrenzten overflow-retry.
- [Provider-geroutete LLM-adapter](../../implemented/architecture/2026-07-14-provider-routed-llm-adapters.de.md) besitzt explizite provider/model-Routing und die Invariante eines adapters pro provider.
- [Terminal turn errors survive same-turn retry history](../../archived/bug-fix/2026-08-20-turn-error-survives-same-turn-retry-history.md) besitzt die Entfernung der Web-retry-history-Unterdrückung, die die terminale Fehlerzeile der erschöpften Wiederherstellung versteckte.
