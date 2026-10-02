---
description: "Der DeepSeek-gestützte Such-Provider für ctx.web: wie Deployments die native DeepSeek-Websuche über die Anthropic-kompatible Messages-API mounten, mit Credential-Auflösung pro Suche."
kind: "package-reference"
---

# @deepseek-ai/dsh-web-search-deepseek

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Mit `dsh-web-search-deepseek` durchsucht der Harness das Web über die native DeepSeek-Suche und verwendet einen vorhandenen `DEEPSEEK_API_KEY`. Wählen, wenn ein Deployment die native DeepSeek-Suche will und akzeptiert, dass eine Suche einen vollständigen Modell-Turn an Latenz und Token kostet, weil DeepSeek keinen dedizierten Such-Endpoint anbietet. Ergebnisse stammen aus den strukturierten Suchblöcken, die DeepSeek zurückgibt, niemals aus aus einer Antwort herausgekratztem Text. Eine fehlende Credential lässt den Aufruf mit einem strukturierten Fehler scheitern; eine Antwort ohne Suchergebnis-Block schlägt laut fehl statt zu degradieren. Das modellseitige `web_search`-Tool liegt in `dsh-tool-web`.

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

Den Provider in einer Komposition mounten, die den Web-Service bereits lädt; er registriert sich als `deepseek-official`-Such-Provider, sodass `ctx.web.search()` ihn automatisch auflöst, wenn er das einzige nutzbare Such-Backend ist — oder mit `searchProvider: deepseek-official` pinnen.

### Wann wählen

Dieses Backend wählen, wenn ein Deployment die native serverseitige DeepSeek-Websuche will und bereits einen `DEEPSEEK_API_KEY` besitzt — der Provider nutzt diese Credential-Referenz wieder. Eine Suche ist schwerer als ein dedizierter Retrieval-Endpoint: DeepSeek führt die Suche innerhalb eines vollständigen Modell-Turns aus, also pro Suche die Latenz und generierten Token eines Messages-Aufrufs erwarten, mit bis zu `maxUses` serverseitigen Suchen pro Anfrage. Vermeiden, wenn Kosten oder Latenz pro Suche dominieren.

### Minimale Konfiguration

Den Web-Service und den Provider laden; der Schlüssel wird über `ctx.credentials` aufgelöst, wenn dieser Service gemountet ist, sonst aus der Prozessumgebung. Der Such-Endpoint verwendet die Anthropic-kompatible Basis (`https://api.deepseek.com/anthropic/v1`), abweichend von der Chat-Completions-Basis des LLM-Adapters — `$DEEPSEEK_BASE_URL` niemals wiederverwenden.

```yaml
- name: '@deepseek-ai/dsh-web'
- name: '@deepseek-ai/dsh-web-search-deepseek'
  config:
    apiKeyEnv: DEEPSEEK_API_KEY
    baseURL: https://gateway.internal/anthropic/v1
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `apiKey` | nicht gesetzt | Literaler DeepSeek-API-Schlüssel; `apiKeyEnv` bevorzugen, damit kein Secret in die Konfiguration gelangt. Ein nicht-leeres Literal gewinnt |
| `apiKeyEnv` | `DEEPSEEK_API_KEY` | Credential-Referenz, die für jede Suche über `ctx.credentials` aufgelöst wird, oder aus der Prozessumgebung, wenn dieser Service fehlt. Ein fehlender Wert lässt den Aufruf als `WEB_PROVIDER_CREDENTIAL_MISSING` scheitern |
| `baseURL` | `https://api.deepseek.com/anthropic/v1` | Anthropic-kompatible Endpoint-Basis; `/messages` wird angehängt. Fällt auf `$DEEPSEEK_SEARCH_BASE_URL` zurück; ein nicht parsbarer Wert macht den Provider unverfügbar |
| `model` | `deepseek-v4-flash` | Modellname im Anthropic-Format |
| `apiVersion` | `2023-06-01` | Wert des `anthropic-version`-Headers |
| `maxTokens` | `4096` | Positive-Ganzzahl-Obergrenze für generierte Token der Messages-Anfrage |
| `maxUses` | `5` | Positive-Ganzzahl-Maximum an `web_search`-Server-Tool-Nutzungen pro Anfrage |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-web-search-deepseek) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc. Der obige Eintrag ist die Basisschicht der Settings-Sektion des Providers; eine darüberliegende Benutzerschicht erreicht die nächste Suche, weil der Provider die Sektion pro Aufruf projiziert statt sie bei der Registrierung festzuhalten.

### Was eine Suche zurückgibt

