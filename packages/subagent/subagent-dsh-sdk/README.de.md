---
description: "Das prozessexterne SDK-subagent-Backend für Nutzer und Maintainer, die einen Delegation-Provider wählen, ein Kind-Harness-Runtime-Kommando konfigurieren oder entfernte Kindläufe debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-subagent-dsh-sdk

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`dsh-subagent-dsh-sdk` führt jede delegierte Aufgabe in einem frischen DeepSeek-Harness-Subprozess mit eigenem Profil, eigener Session, eigener Model-Route und eigenen Tools aus. Der Parent liefert Aufgabe und Arbeitsverzeichnis, während jedes Kind seine konfigurierte Runtime nutzt und von der Parent-Konversation isoliert bleibt. Der Parent erhält den finalen Assistant-Text des Kindes oder einen sicheren Fehler; Zwischenmeldungen und Tool-Verkehr bleiben im Kindprozess. Wähle dieses Backend, wenn eine Delegation eine vollständige Harness-Runtime statt geteiltem In-Process-State braucht, und akzeptiere die Kosten, für jeden Lauf einen neuen Prozess zu starten.

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

Mounte diesen Provider, wenn eine Delegation als vollständige Harness-Runtime im eigenen Prozess laufen soll. Der übliche Weg ist explizit: Mounte den seam, mounte diesen Provider und gib ihm ein Kommando, das eine SDK-Runtime mit eigener `cordis.yml` startet.

### Wann es gewählt wird

Wähle dieses Backend, wenn das Kind ein vollwertiger Harness-Peer sein muss — eigene Komposition, Session-Persistenz, Model-Route und Tools — statt eines agent, der den Prozess des Parents teilt. Wähle ein In-Process-Backend, wenn das Kind die Komposition des Parents teilen oder parent-erzwungene Nicht-Routen-Fähigkeiten beachten muss: Dieser Provider akzeptiert agent-Route-Optionen, lehnt aber Structured Output, Tiefenlimits, Tool-Filter und Personas ab, statt sie stillschweigend wegzulassen.

Der Provider meldet `agentOptions: true`, mit `outputSchema`/`depthLimit`/`toolFilter`/`persona` auf false und `inheritsParentContext: false`. Seine unveränderlichen `agentRouteDefaults` veröffentlichen die konfigurierte Provider/Model-Baseline an `dsh-tool-subagent`, bevor Model-Overrides und Exakt-Routen-Preflight greifen; `start()` wendet dieselben Konfigurationsdefaults für direkte Aufrufer und `maxTokens` unabhängig an. Agent-Route-Werte queren die SDK-Verbindung als explizite Allowlist; das Kind bleibt eine frische Runtime in einem anderen Prozess, und der einzige vom Parent-agent selbst abgeleitete Wert ist das Workspace-cwd. `dsh-tool-subagent`-Deployments über diesem Provider setzen `maxDepth: 'provider-managed'` — der Kind-Harness besitzt sein eigenes Rekursionsbudget.

### Konfiguration

| Feld | Standard | Bedeutung |
|---|---|---|
| `providerName` | `dsh-sdk` | Registry-Name auf `ctx.subagents` |
| `dshBin` | SDK-Abhängigkeit | Explizites dsh-CLI-Modul, beim Plugin-Load aufgelöst und geprüft; Weglassen nutzt die SDK-Abhängigkeit |
| `profile` | `sdk` | Benanntes Kind-Profil |
| `patches` | `[]` | Geordnete Profil-Patch-Dateien pro Start, beim Plugin-Load aufgelöst und geprüft |
| `dshHome` | erforderlich | Absolutes isoliertes Harness-Home für jeden verschachtelten Kindprozess |
| `cwd` | Parent-Session-cwd | Arbeitsverzeichnis-Override für den Kindprozess und seine SDK-Session |
| `provider` | `deepseek-official` | Provider-Route, die im `initialize` des Kindes gesendet wird |
| `model` | `deepseek-v4-flash` | Model, das im `initialize` des Kindes gesendet wird |
| `maxTokens` | Adapter-/Provider-Routen-Default | Output-Token-Cap pro Anfrage, im `initialize` des Kindes gesendet |
| `env` | `{}` | Explizite Kind-Umgebung, über die von Credentials bereinigte Parent-Umgebung gelegt |
| `shutdownTimeoutMs` | `1000` | Grenze für den Protokoll-`shutdown`-Austausch beim Dispose |
| `disposeEofGraceMs` | `6000` | Gnadenfrist nach stdin-EOF vor der Plattform-Terminierung |
| `disposeGraceMs` | `3000` | Exit-Bestätigungs-Gnadenfrist nach der Terminierung |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-subagent-dsh-sdk) ist die erschöpfende Quelle für jedes akzeptierte Feld und dessen JSDoc.

