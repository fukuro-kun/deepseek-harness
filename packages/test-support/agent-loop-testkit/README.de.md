---
description: "Voraussetzungs-Mounting, produktive AgentLoop-Treiber und explizite Inbox-Stubs für agent-loop-Tests."
kind: "package-library"
---

# @deepseek-ai/dsh-agent-loop-testkit
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

Verwenden Sie `dsh-agent-loop-testkit`, um AgentLoop-Tests die Standardvoraussetzungen und einen produktiven Loop-Treiber zu geben, ohne das Setup zu wiederholen. Das Harness erzeugt echte Agents und stellt das Claimen von Inbox-Eingaben für Tests dauerhafter Events, Recovery, Benachrichtigungen und Claim-Verhalten bereit. Für Consumer-Tests, die nur die Warteschlange bearbeiten müssen, wählen Sie den prozesslokalen Inbox-Stub; wählen Sie die Fail-Fast-Inbox, wenn ausstehende Eingaben niemals berührt werden dürfen. Tests bleiben Eigentümer von Adaptern, optionalen Plugins, Ladereihenfolge und Context-Disposal, und das Paket fügt kein modellsichtbares Verhalten hinzu.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Dieses Paket gibt einem AgentLoop-Test eine funktionierende Service-Topologie und hält die Wahl zwischen produktivem Inbox-Verhalten und einem strukturellen Stub explizit.

### Einen produktiven Agent treiben

Verwenden Sie `mountAgentLoopTestHarness()`, wenn der Test dauerhafte Inbox-Events, Projektions-Recovery oder -Validierung, Live-Inbox-Benachrichtigungen oder Claims des Loop-Treibers abdeckt. Mounten Sie alle ladeordnungs-sensitiven Consumer nach den Voraussetzungen und vor dem Erzeugen des Agent. Der Context besitzt den Loop und jeden vom Harness zurückgegebenen Agent.

```ts
import { Context } from '@deepseek-ai/cordis'
import { SessionId, type UserMessage } from '@deepseek-ai/dsh-session'
import {
  mountAgentLoopTestDependencies,
  mountAgentLoopTestHarness,
} from '@deepseek-ai/dsh-agent-loop-testkit'

const ctx = new Context()

await mountAgentLoopTestDependencies(ctx)
// Register the test adapter and any load-order-sensitive plugins here.
const harness = await mountAgentLoopTestHarness(ctx)
const agent = await harness.create(SessionId('test-agent'))
declare const message: UserMessage

agent.inbox.append('next-turn', message)
const admitted = harness.claim(agent, 'next-turn', 1)
```

Der Dependency-Helper reicht system-prompt- und tool-registry-Konfiguration über `options` weiter und stellt keine Test-Defaults über die eigenen Defaults dieser Services hinaus bereit. Ein Plugin-Ladefehler lässt den Helper-Aufruf ablehnen; Services, die früher in der Sequenz aktiviert wurden, bleiben im Besitz des Context und werden beim Disposen des Context abgebaut.

### Einen strukturellen Agent-Stub bauen

Verwenden Sie `createInboxStub()`, wenn das Testsubjekt mutable Pending-Listen braucht, aber weder Durability, Projektions-Validierung, Live-Inbox-Benachrichtigungen noch die Claim-Policy des Treibers ausübt. Der Stub implementiert die öffentlichen Queue-Operationen mit zwei prozesslokalen Arrays und schreibt niemals in eine Session. Verwenden Sie `unsupportedInbox()`, wenn das Testsubjekt ausstehende Eingaben nicht berühren darf; jede Mutation wirft bei der ersten unerwarteten Abhängigkeit.

```ts
import { createInboxStub } from '@deepseek-ai/dsh-agent-loop-testkit'

const agent = {
  // ...
  inbox: createInboxStub(),
}
```

### Wann verwenden

