# Agent Note: Modellsichtbare Same-Session-Goal-Tools

Status: implemented

[English](2026-07-19-model-facing-goal-tools.md) | [中文](2026-07-19-model-facing-goal-tools.zh.md) | Deutsch

## Problem

Die persistierte Goal-Domain exponiert Lifecycle-Verben bewusst an Plugins, nicht direkt an ein Modell. Ein Modell braucht dennoch eine kleine Control-API, um das aktuelle Goal zu entdecken, eines aus menschlicher Absicht zu erzeugen und seinen Lifecycle zu ändern. Prompt-Anleitung allein kann nicht feststellen, wer eine Mutation autorisiert hat: Ein Subagent, eine injizierte Plugin-Message, ein veralteter Modell-Turn oder eine fortgesetzte Session können alle dieselben Tool-Argumente erzeugen.

Die Tool-API muss außerdem die Trennung zwischen durablen Zustand und live Execution-Authority bewahren. Eine wiederhergestellte oder geforkte Session kann ein aktives Goal replayen, startet aber disarmed; eine spätere menschliche Anfrage wie „weiter“ sollte das Modell es rearmen lassen, ohne eine wörtliche Command-Phrase zu verlangen. Umgekehrt muss eine zugelassene autonome Goal Round Abschluss oder einen dauerhaften Blocker melden können, ohne die Erlaubnis zu erhalten, das menschliche Objective zu bearbeiten, zu pausieren, fortzusetzen oder zu ersetzen.

## Entscheidung

`@deepseek-ai/dsh-tool-goal` in `packages/goal/tool-goal/` trägt über `ctx.goals` drei exklusive Tools und einen System-Prompt-Policy-Abschnitt bei: `get_goal`, `create_goal` und `update_goal`. Die Namen und die Read-Create-Update-Form folgen Codex' kompakter Goal-Tool-Oberfläche, während die Authority-Regeln die öffentlichen Agent-, Session-, Tool- und Goal-Services dieses Repositorys verwenden.

### Tools und Modell-Contract

`get_goal()` gibt das aktuelle Goal oder `null` zurück. Ein Nicht-null-Ergebnis enthält die Compare-and-Set-Id und -Revision, das Objective, die durable Phase, zugelassene und maximale Goal Rounds, einen etwaigen Blocker-Grund sowie die prozesslokale Activation-Beobachtung. `create_goal(objective, max_goal_rounds?)` erzeugt ein lang laufendes Same-Session-Objective. `update_goal(goal_id, revision, action, objective?, max_goal_rounds?, blocked_reason?)` unterstützt `edit`, `pause`, `resume`, `complete` und `blocked`; Ersetzungsfelder sind nur für `edit` gültig, während ein nicht leerer `blocked_reason` nur für `blocked` erforderlich ist und unter dem stabilen Code `model-reported` persistiert. Ein durable paused Goal lehnt `resume` mit `GOAL_TOOL_RESUME_PAUSED` ab; das nutzerseitige Command oder Web-Control besitzt diesen Übergang. Der Executor behandelt optionale Felder mit exakt leerem String und ein `max_goal_rounds` von null als Strict-Schema-Füller: Sie gelten als weggelassen, ein Edit verlangt dennoch mindestens eine bedeutsame Ersetzung, und alle Nicht-Füller-Werte behalten die Action-Beschränkungen.

Der Prompt sagt dem Modell, dass es Goal-Absicht aus einer direkten menschlichen Anfrage in beliebiger Wortwahl oder Sprache ableiten darf, aber routinemäßige Single-Turn-Arbeit nicht in ein Goal umwandeln soll. Es muss vor einem Update das aktuelle Goal lesen und die exakte Id und Revision kopieren. Bei einem wiederhergestellten oder geforkten, aktiven aber disarmed Goal ist eine semantische menschliche Fortsetzungsbitte Grund für `resume`. Der Prompt kündigt die durable-paused-Grenze nicht an; die Ausführung lehnt diesen Versuch mit `GOAL_TOOL_RESUME_PAUSED` ab, und der nutzerseitige Resume-Pfad besitzt den Übergang. Abschluss ist einem erreichten Objective vorbehalten, und Schwierigkeit oder Unsicherheit allein ist kein Blocker; ein Block-Report muss die konkrete Bedingung benennen.

