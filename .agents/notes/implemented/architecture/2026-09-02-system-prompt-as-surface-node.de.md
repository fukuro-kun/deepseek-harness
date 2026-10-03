# Agent Note: Der System-Prompt ist Surface-Node 0
[English](2026-09-02-system-prompt-as-surface-node.md) | [中文](2026-09-02-system-prompt-as-surface-node.zh.md) | Deutsch

Status: implemented


## Problem

Ein außerhalb der Surface gehaltener System-Prompt hat eine andere durable Repräsentation als jede andere Message, die das Modell liest. Konversations-Messages sind Surface-Events (`user/message`, `assistant/message`, `tool/result`), die `Session.deriveMessages()` in seq-Reihenfolge faltet; ein als `system`-Feld des Log-only-`request/header`-Snapshots gespeicherter Prompt muss von jedem Serializer als Wire-Message 0 vorangestellt werden. Die [Agent Note zu rekonstruierbaren Requests](2026-07-05-reconstructable-requests.de.md) machte beide Hälften durable, aber dieses Layout hinterlässt einen modell-sichtbaren Fakt mit zwei Homes: die Surface besitzt die Messages, der Header besitzt die Message davor.

Diese Teilung zwingt jeden Leser von „was hat das Modell gesehen" dazu, zwei Quellen zu verbinden: der Compaction-Summarizer kopiert den Header-Prompt vor die abgeleiteten Messages der Region, `dsh-token-meter` schätzt den System-Prompt aus dem Header, während jede andere Message aus der Surface bepreist wird, und die Web-Request-Prompt-Card, die Trajectory-Ansicht und der `{{system}}`-Platzhalter des Snapshot-Normalizers lesen den Header jeweils selbst. Die Change-Detection ist genauso geteilt: ein `headerEquals`, das `system` Byte für Byte neben `config` und `tools` vergleicht, macht eine Prompt-Änderung und eine Tool-Änderung im Log ununterscheidbar (`request/header`-Reason `change`), obwohl es verschiedene Operationen auf der Konversation sind.

Die Teilung blockiert auch den nächsten Schritt. Ein Modell, das eine `system`-Message mitten in der Konversation als Prompt-Ersetzung akzeptiert, braucht vom Harness ein Anhängen einer System-Role-Message an die History; wenn der Prompt im Header lebt, gibt es keine Surface-Repräsentation zum Anhängen, und der Header müsste per Sonderfall eingefroren werden. Die [In-History-Ersetzungsentscheidung](../feature/2026-09-02-in-history-system-prompt-replacement.de.md) hängt von dieser Note ab.

## Entscheidung

Der System-Prompt lebt auf der Surface. Er ist ein gewöhnliches Surface-Event, `system/message`, und jede Prompt-Lifecycle-Operation ist eine der beiden bestehenden `SurfaceOp`-Varianten, angewandt auf diesen Event-Typ. Der Wire-Request bleibt unverändert: der Surface-Fold liefert die Message-Liste, die die Serializer senden, mit der System-Message zuerst.

### Das Event

`system/message` ist Mitglied von `SurfaceEventType` neben `user/message`, `assistant/message` und `tool/result` (`packages/core/session/src/types.ts`). Sein Payload spiegelt `tool/result`: `{ turn, step, message }`, wobei `message` eine `SystemMessage` mit `role: 'system'` ist, ein Text-Block, der den gerenderten Prompt enthält, und Source `{ kind: 'plugin', plugin: '@deepseek-ai/dsh-system-prompt' }`. Leeres `content` zeichnet „kein System-Prompt" auf: der Node behält seine Surface-Position und `deriveEventMessage` projiziert ihn zu `null`, sodass er keine Wire-Message beiträgt. Ein nicht-leerer Node projiziert wörtlich, sodass `deriveMessages()` die System-Message an ihrer Surface-Position zurückgibt und die DeepSeek-Serializer, die eine `role: 'system'`-History-Message unverändert durchreichen, sie als Wire-Message 0 emittieren. `EpochHeader` ist `{ config, adapterDefaults?, tools? }`; `canonicalHeader` und `headerEquals` in `packages/core/session/src/request-header.ts` vergleichen nur config, adapter defaults und tools.

