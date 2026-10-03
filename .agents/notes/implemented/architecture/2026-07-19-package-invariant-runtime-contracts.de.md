# Agent Note: Aussagekräftige Package-Invariant-Contracts
[English](2026-07-19-package-invariant-runtime-contracts.md) | [中文](2026-07-19-package-invariant-runtime-contracts.zh.md) | Deutsch

Status: implemented


## Problem

Der package-eigene Invariant-Service machte Publication und Registrierung vollständig prüfbar, doch seine erste generierte Baseline akzeptierte leere Installer. Ein Folgeschritt ersetzte diese Leerstellen dann durch generische Assertions über Plugin-Namen, Injections, Effects, Service-Methoden und feste Pure-Library-Beispiele. Diese Assertions machten jeden Companion ausführbar, ohne das System sicherer zu machen: TypeScript, der Cordis-Start, Package-Tests und Module-Load-Tests erzwingen diese Formen bereits, während der Invariant-Service unmögliche Runtime-Zustände erkennen soll.

Eine nützliche Runtime-Invariante setzt Beobachtungen über Zeit oder über eine veränderliche Datenstruktur in Beziehung. Beispiele sind ein terminales Event ohne seinen Start, ein LLM-Delta für einen nicht offenen Block oder ein durable Ergebnis, dessen Identität von seinem Request abweicht. Lediglich zu bestätigen, dass eine deklarierte Methode existiert, dass ein Plugin seinen erwarteten Namen trägt oder dass ein konstantes Beispiel weiterhin einen bekannten Wert liefert, ist keine solche Beziehung.

Manche Packages besitzen tatsächlich keine kontinuierlich beobachtbare Beziehung. Pure Utilities, rein kompositionelle Packages, dünne Adapter, Binaries und Test-Support-Packages können wichtige Contracts haben, doch diese werden besser durch Typen, Load-Checks, fokussierte Unit-Tests oder Integrationstests erzwungen. Eine synthetische Runtime-Assertion für solche Packages zu fordern würde darauf optimieren, ein Gate zu befriedigen, statt Korruption zu erkennen.

## Entscheidung

### Veröffentlichte Assertions müssen aussagekräftig sein

Ein Workspace-Package veröffentlicht einen separat gebauten `./invariant`-Companion nur dann, wenn es eine unabhängig beobachtbare Runtime-Beziehung besitzt. Ein veröffentlichter Companion:

- installiert eine package-eigene Prüfung über einen Event-Stream oder eine relevante veränderliche Datenstruktur und meldet Verstöße über seinen gebundenen `fail(message)`-Reporter; und
- registriert den exakten npm-Namen des Packages, während Diagnosen außerhalb des Root-Entrypoint bleiben.

Wo keine plausible Beziehung existiert, lässt das Package den Companion und das Publication-Wiring weg und hält seinen package-spezifischen Grund im README fest. Eine künftige Änderung, die eine unabhängig beobachtbare Beziehung einführt, muss die Erklärung durch die entsprechende Prüfung ersetzen. Die Weglassmechanik und das aktuelle Audit gehören der [omit-unneeded-companions-Entscheidung](../simplification/2026-08-28-omit-unneeded-invariant-companions.de.md).

Der zentrale `dsh-invariants`-Service besitzt nur Konfiguration, Registrierungseinmaligkeit, Child-Fiber-Lifecycle, Rollback, Disposal und package-zugeordnete Fehler. Er stellt keine generischen Plugin-Shape-, Service-Shape- oder Startup-Assertion-Helpers bereit und importiert kein Produkt-Package.

### Repräsentative implementierte Prüfungen

Veröffentlichte Companions werden mechanisch von `verify-package-invariants` aufgezählt; die aktuelle Audit-Zahl steht in der [omit-unneeded-companions-Entscheidung](../simplification/2026-08-28-omit-unneeded-invariant-companions.de.md). Die folgende Tabelle zeigt repräsentative Runtime-Beziehungen, statt jeden Companion aufzulisten.

