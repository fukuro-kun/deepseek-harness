---
description: "Log-gestützte Session-Titel für Nutzer und Maintainer, die eine Titelquelle wählen, den Service konfigurieren oder Titelzustand debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-session-title

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Verwende `dsh-session-title`, um jeder Session einen client-sichtbaren Titel zu geben — aus der ersten zulässigen Human-Message, einem optionalen asynchronen Generator oder einer expliziten Nutzer-Umbenennung. Akzeptierte Titel überleben Replay, Resume und Paging, gelangen aber nie in den Modell-Input. Die automatische Generierung verzögert die Haupt-Agent-Antwort nie, und neuere Titel-Requests verdrängen ältere Arbeit. Wähle das Paket, wenn Clients persistente Titel mit konfigurierbaren Längenlimits und einen bewussten `refresh()`-Pfad zur Regenerierung brauchen.

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

Mounte den Service, um Sessions Titel zu geben, die Clients anzeigen können und die das Modell nie erreichen. Der übliche Pfad ist explizit: den Session-Store laden, den Service mit seinen erforderlichen Limits mounten und optional ein Provider-Plugin mounten.

### Eine Titelquelle wählen

Titel kommen aus drei Quellen, der neueste gewinnt. Der eingebaute Fallback leitet sich aus den führenden Wörtern der ersten zulässigen Human-Message innerhalb der konfigurierten Caps ab; ein registrierter Provider generiert einen Titel über zulässige Messages; ein explizites `rename()` akzeptiert einen nutzerseitigen Titel. Nur Text-Blöcke aus Human-`user/message`-Events sind zulässig, und leere oder nicht-textuelle Prompts warten auf späteren zulässigen Input. Ein nutzerseitiger neuester Titel pinnt die Session — spätere Nutzer-Messages planen keine automatische Revision, und ein explizites `refresh()` bleibt der bewusste Entpinn-Pfad.

### Minimale Konfiguration

Alle Limits sind erforderlich; die Library liefert keine Defaults. Mounte den Service mit den drei Grenzen:

```yaml
- name: '@deepseek-ai/dsh-session'
- name: '@deepseek-ai/dsh-session-title'
  config:
    fallbackMaxWords: 8
    fallbackMaxBytes: 96
    maxTitleBytes: 120
```

| Feld | Default | Bedeutung |
|---|---|---|
| `fallbackMaxWords` | erforderlich | Maximale whitespace-getrennte Wörter im deterministischen Fallback |
| `fallbackMaxBytes` | erforderlich | Maximale UTF-8-Bytes im Fallback; darf `maxTitleBytes` nicht überschreiten |
| `maxTitleBytes` | erforderlich | Maximale UTF-8-Bytes, die aus jeder Quelle akzeptiert werden |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-session-title) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Einen Provider hinzufügen

Ein optionaler asynchroner Provider kann über `ctx.sessionTitle.register(provider)` registriert werden; eine zweite Registrierung wirft. Die mitgelieferten modellgestützten Provider sind [first-prompt](../session-title-first-prompt-llm/README.de.md) und [all-prompts](../session-title-all-prompts-llm/README.de.md), beide nutzen die geteilte [LLM-Generierungspolicy](../session-title-llm/README.de.md). Ein Provider startet erst, wenn die exakte Route eines markierten, vom Loop gebauten Requests zum geloggten `request/header` passt, und eine neuere Revision verdrängt und bricht ältere Arbeit ab.

### Titel lesen

`get(session)` liest den zuletzt gefalteten Titel aus einer Live- oder replayten Session, und `foldSessionTitle(events)` ist der reine Fold über ein Log. Der Service erfordert `ctx.sessionProjections` und registriert zwei Units: die client-sichtbare `title`-Unit (der akzeptierte Titel-String für Client-Listenzeilen) und die host-only `titleInput`-Unit, die die erste und die neueste zulässige Message plus deren Anzahl faltet, sodass Scheduling und Fallback-Reads über `stateOf()` O(1) sind; das vollständige zulässige Präfix für eine Provider-Generierung wird zur Ausführungszeit aus dem Session-Log gescannt. Ein explizites `refresh(session)` materialisiert bei Bedarf den Fallback und führt dann den registrierten Provider explizit über die aktuellen zulässigen Messages aus.

### Fehler und Wiederherstellung

