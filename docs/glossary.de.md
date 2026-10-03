# Glossar
[English](glossary.md) | [中文](glossary.zh.md) | Deutsch


Domain-Vokabular für DeepSeek Harness verwendet einen kanonischen Begriff pro Konzept. Begriffe linken zu ihren Einträgen mit Standard-Markdown-Anchorn; Implementierungsdetail bleibt in Package-READMEs und Agent Notes.

## capability-seam

- **seam** — eine *austauschbare Capability* mit drei Rollen: einer **Service Definition** (dem Cordis-`Service`, das seinen `ctx.<key>` und Vokabular-Typen besitzt — eine abstrakte Klasse wie `ShellExecutor` oder eine konkrete Registry wie `WebRuntime`, nie ein TypeScript-`interface`), einem oder mehreren **Service Providern**, und einem oder mehreren **Consumern**, die den Service injecten. `packages/shell` ist das kanonische Beispiel: `dsh-shell` (Service Definition), `dsh-bash-local` / `dsh-bash-sandbox` (Provider), und `dsh-tool-bash` (Consumer). Rollen belegen normalerweise separate Packages, wenn sie unabhängig evolvieren, aber ein Package kann mehrere Rollen besitzen, wenn sie ein Concern sind (`dsh-user-approval` besitzt die Service Definition der Approval-Seam und ihre konkrete Implementierung in einem Package). Die seam ist die vollständige Capability, nie eine Rolle; reserviere den Begriff für diese Bedeutung und nenne ein Konstituent nach seiner Rolle, Klasse, Service, Vertrag oder Extension Point.

## agent-scope

