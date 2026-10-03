# Agent Note: Prompt-Variablen und Tool-Guidance-Eigentümerschaft

Status: implemented

[English](2026-07-05-prompt-variables-and-tool-guidance-ownership.md) | [中文](2026-07-05-prompt-variables-and-tool-guidance-ownership.zh.md) | Deutsch

## Problem

Der assemblierte System-Prompt hatte vier Defekte, alle aus einer Familie: Fakten, die der Harness bereits kennt, wurden von Hand an anderer Stelle wiederholt — und drifteten.

**Das Modell konnte seinen eigenen Namen nicht kennen.** `AgentOptions.model` steuert jeden Request, aber kein Prompt-Text trug ihn — und nichts KONNTE ihn tragen: Sections in `dsh-system-prompt` waren kontext-global, während der Modellname per-Agent ist, und `assemble()` nahm überhaupt kein Per-Agent-Input entgegen.

**Tool-Guidance war handgeschriebene Prosa in Leaf-YAML.** Die Shell-/Subagent-/todo_write-Usage-Guidance lebte in den Coding-Agent- und ACP-Persona-Strings — zwei driftende Kopien (die ACP-Kopie war bereits gekürzt) — während `dsh-tool-fs` und `dsh-tool-web` ihre Guidance als `ctx.systemPrompt.section()`-Beiträge besaßen. Ein Tool-Plugin zu laden oder zu streichen hieß, die Persona jedes Deployments von Hand zu editieren, und das alte Terminal-Welcome-Banner zählte das Tool-Set ebenfalls von Hand auf.

**Die Persona renderte nach der Tool-Guidance.** Der Loop string-jointe `agent.options.systemPrompt` NACH den assemblierten Sections, sodass das Modell „Use the read tool…" vor „You are a coding agent" las — rückwärts gegenüber der Identity-first-Konvention (Claude Code, Codex) und ein zweiter Kompositionspfad neben der Section-Pipeline.

**Die Beschreibung des Fork-Tools war falsch.** `dsh-tool-subagent` hardcodierte eine für Spawn-Semantik geschriebene Beschreibung — „a separate agent that works in its own context … it does not see this conversation" — und die `subagent_fork`-Instanz (deren Kind die abgeschlossenen Turns des Elternteils erbt) bekam dieselben Worte; die YAML-Prosa korrigierte die Lüge out-of-band. Kleiner Verwandter: `PromptSection.name` war als „(diagnostics / dedup)" dokumentiert, aber Duplikate wurden still akzeptiert.

## Entscheidung

**Ein Prinzip: Jeder Fakt im Prompt hat genau einen Owner.** Modellname und Workspace sind Config-/Session-Fakten → der Harness exponiert sie als Variablen, und die Persona referenziert sie. Per-Tool-Semantik und Wann-nutzen → die `description` des Tools. Call-übergreifende Gewohnheiten, die eine Beschreibung nicht tragen kann → die Prompt-Section des Tool-Pakets. Der Produktname und die SDK-Identity-Zeile → die statische `harness:identity`-Section. Deployment-Rolle und -Verhalten → die Persona des Deployments.

### Assemble-Kontext

`SystemPrompt.assemble(context)` nimmt einen merge-erweiterbaren `AssembleContext`. `dsh-system-prompt` deklariert den optionalen `scope`-Selektor für Scoped Routing, während `dsh-agent` das optionale typisierte `agent`-Feld per Declaration-Merging darauf hängt (eine Type-Level-Kante `agent → system-prompt`, ohne Laufzeit-Abhängigkeitszyklus). Der Loop ruft pro Step `assembleContextFor(agent)`, damit beide Felder denselben Agent identifizieren; Section-Text-Provider dürfen diesen Kontext lesen, und der `system-prompt/assemble`-Waterfall erhält ihn, sodass ein Listener pro Agent filtern oder erweitern kann.

### Prompt-Variablen

Plugins registrieren `{{name}}`-Werte über `ctx.systemPrompt.variable(name, provider)`. Das Assembly löst sie in die Waterfall-sichtbare Variable-Map auf. Das Rendering lehnt unbekannte Own-Property-Referenzen ab, registrierte Provider die `undefined` returnen, missformte komplette Referenzen und unbalancierte Referenzen die noch ein schließendes `}}` enthalten; ein einzelnes ungematchtes `{{` bleibt Prosa, und substituierte Werte werden nicht erneut gescannt. Die Registrierung lehnt ungültige oder doppelte Variablennamen ab, und Section-Namen sind eindeutig.

