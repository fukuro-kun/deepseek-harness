# Agent Note: Bounded, escalating signal shutdown for Web and headless
[English](2026-08-03-cli-signal-shutdown-escalation.md) | [中文](2026-08-03-cli-signal-shutdown-escalation.zh.md) | Deutsch

Status: implemented


## Problem

Das standardmäßige Telemetry-Mount fügte `dsh web` und dem Headless-Kommando (jetzt `dsh --profile headless`) SIGINT/SIGTERM-Handler hinzu, damit der Prozess-Exit den Cordis-Baum drainen konnte, statt queued Telemetrie zu verwerfen. Jeder Handler nutzte einen Einweg-Boolean-Latch und exitete erst, nachdem `ctx.fiber.dispose()` gesettlet war. Auch der normale Headless-Abschluss awaitete diesen Disposal ohne Begrenzung.

Ein Benutzer reproduzierte daraufhin, dass das Headless-Kommando unmittelbar nach der Observation-URL hing und wiederholtes `Ctrl+C` ignorierte; `DSH_TELEMETRY_DISABLED=1` beseitigte das Hängen, während ein eigenständiger Node-Handler in derselben Linux-Sandbox SIGINT empfing. Das isolierte den ausstehenden Disposer auf Telemetrie statt auf Terminal-Signalweiterleitung. OTels `BatchLogRecordProcessor.shutdown()` awaitet `exporter.forceFlush()` vor der durch `exportTimeoutMillis` begrenzten Completion-Promise, und `forceFlush()` des OTLP-Exporters wartet direkt auf seine in-flight HTTP-Promise. Eine Proxy-/Sandbox-Verbindung, die nie einen Socket erhält, kann den Provider-Shutdown daher trotz beider konfigurierter SDK-Timeouts ausstehend lassen.

Der Latch verwandelte diesen Telemetrie-Defekt dann in eine unkillbare CLI: Der normale Abschluss awaitete bereits den einmaligen Root-Disposal; das erste SIGINT jointe denselben ausstehenden Disposal und setzte den Signal-Latch; spätere SIGINTs kehrten am Latch zurück, sodass dem Prozess kein Ausweg mehr blieb. Ein vor dem normalen Abschluss empfangenes Signal hatte denselben unbegrenzten Wait. Web nutzte dieselbe Latch-Form.

Die eigenen Timeouts von SessionTelemetryBackend können nicht beweisen, dass der gesamte Plugin-Baum settlet. Jeder gegenwärtige oder künftige Disposer kann sich verklemmen, und die Prozessgrenze muss sowohl einen graceful ersten Versuch als auch einen benutzerkontrollierten Ausweg bewahren.

## Decision

Der Fix hat zwei Ownership-Ebenen. Das OTel-Backend ergänzt `shutdownTimeoutMillis` (Default- und ausgelieferter Wert: drei Sekunden) um die vollständige Shutdown-Promise des SDK-Providers. Bei Überschreitung rejectet es in den bestehenden Contained-Failure-Pfad des Telemetrie-Koordinators, sodass der Cordis-Baum den Disposal abschließen kann; ausstehende Records können verloren gehen, weil OTel keine Cancellation für die Transport-Promise anbietet.

Web und Headless teilen sich `createProcessShutdown`, einen prozesseigenen Controller um den Root-Disposal:

- Normale Shutdown-Aufrufe koaleszieren auf einen Disposal und behalten den zuerst angeforderten Exit-Code; sie eskalieren einander nie. Erfolgreicher Disposal zeichnet den Code über `process.exitCode` auf und lässt Node seine restlichen Handles natürlich drainen. Fehlschlagender Disposal erzwingt den Prozess-Exit trotzdem, weil der Launcher nicht annehmen kann, dass der fehlgeschlagene Baum Quiescence erreicht hat.
- Das erste Signal startet denselben graceful Disposal und einen referenzierten Fünf-Sekunden-Exit-Backstop. Erfolg oder Misserfolg des Disposals exited genau einmal; keines kann den Prozess-Exit abbrechen.
- Ein Signal, das eintrifft, während ein Shutdown aussteht, erzwingt sofortigen Exit mit dem Code dieses Signalpfads. Das schließt das erste `Ctrl+C` ein, nachdem der normale Headless-Abschluss bereits in den Disposal eingetreten ist, sowie ein zweites Signal, nachdem ein Signal den Drain initiiert hat.
- Die Fünf-Sekunden-Grenze ist eine Prozesssicherheits-Invariante, kein Deployment-Regler. Sie ist lang genug für die übliche Drain-Obergrenze des Telemetrie-Deployments und begrenzt dennoch jeden verklemmten Disposer an der Launcher-Grenze.

