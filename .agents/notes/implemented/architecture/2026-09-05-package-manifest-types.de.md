# Agent Note: Ownership der Package-Manifest-Deklarationen
[English](2026-09-05-package-manifest-types.md) | [中文](2026-09-05-package-manifest-types.zh.md) | Deutsch

Status: implemented


## Problem

Externe Packages brauchen Harness-Manifest-Typen, ohne von Boot- oder Client-Implementierungen abzuhängen. Deklarationen neben einzelnen Readern zu halten verschleiert die vollständige Konfigurations-API und lässt sich überschneidende Felder divergieren.

## Entscheidung

[`@deepseek-ai/dsh-package-manifest`](../../../../packages/util/package-manifest/README.de.md) besitzt `DshManifest` und seine Member-Deklarationen in einer einzigen Type-only-Datei. Das Package gehört zur bestehenden Utility-Gruppe und exportiert keine Runtime-Werte. Autor-Deklarationen und Launcher-generierte Module-Fallback-Metadaten werden explizit unterschieden.

Reader importieren die geteilten Deklarationen direkt. Boot behält Profile-Loading, Raw-JSON-Checks, Defaults und aufgelöste Runtime-Daten. Client-Module behalten ihren normalisierten Boot-Graphen. Der Image-Packer löst deklarierte Pfade in Verzeichnisse auf. Der Session-Catalog-Generator leitet einen Read-only-validierten Entry mit aufgelöstem Import-Pfad ab; rohe Inputs und Discovery-Regeln bleiben lokal.

App-Boot deklariert eine Production-Dependency, weil seine veröffentlichten Deklarationen die geteilten Typen referenzieren. Client-Module, der private Packer und Root-Skripte verwenden Development-Dependencies, weil ihre veröffentlichten APIs diese Typen nicht exponieren. Jeder Package-Consumer hat eine TypeScript-Project-Reference. Externe Autoren importieren aus dem Utility-Package; App-Boot bietet keine Kompatibilitäts-Re-Exports.

## Erwogene Alternativen

**Deklarationen in einzelnen Readern behalten.** Externe Autoren würden von Runtime-Implementierungen abhängen, und eine partielle Profile-only-Definition würde bestehende Client- und Build-Felder weglassen.

**Eine separate Types-Gruppe erzeugen.** Die bestehende Utility-Gruppe beherbergt eine Type-only-Bibliothek ohne weitere Package-Kategorie. Runtime-Service- und Event-Deklarationen bleiben bei ihren Eigentümern.

**Die JSON-Parser vereinheitlichen.** Deklarationen zu teilen erfordert keine Änderung an Validierung, Fehlern, Defaults oder geparsten Ergebnissen; diese bleiben im Besitz des jeweiligen Readers.

## Konsequenzen

Autoren gewinnen einen öffentlichen Import-Pfad zum Preis eines veröffentlichten Packages und expliziter Dependency-Kanten. Bestehende App-Boot-Manifest-Typ-Imports müssen das neue Package verwenden. Das [Profile-Composition-Design](2026-08-05-profile-plugin-bundles.de.md) besitzt weiterhin die Runtime-Semantik; Typ-Extraktion ändert weder Konfigurations-Akzeptanz noch modell-sichtbares Verhalten.

Compiler- und Packaged-NodeNext-Consumer-Checks decken öffentliche Imports ab. Bestehende Profile-, Client-, Image-Configuration- und Session-Catalog-Tests decken Reader-Verhalten ab; Dokumentations-Checks decken die Utility-Klassifizierung und die generierten Package-Kataloge ab. Optionale Deklarationsfelder erfordern beim Hinzufügen weiterhin bewusste Consumer-Updates.
