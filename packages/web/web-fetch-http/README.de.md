---
description: "Das anonyme öffentliche HTTP(S)-Fetch-Backend für ctx.web: wie Deployments begrenztes, sicheres URL-Retrieval mit Same-Origin-Redirects und reiner Text-Dekodierung einhängen."
kind: "package-reference"
---

# @deepseek-ai/dsh-web-fetch-http
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

Mit `dsh-web-fetch-http` kann der Harness über den Web-Service (`ctx.web`) öffentliche HTTP(S)-Seiten abrufen und deren Statuscode plus begrenzten, dekodierten Inhalt erhalten, ohne Credentials zu senden. Wähle es, wenn eine Composition sicheren Abruf mit URL-Validierung, Auflösung öffentlicher Adressen, Connection-Pinning, Same-Origin-Redirects, Byte- und Zeichen-Obergrenzen sowie einem expliziten Produkt-`User-Agent` benötigt. Es gibt Nicht-2xx-Antworten als Ergebnisse statt als Fehler zurück und lehnt nicht-öffentliche Ziele, Binärdaten und nicht unterstützte Content-Types ab. Das modellseitige `web_fetch`-Tool liegt in `dsh-tool-web`, das die Bodies dieses Providers rendert.

## Inhaltsverzeichnis

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Hänge den Provider in eine Composition ein, die den Web-Service bereits lädt; er registriert sich als `http`-Fetch-Provider, sodass `ctx.web.fetch()` ihn automatisch auflöst, wenn er das einzige nutzbare Fetch-Backend ist — oder pinne ihn mit `fetchProvider: http`.

### Wann du ihn wählen solltest

Wähle dieses Backend, wenn ein Deployment öffentliche Seiten mit begrenzter Ausgabe und sicherem Transport abrufen muss: Es werden keine Credentials gesendet, jede aufgelöste Adresse muss öffentlich sein, jede Verbindung wird auf die validierte Antwortmenge gepinnt, Redirects können den Origin nicht verlassen, und jede Antwort ist begrenzt.

### Minimale Konfiguration

Lade den Web-Service und den Provider; konfigurierbare Grenzen haben sichere Defaults und werden bei der Plugin-Konstruktion validiert, sodass ein ungültiger Wert laut fehlschlägt, statt einen Provider mit unsinnigen Grenzen zu bauen. Die URL-Sicherheitsgrenze ist auf 2.048 Zeichen festgelegt.

```yaml
- name: '@deepseek-ai/dsh-web'
- name: '@deepseek-ai/dsh-web-fetch-http'
```

| Feld | Default | Bedeutung |
|---|---|---|
| `maxResponseBytes` | `5,000,000` | Maximale Response-Body-Größe in Bytes |
| `maxBodyChars` | `100,000` | Maximale dekodierte Body-Länge in Zeichen |
| `timeoutMs` | `30,000` | Fetch-Timeout — eine Ressourcen-Absicherung, nicht das modellseitige Tool-Budget |
| `maxRedirects` | `5` | Maximale Same-Origin-Redirect-Hops (`0` folgt keinem) |
| `userAgent` | `deepseek-harness/…` | `User-Agent`-Header, der bei jeder Anfrage gesendet wird |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-web-fetch-http) ist die erschöpfende Quelle für jedes akzeptierte Feld und dessen JSDoc.

### Was ein Fetch zurückgibt

Ein erfolgreicher Aufruf liefert ein `WebFetchResult`: die finale URL nach erlaubten Redirects, den HTTP-Statuscode, einen als `html` oder `text` klassifizierten dekodierten Body und ein `truncated`-Flag. Eine Nicht-2xx-Antwort ist ein Ergebnis, kein Fehler — der Statuscode ist Teil des abgerufenen Ressourcenzustands; `WebError` ist Fehlern vorbehalten, die eine Ressource nicht sicher abrufen oder darstellen können.

```text
const page = await ctx.web.fetch({ url: 'https://example.com' })
// page.body.kind === 'html' | 'text'; page.statusCode === 200 | 404 | ...
```

### Transportverhalten

Der Provider hält Anfragen anonym und begrenzt: Er akzeptiert nur `http:`- und `https:`-URLs ohne eingebettete Credentials und lehnt URLs über 2.048 Zeichen ab. Er löst jeden Hostnamen einmal auf, lehnt das gesamte Ergebnis ab, wenn eine IPv4- oder IPv6-Adresse kein öffentliches Unicast ist, und pinnt die Verbindung auf diese validierte Menge. IPv6-Prüfungen ermitteln das aktive DNS64-Präfix und lehnen Übersetzungen zu nicht-öffentlichem IPv4 ab. Jeder Same-Origin-Redirect wiederholt Auflösung und Pinning; Cross-Origin-Redirects schlagen fehl und erfordern einen neuen Aufruf. Der Provider erzwingt außerdem Byte-, Zeichen-, Hop- und Zeitgrenzen, lehnt nicht unterstützte Content-Types ab und sendet einen expliziten Produkt-`User-Agent`.

### Fehler und Wiederherstellung

