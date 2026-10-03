# Agent Note: Schließregeln für den letzten Tab auf der angedockten Sidebar-Fläche

Status: implemented

[English](2026-09-08-sidebar-last-tab-close-rules.md) | [中文](2026-09-08-sidebar-last-tab-close-rules.zh.md) | Deutsch

## Problem

Der Settle-Planner garantiert, dass die angedockte Fläche nie leer ist: Das Schließen des letzten Tabs sät die aktuelle Standardseite neu. Diese Garantie machte das Schließen-Steuerelement des letzten Tabs in beide Richtungen zur Sackgasse. Das Schließen des allein stehenden Guide holte denselben Guide sofort zurück — ein Steuerelement, das nichts tut. Das Schließen jedes anderen alleinigen Tabs ließ den Nutzer mit einer Spalte zurück, die nur die Standardseite zeigt — nach "das Letzte schließen" ist ein ausgeklapptes Panel ohne Inhalt nicht das, was die Geste meinte. Der Chip des Guide zeichnete außerdem eine Hover-Kapsel und ein Kontextmenü, dessen einziger Eintrag jenes wirkungslose Schließen war.

## Entscheidung

Der letzte Tab der angedockten Fläche trägt eine Regel, entschieden im `closeTab` des Sidebar-Stores und über ein neues Control-Policy-Prop `canCloseTab(tabId)` (neben `canSplit` und `canAddTab`) ins Kit gespiegelt: Der als einziger angedockter Tab stehende Guide ist unschließbar — kein Chip-Schließen-Steuerelement, kein Menü-Schließeintrag, und ein programmatisches Schließen zeichnet nichts auf; jeder andere alleinige Tab schließt zusammen mit der Spalte in einem Historieneintrag, setzt Fullscreen auf Push-Modus zurück und lässt das Layout leer, bis die nächste Ausklappung die dann aktuelle Standardseite sät. `soleDockedTab(state, tabId)` in [stores.ts](../../../../packages/client/ui-sidebar-right/src/client/stores.ts) benennt die Bedingung; schwebende Panels nehmen daran nicht teil. Nach der Packages-Regel "entscheide dort, wo die Entscheidung durchgesetzt wird" ist das `closeTab` des Stores die Durchsetzung und `canCloseTab` spiegelt sie nur in die Oberfläche. Diese Regel ersetzt den Schließschutz-Teil der [Standardseiten-Entscheidung](2026-09-08-sidebar-default-pages.de.md); deren Auswahlregel bleibt aktiv.

Zwei kitseitige Darstellungsregeln vervollständigen sie in [TabPanel.tsx](../../../../packages/client/ui-dockkit/src/components/TabPanel.tsx) und [TabMenu.tsx](../../../../packages/client/ui-dockkit/src/components/TabMenu.tsx): Der einzige Chip einer Pane, dessen Schließen vorenthalten ist, zeichnet leise — keine Kapsel, kein Hover-Fill — da es nichts gibt, gegen das ausgewählt, und nichts, was ihm angetan werden könnte; und ein Menü, das überhaupt keinen Eintrag hielte, erzeugt kein sichtbares Popup, sodass ein Sekundärklick auf so einen Chip nichts zeigt statt einer leeren Box.

## Erwogene Alternativen

**Den Guide schließbar lassen und ihn vom Settle neu säen lassen.** Das sichtbare Ergebnis ist ein Schließen-Steuerelement, das nichts tut; das Steuerelement lügt darüber, was ein Druck bewirkt.

**Das Schließen im Renderer der Sidebar verstecken statt eines Kit-Props.** Das Kit zeichnet das Chip-Schließen und den Menü-Schließeintrag, sodass der Einbettende sie ohne Seam nicht vorenthalten kann; ein CSS-Override ließe den Menüeintrag aktiv und spaltete eine Entscheidung auf zwei Besitzer.

**Die Spalte vom Kit einklappen lassen, wenn der letzte Tab schließt.** Das Kit hat keinen Begriff der Spalte oder ihrer Ausklappung; das Einklappen ist die Absicht des Einbettenden, die der Store zusammen mit dem Schließen im selben Eintrag aufzeichnet.

## Folgen

`canCloseTab` ist ein drittes Control-Policy-Prop, das jeder Einbettende setzen darf; es wegzulassen hält jeden Tab schließbar. Die Regeln leiser Chip und leeres Menü sind unbedingtes Kit-Verhalten auf derselben Policy, sodass jeder Einbettende, der das Schließen eines alleinigen Tabs vorenthält, dieselbe Darstellung bekommt. Das Wiederöffnen der Spalte nach einem Alleiniger-Tab-Schluss zeigt die aus den aktuellen Guide-Einträgen gewählte Standardseite. Kit-Specs decken das vorenthaltene Steuerelement, den leisen Chip und das sich selbst schließende Menü ab; Sidebar-Unit-Specs decken `closeTab`s Verweigerung und den Schließen-mit-Spalte-Eintrag ab; ein [Browser-Fall](../../../../apps/web/tests/sidebar-right.e2e.ts) durchläuft die ganze Regel auf dem gerenderten Panel.
