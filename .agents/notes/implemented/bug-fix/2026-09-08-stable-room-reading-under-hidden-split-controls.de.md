# Agent Note: Die Raummessung von versteckten Split-Controls unabhängig halten

Status: implemented

[English](2026-09-08-stable-room-reading-under-hidden-split-controls.md) | [中文](2026-09-08-stable-room-reading-under-hidden-split-controls.zh.md) | Deutsch

## Problem

Die dockkit-Raumregel misst nach jedem Commit den Tab-Strip jeder Pane, um zu entscheiden, ob ein gleichmäßiger Split zwei funktionsfähige Hälften übrig lässt. Mit `hideSplitWhenBlocked` unmountet eine breitenblockierte Pane ihr Split-Control — und das Unmounten ändert genau den Strip, den die Regel gemessen hat: Der Strip verliert die 28px-Box des Controls plus deren 4px-Abstand, der feste Teil schrumpft, und dieselbe Pane wird wieder als passend gelesen. Das erneute Mounten des Controls kehrt die Messung um. Über ein Band von etwa 32px Pane-Breiten wechseln die beiden Zustände innerhalb verschachtelter Layout-Effekte, bis React die Update-Schleife abbricht (Fehler #185); die Slot-Laufzeit fängt den Absturz und unmountet den Sidebar-Eintrag, während die Spalte sich weiterhin als expandiert verzeichnet, sodass weder das Panel noch der nur im Collapsed-Zustand sichtbare Expand-Button des Headers gerendert wird. Ein Grip-Drag auf einem gequetschten Viewport fegt das Panel durch genau dieses Band — was sich als Verschwinden der gesamten Sidebar ohne Rückweg zeigte.

## Entscheidung

Wenn der Einbettende blockierte Split-Controls versteckt, lässt die Raumregel den Footprint des Split-Controls bedingungslos aus dem festen Teil des Strips heraus, sodass die Messung gleich ist, ob das Control gerade gemountet ist oder nicht. [`measurePaneFits`](../../../../packages/client/ui-dockkit/src/components/measure.ts) übernimmt die `hideSplitWhenBlocked`-Wahl des Einbettenden, misst die Box des gerenderten Controls plus den Spaltenabstand des Strips (`splitControlFootprint`) und reicht sie als [`PaneMeasure.splitControlWidth`](../../../../packages/client/ui-dockkit/src/engine/geometry.ts) weiter, den `halvesFit` vom festen Teil subtrahiert. Den Footprint auszuschließen ist auch für sich genommen korrekt: Eine zum Splitten zu schmale Hälfte würde ihr eigenes Control verstecken, also gehört der Footprint nicht zu dem, was eine Hälfte tragen muss. Einbettende, die blockierte Controls deaktiviert rendern, übergeben nichts und behalten das Control wie bisher im festen Teil.

## Erwogene Alternativen

**Nur budget-blockierte Controls verstecken, breitenblockierte deaktiviert rendern.** So verhielt sich der Code, bevor `hideSplitAtCapacity` zu `hideSplitWhenBlocked` erweitert wurde: Das Budget ist zustandsgesteuert und kann nicht über die Messung zurückwirken. Das vermeidet die Schleife, gibt aber die von der Sidebar angeforderte Darstellung auf — kein deaktiviertes Split-Control auf Panes, die nicht splitten können.

**Neumessung während der Oszillation debouncen oder einfrieren.** Dämpfung verdeckt die Instabilität statt sie zu beseitigen: Die Messung hinge weiterhin von der Sichtbarkeit des Controls ab, bliebe willkürlich auf einem der beiden Zustände stehen und kippte beim nächsten Resize erneut.

**Den Footprint des Controls aus einer Konstante messen.** Ein hartkodiertes 32px driftet vom Stylesheet ab; das gerenderte Control und den realen `column-gap` des Strips zu messen hält die Subtraktion gleich dem, was der Strip tatsächlich verliert — die exakte Bedingung für eine stabile Messung.

## Konsequenzen

Die Raummessung ist ein Fixpunkt unter Control-Sichtbarkeit, sodass `hideSplitWhenBlocked`-Einbettende versteckte Controls ohne Rückkopplung erhalten. Panes nahe der Grenze lesen sich jetzt geringfügig früher als splittbar, als es ein Einbettender mit deaktiviertem Control melden würde, weil die befragte Hälfte das Control nicht tragen würde. Ein [dockkit-Regressionstest](../../../../packages/client/ui-dockkit/tests/components.client.spec.tsx) emuliert, dass der Strip den Footprint des Controls ablegt, und scheitert auf dem unfixten Code mit Reacts Update-Depth-Fehler; ein [Sidebar-Browser-Fall](../../../../apps/web/tests/sidebar-right.e2e.ts) zieht den Panel-Grip auf einem gequetschten Viewport an beiden Clamps vorbei und behauptet, dass Panel, Grip und eine saubere Konsole überleben — der Absturz zeigt sich nur als Console-Error, auf den der Scaffold-Tripwire nicht achtet.
