# Agent Note: In-Process-subagent-Policy-Vererbung — das Child startet unter dem Sandbox-Override des Parent
[English](2026-07-25-subagent-policy-inheritance.md) | [中文](2026-07-25-subagent-policy-inheritance.zh.md) | Deutsch

Status: implemented


## Problem

Sandbox- und Approval-Overrides sind session-lokale Log-Folds. Ein In-Process-subagent bekommt eine neue Session, also fiel ein spawn-Child einst auf Deployment-Defaults zurück, und ein fork-Child sah nur Umschaltungen innerhalb seines Completed-Turn-Präfix. Delegation konnte damit einen Parent erweitern, der auf `read-only` umgeschaltet hatte.

## Entscheidung

Die Delegationsgrenze snapshotet `sandboxPolicy.overrideOf(parent.session)` vor ihrem ersten await, über die geteilten Child-agent-Helper (`captureDelegatedPolicyOverrides`/`appendDelegatedPolicyOverrides` in `dsh-subagent`), die sowohl der One-Shot-Treiber als auch der [fortsetzbare Start](../../archived/feature/2026-08-10-continuable-subagent-policy-inheritance.md) aufrufen. Eine spätere Umschaltung des Parent gehört zur Zukunft des Parent; Cancel-and-Redelegate nimmt einen neuen Snapshot. Der Sandbox-Policy-Service ist optional, und nur der explizite Session-Override wird kopiert, niemals Deployment-Defaults oder einmalige Grants. Die Approval-Policy wird nicht vererbt: Dieselbe Erfassung pinnt jedes Child auf `'never'` — die [Approvals-Pinned-Entscheidung](2026-08-10-subagent-approval-pinned-never.de.md) ersetzt die ursprüngliche Approval-Override-Vererbung dieser Notiz.

Jeder erfasste Wert wird zu einem source-getaggten `sandbox/mode`- oder `approval/policy`-Event, das während des unveröffentlichten Setups der Child-Factory angehängt wird. Der Session-Konstruktor hat `Session.firstLiveSeq` bereits hinter dem Constructor-Seed fixiert, während `Session.inheritedEventCount` die exakte fork-Präfix-Länge hält, sodass die geerbten Fakten der fork-Historie folgen, ohne ihren Lineage-Cut zu ändern. Die lifecycle-lokale Telemetrie startet bei `firstLiveSeq`, schließt also den Constructor-Seed aus und diese Unpublished-Setup-Events ein. Die bestehenden Last-Event-wins-Folds lassen daher den Delegations-Snapshot über eine veraltete fork-Historie gewinnen und eine spätere Child-Umschaltung über den Snapshot. Ein Grandchild foldet den geloggten Zustand seines Parent, sodass die Regel ohne einen weiteren Vererbungsmechanismus komponiert.

Gewöhnliche Session-Appends validieren die geerbten Events vor der Publikation, und die Persistenz erfasst das vollständige unveröffentlichte Log, wenn die Session angekündigt wird. Jedes materialisierte Child-Log speichert die geerbten Events daher mit seinem ersten Batch; es gibt keinen zweiten Policy-Store, kein Schema-Feld und keinen Query-Index. Der Marker `source: 'delegation'` lässt die Approval-Narration Vererbung von einer child-seitigen Nutzer-Umschaltung unterscheiden.

### Was ein blockiertes Child erlebt

Ein eingeschränktes Child bekommt den gewöhnlichen Denial-Marker, und eine Eskalationsanfrage wird durch die gepinnte `'never'`-Policy des Child deterministisch abgelehnt; das `subagent:delegation`-Runtime-Context-Statement weist das Child an, die Einschränkung zu melden statt es erneut zu versuchen, und ein controller-besessener Parent kann seine eigene Session erweitern und erneut delegieren ([Approvals-Pinned-Entscheidung](2026-08-10-subagent-approval-pinned-never.de.md)).

## Erwogene Alternativen

- **Generische `SessionHeader`-Policy-Felder** — verworfen: Sie duplizieren einen event-sourced Fakt in Metadaten und erfordern Propagation durch Core-Session-Typen, Persistence-Backends, Query-Indizes, Kollisionsidentität und jeden Policy-Consumer. Unpublished-Setup-Events haben die erforderliche Reihenfolge und nutzen den bestehenden durable Store wieder.
- **Neue Policy-Fakten mit der Konstruktor-Historie kombinieren** — verworfen, weil es die child-eigene Delegations-Policy als geerbte Historie klassifizieren und die Lifecycle-Reihenfolge verwischen würde, die den Child-Snapshot über einen veralteten fork-Wert gewinnen lässt. Unpublished Setup hält Historie und neue Fakten auf ihren jeweiligen Seiten der Konstruktionsgrenze, ohne eine weitere Session-Option; die Telemetrie erfasst die child-eigene Seite.
- **Ein First-Prompt-Listener** — verworfen: Er führt Listener-Reihenfolge und eine spätere Timing-Grenze ein, obwohl die Erstellungstransaktion Log-Appends vor der Publikation bereits erlaubt.
- **Deployment-Defaults kopieren** — verworfen: Defaults bleiben operator-owned und können sich ändern; ein nicht umgeschalteter Parent stempelt nichts, sodass sein Child dem aktuellen Deployment folgt.
- **Live-Auflösung, die bei jedem Call `parentSession` abläuft** — verworfen: Sie bricht die Isolationsinvariante „zwei Sessions sehen nie den Zustand der anderen", verlangt, dass die Parent-Session für die Lebensdauer des Child geladen bleibt, und lässt eine Parent-Umschaltung mitten im Lauf ein laufendes Child rückwirkend ändern. Snapshot-bei-Delegation ist die Semantik: Das Child behält die Policy, die ihm übergeben wurde; Cancel-and-Respawn nimmt eine Verschärfung mit.
- **`'never'` erzwingen** — hier ursprünglich als Vererbungsverhalten verworfen, weil ein erzwungener Wert einen künftigen Child-Antwortgeber ausschließt; dieses Urteil wird von der [Approvals-Pinned-Entscheidung](2026-08-10-subagent-approval-pinned-never.de.md) umgekehrt, die die aktuelle Begründung besitzt. Asks an den Root-Controller zu routen braucht Parent-Chain-Ownership und die spawnende `callId` und bleibt in der [Approval-seam-Agent-Note](2026-07-06-approval-seam.de.md) vertagt.

## Konsequenzen

- Spawn-, fork- und verschachtelte In-Process-Children behalten den expliziten Sandbox-Override des Parent und werden auf `'never'`-Approvals gepinnt. Die fokussierte Suite beweist echte Filesystem-Verweigerung, Stale-fork-Prezedenz, Erfassung zum Delegationszeitpunkt, die Live-Event-Grenze, Default-Weglassung und Kontext-Disposal.
- Der keyless headless Snapshot ist die assemblierte Regression: Nur der Parent ist `read-only`, der Deployment-Default ist `workspace-write`, und sowohl das persistierte Event des Child als auch der verweigerte Disk-Write schlagen fehl, wenn die Erfassung entfernt wird.
- Jede Delegation fügt höchstens zwei Log-only-Events hinzu. `dsh-subagent` besitzt die optionalen Peer-Typen für die zwei Policy-Services — seine geteilten Helper halten den `ctx.get`-Konsum; Kompositionen ohne einen der Services verhalten sich unverändert. Out-of-Process-Children behalten ihre eigene Deployment-Policy, und ein laufendes Child folgt späteren Parent-Umschaltungen nicht.
