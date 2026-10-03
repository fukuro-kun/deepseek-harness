# Agent Note: Der approval seam — einmalige Berechtigungsentscheidungen über einen waterfall von Antwortgebern

Status: implemented

[English](2026-07-06-approval-seam.md) | [中文](2026-07-06-approval-seam.zh.md) | Deutsch

## Problem

Zwei Aufrufer brauchen eine geschlossene Entscheidung — „darf diese konkrete Aktion ausgeführt werden?": die `ask`-Entscheidung von `tools/pre-execute` (einschließlich `permissionDecision: ask` der Claude-Code-Hook-Bridge) und das einmalige Eskalations-Retry nach einer Ablehnung aus der [Sandbox-Agent-Note](2026-07-06-sandbox.de.md). Ein gemeinsamer seam erspart ihnen, jeweils eigene Ergebnisvokabulare, Channel-Routing, Abbruchlogik und Audit-Spuren zu erfinden, und garantiert zugleich, dass ein Deployment ohne Antwortgeber niemals eine nicht beantwortbare Anfrage genehmigen kann. Der Antwortgeber kann ein interaktiver Host oder ein automatisierter Controller sein.

Das Routingproblem ist Ownership: Eine Berechtigungsanfrage muss den Channel erreichen, der den anfragenden agent besitzt, für agents ohne Besitzer fail-closed verweigern und Deployments unberührt lassen, die keinen Antwortgeber komponieren.

## Entscheidung

Ein einziges Paket, `dsh-user-approval` (`packages/interaction/user-approval`), besitzt das Vokabular und den `ctx.approval`-Service — den Mechanismus. Die Policy — wer antwortet und ob eine Session überhaupt gefragt wird — liegt außerhalb: Antwortgeber sind `approval/request`-waterfall-Listener, die von channel-besitzenden Plugins registriert werden (die ACP-Bridge, Host-Adapter und Testskripte), und eine Policy-Ebene pro Session kann entscheiden, bevor ein Channel beteiligt ist. Consumers (`dsh-tools` ask-Routing und das Sandbox-Eskalations-Gate) lösen eine Frage zu einem geschlossenen Ergebnis auf und leiten daraus ihre eigenen Tool Results ab. Bewusst ein Paket, nicht die drei des capability seam (siehe Alternativen).

### Wie ein Deployment den seam nutzt

Ein einziger `cordis.yml`-Eintrag mountet den seam. Ihn nicht zu laden ist der fail-closed Opt-out: Consumers verweigern nicht beantwortbare Anfragen, ohne dass irgendwelcher approval-Code registriert ist.

```yaml
- id: approval
  name: '@deepseek-ai/dsh-user-approval'
  # config:
  #   policy: never   # deployment default for sessions without an override; 'ask' when omitted
```

Der Eintrag allein stellt Mechanismus bereit, keinen Channel: Ohne komponierten Antwortgeber löst jede Anfrage zu `unavailable` auf und der anfragende tool call verweigert — fail-closed braucht keine Konfiguration. Die Komposition der [ACP-Profile-App](../../../../packages/bundle/acp-app/README.de.md) schließt den Kreis: Ihre [automation-only Bridge](../simplification/2026-07-23-acp-automation-only-protocol.md) registriert einen Antwortgeber, der `session/request_permission` mit der exakten tool-call id und einmaligen allow/reject-Optionen an den besitzenden Client sendet. `policy: never` ist die unbeaufsichtigte Haltung — jede Anfrage wird deterministisch automatisch abgelehnt, und der aktuelle Wert geht in den Runtime-Context-Snapshot ein. `policy` wird beim Laden des Plugins gegen die geschlossene Liste validiert; alles andere wirft.

Was ein komponiertes Deployment beobachtet: `allowed-once` lässt genau diesen Aufruf weiterlaufen; Ablehnung, Abbruch und fehlender Channel verweigern mit drei unterscheidbaren Gründen, die das Modell auseinanderhalten kann; eine erfolgreiche In-Turn-Anfrage hinterlegt ein dauerhaftes `approval/asked`/`approval/decided`-Paar im Session-Log des anfragenden agent; an einer Genehmigung bleibt nichts über den anfragenden Aufruf hinaus bestehen. Eine Anfrage im Leerlauf oder ein fehlschlagender Audit-Append verweigert, statt eine nicht auditierte Entscheidung zurückzugeben.

