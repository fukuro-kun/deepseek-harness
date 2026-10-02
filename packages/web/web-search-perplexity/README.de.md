---
description: "Der Perplexity-gestützte Search-Provider für ctx.web: wie Deployments OpenAI-kompatible Perplexity-Suche mit generierten Antworten und Zitationen mounten."
kind: "package-reference"
---

# @deepseek-ai/dsh-web-search-perplexity

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

Mit `dsh-web-search-perplexity` durchsucht der Harness das Web über Perplexity und erhält in einem Call eine modellgenerierte Antwort plus zitierfähige Quellen. Wählen Sie es, wenn ein Deployment einen Perplexity-API-Key besitzt und eine generierte Antwort möchte. Perplexity bietet keine Ergebnisanzahl-Kontrolle, daher werden die zurückgegebenen Quellen nachträglich auf die angeforderte Obergrenze gekürzt. Wenn Perplexity strukturierte Ergebnismetadaten weglässt, fallen Quellen auf reine URL-Zitationen zurück. Das modellseitige `web_search`-Tool lebt in `dsh-tool-web`.

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

Mounten Sie den Provider in einer Komposition, die den Web-Service bereits lädt; er registriert sich als `perplexity`-Search-Provider, sodass `ctx.web.search()` ihn automatisch auflöst, wenn er das einzige nutzbare Search-Backend ist — oder pinnen Sie ihn mit `searchProvider: perplexity`.

### Wann Sie ihn wählen

Wählen Sie dieses Backend, wenn ein Deployment einen Perplexity-API-Key besitzt und eine modellgenerierte Antwort plus zitierfähige Quellen in einer Suche möchte. Der Provider ist nicht verfügbar — und jeder Suchaufruf schlägt mit einem strukturierten Fehler fehl —, wenn der Key leer ist oder die Endpoint-Basis nicht geparst werden kann.

### Minimale Konfiguration

Laden Sie den Web-Service und den Provider; der API-Key fällt auf `$PERPLEXITY_API_KEY` aus der Startumgebung zurück, und alle anderen Einstellungen haben sichere Defaults.

```yaml
- name: '@deepseek-ai/dsh-web'
- name: '@deepseek-ai/dsh-web-search-perplexity'
  config:
    apiKey: !!js process.env.PERPLEXITY_API_KEY
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `apiKey` | `$PERPLEXITY_API_KEY` | Perplexity-API-Key; leer oder fehlend macht den Provider unverfügbar |
| `baseURL` | `https://api.perplexity.ai` | Endpoint-Basis; `/chat/completions` wird angehängt. Ein nicht parsbarer Wert macht den Provider unverfügbar |
| `model` | `sonar` | Name des Suchmodells |
| `maxTokens` | `1024` | Obergrenze für generierte Antwort-Tokens (`max_tokens`); muss eine positive Ganzzahl sein |
| `searchRecency` | (unset) | Als `search_recency_filter` gesendetes Aktualitätsfenster: `day`, `week`, `month` oder `year`. Unset sendet keinen Filter |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-web-search-perplexity) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Was eine Suche zurückgibt

`content` trägt Perplexitys generierte Antwort. `sources[]` bevorzugt das strukturierte `search_results[]` (`url`, `title`, `snippet`, `publishedAt` aus `date`) und fällt nur dann auf das reine URL-Array `citations[]` zurück, wenn `search_results` fehlt — deshalb sind `title`/`snippet`/`publishedAt` auf dem Service optional. Perplexity legt keine Ergebnisanzahl-Kontrolle offen, daher setzt der Service `maxResults` durch Kürzung und Markierung durch.

### Fehler und Wiederherstellung

Provider-Fehler — HTTP-Fehler, Netzwerkfehler, nicht parsbare oder falsch geformte Bodies — erscheinen als `WebError` `WEB_PROVIDER_ERROR`; ein abgebrochener Request erscheint als `WEB_ABORTED`. HTTP-Redirects werden abgelehnt, bevor das `Location`-Ziel kontaktiert wird, und erscheinen als `WEB_PROVIDER_ERROR`. Aufrufer routen auf den Code; das modellseitige `web_search`-Tool meldet Fehler dem Modell in seinem eigenen Error-Wrapper.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter dem Provider; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) abgedeckt.

### Designphilosophie

Der Provider ist ein dünner Adapter über Perplexitys Chat-Completions-Endpoint mit zwei bewussten Regeln:

- **Die generierte Antwort wird als `content` vertraut.** Anders als die anderen Search-Backends liefert Perplexity eine modellgenerierte Antwort, und dieser Provider reicht sie als normalisiertes `content`-Feld durch.
- **Strukturierte Quellen gewinnen; reine URL-Zitationen sind der Fallback.** `search_results[]` trägt die portablen Felder; `citations[]` trägt nur URLs, und das Service-Vokabular macht diese Felder genau für diesen Fall optional.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: Config-Schema, Umgebungs-Fallback, Provider-Registrierung |
| [`src/provider.ts`](src/provider.ts) | Der `PerplexitySearchProvider`: Request-Dispatch, Abort-Klassifikation, Antwort- und Quell-Mapping |
| [`src/types.ts`](src/types.ts) | Perplexity-Wire-Typen für die Chat-Completions-Antwort |
| — | Es wird kein Runtime-Invariant-Begleiter publiziert; dieses Paket legt keine unabhängige Event-Sequenz oder mutierbare Datenrelation über die an seinem besitzenden Seam durchgesetzten Verträge hinaus offen. |

