# Agent Note: Adjacent Agents teilen sich eine Steer-`send_message`-Operation
[English](2026-08-27-adjacent-agent-steer-messaging.md) | [中文](2026-08-27-adjacent-agent-steer-messaging.zh.md) | Deutsch

Status: implemented


## Problem

Continuable Agents nutzten ursprünglich richtungsspezifische Modell-Steuerungen. Ein parent rief `send_message({ subagent_id, message })` auf, das an eine FIFO-`followup`-Service-Operation delegierte. Ein child erhielt stattdessen ein child-scoped `report({ output })`-Tool, einen `tool:report`-system-prompt-Abschnitt und deployment-gewählte stille oder weckende Zustellung. Die Tools beschrieben eine adjacent-Agent-Operation über unterschiedliche schemas, service-Pfade, Herkunft und Scheduling.

Ein continuable child besitzt seine eigene Session, daher erhält sein parent nicht automatisch dessen transcript, tool-Ausgabe oder reasoning. Der Rückweg muss daher explizit und wiederholbar bleiben: ein child kann Fortschritt senden, bevor es fertig ist, nach dem Senden verfügbar bleiben oder scheitern, bevor es kooperieren kann. Jede finale assistant-Nachricht in ein implizites Ergebnis zu verwandeln würde turn-Abschluss mit modellgewählter Kommunikation vermengen und keine abnormalen Enden abdecken.

Das Nur-child-Tool und der system-prompt-Abschnitt gingen außerdem jedem geerbten fork-turn voraus. Sie ließen den request head eines continuable fork child von dem seines parents abweichen, bevor die Historie kam, die der fork gerade wiederverwenden soll, und zwangen den provider, den gesamten kopierten transcript erneut zu prefüllen.

## Entscheidung

`SubagentRuntime.sendMessage(sender, targetId, content, { signal })` ist die einzige öffentliche modellverfasste Nachrichtenoperation. Der continuation manager akzeptiert nur den exakten live sender und ein Ziel auf einer adjacent edge:

- parent zu direktem continuable child, autorisiert durch den durable `SessionHeader.parentSession` des child;
- residentes continuable child zu seinem exakten live direkten parent, autorisiert durch die Activation des child.

Geschwister, Selbst-Ziele, Vorfahren jenseits einer edge, stale Agent-Objekte, unbekannte Ziele und one-shot-children sind keine Alternativrouten. Die Operation hat keine caller-gelieferte Quelle, keinen delivery mode, kein offline-parent-Postfach und keinen provider dispatch.

Jede akzeptierte Nachricht nutzt `Agent.steer()`. Ein laufendes Ziel empfängt sie an der nächsten step-Grenze; ein idle-Ziel startet einen turn. Ein abwesendes direktes child wird über den bestehenden continuation-Lifecycle kalt-resumed, bevor dieselbe Steer-Zustellung erfolgt. Der manager behält die waking-send-Abrechnung, damit ein continuation-verwaltetes Ziel nicht zwischen synchroner inbox-Einfügung und driver-Zulassung settle kann.

Jede Richtung nutzt eine durable Quelle. Der service leitet `senderSessionId` vom autorisierten Agent ab und rahmt den modellsichtbaren Inhalt als `Agent <sender-id> sent a message:`, sodass Attribution nicht von Autorität abweichen kann.

```ts
import type { SessionId } from '@deepseek-ai/dsh-session'

interface AgentMessageSource {
  readonly kind: 'agent-message'
  readonly form: 'relay'
  readonly senderSessionId: SessionId
}
```

### Ein model tool und eine Rückgabe-Instruktion

Das global registrierte model tool ist richtungsneutral und hat ein festes schema:

```ts
interface SendMessageInput {
  readonly agent_id: string
  readonly message: string
}
```

Parents und children erben dieselbe Definition in derselben registry-Reihenfolge. Die Standarddefinition trägt eine prozessstabile interne Identität, die ein gleichnamiges scoped tool nicht erfüllt. Ein child-`toolFilter` darf das geerbte tool explizit entfernen, und ein scoped Ersatz darf andere Semantik liefern; keiner dieser Fälle erhält die Standard-Aufrufinstruktion. Bleibt das Standard-tool sichtbar, hängt der continuation manager die JSON-kodierte direkte parent-id und die Instruktion an die initiale user task des child an, vor dem Abschluss ein eigenständiges Ergebnis zu senden, plus frühere verwertbare Befunde. Bei einem fork child folgt diese task dem geerbten abgeschlossenen-turn-Präfix; kein Nur-child-system-prompt-Abschnitt und kein tool-schema gehen diesem Präfix voraus.

Die Instruktion ist eine Leitlinie, keine settlement-Durchsetzung. Das Senden beendet den turn des child nicht, null oder mehrere Aufrufe bleiben mechanisch gültig, und die runtime lehnt ein child nie für Schweigen ab. Der manager-geführte `subagent-settled`-Hinweis bleibt unbedingt und separat attributiert, weil er aufzeichnet, wie eine Activation endete, und terminale Ausgabe bewahrt, wenn das child nicht kooperieren kann.

