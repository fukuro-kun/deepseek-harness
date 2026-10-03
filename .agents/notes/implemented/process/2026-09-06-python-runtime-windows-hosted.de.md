# Agent Note: Windows-Python-Laufzeit-CI bleibt auf GitHub-gehostetem Windows

Status: implemented

[English](2026-09-06-python-runtime-windows-hosted.md) | [中文](2026-09-06-python-runtime-windows-hosted.zh.md) | Deutsch

## Problem

Das Windows-x64-Ziel in [build-exe-for-python-sdk.yml](../../../../.github/workflows/build-exe-for-python-sdk.yml) begann, über `DSH_CI_FAILOVER_WINDOWS=selfhosted` für vertrauenswürdige Pull-Request-CI aufzulösen, als #3629 den Failover-Selektor und die job-private Windows-Toolchain hinzufügte. Der gemeinsame `dsh-win-ci`-Pool machte die Lane nicht zuverlässiger. Am 2026-09-06 (alle Zeiten UTC; jeder Lauf führte den Selektor des #3629-Migrationsworkflows aus, der seit dem 07:56-Merge live war) bestand der Installed-wheel-Smoke um 09:12 auf `dsh-win-ci-16` für [Commit `ca3ffe95` von PR #3640 (`ci/benchmark-standard-runner`)](https://github.com/deepseek-harness/deepseek-harness/actions/runs/34023970384), schlug dann um 10:06 auf `dsh-win-ci-21` für [PR #3337 (`feat/visualizer-host-plugin`)](https://github.com/deepseek-harness/deepseek-harness/actions/runs/34026500701) fehl und um 10:46 auf `dsh-win-ci-04` für [PR #3640 auf seinem finalen Head `c5ba873f`](https://github.com/deepseek-harness/deepseek-harness/actions/runs/34028339888/job/101473395734), wo `smoke_sdk_profile_plugin`s gepacktes `dsh plugin add`-Kind ohne Ausgabe beendete, während die Linux- und macOS-Zellen desselben Laufs bestanden; ein Job-Wiederholungslauf um 11:29 wiederholte denselben stillen Tod. Der Migrationsvorschlag ([#3629](https://github.com/deepseek-harness/deepseek-harness/pull/3629)) blieb `proposed`, weil seine Durchsatz- und Shared-Load-Abnahmekriterien nie gemessen wurden.

## Entscheidung

Das Windows-x64-Ziel verwendet immer seinen gehosteten `matrix.runner` — `windows-2025` für Pull-Request-CI — mit der Standard-setup-python-Toolchain, dem pnpm-Cache-Restore und dem pkg-Cache. Der Failover-Selektor, der job-private Python-Setup-Schritt, die selbst gehostete Abhängigkeitsinstallation und Post-Schritt-Bereinigung, das private Setup-Skript und die Routing-Spezifikation aus #3629 werden entfernt. `DSH_CI_FAILOVER_WINDOWS=selfhosted` retargetet wieder nur die nativen Windows-Jobs in [ci.yml](../../../../.github/workflows/ci.yml); das [Failover-Runbook](2026-07-26-ci-failover-runbook.de.md) und [python/development.de.md](../../../../python/development.de.md) beschreiben gehostete exklusive Laufzeitbuilds. Die UTF-8-Modus-Exporte der Migration existierten, weil der persistente Host eine GBK-Standardcodepage verwendete; gehostete Images stellen die Locale bereit, unter der die Lane zuvor lief.

## Betrachtete Alternativen

**Das Failover-Routing behalten.** Abgelehnt: Der gemeinsame Pool reproduzierte denselben stillen Installed-wheel-Kindtod zweimal an einem Tag, während die Durchsatzabnahme des migrierten Inventars offen blieb, und das Routing einer Korrektheits-Lane durch Failover-Zustand koppelt sie an einen unabhängigen Pool-Ausfallschalter.

**Stattdessen den gemeinsamen Pool reparieren.** Den Pool-Betreibern überlassen: Die beobachteten Fehlschläge sind Subprozesse, die ohne Ausgabe sterben, keine fehlende Image-Voraussetzung, und dasselbe Image bedient die nativen Windows-Failover-Jobs.

**Die job-private Toolchain auf gehosteten Images behalten.** Abgelehnt: Der private uv/Python-Download existiert, um einen persistenten Shared-Host nicht zu mutieren; wegwerfbare gehostete Images stellen bereits die registrierte Python-3.10-Toolchain bereit, die die Lane vor der Migration verwendete.

## Konsequenzen

Jeder qualifizierende Pull Request bezahlt wieder GitHub-gehostete Windows-Kapazität für den Laufzeitbuild, und die job-private Setup- und Bereinigungsmaschinerie — einschließlich der begrenzten Dateisystem-Retries — verschwindet mit der Lane. Im Gegenzug läuft jeder Build auf einem wegwerfbaren Host mit der bewährten Toolchain und gehosteten Caches, und der Windows-Failover-Schalter deckt nur die nativen Windows-Jobs ab, wie vor der Migration dokumentiert. Ein künftiger selbst gehosteter Versuch muss Durchsatz und Fehlschlagsreproduzierbarkeit auf dem tatsächlichen Pool neu validieren, bevor irgendeine Routing-Änderung erfolgt, und muss die Einschränkungen wiederherstellen, die der zurückgezogene #3629-Vorschlag protokollierte: Der setup-python-Windows-Installer entfernt passende Maschinen-/Aktueller-Benutzer-Einträge und installiert für alle Benutzer (ein privates Toolcache isoliert diesen Registry-Zustand nicht), jeder Build-Cache und temporäre Test-Root muss job-eigen mit Copy-Imports statt Shared-Store-Links sein, Bereinigung muss bei Erfolg, Fehlschlag und Abbruch mit begrenzten Windows-Dateisystem-Retries laufen, und nur das Windows-x64-Ziel ist portierbar — die manylinux-Prüfungen des Linux-Ziels brauchen Docker.
