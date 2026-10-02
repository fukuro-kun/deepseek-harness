---
description: "Anonyme Identität pro Harness-Home für Benutzer und Maintainer, die nachvollziehen, wie Telemetrie, Feedback-Bestätigungen und DeepSeek-Provider-Requests Datensätze korrelieren."
kind: "package-library"
---

# @deepseek-ai/dsh-anonymous-user-id

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

DeepSeek Harness verwendet pro Harness-Home eine anonyme Kennung, um Telemetrie, Feedback und DeepSeek-Requests derselben Installation zu korrelieren, ohne den Benutzer zu identifizieren. Die zufällige UUID liegt in `$DSH_HOME/.anonymous-user-id` (standardmäßig `~/.dsh`), übersteht Neustarts und wird neu erzeugt, nachdem du die Datei gelöscht hast. Unterschiedliche Harness-Homes nutzen unterschiedliche Kennungen, und der Wert enthält keine Maschinen- oder Account-Daten. Eingebaute Features erzeugen und hängen ihn automatisch an; Paket-Consumer können denselben Wert für installationsbezogene Korrelation wiederverwenden, aber keine Datensätze über Homes hinweg verknüpfen.

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

Wenn du willst, dass die Datensätze, die deine Installation aussendet, als von demselben Harness-Home stammend erkennbar sind — Telemetrie, Feedback und DeepSeek-Requests tragen alle dieselbe ID —, liefert dieses Paket sie. Es gibt nichts zu installieren oder zu konfigurieren: Die ID erscheint automatisch, und die ausgelieferten Feedback-, Telemetrie- und DeepSeek-Features verwenden sie bereits. Nutze sie nicht, um einen Benutzer zu identifizieren oder Datensätze über verschiedene Homes hinweg zu verknüpfen; sie ist anonym und an ein Home gebunden.

### Was die ID für dich tut

Drei Dinge, die deine Installation aussendet, tragen dieselbe ID, sodass die Datensätze über sie hinweg zusammenpassen:

- **Session-Telemetrie** — deine Telemetrie-Exporte tragen die ID als `user.id`-Resource-Attribut, sodass ein Collector die Datensätze einer Installation gruppieren kann.
- **Feedback** — jede Feedback-Bestätigung nennt die anonyme Installation, die sie aufgezeichnet hat.
- **DeepSeek-Requests** — jeder Provider-Request trägt den Header `x-deepseek-harness-user-id`, sodass Nutzung pro Installation zugeordnet werden kann.

### Die ID beobachten und zurücksetzen

Die ID liegt in `$DSH_HOME/.anonymous-user-id` (standardmäßig `~/.dsh`) als reine UUID-Textdatei. Lösche diese Datei, um beim nächsten Start eine frische ID zu bekommen; der laufende Prozess behält seine aktuelle ID bis zum Beenden. Getrennte Harness-Homes halten getrennte IDs, und in den Wert gehen niemals Maschinen- oder Account-Details ein.

### Im eigenen Paket verwenden

Wenn du ein Feature baust, das die anonyme ID der Installation teilen soll, importiere den Wert einmal und verwende ihn wieder — Telemetrie, Feedback und DeepSeek nutzen bereits dieselbe ID, sodass deine Datensätze mit ihren zusammenpassen:

```ts
import { getOrCreateAnonymousUserId } from '@deepseek-ai/dsh-anonymous-user-id'

const userId = getOrCreateAnonymousUserId() // stable for the process lifetime
```

Der Wert ist für den Prozess stabil und entspricht dem, was die eingebauten Features nutzen; er ändert sich nur, wenn die Datei gelöscht wird und ein späterer Start einen Ersatz erzeugt. Selbst wenn das Home-Verzeichnis nicht beschreibbar ist, funktioniert der Wert für den aktuellen Lauf, sodass die Datensätze weiterfließen.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter dem Paket und verweist auf den Code, der sie umsetzt; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designphilosophie

- **Zufällig, nie abgeleitet.** Die ID kommt von `crypto.randomUUID()`; sie wird nie aus Hostname, Netzwerkadresse, git remote oder einer anderen identifizierenden Quelle abgeleitet — Anonymität ist also eine Eigenschaft der Erzeugung.
- **Synchron und memoized.** Ein Prozess berührt die Platte einmal: Lese- und Schreibzugriffe sind synchron, und das Ergebnis wird pro aufgelöstem Dateipfad memoized.
- **Best-Effort-Persistenz.** Ein Schreibfehler liefert trotzdem eine nutzbare ID für den Lauf, sodass Telemetrie und Feedback nie an einem unbeschreibbaren Home blockieren.
- **Library, kein Plugin.** Es gibt keinen Cordis-Plugin-Eintrag und keine Config. Es wird kein Invariant-Companion veröffentlicht, weil das Paket keinen Event-Stream und keine öffentliche mutable Relation besitzt, die man vergleichen könnte, ohne als Nebeneffekt die ID zu erzeugen.