`content` wird immer weggelassen: DeepSeeks Provider-Prosa wird nicht als Antwort vertraut. `sources[]` stammt aus `web_search_result`-Einträgen innerhalb von `web_search_tool_result`-Blöcken — `url`, `title` und `publishedAt` aus `page_age` — mit Snippets, die aus URL-keyed `cited_text`-Einträgen zusammengefügt werden, wo ein Auszug existiert. Ergebnisse werden per URL dedupliziert, und da DeepSeek keinen Ergebnisanzahl-Regler anbietet, erzwingt der Service `maxResults` durch Kürzen und Markieren.

### Request-Logging

Eine unter einem initiierenden Agent laufende Suche hängt das Log-only-Session-Event `web/deepseek-search-llm-request` unmittelbar vor dem Dispatch an. Es trägt den aufgelösten Endpoint, die API-Version und den exakten secret-freien JSON-Body, der an DeepSeek gesendet wird; Header und Credentials sind ausgeschlossen. Credential-Fehler und Abbrüche vor dem Dispatch erzeugen kein Event, während spätere HTTP- oder Response-Fehler die versuchte Anfrage persistent halten.

### Fehler und Wiederherstellung

Fehler werfen `WebError` mit einem maschinell routbaren Code: eine fehlende Credential ist `WEB_PROVIDER_CREDENTIAL_MISSING`, Abbruch durch den Aufrufer ist `WEB_ABORTED`, und Provider- oder Transportfehler — einschließlich einer Antwort ohne `web_search_tool_result`-Block — sind `WEB_PROVIDER_ERROR`. HTTP-Redirects werden abgelehnt, bevor das `Location`-Ziel kontaktiert wird. Jeder Fehler nach dem Dispatch nennt den aufgelösten Such-Endpoint und erklärt, dass die Such-Endpoint-Konfiguration von der Chat-Konfiguration getrennt ist. Ist der Endpoint unbeabsichtigt, weist die Meldung das Konversationsmodell an, den Benutzer zum Endpoint-Feld unter Settings > Plugins > Plugin configuration > Web search zu führen und die Änderung zu speichern. Wenn diese Seite nicht verfügbar ist, nennt sie `DEEPSEEK_SEARCH_BASE_URL` und `web-search-deepseek.baseURL` als Deployment-Konfigurationsalternativen. Das Modell darf den Endpoint nicht auswählen oder ändern. Das modellseitige `web_search`-Tool zeigt diesen Text in seinem eigenen Error-Wrapper.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter dem Provider; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designphilosophie

Der Provider baut auf zwei Verpflichtungen auf:

- **Nur strukturierte Blöcke.** DeepSeek führt die Suche serverseitig aus und gibt strukturierte `web_search_tool_result`-Blöcke zurück; der Provider parst diese Blöcke und kratzt niemals URLs aus Modellprosa. Im strikten Modus wirft eine Antwort ohne solchen Block `WEB_PROVIDER_ERROR`, statt zu degradieren.
- **Eine Credential, pro Suche aufgelöst.** Der Provider nutzt die `DEEPSEEK_API_KEY`-Referenz wieder (kein neues Secret), aber nicht `$DEEPSEEK_BASE_URL`, weil die Suche die Anthropic-kompatible Messages-API spricht. Ein gemounteter Credentials-Service ist maßgeblich; ohne einen fällt der Provider auf die Umgebung des startenden Prozesses zurück. Auflösung pro Aufruf bedeutet, dass ein auf der Web-Models-Seite gespeicherter oder rotierter Schlüssel die nächste Suche ohne Neustart erreicht.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: Config-Schema, Installation der Settings-Sektion, Optionsprojektion pro Suche |
| [`src/provider.ts`](src/provider.ts) | Der `DeepSeekSearchProvider`: Messages-Request-Dispatch, Block-Parsing, Zitations-Zusammenführung, Credential-Auflösung |
| [`src/types.ts`](src/types.ts) | Anthropic-Wire-Typen für die Suchantwort |
| — | Es wird kein Runtime-Invariant-Begleiter publiziert; das Paket emittiert ein Pre-Dispatch-Log-Event, besitzt aber kein späteres maßgebliches Dispatch-Event, zu dem es in Bezug gesetzt werden könnte. Exakte Envelope-Gleichheit wird stattdessen an der Provider-Grenze gepinnt. |

### Request-Fluss

Jede Suche projiziert die aktuelle Settings-Sektion in Provider-Optionen — Endpoint, Modell, Schlüsselreferenz, Limits —, löst dann die Credential-Referenz über `ctx.credentials` (oder die Umgebung) auf, hängt das Log-only-Session-Event an und dispatched die Messages-Anfrage mit dem nativen `web_search`-Server-Tool. Die `web_search_tool_result`-Blöcke der Antwort werden zu `sources[]`; `cited_text`-Einträge aus Textblöcken werden ihren URLs als Snippets zugeordnet; Ergebnisse werden per URL dedupliziert; und der Service erzwingt die angeforderte Quellen-Obergrenze auf dem Rückweg.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn der Paket-Vertrag nicht ausreicht. Sie führen vom gemeinsamen Vokabular zum Service, den modellseitigen Tools und der Designbegründung.

