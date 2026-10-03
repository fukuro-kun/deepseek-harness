# Agent Note: Pflicht-CI-Gate für Web-Browser-Expected-Outputs

Status: implemented

[English](2026-07-30-web-browser-snapshot-ci-gate.md) | [中文](2026-07-30-web-browser-snapshot-ci-gate.zh.md) | Deutsch

## Problem

Die [schlüssellose Web-Browser-e2e-Lane](2026-07-24-web-gui-browser-e2e-lane.de.md) läuft nur über das lokale Kommando `pnpm run test:web`, und die PR-CI vergleicht keine Web-Erwartungen unter `snapshots/web/` oder `apps/web/tests/expected/`. Ein PR, der sichtbare Web-Ausgabe ändert, kann daher grün bleiben, obwohl seine Expected Outputs nicht aktualisiert wurden; läuft später ein beliebiger Branch explizit mit `DSH_SNAPSHOT=refresh`, schreibt er die frühere Änderung nach und erzeugt einen Diff ohne Bezug zu diesem Branch. Gewöhnliche lokale Läufe nutzen bereits standardmäßig das schreibgeschützte Replay; die Lücke ist die verbindliche Durchsetzung auf PR-Ebene, kein Schreibverbot im Refresh-Modus.

## Entscheidung

Für Linux-PRs muss der Job `node 24 / snapshots and artifacts` die vollständige Web-Browser-Replay/Vergleichs-Suite ausführen. Ist `DSH_WEB_SNAPSHOT_WORKERS` konfiguriert, registriert `scripts/run-gates.ts` `test:web:ci` als `ci-consumers`-Gate und injiziert explizit `DSH_SNAPSHOT=replay`; die CI läuft niemals im `record`- oder `refresh`-Modus. Wenn die committeten Goldens von der aktuell assemblierten Anwendung abweichen, schlagen die Tests direkt fehl, statt sie auf dem Runner still umzuschreiben und dann zu bestehen.

Der Consumer-Job besitzt den [einzigen Linux-Build](../../archived/process/2026-07-30-independent-ci-consumer-build.md); daher bleiben `apps/web/dist` und die `lib/`-Verzeichnisse der Pakete in seinem Workspace für die Browser-Suite. Auf gehosteten Runnern installiert die CI Chromium und seine Systemabhängigkeiten in der Playwright-Version des Lockfiles. Auf der persistenten Failover-VM besitzt das Image die Linux-Systempakete, und die CI installiert nur Chromium — so entfällt die `apt`-Mutation pro Lauf. Pull Requests stellen den nach Betriebssystem und Lockfile verschlüsselten Browser-Cache wieder her, ohne auf dem Pflichtpfad Kompression und Upload zu bezahlen, mit einem Betriebssystem-Präfix-Fallback über Lockfile-Änderungen hinweg. Kein Master-Job erzeugt diese gehosteten Caches; Restores treffen daher archivierte Einträge, bis diese verdrängt werden. Das selbst gehostete Standby führt denselben Vergleich ohne Hosted-Cache-Aktionen aus.

Das lokale `pnpm run test:web` baut weiterhin zuerst und führt danach die komplette Browser-Suite seriell aus; `test:web:built` ist der serielle Einstiegspunkt für vorhandene Build-Artefakte. Entwickler führen `DSH_SNAPSHOT=refresh pnpm run test:web` erst dann explizit aus, wenn sie bestätigt haben, dass sich die sichtbare Ausgabe absichtlich geändert hat, prüfen jeden Expected-Output-Diff und verifizieren anschließend erneut im Replay-Modus, dass keine Dateien geschrieben werden.

`scripts/run-web-snapshots.ts` der CI führt zunächst `hmr-live.e2e.ts` und `cordis-tool-round.e2e.ts` als separate serielle Vitest-Aufrufe aus. Das HMR-Szenario mutiert den gebauten Workspace-Zustand, während das Cordis-Szenario eine lifecycle-sensitive Approval- und Steering-Sequenz besitzt, deren Turn-Gruppierung dadurch deterministisch wird, dass vor dem Approval der Abschluss des initialen Turns abgewartet wird. Nachdem beide bestanden haben, führt ein einziger Sechs-Worker-Vitest-Pool jede verbleibende Datei aus. Jedes Kind erbt stdio, und das umschließende Gate streamt diese Ausgabe über `run-gates`.

