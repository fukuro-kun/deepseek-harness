# Agent Note: Initiierender-Agent-Scope über AsyncLocalStorage

Status: implemented

[English](2026-07-15-agent-initiator-scope.md) | [中文](2026-07-15-agent-initiator-scope.zh.md) | Deutsch

## Problem

Der Harness hat zwei nützliche, aber verschiedene Context-Begriffe. Ein Cordis-`Context` wählt Services, Registrierungs-Ownership und Lifetime; `agent.ctx` ist der flache Registrierungs-Scope, der einem lebenden Agent gehört. Agent- und Session-Identität beschreiben dagegen das Subject einer asynchronen Operation. Ein dynamisches `ctx.agent` im Sinne von „welcher Agent auch immer gerade läuft" würde diese Bedeutungen vermischen und scheitern, sobald ein Prozess Agents konkurrierend treibt.

Tiefe prozesslokale Infrastruktur braucht manchmal einen vertrauenswürdigen initiierenden Agent unterhalb expliziter Loop-, Tool- und Request-Parameter — etwa ein Host-aware Transport, ein Tracing-Helper, ein Logger oder ein Gateway-Client. Von jedem privaten Helper die Weitergabe von `agent` zu verlangen, fügt Wiederholung hinzu, während ein prozessglobales mutables Slot über `await` hinweg falsch ist. Modell-sichtbare Argumente sind ungeeignet, weil ein Modell keine vertrauenswürdige Session oder keinen Routing-Header wählen darf. Der Träger gehört zum Agent-Service, nicht zu optionalem modell-sichtbarem Kontext.

## Entscheidung

