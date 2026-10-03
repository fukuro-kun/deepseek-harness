# Agent Note: Portable Consumer über Filesystem- und Subprocess-Execution-Worlds
[English](2026-07-28-portable-execution-world-consumers.md) | [中文](2026-07-28-portable-execution-world-consumers.zh.md) | Deutsch

Status: implemented


## Problem

Die Filesystem- und Subprocess-Seams machten Datei- und gewöhnlichen Prozesszugriff austauschbar, aber PTY und LSP griffen weiterhin direkt auf Host-Node-APIs zu. Ein Remote-Execution-Provider schien daher separate PTY- und LSP-Packages zu benötigen, obwohl sich deren Domain-Verhalten nicht änderte. Diese Packages wären shallow Adapter gewesen: Jeder hätte einen bestehenden Consumer dupliziert, nur um dessen Datei- und Prozessoperationen zu ersetzen.

Eine Remote-Coding-World ist nur nützlich, wenn Dateioperationen, Commands, Terminals und Language Server eine Sandbox-Identität teilen. Den kompletten Harness in diese Sandbox zu verlegen würde zudem Provider-Experimente mit Plugin-Loading, Credentials, Model-Transport, Session-Durability, Supervision und Deployment verflechten.

Gewöhnliche Pipes decken eine Anforderung nicht ab. Ein persistentes Terminal braucht PTY-Allocation, Inspektion und Signalisierung der Foreground-Process-Group sowie Cleanup der kompletten Terminal-Session. So zu tun, als könnten diese Operationen in `dsh-terminal-bash` aus einem gewöhnlichen `spawn()`-Handle nachgebaut werden, würde entweder Provider-Interna leaken oder dessen Lifecycle-Contract verwässern.

## Entscheidung

`ctx.fs` und `ctx.subprocess` definieren zusammen eine Execution World. Gemeinsam gemountete Provider müssen denselben Path-Namespace, dieselben Executables, Prozesse und Terminal-Sessions beschreiben; höhere Capabilities konsumieren diese beiden Interfaces, statt den Provider zu benennen.

Das Filesystem-Interface besitzt die Path-Fakten, die eine andere Capability braucht, ohne seine opaque Target-Identität zu exposen: einen kanonischen Process-Path, eine kanonische `file:`-URI und Containment. Bestehende Whole- und Streaming-Text-Operationen bleiben im Besitz des Filesystems; Protocol-Consumer erzwingen ihre eigenen Retention-Limits während sie den Stream konsumieren.

Das Subprocess-Interface besitzt Executable-Lookup und Prozess-Primitive: gewöhnliches raw oder collected Process-Spawning und `spawnTerminal()`. Ein gewöhnlicher Handle hält die Target-Identität privat: `.done` berichtet das direkte Target, während `terminate()` und `waitForExit()` denselben Provider-verwalteten Bereich kontrollieren und beobachten. Die [Native-Containment-Entscheidung](2026-08-28-subprocess-native-containment.de.md) besitzt lokale Linux-Scopes, Windows Jobs und deren offengelegte Fallbacks. Die Terminal-Operation ist ein tiefes Primitiv, dessen Handle Text-I/O, Foreground-Groups, Signalisierung und eine awaited TERM-to-KILL-Operation besitzt, die in-flight Handle-Calls settlet und für jedes Mitglied ihres Provider-eigenen Bereichs Quiescence erreicht; ein observationeller Fallback begrenzt diesen Bereich auf Identitäten, die er noch beobachten kann. Sein Signal cancelled nur die Allocation; der publizierte Handle besitzt seine Lebensdauer. Prompt-Detection, Idle-Inference, Scrollback, Sandbox-Policy und Owner-Lifecycle bleiben im PTY-Consumer.

Generische Consumer nutzen diese Execution World:

- `dsh-bash-local` mappt Bash-Semantik weiterhin auf gewöhnliches `ctx.subprocess.spawn()`.
- `dsh-lsp-stdio` liest und contained Source über `ctx.fs`, resolved und launched Language Server über `ctx.subprocess` und trägt Provider-eigene File-URIs durch Initialisierung und Result-Rendering. Ein Provider-Lifetime-Signal abortet Filesystem- und Protocol-Arbeit während des Disposals, einschließlich Workspace-Lookup vor Queue-Ownership; sein JSON-RPC, Pooling, Synchronization und Normalization bleiben unverändert.
- `dsh-terminal-bash` mappt Persistent-Shell-Semantik auf `ctx.subprocess.spawnTerminal()`. Die lokale `node-pty`- und Process-Inspection-Implementierung zieht in `dsh-subprocess-local`; ein anderer Subprocess-Provider liefert dasselbe Primitiv. `danger-full-access` braucht kein `ctx.sandbox`; ein confined Mode erfordert einen Same-World-Sandbox-Provider und schlägt vor dem Spawn fehl, wenn keiner gemountet ist. Prompt- und Silence-Evidenz, die während asynchroner Pre-Write-Inspektion gesammelt wurde, wird verworfen, sobald der Provider-Write beginnt. Cancellation behält die Send-Reservation, während ein in-flight Write settlet, und signalisiert danach die Foreground-Group, sodass späte Bytes oder das Signal keinen Nachfolger treffen können; ein in-flight Readiness-Poll kann diese Reservation nicht freigeben, und ein rejected Write sendet kein Signal. Die absolute Deadline bleibt während der gesamten Cancellation armed. Ein Signal-Failure wird zum Terminal-Transport-Failure. Das Abschließen einer stale Inspection nimmt das Polling für den aktuellen Send wieder auf. Startup-Cancellation beginnt Terminal-Rollback, ohne auf einen gestallten Readiness- oder Signalling-Call zu warten. Close lehnt neue Public Signals ab und delegiert Provider-verwaltete Session-Quiescence an die awaited Termination-Operation des Handles.

