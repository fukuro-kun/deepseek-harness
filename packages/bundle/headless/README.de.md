---
description: "Einmal-Task-Modus für dsh: einen einzelnen Task von der Kommandozeile ausführen und die finale Antwort ausgeben lassen — für Nutzer, die dsh skripten oder automatisieren."
kind: "package-bundle"
---

# @deepseek-ai/dsh-headless

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

`dsh-headless` führt einen dsh-Task von der Kommandozeile aus, gibt die finale Antwort aus und beendet sich — ohne GUI, ohne Server, ohne Browser. Geben Sie `dsh --profile headless "run the tests"` ein, und der agent arbeitet den Task mit denselben Modell-, Tool- und Sicherheitsvorgaben ab wie jede andere Oberfläche. Ideal für Skripte, CI und einmalige Jobs: Der Prozess öffnet keine Ports und hinterlässt nichts Laufendes. Der Exit-Code verrät das Ergebnis — 0 bei abgeschlossenem Task, 1 bei Abbruch oder Fehler. Die wichtigste Grenze: ein Task pro Aufruf, ohne interaktive Nachfrage.

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

Einen Task ausführen, die finale Antwort erhalten, beenden. Der Task ist die Kommandozeile selbst, daher ist der gesamte Aufruf das kleinste funktionierende Beispiel.

### Einen Einmal-Task ausführen

```sh
dsh --profile headless "run the tests"
```

Der agent arbeitet den Task ab, streamt jedes nicht-leere Reasoning-Delta des Providers unter einer `dsh: reasoning:`-Überschrift auf stderr, gibt dann die finale Antwort auf stdout aus und beendet sich. Aufeinanderfolgende Reasoning-Deltas bleiben in einem Abschnitt, und der Runner schließt diesen Abschnitt vor späterer Ausgabe, wenn der Provider keinen abschließenden Zeilenumbruch lieferte. Ein erfolgreicher Lauf ohne Reasoning lässt stderr leer; ein Fehlschlag endet mit Exit 1 und gibt `dsh: <code>: <message>` auf stderr aus. Ein fehlender oder leerer Task wird abgelehnt, bevor irgendetwas läuft. Der Task-Text wird über die einzige Einstellung `task` übergeben:

| Feld | Standard | Bedeutung |
|---|---|---|
| `task` | erforderlich | Der Task-Text für den einzelnen Lauf |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-headless) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Wann verwenden

Verwenden Sie headless für skriptgesteuerte oder automatisierte dsh-Läufe — CI-Schritte, Batch-Jobs, schnelle Antworten aus dem Terminal. Vermeiden Sie es, wenn Sie eine interaktive Session mit mehreren Turns oder eine GUI benötigen; dafür dient die Browser-Oberfläche ([dsh-web-app](../web-app/README.de.md)). Der Prozess lebt nur für den Lauf, öffnet keinen lauschenden Port und beendet sich selbst — er passt damit in Pipelines, die auf den Prozess warten.

### Hilfe und Task-Fehler

`dsh --profile headless --help` gibt den Hilfetext des Befehls aus und beendet sich, ohne etwas auszuführen. Ein fehlender oder nur aus Leerzeichen bestehender Task ist ein Aufruffehler: Es läuft nichts, und der Prozess endet mit Exit 1.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Der Runner ist ein direkter Treiber über dem Core-API-Träger: Er erzeugt einen frischen Agent über die Registry und faltet das eigene dauerhafte Ereignisintervall zu einem prozessweiten Ergebnis.

### Ablauf

Der Runner wartet die vollständige Anwendung ab (`ctx.get('loader')?.await()`), damit die komponierten Tools und Adapter nicht halb gemountet sind, liest die gemeinsame [`agentDefaultModel`](../../core/agent-default-model/README.de.md)-Auswahl, erzeugt einen frischen persistierten Agent mit diesem Provider und Modell und reicht den Task als gewöhnliche Benutzernachricht ein. Er streamt die nicht-leeren Reasoning-Deltas dieses Agent auf stderr, wartet auf quiescence, flusht dann die Session und faltet das eigene Intervall (ab `firstSeq`) auf den letzten nicht-leeren `assistant/message`-Text und die finale `turn/end`-Reason. Er schreibt den finalen Text auf stdout und fordert den Exit an.

### Patch-Oberfläche über base

