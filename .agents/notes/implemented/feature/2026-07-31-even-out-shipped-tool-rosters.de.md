# Agent Note: Ausgeglichene ausgelieferte Tool-Roster

Status: implemented

[English](2026-07-31-even-out-shipped-tool-rosters.md) | [中文](2026-07-31-even-out-shipped-tool-rosters.zh.md) | Deutsch

## Problem

Die zwei ausgelieferten `dsh`-Oberflächen boten ohne dokumentierten Grund unterschiedliche Tools an. Session-Checkpoints, Tool-Result-Pruning, die Goal-Tools und Ralph lagen in `tui.cordis.yml`; `tool-todo` und später Web-Search lagen in `web.cordis.yml`. Keine der beiden Oberflächen bot Session-Search, einen String-Replacement-Editor oder einen Repeat-Tool-Guard, obwohl alle drei als Pakete existieren und keines oberflächenspezifisch ist.

Das Ergebnis war ein nutzersichtbarer Unterschied, den niemand entschieden hatte: Dasselbe Modell konnte bei derselben Anfrage auf dem Terminal ein Goal setzen, aber nicht im Browser, und im Browser das Web durchsuchen, aber nicht auf dem Terminal.

## Entscheidung

Die nicht oberflächenspezifischen Zeilen wandern in [`base.cordis.yml`](../../../../packages/bundle/base/cordis.patch.yml), und drei weitere kommen hinzu: `tool-session-query`, `tool-str-replace-editor` und `repeat-tool-reminder`. Web-Search wandert ebenfalls dorthin; seine [Deployment-Entscheidung](2026-07-31-web-default-search.de.md) besitzt die Sicherheitsgrenze, während die geteilte Base den oberflächenneutralen Mount besitzt. Beide Oberflächen assemblieren dasselbe Roster, einschließlich der festen `glob`- und `grep`-Mitglieder, weil `dsh-tool-fs-search` die [gebündelte ripgrep-Binary](../../archived/architecture/2026-08-01-packaged-ripgrep-search.md) spawnen lässt. Spätere Entscheidungen verengen dieses Roster: Die [Session-Search-Entscheidung](../../archived/feature/2026-08-02-session-search-not-shipped-default.md) hält `tool-session-query` opt-in, die [Single-Editor-Entscheidung](../../archived/simplification/2026-08-10-default-presets-single-editor.md) entfernt `tool-str-replace-editor` aus den General-Purpose-Presets, und die [Persistent-Shell-only-Entscheidung](../simplification/2026-09-03-minimal-profiles-persistent-shell-only.de.md) entfernt es aus den minimalen Kompositionen.

Zwei Zeilen bleiben oberflächenspezifisch. `tmux-context` ist TUI-only, weil eine Browser-Oberfläche keinen Terminal-Multiplexer beschreiben kann. `session-reference` ist TUI-only, weil es den geteilten Session-Query-Index vom prozesslokalen Pfad des Launchers aus antreibt, während die Browser-Sidebar diesen Index bei ihrer ersten eigenen Suche reconciliert.

**Diese Roster-Entscheidung hat zum Zeitpunkt des Landens nur hinzugefügt.** Keine Tool-Zeile wurde von einer der beiden Oberflächen entfernt, und ein Katalogvergleich fand nur Hinzufügungen. Die späteren Session-Search- und Single-Editor-Entscheidungen besitzen ihre jeweiligen Default-Roster-Ausnahmen. Die geteilten Executors, die Sandbox-Komposition und der Access-Default gehören unabhängig zur [Workspace-Write-Default-Entscheidung](../../archived/feature/2026-07-31-workspace-write-surface-default.md).

### Was nicht gemountet bleibt, und warum

Zwei Capabilities bleiben draußen, gestützt auf die Evidenz, die ihre eigenen Pakete festhalten, und werden hier aufgeführt, damit „vergessen“ und „bewusst dagegen entschieden“ unterscheidbar bleiben.

