---
description: "Kanal-neutraler One-Shot-Approval-Seam für Nutzer und Maintainer, die Answerer komponieren, Policy setzen oder fail-closed-Permission-Entscheidungen debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-user-approval
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Verwende dieses Paket, um eine einmalige Entscheidung zu verlangen, bevor eine sensible Tool-Aktion fortfährt. Die `ask`-Policy sendet jede Anfrage an die menschlichen oder maschinellen Answerer des Deployments; `never` lehnt sie ohne Prompt ab. Fehlende oder fehlschlagende Answerer liefern `unavailable`, sodass die Aktion fail-closed scheitert, und eine Genehmigung gilt nur für diese Anfrage. Jede Anfrage und jedes Ergebnis wird im Audit-Log der anfragenden Session aufgezeichnet. Das Modell sieht das resultierende Tool-Ergebnis und die aktuelle Policy, aber nicht die menschliche Permission-UI oder die Audit-Events.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Modell-Erfahrung](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev-Notiz](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Komponiere diesen Service, wenn sensible Tool-Aktionen auf eine menschliche oder maschinelle Entscheidung warten sollen, statt bedingungslos zu laufen. Die Tools-Pipeline und das gesandboxte Bash-Tool routen ihre `ask`-Entscheidungen durch diesen Seam und scheitern fail-closed, wenn er fehlt; interaktive Deployments mounten ihn daher mit mindestens einem Answerer.

### Answerer komponieren

Answerer sind `approval/request`-Waterfall-Listener: Gib ein Ergebnis zurück, um für einen eigenen agent zu antworten, oder rufe `next()`, um zu delegieren. Agent-scoped-Listener erhalten nur die Anfragen dieses agent, und ein Deployment komponiert einen terminalen Answerer — die Reihenfolge gleichgeordneter Listener ist kein Policy-Prioritäts-Mechanismus. Ohne terminalen Answerer lösen Anfragen zu `unavailable` auf und scheitern fail-closed; der Service selbst promptet nie einen Menschen.

### Die Policy setzen

Die effektive Policy ist die für die Session gesetzte, mit Fallback auf den konfigurierten Default. `ask` (der Default) delegiert an die komponierten Answerer; `never` lehnt jede Anfrage deterministisch vor dem interaktiven Dispatch ab — die strikte Headless-Haltung für CI und unbeaufsichtigte Runs.

```yaml
- name: '@deepseek-ai/dsh-user-approval'
  config:
    policy: ask
```

| Feld | Default | Bedeutung |
|---|---|---|
| `policy` | `ask` | Default für Sessions ohne `approval/policy`-Override |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-user-approval) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc. `setPolicy(agent, policy)` schaltet einen lebenden agent um und reiht eine „vom Nutzer geändert"-Nachricht für seinen nächsten Model-Step ein; `setApprovalPolicy(session, policy)` ist der direkte durable Schreibpfad, den die Session-Initialisierung nutzt.

### Eine Entscheidung anfragen

`request(req)` nennt den agent, das Tool, optional Call-ID und Grund sowie ein Abort-Signal. Es erfordert einen offenen Turn: Ein idle oder zwischen-Turn-Aufrufer wirft, bevor irgendetwas auditiert wird. Abbruch zieht die Frage zurück — die Anfrage wird mit `cancelled` abgerechnet und eine späte Antwort verworfen. Ein Fehler, der verhindert, dass einer der beiden Audit-Appends committet, rejected statt eine ungeloggte Entscheidung zurückzugeben.

### Was Modell und Nutzer sehen

Das Modell sieht nur das eventuelle Tool-Ergebnis des anfragenden Consumers — allowed, rejected, cancelled oder unavailable — plus die aktuelle Policy im Runtime-Context-Snapshot; die Audit-Events und die menschliche Permission-UI sind kein Modell-Kontext. Ein `never`-Wechsel wird dem Modell durch eine gesourcte User-Message angekündigt, und beide Policies tragen ihre vollständige aktuelle Bedeutung zum Snapshot bei.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) beschrieben; dieser Abschnitt erklärt Dispatch, Policy-Durchsetzung und den Audit-Pfad.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | `ApprovalService`: Request-Dispatch, Policy-Fold und Schreibpfad, Runtime-Context-Beitrag |
| [`src/types.ts`](src/types.ts) | `ApprovalRequestId`-Brand und Outcome-Typen |
| [`src/invariant.ts`](src/invariant.ts) | Invariant-Companion, der `approval/asked` mit `approval/decided` innerhalb eines offenen Turns paart |

### Dispatch

`decide()` raced den Answerer-Waterfall gegen das Request-Signal und enthält jedes Answerer-Versagen: Ein werfender Listener lässt die Frage fail-closed zu `unavailable` werden, und eine abweichende Nicht-Vokabular-Rückgabe wird zu `unavailable` normalisiert. Die `never`-Policy wird innerhalb des Services vor dem Waterfall-Dispatch durchgesetzt, sodass ein später mit `prepend` registrierter Listener die deterministische Ablehnung nicht umgehen kann. Die Anfrage muss turn-eingeschlossen sein, weil der Turn die Commit/Replay-Grenze des durable Logs ist — ein nacktes Event zwischen Turns ist von einem Crash-Tail nicht zu unterscheiden.

