# Agent Note: Subagent-Teardown-Tests erben die Budgets ihrer Ausführungs-Lane

Status: implemented

[English](2026-09-07-subagent-teardown-test-budgets.md) | [中文](2026-09-07-subagent-teardown-test-budgets.zh.md) | Deutsch

## Problem

Der [Windows-Coverage-Lauf](https://github.com/deepseek-harness/deepseek-harness/actions/runs/34085536250/job/101628739668) meldet zwei Teardown-Fehler, obwohl Tests und Hooks 90 Sekunden eingeräumt wurden. Der ACP-Ignored-EOF-Test lässt den Dispose gegen seinen eigenen Fünf-Sekunden-Timer laufen. Der echte Codex-Test überschreibt das Hook-Budget mit 30 Sekunden. Keine dieser Deadlines prüft eine Produkt-Latenzgarantie. Der Codex-Testkörper hat das Prozessbaum-Ende bereits beobachtet, bevor sein Hook fehlschlägt; das Log zeigt nicht, ob Context-Dispose, HTTP-Schließen oder das Entfernen des temporären Verzeichnisses das Hook-Budget überschritt.

## Entscheidung

Der [ACP-Test](../../../../packages/subagent/subagent-acp/tests/subagent-acp.spec.ts) wartet den Dispose unter dem Testbudget der Ausführungs-Lane ab und prüft danach das tatsächliche Kind-Ergebnis. Das Failure-Cleanup wartet Dispose und Kind-Abschluss ab, bevor es das private Verzeichnis entfernt. Eine verzögerte Exit-Beobachtung beweist, dass der Dispose nicht schon deshalb abgeschlossen sein kann, weil eine Terminierung angefordert wurde. Die produktiven EOF- und Terminierungs-Grace-Periods bleiben unverändert.

Der [Codex-Test](../../../../packages/subagent/subagent-codex/tests/real-product.spec.ts) erbt das Hook-Budget der Ausführungs-Lane. Das Cleanup erfasst seine Contexts, HTTP-Fixtures und temporären Wurzelverzeichnisse vor seinem ersten asynchronen Warten, sodass ein übergelaufener Hook keine Ressourcen entleeren kann, die ein anderer Test registriert hat. Es bewahrt die Reihenfolge Context-Dispose, Server-Schließen, Verzeichnis-Entfernen, wartet jeden erfassten Disposer ab und versucht die übrigen Cleanup-Stufen auch nach einer Rejection. Gesammelte Fehler benennen die jeweils fehlschlagende Stufe oder den Pfad und behalten ihre Ursachen; das Cleanup meldet sie erst, nachdem alle erfassten Ressourcen versucht wurden.

Die [native-Windows-CI-Entscheidung](../process/2026-08-08-native-windows-pull-request-ci.de.md) besitzt weiterhin Lane-Scheduling und Budgets. Diese Änderung entfernt nur konkurrierende lokale Deadlines und verschärft Ressourcen-Lebenszeit-Assertions; sie belegt weder einen Windows-Prozessabbruch- noch einen Dateisystem-Defekt.

## Erwogene Alternativen

- Produktive Grace-Periods oder Dateisystem-Retries erhöhen: Die Fehler belegen weder falsches Produkt-Timing noch erschöpfte Entfernungs-Retries.
- Lokale Deadlines durch größere Konstanten ersetzen: Auch das würde künftige Lane-Budgets weiter überschreiben.
- Nach dem Anfordern der Terminierung sofort aus dem Cleanup zurückkehren: Das würde Kindern oder Sockets erlauben, das Fixture zu überleben.
- Coverage serialisieren: Unbeteiligte Tests müssen nicht zugunsten zweier lokaler Deadline-Überschreibungen Parallelität verlieren.

## Konsequenzen

Der Lane-Timeout bleibt eine Obergrenze für Hänger. Gezielte Tests verifizieren den beobachteten Kind-Abschluss und die Cleanup-Ownership statt der Terminierungsgeschwindigkeit des Hosts. Native Windows-Läufe bleiben nötig für taskkill-, Prozessende-Zustellungs- und NTFS-Entfernungsnachweise; erfolgreiche macOS-Tests können diese Mechanismen nicht beweisen. Keine Änderung an modellsichtbarer Ausgabe, Session-Fixtures, Produktions-Timeouts oder CI-Routing.
