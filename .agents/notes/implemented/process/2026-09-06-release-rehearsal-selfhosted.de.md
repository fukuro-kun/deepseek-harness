# Agent Note: Vertrauenswürdige Release-Proben auf persistenten Linux-Runnern
[English](2026-09-06-release-rehearsal-selfhosted.md) | [中文](2026-09-06-release-rehearsal-selfhosted.zh.md) | Deutsch

Status: implemented


## Problem

Dependency-Layout- und Release-Pack-Proben verbrauchen gehostete Linux-Minuten, ohne npm- oder API-Credentials zu benötigen. Beliebigen Pull-Request-Code oder credentialed Veröffentlichung auf einen persistenten Shared-Host zu verlegen würde die Isolation schwächen; eine Checkout ohne Bereinigung wiederzuverwenden würde ebenfalls den Packed-Payload-Nachweis schwächen.

## Entscheidung

Die beiden Jobs in [release.yml](../../../../.github/workflows/release.yml) und der Pack-Job in [release-vendor.yml](../../../../.github/workflows/release-vendor.yml) wählen den bestehenden selbst gehosteten Linux-Pool nur, wenn die schreiberkontrollierte Repository-Variable `DSH_CI_FAILOVER_LINUX` auf `selfhosted` gesetzt ist. Der Selektor verlangt das kanonische Repository und einen nicht-Dependabot-Actor und lässt dann nur master-Pushes oder gleichrepository-, nicht-fork-PRs zu, deren Autor nicht Dependabot ist. Manueller Dispatch wählt immer `ubuntu-24.04`, ebenso alle anderen abgelehnten Kontexte. Das [Failover-Runbook](2026-07-26-ci-failover-runbook.de.md) besitzt die Plattformschalter und den Standby-Betrieb. Release-Proben teilen absichtlich den Linux-Schalter mit der Haupt-CI: Sein Aktivieren oder Deaktivieren routet beide Lasten, nicht Releases unabhängig. Ungesetzt bleibt der gehostete Standard; gehostete Minuteneinsparungen treten nur ein, solange ein Operator `selfhosted` wählt, sei es für einen Ausfall oder eine längerfristige Kostenentscheidung.

Die Runner-Labels sind `[self-hosted, linux, x64, vm-backup]`. Runner-Registrierungen teilen eine VM, keine unabhängige Maschinenkapazität. Jeder Job nutzt sein runner-privates Tempvolume für Node-Compile-Cache und node-gyp-Header vor dem pnpm-Setup und ein pnpm-Setup-Ziel, das nach Lauf, Versuch und Job qualifiziert ist. `TMPDIR` zeigt ebenfalls auf `runner.temp`, sodass temporäre npm-Consumer außerhalb der Checkout, aber innerhalb der Runner-Bereinigung bleiben, selbst wenn ein abgebrochener Prozess `finally` nicht ausführen kann. Der persistente pnpm-Store bleibt außerhalb der Checkout-Bereinigung; nur GitHub-gehostete Runner stellen den Remote-Store-Cache wieder her. Keiner der Proben-Workflows speichert Remote-Caches.

Checkout bereinigt explizit ignorierte und unverfolgte Ausgaben vor der unveränderlichen Installation und den bestehenden Builds. Vollständige Tag-Historie, Pack-Konkurrenz, Abhängigkeitsprüfungen, Tarball-Verifikation und Artefaktaufbewahrung bleiben unverändert. Der Packed-Install-Verifizierer erzeugt einen frischen Consumer außerhalb der Checkout, installiert Tarballs mit npm, entfernt geerbte Node-Resolution-Hooks und löscht den Consumer in `finally`; ein warmer pnpm-Store kann Workspace-Links oder veraltete Build-Ausgaben nicht als Tarball-Payload ersetzen. Die [npm-Release-Entscheidung](2026-08-10-npm-release-sequences.de.md) besitzt weiterhin Release-Familien und Veröffentlichung. Beide manuellen Publish-Workflows bleiben vollständig gehostet und erhalten hier weder Credentials noch Registry-Änderungen.

## Betrachtete Alternativen

Immer gehostete Proben vermeiden persistentes Host-Risiko, behalten aber alle gehosteten Minuten. Immer selbst gehostete Proben entfernen den portablen Fallback. Ein Scheduling-Job oder wiederverwendbarer Workflow fügt einen weiteren logischen Job hinzu und verbirgt die drei kurzen Setup-Sequenzen. Manuellen Dispatch auf beliebigen Refs zu erlauben gibt einer Maintainer-Aktion breiteren persistenten Host-Zugriff als die explizite Event-Vertrauensregel.

## Konsequenzen

Das Entfernen der Variable oder das Ändern weg von `selfhosted` routet nachfolgende berechtigte Jobs zu gehostetem Ubuntu. Dies ist ein operator-gewählter Fallback, keine automatische Runner-Gesundheitserkennung oder Failover für bereits in der Warteschlange befindliche Jobs. Die gemeinsame VM kann weiterhin mit anderen vertrauenswürdigen Jobs konkurrieren, und Repository-Schreiber bleiben für Code verantwortlich, der in ihre persistente Vertrauensdomäne aufgenommen wird. Kein Workflow provisioniert Host-Pakete oder ändert die globale Host-Konfiguration.

[scripts/tests/ci-release-selfhosted.spec.ts](../../../../scripts/tests/ci-release-selfhosted.spec.ts) wertet die committeten Selektoren mit vertrauenswürdigen Events und negativen Kontrollen für Forks, Dependabot, andere Repositories, Nicht-master-Pushes, Dispatches, fehlende PR-Daten und deaktivierte Schalter aus. Es pinnt Setup-Reihenfolge, Checkout-Bereinigung, gehostete exklusive Remote-Cache-Zugriffe, Veröffentlichungsisolation und die beibehaltenen Befehle. Reale Release-Build- und Packed-Install-Ausführung bleibt Eigentum der PR-CI-Verifikation; Selektor-Tests erheben keinen Anspruch, diese Builds zu reproduzieren.
