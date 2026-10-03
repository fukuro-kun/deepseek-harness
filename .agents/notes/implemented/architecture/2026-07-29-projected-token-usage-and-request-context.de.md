# Agent Note: Projizierte Token-Usage und Context-Belegung
[English](2026-07-29-projected-token-usage-and-request-context.md) | [中文](2026-07-29-projected-token-usage-and-request-context.zh.md) | Deutsch

Status: implemented


## Problem

Die Web-Stats-Zeile leitete Token-Summen aus den aktuell geladenen Conversation-Nodes ab. Dieses Fenster ist gepaged, sodass Scrollen die Summen veränderte, und Compaction ersetzt sichtbaren Content, ohne das dahinterliegende Billing zu bewahren. Durable Provider-Billing braucht eine Quelle, die beides überlebt.

Context-Belegung braucht einen Zähler und einen Nenner, die keine bestehende Oberfläche an den Browser trug: die Prompt-Größe des letzten Requests und die Kapazität der Route, die er nutzte.

## Entscheidung

Beide Werte sind gewöhnlicher durabler Session-Projection-State. `@deepseek-ai/dsh-token-meter` registriert zwei Units, wenn `ctx.sessionProjections` vorhanden ist.

`tokenUsage` faltet das komplette durable Log in Uncached-Input-, Output-, Cache-Read- und Cache-Write-Buckets. Es expandiert jeden `assistant/message`- oder `assistant/attempt`-Stream und nimmt das letzte Usage-Sample; die Top-Level-Usage einer Message hat Vorrang vor ihrem eingebetteten Sample, statt es doppelt zu zählen. `assistant/attempt` bewahrt daher Usage aus fehlgeschlagenen Requests. Eine passende `llm/retry-started`-Grenze eröffnet einen neuen Attempt, sodass ein Retry mit demselben `(turn, step)` separat beiträgt. Reasoning bleibt eine Output-Unterteilung. Compaction und Surface-Replacement löschen früheres Billing nicht.

Token-Meter besitzt außerdem den geteilten reinen Attempt/Turn-Fold über durable Events. Er wendet dieselbe Retry-Grenze an und fügt die strikteren Completeness- und Exact-Total-Checks hinzu, die eine exakte Per-Turn-Disclosure erfordert. Ein Presentation-Consumer darf ein komplettes Turn-Fenster selektieren und diesen Fold aufrufen, besitzt oder dupliziert aber nicht die Accounting-Semantik.

`contextPressure` trägt optional `pressureTokens` — die neueste Provider-gemeldete Prompt-Größe, die Uncached-Input plus Cache-Reads und -Writes summiert und Output ausschließt — und optional `contextWindow` aus dem neuesten `request/context`-Record. Keines der beiden Felder wird synthetisiert, bevor seine Quelle existiert.

`request/context` ist ein neues Log-only-Session-Event, das registration-gebundene Metadaten für die Route aufzeichnet, auf die ein Request resolved wurde. AgentLoop appended es innerhalb des Steps neben `request/header`, aus den Context-Metadaten, die `prepareCall()` jetzt neben der resolved Config returnt — dieselbe registration-gebundene Lookup, die bereits Reasoning validierte, sodass kein zweites Resolve stattfindet. Es wird übersprungen, wenn Provider, Model und Capacity alle mit dem vorherigen Record übereinstimmen. Eine Route, deren Adapter keine Capacity advertist, wird mit fehlendem `contextWindow` aufgezeichnet und räumt so den Nenner einer älteren Route aus.

Capacity bleibt bewusst aus `EpochHeader` heraus. Dieser Typ ist der Reconstruction-Contract — woraus ein Request gebaut wurde — und `headerEquals` vergleicht ihn feldweise, um zu entscheiden, ob ein Snapshot ein echtes `change` ist. Capacity ist Adapter-Metadatum, das eine Route beschreibt; es dort zu platzieren würde eine Capacity-Änderung als Request-Envelope-Änderung maskieren und es in die Reconstruction-Invariante des Loops ziehen.

Beide Units fahren auf dem Standard-Projection-Lifecycle mit: History-Tail-Baselines, `session/projection`-Live-Frames, Higher-Seq-Wins-Client-Storage, JSON-Checkpoints, Cache-Recovery und Unit-Unload. Es gibt kein Token-spezifisches History-Feld, keinen Mux-Frame, keinen Projector, keinen Revision-Counter und keinen Client-Fence.

Die Web-[`StatsPills`](../feature/2026-09-07-composer-session-stats-pills.de.md) lesen beide über den Standard-`useProjection`-Seat. Window-Nodes liefern weiterhin Turn- und Step-Counts plus LLM- und Tool-Wall-Times als No-Projection-Fallback — sie beantworten „was ist auf dem Schirm" und sind korrekt window-scoped. Die durable Usage-Pill bleibt, wenn Compaction keinen sichtbaren Assistant-Step hinterlässt. Cache-Writes zählen in billed Input und im Nenner der Cache-Hit-Rate. Ein Deployment ohne Token-Meter lässt die Usage-Pill fallen; Context-Belegung lebt auf dem ContextMeter-Ring des Composers. Exakte Token-Zahlen zeigen sich im Click-open-Dialog der Usage-Pill statt in einem Hover-Tooltip.

## Context-Belegung ist approximativ — und das ist die Entscheidung

`pressureTokens` und `contextWindow` sind unabhängige Last-Wins-Felder, keine atomare Beobachtung. Ein Model-Wechsel paart eine frische Capacity mit dem Pressure der vorherigen Route, bis der nächste Request Usage meldet, und der Zähler beschreibt den letzten Request statt der Surface, wie sie gerade dasteht.