Request-`agentOptions` überschreiben `provider`, `model` und `maxTokens` unabhängig voneinander. `reasoningEffort` hat keinen Provider-Instanz-Default: Eine ausgelassene Anfrage lässt es abwesend, sodass das gewählte Kind-Model seinen eigenen Default auflöst. Das modellseitige subagent-Tool kann Provider/Model/Reasoning pro Aufruf wählen; `maxTokens` bleibt deployment-gesteuert über die Tool-Konfiguration oder den Default dieses Providers.

```yaml
- id: subagent-dsh-sdk
  name: '@deepseek-ai/dsh-subagent-dsh-sdk'
  config:
    providerName: dsh-sdk
    profile: sdk
    patches: ['./profiles/research-child.cordis.yml']
    dshHome: !!js dshHomePath('children')
    maxTokens: 49152
    env:
      DEEPSEEK_API_KEY: !!js process.env.DEEPSEEK_API_KEY
- id: tool-subagent
  name: '@deepseek-ai/dsh-tool-subagent'
  config: { provider: dsh-sdk, toolName: subagent, maxDepth: 'provider-managed' }
```

### Was du bekommst

Ein erfolgreicher Lauf gibt den finalen Assistant-Text des Kindes (oder akkumulierten Teiltonext nach Abbruch) als Ergebnis-Output zurück. Model-Route, Tools und Session des Kindes kommen von der Kind-Runtime selbst — der Parent liefert Aufgabe, Arbeitsverzeichnis und `initialize`-Route. Der letzte dauerhafte `turn/end` des Kindes wird in das seam-Vokabular abgebildet: `completed` und `max-tokens` gehen durch, `blocked` wird zu `refusal`, und ein unerwarteter oder fehlender Endzustand wird zu `error`. Ein `aborted`-Ergebnis bleibt aborted; nur eine kindseitige `disposed`-Ursache fügt eine `child-disposed`-Diagnose hinzu.

### Fehler und Wiederherstellung

Eine bereits abgebrochene Anfrage scheitert vor der Pfadauflösung oder dem Spawn. Ein Routen-, Spawn-, Handshake- oder Pre-Publikations-Abbruchfehler rejectet normalerweise erst, nachdem der Subprozess eingesammelt ist. Wenn Initialisierung und Aufräumen beide scheitern, bewahren die geordneten sicheren Fakten beide Fehler, ohne Quiescence zu behaupten. Eine Kind-Runtime, die nach der Publikation scheitert, wird über den Lauf abgerechnet statt ihn zu rejecten; Teiltoner-Output bleibt von der sicheren Diagnose getrennt. Diagnosen offenbaren nur den Provider plus `initialize`-, `session-run`- oder `shutdown`-Stufe und eine feste Kategorie. Sie kopieren niemals SDK-Nachrichten, stderr, Pfade, Aufgabeninhalt, Umgebungswerte, Credentials oder Protokoll-Payloads.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen</summary>

