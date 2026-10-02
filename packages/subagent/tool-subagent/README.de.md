---
description: "Modellseitiges subagent-Delegations-Tool für Benutzer und Maintainer, die Delegation über einen subagent-Provider konfigurieren, komponieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-subagent

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

Verwenden Sie dieses Paket, um einem agent ein benanntes Tool zu geben, das Arbeit an ein konfiguriertes Child-agent-Backend delegiert. Im `one-shot`-Modus warten Aufrufe standardmäßig auf das Child; im `continuable`-Modus starten sie ein persistentes Child im Hintergrund und geben eine id für spätere Nachrichten zurück. Unterstützte Backends können außerdem freigegebene Child-LLM-Provider, Modelle und Reasoning-Effort zur Auswahl exponieren. Jede Instanz kann Child-Persona, Tool-Zugriff und Tiefenlimits setzen, während fehlgeschlagene Runs Fehler statt Teilerfolgen zurückgeben.

## Inhaltsverzeichnis

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Das Paket verwenden

Mounten Sie eine Instanz pro Delegationsziel, jede mit einem eigenen `toolName`. Das Tool existiert genau solange wie sein Provider, sodass Geschwister-Ladereihenfolge und Provider-Reloads es nie verwaist zurücklassen.

### Minimale Konfiguration

Laden Sie den subagent-Service, ein In-Process- oder Remote-Backend und dieses Tool; dann benennen Sie den Provider. Diese Komposition exponiert ein `subagent`-Tool, das an das `spawn`-Backend delegiert:

