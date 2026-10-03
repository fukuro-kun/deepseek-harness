# Agent Note: Tool-Output-Spill-Policy

Status: implemented

[English](2026-07-08-tool-output-spill-files.md) | [中文](2026-07-08-tool-output-spill-files.zh.md) | Deutsch

## Problem

Tool-Outputs brauchen begrenzte modellseitige Previews, aber manche übergroße Ergebnisse sind später noch nützlich. Ein gefetchter Seiten-Body oder eine verbose Tool-Antwort sollte den nächsten Modell-Request nicht vollständig verbrauchen, aber das Modell sollte das vollständige formatierte Ergebnis später mit bestehenden Datei-Lese-Tools inspizieren können.

Vor dieser Änderung war das Verhalten uneinheitlich. `dsh-bash-local` schreibt vollständige stdout/stderr-Streams bereits in private Temp-Spill-Dateien, wenn sein In-Memory-Tail überläuft, aber gewöhnliche Text-Tool-Ergebnisse wurden inline zurückgegeben, es sei denn, das Tool baute seine eigene Begrenzung von Hand. Die [Tool-Result-Retention-Bibliothek](../../archived/architecture/2026-07-06-tool-result-retention-library.md) besitzt Preview-Mechanik, aber sie besitzt weder Storage noch eine Execution-Pipeline-Policy, die diese Mechanik auf finale Tool-Ergebnisse anwendet.

Die Form entspricht dem Timeout-Policy-Design: Ein Tool-Autor deklariert einen kanonischen Wert plus nativen Renderer, und ein Policy-Plugin setzt das Default-Kontext-Budget des Deployments auf gerenderten Inhalt durch. Tool-spezifischer früher Spill bleibt für Provider-Acquisition-Grenzen möglich; Tool-eigener Präsentations-Spill darf einen vollständigen akquirierten kanonischen Wert behalten, während er nur die Präsentation ersetzt. Der [kanonische Tool-Output-Vertrag](2026-07-20-canonical-tool-output-contract.md) besitzt diese Trennung.

## Entscheidung

Ein dünner Spill-Storage-Seam plus ein Default-Spill-Policy-Plugin, in einer neuen `packages/spill/`-Gruppe:

| Paket | Rolle |
|---|---|
| `@deepseek-ai/dsh-spill` | Interface: `ctx.spillStore`, Vocabulary-Typen, keine Storage-Implementation. |
| `@deepseek-ai/dsh-spill-local` | Lokales Backend: privater, session-gescopter Datei-Storage auf dem Host-Dateisystem. |
| `@deepseek-ai/dsh-spill-policy` | Tool-Result-Policy-Plugin: umhüllt finale Text-Ergebnisse nach Dispatch und ersetzt übergroße Ergebnisse durch ein behaltenes Preview plus einen Spill-Locator. |

Der Tool-Result-Consumer ist `dsh-spill-policy`, der finale Tool-Ergebnisse über den `tools/post-execute`-Waterfall konsumiert. Das Modell folgt dem Backend-gelieferten Retrieval-Hint für den zurückgegebenen Locator. [Session-Reference-Spill-Reuse](../bug-fix/2026-09-05-session-reference-spill-reuse.de.md) fügt einen direkten Storage-Consumer mit separater Preview-, Provenance- und Failure-Semantik hinzu; es ändert die Tool-Result-Policy nicht.

### Spill-Seam

Der Storage-Seam ist minimal: Text speichern und einen Locator plus Retrieval-Hint zurückgeben.

```ts ignore-check
interface SpillStore {
  saveText(input: SaveTextSpill): Promise<SpillRef>
}

type SpillSource = {
  kind: 'tool'
  toolName: string
  callId: ToolCallId
  label: string
} | {
  kind: 'session-reference'
  sessionId: SessionId
  label: string
}

interface SaveTextSpill {
  owner: { sessionId: SessionId }
  source: SpillSource
  suggestedName: string
  content: string
}

type SpillLocator = Branded<'SpillLocator'>

interface SpillRef {
  locator: SpillLocator
  bytes: number
  retrievalHint: string
}
```

