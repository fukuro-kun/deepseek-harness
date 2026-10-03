# Agent Note: persistent PTY sessions

Status: implemented

[English](2026-07-16-persistent-pty-sessions.md) | [中文](2026-07-16-persistent-pty-sessions.zh.md) | Deutsch

## Problem

Der harness kann Vordergrund- und Hintergrundbefehle ausführen, Dateien editieren und Arbeit delegieren, kann aber keine interaktive Terminal-Unterhaltung über Tool-Aufrufe hinweg fortsetzen. Jeder `bash`-Vordergrundlauf startet eine frische Shell, sodass Shell-lokale cwd, exportierte Variablen, Virtual-Environment-Aktivierung, Funktionen, Job-Control-Status und interaktive Kindprozesse mit diesem Aufruf enden.

Diese Lücke schließt Workflows aus, deren Zustand in einem Terminal statt in einer Datei lebt: schrittweises Durchlaufen von `gdb`, Erkunden in einem Python- oder Node-REPL, Bedienen eines zeilenorientierten Editors wie `ed` oder die Rückkehr zu einer Shell nach dem Unterbrechen ihres Vordergrundbefehls. Die generische [`ctx.jobs`](../../../../packages/jobs/README.de.md)-Laufzeit hält Hintergrundoperations-Handles und Ausgaben vor, bietet aber kein interaktives stdin und keine Terminal-Semantik.

Die bestehenden `bash`-, `read`-, `write`- und `edit`-Tools bleiben der verlässliche Standard für begrenzte, auditierbare Operationen. Ein PTY ist eine zusätzliche Fähigkeit für Arbeit, die Terminal-Zustand wirklich benötigt — kein Beleg dafür, dass jene Tools defekt oder Entfernungskandidaten wären.

## Entscheidung

Die optionale `packages/terminal/`-Capability-Familie exponiert agent-owned, persistente, zeilenorientierte PTY-Sessions. Sie folgt dem [Capability-Pattern](../../implemented/architecture/2026-06-13-capability-seams.de.md) des Repositories, koexistiert mit den bestehenden Befehls- und Dateisystem-Tools und verändert `agent-loop` nicht.

Die Implementierung unterstützt interaktive Shells und zeilenorientierte REPLs unter Linux und macOS. Vollbild-Terminalanwendungen, Tastensequenzen, BEL-getriggerter Kontrollfluss, Session-Wiederherstellung nach Prozessverlust und agent-übergreifendes Session-Sharing sind explizit zurückgestellt.

### Paket-Topologie

| Paket | Rolle | ctx key |
|---|---|---|
| `dsh-terminal` | `TerminalSessionService`, gebrandete `TerminalSessionId`, Backend-Registry, owner-scoped Session-Vertrag und Ergebnistypen | `ctx.terminals` |
| `dsh-terminal-bash` | Persistent-Shell-Backend über `ctx.subprocess.spawnTerminal()`: Readiness, begrenzte Terminal-Buffer, Sandbox-Auflösung und owner-bewusster Session-Lebenszyklus | registriert ein Backend auf `ctx.terminals` |
| `dsh-tool-terminal` | Sechs modellseitige Tools, Task-Runtime-Integration für Hintergrund-Sends, Guidance und UI-Render-Intents | registriert auf `ctx.tools` |

Readiness bleibt PTY-Backend-Verhalten, kein zweiter öffentlicher Vertrag. Der Terminal-Prozess-Provider liefert nur Substrat-Fakten wie die Vordergrund-Prozessgruppe und ob er beweisen kann, dass diese Gruppe auf Eingabe wartet; `dsh-terminal-bash` kombiniert diese Fakten mit Prompt- und Silence-Evidenz zum gemeinsamen Send-Ergebnis.

### Agent-Ownership und Identität

`TerminalSessionService` speichert Live-Sessions prozesslokal, aber jede Session gehört dem exakten `Agent`, der durch den Tool-Ausführungskontext übergeben wurde. Der Service prägt eine opaque `TerminalSessionId`; ein optionaler modellgewählter `name` ist Anzeige-Metadatum und nur innerhalb dieses Owners eindeutig. Jede Operation zielt auf `sessionId`, und `list`/`read`/`signal`/`kill` weisen andere Aufrufer als den Owner zurück.

Es gibt keine Auto-Start-Sessions beim Plugin-Laden. `terminal_open` erzeugt eine Session nur während eines agent-Tool-Aufrufs, wenn Ownership und die besitzende event-sourced Session bekannt sind. Ein künftiges deklaratives Startup-Feature muss sich über unveröffentlichtes agent setup zusammensetzen, statt geteilte globale Terminals zu erzeugen.

