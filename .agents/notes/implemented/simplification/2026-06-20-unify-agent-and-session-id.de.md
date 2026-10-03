# Agent Note: Agent-Id und Session-Id vereinheitlicht

Status: implemented

[English](2026-06-20-unify-agent-and-session-id.md) | [中文](2026-06-20-unify-agent-and-session-id.zh.md) | Deutsch

## Problem

Ein lebendes Agent/Session-Paar braucht eine Identität für Registry-Routing, Event-Sourcing und Persistenz. Der Factory unabhängige `agentId`- und `sessionId`-Eingaben zu geben, würde Paarungen erlauben, die kein Produktionspfad nutzen kann, und jeden Consumer zwingen, zwischen zwei Namen für denselben Lifecycle zu wählen oder zu übersetzen.

ACP verwendet denselben Wert für beide Identitäten. Stdio und Hooks arbeiten ebenfalls auf dem Session-Event-Stream und brauchen den zugehörigen Live-Agent direkt; kein Produktionspfad hängt ein Live-Agent-Objekt an mehrere Sessions oder treibt eine Session über mehrere Agent-Ids.

Die [Agent-Scope-Runtime](../architecture/2026-07-12-agent-scope-runtime-design.de.md) nutzt eine `AgentCreationTransaction` für Create und Resume, und Agent/Session-Einträge teilen dieselbe Final-Entry-Collision-Regel. Eine zweite Identität würde keine separate Liveness, kein separates Rollback oder Quiescence darstellen; sie würde nur API- und Übersetzungs-State um dieselbe Transaction herum hinzufügen.

Die Session-Identität hat ebenfalls ein einziges Zuhause in `Session.header.id`; `Session.id` ist ein abgeleiteter Accessor, kein unabhängiger State, der doppelte Validierung braucht.

## Decision

Die Registry-Id eines Agents ist gleich seiner Session-Id. `CreateAgentOptions` akzeptiert ein `sessionId`, das für beide finalen Registry-Einträge verwendet wird; Resume registriert den Agent unter `resumeSessionId`; In-Process-Subagent-Erzeugung nutzt die Child-Session-Id; und `Session.id` wird von `header.id` abgeleitet. Ein Remote-ACP-Lauf hat kein lokales Agent/Session-Paar: Er behält eine vom Parent geprägte Lifecycle-Id, während die wire-lokale Session-Id des Child-Servers privat für ACP-Aufrufe bleibt. Die bestehende Creation-Transaction, die Final-Entry-Collision-Checks und die Exact-Entry-Detach-Semantik bleiben; Maps und Felder, deren einzige Aufgabe die Übersetzung zwischen lokalen Ids war, sind verschwunden.

Der config-getriebene Pfad behält `agents[].id` als stabiles Konfigurationslabel, nicht als Live-Routing-Identität. Ein gewöhnlicher Neustart prägt die kombinierte Id `${label}-session-${randomUUID()}`, damit durable Restarts nicht kollidieren. Eine gekoppelte App darf eine exakte `sessionId` vorab prägen und übergeben: Die erste Nutzung erzeugt sie, während ein AgentLoop-Remount mit bereits vorhandenem Persistence-Service die materialisierte Historie unter derselben Identität resumed. `resumeSessionId` verlangt dagegen eine existierende persistierte Identität. Die beiden Exakt-Id-Eingaben schließen sich gegenseitig aus. Stdio nutzt die Resume-or-Create-Form, damit sein config-erzeugter Agent und die UI über Loop-Reloads hinweg eine opake Identität teilen, statt aus einem Prefix zu raten. Logs dürfen das stabile Label verwenden, während alle Live- und durable Lookups das eine `SessionId` verwenden.

`agent/created` und `agent/disposed` bleiben. Sie sind gepaarte Publication-Lifecycle-Events, keine Identitäts-Aliase; jede spätere consumer-freie Entfernung braucht nach einer neuen Suche einen eigenen Vorschlag.

## Alternatives considered

**Getrennte Routing- und Log-Identitäten behalten.** Ein stabiles konfiguriertes Label plus eine frische durable Konversation ist nützlich, erfordert aber keine zwei Live-Identitäten: Das Label kann Konfigurations-/Anzeige-Metadatum bleiben, während das kombinierte per-Run `SessionId` Routing und Persistenz besitzt. Zwei Ids zu behalten würde Übersetzungs-Maps bewahren und unmögliche Paarungen erlauben, ohne Lifecycle-Fähigkeit hinzuzufügen.

## Verification

- Agent-Create/Resume und Subagent-Erzeugung tragen eine Identität, und `Session` speichert sie an einer Stelle.
- Die Creation-Transaction behält Final-Entry-Collision, Exact-Entry-Detach, Rollback- und Quiescence-Abdeckung ohne identitätsspezifischen Lifecycle-State.
- ACP, Stdio, Hooks, Bash-Ownership, Persistenz und Lineage nutzen das geteilte `SessionId` direkt. Das ACP-Subagent-Backend prägt seine Lifecycle-Id im Parent-Namespace, weil die zurückgegebene Session-Id eines Child-Servers nur server-lokal gilt; die ACP-Bridge verifiziert exakte `Agent`-Ownership aus der Forward-Session-Map; und JSON-RPC forwardet nur Lifecycle-Events, deren service-gesnapshottetes `local`-Flag true ist, erhält den delegierenden Parent aus dem Scoped-Event-Carrier und hält keinen Child-Identity- oder Lineage-Cache.
- Die config-getriebene Resume-or-Create-Policy ist explizit und über einen durable Restart hinweg abgedeckt.
- Eine Production-Listener-Suche behielt `agent/created`/`agent/disposed` und ihre Publication-Semantik.

## Consequences

Das schließt latente Multi-Session-Actor- und Session-Handoff-Designs aus und macht die persistierte, vom Client gewählte Session-Identität zur Registry-Identität. Falls eine getrennte Routing-Identität zur realen Anforderung wird, braucht sie ein explizites Lifecycle-Design statt eines unbeschränkten caller-gelieferten Paars.
