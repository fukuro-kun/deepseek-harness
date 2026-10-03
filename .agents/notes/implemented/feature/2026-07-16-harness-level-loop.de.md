# Agent Note: Zielbasierte Ausführung auf Harness-Ebene
[English](2026-07-16-harness-level-loop.md) | [中文](2026-07-16-harness-level-loop.zh.md) | Deutsch

Status: implemented


## Problem

Der konkrete agent loop besitzt genau einen Turn: Er leert die zugelassene Eingabe, führt einen oder mehrere Modell- und Tool-Schritte aus und stoppt dann. Umfangreichere Ziele benötigen häufig eine äußere Policy, die einen weiteren Turn beginnen, den Fortschritt bewahren, bei Erreichen eines Budgets stoppen und für Menschen nachvollziehbar bleiben kann. Ein zeitgesteuerter Prompt, eine Fortsetzung in derselben Session und ein Ralph-Versuch mit frischem Agent wiederholen alle Arbeit, teilen aber weder denselben Zustand noch dieselbe Autorität, dasselbe Gedächtnis oder denselben Lebenszyklus.

Jede wiederholte Aktion als generischen „Loop“ zu behandeln, verschleiert diese Unterschiede. Arbeit in derselben Session muss das menschliche Ziel im bestehenden Transcript persistieren und dabei den Konversationskontext bewahren. Ralph-Arbeit muss den Konversationskontext bewusst verwerfen und stattdessen den Workspace plus eine begrenzte Übergabe nutzen. Der für Menschen sichtbare Status darf nicht suggerieren, dass das erneute Öffnen einer Session stillschweigend weitere Arbeit autorisiert. Auch Abschluss- und Blocker-Meldungen brauchen eine explizite Vertrauensgrenze, statt in eine Scheduler-Abstraktion hineingeschmuggelt zu werden.

Das Repository benötigt daher zielbasierte Ausführung oberhalb des Turn-/Schritt-Loops, aber keinen spekulativen universellen Loop-Service, der Persistenz, Auswertung, Budgetierung, Scheduling, Übergabe, Hintergrundjobs und UI kombiniert.

## Entscheidung

Zwei explizite Plugin-Policies über bestehenden seams:

1. **Ziele in derselben Session** bewahren ein dauerhaftes Ziel in der aktuellen Session und lassen zielattribuierte Fortsetzungs-Turns nur zu, solange die Live-Aktivierung scharf geschaltet ist.
2. **Ralph-Runs mit frischem Agent** führen einen festen Vordergrund-Workflow aus, dessen Rounds jeweils einen neuen strukturierten Subagent ohne Konversations-Seed spawnen.

Es gibt keine `packages/loop/`-Familie, keinen `LoopDriver`, keine `LoopId`, keine universelle `StopCondition` und kein modellseitiges generisches `loop`-Tool. Die beiden Policies nutzen die üblichen agent-, Session-, Tool-, Workflow-, Subagent- und UI-Erweiterungspunkte des Repositorys, geben aber nicht vor, dass ein einziger Lebenszyklus für beide passt.

### Vokabular und Policy-Grenze

Die Session-Hierarchie lautet **Goal → Goal Round → Turn → Step**. Eine Goal Round ist ein für das aktuelle Ziel zugelassener Fortsetzungszyklus, der als ein zielgesteuerter Turn materialisiert wird. Menschliche oder fachfremde Turns in derselben Session verbrauchen das Goal-Round-Limit nicht, und ein Turn kann weiterhin mehrere Modell-/Tool-Schritte enthalten.

Die Fresh-Agent-Hierarchie lautet **Ralph Run → Ralph Round → Turn eines frischen Subagent → Step**. Eine Ralph Round erzeugt eine Subagent-Session. Das Eltern-Transcript und frühere Subagent-Transcripts sind kein Seed-Kontext; der geteilte Workspace und ein begrenzter strukturierter Report tragen den rundenübergreifenden Zustand.

„Round“ ist damit eine Iteration der äußeren Policy, kein Synonym für jeden Session-Turn. Der konkrete `dsh-agent-loop` bleibt die Turn-/Schritt-Engine. Der Session-Treiber nutzt öffentliche agent- und Session-Events; seine einzige Kern-Erweiterung ist die generische Observe-before-cancel-Benachrichtigung `agent/cancel-requested`, die jede Lebenszyklus-Policy benötigt, die eine Cancellation sicher abwickeln muss.

