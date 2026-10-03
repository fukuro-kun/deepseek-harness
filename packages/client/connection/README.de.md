---
description: "Browser-Host-Übertragungsschicht für die Web-GUI: Remote-RPC, Event-Stream-Zustellung mit Reconnect, exakte Fetch-Routen, die /api-HTTP-Bridge und die Browser-Vertrauensgrenze."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-connection
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Das Paket trägt Browser-zu-Host-Remote-Aufrufe, exakte Fetch-Antworten und Connection-Generations. Das Client-Plugin mountet `ctx.connection` mit dem Loopback-Status der aktuellen Seite, generischem RPC, der aktiven Generation samt ihren Host-Fakten, dem beobachtbaren Recovery-Status, einem sofortigen Reconnect-Befehl und dem Registrierungspunkt für genau eine Generation-Quelle. Eine Generation wird sichtbar, sobald ihre Quelle ready meldet; Abschluss, Fehlschlag, Rückzug der Quelle oder ein explizites Stop räumen sie auf, bevor `ConnectionController` seine Retry-Policy anwendet.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Browser-Authentifizierung und Request-Vertrauen](#browser-authentication-and-request-trust)
- [Connection-Generation](#connection-generation)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Hinweis für Entwickler](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Der Browser nutzt HTTP POST für unäre Remote-Aufrufe. API Gateway besitzt den `/api/remote.mux`-WebSocket und seine logischen Streams; von der Shell gehaltene Compositions stellen gleichwertige Remote-Streams über `connection.rpc.open` bereit, ohne einen WebSocket zu öffnen. Die Host-Hälfte stellt stets die carrier-neutrale RPC-Registry sowie die exakten `GET`-/`HEAD`-/`POST`-Routen-Registries bereit. Ist ein Web-Carrier vorhanden, besitzt er zusätzlich die einzige `/api`-Route, die Fetch-Bridge, die Browser-Authentifizierung und die Host-/Origin-Prüfungen; ein von der Shell gehaltener Carrier dispatchet den gemeinsamen Fetch-Handler direkt. Jede exakte Route deklariert gepuffertes oder gestreamtes Request-Body-Handling, bevor die Bridge irgendwelche Bytes liest. Typert Gateway beansprucht generierte Remote-Endpunkte, Feature-Pakete registrieren Nicht-JSON-Antworten wie Session-Log-Downloads und Roh-Datei-Uploads, und nicht beanspruchte Requests liefern 404. Die Loopback-Hostname-Klassifizierung bleibt paketintern beim browserseitigen Client-Status. Die Roh-Body-Übertragung des Browsers stellt [`dsh-client-file-upload`](../file-upload/README.de.md) bereit.

-----

<a id="browser-authentication-and-request-trust"></a>
## Browser-Authentifizierung und Request-Vertrauen

Jede Host-RPC-Methode und jeder WebSocket-Stream erfordert genau eine Browser-Session; es gibt keine methodenspezifische Loopback-Stufe. Jeder Prozess prägt ein zufälliges Launch-Token. `dsh-web-app` gibt die gewöhnliche Root-URL mit `?token=...` aus und öffnet sie; `frontend-static` delegiert Root- und Index-Requests an `ctx.connection.authorizeIndex`, das dieses Token nur bei `GET /` akzeptiert, ein an die Authority gebundenes signiertes Cookie schreibt und auf das saubere `/` umleitet. Ein fehlendes, abgelaufenes, fehlerhaftes oder an die falsche Authority gebundenes Cookie liefert 401, noch vor dem RPC-Dispatch. Statische Assets bleiben öffentlich. Der HTTP-Carrier akzeptiert außerhalb des Root-Austauschs kein Query-Token und kein Token im Authorization-Header.

Das Cookie-Signaturgeheimnis ist der owner-scoped Grant-Record `client-connection/browser-session` in `ctx.credentials`. Der lokale Provider persistiert ihn in `$DSH_HOME/.credentials.yaml`; `BrowserAuth` lädt oder erzeugt den Record während der Connection-Aktivierung und hält das Secret im Speicher, sodass die Request-Authentifizierung synchron läuft. Löschen oder Ersetzen des Records greift bei der nächsten Connection-Aktivierung. Cookies tragen ein absolutes Ausstellungs-/Ablaufintervall, über `cookieMaxAgeDays` standardmäßig 30 Tage, und binden normalisierten Hostnamen plus Port sowohl in ihrem deterministischen Namen als auch im signierten Payload. Sie sind host-only, `Path=/`, `HttpOnly` und `SameSite=Strict`; sie lassen `Secure` bewusst weg, weil der ausgelieferte Server Loopback-HTTP nutzt.

Vor der Authentifizierung durchläuft jeder Request `src/api-request-trust.ts`. Sein `Host` muss Loopback sein oder auf einen `trustedHosts`-Eintrag passen: exakt bei `host:port`, beliebiger Port bei portlosen Einträgen, beide Seiten WHATWG-normalisiert. Ein angehängter `Origin` muss diesem Host gleichen, und `sec-fetch-site: cross-site` wird abgelehnt. Fehlerhafte konfigurierte Authorities lassen den Plugin-Load scheitern. Diese Prüfungen wehren DNS-Rebinding und siteübergreifende Browser-Requests ab; sie begründen niemals Identität. Eine fehlgeschlagene Host-/Origin-Prüfung liefert 403, ein vertrauenswürdiger, aber nicht authentifizierter Request 401. `dsh web --host 0.0.0.0` wird weiterhin nicht unterstützt. Entscheidungsdokumente: [Browser-Request-Vertrauen](../../../.agents/notes/implemented/architecture/2026-07-28-api-browser-trust-boundary.de.md) und [Browser-Token-Authentifizierung](../../../.agents/notes/implemented/architecture/2026-08-24-browser-token-authentication.de.md).

<a id="connection-generation"></a>
## Connection-Generation

API Gateway Client registriert den internen logischen Stream `$events` als einzige Generation-Quelle, unabhängig davon, ob irgendein `$on`-Listener existiert. Der Host hängt alle inkrementellen Listener in der API-Remotes-Source-Factory an und sendet dann vor den Events genau ein Item `{ type: 'ready', clientId, host: { home } }`. `ConnectionController` publiziert diese Generation und ruft `onConnected` erst nach dem Eintreffen des Ready-Items, sodass die Baseline-Akquisition der inkrementellen Beobachtung nicht voreilen kann.

Ein beendeter `$events`-Stream, ein Remote-Stream-Fehler, ein nicht-ready erstes Item oder ein fehlerhaftes Event-Item invalidiert die aktuelle Generation. Ein hängender Handshake protokolliert nach 3 Sekunden eine Slow-Host-Warnung sowie nach standardmäßig 15 Sekunden das Readiness-Timeout und bricht ab, einschließlich der Wartezeit auf den physischen Socket. Die Quelle muss nach einer Cancellation die Zustellung stoppen, Ressourcen freigeben und sich setteln, bevor ein Ersatz startet; verspätetes Ready einer gecancelten Quelle kann keine Generation publizieren. Solange der Browser Netzwerkverfügbarkeit meldet, publiziert der Controller `connecting` und retried mit 50%–100% Jitter unter den Obergrenzen 500ms, 1s, 2s, 4s, 8s und 10s, bis zur Wiederherstellung auf der letzten Stufe. Jeder Retry bittet das Gateway, den physischen WebSocket einmal zu ersetzen, und öffnet `$events` neu. Die [Continuous-Recovery-Entscheidung](../../../.agents/notes/implemented/bug-fix/2026-09-05-continuous-client-recovery.de.md) definiert die Deadlines und die Retry-Policy.

`ctx.connection.reconnect()` unterbricht laufende Arbeit, setzt die Sequenz zurück und startet sofort Retry 1. Browser-`offline` bricht laufende Arbeit ab, publiziert `disconnected` und suspendiert automatische Versuche; der nächste `online`-Übergang setzt die Sequenz zurück und startet auf der 500ms-Stufe. Nur ein Ready-Item publiziert `connected`. Gateway mux besitzt keinen eigenen Retry-Zeitplan.

Setze `config.recovery` in der Host-Connection-Zeile, um Retry-Obergrenzen, den Wachstumsfaktor oder Warnungs- und Abbruchzeiten des Handshakes zu überschreiben; der [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-client-connection) listet die akzeptierten Felder. Der Host validiert diese Werte und injiziert sie in jede ausgelieferte Seite. Der Client validiert die Bootstrap-Daten, bevor er Connection bereitstellt, und nutzt diese Defaults, wenn das Gateway seinen Loop startet; explizit an `start()` übergebene Timing-Overrides haben Vorrang. Der Wachstumsfaktor muss endlich und mindestens eins sein. Readiness, Fehlschlag, Cancellation oder eine harte Deadline vor der Warnung canceln diese Warnung. Nach einer Änderung der Host-Recovery-Konfiguration die Seite neu laden.


<a id="model-experience"></a>
## Model Experience

Keine, da die Wire-Consumer-Schicht bereits komponierte Nachrichten zwischen Browser und Host bewegt; nichts hiervon erreicht einen Model-Request.

#### KV-Cache-Effekt

Keiner; dieses Paket stellt weder einen Provider-Request zusammen noch sendet es einen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- **Gepufferte `/api`-Routen halten jeden Request-Body im Speicher** — `maxRequestBodyBytes` (Default 300 MiB, bemessen für das Default-Limit von 200 MiB aggregierter Bilder nach Base64-Aufblähung plus Envelope-Spielraum) begrenzt gewöhnliche Bild- und RPC-Envelopes. Opt-in-Streaming-Routen erhalten backpressure-geregelte Chunks und umgehen die Aggregat-Obergrenze; Persistenz, Cancellation und etwaige Storage-Quotas liegen bei den Routen-Implementierungen.
- **Das Browser-Cookie trägt kein `Secure`** — Loopback-HTTP ist der ausgelieferte Transport; eine Exposition derselben Authority über ein Klartextnetz kann daher das Bearer-Cookie auf dem Übertragungsweg offenlegen.
- **Es gibt keine Logout-Operation** — das Löschen des Browser-Cookies beendet eine Browser-Session; das Löschen des Owner-Credential-Records und ein `dsh`-Neustart widerrufen jede Session.


<a id="dev-note"></a>
### Hinweis für Entwickler

<details>
<summary>Arbeitskontext für Maintainer — zum Ausklappen klicken</summary>

Keiner.

</details>

**Laufzeitinvariante:** Es wird kein Companion publiziert. Die Browser-Session-Verifikation liest den Credential-Record asynchron bei dem Request, der Arbeit autorisiert, während der Credentials-Companion die Lebensdauer der Record-Commit-Events besitzt. Stream-/Reconnect-Sequenzierung und rpcId-Roundtrip-Disziplin werden direkt durch Verhaltenstests ausgeübt, und die Register-/Dispose-Symmetrie der Routen wird vom Webserver-Companion auditiert.
