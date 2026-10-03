# Agent Note: Workspace-Dateien als ein Dual-Face-API-Paket

Status: implemented

[English](2026-09-07-workspace-files-dual-face-package.md) | [中文](2026-09-07-workspace-files-dual-face-package.zh.md) | Deutsch

## Problem

Der Workspace-Datei-Service und sein Browser-Resource-Provider entwickeln sich gemeinsam, aber ihr Compiler-Graph enthielt Rückwärtsabhängigkeiten auf die Remote-Assembly und die Sidebar-UI. Das Aufteilen der Pakete vermied die Zyklen, trennte aber die Ownership des Wire-Protokolls von seinem Client-Modell. Einem reinen Host-Paket mit einem Types-only-Client-Compiler-Einstieg fehlen außerdem die `dsh.client`- und `./client`-Deklarationen, die Runtime-Exporte in der Client-Kataloganalyse unterscheiden.

## Entscheidung

`packages/api/workspace-files` besitzt beide Implementierungen. Seine Host- und Client-Leaf-Konfigurationen bleiben direkte Referenzen ihrer jeweiligen Root-Aggregate; der Solution-Root referenziert beide Leaves. Der Host exportiert den Datei-Service, `./client` exportiert das eigentliche Resource-Provider-Plugin, und `dsh.client` deklariert das Browser-Plugin. Eine Web-App-Zeile lädt beide Faces. Dies ersetzt nur die Paket-Aufteilungs-Entscheidung in der [Workspace-Datei-Service-Note](2026-09-05-workspace-files-service.md), deren Autorisierungs-, Paging- und Stream-Semantik unverändert bleibt.

Zwei Abhängigkeitsrichtungen halten den Compiler-Graph azyklisch:

- `client/resources` importiert `RemoteResult` und `RemoteFailure` aus ihrem definierenden `typert/protocol`-Paket, nicht aus `api/remotes`, das Provider assembliert, welche das Resource-Modell konsumieren.
- Die Textvorschau deklariert `SidebarRightResourceParamsMap.file` mit dem exportierten Parametertyp des Datei-Pakets. Der Datei-Provider deklariert seinen Resource-Wert, importiert aber keine Sidebar-UI. Der Aufrufer importiert den Typ-Einstieg des Viewers, wenn er diese Navigationsdeklaration benötigt.

Diese entfernen `remotes → workspace-files → resources → remotes` und `remotes → workspace-files → sidebar-right → ui-conversation → remotes`. Die Cordis-Service-Injection zur Laufzeit bleibt unabhängig von TypeScript-Projektreferenzen.

## Betrachtete Alternativen

**Getrennte Pakete behalten.** Das isoliert den Compiler-Zyklus, spaltet aber die Host- und Client-Ownership einer Datei-Fähigkeit. Das Entfernen der rückwärtigen Typ-Abhängigkeiten erlaubt dieselbe Dual-Face-Organisation wie bei anderen API-Controllern.

**Die Root-Client-Referenz entfernen.** Transitive Referenzen kompilieren das Leaf weiterhin, aber beide Root-Aggregate müssen das passende Face dieses Pakets explizit benennen.

**Die Kataloganalyse ändern oder ein leeres Client-Plugin hinzufügen.** Keines von beiden liefert die angeforderte Browser-Implementierung. Ein echter `./client`-Export mit `dsh.client` nutzt den vorhandenen unterstützten Dual-Face-Pfad des Analysators.

## Konsequenzen

Host-Wire-Methoden und das Browser-Resource-Verhalten sind unverändert. Browser-Implementierung, Tests und Dokumentation haben einen Paket-Eigentümer; Client-Typ-Abhängigkeiten stoppen an der Protokoll- und Resource-Modell-Schicht, statt UI oder Remote-Assembly zu erreichen.

## Verifikation

Der Cordis-Inspect-Katalog-Check analysiert den deklarierten Client-Export, beide Compiler-Aggregate behalten ihre Leaf-Referenzen, und die Host- und Client-Datei-Service-Tests prüfen dieselben Implementierungen. Die vorhandenen Abhängigkeits- und Projektreferenz-Checks erzwingen ihre Kompilierungsbeziehungen.