`SpillLocator` ist ein [gebrandetes](../../../../packages/util/brand) modellseitiges Handle, das das Backend zurückgibt. Das lokale Backend rendert es als Dateisystem-Pfad; ein Remote- oder Datenbank-Backend kann eine URI, einen Key oder ein Befehls-Token rendern. Consumer behandeln es als opak und rendern es mit `retrievalHint`, statt anzunehmen, dass `read` immer der richtige Retrieval-Mechanismus ist. `SpillOwner.sessionId` ist der Save-Time-Storage-Namespace: Geforkte Sessions erben bestehende Spill-Locators aus dem geseedten Log, ohne sie zu kopieren oder neu zu besitzen, und neue Spills nach dem Fork nutzen die Child-Session-ID. Ein Retention-Period-Cleanup darf alte Locators zusammen mit anderen alten Session-Artefakten ablaufen lassen; der Spill-Seam definiert keine Per-Session-Cleanup-Policy.

`dsh-spill-local` besitzt Storage-Details: Session-gescopte Verzeichnis-Auswahl, sichere Namen, Path-Traversal-Schutz, den Write, lokale Artefakt-Lebensdauer und die Rückgabe von `{ locator, bytes, retrievalHint }`. Es besitzt weder Tool-Result-Ersetzung, modellseitige Preview-Policy, Suche, Datei-Inspektion noch eine Seam-weite/Per-Session-Retention-Policy. Dateien landen unter `<root>/session-<hash>/<random>-<safeName>`, wobei `root` ein konfigurierter Pfad oder ein lazily erzeugtes privates (0700) Per-Process-Temp-Verzeichnis ist, das Session-Unterverzeichnis ein kurzes `sha256(sessionId)`-Präfix und das Blatt ein zufälliges Hex-Präfix plus das zu einem Pfadsegment bereinigte `suggestedName` des Callers (spiegelt das `encodeSegment` des JSONL-Backends). Der Write ist `open(path, 'wx', 0o600)` — exklusiv und nur-owner, sodass ein gepflanzter Symlink ihn nicht umleiten kann. Der Locator ist der Pfad, und der Retrieval-Hint sagt dem Modell, dass es `read` oder `grep` auf diesem Pfad nutzen kann. Sein einmaliger Startup-Cleanup wendet die Backend-spezifische Artefakt-Lebensdauer an, die in der [Local-Spill-Cleanup-Note](../../archived/architecture/2026-07-17-local-spill-startup-cleanup.md) beschrieben ist.

### Spill-Policy

`dsh-spill-policy` ist ein `tools/post-execute`-Ergebnis-Transformer mit einem Konfigurations-Regler:

```ts ignore-check
interface Config {
  /** Omitted means no automatic spill policy. Present means apply to oversized plain text tool results. */
  maxInlineBytes?: number
}
```

Wenn `maxInlineBytes` weggelassen wird, registriert das Plugin nichts (ein echter No-Op). Wenn gesetzt, wendet es eine Default-Policy auf finale Plain-Text-Tool-Ergebnisse an:

1. Das Tool normal laufen lassen, via `next()` delegieren, sodass ein Downstream-Listener das Ergebnis zuerst abrechnet.
2. Das akzeptierte finale `ContentBlock[]` nur flachdrücken, wenn es vollständig Plain-Text ist; ein Ergebnis mit irgendeinem Nicht-Text-Block bleibt unberührt.
3. Wenn seine UTF-8-Byte-Größe auf oder unter `maxInlineBytes` liegt, unverändert lassen.
4. Wenn es größer ist, `ctx.spillStore.saveText()` mit dem vollständigen finalen Text aufrufen.
5. Das modellseitige Ergebnis durch ein behaltenes Head/Tail-Preview plus die Spill-Referenz ersetzen.