- [Web-Subsystem](../../../docs/subsystems/web.de.md) — das erschöpfende Such-Request-/Result-Vokabular und die Fehlercodes.
- [Web-Paketkarte](../README.de.md) — die Sechs-Pakete-Familie und jede Rolle.
- [dsh-web](../web/README.de.md) — der Web-Service, in den sich dieser Provider registriert.
- [dsh-tool-web](../tool-web/README.de.md) — das modellseitige `web_search`-Tool, das die Quellen dieses Providers rendert.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-web-search-deepseek) — jedes akzeptierte Config-Feld und seine Quelldeklaration.
- [Web-Capability-Seam-Beschluss](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.de.md) — warum Suche und Fetch einen Provider-Auswahl-Service teilen.

-----

<a id="model-experience"></a>
## Model Experience

### Hilfsanfrage an die DeepSeek-Suche

#### Was das Modell sieht

Ein separates DeepSeek-Modell empfängt exakt `Perform a web search for the query: <query>` als User-Text und eine native `web_search`-Server-Tool-Definition. Diese Anfrage ist nicht Teil des Kontexts des Konversationsmodells.

#### Token-Effekt

Separate Provider-Input- und -Output-Token fallen pro Suche an; `maxTokens` begrenzt die generierte Ausgabe und `maxUses` begrenzt die nativen Suchnutzungen.

#### KV-Cache-Effekt

Unabhängig vom Cache der Konversationsanfrage. Die Hilfsanweisung und die native Tool-Definition können ein stabiles Präfix bilden, aber jede geänderte Query oder Modellroute verhindert die Wiederverwendung ab ihrer ersten Differenz.

### Konversations-Tool-Ergebnis, indirekt

#### Was das Modell sieht

Über `dsh-tool-web` sieht das Konversationsmodell deduplizierte URLs, Titel, Daten und Zitations-Snippets aus strukturierten Suchblöcken; Provider-Prosa wird nicht als Antwort vertraut. Die exakten Fehler dieses Providers umfassen die umsetzbare Missing-Credential-Meldung, `DeepSeek search credential resolution failed: <error>` und `DeepSeek search aborted`. Request-, HTTP-, Native-Search- und Response-Body-Fehler hängen den aufgelösten Endpoint und die oben beschriebene bedingte Konfigurationsanweisung an. Der Error-Wrapper gehört dem Consumer.

#### Token-Effekt

Null direkte Konversations-Token aus der Registrierung. Ergebnis-Token skalieren mit zurückgegebenen Quellen und Snippets, dann erzwingt der Service die angeforderte Quellen-Obergrenze.

#### KV-Cache-Effekt

Append-only; neu sichtbarer Inhalt folgt auf das wiederverwendbare Anfrage-Präfix und macht bestehende KV-Cache-Einträge nicht ungültig.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann der Provider teuer oder unvollständig ist. Sie sind aktuelle Paket-Einschränkungen.

- **Eine Suche kostet einen vollständigen Messages-Modell-Turn** — Latenz plus generierte Token, mit bis zu `maxUses` serverseitigen Suchen; DeepSeek bietet keinen dedizierten Retrieval-Endpoint.
- **Dynamische Credential-Verfügbarkeit löst innerhalb der Operation auf** — die synchrone Verfügbarkeitsprüfung kann feststellen, dass ein Resolver existiert, aber keinen asynchronen Credential-Store befragen, sodass ein ausgewählter schlüsselloser Provider die Suche mit `WEB_PROVIDER_CREDENTIAL_MISSING` scheitern lässt; das stabile `web_search`-Schema bleibt registriert.
- **Überzählig zurückgegebene Quellen kosten trotzdem Token** — ohne Ergebnisanzahl-Regler im Wire-Format wird `maxResults` nur nachträglich durch Service-Kürzung erzwungen.
- **Unzitierte Ergebnisse tragen kein `snippet`** — eine Quelle erhält nur dann eines, wenn eine Textblock-Zitation (`cited_text`) zu ihrer URL passt.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: offene Fragen und unentschiedene Richtungen. Sie ist ausdrücklich nicht maßgeblich — ausgeliefertes Verhalten, Grenzen und Begründungen stehen in den Abschnitten oben und den verlinkten Agent Notes.

#### Zukunft: dedizierter Retrieval-Endpoint

Ein nativer DeepSeek-Such-Endpoint, der den vollständigen Modell-Turn vermeidet, würde die dominierenden Kosten beseitigen; bis DeepSeek einen solchen anbietet, bleibt dieser Provider ein Messages-Call-Adapter.

</details>
