# Agent Note: Geforkte Kinder bewahren das Request-Präfix des Elternteils

Status: implemented

[English](2026-08-10-fork-children-stay-one-shot.md) | [中文](2026-08-10-fork-children-stay-one-shot.zh.md) | Deutsch

## Problem

fork unterscheidet sich von spawn dadurch, dass die Kind-Session mit dem Präfix der abgeschlossenen Turns des Elternteils geimpft wird. Dieser Seed kostet Tokens, und sein beabsichtigter Nutzen ist provider-seitige Präfix-Wiederverwendung: Bei gleichem Provider und Modell führt ein Kind-Request, dessen führende Bytes mit denen des Elternteils übereinstimmen, das Prefill des gemeinsamen Abschnitts nicht erneut aus. Ein kind-exklusiver system-prompt-Abschnitt oder ein Tool-Schema vor der geerbten History zunichtemacht diesen Nutzen.

Die früher ausgelieferte Komposition vermied diese Abweichung, indem geforkte Kinder one-shot blieben. Diese Einschränkung war eine Folge des früheren kind-exklusiven Return-Tools, keine intrinsische Eigenschaft von fortsetzbarem fork.

## Entscheidung

Das model-seitige `send_message`-Tool wird global für jeden Agent in einer Komposition registriert. Ein fortsetzbares geforktes Kind erhält daher denselben Tool-Namen, dieselbe Beschreibung, dasselbe Schema und dieselbe Reihenfolge wie sein Elternteil. Seine initiale Aufgabe wird nach dem geerbten Session-Seed angehängt, und die Aufgabe enthält die direkte Eltern-ID plus die Anweisung, Ergebnisse mit `send_message({ agent_id, message })` zurückzugeben, wenn dieses Tool für das Kind sichtbar ist.

Die base- und headless-Kompositionen behalten one-shot fork als ihre konservative Lifecycle-Policy bei. Die CLI-Presets `cordis`, `standard` und `ptc` dürfen fork an den fortsetzbaren Lifecycle binden, weil diese Bindung keine kind-exklusiven Request-Head-Felder mehr einfügt. `ForkInProcessProvider.prepareContinuable()` und `ctx.subagents.startContinuable()` bleiben die Implementierungs-seam für diese Presets.

Byte-identische Präfix-Wiederverwendung wird durch explizite Deployment-Entscheidungen qualifiziert. Eine fork-Delegation, die eine Child-Persona oder einen `toolFilter` anwendet, kann den Request-Head weiterhin ändern. Insbesondere entfernt das Herausfiltern von `send_message` sowohl das Schema als auch die Return-Anweisung aus dem Kind; die Runtime umgeht eine explizite Allowlist nicht.

## Betrachtete Alternativen

**Jeden fork one-shot halten.** Das bewahrt das Präfix, gibt aber unnötig durable, mehrturnfähige geforkte Kinder auf, nachdem der kind-exklusive Schema-Unterschied entfallen ist.

**Ein kind-exklusives Return-Alias installieren.** Ein empfängerfreies Alias würde Kind-Aufrufe kürzer machen, würde aber ein Tool-Schema- und Prompt-Delta vor der geerbten History neu erzeugen und die Operation zwischen benachbarten Agents duplizieren.

**Die Return-Anweisung in den system prompt aufnehmen.** Das würde kind-exklusive Bytes vor den geerbten Messages platzieren. Das Anhängen an die initiale User-Aufgabe bewahrt das geerbte Präfix und hält die Eltern-ID neben der Aufgabe, die sie braucht.

**Einen expliziten `toolFilter` des Kinds ignorieren.** Strukturelle Return-Tools umgingen früher die Allowlist des Kinds. Abgelehnt, weil eine deklarierte Tool-Einschränkung sowohl Schema-Sichtbarkeit als auch Anweisung bestimmen muss; verborgene Autorität würde die model-seitige Liste ungenau machen.

## Konsequenzen

- Elternteil und fortsetzbares fork-Kind exponieren byte-identische geordnete Tool-Schemas, wenn die Delegation keine Persona oder keinen Tool-Filter anfordert.
- Der geerbte Session-Seed steht vor der initialen Aufgabe und der Return-Anweisung des Kinds.
- Die base- und headless-Profile behalten one-shot fork, während ausgewählte CLI-Presets fortsetzbaren fork ohne kind-exklusiven Request-Head-Zusatz ausüben.
- Ein Kind sendet explizit null oder mehr Messages an sein direktes Elternteil; seine finale Antwort wird nicht implizit kopiert. Die vom Manager verwaltete Abrechnungsbenachrichtigung bleibt unbedingt und getrennt.
- Schlüssellose Snapshots und Package-Tests pinnen Schema-Gleichheit, Reihenfolge der geerbten History, Eltern-ID-Anweisung und Kind-zu-Eltern-Zustellung über dieselbe `send_message`-Operation, die auch in der anderen Richtung verwendet wird.

### Akzeptierte Risiken

Provider-seitige Präfix-Wiederverwendung hängt weiterhin vom gewählten Provider und Modell sowie vom Fehlen expliziter Persona- oder Tool-Filter-Unterschiede ab. Das harness beweist die Gleichheit seiner assemblierten Request-Head-Eingaben, nicht das Cache-Verhalten eines Providers.