Das Preview ist ein Implementation-Default im Besitz der Policy: ein Head/Tail-Split von `maxInlineBytes` über den `TextRetainer` der Retention-Bibliothek. Zukünftige Config kann Preview-Sizing erst exponieren, nachdem ein zweites Deployment es braucht.

Der Ersatz-Text ist bewusst generisch, weil die Policy nur das finale formatierte Tool-Ergebnis kennt, nicht die interne Ressource des Tools:

```text
<retained preview>

(Omitted N bytes. Full formatted result stored at: /.../session-.../....txt. Use read with offset/limit, or grep this path to search within it.)
```

Wenn `ctx.spillStore.saveText()` fehlschlägt (Berechtigungen, ENOSPC, Backend nicht verfügbar), oder der Call keinen Session-Owner hat, oder kein Backend geladen ist, loggt das Plugin den Grund und gibt das Original-Ergebnis unverändert zurück. Spill-Fehler verwandelt einen erfolgreichen Tool-Call nie in ein `isError`-Ergebnis oder versteckt das Inline-Ergebnis.

Die Policy überspringt `read`, um eine zirkuläre `read -> spill file -> read again`-Schleife zu vermeiden. Zusätzliche Opt-out-Konfiguration wird zurückgestellt, bis ein echtes zweites Tool sie braucht.

## Showcase: web_fetch

`web_fetch` ist der erste Showcase, weil es ein natürlich großes Text-Ergebnis zurückgibt und keinen Tool-spezifischen Spill-Code braucht. Das Tool ist gewöhnlich:

```ts ignore-check
ctx.tools.register(defineTool({
  name: 'web_fetch',
  output: {
    schema: WEB_FETCH_RESULT_SCHEMA,
    render: (_args, value) => [{ type: 'text', text: formatFetchOutput(value) }],
  },
  async execute(args, exec) {
    const result = await ctx.web.fetch({ url: args.url }, exec.signal ? { signal: exec.signal } : undefined)
    return result
  },
}))
```

Mit konfiguriertem `dsh-spill-policy` wird ein großes formatiertes Fetch-Ergebnis automatisch retained und gespillt. Ein Deployment demonstriert das Verhalten, indem es den Provider-Ressourcen-Cap höher setzt als den Policy-Cap:

```yaml
- id: web-fetch-http
  name: '@deepseek-ai/dsh-web-fetch-http'
  config:
    maxBodyChars: 500000

- id: spill-local
  name: '@deepseek-ai/dsh-spill-local'

- id: spill-policy
  name: '@deepseek-ai/dsh-spill-policy'
  config:
    maxInlineBytes: 50000
```

Diese Trennung ist wichtig. `web-fetch-http` besitzt weiterhin Ressourcen-Caps (`maxResponseBytes`, `maxBodyChars`), um Netzwerk, Speicher und Decoding-Arbeit zu schützen. `spill-policy` besitzt nur den modellseitigen Kontext-Cap, nachdem das Ergebnis bereits existiert. Wenn der Provider bereits `truncated: true` zurückgab, enthält die Spill-Datei das vollständige formatierte Ergebnis, das das Tool zurückgab, nicht die vollständige Original-Webseite; die Policy behauptet nichts anderes.

## Verhältnis zu Retention und frühem Spill

Retention ist getrennt von Spill-Storage:

- `@deepseek-ai/dsh-output-retention` besitzt Preview-Mechanik (`TextRetainer`, `ItemRetainer` und Omitted-Metadaten).
- `@deepseek-ai/dsh-spill` besitzt das Speichern von finalem Text und das Zurückgeben eines Locators plus Retrieval-Hint.
- `@deepseek-ai/dsh-spill-policy` wendet die Default-Final-Result-Policy in der Tool-Pipeline an und komponiert die beiden.

Die Final-Result-Policy kann Tool-eigenen frühen Spill nicht ersetzen. Manche nützliche Inhalte sind in finalem `ToolExecutionResult.content` nicht vorhanden:

