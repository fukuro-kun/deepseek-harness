---
description: "All-Messages-LLM-Session-Titel-Provider für Nutzer und Maintainer, die eine Titel-Strategie wählen oder die automatische Titelgenerierung debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-session-title-all-prompts-llm

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

`dsh-session-title-all-prompts-llm` fasst als optionaler `ctx.sessionTitle`-Provider jede berechtigte menschliche Nachricht über `ctx.llm` zusammen. Es registriert den `all-prompts`-Rhythmus und startet nach jedem neuen menschlichen prompt eine neue Revision, unter Verwendung der vorgegebenen History und von Child-Session-prompts. Eine neuere Revision bricht ältere Arbeit ab und ersetzt sie, und selbst ein Provider, der die Cancellation ignoriert, kann keine veraltete Ausgabe committen. Es verwendet die vollständige, erforderliche gemeinsame LLM-Konfiguration aus `dsh-session-title-llm`, sodass Route, prompt, Budget und Cancellation-Verhalten nicht driften können. Automatisches Verhalten und Konfiguration stehen vorne; die Implementierung ist eine dünne Registrierung über der gemeinsamen Policy.

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

Mounten Sie dieses Plugin neben dem Titel-Service, wenn eine Session beim Wachsen neu betitelt werden soll, sodass der Titel weiterhin die gesamte Konversation repräsentiert. Es erfordert die vollständige [gemeinsame LLM-Konfiguration](../session-title-llm/README.de.md#configuration) ohne Defaults.

### Wann Titel generiert werden

Nach jedem neuen berechtigten menschlichen prompt startet eine neue Revision, einschließlich prompts in Child-Sessions; die Generierung faltet alle berechtigten Nachrichten bis zur aktuellen Revision, einschließlich der vorgegebenen History. Eine neuere Revision bricht ältere Arbeit ab und ersetzt sie, sodass ein veraltetes Ergebnis niemals committen kann. Ein automatischer Fehlschlag — einschließlich Eingabe über `maxInputBytes`, die fehlschlägt statt die History zu kürzen — warnt und behält den bisherigen Titel; `ctx.sessionTitle.refresh()` ist das explizite Retry.

### Konfiguration

Das Plugin akzeptiert die vollständige, erforderliche [gemeinsame LLM-Konfiguration](../session-title-llm/README.de.md#configuration): `targetWords`, `targetCjkCharacters`, `maxInputBytes`, `maxOutputTokens`, `timeoutMs` und die optionale gepaarte `provider`/`model`-Route. Beide wegzulassen erbt die exakte Route aus jeder aktuell geloggten Hauptanfrage; beide zu setzen routet die Titelgenerierung unabhängig. Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-session-title-all-prompts-llm) ist die erschöpfende Quelle für jedes akzeptierte Feld.

### Fehler und Wiederherstellung

Überschreitet der final gerahmte Aggregat-prompt `maxInputBytes`, schlägt die Anfrage fehl, statt die History zu kürzen; automatische Nutzung warnt und behält den bisherigen Titel, und nur ein explizites `refresh()` wiederholt. Automatische Arbeit fügt der Haupt-agent-Anfrage keine tokens und keine Latenz hinzu.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Form des Plugins; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) abgedeckt.

### Designkonzept

Ein dünnes Provider-Plugin: Es registriert den `all-prompts`-Rhythmus mit einem Identitäts-Selektor über alle berechtigten Nachrichten und delegiert alles andere an die [gemeinsame LLM-Policy](../session-title-llm/README.de.md).

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: gemeinsames config schema, Provider-Registrierung mit dem All-Messages-Selektor |

### Scheduling

Der Titel-Service plant die automatische Arbeit: Beim `all-prompts`-Rhythmus startet jede neue berechtigte Nutzer-Nachricht eine Revision, und eine neuere Revision ersetzt ältere Arbeit; der Provider-Aufruf beginnt, nachdem die exakte Hauptanfrage-Route geloggt wurde.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Provider-Vertrag nicht ausreicht. Sie führen von der gemeinsamen Policy zum alternativen Rhythmus und zum Service, in den er eingehängt ist.

- [Gemeinsame LLM-Titel-Policy](../session-title-llm/README.de.md) — das Generierungs-Hilfsmodul, das dieser Provider nutzt.
- [First-Message-Titel-Provider](../session-title-first-prompt-llm/README.de.md) — der Rhythmus, der eine Session einmal aus ihrem ersten prompt betitelt.
- [Session-Titel-Service](../session-title/README.de.md) — Fallback-Verhalten, Umbenennen, Refresh und Provider-Registrierung.
- [Session-Paketkarte](../README.de.md) — benachbarte Persistenz-, Projektions-, Titel- und Telemetrie-Pakete.

-----

<a id="model-experience"></a>
## Model Experience

### All-Messages-Titel-Anfrage

#### Was das Modell sieht

Das Titel-Modell erhält die gemeinsame Titel-Instruktion und ein JSON-Array aller berechtigten menschlichen Nachrichten bis zur aktuellen Revision, in Log-Reihenfolge mit exakten seqs. Die vorgegebene History ist enthalten.

#### Token-Effekt

Nach jedem neuen berechtigten prompt kann eine Hilfsanfrage folgen, pro Anfrage durch `maxInputBytes` und `maxOutputTokens` begrenzt; explizite Refreshes können Aufrufe hinzufügen. Die Haupt-agent-Anfrage erhält null tokens.

#### KV-Cache-Effekt

Keine Hauptanfrage-Invalidierung. Die Hilfsanfrage-Eingabe wächst oder ändert sich nach jedem prompt, sodass Provider-spezifische Cache-Wiederverwendung am ersten geänderten JSON-token endet.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wie der Provider lange und heterogene Sessions behandelt. Sie sind aktuelle Paket-Constraints.

- **Kein Summarization-of-Summaries** — bei Eingabeüberlauf bleibt der bisherige Titel; dieser Provider hat kein Summarization-of-Summaries und keine Retention-Policy für sehr lange Sessions.
- **Nachrichten werden gleich behandelt** — er behandelt alle berechtigten menschlichen Nachrichten gleich und bietet keine Gewichtung, Filterung oder manuelle Titel-Priorität.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-invariant:** Es wird kein Begleitexport veröffentlicht. Dieser dünne Provider delegiert Request- und Result-Validierung an den gemeinsamen Titel-Service und das LLM-Hilfsmodul und hält keinen unabhängigen mutable State.
