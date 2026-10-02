---
description: "Ausgehender HTTP-Proxy-Support für den Harness: wie eine aus der Launch-Umgebung aufgelöste Policy jeden Request erreicht, den Nodes fetch sonst direkt senden würde."
kind: "package-reference"
---

# @deepseek-ai/dsh-http-proxy

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

Dieses Paket einsetzen, um eine ausgehende HTTP-Proxy-Policy auf Harness-Requests anzuwenden, die Nodes eingebautes `fetch` verwenden — einschließlich LLM-, Web-Search- und HTTP-MCP-Verkehr. Der Launcher liest die Standard-Proxy-Umgebungsvariablen einmal, und gewöhnliche `fetch`-Aufrufer brauchen keine zusätzlichen Imports oder Änderungen. Lokaler Loopback-Verkehr bleibt direkt, während nicht unterstützte Proxy-URLs gemeldet und für das betroffene Scheme übersprungen werden. Öffentliche Helpers lassen Aufrufer Transports mit eigenen Proxy-Einstellungen routen, Child-Process-Umgebungen vorbereiten oder Proxy-Variablen für isolierte Replays löschen.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Nichts zu mounten, nichts zu konfigurieren. Der `dsh`-Launcher resolved und installiert die Policy für jedes Profil, bevor das erste Plugin lädt, sodass ein Nutzer, der `HTTPS_PROXY` exportiert, überall durch den Proxy geht. Dies ist eine Library und kein Plugin, weil Transport-Policy pro Prozess nur eine Antwort hat: Es gibt keine zweite Implementierung zum Austauschen und keinen engeren Scope als den Prozess, dem man eine geben könnte.

### Einen neuen ausgehenden Call schreiben

Plain `fetch()` geht durch den Proxy, ebenso jedes SDK, das `globalThis.fetch` erreicht — der MCP-HTTP-Transport und der pi-ai-Provider-Stack tun beides. Ein SDK, das seinen eigenen Transport baut, tut dies **nicht**, und zwei der SDKs, die dieses Repository ausliefert, haben sich als solche erwiesen: Der OTLP-Exporter postet über `node:http`, und das E2B-SDK konstruiert einen eigenen undici-Dispatcher. Nichts über ein SDK annehmen; nachprüfen.

| Du schreibst | Verwende |
|---|---|
| Einen einfachen Request oder ein SDK, das `globalThis.fetch` erreicht | nichts — der globale Dispatcher routet es bereits |
| Einen Call, der danach verzweigen muss, ob dieser Request durch den Proxy geht | `proxyRouteFor(url)` |
| Ein SDK, das eine eigene Proxy-URL akzeptiert | `proxyRouteFor(url)` und `route.proxy` übergeben |
| Einen spawn, dessen Umgebung du selbst baust | `proxyEnvironmentForChild()` darauf anwenden (`undefined` bedeutet entfernen) |
| Einen Harness, der seinen eigenen fixture-Server erreichen muss | `clearedProxyEnv()` auf den spawn anwenden |

`proxyRouteFor` antwortet mit dem Transport, den die Antwort annahm, nicht nur mit der Antwort: Sein Proxy-Zweig trägt den Dispatcher, der bereits nach dieser Policy routet. Ein Aufrufer, der die Policy liest und dann einen eigenen Transport baut, könnte ein Unmount dazwischenlanden lassen und den Request dorthin senden, wo sein Zweig ihn nie freigegeben hat.

Ein SDK, das seinen eigenen Transport baut, erreicht nichts davon, und zwei der im Repository ausgelieferten tun das. E2B akzeptiert eine eigene Proxy-URL und bekommt `route.proxy` übergeben. Der OTLP-Telemetrie-Exporter postet über `node:http` und bleibt absichtlich direkt — siehe die Einschränkung unten.

`new Agent(...)` zu konstruieren und als `dispatcher` zu übergeben überschreibt den globalen und umgeht den Proxy still. `verify-no-bare-dispatcher` lehnt das außerhalb dieses Pakets ab. Eine Call-Site besitzt legitim ihren eigenen Transport — `web-fetch-http` pinnt einen Request auf Adressen, die es validiert hat, was Per-Request-State ist, den ein prozessweiter Dispatcher nicht halten kann — und sagt das mit einem `proxy-exempt:`-Kommentar in der Zeile.

Dieses Gate kann nicht in ein SDK hineinsehen, daher trägt jede ausgehende Call-Site im Repository zusätzlich ein `egress.spec.ts`, das ihren echten Codepfad durch einen Fake-Proxy treibt und assertiert, dass der Proxy den Request gesehen hat — oder bei Telemetrie, dass er es nicht hat. Eine neue Call-Site fügt eines hinzu. Es ist das Einzige, das erkennt, wenn ein SDK unter uns den Transport wechselt, in beide Richtungen: So wurden die OTLP- und E2B-Lücken gefunden, und so würde ein Upgrade erkannt, das anfinge, Telemetrie still durch den Proxy zu routen.

### Was die Policy liest

