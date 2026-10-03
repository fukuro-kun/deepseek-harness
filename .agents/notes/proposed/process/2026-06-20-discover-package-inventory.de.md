# Agent Note: Package-Inventare entdecken statt statische Listen pflegen

Status: proposed

[English](2026-06-20-discover-package-inventory.md) | [中文](2026-06-20-discover-package-inventory.zh.md) | Deutsch

## Problem

Package- und Gate-Inventare werden über TypeScript-Project-References, Package-Docs und CI-Prosa wiederholt. Die meisten wiederholen Package-Layout, Manifest-Daten oder Aggregat-Befehlsinhalte. Jedes neue Package erzeugt daher vermeidbare Synchronisationspunkte.

Die [Package-Hierarchie](../../archived/architecture/2026-06-20-package-hierarchy.md) hat bereits mehrere davon manuell entfernt: `scripts/publint-all.ts` leitet seine Liste jetzt aus dem `packages/<group>/<pkg>`-Layout ab, und die beiden `tsconfig`-`paths`-Maps sind auf einen `@deepseek-ai/dsh-*`-Wildcard kollabiert — seither auf ein explizites Alias pro Package zurückgesetzt, generiert und geartet, weil die sequenzielle Auflösung der Wildcard-Kandidaten den Source-Launch-Boot dominierte ([explizite Workspace-Pfad-Aliase](../../archived/process/2026-08-27-explicit-workspace-path-aliases.md)). Was übrig bleibt, ist das Inventar, das nicht per glob entfernt werden kann — vor allem die Project-`references` der Aggregat-Konfigs (`tsconfig.host.json`, `tsconfig.client.json`), die TypeScript als explizite Arrays verlangt (keine Wildcard-Form).

Statische Listen sind angemessen, wenn sie Policy kodieren; sie sind unnötige Reibung, wenn sie Manifest-Daten oder Layout-Fakten duplizieren, die bereits in `package.json`, Workspace-Globs oder der Package-Hierarchie existieren.

## Vorschlag

Die verbleibenden Package-/Gate-Inventare entdeckbar machen. Eine einzige kanonische Quelle — die `packages/<group>/<pkg>`-Hierarchie plus Package-Manifests — sollte die Aggregat-`references`, den Modulgraphen und jede andere Voll-Package-Liste steuern, mit einem Generieren-und-Verifizieren-Schritt (das bestehende `gen-module-graph` / `gen-cordis-catalog`-Muster: ein Generator schreibt das Artefakt, ein `--check`-Modus in `hygiene`/`doc-sync` schlägt fehl bei einer veralteten übergebenen Kopie). Die Modulgraphen-Generierung liest bereits Package-Manifests. `doc-sync` sollte der eine Befehl sein, der seine Sub-Gates definiert und ausgibt, mit Docs, die auf diesen Befehl verweisen, statt eine zweite Liste zu wiederholen.

Die Hierarchie muss nicht jede Tatsache über ein Package kodieren, aber sie sollte die breite Wartungs-Policy kodieren: core/product-Packages, Integrationen, Capability-Seams und support/test/example-Packages sollten nicht alle eine manuell gepflegte Ausnahmenliste erfordern, bevor Skripte sie unterscheiden können.

## Akzeptanzkriterien

- Aggregat-Konfig-Project-`references` werden aus der Hierarchie generiert (ein Generator emittiert sie; ein `--check`-Gate schlägt fehl, wenn die übergebene Kopie veraltet ist), statt manuell gepflegt zu werden.
- Das Hinzufügen eines Packages erfordert keine Bearbeitung einer statischen Package-Liste für irgendein Gate.
- Docs beschreiben die Source of Truth, statt generierte Inventare zu wiederholen.
- CI ruft die Aggregat-Befehle auf und lässt diese Befehle ihre Sub-Gate-Listen besitzen.

## Risiken

Entdeckungs-Skripte können zu clever werden. Die Implementierung sollte langweilig bleiben: Manifests lesen, auf explizite Felder filtern, die aufgelöste Liste ausgeben und laut fehlschlagen. Der Ertrag ist die Beseitigung manuellen Inventar-Drifts, nicht das Erfinden eines Build-Systems.

<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
