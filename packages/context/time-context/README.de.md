---
description: "Opt-in-Clock-Context pro Schritt mit aktueller Zeit, Browserzone und verstrichener Zeit, für Nutzer und Maintainer, die das Plugin aktivieren oder tunen."
kind: "package-reference"
---

# @deepseek-ai/dsh-time-context
[English](README.md) | [中文](README.zh.md) | Deutsch


## Überblick

`dsh-time-context` gibt dem Modell eine Uhr: Bei berechtigten Schritten hängt es eine dauerhafte, quellattribuierte Ablesung mit der aktuellen Zeit, der dem offenen Request zugeordneten Browserzone und der seit der vorhergehenden modelsichtbaren Nachricht verstrichenen Zeit an. Es hilft dem Modell, sonst unqualifizierte Datums- und Zeitangaben in der Browserzone des Nutzers zu interpretieren, und sagt ihm, dass es nachfragen soll, wenn die Zonenprovenienz gemischt oder fehlend ist. Das Plugin ist Opt-in: Standard-Compositions lassen es deaktiviert, und das Schedule-Web-Overlay mountet es. Ein positiver `refreshIntervalMs` reduziert, wie oft sich Ablesungen ansammeln; Weglassen oder `0` injiziert bei jedem berechtigten Schritt.

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

Mounte dieses Plugin, wenn das Modell unqualifizierte Datums- und Zeitangaben in der Zone des Nutzers interpretieren soll und eine request-lokale Browserzone verfügbar ist oder ein konfigurierter Fallback akzeptabel ist. Jede Injektion ist eine zusätzliche User-Role-Nachricht in der dauerhaften History; schedule sie mit `refreshIntervalMs`, wenn Ablesungen pro Schritt mehr sind, als die Konversation braucht.

### Was der Agent bekommt

Jede injizierte Ablesung hat drei Zeilen: einen ISO-förmigen Timestamp mit numerischem Offset und IANA-Zone, die Browserzonen-Policy für den Request und die verstrichene Dauer in kompakten Ganzzahl-Sekunden-Einheiten. Schritt 1 misst ab der letzten vorhergehenden modelsichtbaren Nachricht; spätere Schritte messen ab dem vorhergehenden Time-Context-Event im selben Turn. Eine fehlende Baseline meldet `unavailable`, und rückwärts laufende Wanduhrbewegung klemmt die verstrichene Zeit auf null.

### Konfiguration

Der minimale Mount braucht keine Konfiguration. Ein positiver `refreshIntervalMs` unterdrückt Injektionen, die innerhalb dieser Millisekunden nach der letzten liegen; Weglassen oder `0` injiziert bei jedem berechtigten eintrittsbereiten Pre-Step, dessen Signal noch nicht abgebrochen ist.

```yaml
- name: '@deepseek-ai/dsh-time-context'
  config:
    timeZone: Asia/Shanghai
```

| Feld | Default | Bedeutung |
|---|---|---|
| `timeZone` | Prozesszone | Fallback-Anzeigezone, wenn der offene Turn keine eindeutige Browserzone hat |
| `refreshIntervalMs` | `0` (jeder berechtigte Schritt) | Mindestmillisekunden zwischen dauerhaften Injektionen in einer Session |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-time-context) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Die Zone wählen

Enthält der offene Turn genau eine Host-validierte Browserzone, wird der Timestamp in dieser request-lokalen Zone formatiert. Bei fehlender oder gemischter Browserprovenienz formatiert die konfigurierte `timeZone` die Anzeige; lässt man sie weg, wird die Node-Prozesszone einmal beim Plugin-Load aufgelöst, und jeder explizite Fallback wird über `Intl.DateTimeFormat` validiert. Die aufgelöste Anweisung sagt dem Modell, unqualifizierte Datums- und Zeitangaben in der gewählten Zone zu interpretieren und den Nutzer um Klärung zu bitten, wenn die Provenienz gemischt oder nicht verfügbar ist.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Design des Plugins; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designkonzept

Das Plugin registriert voran einen `agent/pre-step`-Listener, der zuerst delegiert und eine quellbehaftete `UserMessage` anhängt, wenn eine Injektion fällig ist und die nachgelagerte Entscheidung den Schritt betritt. Jede Ablesung verwendet die exakte Snapshot-Quelle `{ kind: 'plugin', plugin: 'time-context', form: 'snapshot', sections: [{ name: 'time-context', text }] }`, und der Invarianten-Companion validiert diese Form, leitet die Browser-Policy des aktuellen Turns aus den originalen `user-rpc`-Nachrichten erneut ab und prüft Timestamp-Zone und verstrichene Baseline.

