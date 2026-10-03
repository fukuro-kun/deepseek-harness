# Agent Note: Runner-eigener temporärer Speicher für PR-CI

Status: implemented

[English](2026-09-06-pr-ci-runner-temporary-storage.md) | [中文](2026-09-06-pr-ci-runner-temporary-storage.zh.md) | Deutsch

## Problem

Der Linux-Failover-Pool führt mehrere Runner-Instanzen auf einer VM aus. PR-Coverage- und snapshot-Prozesse nutzen das Betriebssystem-temporär-Verzeichnis für transformierte Module und fixtures. Dateien außerhalb des temporären Verzeichnisses des Runner entkommen dessen Job-Cleanup, auch wenn ein Abbruch das Dispose auf Prozessebene verhindert. Das Erschöpfen dieses geteilten Verzeichnisses lässt unbeteiligte PRs scheitern, bevor Tests ausgeführt werden.

## Entscheidung

Die static-, coverage- und consumer-Jobs in [PR CI](../../../../.github/workflows/ci.yml) exportieren `TMPDIR=runner.temp` über `GITHUB_ENV` in ihrem ersten Step, bevor irgendein Setup- oder Testprozess startet. Node, Vite, tsx und temporäre Test-Consumer erben den runner-eigenen Ort. Jeder Runner besitzt sein Verzeichnis, und GitHub Actions räumt dessen entfernbare Inhalte zu Job-Start und -Abschluss; fixtures allozieren weiterhin eindeutige Kinder und behalten ihr eigenes Cleanup.

npm behält seinen konfigurierten persistenten Cache, normalerweise `$HOME/.npm` auf POSIX, ohne per-job-Override in den Haupt-CI- oder Release-Workflows. Der pnpm store bleibt geteilt unter `$HOME/.local/share/pnpm/store`. Beide behalten Cross-runner-Wiederverwendung unter dem Concurrent-access-Support der Paketmanager; Shared-cache-Kapazität und Dateisystemfehler bleiben operative Verantwortung. Der consumer-Job legt Playwright-Browser-Downloads und Installations-Locks neben `RUNNER_TEMP`; die hosted-Cache-Wiederherstellung nutzt denselben Ort.

Die [release-rehearsal-Entscheidung](../process/2026-09-06-release-rehearsal-selfhosted.de.md) wendet dieselbe Lebenszeit-Regel auf Release-Consumer an. Das [failover runbook](../process/2026-07-26-ci-failover-runbook.de.md) bleibt Besitzer der Runner-Auswahl und der Shared-host-Kapazität. Diese Änderung retargetet keine Jobs, reduziert keine Gleichzeitigkeit, wiederholt keine Tests, schwächt keine Assertions und ändert keine master-only-CI.

## Aufgezeichnete ACP-Abschlussreihenfolge

Das [ACP-Diagnose-Szenario](../../../../snapshots/session/subagent-acp-diagnostic/cordis.snapshot.yml) hält seine skriptierte Hintergrund-Antwort zurück, bis `job_output` den completion wait besitzt. Ohne diese Synchronisation kann ein schnelles Kind eine legitime Job-Benachrichtigung zwischen den aufgezeichneten Parent-Schritten veröffentlichen. Ein szenario-lokaler wrapper gibt das Kind frei, nachdem der jobs service den completion waiter registriert; der mock beobachtet einen exklusiven Marker im privaten Test-workspace und schließt den watcher nach der Freigabe. Das fixture restauriert die umwickelte Methode beim Dispose. Die aufgezeichneten Session-Bytes und das Produktions-Job-notice-Verhalten bleiben unverändert.

## Workspace-grant-fixture-Platzierung

Das headless-`session-sandbox-root`-fixture deklariert `workspace.parent: outside-temp`, keine home-Dateisystem-Abhängigkeit. Sein Allokator nutzt einen Geschwister der kanonischen Plattform-temp-Root, wo der Elternteil beschreibbar ist und System-temporär-Grants vermieden werden, sonst home, und lehnt einen cwd ab, der bereits von automatischen temporären Schreib-Grants abgedeckt ist. Auf dem Failover-Runner hält dies den Test auf dem Daten-Volume, ohne dass sein Schreiben durch eine temporäre-Verzeichnis-Ausnahme gelingt. Die filesystem-sandbox-Containment-Tests nutzen denselben Allokator für ihren workspace und den verweigerten Geschwister; sie registrieren Cleanup sofort nach erfolgreicher Akquisition. Atomare workspace-Allokation, aufgezeichnete Session-Bytes und die unabhängige erwartete Datei bleiben unverändert.

## Live-Verifikation und Browser-fixture-Eingaben

