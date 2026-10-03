# Agent Note: Tool-Call-Timeout-Policy als Plugin

Status: implemented

[English](2026-07-07-tool-call-timeout-policy.md) | [中文](2026-07-07-tool-call-timeout-policy.zh.md) | Deutsch

## Problem

Die [Timeout/Deadline-Agent-Note](2026-07-06-timeout-deadline-library.de.md) extrahierte das Timing- und Klassifikations-Primitiv in `@deepseek-ai/dsh-timeout`, aber die Timeout-Policy hing noch an einzelnen Fähigkeiten und modellseitigen Schemas. `bash` exponierte `timeoutMs`; `web_fetch` exponierte `timeout_ms`; `web_search` hatte kein modellseitiges Timeout, obwohl Provider `exec.signal` bereits honorieren; ein zukünftiges grep/glob-Tool würde entweder die Timeout-Bibliothek direkt importieren oder seine eigene Timeout-Policy erfinden. Das ist die falsche Autoren-Form für ein Plugin-SDK: Ein Tool-Autor sollte normalerweise `exec.signal` an die Implementation weiterreichen, die er aufruft, und Deployment-Policy sollte das Budget entscheiden.

Gleichzeitig ist nicht jedes Timeout im Repo ein modellseitiges Tool-Call-Budget. Hooks führen Befehls-Hooks aus, indem sie `ctx.shell` direkt aufrufen, nicht über `ctx.tools.execute()`, und das `bash`-Modell-Tool multiplext Vordergrund-Ausführung, Hintergrund-Start, Hintergrund-Polling und Hook-Wiederverwendung durch dasselbe Backend. Alle Timeouts in einem Schritt in ein Tool-Plugin zu verschieben würde diese Pfade vermischen und die Hook-Timeout-Semantik gefährden.

## Entscheidung

Tool-Call-Timeout ist eine Policy, die nur auf modellseitige Tool-Ausführung wirkt, in drei Teilen:

- `@deepseek-ai/dsh-timeout` bleibt die gemeinsame Bibliothek, die `deadline()` und `timeoutOf()` besitzt.
- `@deepseek-ai/dsh-tools` hat einen Around-Dispatch-Waterfall, `tools/execute`, zwischen `tools/pre-execute` und `tools/post-execute`.
- Der [Repository-Naming-Vertrag](../../archived/architecture/2026-08-11-repository-naming-contract-and-rename-ledger.md) benennt `@deepseek-ai/dsh-tool-call-timeout-policy` nach genau der Operation, die es begrenzt. Das Plugin liest das deklarierte `timeoutMs` jedes Tools aus der Runtime und umhüllt einen Call, der eines hat, indem es ein neues `exec.signal` ableitet.

Die Ausführungs-Pipeline ist:

```text
ctx.tools.execute(exec)
  -> tools/pre-execute
  -> tools/execute
       -> registry dispatch (the base next())
            -> tool.execute(args, exec)
            -> thrown tool errors normalize to ToolExecutionResult
  -> tools/post-execute
```

Das Default-Verhalten ist konservativ: Ein Tool, das kein `timeoutMs` deklariert, erhält keine `TOOL_TIMEOUT`-Deadline vom Plugin.

### Der `tools/execute`-Around-Dispatch-Extension-Point

`@deepseek-ai/dsh-tools` deklariert einen `tools/execute`-Waterfall, dessen Basis-`next()` der Dispatch-mit-Normalisierung-Thunk ist — dasselbe innere `try`/`catch`, das ein geworfenes Tool (oder unbekanntes Tool) in ein `isError`-`ToolExecutionResult` verwandelt. Ein Listener erhält `(exec, next)`: Er ruft `next()` auf, um an Dispatch zu delegieren (gibt dessen Ergebnis zurück, optional umhüllt), oder gibt ein Ersatz-Ergebnis zurück, um Dispatch zu short-circuiten. Die gesamte Pipeline sitzt weiterhin im äußeren try/catch von `execute`, sodass ein werfender Listener zu einem `isError`-Ergebnis wird, nie zu einem Turn-Fehler.

Dass das Catch das Basis-`next` ist — nicht etwas außerhalb des Waterfalls — ist tragend: Wenn ein Provider das Timeout-Signal sieht und seinen eigenen Upstream-Abort-Fehler wirft, konvertiert Registry-Dispatch ihn zuerst in ein normales Fehler-Ergebnis, und erst dann kann `timeout-policy` das finale Ergebnis durch `TOOL_TIMEOUT` ersetzen.

