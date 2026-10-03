---
description: "Der Web-Access-Service (ctx.web): wie Deployments und Plugin-Autoren über austauschbare Provider das Web durchsuchen und URLs abrufen, mit einer Auswahl-Policy und einem Error-Vokabular."
kind: "package-reference"
---

# @deepseek-ai/dsh-web
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Verwende `dsh-web`, um das Web zu durchsuchen oder eine URL abzurufen, ohne Aufrufer an einen bestimmten Vendor zu binden. Es wählt für jede Operation ein nutzbares Backend und gibt Aufrufern konsistente Cancellation, Fehler und Ergebnis-Obergrenzen. Wähle es für Plugins oder Tools, die `ctx.web.search()` oder `ctx.web.fetch()` aufrufen; die ausgelieferten `dsh-tool-web`-Tools laden es für dich. Eine Suche oder ein Fetch erfordert einen konfigurierten, nutzbaren Provider, da dieses Paket selbst keine Netzwerk-Requests stellt.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Modell-Erfahrung](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev-Notiz](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Eine Komposition, die Web-Zugriff braucht, lädt den `dsh-web`-Service und mountet mindestens ein Backend — einen Search-Provider und/oder einen Fetch-Provider — und Plugin- oder Tool-Autoren rufen dann `ctx.web.search()` und `ctx.web.fetch()` direkt auf. Der Service löst das Backend für jeden Aufruf auf, sodass Aufrufer nie Provider-IDs sehen, es sei denn, sie haben eine konfiguriert.

### Wann es wählen

Wähle den Service, wenn ein Plugin oder Tool suchen oder fetchen muss, ohne einen Vendor hartzukodieren; ein Deployment, das nur die ausgelieferten `web_search`/`web_fetch`-Tools nutzt, bekommt ihn kostenlos über `dsh-tool-web`. Du brauchst ihn nicht, wenn die Komposition das Web nie erreicht. Der Service fügt keinen eigenen Netzwerkzugang hinzu: Ohne mindestens einen nutzbaren Provider schlägt jeder Aufruf mit einem strukturierten `WebError` fehl.

### Minimale Konfiguration

Lade den Service und lass ein einzelnes gemountetes Backend sich automatisch auswählen, oder pinne eine Provider-ID mit `searchProvider`/`fetchProvider`. Die Umgebungsvariablen `$DSH_WEB_SEARCH_PROVIDER` und `$DSH_WEB_FETCH_PROVIDER` speisen dieselben Felder und sind keine separate Prioritätskette.

```yaml
- name: '@deepseek-ai/dsh-web'
- name: '@deepseek-ai/dsh-web-search-exa'
- name: '@deepseek-ai/dsh-web-fetch-http'
```

| Feld | Default | Bedeutung |
|---|---|---|
| `searchProvider` | (unset) | Gepinnte Search-Provider-ID; unset wählt automatisch, wenn genau einer nutzbar ist |
| `fetchProvider` | (unset) | Gepinnte Fetch-Provider-ID; unset wählt automatisch, wenn genau einer nutzbar ist |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-web) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Suchen und Fetchen

`search()` führt eine Query aus und liefert eine optionale Provider-Antwort plus eine Liste zitierbarer Quellen; der Service erzwingt `request.maxResults`, indem er `sources[]` kürzt und `truncated` setzt. `fetch()` ruft eine URL ab und liefert ihre finale URL, den Status-Code, den dekodierten Body und ein Truncation-Flag; eine Nicht-2xx-Antwort ist ein Ergebnis, kein Fehler.

```text
// Search the web; sources[] is capped to maxResults:
const result = await ctx.web.search({ query: 'deepseek harness', maxResults: 8 })

// Fetch one URL; a non-2xx response is a result, not an error:
const page = await ctx.web.fetch({ url: 'https://example.com' })
```

Beide Aufrufe akzeptieren ein optionales `AbortSignal`, das zur Cancellation an den Provider weitergeleitet wird. Die normalisierten Request- und Result-Formen sind der Vertrag, auf dem Aufrufer aufbauen; der Vokabular-Abschnitt der [Web-Subsystem](../../../docs/subsystems/web.de.md)-Referenz beschreibt sie erschöpfend.

### Provider-Auswahl

