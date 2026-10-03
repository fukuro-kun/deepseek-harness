# Agent Note: Frame-zusammengefasste reasoning-chunk-Publikation und Browser-Stress-Validierung

Status: implemented

[English](2026-08-03-opt-in-reasoning-chunk-browser-stress.md) | [中文](2026-08-03-opt-in-reasoning-chunk-browser-stress.zh.md) | Deutsch

## Problem

Lange reasoning-Streams erzeugen kontinuierlich große Mengen prozess-lokaler `assistant/live-chunk`-Updates vor einer durable Abrechnung. Jedes Update muss geordnet bleiben und in die Assistant Definition gefoldet werden, um die live-Vollständigkeit zu bewahren, während die Abrechnung den exakten Stream für replay einbettet; React braucht jedoch nur das aktuelle akkumulierte Ergebnis, nicht jeden Zwischenzustand innerhalb eines Browser-frames.

Jedes `yield` in einem async-Stream kann eine neue Microtask-Grenze erzeugen, sodass ein nur von Microtask-Batching getragenes `Notifier.markDirty()` degeneriert: pro Chunk ein `ConversationSnapshot`-Rebuild, eine `useSyncExternalStore`-Benachrichtigung und ein React-render. Selbst mit eingeklappter live-Think-Zeile können 100,000 reasoning chunks den Main-Thread mit Reconciliation-, Commit- und Layout-Arbeit überwältigen. Die Performance-Grenze muss zwischen Session-Aufnahme und React-Publikation sitzen; sie darf das Problem nicht durch Verlangsamen des Produzenten oder Verwerfen roher Events verstecken.

## Entscheidung

Der Session Controller hängt jeden Client-only-live-chunk an seine Event-Quelle, und Conversation foldet ihn sofort in jeden passenden Definition State. Chat- und Trajectory-Definitions fordern `animation-frame`-Publikation für sichtbare `block-start`-, `text-delta`-, `reasoning-delta`-, `tool-call-delta`- und `block-end`-chunks an; die erste Änderung plant ein `requestAnimationFrame`, spätere chunks aktualisieren weiterhin den State, und der frame-Callback materialisiert einen akkumulierten snapshot aus dem jüngsten State. `usage` und `finish` fordern keine Publikation an. Die durable `assistant/message`- oder `assistant/attempt`-Abrechnung publiziert sofort und reproduziert denselben finalen Stream beim History-replay.

`BoundConversation` besitzt einen ausstehenden frame pro Session. Gewöhnliche strukturelle Events und durable Abrechnungen fordern sofortige Publikation an, flushen den jüngsten assemblierten State und machen einen späteren frame-Callback harmlos, weil kein dirty Context verbleibt. Umgebungen ohne `requestAnimationFrame` publizieren sofort. Eine Abrechnung darf ein noch nicht erschienenes Zwischen-partial überspringen, während der publizierte finale Inhalt und der durable eingebettete Stream vollständig bleiben.

Die live-Think-Zeile horizontal am Ende des akkumulierten Texts zu pinnen ist reine visuelle Ausrichtung und erfordert keine synchronen Layout-Reads bei jedem React-commit. Ein in-component-Scheduler fasst aufeinanderfolgende Anfragen zu einem Update alle drei frames zusammen, liest `scrollWidth` und `clientWidth` aus dem jüngsten DOM und aktualisiert `scrollLeft` direkt auf die neueste Position; die feste visuelle Kadenz hält Zusammenfassungsänderungen lesbar, ohne dass sich Browser-Smooth-scroll-Animationen ansammeln. Diese Drosselung gilt nur für Thinks horizontale Zusammenfassung und verzögert weder Chat-Body-Scrolling, history-prepend-Ankerung noch benutzerausgelöstes `scrollIntoView`.

`pnpm run test:web:stress` bleibt keyless, Opt-in-Browser-Performance-Evidenz. Die deterministische `?fixture`-Session emittiert 100,000 `reasoning-delta`-Events in einer vom Painting unabhängigen Kadenz, und ein terminaler Marker beweist, dass die Events die Produktions-Session-Reduktion durchqueren und die live-Think-Zeile erreichen; ein 50-Millisekunden-Heartbeat und ein vorgeplantes DOM-Event messen Main-Thread-Stalls bzw. Interaktionslatenz, mit einem 250-Millisekunden-Budget zur Erkennung klarer Regressionen. `DSH_WEB_STRESS_HEADFUL=1` lässt Entwickler dasselbe Szenario in einem sichtbaren Browser mit dem Performance-Panel profilieren. Die stress-lane ist Evidenz für manuelle Performance-Diagnose und Fix-Akzeptanz, kein Default-CI-Gate und kein Ersatz für deterministische Scheduling-Unit-Tests.