### Das `timeout-policy`-Plugin

Das Plugin ist `@deepseek-ai/dsh-tool-call-timeout-policy`, ein Zero-Config-Funktions/Namespace-Plugin (`name` / `inject` / `apply`) in der `packages/guard/`-Gruppe (ursprünglich eine eigene `timeout/`-Gruppe). Das Per-Tool-Budget wird am TOOL deklariert, nicht an diesem Plugin: Eine `ToolDefinition` trägt ein optionales `timeoutMs`, das das besitzende Tool-Plugin aus seiner eigenen Config setzt. `dsh-tool-web` zum Beispiel löst `fetchTimeoutMs` / `searchTimeoutMs` (Default 30000) auf die `web_fetch` / `web_search`-Definitionen auf:

```yaml
- id: timeout-policy
  name: '@deepseek-ai/dsh-tool-call-timeout-policy'
- id: tool-web
  name: '@deepseek-ai/dsh-tool-web'
  config:
    fetchTimeoutMs: 30000
    searchTimeoutMs: 30000
```

Timeouts leben auf Tool-Definitionen statt auf einer Freitext-Namensmap und eliminieren falsch geschriebene, ungenutzte Policy. `defineTool` validiert ein positives endliches Budget. Während Dispatch leitet der Enforcer ein Deadline-Signal ab und weist es `exec.signal` zu; die Registry fusioniert diese Deadline mit dem ursprünglichen Caller-Signal vor dem Body unter dem [Tool-Cancellation-Vertrag](2026-07-19-cooperative-tool-cancellation.md). Der Enforcer stellt das Caller-Signal danach wieder her und konvertiert seinen eigenen Ablauf in `TOOL_TIMEOUT`; Tools ohne Budget gehen unverändert durch.

Signal-Ersetzung geschieht durch **In-place-Mutation von `exec.signal`**, nicht durch Übergabe eines neuen Objekts an `next()`. Cordis' Waterfall-`next()` ignoriert alle an es übergebenen Argumente und ruft Downstream-Listener mit dem gemeinsamen Payload-Array erneut auf (`vendor/cordis/src/events.ts`), sodass Mutation die Art ist, wie der Wrapper seine Deadline an die Registry liefert. Die Registry fusioniert das erfasste Caller-Signal unmittelbar vor dem Body erneut, und das Plugin stellt `exec.signal` in einem `finally` auf das Original des Callers zurück, sodass `tools/post-execute` das Deadline-Signal des Plugins nie sieht.

`timeout-policy` besitzt beide Verwendungen des `TOOL_TIMEOUT`-Codes: den internen Deadline-Code, der an `deadline()`/`timeoutOf()` übergeben wird (so begrenzt, dass eine verschachtelte äußere Deadline als gewöhnlicher Cancel gelesen wird), und den strukturierten Tool-Result-Fehlercode. Sein Ersatz-Ergebnis ist:

```ts ignore-check
function toolTimeoutResult(timeoutMs: number): ToolExecutionResult {
  return {
    content: [{ type: 'text', text: `Error: tool call timed out after ${timeoutMs}ms` }],
    isError: true,
    error: {
      message: `tool call timed out after ${timeoutMs}ms`,
      info: { name: 'ToolTimeoutError', code: 'TOOL_TIMEOUT' },
    },
  }
}
```

Das ist eine kooperative Deadline. Sie killt keine beliebige Arbeit, indem sie das Tool-Promise racet; das Tool oder die Fähigkeit, die es aufruft, muss `exec.signal` honorieren und Quieszenz erreichen. `timeoutMs` zu deklarieren BEDEUTET daher „dieses Tool kooperiert mit `exec.signal`", was das Plugin-README als seinen Vertrag angibt.

Für Rekonstruierbarkeit ist kein neues Session-Event nötig: `TOOL_TIMEOUT` ist das finale modellseitige `tool/result` für diesen Call, sodass das existierende Session-Log bereits den Inhalt und den strukturierten `{ name, code }`-Fehler aufzeichnet, den der nächste Modell-Request sieht.

### Anpassung bestehender Tools

