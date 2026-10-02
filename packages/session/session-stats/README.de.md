---
description: "Gesamt-Log-Konversationszählungen und Wall-Times für Clients und Maintainer, die die sessionStats-Projection-Unit wählen, komponieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-session-stats

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Dieses Paket liefert Clients über den öffentlichen `sessionStats`-Wert Turn- und Step-Zählungen der gesamten Session sowie LLM-, Tool-, First-Token- und Decode-Wall-Times. Die Zahlen stammen aus dem vollständigen durable Log, sodass Paging und Compaction sie nicht verändern. Es verwenden, wenn ein Client konsistente Konversationsstatistiken über Reloads und reduzierte History hinweg anzeigen muss. Wenn Gesamt-Session-Statistiken nicht verfügbar sind, können Clients stattdessen fensterscoped zählen.

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

Das Plugin neben dem Session-Store und der Projection-Registry mounten, wenn Clients Gesamt-Session-Konversationszahlen anzeigen sollen, die Paging und Compaction überstehen. Die Unit registriert nur, wenn die Registry vorhanden ist.

### Komposition

```yaml
- name: '@deepseek-ai/dsh-session'
- name: '@deepseek-ai/dsh-session-projection'
- name: '@deepseek-ai/dsh-session-stats'
```

### Was die Zahlen bedeuten

| Feld | Bedeutung |
|---|---|
| `turns` | Distinct Turns mit mindestens einem geschlossenen Step; rejected oder leere Turns werden nicht gezählt |
| `steps` | Geschlossene Steps — completed, failed, cancelled und max-tokens-Steps zählen alle |
| `llmMs` | Summierte Modell-Wall-Time über Steps, die eine Message assemblt haben |
| `toolMs` | Summierte Wall-Time gematchter `tool/call` → `tool/result` |
| `ttftMs` / `ttftSteps` | Summierte First-Token-Latenz und die sie tragenden Steps |
| `decodeMs` / `decodeTokens` | Summierte Decode-Wall-Time und Provider-Output-Tokens über usage-reportende Steps |

Jedes Feld ist 0 bis zu seinem ersten beitragenden Event; die komponierte Registry serviert den Key immer, sodass Clients den Wert statt der Key-Präsenz lesen. Clients rendern Gesamt-Log-Zahlen über Snapshot und Change-Feed des Projection-Seams; der Referenz-Consumer ist der Web-Chat-Stats-Strip, dessen Window-Fold diese Feldnamen als sein No-Unit-Fallback spiegelt.

### Fehler und Recovery

Ohne die Projection-Registry ist die Unit inert: `inject` hält den Fiber pending und nichts registriert, sodass anderen Assemblies der `sessionStats`-Key fehlt. Das Unmounten des Plugins entfernt den Key, weil Registrierungen Effects auf dem mountenden Fiber sind. Ein durch einen Crash unterbrochener Step zählt, nachdem die Session neu geladen wurde, wenn die Crash-Recovery ihr synthetisches `step/end` anhängt.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt den Fold hinter den Zahlen; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designkonzept

Die Unit ist ein purer Fold über committete Session-Events: `step/end` ist das gezählte Step-Event, weil der Agent-Loop pro betretenem Step exakt eines in einem `finally` anhängt — completed, failed, cancelled und max-tokens-Steps landen also je eines. Stattdessen assemblte Assistant-Messages zu zählen, würde max-tokens-Usage-Host-Messages überzählen (leerer Content, von der Surface ausgeschlossen) und cancelled Steps unterzählen (vor dem Assemblieren der Message abgebrochen). Die Wall-Time-Folds spiegeln den Client-Window-Fold Feld für Feld.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `inject`, Unit-Registrierung auf dem mountenden Fiber |
| [`src/projection.ts`](src/projection.ts) | Der Fold: State-Form, Per-Event-Transitionen, Wire-View |
| [`src/types.ts`](src/types.ts) | Ein zuhause für die `sessionStats`-Projection-Key-Deklaration und die Feldtypen |