| Owner | Runtime-Beziehung |
|---|---|
| `dsh-session` | Striktes Sequenzwachstum, Turn-/Step-Einschließung und Tool-Call-/Result-Paarung auf demselben Step. |
| `dsh-agent` | Nicht wiederholende Agent-Status- und Terminal-Disposal-Übergänge. |
| `dsh-scope` | Vorhandensein des Scoped-Event-Trägers und Konsistenz des gerouteten Subjekts. |
| `dsh-agent-loop` | Explizit markierte, eingefrorene Loop-Request-Rekonstruktion aus dem Session-Event-Log. |
| `dsh-llm` | Stream-Block-Grammatik, Delta-Typ-/Index-Matching, einmalige Usage, geschlossene Blöcke und terminaler Finish. |
| `dsh-llm-retry` | Durable Retry-Records identifizieren den letzten geschlossenen Step des offenen Turns, bleiben pro Step eindeutig, wachsen monoton und bleiben innerhalb der Retry- und nichtnegativen Timer-Grenzen. |
| `dsh-tools` | Monotone Pre-/Execute-/Post-Stages und unveränderliche finale Execution-/Result-Snapshots. |
| `dsh-system-prompt` | Maßgebliche Constraints für Assembly-Sektionen, Tools und Variablendaten. |
| `dsh-compaction` | Compaction-Start-/Summary-/End-Paarung, Range-Endpunkte, Token-Counts und Vorhandensein erfolgreicher Summaries. |
| `dsh-hook-protocol` | Korrelation von Hook-Invocation/-Result, Dialekt-, Identitäts- und Duration-Constraints. |
| `dsh-sandbox-policy` | Durable `sandbox/mode`-Events verwenden das geschlossene Sandbox-Mode-Vocabulary. |
| `dsh-fs` | Filesystem-Decision-/-Observation-Events tragen verwendbare Ziel- und Versionsidentitäten. |
| `dsh-goal` | Durable Goal-Snapshots bewahren Source-Attribution, gerenderten Inhalt, Revisionen, Lifecycle- und Timestamp-Beziehungen sowie sequenziell zugelassene Rounds. |
| `dsh-goal-round-driver` | Goal-basierte Fortsetzungsnachrichten stimmen mit dem aus dem vorhergehenden durable Goal-State rekonstruierten Prompt überein. |
| `dsh-subagent` | Provider-Add/-Remove- und Child-Start-/End-Events bewahren Identität und Paarung. |
| `dsh-permission-presets` | Durable Permission-Decisions nennen ein Preset der aktiven Permission-Tabelle. |
| `dsh-user-approval` | Approval-Asked-/-Decided-Records paaren sich pro Call und verwenden valide Outcomes und Policies. |
| `dsh-workflow` | Workflow- und Child-Agent-Start-/End-Events bewahren Run-Metadaten, Identität, Outcome, Count- und Error-Beziehungen. |
| `dsh-jobs` | Aktuelle und terminale Task-Snapshots bewahren id/kind, Owner, Status- und Timestamp-Beziehungen. |
| `dsh-tool-todo` | Durable Gesamtlisten-Snapshots verwenden eindeutige getrimmte Items und geschlossene Status. |
| `dsh-time-context` | Plugin-attribuierte Uhrzeitablesungen stimmen mit dem offenen Turn der Session, der nächsten Pre-Step-Position und der verstrichenen Baseline überein; die gerenderte Zeit lässt sich parsen und liegt nicht nach ihrem Event. |

Session-gestützte Companions validieren beim Laden bestehende durable Events und nutzen dabei das Präfix vor jedem Kandidaten, wo die Beziehung von der Event-Reihenfolge abhängt. Andere Prüfungen beobachten die maßgebliche Live-Event-Grenze oder ein veränderliches Service-Ergebnis. Die Validierung läuft vor der Publication, wo die Annahme eines invaliden Events sonst fehlerhaften Zustand festschreiben würde.

