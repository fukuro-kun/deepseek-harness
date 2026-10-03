# Agent Note: ACP-Snapshot-Tests — record-once / replay-deterministic

Status: implemented

[English](2026-06-19-acp-snapshot-tests.md) | [中文](2026-06-19-acp-snapshot-tests.zh.md) | Deutsch

## Problem

Unit-Tests prüfen weder den kompletten assemblierten Agent-Subprozess noch seinen ACP-Automation-Wire, während Real-API-Tests nichtdeterministisch und key-gated sind. Loader-Wiring, Backend-Verhalten und Protokoll-Output können daher trotz grüner Unit-Coverage regressieren, wie der [Default-Export-Postmortem](../../../../docs/postmortem/0001-acp-default-export-drops-inject.de.md) gezeigt hat.

Der Blocker für einen Full-Transcript-Test ist das Modell: Der Output des Agents wird von einem nichtdeterministischen LLM getrieben, und ein key-gated Test, der bei jedem Lauf die echte API trifft, ist weder deterministisch noch CI-fähig. Das Tier braucht die Fidelity eines echten Laufs mit der Deterministik eines Fixtures.

## Entscheidung

Ein Recorded-Session-Snapshot startet ein ausgeliefertes Profile über `dsh`, treibt dessen öffentliches Interface und vergleicht normalisierten Output mit committeten Expected Outputs. ACP-eigene Szenarien treiben zusätzlich das stdio-Protokoll und vergleichen dessen Transcript. Ein einmal gegen die echte API aufgezeichnetes Session-Log liefert alle späteren Modell-Streams. Das Fixture ist eine [Projektion des persistierten JSONL des Produkts](../../archived/testing/2026-08-18-session-snapshot-envelope-projection.md): Header und Payloads bleiben, Body-Sequence-/Time-Envelopes werden weggelassen.

Die [Session-Log-Snapshot-Corpus-Entscheidung](2026-08-24-session-log-snapshot-corpus.de.md) ersetzt die ACP-spezifische Platzierung und Controller-Ownership dieser Note. Diese Note bleibt die Begründungsinstanz für Session-Log-Fixtures, Replay-Ableitung, Ausnahme-Overrides, Normalisierung und ACP-Transcript-Vergleich.

### Das Fixture projiziert das persistierte Session-JSONL

Die selektierte höchste Parent-Generation jedes Szenarios wird aus einem echten Lauf geerntet: `session.jsonl` für v0 oder `session.vN.jsonl` für eine positive Generation. Die in `assistant/message` und `assistant/attempt` eingebetteten Compact-Streams reproduzieren Modell-Attempts; Tool-, Message- und Boundary-Events erfassen das Harness-Verhalten. Eine gewöhnliche Session-Generation dient damit sowohl als Replay-Quelle als auch als Behavior-Expected-Output.

Jedes aktuelle Session-Format-Fixture nutzt eine physische Zeile pro durable Event. Behaltene v0- und v1-Vorgänger-Generationen dürfen ihre eingefrorene Packed-Row-Repräsentation enthalten und bleiben unveränderlich. Gewöhnliches Replay und Log-Vergleich beweisen, dass der assemblierte Prozess die aktuelle Generation auswählt, migriert, konsumiert und reproduziert.

### Replay leitet das Modell-Skript aus dem Log ab

`llm-replay` kurzschließt den provider-neutralen `llm/stream`-Waterfall. `deriveReplayScript()` expandiert jeden aufgezeichneten `assistant/message`- oder `assistant/attempt`-Stream zu einem positionalen Call und validiert dessen Terminal-Chunk. Ein `compaction/summary` mit `llmStreamCall: true` trägt einen Call an seiner durable Log-Position bei: Replay rekonstruiert kanonische Block-Grenzen aus `rawOutput`, behält aufgezeichnete Usage, falls vorhanden, und liefert ein terminales `stop`. Der Marker unterscheidet diesen lokalen Call von Template- oder Remote-Summaries, deren bewahrtes `rawOutput` den Adapter dieses Kontexts nicht konsumiert hat.