Für Pull Requests läuft das Gate nur im Linux-Consumer-Job: Diese Szenarien zielen auf POSIX, und die anderen PR-Jobs stellen kein Chromium bereit. Das selbst gehostete serielle Linux-Standby des Default-Branches umfasst den Vergleich ebenfalls, während die seriellen macOS- und Windows-Jobs browserfrei bleiben (es gibt kein gehostetes serielles Linux-Aggregat). Das `all checks passed`-Verdikt eines PRs hängt bereits vom Consumer-Job ab; ein Browser-Vergleichsfehler blockiert den Merge daher, ohne dass ein neuer Branch-Protection-Check-Name nötig wäre.

Abgeschlossene lokale Replays maßen den Sechs-Worker-Browser-Befehl bei etwa 65–71 Sekunden. Ein Zwölf-Worker-Vergleich benötigte etwa 50 Sekunden; eine Halbierung des Browser-Worker-Budgets kostet also etwa 15–20 Sekunden statt die Wall-Time zu verdoppeln. Der Gate-Scheduler startet die Browser-Snapshots, sobald `built-package-invariants` erfolgreich ist, und führt unabhängige Gates nebenläufig aus; er braucht daher weder ein dediziertes Job-Timeout noch eine manuelle YAML-Reihenfolgenregel.

## Erwogene Alternativen

**Weiterhin nur lokale Läufe verlangen.** Abgelehnt: Die Ausführung hängt vom Gedächtnis der Entwickler ab — genau deshalb driften veraltete Goldens über PRs hinweg — und kann nicht garantieren, dass der PR, der eine Verhaltensänderung einführt, seinen eigenen Expected-Output-Diff mitbringt.

**CI im `refresh`-Modus laufen lassen und danach den Working Tree prüfen.** Abgelehnt: Ein Check nach dem Schreiben macht den Assertions-Mechanismus zu einem Generator; ist die Working-Tree-Prüfung falsch verdrahtet, kann sie eine Regression in ein bestehendes Expected-Output-Update verwandeln. Replay vergleicht die vorhandenen Goldens direkt und hat eine kleinere Fehlerfläche.

**Einen eigenständigen Browser-Job schaffen und das gesamte Repository neu bauen.** Abgelehnt: Das würde die Dependency-Installation und den veröffentlichbaren Build duplizieren. Der bestehende Linux-Consumer-Job besitzt diesen Build bereits und ist Teil des einheitlichen Pflicht-Verdikts.

**HMR und Cordis im Parallel-Pool ausführen.** Abgelehnt, weil HMR den geteilten Build-Zustand mutiert und die Cordis-Approval-Fortsetzung einen seriellen Preflight erfordert. Jede andere Datei teilt einen begrenzten Pool; dedizierte Prozesse für lange Dateien würden Scheduling-Code hinzufügen und nach deren Abschluss einen Teil des reduzierten Worker-Budgets ungenutzt lassen.

**Echtes Chromium durch jsdom-Snapshots ersetzen.** Abgelehnt: jsdom deckt weder den Browser noch den HTTP/SSE-Transport noch die Komposition echter Client-Plugin-Bundles ab. Es bleibt für schnelles Feedback auf unteren Ebenen nützlich, kann aber die assemblierte Browser-Kette nicht ersetzen.

## Konsequenzen

Vor dem Merge beweist jeder PR, dass die aktuelle Web-Assembly allen committeten Browser-Expected-Outputs entspricht; ein fehlender Refresh schlägt in demselben PR fehl, der die Assembly ändert. Der Preis ist die Chromium-Bereitstellung, zwei serielle Szenarien und ein begrenzter Sechs-Worker-Pool im Consumer-Job; der Consumer-eigene Build und der Browser-Cache vermeiden doppelte Builds und Downloads bei Wiederholungen. Fehler paralleler Dateien werden sofort gestreamt; eine Änderung des Worker-Budgets erfordert dennoch eine abgeschlossene End-to-End-Messung statt einer Schätzung aus der Laufzeit. Das Gate erhebt keinen Anspruch auf plattformübergreifende Browser-Konsistenz; ändert ein Playwright/Chromium-Upgrade das ARIA-Format, muss der Upgrade-PR die Expected Outputs explizit aktualisieren und die Änderungsflut prüfen.
