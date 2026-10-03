# Agent Note: Browser-Launch-token-Authentifizierung

Status: implemented

[English](2026-08-24-browser-token-authentication.md) | [中文](2026-08-24-browser-token-authentication.zh.md) | Deutsch

## Problem

Der Web-Host führt tool-fähige Sessions mit der Autorität des aktuellen Betriebssystem-Benutzers aus, aber seine HTTP-Schnittstelle identifizierte privilegierte Aufrufer anhand von Request-Routing-Fakten. Insbesondere behandelte die methodenspezifische Loopback-Liste einen Loopback-`Host`-Wert als lokale Autorität, obwohl ein HTTP-Client diesen Header kontrolliert. Ein Aufrufer, der den Server erreichen konnte, konnte daher `localhost` angeben, Konfigurationsmethoden betreten und Host-seitige Operationen wie die Modellentdeckung verwenden, um gespeicherte Credentials offenzulegen. Das Binden der ausgelieferten CLI an Loopback begrenzt die gewöhnliche Erreichbarkeit, authentifiziert aber keinen Request, der an diesen Socket weitergeleitet oder anderweitig zugestellt wird.

## Entscheidung

`dsh-client-connection` authentifiziert die vollständige Host-API vor dem Dispatch. Jede API-Proxy-Methode, jeder Remote-Unary-Call, jeder generische Connection-Kanal und jeder Remote-WebSocket-Stream erfordert dieselbe Browser-Session; Endpunkt-Ownership und Methodennamen ändern die Autorität nicht. Die bestehenden Host/Origin-Prüfungen laufen zuerst und behalten ihre DNS-Rebinding- und Cross-Site-Request-Rolle und liefern 403 bei einem Fehlschlag. Ein vertrauenswürdiger Host ohne gültige Browser-Session erhält 401. Die Browser-Trust-Regeln bleiben im Besitz der [Carrier-Level-Browser-Trust-Entscheidung](2026-07-28-api-browser-trust-boundary.de.md).

Jeder Host-Prozess erzeugt ein zufälliges Launch-token, das der Root-Anwendungskontext über Connection-Hot-Reloads hinweg behält. `dsh-web-app` druckt und öffnet die normale Root-URL mit diesem token in der Abfrage einmal pro Prozess. `frontend-static` bittet Connection, Index-Antworten zu autorisieren: Nur `GET /?token=...` tauscht das Prozess-token gegen ein Cookie, dann erfolgt ein Redirect auf das saubere `/`; das token wird weder auf API-Pfaden noch in einem Authorization-Header akzeptiert. Ein veraltetes token gepaart mit einem gültigen Cookie leitet auf das saubere `/` um. Fehlende und ungültige Credentials erhalten eine minimale 401-Antwort. Statische Nicht-Index-Assets bleiben öffentlich.

Das Cookie ist ein signierter, autoritätsgebundener Bearer. Sein deterministischer Name und die signierte Payload enthalten beide den normalisierten Hostnamen plus Port, sodass ein Harness-Home unabhängige Web-Ports ohne Cookie-Kollisionen betreiben kann. Die Payload trägt Safe-Integer-Ausstellungs- und Ablaufzeiten unter einer absoluten Lebensdauer; `cookieMaxAgeDays` ist standardmäßig 30. Das Cookie ist host-only, `Path=/`, `HttpOnly` und `SameSite=Strict`. Es lässt `Secure` weg, weil der ausgelieferte Server Loopback-HTTP verwendet. Es gibt keine Logout-Operation oder Reverse-Proxy-spezifische Behandlung.

Das HMAC-Geheimnis ist ein versionierter `grant`-Datensatz unter `client-connection/browser-session` in `ctx.credentials`; der lokale provider speichert es in `$DSH_HOME/.credentials.yaml`. Connection lädt oder erstellt den Datensatz während der Aktivierung und behält das Geheimnis für die synchrone Request-Verifikation. Eine aktive Connection verwendet weiterhin ihr geladenes Geheimnis, wenn sich der dauerhafte Datensatz ändert; die nächste Aktivierung lädt den Ersatz oder erstellt einen fehlenden Datensatz, sodass das Löschen des Datensatzes und der Neustart des Prozesses jedes bestehende Cookie widerruft. Ungültige Owner-Payloads schlagen laut fehl, statt ersetzt zu werden. Das Launch-token selbst wird niemals persistiert und ändert sich bei jedem Prozessstart, während ein unverfallenes Cookie über Neustarts auf derselben Autorität gültig bleibt.

Die In-Page-Web-Worker-Vorschau stellt keinen Netzwerk-Socket bereit. Ihr seiten-eigener `postMessage`-Tunnel tritt zuerst in die echte Route ein, dann wiederholt er einen 401 oder 403 über den worker-lokalen Fetch-Handler. Dies bewahrt Connection-Interceptors und begrenzt den Authentifizierungs-Bypass auf die Seite, die den Host-Worker erstellt hat.

Die ausgelieferte CLI lehnt weiterhin `--host 0.0.0.0` ab. Authentifizierung impliziert kein unterstütztes Netzwerk-Deployment, TLS, Forwarding-Header-Interpretation oder Proxy-Konfiguration.

## Verifikation