Der Patch liegt über `dsh-base`: Er erbt den Projektions-Cache, setzt das Coding-Persona-Präfix und ein separates cwd-Suffix auf der Basis-`system-prompt`-Zeile, behält dasselbe temporäre prozessweite Opt-in für den PTC-Modus (`DSH_TOOLS_MODE`) wie die Web-Oberfläche, deaktiviert die gemeinsame HMR-Zeile, fügt den Worker des PTC-Modus als zentrale Ausführungs-Capability ein und mountet den Startup-Provider und den Runner. Der Cache legt für jede persistierte Einmal-Session einen Checkpoint für spätere Consumer an; seine Durability-Barriere flusht jedes abgedeckte Log-Präfix vor der Veröffentlichung der Cache-Zeile und kann sonst zusammengeführte JSONL-Läufe aufteilen. Der Startup-Provider ([`src/startup.ts`](src/startup.ts)) injiziert `ctx.cmdlineArgs` ([`dsh-cmdline`](../../boot/cmdline/README.de.md)), liest das Positionsargument, gibt das `--help` der App aus und stellt `headlessStartup` bereit; der Runner injiziert diesen Service und liest seinen Task aus der Lazy-Config.

### Exit-Mapping

Ein abgeschlossenes finales `turn/end` endet mit Exit 0; jedes andere Ergebnis — aborted, error oder kein Turn im eigenen Intervall — endet mit Exit 1. Eine `error`-Reason schreibt zusätzlich `dsh: <code>: <message>` auf stderr. Ein Fehler des direkten Treibers (etwa beim Erzeugen des Agent) schreibt `dsh: <message>` auf stderr und endet mit Exit 1.

### Quellcode-Übersicht

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Das `headless-runner`-Plugin: Ablauf, Ausgabevertrag, Exit-Mapping |
| [`src/startup.ts`](src/startup.ts) | Der `headless-startup`-Provider: Task-Positionsargument und `--help` |
| [`cordis.patch.yml`](cordis.patch.yml) | Der Einmal-Patch über `dsh-base` |
| — | Es wird kein Runtime-Invariant-Companion veröffentlicht; der beobachtbare Vertrag des Runners (Provider-Reasoning auf stderr, finaler Text auf stdout, Exit-Code nach Turn-End-Reason) ist prozessweit und gehört dem Launcher-e2e; er registriert nichts und hält keine mutable Beziehung, die im Baum geprüft werden müsste. |
| [`tests/headless.spec.ts`](tests/headless.spec.ts) | Ablauf, Aggregation, Flush und Exit-Mapping |
| [`tests/startup.spec.ts`](tests/startup.spec.ts) | Kommandozeilen-Parsing über einem realen Loader-Baum |

### Invarianten-Eigentümerschaft

Es wird kein Invariant-Companion veröffentlicht, weil der beobachtbare Vertrag des Runners (finaler Text auf stdout, Exit-Code nach Turn-End-Reason) prozessweit ist und dem Launcher-e2e gehört; das Plugin registriert nichts und hält keine mutable Beziehung, die im Baum geprüft werden müsste.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn Sie tiefer in den gemeinsamen Kern, die GUI-Schwester oder die Kommandozeilen-Übergabe einsteigen möchten.

- [Bundle-Paketkarte](../README.de.md) — die Oberflächen, die auf demselben Kern aufbauen.
- [dsh-base](../base/README.de.md) — der gemeinsame Kern, auf dem headless läuft.
- [dsh-web-app](../web-app/README.de.md) — das interaktive Browser-Geschwister für Arbeit über mehrere Turns.
- [dsh-cmdline](../../boot/cmdline/README.de.md) — wie der Launcher die Kommandozeile an die App übergibt.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-headless) — jedes akzeptierte Config-Feld und seine Quelldeklaration.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da der Runner den Task als gewöhnliche Benutzernachricht einreicht und die komponierten base- und headless-Zeilen die Prompts und Tools bereitstellen.

#### KV-Cache-Effekt

Der Runner fügt dem Anfrage-Präfix nichts hinzu; er treibt nur eine Benutzernachricht durch den komponierten Baum.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen zeigen, wann headless nicht passt und was es vom `dsh`-Launcher benötigt. Es sind aktuelle Paketbeschränkungen, kein allgemeiner CLI-Vergleich und kein Aufgabenrückstand.

- **Ein Task pro Lauf** — nach Beantwortung des Tasks beendet sich der Prozess; es gibt keine interaktive Nachfrage, also teilen Sie mehrstufige Arbeit auf mehrere Läufe auf.
- **Läuft über den `dsh`-Launcher** — das headless-Profil auf andere Weise zu starten schlägt beim Start fehl, weil nur der Launcher den Prozess-Exit anfordern kann.
- **Kein Heartbeat vor dem ersten Token** — stderr bleibt still, bis der Provider ein nicht-leeres Reasoning-Delta liefert; ein verzögertes erstes Token legt kein früheres Fortschrittssignal offen.
- **Reasoning landet in stderr-Logs** — Umleitungen und Supervisor können erheblich mehr und potenziell sensible Modellausgabe zurückbehalten; leiten Sie stderr bei Bedarf in eine kontrollierte Senke.
- **Nur Reasoning und die finale Antwort werden ausgegeben** — ein Lauf ohne assistant-Nachricht gibt eine leere stdout-Zeile aus und endet mit Exit 1; Zwischenausgaben von Tools werden nicht gedruckt.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
