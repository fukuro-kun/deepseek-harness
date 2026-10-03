# Agent Note: Frame-koaleszierte Reasoning-Chunk-Publikation und Browser-Stress-Validierung
[English](2026-08-03-opt-in-reasoning-chunk-browser-stress.md) | [中文](2026-08-03-opt-in-reasoning-chunk-browser-stress.zh.md) | Deutsch

Status: implemented


## Problem

Lange Reasoning-Streams erzeugen kontinuierlich große Mengen prozess-lokaler `assistant/live-chunk`-Updates vor einem durable Settlement. Jedes Update muss geordnet bleiben und in die Assistant-Definition gefoldet werden, um Live-Vollständigkeit zu bewahren, während das Settlement den exakten Stream für Replay einbettet; React braucht jedoch nur das aktuelle akkumulierte Ergebnis, nicht jeden Zwischenzustand innerhalb eines Browser-Frames.

Jedes `yield` in einem Async-Stream kann eine neue Microtask-Grenze erzeugen, sodass `Notifier.markDirty()` mit nur Microtask-Batching darin degeneriert, für jeden Chunk einen `ConversationSnapshot` neu zu bauen, `useSyncExternalStore` zu benachrichtigen und einen React-Render laufen zu lassen. Selbst mit kollabierter Live-Think-Row können 100.000 Reasoning-Chunks den Main-Thread mit Reconciliation-, Commit- und Layout-Arbeit überwältigen. Die Performance-Grenze muss zwischen Session-Ingestion und React-Publikation sitzen; sie darf das Problem nicht verbergen, indem sie den Producer verlangsamt oder rohe Events verwirft.

## Entscheidung

Der Session-Controller hängt jeden Client-only-Live-Chunk an seine Event-Quelle an, und Conversation foldet ihn sofort in jeden matchenden Definition-State. Chat- und Trajectory-Definitionen fordern `animation-frame`-Publikation für sichtbare `block-start`-, `text-delta`-, `reasoning-delta`-, `tool-call-delta`- und `block-end`-Chunks an; die erste Änderung schedult einen `requestAnimationFrame`, spätere Chunks aktualisieren den State weiter, und der Frame-Callback materialisiert einen akkumulierten Snapshot aus dem neuesten State. `usage` und `finish` fordern keine Publikation an. Das durable `assistant/message`- oder `assistant/attempt`-Settlement publiziert sofort und reproduziert denselben finalen Stream während History-Replay.

`BoundConversation` besitzt einen pending Frame pro Session. Gewöhnliche strukturelle Events und durable Settlements fordern sofortige Publikation an, flushen den neuesten assemblierten State und machen einen späteren Frame-Callback harmlos, weil kein dirty Context mehr existiert. Umgebungen ohne `requestAnimationFrame` publizieren sofort. Ein Settlement darf ein intermediäres Partial überspringen, das noch nicht erschienen ist, während der publizierte finale Content und der durable eingebettete Stream vollständig bleiben.

Das horizontale Pinning der Live-Think-Row an das Ende des akkumulierten Textes ist rein visuelle Ausrichtung und erfordert keine synchronen Layout-Reads bei jedem React-Commit. Ein In-Component-Scheduler koalesziert aufeinanderfolgende Requests zu einem Update alle drei Frames, liest `scrollWidth` und `clientWidth` vom neuesten DOM und aktualisiert `scrollLeft` direkt auf die neueste Position; die fixe visuelle Kadenz hält Summary-Änderungen lesbar, ohne Browser-Smooth-Scroll-Animationen akkumulieren zu lassen. Dieses Throttling gilt nur für Thinks horizontale Summary und verzögert weder Chat-Body-Scrolling, History-Prepend-Anchoring noch nutzergetriggertes `scrollIntoView`.

`pnpm run test:web:stress` bleibt schlüssellose, Opt-in-Browser-Performance-Evidenz. Die deterministische `?fixture`-Session emittiert 100.000 `reasoning-delta`-Events in einer von Painting unabhängigen Kadenz, und ein terminaler Marker beweist, dass die Events die Production-Session-Reduction durchqueren und die Live-Think-Row erreichen; ein 50-Millisekunden-Heartbeat und ein vor-geplanter DOM-Event messen Main-Thread-Stalls bzw. Interaktionslatenz, mit einem 250-Millisekunden-Budget zur Identifikation klarer Regressionen. `DSH_WEB_STRESS_HEADFUL=1` lässt Entwickler dasselbe Szenario in einem sichtbaren Browser mit dem Performance-Panel profilieren. Die Stress-Lane ist Evidenz für manuelle Performance-Diagnose und Fix-Akzeptanz, kein Default-CI-Gate und kein Ersatz für deterministische Scheduling-Unit-Tests.

