# Agent Note: Isolierte Node-Kompatibilitätsjobs auf selbst gehostetem Linux
[English](2026-09-06-node-compatibility-selfhosted.md) | [中文](2026-09-06-node-compatibility-selfhosted.zh.md) | Deutsch

Status: implemented


## Problem

Die Kompatibilitätsjobs für Node 22.19, 24.9 und 26 verbrauchen gehostete Linux-Minuten, selbst wenn das Repository bereits seinen bestehenden selbst gehosteten Linux-Pool ausgewählt hat. Das Verlegen von Versionsinstallern auf eine persistente gemeinsame Maschine kann Kollisionen in Werkzeugverzeichnissen erzeugen und generierte Cachedateien außerhalb der Runner-Bereinigung ansammeln.

## Entscheidung

[CI](../../../../.github/workflows/ci.yml) wendet die Linux-Failover-Variable auf diese drei Jobs an und verlangt einen Autor, der nicht Dependabot ist, sowie ein Head-Repository ohne fork, das dem aktuellen Repository entspricht. Der Standard-Fallback auf gehostete Runner bleibt verfügbar. Diese Bedingungen beschränken diesen Job, nicht jeden für den Pool zugelassenen Workflow. Repository-Identität und fork-Status bleiben beide explizit, um die Vertrauensbeschränkung des Jobs zu erhalten, falls sich Repository-Einstellungen ändern; bestehende Geschwisterselektoren sind nicht Teil dieser Migration.

Der temporäre Werkzeug-Cache tauscht wiederholte Node-Downloads gegen Isolation zwischen konkurrierenden Runnern und Node-Versionen. Ein [ESM-Preload](../../../../scripts/ci-compatible-toolcache.mjs) nur für setup-node weist den Cache innerhalb des Action-Prozesses zu: Der Actions-Runner überschreibt reservierte Umgebungsvariablen, nachdem er die Schrittkonfiguration gelesen hat. Eine ausgeführte Pfadprüfung weist Installationen außerhalb von runner temp zurück; Kompatibilitätsprozesse erben das Preload nicht. pnpm behält sein bestehendes privates Setup-Ziel und den persistenten content-addressed store. Compile-Caches und node-gyp-Header nutzen runner temp bereits vor dem ersten pnpm-Aufruf. Es werden weder ein globaler Node-Symlink noch Systempaketänderungen eingeführt. Gehostete Jobs behalten ihr Werkzeug- und Paket-Caching; selbst gehostete Jobs stellen gehostete Paket-Caches weder wieder her noch laden sie hoch. Der Runner besitzt die Tempverzeichnis-Bereinigung zwischen Jobs, und das gemeinsame Image stellt Compiler und Python-Voraussetzungen für native npm-Pakete bereit.

Das [Failover-Runbook](2026-07-26-ci-failover-runbook.de.md) bleibt Eigentümer von Repository-Vertrauen und Pool-Umschaltung. Die [serielle Referenzentscheidung](2026-07-21-serial-cross-platform-ci-reference.de.md) bleibt Eigentümer der master-Planung. Keine der beiden Entscheidungen wird über die Runner-Auswahl der Kompatibilitätsjobs hinaus ersetzt; beide bleiben aktiv.

## Betrachtete Alternativen

**Alle Kompatibilitätsjobs gehostet belassen.** Das vermeidet zusätzliche Last auf dem gemeinsamen Host, bezahlt aber weiter für Linux-Laufzeitprüfungen, die kein anderes Betriebssystem und keine andere Architektur benötigen.

**Die gemeinsame Node-Installation oder globale Versionsmanager-Links nutzen.** Die Jobs müssen verschiedene Node-Releases gleichzeitig ausführen. Veränderliche gemeinsame Links würden die ausgewählte Version vom Timing eines anderen Jobs abhängig machen.

**Den Python-SDK-Job in derselben Änderung migrieren.** Seine setup-python-Installation und die globale pip-Installation von uv benötigen eigenständige Isolationsnachweise. Sein kurzer gehosteter Job ist für die Node-Optimierung nicht erforderlich.

## Konsequenzen

Der Pool erhält drei zusätzliche Jobs pro vertrauenswürdigem PR; jeder behält Gate-Concurrency eins, einschließlich des build-gestützten Node-22-Zweigs. Das Inventar vom 6. September meldet 31 Linux-Registrierungen, nicht 31 unabhängige Maschinen. Ressourcenkonkurrenz und Download-Latenz der gemeinsamen VM bleiben Rollout-Risiken; die Variable bewahrt den gehosteten Wiederherstellungspfad. Testinventar, Check-Namen und master-Planung bleiben unverändert.

## Verifikation

Die fokussierte [Workflow-Regression](../../../../scripts/ci-compatible-selfhosted.spec.ts) führt die tatsächlichen Routing-Ausdrücke und die Umgebungseinrichtung aus. Eine negative Kontrolle, die die fork-Bedingung entfernt, lässt die Hosted-Fallback-Assertion fehlschlagen. Sie prüft Dependabot-Wiederholungsläufe durch einen Maintainer, Repository-Mismatch, fork-Flags, deaktivierte Variablen und runner-bezogene Cache-Pfade.

Der [erfolgreiche Standby-Lauf 33984559660](https://github.com/deepseek-harness/deepseek-harness/actions/runs/33984559660) auf der Implementierungsbasis liefert Basisbelege für Linux Node 24.19.0 und Windows Node 24.20.0. Der Linux-Job 101359402557 verwendet runner-spezifische Temp- und Werkzeugverzeichnisse auf dem Datenvolume. Die [schreibgeschützte Fähigkeitssonde 34012679056](https://github.com/deepseek-harness/deepseek-harness/actions/runs/34012679056/job/101431064925) meldet Linux x64, 192 online logische CPUs, GCC/G++ 13.3, Make 4.3 und Python 3.12.3. Python 3.10 fehlt, was die separate SDK-Provisionierungsanforderung bekräftigt. Der [PR-Lauf 34013779750](https://github.com/deepseek-harness/deepseek-harness/actions/runs/34013779750) auf `282519d2` verifiziert Node 22.19.0, 24.9.0 und 26.8.1 auf selbst gehostetem Linux, einschließlich Setup, Prüfungen der Ausführungspfade, Kompatibilitätstests und post actions. Die ausführbaren Dateien liegen unter `_temp/node-compat-toolcache/node/<version>/x64/bin` des jeweiligen Runners; die abgeschlossenen Jobs dauern 228s, 94s bzw. 101s. Diese Beobachtungen belegen Versions- und Pfadkompatibilität, keine Kapazitätsgarantie für einen exklusiven Host.
