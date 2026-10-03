# Agent Note: Eine Browser-Trust-Boundary auf Carrier-Ebene für alle `/api`-Routen

Status: implemented

[English](2026-07-28-api-browser-trust-boundary.md) | [中文](2026-07-28-api-browser-trust-boundary.zh.md) | Deutsch

## Problem

Der Web-GUI-Host serviert `/api` über schlichtes Loopback-HTTP (Default `127.0.0.1:3080`; die CLI lehnt `--host 0.0.0.0` ab), und die Oberfläche enthält Methoden auf Remote-Code-Execution-Niveau — `session.prompt` treibt einen Agent, der Bash ausführt. Ein Browser macht den Operator gegenüber einer solchen lokalen API auf zwei klassische Arten zum Confused Deputy: Eine bösartige Seite feuert einen „einfachen" Cross-Site-POST (`text/plain` — ohne CORS-Preflight gesendet), dessen Side Effects ausgeführt werden, obwohl die Response unlesbar bleibt, und ein DNS-rebound Origin spricht mit dem Socket, als wäre er same-origin, womit CORS vollständig inapplikabel wird und nur der `Host`-Header die Angreifer-Domain verrät. Vor dieser Entscheidung schützte der einzige Browser-Trust-Check des Systems (`isTrustedNativeDialogRequest`: Loopback-Socket + Same-Origin + Loopback-Host) exakt eine kosmetische Route — `host.pickDirectory`, dessen nativer Dialog auf dem Bildschirm des Hosts aufpoppt — während jede konsequenzträchtige Methode ungeschützt war. Per-RPC-Schutz konnte auch den In-App-Directory-Browser nicht überleben, dessen ganzer Zweck darin besteht, legitim remote Clients zu bedienen, die eine Loopback-Regel ablehnen würde.

## Entscheidung

Browser-Trust wird einmal durchgesetzt, am Carrier, für das gesamte `/api`-Prefix — in zwei Hälften:

- **Media-Type-Fence (dsh-client-connection)**: Jeder `/api`-POST muss `application/json` deklarieren, sonst 415 vor dem Parsen. Cross-Site-„simple"-Requests existieren damit nicht mehr: Jeder Cross-Site-Versuch wird in einen CORS-Preflight gezwungen, den dieser Server nie beantwortet.
- **Authority-Fence (dsh-client-connection, `src/api-request-trust.ts`)**: Jeder Request muss ein `Host` präsentieren, das Loopback ist oder einem `trustedHosts`-Eintrag entspricht (exakt auf `host:port`, beliebiger Port bei port-losen Einträgen, WHATWG-normalisiert; Rebinding-Abwehr). Bewusst kein Shortcut für unmarkierte Requests: Über schlichtes HTTP hängt ein Browser an Reads weder `Origin` noch Fetch-Metadata an (EventSource, Bilder, Navigationen — diese Header gehen nur an vertrauenswürdige Ziele), sodass ein unmarkierter Request ein rebound Browser-Read sein kann, dessen Response die Seite lesen kann, und Host der eine Header ist, den Rebinding nicht fälschen kann; Non-Browser-Clients passieren über Loopback, die abgeleiteten LAN-IP-Literals oder eine deklarierte Authority. Ein angehängter `Origin` muss der Host-Authority gleichen; `sec-fetch-site: cross-site` wird glatt abgelehnt. Ein `trustedHosts`-Eintrag, der keine blanke, kanonische Authority ist, lässt das Plugin-Loading fehlschlagen — WHATWG-Parsing würde sonst still den Hostnamen innerhalb eines Tippfehlers autorisieren oder einen Exact-Port-Grant verbreitern. `host.pickDirectory` verliert seinen maßgeschneiderten Guard und fährt auf demselben Fence mit.

Erreichbarkeit ist die Policy des Webserver-Bindings (`host: 127.0.0.1 | 0.0.0.0`), und dieser Fence ist eine Confused-Deputy-Abwehr, keine Identität. Connection wendet die separate [Browser-Token-Authentifizierung](2026-08-24-browser-token-authentication.md) nach dem Fence an. Der Fence inspiziert keine Peer-Socket-Adressen: Binding drückt Erreichbarkeit aus, `trustedHosts` benennt akzeptierte Authorities, und die Socket-Adresse fügt nichts hinzu, das die Host-/Origin-Checks bräuchten.

## Erwogene Alternativen

- **Per-RPC-Guards (erweiterter Status quo).** Abgelehnt: Die Guard-Liste hinkt der Methodenliste ewig hinterher, die wertvollsten Methoden waren bereits ungeschützt, und eine Loopback-Regel auf Browse-RPCs würde die Remote-Deployments brechen, für die sie existieren.
- **CORS-Header + Weglassen von Credentials.** Abgelehnt: Wir wollen Cross-Origin-Reads überhaupt nie, sodass das Beantworten von Preflights die Oberfläche nur verbreitert; sie abzulehnen ist strikt stärker und einfacher.
- **Authentication-Tokens.** Für diese Änderung abgelehnt: Token-Minting, -Speicherung und -Rotation sind separate Produktentscheidungen. Die spätere [Browser-Token-Authentifizierung](2026-08-24-browser-token-authentication.md) besitzt sie, ohne diesen Fence zu ändern.

## Konsequenzen

- Jede zukünftige `/api`-Methode ist von Konstruktion her abgedeckt; es gibt keine Per-Route-Trust-Entscheidung mehr, die man vergessen könnte.
- Eine Custom-Non-Loopback-Komposition muss ihre Serving-Authorities trusten, sonst werden Requests abgelehnt, und danach Browser-Authentication wie jeder Loopback-Request erfüllen. Die ausgelieferte CLI lehnt `--host 0.0.0.0` ab; `--trusted-host` erweitert nur den Host-/Origin-Fence und gewährt keine Identität.
- Clients müssen POST-Bodies als `application/json` labeln (unsere taten es immer; Raw-Fetch-Tests bekamen den Header hinzu).
- Host und Origin bleiben nur Request-Routing-Evidenz. Das Process-Token und das signierte Cookie etablieren die Browser-Identität, die jede Host-Methode nutzt.
