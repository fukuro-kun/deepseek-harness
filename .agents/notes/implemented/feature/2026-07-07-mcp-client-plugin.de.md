# Agent Note: MCP-Client-Plugin — externe MCP-Server anbinden und ihre Tools bridgen
[English](2026-07-07-mcp-client-plugin.md) | [中文](2026-07-07-mcp-client-plugin.zh.md) | Deutsch

Status: implemented


## Problem

Der Harness hatte keine Möglichkeit, Tools aus dem MCP-Ökosystem (Model Context Protocol) zu konsumieren. MCP ist der aufkommende Standard für Tool-Server — GitHub, Dateisysteme, Datenbanken, Codesuche und Hunderte Community-Server exponieren Tools über MCP. Nutzer wollen den Harness auf einen oder mehrere MCP-Server zeigen und deren Tools als native modellseitige Tools erscheinen lassen, ohne Glue-Code pro Server zu schreiben.

Die `ToolRuntime` akzeptiert bereits rohe JSON-Schema-Tooldefinitionen (dokumentiert im `dsh-tools`-README: „Raw JSON-Schema tool definitions (from MCP servers) are still accepted by `ToolRuntime.register()` directly"), und das Extension-Cookbook skizziert das vorgesehene Muster („MCP | one plugin per server: discover tools → `ctx.tools.register()`"). Die Infrastruktur war bereit; das Bridge-Plugin fehlte.

## Entscheidung

### Paket

Ein einzelnes Paket `@deepseek-ai/dsh-mcp-client` unter `packages/mcp/mcp-client/`. Kein Capability-Seam-Dreipaket-Split — es gibt keine absehbare zweite MCP-Client-Implementierung, und die Konvention lautet „nicht präventiv splitten" ([Capability-Seams-Agent-Note](../architecture/2026-06-13-capability-seams.de.md)).

### SDK

Es wird das offizielle [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) verwendet (`Client`, `StdioClientTransport`, `StreamableHTTPClientTransport`). Der Harness implementiert kein eigenes JSON-RPC — konsistent damit, wie ACP an `@agentclientprotocol/sdk` delegiert.

### Umfang