Eine Anfrage unter dieser Komposition, aus dem aufgezeichneten `escalation-approved`-Szenario des Sandbox-Beispiels — das Modell beantragt eine Sandbox-Eskalation, das Gate fragt, und der Automationsclient wählt Allow once:

```
tool/call        bash {"command": "printf 'escalated\n' > escalated.txt && cat escalated.txt",
                       "sandbox_permissions": "workspace-write",
                       "justification": "the user asked to write escalated.txt in the workspace"}
approval/asked   {"toolName": "bash", "callId": "call_00_…",
                  "reason": "escalate sandbox to workspace-write: the user asked to write escalated.txt in the workspace"}
  → session/request_permission {"toolCall": {"toolCallId": "call_00_…"},
                  "options": [{"optionId": "allow-once", "name": "Allow once", "kind": "allow_once"},
                              {"optionId": "reject-once", "name": "Reject",     "kind": "reject_once"}]}
  ← the client selects "Allow once"
approval/decided {"outcome": "allowed-once"}
tool/result      "escalated" — this one call ran under the wider mode; the grant died with it
```

Das Zwillingsszenario `escalation-rejected` endet stattdessen mit `{"outcome": "rejected"}`: Nichts wird ausgeführt, und das Ergebnis des Modells trägt den wörtlichen fail-closed-Text des Anfragenden (`the user rejected escalating this command to "workspace-write"`). Ein `permissionDecision: ask` eines hook läuft über denselben Draht; nur der Anfragende und seine Verweigerungstexte unterscheiden sich (§ Ask-Routing in dsh-tools). Ohne Antwortgeber endet dieselbe Anfrage mit `unavailable`.

### Designdetails

#### Der seam: Trennung von Mechanismus und Policy

Nach Validierung und erfolgreichem `approval/asked`-Append löst der Service den `approval/request`-waterfall zu `allowed-once`, `rejected`, `cancelled` oder `unavailable` auf. Er übernimmt die schreibgeschützte Anfrage-Identität und das Signal, behandelt abort als `cancelled`, fängt Antwortgeber-Fehler und ungültige Rückgaben als `unavailable` auf, verwirft verspätete Antworten und hängt das gepaarte `approval/decided`-Event an. Audit-Fehler vor dem Commit verweigern; Observer-Fehler nach dem Append können ein autoritatives Event nicht rückgängig machen. `allowed-once` autorisiert nur die angefragte Aktion, und `request()` verweigert außerhalb eines offenen Turn, damit das Audit-Paar innerhalb der dauerhaften Commit-Grenze bleibt.

Antwortgeber sind `approval/request`-waterfall-Listener. Null Listener laufen durch zu `unavailable`; ein den agent erkennender Listener besetzt den first-wins-Entscheidungsslot, während ein nicht erkennender agent mit `next()` delegieren muss. Listener disposen mit ihren fibers, sodass ein entladener Channel fail-closed verhält. Da die Registrierungsreihenfolge von Geschwister-Plugins nicht deterministisch ist, komponiert ein Deployment genau einen terminalen Antwortgeber und reserviert `prepend` für decide-or-delegate-Gates.

`ApprovalRequest` trägt den anfragenden `agent`, `toolName`, optional die exakte `callId`, einen menschenlesbaren `reason` und optional ein `signal`. Es nutzt den `ToolCallId`-Brand, ohne `dsh-tools` zu importieren, das von diesem seam abhängt. Channel-Adapter korrelieren reicheren Aufrufzustand über `callId`; die approval-Anfrage dupliziert keine Tool-Argumente.

#### Ask-Routing in dsh-tools

