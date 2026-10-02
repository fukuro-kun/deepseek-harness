# Agent Note: Pre-tool input rewrite — a consistent design

Status: proposed

[English](2026-06-30-pre-tool-input-rewrite.md) | [中文](2026-06-30-pre-tool-input-rewrite.zh.md) | Deutsch

## Problem

Die [Agent Note zu den Interception-Extension-Points](../../implemented/feature/2026-06-30-interception-extension-points.de.md) definiert `tools/pre-execute` als Allow-/Deny-/Ask-Gate über eine Ausführung, deren Identität bereits geschützt ist und deren Argumente tief gefroren sind. Der `PreToolUse`-Hook von Claude Code bietet zusätzlich `updatedInput`, daher braucht eine treue Brücke einen expliziten Rewrite-Mechanismus. Ein Rewrite darf kein Mutations-Ausweichweg am bestehenden Ausführungsobjekt sein: Er muss die dauerhafte Historie, die Audit-Record, die Präsentation und den ausgeführten Wert konsistent halten.

## The problem: three readers of pre-execution arguments

Im Loop werden die Argumente eines Tool-Calls vor der Tool-Ausführung in das Log committed und von Live-Consumern gelesen:

1. **`assistant/message`** wird vor der Tool-Dispatch angehängt — es ist die Modell-Historie-Quelle, die `deriveMessages()` abspielt, und trägt daher die Tool-Call-Argumente, die das Modell selbst ausgegeben hat.
2. **`tool/call`** ist die dauerhafte AUDIT-Record, angehängt vor `ctx.tools.execute()`.
3. **Die menschenorientierte Präsentation liest `tool/call.arguments`**: UI-Renderer geben sie an `presentResult` weiter; `dsh-tool-bash` leitet daraus den Card-Titel, den rawInput, das cwd und die Terminal-vs.-Background-Behandlung ab.

Ein nur auf die Ausführung beschränkter Rewrite würde die UI eine andere Command anzeigen lassen als die, die tatsächlich lief, und das Ergebnis gegen die falschen Argumente rendern. Die Registry verhindert diesen Failure-Modus: Sie erstellt einen structured clone von `arguments` und friert ihn tief ein, macht die Ausführungs-Identitäts-Properties nicht schreibbar und exponiert keinen Test-Shim oder Listener-Pfad, der sie ersetzen kann. Das Rewrite-Design muss diese geschützte Identitäts-Grenze bewahren, nicht schwächen.

## Proposal

Ein Rewrite ist eine Konsistenz-Transaktion vor der Identitäts-Erstellung. Wenn ein Hook `updatedInput` liefert, muss der wirksame Wert vor der Konstruktion der immutable `ToolExecution` durch die Registry gewählt werden und sich atomar in allen drei Lesern niederschlagen:

- Das `tool/call`-Audit-Event erfasst die REWRITTEN Argumente (das Original bleibt in einem Sidecar-Feld für die Audit-Trail erhalten — ein Hook hat den Call geändert, und sowohl die Original- als auch die wirksamen Argumente sind Fakten, die sich zu behalten lohnen).
- Das `assistant/message` in der abgeleiteten Historie muss mit dem Ausgeführten übereinstimmen — zu bewertende Optionen: den Tool-Call-Block der Assistant-Message an Ort und Stelle umschreiben (ändert, was das Modell als eigene Aussage wahrnimmt) oder eine separate Korrektur zu recorden, die der nächste Request mitträgt. Das CC-Modell ist, dass das Modell sieht, dass der Rewrite gewirkt hat.
- Die Präsentation (`presentCall`/`presentResult`) liest die umgeschriebenen Argumente, sodass die UI zeigt, was tatsächlich gelaufen ist.

`PreToolDecision` an seinem aktuellen Auslöse-Punkt zu erweitern, reicht nicht: Bis dahin existieren beide dauerhaften Records bereits, und die Ausführungs-Identität ist geschützt. Die Implementierung muss die relevante Entscheidung entweder vor das Log-Commit verlegen oder eine dedizierte frühere Rewrite-Entscheidung über den ausstehenden Modell-Call hinzufügen. Nach dem Commit der wirksamen Argumente in Historie und Audit durch den Loop konstruiert dieser die übliche immutable Ausführung und führt die bestehende Allow/Deny/Ask- und Tool-Pipeline unverändert aus.

## Alternatives considered

### Why not mutate the execution object?

Einem Pre-Execute-Listener zu erlauben, `exec.arguments` zuzuweisen, würde nur einen Ausführungs-Rewrite liefern und Modell-Historie, Audit und Präsentation unverändert lassen. Die geschützte Identität macht solches Teilverhalten unvertretbar. Bis die Konsistenz-Transaktion existiert, loggen und warnen die CC/Codex-Brücken über `updatedInput`, statt zu behaupten, es sei honoriert; `TODO(pre-tool-input-rewrite)` an der Loop-Dispatch-Stelle verankert die fehlende frühere Phase.

## Acceptance criteria

- Ein angeforderter Rewrite wird vor der Erstellung der `ToolExecution`-Identität aufgelöst und schlägt sich atomar in allen drei Lesern nieder: Das `tool/call`-Audit erfasst die umgeschriebenen Argumente (das Original in einem Sidecar-Feld erhalten), die abgeleitete Historie stimmt mit dem Ausgeführten überein, und die Präsentation rendert die umgeschriebenen Argumente.
- Die wirksamen `ToolExecution.arguments` bleiben durchgängig tief gefroren und nicht schreibbar über Pre-Policy, Guards, Dispatch, Post-Policy und finale Observation; es wird kein Mutations-Shim eingeführt.
- Die CC/Codex-Brücken honorieren `updatedInput`, statt die treue, aber degradierte Warnung zu loggen.

## Risks

- Das Umschreiben des `assistant/message`-Tool-Call-Blocks ändert, was das Modell als eigene Aussage wahrnimmt; ob ein Provider das bei der Replay ablehnt, ist die offene Frage, die empirisch geklärt werden muss, bevor die Entscheidungs-Form eingefroren wird.
- Eine frühere Rewrite-Phase ändert die Ordnungs-Beziehung zwischen `assistant/message`, `tool/call`, Hook-Audit-Events und Ausführung; das Design muss diese Ordnung fixieren, ohne Turn-Enclosure oder Call/Result-Adjazenz zu schwächen.

## Open questions

- Verletzt das Umschreiben des `assistant/message`-Tool-Call-Blocks die Erwartung eines Providers bei der Replay, oder ist eine separate Korrektur sicherer?
- Sollen die Original-Argumente auf dem `tool/call`-Event (Audit) erhalten bleiben und wenn ja, unter welchem Feld?
- Verlegt sich die Rewrite-Entscheidung vor das Log-Commit oder wird sie zu einem dedizierten früheren Extension-Point, und wie vermeiden die bestehenden Pre-Tool-Allow/Deny-Hooks, zweimal ausgeführt zu werden?
- Wie interagiert das mit einem künftigen Permission-`ask`-Flow (ein User billigt einen umgeschriebenen Call)?
