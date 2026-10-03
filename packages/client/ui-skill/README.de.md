---
description: "Web-skill-Referenzen und die dedizierte skill-Tool-Zeile für den dsh-Web-Client: die durch `/` ausgelöste skill-Quelle und die skill-Aufrufkarte."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-skill
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

`dsh-client-ui-skill` lässt Nutzer einen skill aufrufen, indem sie ihn aus den `/`-Vorschlägen wählen oder `/name` direkt eingeben. Derselbe literale Befehl lädt den skill konsistent aus dem Web-Composer, dem TUI und ACP, während ein Name, den er mit einem Host-Befehl teilt, weiterhin als dieser Befehl aufgelöst wird. skill-Aufrufe erscheinen in der Konversation als aufklappbare `Instructions`-Karten, deren abgerechnete Inhalte stabil bleiben, wenn sich der installierte skill-Katalog ändert.

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

Gib `/` im Composer ein und wähle einen skill aus den Vorschlägen, oder gib `/name` direkt ein; die gesendete Nachricht trägt den literalen Text, und der Host lädt den skill bei einer Menüauswahl genauso wie bei einem handgetippten token. Ein Name, den er mit einem Host-Befehl teilt, wird weiterhin zum Befehl aufgelöst — die Adjudikation beansprucht die Zeile client-seitig, bevor sie überhaupt zu einem prompt wird.

### Was die Quelle anbietet

Die Kandidaten einer normalen Session kommen vom `skills/list`-Remote; der Host liefert jeden vom Nutzer aufrufbaren skill, und ein `modelInvocable: false`-Eintrag (ein `disable-model-invocation`-skill, dessen einziger Einstiegspunkt dieser Pfad ist) trägt die Nur-Nutzer-Markierung als Beschreibungspräfix in der aktiven Sprache. Die Ergebnisse werden über den gemeinsamen Namens-Ranker des `/`-Menüs sortiert, `rankByName` aus ui-primitives: Die Abfrage matcht eine case-insensitive geordnete Teilsequenz des skill-Namens, Präfix-Treffer ranken zuerst, und bei Gleichstand bleibt die Host-Reihenfolge bestehen ([Ranking-Entscheidung](../../../.agents/notes/archived/feature/2026-08-04-web-slash-command-fuzzy-discovery.md)). Ein fehlgeschlagener `skills/list`-Aufruf wird geloggt und in eine stille Menügruppen-Streichung überführt — das Menü zeigt nur pending/ready-Zustände.

### Die skill-Tool-Zeile

Eine eingeklappte Zeile rendert das skill-Glyph, den `Skill`-Titel und den angeforderten skill-Namen; laufende Aufrufe tragen den transcript-Shimmer, Fehler ersetzen den Namen durch die erste Fehlerzeile, und unterbrochene Aufrufe verwenden den Warnzustand. Eine abgerechnete Zeile klappt zu einer begrenzten `Instructions`-Karte auf, die die exakte dauerhafte Tool-Ausgabe enthält, mit der Standard-Trajectory-`Inspect`-Affordance, sofern verfügbar. Die Zeile leitet ihren Namen, ihren Lifecycle und ihren Body ausschließlich aus dem eingefrorenen call/result-Slice ab, den ui-tool liefert, niemals aus dem aktuellen Katalog, sodass Replay stabil bleibt, wenn sich installierte skills oder ihre Beschreibungen ändern.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Die Quelle implementiert keine Adjudikations-Hooks und keinen Referenz-Codec: Die Auswahl liefert literalen Text, und der prompt versendet denselben Literal, sodass die Deterministik host-seitig liegt ([Slash-Pipeline-Notiz](../../../.agents/notes/archived/architecture/2026-07-25-web-input-machine-and-slash-pipeline.md)).

### Kandidatenfluss

Kataloge cachen pro normaler Session mit einem Single-Flight-Fetch; der `warm`-Hook beim Scope-Birth wärmt den Eintrag der Session vor, das weitergeleitete Owner-Event `agent-preset/selected` verwirft genau diesen Session-Eintrag (der Katalog gehört zum preset, und eine leere Session kann nach dem warm wechseln), und `connection/reset` leert alles. Katalog-adressierte fortsetzbare subagents lösen lokal keine skill-Kandidaten auf, weil der bestehende skill-RPC eine angehängte Session erfordert; das Ansehen ihrer persistierten Historie darf sie nicht aktivieren. Der Listen-RPC läuft über die bei der Registrierung erfasste Root-Context-Verbindung des Plugins; die Draft-chip-Visuals leiten sich aus dem `lexicon`-Scan ab.