### Der In-Memory-Replay-Eintrag erfüllt den vollen LLM-Vertrag

`deriveReplayScript` erzeugt eine Liste von `ReplayEntry`, die In-Memory-Einheit, die der Replay-Listener positional bedient:

```
{ kind: 'chunks', chunks: StreamChunk[] }
| { kind: 'throw', chunks: StreamChunk[], message: string, code: string }
| { kind: 'hang' }
```

Logs leiten Chunk- oder Throw-Einträge aus durable Assistant-Settlements und explizit markierten Compaction-Calls ab. Pre-Stream-Throws, Hangs und externe Summarizer-Calls haben keine rekonstruierbare lokale Stream-Repräsentation, sodass diese Szenarien `replay.override.json` bereitstellen. Ein Throw-Eintrag darf Prefix-Chunks für Mid-Stream-Failure enthalten. Explizite Overrides vermeiden es, Adapter-Verhalten allein aus verlustbehafteten Turn-End-Reasons oder Provider-Output zu inferieren.

### Positionales Replay, ein in-flight Stream

Replay ist positional und erlaubt daher nur einen in-flight Modell-Stream pro Szenario. Concurrent-Session-Snapshots erfordern request-keyed Einträge. Geänderte Call-Reihenfolge erfordert Neuaufzeichnung, und fehlende oder erschöpfte Fixtures schlagen laut fehl.

### Aufzeichnung erntet das Log; schlüsselloses Replay braucht eine providerlose Config

Die Aufzeichnung führt das Szenario mit dem echten `llm-deepseek`-Adapter und dem auf `persistenceCompression: 'none'` konfigurierten JSONL-Persistenz-Backend aus und projiziert dann das erzeugte `.jsonl` in das Szenario-Verzeichnis. Der explizite Raw-Modus hält geerntete Logs zeilenlesbar, während gewöhnliche Deployments den komprimierten Default des Backends nutzen; berechtigte Chunk-Läufe verwenden weiterhin die gepackten Default-Storage-Rows. Per-Event-Appends sind durable, aber das Harness fährt den Subprozess vor dem Harvest graceful herunter (stdin schließen → `await ctx.dispose()`), damit die finalen Events geflusht sind. `llm-replay` selbst zeichnet nicht auf — es ist reines Replay.

Replay nutzt ein `cordis.snapshot.yml`-Overlay, das den echten Adapter durch `llm-replay` ersetzt und die Live-Komposition beibehält. Die Aufzeichnung nutzt die gewöhnliche Config und eine vom Harness gelieferte Persistenz-Root. Replay-Modus überspringt das `.env`-Loading, sodass ein verirrter API-Key keinen Live-Call auslösen kann. Siehe die [Single-Source-Config-Agent-Note](../../archived/testing/2026-07-04-single-source-acp-replay-config.md).

### Zwei Outputs: normalisieren, dann vergleichen

Ein Snapshot-Lauf assertiert **zwei** normalisierte Outputs, weil die externen APIs des Harness distinkt sind:

1. Der **stdout-Transcript** — die geframten ACP-JSON-RPC-Responses und Committed-Message-Updates, die ein Automation-Client empfängt. Er fängt Regressionen im Transport-Vertrag ab und wird gegen ein committetes `stdout.expected.jsonl` verglichen.
2. Das **re-persistierte Session-JSONL**, normalisiert und mit dem selektierten höchsten Parent-Fixture verglichen. Dieselbe Generation ist sowohl Replay-Quelle als auch Expected-Log; ein frischer aktueller Writer darf einen höheren kanonischen Dateinamen erzeugen, während der logische Vergleich den älteren Replay-Input behält. Prompt- und Tool-Bulk werden gescrubbt; ein Szenario pro Header-Klasse pint die verbleibende Header-Sequenz. Der Pin besitzt standardmäßig lesbare Prompt- und Tool-Schema-Sidecars oder benennt einen anderen Pin als eine der Quellen, wenn die komplette Sequenz identisch ist, sodass jede distinkte Sidecar-Version einmal committet wird. Fixture-Guards lehnen doppelten Sidecar-Content ab, und record/refresh lehnt geteilte Claimants ab, die unterschiedliche Bytes erzeugen. Die ursprüngliche Header-Pinning-Begründung bleibt in der [Header-Pinning-Agent-Note](../../archived/testing/2026-07-06-pin-request-header-content-in-one-scenario.md) erhalten. Override-Szenarien leiten Modellverhalten ausschließlich aus ihrem Sidecar ab.