- `bash`-Final-Output ist bereits ein Tail plus ein Temp-Spill-Pfad; die vollständigen stdout/stderr-Streams leben in Executor-Dateien.
- `subagent`-Final-Output ist die finale Antwort des Kinds, nicht der Child-Rollout.
- Zukünftige Tools können Runtime-Artefakte produzieren, die nie durch ihr finales `ToolExecutionResult.content` repräsentiert werden.

Diese Fälle können `ctx.spillStore` in späterer Arbeit direkt konsumieren. Sie sind nicht Teil des ersten Showcases.

## Non-Goals

- Diese Entscheidung fügt kein modellseitiges `artifact_read`- oder `artifact_search`-Tool hinzu.
- Diese Entscheidung fügt keine Per-Tool-Retention-Konfiguration hinzu.
- Keine modellseitigen Timeout-/Truncation-Argumente.
- Keine Migration von `read`-Output in Spill-Dateien.
- Kein Ersatz für Provider-/Ressourcen-Caps wie `web-fetch-http.maxBodyChars`.
- Keine Bash-Temp-Datei-Normalisierung oder Subagent-Rollout-Capture im ersten Cut.

## Zurückgestellt

- `saveFile()` / `linkOrCopy` für bestehende Executor-Spill-Dateien, benötigt für Bash-Normalisierung.
- Tool-eigener Spill für Subagent-Rollouts (`await run.result`, In-Process-Child-Session vor `run.dispose()` lesen, JSONL speichern).
- Per-Tool-Opt-out oder Per-Tool-Policy-Deklarationen, falls der eingebaute `read`-Skip nicht reicht.
- Remote- oder Datenbank-Storage-Backends für ACP- oder Remote-Umgebungen, wo ein lokaler Pfad nicht sinnvoll ist.

Cleanup für das lokale Backend wurde als einmaliger Startup-Sweep ausgeliefert, nicht an Session-Löschung gebunden — siehe die [Startup-Cleanup-Agent-Note](../../archived/architecture/2026-07-17-local-spill-startup-cleanup.md). Der Seam definiert weiterhin keine Per-Session-Cleanup-Policy; Retention ist ein Backend-Belang.

## Testing

- `dsh-spill`-Unit-Tests pinnen den Seam-Vertrag: Registrierung als `ctx.spillStore`, eine-Implementation-pro-Kontext und Disposal-Freigabe.
- `dsh-spill-local`-Unit-Tests decken `saveText`, `encodeSegment`-Bereinigung (Separatoren/Tilde/Ganzsegment-Punkte/leer), das Session-Hash-Verzeichnis, Owner-only-Permissions, distinkte Pfade pro Save, den konfigurierten/privaten Root und eine Storage-Failure-Rejection ab.
- `dsh-spill-policy`-Unit-Tests treiben echte Tools durch `ctx.tools.execute`: Disabled-Mode-No-Op, Übergroßer-Text-Ersatz, Klein/Nicht-Text-Passthrough, `read`-Skip, Best-Effort-Fallback (Save-Fehler / kein Backend / kein Owner) und Downstream-Komposition (Bounding eines ersetzten Ergebnisses, `additionalContexts` bewahren).
- `dsh-tool-web`-Integration treibt `web_fetch` durch `ctx.tools.execute` mit dem echten `spill-local`-Backend + Policy und beweist, dass sich der modellseitige Text nur um die bewusste Spill-Notiz ändert, während die Spill-Datei das vollständige formatierte Ergebnis hält.
- Das `tui-agent`-Beispiel lädt `spill-local` + `spill-policy`, sodass sein keyless Loader/PTY-Smoke den echten Ladepfad ausübt (die Namespace-Plugin-Export-Form + `inject`).

## Konsequenzen

Die Default-Policy sieht nur finalen formatierten Text. Sie kann Provider-internen Inhalt, der bereits gecapt war, oder Runtime-Artefakte, die nie Teil des Ergebnisses waren, nicht bewahren. Das ist für den ersten Cut akzeptabel, weil der Showcase Final-Result-Spill ist, nicht früher Spill; Tool-eigener früher Spill bleibt zurückgestellte Arbeit.

