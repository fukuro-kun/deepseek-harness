# Agent Note: Erforderliche Cancellation durch tool-erreichbare capability seams
[English](2026-07-19-required-cancellation-through-tool-capability-seams.md) | [中文](2026-07-19-required-cancellation-through-tool-capability-seams.zh.md) | Deutsch

Status: proposed


## Problem

Der implementierte [Tool-Registry-Cancellation-Vertrag](../../implemented/architecture/2026-07-19-cooperative-tool-cancellation.de.md) macht `exec.signal` in jedem Tool-Body erforderlich, doch viele asynchrone capability-Interfaces, die von diesen Bodies erreichbar sind, akzeptieren weiterhin ein optionales Signal. Ein Tool kann daher seinen eigenen Typ erfüllen und bei dem nächsten Aufruf im selben Prozess die Cancellation versehentlich verlieren.

Diese Lücke ist transitiv. Ein Filesystem-Tool kann Path-Resolution und I/O aufrufen, ein Web-Tool einen Provider, ein Bash-Tool einen Executor, und ein Komposit-Tool kann Tasks, subagenten oder Workflows starten oder auf sie warten. Solange eine Operation, die die vom Tool gehaltene Arbeit steuert und vom Tool abgewartet wird, das Weglassen des Signals erlaubt, kann TypeScript nicht beweisen, dass die Cancellation an der Grenze verfügbar bleibt, die den Seiteneffekt besitzt.

Eine Signalverpflichtung für alle asynchronen Funktionen im Repository ginge zu weit. Manche Operationen sind von Tools nicht erreichbar, manche synchrone Abfragen können nicht warten oder laufende Arbeit besitzen, und explizit abgetrennte Arbeit hat nach einer bewussten Übergabe einen neuen Eigentümer.

## Vorschlag

Jede asynchrone capability-Operation im selben Prozess, die von einem Tool-Body erreichbar ist, während das Tool die Operation noch besitzt oder auf sie wartet, muss ein `AbortSignal` erhalten. Die Anforderung kann je nach der bestehenden Form des zuständigen Seams ein Positionsparameter oder ein verpflichtendes Read-only-Request-Feld sein, aber das Weglassen muss die TypeScript-Kompilierung scheitern lassen.

Jeder direkte Caller stellt ein Signal bereit, das er besitzt, oder leitet es aus seinem eigenen Pflicht-Operation-Kontext weiter. Implementierungen dürfen einen abgeleiteten Deadline oder Cancellation-Scope ableiten, das abgeleitete Signal bleibt aber während der delegierten Lebensdauer mit dem Upstream-Signal verknüpft. Capability-Implementierungen erzeugen keine nie-abbrechenden Signale, verwenden keine umgebungsgebundene asynchrone lokale Cancellation und validieren `AbortSignal` nicht zur Laufzeit, nur um den typisierten Same-Process-Vertrag zu wiederholen.

Die Migration beginnt mit einer Inventur von jedem First-Party-`ToolDefinition.execute()` über die capability-Aufrufe, die sie abwartet. Danach wird jedes kohärente Service-Definition-/Service-Provider-/Consumer-Seam zusammen geändert, einschließlich Tests und generierter API-Dokumentation. Getrennte PRs können Filesystem, Shell/Task, Web/Provider, Workflow/subagent, Code-Runtime und ähnliche Familien migrieren, damit jede Änderung reviewbar bleibt; unter der Pre-Release-Policy des Repositories behält jedoch kein migriertes Interface einen optionalen Kompatibilitäts-Overload.

### Scope-Grenze

Der Vorschlag umfasst asynchrone capability-Operationen, deren Abschluss oder Cancellation Teil der Lebensdauer des aufrufenden Tools bleibt, einschließlich Start-Operationen vor der Eigentumsübertragung, Foreground-Ausführung, Lese- und Schreiboperationen, Provider-Anfragen, Wartezeiten sowie Cleanup oder Dispose, auf die das Tool wartet.

Der Vorschlag schließt synchrone Registry-Nachschlagevorgänge, Verfügbarkeitsprüfungen, Schema-Rendering, Argument-Klassifizierung und andere Operationen aus, die asynchrone Arbeit nicht beibehalten können. Ebenfalls ausgeschlossen ist Arbeit nach einer expliziten Ownership-Übergabe: Sobald ein Task, ein Workflow, ein Worker oder ein Kind-Agent erfolgreich einem neuen Lebensdauer-Eigentümer veröffentlicht wurde, steuert der Controller dieses Eigentümers die abgetrennte Lebensdauer. Die auslösende Start-Operation benötigt das Caller-Signal weiterhin, bis die Übergabe committet ist, und jeder spätere Tool-Aufruf, der auf abgetrennte Arbeit wartet, benötigt sein eigenes Invocierungs-Signal.

Optionale Cancellation kann bei Parser-, Config-, Model-/Tool-JSON-, Persistenz-/Dateiformat-, Worker-, Prozess- oder Wire-Eingängen bleiben, wenn das externe Protokoll sie optional macht. Die zuständige Grenze muss diese Eingänge in ein verpflichtendes Same-Process-Signal auflösen, bevor sie ein migriertes Capability-Seam aufruft.