`dsh-agent-loop` registriert die beiden Built-ins, beide reine Projektionen des Kontext-Agents: `model` (= `options.model`) und `cwd` (= `session.header.cwd`). Die Beispiel-Personas schreiben `powered by the {{model}} model` — der Modellname steht genau einmal, im `model:`-Config-Key. `{{cwd}}` wird nur im ACP-Beispiel demonstriert: Jede ACP-Session trägt den cwd des Clients, während per Config vor-erstellte Stdio-Agents keinen haben (eine Persona, die dort `{{cwd}}` behauptet, lässt den Turn fehlschlagen — by design). Die Variablen bleiben auf dem Loop-Plugin (anders als die Sections unten): Sie sind Laufzeitfakten der Agents, die DIESER Loop treibt, und ein Ersatz-Loop liefert seine eigenen.

### Persona als Order-0-Section

`dsh-system-prompt` besitzt `harness:identity` auf First-Party-Order `-1000` und die konfigurierte `deployment:persona-prefix` auf Order 0, sodass beide einen Ersatz-Loop überleben. Das Prompt-Rendering hat einen Pfad, `renderPrompt(assembly)`, und der geroutete Request-Header zeichnet daher exakt den Prompt auf, den `ctx.tokenMeter` später für den Compaction-Druck replayed. Eine Agent-scoped `deployment:persona-prefix` shadowed den globalen Default und lässt Subagent-Provider eine Persona vor der Publikation installieren. Das [`dsh-system-prompt`-README](../../../../packages/core/system-prompt/README.de.md) besitzt die spärlichen benannten Placements für Identity, Policy, Tool-Guidance, generiertes Protokoll und Final-Output-Verpflichtungen.

### Tool-Guidance-Eigentümerschaft

Per-Tool-Semantik und Auswahl-Guidance leben in Tool-Beschreibungen. Prompt-Sections tragen nur call-übergreifende Gewohnheiten, etwa das Prüfen von Bash-Exit-Markern oder das Bevorzugen von Filesystem-Tools gegenüber Shell-Befehlen. `todo_write` und Subagent-Tools brauchen keine Section, weil ihre Beschreibungen den vollen Contract enthalten. Deployment-Personas enthalten nur Rolle und Verhalten.

### Der Subagent-Conversation-History-Deskriptor

`SubagentProvider.inheritsParentContext` beschreibt das Seeding der Konversation, nicht Scope, Services, Tools oder Autorität. Spawn und ACP setzen es auf `false`; Fork auf `true`. `dsh-tool-subagent` leitet seine Tool- und Prompt-Parameter-Beschreibungen vom Flag ab, einschließlich dass Fork abgeschlossene Turns erbt, nicht aber den in-flight Turn. Provider-Lifecycle-Events halten diesen Wortlaut mit der reaktiven Provider-Registrierung synchron; ihre Begründung lebt in der [provider-lifecycle-events Agent Note](../../archived/architecture/2026-07-05-subagent-provider-lifecycle-events.md).

## Erwogene Alternativen