Der normale Abschluss vermeidet `process.exit()` bewusst: Ein sofort erzwungener Exit nach einem Undici-Request kann Nodes [Windows-libuv-Async-Handle-Assertion](https://github.com/nodejs/node/issues/56645) treffen, bevor das Native-Handle-Cleanup des abgeschlossenen Requests gedraint ist. Ein Signal kann den Exit dennoch erzwingen, nachdem der normale Disposal abgeschlossen ist, falls ein anderes Handle den Prozess am Leben hält.

Headless bewahrt Exit 0 für einen abgeschlossenen Turn, Exit 1 für einen anderen Turn-End-Grund oder API-Fachfehler, 130 für SIGINT und 143 für SIGTERM. Web bewahrt sein bestehendes Verhalten SIGTERM → Exit 0 und SIGINT → Exit 130.

Dies ersetzt die Annahme der [Telemetry-Deployment-Note](../../archived/feature/2026-07-31-web-telemetry-default-mount.md), dass SDK-Exporter-/Prozessor-Timeouts den vollständigen Provider-Shutdown begrenzen, sowie ihre frühere Entscheidung, einen prozesseigenen Backstop aufzuschieben. Das Backend besitzt seine Exportverlust-/Latenz-Politik und schließt die bekannte `forceFlush()`-Lücke des SDK; der Launcher besitzt die äußere Garantie, dass kein Plugin den Prozess unbegrenzt festhalten kann.

## Alternatives considered

**Nur das `shutdown()` des Telemetrie-Backends begrenzen.** Unzureichend, weil es den bekannten OTel-Wait schützt, den Launcher aber nicht vor dem Disposer eines anderen Plugins schützen kann.

**Nodes Standard-Sofort-Exit bei Signal wiederherstellen.** Verworfen, weil ein gesundes erstes Signal weiterhin Telemetrie flushen und andere Ressourcen freigeben soll. Der Sofort-Exit ist der explizite Eskalationspfad, nicht der Default.

**Nur den Fünf-Sekunden-Timeout ergänzen.** Verworfen, weil ein Benutzer, der erneut `Ctrl+C` drückt, verlangt, jetzt aufzuhören zu warten. Diese Absicht für den Rest der Gnadenfrist zu verschlucken, reproduziert das gemeldete Verhalten in kürzerer Dauer.

**Nach erfolgreichem Disposal immer `process.exit()` aufrufen.** Verworfen, weil der Root-Disposal beweist, dass der Anwendungsbaum quiescent ist, nicht dass Node und seine nativen Abhängigkeiten jedes asynchrone Handle abgebaut haben. Das Setzen von `process.exitCode` bewahrt den angeforderten Status und lässt die Runtime diese Arbeit beenden.

## Consequences

Ein gesunder normaler Exit dispost weiterhin den gesamten Cordis-Baum und wartet dann auf das Drainen von Nodes Event Loop. Der bekannte Telemetrie-Wait löst sich nach höchstens drei Sekunden; jeder andere verklemmte Exit dauert ohne weitere Eingabe höchstens fünf Sekunden, und ein Signal beendet einen nachhängenden normalen Abschluss oder einen ausstehenden Shutdown sofort. Erzwungener oder fristgebundener Exit kann Telemetrie-Export oder restliches Cleanup unterbrechen, was nur beabsichtigt ist, nachdem der graceful Vertrag gescheitert ist oder der Benutzer explizit eskaliert hat.

Der Controller ist Launcher-Infrastruktur, kein Cordis-Plugin: Er behauptet nicht, dass der Disposal abgeschlossen wurde, und schwächt nicht die Lebenszyklus-Regel, dass gewöhnliche Disposer Quiescence erreichen müssen.

## Testing

`apps/cli/tests/process-shutdown.spec.ts` pinnt natürlichen Abschluss nach aufgelöstem Disposal, erzwungenen Exit nach rejectetem Disposal, den Fünf-Sekunden-Backstop, Koaleszierung normaler Aufrufe, signalgesteuerten Disposal, ein Signal, das normalen Disposal oder das Drainen von Handles nach dem Disposal unterbricht, sowie die Eskalation durch ein zweites Signal.

`apps/cli/tests/headless-shutdown.e2e.ts` bootet den echten ausgelieferten Web-/Headless-Loader-Baum in einem PTY mit einem Test-only-Plugin, dessen Disposer seinen Eintritt ankündigt und nie settlet. Der Test sendet SIGINT nach der Observation-URL, wartet auf den Nachweis, dass der Disposal begann, sendet erneut SIGINT und verlangt Exit 130. Der Source-/Artifact-Launch-Resolver hält dieselbe Regression auf beiden Ausführungsebenen. Dieser PTY-Fall deckt den benutzersichtbaren Prozesszustand ab; keine Änderung an Modellausgabe-Snapshots.

`packages/session/session-telemetry-otel/tests/otel.spec.ts` hält einen echten OTLP-Request offen, nachdem der Timer-Export begann, und pinnt, dass der Cordis-Disposal bei `shutdownTimeoutMillis` zurückkehrt, obwohl das `forceFlush()` des SDK ausstehend bleibt. Der Collector wird danach freigegeben, sodass die weiter beobachtete Provider-Promise sauber settlet.