## E2B-POC-Boundary

Die opt-in E2B-Realisierung hat exakt drei Provider-spezifische Packages unter `packages/e2b/`: `dsh-e2b` erzeugt eine Sandbox und löscht sie bei Timeout oder Disposal, `dsh-fs-e2b` implementiert `ctx.fs`, und `dsh-subprocess-e2b` implementiert `ctx.subprocess` über E2B Commands, PTYs und Remote-Linux-Process-Groups. Die beiden Adapter beziehen den einzigen SDK-Handle vom Owner und erzeugen niemals private Sandboxes.

E2B besitzt das mutable Filesystem, managed Command- und Bash-Prozesse, Terminal-Allocation und Terminal-Session-Groups, Language-Server-Prozesse und Source-Reads sowie Adapter-private Dateien unter `.dsh-e2b`. Der Host besitzt Cordis- und Plugin-Objekte, den Agent Loop, Agent-/Session-/Goal-State, Session-Logs und Persistence, LLM-Calls, Prompts und Tools, Authority, Skills, Subagent-Orchestrierung, PTY-Buffer und Readiness, LSP-Protocol-State und E2B-SDK-/Network-Buffer. Das Overlay lädt den Host-Workspace weder hoch noch synchronisiert es ihn.

Die Adapter behalten nur Substrat-Mechanik. Filesystem-Kanonisierung kreuzt den decodierten Command-Transport des SDK als striktes base64-kodiertes NUL-Framing; gestreamte Reads überlassen Byte-Ceilings den Consumern. Subprocess-Command-Output und Environment-Snapshots nutzen ASCII/base64, wo SDK-Chunk-Decoding sonst Bytes verlieren würde, während private Control-Shells Profile isolieren und spätere Launches entdeckte credential-förmige Namen leeren. Prozess- und Terminal-Cleanup nutzt Remote-Groups und beweist Quiescence vor dem Settlement.

Sandbox-State ist bewusst ephemeral: Timeout und Disposal löschen die Remote-Dateien und unmanaged State. Der POC fügt weder Reconnect- oder Pause/Leave-Retention hinzu noch ein Session-Persistence-Backend, einen Template-Builder, ein Volume, einen Snapshot, eine Network-Policy-Schicht, einen Sandbox-Katalog, Workspace-Synchronisation, durable Remote-Handles oder Whole-Harness-Execution.

## Verifikation

Fokussierte Package-Suites pinnen Sandbox-Lifecycle, Canonical-Path-Framing, Filesystem-Metadaten und Atomic Versions, Subprocess-Publication/-Rollback, Terminal-Text-I/O und Session-Cleanup, Output-Limits, Cancellation, Disposal und Invariant-Registrierung. Eine Credential-gated Loader-Komposition übt denselben Three-Package-Provider durch Source-Imports und Built Exports aus, einschließlich FS-/Bash-Visibility, feindlicher Login-Profile, Byte-gesplittetem UTF-8-Output, Prozess- und Terminal-Cleanup, LSP-Queries, Host-Workspace-Isolation und finalem Sandbox-Delete.

## Erwogene Alternativen

**Ein PTY- und LSP-Package pro Remote-Provider behalten.** Abgelehnt, weil Provider-Mechanik über den bestehenden Seams wiederholt würde. Der Deletion-Test legt das Problem offen: Diese Adapter zu löschen sollte Domain-Verhalten nicht in den Remote-Provider verstreuen; die generischen Consumer besitzen es bereits.

**Eine separate Sandbox pro Capability oder Tool erzeugen.** Abgelehnt, weil Datei- und Prozessoperationen dann weder Identität noch State teilen würden, was den Coding-Use-Case zunichte macht und Lifecycle-Owner vervielfacht.

**Ein Terminal als gewöhnlichen gepipten Subprocess modellieren.** Abgelehnt, weil Pipes weder ein Controlling Terminal allozieren noch die aktuelle Foreground-Process-Group auflösen oder vollständiges Terminal-Session-Cleanup beweisen können. Ein Terminal-Primitiv ist kleiner und ehrlicher als substratspezifische Escape Hatches zu exposen.