### Die Operationen

| Situation | Surface-Operation |
|---|---|
| Kein `system/message` überlebt auf der Surface (einschließlich eines leeren gerenderten Prompts) | `system/message` anhängen; beim ersten Step der Session ist es Surface-Node 0, vor der ersten `user/message` des Steps |
| Ein `system/message` überlebt und der gerenderte Prompt weicht von seinem Text ab (einschließlich eines Prompts, der leer wird) | genau diesen Node ersetzen: `surfaceOp: { op: 'replace', startSeq: <seq of the node>, endSeq: <same> }`, `sourceEventSeqs: [<seq of the node>]`; ein leerer Prompt erzeugt einen Empty-Content-Node, der zu keiner Message projiziert |
| Der gerenderte Prompt entspricht dem Text des überlebenden Nodes | keine Operation |

Wenn der initiale gerenderte Prompt leer ist, reserviert der Loop einen leeren System-Head vor den initial zugelassenen User-Messages, sodass ein Prompt, der erst später nicht-leer wird, immer noch Node 0 ersetzt. Diesen leeren Node wegzulassen, würde den späteren Prompt hinter die User-History anhängen, wo pi-ai ihn in eine User-Message statt in sein `systemPrompt` umwandelt. Node 0 zu ersetzen ist ein Head-Rewrite, ausgedrückt auf der Surface: das Provider-Prefix ändert sich ab dem ersten Token, das Log zeichnet den überschatteten Node über `sourceEventSeqs` auf, und `replaceGeneration` schreitet voran wie bei einer Compaction-Ersetzung. Die `startsSeries`-Erkennung des Loops (`requestSurfaceGeneration !== surfaceGeneration`) deckt die Prompt-Änderung daher ohne `system`-Vergleich in `headerEquals` ab. `request/header` behält die Reasons `initial`, `resume`, `change` und `series`; `change` bedeutet, config oder tools haben sich geändert, und der unveränderte Header, der einer Prompt-Ersetzung folgt, loggt als `series`.

`packages/core/session/src/surface.ts` erzwingt die Head-Invariante in `assertSystemHeadRewrite`: eine Ersetzung, deren Range Surface-Node 0 abdeckt, während Node 0 eine `system/message` ist, wird abgelehnt, es sei denn, das ersetzende Event ist selbst eine `system/message`, die genau diesen Node abdeckt. System-Nodes an späteren Positionen tragen keinen solchen Schutz; eine Compaction-Range darf sie überschatten.

### Ownership im Loop

`dsh-agent-loop` besitzt `SystemPromptProjection` neben `RuntimeContextProjection` in `packages/core/agent-loop/src/runtime-context.ts`. Es liest die überlebenden `system/message`-Nodes bei jeder Projektion von der aktuellen Surface, sodass eine Compaction oder Ersetzung, die früher im selben Step lief, bereits reflektiert ist. `project(rendered, { inHistory, startsSeries })` gibt `{ message, intent }` zurück — `intent` ist `{ surfaceOp: 'append' }`, wenn kein System-Node überlebt oder die [In-History-Regel](../feature/2026-09-02-in-history-system-prompt-replacement.de.md) greift, andernfalls eine Ersetzung genau des letzten überlebenden System-Nodes — oder `undefined`, wenn der letzte Node bereits den gerenderten Text hält.