**`dsh-tool-cordis`** lässt das Modell JavaScript schreiben und als temporäres Plugin mounten. Seine README benennt die Grenze: „The sandbox is containment for honest code, not a security boundary — host-realm helpers on the sandbox global are reachable, so mount code can reach Node“ ([Known limitations](../../../../packages/extensions/tool-cordis/README.de.md)). Die `node:vm`-Realm lebt im Harness-Prozess, während `dsh-sandbox-local` nur das argv begrenzt, das sie spawned, sodass auf der Web-Oberfläche sowohl die Sandbox als auch der Approval seam umgangen statt durchgesetzt werden.

**Das LSP-Trio** bleibt aus einem operativen statt einem Sicherheitsgrund draußen: `command` wird beim Plugin-Load aus `PATH` aufgelöst, sodass ein fehlender Language-Server den gesamten Boot scheitern lässt statt nur ein Tool. Es wird mountbar, sobald Fehlen zu einer übersprungenen Registrierung degradiert.

### MCP ist eine Dependency, keine Zeile

`@deepseek-ai/dsh-mcp-client` wird eine Runtime-Dependency der CLI ohne eine Zeile in irgendeiner ausgelieferten Config. Das Plugin mountet exakt einen Server pro Instanz, und `command` ist Pflicht, sodass ein Default einen Drittanbieter-Server benennen und ihn bei jedem Start als Child-Prozess spawnen müsste — außerhalb von `ctx.shell` und damit außerhalb der Sandbox-Policy, die die Web-Oberfläche komponiert.

Die Schicht, die MCP zum Default machen würde, ist die, die dieses Repository noch nicht hat: eine Bridge, die die Server-Liste eines Nutzers liest und pro Eintrag einen Client mountet, dieselbe Form, die [`dsh-hooks-claude-code`](../../../../packages/hooks/hooks-claude-code/README.de.md) bereits für eine Claude-Code-`hooks.json` hat. Die Dependency auszuliefern bedeutet, dass ein installiertes `dsh` Server aus `$DSH_HOME/config.yaml` mounten kann; die CLI-README trägt das YAML.

## Tests

`apps/cli/tests/shipped-composition.e2e.ts` bootete den ausgelieferten Baum durch den echten Loader in einem Pseudo-Terminal und las die Tool-Namen aus dem `request/header`, den das Session-Log persistierte, sodass die Assertion der Katalog war, den das Modell tatsächlich erhielt. Sein `--config`-Overlay `composition-keyless-tail.cordis.yml` diente nur der Testisolierung: ein netzwerkfreier Adapter und workspace-lokale Session-Artefakte.

Derselbe Tail fügte außerdem `composition-settled.ts` ein, das abgeschlossene Loader-Aktivierung auf dem Terminal-Stream ankündigte. Die TUI renderte, sobald ihre eigene Fiber startete, sodass ein am Banner getippter Prompt den Loop erreichen konnte, während Tool-Zeilen und Persistenz noch aktivierten, und einen partiellen Katalog assemblieren konnte; das Gaten des ersten Smoke-Prompts auf diesen Marker machte die Assertion deterministisch.

Derselbe Smoke pinnt außerdem die TUI-Execution-Posture aus demselben Artefakt. Diese Sandbox-Schema- und Initial-Permission-Assertionen gehören zur [Workspace-Write-Default-Entscheidung](../../archived/feature/2026-07-31-workspace-write-surface-default.md), unabhängig von diesem Roster.

[`apps/web/tests/shipped-composition.e2e.ts`](../../../../apps/web/tests/shipped-composition.e2e.ts) deckt die Web-Oberfläche in der Built-Lane ab und assertiert ihren Katalog, dass ihr Access-Default unangetastet ist und dass die writable roots von `workspace-write` die Temp-Verzeichnisse einschließen — eine Falle, die Sandbox-Tests lügen lässt, wenn der Workspace unter `/tmp` liegt ([`roots.ts`](../../../../packages/sandbox/sandbox/src/roots.ts)).