Dieser Abschnitt erklärt, wie das Backend eine Kind-Harness-Runtime steuert und woher das beobachtbare Verhalten kommt; der vollständige Vertrag steht in [Dieses Paket verwenden](#use-this-package).

### Designkonzept

- **Vollwertiger Harness-Peer.** Jedes Kind ist eine vollständige Harness-Runtime im eigenen Prozess — eigene Komposition, Session, Model-Route und Tools; nur das aufgelöste Arbeitsverzeichnis und die `initialize`-Route queren vom Parent.
- **Eine Runtime pro Lauf.** Jeder Lauf spawnnt eine frische Runtime-Prozess; es gibt kein Pooling.
- **Die JSON-RPC-Verbindung ist die Serialisierungsgrenze.** In-Process-subagent-Werte werden nicht defensiv geklont; das Protokoll ist der Ort, an dem feindliche Eingaben validiert werden.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Eintritt: Config-schema, Provider-Registrierung |
| [`src/run.ts`](src/run.ts) | Der SDK-Lauf-Lebenszyklus, Antwort-Extraktion und Stop-Reason-Mapping |

### Lauffluss

Ein Start löst vor dem Spawn das Arbeitsverzeichnis des Kindes und eine prozessweite SDK-Route auf. Jedes deklarierte `request.agentOptions`-Feld (`provider`, `model`, `reasoningEffort` oder `maxTokens`) überschreibt den passenden Provider-Instanz-Default; Weglassen bewahrt Provider/Model und das optionale Cap, während Reasoning-Effort abwesend bleibt, sofern die Anfrage es nicht liefert. Der Provider spawnnt die Runtime über den SDK-Client und vollendet den `initialize`-Handshake — einschließlich Exakt-Model- und Effort-Validierung — bevor er erfüllt. Ein Routen-, Spawn-, Handshake- oder Pre-Publikations-Abbruchfehler rejectet erst, nachdem der Subprozess eingesammelt ist; ein Fehler bei der Arbeitsverzeichnis-Auflösung rejectet vor dem Spawn. Nach der Publikation besitzt der Provider eine SDK-Aktivität und liest die Antwort des Kindes aus dessen Session-Events: die letzte vollständige nichtleere `assistant/message` (eine leere Inhalts-Nachricht, die usage aufzeichnet, wird übersprungen) oder der akkumulierte `text-delta`-Stream, wenn es keine solche Nachricht gibt. Das Disposen ist idempotent: Es rechnet das Ergebnis lokal als `aborted` ab, sendet eine begrenzte Protokoll-`shutdown`-Anfrage und eskaliert dann über stdin-EOF → SIGTERM → SIGKILL bis zum tatsächlichen Exit.

### Stop-Reason-Mapping

Der letzte `turn/end`-Grund des Kindes wird in [`src/run.ts`](src/run.ts) in das gemeinsame Stop-Reason-Vokabular abgebildet.

### Prozessgrenze

Die Kind-Umgebung ist die von Credentials bereinigte Parent-Umgebung des Subprozess-seam, wobei explizite `config.env`-Werte nach der Bereinigung gemerged werden. Das Kind wird vom SDK-Client gespawnt statt über `ctx.subprocess` — die dokumentierte Ausnahme für SDK-verwaltete Transporte — weshalb dieses Backend die Bereinigung selbst anwendet.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paketvertrag nicht ausreicht. Sie führen von diesem Backend zu dem seam, in den es einsteckt, und zum SDK, den es steuert.

- [Subagent-Subsystem](../../../docs/subsystems/subagent.de.md) — der Service-Vertrag, der Provider-Vertrag und die Semantik des Endergebnisses.
- [dsh-subagent-seam](../subagent/README.de.md) — die Registry und Start-API, auf der sich dieser Provider registriert.
- [ACP-subagent-Backend](../subagent-acp/README.de.md) — der geschwisterliche prozessexterne Provider über das Agent Client Protocol.
- [TypeScript-SDK-Client](../../sdk/client/README.de.md) — der stdio-JSON-RPC-Client, über den dieses Backend das Kind steuert.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-subagent-dsh-sdk) — jedes akzeptierte Config-Feld und seine Quelldeklaration.

-----

<a id="model-experience"></a>
## Model Experience

### Kind-agent-Anfrage

#### Was das Model sieht

