# Agent Note: Runner-eigener temporärer Storage für PR-CI

Status: implemented

[English](2026-09-06-pr-ci-runner-temporary-storage.md) | [中文](2026-09-06-pr-ci-runner-temporary-storage.zh.md) | Deutsch

## Problem

Der Linux-Failover-Pool führt mehrere Runner-Instanzen auf einer VM aus. PR-Coverage- und Snapshot-Prozesse nutzen das Betriebssystem-Temp-Verzeichnis für transformierte Module und Fixtures. Dateien außerhalb des Temp-Verzeichnisses des Runners entkommen seinem Job-Cleanup, auch wenn eine Cancellation das prozess-level Disposal verhindert. Das Ausschöpfen dieses geteilten Verzeichnisses lässt unverbundene PRs fehlschlagen, bevor Tests ausgeführt werden.

## Entscheidung

Die Static-, Coverage- und Consumer-Jobs in [PR CI](../../../../.github/workflows/ci.yml) exportieren `TMPDIR=runner.temp` über `GITHUB_ENV` in ihrem ersten Step, bevor irgendein Setup- oder Test-Prozess startet. Node, Vite, tsx und temporäre Test-Consumer erben die runner-eigene Location. Jeder Runner besitzt sein Verzeichnis, und GitHub Actions räumt dessen entfernbare Inhalte bei Job-Start und -Abschluss; Fixtures allokieren weiterhin eindeutige Children und behalten ihr eigenes Cleanup.

npm behält seinen konfigurierten persistenten Cache, normalerweise `$HOME/.npm` auf POSIX, ohne Per-Job-Override in den Haupt-CI- oder Release-Workflows. Der pnpm-Store bleibt geteilt unter `$HOME/.local/share/pnpm/store`. Beide behalten Runner-übergreifende Wiederverwendung unter dem Concurrent-Access-Support der Paketmanager; Shared-Cache-Kapazität und Filesystem-Fehler bleiben operative Verantwortung. Der Consumer-Job legt Playwright-Browser-Downloads und Installations-Locks neben `RUNNER_TEMP`; Hosted-Cache-Restore nutzt dieselbe Location.

Die [Release-Rehearsal-Entscheidung](../process/2026-09-06-release-rehearsal-selfhosted.de.md) wendet dieselbe Lifetime-Regel auf Release-Consumer an. Das [Failover-Runbook](../process/2026-07-26-ci-failover-runbook.de.md) besitzt weiterhin Runner-Selektion und Shared-Host-Kapazität. Diese Änderung retargetet keine Jobs, reduziert keine Concurrency, wiederholt keine Tests, schwächt keine Assertions und modifiziert kein Master-only-CI.

## Aufgezeichnete ACP-Completion-Reihenfolge

Das [ACP-Diagnostic-Szenario](../../../../snapshots/session/subagent-acp-diagnostic/cordis.snapshot.yml) hält seine skriptierte Background-Response zurück, bis `job_output` den Completion-Wait besitzt. Ohne diese Synchronisation kann ein schnelles Child eine legitime Job-Notice zwischen den aufgezeichneten Parent-Steps publizieren. Ein szenario-lokaler Wrapper gibt das Child frei, nachdem der Jobs-Service den Completion-Waiter registriert; der Mock beobachtet einen exklusiven Marker im privaten Test-Workspace und schließt den Watcher nach der Freigabe. Das Fixture restauriert die gewrappte Methode bei Disposal. Die aufgezeichneten Session-Bytes und das Production-Job-Notice-Verhalten bleiben unverändert.

## Workspace-Grant-Fixture-Platzierung

Das Headless-`session-sandbox-root`-Fixture deklariert `workspace.parent: outside-temp`, keine Home-Filesystem-Dependency. Sein Allocator nutzt ein Sibling der kanonischen Plattform-Temp-Root, wo der Parent beschreibbar ist und System-Temporary-Grants vermieden werden, sonst Home, und lehnt ein Cwd ab, das bereits von automatischen Temporary-Write-Grants abgedeckt ist. Auf dem Failover-Runner hält dies den Test auf dem Datenvolumen, ohne dass sein Schreiben durch eine Temporary-Directory-Ausnahme gelingt. Die Filesystem-Sandbox-Containment-Tests nutzen denselben Allocator für ihren Workspace und das verweigerte Sibling; sie registrieren Cleanup sofort nach erfolgreicher Acquisition. Atomare Workspace-Allokation, aufgezeichnete Session-Bytes und die unabhängige Expected-Datei bleiben unverändert.

## Live-Verifikation und Browser-Fixture-Inputs