Verwenden Sie die Dependency- und Loop-Helper für Tests, deren Subjekt der produktive Loop oder das dauerhafte Inbox-Verhalten ist. Verwenden Sie den strukturellen Stub für Consumer-Domain-Tests, die nur die Warteschlange bearbeiten müssen. Mounten Sie Dependencies direkt, wenn ein Test Service-Injection-Fehler oder Teil-Topologien untersucht, denn der Helper verbirgt genau die Verdrahtung, die solche Tests kontrollieren müssen.

### Was schiefgehen kann

Das Harness mountet keinen LLM-Adapter. Registrieren Sie einen Adapter, bevor Sie Arbeit senden, die eine Modellanfrage starten würde. Disposen Sie den zugehörigen Context nach jedem Test, damit Agents quiescence erreichen und ihre scoped Registrierungen abgebaut werden.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erläutert das Design der Test-Utilities; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig beschrieben.

### Design

`mountAgentLoopTestDependencies` mountet sechs Service-Plugins in fester Abhängigkeitsreihenfolge — LLM, Session, session-projection-Registry, system-prompt-Registry, tool-Registry, dann agent-Registry — und stoppt vor `AgentLoop`, sodass der Aufrufer die Ladereihenfolge des Loops kontrolliert. `mountAgentLoopTestHarness` mountet das öffentliche Produktions-Plugin, erzeugt Agents über dessen Service und stellt die Claim-Operation des Produktionstreibers bereit, ohne die konkrete Inbox-Klasse oder Projektionsdefinition des Loops zu exportieren. [`src/inbox.ts`](src/inbox.ts) enthält nur den prozesslokalen mutablen Stub und den Fail-Fast-Platzhalter für nicht unterstützte Operationen; es besitzt keine Projektions- oder Durable-Event-Implementierung. Das Mounting und die Treiberimplementierung liegen in [`src/index.ts`](src/index.ts). Es wird kein Invariant-Companion veröffentlicht, weil das Paket nur Test-Helper besitzt und keine unabhängigen Produktionsbeobachtungen hat, die auseinanderlaufen könnten.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn das Verhalten auf Paketebene nicht ausreicht. Sie führen vom Loop zu den Services, die der Helper mountet, und zu den Tests, die ihn nutzen.

- [agent-loop-Paket](../../core/agent-loop/README.de.md) — der konkrete Loop, den dieser Helper für Produktionsverhalten mountet.
- [Session-Paket](../../core/session/README.de.md) — das dauerhafte Event-Log, das das produktive Inbox-Verhalten nutzt.
- [LLM-Paket](../../llm/llm/README.de.md) — die LLM-Laufzeit und das Adapter-Interface, die der Helper vorbereitet.
- [Test-Policy](../../../docs/testing.de.md) — die Abdeckungsebenen, denen diese Tests dienen.
- [test-support-Gruppenkarte](../README.de.md) — Geschwister-Harnesses und Support-Pakete.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da diese Test-Utilities Modellanfragen weder zusammenstellen noch verändern.

#### KV-Cache-Effekt

Keiner; das Paket selbst sendet keine Provider-Anfrage.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>

Diese Grenzen bestimmen, was die Utilities nicht teilen. Es sind aktuelle Paketbeschränkungen, kein Aufgabenrückstand.

- **Nur die obligatorische Voraussetzungs-Spine wird geteilt** — Adapter, optionale Plugins, szenariospezifische Ladereihenfolge und Context-Teardown bleiben im Besitz des Aufrufers.
- **Das Produktions-Harness hat keinen Adapter-Default** — Tests, die den Loop starten, müssen die Route registrieren, die sie ausüben.
- **Der mutable Inbox-Stub ist nur prozesslokal** — verwenden Sie einen vom Harness erzeugten Agent, sobald dauerhafte Events, Projektions-Recovery oder -Validierung, Live-Benachrichtigungen oder Claim-Policy eine Rolle spielen.
- **Die unsupported-Inbox akzeptiert keine Mutationen** — verwenden Sie den mutablen Stub oder einen vom Harness erzeugten Agent, sobald ausstehende Eingaben Teil des Testsubjekts sind.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
