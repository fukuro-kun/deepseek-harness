# Agent Note: CI-fixture-Abschluss und -Isolation

Status: implemented

[English](2026-09-08-ci-completion-observations.md) | [中文](2026-09-08-ci-completion-observations.zh.md) | Deutsch

## Problem

Der [Referenz-CI-Lauf](https://github.com/deepseek-harness/deepseek-harness/actions/runs/34206953049) meldet eine webhook-erzeugte Session, die nach einem Ein-Sekunden-Poll fehlt, und leere PowerShell-Ausgabe vor einer Fünf-Sekunden-Lesefrist. HTTP-Akzeptanz, projizierter UI-Zustand, Prozess-Start und durable completion sind separate Beobachtungen. Tests brauchen eine explizite Abschlussbedingung und Kontrollen, die verhindern, dass ein Zwischenzustand sie erfüllt. Die [completion-wait-Entscheidung](2026-09-08-ci-readiness-and-completion.de.md) besitzt diese Bedingungen und lane-Budgets; diese fixtures machen ihre Ordnung und ihr Cleanup unter kontrollierten Verzögerungen beobachtbar.

## Entscheidung

Der [GitHub-review-Browser-Test](../../../../apps/web/tests/github-ready-review.e2e.ts) hält die echte workspace-Erzeugung nach HTTP 202 zurück, verifiziert, dass weder der Agent noch die Modellanfrage existiert, gibt dann die Erzeugung frei und wartet auf das `turn/end` der passenden Session. Das Cleanup gibt die Barriere frei, restauriert die Methode und entfernt den Event-Listener selbst dann, wenn der Test in ein Timeout läuft. Workspace-Mitgliedschaft, Request-Zahlen, Prompt-Inhalt und Browser-Erwartungen behalten ihre ursprünglichen Assertions.

Die [PowerShell-executor-Tests](../../../../packages/shell/pwsh-local/tests/executor.spec.ts) halten Start und konsumierende Lesevorgänge an privaten Datei-Barrieren zurück. Der Test kontrolliert, wann spätere Ausgabe verfügbar wird; die finale stdin-/Umgebungs-Ausgabe wird nach `done` gelesen. Polling nutzt das aktive Test-Budget, und jeder konstruierte Context wird vor der plugin-Initialisierung registriert. Der Teardown erfasst Contexts und Verzeichnisse, bevor er das Dispose abwartet, und entfernt Verzeichnisse erst nach dessen Abschluss.

Der [queued-image-Test](../../../../apps/web/tests/queue-image.e2e.ts) hält Zulassung und Attachment-Abruf separat zurück und erfasst dann das geladene Thumbnail der zugelassenen Zeile. Das Cleanup teilt ein Promise, gibt zurückgehaltene Anfragen frei und leert deren Handler, bevor es den Browser schließt.

Der [Details-Session-lifecycle-Test](../../../../apps/web/tests/details-session-lifecycle.e2e.ts) wartet auf die vom frame erfassten Animations-Promises, nachdem der geschlossene Zustand erscheint, und prüft dann die Null-Breite-Spur. Abgebrochene Übergänge erreichen diese Assertion ebenfalls; Animations-Abrechnung kann eine persistente Nicht-Null-Spur nicht bestehen lassen.

Der [whole-queue-steering-Test](../../../../apps/web/tests/steering.e2e.ts) wartet auf aktivierte steering-Aktionen und den queue-steering-Hinweis des composer. Eine Modell-stream-Barriere hält die folgende question-composer-Übernahme pending, während der Test steering beobachtet. Der Teardown gibt diese Barriere vor dem Browser-Close frei.

Der [workspace-management-Test](../../../../apps/web/tests/workspace-management.e2e.ts) wartet auf den restaurierten composer-Fokus vor der nächsten Verzeichnis-Dialog-Geste. Sein Archiv-Fall gibt der bekannten seed id über den Session controller einen expliziten Benutzer-Titel und nutzt dann genau diesen Titel, um die Zeile über einen reload hinweg zu identifizieren. Eine unbeteiligte restaurierte Zeile kann diesen Locator nicht erfüllen; die durable archive-Assertion prüft weiterhin die seed id und das zurückbehaltene log.

Die [worker-budget-Tests](../../../../packages/code-runtime/code-runtime-worker-thread/tests/budget.spec.ts) behalten echte worker-Ausführung und Binding-Transport, während sie host-Timer und ELU-Samples kontrollieren. Sie quittieren den Binding-Eintritt, bevor sie idle-, active- und Wall-Clock-Entscheidungen ausüben, sodass ein bootstrap-Timeout keine Budget-Entscheidung während eines Bindings vertreten kann. Die [real-worker-Tests](../../../../packages/code-runtime/code-runtime-worker-thread/tests/runtime.spec.ts) behalten unabhängig tatsächliche ELU-, idle-binding- und hot-loop-Abdeckung.

Die [detached-launch-Tests](../../../../packages/host/open-in-app/tests/launch-detached.spec.ts) kontrollieren die Beobachtungszeit und liefern späte Prozess-Events über die registrierten Callbacks des echten launcher. Sie prüfen eine Abrechnung, ein unref und kein Kind-Kill. Real-Prozess-Umgebungs- und Early-exit-Fälle bleiben in den [resolver-Tests](../../../../packages/host/open-in-app/tests/resolver.spec.ts).

Der [LSP-backpressure-Test](../../../../packages/lsp/lsp-stdio/tests/instance.spec.ts) bewahrt das echte paused-reader-fixture und den großen nativen Pipe-Write. Vor dem Akzeptieren des abort-Fehlers verifiziert er, dass der ausstehende Write-Callback abgerechnet wurde und der erfasste Subprozess abgeschlossen ist; `instance.dead` allein kann wahr sein, sobald das Dispose beginnt.

### Built-client-import-Klassifikation

Der [Node-import-sweep](../../../../packages/experimental/webworker-runtime/tests/compile/transform-corpus-check.ts) lässt das Dockkit-bundle nur zu, wenn Node `ERR_UNKNOWN_FILE_EXTENSION` für seinen exakten `dockkit.module.css`-Pfad meldet. Andere Fehler und unerwartet erfolgreiche exempt imports scheitern. Scoped resolve/load-Hooks üben erwarteten CSS-Fehler, beliebige Fehler, ein anderes Stylesheet, einen anderen Fehlercode und stale exemption aus, ohne geteilte Build-Artefakte zu modifizieren.

## Erwogene Alternativen

**Produktions-Timeouts, Retries oder Suite-Serialisierung.** Abgelehnt, weil keines die fehlende Abschlussbeobachtung herstellt.

**Abschluss aus Akzeptanz oder einer Vorschau abgeleitet.** HTTP 202 und ein optimistisches Bild können der assertierten Operation vorauseilen.

**Kontrollierte Samples, die gemessene worker-Abdeckung ersetzen.** Abgelehnt, weil sie die Verifikation von Nodes tatsächlichem ELU- und Transportverhalten auslassen.

## Konsequenzen

Jedes fixture besitzt seine Uhren, Barrieren, Callbacks, Prozesse und temporären Pfade. Kontrollierte Beobachtungen ergänzen echte worker-, Subprozess-, Browser- und persistence-Pfade. Produktverhalten, Produktions-Timing, benchmark-Budgets, CI-Scheduling und aufgezeichnete Erwartungen bleiben unverändert.
