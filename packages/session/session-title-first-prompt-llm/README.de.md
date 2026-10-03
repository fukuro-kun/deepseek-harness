---
description: "First-Message-LLM-Session-Titel-Provider für Nutzer und Maintainer, die eine Titel-Strategie wählen oder die automatische Titelgenerierung debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-session-title-first-prompt-llm
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

`dsh-session-title-first-prompt-llm` fasst als optionaler `ctx.sessionTitle`-Provider die erste berechtigte menschliche Nachricht über `ctx.llm` zusammen. Es registriert den `first-prompt`-Rhythmus, läuft automatisch nur dann, wenn eine frische, nicht geforkte Session zum ersten Mal ihren Fallback erstellt, und attributiert das Ergebnis auf die exakte seq dieser Nachricht. Ein automatischer Fehlschlag behält den Fallback und wird nur über `ctx.sessionTitle.refresh()` wiederholt. Es verwendet die vollständige, erforderliche gemeinsame LLM-Konfiguration aus `dsh-session-title-llm`, sodass Route, prompt, Budget und Cancellation-Verhalten nicht driften können. Automatisches Verhalten und Konfiguration stehen vorne; die Implementierung ist eine dünne Registrierung über der gemeinsamen Policy.

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

Mounten Sie dieses Plugin neben dem Titel-Service, wenn eine Session aus ihrer ersten berechtigten menschlichen Nachricht betitelt werden soll. Es erfordert die vollständige [gemeinsame LLM-Konfiguration](../session-title-llm/README.de.md#configuration) ohne Defaults.

### Wann Titel generiert werden

Die automatische Generierung läuft nur für eine frische Session ohne Parent und ohne bisherigen Titel: Nach ihrer ersten berechtigten menschlichen Nachricht wird der Fallback erstellt, und eine Hilfsanfrage fasst diese Nachricht zusammen. Spätere prompts, explizite Umbenennungen durch den Nutzer und geerbte fork-History lösen keinen weiteren automatischen Aufruf aus. Ein automatischer Fehlschlag behält den Fallback; `ctx.sessionTitle.refresh()` ist das explizite Retry. Forks behalten ihren geerbten Titel und lassen diesen Provider niemals automatisch laufen, selbst wenn ihre vorgegebene erste Nachricht vom Parent stammte.

### Konfiguration

Das Plugin akzeptiert die vollständige, erforderliche [gemeinsame LLM-Konfiguration](../session-title-llm/README.de.md#configuration): `targetWords`, `targetCjkCharacters`, `maxInputBytes`, `maxOutputTokens`, `timeoutMs` und die optionale gepaarte `provider`/`model`-Route. Beide wegzulassen erbt die exakte Route aus der aktuell geloggten Hauptanfrage; beide zu setzen routet die Titelgenerierung unabhängig. Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-session-title-first-prompt-llm) ist die erschöpfende Quelle für jedes akzeptierte Feld.

### Fehler und Wiederherstellung

Eine fehlschlagende Generierung — eine fehlende Route vor jeder Hauptanfrage, Eingabe über `maxInputBytes`, Timeout, Cancellation oder ungültige Modellausgabe — warnt und behält den aktuellen Titel; nur ein explizites `refresh()` wiederholt. Automatische Arbeit fügt der Haupt-agent-Anfrage keine tokens und keine Latenz hinzu.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Form des Plugins; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) abgedeckt.

### Designkonzept

Ein dünnes Provider-Plugin: Es registriert den `first-prompt`-Rhythmus mit einem Selektor, der die erste berechtigte Nachricht nimmt, und delegiert alles andere an die [gemeinsame LLM-Policy](../session-title-llm/README.de.md).

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: gemeinsames config schema, Provider-Registrierung mit dem First-Message-Selektor |

### Scheduling

Der Titel-Service plant die automatische Arbeit: Beim `first-prompt`-Rhythmus startet er eine Revision nur, wenn die Session keinen Parent hat, genau eine berechtigte Nachricht enthält und noch keinen Titel trägt; der Provider-Aufruf beginnt, nachdem die exakte Hauptanfrage-Route geloggt wurde, und eine neuere Revision ersetzt ältere Arbeit.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Provider-Vertrag nicht ausreicht. Sie führen von der gemeinsamen Policy zum alternativen Rhythmus und zum Service, in den er eingehängt ist.

- [Gemeinsame LLM-Titel-Policy](../session-title-llm/README.de.md) — das Generierungs-Hilfsmodul, das dieser Provider nutzt.
- [All-Messages-Titel-Provider](../session-title-all-prompts-llm/README.de.md) — der Rhythmus, der nach jedem neuen prompt neu betitelt.
- [Session-Titel-Service](../session-title/README.de.md) — Fallback-Verhalten, Umbenennen, Refresh und Provider-Registrierung.
- [Session-Paketkarte](../README.de.md) — benachbarte Persistenz-, Projektions-, Titel- und Telemetrie-Pakete.

-----

<a id="model-experience"></a>
## Model Experience

### First-Message-Titel-Anfrage

#### Was das Modell sieht

Das Titel-Modell erhält die gemeinsame Titel-Instruktion und ein JSON-Array, das nur die erste berechtigte menschliche Nachricht enthält. Spätere prompts und geerbte fork-History lösen keinen weiteren automatischen Aufruf aus.

#### Token-Effekt

Für eine frische Session wird höchstens eine automatische Hilfsanfrage gestellt, begrenzt durch `maxInputBytes` und `maxOutputTokens`; explizite Refreshes können weitere Aufrufe stellen. Die Haupt-agent-Anfrage erhält null tokens.

#### KV-Cache-Effekt

Keine Hauptanfrage-Invalidierung. Die Hilfsanfrage nutzt die konfigurierte oder geloggte Route und hat Provider-spezifisches Cache-Verhalten.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann dieser Provider aufhört, die Session zu repräsentieren. Sie sind aktuelle Paket-Constraints.

- **Die erste Nachricht kann veralten** — die erste Nachricht allein kann aufhören, eine langlaufende Session zu repräsentieren; verwenden Sie den All-Messages-Provider, wenn spätere prompts neu betiteln sollen.
- **Forks betiteln niemals automatisch neu** — ein fork behält seinen geerbten Titel und lässt diesen Provider niemals automatisch laufen, selbst wenn seine vorgegebene erste Nachricht vom Parent stammte.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-invariant:** Es wird kein Begleitexport veröffentlicht. Dieser dünne Provider delegiert Request- und Result-Validierung an den gemeinsamen Titel-Service und das LLM-Hilfsmodul und hält keinen unabhängigen mutable State.
