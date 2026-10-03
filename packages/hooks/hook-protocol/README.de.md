---
description: "Die gemeinsamen Hook-Regeln hinter den Claude-Code- und Codex-Bridges — was ein Hook kann und was bei seiner Ausführung passiert — für Benutzer und Maintainer des Hooks-Subsystems."
kind: "package-library"
---

# @deepseek-ai/dsh-hook-protocol
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`dsh-hook-protocol` sorgt dafür, dass beide Bridges deine Hooks identisch behandeln: Es definiert, was ein Hook kann und was bei seiner Ausführung passiert. Du installierst oder konfigurierst es nie selbst — wähle `dsh-hooks-claude-code` oder `dsh-hooks-codex`, zeige auf deine bestehende `hooks.json`, und diese Regeln gelten für deine Hooks. Über beide Bridges kann ein Hook einen Prompt oder Tool Call mit einer für das Model sichtbaren Nachricht blockieren, zusätzlichen Kontext an die Konversation anhängen oder den Run um Stopp bitten. Nur Command-Hooks laufen; `http`-, `mcp_tool`-, `prompt`- und `agent`-Handler werden mit einer Warnung übersprungen.

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

Du installierst oder konfigurierst dieses Paket nicht direkt — das Mounten von `dsh-hooks-claude-code` oder `dsh-hooks-codex` wendet diese Regeln auf deine bestehenden `hooks.json`-Hooks an. Nutze diese Seite, um zu lernen, was ein Hook kann und was bei seiner Ausführung passiert; die beiden Bridge-Seiten listen auf, welche Events jeder Dialekt unterstützt.

### Wann du es wählst

Wähle `dsh-hooks-claude-code` oder `dsh-hooks-codex`, wenn du bestehende Claude-Code- oder Codex-Hooks hast und sie während Agent-Runs weiterlaufen sollen. Dieses Paket wählst du nie direkt. Meide die ganze Gruppe für maßgeschneidertes Verhalten ohne Referenz-Tool-Äquivalent: Ein natives Cordis-Plugin hat die volle Harness-API ohne Hook-Protokoll dazwischen.

### Was ein Hook kann

- **Eine Aktion mit einer Nachricht blockieren** — ein Hook, der mit Code 2 endet, stoppt den Prompt oder Tool Call, und seine Fehlerausgabe wird als Grund angezeigt.
- **Vor einem Tool-Lauf um Bestätigung bitten** — ein Claude-Code-Hook kann eine Bestätigung anfordern statt direkt zu blockieren; die Codex-Bridge bietet diese Option nicht an.
- **Kontext anhängen** — ein Hook kann zusätzlichen Text zurückgeben, den das Model im nächsten Request sieht.
- **Zu gewählten Zeitpunkten laufen** — eine Hook-Config wählt per Name oder Pattern, bei welchen Events sie feuert; ein fehlendes, leeres oder `'*'`-Pattern bedeutet jedes Event dieser Art.
- **Fehlschlagen, ohne den Run zu stoppen** — jeder Exit-Code außer 2 ist ein nicht blockierender Fehler: Die Aktion läuft weiter, der Fehler wird geloggt, und ein Hook, der gar nicht gestartet werden kann, wird genauso behandelt.
- **Den Run um Stopp bitten** — ein Hook kann anfordern, dass der Run anhält (`{"continue": false}`); die Anfrage wird aufgezeichnet, hat aber keinen Run-weiten Effekt (siehe Bekannte Einschränkungen).

### Was du siehst, wenn Hooks laufen

- Wenn ein Hook blockiert, findet die Aktion nicht statt und die Nachricht des Hooks wird angezeigt.
- Wenn ein Hook Kontext anhängt, sieht das Model diesen Text im nächsten Request.
- Ein fehlschlagender Hook — ein fehlerhaftes Kommando, ein Crash oder jeder Exit außer 2 — wird geloggt und stoppt den Agent nicht.
- Kann die Hook-Config nicht gelesen oder geparst werden, loggt die Bridge eine Warnung und es laufen keine Hooks; der Agent startet trotzdem.
- Configs mit gemischten Hook-Typen funktionieren weiterhin: `http`-, `mcp_tool`-, `prompt`- und `agent`-Handler werden mit einer Warnung übersprungen, und ihre Command-Hooks laufen.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter der Library und verweist auf den Code, der sie umsetzt; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Verarbeitungspipeline