Der obligatorische `ctx.agents`-Service nutzt Node-`AsyncLocalStorage`, um den initiierenden Agent zu tragen. Er speichert den exakten `Agent` direkt, statt einen Ein-Feld-Frame einzuführen; ein separates privates Run-Token zeichnet geschachtelte Boundary-Lineage nur für Teardown-Buchhaltung auf und trägt keine Identität. Der [Core-Data-Katalog](../../../../docs/subsystems/core.de.md#initiating-agent) identifiziert den getragenen Typ.

`currentInitiator()` liest optional, `requireInitiator()` wirft `no initiating agent is active`, und `withInitiator(agent, operation)` bewahrt den exakten synchronen Wert oder das Promise der Operation. `withoutInitiator(operation)` errichtet eine löschende Boundary für Arbeit, die keinen Agent erben darf. Session bleibt abgeleitet als `agent.session`; Turn, Step, Tool-Call, `signal`, Modell, `cwd`, Sandbox und Autorisierung bleiben bei ihren bestehenden Ownern.

`AgentLoop` injiziert bereits `ctx.agents` und wrappt die komplette `runLoop`-Lifetime jedes konkreten Drivers in `agents.withInitiator(agent, ...)`. Seine Package-privaten Loop-, Turn-, Step- und Tool-Call-Orchestrierungseinstiege holen den exakten Agent aus `ctx.agents` zurück, leiten `agent.session` einmal ab und lassen operationslokale Helper ihn capturen, statt den konkreten Driver oder `Session` durch flache Interfaces zu forwarden. Ein Blatt-Helper behält einen schmalen `Session`-Parameter, wenn das sein tatsächliches Interface ist, statt einen breiteren `Context` nur für einen ambienten Lookup zu akzeptieren.

Konkurrierende Driver erhalten unabhängige Stores. Die Continuations eines Child-Drivers tragen das Child, während der Caller in seinem vorherigen Store fortsetzt, sobald `withInitiator()` zurückkehrt; das Active-Run-Tracking hält das zurückgegebene Promise im Teardown-Drain, bis es settled. Creation, Persistence-Load und unveröffentlichtes `setup(agentCtx, childAgent)` bleiben außerhalb der Driver-Boundary des Child: Von einem Parent initiierte Erzeugung läuft unter der Parent-Identität, während der explizite `childAgent`-Parameter das Child identifiziert.

Ambiente Identität ersetzt explizite Contracts nicht. `ToolExecution.agent`, `AssembleContext.agent`, der Agent-Parameter von `AgentSetup`, `GenerateOptions.sessionId`, Job-Ownership, Parent-/Child-Requests, Approval- und Hook-Subjects, `cwd`-Auswahl, Cancellation, Worker-/Prozess-Messages, Persistence-Records und Wire-Identität bleiben explizit. Eine Remote-Grenze materialisiert die benötigte Identität in ihren getypten Request, weil ALS prozesslokal ist.

`AgentRegistry` besitzt einen geordneten Initiator-Lifecycle. Teardown rejected zuerst neue Boundaries; das Entfernen von `ctx.agents` drainet dann injizierte Dependents wie AgentLoop, und die Registry wartet auf aktive Returned-Promise-Boundaries, bevor sie `AsyncLocalStorage.disable()` aufruft. Wenn die geerbte Async-Chain einer Boundary das Unload eines besitzenden Cordis-Fibers startet, gibt die private Run-Token-Lineage jene geschachtelte Boundary-Chain aus dem Drain frei — das verhindert, dass Teardown auf sich selbst wartet, während fremde Boundaries weiterhin drainen. `currentInitiator()` und `requireInitiator()` bleiben über eine retained In-Flight-Service-Referenz nutzbar, während der gewöhnliche Drain läuft; nach dem Disposal werfen Initiator-Methoden `agent initiator scope is disposed`. Root-Context-Disposal kann Geschwister-Fiber-Teardown konkurrierend starten — Active-Boundary-Counting bleibt daher zusätzlich zur Cordis-Dependency-Ordnung nötig.

Initiator-Scope besitzt keine detached Arbeit: Registry-Drain tracked nur das Promise, das `withInitiator()` oder `withoutInitiator()` zurückgibt. Asynchrone Ressourcen, die innerhalb einer Boundary erzeugt werden, erben ihren Store, bis sie settlen oder ALS deaktiviert wird — ihr besitzender Seam muss nicht-zurückgegebene Arbeit also explizit stoppen. Agent-eigene Foreground-Arbeit gibt ihre Lifetime zurück und behält ihren Cancellation-Contract. Unabhängige Timer, Queues und Deployment-Infrastruktur starten unter `withoutInitiator(operation)`; Queue-, Worker-, Prozess- und Wire-Grenzen serialisieren Identität, statt ALS-Propagation zu erwarten.

Ein Host-aware Transport darf einen Deployment-eigenen Header wie `X-Harness-Session-Id` aus `ctx.agents.requireInitiator().session.id` ableiten; der Header fehlt in modell-sichtbarem Schema und Argumenten. Kein Produktions-MCP- oder -Web-Transport übernimmt in dieser Entscheidung einen solchen Header. Ein Test-Double-Transport beweist die vertrauenswürdige Grenze, ohne einem bestehenden provider-neutralen Seam Host-Routing-Policy zuzuweisen.

Diese Entscheidung erweitert den [Agent-Registrierungs-Scope-Contract](2026-07-08-agent-scope-contexts.de.md) und sein [Runtime-Design](2026-07-12-agent-scope-runtime-design.de.md); sie ändert deren statische `agent.ctx`-Bedeutung nicht. Die [Explizite-Runtime-Identity-Entscheidung](2026-08-31-explicit-agent-runtime-identity.md) begrenzt Initiator-Scope weiterhin auf private asynchrone Chains, während Lifecycle-, Ownership-, Event- und Wire-Interfaces ihre Subjects direkt tragen.

## Verifikation

Agent-Service-Tests pinnen optionale und Pflicht-Reads, exakte synchrone und Cross-Realm-Promise-Identität, Intrinsic-Promise-Settlement-Beobachtung, überlappende, geschachtelte und gelöschte Boundaries, Wiederherstellung nach Throw oder Reject, gewöhnliche und reentrante Drain-Reihenfolge sowie Retained-Reference-Fehler. AgentLoop-Integration pinnt konkurrierende und geschachtelte Driver, agentlose Calls, AgentRegistry-Restart, Root-Teardown und Package-private Loop- und Tool-Scheduling über den ambienten Lookup. Composition-, Module-Graph-, Build- und Runtime-Closure-Checks halten `ctx.agents` über das Default-Bundle, die SDK-Spine, die Python-Runtime-Closure und direkte AgentLoop-Harnesses verdrahtet, ohne einen weiteren Provider.

Ein Test-Double-Host-aware-Transport leitet `X-Harness-Session-Id` intern ab und verifiziert, dass Tool-Schema und geloggte Argumente kein Identitätsfeld enthalten. Der Service drainet bewusst keine asynchrone Arbeit, die nicht im von der Boundary-Operation zurückgegebenen Promise enthalten ist; jene Arbeit unterliegt weiterhin dem expliziten Stop-Contract ihres Owners.

## Erwogene Alternativen

**Agent durch jede Funktion reichen.** Öffentliche, Worker-, Prozess-, Persistence- und Wire-Grenzen tun dies weiterhin, aber von jedem prozesslokalen privaten Helper Agent zu verlangen, fügt repetitive Weitergabe hinzu, ohne Vertrauen zu verbessern. ALS ist auf die asynchrone Chain innerhalb jener expliziten Grenzen beschränkt.

**Ein dynamisches `ctx.agent` exponieren.** Context trägt Registrierungs-Ownership, kein Domain-Subject. Ein Accessor für den ausführenden Agent würde Registrierungs- und Execution-Scopes vermischen und konkurrierendes Verhalten überraschend machen.

**Einen separaten `ctx.agentExecution`-Service hinzufügen.** Der Träger hat kein unabhängiges Backend, keine Konfiguration und keinen eigenen Identitätstyp: Er speichert denselben `Agent`, den `ctx.agents` bereits besitzt, und AgentLoop hängt bereits von diesem Service ab. Ein zweiter obligatorischer Provider würde Package-, Composition-, Lifecycle-, Generated-Catalog- und Test-Harness-Verdrahtung hinzufügen, ohne eine reale Capability zu trennen.

**Einen benannten oder vollständigen Runtime-Frame speichern.** Ein `{ agent }`-Frame mit einem Feld wrappt den Wert nur, während Agent, Session, Inbox, Cancellation, Turn, Step, Tool-Execution und Persistence bereits autoritative Owner haben. Mehr Felder würden stale Snapshots und einen weiteren Lifecycle schaffen; `Agent` direkt zu tragen hält die Boundary benannt durch ihre Methoden, ohne State zu duplizieren.

**Ein Step-`AbortSignal`, `cwd`, Sandbox oder Autorisierung aufnehmen.** Deren Lifetimes und Autorität passen nicht zur Driver-Boundary, und ihre bestehenden Seams reichen sie bereits explizit. Das Hinzufügen einer Control-Capability erfordert eine separate Entscheidung und einen geschachtelten Lifecycle-Contract.

**Ein prozessglobales `currentAgent` nutzen.** Konkurrierende Agents und Subagents überschreiben einander über awaited Continuations hinweg — ein mutables Global ist daher nur unter einer Serialisierungsgarantie korrekt, die der Harness nicht gibt.

**Identität aus modell-sichtbaren Argumenten ableiten.** Modell- oder User-Input kann nicht vertrauenswürdig sein, um Session-, Tenant- oder Sandbox-Routing zu wählen.

**Routing-Identität zu jedem Capability-Seam hinzufügen.** Das verteilte Hosting-Anliegen über provider-neutrale APIs. Eine Host-aware Implementierung besitzt ihren Transport-Header, während öffentliche Grenzen explizit bleiben.

## Konsequenzen

Tiefe Infrastruktur gewinnt einen vertrauenswürdigen prozesslokalen initiierenden Agent, ohne bestehende Tool- und Capability-Requests zu erweitern. Konkurrierende und geschachtelte Driver isolieren automatisch, AgentLoop gewinnt keinen weiteren obligatorischen Service, und HMR-/Root-Disposal erreicht Quiescence, bevor ALS deaktiviert wird.

Die Abhängigkeit ist implizit in Funktionssignaturen und trägt ein capability-tragendes Agent-Objekt. Consumers müssen sie auf querschnittliche Infrastruktur beschränken, ambiente Präsenz weder als Liveness noch als Autorisierung behandeln und explizite Cancellation- und Ownership-Prüfungen behalten. ALS hat außerdem einen Always-on-Propagation-Preis und überquert keine Worker-, Prozess-, HTTP- oder Durable-Queue-Grenzen.

Das Teardown-Design akzeptiert bewusst Nodes [Stability-1-(Experimental)](https://nodejs.org/api/async_context.html#asynclocalstoragedisable)-`AsyncLocalStorage.disable()`-Abhängigkeit. Node verlangt `disable()`, bevor eine ALS-Instanz garbage-collected werden kann — relevant, wenn HMR AgentRegistry-eigene Instanzen ersetzt; der Service-State-Guard verhindert, dass eine spätere Boundary die Instanz nach dem Disposal wieder betritt.

Der Scope trägt bewusst nur den Agent und lässt Turn, Step, `signal`, `cwd`, Sandbox und Autorisierung weg. Ein realer Consumer, der bestehende explizite Felder nicht nutzen kann, muss jede Verfeinerung separat begründen; ein stale kopiertes Feld darf höchstens Telemetrie falsch labeln, niemals Kontrolle gewähren.