Fokussierte Tests pinnen `Notifier`s Per-Frame-Koaleszierung, Structural-Event-Preemption, invalidierte Callbacks und den No-rAF-Fallback und beweisen auf der `Session`-Ebene, dass ein Frame den neuesten akkumulierten Text nur einmal publiziert und dass auf die Finalisierung keine doppelte Benachrichtigung von einem stale Frame-Callback folgt. Kleine Fixture-Unit-Tests pinnen weiterhin Input-Validierung, externe Arrival-Pacing, Concurrency-Rejection, exakte Event-Counts und Terminal-Marker-Zustellung, ohne die 100.000-Chunk-Workload in die Default-Test-Suites zu bringen.

## Erwogene Alternativen

**React-Transitions, Deferred Values oder Component-Throttling auf Snapshots angewendet.** Abgelehnt: Die Session-Quelle würde `useSyncExternalStore` weiterhin für jeden Chunk benachrichtigen, der React-Render ist bereits gelaufen, bevor eine Komponente entscheidet, die Anzeige aufzuschieben, und mehrere Komponenten, die denselben Snapshot konsumieren, müssten die Strategie jeweils selbst implementieren. Visuelles Tail-Following-Throttling für die Think-Summary liegt nach der Snapshot-Publikation und reduziert nur die Frequenz synchronen Layouts; es implementiert nicht die Datenpublikations-Policy.

**Live-Chunks vor dem Definition-Fold droppen oder sampeln.** Abgelehnt: Der Live-akkumulierte State würde vom durable eingebetteten Stream divergieren und könnte sichtbaren Zwischencontent auslassen. Kompakter durable Storage und Frame-koaleszierte React-Publikation lösen unterschiedliche Kosten.

**Nur Microtask-Batching.** Abgelehnt: Aufeinanderfolgende asynchrone `yield`-Operationen können die Microtask-Queue zwischen benachbarten Chunks drainieren, sodass Microtask-Batching sich einer Benachrichtigung pro Chunk annähert.

**Den Test-Producer nach Animation Frames pacen.** Abgelehnt: Der Producer würde sich verlangsamen, wann immer das Rendering sich verlangsamt, was der Seite ein implizites Backpressure gäbe, das ein echter Netzwerk-Stream nicht hat, und Main-Thread-Starvation maskieren würde.

**Ein Live-Modell oder ein aufgezeichneter HTTP-Byte-Stream.** Abgelehnt: Live-Modelle sind nichtdeterministisch, und eine HTTP/SSE-Aufzeichnung würde die Ziel-Assertion nicht verbessern. Das In-Memory-Fixture bewahrt einzelne asynchrone Session-Events, Production-Client-Reduction und den React-Rendering-Pfad, während es Workload und Arrival-Kadenz kontrolliert.

## Konsequenzen

Die Publikationsrate streamender `ConversationSnapshot`-Objekte ist durch die Paint-Rate des Browsers begrenzt, sodass React pro Frame höchstens ein akkumuliertes Partial mit allem empfangenen Text verarbeitet; strukturelle Events können weiterhin früher publizieren. Ingestion, Ordering, Logging, String-Concatenation und Accumulator-Updates laufen weiterhin für jeden rohen Chunk, sodass diese Entscheidung Snapshot-Rebuilds und React-Arbeit reduziert, ohne so zu tun, als sei die Raw-Stream-Parsing-Kosten gelöst.

Horizontale Layout-Reads und -Writes für die kollabierte Think-Summary laufen höchstens einmal alle drei Frames, und jedes Update bewegt die Summary direkt zur neuesten Position; React committet akkumulierte Snapshots weiterhin normal, und die Summary kehrt bei Finalisierung zur ersten Zeile zurück. Diese lokale visuelle Policy ändert nicht die Unmittelbarkeit von Body-Scrolling oder Nutzerinteraktionen.

Die Browser-Stress-Lane liefert weiterhin ein Responsiveness-Signal von der echten assemblierten Anwendung und einen Einstiegspunkt für sichtbares Profiling, aber Hardware- und Scheduling-Unterschiede machen sie nur als explizite Performance-Evidenz geeignet. Deterministische fokussierte Tests hüten Publikations-Counts, akkumulierten Content und Preemption-Reihenfolge, während die Default-Test-Lanes schnell bleiben.
