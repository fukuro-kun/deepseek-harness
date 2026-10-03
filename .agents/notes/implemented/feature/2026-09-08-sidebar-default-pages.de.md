# Agent Note: Sidebar-Standardseiten

Status: implemented

[English](2026-09-08-sidebar-default-pages.md) | [中文](2026-09-08-sidebar-default-pages.zh.md) | Deutsch

## Problem

Ein Guide mit einem registrierten Eintrag fügt einen Klick hinzu, ohne eine Wahl anzubieten.

## Entscheidung

Die Sidebar wählt jede Standardseite aus der Liste registrierter Guide-Einträge. Genau ein Eintrag öffnet die Seite dieses Eintrags; null oder mehrere Einträge öffnen den Guide. Ressourcen-Viewer ohne Guide-Einträge beeinflussen diese Zählung nicht. Das explizite Hinzufügen eines Guide öffnet immer einen Guide, und jede Pane hält höchstens einen.

Die [Schließregel für den letzten Tab](2026-09-08-sidebar-last-tab-close-rules.de.md) besitzt den Schließschutz: Der alleinige angedockte Guide bleibt offen, während jeder andere alleinige Tab zusammen mit der Spalte schließt. Das generische Docking-Kit nimmt einen Darstellungs-Callback entgegen und hat keine Dateibrowser- oder Guide-Policy. Das Verschieben von Tabs siedelt leere Panes weiterhin an, und der Layout-Zustand bleibt nur im Speicher.

Dies ersetzt die Standard-Guide-Auswahl in [den ausgelieferten Typen](2026-09-05-sidebar-text-preview-and-file-tree.de.md) und das explizite Schließen des letzten Tabs in der [Docking-Infrastruktur](2026-09-04-right-sidebar-docking-infrastructure.de.md). Deren Registrierungs-, Inhaltszustands-, Engine- und Layout-Ownership-Entscheidungen bleiben aktiv.

## Erwogene Alternativen

**Alle registrierten Tab-Typen oder aktuell offene Tabs zählen.** Keines davon zählt die auf dem Guide verfügbaren Wahlen; Ressourcen-Viewer müssen keinen Eintrag beitragen.

## Folgen

Ein-Eintrags-Kompositionen öffnen direkt in ihre registrierte Seite, ohne Files hart zu kodieren. Die Guide-Auswahl kann ihren eigenen Tab weiterhin ersetzen. Store- und Komponententests decken die Registrierungszählungen ab; die montierten Browser-Szenarien decken Standard-Files, explizite Guide-Erstellung und die Rückkehr zu Files nach dem Schließen eines alleinigen Tabs ab.