In `packages/core/agent-loop/src/agent.ts` rendert `preStep` den Prompt mit `renderPrompt(assembly)` und projiziert ihn nach dem `agent/pre-step`-Waterfall, sodass die Ersetzung eines Compaction-Providers innerhalb dieses Waterfalls für die Entscheidung sichtbar ist; `turn()` committed die `system/message` unmittelbar nach `step/start` und vor den `user/message`-Events des Steps, sodass Log-Reihenfolge gleich Wire-Reihenfolge ist. `buildRequest` setzt kein `system` auf den Request: der Request ist `header.config`, `session.deriveMessages()` (System-Message zuerst) und `header.tools`. Die Loop-Step-Reihenfolge ist: Inbox claimen → `systemPrompt.assemble()` → Runtime-Context projizieren → `agent/pre-step`-Waterfall → System-Prompt projizieren → `step/start` → `system/message` committen (bei Änderung) → `user/message`s committen → `agent/request`-Waterfall → `request/header` → `request/context` → Stream. Der `dsh-agent-loop/invariant`-Companion (`packages/core/agent-loop/src/invariant.ts`) assertet, dass ein Loop-gebauter Request `system === undefined` hat und `messages` gleich `deriveMessages()` ist.

`dsh-token-meter` verankert Usage an der bepreisten Surface unmittelbar vor der erfolgreichen `assistant/message`, nicht an `step/start`. Der Loop lässt den System-Prompt und die User-Messages nach Step-Start zu, und Retry-Recovery kann Nodes ersetzen, bevor der Request neu gebaut wird. Das Erfassen dieser aktuellen Surface umfasst jeden zugelassenen Input genau einmal; die eingebettete Provider-Usage bleibt separat bepreist, sodass durable Assistant-Rewrites ihr signiertes Delta behalten. Der offene Step speichert nur Turn und Step für die Lifecycle-Validierung, keinen zweiten Node-Snapshot.

### Consumers

| Consumer | Liest |
|---|---|
| DeepSeek-Serializer (`serializeRequest`, `serializeRequestWithImages`) | `options.messages`, wobei die `role: 'system'`-History-Message als Wire-Message 0 durchgereicht wird; `GenerateOptions.system` bleibt für direkte One-Shot-Caller wie Titel-Provider bestehen |
| `dsh-llm-pi-ai` | eine führende System-History-Message mappt auf pi-ais `systemPrompt` |
| `compaction-basic` `buildSummarizationInput` | die abgeleitete Message von Node 0 wird der Region in `SummarizationInput.messages` vorangestellt, ohne separates `system`-Feld; ein Empty-Content-Head projiziert zu keiner Message und bleibt dennoch vor Compaction geschützt |
| `compaction-basic` `selectCompactableRange` | verankert am ersten Nicht-System-Node; Node 0 liegt nie innerhalb einer Compaction-Range |
| `dsh-token-meter` | der System-Node wird als Surface-Node unter der `systemTokens`-Aufschlüsselung bepreist |
| Web-Request-Prompt-Card, Trajectory-Request-Node, Request-Inspection | der `system/message`-Node; ein ersetzter Node 0 wird als Prompt-Änderung gezeigt und ein angehängter In-History-Node als Prompt-Update, jeweils in einer eingeklappten inspizierbaren Card, nie als Chat-Bubble |
| `{{system}}`-Platzhalter des Snapshot-Normalizers, Plan-Mode-Tests | der Text des System-Nodes |
| Expected Outputs der TypeScript- und Python-SDKs | enthalten das `system/message`-Event |
| Human-Transcript-Projektionen | überspringen `system/message`; es ist Modell-History, keine Konversation |

`RuntimeContextProjection` und `SystemPromptProjection` übergeben dem Loop beide eine nicht-committete Message, die `turn()` committet. Sie unterscheiden sich darin, wie sie die Surface beobachten, und in ihrer Operationsmenge: Runtime-Context folgt `session/event` für seine eigenen User-Role-Snapshots und hängt nur an, während der System-Prompt bei jeder Projektion die aktuelle Surface nach System-Nodes durchsucht, weil seine Entscheidung davon abhängt, wie viele überleben, und je nach Route anhängt oder ersetzt.

### V2-zu-V3-Strukturkonversion