- **Der Loop komponiert selbst eine Identity-Zeile** — hardcodiert modellzugewandte Prosa im einen Paket, das dünn bleiben muss („plugins, not loop changes"), und außerhalb der Section-Pipeline wäre sie ein zweiter Kompositionspfad. (Die Identity WIRD als Code-Literal ausgeliefert — aber als gewöhnliche Section, registriert von `dsh-system-prompt`, dessen `system-prompt/assemble`-Waterfall das Ablassventil für ein Deployment bleibt, das sie streichen muss.)
- **Modellname über den `agent/request`-Waterfall injizieren** — Prompt-Text würde an zwei Stellen komponiert, und die früher gerenderte Persona könnte dem finalen gerouteten Header widersprechen. Das Request-Plugin, das das späte Routing besitzt, muss auch jede frühere Prompt-Aussage über dieses Modell besitzen.
- **Den Modellnamen von Hand in jede Persona schreiben** — dupliziert den `model:`-Key eine Zeile darüber und lügt still nach einer Config-Änderung; genau die Krankheit, die diese Entscheidung heilt.
- **Nachsichtige Interpolation (unbekannte Refs verbatim lassen oder leer substituieren)** — ein Typo liefert `{{modle}}` (oder ein Loch) ans Modell, und niemand merkt es bis zur Transcript-Review.
- **Per-Instanz-Subagent-Wortlaut in der Config** — bringt modellzugewandte Prosa zurück in jedes Deployment × jede Instanz und lässt den Handgeschrieben-in-Leaf-YAML-Drift wiederauferstehen. **Wortlaut am Provider-NAMEN festmachen** — `providerName` ist selbst Config, also bekommt ein umbenannter Provider still die falschen Worte.
- **Den Provider zur `apply`-Zeit auflösen (eine Load-Order-Anforderung)** und **Section-only-Subagent-Wortlaut (lazy zur Assemble-Zeit aufgelöst)** — die Alternativen zu den Provider-Lifecycle-Events; beide in [der provider-lifecycle-events Agent Note](../../archived/architecture/2026-07-05-subagent-provider-lifecycle-events.md) verworfen.

## Out of scope

- Weitere Variablen (`date`, Plattform, Git-State) — die Registry macht jede zu einem Ein-Zeilen-Beitrag des Plugins, das den Fakt besitzt; keine wird hier beansprucht.
- Ein Config-`cwd` für vor-erstellte Stdio-Agents (würde der Stdio-Persona `{{cwd}}` erlauben und Persistence nach realem Pfad partitionieren) — vertagt, bis die Session-cwd-Frage neu aufgegriffen wird.

## Ausgelieferte Invarianten

- Der TUI-Agent-Prompt rendert Identity, Persona mit dem interpolierten Modell, dann fs-/shell-/web-Guidance über einen Assembly-Pfad.
- Fork- und Fresh-Subagent-Beschreibungen spiegeln, ob der Provider abgeschlossene Konversations-Turns erbt; das Tool erscheint, verschwindet und wird mit Provider-Lifecycle-Änderungen neu formuliert.
- Unbekannte, wertlose, missformte oder unbalancierte Variablenreferenzen nennen die Section und werfen; doppelte Section-, Variablen- und Tool-Registrierungen werfen ebenfalls.
- Snapshot-Replay ist prompt-unabhängig: Es keyt aufgezeichnete Chunk-Streams nach Turn und Step, ohne den ausgehenden Request zu vergleichen.

## Konsequenzen

- Jeder Fakt im assemblierten Prompt hat jetzt genau einen Owner, und die handgepflegte Tool-Prosa in Leaf-YAML ist weg: Ein Tool-Plugin zu laden oder zu streichen bedeutet nicht mehr, irgendeine Deployment-Persona zu editieren.
- `{{model}}` spiegelt `AgentOptions.model` zur Assembly-Zeit. Ein Plugin, das im `agent/request`-Waterfall das Modell wechselt, macht die Prompt-Aussage für diesen Step stale, und eines, das das Modell dort erst LIEFERT (options.model unset — der dokumentierte Loop-Fallback), lässt die Variable beim Rendern wertlos und lässt eine `{{model}}`-Persona fehlschlagen, bevor der Waterfall läuft. Beide haben dasselbe Heilmittel, und es ist die Ownership-Regel selbst: Das Plugin, das den spät gebundenen Modell-Fakt besitzt, stellt ihn früh im `system-prompt/assemble`-Waterfall bereit (`assembly.variables['model'] = …`) — ein Owner, beide Aussagen; ein Loop-Test pinnt den Supply-Pfad Ende zu Ende. Akzeptiert.
- Solange ein gebundener Provider abwesend ist (noch nicht aktiviert, unloaded, mitten im HMR-Reload), existiert das Subagent-Tool nicht, und ein Modell-Request in diesem Fenster hat es schlicht nicht. Das ist der ehrliche Zustand — die Alternative war ein registriertes Tool, dessen Beschreibung oder Ausführung nicht vertrauenswürdig wäre.
- Strenge bedeutet, dass eine Persona einen Turn beim Rendern scheitern lassen kann (z. B. `{{cwd}}` auf einer cwd-losen Session). Der Fehlschlag ist eingedämmt — der Turn endet `error`, der Loop überlebt — und es ist ein Autorenfehler, den wir laut WOLLEN.
- Noch keine Escape-Syntax für ein literales `{{name}}` in Prompt-Prosa; eine hinzufügen, falls ein echter Prompt sie je braucht.
