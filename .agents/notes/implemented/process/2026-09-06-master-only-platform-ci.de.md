# Agent Note: Plattform-CI nur auf master

Status: implemented

[English](2026-09-06-master-only-platform-ci.md) | [中文](2026-09-06-master-only-platform-ci.zh.md) | Deutsch

## Problem

Python-Laufzeitbuilds auf macOS Intel und ARM sowie Linux ARM64, plus Windows-Build-/Site-Prüfungen über Wine, verbrauchen bei jeder Pull-Request-Revision bezahlte gehostete Kapazität. Natives Linux und Windows x64 liefern bereits die erforderlichen Belege für Ausführbarkeit und installiertes wheel, und native Windows-Prüfungen decken Build- und Prozessverhalten vor dem Merge ab.

## Entscheidung

[CI](../../../../.github/workflows/ci.yml) verlangt Python-Laufzeitvalidierung auf Linux x64 und Windows x64. [CI master](../../../../.github/workflows/ci-master.yml) wählt Linux ARM64, macOS ARM64 und macOS x64 über denselben wiederverwendbaren Builder nur bei master-Pushes. Beide Aufrufer übergeben `ci: true` und das explizite externe API-Secret, wodurch vollständige schlüssellose Installed-wheel-Szenarien und laut fehlschlagende vertrauenswürdige Live-Tests erhalten bleiben. Fork- und Dependabot-Pull-Requests bleiben schlüssellos; Runner-Vertrauen und Fallback-Selektoren sind unverändert. Python-Releases behalten alle fünf Ziele.

Wine läuft einmal als unabhängiger gehosteter Ubuntu-master-Job. Sein bestehender am Image-Schlüssel orientierter apt-Cache-Restore/-Save liefert auch die Cache-Produktion des Default-Branchs, sodass er keinen separaten Cache-Seeding-Job benötigt. Die nativen Linux- und Windows-Seriellaggregate rufen Wine nicht auf. Wine gehostet zu belassen vermeidet Shared-Host-apt-Transaktionen und die Bereinigung gemeinsamer Wine-Präfixe auf der persistenten Linux-VM. Das Skript besitzt einen Scratch-Snapshot, ein checkout-lokales Wine-Präfix und einen prüfsummenverifizierten Windows-Node-Cache; Provisionierung, Fehlerpropagation und immer laufende Bereinigung bleiben intakt.

Die [Cancellation-Policy für ersetzte CI](2026-09-09-cancel-superseded-ci.de.md) gilt für die Eltern- und die wiederverwendbaren Laufzeit-Workflows: Neuere master-Pushes oder manuelle Läufe brechen ältere Validierung in derselben Workflow/Ref-Gruppe ab, während release-eigene Builds geschützt bleiben. Ein master-Push plant alle drei ausgewählten Träger, garantiert aber nicht, dass jeder Zwischencommit ein Ergebnis erreicht.

Diese Entscheidung ersetzt teilweise die Planung in der [Installed-wheel-Validierung](../testing/2026-08-23-installed-python-wheel-black-box-ci.de.md), der [nativen Windows-CI](2026-08-08-native-windows-pull-request-ci.de.md), den [seriellen Referenzen](2026-07-21-serial-cross-platform-ci-reference.de.md) und dem [Failover-Runbook](2026-07-26-ci-failover-runbook.de.md). Diese Notes bleiben für Artefaktherkunft, Plattformtreue, serielle Vollständigkeit und Vertrauensregeln aktiv.

## Betrachtete Alternativen

**Jedes Ziel und Wine als Pflicht auf Pull Requests behalten.** Das erkennt plattformspezifische Defekte vor dem Merge, wiederholt aber bezahlte native Builds für jede Revision. Die gewählte Policy akzeptiert für diese vier Prüfungen ausdrücklich die Entdeckung nach dem Merge.

**Bis zum Release warten oder manuellen Dispatch verlangen.** Das verliert das automatische Default-Branch-Signal. Master-Pushes behalten geplante Prüfungen, ohne die Release-Matrix zu verkleinern.

**Wine in ein selbst gehostetes Seriellaggregat falten.** Das Aggregat deckt Wine nicht bereits ab. Es hinzuzufügen würde persistente Host-Abhängigkeiten, Shared-Cache-Eigentum und Bereinigungsisolation ändern; die Planungsoptimierung braucht diese Migration nicht.

## Konsequenzen

Eine macOS-, Linux-ARM64- oder Wine-spezifische Regression kann mergen, während die Pflicht-PR-Checks grün sind. Master-Fehlschläge bleiben gewöhnliche fehlschlagende Jobs, keine `continue-on-error`-Beobachtungen. Linux/Windows-x64-Installed-wheel-Checks und native Windows-Build-/Prozess-Checks blockieren weiterhin das PR-Aggregat; dessen Abhängigkeiten nennen nie den entfernten Wine-PR-Job.

Die [Routing-Regression](../../../../scripts/tests/ci-master-platforms.spec.ts) läuft über das bestehende Script-Spec-Abdeckungsinventar und prüft Zielaufteilung, nur-master-Bedingungen, Credential-Weiterleitung, Cancellation, Wine-Eindeutigkeit, gültige Aggregat-Abhängigkeiten und die vollständige Release-Matrix. Ausgeführte negative Kontrollen entfernen das Intel-Ziel, routen Wine falsch und stellen die veraltete Aggregat-Abhängigkeit wieder her; jede erzeugt ihren beabsichtigten Fehlschlag. Reale Plattformausführung bleibt CI-eigen; lokale Planungstests erheben keinen Anspruch auf native Laufzeit- oder Wine-Ausführung.