`glob` und `grep` werden als feste Mitglieder assertiert, nicht als host-abhängiges Paar: `dsh-tool-fs-search` spawned die gebündelte ripgrep-Binary und registriert beide Tools unbedingt, sodass das Paar immer präsent ist.

Über die committeten Tests hinaus wurden beide Oberflächen gegen einen echten Key aus dem gebauten `apps/cli/lib/bin.js` unter plain Node getrieben. Jedes gemountete Tool lief erfolgreich, einschließlich `ralph` und `web_search`; das Modell erreichte nie `cordis_*` oder `mcp_*`, fiel bei LSP-Navigation auf `grep` zurück und nutzte einen Hintergrund-`bash`-Task, als es um ein persistentes Terminal gebeten wurde.

## Erwogene Alternativen

**Die geteilten Zeilen in beide Overlays duplizieren statt sie zu promoten.** Abgelehnt nach der One-Home-Regel: Drei der neuen Zeilen würden zweimal existieren, ohne dass die Kopien einen Grund zum Divergieren hätten, und die nächste Roster-Änderung müsste an beide denken.

**Die TUI in derselben Änderung sandboxen.** Abgelehnt als separate Entscheidung, die nicht in eine Roster-Änderung gehört: Die TUI mountet uneingeschränkte Executors, und sie zu ersetzen ändert, was eine bestehende Oberfläche tut, statt was sie anbietet. Diese Entscheidung braucht eigene Evidenz — nicht zuletzt, weil die TUI keinen `approval/request`-Answerer hat, sodass eine Eskalation dort fail-closed scheitert statt zu prompten.

**PTC-Modus aktivieren.** Seine Trust-Posture ist per Design bash-äquivalent, und seine Tool-Calls passieren dasselbe `tools/pre-execute`-Gate wie bash, also ist es nicht derselbe Aufruf wie die Modell-Code-Tools oben. Hier dennoch abgelehnt: `both` ändert jeden modellsichtbaren Request auf beiden Oberflächen, und `ptc` ersetzt die Leitung statt zu ihr hinzuzufügen — beides sind Präsentations-, keine Roster-Entscheidungen.

**Standardmäßig einen MCP-Server mounten.** Abgelehnt, weil ein ausgelieferter Default einen benennen müsste und jede Wahl auf dem Rechner jedes Nutzers außerhalb der Sandbox einen Drittanbieter-Child-Prozess spawnen würde. Stattdessen wird die Dependency ausgeliefert.

## Konsequenzen

Dasselbe Modell bekommt auf beiden Oberflächen dieselben Tools, und der grundlos existierende Unterschied ist verschwunden. Die Tests assertieren die zwanzig unbedingten Namen exakt und pinnen `glob` und `grep` auf beiden Seiten als feste Mitglieder, sodass eine spätere Änderung, die nur eine Oberfläche verändert, einen Check scheitern lässt statt still ausgeliefert zu werden; die [Session-Search-not-shipped-default-Entscheidung](../../archived/feature/2026-08-02-session-search-not-shipped-default.md) ist genau so eine spätere Änderung, und beide Tests zogen mit.

`apps/cli` gewann fünf Workspace-Dependencies: vier, die der ausgelieferte Baum mountete, plus `dsh-mcp-client`, das nicht gemountet wird und existiert, damit ein installiertes `dsh` mounten kann. Vier bleiben — die [Session-Search-not-shipped-default-Entscheidung](../../archived/feature/2026-08-02-session-search-not-shipped-default.md) entfernte `@deepseek-ai/dsh-tool-session-query` samt seiner Zeile.

Die Execution-Policy bleibt unabhängig vom Roster. Die [geteilte Workspace-Write-Entscheidung](../../archived/feature/2026-07-31-workspace-write-surface-default.md) besitzt die gesandboxten Executors und die Default-Permission beider Oberflächen; diese Policy zu ändern fügt kein Tool hinzu und entfernt keines.