Die [V2-zu-V3-Spezifikation](../../../../packages/session/session-format-v2-to-v3/README.de.md#system-head) besitzt System-Head-Konversion und Message-Identitäten; ihre [Referenz-Regeln](../../../../packages/session/session-format-v2-to-v3/README.de.md#sequence-references) und [Source-Ablehnung](../../../../packages/session/session-format-v2-to-v3/README.de.md#source-audit) definieren Erhaltung und nicht unterstützte Eingaben. Das migrierte Layout ist semantisch äquivalent zu nativen Requests, nicht Byte-identisch zu einer nativen Aufzeichnung. Eine gültige V2-Quelle kann unter der aktuellen Step-Invariante keine ordnungserhaltende Konversion haben; sie abzulehnen ist dem Verschieben von History oder dem Aufweichen von Ownership vorzuziehen. Historische Acceptance-Koordinaten dürfen nicht zu Acknowledgements des transformierten Logs werden.

Die [Released-Format-Policy](2026-08-31-released-session-format-migrations.de.md) bewahrt die Semantik jeder veröffentlichten Konversion; eine existierende Ziel-Format-Generation läuft ihre eingehende Kante nicht erneut. Projection-Cache-Versionen sind unabhängig von Session-Format-Versionen.

Die [Canonical-Envelope-Spezifikation](../../../../packages/session/session-format-v2-to-v3/README.de.md#canonical-envelopes) definiert die Komposition mit der Strukturkonversion; die [Canonical-Envelope-Entscheidung](2026-09-06-v3-canonical-session-envelopes.de.md) besitzt die Strict-Acceptance-Begründung.

## Erwogene Alternativen

**`header.system` behalten und `system/message` nur für Updates hinzufügen.** Zwei Homes für einen Fakt: jeder Consumer oben würde den Header für Message 0 und die Surface für spätere Messages lesen, und der Loop bräuchte einen Sonderfall, der `system` in `headerEquals` ignoriert, solange ein Surface-System-Node existiert. Abgelehnt, weil der Sinn der Änderung eine Repräsentation ist.

**Ein dediziertes Log-only-`system-prompt/change`-Event, das den Header umschreibt.** Bewahrt den Header als Home des Prompts und zeichnet Änderungen als eigene Event-Art auf, kann aber weiterhin keine System-Message innerhalb der History ausdrücken, sodass der In-History-Vorschlag ohnehin einen zweiten Mechanismus bräuchte. Abgelehnt.

**Die System-Message im Adapter aus aufeinanderfolgenden Headern synthetisieren.** Der Adapter ist pro Request zustandslos und sieht das Log nie; eine Wire-History, die von Adapter-Zustand abhängt, ist nicht aus dem Surface-Fold rekonstruierbar. Abgelehnt.

**Den Prompt als `user/message`-Snapshot wie Runtime-Context ausdrücken.** Nutzt einen bestehenden Event-Typ wieder, sendet aber die falsche Role, sodass ein Modell, das eine System-Message als autoritativ behandelt, dies nicht täte. Abgelehnt.

## Konsequenzen

- Eine Repräsentation: jeder Leser von „was hat das Modell gesehen" faltet die Surface; kein Consumer verbindet den Header mit der Message-Liste. `EpochHeader` hat kein `system`-Feld, sodass ein Reader, der eines erwartet, zur Compile-Zeit scheitert.
- Eine Prompt-Änderung und eine Tool- oder Config-Änderung sind im Log unterscheidbar: erstere ist eine `system/message`-Ersetzung von Node 0 gefolgt von einem `series`-Header, letztere ein `request/header` mit Reason `change`.
- Compaction trägt eine Invariante: Node 0 wird nie compacted. Der `dsh-session`-Surface-Manager erzwingt sie in der Replace-Operation selbst, sodass ein anderer Compaction-Provider als `compaction-basic` den Prompt nicht durch Verankern an `surfaceNodes[0]` überschatten kann. Spätere System-Nodes sind by design ungeschützt.
- `replaceGeneration` schreitet sowohl für eine Prompt-Ersetzung als auch für Compaction voran; ein Reader, der sie unterscheiden muss, inspiziert den Typ des Ersetzungs-Events.
- Ein System-Node mitten in der History hat eine Surface-Repräsentation — genau das, worauf die [In-History-Ersetzungsentscheidung](../feature/2026-09-02-in-history-system-prompt-replacement.de.md) aufbaut.
- Ein initial leerer Prompt belegt den geschützten Head, ohne eine Wire-Message beizutragen; im Replacement-Modus ersetzt ein späterer nicht-leerer Prompt ihn und bleibt die führende System-Message.
- Aufgezeichnete Snapshot-Fixtures tragen das `system/message`-Event statt eines Header-`system`-Felds. Der Snapshot-Normalizer tokenisiert den Text dieses Events zu `{{system}}`, der Prompt-Sidecar wird aus der `system/message`-Sequenz geerntet (ein Abschnitt pro Prompt-Version, deklariert als `header.promptChanges`), und `request/header`-Pins vergleichen nur config und tools.

## Tests

- `packages/compaction/compaction-basic/tests/compaction-loop-repro.spec.ts` pinnt null Post-Call-Surface-Delta mit Provider-Usage über initiale, wachsende, schrumpfende und leere Prompts, Same-Step-Retry-Ersetzung, Request-Middleware und frisches Replay.
- `packages/core/session/tests/surface.spec.ts` (Block `system/message surface node`) pinnt die führende System-Role-Projektion, die Empty-Content-`null`-Projektion, die Akzeptanz- und Ablehnungspfade von `assertSystemHeadRewrite`, die ungeschützten späteren System-Nodes und die Ablehnung einer geseedeten `system/message` mit Nicht-System-Role oder Nicht-Plugin-Source.
- `packages/core/agent-loop/tests/system-prompt-projection.spec.ts` pinnt den Append beim ersten Render (einschließlich leer), den späteren nicht-leeren Prompt am abgeleiteten Head im Replacement-Modus, den No-Op bei unverändertem Prompt, die Ersetzung des letzten überlebenden Nodes bei Änderung, den Tail-Append nachdem eine Ersetzung einen Nicht-Head-System-Node überschattet hat, und die In-History-Append- und Re-Baseline-Regeln.
- `packages/core/agent-loop/tests/request-reconstruction.spec.ts` (`a system-prompt change replaces surface node 0 and starts a new series under the same header`) pinnt den `series`-Header, der einer Prompt-Ersetzung folgt.
- `packages/core/agent-loop/tests/invariant.spec.ts` pinnt die Ablehnung eines Loop-Requests mit `system`-Feld durch den Companion und dessen `messages`-Gleichheitsprüfung gegen die Boundary-Ableitung.
- `packages/llm/llm-deepseek/tests/serialize.spec.ts` (`serializes a leading system message byte-for-byte like the same prompt passed as options.system`) pinnt Wire-Identität. `packages/llm/llm-pi-ai/tests/context.spec.ts` vergleicht beide System-Quellen auf Text- und Bild-Pfaden. `packages/compaction/compaction-basic/tests/compaction-basic.spec.ts` pinnt das abgeleitete Prefix, geroutete Tools, die abwesende separate `system`-Option und den geschützten nicht-leeren oder leeren Head durch die Regions-Transaktion und den Default-Summarizer.
- Die aufgezeichneten Snapshots unter `snapshots/` pinnen den modell-sichtbaren Wire-Request jedes ausgelieferten Profils; eine aufgezeichnete Session, die einen Prompt rendert, trägt das `system/message`-Event an Surface-Node 0 in ihrem `session.jsonl`, und eine Session mit einer Prompt-Änderung mid-session trägt die Ersetzung von Node 0 oder, auf einer In-History-Route, den angehängten Node.