Agent-Scope-Disposal schließt zuerst Registrierungen und wartet dann den quiescent Teardown jedes owned PTY ab. Unveröffentlichtes Backend-Setup ist eine getrackte Lebenszyklusoperation: Owner- oder Service-Disposal bricht dessen service-owned Signal ab, wartet auf Backend-Abrechnung und Rollback und kehrt erst dann zurück. Caller-Cancellation behält ihren exakten `AbortSignal.reason` selbst dann, wenn das Backend ablehnt oder eine Session zurückgibt, deren Rollback-Close fehlschlägt; dieser Cleanup-Fehler bleibt für späteres Owner- oder Service-Disposal getrackt, statt den Caller-Reason zu ersetzen. Ein durch den Lebenszyklus ausgelöster Rollback-Close-Fehler rejected sowohl den spawn als auch den disposing Lebenszyklus, während `TerminalBackendCleanupError` einem Backend erlaubt, seinen eigenen fehlgeschlagenen Startup-Cleanup für den disposing Lebenszyklus vorzuhalten, ohne eine Caller-Cancellation zu ersetzen. Wenn Caller-Cancellation vor dem Disposal abrechnet, bleibt der Cleanup-Fehler getrackte Owner-Aktivität, bis späteres Owner- oder Service-Disposal ihn konsumiert und meldet, sodass Sandbox-Mode-Policy fehlgeschlagenen Cleanup nicht mit Quiescence verwechseln kann. Backend- oder Tool-Plugin-Reload verwaist keine Sessions: Ownership liegt in `TerminalSessionService`, bis der Agent endet — demselben service-owned-Record-Muster wie [`ctx.jobs`](../../../../packages/jobs/jobs/README.de.md). Der Service reserviert die Session synchron für einen aktiven Send, bevor er dessen Operation zurückgibt, einschließlich bevor eine Hintergrund-job-id sichtbar wird; ein zweiter Send schlägt mit `SEND_ACTIVE` fehl, sodass Ausgabe und Cancellation nicht die Operations-Ownership überschreiten können.

### Sicherheit und Prozessgrenze

Ein registriertes `shell`-Backend beschränkt, wie ein Terminal startet; es beschränkt nicht Befehle, die nach dem Start getippt werden. `dsh-terminal-bash` wendet daher zwei Schutzmaßnahmen vor dem Spawn an:

- Es liefert nur terminal-spezifische Environment-Overrides; der gemountete Subprocess-Provider wendet das geteilte Scrubben credential-förmiger Namen an, bevor er sie merged.
- Es erfordert die geteilte `ctx.sandboxPolicy`. Beim Spawn resolved das Backend den effektiven Session-Modus des Owners über den Deployment-Default; `danger-full-access` startet die Shell direkt, während eingeschränkte Modi einen same-world `ctx.sandbox`-Provider erfordern und die Shell-argv einmal wrappen. Dieser Modus und der workspace root bleiben die Prozessgrenze für die PTY-Lebensdauer. Ein Write, der den effektiven `sandbox/mode` ändern würde, wird vor dem Commit zurückgewiesen, solange der Owner irgendein offenes PTY oder unveröffentlichtes Spawn hat — mit der Anweisung, auf die Abrechnung der Erstellung zu warten und diese Sessions zuerst zu schließen; Writes mit gleichem effektivem Modus bleiben gültig. Die ausstehende Reservierung spannt Backend-Setup bis zur Publikation, sodass es kein Race gibt, in dem ein breiteres Terminal nach einem Downgrade erscheint. `danger-full-access` ist die bestehende explizite uneingeschränkte Wahl, kein PTY-spezifischer Bypass.

Sandboxing begrenzt lokale Prozesswirkungen, macht aber beliebige Shell-Eingaben nicht sicher: Netzwerkaufrufe und andere externe Seiteneffekte bleiben Deployment-Policy unterworfen. Tool-Beschreibungen stellen klar, dass PTY-Sessions weniger auditierbar sind als one-shot Tools und nur verwendet werden sollten, wenn Persistenz oder interaktives stdin nötig ist.

Die lokale Subprocess-Terminal-Primitive verwendet nur öffentliche `node-pty`-Fähigkeiten: child PID, `data`- und `exit`-Notifications, `write` und `kill`. Sie setzt keinen Zugriff auf den nativen master fd voraus und ruft `waitpid` nicht aus TypeScript auf. Auf unterstützten Linux-Hosts startet der [native-containment owner](../architecture/2026-08-28-subprocess-native-containment.de.md) denselben PTY-Befehl innerhalb eines user-systemd-Scopes, ohne PID, Session, Controlling-Terminal, Vordergrund-Gruppe oder Readiness-Semantik zu ändern. Plattform-Prozessinspektoren unterhalb der Primitive leiten Vordergrund-Prozessgruppen und Fallback-Parent/Child-Identität weiterhin aus `/proc` unter Linux und `ps` unter macOS ab. Die [portable-execution-world-Entscheidung](../architecture/2026-07-28-portable-execution-world-consumers.de.md) besitzt diese Prozess/Consumer-Aufteilung.