Menschliche Browser-prompts sind keine modellverfassten Agent-Nachrichten. Der remote-prompt-Pfad behält eine private Queue-Zustellung, damit jeder menschliche prompt ein eigener turn bleibt. Interrupt-Verhalten und settlement-Zustellung bleiben unabhängig.

### Vollständige Entfernung und Bedingung für Wiedereinführung

Das eigenständige Paket `@deepseek-ai/dsh-tool-subagent-report`, das `report`-schema, der `tool:report`-prompt-Abschnitt, die `reportDelivery`-Konfiguration, die report-spezifische Nachrichtenquelle, Katalogeinträge, Kompositionszeilen und supported-behavior-Snapshots sind abwesend. Das vereinheitlichte tool gibt die empfängerlose child-Abkürzung und die frühere Fähigkeit auf, dass ein strukturelles Rückgabe-tool eine explizite child-allow-list überlebt. Diese Fähigkeiten kehren nur zurück, wenn ein konkreter Anwendungsfall Semantik verlangt, die eine adjacent `agent_id` und festes Steer nicht ausdrücken können; ihre Wiedereinführung erfordert eine distinkte Modelloperation und prefix-Kostennachweis, nicht einen Alias über `sendMessage()`.

## Erwogene Alternativen

**`followup` behalten und child-to-parent-Routing hinzufügen.** Der Name verspricht einen späteren turn und erbt `Agent.followup()`-Semantik. Er würde das gewählte nearest-step-Verhalten verschleiern und einen parent-zentrischen Namen für eine richtungsneutrale capability bewahren.

**Einen empfängerlosen `report`-Wrapper über `sendMessage()` behalten.** Das bewahrt eine bequeme child-Abkürzung und lässt eine scope-lokale Registrierung die globale tool-Filterung überleben. Es verliert, weil das separate schema und prompt eine Operation duplizieren, die request heads von parent und child unterscheiden und äquivalente Richtungen erneut driften lassen.

**`report` global machen.** Roots, one-shot-children, remote-children und agentlose callers können keinen report-Empfänger ableiten. Es global anzubieten ließe die schema-Sichtbarkeit mit der Autorität uneins sein, während `send_message` den Empfänger bereits explizit macht.

**Jede finale Nachricht eines child in ein implizites send verwandeln.** Ein langlebiges child hat in einem turn möglicherweise nichts Sinnvolles zu senden und in einem anderen mehrere Befunde. Automatische Zustellung würde modellverfasste Kommunikation mit der settlement-Abrechnung der runtime verschmelzen und könnte den unbedingten Hinweis bei Fehlern, Abbruch oder token-Erschöpfung nicht ersetzen.

**Sich nur auf die tool-Beschreibung verlassen.** Eine tool-Beschreibung hilft, nachdem das Modell dieses tool erwägt; der Fehlerfall ist ein child, das sich für fertig hält, ohne irgendeinen Rückruf zu erwägen. Initial-task-Anleitung erreicht diese Entscheidung, ohne das geerbte system- oder tool-Präfix zu ändern.

**Stille Zustellung als deployment-Policy behalten.** Eine stille modellverfasste Nachricht kann akzeptiert werden, während ein idle-Ziel sie nie liest. Festes Steer gibt beiden Richtungen eine Zustellungsbedeutung und bewahrt die akzeptierte Reihenfolge mit späteren settlement-Hinweisen.

## Konsequenzen

- Modell-consumer exponieren eine `send_message({ agent_id, message })`-Definition für parents und children, ohne modellgewählten Queue- versus Steer-Parameter.
- Der continuation manager bleibt alleiniger Owner von adjacency-Autorisierung, residency, cold resume, waking admission und teardown races.
- Akzeptierte Nachrichten dürfen den laufenden turn eines Ziels verlängern; gemeinsam wartende Nachrichten teilen next-step-FIFO-Reihenfolge.
- Caller-Abbruch besitzt die Arbeit nur bis zur inbox-Annahme und widerruft weder eine akzeptierte Nachricht noch disposed das Ziel.
- Die initiale task trägt JSON-kodierte dynamische parent-Adressierung nach einem fork-Präfix, während request-head-system-prompt und tool-Reihenfolge wiederverwendbar bleiben.
- Menschliche prompts, settlement-Hinweise, QueueDock und die one-shot-fork-Policy des base bundle bleiben separate Entscheidungen.

Diese Entscheidung konsolidiert und entfernt die vollständig abgelösten report-tool- und child-report-obligation-Einträge. Sie löst die `followup`-Namenswahl in [Intent-named subagent continuation operations](../../archived/simplification/2026-07-27-intent-named-subagent-continuation-operations.md) ab und bewahrt die accepted-order-Garantie in [Child Agent messages precede their settlement notices](../bug-fix/2026-08-17-subagent-message-settlement-ordering.de.md).