Die Oberflächen sind komplementär: stdout deckt den minimalen Automation-Wire ab, während JSONL Loop-, Tool- und Boundary-Struktur abdeckt, die der Wire absichtlich weglässt.

Normalisierung ersetzt Session-, Cwd-, Protokoll-Id-, Timestamp-, Pfad- und Prozess-Volatilität; die Fixture-Projektion lässt Body-Sequence-/Time-Envelopes weg, ohne Payload-Referenzen zu ändern. Record und Refresh speichern außerdem einen generierten Workspace und seine filesystem-aufgelösten Aliase als `{{cwd}}` im Replay-Fixture, sodass Plattform-Temp-Roots und zufällige Basenames Aufzeichnungen nicht beeinflussen; authored Temp-Pfade und Cwd-Werte unter einem expliziten `workspaceParent` bleiben literal. Szenarien beschränken echten Bash-Einsatz auf stabile Kommandos. Der stdout-Expected-Output bleibt Wire-förmiges JSONL und jede rohe Zeile muss als JSON parsen. Gewöhnliche Vitest-Snapshot-Updates schreiben nur den stdout-Expected-Output; die expliziten `record`- und `refresh`-Modi besitzen Replay-Fixture-Schreibzugriffe.

### Isolation: jetzt Normalisierung, später Sandbox

Tool-Deterministik kommt aus generiertem Cwd, gescrubbter Umgebung, frischer Non-Login-Shell, beschränkten Kommandos und Normalisierung. Der Cwd defaultet auf das Plattform-Temp-Verzeichnis; ein Szenario kann stattdessen dessen Parent liefern, wenn Temp eine immer-schreibbare Policy-Root ist und das Verhalten eine unabhängige Projekt-Location braucht. Concurrent-Replay-Läufe besitzen separate Cwd-, Persistenz- und Fixed-Length-szenario-keyed-Spill-Roots, sodass der Teardown eines Szenarios nicht die in-flight Full-Output-Recovery eines anderen löschen kann, während Real-Path-Preview-Budgets stabil bleiben. Dieses Tier beansprucht keine OS-Confinement. Ein sandboxed Executor kann das lokale Backend über die bestehende [Capability-Seam](../architecture/2026-06-13-capability-seams.de.md) ersetzen, falls ein stärkeres Tier nötig wird.

### Das Replay-Plugin ist sein eigenes Package

`@deepseek-ai/dsh-llm-replay` ist ein Support-Package statt Beispiel-lokalem Glue. Es ersetzt den echten Adapter, indem es `llm/stream` mit aus JSONL rekonstruierten Streams kurzschließt, und seine Package-Platzierung hält die Replay-Logik unter normalen Coverage-Gates.

### Zwei Subkommandos, Replay im Default-Gate

