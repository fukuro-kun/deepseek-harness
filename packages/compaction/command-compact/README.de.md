---
description: "Der On-Demand-Befehl /compact für interaktive Kompositionen: was er tut, was du siehst und wie man ihn mountet."
kind: "package-reference"
---

# @deepseek-ai/dsh-command-compact
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

`dsh-command-compact` fügt Chat-UIs einen `/compact`-Befehl hinzu: Tippe ihn ein und die Unterhaltung wird auf Abruf verdichtet — der ältere Verlauf wird durch eine Zusammenfassung ersetzt, noch bevor der automatische Druck auslöst. Der Befehl funktioniert mit jedem Compaction-Backend und verbraucht keine Modell-Turn; nach Abschluss siehst du, wie viele Verlaufseinträge verdichtet wurden und wie viele Token geschätzt eingespart wurden. Läuft der Agent gerade in einem Turn oder läuft bereits eine Verdichtung, meldet er, dass Compaction nicht verfügbar ist. Prompts, die du während des Laufs sendest, bleiben in der Warteschlange und starten erst nach dem Ende.

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

Tippe `/compact` in einer Chat-UI, wenn die Unterhaltung lang geworden ist und du sie sofort verdichten willst. Die ausgelieferte `dsh`-Basis mountet den Befehl neben dem Standard-Backend, sodass er meist bereits verfügbar ist.

### Den Befehl verwenden

| Eingabe | Ergebnis |
|---|---|
| `/compact` | Verdichtet auch unterhalb des automatischen Drucks einen sinnvollen, ausgewogenen älteren Abschnitt und meldet anschließend die Anzahl der ersetzten Verlaufseinträge und die geschätzten Token. |
| `/compact` ohne verdichtbaren Verlauf | `No compactable history yet.` — nichts ändert sich. |
| `/compact <anything>` | `Usage: /compact (no arguments)` — der Befehl nimmt keine Argumente. |

### Was du siehst

Der Befehl wandelt jeden erwarteten Fehler in eine stabile Meldung um, die du direkt anzeigen kannst; die Situation links hat die Meldung rechts erzeugt.

| Situation | Meldung, die du siehst |
|---|---|
| Compaction läuft bereits oder der Agent ist mitten in einem Turn | `Compaction is unavailable because this process has an active compaction, or the agent is not idle.` |
| Der Verlauf hat sich während der Verdichtung geändert | `The history selected for compaction changed before it could be replaced. The conversation is unchanged; the attempt is recorded in the session log.` |
| Es konnte keine brauchbare Zusammenfassung erzeugt werden | `Compaction could not produce a useful summary. The conversation is unchanged; the attempt is recorded in the session log.` |
| Die Verdichtung endete nicht sauber | `Compaction did not finish cleanly; some session history may have changed. Inspect the current session state before retrying.` |
| Die Unterhaltung konnte nicht gespeichert werden | `Compaction finished, but the session could not be saved.` |

Das Abbrechen des Befehls beendet das Warten: Das Backend führt seine erforderliche Bereinigung durch, der Befehl endet als `Compaction cancelled.` und die UI hört auf zu warten. Fehler außerhalb dieser erwarteten Fälle werden als Fehler gemeldet und nicht stillschweigend umgewandelt.

### Den Befehl komponieren

Mounte die Befehls-Registry, ein Compaction-Backend und dieses Plugin:

```yaml
- id: commands
  name: '@deepseek-ai/dsh-commands'
- id: compaction-basic
  name: '@deepseek-ai/dsh-compaction-basic'
- id: command-compact
  name: '@deepseek-ai/dsh-command-compact'
```

Die ausgelieferte `dsh`-Basis mountet ihn neben dem Standard-Backend, und der Web-Client stellt den Befehls-Adapter bereit. Automatisierungs-Oberflächen ohne komponierten Befehls-Adapter behalten nur die automatische Verdichtung.

### Was mit der Unterhaltung geschieht

Bei Erfolg wird der ausgewählte ältere Abschnitt durch eine Zusammenfassung ersetzt und der jüngere Verlauf bleibt unberührt; der Befehl meldet die Anzahl der verdichteten Einträge und die geschätzten Token. Prompts, die du während des Laufs absendest, werden angenommen und starten erst nach dem Ende — sie gehen weder verloren noch werden sie umsortiert. Der Befehls-Lebenszyklus wird im Session-Log aufgezeichnet, gelangt aber nie in die Modell-History.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter dem Befehl; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designphilosophie

Der Befehl baut auf drei Verpflichtungen auf:

- **Backend-unabhängige Steuerung.** Der Handler hängt nur von `compactNow(agent, signal)` ab und funktioniert daher mit jeder `CompactionEngine`-Implementierung. Der aufrufende Agent ist das exakte Ziel, und das Abbruchsignal der auslösenden UI wird durch den seam weitergereicht.
- **Der Befehls-Lebenszyklus bleibt außerhalb der Modell-History.** `command/run` und `command/done` sind reine Log-Ereignisse; `sourceEventSeq` korreliert das Ergebnis bei Erfolg mit dem `compaction/summary`-Ereignis, ohne auf Text oder Zeilennachbarschaft angewiesen zu sein.
- **Stillstehender Teardown.** Der Lifecycle-Effekt meldet `/compact` ab, bevor bereits gestartete Handler abgewartet werden, sodass die Abschluss- und Flush-Arbeit eines abgebrochenen Befehls vor Abschluss des Root-Disposals abgeschlossen ist.

