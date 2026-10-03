# Agent Note: Semantische Phasen für die Composer-Chain-Election

Status: proposed

[English](2026-08-08-semantic-composer-chain-phases.md) | [中文](2026-08-08-semantic-composer-chain-phases.zh.md) | Deutsch

## Problem

Die `conversation.composer`-Chain des Browsers ordnet jeden Kandidaten nach einer globalen numerischen `priority` und wählt dann den ersten Selektor, der einen Match liefert. Question nutzt die Default-Priority `0`, approval nutzt `1`, und der One-Shot- oder Unavailable-Parent-Read-only-Subagent-Composer nutzt `-10`. Eine ausgewählte One-Shot-History kann daher die Read-only-Erklärung zeigen, während darunter eine beantwortbare Question oder ein Approval anhängig ist.

Der Defekt ist nicht eine falsche Zahl. Die Chain nutzt denselben Skalar derzeit für zwei verschiedene Entscheidungen: ob ein Kandidat eine bestehende Interaktion auflöst oder das Starten neuer Arbeit einschränkt, und die lokale Präferenz zwischen Kandidaten derselben semantischen Art. Jede numerische Reparatur bewahrt diese versteckte Kopplung und lässt einen späteren Registranten den Bug neu erzeugen.

## Vorschlag

Eine Chain-Deklaration darf ein geordnetes Tupel Domain-besessener Phasen definieren. `conversation.composer` deklariert `['interaction', 'restriction']`; jede Registrierung auf dieser phasierten Chain muss eine Phase nennen, und ihre numerische `priority` ordnet Einträge nur innerhalb dieser Phase. `SlotCore` sortiert nach deklariertem Phasenindex, dann lokaler Priority, dann stabiler Registrierungsreihenfolge. Die Registrierung schlägt sofort fehl, wenn ein Eintrag einer phasierten Chain seine Phase weglässt oder eine außerhalb der Deklaration nennt. Unphasierte Chains behalten ihr aktuelles numerisches Verhalten.

Question und Approval registrieren in `interaction` und behalten ihre aktuelle In-Phase-Reihenfolge Question vor Approval. `SubagentReadOnlyComposer` registriert in `restriction` mit einer gewöhnlichen lokalen Priority. Die Domain-Regel ist präzise: eine interaction löst ein bereits bestehendes live Host-Wait auf; eine restriction verhindert, dass der User über den gewöhnlichen Composer Arbeit initiiert. Ein bestehendes Wait aufzulösen ist kein neues Follow-up ans One-Shot-Child, also geht die interaction-Phase zuerst. Sobald das Wait aufgelöst ist, wählt die Chain neu, und die Read-only-Restriction wird wieder sichtbar.

Das Phasenvokabular gehört dem deklarierenden Slot, nicht global dem Slot-Framework. `SlotMap` trägt das exakte Phasentupel für die Compile-Zeit-Registrierung, und die Laufzeit-`SlotSpec` wiederholt dieses Tupel als Sortierautorität. Andere Chains erwerben keine Composer-Terminologie und brauchen keine Migration, es sei denn, sie deklarieren bewusst Phasen.

Dieser Vorschlag erweitert die Verträge [Web subagent conversation](../../implemented/feature/2026-07-27-web-subagent-conversations.de.md), [Web permission and approval](../../archived/feature/2026-07-23-web-permission-and-approval.md) und [plan-review presentation](../../archived/feature/2026-07-30-plan-review-presentation-intent.md); er ersetzt keinen davon. Der [Runtime-owned-Child-Guard-Record](../../archived/bug-fix/2026-08-01-ask-user-delegated-caller-guard.md) führte den Guard ein, der neue Child-besessene Human-Waits verhindert. Keine aktive Agent Note sollte archiviert werden, wenn dieser Vorschlag landet.

## In Betracht gezogene Alternativen

**Die Read-only-Priority hinter Question und Approval verschieben.** Das ist der kleinste taktische Fix, lässt aber semantische Dominanz als undokumentierte Zahlenabstände kodiert und lässt die nächste Composer-Art auf derselben globalen Skala raten.

**Den Read-only-Selektor ablehnen lassen, wann immer `interactions` nicht leer ist.** Das fixt das aktuelle Paar, lässt aber ein Restriction-Plugin jede actionable Domain verstehen und dupliziert Election-Policy über Selektoren hinweg. Eine neue Interaction-Art würde Edits in unrelated Restrictions erfordern.

**Nur auf den Runtime-Child-Guard verlassen.** Der Guard fixt neue Model-Calls, kann aber die Browser-Ordnung für bereits anhängige Waits, Rolling-Version-Overlap oder andere Interaction-Arten wie Approval nicht definieren. Runtime-Autorität und Presentation-Election sind getrennte Invarianten.

**Alle matchenden Takeover als Stack rendern.** Der Composer hat einen Action-Sitz. Question, Approval und Read-only-Flächen zu stapeln macht Keyboard-Fokus und Answer-Ownership mehrdeutig, statt eine aktuelle Aktion auszuwählen.

## Akzeptanzkriterien

- `SlotCore`-Tests beweisen, dass die Phasenordnung beliebige lokale Priorities dominiert, lokale Priority und stabile Registrierungsreihenfolge innerhalb einer Phase weiterhin funktionieren, unbekannte oder weggelassene Phasen laut fehlschlagen und unphasierte Chains unverändert sind.
- Composer-Tests decken Question plus Read-only, Approval plus Read-only, Question plus Approval plus Read-only, die Auflösung zurück zu Read-only und den All-Declined-InputBar-Fallback ab. Question bleibt innerhalb von `interaction` vor Approval.
- Disposal, HMR-Re-Registrierung und Reconnect-Replay können keine stale gewählte Phase hinterlassen; die Election bleibt eine reine Funktion der aktuellen Owner-Props und aktuellen Registrierungen.
- Ein keyloser assembled Web-Snapshot pined eine One-Shot-adressierte Konversation mit anhängiger Interaction, die siegende Interaction-Fläche, ihre Auflösung und die danach wiederkehrende Read-only-Fläche.
- Slot-, Conversation-, Question-, Permission- und Subagent-README/JSDoc-Verträge beschreiben Phasen-Ownership und die Interaction-vor-Restriction-Regel gemeinsam.
- Die Änderung modifiziert keine model-sichtbare Tool-Definition, keinen System-Prompt-Abschnitt, kein Request-Routing und kein Session-Event. Die Browser-Election hat daher keine Token-Kosten und keine KV-Cache-Invalidierung; Tests vergleichen den Model-Request-Header vor und nach dem Client-only-Übergang.

## Risiken

Phasennamen können zu einem vagen Ersatz für Design werden. Jeder phasierte Slot besitzt daher eine kurze Ordnungsregel und lehnt Einträge ab, die nicht angeben können, auf welche Seite sie gehören. Eine zukünftige harte Safety-Fläche, die das Beantworten verdrängen muss, sollte nicht fälschlich `restriction` gelabelt werden; sie braucht eine explizite frühere Phase oder eine Grenze außerhalb dieser Composer-Chain.

Die generischen Slot-Typen und die Stored-Entry-Form gewinnen ein konditionales Feld, sodass eine unvollständige Migration in einer Face kompilieren, aber zur Laufzeit scheitern könnte. Das exakte Tupel wird in der Laufzeitdeklaration genau deshalb wiederholt, um diesen Drift mechanisch ablehnbar zu machen. Konkurrierende Questions und Approvals bleiben eine Single-Surface-Policy; dieser Vorschlag bewahrt ihre aktuelle Ordnung, statt Multi-Interaction-Queueing zu lösen.