### Source-Map

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: Pre-Step-Listener, Fälligkeits-Scheduling, Ablesungs-Komposition |
| [`src/request-zone.ts`](src/request-zone.ts) | Browserzonen-Policy-Ableitung aus `user-rpc`-Quellen des offenen Turns |
| [`src/timestamp.ts`](src/timestamp.ts) | `Intl.DateTimeFormat`-Erstellung und Timestamp-Formatierung |
| [`src/invariant.ts`](src/invariant.ts) | Invarianten-Companion für den Snapshot-Vertrag |

### Hauptfluss

Wenn eine Injektion fällig ist, sampelt das Plugin die Wanduhr, leitet die Browserzonen-Policy aus den `user-rpc`-Nachrichten des offenen Turns ab, löst die Anzeigezone auf (request-lokal oder Fallback) und rendert die dreizeilige Ablesung. Das Scheduling mit positivem Intervall scannt rohe dauerhafte Session-Events nach der letzten plugin-attribuierten Nachricht — einschließlich einer durch Compaction verschatteten —, sodass der Zeitplan ein Resume ohne prozesslokalen Cache überlebt. Eine Ablesung zeichnet einen betretenen Schritt auf, keinen abgeschlossenen oder übertragenen Request; ein späterer Vorbereitungsfehler kann sie in der History zurücklassen.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der paketweite Vertrag nicht reicht. Sie führen von der Design-Entscheidung zu der Composition, die das Plugin mountet, und zur erschöpfenden Konfiguration.

- [Schedule-Nutzerhandbuch](../../../docs/user/guide/schedule.de.md) — der offizielle Konfigurationspfad zum Mounten dieses Plugins.
- [Context-Gruppenkarte](../README.de.md) — benachbarte Request-Context-Pakete.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-time-context) — jedes akzeptierte Config-Feld und seine Quelldeklaration.

-----

<a id="model-experience"></a>
## Model Experience

### Zeitkontext zur Vorbereitungszeit

#### Was das Modell sieht

Jede injizierte Nachricht enthält drei Zeilen. `<timestamp>` ist ein ISO-förmiger Timestamp mit numerischem Offset und IANA-Zone; Dauern verwenden kompakte Ganzzahl-Sekunden-Einheiten.

##### Erster Schritt

```markdown
Time sampled while preparing turn <turn>, step 1: <timestamp>
Browser time zone for this request: <iana-zone-or-mixed-or-unavailable-policy>.
Elapsed since the preceding model-visible message: <duration-or-unavailable>.
```

##### Spätere Schritte

```markdown
Time sampled while preparing turn <turn>, step <step>: <timestamp>
Browser time zone for this request: <iana-zone-or-mixed-or-unavailable-policy>.
Elapsed since the preceding step context: <duration-or-unavailable>.
```

#### Token-Effekt

Jede Ablesung akkumuliert, bis Compaction sie verschattet. Ein positives Intervall reduziert Zugänge; Weglassen oder `0` fügt bei jedem berechtigten Vorbereitungsversuch eine hinzu.

#### KV-Cache-Effekt

Nur append; neu sichtbarer Inhalt folgt dem wiederverwendbaren Request-Präfix und invalidiert keine bestehenden KV-Cache-Einträge.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann Clock-Context eine schlechte Wahl ist. Sie sind aktuelle Paket-Constraints.

- **Nur Prompt-Provenienz** — Browserzonen-Kontext leitet die natürlichsprachliche Interpretation, füllt aber nicht still ein von einem anderen Tool gefordertes Zonenfeld.
- **Gemischte Turns fragen nach** — enthält ein offener Turn Prompts aus verschiedener Browserzonen, wird dem Modell gesagt, zu klären statt zu raten, welcher Zone eine unqualifizierte Zeit gehört.
- **Fallback ist keine Nutzerautorität** — die konfigurierte oder die Prozesszone formatiert die Uhr, wenn Browserprovenienz fehlt oder gemischt ist, aber die modellseitige Policy sagt weiterhin: klären.
- **Ganzzahl-Sekunden-Anzeige** — Timestamps und Dauern lassen Subsekunden-Präzision weg, obwohl dauerhafte Event-Zeiten Millisekunden behalten.
- **History-Kosten zwischen Compactions** — Weglassen oder `0` behält eine Ablesung pro berechtigtem Versuch; ein positives Intervall reduziert diese Kosten, eliminiert sie aber nicht und kann einen späteren Request ohne frische Browserzonen-Anleitung lassen.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