### Sechs modellseitige Tools

| Tool | Zweck | Ergebnis |
|---|---|---|
| `terminal_open` | Eine owner-scoped Session aus einem registrierten Backend-Typ erzeugen | `{ sessionId, name, type, motd }` |
| `terminal_send` | Text senden, optional Enter abschicken und auf Readiness warten oder einen Hintergrundjob registrieren | begrenztes Viewport plus Wait- und Session-Status; Hintergrund gibt zusätzlich `jobId` zurück |
| `terminal_read` | Eine begrenzte Seite aus dem vorgehaltenen Scrollback lesen | `{ text, totalLines, lineBegin, lineEnd, truncated }` |
| `terminal_signal` | Ein erlaubtes Signal an die aktuelle Vordergrund-Prozessgruppe senden | `{ delivered, targetPgid }` |
| `terminal_close` | Eine Session schließen und Prozessbaum-Quiescence abwarten | `{ killed }` |
| `terminal_list` | Die Live-Sessions des Aufrufers auflisten | owner-scoped Session-Summaries |

Der UI-Render-Vertrag ist exakt und ortsfrei. `terminal_send` verwendet Terminal-Call/Result-Cards nur für Vordergrund-Sends; seine Hintergrundform ist generisches `execute`. `terminal_open`, `terminal_read`, `terminal_signal`, `terminal_close` und `terminal_list` verwenden generische `execute`-, `read`-, `execute`-, `delete`- bzw. `read`-Cards. Kein PTY-Tool emittiert `locations`.

`terminal_send({ sessionId, text, submit?, run_in_background? })` behandelt `text` als UTF-8-Bytes und resolved `submit` in der Tool-Implementierung zu `true`. Bei `submit` gleich true schreibt es die Plattform-Enter-Sequenz nach dem Text; bei false schreibt es nur den Text, was Steuerzeichen und REPL-Fragmente ohne versteckte Inhaltsheuristiken erlaubt. Cancellation markiert eingereihte Eingabe, bevor die echte Vordergrundgruppe signalisiert wird, sodass Eingabe nicht ausgeführt werden kann, wenn eine asynchrone Pre-Write-Inspektion danach abrechnet. Der gecancelte Send behält seine Reservierung, bis die asynchrone Vordergrund-Signalisierung abrechnet, sodass ein Nachfolger nicht Ziel dieses Signals werden kann. `enableRunInBackground` ist standardmäßig true; false entfernt `run_in_background` aus dem schema und rejected dasselbe undeklarierte Argument, falls ein Aufrufer es durch die Ausführung drückt.

Vordergrund-Sends geben ein begrenztes gerendertes Delta und zwei unabhängige Fakten zurück: `waitReason` (`stdin_read | inferred_idle | timeout | session_exit`) und `sessionStatus` (`running` oder `exited` mit Exit-Code oder Signal). `session_exit` bezieht sich auf den Top-Level-Shell-Prozess des PTY, nicht auf einen beliebigen Vordergrundbefehl, dessen Status die Shell konsumiert. Ein Timeout impliziert niemals Prozessende. `dsh-tool-terminal.maxResultBytes` ist standardmäßig 262144, rejected Werte unter 64, damit Erstellungsbestätigungen registry-ausgestellte ids behalten, und deckelt jedes Einzeltext-UTF-8-Ergebnis nach normalisierten Tool- oder Pipeline-Fehlern, Wait-, Session-, Paginierungs-, Truncation-, generischen Task-Status-Wrappern, Policy-Denials oder Short-Circuits sowie Post-Execute-Ersetzungen oder -Blocks; der last-mile `finalizeContent`-Callback der Terminal-Definitionen lässt bewusst strukturierten mehrblöckigen Policy-Content unverändert. Der Renderer reserviert Suffix-Platz und bewahrt Code-Point-Grenzen, statt die Backend-Payload-Cap als finale Modellgrenze zu behandeln.

