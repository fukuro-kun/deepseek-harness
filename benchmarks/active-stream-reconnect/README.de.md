# Active-Assistant-Reconnect-Benchmark
[English](README.md) | [中文](README.zh.md) | Deutsch


[reconnect.bench.client.ts](reconnect.bench.client.ts) misst den produktiven Client-Fold, wenn ein Reconnect ein unvollendetes Reasoning-Präfix aus 100.000 Deltas mit sich bringt. Ein kompilierter privater Adapter erreicht `ClientAssistantStream.replace()`, ohne Produkt-Exporte hinzuzufügen. Drei frische Plain-Node-Worker synthetisieren die kompakte Baseline vor der Zeitmessung; für die Ersetzungszeit und den retained Heap nach erzwungenem GC gelten getrennte Median-Budgets. Das nächste dicht nummerierte Live-Frame muss weiterhin akzeptiert werden. Die gehostete Standard-CI verwendet eine Ersetzungserwartung von 50 ms mit dem gemeinsamen 1,25×-Headroom (Obergrenze 63 ms); das Retained-Heap-Budget bleibt bei 30 MiB. Die Kontrollen aus aufgezeichneten Samples und synthetischer Regression verwenden dieselbe Zeitassertion wie das Worker-Urteil.

Mit `pnpm run build:bench` bauen, dann `benchmarks/active-stream-reconnect` in `vitest.bench.config.ts` auswählen. Diese fokussierte Node-Workload baut und misst kein Browser-Rendering. [Frontend-Performance-Budgets](../../.agents/notes/implemented/testing/2026-09-06-frontend-performance-budgets.de.md) dokumentiert Kalibrierung und Ausschlüsse.
