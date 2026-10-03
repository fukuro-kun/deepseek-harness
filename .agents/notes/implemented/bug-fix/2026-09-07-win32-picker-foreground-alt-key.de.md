# Agent Note: Vordergrundaktivierung des Win32-Pickers per synthetisiertem Alt-Druck
[English](2026-09-07-win32-picker-foreground-alt-key.md) | [中文](2026-09-07-win32-picker-foreground-alt-key.zh.md) | Deutsch

Status: implemented


## Problem

Der Web-GUI-Host wählt ein Workspace-Verzeichnis über den nativen Win32-Ordnerdialog, der in einem vom Host gespawnten Kindprozess läuft (issue #3543). Windows gewährt den Vordergrund nur dem Vordergrundprozess, einem von ihm gestarteten Prozess oder einem Prozess, der kürzlich Eingaben erhalten hat; ein Kind eines Hintergrund-Serverprozesses erfüllt nichts davon, sodass der von `Show` geöffnete Dialog hinter jedem sichtbaren Fenster bleibt, obwohl er das erste Fenster des Kindes ist. Die dem Spawn-Design zugrunde liegende Annahme „erstes Fenster wird aktiviert" ([archivierte Feature-Notiz](../../archived/feature/2026-08-02-win32-in-process-folder-dialog.md)) gilt nur, wenn die Spawner-Kette den Konsolen-Vordergrund besitzt, wie bei einer aus der Konsole gestarteten CLI.

## Entscheidung

`runFolderDialog` ruft zwischen der `showing`-Benachrichtigung und dem blockierenden `Show` ein neues `pressAltForForeground`-Binding auf. Das Binding synthetisiert auf dem Dialog-Thread einen Alt-Druck (`keybd_event` mit `VK_MENU`, down dann up), wodurch Windows diesen Prozess als jüngsten Eingabe-Eigentümer zählt — einen der dokumentierten Gründe für Vordergrundaktivierung —, sodass das von `Show` erzeugte Dialogfenster im Vordergrund aktiviert wird. Das Bindings-Modul lädt bereits koffis `user32`; die Änderung fügt daher einen Funktionsabruf und zwei Aufrufe hinzu. Der Druck erfolgt unter Windows bedingungslos. Hält der Prozess bereits Vordergrundrechte (eine aus der Konsole gestartete CLI), aktiviert sich der Dialog ohnehin und der Druck ist wirkungslos; das zu diesem Zeitpunkt fokussierte Fenster empfängt dennoch das einzelne Alt und kann kurz seine Menüleiste hervorheben. Umgebungen, die injizierte Eingaben unterdrücken (sichere Desktops, eingeschränkte Remotesitzungen, ein mit höheren Rechten laufendes Vordergrundfenster), lassen den Dialog hinter anderen Fenstern; das Package-README verzeichnet diese Grenze.

## Erwogene Alternativen

**Eigenes URL-Protokoll mit Browser-Klickgeste.** Der Draft-PR #3544 gewährte den Vordergrund, indem der Vordergrund-Browser zu einer registrierten `dsh-picker://`-URL navigierte, sodass die Shell den Dialogprozess als Vordergrund-Nachkommen startet. Die Gewährung ist konstruktionsbedingt deterministisch, doch der Mechanismus umfasst Registry- und VBS-Launcher-Dateien, einen Protokoll-Einstiegspunkt, eine picker-result-HTTP-Route mit Per-Boot-Tokens und eine Browser-Bestätigung bei erster Nutzung, und er fügt eine serverseitige Route hinzu, die der Browser erreichen kann. Der synthetisierte Druck beseitigt diese gesamte Fläche.

**AllowSetForegroundWindow durch den Klicker.** Die API muss vom aktuellen Vordergrundprozess — dem Browser — aufgerufen werden und darf nur einen erlaubten Prozess benennen; der Spawner kann sie nicht im Namen des Browsers aufrufen.

**AttachThreadInput auf den fokussierten Thread.** Das Anhängen des Dialog-Threads an den Thread des fokussierten Fensters umgeht die Vordergrundbeschränkung ebenfalls und vermeidet den Tastatur-Nebeneffekt, ist aber ebenso undokumentiert, benötigt zur Anzeigezeit die Thread-ID des fokussierten Fensters und scheitert, wenn das fokussierte Fenster zu einem Prozess höherer Integrität gehört; es wurde nicht prototypisiert.

## Konsequenzen

Der Picker behält sein Single-Spawn-Kind-Design und gewinnt Vordergrundverhalten im Hintergrund-Host-Fall zum Preis eines koffi-Aufrufpaars. Die Bindings-Spec fixiert über die Fake-COM-Welt die Alt-down/up-Sequenz und ihre Position unmittelbar vor `Show`; die Logic-Spec fixiert die vollständige showing → press → `Show`-Reihenfolge. Die Windows-CI-Lane öffnet weiterhin einen echten Dialog und schließt ihn per Abort — mit Druck, aber ohne Aktivierung zu behaupten. Die Validierung auf einer Windows-11-Maschine mit auf Maximum erzwungenem Vordergrund-Lock reproduzierte den Fehler ohne Druck (Dialog hinter anderen Fenstern) und den Vordergrund-Dialog mit Druck in fünf von fünf Wiederholungen; Windows 10 ist unverifiziert. Synthetisierte Eingaben werden vom Raw-Input-Thread asynchron konsumiert, sodass die Aktivierungsgewährung prinzipiell race-anfällig ist; in den Wiederholungen trat kein Fehlschlag auf, und fragile Umgebungen bleiben eine dokumentierte Package-Einschränkung statt eines zweiten Mechanismus, weil das Browse-Backend die Antwort auf Kompositionsebene bleibt, wo nativem Picking nicht zu trauen ist.
