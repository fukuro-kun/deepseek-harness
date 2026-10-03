# Agent Note: Mechanische Quality Gates statt Prosaleitlinien

Status: implemented

[English](2026-06-11-quality-gates.md) | [中文](2026-06-11-quality-gates.zh.md) | Deutsch

Die Hook/CI-Symmetrie in diesem Eintrag wird durch [schnelle lokale Git-Hooks](../../archived/process/2026-07-22-fast-local-git-hooks.md) ersetzt; CI bleibt der erschöpfende Durchsetzungspfad.

## Problem

Diese Codebase wird hauptsächlich von coding agents entwickelt. Agents folgen erzwungenen Gates weit zuverlässiger als Prosa-Konventionen, und „viel Arbeit" ist kein Kostenargument, wenn Agents die Arbeit leisten. Früher Beleg: Tests, die nicht typecheckten, wurden ausgeliefert (vitest typecheckt nicht) und nur durch ein Review entdeckt.

## Entscheidung

Jede mechanisch prüfbare AGENTS.md-Zusage bekommt einen Befehl, der mit Nichtnull beendet. CI ruft die erschöpfende Menge auf, während Git-Hooks ihr Latenzbudget für billige lokale Defekte reservieren:

- Maximal striktes TypeScript (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, …); Beispiele, Tests und Skripte typechecken in CI über die Root-No-emit-`tsconfig.json`, während Paket-/Vendor-Code hinter seiner eigenen Project-Reference-Grenze bleibt.
- [Oxlint](../../archived/process/2026-07-29-oxlint-linter.md) mit typbewussten TypeScript-Regeln plus den @stylistic- und SonarJS-Kompatibilitätsplugins, das den Hausstil und dateilokale Duplikatlogik-Prüfungen erzwingt; vendored Code ausgeschlossen.
- jscpd erkennt Cross-File-Klone in Paket-Produktions-TypeScript und Repository-Skripten; enge Quellbereichsausnahmen dokumentieren absichtlich parallele Implementierungen.
- Dateibezogene 100 %-Coverage auf `packages/*/*/src` (v8); unerreichbare defensive Guards tragen `/* v8 ignore */ ` mit angegebenen Gründen statt gelöscht zu werden.
- publint (Paketkorrektheit), Workspace-Constraints (Workspace-Regeln: private, cordis peer+dev, einheitliche Version, ESM) und ein NodeNext-Consumer-Typecheck für gebaute Paketdeklarationen. [Die Entfernung des Unused-Code-Gates](2026-08-19-remove-knip.de.md) protokolliert, warum statische Dead-Code-Analyse außerhalb dieser Suite liegt.
- lefthook pre-commit wendet projektfreie Oxlint-Validierung und [sichere Fixes mit begrenztem Retry](../../archived/process/2026-08-09-oxlint-only-fix-workflow.md) an, weist gestagte Whitespace-Probleme zurück und prüft das Vendor-Manifest; pre-push führt inkrementellen Typecheck aus. CI fährt die volle Matrix auf Node 22.19/24/26 plus gebaute Anwendungs-Smokes für die Headless-, TUI-, ACP-, JSON-RPC-, Workflow- und Code-Runtime-Einstiegspfade.

## Konsequenzen

- Konventionen überleben Agent-Wechsel; billige Commit-/Push-Defekte schlagen lokal fehl und erschöpfende Verstöße schlagen in CI fehl.
- Die Gates selbst sind zu wartender Code; Konfigurationsänderungen werden wie jede Änderung reviewed.
- 100-%-Coverage-Druck kann assertionsfreie Tests erzeugen — Mutation Testing ist das geplante Gegengewicht (siehe [den Mutation-Testing-Vorschlag](../../proposed/testing/2026-06-11-mutation-testing.de.md)).

<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
