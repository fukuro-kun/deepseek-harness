# Agent Note: Semantische Issue-Templates und präsentationsneutrale Policy

Status: implemented

[English](2026-09-03-semantic-issue-templates-and-policy.md) | [中文](2026-09-03-semantic-issue-templates-and-policy.zh.md) | Deutsch

## Problem

Issue- und Pull-Request-Templates mischten Erfassungsfragen mit Review-Belegen und versteckten ihren vollständigen Inhalt in `details`-Elementen. Ungenutztes Frontmatter und separate Idea- und Research-Templates fügten Auswahlmöglichkeiten hinzu, ohne zu ändern, wie das Repository die Arbeit plante.

Die Issue-Policy behandelte außerdem Markdown-Präsentation als Repository-Metadaten. Anforderungen an `details`-Elemente, einen sichtbaren Body von 50 Einheiten, chinesische Titel, Titel-Metadaten-Präfixe und eine `Owner:`-Body-Zeile erzeugten Fehlschläge, ohne eine fehlende semantische Entscheidung zu benennen.

## Entscheidung

Issue-Templates decken Bug, Feature und Task ab. Bug fragt nach Zusammenfassung, Reproduktion, aktuellem Verhalten, erwartetem Verhalten und Umgebung. Feature fragt nach Motivation und Verhalten. Task fragt nach Zusammenfassung und Deliverables. Idea und Research gehören zu Task, solange keine künftige Entscheidung ihnen ein eigenes Lifecycle-Verhalten gibt.

Das Frontmatter der Issue-Templates enthält nur `name`, `about` und `type`. Markdown-Überschriften definieren die Hierarchie, und HTML-Kommentare erklären, was unter jede Überschrift gehört.

Das Pull-Request-Template enthält `Motivation`; einen `Changes`-Abschnitt mit benachbarten Platzhaltern für Änderungen an öffentlichen Schnittstellen und am Verhalten; sowie `Testing`-Einträge, die jede Methode direkt zeigen und ihren Nachweis in ein lokales `details`-Element legen.

Die Issue-Policy prüft weder `details`-Präsentation, sichtbare Body-Länge, Titelsprache, Titelpräfixe noch Ownership-Zeilen im Body. Jede andere Policy-Prüfung, Warnung, Lifecycle-Operation, Workflow-Trigger und Durchsetzungsausnahme für Pull Requests behält ihr bisheriges Verhalten. Diese Entscheidung fügt keine Metadaten-Reparatur, Issue-Klassifikation, Datenmigration oder neue Workflow-Fähigkeit hinzu.

## Verifikation

[Issue-management tests](../../../../.github/issue-management/policy.test.mjs) pinnen das Template-Inventar und die Überschriften, die Testing-Struktur des Pull Requests und die Akzeptanz von Titeln, Bodys und Assignee-Zuständen, die sich nur in der Präsentation unterscheiden.

## Erwogene Alternativen

**Idea- und Research-Templates behalten.** Ihre Formulare begründeten kein von Task unterscheidbares Lifecycle- oder Policy-Verhalten; separate Einstiegspunkte vergrößerten also nur die Auswahl, ohne eine sinnvolle Typunterscheidung zu bewahren.

**Präsentationsregeln als Warnungen behalten.** Diese Regeln konnten ansonsten bearbeitbare Issues scheitern lassen und konnten nicht feststellen, ob die angeforderte Arbeit, das erwartete Verhalten oder die Deliverables klar waren.

**Automatische Metadaten-Reparatur oder Issue-Klassifikation hinzufügen.** Diese Verhaltensweisen erfordern neue Mutationsregeln, Berechtigungen, Fehlerbehandlung und betriebliche Belege. Sie bleiben eigene Entscheidungen, statt eine Policy-Vereinfachung zu begleiten.

## Konsequenzen

Contributors sehen kürzere Formulare, deren Überschriften zu den bei Issue-Erfassung und Pull-Request-Review benötigten Informationen passen. Policy-Fehlschläge bleiben auf die bestehenden semantischen Metadaten-Checks fokussiert.

Die Policy schreibt keine Legacy-Labels um, wählt keine fehlenden Issue-Types, synchronisiert keine Priority und migriert keine bestehenden Repository-Daten. Jede künftige Automatisierung dieser Vorgänge braucht ihre eigene Entscheidung und ihren eigenen Review-Umfang.