- **scope** — die Einheit der Per-agent-Registration: ein Beitrag (Tool, Prompt-Section, Variable, Restriction, Listener) ist entweder *global* (für jeden agent sichtbar) oder *scoped* (genau einem [Scope-Key](#scope-key) zugeordnet). Zwei Ebenen, flach: Scoped-Registrationen erben nicht zu Subagents hinunter; Subtree-Verhalten wird mit [Lineage](#lineage)-Daten ausgedrückt, nie mit Scope-Struktur.
- **Scope-Key** — die opake Identität, nach der ein Scope keyed ist, verglichen nach Object-Identity. Die Harness-Konvention: ein Live-agent ist der Key seines eigenen Scopes. <a id="scope-key"></a>
- **Agent-Kontext (`agent.ctx`)** — der Scoped-Kontext des agent; Registrationen durch ihn sind Scope-sichtbar UND Scope-Lifetime (ein Fakt treibt beides), und Listener darauf partizipieren an den Scope-gefilterten Dispatches dieses agent. Registry-Subject-Events können unter ihrem eigenen Event-Vertrag bewusst ungefiltert bleiben.
- **Scope-Carrier** — das `thisArg`, das ein Scope-gefilterter Dispatch trägt (gebaut von `scopeTarget`); sein Filter lässt ungetaggte Listener plus die eigenen des Subjects zu. Ein *Subject-loser* Carrier (ohne Key) lässt nur ungetaggte Listener zu.
- **Scoped-Dispatch** — die Regel: ein Event über die Aktivität eines agent dispatcht mit dem Carrier dieses agent. Events über eine Registry selbst (ein Tool wurde hinzugefügt) sind *Registry-Subject* und bleiben ungefiltert.
- **Shadowing** — Most-Specific-Wins-Namensauflösung: ein Scoped-Tool/-Section/-Variable ersetzt sein gleichnamiges globales Zwilling nur für diesen Scope. Der Per-agent-Persona- und Per-agent-Tool-Variant-Mechanismus.
- **Restriction / Scope-local-Registration** — eine Restriction (`tools.restrict`) filtert das GLOBALE Tool-Set für einen Scope (Komposition durch Schnittmenge); Scope-local-Registrationen werden nach diesem Filter gemergt. Ein weggefiltertes globales Tool fehlt im Prompt UND verweigert die Ausführung, ununterscheidbar von einem nichtexistenten.
- **Setup-Window** — der Creation-Slot, in dem ein Creator die Scoped-Welt eines agent komponiert (`CreateAgentOptions.setup`): nachdem Scope und agent-Objekt existieren, aber bevor der agent oder die Session veröffentlicht wird, `agent/session-start` feuert, oder der erste Prompt assembliert wird. Setup registriert; es treibt den agent nie.
- **Lineage** — Parent-/Child-Fakten als Daten getragen (`parentSession`, dauerhaftes `delegationDepth`, Runtime-`subagentDepth`); beeinflusst nie Visibility. <a id="lineage"></a>

## goal

- **goal** — ein dauerhaftes Completion-Objective, das an eine existierende Session angehängt ist, mit einer revisionierten `active` / `paused` / `blocked` / `complete`-Phase und einem Goal-Round-Cap; `blocked` behält einen Policy-Code und eine Erklärung. Ein goal ist State, kein Scheduler oder eine separate Konversation; das Session-Log bleibt seine Source of Truth.
- **Goal-Round** — ein Continuation-Cycle, das für das aktuelle goal zugelassen wird. Der Same-Session-Treiber materialisiert eine Goal-Round als einen von goal getriebenen [Turn](#turn), der null oder mehr Steps enthalten kann; unzusammenhängende Human-Turns in derselben Session konsumieren das Goal-Round-Cap nicht. <a id="goal-round"></a>
- **Goal-Activation** — prozesslokale Permission für einen Continuation-Consumer, eine weitere Goal-Round zuzulassen. Activation ist entweder `armed` oder `disarmed`; sie ist bewusst aus dauerhaftem Replay abwesend, sodass Resume und Fork eine spätere human-autorisierte Resume-Mutation durch `/goal` oder das Modell-Tool vor automatischer Arbeit erfordern.

## human command

- **Human-Command** — eine Slash-präfixierte Instruction, die von einem Human-facing-Adapter über `ctx.commands` interpretiert und ausgeführt wird, ohne eine Modell-Message zu werden. Sie ist verschieden von einem Modell-facing-Tool und von Shell-Command-Ausführung über `ctx.shell`.
- **Command-Plane** — Discovery, Parsing, Dispatch, Cancellation und Result-Rendering, das UI-Adapter und Command-Plugins besitzen. Command-Output ist UI-State, es sei denn, der Handler mutiert separat eine dauerhafte Domain.
- **Goal-Command** — der `/goal`-Human-Command, der von `dsh-command-goal` beigetragen wird; er beobachtet oder mutiert das aktuelle goal direkt, während die goal-Domain jeden dauerhaften, modell-sichtbaren Record besitzt.

## loop hierarchy

- **turn** — ein Drain des zugelassenen Inputs in einer Session, der endet, nachdem das Modell und seine Tools stoppen oder eine Terminal-Policy interveniert. <a id="turn"></a>
- **step** — eine Modell-Anfrage plus die Tool-Ausführungen, die durch ihre Response verursacht werden; ein Turn enthält null oder mehr Steps. <a id="step"></a>
- **Round** — eine äußere Policy-Iteration, die einen Turn enthält, wie eine [Goal-Round](#goal-round) oder ein Fresh-agent-Ralph-Versuch. Round-Counter gehören zu dieser Policy und zählen nicht jeden Turn in einer Session. <a id="round"></a>

## Ralph

- **Ralph-Loop** — ein Foreground-Fresh-agent-Workflow-Lauf zu einem immutablen Objective. Es ist eine Modell-facing-Tool-Policy, komponiert aus Workflow- und Subagent-Primitives, kein Same-Session-goal, kein agent-loop-Mode, kein Scheduler und kein generisches Workflow-Script-Feature. <a id="ralph-loop"></a>
- **Ralph-Round** — eine Fresh-Child-Session in einer [Ralph-Loop](#ralph-loop). Das Child erhält keinen Parent- oder Prior-Child-Conversation-Seed; der geteilte Workspace und ein begrenzter [Ralph-Handoff](#ralph-handoff) tragen Cross-Round-State. <a id="ralph-round"></a>
- **Ralph-Handoff** — der normalisierte begrenzte strukturierte Report, der von einem fortsetzenden Ralph-Round an den nächsten weitergegeben wird, mit Status, Summary, Evidence, Next-Steps und Blocker-Text. Er ergänzt den geteilten Workspace, statt ihn als Authority zu ersetzen. <a id="ralph-handoff"></a>