Mit `run_in_background: true` registriert `dsh-tool-terminal` den laufenden Send auf `ctx.jobs` und kehrt sofort mit `jobId` zurück. Der Produzent legt `maxResultBytes` auf den Task-Snapshot, sodass `job_output`, Terminal-Kill-Status und Completion-Notices dieselbe Complete-Result-Cap nach generischen Metadaten durchsetzen. `job_output(wait: true)` wartet, liest inkrementelle Ausgabe und zeichnet das Endergebnis auf; `job_kill` resolved die aktuelle Vordergrund-PGID und liefert ein echtes `SIGINT` — auch wenn die Anwendung Terminal-`ISIG` deaktiviert hat — und eskaliert nur über den owned Teardown-Pfad des PTY-Backends. Fehlt die Task-Oberfläche, scheitert der Hintergrundmodus vor dem Schreiben von Eingabe. Es wird kein PTY-spezifisches `sleep`-Tool oder generelle Wake-up-API hinzugefügt.

`terminal_read` paginiert rückwärts von der neuesten vorgehaltenen Zeile. Das Backend setzt sowohl Zeilen- als auch UTF-8-Byte-Caps auf vorgehaltenem Scrollback und der zurückgegebenen Seiten-Payload durch, sodass eine übergroße Zeile die Backend-Grenze nicht umgehen kann; das Tool deckelt dann die vollständig gerenderte Seite einschließlich Paginierungs- und Truncation-Metadaten. `truncated` unterscheidet Retention-Verlust von einem gewöhnlichen Viewport-Delta.

`terminal_signal` akzeptiert die geschlossene Menge `SIGINT | SIGTERM | SIGKILL | SIGTSTP | SIGHUP`. Das Backend resolved die Terminal-Vordergrund-Prozessgruppe zur Ausführungszeit. `SIGKILL` wird abgelehnt, wenn diese Gruppe die Top-Level-Shell ist — mit Verweis auf `terminal_close`; eine fehlgeschlagene Gruppenauflösung lässt die Operation fehlschlagen, statt eine geratene PID zu signalisieren.

### Lokale Readiness-Erkennung

Das lokale Backend erkennt zuerst einen privaten OSC-Prompt-Marker, den sein kontrollierter bash-Start emittiert, verlangt dann, dass der druckbare Tail nach dem letzten Marker exakt dem kontrollierten `PS1` entspricht, bevor Prompt-Readiness deklariert wird, und führt drei begrenzte Fallback-Tiers aus. Das Mitführen dieses Tails über data-Callbacks hinweg deckt Zustellung ab, bei der Marker und Prompt getrennt ankommen; das Verlangen des exakten Tails weist einen verspäteten früheren Prompt zurück, sobald zurückgeechoete Eingabe oder Ausgabe ihm folgt, sodass er den aktuellen Send nicht abrechnen kann. Der Marker wird entfernt, bevor Ausgabe das Modell erreicht, und vermeidet eine feste Silence-Verzögerung für gewöhnliche Shell-Befehle auf beiden Plattformen. Unveröffentlichter Startup akzeptiert Null-Ausgabe-Silence nicht als Readiness; Timeout rejected den Spawn. Gewinnt Caller-Cancellation während des Starts, schließt das Backend die private Session und propagiert den exakten `AbortSignal.reason`; eine noch nicht beobachtbare Vordergrund-PGID kann Cancellation nicht durch einen Lookup-Fehler ersetzen. Alle Zeitwerte sind validierte Config-Felder: `pollIntervalMs`, `exactProbeAfterMs`, `idleSilenceMs`, `handoffGraceMs` und `timeoutMs`.

Unter Linux liest der Inspektor die Terminal-Vordergrund-PGID der Shell aus `/proc/<shellPid>/stat`, enumeriert jeden Prozess und Thread in dieser Prozessgruppe und prüft deren aktuelle Syscalls. Ein positives Tier-1-Ergebnis erfordert ein beobachtetes stdin-Warten: direktes `read(0)`, ein erlaubtes Lesen eines `select`/`pselect6`- oder `poll`/`ppoll`-Arguments, das fd 0 enthält, oder eine epoll-Interest-List mit fd 0. Das `/proc/<pid>/task/<tid>/fd/0` des wartenden Threads muss das Controlling-Terminal-Gerät der Shell identifizieren, sodass eine thread-lokale fd-Tabelle nicht den Terminal-Descriptor ihres Leaders substituieren kann und ein auf seiner Pipe blockierter Pipeline-Reader ein laufender Befehl bleibt. Direkte PTY-Descriptors verwenden ihre Gerätenummer; `/dev/tty` verwendet die `tty_nr` des besitzenden Prozesses, weil `stat` das Alias-Gerät statt des ausgewählten PTY meldet. Ein bereits vor Terminal-Eingabe vorhandenes Warten ist keine Post-Write-Readiness: Dieselbe PGID muss außerhalb dieses Wartens beobachtet werden, bevor sie es wieder betritt, während eine geänderte Vordergrund-PGID neue Evidenz ist. Unlesbarer Prozessspeicher und unerkannte Syscalls sind Misses, niemals positive Vermutungen. Eine Host-Policy, die `/proc/<pid>/task/<tid>/syscall` verweigert — einschließlich gehärteter ptrace-Policy — überspringt ebenfalls Tier 1 und bewahrt die begrenzte Tier-2-Idle-Inferenz; Prozess-Sleep-State substituiert niemals unzugängliche Syscall-Evidenz. Architektur-Tabellen enthalten nur Syscall-Nummern, die die entsprechende Linux-UAPI definiert; der Inspektor lässt die Laufzeitarchitektur zu und prüft dann jede unterstützte Kernel-ABI, weil `/proc` unter User-Mode-Emulation eine andere ABI melden kann. Nicht unterstützte Laufzeitarchitekturen überspringen Tier 1.