Die Library ist eine Kette von Schritten mit je einer Aufgabe und je einer Funktion: das Matcher-Pattern validieren, das Kommando über den `dsh-shell`-Executor ausführen, das Ergebnis dekodieren, die Ergebnisse aller gematchten Hooks zum restriktivsten Ergebnis mergen und das dauerhafte `hook/*`-Eventpaar aufzeichnen. Der `mode`-Parameter des Matchers ist die einzige Achse, in der sich die Dialekte unterscheiden — `claude-code` interpretiert ein Pattern als literale Alternativen oder Regex, `codex` immer als unverankerten Regex. Jeder Schritt degradiert zu einem eingegrenzten Ergebnis statt zu werfen, sodass ein Hook den aufrufenden Turn nie abstürzen lassen kann: Ein ungültiger Regex ist ein Nicht-Match, eine Executor-Ablehnung wird ein `HookOutput` ohne Exit-Code, Exit 2 blockiert mit stderr als Grund, und jeder andere Fehler bleibt nicht blockierend. Das Mergen wendet die Priorität `deny > ask > allow` an, hält den ersten `continue: false`-Stopp sticky und akkumuliert Kontext in Hook-Reihenfolge. Detached-Runs werden getrackt, damit `fiber.dispose()` Quiescence erreicht, und der Invariant-Companion lehnt `hook/*`-Records außerhalb eines offenen Turns ab. Die Schritte liegen in [`src/matcher.ts`](src/matcher.ts), [`src/runner.ts`](src/runner.ts), [`src/codec.ts`](src/codec.ts), [`src/merge.ts`](src/merge.ts), [`src/events.ts`](src/events.ts), [`src/detached.ts`](src/detached.ts) und [`src/invariant.ts`](src/invariant.ts).

### `hook/*`-Session-Events

Die Events `hook/invoked` und `hook/result` werden per Declaration Merging in `SessionEventMap` eingefügt — als reine Log-Records: Wie `compaction/*` sind sie keine Surface-Events und tragen kein `surfaceOp`. Ein `hook/result` paart sich über `handlerId` mit seinem `hook/invoked`, und `appendHookResult` besitzt die Entscheidungsregel. Payloads und JSDoc pro Event liegen im generierten [Persistence-Log-Event-Katalog](../../../docs/persistence-catalog.de.md).

Invocations und Result-Records müssen innerhalb eines offenen Turns liegen: `UserPromptSubmit`, `PreToolUse`, `PostToolUse` und `Stop` erfüllen diese Relation konstruktionsbedingt, während `SessionStart` vor Turn 1 läuft und keinen `hook/*`-Record erhält — stattdessen wird sein injizierter Kontext zugestellt. Der Invariant-Companion registriert sich auf `ctx.invariants` und lehnt `hook/*`-Events ab, die außerhalb eines offenen Turns angehängt werden, ein Result ohne passendes Invoked, einen unbekannten Dialekt oder eine nicht endliche Dauer.

### Designphilosophie

- **Die eine Unterschiedsachse ist in `mode` zusammengefaltet.** Die Dialekte unterscheiden sich nur darin, wie ein Matcher-Pattern interpretiert wird; der Matcher nimmt den Modus daher als Parameter, statt die Engine zu duplizieren.
- **Der Executor besitzt die Prozesskontrolle.** Kommandos laufen über den `dsh-shell`-Executor statt über einen eigenen Spawn: Der Executor liefert bereits die bereinigte, aber überschreibbare Umgebung, die Prozessgruppen-Cancellation und den Timeout, die das Protokoll braucht.
- **Niemals in den Loop werfen.** Jeder Fehlermodus — malformed JSON, ungültiger Regex, Executor-Ablehnung — degradiert zu einem eingegrenzten Ergebnis oder Nicht-Match, sodass ein Hook den aufrufenden Turn nie abstürzen lassen kann.
- **Reine Log-Events, turn-umschlossen.** Die `hook/*`-Records sind dauerhafte Belege dafür, was lief und was es entschied; sie sind keine Surface-Events, und der Invariant-Companion lehnt sie außerhalb eines offenen Turns ab.

Die [hook-protocol-lib-Agent-Note](../../../.agents/notes/archived/feature/2026-06-30-hook-protocol-lib.md) hält die Teilung zwischen gemeinsamem und dialektspezifischem Kern sowie die erwogenen Alternativen fest.