`http_proxy`, `https_proxy`, `no_proxy` und `all_proxy`, lowercase zuerst und uppercase als Fallback, wobei ein leerer Wert als unset gilt. `ALL_PROXY` deckt beide Schemes ab, und HTTPS fällt zuletzt auf den HTTP-Proxy zurück — weder Node noch undici leiten das Erstere selbst ab. Werte kommen aus dem Snapshot des Launchers: zuerst eine exportierte Variable, dann `$DSH_HOME/.env`. Die `.env` eines Projekts kann diese Namen nicht tragen — diese Datei kommt mit einem Clone mit, und der Launcher verweigert den Start, statt einem Repository zu erlauben, zu entscheiden, wohin der Harness seinen Verkehr sendet.

Loopback wird immer umgangen — `localhost`, der gesamte `127.0.0.0/8`-Bereich, `::1`, `0.0.0.0` und deren IPv4-mapped-Schreibweisen. Die Web-UI des Harness, der Connection-Transport und jeder lokale Testserver würden sonst durch den Proxy routen und loopen. Die veröffentlichte Bypass-Liste nennt nur die vier Literal-Einträge, die ein Umgebungsleser matchen kann; `proxyForUrl` erkennt den Bereich selbst, weil ein Listeneintrag einen solchen nicht ausdrücken kann.

### Fehler

Ein Proxy-Wert, den das Paket nicht verwenden kann — eine SOCKS- oder PAC-URL, ein nicht parsebarer String, ein nicht unterstütztes Scheme — wird gemeldet und übersprungen, und dieses Scheme verbindet direkt. Die Variable kann für andere Tools exportiert worden sein, daher darf sie den Agent nicht am Start hindern.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

### Design-Philosophie

**Eine Resolution, ein Matcher.** `proxyForUrl()` und der installierte Dispatcher dürfen sich bei einer URL niemals uneinig sein, sonst würde `dsh-web-fetch-http` eine Verbindung pinnen, die der Dispatcher tunneln wollte. Der Dispatcher ist daher ein `Agent`, dessen Per-Origin-`factory` selbst `proxyForUrl()` aufruft, sodass es keinen zweiten Parser gibt, der vom ersten abdriften könnte. undicis `EnvHttpProxyAgent` kann hier nicht dienen: Ohne vorhandenes `HTTPS_PROXY` verwendet er den HTTP-Proxy für `https:` wieder, was ein Scheme tunneln würde, das dieses Paket direkt hält, nachdem es die vom Nutzer dafür benannte URL abgelehnt hat.

**Ein Child erbt die eigenen Werte des Nutzers und die aufgelöste Policy für das, was unset blieb.** Ein Scheme, das der Nutzer in irgendeiner Schreibweise benannt hat, erreicht ein Child genau so, wie er es geschrieben hat, sodass ein SOCKS-Proxy für `curl` nie durch einen HTTP-Proxy ersetzt wird, der für ein anderes Scheme benannt war. Ein Scheme, das er in keiner Schreibweise benannt hat, trägt stattdessen den aufgelösten Wert, weil sonst das Routing des Childs von dem des Parents abweicht: Nodes `NODE_USE_ENV_PROXY` liest `ALL_PROXY` nicht. Die Bypass-Liste ist immer die aufgelöste — sie fügt nur die Loopback-Einträge hinzu, sodass nichts verloren geht, was der Nutzer schrieb. Der Preis einer Routing-Antwort für Parent und Child gleichermaßen ist, dass `curl` auch den `https:`-Proxy sieht, den dieses Paket aus dem HTTP-Proxy ableitet. Eine Ausnahme schützt das Child selbst: Wenn ein Wert, den es erhält, einer ist, den dieses Paket ablehnte — eine SOCKS-URL, die für `curl` aufbewahrt wurde — wird das `NODE_USE_ENV_PROXY`-Flag vorenthalten, weil Node unter diesem Flag `HTTP_PROXY` und `HTTPS_PROXY` parst, bevor das Programm läuft, und bei einem solchen Wert exited. Ein Child-Node verbindet dann direkt, wie dieser Prozess es für dieses Scheme bereits gemeldet hat, statt am Start zu scheitern.

### Source Map

| Datei | Enthält |
|---|---|
| `src/policy.ts` | Resolution und Bypass-Matching; ein Diagnostic benennt die Variable, nie ihren Wert. Importiert keinen Transport und bleibt daher ladbar, wo undici fehlt. |
| `src/install.ts` | Der globale Dispatcher, der Active-Policy-Record, die Route und die Child-Umgebung. Importiert undici dynamisch. |
| `src/index.ts` | Die Paket-Face: vier Funktionen und ein Typ. |

### Bypass-Matching

Ein Eintrag benennt einen Host und matcht ihn zusammen mit jeder Subdomain darunter: `NO_PROXY=example.com` umgeht auch `api.example.com`. Ein führender `.` oder `*.` wird akzeptiert und bedeutet dasselbe. Ein Eintrag kann einen `:port` tragen, und `*` umgeht alles. Ein gebracketetes oder nacktes IPv6-Literal matcht in beiden Formen — ein nacktes `::1` wird *nicht* als Host `:` Port `1` gelesen, genau so scheitert undicis eigener Matcher, und deshalb trägt die aufgelöste Liste sowohl `::1` als auch `[::1]`. CIDR wird nicht gematcht: Die Bypass-Liste eines Betriebssystems trägt oft `10.0.0.0/8`, das als Suffixe umgeschrieben werden muss.

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