Alle drei Tools verwenden exklusive Ausführung, sodass ein vom Modell geordneter Batch frühere Mutationen und ihre neuen Revisionen beobachtet. Ergebnisse sind kompaktes JSON. Die UI-Präsentation ist eine reine Funktion der Argumente und nutzt generische Read- oder Mutation-Cards; Mutation-Cards wählen bedeutsame Action-Werte vor der Goal-Id, sodass akzeptierte Füller ihre Eingabe nicht leeren können. Activation wird nur als live Beobachtung gemeldet und nie in den Replay-Zustand geschrieben.

Eine autonome Goal Round, die erfolgreich Abschluss oder Blockierung meldet, hängt eine Wrap-up-Instruktion an ihr Tool-Ergebnis an, damit das Modell den Nutzer weiterhin anspricht, bevor der Turn über den gewöhnlichen No-Tool-Calls-Stop endet; der ursprüngliche Conclude-at-Result-Stop wird durch die [Goal-Round-Wrap-up-Entscheidung](../../archived/bug-fix/2026-08-02-goal-round-wrapup-message.md) ersetzt. Direkte menschliche Mutationen erhalten keine Instruktion: Der Assistant kann die Änderung bestätigen, und gleichzeitiges menschliches Steering bleibt für gewöhnliche Stopp-Prüfungen verfügbar.

### Execution Authority

Jeder Aufruf erfordert einen `exec.agent`, der das exakt laufende Objekt in der `AgentRegistry` ist, der aktuell geerbte Driver-Initiator ist und einen offenen Turn hat. Dies sind Ausführungszeitprüfungen, die durch Prompt-Injection oder handgeschriebene Tool-Argumente nicht umgangen werden können.

Create, Edit, Pause und Resume erfordern zusätzlich eine akzeptierte User-Message oder ein User-Steering-Event im aktuellen Turn eines Runtime-Root-Agents. Root-Ownership wird aus dem live Agent-Graphen abgeleitet, nicht aus durabler Fork-Abstammung: Ein fortgesetzter Fork kann direkte menschliche Authority erhalten, während ein live Child ein Subagent bleibt und diese Zustände nicht mutieren kann. User-Source ist eine Host-Bescheinigung: Jede `Agent.followup()`- oder `steer()`-Eingabe erfordert eine explizite Source, sodass der Host direkte menschliche Inhalte als `{ kind: 'user' }` markiert und nicht-menschliche Produzenten sich in ihren Source-Feldern identifizieren. Die Runtime beweist, dass der aktuelle Turn eine direkte menschliche Message enthält, nicht ob die Wortwahl des Menschen semantisch Erzeugung oder Fortsetzung rechtfertigt; diese Interpretation bleibt beim Modell.

Complete und Blocked akzeptieren entweder direkte menschliche Authority oder die exakt aktuelle Goal Round. Goal-Round-Authority erfordert eine goal-sourced `user/message`, deren Goal-Id, Revision und Round alle dem gefalteten aktuellen Goal entsprechen. Sie gewährt nur die zwei terminalen Reports. Direkte menschliche Authority darf ein Goal sofort stoppen.

### Blocking-Schwelle

`blockedAfterConsecutiveRounds` ist eine validierte positive Safe-Integer-Konfiguration mit Default `3`. Wenn eine autonome Goal Round `blocked` aufruft, verlangt das Plugin mechanisch mindestens so viele zugelassene Rounds und eine nicht leere Erklärung; der konfigurierte Wert erscheint auch in der Modell-Anleitung. Die Runtime kann nicht bestimmen, ob diese Rounds auf dieselbe Blockierungsbedingung stießen, daher bleibt semantische Äquivalenz eine Modellentscheidung. Diese Zahl ist bewusst von der großzügigen Fortsetzungsobergrenze des Goals getrennt.

## Tests

Die Unit-Coverage pinnt Registrierung und Disposal, exklusive Einplanung, generierte Prompt-Policy, füllersichere generische Präsentation, direkte menschliche Erzeugung in einem nicht-englischen Turn, exakte/veraltete/nicht laufende Agent- und Driver-Prüfungen, Live-Child-Ablehnung, Resumed-Fork-Root-Authority, Steering, nicht passende Initiatoren, Read/Create/Partial-Edit/Pause-Verhalten einschließlich Strict-Schema-Füller, Durable-Paused-Resume-Ablehnung, bedingte Blocker-Erklärungen, Rearming nach einer Session-Start-Kante, Authority-vor-bedingten-Argument-Fehler, exakten Goal-Round-Abschluss, nur-autonomes terminales Stoppen, die konfigurierte Blocking-Schwelle und sofortige menschliche Blockierung. Ein schlüsselloser Replay-Snapshot mountet die Goal-Domain und die Tools in die echte Headless-One-shot-Anwendung, treibt eine Strict-Füller-`update_goal`-Probe plus `create_goal` und `get_goal` durch den ausgelieferten Loop- und Persistence-Stack, pinnt sein stream-json-Transcript und inspiziert die extern persistierte Goal-Änderung. Die Echo-Agent-Fixture wird bewusst nicht als Anwendungs-UX-Ersatz verwendet.