### Policy und der Runtime-Context-Snapshot

Der System-Prompt-Beitrag `approval:policy` nennt die vollständige aktuelle Bedeutung der effektiven Policy — `ask` mit seiner Fail-Closed-Konsequenz oder `never` mit seiner Non-Escalation-Konsequenz — nach der zurückbehaltenen Historie, sodass ein Policy-Wechsel einen neuen vollständigen Snapshot anhängt statt den stabilen Request-Header umzuschreiben. `setPolicy()` injiziert außerdem eine gesourcte User-Message, die die Änderung für den nächsten Step ankündigt.

### Audit

`request()` hängt `approval/asked` mit der Request-Identität und dem Tool an, dann `approval/decided` mit dem geschlossenen Ergebnis; die exakt angehängten Felder stehen in [`src/index.ts`](src/index.ts). Beide sind log-only; die Invariante validiert das Paar per ID innerhalb eines offenen Turns und das geschlossene Outcome-Vokabular.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Vertrag nicht ausreicht. Sie führen vom Approval-Vokabular zu den Consumers und der Design-Begründung.

- [Approval-Subsystem-Referenz](../../../docs/subsystems/approval.de.md) — das geteilte Request/Outcome-Vokabular und die `ctx.approval`-Cordis-Oberfläche.
- [Approval-Seam Agent Note](../../../.agents/notes/implemented/feature/2026-07-06-approval-seam.de.md) — Design-Begründung für den Seam.
- [Sandbox Agent Note](../../../.agents/notes/implemented/feature/2026-07-06-sandbox.de.md) — wie das gesandboxte Bash-Tool Approvals für eskalierte Retries konsumiert.
- [Interaction-Gruppenkarte](../README.de.md) — benachbarte Permission-Preset- und Question-Pakete.

-----

<a id="model-experience"></a>
## Modell-Erfahrung

### Aktueller Approval-Policy-Kontext

#### Was das Modell sieht

Die erste Anfrage und jede effektive Policy-Änderung hängen einen vollständigen Runtime-Context-Snapshot nach der zurückbehaltenen Historie an. Unter `ask` nennt der Approval-Beitrag, dass konfigurierte Answerer konsultiert werden können und Fehlen fail-closed scheitert. Unter `never` nennt er die deterministische Ablehnung und die Non-Escalation-Konsequenz. Unveränderte Anfragen behalten den früheren Snapshot, ohne eine weitere Nachricht hinzuzufügen.

##### Ask-Policy-Beitrag

```markdown
Approval policy: ask. Operations that require approval may ask through the configured answerers; without an available answerer, the request fails closed.
```

##### Never-Policy-Beitrag

```markdown
Approval prompts are disabled in this session: actions that require approval are rejected automatically — do not request sandbox escalation (do not set `sandbox_permissions`).
```

#### Token-Effekt

Eine knappe Kontext-Nachricht bei der ersten Anfrage und bei einer effektiven Änderung; unveränderte Anfragen fügen keine doppelten Policy-Tokens hinzu.

#### KV-Cache-Effekt

Append-only nach der zurückbehaltenen Historie. Ein `ask`/`never`-Wechsel bewahrt den stabilen System- und Konversations-Prefix statt die erste Wire-Message umzuschreiben.

### Tool-Ergebnis

#### Was das Modell sieht

`approval/asked` und `approval/decided` sind log-only. Das Modell sieht nur das eventuelle allowed-, rejected-, cancelled- oder unavailable-Tool-Ergebnis des anfragenden Consumers; die menschliche Permission-UI ist kein Kontext.

#### Token-Effekt

Null doppelte Audit-Tokens. Eine Ablehnung kann ein normales Tool-Ergebnis durch einen kleinen zurückbehaltenen Fehler ersetzen, während eine Genehmigung das gewöhnliche Ergebnis des Consumers belässt.

#### KV-Cache-Effekt

Append-only; neu sichtbarer Inhalt folgt dem wiederverwendbaren Request-Prefix und invalidiert keine bestehenden KV-Cache-Einträge.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann der Seam schlecht passt oder besondere Kompositions-Sorgfalt braucht. Sie sind aktuelle Paket-Constraints, kein allgemeiner Permission-Vergleich.

- **Anfragen sind nur innerhalb eines offenen Turns gültig** — ein idle oder zwischen-Turn-Aufrufer wirft vor dem Auditieren; ein durabler Out-of-Turn-Approval-Workflow ist zurückgestellt.
- **Es existieren nur One-Shot-Grants** — das Outcome-Vokabular hat `allowed-once`, aber kein `allow-always`, keine gemerkte Regel, keinen Widerruf und keinen Grant-Store; die Session-Policy ist nur `ask` / `never`.
- **Die Anfrage trägt keine Tool-Argumente** — ein Answerer sieht Tool-Name, Grund und optionale Call-ID; der ACP-Maschinenkanal erfordert eine Call-ID und delegiert Anfragen ohne eine solche.
- **Kein eingebauter Answerer** — Headless- oder unvollständig komponierte Deployments lösen zu `unavailable` auf und scheitern fail-closed; der Service selbst promptet nie einen Menschen.

<a id="dev-note"></a>
### Dev-Notiz

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