Unter macOS gibt es keinen exakten Syscall-Tier. Ausgabe-Silence liefert `inferred_idle` für jede Vordergrund-Prozessgruppe, einschließlich Python und `gdb`; `ps`-abgeleitete Terminal-PGID wird zum Signalisieren verwendet, nicht als Beweis, dass nur die Shell idle sein kann. Reine Prozessinspektor-Logik ist injizierbar und unter Linux unit-getestet, während ein macOS-CI-Job den echten PTY- und Prozesstabellen-Pfad ausübt.

Tier 2 liefert `inferred_idle` nach `idleSilenceMs` ohne Ausgabe. Ein schlafender oder netzwerkblockierter Befehl kann daher ready aussehen. War bereits ein Prompt-Marker zu sehen, wartet Tier 2 weitere `handoffGraceMs`, damit ein bash-Vordergrund-Handoff, der auf die Silence-Grenze fällt, noch als exakte `stdin_read`-Attribution abrechnet statt als schwächere Inferenz; die Grace ist ein deployment-owned Config-Feld, validiert auf mindestens ein `pollIntervalMs`, weil eine kürzere Grace als die Poll-Periode keinen einzigen Readiness-Poll fassen kann und so kein Ergebnis ändern kann. Sie begrenzt nur Sends, die einen Marker sahen, sodass ihre Kosten die interaktive Rückkehr-Latenz dieses einen Falls sind, nicht jeder Send. Tier 3 liefert `timeout` nach `timeoutMs`, damit ein Vordergrund-Tool-Aufruf den Agent nicht unbegrenzt hält. Das Ergebnis bewahrt die Unterscheidung; Aufrufer können über `ctx.jobs` warten, die Vordergrundgruppe signalisieren oder aus einer anderen Session inspizieren.

Sobald ein Send unter irgendeinem Tier abrechnet, akzeptiert `TerminalSendOperation.append` keine Ausgabe mehr, sodass spätere Child-Ausgabe diese abgerechnete Operation nicht mehr erreicht; sie erreicht weiterhin den Scrollback und jeden Send, der bei ihrem Eintreffen aktiv ist. Ein Test, der auf einen Marker auf der von ihm gestarteten Operation wartet, muss daher `idleSilenceMs` und `timeoutMs` über die eigene Startup-Latenz des Child setzen; Interpreter-Start auf einem belasteten macOS-Runner beendet sonst den Send, bevor der Marker gedruckt ist.

`node-pty`-data-Notifications speisen einen Terminal-Parser. Parser-Carry-State behandelt Control-Sequences und ein über Callbacks aufgeteiltes trailing Carriage Return, sodass ein geteiltes CRLF einen Newline erzeugt statt einer paginierungsverändernden Leerzeile. Die Implementierung normalisiert zeilenorientierte Ausgabe, verspricht aber keine korrekte Interaktion mit einer Vollbild-Anwendung.

### Modellsichtbare Ausgabe und Durability

Die bestehenden dauerhaften `tool/call`- und `tool/result`-Events sind die source of truth für vom Modell gesendeten Text und an es zurückgegebene gerenderte Ausgabe. `terminal_open` gibt seinen MOTD über das geloggte Tool-Ergebnis zurück; Vordergrund-`send`/`read`/`list`/`signal`/`close`-Ergebnisse werden ebenso geloggt. Die PTY-Pakete duplizieren keine rohen Byteströme in eigene Session-Events.

Hintergrund-Sends verwenden die bestehende Task-Completion-Notice und den `job_output`-Ergebnispfad, sodass jede Ausgabe, die einen späteren Modell-Request erreicht, ebenfalls dauerhaft ist. Rohe Terminal-Bytes bleiben begrenzter prozesslokaler Zustand und werden weder persistiert noch wiederhergestellt. Ein künftiger opt-in transcript-Sink bräuchte seinen eigenen Retention-, Credential- und Privacy-Vertrag.

### Prozessbaum-Teardown

