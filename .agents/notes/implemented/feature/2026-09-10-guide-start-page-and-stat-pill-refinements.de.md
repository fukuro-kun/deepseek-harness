# Agent Note: Guide-Startseite und Verfeinerungen der Stat-Pills

Status: implemented

[English](2026-09-10-guide-start-page-and-stat-pill-refinements.md) | [中文](2026-09-10-guide-start-page-and-stat-pill-refinements.zh.md) | Deutsch

## Problem

Der Guide-Tab der rechten Sidebar war eine nackte Liste von Einstiegskapseln: kein visueller Anker darüber, eine Kapsel konnte nur ihren Titel sagen, und ein Eintrag, dessen Typ kein Glyph registriert hatte, renderte ganz ohne Icon, sodass eine gemischte Liste kaputt statt spärlich wirkte. Separat druckte der Session-Token-Nutzungsdialog unter dem Composer eine Zeile `Cache write 0 tok` für Sessions, die nie Cache schrieben.

## Entscheidung

**Der Guide ist ein Kompass über selbstbeschreibenden Kapseln.** Dies verfeinert die Guide-Verträge in [Tab-Typen und Navigation der rechten Sidebar](../architecture/2026-09-05-sidebar-tab-types-and-navigation.de.md) und [Sidebar-Textvorschau und Dateibaum](2026-09-05-sidebar-text-preview-and-file-tree.de.md). [GuideBody.tsx](../../../../packages/client/ui-sidebar-right/src/client/tabs/guide/GuideBody.tsx) zeichnet einen gedämpften 56px-Kompass-Hero über den Einstiegskapseln ohne Überschrift, wie eine Browser-Startseite ihre Tore ohne Bildunterschrift zeigt. [`SidebarRightGuideEntry`](../../../../packages/client/ui-sidebar-right/src/client/tab-registry.ts) erhält eine optionale gethunkte `description` — wie `title` bei jedem Render frisch gelesen, sodass Sprachwechsel keine Neuregistrierung brauchen. Eine Kapsel zeigt ihre Beschreibung unter dem Titel nur, solange der Guide höchstens `MAX_DESCRIBED_ENTRIES` (4) Einträge listet; eine längere Liste lässt jede Beschreibung weg, um leicht zu bleiben, sodass ein Typ auf seinem Titel stehen muss. Das Glyph folgt der Kapselhöhe: 22px neben einem nackten Titel, 26px neben zwei Zeilen.

**Einträge ohne Icon fallen auf ein mitgeliefertes Würfel-Platzhalter zurück.** Der Fallback wird an der Render-Stelle entschieden (`entry.icon ?? CubeGlyph`), nicht bei der Registrierung, sodass jeder Beitragende — eingebaut oder Erweiterung — ihn einheitlich erhält und ein Chain-Ersatz des Bodys die Regel mit ersetzt. `CubeGlyph` lebt neben `CompassGlyph` in [GuideTitle.tsx](../../../../packages/client/ui-sidebar-right/src/client/tabs/guide/GuideTitle.tsx): ein isometrischer Kasten in 1.1px geraden Strichen mit gerundeten Verbindungen auf `currentColor`, auf `--dsw-alias-label-tertiary` gezeichnet — eine Stufe leiser als die Tusche eines registrierten Glyphs — um den Slot als unbeansprucht zu markieren. Der files-Typ registriert eine Beschreibung und das gemeinsame Ordner-Glyph in [definition.tsx](../../../../packages/client/ui-sidebar-files/src/client/definition.tsx).

**Der Session-Nutzungsdialog lässt die Cache-Schreibzeile bei null weg.** Dies verfeinert [Composer-Sitzungsstatistik](2026-09-07-composer-session-stats-pills.de.md). [StatsPills.tsx](../../../../packages/client/ui-chat/src/client/chat/StatsPills.tsx) rendert die `Cache write`-Zeile nur wenn `cacheWriteTokens !== 0`, wie das Per-Turn-Panel seine fehlenden optionalen Felder schon weglässt; die immer vorhandenen Buckets (Eingabe, Cache-Lesevorgang, Ausgabe) behalten ihre Zeilen.

## Erwogene Alternativen

**Den Würfel in `ui-primitives` registrieren.** Sein `icons/index.tsx` ist das importierte figma-`ic_ds_*`-Set, und der Würfel hat einen einzigen Consumer; `CompassGlyph` setzte den Präzedenzfall paketlokaler Guide-Glyphen.

**Das Icon bei der Registrierung defaulten.** Ein `?? default` im Registry würde den Fallback vor dem Body verstecken und "kein Glyph registriert" unerkennbar machen, womit die leisere Platzhalter-Tusche verloren ginge; expliziter Render-Stellen-Fallback hält Registrierungen ehrlich.

**`Cache write 0` anzeigen.** Eine Session auf einem Provider, der nie Cache schreibt, trüge die Zeile für immer; null bedeutet hier "gibt es nicht", nicht eine Messung.

## Folgen

`description` ist neue pre-stable Registry-API; jeder Consumer wurde aktualisiert (der files-Eintrag registriert eine). Die 4-Einträge-Schwelle ist eine ausgelieferte Konstante des Guide-Bodys, keine Konfiguration. Guide-Body-Specs decken den Platzhalter (Größe und Tusche), die Beschreibungsschwelle auf beiden Seiten und den Registriertes-Glyph-Pfad ab; Chat-Stats-Specs decken die weggelassene und die vorhandene Cache-Schreibzeile ab. Die `ui-sidebar-right`- und `ui-sidebar-files`-READMEs wiederholen die Guide-Regeln.
