# Agent Note: Workspace-Datei-Read-Authority

Status: implemented

[English](2026-09-09-workspace-file-read-authority.md) | [中文](2026-09-09-workspace-file-read-authority.zh.md) | Deutsch

## Problem

Workspace Files dient sowohl Dateiinhalten als auch der Workspace-Navigation. Das Anwenden von Workspace-Containment auf jede Operation erzeugt eine zweite Read-Policy oberhalb des Session-Dateisystem-Backend und verhindert, dass ein Benutzer Pfade in der Vorschau sieht, die dieselbe Session außerhalb ihres Workspace lesen kann. Die HTML-Vorschau benötigt außerdem direkte relative JavaScript- und Stylesheet-Dateien, einschließlich `..`-Pfade, während ihr skriptfähiges Dokument das Browser-Netzwerk nutzen kann.

## Entscheidung

`read`, `readBytes`, `readAll`, `readRelated` und `stat` erben die Read-Authority des adressierten Session-Dateisystem-Backend. Die Workspace-Wurzel ist die Basis für relative Eingabepfade, keine Read-Grenze; absolute Pfade und relative Pfade, die den Workspace verlassen, sind lesbar, wenn das Backend sie erlaubt. Der Service verlangt weiterhin reguläre Dateien, verweigert Symlinks und wendet seine Text- und Byte-Obergrenzen an.

`list` und `changes` bleiben workspace-begrenzt, weil sie Workspace-Navigation und -Beobachtung exponieren statt eines benannten Datei-Reads. `list` lehnt ein Verzeichnis außerhalb der Wurzel ab, und `changes` filtert Beobachtungen durch das Workspace-Containment-Prädikat des Backend.

`readRelated` löst einen relativen Pfad vom Verzeichnis der Basisdatei aus. Ein `..`-Pfad kann daher JavaScript oder CSS außerhalb des Workspace lesen, wenn das Session-Backend es erlaubt. Document Preview verpackt begrenzte, statisch deklarierte lokale Scripts und Stylesheets in einen HTML-Blob-iframe mit `sandbox="allow-scripts"`; der opaque Origin blockiert den Parent-Zugriff, aber der Browser behält normalen Netzwerkzugriff. Diese Exposition ist ein bewusster Sicherheits-Kompromiss für das Rendern statisch generierten HTML.

Der [Workspace-Files-Service](2026-09-05-workspace-files-service.md) besitzt Paging, Datei-Prüfungen, Listing und Beobachtung. [Document Preview](2026-09-08-document-preview-operations.de.md) besitzt, welche zugehörigen Dateien verpackt werden, und den iframe-Sandbox.

## Betrachtete Alternativen

**Jede Operation im Workspace einschließen.** Das gibt Vorschauen eine engere Policy als das Session-Dateisystem-Backend, blockiert explizit adressierte lesbare Dateien und verhindert, dass HTML neben externen Assets rendert. Workspace-Containment bleibt dort, wo die Operation selbst den Workspace repräsentiert.

**Reads außerhalb erlauben, aber jegliches iframe-Networking blockieren.** Eine strengere CSP würde das Exfiltrations-Risiko senken, würde aber auch externe Assets und das für die Static-HTML-Vorschau bewusst beibehaltene Netzwerkverhalten ablehnen. Der opaque Sandbox schützt die Parent-Anwendung; er verspricht keine Netzwerk-Isolation.

## Konsequenzen

Jeder Aufrufer mit einer gültigen Session-Dateiadresse kann Bytes jeder regulären Datei empfangen, die das Session-Dateisystem-Backend ihm zu lesen erlaubt, einschließlich Dateien außerhalb des Workspace. Ein vorgeschautes HTML-Dokument kann verpacktes lokales JavaScript ausführen und Netzwerk-Anfragen stellen. Dateien außerhalb erzeugen keine `changes`-Frames, sodass ihre Vorschauen einen expliziten Refresh benötigen, um Aktualisierungen zu beobachten.
