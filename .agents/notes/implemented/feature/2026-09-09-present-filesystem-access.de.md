# Agent Note: Present folgt dem Dateisystemzugriff der Session

Status: implemented

[English](2026-09-09-present-filesystem-access.md) | [中文](2026-09-09-present-filesystem-access.zh.md) | Deutsch

## Problem

Erzeugte Dateien liegen häufig außerhalb der Workspace, besonders in `/tmp`. Die Workspace-Eingrenzung lehnt Dateien ab, die das Session-Dateisystem und die Sidebar bereits erlauben. Ein Provider-Prozesspfad kann zudem eine Remote-Datei benennen statt einer Datei auf dem bedienenden Host.

## Entscheidung

`present` akzeptiert existierende reguläre Dateien, die über sein komponiertes `ctx.fs` erreichbar sind, wobei relative Pfade gegen das Session-Arbeitsverzeichnis aufgelöst werden. Es gibt keine Workspace-Eingrenzungsprüfung und keine gesonderte Tempverzeichnis-Allowlist. Fehlende Dateien, Verzeichnisse, letzte symbolische Links und Provider-Fehler lehnen die Deklaration ab. Private Tempdateien einer Sandbox bleiben unverfügbar, wenn der Dateisystem-Provider sie nicht sehen kann.

Native Aktionen nutzen den mit der Deklaration zurückgegebenen betrachteten Session-Header, um den `workspaceFiles.stat`-Scope zu bilden: dessen cwd oder, falls abwesend, die Deployment-Workspace-Wurzel. Dasselbe komponierte Dateisystem bedient Sidebar-Vorschauen und native Validierung, ohne einen Agent zu aktivieren, auch für Kind-Sessions. Der resultierende kanonische Prozesspfad muss über dieses Dateisystem von einem Host-Pfad zurück auf denselben Prozesspfad abbilden. Fehlende oder abweichende Abbildungen erzeugen 422 und einen lokalisierten Hinweis, der die Sidebar-Vorschau vorschlägt. Dies unterstützt konservativ Host-Pfade, die ihre kanonische Prozesspfad-Schreibweise teilen; Provider mit nur einer nichtidentischen Host-Abbildung können weiterhin Vorschauen liefern. Eine gleichnamige lokale Datei ersetzt niemals eine nicht abgebildete Provider-Datei.

Dies ersetzt die Nur-Workspace-Zugriffsregel in der [Quelldatei-Auslieferungs-Entscheidung](2026-09-08-present-workspace-source-files.de.md). Jene Note bleibt zuständig für inhaltsfreie Deklarationen, Session-Events und das Bearbeiten aktueller Quellen. Der Request wählt weiterhin nur gespeicherte Session-/Event-/Dateikoordinaten, niemals einen beliebigen vom Browser gelieferten Pfad.

## Erwogene Alternativen

Eine `/tmp`-Allowlist schließt andere lesbare Ausgabeorte aus und dupliziert Dateisystem-Policy. Jeden Provider-Prozesspfad als Host-Pfad zu behandeln kann eine unzugehörige lokale Datei öffnen. Eine generische inverse Pfadabbildungs-API oder das Kopieren von Remote-Dateien weitet Provider- und Aufbewahrungsverantwortung über die Quelldatei-Auslieferung hinaus.

## Folgen

Workspace-Dateien, erreichbare Tempdateien, Downloads und Dateien in einem anderen Projekt nutzen dieselben Deklarationsregeln. Natives Öffnen erfordert sowohl einen bedienenden Desktop als auch einen verifizierten Host-Pfad. Metadaten-Prüfungen machen den späteren Pfadnachschlag einer Desktop-Anwendung nicht atomar.

Fokussierte Tests decken externe absolute und relative Pfade, letzte symbolische Links, fehlende Dateien, Session-Nachschlagefehler, fehlende und abweichende Host-Abbildungen sowie den lokalisierten native-unverfügbar-Zustand ab. Bestehende aufgezeichnete Web-Szenarien behalten die Abdeckung von Deklaration, Vorschau, nativer Aktion und inhaltsfreiem Export.