### Registrierung

Die `/client`-Exports sind nur der Plugin-Body (`apply`/`inject`); das Quell-Objekt ist intern zum Registrierungs-Effect. Die Tool-Zeile registriert den `skill`-Wire-Namen im keyed `tool.call.toolview`-slot von ui-tool.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten decken die Eingabemaschinerie, den Tool-Zeilen-Host und das host-seitige skill-Tool ab.

- [ui-input-trigger](../ui-input-trigger/README.de.md) — die Inline-Vorschlagsmaschinerie, in die sich die Quelle registriert.
- [ui-tool](../ui-tool/README.de.md) — die Tool-Aufruf-Präsentationsschicht, die den `tool.call.toolview`-slot hostet.
- [tool-skill](../../skill/tool-skill/README.de.md) — das host-seitige `skill`-Tool, das die pre-step-Gesten-Grenze besitzt.
- [Web-Eingabemaschine und Slash-Pipeline](../../../.agents/notes/archived/architecture/2026-07-25-web-input-machine-and-slash-pipeline.md) — wie Referenzen und Befehle die Eingabemaschine teilen.

-----

<a id="model-experience"></a>
## Model Experience

### Nutzer-expliziter skill-Aufruf

#### Was das Modell sieht

Die Nachricht des Nutzers erreicht das Modell wortgetreu, einschließlich des `/name`-Literals. Die pre-step-Grenze des Hosts (`dsh-tool-skill`) hängt dann den kanonischen `<skill_content>`-Block — dieselbe `renderSkillContent`-Ausgabe, die das `skill`-Tool zurückgibt — als injizierten Anweisungskontext ans Ende der Injektionen dieses Steps an, am nächsten zur Antwort des Modells. Das Laden ist deterministisch: Das Modell erhält den vollständigen Body, ohne zum Aufruf des `skill`-Tools aufgefordert zu werden, und der Katalog sagt ihm, dass es einen inline-injizierten skill nicht erneut laden soll.

#### Token-Effekt

Ein Aufruf fügt dieser turn den gerenderten skill-Body als injizierten Kontext hinzu — dieselben Kosten wie beim Laden des skills durch das Modell über das Tool, nur unbedingt gezahlt statt nach Ermessen des Modells. Menü-Browsing und der Kandidaten-Fetch fügen null Modell-tokens hinzu.

#### KV-Cache-Effekt

Append-only: Die injizierte Nachricht landet hinter dem wiederverwendbaren Historien-Präfix. Dieses Paket bearbeitet niemals frühere Request-tokens.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wo die Referenz und die Zeile auf generisches Verhalten zurückfallen; sie sind aktuelle Paket-Constraints.

- **Historienseiten nur mit Ergebnissen verwenden die generische Zeile** — der keyed Dispatch braucht den gepaarten Aufruf im Runtime-Fenster; Pagination, die den Aufruf außerhalb lässt, hat keine Tool-Identität. Dieses Client-Präsentationsfeature erweitert den Historien-Wire-Vertrag nicht, um sie zurückzuholen.
- **Text ist die Wahrheit** — die Referenz ist simpler Draft-Text; ein handgetippter identischer token ist dieselbe Referenz, und die Host-Gesten-Grenze beurteilt den gesendeten Text, nicht die Menü-Interaktion. Chip-Visuals leiten sich aus dem lexicon-Scan ab; auf dem prompt-Wire existieren keine occurrence-Identität, keine Positionsverfolgung und keine strukturierte Referenz-Payload.
- **Ein Menü, das vor dem Absetzen des Vorwärmens geöffnet wurde**, zeigt für diesen Tastenschlag keine skill-Kandidaten; der nächste Tastenschlag pollt den abgerechneten Cache erneut.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Begleiter veröffentlicht. Die Slash-Quelle, die locale-Dictionaries und der keyed toolview sind registry-eigene Registrierungen, deren dispose durch die HMR-Sicherheits-Spezifikation bewiesen ist. Sie emittieren keine Cordis-Events und besitzen keinen plugin-übergreifenden veränderlichen Zustand.