Der installed-wheel-live-SDK-Test ersetzt die erzeugte Datei extern durch eine frische host-only-Challenge, bevor er das Modell um ihre Verifikation bittet; der Verifikations-Prompt enthüllt diesen Wert nicht. Beide turns müssen modell-angeforderte tool calls enthalten, und der Verifizierer vergleicht den zurückgegebenen Wert und die tatsächlichen Dateibytes.

Das reference-composer-fixture mappt die bekannte home-abgekürzte workspace-Anzeige auf sein bestehendes cwd-Token und wartet vor der Auswahl auf die aktuelle exakte Vorschlagsmenge; weder host-Pfade noch veraltete Vorschläge bestimmen sein Ergebnis. Die geteilte Browser-Zeitzone, Inspector-Subscription-Synchronisation und das PowerShell-Abschlussverhalten folgen der [bestehenden Plattform-Test-Entscheidung](2026-09-07-pwsh-ci-observable-completion.de.md).

Der advanced-Python-snapshot pausiert nur den ersten pre-step seines passenden workflow-Kinds, bis das durable workflow-Mitgliedschafts-Event des Elternteils beobachtet ist. Das fixture unterstützt beide Event-Ankunfts-Reihenfolgen und bricht ausstehende Waits bei abort oder Dispose ab. Dies pinnt die cross-session-Ordnung des Szenarios, ohne Benachrichtigungen zu sortieren oder das Produktions-Scheduling zu ändern.

Der queue-snapshot bewegt den Zeiger weg vom Stop/Send-Steuerelement und wartet vor der Aufnahme auf das Schließen seines Send-tooltips. Workspace-management-Tests wählen die einzige nicht-leere Session über ihre Actions-Affordance, nicht über die Zeilenposition, und wählen diese Session, bevor sie assertieren, dass ihre Archivierung den leeren Ungrouped-Bucket entfernt. Hover-Verhalten, queue-Inhalte, durable archive-Identität und reload-Assertions bleiben unverändert. Der Concurrent-spill-Isolation-Test hält jede Root mit ihrem Lauf-Ergebnis gepaart, statt anzunehmen, dass die Dateisystem-Allokations-Abschlussreihenfolge der Eingabereihenfolge entspricht.

## Erwogene Alternativen

**Geteilte temporäre Dateien aus einem PR-Job löschen.** Ein anderer Runner könnte diese Dateien noch besitzen. Repository-Jobs dürfen ein geteiltes Verzeichnis nicht nach Pfadname oder Alter zurückfordern.

**Tests wiederholen oder Timeouts vergrößern.** Beides gewinnt weder Speicher zurück noch gibt es Restdateien einen Cleanup-Besitzer.

**Jeden Job auf hosted Runner umstellen.** Dies vermeidet die betroffene VM, lässt den Failover-Pfad aber defekt und ändert die unabhängige Pool-Auswahl des Betreibers.

## Konsequenzen

Ausgaben, die `TMPDIR` respektieren, folgen der Job-Lebenszeit statt sich in unverwaltetem host-Speicher anzusammeln. Paketmanager- und Browser-Caches bleiben persistent. Dies fordert keine bestehenden geteilten temporären Dateien zurück, garantiert keine Dateisystem-Kapazität und räumt keine Dateien, die der Runner-Account nicht entfernen kann. Operatoren bleiben für historische Rückstände, Disk-Provisionierung und Jobs außerhalb dieses PR-Workflows verantwortlich.

Linux-bwrap- und Landlock-workspace-write-Profiles gewähren das literale `/tmp` und den workspace, nicht ein außerhalb geerbtes `TMPDIR`; eingeschränkte fixtures müssen temporäre Schreibungen in jene gewährten Pfade legen. Der [snapshot-spill-Helfer](../../../../packages/test-support/session-snapshot/src/harness.ts) trennt festlange logische Lokatoren von atomar alloziertem live-Speicher. Ein fixture-only-adapter delegiert Speicherungen an den echten lokalen spill provider und löst nur von diesem Lauf gespeicherte Lokatoren zu ihren live-Dateien auf. Aufgezeichnete preview-Längen, omission-Zahlen und Retrieval-Assertions bleiben unverändert; unter dem logischen `/tmp/dsh-acp-snap-*`-Präfix werden keine Dateien alloziert. Diese Änderung erweitert keine Produkt-Sandbox-Grants.

Die parsed-workflow-Fälle in [ci-workflow.spec.ts](../../../../scripts/ci-workflow.spec.ts) verlangen die Zuweisung auf allen drei workern und lehnen step-level-Overrides ab. Sie scheitern gegen den unveränderten Workflow. Unabhängige-Prozess-smoke-Checks und wiederholte PR-Läufe validieren das tatsächliche Tooling; die YAML-Assertions allein beweisen keine host-Kapazität.
