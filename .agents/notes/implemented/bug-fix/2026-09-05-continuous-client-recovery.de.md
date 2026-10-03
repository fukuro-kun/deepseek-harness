# Agent Note: Continuous Client connection recovery
[English](2026-09-05-continuous-client-recovery.md) | [中文](2026-09-05-continuous-client-recovery.zh.md) | Deutsch

Status: implemented


## Problem

Eine Generation-Source kann ausstehend bleiben, ohne Readiness oder Carrier-Failure zu melden. Eine Warnung allein lässt den Client unbegrenzt warten. Endliche automatische Retries lassen eine Seite auch dann disconnected zurück, nachdem der Host sich von einem längeren Ausfall erholt hat, obwohl sich der Netzwerkstatus des Browsers nie ändert.

## Decision

[`ConnectionController`](../../../../packages/client/connection/src/client/connection.ts) besitzt sowohl die Readiness-Deadline als auch den kontinuierlichen Retry-Schedule. Ein Handshake meldet einen langsamen Host nach drei Sekunden und bricht standardmäßig nach fünfzehn Sekunden ab. Die Warnung gibt frühes Feedback, ohne einen Host zu verwerfen, der mehrere Sekunden zum Bereitwerden braucht; die Deadline begrenzt jeden Versuch und loggt den Timeout, wenn sie die Generation abbricht. Warn- und Abbruchzeiten sind unabhängig, sodass eine kürzere harte Deadline nicht das Ändern beider Felder erfordert; eine nach dem Settlement eingeplante Warnung wird gecancelt. Die Cancellation erreicht die Generation-Source, die ihre Ressourcen freigeben und settlen muss, bevor eine andere Source startet. Der späte Ready-Callback einer gecancelten Source kann keine Generation etablieren.

Retry-Caps wachsen von 500ms über 1s, 2s, 4s und 8s bis 10s, mit dem bestehenden 50–100%-Jitter. Fehlschläge am maximalen Cap retries weiter. Die Trennung einer maximalen Verzögerung von einem Retry-Count-Limit folgt der Unterscheidung in [Socket.IOs Client-Optionen](https://socket.io/docs/v4/client-options/#reconnectionattempts), während DSH sein bestehendes Remote-Stream-Protokoll und seinen einzelnen Scheduler behält. Gateway ersetzt den physischen Socket einmal pro vom Controller angefordertem Versuch. Sowohl ein ausstehender WebSocket-Kandidat als auch ein offener Socket ohne Opening-Ready-Frame können sich so erholen.

Das Host-Connection-Plugin validiert `recovery` in seiner Konfiguration und injiziert das aufgelöste, nicht geheime Timing über `webserver/index-inject` in jede Seite. Der Client validiert diesen Bootstrap-Input, bevor er Connection bereitstellt; direkte Loop-Optionen können ihn überschreiben. Timer-Werte müssen positive Ganzzahlen innerhalb des Browser-Timer-Bereichs sein, und der Backoff-Faktor muss endlich und mindestens eins sein. Der geteilte Resolver lehnt `NaN` explizit ab, was Bereichsvergleiche allein nicht ausschließen können. Ein Faktor von eins wählt kontinuierliche Fixed-Cap-Retries. Änderungen am Host-Timing gelten für anschließend geladene Seiten.

Der Settings-Indikator labelt aktive Recovery als **Reconnecting** und hält **Reconnect now** verfügbar. Diese Entscheidung ersetzt die terminale Retry-Policy aus [Web connection recovery control](../../archived/feature/2026-08-28-web-connection-recovery-control.md). Jene Note bleibt Eigentümerin von manueller Recovery, Browser-Offline-Suspension, der Single-Scheduler-Regel und der Indikator-Präsentation. Ein frischer `$events`-Ready-Frame allein etabliert Connectivity; Domain-Streams behalten ihre eigene Baseline- und Cursor-Recovery.

## Alternatives considered

**Nur den Readiness-Wait rejecten.** Der Controller wartet weiterhin auf das Settlement der Source, bevor er retried. Die Deadline muss die Source ebenfalls canceln, sonst blockiert dieselbe ausstehende Arbeit die Recovery.

**Jeden Handshake nach drei Sekunden canceln.** Das vermengt Slow-Host-Feedback mit Failure und verwirft wiederholt legitime langsamere Handshakes. Separate konfigurierbare Warn- und Abbruchzeiten bewahren eine begrenzte Chance zum Abschluss.

**Nach einer endlichen Retry-Sequenz stoppen.** Eine Seite kann eine spätere Host-Recovery ohne ein weiteres Benutzer- oder Browser-Ereignis nicht entdecken. Ein Cap auf dem Intervall begrenzt Traffic und bewahrt automatische Recovery.

**Eine andere Source starten, ohne das Cancellation-Cleanup zu awaiten.** Überlappende Generations können Listener behalten und obsolete Events zustellen. Der Cancellation-Vertrag der Source verlangt Settlement; ihn aufzugeben etabliert kein Cleanup.

## Consequences

Lange Ausfälle behalten einen Retry-Schedule und erzeugen Connection-Traffic mit begrenzter Rate bis zur Recovery, explizitem Stop oder Browser-Offline-Suspension. Eine dauerhaft ungültige Credential erfordert weiterhin Benutzeraktion; Connection-Retries erneuern keine Credentials und replayen keine unary Mutations. Sofortige Readiness resettet weiterhin den Backoff, und Browser-Offline bleibt für die Suspension autoritativ; Stable-Connection-Reset-Fenster und Local-Transport-Ausnahmen sind separate Policy-Änderungen.

## Testing

Controller-Tests decken Recovery jenseits der früheren letzten Stufe, Fixed-Cap-Retries, langsame Readiness, Deadline-Cancellation, verzögertes Cleanup, späte Ready-Callbacks sowie manuelles Reconnect oder Stop während eines Handshakes ab. Host- und Client-Tests decken Timing-Propagation, invaliden Input und Injection-Disposal ab. Gateway-Tests nutzen den echten Controller und die Event-Pumpe mit gescripteten WebSockets, um beide hängenden Opening-Phasen, physischen Ersatz und einen Recovery-Reset zu verifizieren. Das Recorded-Session-Web-Lifecycle-Szenario deckt automatische Recovery jenseits des früheren Stopppunkts, manuellen Ersatz eines hängenden Handshakes und lokalisierte Recovery-Präsentation ab.