Unit-Coverage pinnt Prozess-token-Erhalt über Connection-Reloads, ein Geheimnisladen pro Aktivierung, synchrone Verifikation ohne Credential-provider-Lesevorgänge, Cookie-Attribute, HMAC- und Payload-Validierung, Autoritäts- und Lebensdauerprüfungen, Datensatzlöschung, die bei der nächsten Aktivierung wirksam wird, ungültige dauerhafte Datensätze und die Bereinigung veralteter token-URLs, die von gültigen Cookies gestützt werden. Host-Transport-Suiten pinnen einheitliches 401/403-Verhalten für generisches RPC, Typert-Remote-HTTP, exakte Fetch-Routen und WebSocket-Upgrade-Pfade. Der Frontend-Real-Composition-Test bootet Credentials, Connection, Webserver und statisches Serving über den Loader und beweist den token-Austausch vor Index-Lesevorgängen, während statische Assets öffentlich bleiben. Packed-Worker-Tests beweisen portable Cookie-Kodierung und worker-lokale Wiederholung sowohl für Authentifizierungs- als auch für Trust-Ablehnung. Ein Real-CLI-Test startet `dsh web` zweimal auf einem Port mit einem temporären `DSH_HOME`, beweist, dass ein gefälschtes `Host: localhost` unauthentifiziert ist, ruft `settings/describe` mit dem getauschten Cookie auf, beobachtet ein neues Prozess-token und verwendet das alte Cookie nach dem Neustart wieder.

## Erwogene Alternativen

**Privilegierte Aufrufer anhand der TCP-Peer-Adresse bestimmen.** Eine direkte Peer-Adresse identifiziert weiterhin einen lokalen Forwarding-Prozess statt des Browser-Benutzers, behält ein zweites Autoritätsmodell neben der Befehlsausführungsfähigkeit der API und erfordert eine Proxy-Policy, um zu beantworten, wer der ursprüngliche Aufrufer war. Ein Anwendungs-Credential ist die durchsetzbare Identität, die für jede Operation verwendet wird.

**Eine methodenspezifische privilegierte Liste behalten und gespeicherte Credentials auf konfigurierte Ziele beschränken.** Die Liste kann neue Endpunkte auslassen und beschränkt keine Aufrufer, die bereits eine tool-fähige Session kontrollieren. Eine `discoverModels`-Zielregel würde keine Sicherheitsgrenze bilden, weil derselbe authentifizierte Principal Einstellungen aktualisieren und Befehle ausführen kann. Einheitliche Authentifizierung deckt die Operation ab, die Prozesskontrolle gewährt.

**Das Launch-token persistieren oder als API-Bearer akzeptieren.** Ein dauerhaftes Launch-token würde zu einem zweiten langlebigen Credential, während Authorization-Header-Support einen Nicht-Browser-Client-Vertrag ohne aktuellen consumer hinzufügen würde. Das Prozess-token führt nur einen Browser-Cookie-Austausch durch.

**Das Signiergeheimnis bei jedem Neustart rotieren.** Dies verhindert, dass ein bestehender Browser sich nach einem gewöhnlichen DSH-Neustart wieder verbindet. Das Persistieren nur des Signiergeheimnisses bewahrt diesen Workflow, während die Prozess-token-Rotation die Startup-URL auf eine Prozesslebensdauer begrenzt.

**Logout-, TLS-Proxy- und Forwarding-Header-Konfiguration hinzufügen.** Keines davon wird von der Loopback-Web-Anwendung oder der gemeldeten Authentifizierungslücke benötigt. Ihr Hinzufügen würde Deployment-Verträge ohne aktuelle consumer definieren. Browser-Site-Data-Kontrollen widerrufen eine Browser-Session; das Löschen des Credential-Datensatzes und der Neustart des Prozesses widerruft alle Sessions.

## Konsequenzen

Der Besitz des Browser-Cookies autorisiert die vollständige tool-fähige Host-API, was der Autorität entspricht, die die Web-Anwendung nach der Session-Erstellung exponiert. `Host` gewährt keine höhere Methodenstufe, und eine Methodenmigration zwischen API-Proxy und Typert-Remote kann ihre Aufrufermenge nicht ändern.

Das persistente Geheimnis lässt Cookies Neustarts überleben, gibt einem gestohlenen Cookie aber bis zur konfigurierten absoluten Lebensdauer. Das Löschen des Datensatzes und der Neustart des Prozesses ist der globale Widerrufsmechanismus; die aktive Connection vermeidet absichtlich Credential-provider-Arbeit bei jedem Request. Das Weglassen von `Secure` bewahrt Loopback-HTTP und erlaubt Klartext-Übertragung, wenn ein Betreiber dieselbe Cookie-Autorität über ein unverschlüsseltes Netzwerk erreichbar macht. Die Startup-URL enthält ein Prozess-Credential und muss als sensible Ausgabe behandelt werden; Laufzeitdiagnosen wiederholen sie nicht.

Die Entscheidung ersetzt teilweise die Authentifizierungs-Zurückstellung und die unauthentifizierten Nicht-Loopback-Konsequenzen in der [Browser-Trust-Note](2026-07-28-api-browser-trust-boundary.de.md). Diese Note bleibt aktive Autorität für Media-Type-, Host-, Origin-, Fetch-Metadata- und konfigurierte-Autorität-Validierung. Keine aktive Agent Note wird archiviert: Die Überlappung ist teilweise, und beide Sicherheitsregeln behalten künftigen Entscheidungswert.
