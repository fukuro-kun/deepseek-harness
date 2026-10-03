---
description: "Goal-Oberfläche für die Web-GUI: der Composer-Kontext-Streifen, der das aktuelle Goal anzeigt und es bearbeitet, pausiert, fortsetzt oder löscht; für Nutzer und Maintainer des Goal-Erlebnisses."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-goal

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Die Goal-Oberfläche der Web-GUI zeigt sowohl den dauerhaften Goal-Zustand als auch seine aktuelle prozesslokale Aktivierung und lässt Nutzer das Goal bearbeiten, pausieren, fortsetzen oder löschen; abgelehnte Änderungen erscheinen inline. Sie stellt dauerhafte `/goal`-Runs als `Command input`-Bubbles dar, damit Befehle von Nutzern oder vom Modell nach einem Reload sichtbar bleiben. Das Erstellen von Goals liegt außerhalb dieses Pakets. Alle ausgelieferten Web-Presets außer `minimal` stellen Agents `/goal` zur Verfügung.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Entwicklerhinweis](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Dieses Plugin zusammen mit `ui-conversation` und dem Goal-Domain-Paket mounten; der Streifen erscheint dann als zweite Karte im Composer-Kontext-Stack (nach Todo, vor Queue), sobald die Session ein Goal hat. Ein scharfes aktives Goal bietet Pause an; ein aktives, aber entschärftes oder pausiertes Goal bietet Fortsetzen an; Bearbeiten schreibt das Objective um; Löschen entfernt das Goal und unterdrückt den Streifen, bis die Projektion nachzieht.

### Die Command-Input-Bubble

Jeder dauerhafte `/goal`-Run projiziert als rechtsbündige Bubble im Nutzerstil mit dem Label `Command input` (oder `指令输入`), gerendert vor der generischen Command-Result-Zeile; das führende `/goal`-Token rendert als Command-Reference-Chip im Code-Schnitt über `projectUserText` aus ui-primitives, und das Objective bleibt einfacher Fließtext. Sie trägt weder Zeitstempel noch Kopier- oder Branch-Aktionen, und ein Reload rekonstruiert sie aus dem Run.

### Fehler

Eine abgelehnte Mutation zeigt den Remote-Fehler inline am Streifen; ladende, abwesende, abgeschlossene und erfolgreich gelöschte Goals rendern nichts.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Das dauerhafte Goal trifft über `useProjection('goal')` ein (geseedet von der History-Tail-Seite und aktualisiert durch `session/projection`-Frames). Die Inject-Face trägt eine registrant-private Activation-Hook-Quelle plus die vier Mutationsverben. Diese Quelle startet nur, solange der Framework-Hook sie beobachtet, liest `ctx.remote.goals.get`, abonniert `goal/activation-changed` und refresht bei Running-State- oder Connection-Resets. Live-Event-Epochen invalidieren laufende Reads, sodass ein veraltetes HTTP-Ergebnis keine neuere Activation-Kante überschreiben kann; Running-Refreshes behalten die zuletzt bekannte Activation, bis der Read aufgelöst ist. Der Streifen besitzt weder einen Domain-Store noch einen pluginübergreifenden Cache. Jede Mutation liest zum Aufrufzeitpunkt die CAS-Ref aus dem aktuell projizierten Wert der Session, und das Compare-and-Set des RPC ist die Staleness-Absicherung. Der Streifen serialisiert Mutationen synchron per Single-Flight, weil ein ausstehendes Rendering Klicks im selben Frame nicht abfangen kann. Die Command-Input-Projektion ist eine eigene Conversation Definition, die einen `command-input`-Chat-Node vor dem generischen Command-Result-Node baut; sie erzeugt niemals `user/message` oder eine Model-Turn.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn die Goal-Oberfläche nicht ausreicht. Sie führen vom Browser-Streifen zur Goal-Domain und den Slots, die sie füllt.

- [dsh-goal](../../goal/goal/README.de.md) — die Goal-Domain, Projektion und der `/goal`-Befehl, den diese Oberfläche liest und mutiert.
- [ui-conversation](../ui-conversation/README.de.md) — deklariert den `conversation.input.dock`-Slot und besitzt den Composer.
- [Client-Paketübersicht](../README.de.md) — benachbarte Browser-UI-Pakete.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über die Mutationen `goals/edit`, `goals/pause`, `goals/resume` und `goals/clear`, die der Streifen routet; der Host-GoalService besitzt die modellsichtbare Goal-Kontextnachricht, die diese Mutationen einreihen.

#### KV-Cache-Effekt

Keiner, es sei denn, der eingereihte Goal-Kontext wird zugelassen. Ein zugelassener Kontext verlängert den History-Tail wie jede andere Nachricht; eine vor der Zulassung verworfene Einfügung berührt den Cache nicht.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren die aktuelle Goal-Oberfläche. Sie sind gegenwärtige Paket-Constraints, kein Goal-Domain-Vergleich und kein Aufgabenrückstand.

- **Preset-unabhängiger Host-Zustand** — das Umschalten einer aktiven Session auf `minimal` lässt ihr Host-eigenes Goal intakt. `/goal` und die Goal-Tools verschwinden, während dieser Streifen das Goal weiterhin bearbeiten, pausieren, fortsetzen oder löschen kann.

<a id="dev-note"></a>
### Entwicklerhinweis

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Laufzeit-Invariante:** Es wird kein Companion veröffentlicht. Eine einzige GoalBar-Dock-Registrierung, deren Disposal durch die HMR-Safety-Spec bewiesen ist — dauerhafter Zustand trifft über die Goal-Projektion ein, prozesslokale Activation über die private Hook-Quelle des Eintrags, und diese Quelle abonniert nur, solange der Framework-Hook sie beobachtet.
