---
description: "Der Exa-gestützte Search-Provider für ctx.web: wie Deployments vendor-native Websuche mit portablen Snippets und Publikationsdaten mounten."
kind: "package-reference"
---

# @deepseek-ai/dsh-web-search-exa

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Mit `dsh-web-search-exa` durchsucht der Harness das Web über Exa und erhält vendor-native Ergebnisse mit portablen Snippets und Publikationsdaten. Wähle es, wenn ein Deployment einen Exa-API-Key hat und Exas Keyword- oder Neural-Suche will. Exa liefert keine generierte Antwort, daher tragen Ergebnisse kein `content` — nur zitierbare Quellen. Ein Ergebnis ohne nicht-leeres Highlight wird verworfen, sodass ein Aufruf weniger Quellen als angefordert zurückliefern kann. Das model-zugewandte Tool `web_search` liegt in `dsh-tool-web`.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Mounte den Provider in einer Composition, die den Web-Service bereits lädt; er registriert sich als `exa`-Search-Provider, sodass `ctx.web.search()` ihn automatisch auflöst, wenn er das einzige nutzbare Search-Backend ist — oder pinne ihn mit `searchProvider: exa`.

### Wann du es wählst

Wähle dieses Backend, wenn ein Deployment einen Exa-API-Key besitzt und Exas Keyword- oder Neural-Suche mit Highlight-Snippets und Publikationsdaten pro Ergebnis will. Der Provider ist nicht verfügbar — und jeder Search-Call schlägt mit einem strukturierten Fehler fehl —, wenn der Key leer ist oder die Endpoint-Basis nicht parst.

### Minimale Konfiguration

Lade den Web-Service und den Provider; der API-Key fällt auf `$EXA_API_KEY` aus der Start-Umgebung zurück, und alle anderen Einstellungen haben sichere Defaults.

```yaml
- name: '@deepseek-ai/dsh-web'
- name: '@deepseek-ai/dsh-web-search-exa'
  config:
    apiKey: !!js process.env.EXA_API_KEY
```

| Feld | Default | Bedeutung |
|---|---|---|
| `apiKey` | `$EXA_API_KEY` | Exa-API-Key; leer oder fehlend macht den Provider unverfügbar |
| `baseURL` | `https://api.exa.ai` | Endpoint-Basis; `/search` wird angehängt. Ein nicht parsbarer Wert macht den Provider unverfügbar |
| `searchType` | `auto` | Retrieval-Modus, gesendet als Exas `type`: `auto`, `keyword` oder `neural` |
| `numResults` | (unset) | Standard-Ergebnisanzahl, wenn ein Request kein `maxResults` trägt; muss eine positive Ganzzahl sein |
| `highlightsPerResult` | `1` | Pro Ergebnis angeforderte Highlight-Sätze (Exas `highlightsPerUrl`); muss eine positive Ganzzahl sein |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-web-search-exa) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Was eine Suche zurückgibt

Jedes Exa-Ergebnis mappt auf eine `WebSearchSource`: `url`, `title`, das erste nicht-leere Highlight als `snippet` und `publishedDate` als `publishedAt`; ein Ergebnis ohne Highlight hat kein portables Snippet und wird verworfen. Das `maxResults` eines Requests schlägt den konfigurierten `numResults`-Default und wird als Kosten- und Latenzoptimierung an Exa gesendet — die finale Grenze erzwingt der Service, der abschneidet und markiert. Exa liefert keine generierte Antwort, daher trägt das Ergebnis kein `content`.

### Fehler und Wiederherstellung

Provider-Fehler — HTTP-Fehler, Netzwerkfehler, nicht parsbare oder falsch geformte Bodies — erscheinen als `WebError` `WEB_PROVIDER_ERROR`; ein abgebrochener Request erscheint als `WEB_ABORTED`. HTTP-Redirects werden abgelehnt, bevor das `Location`-Ziel kontaktiert wird, und erscheinen als `WEB_PROVIDER_ERROR`. Aufrufer routen über den Code; das model-zugewandte `web_search`-Tool meldet Fehler an das Model unter seinem eigenen Error-Wrapper.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter dem Provider; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designphilosophie

Der Provider ist ein dünner Adapter über der Exa-API mit zwei bewussten Regeln:

