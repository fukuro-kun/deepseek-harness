# Agent Note: Jede Message wird als identifizierter immutabler Wert erzeugt
[English](2026-07-28-identified-immutable-message-values.md) | [中文](2026-07-28-identified-immutable-message-values.zh.md) | Deutsch

Status: implemented


## Problem

Der Harness hatte mehrere message-förmige Repräsentationen mit unterschiedlichen Identitätsregeln. Agent-Input erhielt eine Inbox-Korrelations-ID nur dann, wenn der Loop ihn akzeptierte, während durable User-Messages, Assistant-Messages, Tool Results und Model-Request-Messages keine Identität haben konnten. Prompt-Admission saß daher zwischen Erzeugung und Identität, und äquivalenter Content wurde über Live-Events, durable Events und Model Requests hinweg kopiert, ohne dass ein Wert die Message über ihre gesamte Lebensdauer benannte.

Das machte Identität zu einem Routing-Side-Effect statt zu einer Message-Invariante. Producer konnten vor dem Agent-Call nicht auf eine Message verweisen, Prompt-Hooks erhielten Content und Source getrennt, und spätere Projektionen mussten eine Message rekonstruieren und gleichzeitig entscheiden, ob eine ID existierte. Auch Immutabilität begann an unterschiedlichen Grenzen: Manche Inputs wurden vom Loop gefroren, manche erst durch den Session-Append, und Provider-produzierter Assistant-Output nutzte eine separate Shape, die Provider, Model und Replay-State trug.

## Entscheidung

`@deepseek-ai/dsh-llm` besitzt einen `Message`-Wert mit required `id`, `role`, `content` und `source`. `MessageId` ist opaque und wird von User-, Assistant- und Tool-Result-Messages geteilt. Eine Message erhält ihre ID bei der Erzeugung, vor Inbox-Routing, Claim, Pre-Step-Rewriting, durable Append oder Request-Projektion. Dieselbe ID überlebt jede Repräsentationsgrenze.

`createMessage(input)` ist die kanonische rollen-generische Erzeugungsgrenze. Es minted eine `MessageId`, detacht die gelieferten Role-, Content- und Source-Werte und deep-freezt den vollständigen Wert vor dem Return. `createUserMessage({ content, source })` fixiert die User-Role für Prompt- und Context-Producer. `createAssistantMessage({ content, source })` fixiert sowohl die Assistant-Role als auch die Model-Source-Kind, sodass Model-Output-Producer nur Content plus Provider, Model und optionalen Replay-State liefern. Alle Erzeugungshelfer schließen eine Input-ID aus, damit Caller Erzeugung nicht versehentlich als Import ausgeben können. `freezeMessage(message)` ist die separate Import- oder Transformationsgrenze: Es detacht und deep-freezt eine Message, deren Identität bereits existiert, ohne einen Ersatz zu minten.

Die Message-Helfer leben in `dsh-llm` neben dem Basis-Message-Vokabular, weil ihre vollständigen Contracts nur von diesem Vokabular abhängen. Sie nutzen `dsh-brand`s zustandslosen `brandString()`-Konstruktor für `MessageId` und `dsh-util-values`' geteilte `deepFreeze()`-Implementierung, nachdem Input mit `structuredClone()` detacht wurde. `createToolResultMessage()` gehört zu den anderen Erzeugungshelfern: Es koppelt eine Tool-Call-ID an den exakten User-Role-Tool-Result-Block und die Source, ohne von Session-State oder Events abzuhängen. `dsh-session` konsumiert vollständige Messages, statt ihre Konstruktion zu besitzen.

Das `Agent`-Interface akzeptiert eine vollständige `UserMessage` über `followup`, `steer` und `inject`. Diese Operationen allozieren oder returnen niemals Identität; sie freezen einen importierten Wert, dessen ID der Caller bereits hält. Inbox-Claims und `agent/pre-step` erhalten diese Message direkt. Ein Content-Rewrite erzeugt einen gefrorenen Ersatz mit derselben ID, während ein zusätzlicher Context eine separat erzeugte `UserMessage` mit eigener ID ist.