### Lebenszyklus und Korrelation

Jede abgeschlossene Ausführung zeichnet das executor-eigene Log-Only-Paar `command/run` / `command/done` auf; keines der Ereignisse gelangt in die Modell-History. Bei Erfolg benennt `command/done.sourceEventSeq` das `compaction/summary`-Ereignis der Transaktion, sodass eine Präsentation den Befehls-Lebenszyklus in ihren Checkpoint einordnen kann, ohne Ergebnistext zu parsen oder benachbarte Zeilen anzunehmen. Das Busy-Ergebnis ist bewusst prozessbezogen: Eine aktive ungepaarte Markierung blockiert, eine Markierung, die älter ist als das neueste `session/end-seed`, gilt als veraltet und blockiert nicht. Das Plugin verfolgt jedes echte Handler-Promise und meldet `/compact` ab, bevor es bereits gestartete Handler abwartet, sodass der Root-Teardown die Abschluss- oder Flush-Grenze eines abgebrochenen Befehls nicht überschreiten kann. Während der Compaction abgesendete Prompts bleiben im normalen FIFO des Agents angenommen und starten erst nach dem expliziten Durability-Checkpoint der Compaction und der Freigabe der Reservierung; bei Leerlauf injizierter Kontext darf zwischen `compaction/start` und `compaction/end` liegen und bleibt nach dem Checkpoint sichtbar.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `/compact`-Registrierung, Argumentablehnung, Fehlercode-Mapping, Lifecycle-Drain |
| — | Es wird kein Runtime-Invariant-Begleiter veröffentlicht; dieser Befehls-Adapter besitzt keinen Zustand und keinen Event-Stream; der Compaction-seam besitzt die ausgewogene dauerhafte Transaktion und die Befehls-Registry besitzt Registrierungs- und Dispatch-Lebenszyklus. |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paketvertrag nicht ausreicht; sie führen vom Befehl zum seam, zum ausgelieferten Backend und zu den Designentscheidungen.

- [Compaction-seam](../compaction/README.de.md) — der Verdichtungsvertrag, den dieser Befehl auslöst.
- [Compaction-Basic-Backend](../compaction-basic/README.de.md) — das ausgelieferte Backend, das automatisch und auf Abruf verdichtet.
- [Commands-Paket](../../interaction/commands/README.de.md) — Registry- und Dispatch-Vertrag hinter Chat-Befehlen.
- [Compaction-Subsystem-Referenz](../../../docs/subsystems/compaction.de.md) — Verdichtungsvokabular, Ergebnisse und Service-Verhalten.
- [Queued-Manual-Compaction-Agent-Note](../../../.agents/notes/implemented/feature/2026-07-30-queued-manual-compaction.de.md) — wie On-Demand-Verdichtung gegenüber laufenden Turns serialisiert.

-----

<a id="model-experience"></a>
## Model Experience

### Menschliche `/compact`-Steuerung

#### Was das Modell sieht

Die Slash-Eingabe und das direkte Ergebnis gelangen nie in einen Modell-Request. Eine angenommene Compaction ersetzt zusätzlich einen älteren Abschnitt durch den User-Role-Checkpoint des Backends innerhalb eines eigenen `compaction/* { turn: null }`-Rahmens.

#### Token-Wirkung

Der Befehls-Lebenszyklus fügt keine Modell-Token hinzu. Eine erfolgreiche Compaction reduziert spätere Requests, indem sie den ausgewählten Abschnitt durch eine gerahmte Zusammenfassung ersetzt; das Zusammenfassen selbst ist ein Hilfsrequest.

#### KV-Cache-Wirkung

Discovery und Befehlsbuchhaltung beeinflussen den Cache nicht. Die angenommene Ersetzung invalidiert die Wiederverwendung ab dem ersten verdeckten Verlaufstoken.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen beschreiben, wann der Befehl ungeeignet ist; sie sind die aktuellen Paketbedingungen.

- **Nur im Leerlauf** — `/compact` meldet, dass die Verdichtung nicht verfügbar ist, wenn ein Turn oder ein bereits angenommener weckender Prompt Vorrang hat; der Befehl selbst wird nicht eingereiht.
- **Keine Bereichs- oder Policy-Argumente** — die argumentfreie Form hält das Verhalten über alle Befehls-Adapter stabil. Explizite Bereiche bleiben der programmatische Pfad `compactRegion()`.
- **Nur Befehls-Adapter** — Oberflächen ohne `ctx.commands` können ihn nicht aufrufen und verlassen sich auf automatische Druck-Compaction.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer und ausdrücklich nicht maßgeblich; das ausgelieferte Verhalten steht in den Abschnitten oben, im Paketcode und in den verlinkten Agent Notes.

- **Queued Befehle, unentschieden** — ein `/compact`, das eingereicht wird, während ein Turn Vorrang hat, meldet `busy`; das Einreihen statt Ablehnen bleibt eine offene Richtung.
- **Bereichs- und Policy-Argumente, unentschieden** — die argumentfreie Stabilität ist beabsichtigt; zusätzliche Argumente bräuchten eine gemeinsame Grammatik über alle Befehls-Adapter.

</details>