**PTY-Readiness und Session-Policy in den Subprocess-Service verlegen.** Abgelehnt, weil das Persistent-Terminal-Consumer-Semantik ist, nicht OS-Prozessmechanik. Ein Subprocess-Provider besitzt, was nur sein Substrat kann; `dsh-terminal-bash` besitzt, was ein Harness-Terminal bedeutet.

**Separate Terminal-Termination- und Quiescence-Operationen plus einen geteilten Lifecycle-Controller exposen.** Abgelehnt, weil jeder Terminal-Consumer dasselbe einzelne Cleanup-Ergebnis braucht. Separate Operationen exportieren Provider-Bookkeeping-, Bounded-Observer- und Retry-Semantik ohne einen Produktions-Consumer; eine awaited Provider-Operation ist das tiefere Interface.

**Ein stabiles Bounded-Read-Primitiv zur Filesystem-Seam hinzufügen.** Abgelehnt, weil nur LSP ein Complete-Document-Byte-Ceiling braucht, das es beim Konsumieren des bestehenden Text-Streams erzwingen kann. Ein zweites Primitiv zwingt jeden Provider, Stable-Handle- und No-Follow-Mechanik zu implementieren — einschließlich eines Remote-Helper-Protokolls — ohne einen beobachteten Concurrent-Replacement-Defekt.

**Den ganzen Harness innerhalb der Remote-Umgebung laufen lassen.** Als anderes Deployment-Modell abgelehnt. Execution-Capabilities portabel zu machen verlegt weder Model-Calls noch Session-State, Plugin-State oder den Agent Loop.

**Jede Provider-Operation in ein geteiltes Owner-Package legen.** Abgelehnt, weil Sandbox-Identität und -Lifecycle die einzigen Anliegen des Owners sind. Filesystem und Subprocess behalten distincte Contracts, Tests und Consumer, ohne den Owner in einen Capability-Grab-Bag zu verwandeln.

**Remote-Filesystem-Operationen nur über Shell-Commands implementieren.** Abgelehnt, weil das strukturierte Filesystem-Identität, Errors, Streaming, Version-Guards und Atomic-Mutation-Semantik wegwirft, die die File-Tools bereits konsumieren.

**Eine generische Distributed-Runtime-Abstraktion hinzufügen oder Live-Handles reconnecten.** Abgelehnt, weil die bestehenden Capability-Seams die demonstrierten Contracts tragen, während Remote-Identität allein weder Callbacks, pending Promises, Authority, Protocol-State noch Output-Cursor rekonstruieren kann. Eine neue Schicht würde über Persistence und Synchronisation jenseits des POC spekulieren.

## Konsequenzen

Ein Remote-Execution-Provider implementiert nur seinen geteilten Sandbox-Owner plus Filesystem- und Subprocess-Adapter. Bash, PTY und LSP komponieren darüber, sodass Fixes an diesen Capabilities Provider-neutral bleiben.

Die fundamentalen Interfaces werden breiter, und ein Filesystem/Subprocess-Paar muss sich auf eine Execution World einigen. Die hinzugefügten Operationen beschränken sich auf Fakten und Lifecycle-Mechanik, die aktuelle generische Consumer benötigen; Model-Schemas, Protocol-Framing, Readiness-Policy und Presentation leaken nicht in die Provider.

Die lokale Implementierung absorbiert `node-pty` und Plattform-Process-Inspection, weil sie lokale Terminal-Mechanik besitzt. Auf unterstützten Linux-Hosts behält der User-Systemd-Scope Descendants, die `setsid` aufrufen oder reparenten, während Process-Inspection weiterhin Foreground-Attribution und synchrone Fallback-Evidenz besitzt. Andere Hosts nutzen den observationellen Teardown: Disposal fegt Descendants vor und nach dem Terminieren der Top-Level-Shell, wartet auf exakt PID-Identity-gefencete Descendants, die während der Foreground-Inspektion retained wurden, und behält Linux-Session-Member, die den Top-Level-Exit überleben. macOS kann eine POSIX-Session nach dem Exit ihres Leaders nicht enumerieren, sodass ein Child, das zwischen Inspection-Snapshots reparentet, eine explizite Local-Provider-Limitation bleibt — und kein Grund, Prozessmechanik zurück in den PTY-Consumer zu verlegen.

Die E2B-Komposition demonstriert, dass ein geteilter Sandbox-Owner plus Filesystem- und Subprocess-Adapter ausreichen, um die mutable Coding World off-host zu verlegen und höhere Capabilities Provider-neutral zu lassen. Ihre POC-Limits bleiben explizit: Das SDK hält den kompletten Command-Transport im Host-Memory, Remote-Startup kann keine PID synchron publizieren, exakte Terminal-Stdin-Wait- und unabhängige Signal-Fakten sind nicht verfügbar, numerische PID/PGID-Operationen sind nicht identity-gefenced, der initiale Environment-Probe kann unbekannte Sandbox-Default-Secrets nicht vor bereits laufenden Same-UID-Prozessen verbergen, und Adapter-Artefakte bleiben bis zum Sandbox-Delete bestehen. Das sind Provider-Constraints, keine Rechtfertigung für Compatibility-Shims oder weitere E2B-Packages.