### Request- und Mapping-Fluss

`search()` postet die Query mit Modell, Token-Obergrenze und optionalem Aktualitätsfilter an `{baseURL}/chat/completions` mit `redirect: 'error'`. Das `content` der Antwort wird zu `content`; `search_results[]` wird zu `sources[]`, falls vorhanden, andernfalls wird jeder `citations[]`-Eintrag zu einer reinen URL-Quelle; und der Service wendet die finale `maxResults`-Obergrenze auf dem Rückweg an. Ein Abort — eine `DOMException` namens `AbortError` — wird zu `WEB_ABORTED`; alles andere wird zu `WEB_PROVIDER_ERROR`.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der paketweite Vertrag nicht ausreicht. Sie bewegen sich vom geteilten Vokabular zum Service, den modellseitigen Tools und der Designbegründung.

- [Web-Subsystem](../../../docs/subsystems/web.de.md) — das erschöpfende Such-Request-/Ergebnis-Vokabular und die Fehlercodes.
- [Web-Paketkarte](../README.de.md) — die Sechs-Paket-Familie und jede Rolle.
- [dsh-web](../web/README.de.md) — der Web-Service, in den sich dieser Provider registriert.
- [dsh-tool-web](../tool-web/README.de.md) — das modellseitige `web_search`-Tool, das die Quellen dieses Providers rendert.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-web-search-perplexity) — jedes akzeptierte Config-Feld und seine Quelldeklaration.
- [Web-Capability-Seam-Entscheidung](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.de.md) — warum Suche und Fetch einen Provider-Auswahl-Service teilen.

-----

<a id="model-experience"></a>
## Model Experience

### Auxiliarer Perplexity-Request

#### Was das Modell sieht

Ein separates Perplexity-Modell empfängt `<query>` wortgetreu als seine einzige User-Message über den Chat-Completions-Endpoint. Dieser Request ist nicht Teil des Kontexts des Konversationsmodells.

#### Token-Effekt

Pro Suche fallen separate Provider-Tokens an; `maxTokens` begrenzt die generierte Antwort.

#### KV-Cache-Effekt

Unabhängig vom Konversations-Request-Cache. Eine identische Query unter derselben Modellroute kann Provider-Cache wiederverwenden; eine geänderte Query oder Route etabliert ein anderes Präfix.

### Konversations-Tool-Ergebnis, indirekt

#### Was das Modell sieht

Über `dsh-tool-web` sieht das Konversationsmodell die generierte Antwort plus strukturierte Ergebnismetadaten oder reine URL-Zitationen. Die exakten Fehler dieses Providers sind `Perplexity search aborted`, `Perplexity search request failed: <error>` und `Perplexity returned an unprocessable response body: <error>`; HTTP-Fehler bewahren die Provider-Nachricht. Der Error-Wrapper gehört dem Consumer.

#### Token-Effekt

Null direkte Konversations-Tokens aus der Registrierung. Antwort- und Quell-Tokens sind datenabhängig, die Quellanzahl ist service-begrenzt, und das zurückbehaltene Ergebnis oder der Fehler wird bis zur compaction erneut gesendet.

#### KV-Cache-Effekt

Append-only; neu sichtbarer Inhalt folgt dem wiederverwendbaren Request-Präfix und invalidiert keine bestehenden KV-Cache-Einträge.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Einschränkungen definieren, wann der Provider schlecht passt. Sie sind aktuelle Paket-Constraints.

- **Citation-Fallback-Quellen sind reine URLs** — wenn Perplexity strukturierte `search_results[]` weglässt, tragen Quellen kein `title`/`snippet`/`publishedAt`, sodass das Tool nackte Hostname-Labels rendert.
- **Überzählig zurückgegebene Quellen kosten weiterhin Tokens und Latenz** — ohne Ergebnisanzahl-Kontrolle auf dem Wire wird `maxResults` nur nachträglich durch Service-Kürzung durchgesetzt.
- **Nur `model`/`maxTokens`/`searchRecency` sind exponiert** — Perplexitys andere Suchsteuerungen (Domain-Filter, `web_search_options`-Kontextgröße, Bilder) warten auf provider-neutrale Service-Felder ([Seam-Agent-Note](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.de.md)).
- **Abort-Klassifikation ist fehlerform-basiert** — nur eine `DOMException` namens `AbortError` bildet auf `WEB_ABORTED` ab; ein Abort mit einem eigenen Grund (etwa `dsh-timeout`s `TimeoutReason`) erscheint als `WEB_PROVIDER_ERROR`.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: offene Fragen und unentschiedene Richtungen. Sie ist explizit nicht autoritativ — ausgeliefertes Verhalten, Einschränkungen und Begründungen leben in den Abschnitten oben und den verlinkten Agent Notes.

#### Zukunft: breitere Perplexity-Kontrolloberfläche

Perplexitys Domain-Filter, `web_search_options`-Kontextgröße und Bildunterstützung bleiben unexponiert. Sie zu exponieren braucht zuerst provider-neutrale Service-Felder, sodass die Familie eine koordinierte Steuerung statt eines herstellerspezifischen Arguments hinzufügt.

</details>
