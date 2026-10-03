# Agent Note: Überholte CI-Validierung abbrechen
[English](2026-09-09-cancel-superseded-ci.md) | [中文](2026-09-09-cancel-superseded-ci.zh.md) | Deutsch

Status: implemented


## Problem

Die Validierung einer überholten PR-Revision oder eines veralteten master-Commits verbraucht Runner-Kapazität, ohne den Status der neuesten Revision festzustellen. Bedingungslose Aggregat-Urteile und Coverage-History-Uploads können zudem abgebrochene Runs weiter Buchhaltung treiben lassen. Das Aufrechterhalten älterer Post-Merge-Runs bevorzugt historische Vollständigkeit gegenüber aktueller Validierung — besonders auf den geteilten Self-hosted-Pools.

## Entscheidung

Die Validierung bevorzugt den neuesten Run innerhalb jeder Workflow/Ref-Gruppe. [CI](../../../../.github/workflows/ci.yml), [CI master](../../../../.github/workflows/ci-master.yml), [Real-API-e2e](../../../../.github/workflows/e2e.yml) und die credential-freien Pack-Validierungen [dsh](../../../../.github/workflows/release.yml) und [vendor](../../../../.github/workflows/release-vendor.yml) verwenden `cancel-in-progress: true` mit `${{ github.workflow }}-${{ github.ref }}`. Unterschiedliche PR-Refs und unterschiedliche Workflows brechen sich nicht gegenseitig ab. Der Event-Typ ist nicht Teil der Gruppe: master-Pushes und manuelle Benchmarks können einander in CI master ablösen, und e2e-Pushes, geplante und manuelle Runs können einander auf demselben Ref ablösen.

Der [wiederverwendbare Python-Runtime-Builder](../../../../.github/workflows/build-exe-for-python-sdk.yml) verwendet `${{ !inputs.release }}`. Seine Gruppe `build-single-exe-${{ github.workflow }}-${{ github.ref }}` bleibt von der Gruppe seines Aufrufers getrennt, und der Workflow-Name des Aufrufers isoliert gewöhnliche CI von release-eigenen Builds. Release-eigene Builds sind ausgenommen, weil sie zu einer bewussten Publikationstransaktion gehören. Publikations-, Deployment- und Metadaten-Workflows behalten ihre eigenen Policies; diese Entscheidung wendet den Abbruch nicht wahllos auf alle Workflows an.

Das PR-Aggregat verwendet `${{ !cancelled() && github.event_name == 'pull_request' }}`. Die explizite Statusfunktion bewahrt die Auswertung nach fehlgeschlagenen oder übersprungenen Abhängigkeiten, statt GitHubs Default-Bedingung „nur bei Erfolg" zu übernehmen. Das Aggregat schlägt weiterhin bei jedem Fehlschlag, Abbruch oder Skip seiner Abhängigkeiten fehl, solange der Workflow selbst nicht abgebrochen wird; der Abbruch des gesamten Workflows unterdrückt dessen überholtes Urteil. Die Coverage-Dauer-Historie verwendet ebenfalls `!cancelled()`: Fehlgeschlagene Coverage kann noch nützliche Messwerte speichern, aber abgebrochene Coverage lädt sie nicht hoch. Wines `always()`-Cleanup bleibt notwendige Ressourcenbereinigung, nicht optionale Buchhaltung.

Dies kehrt die Abbruch-Ausnahme im [Failover-Runbook](2026-07-26-ci-failover-runbook.de.md), bei [Master-only-Plattform-CI](2026-09-06-master-only-platform-ci.de.md) und in der [Real-API-e2e-Entscheidung](../testing/2026-06-19-real-api-e2e-ci.de.md) um. Diese Notes behalten eigenständigen Wert für Pool-Vertrauen und -Umschaltung, Plattformabdeckung und Secret-Exposition. Die [Release-Rehearsal-Entscheidung](2026-09-06-release-rehearsal-selfhosted.de.md) behält die Zuständigkeit für Runner-Auswahl und -Isolation. Keine ist vollständig ersetzt oder archiviert.

## Erwogene Alternativen