### Repository-Gate und Tests

`verify-package-invariants` entdeckt jedes Workspace-Package. Es akzeptiert sauberes Weglassen, lehnt veraltetes oder partielles Companion-Wiring ab und erzwingt Exact-Name-Registrierung, die named-only-Loader-Form, `./invariant`-Exports, Publication-Dateien, Dependencies, TypeScript-Referenzen und Bundle-Einträge für veröffentlichte Companions. Seine AST-Regel lehnt generierte Marker, Default-Exports und leere Installer ab. Jeder Installer muss den Failure-Reporter akzeptieren und verwenden, und die Registrierung muss die geprüfte lokale `install`-Funktion übergeben. Das Gate leitet bewusst keine semantische Qualität aus Methodennamen oder Helper-Aufrufen ab.

Vitest mountet `InvariantRegistry` mit `{ enabled: true }` für jede Package-Test-Topologie und lädt den zugehörigen Companion, wenn einer veröffentlicht ist. Das Path-Mapping des Invariant-Subpath löst Source-Companions statt veralteter Build-Ausgabe auf. Fokussierte Suites decken die validen und invaliden Beobachtungen jedes veröffentlichten Companions ab, und die erschöpfende Topologie führt jeden Source-Companion durch echte Loader-Namespace-Normalisierung. Nachdem das strukturelle Gate jede Publication-Map validiert hat, staged ein Artifact-Gate deren manifest-deklarierte `lib/`-Dateien, importiert die kompilierte `./invariant`-Selbstreferenz unter plain Node und wiederholt diese Loader-Form-Prüfung, sodass ein Companion, der einen undeklarierten Runtime-Chunk importiert, vor dem Release scheitert. Tests, die Event-Streams synthetisieren, müssen einen validen umgebenden Lifecycle erzeugen, es sei denn, der Test prüft absichtlich eine Verletzung.

## Erwogene Alternativen

- **Erklärte leere Companions beibehalten.** Abgelehnt, weil Source-, Publication-, Dependency- und Test-Wiring unverhältnismäßiger Aufwand für eine negative Schlussfolgerung sind, die ins Package-README gehört.
- **Eine Assertion von jedem Package fordern.** Abgelehnt, weil Methodenpräsenz-, Plugin-Form- und Fixed-Example-Assertions stärkere Type-, Load- und Unit-Test-Contracts duplizieren, ohne Runtime-Konsistenz zu prüfen.
- **Generische Form-Helpers im Service behalten.** Abgelehnt, weil sie Compile-Time-API-Validierung mit Runtime-Invarianten verwischen und zentral definierte Produktannahmen fördern.
- **Die Produktprüfungen in den Service verschieben.** Abgelehnt, weil Produkt-Vocabulary, Dependencies, Tests und Change-Ownership beim Package gehören, das die Daten emittiert.
- **Companions implizit aus Root-Entrypoints registrieren.** Abgelehnt, weil Kompositionsreihenfolge und optionale Service-Präsenz versteckte Effekte erzeugen würden.

## Konsequenzen

- Packages mit plausibler Runtime-Beziehung haben sichtbare Ownership und Publication-Wiring; Packages ohne halten den Weglass-Grund in ihrem README fest.
- Leere Companions scheitern am Gate, und partielles Weglass-Wiring scheitert vor Build oder Release.
- Typdeklarationen, Cordis-Ladbarkeit, Plugin-Metadaten, Service-Methoden-APIs und pure Algebra bleiben durch ihre zuständigen Compile-, Load-, Unit- oder Integration-Gates abgedeckt.
- Runtime-Fehler identifizieren das zuständige npm-Package und zeigen auf eine inkonsistente Beobachtung, statt eine geforderte API-Form zu wiederholen.
- Die ursprünglichen Selection-, Blocklist-Precedence-, Duplicate-Ownership-, Rollback-, Disposal- und HMR-Service-Contracts bleiben unverändert.
