# Agent Note: Gemessene GitHub-gehostete PR-Preview-Dimensionierung

Status: implemented

[English](2026-09-06-preview-hosted-runner-sizing.md) | [中文](2026-09-06-preview-hosted-runner-sizing.zh.md) | Deutsch

## Problem

PR-Previews bauen den vollständigen Workspace und das Browser-Worker-VFS-Image. Ein niedrigerer Pro-Minute-Runner-Preis garantiert keine niedrigeren Job-Kosten, weil GitHub jeden Job auf volle Minuten aufrundet. Das Verschieben von Previews auf persistente Self-Hosted-Maschinen ändert zudem die Isolation und liegt außerhalb dieser Entscheidung.

## Entscheidung

Der [Preview-Workflow](../../../../.github/workflows/build-preview-cloudflare.yml) verwendet standardmäßiges GitHub-gehostetes `ubuntu-24.04`. Build, Cache, Deployment, Protected-Image-Verifikation und Kommentar-Semantik bleiben unverändert. Die [Sizing-Referenz](../../../../.github/preview-sizing/README.de.md) besitzt die Vergleichsanforderungen. Das separate CI-[Failover-Runbook](2026-07-26-ci-failover-runbook.de.md) behält seine unabhängige Runner-Wechsel-Entscheidung; Previews verwenden diese Schalter nicht.

### Messungen

[Experiment 34012729982](https://github.com/deepseek-harness/deepseek-harness/actions/runs/34012729982) gelingt für alle acht Größen-/Cache-Kombinationen plus einen Cache-Seed. Jeder gemessene Job checkt SHA `9149d7e7ef945b5601711badd3cf63d58ab384f5` aus, verwendet Node 24.19.0 und pnpm 11.7.0 und führt Immutable Install, vollständigen Workspace-Build, Preview-/VFS-Packen und lokale Upload-Aufbereitung mit gzip-Integritätsprüfung aus. Warme Jobs stellen einen exakten run-privaten pnpm-Cache wieder her; kalte Jobs überspringen die Wiederherstellung, enthalten aber pnpm-Bootstrap-Dateien. Keine kompilierten Ausgaben werden wiederhergestellt.

| Runner | Kalte / warme Job-Sekunden | Gerundete Minuten je | USD je | Workspace-Sekunden kalt / warm | Preview-Sekunden kalt / warm |
|---|---:|---:|---:|---:|---:|
| standard, 2 vCPU | 202 / 203 | 4 | 0,024 | 138,92 / 147,21 | 12,65 / 12,94 |
| larger, 4 vCPU | 177 / 162 | 3 | 0,036 | 124,21 / 114,86 | 10,77 / 9,88 |
| larger, 8 vCPU | 154 / 154 | 3 | 0,066 | 110,51 / 110,77 | 9,20 / 9,21 |
| larger, 16 vCPU | 124 / 125 | 3 | 0,126 | 90,57 / 84,99 | 7,62 / 7,33 |

Nach [veröffentlichten Tarifen](https://docs.github.com/en/billing/reference/actions-runner-pricing) summieren sich die gemessenen Jobs auf $0,504; der 60-Sekunden-Standard-Seed fügt $0,006 hinzu. Die Brutto-Compute-Schätzung von $0,510 umfasst Setup, Wiederherstellung, Mess-Upload und Cleanup, schließt aber Storage und Konto-Rabatte aus. Standard kostet in jedem gesampelten Cache-Zustand 80,95 % weniger als 16-Kern und 33,33 % weniger als 4-Kern. Gegenüber dem entsprechenden 16-Kern-Job kommen 78 Sekunden hinzu.

Standard-Jobs stellen zwei vCPUs und 7,75 GiB RAM bereit. Der maximale Prozess-RSS des Workspace beträgt 2,86 / 2,76 GiB; der maximale Prozess-RSS der Preview 0,76 / 0,74 GiB. Beide vollenden ohne OOM oder Timeout. GNU-time-RSS ist nicht der simultane Prozessbaum-Speicher. Diese Samples belegen erfolgreiche Ausführung, keine dauerhafte Speichergarantie.

Der Vergleich fixiert Quellcode, Lockfile, Befehle und Runtime-Versionen, nicht jedoch physische CPUs oder Image-Release: Standard und 4-Kern verwenden Image 20260831.293.1; 8-Kern und 16-Kern verwenden 20260823.283.1. Die CPUs variieren zwischen AMD EPYC 9V74/7763 und Intel Xeon 8370C/8573C. Ein Sample pro Cache-Zustand misst die angebotenen Labels, nicht isolierte CPU-Skalierung oder statistische Wiederholbarkeit.

Das Experiment deployt nicht und greift nicht auf Cloudflare-Credentials zu. Der Mess-Upload dauert null bis eine Sekunde; die Warm-Cache-Wiederherstellung sechs bis zehn Sekunden. Zum Vergleich: [Produktionsjob 101428009994](https://github.com/deepseek-harness/deepseek-harness/actions/runs/34011495156/job/101428009994) verbringt auf einem anderen SHA 14 Sekunden mit Upload, eine Sekunde mit Verifikation und zwei Sekunden mit Kommentieren. Diesen Overhead auf das Experiment zu addieren ist eine Projektion, kein gemessenes Standard-Runner-Publikationsergebnis. Der tatsächliche PR-Preview-Workflow besitzt die Deployment-Bestätigung.

## Erwogene Alternativen

**16-Kern behalten.** Er liefert den kürzesten gemessenen Job, kostet aber $0,102 mehr pro Sample für eine 78-Sekunden-Verbesserung. Preview-Builds rechtfertigen diesen Aufpreis für diese kostenorientierte Entscheidung nicht.

**4-Kern oder 8-Kern wählen.** Beide gelingen und verkürzen Builds, ihre gerundeten Sample-Kosten liegen jedoch über Standard-Ubuntu. Vier-Kern behält mehr RAM- und Plattenreserve, falls künftige Lasten die Standard-Kapazität erschöpfen; eine solche Änderung erfordert neue Messungen.

**Auf Self-Hosted wechseln.** Aus Scope-Gründen abgelehnt: Previews bleiben auf GitHub CI. Die bestehenden Linux- und Windows-Registrierungen können persistente Hosts teilen; ihre Dependency-, Store-Volume- und Cleanup-Annahmen gelten nicht für frische gehostete VMs. Keine Änderung an Failover- oder Trust-Bedingungen.

## Konsequenzen

Previews tauschen ungefähr 78 Sekunden gesampelte Build-Job-Latenz gegen niedrigere Compute-Kosten. Produktive Cloudflare-Latenz, Image-Rollout-Varianz, künftiges Build-Wachstum und breitere Erfolgsraten bleiben beobachtbare Einschränkungen. Aus diesem einzelnen Experiment werden keine stündlichen oder monatlichen Einsparungen extrapoliert. Der temporäre Benchmark-Workflow und sein Sicherheitstest fehlen im finalen Tree; die Experiment-Commits und der verlinkte Run bewahren Methode und Evidenz.

Die ausgeführte [fokussierte Regression](../../../../scripts/preview-workflow.spec.ts) pinnt gehostetes Routing, PR-Trigger und -Berechtigungen, immutable Full Builds, Restore-only-Caching, Publikations-Aufbereitung, Protected-Image-Checks und idempotente Kommentare. Eine physische Self-Hosted-Routing-Mutation lässt ihre Routing-Assertion fehlschlagen; nach Wiederherstellung bestehen alle drei Tests. Kein modell-sichtbares Runtime-Verhalten ändert sich, daher sind keine Session-Snapshot-Änderungen erforderlich.