Der Installed-Wheel-Live-SDK-Test ersetzt die erstellte Datei extern durch eine frische Host-only-Challenge, bevor er das Modell bittet, sie zu verifizieren; der Verification-Prompt enthüllt diesen Wert nicht. Beide Turns müssen modell-angefragte Tool-Calls enthalten, und der Verifier vergleicht den zurückgegebenen Wert und die tatsächlichen Dateibytes.

Das Reference-Composer-Fixture mappt die bekannte Home-abgekürzte Workspace-Anzeige auf sein bestehendes Cwd-Token und wartet vor der Selektion auf das aktuelle exakte Suggestion-Set; weder Host-Pfade noch stale Suggestions bestimmen sein Ergebnis. Die geteilte Browser-Timezone, Inspector-Subscription-Synchronisation und das PowerShell-Completion-Verhalten folgen der [bestehenden Plattform-Test-Entscheidung](2026-09-07-pwsh-ci-observable-completion.de.md).

Der Advanced-Python-Snapshot pausiert nur den ersten Pre-Step seines matchenden Workflow-Childs, bis das durable Workflow-Membership-Event des Parents beobachtet wird. Das Fixture unterstützt beide Event-Arrival-Reihenfolgen und bricht pending Waits bei Abort oder Disposal ab. Dies pint die Cross-Session-Reihenfolge des Szenarios, ohne Notifications zu sortieren oder Production-Scheduling zu ändern.

Der Queue-Snapshot bewegt den Pointer vom Stop-/Send-Control weg und wartet auf das Schließen seines Send-Tooltips vor dem Capture. Workspace-Management-Tests selektieren die einzige nicht-leere Session über ihre Actions-Affordance, nicht über die Row-Position, und selektieren diese Session, bevor sie assertieren, dass deren Archivierung den leeren Ungrouped-Bucket entfernt. Hover-Verhalten, Queue-Content, durable Archive-Identität und Reload-Assertions bleiben unverändert. Der Concurrent-Spill-Isolation-Test hält jede Root mit ihrem Run-Ergebnis gepaart, statt anzunehmen, dass die Filesystem-Allocation-Completion-Reihenfolge der Input-Reihenfolge entspricht.

## Erwogene Alternativen

**Geteilte Temp-Dateien aus einem PR-Job löschen.** Ein anderer Runner könnte diese Dateien noch besitzen. Repository-Jobs dürfen ein geteiltes Verzeichnis nicht nach Pfadname oder Alter zurückfordern.

**Tests wiederholen oder Timeouts vergrößern.** Keines davon stellt Storage wieder her oder gibt Restdateien einen Cleanup-Owner.

**Jeden Job auf gehostete Runner umstellen.** Dies vermeidet die betroffene VM, lässt aber den Failover-Pfad defekt und ändert die unabhängige Pool-Selektion des Operators.

## Konsequenzen

Output, der `TMPDIR` honoriert, folgt der Job-Lifetime statt sich in unverwaltetem Host-Storage anzusammeln. Paketmanager- und Browser-Caches bleiben persistent. Dies fordert keine bestehenden geteilten Temp-Dateien zurück, garantiert keine Filesystem-Kapazität und räumt keine Dateien, die der Runner-Account nicht entfernen kann. Operatoren besitzen weiterhin historische Rückstände, Disk-Provisionierung und Jobs außerhalb dieses PR-Workflows.

Linux-bwrap- und Landlock-Workspace-Write-Profiles granten literal `/tmp` und den Workspace, nicht ein geerbtes `TMPDIR` außerhalb davon; confinierte Fixtures müssen temporäre Writes in diese granteten Pfade legen. Der [Snapshot-Spill-Helper](../../../../packages/test-support/session-snapshot/src/harness.ts) trennt Fixed-Length-Logical-Locators von atomar allokiertem Live-Storage. Ein Fixture-only-Adapter delegiert Saves an den echten lokalen Spill-Provider und löst nur Locators, die dieser Run gespeichert hat, auf ihre Live-Dateien auf. Aufgezeichnete Preview-Lengths, Omission-Counts und Retrieval-Assertions bleiben unverändert; unter dem logischen `/tmp/dsh-acp-snap-*`-Prefix werden keine Dateien allokiert. Diese Änderung erweitert keine Produkt-Sandbox-Grants.

Die Parsed-Workflow-Fälle in [ci-workflow.spec.ts](../../../../scripts/ci-workflow.spec.ts) verlangen die Zuweisung auf allen drei Workern und lehnen Step-Level-Overrides ab. Sie schlagen gegen den unveränderten Workflow fehl. Independent-Process-Smoke-Checks und wiederholte PR-Runs validieren das tatsächliche Tooling; die YAML-Assertions allein beweisen keine Host-Kapazität.