Jeder Aufruf löst seinen Provider zur Ausführungszeit auf, und Registrierungs- oder Ladereihenfolge spielt nie eine Rolle. Eine konfigurierte Provider-ID gewinnt, wenn sie registriert und nutzbar ist; ohne konfigurierte ID führt der Service den einzigen nutzbaren Provider aus oder schlägt klar fehl:

| Situation | Ergebnis |
|---|---|
| konfigurierte ID registriert und nutzbar | führt diesen Provider aus |
| konfigurierte ID nicht registriert | `WEB_PROVIDER_CONFIGURED_MISSING` |
| konfigurierte ID registriert, aber nicht verfügbar | `WEB_PROVIDER_CONFIGURED_UNAVAILABLE` |
| keine ID, genau ein registrierter nutzbarer Provider | führt ihn aus |
| keine ID, kein nutzbarer Provider | `WEB_PROVIDER_UNAVAILABLE` |
| keine ID, mehrere nutzbare Provider | `WEB_PROVIDER_AMBIGUOUS` |

Die Verfügbarkeit eines Providers ist ein billiger lokaler Check — zum Beispiel, ob sein API-Key vorhanden ist — und stellt nie Netzwerk-Calls, sodass die Auswahl schnell und deterministisch bleibt.

### Fehler und Recovery

Fehler werfen `WebError` mit einem stabilen, maschinell routbaren Code; die Message ergänzt Details wie die fehlende Provider-ID oder die mehrdeutige Kandidatenmenge. Aufrufer routen auf dem Code und entscheiden, wie sie degradieren. Um zu ändern, welches Backend ein Aufruf nutzt, konfiguriere die gepinnte ID neu, mounte oder unmounte Provider oder korrigiere die Provider-Konfiguration, sodass sein Availability-Check besteht.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Design-Entscheidungen hinter dem Service; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designphilosophie

Das Paket baut auf einer bewussten Trennung auf:

- **Ein Seam, zwei unabhängige Operationen.** Search und Fetch teilen kein Request-Schema und keine Geschäftslogik, aber sie teilen einen Service, damit Provider-Auswahl, Cancellation, Fehler und Produkt-Konfiguration einen einzigen Besitzer haben. Die parallelen `Search`/`Fetch`-Methodenpaare sind absichtlich.
- **Auswahl ist nie reihenfolgeabhängig.** Eine Capability pinnt entweder eine Provider-ID oder wählt automatisch, wenn genau ein nutzbarer Provider registriert ist; `search()`/`fetch()` lösen den Provider zur Ausführungszeit auf.
- **Der Service besitzt die Ergebnis-Obergrenze.** `maxResults` wird vom Seam nach der Rückkehr des Providers erzwungen, sodass ein überliefernder Provider nie mehr Quellen leaken kann, als der Aufrufer angefragt hat.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: der `WebRuntime`-Service, beide Provider-Registries und die Auswahl zur Ausführungszeit |
| [`src/types.ts`](src/types.ts) | Vokabular: Request/Result-Typen, die geschlossene `WebFetchBody`-Union und die `WebError`-Taxonomie |
| — | Es wird kein Runtime-Invariant-Companion publiziert; Provider-Maps sind privat und Auswahl-/Ergebnis-Obergrenzen werden bei jedem Aufruf erzwungen; der Seam publiziert keine unabhängige Registry oder Request/Result-Observation-Stream. |

### Datenmodell

Die Request- und Result-Typen definieren das normalisierte Vokabular, auf dem Aufrufer aufbauen — ein `Search`-Paar und ein `Fetch`-Paar — und die erschöpfenden Felder und JSDoc liegen in [`src/types.ts`](src/types.ts) und der [Web-Subsystem](../../../docs/subsystems/web.de.md)-Referenz. Zwei bewusste Entscheidungen formen sie: `WebFetchBody` ist eine geschlossene Union (`html` | `text`), die hier besessen wird, sodass das Hinzufügen einer Variante die Kompilierung bricht, bis jeder Consumer sie behandelt; `WebError` erweitert `HarnessError` um einen offenen String-`code`, sodass Consumers provider-spezifische Werte tolerieren müssen. Source-Felder bleiben optional, weil nicht jeder Provider alle liefert.

