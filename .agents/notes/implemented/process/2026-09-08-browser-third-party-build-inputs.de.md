# Agent Note: Drittanbieter-Bibliotheken für den Browser als Build-Eingaben

Status: implemented

[English](2026-09-08-browser-third-party-build-inputs.md) | [中文](2026-09-08-browser-third-party-build-inputs.zh.md) | Deutsch

## Problem

Vorgefertigte Browser-Plugins verteilen ihre Drittanbieter-Implementierungen innerhalb von JavaScript, aber produktive npm-Abhängigkeiten lassen Installer diese Bibliotheken trotzdem separat herunterladen und ihre peer dependencies auflösen. Wenn React nur für die Entwicklung deklariert ist, können Installer für diese zusätzlichen Abhängigkeiten eine andere React-Version wählen, als das Browser-Artefakt verwendet. Sowohl `use-sync-external-store@1.2.0` als auch `@tanstack/react-virtual@3.14.9` unterstützen das aktuelle React 18; dieses Problem erfordert kein React-Upgrade.

## Entscheidung

Rein browserseitige Drittanbieter-Abhängigkeiten gehören in `devDependencies`, einschließlich Implementierungen, die in dynamische Plugins inline eingebettet werden, statischer Browser-Bibliothekseingaben und React, das die Web-Shell gemeinsam bereitstellt. Dies ersetzt teilweise die Bewahrung gewöhnlicher Drittanbieter-Deklarationen in [veröffentlichte Abhängigkeits-Faces](2026-08-26-published-dependency-faces.de.md); jene Note regelt weiterhin Paketauswahl, Host-Wert-Abhängigkeiten und Cordis-Identität.

Der Abhängigkeitsklassifikator sammelt Build-Eingaben aus Quellimporten und JSX. Vom Host-Laufzeit erreichbare Drittanbieter-Bibliotheken haben als `dependencies` Vorrang; zusätzliche Node-Build-Einträge müssen ebenfalls geprüft werden. Rein typbezogene Quellreferenzen erzeugen keine Host-Laufzeit-Abhängigkeiten. Bestehende Klassifikationen für Konfigurationsmetadaten und gemeinsame Host-Exporte bleiben unverändert.

Npm-Abschnitte wählen kein Browser-Bundling-Verhalten. Dynamische Plugins betten private Bibliotheken inline ein und beziehen React und andere gemeinsame Module aus der Plattformtabelle; statische Browser-Bibliotheken behalten bare imports und Styles für den finalen Vite-Build. Statische Pakete sind Build-Eingaben der Web-Shell, keine unabhängig installierten Bibliotheken mit jeder für ein erneutes Bündeln benötigten Abhängigkeit. Quellbuilds benötigen Entwicklungsabhängigkeiten; installierte veröffentlichte Web-Artefakte nicht.

Die Lizenzklassifikation folgt dem verteilten Inhalt. Abhängigkeitsauflösung über die realen Browser-Build-Konfigurationen deckt dynamische Plugins und die Web-Shell ab; aufgelöste Drittanbieter-Implementierungen bleiben [Laufzeit-Offenlegungen](2026-07-30-generated-third-party-notices.de.md), selbst wenn Manifeste sie für die Entwicklung deklarieren. Testwerkzeuge, gelöschte Typimporte und Build-Werkzeuge werden nicht allein dadurch zu verteiltem Code, dass sie in `devDependencies` erscheinen.

## Betrachtete Alternativen

**Ein weiteres produktives React deklarieren oder die peer-Auflösung überschreiben.** Das behält einen zusätzlichen installierten Graphen, den der Browser nicht nutzt, ohne diese installierte Kopie zur gemeinsamen Instanz des Browsers zu machen.

**Jede Abhängigkeit statischer Bibliotheken früh inline einbetten.** Das ändert Vites Drittanbieter-Chunks, Caching und CSS-Behandlung; die Abhängigkeitsklassifikation erfordert diese Build-Änderungen nicht.

**Jede Drittanbieter-Abhängigkeit eines Client-tragenden Pakets verschieben.** Dual-Face-Pakete laden weiterhin Host-Bibliotheken, darunter `fflate` für ZIP-Ausgabe und `zod` für RPC-Validierung; diese Installationsbeziehungen müssen bestehen bleiben.

**Lizenz-Offenlegungen direkt nach Manifestabschnitt klassifizieren.** Browsercode zu verteilen und einen Installer ein gleichnamiges Paket herunterladen zu lassen sind unterschiedliche Tatsachen; diese Unterscheidung kann Lizenzprüfungen auf verteiltem Code nicht aufheben.

## Konsequenzen

Produktive Abhängigkeiten installieren Drittanbieter-Bibliotheken nicht ein zweites Mal nur für Browser-Implementierungen. React und React DOM behalten eine Build-Version, und Plugins konsumieren die gemeinsame Instanz der Web-Shell. Klassifikationstests beschränken reine Browser-Dev-Eingaben, Host-Vorrang und idempotente Reparatur; Veröffentlichungsprüfungen weisen React-Installationslecks zurück, während die Browser-Artefakt-Verifikation unabhängig das Modul-Laden abdeckt.

Die Klassifikation bleibt quellbasiert. Die Lizenzauflösung darf ebenfalls nicht von bestehenden `lib/`-Dateien abhängen oder Build-Ausgaben schreiben; ihre Tests decken reale Auflösung, Typentfernung, Asset-Referenzen und fehlende Abhängigkeiten ab. Entwickler, die statische Pakete oder öffentliche Typen eigenständig konsumieren, stellen die entsprechenden Build-Abhängigkeiten selbst bereit; diese Entscheidung fügt kein Unterstützungsversprechen für eigenständige Browser-Bibliotheken hinzu.