- **Nur portable Snippets.** Eine Quelle erhält ein `snippet` nur aus einem echten Highlight; eines aus anderen Feldern zu erfinden würde den Seam zur Lüge machen, daher werden snippet-lose Ergebnisse ganz verworfen.
- **Keine erfundenen Antworten.** Exa liefert keine generierte Antwort, daher wird `content` weggelassen, statt Provider-Prosa zu fabrizieren, der das Model vertrauen könnte.

### Source Map

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: Config-Schema, Umgebungs-Fallback, Provider-Registrierung |
| [`src/provider.ts`](src/provider.ts) | Der `ExaSearchProvider`: Request-Dispatch, Abort-Klassifikation, Ergebnis-Mapping |
| [`src/types.ts`](src/types.ts) | Exa-Wire-Typen: `ExaSearchResponse`, `ExaResult`, `ExaError` |
| — | Es wird kein Runtime-Invariant-Companion veröffentlicht; dieses Paket stellt keine eigenständige Event-Sequenz oder mutable Datenrelation bereit, die über die an seinem besitzenden Seam erzwungenen Contracts hinausginge. |

### Request- und Mapping-Fluss

`search()` postet Query, Retrieval-Modus, Highlight-Anforderung und optionale Ergebnisanzahl an `{baseURL}/search` mit `redirect: 'error'`, sodass ein Redirect den Request fehlschlagen lässt, ohne das Ziel zu kontaktieren. Die geparsten `results[]` werden einzeln gemappt, snippet-lose Einträge verworfen, und der Service wendet die finale `maxResults`-Grenze auf dem Rückweg an. Ein Abort — eine `DOMException` namens `AbortError` — wird `WEB_ABORTED`; alles andere wird `WEB_PROVIDER_ERROR`.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Contract nicht ausreicht. Sie führen vom gemeinsamen Vokabular zum Service, den model-zugewandten Tools und der Designbegründung.

- [Web-Subsystem](../../../docs/subsystems/web.de.md) — das erschöpfende Search-Request/Ergebnis-Vokabular und die Fehlercodes.
- [Web-Paketkarte](../README.de.md) — die Sechs-Paket-Familie und jede Rolle.
- [dsh-web](../web/README.de.md) — der Web-Service, in den sich dieser Provider registriert.
- [dsh-tool-web](../tool-web/README.de.md) — das model-zugewandte `web_search`-Tool, das die Quellen dieses Providers rendert.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-web-search-exa) — jedes akzeptierte Config-Feld und seine Quelldeklaration.
- [Web-Capability-Seam-Entscheidung](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.de.md) — warum Search und Fetch einen Provider-Auswahl-Service teilen.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über `dsh-tool-web`, das die `maxResults`-begrenzten URLs, Titel, ersten Highlights und Publikationsdaten dieses Providers oder seine exakten Fehler `Exa search aborted`, `Exa search request failed: <error>` und `Exa returned an unprocessable response body: <error>` unter dem Error-Wrapper des Consumers beibehält.

#### KV-Cache-Effekt

Keine direkte Invalidierung; der genannte Consumer besitzt alle Änderungen am Request-Präfix.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann der Provider schlecht passt. Sie sind aktuelle Paket-Constraints.

- **Ein Ergebnis ohne nicht-leeres Highlight wird ganz verworfen** — es gibt kein portables Snippet zum Mappen, sodass weniger Quellen als angefordert zurückkommen können.
- **Nur `searchType`/`numResults`/`highlightsPerResult` sind exponiert** — Exas übrige Regler (livecrawl, category, Domain-/Datumsfilter, Volltext-Contents) warten auf provider-neutrale Service-Felder ([Seam-Agent-Note](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.de.md)).
- **Die Abort-Klassifikation basiert auf der Fehlerform** — nur eine `DOMException` namens `AbortError` mappt auf `WEB_ABORTED`; ein Abort mit eigenem Reason (etwa `dsh-timeout`s `TimeoutReason`) erscheint als `WEB_PROVIDER_ERROR`.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: offene Fragen und unentschiedene Richtungen. Sie ist ausdrücklich nicht maßgeblich — ausgeliefertes Verhalten, Grenzen und Begründungen liegen in den Abschnitten oben und den verlinkten Agent Notes.

#### Zukunft: breitere Exa-Kontrollebene

Exas livecrawl, category, Domain- und Datumsfilter sowie Volltext-Contents bleiben unexponiert. Sie zu exponieren braucht zuerst provider-neutrale Service-Felder, damit die Familie einen koordinierten Regler statt eines vendor-spezifischen Arguments hinzufügt.

</details>