## In Betracht gezogene Alternativen

**Downstream-Signale bleiben optional, weil Tool-Bodies nun eines erhalten.** Abgelehnt, weil Verfügbarkeit im äußeren Callback die Weitergabe nicht typensicher macht; an jedem optionalen Capability-Aufruf bleibt das Weglassen legal.

**Propagation mit Lint-Regeln oder Callback-Inspektion erzwingen.** Abgelehnt, weil Syntaxprüfungen Ownership, abgeleitete Signale, Abstraktionsebenen oder eine korrekte quiescente Abwicklung nicht zuverlässig identifizieren können. Pflicht-Interface-Parameter drücken den Vertrag dort aus, wo TypeScript jeden Caller prüfen kann.

**`ToolRunContext` durch alle capabilities durchreichen.** Abgelehnt, weil capabilities Cancellation brauchen, nicht Tool-Identität, Agent-Zustand oder Context-Aufschub. Das Durchreichen des größeren Contexts koppelt wiederverwendbare Services an die Tool-Registry und verschleiert das schmale Seam.

**Umgebungsgebundenes asynchron-lokales Signal verwenden.** Abgelehnt, weil versteckte Weitergabe die Prüfung von Ownership und abgetrennten Übergaben erschwert, Tests verkompliziert und Aufrufe stillschweigend an die falsche Lebensdauer binden kann.

**Default- oder nie-abbrechende Signale in Capability-Implementierungen hinzufügen.** Abgelehnt, weil Defaults den fehlenden Eigentümer auslöschen, statt ihn zur Kompilierzeit offenzulegen.

**Jedes capability im implementierten Tool-Registry-Change migrieren.** Abgelehnt, weil die transitiven Interface-Änderungen unabhängige capability-Familien überspannen. Dieses Proposal getrennt zu halten erhält die implementierte Registry-Entscheidung und lässt jedes tiefe Seam mit fokussierten Tests migrieren.

## Akzeptanzkriterien

- Eine Inventur ordnet jeden First-Party-Tool-Body den asynchronen capability-Operationen zu, die vor der Eigentumsübergabe erreichbar sind.
- Jedes capability-Interface im Scope erfordert `AbortSignal`, und Compile-Time-Vertragstests beweisen, dass das Weglassen fehlschlägt.
- Interface, Implementierung, direkter Consumer, Test-Hilfen, Beispiele und generierte API-Referenzen migrieren zusammen, ohne Kompatibilitäts-Overloads oder nie-abbrechende Produktions-Sentinels.
- Abgeleitete Deadlines und Wrapper-Scopes bleiben mit dem Caller-Signal verknüpft, und Integrationstests beweisen, dass die Cancellation den Seiteneffekt-Eigentümer erreicht und die abgewartete Arbeit quiescent wird.
- Synchrone Abfragen und explizit abgetrennte Arbeit nach der Übergabe bleiben außerhalb der Anforderung; bei Mehrdeutigkeit werden Eigentumsübergänge dokumentiert und getestet.
- Laufzeitvalidierung wird nur an einer echten untypisierten Grenze hinzugefügt, nicht, um ein von TypeScript gefordertes Feld oder einen Parameter zu wiederholen.
- Nach jeder kohärenten Migration bestehen die Top-Level-Gates für Typecheck, Coverage, Snapshot, Dokumentation, Modulgraph, Build, Hygiene, Demo und Built-Artifact.

## Risiken

**Großer transiter Blast-Radius.** Ein Pflicht-Parameter kann viele direkte Caller auf einmal offenlegen. Migration nach kohärenten capability-Familien; Typecheck-Failures als vollständige Caller-Inventur verwenden.

**Falsche Klassifikation abgetrennter Arbeit.** Eine Start-Operation zu früh auszuschließen kann Arbeit vor dem Commit der Veröffentlichung abtrennen; das Elternsignal für immer zu verlangen kann einem abgeschlossenen Tool erlauben, legal abgetrennte Arbeit zu canceln. Jede Übergabe braucht einen expliziten Commit-Punkt, einen neuen Eigentümer, Rollback-Verhalten und einen quiescenten Fehlpfad.

**Signal-Ownership-Verwirrung.** Ein capability, das ein geliehenes Signal über die delegierte Lebensdauer hinaus speichert, kann Arbeit an einen veralteten Caller binden. Interfaces und Tests müssen geliehene Operationssignale von Controllern unterscheiden, die von langlebigen Services gehalten werden.

**Mechanische Compliance ohne Kooperation.** Ein Pflicht-Parameter beweist Verfügbarkeit, nicht Beobachtung oder Weiterleitung. Integrationstests an Prozess-, Worker-, Socket-, Provider- und Task-Grenzen bleiben nötig, um das Verhalten zu beweisen.

**Übermäßiges Einbeziehen synchroner oder fremder APIs.** Cancellation zu verlangen, wo keine asynchrone Arbeit existiert, fügt Rauschen hinzu und schwächt das Signal des Vertrags. Die Inventur dokumentiert, warum jede Operation von Tools erreichbar ist und eine Lebensdauer trägt, bevor sie geändert wird.