Automatische Fehler warnen und behalten den neuesten Titel; ein explizites `refresh()` rejected bei Provider-Fehlern oder Caller-Cancellation, und Cancellation rollt ein bereits akzeptiertes Fallback-Event nicht zurück. Automatische Arbeit verzögert die Haupt-Agent-Antwort nie, ihr später Abschluss hängt ein eigenständiges log-only Event an, ohne einen Turn zu öffnen, und ein stale Abschluss kann nicht anhängen. Forks erben Titel-Events unverändert in ihrem Seed.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Titel-Design; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig abgedeckt.

### Designkonzept

Titel sind persistenter, log-only Zustand: Jede akzeptierte Revision ist ein `session/title`-Event, und `foldSessionTitle()` wählt die neueste, sodass ein Titel Replay, Resume und Paging genau wie jedes andere Session-Event überlebt. Der Service besitzt Scheduling, Verdrängung und Akzeptanz; Provider besitzen die Generierung.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Service: Config, Fold, Fallback-Scheduling, Provider-Registry, Concurrency, `title`-Projection-Unit |
| [`src/normalize.ts`](src/normalize.ts) | Titel-Text-Bereinigung, UTF-8-sichere Truncation und der deterministische Fallback |
| [`src/types.ts`](src/types.ts) | Ein Heimatort der `title`-Projection-Key-Deklaration |

### Lifecycle und Concurrency

Der Pro-Session-Arbeitszustand verfolgt einen Revisionszähler, einen laufenden Fallback sowie schwebende und aktive Provider-Arbeit. Eine neuere Nutzer-Message, Provider-Disposal, Session-Disposal oder ein explizites Refresh bricht ältere Arbeit über einen `AbortController` ab; ein Abschluss, dessen Provider, Revision, Session oder Signal stale ist, kann nicht anhängen. Explizite Refreshes reservieren ihre Revision vor der Provider-Arbeit; überlappende automatische und explizite Fallback-Requests teilen einen session-lokalen laufenden Append. Das Service-Teardown cancelt gequeuete Arbeit und lässt Aufrufe auslaufen, die Cancellation ignorieren, bevor das Unloading abschließt.

### Normalisierung

Akzeptierte Titel werden von terminalen Control-Sequenzen, directional und invisible Controls sowie non-whitespace C0/C1-Controls bereinigt; Whitespace wird normalisiert, und die Truncation auf die Byte-Caps teilt nie einen Unicode-Codepoint. Der deterministische Fallback nimmt die führenden Wörter der ersten zulässigen Message innerhalb von `fallbackMaxWords` und `fallbackMaxBytes`.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Service-Vertrag nicht ausreicht. Sie bewegen sich von der Subsystem-Referenz zu den modellgestützten Providern, die hier einstecken.

- [Session-Title-Subsystem](../../../docs/subsystems/session-title.de.md) — persistenter Titelzustand und die Provider-Vocabulary-Typen.
- [Geteilte LLM-Titelpolicy](../session-title-llm/README.de.md) — der modellgestützte Generierungshelfer, den beide mitgelieferte Provider nutzen.
- [First-Message-Titel-Provider](../session-title-first-prompt-llm/README.de.md) — Titel aus der ersten zulässigen Human-Message.
- [All-Messages-Titel-Provider](../session-title-all-prompts-llm/README.de.md) — Titel aus jeder zulässigen Human-Message.
- [Session-Paketkarte](../README.de.md) — benachbarte Persistence-, Projection-, Title- und Telemetry-Pakete.

-----

<a id="model-experience"></a>
## Model Experience

### Session-Titel-Zustand

#### Was das Modell sieht

Nichts. `session/title` ist log-only und gelangt nie in die Session-Surface, `deriveMessages()`, den System-Prompt, Tool-Schemas oder das Request-Präfix.

#### Token-Effekt

Der Fallback und akzeptierte Provider-Revisionen fügen dem Haupt-Agent-Request null Tokens hinzu. Der separate Hilfs-Request eines optionalen Providers ist im jeweiligen Provider-Paket dokumentiert.

#### KV-Cache-Effekt

Keiner für den Haupt-Request; Titel-Events ändern weder seinen rekonstruierten Inhalt noch seinen Cache-Key.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, was der Titel-Service nicht leistet. Es sind aktuelle Paket-Constraints.

- **Kein Titel-Löschen, keine Suche, kein Listen-Indexing** — Entpinnen zurück zu automatischen Titeln ohne explizites `refresh`, Suche und Listen-Indexing liegen außerhalb dieses Service.
- **Maximal ein Provider** — die Registry akzeptiert bewusst eine einzige Implementierung, sodass ein Deployment keine konkurrierenden Titelstrategien komponieren kann, ohne einen Provider zu schreiben, der deren Vorrang besitzt.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
