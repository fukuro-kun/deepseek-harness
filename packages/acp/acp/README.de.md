---
description: "Nur-Automatisierungs-Agent-Client-Protocol-Server für programmatische Clients und Maintainer, die DeepSeek-Harness-Agents über JSON-RPC stdio steuern."
kind: "package-reference"
---

# @deepseek-ai/dsh-acp
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

`dsh-acp` lässt vertrauenswürdige Programme persistente DeepSeek-Harness-Agents über das Standard-[Agent Client Protocol](https://agentclientprotocol.com) automatisieren: Sessions erstellen oder fortsetzen, Modell und Reasoning-Aufwand wählen, MCP-Server anhängen, Arbeit einreichen oder abbrechen, semantische Updates empfangen und Sessions unabhängig schließen. Wählen Sie es für Out-of-Process-Subagents, Test-Runner und skriptgesteuerte Controller; es lässt absichtlich DSH-spezifische Präsentationsdaten und interaktive UI-Features aus. Die Persistenz unterstützt Listen, Fortsetzen und Schließen von Sessions über Prozessneustarts hinweg, aber Löschung, Forks, Transcript-Replay und zusätzliche Verzeichnisse werden nicht unterstützt. Führen Sie `pnpm dsh --profile acp` aus, um den Server zu starten; verwenden Sie `dsh-subagent-acp` als Repository-Client.

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

Verwenden Sie dieses Paket, wenn ein Skript, Test-Runner oder ein anderer Harness Agent-Arbeit End-to-End über ein Standard-Automatisierungsprotokoll ausführen muss. Der übliche Pfad ist: Server starten, eine Session erstellen oder fortsetzen, optional MCP-Server mounten und Modelloptionen wählen, einen Prompt senden, semantische Updates konsumieren und die Session schließen.

### Wann man es wählt

Wählen Sie es, wenn die Automatisierung die Interaktion besitzen soll: ein Out-of-Process-Subagent, Test-Runner oder skriptgesteuerter Controller, der persistente Sessions, Tools, Modellauswahl und Permissions verwaltet. Vermeiden Sie es, wenn ein Mensch DSH-spezifische Präsentationskarten, Pläne, Titel, Todos, Terminal-Ansichten oder Elicitation benötigt; dieser Server exponiert absichtlich nur die Standard-ACP-v1-Fläche.

### Minimale Konfiguration

Jede Session, die der Server erstellt, nutzt den hier konfigurierten Provider und das Modell. Beide Felder sind optional, damit ein anderer Agent- oder Request-Listener sie liefern kann; die lauffähige Demo-Komposition setzt beide. Stdout trägt nur Protokollverkehr, also halten Sie Logging davon fern.

```yaml
- name: '@deepseek-ai/dsh-acp'
  config:
    provider: deepseek-official
    model: deepseek-v4-pro
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `provider` | — | Provider-Route für den Agent jeder Session |
| `model` | — | Modell für den Agent jeder Session |
| `sessionListPageSize` | `100` | Maximale Anzahl Summaries in einer `session/list`-Seite |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-acp) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Einen Server starten

`pnpm dsh --profile acp` startet den ausgelieferten Stdio-Server. Das `acp`-Profil mountet Session-Persistenz, sodass Clients persistente Sessions listen, fortsetzen und schließen können. [`@deepseek-ai/dsh-subagent-acp`](../../subagent/subagent-acp/README.de.md) startet dasselbe Profil für Out-of-Process-Delegation.

<a id="protocol-contract"></a><a id="standard-acp-v1-surface"></a>
### Protokoll-Contract

Eine Verbindung kann mehrere Sessions gleichzeitig führen, jede unabhängig. Die Aufrufe, die ein Client tätigt:

| Aufruf | Was Sie erhalten |
|---|---|
| `initialize` | Stabiles ACP v1 plus `session/list`-, `session/resume`-, `session/close`- und Streamable-HTTP-MCP-Support; Bild-Prompts nur, wenn der dauerhafte Attachment-Store und die konfigurierte exakte Route sie unterstützen. |
| `authenticate` | Sofortiger Erfolg; der Server verlangt keine Authentifizierung. |
| `session/new` | Ein frischer persistenter Agent, dessen absoluter Workspace und Stdio- oder HTTP-MCP-Server vor der Publikation validiert werden, plus sein vollständiger Konfigurationsoptions-Zustand. |
| `session/list` | Deterministische Neueste-zuerst-Seiten persistenter, fortsetzbarer Root-Sessions; ein optionaler absoluter `cwd`-Filter nutzt wo möglich Physical-Directory-Identität. |
| `session/resume` | Eine persistierte inaktive Session, deren kanonischer Workspace vor der Komposition verifiziert wird; ihr Log wird wiederhergestellt, ohne alte Updates zu replayen. |
| `session/close` | Quiescente Cancellation, Update-Draining, Descendant-Disposal, Persistenz-Flush und Disposal nur des adressierten Agent-Scopes. |
| `session/set_config_option` | Ein serialisiertes Update des angebotenen `model` oder `reasoning_effort`, das den vollständigen resultierenden Zustand zurückgibt. |
| `session/prompt` | Geordneter Text, Resource-Links und unterstützte Bilder, ein Prompt pro Session zur Zeit; das Settlement folgt Agent-Idle und geordneter Update-Zustellung. |
| `session/cancel` / `$/cancel_request` | Der prompt-eigene Cancellation-Pfad; ohne einen laufenden ACP-Prompt bricht er autonome Arbeit ab, während unbekannte Session-IDs No-Ops sind. |
| `session/update` | Committete Assistant-Nachrichten und Thoughts, generischer Tool-Lifecycle, Konfigurationsänderungen und Kontextnutzung, pro Session serialisiert. |
| `session/request_permission` | Ein Permission-Prompt mit One-shot-Allow/Reject-Optionen; Ihr Client kann automatisch antworten. |

Die Session-Konfiguration bietet opake Provider-/Modell-Optionen aus dem Live-LLM-Service-Katalog und einen `reasoning_effort`-Selektor, wenn das exakte Modell einen deklariert. Ein Prompt snapshotet diese Auswahl vor der asynchronen Bild-Admission und pinnt sie über jeden Modell-Step in diesem Turn; eine konkurrierende Optionsänderung gilt ab dem nächsten Turn. ACP-Clients sind vertrauenswürdige Controller: Stdio-MCP-Einträge autorisieren ihre absoluten Befehle und Umgebung, HTTP-Einträge autorisieren ihre absoluten HTTP(S)-URLs und Header, und jeder initiale Verbindungs- oder Discovery-Fehler rollt den unpublizierten Agent zurück. Nicht unterstützte Flächen werden ausgelassen oder lehnen ab: `session/load`, Löschung, Fork, zusätzliche Verzeichnisse, SSE- oder ACP-Transport-MCP, Modes, Commands, Pläne, Terminals, Client-Filesystem-Operationen und Elicitation.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie der Server das obige Verhalten realisiert, und zeigt auf den Code, der es implementiert; das beobachtbare Verhalten ist in [Das Paket verwenden](#use-this-package) vollständig beschrieben.

### Designphilosophie

Der Server ist ein Automatisierungs-Transport mit einem absichtlich standardisierten öffentlichen Protokoll. Drei Verpflichtungen formen ihn:

- **Nur standardisierte semantische Updates.** Der Wire trägt committete Nachrichten und Thoughts, generischen Tool-Lifecycle, Konfiguration und Kontextnutzung; rohe Provider-Deltas, Retry-Versuche, DSH-Präsentationsdaten und nicht unterstützter Inhalt bleiben vom Wire fern.
- **Wahrheitsgemäßer Capability- und Konfigurationszustand.** `initialize` bewirbt nur gemounteten Support, Topologieänderungen publizieren vollständige Konfigurationsoptionen, und ein Prompt pinnt die exakte Route, die er zugelassen hat.
- **Quiescence vor Settlement.** Prompt- und Close-Operationen settlen erst, nachdem ihre eigene Admission, Agent-Aktivität, geordnete Updates, Descendants, Persistenz und Disposal den erforderlichen Endzustand erreicht haben.

Die Entscheidungshistorie liegt im [ACP-as-an-Automation-Only-Protocol-Note](../../../.agents/notes/implemented/simplification/2026-07-23-acp-automation-only-protocol.de.md) und im [Multi-Session-Note](../../../.agents/notes/archived/feature/2026-06-14-acp-multi-session.md).

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Eintritt: `Config`-Schema, `AgentSideConnection`-Verdrahtung, Per-Session-Records, Admission und Settlement, Teardown |
| [`src/content.ts`](src/content.ts) | Wire-Content-Admission und -Projektion: Bild-Validierung, Route-Recheck, Prompt-Rekonstruktion, Assistant-Block-Konvertierung |
| [`src/codec.ts`](src/codec.ts) | Reine Turn-Ending-zu-ACP-`stopReason`-Abbildung |
| — | Es wird kein Runtime-Invariant-Companion veröffentlicht; dieser Transport besitzt keinen dauerhaften paket-lokalen Event-Stream; Protokoll- und Lifecycle-Tests decken seine Abbildung ab. |

### Admission und Prompt-Settlement

Jede Session erlaubt einen in-flight Prompt. Die Admission validiert den gesamten Prompt-Batch, snapshotet die gewählte Route, prüft die exakte Agent-Identität und Bild-Capability erneut, persistiert Bild-Attachments und queuet erst dann die User-Message — eine Cancellation, die die Admission gewinnt, enqueuet niemals einen späten Turn. Einmal gequeuet, assoziiert das Session-Modul den Snapshot mit der Inbox-Nachricht bis zum Claim und pinnt denselben Provider, dasselbe Modell und denselben Reasoning-Aufwand über Prompt-Variablen und jeden Modell-Step in diesem Turn. Die Per-Session-Update-Zustellung ist serialisiert; committete Bilder werden erneut gelesen und integritätsverifiziert, sodass ein fehlendes oder korruptes Bild den korrelierten Prompt fehlschlagen lässt statt einen Platzhalter zu emittieren. Die Settlement-Priorität ist explizite Cancellation, Committed-Output-Fehler, intervallweiter Agent-Fehler, dann das korrelierte Turn-Ending.

### Teardown und Verbindungseigentümerschaft

Jedes Session-Modul besitzt sein Agent-Handle, MCP-Mounts, zukünftige und turn-gepinnte Modellauswahlen, den Prompt-Slot, die Update-Kette und die memoisierte Close-Operation. Explizites Close, Client-Disconnect und Cordis-Disposal nutzen denselben quiescenten Teardown: neue Arbeit stoppen, Prompt-Admission und Agent-Aktivität abbrechen, committete Updates drainen, continuable Descendants child-first disposen, Persistenz flushen und den besessenen Agent-Scope freigeben. Ein Session-Close lässt den persistierten Zustand für List und Resume verfügbar, und andere Sessions oder Frontends, die den Context teilen, bleiben unberührt.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Paket-Contract nicht ausreicht. Sie führen vom passenden Client zu den Design-Records hinter dem Automatisierungs-Contract.

- [dsh-subagent-acp](../../subagent/subagent-acp/README.de.md) — der Out-of-Process-ACP-Client, der diesen Server spawnt und steuert.
- [ACP as an automation-only protocol](../../../.agents/notes/implemented/simplification/2026-07-23-acp-automation-only-protocol.de.md) — der Design-Record für den Automatisierungs-Contract und seine Wire-Grenzen.
- [Multiplex concurrent ACP sessions over one connection](../../../.agents/notes/archived/feature/2026-06-14-acp-multi-session.md) — Per-Session-Isolation-, Ownership- und Teardown-Entscheidungen.
- [Extension-Cookbook](../../../docs/cookbook/extension-cookbook.de.md) — dieses Paket als das Nur-Automatisierungs-Beispiel für Extension-Autoren.

-----

<a id="model-experience"></a>
## Model Experience

### Prompt-Inhalt

#### Was das Modell sieht

`session/prompt` bewahrt Text- und Bildreihenfolge in einer User-Message: Benachbarter Text wird konkateniert, und ein Resource-Link erscheint als geklammerte `[resource_link name=… uri=…]`-Referenz, die das Modell mit seinen eigenen Tools öffnen darf. Inline-Bild-Base64 wird nach der Batch-Admission verworfen, sodass die dauerhafte Nachricht nur verifizierte Attachment-Referenzen enthält. Protokollmetadaten, Client-Capabilities, Permission-Entscheidungen und Session-IDs treten niemals in den Modell-Request ein.

#### Token-Effekt

Prompt-Inhalt, Tool-Calls/-Ergebnisse und dauerhafte Bild-Referenzen bleiben in dieser Session bis zur Compaction. Konkurrierende Sessions behalten unabhängige Kontexte.

#### KV-Cache-Effekt

Nur-append, solange die gewählte Route und das zusammengesetzte Präfix unverändert bleiben. Ein Modellwechsel startet den nächsten ACP-Turn auf der neuen Route.

### Permission-Entscheidungen

#### Was das Modell sieht

Nichts direkt. Das besitzende Tool zeichnet sein Allowed-, Rejected-, Cancelled- oder Unavailable-Ergebnis über den normalen Tool-Result-Pfad auf.

#### Token-Effekt

Nur das Ergebnis des besitzenden Tools trägt Tokens bei.

#### KV-Cache-Effekt

Nur-append über das Ergebnis des besitzenden Tools.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann dieses Paket schlecht passt oder besondere operative Sorgfalt braucht. Sie sind aktuelle Paket-Constraints, kein Protokollvergleich und kein Aufgabenrückstand.

- **Ein primärer Workspace** — zusätzliche Verzeichnisse bleiben nicht unterstützt.
- **Nur Raster-Prompt-Bilder** — PNG, JPEG, WebP und GIF erfordern einen dauerhaften Attachment-Store und eine exakte bildfähige Route.
- **Nur MCP-Tools** — MCP-Resources und -Prompts haben keinen DSH-Consumer.
- **Kein Transcript-Replay und keine interaktiven Erweiterungen** — Session-Löschung, Fork, `session/load`, Modes, Commands, Pläne, Terminals, Client-Filesystem-Operationen und Elicitation bleiben außerhalb dieser Automatisierungsfläche.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