`ToolRuntime.execute()` löst `ask` vor dem Dispatch auf: `allowed-once` fährt fort, während Ablehnung, Abbruch und fehlender Channel zu unterschiedlichen Verweigerungsgründen führen. Der opportunistische `ctx.get('approval')`-Konsum lässt einen fehlenden oder nicht gemounteten Service fail-closed ausfallen, ohne die Registry-fiber zu blockieren. Agent-lose Ausführung verhält sich ebenfalls fail-closed, weil sie weder eine Audit-Session noch einen Channel-Besitzer hat.

#### Die Policy-Ebene pro Session

Der seam besitzt außerdem die session-scoped `'ask' | 'never'`-Policy, die die [Sandbox-Agent-Note](2026-07-06-sandbox.de.md) beschreibt. Die effektive Policy wird aus protokollierten Umschaltungen über den Deployment-Default gefaltet. `'never'` löst in `request()` zu `rejected` auf, bevor irgendein Antwortgeber laufen kann; `'ask'` dispatcht und fällt ansonsten zu `unavailable` durch. Beide aktuellen Werte gehen vor jeder Modellanfrage in den atomaren Runtime-Context-Snapshot ein, sodass ein Policy-Wechsel keine separate Erläuterung braucht; jede approval-Anfrage zeichnet weiterhin das Audit-Paar auf.

#### Der ACP-Antwortgeber

Die ACP-Bridge antwortet nur für ein exaktes agent-Objekt, das ihre Session-Map besitzt. Sie sendet `session/request_permission` mit der vorhandenen `callId`, deklariert einmalige allow/reject-Optionen, bildet Abbruch separat ab und genehmigt niemals eine unbekannte Option. Fremde oder aufruflose Anfragen delegieren; ein fehlschlagender Client-RPC wird zu `unavailable`. Hooks und `tools/pre-execute` entscheiden, ob ein Aufruf überhaupt fragt. Dieser Channel ist Maschinen-Policy zwischen einem automatisierten Client und seinem agent, keine ACP-Präsentation.

Der Antwortgeber routet über die Exakt-agent-Ownership-Prüfung der Bridge, die die [automation-only ACP Agent Note](../simplification/2026-07-23-acp-automation-only-protocol.md) beschreibt, und wahrt die pro-Session-Berechtigungs-Ownership, die die [Multi-Session-Agent-Note](../../archived/feature/2026-06-14-acp-multi-session.md) verlangt.

#### Audit, und was das Modell sieht

`approval/asked` und `approval/decided` sind dauerhafte Log-only-Events; das Modell sieht nur das gewöhnliche tool result, das aus dem Ergebnis abgeleitet wird. Ein erfolgreicher Abschluss committet ein `decided` pro `asked`, einschließlich Abbruch und aufgefangener Antwortgeber-Fehler. Anfragen im Leerlauf hängen keines der Events an; ein Fehler vor dem Commit verweigert, während ein Fehlschlag des zweiten Appends ein bereits committetes `asked` ungepaart zurücklassen kann.

#### Entitäten und Abhängigkeiten

`dsh-user-approval` hängt von Cordis sowie den Session-, agent- und Branded-Call-Contracts ab; `dsh-tools` und `dsh-acp` konsumieren es. Der Sandbox-Executor bleibt unabhängig, weil `dsh-tool-bash` die Eskalationsanfragen besitzt. Der feste Dispatch-and-Audit-Service bleibt ein Paket; austauschbare Antwortgeber leben bei ihren Channel-Besitzern. Statische capability grants und child-seitige Berechtigungsantworten von `subagent-acp` bleiben getrennte Belange.

### Tests

Unit-Tests pinnen Ergebnisse, first-wins-Delegation, Fehler-Auffangen, Abbruch, scoped Routing, Audit-Paarung, die nicht umgehbare `'never'`-Policy, Tool-Verweigerungsgründe und ACP-Ownership/Ergebnis-Mapping über eine reale skriptgesteuerte Bridge.

Snapshots zeichnen erlaubte und abgelehnte Sandbox-Eskalation über `session/request_permission` auf sowie die vollständigen `'ask'`- und `'never'`-Beiträge zum Runtime Context. Nicht skriptierte Berechtigungsprompts brechen ab und verweigern fail-closed.

