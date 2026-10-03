# Agent Note: Responsive Sidebar und injizierte Tab-Informationen

Status: implemented

[English](2026-09-07-sidebar-responsive-tab-info.md) | [中文](2026-09-07-sidebar-responsive-tab-info.zh.md) | Deutsch

## Problem

Tab-Erweiterungen benötigen konsistente Live-Informationen über ihr enthaltendes Pane und die Sidebar, ohne eine wachsende Liste von Owner-Props. Der Workbench muss außerdem Inhalte erhalten, während er sich an begrenzten Viewport-Platz anpasst, ohne eine Sidebar erneut zu öffnen, die der Benutzer geschlossen hat.

## Entscheidung

Das Slot-Framework injiziert ein einziges `useTabInfo()`, das verschachtelte Felder `sidebar`, `panel` und `tab` zurückgibt. Es komponiert die framework-gebundenen Layout- und Navigations-Hooks; Erweiterungen abonnieren weder selbst noch erhalten sie ein Service-Objekt. Die Sichtbarkeit des Body erfordert einen aktiven Tab in einer aufgeklappten Sidebar; die Sichtbarkeit des Titels erfordert keinen aktiven Tab. Das Ausblenden oder Wechseln von Sessions lässt die Tab-Lebensdauer unangetastet. Das Schließen des Records bricht sein Signal ab. Tab-Aktionen bleiben an ihre besitzende Session gebunden. Die Store-Übernahme ist eine private Fähigkeit der Plugin-Assembly, keine öffentliche Controller-Operation.

Der Frame schützt 400px für die Conversation, indem er zuerst die rechte Spalte verkleinert, dann schließt, bevor er die Conversation verkleinert. Seine First-Open-Präferenz beträgt 45% des Viewports und wird danach in Pixeln gehalten, mit einer Untergrenze von 300px und einer Obergrenze von 70% des Viewports. Die linke Spalte behält ihre Präferenz bei Breiten von mindestens 1024px. Geschlossen ist aufgezeichneter Zustand: Verbreitern öffnet sie nie, während eine Benutzeraktion oder eine explizite Session-API dies kann. Ein Refresh stellt die Defaults wieder her, statt das Layout zu persistieren.

Fullscreen nutzt denselben montierten Inhaltsbaum und deckt den Viewport ab, während die zugrunde liegende Spaltenreservierung erhalten bleibt. Öffnen unterhalb von 768px wählt automatisches Fullscreen; ein Austritt dort schließt die Sidebar. Verbreitern kann das automatische Fullscreen beenden, lässt aber manuell gewähltes Fullscreen unangetastet. Das Produkt erlaubt zwei horizontale Panes, eine anfängliche 50/50-Teilung und einen Divider zwischen 20 und 80%; schmale Panes verweigern neue Splits. Die generische Docking-Engine behält ihre unabhängigen Fähigkeiten. Ein Fullscreen-Eintritt vollendet seinen Slide, bevor er die zugrunde liegende Spur meldet; diese verdeckte Breitenänderung ist unmittelbar, sodass weder Eintritt noch Rückkehr zum Normalzustand einen Hintergrund-Reflow offenbart. Beim Zwei-Pane-Budget ist die Split-Steuerung verborgen; die Verweigerung bei Ein-Pane-Breite bleibt deaktiviert. Beim Austritt bereitet der Frame das Ziel vor, bevor das Overlay zurückweicht: keine rechte Spur beim Schließen, eine normale Spur beim Wiederherstellen. Die Unterdrückung von Transitionen überlebt das Zurücksetzen der Fullscreen-Meldung und endet mit der nächsten Geometrie-Aktion.

Diese Entscheidung ersetzt die flache Owner-Props-Wahl in [Tab-Typen und Navigation](2026-09-05-sidebar-tab-types-and-navigation.md) sowie die No-Concession-Regel, die Overlay-Darstellung und das Produkt-Pane-Limit in [Docking-Infrastruktur](../feature/2026-09-04-right-sidebar-docking-infrastructure.de.md). Deren Registrierungs-, Record-Lifetime-, State-Ownership- und Engine-Auswahl-Begründungen bleiben aktiv.

## Betrachtete Alternativen

**Flache Informations-Props oder drei getrennte Hooks.** Ein einzelner verschachtelter Read gruppiert die drei Ownership-Ebenen und erlaubt zusätzliche Felder, ohne Props oder Reader zu vermehren.

**Automatisches Wiederöffnen nach einer Viewport-Änderung.** Das macht das Öffnen von der Layout-Historie abhängig statt von einer expliziten Aktion. Eine geschlossene Sidebar bleibt geschlossen, ihr Inhalt bleibt erhalten.

**Ein getrennter Fullscreen-Inhaltsbaum.** Ein Remount würde tab-lokalen Zustand unterbrechen. Stattdessen ändert dasselbe Element seine Darstellung.

## Konsequenzen

Tab-Erweiterungen nutzen einen framework-injizierten Reader und halten ihre eigenen Store-Aktionen getrennt von `tab.actions`. Layout-, Seat- und Docking-Tests decken Breiten-Koncessionen, explizites Wiederöffnen, Body-/Titel-Sichtbarkeit, Tab-Lebensdauern, horizontale Drop-Zonen und Divider-Grenzen ab; Browser-Tests prüfen die assemblierte Anwendung. Kompakte mobile Steuerungen und Layout-Persistenz liegen außerhalb dieser Entscheidung.