**Laufende master-Push-Drills bewahren.** Die frühere Ausnahme `${{ github.event_name != 'push' }}` bevorzugte periodische Bereitschaftsevidenz: Jede Standby führt ihr vollständiges, unshardiertes Aggregat mit einem Gate-Worker aus und kann das Intervall zwischen master-Merges überdauern. Selbst diese Policy garantierte nicht, dass jeder Drill vollendet. GitHub behält einen ausstehenden Run pro Gruppe und ersetzt dazwischenliegende ausstehende Pushes; der Abbruch wird am neu ausgelösten Run ausgewertet, sodass ein manueller Benchmark, der die master-Gruppe teilt, weiterhin einen Drill abbrechen kann. Diese seltene manuelle Unterbrechung wurde in Erwartung der Evidenz aus einem nachfolgenden Push akzeptiert. Die Kosten der Ausnahme waren begrenzt auf die master-only-Runtime-Checks, Wine und zwei Drills; PR-Jobs blieben in einem eigenen Workflow, und Regression-Checks mit exakter Bedingung pinnaten die push-erreichbare Job-Menge. Diese Policy wird zugunsten freier Kapazität für die aktuelle Validierung abgelehnt — das Aushungern der Standbys wird ausdrücklich in Kauf genommen.

**Einen Drill mit Job-Level-Concurrency schützen oder nur PR-Events abbrechen.** Eine Gruppe auf Job-Ebene kann einen Job nicht vor dem Abbruch seines gesamten Workflows bewahren. Eine nur-PR-Abbruchbedingung nimmt zudem manuelle Dispatches aus: Ein wiederholter Runner-Benchmark kann zwölf größere Runner bis zu fünfzehn Minuten belegen, statt eine überholte Messung zu ersetzen. Abbruch auf Workflow-Ebene deckt sowohl Pushes als auch manuelle Runs ab.

**Jeden Post-Merge-, Nightly- und Pack-Run behalten.** Historische Vollständigkeit liefert mehr Belege pro Commit und Trigger, aber überholte Validierung konkurriert mit dem neuesten Run. Diese Validierungen publizieren keine Pakete; jeden Run zu bewahren ist daher nicht dieselbe Anforderung wie der Schutz einer bewussten Publikationstransaktion.

**Jede `always()`-Bedingung ersetzen.** Fehleraggregation und Ressourcenbereinigung tragen unterschiedliche Verpflichtungen. Ein Aggregat nur bei Erfolg kann fehlgeschlagene Abhängigkeiten hinter einem übersprungenen Pflichtcheck verstecken; das Entfernen des bedingungslosen Wine-Cleanups kann laufende Ressourcen hinterlassen. Unterdrückt wird nur die Buchhaltung abgebrochener Runs.

## Konsequenzen

Rasche master-Aktualisierungen können die längeren Standby-Drills wiederholt abbrechen, bevor sie ein Urteil liefern. Operatoren verwenden das letzte abgeschlossene Standby-Urteil und prüfen dessen Alter und Commit, bevor sie sich für die Failover-Bereitschaft darauf verlassen; ein geplanter, laufender oder abgebrochener Drill ist keine Bereitschaftsevidenz. Die Policy garantiert nicht, dass jeder Zwischen-Commit, Nightly-Trigger oder Benchmark vollendet wird. Unterschiedliche Refs konkurrieren weiterhin um geteilte Host-Kapazität.

Abbruch ist eine von GitHub Actions und seinen Runnern verarbeitete Anfrage, keine Garantie sofortiger Beendigung oder begrenzter Wartezeit in der Queue. Das Cleanup kann weiterhin Zeit brauchen. Die Policy macht überholte Validierung abbrechbar; sie verspricht weder eine feste Laufzeit noch eine Abbruchlatenz.

## Verifikation

[Workflow-Regressionen](../../../../scripts/ci-workflow.spec.ts) pinnen Workflow/Ref-Isolation, release-eigene Ausnahmen, Aggregat-Statusbedingungen, Coverage-History-Abbruch und das beibehaltene Wine-Cleanup. [Plattform-Routing-Regressionen](../../../../scripts/tests/ci-master-platforms.spec.ts) bewahren die master/PR-Zielaufteilung und die Release-Matrix; [Release-Rehearsal-Regressionen](../../../../scripts/tests/ci-release-selfhosted.spec.ts) bewahren den Abbruch neben Runner-Elegibilität und Publikationsisolation. Diese Konfigurationschecks reproduzieren weder GitHub-Scheduling noch Runner-Shutdown. Echte Ablösung und abgeschlossene Standby-Evidenz bleiben Aufgabe der CI-Verifikation.