`web_fetch` und `web_search` sind migriert. `dsh-tool-web` behält die Ownership ihrer modellseitigen Schemas, und diese Schemas exponieren keinen Timeout-Regler: `web_fetch` hat keinen `timeout_ms`-Parameter, während `web_search` ein erforderliches `queries`-Array ohne Timeout-Argument akzeptiert. Die Tool-Bodies importieren `@deepseek-ai/dsh-timeout` nicht; sie reichen `exec.signal` an `ctx.web` weiter.

`dsh-web-fetch-http` behält ein konfiguriertes Provider-Level-`timeoutMs` als grober Ressourcen-Auffang für direkte `ctx.web.fetch()`-Caller und fehlkonfigurierte Deployments; es besitzt kein modellseitiges Timeout. Wenn ein `TOOL_TIMEOUT`-Signal den Fetch-Provider zuerst erreicht, behandelt Provider-scoped Klassifikation es als Upstream-`WEB_ABORTED`, und der äußere `tools/execute`-Wrapper ersetzt das finale Tool-Ergebnis durch `TOOL_TIMEOUT`. Ein ausgeliefertes Web-Tool-Deployment konfiguriert den Provider-Auffang über dem `timeout-policy`-Budget, sodass die Tool-Call-Policy für Modell-Calls normalerweise gewinnt.

`bash` bleibt auf dem aktuellen Backend-Timeout-Pfad. `dsh-tool-bash` exponiert weiterhin `timeoutMs` und `run_in_background`; `dsh-bash-local` nutzt weiterhin `@deepseek-ai/dsh-timeout` für `BASH_TIMEOUT`; Hook-Bridges rufen weiterhin `runHook()` auf und reichen `timeoutMs` durch `ctx.shell`. Das hält Vordergrund/Hintergrund/Hook-Verhalten stabil.

`read`, `write`, `edit`, `todo_write`, `job_list` und `job_kill` opten nicht in Tool-Call-Timeout. `job_output` besitzt seinen eigenen begrenzten Wait, weil ein Wait-Timeout ein erfolgreiches Live-Status-Ergebnis ist, kein Tool-Fehler.

Ein zukünftiges modellseitiges grep/glob-Tool kann auf `ctx.shell` implementiert werden, ohne `@deepseek-ai/dsh-timeout` zu importieren: Es reicht `exec.signal` an `ctx.shell` weiter und deklariert sein eigenes `timeoutMs` (aus der Config seines Plugins), das der Enforcer anwendet. Falls bash-locals Backend-Timeout für ein solches Tool zum Problem wird, kann der Bash-Seam später einen Caller-eigener-Deadline-Modus hinzufügen; das ist eine separate Entscheidung.

## Erwogene Alternativen

**Das Plugin `tool-timeout` nennen.** Der wörtliche Agent-Note-Name passte zum `packages/*/tool-*`-Glob des `gen-tool-catalog`-Vollständigkeits-Guards, der verlangt, dass jeder Treffer ein modellseitiges Tool registriert. Dieses Plugin registriert keins — es ist ein `tools/execute`-Wrapper — sodass ein `tool-*`-Name entweder `verify-tool-catalog` scheitern ließe oder einen irreführenden Boot-Eintrag erzwänge. Das Paket ist `@deepseek-ai/dsh-tool-call-timeout-policy` in der damals neuen `timeout/`-Gruppe, inzwischen in `packages/guard/` eingefaltet; die cordis.yml-`id` kann weiterhin `timeout-policy` sein.

**Nur Per-Tool-Timeout-Behandlung beibehalten.** Das war die Form für `bash` und `web_fetch` und entspricht Claude Code und Codex für Shell-Befehle. Es verliert für Web-artige Tools, weil jedes neue timeout-fähige Tool Validierung, Cap-Semantik, Doku, Snapshots und Klassifikation wählen muss. Das Plugin zentralisiert Policy und Klassifikation, während das Schema jedes Tools auf Business-Input fokussiert bleibt.

**Alle Timeout-Policy sofort aus bash-local herausziehen.** Langfristig sauberer — bash-local würde ein reiner Subprocess-Executor und alle Caller würden ihre Deadlines besitzen. Es verliert als erster Schritt, weil Hooks `ctx.shell` direkt aufrufen und das Bash-Modell-Tool Vordergrund/Hintergrund-Semantik hat, die nicht dieselbe Tool-Call-Lebensdauer ist. `BASH_TIMEOUT` zu behalten bewahrt diese Pfade, während Tool-Call-Timeout sich an einfacheren Tools beweist.

