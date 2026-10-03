# Agent Note: CI-Fixture-Completion und -Isolation
[English](2026-09-08-ci-completion-observations.md) | [中文](2026-09-08-ci-completion-observations.zh.md) | Deutsch

Status: implemented


## Problem

Der [Referenz-CI-Run](https://github.com/deepseek-harness/deepseek-harness/actions/runs/34206953049) berichtet eine per Webhook erstellte Session, die nach einem Ein-Sekunden-Poll fehlt, und leere PowerShell-Ausgabe vor einer Fünf-Sekunden-Read-Deadline. HTTP-Acceptance, projizierter UI-State, Process-Startup und durable Completion sind separate Beobachtungen. Tests brauchen eine explizite Completion-Bedingung und Controls, die verhindern, dass ein Zwischenzustand sie erfüllt. Die [Completion-Wait-Entscheidung](2026-09-08-ci-readiness-and-completion.de.md) besitzt diese Bedingungen und Lane-Budgets; diese Fixtures machen deren Reihenfolge und Cleanup unter kontrollierten Delays beobachtbar.

## Entscheidung

Der [GitHub-Review-Browser-Test](../../../../apps/web/tests/github-ready-review.e2e.ts) hält echte Workspace-Erstellung nach HTTP 202 zurück, verifiziert, dass weder der Agent noch der Modell-Request existiert, gibt dann die Erstellung frei und wartet auf das `turn/end` der passenden Session. Cleanup gibt die Barriere frei, restauriert die Methode und entfernt den Event-Listener selbst bei Test-Timeout. Workspace-Membership, Request-Counts, Prompt-Content und Browser-Erwartungen behalten ihre ursprünglichen Assertions.

Die [PowerShell-Executor-Tests](../../../../packages/shell/pwsh-local/tests/executor.spec.ts) halten Startup und konsumierende Reads an privaten File-Barrieren zurück. Der Test kontrolliert, wann spätere Ausgabe verfügbar wird; finale stdin-/Environment-Ausgabe wird nach `done` gelesen. Polling nutzt das aktive Test-Budget, und jeder konstruierte Context wird vor der Plugin-Initialisierung registriert. Teardown erfasst Contexts und Verzeichnisse vor dem Await des Disposals und entfernt Verzeichnisse erst nach Abschluss dieses Disposals.

Der [Queued-Image-Test](../../../../apps/web/tests/queue-image.e2e.ts) hält Admission und Attachment-Retrieval separat zurück und erfasst dann das geladene Thumbnail der admitted Row. Cleanup teilt ein Promise, gibt zurückgehaltene Requests frei und drainiert ihre Handler vor dem Schließen des Browsers.

Der [Details-Session-Lifecycle-Test](../../../../apps/web/tests/details-session-lifecycle.e2e.ts) wartet auf die vom Frame erfassten Animation-Promises, nachdem der Closed-State erscheint, und prüft dann die Zero-Width-Track. Cancelled Transitions erreichen diese Assertion ebenfalls; Animation-Settlement kann eine persistente Nonzero-Track nicht bestehen lassen.

Der [Whole-Queue-Steering-Test](../../../../apps/web/tests/steering.e2e.ts) wartet auf aktivierte Steering-Actions und den Queue-Steering-Hint des Composers. Eine Model-Stream-Barriere hält die folgende Question-Composer-Übernahme pending, während der Test Steering beobachtet. Teardown gibt diese Barriere vor dem Browser-Close frei.

Der [Workspace-Management-Test](../../../../apps/web/tests/workspace-management.e2e.ts) wartet auf restaurierten Composer-Fokus vor der nächsten Directory-Dialog-Geste. Sein Archive-Fall vergibt der bekannten Seed-Id über den Session-Controller einen expliziten User-Title und nutzt dann genau diesen Title, um die Row über Reload hinweg zu identifizieren. Eine unverbundene restaurierte Row kann diesen Locator nicht erfüllen; die durable Archive-Assertion prüft weiterhin Seed-Id und behaltenes Log.

Die [Worker-Budget-Tests](../../../../packages/code-runtime/code-runtime-worker-thread/tests/budget.spec.ts) behalten echte Worker-Ausführung und Binding-Transport, während sie Host-Timer und ELU-Samples kontrollieren. Sie bestätigen den Binding-Eintritt, bevor sie Idle-, Active- und Wall-Clock-Entscheidungen ausüben, sodass ein Bootstrap-Timeout während eines Bindings nicht als Budget-Entscheidung einspringen kann. Die [Real-Worker-Tests](../../../../packages/code-runtime/code-runtime-worker-thread/tests/runtime.spec.ts) behalten unabhängig tatsächliches ELU-, Idle-Binding- und Hot-Loop-Coverage.

Die [Detached-Launch-Tests](../../../../packages/host/open-in-app/tests/launch-detached.spec.ts) kontrollieren Watch-Time und liefern späte Process-Events über die registrierten Callbacks des echten Launchers. Sie prüfen ein Settlement, ein Unref und kein Child-Kill. Real-Process-Environment- und Early-Exit-Fälle bleiben in den [Resolver-Tests](../../../../packages/host/open-in-app/tests/resolver.spec.ts).

Der [LSP-Backpressure-Test](../../../../packages/lsp/lsp-stdio/tests/instance.spec.ts) bewahrt das echte Paused-Reader-Fixture und den großen nativen Pipe-Write. Vor dem Akzeptieren des Abort-Fehlers verifiziert er, dass der pending Write-Callback settlete und der erfasste Subprozess abgeschlossen wurde; `instance.dead` allein kann bereits wahr sein, sobald Disposal beginnt.

### Built-Client-Import-Klassifikation

Der [Node-Import-Sweep](../../../../packages/experimental/webworker-runtime/tests/compile/transform-corpus-check.ts) lässt das Dockkit-Bundle nur zu, wenn Node `ERR_UNKNOWN_FILE_EXTENSION` für seinen exakten `dockkit.module.css`-Pfad meldet. Andere Fehler und unerwartet erfolgreiche Exempt-Imports schlagen fehl. Gescopte Resolve-/Load-Hooks prüfen erwartetes CSS-Failure, beliebiges Failure, ein anderes Stylesheet, einen anderen Fehlercode und stale Exemption, ohne geteilte Build-Artefakte zu modifizieren.

## Erwogene Alternativen

**Production-Timeouts, Retries oder Suite-Serialisierung.** Abgelehnt, weil keines davon die fehlende Completion-Beobachtung etabliert.

**Completion aus Acceptance oder einem Preview inferiert.** HTTP 202 und ein optimistisches Image können der assertierten Operation vorausgehen.

**Kontrollierte Samples ersetzen gemessene Worker-Coverage.** Abgelehnt, weil sie die Verifikation von Nodes tatsächlichem ELU- und Transport-Verhalten auslassen.

## Konsequenzen

Jedes Fixture besitzt seine Clocks, Barrieren, Callbacks, Prozesse und temporären Pfade. Kontrollierte Beobachtungen ergänzen echte Worker-, Subprocess-, Browser- und Persistenz-Pfade. Produktverhalten, Production-Timing, Benchmark-Budgets, CI-Scheduling und aufgezeichnete Erwartungen bleiben unverändert.