Durable message-produzierende Events speichern vollständige Messages. `user/message` speichert seine `UserMessage` direkt; `assistant/message` und `tool/result` wrappen ihre rollen-spezialisierte Message neben Event-lokalen Positions-, Usage-, Failure- oder Presentation-Fakten. Session-Derivation returnt diese gefrorenen Werte, statt anonyme Messages zu rekonstruieren. Assistant-Assembly erzeugt eine Model-sourced Message, wenn eine Response abschließt, und Tool-Execution erzeugt eine Tool-sourced Message, wenn ein Result committed wird.

Jede Operation, die nur die Repräsentation einer bestehenden semantischen Message ändert, bewahrt ihre ID und returnt einen anderen gefrorenen Wert. Eine Operation, die eine neue semantische Message erzeugt, minted eine neue ID. Compaction-Content-Rewrites bewahren daher die umgeschriebene Tool-Result-Identität, während ein Summary-Checkpoint eine neue Message ist.

## Erwogene Alternativen

**IDs auf der Basis-Message optional halten.** Das würde die Fixture-Migration minimieren und Provider- oder Persistence-Shapes anonym bleiben lassen. Es würde aber auch die ursprüngliche Mehrdeutigkeit bewahren: Jeder Consumer müsste darauf branchen, ob Identität existiert, und kein Typ würde beweisen, dass Admission, Logging oder Projektion sie behielten.

**Die Agent-Zustellung die ID allozieren lassen.** Das hält Identität auf Inbox-Korrelation beschränkt, macht den Agent-Call aber zum frühesten Punkt, an dem ein Producer seine eigene Message benennen kann. Prompt-Konstruktion, UI-Attachments und synchrone Enqueue/Discard-Koordination bräuchten dann Content-Matching oder ein Out-of-Band-Token, bevor die Zustellung returnt.

**Jedes durable Event eine neue ID allozieren lassen.** Das gibt persistierten Messages Identitäten, bricht aber bewusst die Korrelation mit dem Live-Input und lässt replayte Requests so aussehen, als enthielten sie andere Messages. Identität gehört zum semantischen Wert, nicht zu jedem Envelope, der ihn trägt.

**Nur bei Agent- oder Session-Admission freezen.** Das vermeidet einen Erzeugungshelfer, hinterlässt aber ein identifiziertes mutables Intervall, in dem Caller-Code die mit einer ID assoziierte Bedeutung ändern kann. Die Entscheidung lässt „hat eine ID" und „ist ein immutabler Snapshot" zusammenfallen.

## Konsequenzen

Jeder Message-Producer muss explizit zwischen Erzeugung und Import wählen, und Tests konstruieren vollständige Werte statt partieller Content/Source-Records. Die UUID-Generierung zieht nach außen zum ersten semantischen Erzeugungspunkt, sodass deterministische Fixtures, die eine bestehende ID liefern, `freezeMessage()` statt `createMessage()` nutzen.

Live-Inbox-Events, durable Events, abgeleitete History und Model Requests können eine Message ohne Content-Gleichheit oder Envelope-spezifische IDs korrelieren. Pending-Input-Policy und UI-Attachment-Cleanup können `MessageId` vergleichen, bevor ein Turn existiert, während Claims diese Identität innerhalb des offenen Turns behalten. Deep Freezing verhindert, dass ein Producer, Hook oder Observer den Wert ändert, nachdem die Identität etabliert ist.

Die geteilte Repräsentation entfernt den alten `UserMessageData`/`AgentMessage`-Split und legt Provider, Model und optionalen Replay-State in typisierte Message-Sources. Event-Envelopes besitzen weiterhin Fakten, die keine Message-Semantik sind, etwa Turn- und Step-Position, Token-Usage, interne Tool-Failure-Identität und Presentation-Metadaten.

Die Message- und Helper-Unit-Tests pinnen sofortige Identität, Detachment, tiefe Immutabilität und die Bewahrung einer importierten ID. Agent-Loop-Tests pinnen Identität über Admission, Inbox-Lifecycle, durable Append, Content-Rewriting und Cancellation hinweg; Session-Tests pinnen gefrorene Derivation und identitätsbewahrenden Ersatz.

## Verwandtes

- [Unified Agent Delivery Routing und coalesced Injected Context](../../archived/architecture/2026-07-22-unified-send-and-coalesced-user-messages.md) — diese Note ersetzt deren Input-Repräsentations- und Agent-assigned-ID-Details, behält aber deren Routing-Entscheidung.
- [Reconstructable Requests](2026-07-05-reconstructable-requests.de.md) — das Session-Log bleibt die Autorität für jeden modell-sichtbaren Input.