### Datenmodell

Der Fold-State hält die acht Totals plus In-Flight-Boundaries: `lastTurn` (Turn des letzten gezählten `step/end`), `openStep` (die Boundary-Fakten des offenen Steps, geschlossen durch seine `assistant/message`) und `pendingCalls` (Tool-Dispatch-Zeiten nach callId). Die Wire-View ist eine strikte Untermenge — die acht Totals — sodass das State-Schema des Persisted-Cache das View-Schema um die Boundary-Felder erweitert.

### Fold-Regeln

- Irrelevante Events geben dieselbe State-Referenz zurück; das `Object.is`-Gate der Registry hält den Change-Feed ruhig.
- Die First-Token-Latenz zeichnet den ersten nicht-leeren Delta-Chunk auf und überlebt ein In-Step-`llm/retry`.
- Decode-Time und Tokens akkumulieren nur über Steps, die sowohl ein First-Token als auch einen validen Provider-Usage-Report tragen; malformed Usage wird ignoriert, wie der Window-Fold Node-Usage guardet.
- Tool-Time paart `tool/call` → `tool/result` nach callId; unaufgelöste Calls werden bei `turn/end` gedroppt, weil Results innerhalb ihres Turns landen, und eine mit einem `Object`-Prototyp-Namen kollidierende callId liest sich als unmatched.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn der Contract der Unit nicht ausreicht. Sie bewegen sich von der Registry, die Units treibt, zu den benachbarten Session-Paketen.

- [Session-Projection-Subsystem](../../../docs/subsystems/session-projection.de.md) — die Registry, die Units treibt und Snapshot- sowie Change-Feed-Werte serviert.
- [Session-Projection-Registry-Paket](../session-projection/README.de.md) — der Registry-Contract, gegen den sich Units registrieren.
- [Session-Paketkarte](../README.de.md) — benachbarte Persistence-, Projection-, Title- und Telemetry-Pakete.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da die sessionStats-Unit bereits geloggte Step-Boundaries in ein clientseitiges Read-Model foldet und nichts Modellseitiges registriert.

#### KV-Cache-Effekt

Keiner; das Paket assemblt oder sendet nie Provider-Requests.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, was die Zahlen beschreiben und wann die Unit fehlt. Sie sind aktuelle Paket-Constraints.

- **Steps zählen versuchte Arbeit, nicht sichtbaren Output** — ein Step, der vor sichtbarem Content fehlschlägt, schließt trotzdem mit `step/end` und zählt; ein durch einen Crash unterbrochener Step zählt, nachdem die Session neu geladen wurde, wenn die Crash-Recovery ihr synthetisches `step/end` anhängt.
- **Ein cancelled Step wird gezählt, aber nicht getimt** — es assemblt keine Assistant-Message, seine partielle Stream-Time geht also in keine Wall-Time-Zahl ein; eine max-tokens-Usage-Host-Message trägt umgekehrt Modellzeit bei, die die Surface nicht zeigt.
- **Zählungen sind log-scoped, nicht surface-scoped** — Steps, deren Messages später per Compaction entfernt wurden, bleiben gezählt; die Zahlen beschreiben die gesamte Session, nicht die aktuelle modellsichtbare Surface.
- **Nur dort gemountet, wo die Projection-Registry komponiert ist** — andere Assemblies servieren keinen `sessionStats`-Key, und ihre Consumer fallen auf fensterscopedes Zählen zurück.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariant:** Es wird kein Companion veröffentlicht. Das Paket besitzt einen einzigen puren Projection-Fold, dessen Wire-Payload bei jedem Snapshot und jeder Change-Feed-Emission von der Projection-Registry schema-validiert wird; die Event-Relationen, auf die sich der Fold stützt (`step/end` exakt einmal pro betretenem Step, monotone host-vergebene Turn-Nummern, Chunk- und Tool-Events, die ihre Step-Koordinaten und Call-ids tragen), werden von dsh-agent-loop und der Session-Surface besessen und zur Laufzeit geprüft, nicht hier.