Zeitbasierte `/loop`- oder geplante Ausführung ist eine dritte Policy und wird durch diese Entscheidung nicht implementiert. Sie gehört zu einem Scheduler, nicht zu einer der beiden Ziel-Familien.

### Paket-Topologie und zuständige Verben

| Paket | Repository-Kategorie | Zuständige Strukturen und Verben |
|---|---|---|
| `@deepseek-ai/dsh-goal` | `packages/goal/goal/`, Domain-Service | Besitzt `GoalId`, Compare-and-set-`GoalRef`, `GoalSnapshot`, die vierzuständige `GoalPhase`, strukturierten `GoalBlockReason`, prozesslokale `GoalActivation`, Replay-Folding sowie die Verben `get`, `create`, `edit`, `pause`, `resume`, `complete`, `block`, `clear` und `disarm`. |
| `@deepseek-ai/dsh-tool-goal` | `packages/goal/tool-goal/`, modellseitiger Consumer | Registriert die exklusiven `get_goal`, `create_goal` und `update_goal`; erfordert eine direkte menschliche Nachricht in einem laufenden Root-Agent-Turn und begrenzt die Autorität autonomer Rounds auf Abschluss- oder Blocker-Reports mit maschinell routbaren Reason-Codes. |
| `@deepseek-ai/dsh-goal-round-driver` | `packages/goal/goal-round-driver/`, Fortsetzungs-Policy | Reserviert, zäunt ein, lässt zu, attribuiert, rechnet ab, bricht ab und leert Goal Rounds derselben Session bis zur vollständigen Ruhe, ohne den konkreten Loop zu importieren. |
| `@deepseek-ai/dsh-commands` | `packages/interaction/commands/`, UI-Registry | Besitzt `CommandDefinition`, Discovery, bereichsbezogene Registrierung, direkten Dispatch, `CommandResult` und Request-Cancellation für rein menschliche Kommandos. |
| `@deepseek-ai/dsh-command-goal` | `packages/goal/command-goal/`, Produzent menschlicher Kommandos | Registriert `/goal`-Status, -Erstellung, -Bearbeitung, -Pause, -Fortsetzung und -Löschung über die Ziel-Domain für die TUI. |
| `@deepseek-ai/dsh-tool-ralph` | `packages/workflow/tool-ralph/`, Consumer eines festen Workflows | Registriert `ralph({ objective, maxRounds? })`, validiert den frischen strukturierten Provider und den begrenzten `RalphRoundReport` und gibt `complete`, `blocked` oder `budget-limited` zurück. |

Die detaillierten Verträge stehen in den Agent Notes [Ziel-Domain](2026-07-19-persisted-same-session-goal-domain.de.md), [zieleigene Events](../architecture/2026-07-31-goal-owned-durable-events.de.md), [modellseitige Goal-Tools](2026-07-19-model-facing-goal-tools.de.md), [Goal-Round-Treiber](../../archived/feature/2026-07-19-same-session-goal-round-driver.md), [Kommando-Registry](2026-07-19-plugin-command-registration.de.md), [menschliches Ziel-Kommando](../../archived/feature/2026-07-19-human-goal-command.md) und [Ralph-Workflow-Tool](../../archived/feature/2026-07-19-fresh-agent-ralph-workflow-tool.md).

### Dauerhafter Zielzustand und Live-Autorität

Eine Session hat höchstens ein aktuelles Ziel. Jede Mutation wird über ein dauerhaftes `goal/change`-Event committed, das einen vollständigen versionierten Snapshot oder einen revisionierten Clear-Tombstone trägt; Inbox-Zustand ist nicht beteiligt. Das Session-Log ist die einzige dauerhafte source of truth, daher tragen normale Persistenz, Resume und `SessionStore.fork()` das Ziel ohne eine zweite Datenbank oder einen künstlichen Cancellation-Datensatz.

Dauerhafte Phasen sind nur `active`, `paused`, `blocked` und `complete`. Ein blockiertes Ziel trägt einen obligatorischen `GoalBlockReason` mit einem stabilen Lower-Kebab-Case-`code` und einer nicht leeren menschenlesbaren `message`; Nutzungslimits, Rundenerschöpfung, Modellfehler und Policy-Ablehnung sind Reason-Codes, keine zusätzlichen Lebenszyklusphasen. Die separate Aktivierung ist `armed` oder `disarmed` und wird nie persistiert. Erstellung und explizites Resume schalten ein Ziel scharf; Stop-Transitionen, Session-Start, fork-Replay, Treiberwechsel und Treiber-Teardown lassen es disarmed.