### Source Map

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Öffentliche Exports aller Primitives und Event-Helfer |
| [`src/matcher.ts`](src/matcher.ts) | Match-all-Sentinels, Literal-vs-Regex-Modus, Validierung und Laufzeit-Matching |
| [`src/runner.ts`](src/runner.ts) | `runHook`-Ausführung über `ctx.shell` und `DEFAULT_HOOK_TIMEOUT_MS` |
| [`src/codec.ts`](src/codec.ts) | Dekodierung von Exit-Code und strukturiertem stdout nach `HookOutput` |
| [`src/merge.ts`](src/merge.ts) | Restriktivster Merge und der Typ `MergedHookOutcome` |
| [`src/events.ts`](src/events.ts) | `hook/*`-Event-Deklaration, Append-Helfer, stderr-Zusammenfassung |
| [`src/detached.ts`](src/detached.ts) | Quiescence-Tracking für Detached-Runs |
| [`src/types.ts`](src/types.ts) | `HookOutput`, `MatcherGroup`, `CommandHook` und die `hook/*`-Payload-Typen |
| [`src/invariant.ts`](src/invariant.ts) | Invariant-Companion: Pairing-, Turn-Einschluss-, Dialekt- und Dauer-Checks |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Contract nicht ausreicht. Sie führen von den gemeinsamen Regeln zu den Bridges, die sie anwenden, und den Extension Points, gegen die sie programmieren.

- [Hooks-Gruppenkarte](../README.de.md) — die Seite der Schwestergruppe und ihre Pakettabelle.
- [Hook-Protocol-Library-Agent-Note](../../../.agents/notes/archived/feature/2026-06-30-hook-protocol-lib.md) — warum der Protokollkern geteilt ist und was jede Bridge besitzt.
- [Hook-Bridges-Agent-Note](../../../.agents/notes/archived/feature/2026-06-30-hook-bridges.md) — wie die beiden Bridges diese Primitives nutzen.
- [Interception-Extension-Points-Agent-Note](../../../.agents/notes/implemented/feature/2026-06-30-interception-extension-points.de.md) — die typisierte Decision-Oberfläche, auf die die Bridges abbilden.
- [Generierter Persistence-Log-Event-Katalog](../../../docs/persistence-catalog.de.md) — die `hook/*`-Event-Payloads und JSDoc pro Event.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über `dsh-hooks-claude-code` und `dsh-hooks-codex` — die einzigen Consumer, die dekodierte Hook-Ausgaben in Model-Kontext rendern.

#### KV-Cache-Effekt

Keine direkte Invalidierung; die genannten Consumer besitzen alle Änderungen am Request-Präfix.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen beschreiben, was Hooks über die gemeinsame Engine noch nicht können. Sie sind aktuelle Paket-Constraints, kein Aufgabenstapel.

- **`HookOutput.updatedInput` wird geparst, aber nicht angewendet** — Input-Rewrite ist ein zurückgestelltes Konsistenz-Designproblem ([die pre-tool-input-rewrite-Agent-Note](../../../.agents/notes/proposed/feature/2026-06-30-pre-tool-input-rewrite.de.md)); eine Bridge loggt und warnt, wenn ein Hook es setzt.
- **Ein eingefalteter Halt hat keinen Run-weiten Effekt** — `mergeHookOutputs` faltet `continue: false` zu einem sticky `stop`, aber die Interception-Points haben keine Hard-Halt-Primitive; eine Bridge zeichnet den Halt daher nur auf und behält den punktuellen Effekt des Hooks.
- **Nur die Command-Hook-Form läuft** — das Protokoll führt nur `{ type: 'command', command, timeout? }` aus; eine Bridge parst und überspringt die anderen Formen, die ihr Dialekt definiert (`http`, `mcp_tool`, `prompt`, `agent`).

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: offene Fragen und unentschiedene Richtungen. Sie ist ausdrücklich nicht maßgeblich — ausgeliefertes Verhalten, Grenzen und akzeptierte Begründungen liegen in den Abschnitten oben, im Paket-Code und in den verlinkten Agent Notes.

#### Zukunft: Run-weiter Halt

Ein Hook, der den ganzen Run anhalten will (`continue: false`), wird in `MergedHookOutcome.stop` eingefaltet, aber nirgends angewendet: Den Interception-Points fehlt eine Hard-Halt-Primitive, und Requests mitten im Turn zeichnen den Halt stattdessen in `hook/result` auf. Ein Run-weiter Halt-Mechanismus würde den Bridges erlauben, ihn anzuwenden; ein Design existiert noch nicht.

</details>