Das Model der Kind-Runtime empfängt die eigenständige Aufgabe als User-Nachricht plus den eigenen konfigurierten System-Prompt, die Tools und die frische Session dieser Runtime. Es empfängt keine Parent-Konversation. Ein Parent-Tool-Call kann Provider, Model und Reasoning-Effort des Kindes für diesen Lauf wählen; die gewählte Route und ein deployment-eigenes Output-Cap sind für den neuen Kindprozess fixiert. Persona, Tool-Filterung, Tiefendurchsetzung und Structured Output bleiben nicht unterstützt und werden abgelehnt statt still weggelassen.

#### Token-Effekt

Das Kind bezahlt für einen eigenen vollständigen Kontext und seine eigene mehrstufige Historie. Diese Tokens gelangen niemals in den Kontext des Parents.

#### KV-Cache-Effekt

Unabhängig vom Request-Cache des Parents. Jedes SDK-Kind kann nur Präfixe wiederverwenden, die unter seinem eigenen Provider, Model, seiner Komposition und Historie identisch sind; Kind-Schritte wachsen sonst append-only.

### Parent-Tool-Ergebnis, indirekt

#### Was das Model sieht

Über `dsh-tool-subagent` empfängt der Parent nur den finalen Assistant-Text des Kindes (oder akkumulierten Teiltext) oder den exakten Stop-Reason-Fehler dieses Consumers — nicht Zwischenmeldungen oder Tool-Verkehr. Ein nicht-completes Ergebnis mit Diagnose stellt die sichere Diagnose vor den getrennt bewahrten partiellen Assistant-Output; Start- und Shutdown-Fehler legen dieselben festen Fakten ohne rohen SDK-Text offen.

#### Token-Effekt

Der Parent-Input wächst nur um das Endergebnis oder den Fehler, was datenabhängig ist und bis zur Compaction aufbewahrt wird. Dieser Provider fügt selbst kein Parent-schema hinzu.

#### KV-Cache-Effekt

Append-only; neu sichtbarer Inhalt folgt dem wiederverwendbaren Anfragepräfix und invalidiert keine vorhandenen KV-Cache-Einträge.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann dieses Backend schlecht passt oder besondere Betriebssorgfalt braucht. Sie sind aktuelle Paket-Constraints, kein allgemeiner SDK-Vergleich und kein Aufgabenrückstand.

- **Eine frische Runtime pro Lauf** — kein Pooling; eine Harness-Runtime bootet einen vollen Plugin-Baum, sodass die Spawn-Kosten pro Lauf höher sind als beim typischen Kind des ACP-Backends.
- **Keine Nicht-Routen-Fähigkeiten zur Startzeit** — der Parent kann die Kind-agent-Route wählen, kann aber `outputSchema`, Tiefe, Tool-Filter oder Persona nicht im Kindprozess durchsetzen; konfiguriere stattdessen das gewählte Kind-Profil und seine geordneten Patches.
- **Der Transcript des Kindes bleibt im eigenen Session-Root des Kindes** — das Parent-Log zeichnet nur den Delegations-Tool-Call und das Ergebnis auf; der gestreamte `session.event`-Kanal wird zur Output-Extraktion konsumiert, nicht ins Parent-Log gebrückt.
- **Nur lokale Kindprozesse** — das aufgelöste Arbeitsverzeichnis ist ein lokaler Pfad; eine entfernte Runtime bräuchte ein eigenes Backend.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: offene Fragen und unentschiedene Richtungen. Sie ist ausdrücklich nicht maßgeblich — ausgeliefertes Verhalten und Grenzen stehen in den Abschnitten oben und im Paketcode.

- **Spawn-Kosten** — der volle Plugin-Baum pro Lauf ist der Preis vollständiger Isolation; Pooling würde diesen Trade-off verändern.
- **Entfernte Runtimes** — eine entfernte Runtime bräuchte ein eigenes Backend und eine eigene Workspace-Abbildung.

</details>

**Runtime-Invariante:** Es wird kein Begleiter veröffentlicht. Die Lauf-Lebenszyklus-Paarung wird von der Invariante des subagent-seam geprüft; der eigene Zustand dieses Backends lebt im Kindprozess jenseits der Event-Streams dieses Kontexts.