**Ein globales Default-Budget für jedes Tool verwenden.** Bequem, überrascht aber Tool-Autoren: Jedes Tool, das versehentlich länger als das globale Budget läuft, würde anfangen zu fehlschlagen, sobald das Plugin lädt. Ein pro Tool deklariertes Budget macht Adoption bewusst.

**Einen modellseitigen `timeout_ms`-Override exponieren.** Claude Codes `WebFetch`/`WebSearch` und Codex' Web-Tools halten Timeout aus der Modell-Call-Form. Ein Modell-Override würde Timeout zu einem Teil der Prompt-Semantik machen und Schema/Argument-Stripping-Regeln in `timeout-policy` erzwingen. Web-Timeout bleibt nur Deployment-Policy.

**`timeout-policy` selbst Tool-Argumente matchen lassen.** Eine Regel-Engine wie „Timeout deaktivieren wenn `bash.run_in_background` true ist" würde das Policy-Plugin tool-spezifische Argument-Semantik kennen lassen. Vermieden, indem bash nicht zu Tool-Call-Timeout migriert wird.

**`tools/pre-execute` plus `tools/post-execute` statt eines neuen Around-Dispatch-Extension-Points verwenden.** Ein Pre-Listener könnte eine Deadline armieren und `exec.signal` mutieren; ein Post-Listener könnte klassifizieren und ersetzen. Das verliert, weil die Deadline-Lebensdauer zwei unabhängige Waterfalls überspannen würde: eine Call-ID-Map, Aufräumung auf jedem Pre-Deny/Tool-Throw/Post-Throw/Dispose-Pfad und Ordnungsregeln mit jedem anderen Listener. `tools/pre-execute` ist auch das Allow/Deny-Gate, kein Execution-Wrapper. `tools/execute` gibt dem Timeout einen lexikalischen Scope: armieren, delegieren, klassifizieren, disposen.

**`Promise.race` verwenden, um Timeouts für nicht-kooperative Tools durchzusetzen.** Aus demselben Grund wie in der Timeout-Library-Agent-Note abgelehnt: Es gibt Kontrolle an den Caller zurück, während der zugrundeliegende Prozess, Fetch oder Provider-Operation noch laufen kann. Das Plugin sendet nur ein Signal; Terminierung bleibt Verantwortung der Implementation.

## Konsequenzen

- `@deepseek-ai/dsh-tools` gewinnt eine Around-Dispatch-Oberfläche, nachdem die Interception-Punkte bewusst in Pre/Post-Tool-Hooks aufgespalten wurden. Sein Vertrag ist eng — Registry-Dispatch umhüllen, nicht die Pre-Gate- oder Post-Ergebnis-Policy ersetzen — und das Basis-`next()` ist Dispatch-mit-Normalisierung, sodass ein Wrapper nie einen rohen Tool-Throw sieht.
- Mehrere `tools/execute`-Listener komponieren in gewöhnlicher Cordis-Waterfall-Reihenfolge: Ein Listener, der `next()` aufruft, umhüllt Downstream-Listener plus Dispatch; einer, der ohne `next()` zurückkehrt, short-circuitet sie. Ein Deployment, das Timeout mit einem zukünftigen Retry/Sandbox/Metrics-Wrapper kombiniert, wählt Semantik über Registrierungsreihenfolge („Timeout deckt den ganzen Retry" vs. „Timeout deckt jeden Versuch").
- Opt-in per Deklaration ist ein bewusstes Fehlkonfigurationsrisiko: Ein Tool kann ein `timeoutMs` deklarieren, ohne `exec.signal` zu honorieren, und dieses Tool wird bei Timeout nicht stoppen. Die Registry wartet diesen nicht-quieszenten Body ab statt ihn zu racen, während der Plugin-Vertrag sagt, dass ein Budget zu deklarieren kooperativ bedeutet; die Web-Tools beweisen das Muster an Tools, die das Signal bereits weiterreichen.
- Während der Übergang nutzen `bash` und die migrierten Web-Tools absichtlich verschiedene Timeout-Pfade: `TOOL_TIMEOUT` ist das modellseitige Tool-Call-Budget, während `BASH_TIMEOUT` das Bash-Backend-Timeout bleibt, das bash und Hooks nutzen.