### Source Map

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Library-Einstieg: `getOrCreateAnonymousUserId`, Datei-Persistenz, Memoization pro Pfad |
| — | Es wird kein Runtime-Invariant-Companion veröffentlicht; die API besitzt ein privates Memo und eine Best-Effort-Datei, ohne eigenen Event-Stream oder öffentliche mutable Relation, die ein Companion vergleichen könnte, ohne die Identität als Nebeneffekt zu erzeugen. |
| [`tests/anonymous-user-id.spec.ts`](tests/anonymous-user-id.spec.ts) | Geprüftes Verhalten: Erzeugung, Persistenz, Korruption, Nebenläufigkeit, Memoization |

### Die API

Das Paket stellt eine Funktion bereit, die die anonyme ID der Installation zurückgibt und sie bei erster Nutzung erzeugt und persistiert; die genaue Signatur, Optionen und Defaults stehen in `src/index.ts`.

### Storage-Contract

Die Datei ist eine nackte UUID-Zeile, benannt über `ANONYMOUS_USER_ID_FILE_NAME`, und wird beim Lesen gegen ein UUID-Pattern validiert. Ein erster Schreiber nutzt exklusives Anlegen (`wx`); ein nebenläufiger Verlierer liest erneut und übernimmt den Wert des Gewinners. Eine korrupte oder unlesbare Datei fällt auf Erzeugen-und-Überschreiben durch. Die Memoization ist auf den aufgelösten Dateipfad gekeyed, sodass unterschiedliche Homes nie eine ID teilen.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Contract nicht ausreicht. Sie führen von der Identity-Gruppenkarte zur Home-Pfadauflösung, auf der dieses Paket aufbaut, und zu den Features, die die ID nutzen.

- [Identity-Gruppenkarte](../README.de.md) — die Schwesterpakete und der Gruppenumfang.
- [dsh-home-paths](../../util/home-paths/README.de.md) — besitzt die Auflösung von `$DSH_HOME` und `~/.dsh`.
- [dsh-session-telemetry-otel](../../session/session-telemetry-otel/README.de.md) — meldet die ID als OTel-Resource `user.id`.
- [dsh-command-feedback](../../feedback/command-feedback/README.de.md) — bettet die ID in die Feedback-Bestätigung ein.
- [dsh-llm-deepseek](../../llm/llm-deepseek/README.de.md) — sendet `x-deepseek-harness-user-id` bei Provider-Requests.
- [Session-Telemetrie-Subsystem](../../../docs/subsystems/session-telemetry.de.md) — der Telemetrie-Seam und sein Backend-Contract.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da die gemeinsame Kennung DeepSeek nur als model-unsichtbare HTTP-Metadaten erreicht und nichts Model-zugewandtes registriert.

#### KV-Cache-Effekt

Keiner; der Transport-Header ändert weder Tokens noch das model-sichtbare Präfix.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen beschreiben, wann die ID schlecht passt oder besondere Aufmerksamkeit braucht. Sie sind aktuelle Paket-Constraints, kein allgemeiner Vergleich von Anonymitätsansätzen und kein Aufgabenstapel.

- **Keine Wiederherstellung nach Löschung** — der Verlust der Datei erzeugt by design eine neue anonyme Identität; Wiederherstellung würde stabiles Ableitungsmaterial erfordern, das die Anonymität schwächt.
- **Best-Effort-Nebenläufigkeit** — ein Leser, der in das schmale Intervall zwischen dem exklusiven Anlegen eines nebenläufigen Prozesses und dem abgeschlossenen Schreiben fällt, kann für diesen Lauf eine andere In-Memory-UUID nutzen; spätere Starts konvergieren auf den persistierten Wert.
- **Keine Home-übergreifende Identität** — unterschiedliche `$DSH_HOME`-Werte lassen sich nicht korrelieren.
- **Konfigurierte DeepSeek-Gateways erhalten die ID** — `dsh-llm-deepseek` sendet den stabilen Header an seine aufgelöste `baseURL`, einschließlich Deployment-Overrides, unabhängig vom Telemetrie-Sharing-Modus.
- **Das Löschen der Datei setzt den laufenden Prozess nicht zurück** — die Memoization hält die ID des Laufs bis zum nächsten Start.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: offene Fragen und unentschiedene Richtungen. Sie ist ausdrücklich nicht maßgeblich — ausgeliefertes Verhalten, Grenzen und akzeptierte Begründungen liegen in den Abschnitten oben und im Paket-Code, und Schlussfolgerungen wandern dorthin, sobald sie sich stabilisieren.

#### Offen: Evolution des Dateiformats

Der Persistenz-Contract ist eine nackte UUID-Zeile ohne Versionsmarker. Einen zweiten Wert neben der ID hinzuzufügen oder die Zeile in einen Container zu packen, hat keine Migrationsgeschichte für bestehende Dateien; ein versioniertes Zeilenformat ist ein Weg, eine solche Änderung sicher zu machen.

#### Offen: Invariant-Beobachtungspunkt

Es wird kein Invariant-Companion veröffentlicht, weil keine Relation geprüft werden kann, ohne die ID als Nebeneffekt zu erzeugen. Ein zukünftiger Beobachtungspunkt könnte das erneute Lesen der persistierten Datei gegen die memoized ID vergleichen.

</details>