Auf unterstützten Linux-Hosts bindet das Subprocess-Terminal-Handle den Top-Level-PTY-Prozess an seinen transienten user-systemd-Scope. Vor der Etablierung sendet close `SIGTERM` über den direkten PTY-Fallback, damit der Bootstrap nicht fortsetzen kann; nach der Etablierung signalisiert es nur den Scope und verwendet den direkten Fallback nur, wenn Scope-Signalisierung fehlschlägt. Es wartet, bis der Manager den Bereich als leer beweist, und eskaliert nach der konfigurierten Grace zu `SIGKILL`. Scope-Mitgliedschaft umfasst weiterhin Nachfahren, die `setsid` aufrufen oder reparentet werden, während die direkte Exit-Notification des PTY das terminale Ergebnis bleibt.

Fallback-Hosts behalten observationelle Prozess-Session-Bereinigung. Das Handle snapshotet transitive Nachfahren nach parent PID in Children-First-Reihenfolge, sendet `SIGTERM`, wartet, rescannt nach während des Shutdowns geforkten Children, sendet `SIGKILL` an die Vereinigungsmenge und verifiziert, dass jeder Nicht-Zombie-Nachfahre die Prozesstabelle verlassen hat, bevor der Top-Level-Prozess gestoppt wird. Ein passender Linux-Zombie hat keine ausführbare Arbeit und zählt daher als quiescent. Jede erfasste PID enthält die Prozess-Start-Identität, sodass Wiederverwendung die Eskalation nicht umleiten kann.

Teardown meldet Top-Level-Exit und Survivor-Cleanup unabhängig. Die PTY-Session beansprucht keinen Erfolg nur weil die Shell exitete: Sie ruft `SubprocessTerminalHandle.terminate()` auf und wartet Quiescence der ganzen Session, wobei ein Cleanup-Fehler propagiert wird, der Survivors benennt. Ein fehlgeschlagener Close wird nicht ewig gecacht: Registry und lokale Session räumen die Fence nur, wenn sie noch diesen fehlgeschlagenen Versuch benennt, sodass ein späterer expliziter oder Lebenszyklus-Close retryt, ohne einen neueren konkurrierenden Versuch zu stören. Service-Disposal räumt seine Backend-, Reservierungs- und Owner-Detacher-Registries weiterhin, wenn ein Close fehlschlägt.

### Komposition und Rollout

Die Beispiel-Komposition bleibt opt-in und sicher per Default:

```yaml
plugins:
  '@deepseek-ai/dsh-sandbox-local':
  '@deepseek-ai/dsh-sandbox-policy':
    config:
      mode: workspace-write
      workspaceRoot: .
  '@deepseek-ai/dsh-terminal':
  '@deepseek-ai/dsh-subprocess-local':
  '@deepseek-ai/dsh-terminal-bash':
    config:
      scrollbackLines: 10000
      scrollbackMaxBytes: 4194304
      maxReadBytes: 262144
      pollIntervalMs: 50
      exactProbeAfterMs: 150
      idleSilenceMs: 3000
      handoffGraceMs: 500
      timeoutMs: 30000
      disposeGraceMs: 3000
  '@deepseek-ai/dsh-tool-terminal':
    config:
      enableRunInBackground: true
      maxResultBytes: 262144
```

Das Paket liefert knappe Tool-Guidance zu persistentem Zustand, Owner-Isolation, unsicheren Idle-Ergebnissen, Cleanup und der Präferenz für bestehende one-shot Tools, wenn Interaktion unnötig ist. Es mountet PTY nicht in den ausgelieferten Basis-Beispielen: PTY ist opt-in über die dedizierte Komposition, während ACP- und Headless-Snapshot-Overlays es ausüben. Innerhalb einer aktivierten `dsh-tool-terminal`-Instanz sind die sechs Tools und `run_in_background` standardmäßig aktiviert; Deployments können nur das Hintergrund-Argument per Config deaktivieren.

### Zurückgestellte Arbeit

- Vollbild-TUI-Support, benannte Tastensequenzen, BEL-Unterbrechung, Terminal-Resize-Tools und Alternate-Screen-Snapshots erfordern einen separat bewiesenen modellseitigen Vertrag.
- Deklaratives per-agent Startup erfordert einen agent-setup-Kompositionspunkt; Plugin-Load-globale Sessions bleiben verboten.
- Session-Wiederherstellung über harness-Prozessverlust hinweg erfordert einen Out-of-Process-Owner und ein versioniertes Protokoll.
- Network-Egress-Policy und Rollback externer Seiteneffekte gehen über PTY hinaus und bleiben separate Sicherheitsarbeit.
- Windows/ConPTY-Sessions laufen über den subprocess-local Windows-Inspektor (Toolhelp32-Identitäten, Pseudo-Vordergrundgruppen, taskkill-Teardown) und den `pty-local`-pwsh-Dialekt; siehe die [pwsh persistent tool note](../../archived/architecture/2026-08-11-pwsh-persistent-pty.md).

