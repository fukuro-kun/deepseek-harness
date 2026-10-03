# Agent Note: Breitengrenze für gleichzeitige fortsetzbare subagents
[English](2026-10-01-subagent-concurrency-cap.md) | [中文](2026-10-01-subagent-concurrency-cap.zh.md) | Deutsch

Status: proposed


## Problem

Eine Deployment auf einem kleinen selbst gehosteten Inference-Fleet kann nicht ausdrücken, wie viele subagents gleichzeitig laufen dürfen. Das ausgelieferte Agent-Preset mountet `tool-subagent` mit `backgroundMode: continuable`, sodass jedes delegierte Kind ein persistenter Agent wird, der seinen eigenen Turn-Loop besitzt — jedes laufende Kind ist ein paralleler LLM-Request-Stream. Keine der bestehenden Caps begrenzt diese Breite: `agent-loop.maxParallelToolCalls` deckt nur Calls innerhalb des spawnenden Steps, und eine continuable-Delegation gibt ihre durable ID sofort zurück; `jobs-local.maxConcurrentJobsPerOwner` deckt nur den Einweg-`jobId`-Background-Pfad; `tool-subagent.maxDepth` begrenzt die Verschachtelungstiefe, nicht die Anzahl der Geschwister. Ein Fleet mit N starken Endpoints kann eine Session nicht unter N parallelen Requests halten, und Instruktionen-Datei-Regeln sind weiche Durchsetzung, die ein Modell ignorieren kann.

## Vorschlag

Füge eine pro-Eltern-Breitengrenze zur Subagent-Delegation hinzu:

- Neues optionales `tool-subagent`-Config-Feld `maxConcurrentChildren` (unset behält das heutige Verhalten).
- Durchsetzung an der continuable-Zulassungs-Grenze: Wenn der aufrufende Parent bereits so viele live Kinder hat, schlägt der `subagent`/`subagent_fork`-Call mit einem modell-seitigen Tool-Error fehl, der die Cap und die besetzenden Kinder benennt, sodass das Modell auf eine Completion-Nachricht warten oder ein bestehendes Kind steuern kann, statt blind zu retryen.
- Die Zählung deckt alle live Kinder des Parents ab, unabhängig davon, wie sie gestartet wurden; Foreground-Delegationen behalten zusätzlich ihre bestehende pro-Step-`maxParallelToolCalls`-Buchhaltung.
- `maxDepth` bleibt orthogonal: Tiefe begrenzt Verschachtelung, Breite begrenzt Geschwister.

## Erwogene Alternativen

- **`agent-loop.maxParallelToolCalls`**: begrenzt parallele sichere Calls pro Step; ein continuable-Call gibt sofort zurück und kann daher keine laufenden Kinder begrenzen, und seine Erniedrigung serialisiert gewöhnliche parallele Datei-Lesezugriffe.
- **`jobs-local.maxConcurrentJobsPerOwner`**: gilt nur für den Einweg-Background-`jobId`-Pfad; continuable-Kinder sind persistente Agenten, keine Jobs.
- **`tool-subagent.maxDepth`**: orthogonal — Tiefe begrenzt nicht die Breite.
- **Instruktionen-Datei-Regeln** (`~/.dsh/AGENTS.md`): kostenlos und als Zwischenmaßnahme bereits vorhanden, aber weiche Durchsetzung, die von der Modell-Compliance abhängt.
- **Ein Semaphore innerhalb des `llm`-Services**: würde alle in-flight Requests begrenzen, einschließlich nicht verwandter paralleler Sessions, und versteckt die Delegations-Semantik vor dem Modell; die Verweigerung an der Delegations-Grenze erzeugt stattdessen einen modell-lesebaren Error, statt stummer Warteschlangen.

## Akzeptanzkriterien

- Mit `maxConcurrentChildren: 2` liefert eine dritte live Delegation aus dem selben Parent einen Tool-Error, der die Cap und die laufenden Kinder benennt; sie gelingt, nachdem ein Kind abgeschlossen hat.
- Wenn das Feld unset ist, ist das Verhalten identisch zu heute.
- Die Cap gilt für beide `spawn`- und `fork`-Provider; `maxDepth`-Semantik unverändert.
- Specs decken ab: den Verweigungs-Error-Text, ein abschließendes Kind, das einen Slot freigibt, Kinder unterschiedlicher Parents, die unabhängig gezählt werden, und die Interaktion mit der Tiefen-Beschränkung.

## Risiken

- Ein Modell, das die Verweigerung in einer Schleife retryt, verbrennt Requests; die Fehlermeldung sollte die besetzenden Kinder benennen, damit das Modell `send_message` nutzen oder auf die Completion-Nachricht warten kann.
- „Live" muss mit der Aktivierungs-Teardown übereinstimmen: eine suspendierte oder wieder aufnehmende Kind-Session darf die Zählung nicht klemmen, und ein fehlgeschlagener Start muss seinen Slot freigeben.
- Wenn Upstream später einen anderen Breiten-Mechanismus ausliefert, muss diese Configuration sich mit ihm abstimmen.
