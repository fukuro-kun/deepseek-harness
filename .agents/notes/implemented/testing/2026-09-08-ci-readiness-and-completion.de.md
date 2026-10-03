# Agent Note: CI-Assertions warten auf den Abschluss ihrer Operationen
[English](2026-09-08-ci-readiness-and-completion.md) | [中文](2026-09-08-ci-readiness-and-completion.zh.md) | Deutsch

Status: implemented


## Problem

Der [leere Master-PR-Lauf](https://github.com/deepseek-harness/deepseek-harness/actions/runs/34206953049) schlägt fehl, während er eine Sekunde auf die Webhook-Session-Erstellung und fünf Sekunden auf PowerShell-Ausgabe wartet. Keiner der beiden Tests misst eine Startlatenz-Garantie. Ein [separater Lauf](https://github.com/deepseek-harness/deepseek-harness/actions/runs/34207864157) zeigt dasselbe Kurzbudget-Problem in einem Desktop-Worker-Readiness-Test und erfasst eine Feedback-Bestätigung, während der Composer den abgesendeten Befehl noch hält.

Ein weiterer [Windows-Coverage-Lauf](https://github.com/deepseek-harness/deepseek-harness/actions/runs/34224004885/job/102053583437) meldet einen null-Status des publint-Kindprozesses und einen Timeout beim LSP-Initialisierungsmarker. Deren Helper setzen innerhalb des 90-Sekunden-Testbudgets der Lane eigene Fünf- bzw. Drei-Sekunden-Grenzen. Diese Fälle prüfen Veröffentlichungsinhalte und Abbruchverhalten, nicht die Kaltstart-Latenz.

Der [ACP-Coverage-Lauf](https://github.com/deepseek-harness/deepseek-harness/actions/runs/34242280527/job/102115221228) erschöpft nach einem Transportfehler eine einsekündige Registry-Poll-Frist. Die Disconnect-Bereinigung umfasst Abbruch, Entleeren der Ausgabe, Persistenz und Dispose des Owners; die Entfernung aus der Registry allein belegt keinen vollständigen Teardown.

Ein [Worker-Runtime-Coverage-Fehler](https://github.com/deepseek-harness/deepseek-harness/actions/runs/34248221544/job/102135631932) erschöpft das einsekündige Rechenkontingent des Slow-Binding-Fixtures. Gleichzeitige native Windows-Reproduktionen überschreiten dieses Kontingent bereits vor dem Aufruf des Bindings. Die Worker-Initialisierung trägt gemessene Aktivzeit bei; das verzögerte Binding trägt Leerlaufzeit bei.

## Entscheidung

Der [Webhook-Browser-Test](../../../../apps/web/tests/github-ready-review.e2e.ts) beobachtet die durch die Zustellung ausgelöste Modellanfrage, bevor er die Session-Registrierung prüft. Der [Feedback-Test](../../../../apps/web/tests/feedback-command.e2e.ts) wartet auf den leeren Composer und das aktivierte Attachment-Control, bevor er die ARIA-Ausgabe vergleicht. Übereinstimmende aufeinanderfolgende Snapshots können nicht beweisen, dass das Command-RPC abgeschlossen ist: Sein Event-Stream kann die Bestätigung zuerst veröffentlichen.

Der [Desktop-Transaktionstest](../../../../apps/desktop/tests/project-manager.spec.ts) gibt dem Worker-Readiness-Marker das Ausführungsbudget des aktiven Tests. Sein unabhängiges `afterEach` gibt Worker frei und wartet sie ab, bevor private Wurzelverzeichnisse gelöscht werden — auch wenn der Runner einen übergelaufenen Testkörper aufgibt. Das Poll beobachtet die Runner-Cancellation, und der Teardown meldet Transaktionsfehler unabhängig von Assertion-Fehlern. Die [PowerShell-Tests](../../../../packages/shell/pwsh-local/tests/executor.spec.ts) registrieren jeden helper-erzeugten Context vor der Plugin-Initialisierung und disposen diese Contexts vor dem Löschen temporärer Verzeichnisse. Der Hintergrund-Input-Fall wartet den Prozessabschluss ab, bevor er vollständige Ausgabe, Abschlussstatus und Exit-Code prüft. Konsumierende Reads bleiben durch ihre separaten Streaming-Tests abgedeckt.

Die [publint-Runner-Tests](../../../../scripts/publint-all.spec.ts) übergeben das aktive Testbudget an ihren Kindprozess und prüfen Startfehler und Terminierungssignale, bevor sie dessen Exit-Code interpretieren. Der [LSP-Instanztest](../../../../packages/lsp/lsp-stdio/tests/instance.spec.ts) nutzt dasselbe Budget für seinen Fixture-Marker, beobachtet den tatsächlich ausstehenden `didOpen`-Write vor dem Abbruch und fängt die Rejection der Anfrage ein, bevor er auf Readiness wartet. Sein [Server-Fixture](../../../../packages/lsp/lsp-stdio/tests/fixture-server.ts) veröffentlicht den Marker nach dem Pausieren von stdin. Der Teardown erfasst Instanzliste, Context und Verzeichnis vor seinem ersten await.

Die [ACP-Disconnect-Tests](../../../../packages/acp/acp/tests/dispose.spec.ts) warten sowohl bei EOF als auch bei Transportfehlern den Disposer des echten Session-Handles ab. Eine Barriere hält den Dispose zurück, während der Test die Ownership prüft, gibt ihn dann frei, bevor der Abschluss abgewartet und beide Registries geprüft werden. Keiner der Fälle ruft den Plugin-Dispose auf, um das zu prüfende Verhalten auszulösen. Der unabhängige Teardown-Hook gibt die Barriere frei, bevor er den erfassten Context disposed — auch wenn der Testkörper in den Timeout läuft.

Die [Subagent-Teardown-Entscheidung](2026-09-07-subagent-teardown-test-budgets.de.md) besitzt die Lifecycle-Bereinigungsbudgets. Die [Persistent-PowerShell-Entscheidung](2026-09-07-pwsh-ci-observable-completion.de.md) besitzt exakte versus abgeleitete Terminal-Readiness; das Completion-Promise eines einmaligen Prozesses hat eine andere Semantik.

Der [Worker-Runtime-Binding-Test](../../../../packages/code-runtime/code-runtime-worker-thread/tests/runtime.spec.ts) gewährt fünf Sekunden Rechenzeit für die Source-Worker-Initialisierung und verzögert das Binding um 6,5 Sekunden. Würde diese Leerlaufverzögerung angerechnet, überschritte sie trotzdem das gesamte Rechenkontingent. Der Fall behält sein 15-Sekunden-Testlimit und seine 30-Sekunden-Wall-Obergrenze, registriert Context- und Reply-Timer-Bereinigung und belässt die Hot-Loop-, Decoy-Dispatch-, Wall-Ceiling- und Abort-Kontrollfälle bei ihren bestehenden Limits. Produktionsbudgets bleiben unverändert.

## Erwogene Alternativen

**Größere unabhängige Wartezeiten.** Abgelehnt, wo bereits ein Completion-Promise existiert. Eine separate Poll-Deadline konkurriert weiterhin mit dem Budget der Ausführungs-Lane.

**Das Feedback-Golden aktualisieren.** Abgelehnt: Der gefüllte Composer und das deaktivierte Attachment-Control beschreiben eine noch laufende Submission. Die abgeschlossene erwartete UI bleibt das beabsichtigte Verhalten.

**CI serialisieren oder diese Tests wiederholen.** Abgelehnt: Beides etabliert weder die fehlende Abschlussbedingung noch gibt es einen blockierten Kindprozess nach einem Assertion-Fehler frei.

## Konsequenzen

Readiness- und Output-Assertions behalten ihre ursprünglichen Inhalts- und Ownership-Prüfungen. Kontrollierte Desktop-Readiness-, Webhook-Preflight-, Command-Response-, PowerShell-Output-, publint-Start- und LSP-Initialisierungsverzögerungen reproduzieren die ursprünglichen Fehler und bestehen mit den Completion-Waits. Ein hängender Desktop-Worker-Kontrollfall meldet weiterhin einen Test-Timeout und beweist dabei, dass der Teardown den Kindprozess entleert, bevor er dessen Verzeichnis entfernt. Die Ausführungs-Lane begrenzt Testkörper und Cleanup-Hooks getrennt; die native Windows-Ausführung bleibt nötig, um PowerShell- und Prozessbereinigung dort zu verifizieren.