Diese Trennung macht die Session-Wiederherstellung beobachtbar und vorhersehbar. Das erneute Öffnen einer Session startet niemals von sich aus Zielarbeit. Ein späterer menschlicher Prompt wie „weiter“, „Ziel fortsetzen“ oder eine gleichwertige Anfrage in beliebiger Sprache gibt dem Modell an der Runtime-Wurzel einen neuen Turn, in dem es ein aktives, aber disarmed Ziel lesen und `update_goal(..., action: 'resume')` aufrufen kann. Ein dauerhaft pausiertes Ziel wird über `/goal resume`, das Web-Steuerelement oder einen anderen direkten Aufrufer des Ziel-Service fortgesetzt; das Modell-Tool lehnt es gemäß der [vom Nutzer getragenen Pause-Entscheidung](../bug-fix/2026-09-03-user-owned-goal-pause-activation.de.md) ab. Die Runtime authentifiziert, dass die Anfrage aus einem laufenden direkten menschlichen Turn stammt; die Prompt-Policy lässt das Modell beurteilen, ob der Wortlaut semantisch Erstellung oder Fortsetzung autorisiert.

Geforkte Sessions erben das dauerhafte Ziel-Präfix, weil das das natürliche Replay-Ergebnis ist. Der fork startet disarmed, daher impliziert Vererbung keine Ausführungsautorität, und es wird kein synthetischer Ziel-Abbruch in die Historie eingefügt.

`defaultMaxGoalRounds` ist konfigurierbar und beträgt standardmäßig `256`. Das Limit zählt nur zugelassene Goal Rounds. `blockedAfterConsecutiveRounds` ist in der Modell-Tool-Policy separat konfigurierbar und beträgt standardmäßig `3`; es ist eine mechanische Untergrenze, bevor eine autonome Round einen wiederholten Blocker melden darf, kein Evaluator semantischer Gleichheit.

### Fortsetzung in derselben Session

Der Goal-Round-Treiber besitzt pro exaktem Live-Agent höchstens eine ausstehende Reservierung. Er lässt eine Reservierung nur zu, wenn das Ziel aktiv und scharf geschaltet ist, der Agent idle ist, keine konkurrierende menschliche Arbeit existiert, die letzte Mutation ihren Durability-Checkpoint passiert hat, die exakte Ziel-ID/Revision/Round noch übereinstimmt und die nachgelagerte Pre-Step-Policy akzeptiert. Sein `agent/pre-step`-Zaun prüft diese Fakten sowohl vor als auch nach nachgelagerten Listenern und verhindert, dass eine Edit-, Pause-, Human-Message- oder Unload-Race-Condition veraltete Arbeit zulässt.

Nur ein zugelassener, zielgesteuerter `user/message` mit positiver Round belastet eine Round. Eine veraltete Reservierung schließt einen blockierten Turn ohne Schritte ab, ohne das Limit zu verbrauchen. Eine konkurrierende Ziel-Revision gewinnt gegenüber der Abrechnung einer älteren Round.

Nach normalem Turn-Abschluss wird nur dann eine weitere Round geplant, solange das Ziel aktiv, scharf geschaltet und unter seinem Limit bleibt. Cancellation pausiert. Rate-Limiting oder Quota-Erschöpfung blockiert mit dem Code `usage-limited`; Limit-Erschöpfung blockiert mit `round-limit`; Queue-Fehler verwenden `queue-failed`; Turn-Fehler, Max-Token-Stopps, Policy-Ablehnung und unbekannte terminale Ergebnisse verwenden ihre jeweiligen Blocker-Codes. Ein unabhängig komponiertes Request-Recovery-Plugin darf transiente Provider-Fehler innerhalb desselben Turns erneut versuchen; der Ziel-Treiber erfindet nach einem abnormalen terminalen Ergebnis nie eine weitere Round. Ein Mensch kann später über `/goal resume` oder das Web-Steuerelement fortsetzen; ein blockiertes Ziel bleibt außerdem für modellseitiges `update_goal resume` berechtigt, ein dauerhaft pausiertes nicht.

