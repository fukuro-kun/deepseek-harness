# Agent Note: Datei-URLs für eingefügte Patch-Plugins

Status: implemented

[English](2026-09-05-patch-plugin-file-urls.md) | [中文](2026-09-05-patch-plugin-file-urls.zh.md) | Deutsch

## Problem

Node ESM interpretiert einen Windows-Laufwerkspräfix als URL-Scheme und behandelt Dateinamen-Fragmente als URL-Syntax. Dateisystempfade, die direkt an Plugin-Importe übergeben werden, schlagen daher für absolute Windows-Pfade und Dateinamen mit `#` oder `%` fehl.

## Entscheidung

Das Parsen von Patch-Dateien wandelt native absolute Pfade und patch-relative `./`- oder `../`-Namen innerhalb von `insert`-Zeilen und ihren verschachtelten Gruppen in Datei-URLs um. Paket-Spezifizierer, vorhandene URLs, Namensassertionen vorhandener Einträge und Ersatz-`config`-Werte behalten ihre Bedeutung. Das Parsen besitzt diese Umwandlung, weil es das Ursprungsverzeichnis des Patches kennt, bevor die Schichten zusammengesetzt werden.

Das optionale `HostResolvedRootInclude`-Import-Override wandelt absolute Pfade separat für Aufrufer um, die eine Resolver-Basis des installierten Hosts wählen. Gewöhnliche CLI-Profile wählen dieses Override nicht; es kann die Patch-Datei-Umwandlung nicht ersetzen.

## Erwogene Alternativen

**Nur das Python-Fixture mit `Path.as_uri()` umwandeln.** Das vermeidet einen Fehler, lässt aber von Benutzern verfasste Profil- und Overlay-Patches weiterhin betroffen.

**Die gemeinsame Loader-Basis ändern.** Das verliert die Herkunftsinformation pro Patch und ändert die Auflösung unqualifizierter Pakete. Datei-URLs bewahren die ausgewählte lokale Datei, ohne die Resolver-Basis zu ändern.

## Konsequenzen

Optionale und erforderliche Patch-Reader teilen sich die Umwandlung. Direkte Loader-Importe und über Ersatz-Gruppen-Configs eingeführte Kinder bleiben außerhalb ihres Geltungsbereichs; diese Pfade zu erweitern erfordert eigene Semantik und Abdeckung.

Die Patch-Reader-Tests verifizieren Umwandlung und reale Aktivierung. Die Akzeptanz des gebauten SDK lädt ein Overlay-Plugin mit absolutem Pfad und URL-sensitiven Dateinamenzeichen und verifiziert dessen Dateisystem-Marker, Initialisierung und Shutdown.