`pnpm run test:snapshot` replayt committete Fixtures schlüssellos; `test:snapshot:record` nutzt die echte API und schreibt die projizierte aktuelle Session-Generation plus Interface-spezifischen Expected Output. Dasselbe schlüssellose Gate entdeckt kanonische Repository-JSONL-Generationen über Filename-/Header-Übereinstimmung und lehnt jedes Fixture ab, das von der projizierten kanonischen Packed-Repräsentation des geteilten Codecs abweicht. Fehlende Rollen schlagen laut fehl. Jedes ACP-Szenario trägt `input.json`, `stdout.expected.jsonl` und ein selektiertes Parent-`session[.vN].jsonl`; No-Model-Fälle nutzen ein Header-only-Log. Andere Profiles leiten gewöhnlichen accepted User-Input aus der selektierten Parent-Generation ab und behalten nur Controller-Input in `snapshot.yml`, den die accepted Session nicht rekonstruieren kann. `replay.override.json` ist nur für Szenarien erforderlich, deren erfolgreiches Modellverhalten nicht aus dem Log ableitbar ist. Fixture-Guards lehnen fehlende, nicht passende, nichtkanonische und verwaiste Dateien ab. Beide Kommandos akzeptieren Szenario-Filter.

## Erwogene Alternativen

- **Ein handgeschriebenes `llm.json` mit Modell-Chunks** — der frühere Entwurf; die Wiederverwendung des echten Session-Logs macht das Fixture zu einem echten Produkt des Systems statt zu einem handgebauten Mock und verdoppelt es als Behavior-Expected-Output.
- **Ein verpflichtender Replay-Override für jede Compaction-Summary** — abgelehnt: Das durable Summary-Event fixiert bereits Position, kompletten Output und optionale Usage eines erfolgreichen lokalen Calls. Ein expliziter Local-Call-Marker bewahrt dieses Single-Source-Fixture, ohne einen Call für Template- oder Remote-Summarizer zu erfinden.
- **Eine Byte-Level-HTTP-Record-Library (Polly/nock/MSW)** — abgelehnt: adapter-spezifisch, unhandlich mit Streaming-SSE und niedriger angesiedelt als das zu Testende.
- **Throw-/Cancel-Einträge aus `turn/end {kind:'error'|'aborted'}` synthetisieren** — abgelehnt: Es koppelt `llm-replay` an loop-interne Turn-Closing-Semantik, und der `turn/end`-Reason ist verlustbehaftet (er kann einen geworfenen 401 nicht von einem Finish-Error unterscheiden); der explizite `replay.override.json`-Sidecar ist die sauberere Naht.
- **Beide Request-Header-Sidecars neben jeden Klassen-Pin kopieren** — abgelehnt: Prompt- und Tool-Schema-Komposition variieren unabhängig, sodass eine Änderung an einer geteilten Komponente byte-identische Dateien über unverbundene Klassen-Pins hinweg churnen würde. Explizite Per-Component-Quellen behalten einen strukturellen Pin pro Klasse ohne Inhaltsduplizierung.

## Konsequenzen

Das Tier fügt reviewte Per-Szenario-Session-, Manifest-, Interface-spezifische-Expected-Output-, optionale Override- und optionale Workspace-Fixtures hinzu, plus eine Datei für jede distinkte gepinnte Prompt- und Tool-Schema-Sequenz. Workspace-Seeds werden sowohl für Record als auch Replay in den generierten Cwd kopiert. Im Gegenzug liefert das Tier deterministische schlüssellose Coverage über echten Loader und Tool-Komposition, einschließlich einer assemblierten Context-Overflow-Recovery, deren markierte Compaction-Summary den Auxiliary-Call liefert. Der ACP-Subtree behält nur noch Protokollverhalten; Headless, SDK und Web besitzen die Szenarien, deren Verhalten zu diesen Interfaces gehört.

Diese Agent Note steht im Zusammenhang mit der [proposed-Determinism-Agent-Note](../../proposed/testing/2026-06-11-deterministic-and-stress-testing.de.md), ersetzt sie aber nicht: Deren "universelles Replay-Fixture" re-deriviert die Session-*Message-History* nach jedem Test (eine Internal-Consistency-Invariante), während diese Snapshots assembliertes Verhalten plus Interface-spezifischen Output pinnen. Sie bleiben komplementär.