### Auswahlfluss

Zur Aufrufzeit löst der Service den Provider auf — zuerst die konfigurierte ID, dann der einzig nutzbare Provider — und wirft den passenden `WebError`, wenn kein klarer Gewinner existiert. Ein Search-Ergebnis läuft dann durch `capSources`, das `sources[]` auf `maxResults` kürzt und `truncated` markiert. Registrierung ist effect-basiert: Provider registrieren sich am aufrufenden fiber und deregistrieren, wenn es disposed wird, und eine doppelte ID innerhalb einer Capability-Art wird bei der Registrierung abgelehnt.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Vertrag nicht ausreicht. Sie führen vom geteilten Vokabular zu den ausgelieferten Backends, den modellseitigen Tools und der Design-Begründung.

- [Web-Subsystem](../../../docs/subsystems/web.de.md) — die erschöpfenden Search/Fetch-Requests und -Results, Provider-Verfügbarkeit und Error-Codes.
- [Web-Paket-Karte](../README.de.md) — die Sechs-Paket-Familie und jede Rolle.
- [dsh-tool-web](../tool-web/README.de.md) — die modellseitigen `web_search`- und `web_fetch`-Tools über diesem Service.
- [dsh-web-fetch-http](../web-fetch-http/README.de.md) — das ausgelieferte anonyme HTTP(S)-Fetch-Backend.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-web) — jedes akzeptierte Config-Feld und seine Quell-Deklaration.
- [Web-Capability-Seam-Entscheidung](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.de.md) — warum Search und Fetch einen Provider-Auswahl-Service teilen.

-----

<a id="model-experience"></a>
## Modell-Erfahrung

Indirekt, über `dsh-tool-web`, das die normalisierten Search-Ergebnisse und Fetch-Bodies des Seam dem Modell rendert, während dieser Service kein Prompt und kein Schema beiträgt.

#### KV-Cache-Effekt

Keine direkte Invalidierung; der genannte Consumer besitzt alle Request-Prefix-Änderungen.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wo der Service allein unvollständig ist. Sie sind aktuelle Paket-Constraints.

- **Keine Observations-Oberfläche** — es gibt kein Provider-Change-Event und keine Capability-Status-Query; Verfügbarkeit ist nur beobachtbar, indem man eine Suche oder einen Fetch ausführt und den geworfenen Code routet, und der No-Provider-Fehler ist das generische `WEB_PROVIDER_UNAVAILABLE` ohne per-Provider-Grundaufzählung ([Agent Note](../../../.agents/notes/archived/simplification/2026-07-04-drop-unconsumed-web-observation-surface.md)).
- **Search-Requests tragen nur `query` und `maxResults`** — provider-neutrale Steuerungen (Recency, Domain-Filter, regionale Hinweise, Suchtiefe) sind zurückgestellt, bis die Backends sie erfüllen können ([Seam Agent Note](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.de.md)).
- **`WebFetchBody` hat keinen `pdf`-Zweig** — text-extrahierbare PDF-Unterstützung ist namentlich zurückgestellte Arbeit; die geschlossene Union macht das Hinzufügen zu einer kompilier-erzwungenen Änderung über die Web-Pakete hinweg.
- **Provider-gestützte Seiten-Extraktion liegt außerhalb von `fetch()`** — eine Firecrawl/Tavily-artige `web_extract`-Capability ist zurückgestellt statt die Fetch-Operation zu erweitern.

<a id="dev-note"></a>
### Dev-Notiz

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev-Notiz ist Arbeitskontext für Maintainer: offene Fragen und unentschiedene Richtungen. Sie ist explizit nicht autoritativ — ausgeliefertes Verhalten, Grenzen und Begründungen stehen in den Abschnitten oben und den verlinkten Agent Notes.

#### Zukunft: Provider-State beobachten

Es existiert kein Provider-Change-Event und keine Capability-Status-Query; Consumers beobachten Verfügbarkeit nur, indem sie einen Aufruf ausführen und den geworfenen Code routen. Ein kleine Observations-Oberfläche wiederherzustellen ist möglich, wenn ein Consumer per-Provider-Gründe braucht, aber die archivierte Simplification-Note hält fest, warum die frühere fallen gelassen wurde.

</details>