## Vertagt

- **`allow_always`-Grant-Speicher** — eine persistente Genehmigung einzulösen bedeutet, Speicher, Scope-Identität (Aufruf? Pfad? Präfix? Session? Zeitfenster?) und Widerruf zu entwerfen; bis dahin werden nur die einmaligen Optionen angeboten (die [Sandbox-Agent-Note](2026-07-06-sandbox.de.md) § Escalation hält die offene Scope-Frage fest).
- **Ein aufgezeichnetes hook-getriebenes `ask` durch einen komponierten Antwortgeber** — das Berechtigungs-Wire-Format ist über die Eskalationszweige des Sandbox-Beispiels aufgezeichnet. `hook-cc-pretool-ask` in der hook-Matrix pinnt die Fallback-Verweigerung ohne ApprovalService, während die Komposition aus hook-Produzent plus Antwortgeber auf der Unit-Ebene bleibt.
- **Routing der approvals eines Child-agent an die Parent-Session** — das Child von `subagent-acp` beantwortet seine eigenen Berechtigungsanfragen selbst; sie an den Parent-Controller zu delegieren ist ein eigenes Design.

## Erwogene Alternativen

- **Ein einzelner registrierter Provider statt waterfall-Listenern** — verworfen: eine `registerProvider()`-API zwingt jede Kompositionsfrage — Allowlist-Vorfilter, externe hook-Entscheider, skriptgesteuerte Testantworten, ein Policy-Gate vor einem Menschen — in eine einzige Provider-Implementierung. Der waterfall erhält Komposition, fail-closed-Abwesenheit und HMR-Disposal von Maschinerie, die die Runtime bereits hat; die JSDoc des seam pinnt stattdessen die Single-Decision-Slot-Konvention, statt eine Provider-Registry zu erfinden.
- **Ein Inline-`tools/pre-execute`-Berechtigungs-Gate in der ACP-Bridge** — verworfen: ein Prompt für jeden bridge-besessenen Aufruf würde die Frage-Policy in den Transport hartcodieren, könnte keinen zweiten Anfragenden bedienen (Sandbox-Eskalation passiert nach Ausführungsbeginn, ohne pre-execute-Moment) und ließe hook-erzeugte `ask`-Entscheidungen ohne gemeinsamen Mechanismus.
- **Der generische user-questions seam (`ctx.userQuestions`)** — verworfen als approval-Mechanismus: beide teilen ein Gerüst (nach agent routen, auf einen Menschen blockieren, Abwesenheit behandeln), aber der approval-Contract ist in jeder relevanten Dimension enger: ein geschlossenes Ergebnisvokabular statt Freitext, ein protokollnativer Prompt an einem tool call statt eines generischen Formulars, obligatorisches fail-closed bei Abwesenheit und Audit-Events. Approval läuft daher nicht über den ausgelieferten `packages/interaction/user-questions`-/`ask_user_question`-Elicitation-Pfad — ein Elicitation-Formular ist kein Berechtigungs-Prompt und eine Freitextantwort kein geschlossenes Ergebnis; gemeinsame Provider-Verrohrung bleibt offen, falls beide je konvergieren.
- **Statische optionale Injection in `dsh-tools`** — verworfen: der vendorte cordis `Inject`-Typ hat kein optional-Flag — die Objektform bildet Servicenamen auf Intercept-Config ab, und ein deklariertes inject blockiert die fiber. `ctx.get('approval')` ist das dokumentierte opportunistische Konsummuster (die owner-token-Suche in `tool-bash`, die Persistenz-Probe des loop), liest Präsenz pro Aufruf und degradiert korrekt über HMR ohne zusätzliche Maschinerie.
- **Die Drei-Pakete-Aufteilung des capability seam** — verworfen: Service Definition / Service Provider / Consumer passt zu einem seam, dessen Service Provider austauschbar ist (bash-local vs. bash-sandbox). Hier ist der Service-Body fester Mechanismus und der variable Teil Listener, die bei ihren Besitzern leben — eine Aufteilung würde ein Service-Provider-Paket ohne Inhalt erzeugen („nicht vorsorglich splitten").
- **`allow_always` jetzt anbieten** — verworfen: das Protokoll kann es ausdrücken, aber es einzulösen bedeutet Grant-Speicher, Scope-Identität und Widerruf zu entwerfen (§ Vertagt). Eine Option anzubieten, die der harness nicht einlösen kann, erzeugt zum Scheitern verurteilte Grants.

## Konsequenzen

Der implementierte Contract wird durch die Suites in „Tests" gepinnt:

- `allowed-once` dispatcht eine Aktion; jedes andere Ergebnis verweigert mit einem eigenen Grund, und `'never'` verweigert vor dem Prompt.
- Fehlende, fremde, agent-lose, werfende, ungültige und abgetrennte Antwortpfade verweigern fail-closed.
- Erfolgreiche Anfragen routen nach exakter agent-Ownership und hängen ein replaybares, für das Modell unsichtbares Audit-Paar an; Anfragen im Leerlauf und Fehler vor dem Commit verweigern.
- ACP-Ownership hält Entscheidungen innerhalb ihrer Session, während ein Deployment ohne den Service weder Anfrage- noch Audit-Events emittiert.

Kosten und akzeptierte Grenzen:

- **Zwei eifrig entscheidende Antwortgeber konkurrieren um den Slot.** Die Listener-Reihenfolge von Geschwister-Plugins ist nicht deterministisch, also kann der seam konkurrierende terminale Antwortgeber nicht schlichten — gemildert durch Konvention (ein terminaler Antwortgeber pro Deployment; `prepend` nur für decide-or-delegate-Gates), statt durch einen Prioritätsmechanismus, den der Event-Bus nicht hat.
- **Die produktive Bewährung ruht auf einer Komposition.** `ask` hat zwei Produzenten-Familien — die hook-Bridges über `tools/pre-execute` und die Sandbox-Eskalation über ihr eigenes Gate — mit dem Wire-Format in der Snapshot-Suite des Sandbox-Beispiels aufgezeichnet; die reale Abdeckung des seam ist also diese eine Komposition, bis weitere Deployments ihn komponieren.
- **Ownership ist am `Agent`-Objekt-Identity-Schlüssel.** Der Antwortgeber löst den Session-Map-Eintrag bei `agent.session.id` auf und verlangt dann, dass dieser Eintrag das exakte agent-Objekt besitzt; alle aktuellen Pfade reichen dasselbe Objekt durch den loop und die seams, aber eine künftige Grenze, die agents klont oder proxyt, würde die Bridge delegieren und fail-closed ausfallen lassen und bräuchte einen anderen Ownership-Contract.

## FAQ

- **Was passiert in einem Deployment ganz ohne Antwortgeber (headless, CI)?** Jede Anfrage läuft durch den leeren waterfall zu `unavailable`, und der tool call verweigert mit dem Grund „no approval channel is available". Fail-closed ist der Null-Listener-Default, keine Konfiguration.
- **Kann ein Grant persistieren — „das immer erlauben"?** Nein. `allowed-once` autorisiert die einzelne angefragte Aktion, und der Service speichert nichts zwischen Anfragen; `allow_always` wird bewusst nicht angeboten, bis der Grant-Speicher entworfen ist (§ Vertagt).
- **Was sieht das Modell von einem approval?** Nur das tool result, das der Anfragende aus dem Ergebnis ableitet — das Audit-Paar erreicht den transcript nie. Die drei Nicht-Grant-Gründe sind unterscheidbar, sodass das Modell ein menschliches „Nein" von einem abgebrochenen Prompt und einem fehlenden Channel unterscheiden kann.
- **Wer entscheidet, ob ein Aufruf überhaupt fragt?** Policy-Produzenten: ein hook, der `permissionDecision: ask` zurückgibt, ein beliebiger `tools/pre-execute`-Listener oder das Sandbox-Eskalations-Gate. Der seam und die Bridge routen und antworten nur; keiner injiziert eine eigene Einschätzung, was einen Prompt verdient.
- **Was passiert, wenn der Nutzer den Prompt schließt oder der Turn mitten in der Anfrage abbricht?** Schließen wird zu `cancelled` mit eigenem Verweigerungstext. Ein bereits abgebrochenes Signal endet mit `cancelled`, ohne zu dispatchen; ein Abbruch während der Anfrage verwirft die verspätete Antwort. Committen beide Audit-Appends, zeichnet jeder Pfad genau ein Paar auf, nie zwei.
- **Was, wenn der Client mit einer Option antwortet, die der harness nie angeboten hat?** Jede Auswahl außer dem angebotenen `allow_once` wird zu `rejected` — eine unbekannte optionId eines nicht-konformen Clients kann niemals genehmigen.
- **Wie routen approvals von subagents?** Gar nicht: Delegation pinnt jedes in-process-Child auf `'never'` ([approvals-pinned-Entscheidung](2026-08-10-subagent-approval-pinned-never.md)), sodass jede Child-Anfrage vor jedem Antwortgeber zu `rejected` auflöst und das Child von vornherein über seinen Runtime Context Bescheid weiß. Die child-seitige Auto-Antwort von `subagent-acp` ist separat; das Routing der Anfragen eines Child an den Parent-Controller ist vertagt (§ Vertagt).
- **Was ändert `policy: 'never'` zur Laufzeit konkret?** Der Service löst jede Anfrage dieser Session zu `rejected` auf, bevor irgendein Antwortgeber dispatcht (in-service, sodass keine Registrierungsreihenfolge ihn umgehen kann); der nächste atomare Runtime-Context-Snapshot nennt die Policy; jede erfolgreiche Auto-Ablehnung zeichnet das Audit-Paar auf.
- **Was passiert bei einem Hot Reload oder wenn ein Antwortgeber mitten in der Session entlädt?** Antwortgeber disposen mit ihrer besitzenden fiber, sodass die nächste Anfrage zu `unavailable` degradiert statt an einem toten Channel zu hängen; ein Remount registriert den Antwortgeber neu, ohne aufzuholenden Zustand.
- **Woher bekommt ein Client approval-Kontext?** Die Anfrage trägt die exakte `callId` und den menschenlesbaren `reason` des Anfragenden; Channel-Adapter können reicheren tool-call-Zustand korrelieren, ohne Argumente im approval seam zu duplizieren.

## Vorläufer

Repo-interne Präzedenzfälle, die dieses Design kopiert oder kontrastiert:

- Das `fs/write-intent`-Gate (`packages/fs/fs/`) — die dokumentierten Single-Occupancy-Decision-Slot-waterfall-Semantiken (erste Antwort gewinnt, Delegation via `next()`), die der Antwortgeber-Contract wiederverwendet.
- `hook/invoked`/`hook/result` — das Log-only-Audit-Paar-Präzedens, dem `approval/asked`/`approval/decided` folgt; die [hook-Bridges-Agent-Note](../../archived/feature/2026-06-30-hook-bridges.md) liefert `permissionDecision: ask`, den ersten Produzenten.
- [Die interception-extension-points-Agent-Note](2026-06-30-interception-extension-points.md) — das `allow`/`deny`/`ask`-Vokabular von `tools/pre-execute`, dessen `ask` dieser seam bedient.
- [Die automation-only-ACP-Agent-Note](../simplification/2026-07-23-acp-automation-only-protocol.md) — die Exakt-agent-Ownership-Prüfung gegen die Session-Map, über die der Antwortgeber routet; [die Multi-Session-Agent-Note](../../archived/feature/2026-06-14-acp-multi-session.md) — der Pro-Session-Berechtigungs-Ownership-Blocker, den dies implementiert.
- Das opportunistische `ctx.get()`-Konsummuster (die owner-token-Suche von `tool-bash`, die Persistenz-Probe des loop) — wie `dsh-tools` den seam konsumiert, ohne seine fiber daran zu blockieren.