Fokussierte Tests pinnen `Notifier`s per-frame-Zusammenfassung, Structural-event-Preemption, invalidierte Callbacks und den no-rAF-Fallback und beweisen auf der `Session`-Ebene, dass ein frame den jüngsten akkumulierten Text nur einmal publiziert und dass auf die Finalisierung keine doppelte Benachrichtigung aus einem stale frame-Callback folgt. Kleine fixture-Unit-Tests pinnen weiterhin Eingabevalidierung, externes Ankunfts-Pacing, Concurrency-Ablehnung, exakte Event-Zahl und Terminal-marker-Lieferung, ohne die 100,000-chunk-Workload in die Default-Test-Suites zu bringen.

## Erwogene Alternativen

**React-transitions, deferred values oder Komponenten-Drosselung auf snapshots angewendet.** Abgelehnt: Die Session-Quelle würde weiterhin für jeden chunk `useSyncExternalStore` benachrichtigen, das React-render ist bereits geschehen, bevor eine Komponente beschließt, die Anzeige zu verzögern, und mehrere Komponenten, die denselben snapshot konsumieren, müssten die Strategie je selbst implementieren. Die visuelle Tail-following-Drosselung für die Think-Zusammenfassung liegt nach der snapshot-Publikation und reduziert nur die Frequenz synchronen Layouts; sie implementiert nicht die Daten-Publikations-Policy.

**Live-chunks vor dem Definition-fold verwerfen oder sampeln.** Abgelehnt: Der live akkumulierte Zustand würde vom durable eingebetteten Stream abweichen und könnte sichtbaren Zwischeninhalt auslassen. Kompakte durable Speicherung und frame-zusammengefasste React-Publikation lösen unterschiedliche Kosten.

**Nur Microtask-Batching.** Abgelehnt: Aufeinanderfolgende asynchrone `yield`-Operationen können die Microtask-Queue zwischen benachbarten chunks entleeren, sodass Microtask-Batching annähernd eine Benachrichtigung pro chunk wird.

**Den Test-Produzenten per Animation-frames pacen.** Abgelehnt: Der Produzent würde sich verlangsamen, wann immer das Rendering sich verlangsamt, und der Seite impliziten backpressure geben, den ein echter Netzwerk-Stream nicht hat, und Main-Thread-Verhungern maskieren.

**Ein live-Modell oder ein aufgezeichneter HTTP-Byte-Stream.** Abgelehnt: Live-Modelle sind nichtdeterministisch, und eine HTTP/SSE-Aufzeichnung würde die Ziel-Assertion nicht verbessern. Das in-memory-fixture bewahrt einzelne asynchrone Session-Events, die Produktions-Client-Reduktion und den React-Rendering-Pfad, während es Workload und Ankunftskadenz kontrolliert.

## Konsequenzen

Die Publikationsrate gestreamter `ConversationSnapshot`-Objekte ist durch die Paint-Rate des Browsers begrenzt, sodass React pro frame höchstens ein akkumuliertes partial mit allem empfangenen Text verarbeitet; strukturelle Events können weiterhin früher publizieren. Aufnahme, Ordnung, Logging, String-Konkatenation und accumulator-Updates laufen weiterhin für jeden rohen chunk, sodass diese Entscheidung snapshot-Rebuilds und React-Arbeit reduziert, ohne zu behaupten, die Raw-stream-Parsing-Kosten gelöst zu haben.

Horizontale Layout-Reads und -Writes für die eingeklappte Think-Zusammenfassung laufen höchstens einmal alle drei frames, und jedes Update bewegt die Zusammenfassung direkt an die neueste Position; React committet akkumulierte snapshots weiterhin normal, und die Zusammenfassung kehrt bei der Finalisierung zur ersten Zeile zurück. Diese lokale visuelle Policy ändert weder die Unmittelbarkeit des Body-Scrollings noch der Benutzerinteraktionen.

Die Browser-stress-lane liefert weiterhin ein Responsivitäts-Signal aus der echten assemblierten Anwendung und einen Einstiegspunkt für sichtbares Profiling, aber Hardware- und Scheduling-Unterschiede machen sie nur als explizite Performance-Evidenz geeignet. Deterministische fokussierte Tests bewachen Publikationszahlen, akkumulierten Inhalt und Preemption-Reihenfolge, während die Default-Test-lanes schnell bleiben.
