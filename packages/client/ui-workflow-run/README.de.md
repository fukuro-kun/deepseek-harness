---
description: "Dauerhafter Workflow-Run-Conversation-Node für den dsh-Web-Client: rekonstruiert Top-Level-Workflow-Runs als eigenständige Chat-Nodes mit verschachtelter Member-Disclosure."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-workflow-run
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Verwende `dsh-client-ui-workflow-run`, um jeden dauerhaften Top-Level-Workflow-Run als eigenständigen Chat-Node zu untersuchen. Einen Run aufklappen zeigt seine Phasen, eine Phase aufklappen zeigt ihre Member; laufende, fehlgeschlagene, abgebrochene und unterbrochene Ebenen öffnen standardmäßig, während abgeschlossene Ebenen geschlossen bleiben. Ein laufender Member kann seine Child-Session nur öffnen, wenn sie zur aktuellen Session gehört und lokal verfügbar ist. Der Node zeigt nur Identitäten und Status; Skripte, Ausgaben, Fehler, Logs, Verbrauch, Topologie und Steuerungen bleiben außerhalb dieser Oberfläche.

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

Ein Top-Level-Workflow-Run über `dsh-tool-workflow` erscheint in der Conversation als eigener Node: Klappe den Run auf, um seine Phasen zu sehen, und klappe eine Phase auf, um ihre Member zu sehen. Phasengruppen stammen nur von gestarteten Membern, und die Abrechnung ändert den Status, ohne Member zu entfernen oder umzusortieren.

### Den Node navigieren

Der Run verwendet eine 32-Pixel-Zeile mit dauerhaften Chevrons, einem Inline-Statuspunkt und Statustext; Phasen verwenden Disclosure-Zeilen mit Titel und Member-Anzahl im Hauptbereich und einem festen Aggregat-Status-Ende; Member verwenden einen 16-Pixel-Punktslot, einen kürzenden Namensbereich und eine feste Statusspalte. Das Öffnen der Child-Session eines Members erfordert, dass der Member läuft, die Child-ID in der gewöhnlichen Session-Liste steht, die Zeile `origin: 'subagent'` trägt, ihr `parentId` die aktuelle Session ist und die Listenzeile noch läuft — Remote-, nur-adressierte, falsch-zugeordnete oder terminale Zeilen bleiben nicht interaktiv.

### Zustand und Abschluss

Der Abschluss aktualisiert den sichtbaren Status sofort, verzögert aber sein automatisches Zuklappen, solange der Fokus im Inhalt bleibt. Ein geschlossener Turn oder Step mit fehlenden Terminal-Events stellt den betroffenen Run oder Member als unterbrochen dar, ohne das Tool-Ergebnis zu ändern.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Der Node ist ein deterministisches Replay dauerhafter Session-Events: `tool-workflow/run-start` erstellt einen Context, keyed nach `runId`, und Member-Starts, Member-Enden und das Run-Ende aktualisieren diesen Context in Log-Reihenfolge. Ein Historien-Tail, der nur Updates enthält, bleibt ausstehend, bis eine ältere Seite den eindeutigen Start liefert, woraufhin Prepend, vollständiges Replay und Live-Append denselben Zustand erzeugen.

### Disclosure-Entscheidungen

Gewöhnliche Lauf-Updates bewahren die aktuelle Wahl, die erste abnormale Kante öffnet einmal, normaler Abschluss schließt einmal, und eine abgeschlossene Phase plus dem äußeren Run öffnen wieder, wenn ein neuer laufender Member unter demselben Phase-Key startet. Kommt ein ganzer neuer sauberer Zyklus in einem Render an, während der Run aktiv bleibt, endet die Phase gefaltet, aber der äußere Run öffnet einmal, um seine aktualisierte Zusammenfassung zu zeigen. `WorkflowRunPanel` besitzt die Phasen-Entscheidungen, sodass Schließen und Wiederöffnen des äußeren Runs sie nicht zurücksetzt; ein Renderer-Remount rekonstruiert jede Anfangswahl aus dauerhaften Fakten.

### Komposition

Das Paket registriert seine Definition, sein Locale-Dictionary und den `workflow-run`-Renderer als Cordis-Effects; das Entfernen des Client-Eintrags zieht alle drei Beiträge zurück. Das ausgelieferte Web-Bundle enthält das Plugin nach `ui-conversation` und `ui-tool`.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten behandeln den Tool-Seam, den Conversation-Host und die Tool-Präsentationsschicht.

- [tool-workflow](../../workflow/tool-workflow/README.de.md) — das Tool, das die vier `tool-workflow/*`-Session-Events besitzt.
- [ui-conversation](../ui-conversation/README.de.md) — die Chat-Oberfläche, die den `conversation.chat.node`-Slot beherbergt.
- [ui-tool](../ui-tool/README.de.md) — die Tool-Call-Präsentationsschicht, neben der dieser Node liegt.
- [Conversation-Subsystem](../../../docs/subsystems/conversation.de.md) — wie ein business-eigenes Feature einen Conversation-Node registriert.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da das Paket eine browserseitige UI-Plugin-Schicht ist, die dauerhafte Workflow-Einträge rendert, ohne den Modellkontext zu ändern.

#### KV-Cache-Auswirkung

Keine; dieses Paket setzt weder eine Provider-Anfrage zusammen noch sendet es eine.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, welche Runs Einträge erzeugen und was der Node freigibt; sie sind aktuelle Paketbeschränkungen.

- **Nur Top-Level-Aufrufe über `dsh-tool-workflow` erzeugen diese Einträge** — verschachtelte PTC-Modus-Aufrufe und direkte `WorkflowEngine`-Consumer tun es nicht.
- **Navigation ist bewusst live-only** — terminale Member bleiben zur Überprüfung sichtbar, aber dieser Node bietet nie einen Cold-Session-Öffner.
- **Der Node zeigt nur Run-, Phasen-, Member-Identität und Status** — Skripte, Ausgaben, Fehler, Logs, Verbrauch, statische Topologie und Steuerungen bleiben außerhalb dieser Oberfläche.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Begleiter veröffentlicht. Das Browser-Plugin trägt eine effect-eigene Conversation-Definition, einen keyed Renderer und ein Dictionary bei; Tests beweisen deren Disposal, und das Host-Tool-Paket besitzt die Invariante der dauerhaften Events.