Fehler werfen ein `WebError` mit maschinell routbarem Code: `WEB_INVALID_URL`, `WEB_BLOCKED_URL`, `WEB_FETCH_TOO_LARGE`, `WEB_FETCH_TIMEOUT`, `WEB_REDIRECT_BLOCKED`, `WEB_UNSUPPORTED_CONTENT_TYPE`, `WEB_ABORTED` oder `WEB_PROVIDER_ERROR`. Direkte Aufrufer können nach dem Code routen; das modellseitige `web_fetch`-Tool zeigt dem Modell den Fehlertext in seinem eigenen Fehler-Wrapper.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter dem Provider; das beobachtbare Verhalten ist vollständig in [Use this package](#use-this-package) beschrieben.

### Designphilosophie

Das Paket baut auf einer Trennung und einem geschichteten Timeout auf:

- **Sicherer Abruf vs. Darstellung.** Dieser Provider besitzt URL-Validierung, Durchsetzung öffentlicher Adressen, Connection-Pinning, HTTP-Transport, Redirect-Policy, Obergrenzen, Charset-Dekodierung und Binär-Ablehnung; `dsh-tool-web` besitzt HTML→Markdown und Trunkierungsformatierung. Eine Nicht-2xx-Antwort ist ein Datum, kein Fehler.
- **Zwei Timeout-Schichten.** Das `timeoutMs` des Providers ist eine Ressourcen-Absicherung für direkte `ctx.web.fetch()`-Aufrufer; das modellseitige Tool-Call-Budget gehört `dsh-tool-call-timeout-policy`, das `exec.signal` scharf macht. Wenn die äußere Deadline zuerst feuert, meldet der Provider `WEB_ABORTED` und die Policy ersetzt es durch `TOOL_TIMEOUT`; `WEB_FETCH_TIMEOUT` identifiziert daher einen direkten Service-Aufrufer, dessen Provider-Budget abgelaufen ist.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: Config-Schema, Grenzvalidierung, Provider-Registrierung |
| [`src/provider.ts`](src/provider.ts) | Der `HttpFetchProvider`: gepinnter Transport, Redirect-Verfolgung, begrenzte Reads, Charset-Dekodierung |
| [`src/network.ts`](src/network.ts) | Auflösung öffentlicher Adressen, DNS64-Ermittlung und Connection-Pinning |
| [`src/policy.ts`](src/policy.ts) | URL-Validierung, Same-Origin-Prüfungen, Content-Type-Klassifizierung, Charset-Parsing |
| — | Es wird kein Runtime-Invarianten-Begleiter veröffentlicht; dieses Paket legt keine unabhängige Event-Sequenz oder veränderliche Datenrelation über die an seinem besitzenden Seam durchgesetzten Contracts hinaus offen. |

### Lesepfad

Ein Fetch validiert die URL, löst den Hostnamen einmal auf, lehnt die gesamte Antwortmenge ab, wenn eine Adresse nicht öffentlich ist, und pinnt die Verbindung auf die akzeptierten Adressen. Diese Prüfung wird für jeden Same-Origin-Redirect wiederholt; ein Cross-Origin-Redirect oder ein nicht-öffentliches Ziel schlägt fehl, bevor Response-Bytes akzeptiert werden. Die finale Antwort wird nach `Content-Type` klassifiziert, aus dem deklarierten Charset dekodiert und unter der Byte-Grenze gelesen; der dekodierte Text wird dann auf die Zeichen-Grenze trunkiert.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Lies diese Seiten, wenn der Paket-Contract nicht ausreicht. Sie bewegen sich vom gemeinsamen Vokabular zum Service, den modellseitigen Tools und der Design-Begründung.

- [Web-Subsystem](../../../docs/subsystems/web.de.md) — das erschöpfende Fetch-Request/Result-Vokabular und die Fehlercodes.
- [Web-Paketkarte](../README.de.md) — die Sechs-Paket-Familie und jede Rolle.
- [dsh-web](../web/README.de.md) — der Web-Service, in den sich dieser Provider registriert.
- [dsh-tool-web](../tool-web/README.de.md) — das modellseitige `web_fetch`-Tool, das die Bodies dieses Providers rendert.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-web-fetch-http) — jedes akzeptierte Config-Feld und seine Quelldeklaration.
- [Web-Capability-Seam-Entscheidung](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.de.md) — warum Search und Fetch einen Provider-Auswahl-Service teilen.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über `dsh-tool-web`, das den durch `maxBodyChars` begrenzten dekodierten Text dieses Providers oder das in Markdown-Form gebrachte HTML unter seinem Fetch-Result-Wrapper rendert, während Redirects, Header und Transportgrenzen verborgen bleiben.

#### KV-Cache-Effekt

Keine direkte Invalidierung; der genannte Consumer besitzt alle Request-Prefix-Änderungen.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann der Provider unsicher oder eine schlechte Wahl ist. Es sind aktuelle Paket-Constraints.

- **Nur textuelle Inhalte werden dekodiert** — html/xhtml und `text/*` plus JSON-/XML-Familien; ein fehlender `Content-Type` oder jeder Binärtyp wirft `WEB_UNSUPPORTED_CONTENT_TYPE`, und die Dekodierung textextrahierbarer PDFs ist als zurückgestellte Arbeit benannt.
- **Das Charset kommt nur aus dem `Content-Type`-Header** (UTF-8-Default) — eine HTML-`<meta charset>`-Deklaration wird ignoriert, und ein deklariertes, aber nicht erkanntes Charset-Label wirft, statt zurückzufallen.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
