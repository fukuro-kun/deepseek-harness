# Agent Note: Follow package-local forwarding modules in Typert references

Status: implemented

[English](2026-09-07-typert-package-local-forwarding-imports.md) | [中文](2026-09-07-typert-package-local-forwarding-imports.zh.md) | Deutsch

## Problem

`WorkspaceAnalyzer` löst jede Typ-Referenz zu ihrer ursprünglichen Deklaration auf, bevor er sie klassifiziert, und liest dann nur das eigene `import`-Statement der referenzierenden Datei, um zu entscheiden, ob die Referenz ein Package über einen öffentlichen Export kreuzte. Ein Package, das den Typ eines anderen Packages aus einem eigenen Modul re-exportiert und dieses Modul andernorts per relativem Pfad importiert, schlägt daher mit `crosses a package without an explicit package import` fehl, obwohl der Package-Import einen Hop entfernt existiert. Der Fehlschlag ist für jede Batch-Größe und Package-Reihenfolge deterministisch; er tritt in derjenigen Analyse auf, die das referenzierende Package als Root wählt — weshalb [Issue 3525](https://github.com/deepseek-harness/deepseek-harness/issues/3525) ihn als batch-abhängig beobachtete.

## Decision

[`targetForReference`](../../../../packages/typert/generator/src/analyzer.ts) löst einen relativen Specifier über den geteilten Compiler-Host der Face und deren Module-Resolution-Cache auf und folgt ihm nur, solange die aufgelöste Datei innerhalb des referenzierenden Packages bleibt. In jedem Forwarding-Modul sammelt es die `export`-Kanten, die den angeforderten Namen tragen: einen named Re-export mit Specifier, ein `export { local }`, das vom `import` dieses Moduls gestützt wird, und Star-Re-exports, deren Modul dasselbe Symbol exportiert. Explizite Kanten werden vor Star-Kanten versucht, passend zu TypeScripts Shadowing von Star-Exports, und jedes aufgelöste Paar aus Modul und angefordertem Exportnamen wird einmal betreten, sodass zirkuläre Star-Re-exports terminieren, während unterschiedliche umbenannte Routen durch ein Modul verfügbar bleiben. Der Walk stoppt beim ersten Package-Specifier und gibt diese Identität und den Exportnamen an den bestehenden `packageExportName`-Check weiter, sodass ein geforwardeter Typ am Package-Subpath, den das Forwarding-Modul nennt, weiterhin öffentlich sein muss und ein Packagename ohne Registrierung dort abgelehnt wird. Das Referenzmodell ist unverändert: Das Ziel bleibt `declaration` für einen Same-Face-Owner und `cross-face` für eine andere Face.

Der Walk liefert keinen Package-Import, und die Referenz schlägt wie zuvor fehl, wenn ein relativer Specifier außerhalb des referenzierenden Packages auflöst, wenn die einzige den Namen tragende Kante ein Namespace-Re-export oder ein re-exportierter Namespace-Import ist, oder wenn jede Kante zu einem bereits betretenen Paar aus Modul und angefordertem Namen zurückläuft.

## Alternatives considered

**Einen relativen Import, dessen Alias-Kette in einem anderen Package endet, als implizit öffentlich behandeln.** Verworfen: Er würde `../../other/src/file.ts` und jedes Forwarding-Modul akzeptieren, das selbst das andere Package per relativem Pfad erreicht, und so den Public-Export-Check entfernen, auf den die generierten Remote-Deklarationen angewiesen sind, um einen importierbaren Subpath zu benennen.

**Das Forwarding-Modul als Referenzziel aufzeichnen.** Verworfen: Emitter und Cross-Face-Links brauchen Package und öffentlichen Subpath der ursprünglichen Deklaration; ein package-lokales Modul hat keine eigene öffentliche Identität.

**Kanten in Source-Reihenfolge ohne Symbol-Checks auswählen.** Verworfen: Ein Star-Re-export, der zu einem früheren Modul zurückschleift, kann vor dem expliziten Re-export stehen, der den Typ tatsächlich trägt, und TypeScript selbst lässt explizite Exports Star-Exports überschatten; explizite Kanten zuerst zu ordnen und über ein bereits betretenes Paar aus Modul und angefordertem Namen hinwegzugehen hält solche Module akzeptiert, ohne einen unbegrenzten Walk.

**Batched- und Whole-Workspace-Analysen dieselben Roots wählen lassen.** Als Fix verworfen: Die Root-Auswahl ändert das Urteil über eine Referenz nicht, nur ob die Referenz besucht wird; die Caller auszurichten würde die falsche Klassifikation verbergen statt sie zu entfernen.

## Consequences

Packages dürfen ein Forwarding-Modul für fremde Typen behalten und es relativ importieren, passend dazu, wie ihre eigenen Module organisiert sind. Jede Cross-Package-Relative-Referenz kostet eine Modul-Resolution pro Hop über den geteilten Resolution-Cache der Face; `reachableFiles` löst jetzt über denselben Cache auf. [`type-model.spec.ts`](../../../../packages/typert/generator/tests/type-model.spec.ts) pinnt Named-, Renamed-Multi-Hop-, Import-then-Export-, Star- und Namespace-Import-Forwarding, einen expliziten Re-export neben einer zurückschleifenden Star-Kante, unterschiedliche umbenannte Routen durch ein geteiltes Modul, einen geforwardeten privaten Export, ein per relativem Pfad kreuzendes Forwarding-Modul, einen Zyklus, dessen einziger Ausgang per relativem Pfad kreuzt, einen Namespace-Re-export, einen re-exportierten Namespace-Import, Cross-Face-Forwarding sowie die Gleichheit von Whole- und Batched-Analyse für das Forwarding-Fixture über Batch-Größen und Package-Reihenfolgen hinweg.