### Mensch- und Modell-Interaktionen

Die menschliche UX folgt der kompakten Codex-Form im [öffentlichen OpenAI-Codex-TUI-Dispatcher bei Commit `678157a`](https://github.com/openai/codex/blob/678157acaa819d5510adfe359abb5d0392cfe461/codex-rs/tui/src/chatwidget/slash_dispatch.rs#L750-L805): `/goal` zeigt den Status, `/goal <objective>` erstellt, und `edit`, `pause`, `resume` oder `clear` führen direkte Lebenszyklusaktionen aus. Der Commit-Permalink hält die recherchierte Grammatik verifizierbar, während Codex weiterentwickelt wird. Der Status umfasst die dauerhafte Phase, zugelassene/maximale Rounds und die Live-Aktivierung armed/disarmed. Direkter Status und Kommandoausgabe gelangen nicht in die Modellhistorie; akzeptierte Domain-Mutationen bleiben rekonstruierbar, weil der Ziel-Service sie aufzeichnet.

Das Modell erhält nur `get_goal`, `create_goal` und `update_goal`. Es darf ein Ziel erstellen, wenn eine direkte menschliche Anfrage eindeutig umfangreiche Arbeit über mehrere Rounds verlangt, und es darf diese Absicht in jeder Sprache ableiten. Es darf Routinearbeit in einem einzigen Turn nicht in ein Ziel verwandeln. Der Code erfordert eine direkte menschliche Nachricht im aktuellen laufenden Root-Agent-Turn; die semantische Interpretation bleibt Modellurteil. Eine autonome Goal Round darf `complete` oder `blocked` für die exakt aktuelle Goal Round melden, kann aber das menschliche Ziel nicht bearbeiten, pausieren, fortsetzen oder ersetzen.

Auf base beruhende Profile mounten standardmäßig die gemeinsame Kommando-Registry und den vollständigen Ziel-Stack und exponieren `/goal` über einen Produzenten. ACP mountet die Ziel-Domain, die Modell-Tools und den Session-Treiber, lässt aber bewusst die menschliche Kommandoebene weg. Jedes wirksam registrierte Kommando ist über jeden komponierten Kommando-Adapter auffindbar und aufrufbar; ein Plugin, das mit einer Anwendung inkompatibel ist, lässt seinen Kommando-Produzenten aus dieser Komposition weg, statt sich auf Masken auf Registry-Ebene zu verlassen. Der eigenständige `sdk-minimal`-Baum lässt den kompletten Ziel-Stack weg, damit Einmal-Aufrufer nicht stillschweigend zu Mehr-Round-Operationen werden. Headless-CLI- und JSON-RPC-Einstiegspunkte konsumieren die Kommandoebene nicht; gewöhnlicher menschlicher Text kann Modell-Ziel-Tools dennoch autorisieren, wenn dieser Stack komponiert ist.

### Ralph-Ausführung mit frischem Agent

Ralph ist ein erstklassiges Modell-Tool in einem eigenen Plugin und zeigt, dass eine anspruchsvolle feste Ausführungs-Policy ohne neuen Loop-Kern komponiert werden kann. Das Plugin besitzt ein festes Workflow-Skript über `ctx.workflowEngine` und `ctx.subagents`; es erstellt keinen Session-Zielzustand und fügt `dsh-agent-loop` keinen Zweig hinzu.

Jede Round verwendet einen expliziten `WorkflowStartRequest.subagentProvider`, standardmäßig `spawn`. Der Provider muss existieren, strukturierte Ausgabe unterstützen und deklarieren, dass er keinen Elternkontext erbt. Ralph übergibt außerdem sein aufgelöstes Round-Limit als `WorkflowStartRequest.maxTotalAgents`; die Worker-Engine validiert beide Run-Policies, bevor sie Arbeit veröffentlicht, sodass eine Provider-Fehlkonfiguration oder eine Engine-Obergrenze unterhalb des angeforderten Ralph-Umfangs schon vor Existenz eines Runs fehlschlägt. Der Subagent erbt cwd und Abstammung, erhält aber nur das unveränderliche Ziel, Round/Limit, die Workspace-als-Autorität-Anweisung und den vorherigen normalisierten Report.

Ein Report enthält Status, Zusammenfassung, Belege, nächste Schritte und Blocker-Text. Statusspezifische Invarianten und die serialisierte Größe werden im festen Skript und erneut an der Consumer-Grenze validiert. `maxRounds` ist konfigurierbar, beträgt standardmäßig `256` und ist die Obergrenze für eine Aufruf-Überschreibung. `maxHandoffChars` beträgt standardmäßig `16384`; übergroße Reports schlagen fehl, statt stillschweigend gekürzt zu werden. `maxResultChars` beträgt separat standardmäßig `16384` und begrenzt den vollständigen erfolgreichen elternseitigen Text einschließlich seiner Hülle und seines Kürzungsmarkers.

Ein gewöhnlicher Subagent-Fehler beendet den Run ohne Wiederholung. Das feste Skript meldet die fehlgeschlagene Round und die letzte erfolgreiche Übergabe, sofern eine existiert, und das Tool gibt diesen Zustand als Fehler zurück, statt ihn fälschlich als fehlerhaften Report oder Budgeterschöpfung einzuordnen. Fatale Workflow-Infrastrukturfehler können sich abrechnen, bevor das Skript diesen Zustand zurückgibt; reichhaltigerer Reason-Transport und Retry-Policy bleiben zurückgestellt.

Das Tool läuft im Vordergrund und prozesslokal. Der Eltern-Tool-Aufruf wartet auf das terminale Ergebnis, propagiert Cancellation in die Worker-Engine und wartet auf `run.dispose()`, sodass die Subagent-Arbeit vor der Rückkehr vollständig zur Ruhe gekommen ist. Das Modell sieht einen Aufruf und ein begrenztes erfolgreiches terminales Ergebnis oder einen Fehler; Abschluss- und Blocker-Hüllen sagen explizit, dass ein Worker das Ergebnis gemeldet hat, statt es als unabhängige Bestätigung darzustellen. Zwischenzeitliche Subagent-Konversationen bleiben außerhalb des Eltern-Transcripts.

### Externe Designlinien

Codex liefert die hier verwendete minimal beobachtbare Ziel-UX: ein persistentes, an den Chat gebundenes Ziel mit Kontrollen zum Setzen, Anzeigen, Bearbeiten, Pausieren, Fortsetzen und Löschen. Diese Implementierung übernimmt diese Auffindbarkeit, nutzt aber den event-sourced Ziel-Datensatz, die Plugin-Scopes und die Runtime-Autoritätsprüfungen dieses Repositorys.

Die aktuellen [Claude-Code-Ziele](https://code.claude.com/docs/en/goal) bestätigen die Unterscheidung zwischen einem Ziel, das nach dem vorherigen Turn einen weiteren Turn startet, und einem zeitgesteuerten `/loop`. Claude Code verwendet außerdem nach jedem Turn einen separaten Kleinstmodell-Evaluator. Diese Implementierung übernimmt die Policy-Unterscheidung, kopiert diesen Evaluator aber bewusst nicht: Evaluator-Eingaben, Tool-Zugriff, deterministische Prüfungen, Provider-Wahl, Isolation und Autorität benötigen einen separat entworfenen Plugin-Vertrag statt einer impliziten Selbstzertifizierungsschicht.

Externe Produkte sind Vergleichsmaßstäbe, keine Kompatibilitätsziele. Die lokalen Quellstudien prägten die Grenzen, während die ausgelieferten Schnittstellen den Regeln dieses Repositorys folgen: „alles ist ein Plugin“, modellsichtbar heißt protokolliert, explizite Default-Auflösung und Teardown erst bei vollständiger Ruhe.

### Verifikation

Die sechs zuständigen Agent Notes dokumentieren Unit-, Integrations-, Prozess-, Snapshot-, Cancellation-, Replay- und Built-Runtime-Abdeckung. Der Stack prüft striktes Ziel-Datensatz-Folding, Compare-and-set-Races, Session-fork-Vererbung, disarmed-Wiederherstellung, Autorität direkter menschlicher Sprache, konfigurierbare Limits und Blocker-Schwellen, exakte Goal-Round-Attribution, adapterweite Kommando-Discovery und Transcript-Isolation. Ausgelieferte schlüssellose Snapshots decken Modell-Zielerstellung/-inspektion über die Headless-App, den Mehr-Round-Lebenszyklus und Cancellation in derselben Session über ACP sowie zwei echte Ralph Rounds über die Headless-App ab; fokussierte Kommandotests fixieren den direkten `/goal`-Status ohne Modell-Turn. Der Ralph-Snapshot bootet die Worker-Thread-Engine, den spawn-Provider, die Structured-Output-Runtime und den agent loop und inspiziert anschließend distinkte ungeseedete Subagent-Logs und die exakte einseitige begrenzte Übergabe, während er den Eltern-Stream fixiert. Fokussierte Real-Stack-Tests decken zusätzlich Abschluss-, Blocker- und Round-Limit-Ergebnisse, fehlerhafte und übergroße Reports, gewöhnliche Subagent-Fehler mit letzter gültiger Übergabe, ein einzelnes Phasen-Event und Cancellation bis zur Subagent-Ruhe ab. Paketquellen bleiben unter der dateiweisen 100%-Coverage-Gate des Repositorys, und Built-Binary-Tests decken die Auflösung installierter Artefakte ab. Die Implementierungserfahrung ist in der Root-Testpolicy festgehalten: Jede nicht triviale modell- oder menschensichtbare Änderung muss im selben PR einen schlüssellosen Real-Beispiel-Snapshot mitführen, statt sich auf rein paket- oder mock-basierte fixture-Abdeckung zu verlassen.

## Erwogene Alternativen

- **Die ursprüngliche universelle Loop-Fähigkeit implementieren** — abgelehnt, weil `Evaluator`, `BudgetPolicy`, `RoundHandoff`, `GoalReflector`, Hintergrundjob-Besitz, Persistenz und Scheduling keine kohärente obligatorische Abstraktion bilden. Alle vor ihren ersten konkreten Consumern zu bauen, würde eine breite spekulative Oberfläche schaffen und bestehende Session-, Workflow-, Subagent- und Task-Machinerie duplizieren.
- **Nur Session-Ziele implementieren** — abgelehnt, weil Iteration mit frischem Kontext materiell anders ist und eine wertvolle Demonstration der Plugin-Architektur darstellt. Ralph gehört als Consumer eines festen Workflows mit explizitem Kontext-Reset dazu.
- **Ralph in den Goal-Round-Treiber stecken** — abgelehnt, weil Session-Ziele bewusst eine Konversation bewahren, während Ralph sie bewusst entfernt. Eine Kombination würde Aktivierung, Replay, Übergabe und UI-Zustand mehrdeutig machen.
- **Einen fork als frischen Ralph-Subagent behandeln** — abgelehnt, weil ein fork ein Konversationspräfix trägt. Frische Subagents plus Workspace-Zustand und ein expliziter Report lassen sich leichter begrenzen und replayen, ganz ohne synthetischen Cancel-Datensatz.
- **Den Claude-Code-Evaluator in die erste Ziel-Implementierung kopieren** — abgelehnt, weil ein rein transcript-basierter Modell-Evaluator eine nützliche Policy ist, aber kein allgemein vertrauenswürdiges Abschlusszertifikat. Deterministische Auswertung und Isolation müssen möglich bleiben, daher wird der Evaluator zurückgestellt, bis sein Autoritäts- und Provider-Vertrag entworfen ist.
- **Nach Session-Wiederherstellung automatisch fortsetzen** — abgelehnt, weil das Öffnen einer Session Beobachtung ist, keine Autorität zum Ressourcenverbrauch. Der dauerhafte Zustand wird wiederhergestellt, während die Aktivierung auf einen neuen menschlichen Prompt wartet.
- **`/goal` über das Modell routen** — abgelehnt, weil Status und explizite Lebenszykluskontrollen deterministische, token-freie UI-Aktionen sein sollen; gewöhnliche natürlichsprachliche Prompts bleiben der semantische Modellpfad.
- **Den konkreten agent loop um Ziel- oder Ralph-Modi erweitern** — abgelehnt, weil die öffentlichen Queue-, Prompt-, Session-, Cancellation-, Workflow- und Subagent-seams beide Policies bereits unterstützen. Die generische Cancel-Requested-Beobachtung ist die einzige Kern-Koordinationserweiterung.

## Konsequenzen

- Zielbasierte Ausführung wird ohne ein überladenes „Loop“-Objekt ausgeliefert: Fortsetzung in derselben Session und Fresh-Agent-Iteration haben explizite, separat testbare Verträge.
- Die dauerhafte Zielhistorie ist replay- und forkbar, während prozesslokale Aktivierung versehentliche Arbeit beim Resume verhindert.
- Menschen erhalten eine kleine Codex-förmige UX; Modelle erhalten einen kompakten Tool-Satz, dessen mutierende Aufrufe eine direkte menschliche Nachricht im aktuellen laufenden Root-Agent-Turn erfordern; Deployments können beide unabhängig entfernen.
- Ralph demonstriert eine nicht triviale feste Policy vollständig als Plugin über bestehenden Workflow- und Subagent-Primitiven.
- Round-Limits sind standardmäßig großzügig, bleiben aber deploymentgesteuert. Sie begrenzen Iterationen, nicht Tokens, Preis, verstrichene Zeit oder externe Seiteneffekte.
- Evaluator, Budget, Reflektor, Hintergrundjob, CLI und generische Loop-Session-Architektur des ursprünglichen Vorschlags sind bewusst nicht Teil der implementierten öffentlichen API.

## Bekannte Einschränkungen und zurückgestellte Arbeit

- **Unabhängige Auswertung** — Abschluss/Blockierung in derselben Session und der terminale Ralph-Status sind Modell- oder Worker-Erklärungen. Ein separater Evaluator, eine evaluator-getriebene Feedback-Round, ein Abschlusszertifikat, ein deterministischer Checker, ein adversarial Verifier und ein Kriterien-/Executor-/Isolation-Vertrag bleiben zurückgestellt.
- **Aggregierte Budgets** — `maxGoalRounds` und Ralph-`maxRounds` sind die einzigen aggregierten Aufwandslimits. Token-, Währungs-, Laufzeit-, Provider-Nutzungs- und Preis-Admission-Policies pro Round existieren nicht.
- **Kein persistenter autonomer Runner** — Session-Zielfakten persistieren, aber Aktivierung und Scheduling sind prozesslokal und warten nach der Wiederherstellung bewusst auf menschliche Eingabe. Ralph-Runs laufen im Vordergrund und können nach Prozessverlust nicht fortgesetzt werden. Hintergrundsammlung, Neustart-Wiederherstellung und unbeaufsichtigte residente Ausführung sind zurückgestellt.
- **Kein Zeit-Scheduler** — Intervall-`/loop`, cron, proaktive Wartung sowie Cloud- oder Desktop-Scheduling liegen außerhalb dieser Entscheidung.
- **Kein generisches Loop-Journal oder Execution-World-Rewind** — Session-Replay rekonstruiert die Zielhistorie, nicht frühere Dateien, Prozesse, Umgebung, Credentials oder externe Seiteneffekte. Ralph behandelt den aktuellen Workspace als Autorität und führt kein runübergreifendes Journal.
- **Kein Ziel-Reflektor** — Concern-Events, automatische No-Progress-Heuristiken, Zielrevision durch einen unabhängigen Reflektor, Stuck-Pattern-Erkennung und `loop_split` sind nicht implementiert. Menschen können das Ziel direkt bearbeiten, pausieren, löschen oder fortsetzen.
- **Ralph-Policy bleibt eng** — eine Round erzeugt einen frischen Subagent; Fan-out innerhalb einer Round, Evaluator/Worker-Rollentrennung, dynamische Provider-/Modellauswahl und strukturelles Verbot rekursiver Ralph-Tool-Aufrufe benötigen separate Policy-APIs. Prompt-Anleitung ist keine Durchsetzung.
- **Ralph wiederholt keinen fehlgeschlagenen Subagent** — ein gewöhnlicher Fehler bewahrt die fehlgeschlagene Round und die letzte gültige Übergabe, während fatale Workflow-Infrastrukturfehler enden können, bevor dieser Zustand verfügbar ist. Retry-Anzahl, Backoff und reichhaltigerer Fehlertransport benötigen separates Policy- und Grenzdesign.
- **Portable UI bleibt bescheiden** — Die TUI rendert Klartext-Zielstatus und generische Ralph-Karten. ACP trägt nur committed Assistant-Text; es gibt kein kontinuierliches Status-Widget, keine wiederverbindbare Kommandoausgabe, keinen modalen Ziel-Editor und keine Kommandoebene in ACP, der Headless-CLI oder JSON-RPC.