```yaml
- name: '@deepseek-ai/dsh-subagent'
- name: '@deepseek-ai/dsh-subagent-spawn-in-process'
- name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: spawn
    toolName: subagent
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `provider` | erforderlich | Provider-Name auf `ctx.subagents` (z. B. `spawn`, `fork`, `acp`) |
| `toolName` | `subagent` | Modellseitiger Tool-Name; für jede geladene Instanz unterschiedlich |
| `modelSelectionSettings` | `false` | Abtasten der Exact-Route-Autorisierungspräferenz des Hosts für jede Top-Level-Session; ein stehendes Preset beobachtet passende Sessions, während direktes Agent-Setup seine Session explizit übergibt; erfordert Provider-`agentOptions`-Support |
| `enableRunInBackground` | `true` | Exponiert `run_in_background`; Deaktivieren lehnt auch erzwungene Background-Aufrufe ab |
| `backgroundMode` | `one-shot` | Background-Policy: `one-shot` stellt Aufrufe standardmäßig auf Foreground; `continuable` stellt sie auf Background und erfordert die `prepareContinuable`-Capability des Providers |
| `agentOptions` | — | Konfigurierte Child-Defaults für `provider`, `model`, adapter-owned `reasoningEffort` und positive `maxTokens`; erfordert Provider-`agentOptions`-Support und überlagert etwaige provider-owned Route-Defaults |
| `persona` | — | Persona pro Child; erfordert die `persona`-Capability des Providers |
| `toolFilter` | — | Globale Tool-Einschränkung pro Child; erfordert die `toolFilter`-Capability |
| `maxDepth` | `3` | Absolute Delegationstiefen-Obergrenze (`0` verbietet Delegation); `'provider-managed'` sendet keine Obergrenze an einen Out-of-Process-Provider |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.md#deepseek-aidsh-tool-subagent) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Foreground- und Background-Modi

Unter `one-shot`-Policy wartet ein weggelassenes `run_in_background` im Foreground und gibt den finalen Text des Childs zurück; `run_in_background: true` startet einen schlichten parent-owned Background-Job und gibt `started background subagent job <id>` zurück, einsammelbar mit `job_output` und stoppbar mit `job_kill`.

Unter `continuable`-Policy startet ein weggelassenes oder `true` gesetztes `run_in_background` ein durable Child und gibt `started subagent <childId>` zurück, ohne auf ein Ergebnis zu warten; die Runtime liefert eine Settlement-Notiz, wenn die Activation des Childs endet, und das optionale `send_message`-Tool sendet ihm weitere Arbeit. Setzen Sie `run_in_background: false`, um im Foreground auf das Ergebnis zu warten.

`maxDepth` begrenzt die Rekursion (Default `3`; `0` verbietet Delegation) und erfordert einen Provider mit der `depthLimit`-Capability; `'provider-managed'` überlässt das Budget einem Out-of-Process-Provider. `persona` und `toolFilter` konfigurieren jedes Child, wenn der Provider sie unterstützt, und das Tool bleibt an der Obergrenze sichtbar — jeder Startversuch prüft die aktuelle Tiefe des aufrufenden agent und lehnt mit einem fehlerhaften Ergebnis ab.

### Ein Child-LLM auswählen

Setzen Sie `modelSelectionSettings: true`, um die `subagent-model-selection`-Präferenz des Hosts abzutasten, wenn jede frische Top-Level-Session komponiert wird. Eine wiederhergestellte Session ohne aufgezeichnete Policy bleibt deaktiviert, einschließlich eines explizit leeren Restore. Bei Aktivierung wird die nicht-leere Exact-Provider/Model-Routenliste in der Session aufgezeichnet, von Child-Sessions geerbt und durch spätere Settings-Edits nicht verändert. Das Tool exponiert dann die optionalen Felder `provider`, `model` und `reasoning_effort` und registriert das gemeinsame `list_subagent_models`-Tool. Dieser Modus erfordert ein Backend, das `agentOptions` anbietet; beide In-Process-Backends und das DSH SDK unterstützen es, während ACP, Codex und Claude Code es ablehnen statt es zu ignorieren.

Ein Aufruf liefert `provider` und `model` zusammen, oder liefert nur ein Effort, wenn konfigurierte, Parent- oder provider-owned Defaults die Route liefern. Statische `provider.agentRouteDefaults` bilden, sofern vorhanden, die Provider/Model-Baseline; Tool-Konfiguration und Modelfelder überlagern sie vor route-aware Effort-Merging und Exact-Route-Preflight. Provider ohne diese Defaults verwenden kompatible Werte aus dem zuletzt geloggten Request des Parents, dann die Creation-Options des Parents vor dessen erstem Request, unter Beibehaltung der konfigurierten `maxTokens`. Das Ändern der Route ohne explizites Effort löscht das geerbte route-owned Effort, sodass das gewählte Modell seinen Default auflöst. Der Live-LLM-Adapter validiert die effektive Route vor der Child-Erzeugung. Katalogmitgliedschaft bleibt empfehlend, sodass ein Modell eine ungelistete id verwenden kann, wenn sein Adapter sie akzeptiert.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie das Tool den Provider-Lifecycle spiegelt und Runs abrechnet; das beobachtbare Verhalten ist unter [Das Paket verwenden](#use-this-package) beschrieben.

### Designkonzept

Eine Instanz ist ein Provider plus ein Tool-Name. Das Plugin spiegelt den Provider-Lifecycle: Es registriert das Tool, wenn der benannte Provider erscheint, und disposed es, wenn der Provider verschwindet, sodass Geschwister-Ladereihenfolge und HMR-Ersetzung kein hängendes Tool zurücklassen können. Direktes Agent-Setup übergibt seine unveröffentlichte Session explizit und wartet die Installation vor der Veröffentlichung ab. Ein settings-gestütztes stehendes Preset empfängt jeden passenden Agent aus Lifecycle-Events, wählt die Policy aus dessen Session und installiert über dessen Context. Ein numerisches `maxDepth` oder eine konfigurierte LLM-Auswahl, die der Provider nicht durchsetzen kann, scheitert am Mount statt an der ersten Delegation. Höchstens eine Instanz in einem Tool-Scope darf die Modellauswahl besitzen, weil `list_subagent_models` einen globalen Namen hat.

### Foreground-Abrechnung

Ein Foreground-Aufruf wartet `run.result`, mappt jeden nicht-abgeschlossenen Stop-Reason auf eine Fehler-Headline, hängt die Provider-Diagnose und etwaigen erhaltenen partiellen Assistant-Text an und wartet vor der Rückkehr stets `run.dispose()`; wenn Ergebniseinsammlung und Disposal beide rejecten, bewahrt das fehlerhafte Ergebnis beide Fehler.

### Background-Routen

One-shot-Background registriert einen schlichten parent-owned Task, dessen Done-Channel den Start abrechnet und Stop-Reason sowie optionale Provider-Diagnose in seinem Detail behält. Continuable-Background ruft `ctx.subagents.startContinuable()`, das bei Inbox-Annahme auflöst: Das Child besitzt von dort an seine eigenen Turns, sodass der Aufruf weder auf ein Ergebnis wartet noch eines einsammelt.

### Kontextsensitive Formulierung

Die Tool-Beschreibung leitet sich aus `provider.inheritsParentContext` ab: Ein frisches Child erhält die Formulierung "it does not see this conversation", ein geforktes Child "it does not see the current in-flight turn", sodass das Modell nie Kontext wiederholt oder auslässt, der nicht existiert.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Tool-Registrierung, Lifecycle-Spiegelung, Modus-Auflösung, Ergebnisabrechnung |
| [`src/model-selection.ts`](src/model-selection.ts) | Request/Config-Merge und Live-LLM-Route-Preflight |
| [`src/model-selection-settings.ts`](src/model-selection-settings.ts) | Host-owned Opt-in-Setting, für neue Sessions abgetastet |
| [`src/model-selection-state.ts`](src/model-selection-state.ts) | Session-Event, das die abgetastete Entscheidung aufzeichnet und vererbt |
| [`src/list-models.ts`](src/list-models.ts) | `list_subagent_models`-Laufzeit-Discovery-Tool |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Paketvertrag nicht ausreicht; sie führen vom Laufzeitverhalten des Tools zur Seam, über die es delegiert, und zu den benachbarten Child-Tools.

- [Subagent-Subsystem](../../../docs/subsystems/subagent.de.md) — Provider, one-shot-Startanfragen, continuable Childs und Activations.
- [dsh-tool-subagent-control](../tool-subagent-control/README.md) — Messaging-, Interrupt- und Listing-Tools für continuable Childs.
- [Generierter Tool-Katalog](../../../docs/tool-catalog.md#deepseek-aidsh-tool-subagent) — das Default-Schema und die Formulierung pro Modus.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.md#deepseek-aidsh-tool-subagent) — jedes akzeptierte Config-Feld.
- [Background-first-Continuable-Delegation](../../../.agents/notes/archived/feature/2026-08-11-background-first-continuable-delegation.md) — warum continuable Arbeit standardmäßig im Hintergrund läuft.
- [Modellgewählte subagent-Routen](../../../.agents/notes/implemented/feature/2026-08-18-model-selected-subagent-routes.md) — Auswahlpolicy, Vererbung, Discovery und die Fork-Einschränkung.

-----

<a id="model-experience"></a>
## Model Experience

### Tool-Schema

#### Was das Modell sieht

Das generierte Default-[`subagent`-Schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-subagent) unter dem konfigurierten Namen dieser Instanz, solange ihr Provider existiert. Eine aktivierte Session-Policy fügt `provider`, `model` und `reasoning_effort` plus Vererbungs- und Auswahlanleitung hinzu; der Provider muss `agentOptions` unterstützen. Provider-Kontextvererbung ändert die Tool- und Prompt-Beschreibungen. Ein aktivierter Background-Modus fügt `run_in_background` hinzu: Der continuable-Modus dokumentiert seinen `true`-Default, die Runtime-Settlement-Notiz und das explizite Foreground-Override, während der one-shot-Modus seinen `false`-Default und die mit `job_output` eingesammelte oder mit `job_kill` gestoppte job id dokumentiert. Solange das Tool im Scope einer Assembly sichtbar ist, sagt eine `tool:<toolName>`-System-Prompt-Sektion dem Modell, unabhängige continuable Delegationen gemeinsam zu starten, während ihrer Ausführung weiterzuarbeiten und Foreground nur zu wählen, wenn die nächste Aktion vom Ergebnis abhängt; eine Tool-Restriktion entfernt sowohl sein Schema als auch diese Anleitung.

#### Token-Effekt

Feste Schema-Kosten pro Parent-Request; Modellauswahl fügt drei Parameter hinzu. Jede Provider-Instanz fügt ein Schema hinzu, und jede continuable Instanz fügt eine kurze System-Prompt-Sektion hinzu.

#### KV-Cache-Effekt

Präfix-stabil, solange Provider-Instanzen und ihre Konfiguration unverändert sind. Adapterkatalog-Änderungen ändern die Definition nicht; ein Child-Route-Override kann verhindern, dass ein Fork-Child das geerbte Parent-Präfix wiederverwendet.

### Modellauswahl und Discovery

#### Was das Modell sieht

Eine settings-gesteuerte Instanz, deren Session eine Policy trägt, exponiert die Child-LLM-Auswahlfelder und `list_subagent_models`. Aufrufe rejecten, solange der optionale `ctx.llm`-Service nicht verfügbar ist. Discovery gibt nur registrierte Provider und angebotene Modelle in der Exact-Route-Policy zurück; ein nicht autorisierter Provider wird abgelehnt, bevor sein Adapterkatalog aufgerufen wird, und ein Exact-Lookup muss erlaubt sein, bevor er die Reasoning-Efforts und den Default des Modells auflöst. Die Ausführung erzwingt unabhängig dieselbe Policy.

#### Token-Effekt

Ein festes Discovery-Schema ist in aktivierten Kompositionen vorhanden. Kataloginhalte gelangen nur in den Transcript, wenn das Modell das Tool aufruft.

#### KV-Cache-Effekt

Das Schema ist präfix-stabil über Adapter-Registrierung und Katalogänderungen hinweg. Jedes Discovery-Ergebnis wird hinter dem wiederverwendbaren Präfix angehängt.

### System-Prompt

#### Was das Modell sieht

Wenn `enableRunInBackground` und `backgroundMode: continuable` beide gesetzt sind, liest das Modell zusätzlich eine `tool:<toolName>`-System-Prompt-Sektion, die ihm sagt, unabhängige continuable Delegationen gemeinsam zu starten und während ihrer Ausführung weiterzuarbeiten. Mit dem Default-Tool-Namen `subagent` lautet der Sektionstext:

##### Tool-Guidance-Sektion

```markdown
Use subagent in the background by default. Start independent delegations together in one assistant message and continue useful work while they run. Set `run_in_background: false` only when your next action depends on that subagent's result. When a background run settles, the runtime sends you a notice containing its outcome and any final assistant message.
```

#### Token-Effekt

Eine kurze feste Sektion pro continuable Instanz, bezahlt bei jedem Parent-Request, solange das Tool im Scope ist.

#### KV-Cache-Effekt

Präfix-stabil, solange Sektionstext und Tool-Präsenz unverändert sind; das Entfernen des Tools oder Ändern der Sektion etabliert ein anderes Parent-Präfix.

### Foreground-Ergebnis

#### Was das Modell sieht

Der Aufruf behält Beschreibung und Prompt. Erfolg enthält nur den finalen Text des Childs; andere Ausgänge werden zu `Error: <stop reason>`, gefolgt von einer sicheren Provider-Diagnose, sofern vorhanden, und dann etwaigem partiellem Assistant-Text. Zwischenschritte des Childs bleiben außerhalb des Parents.

#### Token-Effekt

Prompt und Ergebnis bleiben bis zur compaction in der Parent-Historie; der Arbeitskontext des Childs bleibt im Child.

#### KV-Cache-Effekt

Append-only; neu sichtbarer Inhalt folgt dem wiederverwendbaren Request-Präfix und invalidiert keine bestehenden KV-Cache-Einträge.

### Background-Ergebnis

#### Was das Modell sieht

Der Start gibt exakt `started subagent <childId>` im konfigurierten continuable-Modus zurück, oder `started background subagent job <id>` im konfigurierten one-shot-Modus. Im one-shot-Modus liefert die generische Task-Oberfläche spätere Status, finale Ausgabe, Abbruchantworten und Notizen; fehlgeschlagene Statusdetails enthalten die Provider-Diagnose, wenn das Ergebnis eine lieferte. Im continuable-Modus gibt dieses Tool kein eigenes Ergebnis zurück: Die Abrechnung des Childs erreicht den Parent als service-owned Notiz, ein unabhängig geladenes `send_message`-Tool liefert Folgenachrichten, und der Transcript des Childs unter seiner id ist die Quelle seiner Detailausgabe.

#### Token-Effekt

Die Bestätigung wird retained; eine one-shot-Finale-Ausgabe gelangt nur in die Parent-Historie, wenn sie eingesammelt oder injiziert wird, während die Ausgabe eines continuable Childs nie durch dieses Tool zurückkehrt — seine Settlement-Notiz trifft unabhängig von jedem Tool-Ergebnis ein.

#### KV-Cache-Effekt

Append-only; neu sichtbarer Inhalt folgt dem wiederverwendbaren Request-Präfix und invalidiert keine bestehenden KV-Cache-Einträge.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, was dieses Tool nicht zurückgibt oder nicht erzwingt; sie sind aktuelle Paket-Constraints.

- **Background-Runs exponieren kein Ergebnis über dieses Tool** — die finale Ausgabe eines one-shot-Tasks wird über die generische Task-Oberfläche eingesammelt, und die Ausgabe eines continuable Childs bleibt in dessen eigener Session, lesbar über seine subagent id. Die Settlement-Notiz sagt, wie dieses Child endete, und trägt etwaige finale Assistant-Nachrichten, aber sie ist nicht der Rückgabewert dieses Aufrufs und kann hier nicht awaited werden.
- **Doppelte Namen über wartende one-shot-Instanzen werden spät erkannt** (`TODO(subagent-dup-toolname)`) — continuable Instanzen reservieren ihren Prompt-Sektionsnamen während der Plugin-Anwendung, aber das Verhindern von Provider-Registrierungs-Rollback für wartende one-shot-Instanzen erfordert eine Registry beabsichtigter Namen.
- **Ausgelieferte fork-Tools können keine Child-LLM-Route wählen** — sie erben Provider und Modell des Parents, damit das kopierte Konversationspräfix für KV-Cache-Wiederverwendung berechtigt bleibt. Die Auswahl nur wieder aktivieren, wenn Routenänderungen die Wiederverwendung bewahren oder begrenzte Neuberechnungskosten exponieren.
- **Nicht-routing Child-Policy ist pro Instanz fixiert** — eine andere Persona, ein anderer Tool-Filter oder eine andere Tiefenobergrenze erfordert ein anders benanntes Tool. LLM-Auswahl erfordert eine aktivierte per-Session-Präferenz und einen Provider, der `agentOptions` anbietet; beide In-Process-Provider und das DSH SDK bieten es an, während ACP, Codex und Claude Code es ablehnen statt es zu ignorieren.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