## Erwogene Alternativen

**`bash`, Dateisystem-Tools oder Task-Tools durch PTY ersetzen.** Abgelehnt. One-shot Tools behalten stärkere Validierungs-, Approval-, Sandbox-, Output-Bound- und Replay-Verträge. PTY ist für interaktiven Zustand reserviert.

**Einen persistenten Modus zu `bash` hinzufügen.** Abgelehnt. Rückkehr bei Readiness statt Prozessende, Behalten eines Prozessbaums über Aufrufe hinweg und Exponieren interaktiven stdin erzeugen einen anderen Ownership- und Fehlervertrag.

**Native master-fd-Zugriff von `node-pty` verlangen.** Abgelehnt. Seine öffentliche API exponiert keinen master fd. Der lokale Subprocess-Terminal-Adapter leitet Vordergrundgruppen und Nachfahren stattdessen aus unterstützten OS-Prozessmetadaten ab und behandelt unlesbare Metadaten als Detector-Miss.

**Jedes Mitglied der POSIX-Session der Root-PID signalisieren.** Abgelehnt. `node-pty` kann eine Helper-PID exponieren, deren Session zum Launcher gehört, sodass ein SID-weiter Teardown unrelated harness- oder Desktop-Prozesse signalisieren kann. Ein PID-Identitäts-gefenzter Nachfahrenbaum ist enger und per Konstruktion sicher.

**`TerminalIdleDetector` als austauschbare Registry publizieren.** Abgelehnt. Substrat-spezifische Vordergrund-Fakten kommen aus der gemounteten Terminal-Prozess-Primitive, während Prompt/Silence-Readiness eine private Policy in `dsh-terminal-bash` bleibt. Die Dateisystem/Subprocess-Execution-World-Ersetzung ist der nötige extension point.

**Ein PTY-spezifisches `sleep`-Tool hinzufügen.** Abgelehnt. `ctx.jobs` besitzt bereits begrenztes Warten, Cancellation, Completion-Notices und modellseitige Sammlung. Ein zweiter generischer Wake-Mechanismus würde die agent-loop-Grenze überschreiten und diesen Vertrag duplizieren.

**TUI-Sequenzen und BEL-Handling einschließen.** Abgelehnt. Das Quell-Prototyp behandelt diese Pfade als timing-sensitiv und zeichnet weiterhin ungelöste Alternate-Screen- und Interaktionsfehler auf. Zeilenorientierte PTY-Nutzung beweist den Kernwert, ohne diese unverifizierten Verhaltensweisen fundamental zu machen.

**Sofort einen Out-of-Process-Daemon verwenden.** Für die initiale prozessinterne Fähigkeit abgelehnt, weil aktuelle langlebige Entry-Points bereits einen Cordis-Kontext am Leben halten. Ein Daemon wird durch prozessübergreifende Wiederherstellung oder Multi-Client-Attachment gerechtfertigt, beides hier zurückgestellt.

## Verifikation

- Per-File-Coverage pinnt Owner-Fencing, konkurrierende Reservierungen, Cancellation während Pre-Write-Inspektion, Unpublished-Spawn-Cancellation und awaited Teardown, Sandbox-Mode-Change-Rejection, retrybaren Lebenszyklus-Cleanup, Readiness-Tiers, Ablehnung von Pre-Write-stdin-Waits und verspäteten früheren Prompts, die konfigurierte Handoff-Grace, die den Idle-Fallback über einen Poll hinaus hält, und ihre Ablehnung unter `pollIntervalMs`, Sanitizer-Carry-State, vollständige UTF-8-Bounds, Task-Integration, Schemas und exakte Render-Intents.
- Subprocess-Prozess-Fixtures decken Nicht-Leader- und Nicht-Main-Thread-stdin-Waits, thread-lokale fd-Tabellen, das `/dev/tty`-Alias, unterstützte Kernel-ABIs unter User-Mode-Emulation, Ablehnung von durch eine Pipe gestütztem fd 0, Zombie-Quiescence, unlesbaren Prozesszustand, nicht unterstützte Architekturen und sonstige False-Positive-Ablehnung ab; macOS-Inspektor-Logik wird in dieselbe Unit-Suite injiziert.
- Echte `node-pty`- und PTY-Consumer-Tests üben gemeinsam Shell-Zustand, Controlling-Terminal-Eingabe über `/dev/tty`, die exakte Attribution bei lesbaren Prozess-Syscalls, deren begrenzten Idle-Fallback, wenn Host-Policy sie verweigert, geteilte Sandbox-Policy, Environment-Scrubbing, Raw-Mode-Vordergrund-`SIGINT`, einen TERM-ignorierenden Nachfahren und sofortige Post-Disposal-Quiescence aus. Der Linux-native Smoke hält PTY-PID, Session-Leader, Controlling-Terminal, Vordergrund-`inputWaiting` und Readiness, während ein reparenteter `setsid`-Nachfahre vom Scope owned bleibt; Fallback-Suites behalten identitätsgefenzte observationelle Cleanup-Coverage.
- Ein Loader-getriebener `cordis.yml`-Test mountet die echte Drei-Paket-Komposition und verifiziert, dass verspätete Pipeline-Ausgabe mit dem abgeschlossenen Befehl zurückkehrt, statt als Terminal-Input-Readiness klassifiziert zu werden. Der SDK-Minimal-Snapshot pinnt diese Ausgabe über das persistente Bash-Tool; ACP- und Headless-Snapshots pinnen die sechs Terminal-Schemas, begrenzte Ergebnisse und Fehler über opt-in Overlays; TUI-Snapshots pinnen Terminal- und generische Card-Darstellung.
- Paketverträge, die Architektur-Map, Subsystem-Seiten, generierte Kataloge und die Website-API beschreiben dieselbe ausgelieferte Oberfläche.