## Erwogene Alternativen

- **Auf Prompt-Instruktionen für Authority verlassen** — abgelehnt, weil Text Modellentscheidungen leiten, aber nicht den live Caller, Turn oder das Source-Event authentifizieren kann.
- **Jedes Goal-Service-Verb als eigenes Tool exponieren** — abgelehnt, weil eine kompakte Read/Create/Update-API Schema-Kosten senkt und Compare-and-Set-Verhalten einheitlich hält.
- **Exakte Command-Phrasen verlangen** — abgelehnt, weil natürlichsprachliche Absicht, einschließlich anderer Sprachen als Englisch, vom Modell interpretiert werden soll; Execution Authority hängt von einer direkten menschlichen Message im aktuellen Turn ab, nicht von der Schreibweise.
- **Aus persistierten Root- oder Fork-Metadaten autorisieren** — abgelehnt, weil ein Fork, der zu einer unabhängig fortgesetzten Top-Level-Session wird, neue menschliche Authority akzeptieren soll, ein aktuell besessenes Child aber nicht.
- **Autonomen Rounds Edit oder Resume des Goals erlauben** — abgelehnt, weil Fortsetzungs-Authority enger ist als die Authority, das menschliche Objective neu zu definieren oder zu starten.
- **Die Blocked-Schwelle als Evaluator behandeln** — abgelehnt, weil Event-Zahlen nicht beweisen können, dass ein Hindernis semantisch unverändert oder wirklich terminal ist.
- **Jedes vorhandene action-spezifische Feld ablehnen** — abgelehnt, weil Strict-Schema-Provider Nullwert-Platzhalter für jedes optionale Feld serialisieren können; nur bedeutsame Werte können eine konfligierende Action ausdrücken.

## Konsequenzen

- Modelle erhalten eine stabile, kompakte Lifecycle-API ohne direkten Zugriff auf den Goal-Service.
- Zustandsändernde Aufrufe erfordern einen live Runtime-Root-Agent und eine direkte menschliche Message im aktuellen Turn sowie durable Compare-and-Set-Referenzen.
- Menschliche Anfragen können Goals erzeugen und wiederhergestellte oder geblockte Goals über gewöhnliche natürliche Sprache rearmen; ein durable paused Goal erfordert den nutzerseitigen Resume-Pfad.
- Goal Rounds können abschließen oder einen wiederholten Blocker melden, aber ihr eigenes Mandat nicht erweitern.
- Die Deployment-Policy wählt die Blocking-Untergrenze; derselbe aufgelöste Wert steuert Durchsetzung und Prompt-Anleitung.
- Strict-Schema-Provider-Füller interoperieren, ohne bedeutsame Cross-Action-Updates zuzulassen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

- Die semantische Klassifikation eines substanziellen Goals, einer Fortsetzungsbitte, der Objective-Vollendung und derselben Blockierungsbedingung bleibt Modellentscheidung. Ein unabhängiger Evaluator oder ein Abschlusszertifikat ist zurückgestellt.
- Das Modell kann ein durable paused Goal nicht fortsetzen; dieser nutzergebundene Pfad wird durch die separate [User-owned-Goal-Pause-Entscheidung](../bug-fix/2026-09-03-user-owned-goal-pause-activation.de.md) durchgesetzt.
- Diese Tools mutieren Goal-Zustand, planen aber keine Goal Rounds, klassifizieren keine abnormalen Driver-Stopps und brechen keinen aktiven Turn ab; der Same-Session-Driver besitzt diese Verhalten.
- Goal-Round-Authority ist dormant, es sei denn, ein separat gemounteter Continuation-Driver lässt goal-sourced User-Turns zu; dieses Tool-Paket erzeugt diese Authority niemals selbst.
- Die menschliche Slash-Command-Discovery und das Rendering besitzt das separate Plugin [`dsh-command-goal`](../../../../packages/goal/command-goal/README.de.md).
- Ein Scope kann Tool-Registrierungen verbergen, während der unabhängig registrierte Prompt-Abschnitt sichtbar bleibt, sofern das Deployment nicht beide gemeinsam scopet.