- [Netzwerk-Proxy-Anleitung](../../../docs/user/guide/network-proxy.de.md) — was zu exportieren ist, und warum ein Browser durch den Proxy geht, ein Terminal aber nicht.
- [`dsh-web-fetch-http`](../../web/web-fetch-http/README.de.md) — der eine Consumer, dessen Sicherheitsregeln sich unter einem Proxy ändern.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da reine Transport-Policy: Sie ändert, wie Bytes das Netz erreichen, und registriert keinen Prompt, kein Schema und keinen Result-Text.

#### KV-Cache-Effekt

Keine direkte Invalidierung: Das Paket trägt keine Request-Tokens bei und mutiert nie einen Request-Prefix, sodass die Provider-Cache-Wiederverwendung unberührt bleibt.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann das Paket schlecht passt. Sie sind aktuelle Paket-Constraints.

- **Kein SOCKS, PAC oder Betriebssystem-Proxy-Detection** — nur `http(s)://`-Proxy-URLs aus der Umgebung. Eine macOS- oder Windows-System-Proxy-Einstellung wird nicht gelesen, sodass ein Nutzer, der sie nur in einer Proxy-Anwendung umgelegt hat, die Variablen trotzdem exportieren muss; eine SOCKS-URL wird gemeldet und das Scheme bleibt direkt, statt den Proxy eines anderen Schemes zu leihen.
- **Keine eigene Certificate Authority** — ein TLS-interceptierender Unternehmens-Proxy braucht `NODE_EXTRA_CA_CERTS` auf dem Prozess vor dem Launch, was dieses Paket weder setzt noch validiert.
- **Ein gespawnter Child befolgt die Policy nur auf einer neu genug Runtime und nur, wenn jeder geerbte Wert einer ist, den Node akzeptiert** — es liest die veröffentlichte Umgebung über Nodes `NODE_USE_ENV_PROXY` (22.21+, 24+), und die Engines-Range lässt 22.19 und 22.20 zu, wo solch ein Child direkt bleibt. Ein Nutzer, dessen Umgebung auch einen SOCKS- oder sonst abgelehnten Proxy benennt, lässt jeden Child-Node direkt: Das Flag wird vorenthalten, damit das Child überhaupt starten kann. Ein Child matcht Bypass-Einträge außerdem mit Nodes eigenen `NO_PROXY`-Regeln, die sich in Separatoren und IPv4-Range-Support von denen dieses Pakets unterscheiden. Nichts in diesem Prozess hängt von einer Node-Version ab: Jeder In-Process-Request erreicht den globalen Dispatcher.
- **Telemetrie ist by Design direkt** — der OTLP-Exporter postet über `node:http`, das kein globaler Dispatcher erreicht. Sie zu routen bräuchte entweder einen `http.Agent`, dessen `proxyEnv`-Option jünger als die niedrigste unterstützte Node-Version ist, oder den `fetch`-Transport des SDK, der keine Kompression hat, während das ausgelieferte Profil gzip aktiviert. Telemetrie ist der eine Kanal, dessen Verlust den Nutzer nichts kostet, daher bleibt sie, wo sie war; `DSH_TELEMETRY_MODE=DISABLED` schaltet sie aus.
- **Ein Worker, der modellgeschriebenen Code ausführt, bekommt gar keinen Proxy** — weder der `code-runtime`-Worker noch der `workflow`-Worker erhält Proxy-Konfiguration, sodass ihre eigenen Requests direkt gehen. Eine Proxy-URL kann `user:password` tragen, und beide führen Skripte aus, die das Modell schrieb.
- **Das Regression-Gate sieht Source, nicht Dependencies** — `verify-no-bare-dispatcher` parst `packages/*/*/src` und `apps/*/src`; Tests, Skripte und die Interna eines Third-Party-SDK liegen außerhalb. Genau deshalb trägt jede ausgehende Call-Site zusätzlich ein `egress.spec.ts`.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Nodes eingebautes `fetch` von einem Userland-undici aus zu erreichen, beruht darauf, dass beide den Legacy-Slot `Symbol.for('undici.globalDispatcher.1')` schreiben. Das ist eine implizite Cross-Version-Kopplung, kein Contract — siehe [corepack#834](https://github.com/nodejs/corepack/issues/834) für ein Beispiel ihres Brechens. `tests/install.spec.ts` assertiert, dass ein echter Request einen Loopback-Proxy erreicht, sodass ein Version Bump, der die Kopplung bricht, dort fehlschlägt statt im Feld.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Der eine mutable State hier — die aktive Policy — wird von Unit-Tests gegen den Dispatcher assertiert, den sie installiert: Die Tests disposen die Registrierung und beobachten einen echten Loopback-Proxy.