Das wurde bewusst akzeptiert. Ein Belegungs-Prozentsatz ist eine User-facing-Referenzgröße: Nichts im Harness trifft Entscheidungen daraus, und Compaction liest `measure()` direkt. Die TUI-Statuszeile hat Belegung schon immer so berechnet — ein `measure()`-Total geteilt durch eine separat für das selektierte Model resolved Capacity — sodass eine atomare Variante hier der Ausreißer gewesen wäre, nicht die Norm.

Die Nicht-Atomarität ist bewusst, kein Defekt. Ein Consumer, der wirklich eine exakte Same-Boundary-Zahl braucht, soll `ctx.tokenMeter.measure()` an seiner eigenen Request-Boundary aufrufen, wo beide Werte zusammen verfügbar sind, statt diese Projektion zu lesen.

## Erwogene Alternativen

**Ein atomarer Request-Boundary-Snapshot, geliefert als transiente Mux-Frame (implementiert, dann verworfen).** Eine frühere Revision emittierte `session/model-request`: eine nicht-replaybare Frame mit `contextTokens` und `contextWindow`, gemessen an derselben `agent/model-request`-Boundary. Die einzige nicht-replaybare Klasse auf dem Mux-Stream zu sein, war genau das, was sie brach. Host und Mux sind unabhängige SSE-Streams ohne Cross-Stream-Ordering, sodass ein vor einer Removal emittierter Request nach `host/session-removed` ankommen und die Telemetrie einer toten Session wiederbeleben konnte, während ein legitimer Request für einen neuen Lifecycle mit derselben ID von einer späten Removal gefenct werden konnte. `session/subscribed` ist kein Lifecycle-Beweis — es sagt, dass eine Queue begann, eine ID zu subscriben, nicht dass eine neue In-Memory-Session eine ältere ersetzte — und `lastSeq` ist ein durables Watermark, das zwei Lifecycles teilen können. Ein korrekter Fix erforderte eine monoton wachsende Lifecycle-Generation auf der Frame, auf der Subscription und auf der Removal plus einen Client-seitigen Watermark-Vergleich.

Diese Kosten kauften ein schlechteres Display: Die Belegung wurde nach jedem Reconnect blank und bewegte sich nie, während eine Conversation wuchs. Sie machte den Transport-Adapter außerdem zu einer Messstelle, die das O(Surface)-`measure()` bei jedem Request aufrief, und drückte Reconnect-State durch einen synthetischen `cancelled`-Open-Error aus, den das UI gesondert behandeln musste.

**Das geladene Node-Fenster in React falten.** Überlebt weder Pagination noch Compaction und lässt ein Presentation-Package Log-Semantik rekonstruieren.

**Usage nur mit finalen Assistant-Messages publizieren.** Ein Request, der einen Usage-Chunk meldet und dann fehlschlägt, würde sein Billing verlieren.

**Capacity innerhalb von Token-Meter resolven.** Das Package dokumentiert sich selbst als unabhängig vom Model-Routing und ist ansonsten ein reiner Reader, der nie ans Log appended. AgentLoop hält die resolved Metadaten bereits dort, wo der Header geschrieben wird.

**Die `session.models`-RPC um Capacity erweitern.** Der Handler resolved und verwirft es bereits, sodass das Feld fast gratis wäre — aber das Stats-Display (jetzt `StatsPills`, ui-chat) und das Model Directory leben in separaten Plugins ohne Dependency zueinander. Es zu liefern hätte entweder einen zweiten Dock-Eintrag erfordert, der eine Oberfläche über zwei Plugins splittet, oder einen Cross-Plugin-Store-Write.

**Einen Context-Kreis neben dem Model-Selector hinzufügen.** Diese Platzierung suggeriert Selected-Model-State. Die Stats-Zeile trägt die Zahl ohne doppelten UI- oder Datenpfad.

## Konsequenzen

Token-Summen bleiben über Pagination, Compaction, Replay, Restart und Reconnect stabil, weil sie gewöhnlicher durabler Projektions-State sind, der über die generischen Pfade wiederhergestellt wird. Die Cross-Stream-Reordering-Race ist konstruktionsbedingt weg statt gefenct.

Belegung ist approximativ in den oben dokumentierten Arten. Sie ist sofort nach Restore oder Reconnect verfügbar, da beide Felder durable sind — zum Preis, dass sie den letzten aufgezeichneten Request beschreibt statt einer exakten aktuellen Boundary.

Jedes Session-Log gewinnt einen kleinen `request/context`-Record pro Route- oder Advertised-Capacity-Änderung. Token-Meter ist der kanonische Owner durabler Usage-Semantik, einschließlich Retry-Attempt-Trennung in der kumulativen Projektion und des wiederverwendbaren exakten Attempt/Turn-Folds; Web Chat selektiert nur einen kompletten geladenen Turn und rendert das Fold-Ergebnis. Die TUI behält ihre Live-Per-Step-Map, weil sie die generische Projektions-Seam nicht mountet, und die Standalone-Browser-Fixture spiegelt die Unit. Connection und API Gateway tragen keinen Token-spezifischen Code, besitzen keinen Per-Session-Metrics-Cache und führen keine Messung durch. Der Browser hält zwei generische Projektions-Werte und keine Connection-lokale Telemetrie; Streaming-Text-Deltas zwingen die Stats-Zeile weder zum Neurechnen noch zu Layout-Observer-Subscription-Churn.
