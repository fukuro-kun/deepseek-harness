---
description: "Globale send_message-, interrupt_agent- und list_agents-Tools für Nutzer und Maintainer, die die Steuerung continuable Childs zusammensetzen oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-subagent-control

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

`dsh-tool-subagent-control` fügt die globalen Kontroll-Tools für continuable Childs hinzu: `send_message` steuert zwischen direktem Parent und Child, `interrupt_agent` stoppt den aktuellen Turn eines Childs, wobei Inbox und Descendants intakt bleiben, und `list_agents` (aus dem separat ladbaren `list-agents`-Plugin) listet continuable Childs nach dauerhafter ID und Label. Parents und continuable Childs erben dieselbe `send_message`-Definition und -Reihenfolge, sodass Modell-Kommunikation kein Child-spezifisches Tool-Schema hinzufügt. Kein Tool entscheidet durch sein Vorhandensein darüber, ob ein Delegation-Tool continuable Arbeit startet.

## Inhaltsverzeichnis

- [Das Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Das Paket verwenden

Mounten Sie dieses Paket in jeder Komposition mit continuable Childs, denen das Modell Nachrichten senden, die es unterbrechen oder die es auflisten soll. Das Root-Plugin benötigt nur den Subagent-Service; das Listen-Tool ist ein separates Plugin, das ein Deployment weglassen kann.

### Minimale Konfiguration

Laden Sie den Subagent-Service, ein Backend, das Delegation-Tool und dieses Paket. Das Hinzufügen des separaten Listen-Plugins exponiert alle drei Tools:

```yaml
- name: '@deepseek-ai/dsh-subagent'
- name: '@deepseek-ai/dsh-subagent-spawn-in-process'
- name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: spawn
    backgroundMode: continuable
- name: '@deepseek-ai/dsh-tool-subagent-control'
- name: '@deepseek-ai/dsh-tool-subagent-control/list-agents'
```

Dieses Paket nimmt keine Konfiguration entgegen: Das Root-Plugin stellt `send_message` und `interrupt_agent` bereit, das Listen-Plugin stellt `list_agents` bereit.

### send_message

Sendet eine Nachricht an einen Agent, der über `agent_id` benannt ist: Jeder konkrete Live-Agent darf sein direktes continuable Child adressieren, während ein residentes continuable Child auch seinen direkten Parent adressieren darf. Ein arbeitendes Ziel empfängt die Nachricht über Steer an seiner nächsten Step-Grenze; ein inaktives Ziel startet einen Turn, und ein kaltes direktes Child wird über den Continuation-Lifecycle fortgesetzt. Der Aufruf gibt nur die Annahme zurück (die stabile `messageId` der angenommenen Nachricht), niemals eine Antwort. Ein Fehlschlag — ein nicht unterstütztes Ziel, ein nicht verfügbarer Parent, ein unbekanntes Child, ein deskriptorloses Child, das nicht fortgesetzt werden kann, oder eine abgelehnte Admission — gibt an, dass die Nachricht nicht zugestellt wurde.

### interrupt_agent

Stoppt nur den aktuellen Turn des Ziels: Gequeuete Nachrichten bleiben geparkt bis zu einem späteren `send_message`, Descendants laufen weiter, und das Child bleibt für Folgeaufrufe verfügbar. Der Aufruf kehrt zurück, sobald die Stoppanfrage angenommen ist, nicht wenn das Ziel ruht; das Unterbrechen eines bereits abgeschlossenen Agent ist ein akzeptierter No-Op, und Self-, Sibling-, Stale- und Nicht-Ancestor-Aufrufer erhalten Fehlerergebnisse.

### list_agents

Listet die continuable Childs unter dem aufrufenden Agent: `children` (Default) zeigt direkte Childs, `descendants` läuft den gesamten Baum in stabiler Pre-Order-Reihenfolge ab und annotiert jeden Eintrag mit seiner dauerhaften Direct-Parent-Session-ID und Tiefe. Der Status kommt aus der Live-Agent-Registry — `running`, `idle` oder `ready`. One-shot-Childs fehlen absichtlich, weil sie kein `send_message` annehmen können, und nicht lesbare Kandidaten erscheinen als Diagnostics.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, was die Tools an den Subagent-Service delegieren; das beobachtbare Verhalten ist in [Das Paket verwenden](#use-this-package) beschrieben.

### Designkonzept

Dünne Adapter über `ctx.subagents.sendMessage()`, `interrupt()` und die Listenprojektionen; die Tools führen kein Lifecycle-Routing durch. Residency, Cold-Resume und Autorisierung gehören dem Service, und die Tools übergeben den exakten live aufrufenden Agent (`exec.agent`) sowohl als Sender als auch als Autorität.

### Zustellung und Signal-Eigentümerschaft

Das Tool leitet sein Ausführungssignal weiter, das die Admission nur bis zur Inbox-Annahme besitzt. Sobald das Ziel eine Nachricht annimmt, kann sie nicht mehr über dieses Tool abgebrochen werden. Jede Nachricht ist als `Agent <sender-id> sent a message:` gerahmt und wird mit `{ kind: 'agent-message', form: 'relay', senderSessionId: sender.id }` aufgezeichnet; der Service leitet diese Attribution ab und behandelt sie niemals als Autorität.

### Listenprojektion

`list_agents` leitet die Root-ID vom aufrufenden Agent ab, liest den Service-Katalog ohne Cursor, verfeinert den Status jedes Kandidaten über die Live-Agent-Registry und lässt One-shot-Childs aus, weil sie kein `send_message` annehmen können. Diagnostics behalten ihre Positionen im Descendants-Scope und exponieren niemals Deskriptor-Inhalte.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | `send_message`- und `interrupt_agent`-Registrierung |
| [`src/list-agents.ts`](src/list-agents.ts) | `list_agents`-Registrierung: Scopes, Status-Verfeinerung, Projektion |
| — | Es wird kein Runtime-Invariant-Companion veröffentlicht; dieser modellseitige Adapter hat keinen eigenen Lifecycle-Stream; Zustell- und Aktivierungsrelationen gehören dem aufgerufenen Subagent-Service. |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Paket-Contract nicht ausreicht; sie führen von den Tool-Schemas zum Continuation-Service dahinter.

- [Subagent-Subsystem](../../../docs/subsystems/subagent.de.md) — continuable Childs, Activations, Inbox, Interrupt und Follow-up-Autorität.
- [dsh-tool-subagent](../tool-subagent/README.de.md) — das Delegation-Tool, das continuable Childs startet.
- [Generierter Tool-Katalog](../../../docs/tool-catalog.md#deepseek-aidsh-tool-subagent-control) — die drei Tool-Schemas.

-----

<a id="model-experience"></a>
## Model Experience

### Tool-Schema

#### Was das Modell sieht

Die generierten [Schemas](../../../docs/tool-catalog.md#deepseek-aidsh-tool-subagent-control): `send_message` nimmt `agent_id` und `message`; `interrupt_agent` nimmt `agent_id`; `list_agents` nimmt das optionale `scope`-Enum.

#### Token-Effekt

Feste Schema-Kosten pro Parent-Request.

#### KV-Cache-Effekt

Präfix-stabil; das Schema ändert sich zur Laufzeit nicht.

### Interrupt-Ergebnis

#### Was das Modell sieht

`interrupt requested for agent <agent_id>` bei Annahme. Ein nicht autorisierter Aufrufer — Self, Sibling, Stale oder Nicht-Ancestor — ist ein Fehlerergebnis, das die Ablehnung benennt; ein fehlendes oder abgerechnetes Ziel rendert weiterhin die Annahmezeile.

#### Token-Effekt

Eine kurze Bestätigung pro Aufruf; der Abbruch des unterbrochenen Turns ist nur im eigenen Transcript des Childs sichtbar.

#### KV-Cache-Effekt

Nur-append; jedes Ergebnis folgt dem wiederverwendbaren Request-Präfix.

### Zustellergebnis

#### Was das Modell sieht

`message delivered to agent <agent_id>` bei Annahme; die kanonische Ausgabe trägt die angenommene `messageId`. Ein Fehlschlag — ein nicht benachbartes Ziel, ein nicht verfügbarer Parent, ein unbekanntes Child, ein deskriptorloses Child, das nicht fortgesetzt werden kann, oder eine abgelehnte Admission — ist ein Fehlerergebnis, dessen Meldung angibt, dass die Nachricht nicht zugestellt wurde.

#### Token-Effekt

Eine kurze Bestätigung pro Aufruf; die Antwort des Ziels kehrt niemals über diesen Aufruf zurück. Ein Child nutzt dasselbe Tool mit der Parent-ID seiner initialen Aufgabe, um ausgewählten Inhalt an die Parent-History anzuhängen.

#### KV-Cache-Effekt

Nur-append; neu sichtbarer Inhalt folgt dem wiederverwendbaren Request-Präfix und invalidiert keine bestehenden KV-Cache-Einträge.

### Listenergebnis

#### Was das Modell sieht

Eine Zeile pro continuable Child in stabiler Katalogreihenfolge: `<id> [<status>] — <label>` (`running` = aktiver Driver, `idle` = resident zwischen Turns, `ready` = nur Storage, fortsetzbar statt final), plus `<id> [diagnostic: <reason>]` für einen Kandidaten, der nicht gelesen werden konnte. Der `descendants`-Scope fügt ` parent=<id> depth=<n>` vor dem Label-Strich in jeder Zeile ein, in Pre-Order. One-shot-Childs fehlen absichtlich; `(no subagents)` bedeutet, dass kein continuable Child oder Diagnostic die Projektion überlebt hat.

#### Token-Effekt

Wächst linear mit den gelisteten continuable Childs — der gesamte Baum unter dem `descendants`-Scope; es gibt keinen Cursor und keine Obergrenze, sodass langlebige Parents mit vielen persistierten Childs bei jedem Aufruf die volle Liste zahlen.

#### KV-Cache-Effekt

Nur-append; jedes Ergebnis folgt dem wiederverwendbaren Request-Präfix.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, was die Kontroll-Tools nicht beobachten oder steuern können; sie sind aktuelle Paket-Constraints.

- **Eine zugestellte Nachricht hat kein eigenes Ergebnis** — die Annahme gibt nur ihre Inbox-`messageId` zurück; spätere Zielarbeit landet in der dauerhaften Session dieses Ziels und wird niemals über dieses Tool eingesammelt. Eine Antwort ist ein weiterer explizit adressierter `send_message`, nicht das Ergebnis dieses Aufrufs.
- **Nur unterstützte benachbarte Agents können kommunizieren** — jeder Sender darf ein direktes continuable Child adressieren, nur ein Sender mit einer residenten continuable Activation darf seinen direkten Parent adressieren, und dieser Parent muss live bleiben; Siblings und tiefere Descendants sind keine Nachrichtenziele, und nur die Direct-Child-Zustellung unterstützt kalte Aktivierung.
- **Die Liste ist ein Snapshot, kein Zustellversprechen** — sie kann mit Publikation, Disposal oder einer späteren Nachricht racen, und ein anderer Prozess kann ein Child aktivieren, das dieser Prozess als `ready` meldet; prozessübergreifende Genauigkeit erfordert einen geteilten Lease. `interrupt_agent` führt die autoritative Live-Lineage-Prüfung selbst durch, sodass veraltete Discovery keine Autorität verleihen kann.
- **Keine Paginierung oder Löschung** — die vollständige, stabil geordnete Menge wird zurückgegeben, und persistierte Childs bleiben gelistet, solange ihre Sessions in der Persistenz verbleiben; eine Service-Level-Obergrenze oder Löschoperation ist eine spätere Produktentscheidung.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