Echte Pfade zurückzugeben hält das lokale Backend einfach und entspricht bewährtem Agent-Tool-Verhalten, während der Seam selbst nur einen opaken Locator plus Retrieval-Hint verspricht, sodass Remote-Backends Nicht-Datei-Locators zurückgeben können.

Die Wert-Aussage des lokalen Backends hängt davon ab, dass die bestehenden `read`/`grep`-Tools den zurückgegebenen lokalen Pfad inspizieren können, selbst wenn das Spill-Verzeichnis außerhalb des Session-Cwd liegt. Das gilt, weil die Filesystem-Policy Beobachtungen und Write-Guards aufzeichnet, aber Reads nicht auf den Workspace beschränkt. Eine zukünftige Workspace-Confinement-Policy muss entweder lokale Spill-Pfade explizit erlauben oder ein Nicht-Datei-Spill-Backend nutzen, dessen Retrieval-Hint auf einen unterstützten Reader zeigt.

**Snapshot-Lücke.** Kein ACP-Snapshot-Szenario deckt bisher die transcript-sichtbare `web_fetch`-Spill-Notiz ab. Der ACP-Snapshot-Harness replayt keyless und kann das Live-Web nicht erreichen, und ein `web_fetch`-Spill braucht einen echten Over-Cap-HTTP-Body; ein deterministisches Szenario bräuchte ein geseedtes Loopback-Fetch-Ziel, das der Replay-Tree aktuell nicht verdrahtet (die Beispiele laden `tool-web` überhaupt nicht). Das Verhalten wird stattdessen durch den `dsh-tool-web`-Integrationstest gegen einen Loopback-Server abgedeckt. Die Lücke zu schließen ist Folge-Arbeit: `tool-web` + ein geseedtes Fetch-Ziel ins ACP-Beispiel verdrahten, dann ein `web-fetch-spill`-Szenario aufzeichnen.

Die Policy kann zu groß werden, wenn sie anfängt, Tool-spezifische Semantik zu besitzen. Sie bleibt eng: nur Plain-Text-Final-Ergebnisse. Tool-eigener früher Spill bleibt Zukunfts-Arbeit.

## Erwogene Alternativen

**Von jedem Tool ein Opt-in mit Retention-Deklaration verlangen.** Abgelehnt: Das Ziel ist ein Default-Verhalten ähnlich Claude Codes generischer Tool-Result-Persistenz. Ein einzelner `maxInlineBytes`-Deployment-Regler reicht, um die Form zu beweisen.

**`tool-results` zu einer breiten Tool-Result-Plattform machen.** Abgelehnt: Ein breiter Paketname lädt Retention-Policy, Ergebnis-Ersetzung, Preview-Formulierung, Suche und frühen Spill in einen Seam ein. Das geteilte Storage-Stück ist kleiner: Text speichern und einen Locator plus Retrieval-Hint zurückgeben.

**`ctx.fs.writeText` oder das modellseitige `write`-Tool verwenden.** Abgelehnt: Workspace-Filesystem-Writes tragen Projekt-Datei-Semantik, Write/Edit-Policy, Beobachtungs-Zustand und User-facing Side Effects. Spill-Dateien sind Runtime-Artefakte, keine modell-authored Workspace-Edits. Das bestehende `read`-Tool darf sie später inspizieren, aber Erstellung gehört zum Runtime-Spill-Seam.

**`web-fetch-http` ohne Caps fetchen lassen und auf spill-policy verlassen.** Abgelehnt: spill-policy läuft, nachdem das finale Tool-Ergebnis existiert, und kann Netzwerk-, Speicher- oder Decoding-Ressourcen nicht schützen. Provider-Ressourcen-Caps bleiben verpflichtend.

**Retention in Spill mergen.** Abgelehnt: Retention und Spill haben verschiedene Verantwortungen. `TextRetainer`/`ItemRetainer` entscheiden, welches Preview behalten wird und was weggelassen wurde; Spill-Storage speichert nur den finalen Text, den die Policy zu speichern bittet.
