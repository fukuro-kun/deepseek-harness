---
description: "Session-Log-Snapshot-Unterstützung für keyless Profile-Tests: Manifeste, Identity-Redaction, Normalisierung, Workspace-Checks und Protokoll-Adapter."
kind: "package-library"
---

# @deepseek-ai/dsh-session-snapshot
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`dsh-session-snapshot` stellt die geteilte Unterstützung hinter keyless Recorded-Session-Tests (`pnpm run test:snapshot`) bereit: geschlossene Manifeste, typisierte Identity-Redaction, Normalisierung, Workspace-Vergleich, Fixture-Guards und Protokoll-Adapter für Headless-, SDK-, ACP- und Web-Owner. Der ACP-Adapter startet das getestete Profil als echten Subprozess, treibt ein deterministisches Input-Skript und registriert die komplette Record-, Replay- und Refresh-Suite. Jedes Szenario besitzt genug committete Evidenz, um modellsichtbaren Output und Dateisystem-Effekte zu beweisen, ohne dem Bericht des Agents zu vertrauen. Der Paket-Einstieg importiert vitest und ist daher nur innerhalb eines vitest-Laufs verfügbar.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Modell-Erfahrung](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev-Notiz](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Dieses Paket verwandelt ein ausgeliefertes Profil-Szenario in eine keyless Snapshot-Suite: Schreibe eine Szenario-Tabelle und ein Fixture-Verzeichnis, rufe den passenden Adapter einmal auf, und das Kit besitzt das Starten oder Komponieren des Profils, das Treiben des Szenarios, den Vergleich des normalisierten Outputs und das Bewachen der committeten Fixtures.

### Eine Snapshot-Suite schreiben

Ein konsumierendes `*.snapshot.ts` ist die Szenario-Tabelle plus ein Factory-Call. `AgentUnderTest` liefert absolute `binScript`-, optionale `libBinScript`-, `configPath`- und `tsconfigPath`-Pfade, weil das Subprozess-CWD außerhalb des Repositorys liegt:

```ts
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  defineAcpSnapshotSuite,
  type Scenario,
  type SnapshotSuiteOptions,
} from '@deepseek-ai/dsh-session-snapshot'

function snapshotMode(value: string | undefined): SnapshotSuiteOptions['mode'] {
  switch (value) {
    case undefined:
    case '':
    case 'replay': return 'replay'
    case 'record': return 'record'
    case 'refresh': return 'refresh'
    default: throw new Error(`unknown DSH_SNAPSHOT mode: ${value}`)
  }
}

const SCENARIOS: Scenario[] = [
  { name: 'text-turn', hasModelTurn: true, recorded: true, pinsHeader: true },
]

defineAcpSnapshotSuite({
  agent: { // absolute paths, resolved from the suite's own location
    binScript: fileURLToPath(new URL('../../../apps/cli/src/bin.ts', import.meta.url)),
    configPath: fileURLToPath(new URL('../cordis.yml', import.meta.url)),
    profile: 'acp',
    tsconfigPath: fileURLToPath(new URL('../../../tsconfig.json', import.meta.url)),
  },
  snapshotsDir: join(dirname(fileURLToPath(import.meta.url)), 'snapshots'),
  scenarios: SCENARIOS, // exactly one entry per header class sets pinsHeader
  mode: snapshotMode(process.env.DSH_SNAPSHOT),
})
```

Jedes Recorded-Session-Verzeichnis trägt ein geschlossenes `snapshot.yml`-Manifest plus kanonische Parent- und fortlaufende Child-Rollen. Parent-Dateinamen sind `session[.vN].jsonl`; Children sind `session.<ordinal>[.vN].jsonl`; v0 lässt `.v0` weg, positive Versionen nutzen kleingeschriebenes `.vN`, und jeder Dateiname stimmt mit seinem Header überein. Eine Rolle darf ältere Generationen behalten, aber das Harness wählt die numerisch höchste. Ein besitzendes Manifest darf `sessionFormat.version` plus einen oder mehrere geschlossene `coverage`-Namen deklarieren, um diese historische Generation als explizites Migrations-Fixture zu behalten; Abwesenheit folgt dem aktuellen Writer. Das Manifest benennt außerdem Szenario, ausgeliefertes Profil, Kompositions-/Header-Klasse, Recording-Quelle und nur die Replay-, Plattform-, Permission-, Umgebungs-, Workspace- oder Input-Fakten, die die abgeschlossene Session nicht rekonstruieren kann. Storage-Guards prüfen Tool-Results und portable Pfade in jeder gewählten Parent- und Child-Rolle. Prompt-/Schema-Scrubbing, Message-Identity und Prompt-vor-Request-Reihenfolge gelten für aktuelle Generationen; behaltene Vorgänger behalten ihre historische Repräsentation. Der Adapter registriert Expected-Output-, Session-Log- und optionale `workspace.expected/`-Vergleiche; Guards lehnen Orphan-Verzeichnisse, fehlende Rollen, nicht-kanonische Namen, absolute Pfade, malformed Manifeste und plattformspezifische Separatoren ab.

`normalizeSessionSnapshot` behält den vollständigen Session-Header und die Event-Payloads, lässt aber Top-Level-`seq`/`time`-Envelopes aus committeten Fixtures weg, nachdem Pfade normalisiert und System-Prompt-Text und Tool-Schemas gescrubbt wurden; es normalisiert außerdem eingebettete Stream-Clocks und historische Packed-Row-`seq0`/`time0`-Envelopes sowie Child-Creation-Clocks im Katalog. Event-Reihenfolge und Source-Event-Referenzen bleiben erhalten. Replay synthetisiert die Top-Level-Envelopes im Speicher, während die Laufzeit-Persistierung weiterhin vollständige Logs schreibt. Der Multi-Session-Vergleich validiert erwartete und geerntete Logs durch den strengen Build-static-Session-Format-Katalog vor Identity-Redaction und Normalisierung; Quell-Dateinamen können die Format-Validierung nicht ändern. Ein behaltener historischer Replay-Input ist nicht das native Current-Format-Writer-Output-Orakel: Strukturelle Migration bewahrt die Request-Bedeutung, kann aber ein anderes Event-Layout erzeugen. Die Normalisierung bewahrt unerwartete Request-Header-Felder, einschließlich `system`, sodass Regressionen sichtbar bleiben. Versionslose Protokoll-Adapter-Unit-Fixtures bleiben außerhalb des Released-Session-Format-Korpus. Fixtures im [Current-Writer-Format](../../../docs/session-format-status.de.md) nutzen eine Zeile pro Event; behaltene v0/v1-Fixtures dürfen kanonische Packed Rows nutzen. Der [temporäre Repository-Migrator](../../../scripts/migrate-packed-session-fixtures.ts) (`pnpm run migrate:packed-session-fixtures`) schreibt ältere historische Layouts um, und sein [Entfernungsvorschlag](../../../.agents/notes/proposed/process/2026-07-26-remove-packed-session-fixture-migrator.de.md) besitzt seine Löschung.

Spill-Szenarien speichern über den echten lokalen Provider unter einer privaten temporären Root. Ihr Fixture-Adapter exponiert Logik-Locators fester Länge und mappt nur die in diesem Lauf gespeicherten Locators zurück auf echte Dateien für den Abruf, sodass Preview-Budgets erhalten bleiben, ohne in einen geteilten logischen Pfad zu schreiben. Bekannte Snapshot-Spill-Pfade normalisieren zu stabilen Locator-Tokens, einschließlich Pfaden, die innerhalb von JSON-Omission-Notices mit JSON-escaped Windows-Separatoren zitiert sind. Die Refresh-Extraktion bewahrt die gematchte serialisierte Pfad-Schreibweise für literale Ersetzung. Die Normalisierung ändert nur den Locator: Gespeicherte Byte-Längen und Omission-Zähler bleiben Vergleichsevidenz.

Behaltene historische Szenarien halten ihre kanonischen Session-Dateien unverändert und für Replay ausgewählt, ohne neueres kanonisches Sibling im gepinnten Verzeichnis. Ihr exakter normalisierter nativer Current-Format-Output wird separat in `writer.expected.jsonl` für den Parent und `writer.<ordinal>.expected.jsonl` für Children aufgezeichnet; das sind Output-Orakel, keine Replay-Generationen. Behaltene SDK-Szenarien nutzen `notifications.current.expected.jsonl` für aktuellen Protokoll-Output. Vergleiche projizieren aktuelle Events weder zurück in ein historisches Format noch strippen sie strukturelle Unterschiede. Unabhängige Migrations-Tests verifizieren die offizielle Transformation, statt das native Writer-Layout als seine erwartete Event-Sequenz zu behandeln.

### Record, Replay und Refresh

`pnpm run test:snapshot:record` ruft das Live-LLM auf und schreibt die geerntete aktuelle Generation unter ihrem kanonischen versionierten Dateinamen. Record und Refresh benennen eine abgeschlossene Generation nie um und löschen sie nie, einschließlich Generationen einer Child-Rolle, die in einem späteren Lauf fehlt; reviewed Source-Tree-Kuration entfernt einen Vorgänger erst, nachdem dieselbe Rolle einen verifizierten aktuellen Ersatz hat. Szenarien mit explizitem `sessionFormat` bleiben im Record-Mode read-only. `pnpm run test:snapshot:refresh` bleibt keyless, führt den gewählten höchsten Replay-Input aus und schreibt stdout, eigene Prompt- und Tool-Schema-Sidecars sowie einen frischen vergleichbaren Session-Output der aktuellen Generation; behaltene historische Szenarien schreiben stattdessen die separaten Writer-Output-Orakel statt einer kanonischen Current-Format-Replay-Generation. Jeder Kompositions-Owner hält seinen Replay-Patch neben seinem Live-Patch; das Top-Level-`snapshots/` besitzt Session-getriebene Szenarien, während andere Expected Outputs neben ihrem besitzenden Paket bleiben. [`dsh-llm-replay`](../llm-replay/README.de.md) liefert die über `DSH_SNAPSHOT_*`-Umgebungswerte ausgewählten aufgezeichneten Streams.

### Request-Header und System-Prompts pinnen

Ein Pin besitzt standardmäßig seinen generierten `system-prompt.expected.md`- oder `tool-schemas.expected.json`-Sidecar; `systemPromptSource` und `toolSchemasSource` benennen einen anderen Pin, wenn die komplette entsprechende Sequenz identisch ist, sodass jede distinkte Version nur einmal committet wird. Der System-Prompt ist Surface-Node 0, geloggt als `system/message`-Event vor dem ersten `request/header` des Steps; jedes Fixture speichert seinen Textblock als `"text":"{{system}}"`, und der Prompt-Sidecar behält den vollen Text. Die `request/header`-Events des Pins speichern `"tools":"{{tools}}"`, während sie Config und Reason behalten, und der strukturierte Schema-Sidecar behält die vollen Kataloge. Eine Child-Session, deren eigener Scope einen anderen Request komponiert, deklariert das per Fixture-Index mit `pinsChildToolSchemas` und `pinsChildSystemPrompts`. Ein Szenario, das den Request-Header mitten im Lauf ändert, deklariert `expectedHeaderChanges`; ein Szenario, dessen Prompt sich mitten im Lauf ändert — Node 0 ersetzend oder auf einer `in-history`-Route hinter die gecachte Historie hängend — deklariert `expectedPromptChanges`, und jede Änderung fügt dem Prompt-Sidecar eine `<!-- system/message change N -->`-Sektion hinzu. Das Manifest schreibt diese als `header.changes` und `header.promptChanges`.

### Plattform- und Kompositionsvarianten

Ein Szenario, das einen Nicht-Windows-Host braucht, deklariert `posixOnly`, was seinen Run-Test unter Windows überspringt, während die Fixture-Guards seine committeten Dateien überall weiter abdecken; ein Szenario, dessen Komposition ein nutzbares `pwsh` braucht, deklariert `pwshOnly`. `workspaceParent` verschiebt das generierte Child-CWD aus dem Plattform-Temp-Verzeichnis, wenn Temp-Directory-Grants selbst unter Test stehen; das committete `workspace/` eines Szenarios wird zuerst in dieses Child kopiert, dann läuft `prepareWorkspace` gegen das generierte CWD, bevor der Agent startet. Standardmäßig generierte Workspaces werden in Session-Fixtures als `{{cwd}}` gespeichert, sodass Plattform-Temp-Roots und zufällige Basenames die Aufzeichnungen nicht beeinflussen. Headless-Manifeste nutzen `workspace.parent: outside-temp`, wenn der Session-Workspace-Grant selbst unter Test steht. Der Adapter alloziert neben der Plattform-Temp-Root, wenn deren Parent beschreibbar und außerhalb der System-Temp-Grants liegt, sonst unter Home, und lehnt jedes generierte CWD ab, das bereits von automatischen Temp-Write-Grants abgedeckt ist.

### Was schiefgehen kann

- **Ein Child-Turn-Wait schlägt fehl** — `waitForSubagentTurnEnd` benennt Child, angefragten Turn und Deadline selbst dann, wenn die erste Log-Ernte diese Deadline überschreitet, und behält den zugrunde liegenden Fehler als Error-Cause.
- **Ein Fixture-Guard lehnt die committeten Dateien ab** — Orphan-Szenario-Verzeichnisse, fehlende Dateien, mehrere Pins für eine Header-Klasse, doppelter Sidecar-Inhalt, ungescrubbter Prompt-Text oder Tool-Schemas, ein `request/header` ohne vorangehendes `system/message` und malformed Pinning-Header lassen die Suite vor den Vergleichen fehlschlagen.
- **Die Session-Ernte braucht Raw-JSONL-Mode** — Snapshot-Configs setzen `compression: 'none'` des JSONL-Backends; komprimiertes JSONL hat keinen Snapshot-Harvest-Pfad.
- **Built-Mode braucht aktuelle Artefakte** — führe `pnpm run build` aus, bevor du `DSH_EXAMPLE_MODE=lib` wählst; Source-Mode bleibt der Zero-Build-Pfad.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen</summary>

Dieser Abschnitt erklärt das Design des Kits; das beobachtbare Verhalten deckt [Dieses Paket verwenden](#use-this-package) vollständig ab.

### Design

Der geteilte Kern besitzt Manifeste, Generation-qualifizierte Rollenwahl, Workspace-Setup/-Vergleich, typisierte Identity-Mapping, Normalizer und Fixture-Invarianten. Der ACP-Adapter fügt vier komponierbare Schichten hinzu: Launcher, Szenario-Harness, Normalizer und Suite-Factory. `launchAcpTestAgent` bootet ein Source-Profil unter tsx oder ein gebautes `lib`-Profil unter plain Node, verbindet den SDK-Client über ein Raw-Byte-Stdout-Tee, sammelt Session-Updates und stderr, schlägt bei unbehandelten Permission-Requests closed fehl und besitzt den Shutdown. `runScenario` treibt ACP-JSON-RPC-Stdio und erntet die numerisch höchste persistierte Raw-JSONL-Generation für jedes Session-Verzeichnis. Die reinen Normalizer ersetzen CWD-Pfade und typisierte Identitäten durch stabile Tokens, nullen Zeiten, expandieren physische Provenance-Ranges und scrubben System-Prompt-Text und Tool-Schema-Bulk. `defineAcpSnapshotSuite` registriert Vergleiche, Generation-qualifizierten Fixture-Write-Back und den Live-Uniformity-Guard.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/launcher.ts`](src/launcher.ts) | Subprozess-/Client-Launcher und Shutdown-Ownership |
| [`src/harness.ts`](src/harness.ts) | Skriptgetriebener Szenario-Driver und Session-Log-Ernte |
| [`src/manifest.ts`](src/manifest.ts) | Geschlossenes `snapshot.yml`-Schema, Sammlung und Ownership-Regeln |
| [`src/session-files.ts`](src/session-files.ts) | Kanonische Parent-/Child-Generationen-Grammatik, Header-Übereinstimmung und Highest-Role-Auswahl |
| [`src/identity.ts`](src/identity.ts) | Typisierte First-Seen-Identity-Tokenisierung über Parent- und Child-Logs hinweg |
| [`src/normalize.ts`](src/normalize.ts) | Reine Normalizer und Scrubbing-Helfer |
| [`src/workspace.ts`](src/workspace.ts) | Szenario-Workspace-Setup und vollständiger Expected-State-Vergleich |
| [`src/suite.ts`](src/suite.ts) | Szenario-Tabellen-Suite-Factory, Fixture-Guards, Record-/Refresh-Write-Back |
| [`src/index.ts`](src/index.ts) | Paket-Einstieg, der die vier Schichten re-exportiert |
| — | Es wird kein Runtime-Invarianten-Begleiter publiziert; dieses Test-Support-Paket besitzt keinen Produktions-Event-Stream oder mutable Daten; konsumierende Test-Suiten üben sein Verhalten aus. |

### Datenfluss

Ein Szenario lässt den Agent unter dem Launcher laufen, füttert ihm das Input-Skript über das Harness und captured stdout plus die persistierten Logs. Die Normalizer kanonisieren diese Captures — IDs zu First-Seen-Sequenz, generiertes CWD zu `{{cwd}}`, `system/message`-Text zu `{{system}}` und Header-Tool-Schemas zu `{{tools}}` — sodass sich aufgezeichnete und frische Läufe strukturell vergleichen lassen. Die Factory vergleicht dann normalisiertes stdout und re-persistierte Logs gegen committete Fixtures oder schreibt sie im Record-/Refresh-Mode zurück, und ihre Guards lehnen malformed oder driftende Fixtures ab, bevor irgendein Vergleichsergebnis vertraut wird.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Level-Vertrag nicht reicht. Sie bewegen sich vom Snapshot-Kit zur Modell-Fixture-Quelle, den Launch-Mechaniken und der Policy, die die Stufe verlangt.

- [llm-replay](../llm-replay/README.de.md) — die keyless Modell-Fixture-Quelle, die der Replay-Mode konsumiert.
- [loader-smoke](../loader-smoke/README.de.md) — die Mode-bewussten Subprozess-Launch-Mechaniken, auf denen der Launcher aufbaut.
- [Testing-Policy](../../../docs/testing.de.md) — die keyless Snapshot-Stufe, wann sie erforderlich ist, und die Fixture-Ownership-Regeln.
- [Test-Support-Gruppenkarte](../README.de.md) — Sibling-Harnesses und Support-Pakete.

-----

<a id="model-experience"></a>
## Modell-Erfahrung

Keine, da dieser Test-only-Support Profil-Sessions aufzeichnet, normalisiert und vergleicht, ohne den assemblierten Modell-Request des Agents zu ändern.

#### KV-Cache-Effekt

Keiner; dieses Paket assembliert weder einen Provider-Request noch sendet es einen.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann das Kit besondere Sorgfalt braucht. Sie sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Session-Ernte erfordert Raw-JSONL-Mode** — `runScenario` sammelt persistierte `.jsonl`-Logs, daher setzen Snapshot-Configs `compression: 'none'` des JSONL-Backends; komprimiertes JSONL hat keinen Snapshot-Harvest-Pfad.
- **Built-Mode erfordert aktuelle Artefakte** — führe `pnpm run build` aus, bevor du `DSH_EXAMPLE_MODE=lib` wählst; Source-Mode bleibt der Zero-Build-Pfad.
- **ACP bleibt für Protokollverhalten zuständig** — Cancellation- und Permission-Round-Trips, deren Stimulus der ACP-Client ist, bleiben auf diesem Adapter; assembliertes One-Shot- und Persistent-Control-Verhalten nutzt Headless- und SDK-Adapter.

<a id="dev-note"></a>
### Dev-Notiz

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen</summary>

Keine.

</details>
