# Agent Note: Knip aus den Repository-Gates entfernen

Status: implemented

[English](2026-08-19-remove-knip.md) | [中文](2026-08-19-remove-knip.zh.md) | Deutsch

## Problem

Knip leitet ungenutzte Dateien, Exports und Abhängigkeiten aus einem statischen Quellgraphen ab. DeepSeek Harness lädt Cordis-Plugins zusätzlich aus Paketmanifesten und Konfiguration, emittiert Typert-Faces nach `lib/`, teilt Host- und Client-Programme und deklariert Abhängigkeiten, die nur von generiertem oder zur Laufzeit geladenem Code konsumiert werden. Das Repository brauchte daher workspace-spezifische Entry-Listen und Ignored-Dependency-Ausnahmen, damit unterstützte Pfade den Scan bestehen. Paket- und Testlayout-Änderungen mussten diese zweite Approximation des ausführbaren Graphen mitpflegen.

Das Repository hat bereits engere Prüfungen für die Fehler, die es als Release-Verträge behandelt: TypeScript und Oxlint validieren Quell-Imports, Workspace-Constraints validieren Manifeste, `verify-optional-dependency-imports` validiert optionale Imports, `verify-runtime-closure` validiert Laufzeitabhängigkeiten, `verify-client-packages` validiert das Client-Packaging, und publint validiert veröffentlichte Pakete. Das generische Ungenutzter-Code-Ergebnis ist beratend, während seine Ausnahmen Pflichtpflege sind.

## Entscheidung

Knip ist weder Repository-Abhängigkeit noch Qualitäts-Gate. Das Root-Manifest enthält weder Knip-Skript noch devDependency, der Gate-Graph und der `hygiene`-Befehl rufen es nicht auf, und das Repository trägt keine Knip-Konfiguration. Paketanleitungen und Kommentare beschreiben die Laufzeit- oder Generierungsanforderung direkt, statt Knip-Ausnahmen zu lehren.

Das Repository hat keine repositoryweite statische Prüfung auf ungenutzte Dateien, Exports oder Abhängigkeiten. Maintainer weisen die Sicherheit einer Entfernung anhand von Aufrufstellen, Manifesten, Konfiguration, generierten Artefakten, Tests, Dokumentation und Cordis-Loader-Pfaden nach.

## Erwogene Alternativen

**Knip samt Ausnahmeinventar behalten.** Das bewahrt ein breites beratendes Signal, doch jeder unterstützte dynamische oder generierte Pfad bräuchte Konfiguration, die Fakten wiederholt, die Manifeste, Build-Konfiguration und paketspezifische Prüfungen bereits tragen. Das Ausnahmeinventar macht gewöhnliche Paketänderungen von einem Quellgraphen abhängig, der die assemblierte Anwendung nicht abbildet.

## Konsequenzen

CI und `hygiene` führen einen Befehl weniger aus, und Paketänderungen aktualisieren kein paralleles Entrypoint- und Dependency-Ausnahmeinventar mehr. Das Repository verzichtet auf automatische breite Berichte über ungenutzten Code und ungenutzte Abhängigkeiten; Reviews und Vereinfachungsarbeit müssen Entfernungen anhand der realen Ladepfade belegen.

Eine künftige Ungenutzter-Code-Prüfung muss manifestgetriebenes Cordis-Laden, generierte Ausgaben und die Host/Client-Teilung ohne workspace-weises Ignore-Inventar verstehen. Bis dahin ist eine Abhängigkeit ohne Quell-Import für sich allein kein Dead-Code-Beweis.