Nur MCP-Client (keine Server-Seite — ACP deckt die Rolle „Harness als Agent exponieren" bereits ab). Nur **Tools** werden gebrückt — Resources und Prompts sind zurückgestellt (sie erfordern konsumierende Mechanismen auf Harness-Seite, die noch nicht existieren, und der Designraum ist groß).

### Plugin-Form

Namespace-Plugin (benannte Exports `name`/`inject`/`Config`/`apply`, kein `export default`). `inject: ['tools']`. Jeder MCP-Server ist eine Plugin-Instanz in `cordis.yml` — dasselbe Paket wird N-mal mit unterschiedlichen Configs geladen, wie bei `dsh-tool-subagent`.

### Konfiguration

Flache discriminated Union über dem `transport`-Feld:

```typescript
interface StdioConfig {
  transport: 'stdio'
  serverName: string          // required namespace, ^[A-Za-z0-9_-]{1,32}$
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  toolCallTimeoutMs?: number  // default 60_000
}

interface StreamableHttpConfig {
  transport: 'streamable-http'
  serverName: string          // required namespace, ^[A-Za-z0-9_-]{1,32}$
  url: string
  headers?: Record<string, string>
  toolCallTimeoutMs?: number  // default 60_000
}

type Config = StdioConfig | StreamableHttpConfig
```

`serverName` ist die stabile lokale Identität, die die Tools dieses Servers im modellseitigen Namen (unten) namespacet. Sie ist bewusst Nutzerkonfiguration, NICHT das entfernte `serverInfo.name`: Der entfernte Name ist unvertrauenswürdige Eingabe, über Deployments hinweg nicht eindeutig (Prod- und Staging-Instanzen eines Servers melden denselben Namen) und kann sich bei einem Server-Upgrade ändern — nichts davon darf modellseitige Tools still umbenennen. Ein doppelter `serverName` über lebende Instanzen hinweg ist ein Konfigurationsfehler: Die spätere Instanz scheitert beim Laden mit einer aktionierbaren Meldung, niemals mit stillem Überschreiben oder Überspringen. Ein kurzer `serverName` (`gh`) ist außerdem der Stellhebel zum Kürzen öffentlicher Namen.

Beispiel-`cordis.yml`-Nutzung:

```yaml
- id: mcp-github
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: github
    transport: stdio
    command: npx
    args: ['-y', '@modelcontextprotocol/server-github']
    env:
      GITHUB_TOKEN: !!js process.env.GITHUB_TOKEN

- id: mcp-web
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: web
    transport: streamable-http
    url: http://localhost:3000/mcp
    headers:
      Authorization: !!js `Bearer ${process.env.MCP_TOKEN}`
```

Das Modell sieht `mcp__github__create_issue`, `mcp__github__search_code`, `mcp__web__search`.

### Lifecycle

Bootzeit aus `cordis.yml`. HMR (`@cordisjs/plugin-hmr`) liefert Hot-Swap: Das Bearbeiten des yml-Eintrags löst dispose der alten Instanz aus (trennt, deregistriert Tools) und die Erzeugung einer neuen (verbindet, discovered, registriert). Es wird keine laufzeitdynamische API angeboten. Öffentliche Namen sind reine Funktionen von `(serverName, rawName)`, sodass ein HMR-Swap, der `serverName` beibehält, identische modellseitige Namen neu erzeugt — Session-Verlauf und Permission-Regeln bleiben gültig — und das Hinzufügen oder Entfernen eines unverbundenen Servers nie ein bestehendes Tool umbenennt.

### Tool-Discovery und Registrierung

Jedes MCP-Tool hat zwei Namen:

- `rawName` — der exakte MCP-`Tool.name`, nur auf der Leitung verwendet (`tools/call`).
- `publicName` — der global eindeutige modellseitige Name, der in der `ToolRuntime` registriert wird:

      mcp__<serverName>__<rawName>

Diese server-qualifizierte Form ist der De-facto-Standard unter Multi-Server-Agent-Clients — jedes untersuchte Endnutzerprodukt qualifiziert MCP-Tools nach Server ([Claude Code](https://code.claude.com/docs/en/agent-sdk/mcp#tool-naming-convention) `mcp__github__list_issues`, [Codex](https://openai.com/index/unrolling-the-codex-agent-loop/) `mcp__weather__get-forecast`, [Gemini CLI](https://geminicli.com/docs/tools/mcp-server/#3-tool-naming-and-namespaces), [VS Code](https://github.com/microsoft/vscode/blob/ab9ec62c6a61e429a9abd612ff220c3f4834c9ea/src/vs/workbench/contrib/mcp/common/mcpServer.ts#L217-L260), [Cline](https://github.com/cline/cline/blob/52fdbb1d72f7324a28142a7ba7678d4b53c902f4/sdk/packages/core/src/extensions/mcp/name-transform.ts#L20-L35), [Roo Code](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/src/utils/mcp-name.ts#L117-L140), [Goose](https://github.com/block/goose/blob/b3a012cbdde854b0fe14f95b1c48543bf6517c0a/crates/goose/src/agents/extension_manager.rs#L1391-L1441), [OpenCode](https://github.com/anomalyco/opencode/blob/d199b1bff90282a4f9cd6251b5fc7b16875a52f6/packages/opencode/src/mcp/catalog.ts#L117-L120)); die exakte Schreibweise `mcp__<server>__<tool>` folgt Claude Code und Codex. Der `mcp__`-Marker hält MCP-Registrierungen aus dem Namespace der nativen Tools heraus und gibt Permission-/Telemetry-Regeln eine stabile Form (`mcp__*`, `mcp__github__*`).

1. Beim Verbinden: ungecachte `tools/list`-Paginierung abarbeiten, den `publicName` jedes Tools ableiten, dann jedes über `ctx.tools.register()` als rohe `ToolDefinition` registrieren. MCP-JSON-Schema und Beschreibung werden unverändert durchgereicht (keine `defineTool`-DSL-Konvertierung); nur der modellseitige `name` wird ersetzt.
2. Auf `notifications/tools/list_changed` lauschen → denselben Sync erneut ausführen (vorherige Generation disposen, neue registrieren). Deterministische Namen bedeuten, dass unveränderte Tools ihre Namen über Re-Syncs behalten.
3. Der Executor schließt über `rawName`; der öffentliche Name wird nie an den Server gesendet und nie geparst, um den rohen Namen zurückzugewinnen.
4. Kein `presentCall`/`presentResult` — UI-Consumer nutzen den provider-neutralen Generic-Card-Fallback.
5. Tools sind im System Prompt transparent — keine „[via MCP]"-Annotation über den Namen hinaus.

Jede Synchronisation weist einen wiederholten nicht-leeren Continuation-Cursor zurück, bevor sie eine weitere Seite anfordert, und behält die vorherige Tool-Generation. Leere Seiten können über Tool-Namens-Eindeutigkeit keinen Fortschritt belegen, daher erkennt die Cursor-Historie auch Zyklen über mehrere Seiten hinweg ([gemeldeter Fall](https://github.com/deepseek-ai/deepseek-harness/discussions/3660)). Die Cursor-Historie gehört zu einer Synchronisation: Ein späteres Update darf dieselben Cursor wiederverwenden. Fokussierte Bridge- und Lifecycle-Tests decken Zyklus-Zurückweisung, behaltene aufrufbare Tools, striktes Startversagen und Notification-Recovery ab. Das erkennt wiederholte Cursor; es begrenzt keinen Server, der fortwährend verschiedene Cursor zurückgibt.

### Normalisierung öffentlicher Namen

MCP erlaubt Tool-Namen bis 128 Zeichen einschließlich `.`; der DeepSeek-Funktionsnamen-Vertrag erlaubt `[A-Za-z0-9_-]` und höchstens 64. Öffentliche Namen werden deterministisch normalisiert: ungültige Zeichen werden zu `_`, und wenn Ersetzung oder Kürzung den Namen verändert hat, wird ein 12-stelliger Hex-SHA-256-Hash der `(serverName, rawName)`-Identität angehängt, sodass verschiedene MCP-Identitäten nie zum selben öffentlichen Namen kollabieren können:

```typescript
function publicToolName(serverName: string, rawName: string): string {
  const joined = `mcp__${serverName}__${rawName}`
  const normalized = joined.replace(/[^A-Za-z0-9_-]/g, '_')
  if (normalized === joined && normalized.length <= 64) return normalized
  const hash = sha256(`${serverName}\0${rawName}`).slice(0, 12)
  return `${normalized.slice(0, 64 - 13)}_${hash}`
}
```

### Umgang mit Namenskonflikten

MCP garantiert Tool-Namens-Eindeutigkeit nur [innerhalb eines Servers](https://modelcontextprotocol.io/specification/2025-11-25/server/tools#tool-names); Server-übergreifende Kollisionen sind die Norm, nicht die Ausnahme (eine [Microsoft-Research-Studie](https://www.microsoft.com/en-us/research/blog/tool-space-interference-in-the-mcp-era-designing-for-agent-compatibility-at-scale/#namespacing-issues-and-naming-ambiguity) über 1.470 Server fand 775 kollidierende Tool-Namen; `search` allein erscheint in 32 Servern, und der offizielle GitHub-Server veröffentlicht das nackte `create_issue`). Der immer aktive Namespace macht Kollisionen strukturell unmöglich, statt sie zum Kollisionszeitpunkt zu behandeln:

- Zwei Server, die `search` veröffentlichen, koexistieren als `mcp__github__search` und `mcp__web__search`.
- Ein natives Harness-Tool namens `search` ist unbetroffen.
- Doppelte `serverName`-Config lässt die spätere Instanz beim Laden scheitern (siehe Konfiguration).
- Ein Server, der denselben Tool-Namen zweimal listet, ist eine ungültige Tool-Liste: Der Sync wirft, und die vorherige Generation bleibt registriert.
- Ein Registry-Konflikt während des Swaps kann nur bedeuten, dass ein fremdes Tool auf dem `mcp__<serverName>__`-Namespace dieses Servers hockt: Die partielle Generation wird zurückgerollt (null Tools von diesem Server), und der Fehler wird laut geloggt.

Tools werden nie still übersprungen; welche Tools verfügbar sind, hängt nie von der Plugin-Ladereihenfolge ab.

### Naming-Invarianten

1. Jedes MCP-Tool hat die stabile Identität `(serverName, rawName)`; jede aktive Identität hat genau einen öffentlichen Namen.
2. Öffentliche Namen sind deterministisch, global eindeutig und erfüllen den DeepSeek-64-Zeichen-`[A-Za-z0-9_-]`-Vertrag.
3. MCP `tools/call` erhält immer den ursprünglichen Raw-Namen.
4. Verbinden, Trennen oder Re-Syncen eines unverbundenen Servers benennt nie ein bestehendes Tool um.
5. Die Registrierungsreihenfolge bestimmt nie, welches Tool verfügbar ist.

### Tool-Ausführung

Ein einheitlicher `execute`-Handler für alle Tools eines MCP-Servers:

1. `rawName` auflösen (der Executor schließt darüber) und `client.callTool({ name: rawName, arguments }, { signal: exec.signal })` mit dem konfigurierten Timeout aufrufen — der öffentliche Name wird nie an den Server gesendet.
2. Den kanonischen Erfolg als `{ content: JsonValue[], structuredContent? }` bewahren; vollständige MCP-JSON-Blöcke bleiben der programmatische/PTC-Modus-Wert. `isError: true` wirft vor jeder Bild-Persistierung, sodass die Registry den Failure-Pfad besitzt.
3. Eine separate geordnete Native-Projektion vorbereiten. Textläufe werden mit `'\n'` gejoint; Resource-Links bewahren Name und URI als Text; Audio, eingebettete Ressourcen, malformed Blöcke und unbekannte Typen werden zu expliziten Diagnosen. Existiert irgendein Bild, dekodiert die Bridge strikt den gesamten Batch, löst die neueste exakte Route des aufrufenden Agent auf, verlangt einen Attachment Store plus explizite Bild-Eingabe des Modells und delegiert die All-Member-Validierung und geordnete Persistierung an `AttachmentStore.saveImages()`. Jede Decode-, Capability- oder Storage-Weigerung rendert alle Bilder als Diagnosetext und liefert keine Teilreferenzen zurück.
4. `output.render` bleibt synchron und rein. Der Executor stellt seine reichere Projektion in einer generation-lokalen `WeakMap` bereit, keyed auf die exakte Ausführung; `finalizeContent` installiert sie nur, wenn das Post-Execute-Ergebnis der Registry noch den ursprünglichen kanonischen Wert und Fallback-Content trägt. Ein Policy-Block, ein Wert-Ersatz oder ein Content-Ersatz bleibt maßgeblich, und ein Re-Sync kann nicht zulassen, dass eine ältere Generation neuen Ausführungszustand konsumiert.
5. Der PTC-Modus erhält den unberührten kanonischen Wert. Seine generische Dispatch-Bridge verschiebt eine erfolgreiche finale Content-Sequenz, die ein Bild enthält, über das äußere `run_code`-Ergebnis, sodass MCP keinen privaten Parent-Token-Sonderfall braucht.
6. Cancellation: `exec.signal` (aus dem Cancel des Agent Loop) wird an das `callTool` des MCP SDK, die Exact-Model-Suche und das Pre-Storage-Gate durchgereicht.

### Subprocess-Umgebung (stdio-Transport)

Die Child-Umgebung wird aus der geteilten `scrubbedParentEnv()`-Basis des Subprocess-Seams gebaut, die ambient-Namen entfernt, die `/KEY|PASSWORD|SECRET|TOKEN/i` matchen, sowie ambient-`DSH_*`-Namen; dann wird `config.env` darüber gemerged. Explizite env-Overrides überleben den Scrub.

### Disconnect / Crash

Ein instanzbezogener Connection Supervisor reconnectet nach einem Verbindungsverlust automatisch mit bounded Exponential Backoff und einem Versuchsbudget pro Ausfall und führt bei Erfolg die Discovery erneut aus; Erschöpfung deregistriert die Tools des Servers und stoppt bis zum Reload. Das [Auto-Reconnect-Agent-Note](../../archived/feature/2026-08-06-mcp-client-auto-reconnect.md) besitzt diese Entscheidung einschließlich des `reconnect`-Config-Blocks und des `reconnect.enabled: false`-Opt-outs, das die manuelle HMR-/Restart-Recovery wiederherstellt.

## Betrachtete Alternativen

### MCP-Server-Seite (Harness-Tools an externe MCP-Clients exponieren)

Zurückgestellt. Die ACP-Bridge exponiert den Harness bereits als Agent-Server. Eine MCP-Server-Schicht würde das mit einem anderen Protokoll duplizieren, und das primäre Nutzerbedürfnis ist das Konsumieren externer Tools, nicht das Exponieren.

### Capability-Seam-Dreipaket-Split (Interface / Impl / Consumer)

Abgelehnt. Es gibt keine absehbare alternative MCP-Client-Implementierung — MCP hat ein Protokoll, ein SDK. Die Konvention lautet „nicht präventiv splitten", bis eine zweite Implementierung auftaucht.

### Auto-Reconnect mit Exponential Backoff

Vom Connect-once-Design abgelehnt: Es fügte einen Partial-Availability-Zustand hinzu (Tools registriert, aber vorübergehend nicht funktional), und stdio-Crashes deuten oft auf Konfigurationsprobleme hin, die Retries nicht beheben; HMR war der Recovery-Pfad. Operationales Feedback kehrte die Zurückstellung um — das [Auto-Reconnect-Agent-Note](../../archived/feature/2026-08-06-mcp-client-auto-reconnect.md) implementiert es mit begrenztem Budget pro Ausfall und einem Opt-out.

### Resources und Prompts bridgen

Zurückgestellt. Resources brauchen einen Harness-seitigen Mechanismus, der entscheidet, WANN Content injiziert wird (System Prompt? on demand? modellgetriggert?). Prompts brauchen ein „Prompt-Template"-Konzept, das dem Harness fehlt. Beides erfordert eigenes Design; Tools sind der hochwertige, risikoarme Einstiegspunkt.

### Rohe modellseitige Tool-Namen mit optionalem `toolPrefix`

Abgelehnt — das war der ursprüngliche Vorschlag, gebaut auf der Prämisse, dass „die meisten MCP-Server bereits semantische Präfixe in ihren Tool-Namen nutzen (z. B. `github_create_issue`)". Die Prämisse ist falsch: Der offizielle GitHub-Server veröffentlicht `create_issue`, der Referenz-Filesystem-Server `read_file`, Sentry `search_issues` — und die obige Microsoft-Studie zeigt, dass Kollisionen auf Ökosystem-Ebene üblich sind. Präfixieren zur Kollisionszeit (oder warn-and-skip) macht die verfügbare Tool-Menge außerdem von der Plugin-Ladereihenfolge abhängig, und ein Tool könnte still umbenannt werden, wenn ein unverbundener Server hinzukommt — was Session-Verlauf und Permission-Regeln mitten in der Konversation invalidiert. Kein untersuchtes Multi-Server-Agent-Produkt liefert rohe Namen aus.

### Server-only-Namespace (`github__create_issue`, kein `mcp__`-Marker)

Abgelehnt. Er verhindert Server-übergreifende Kollisionen, trennt MCP-Registrierungen aber nicht von nativen Harness-Tools und verschenkt MCP-weite Policy-Formen (`mcp__*`). Der Marker kostet 5 Zeichen; die Schreibweise `mcp__<server>__<tool>` stimmt mit Claude Code und Codex überein und maximiert Modellvertrautheit. Sollte die ToolRuntime später quellenbewusste Namespaces bekommen, kann das Weglassen des literalen Markers als Naming-Policy-Änderung erneut geprüft werden.

### Namespace aus dem server-annoncierten `serverInfo.name` ableiten

Abgelehnt. Der entfernte Name ist unvertrauenswürdig, über Deployments nicht eindeutig und bei Upgrades veränderbar; Tool-Identität und Permission-Regeln dürfen ihm nicht still folgen. Der Namespace ist lokale Konfiguration.

### Mehrere TextBlocks im Tool-Ergebnis bewahren

Abgelehnt. `flattenText()` im DeepSeek-Serializer nutzt `join('')` (kein Separator) beim Flachdrücken von `ContentBlock[]` ins Wire-Format. Mehrere Textblöcke würden still die Blockgrenzen verlieren — ein Korrektheitsbug. Alle bestehenden Tools geben einen einzelnen TextBlock zurück; die MCP-Bridge folgt dem.

### Das kanonische MCP-Ergebnis durch Core-`ContentBlock[]` ersetzen

Abgelehnt. Programmatische Aufrufer brauchen protokollvollständige MCP-Blöcke und `structuredContent`, während Native-Consumer dauerhafte Core-Bilder statt base64 brauchen. Ein kanonischer Protokollwert plus eine separate Projektion bewahren beide Verträge.

### Einen generischen RichContent-Service hinzufügen oder I/O in `output.render` ausführen

Abgelehnt. Core besitzt bereits das rollenneutrale Content-Vokabular, und ein zweiter Service würde seine Logging- und Ordering-Verträge duplizieren. `output.render` ist rein, synchron und replaybar, Attachment-I/O gehört also in die asynchrone Ausführung mit exakter Finalisierungs-Übergabe.

### Jedes bild-liefernde Tool PTC-Modus-Parents einzeln behandeln lassen

Abgelehnt. Das koppelt Leaf-Tools an Interna von Composite-Tools und verfehlt künftige Rich-Tools. Die generische PTC-Modus-Bridge beobachtet den finalen Post-Policy-Content und reicht bildtragende Ergebnisse einheitlich weiter.

## Testing

Die Coverage ist pro Ebene benannt; jedes Verhalten lebt auf der billigsten Ebene, die es ausdrücken kann.

- **Unit** (`tests/mcp-client.spec.ts`, `tests/apply.spec.ts`, gemocktes MCP SDK): der `publicToolName`-Algorithmus (sauber, normalisieren, truncate-and-hash, Determinismus, Distinct-Identity-Trennung), Raw-vs-Public-Wire-Disziplin, Server-übergreifende und Native-Tool-Koexistenz, Duplicate-`serverName`-Load-Fehler und Reservation-Release, Invalid-Tool-List-Zurückweisung, Generation-Swap/-Rollback, Retention bei fehlgeschlagenem Re-Sync, verlustfreie kanonische Ergebnisse, Mixed-Rich-Ordering, atomare malformed Batches, exakte Capability-/Store-Weigerungen, explizite Nicht-Bild-Diagnosen, Post-Execute-Policy-Vorrang, Cancellation und Config-Schema-Validierung. 100 % Per-File-Coverage gated das Paket.
- **E2E** (`tests/mcp-client.e2e.ts`, schlüssellos): das echte MCP-Protokoll gegen den In-Repo-Fixture-Server, `@modelcontextprotocol/server-everything` und `@modelcontextprotocol/server-filesystem` über stdio sowie gegen einen In-Process-`StreamableHTTPServerTransport`-Server über Streamable HTTP — Discovery unter dem Namespace, End-to-End-Normalisierung von Namen mit Punkten, Execution-Round-Trips, dauerhaftes Bild-Save/Read mit base64 nur im kanonischen Wert, explizite Weigerung ohne Bild-Route, Duplicate-`serverName`-Zurückweisung und Disposal.
- **Snapshot:** das assemblierte ACP-Beispiel besitzt den transport-sichtbaren Inline-Image-Transcript und den PTC-Modus-Image-Forwarding-Transcript; Paket-E2E besitzt das echte MCP-Wire, weil der ausführbare Snapshot schlüssellos und deterministisch bleiben muss statt Third-Party-Server-Pakete zu spawnen. MCP-Tool-Cards nutzen weiterhin den Generic-Card-Fallback und brauchen keinen paketspezifischen UI-Snapshot.

## Konsequenzen

- Ein `cordis.yml`-Eintrag pro MCP-Server ist der gesamte Integrationsaufwand: `serverName: filesystem` plus ein stdio-Kommando (oder eine Streamable-HTTP-URL) bringt `mcp__filesystem__read_file` in die Tool-Liste des Modells, aufrufbar, mit dem rohen `read_file` auf der Leitung.
- Öffentliche Namen sind Teil von Session-Verlauf und Permission-/Konfigurations-APIs; Tests pinnen den Naming-Algorithmus, und ihn nach Release zu ändern ist ein Breaking Change.
- Der `mcp__<serverName>__`-Qualifier kostet Tokens bei jedem Namen. Akzeptiert: Descriptions und JSON Schemas dominieren Tool-Definition-Tokens, und der Qualifier erkauft stabile Identität, Kollisionsisolation und MCP-weite Policy-Formen (`mcp__*`, `mcp__github__*`).
- **MCP-SDK-Stabilität:** das `@modelcontextprotocol/sdk` entwickelt sich noch; Breaking Changes erfordern ein Update der Bridge. Die Version ist gepinnt, und das SDK ist weit verbreitet (Claude Desktop, Cursor, VS Code), sodass Breaking Changes kaum still passieren.
- **Tool-Schema-Qualität:** MCP-Server können schlecht beschriebene Tools exponieren (vage Descriptions, unvollständige JSON Schemas). Der Harness reicht sie unverändert durch — Garbage in, Garbage out; das ist die Verantwortung des Server-Autors, nicht der Bridge.
- **Stdio-Prozessmanagement:** ein sich danebenbenehmender MCP-Server, der Signale ignoriert, könnte dispose blockieren. Die Cordis-Fiber-Disposal hat begrenzte Quiescence; ein hängender Transport läuft am Ende auf Framework-Ebene in einen Timeout.
- Crash-Recovery läuft automatisch innerhalb des [Reconnect-Budgets](../../archived/feature/2026-08-06-mcp-client-auto-reconnect.md); nach Erschöpfung oder mit `reconnect.enabled: false` bleibt manueller Reload der Pfad.
- Bild-Payloads können den Modellkontext nur über den geteilten dauerhaften Attachment Store und eine exakte positive Route-Capability betreten. Audio- und Embedded-Resource-Payloads bleiben ausführungslokal mit expliziten Diagnosen.