## Konsequenzen

**Persistenter Terminal-Zustand ist verfügbar, ohne one-shot Tools zu schwächen.** Shell- und REPL-Zustand kann Tool-Aufrufe überleben, während `bash`, `read`, `write` und `edit` ihre engeren Validierungs-, Approval- und Replay-Verträge behalten.

**Idle unterhalb von Linux Tier 1 ist heuristisch.** Ausgabe-Silence kann einen Prompt nicht von Sleep oder Netzwerk-I/O unterscheiden. Das typisierte Ergebnis bewahrt die Unsicherheit, und begrenzter Timeout plus Task-Warten und Signalisieren halten die Kontrolle beim Modell.

**Die Exakt-versus-Inferiert-Grenze ist ein Latenz-Tausch, kein lösbares Race.** Die Attribution hängt davon ab, ob der Kernel den Vordergrund-Handoff vor oder nach Ablauf der Silence-Grenze publiziert, sodass jede feste Grace eine Scheduling-Wette ist. `handoffGraceMs` legt diese Wette in die Deployment-Konfiguration: Sie zu erhöhen kauft exakte `stdin_read`-Attribution auf einem langsamen oder belasteten Host auf Kosten der interaktiven Rückkehr-Latenz nach einem Prompt-Marker, sie zu senken macht das Gegenteil. Tests, die nicht vom Gewinner abhängen dürfen, prüfen child-erzeugte Ausgabe des nächsten Send mit einem Token, das nicht in echoeder Eingabe vorkommt, statt die Attribution zu prüfen.

**Persistenter Zustand kann vom Modell-Belief abdriften.** Das Modell kann sein cwd oder aktives REPL vergessen. Session-Summaries und vorgehaltene Ausgabe helfen der Wiederherstellung, aber kein Prompt kann Zustandspersistenz deterministisch machen.

**Native Linux-Ownership schließt die Prozessbaum-Beobachtungslücke; Fallback-Ownership nicht.** Ein unterstützter user-systemd-Scope hält einen daemonisierten oder reparenteten Nachfahren als Mitglied, bis der Scope leer wird. Auf macOS, Windows ConPTY und Linux-Hosts, die den Scope nicht etablieren können, kann ein Prozess, der vor observationellem Teardown entkommt, den erfassten Baum weiterhin umgehen; der Fallback akzeptiert diese Lücke, statt SID-weite Signale an unrelated Prozesse zu riskieren.

**Eine Shell kann externe Seiteneffekte verursachen.** Session-Sandboxing und Environment-Scrubbing reduzieren lokale Exposition, machen aber Pushes, API-Aufrufe oder Messages nicht rückgängig. Deployments, die diese Effekte nicht tolerieren können, müssen PTY weglassen oder Netzwerk-Policy hinzufügen.

**Prozessverlust zerstört Terminal-Zustand.** Prozessinterne Sessions überleben keinen harness-Crash oder -Restart, und roher Scrollback ist nicht dauerhaft. Wichtige Arbeit muss in Dateien oder ein anderes dauerhaftes System committed werden.

**`node-pty` ist eine native Dependency von `dsh-subprocess-local`.** Installation, unterstützte Node-Versionen, Prebuild-Verfügbarkeit und Plattformverhalten erfordern Built-Artifact-Smokes auf jedem unterstützten OS.
