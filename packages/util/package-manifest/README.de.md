---
description: "Geteilte TypeScript-Deklarationen für package.json.dsh-Metadaten, nutzbar von Boot-, Client-, Build- und externen Paketen."
kind: "package-library"
---

# @deepseek-ai/dsh-package-manifest

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`DshManifest` verwenden, um die Harness-Metadaten eines Pakets zu typisieren, oder einen Member-Typ wie `DshClientManifest` für eine einzelne Deklaration. Boot-, Client-, Build- und externe Pakete importieren dieselben Typen; jeder Leser besitzt JSON-Validierung und Default-Auflösung selbst.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Entwicklerhinweis](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Vom Paketwurzel-Entry importieren. Eine Development-Dependency verwenden, wenn nur die eigene Quelle geprüft wird; eine Production-Dependency, wenn die veröffentlichten Deklarationen diese Typen referenzieren.

```ts
import type { DshClientManifest, DshManifest } from '@deepseek-ai/dsh-package-manifest'

const client: DshClientManifest = { platform: 'web' }
const dsh: DshManifest = {
  bundle: { patch: './cordis.patch.yml' },
  client,
}
```

`DshManifest` beschreibt `bundle`, `profile`, `client`, `configTrees`, `sessionFormatMigration` und `moduleFallback`, nicht das umgebende npm-Manifest. `moduleFallback` ist launcher-generierte Metadaten und kein Autoren-Konfigurationseintrag. TypeScript prüft dieses Objekt und entfernt `import type` beim Kompilieren; JSON-Dateien können keine Typen importieren, und dieses Beispiel schreibt keine `package.json`. Die Deklarationen stehen in [`src/types.ts`](src/types.ts).

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Die Paketwurzel re-exportiert nur Deklarationen aus [`src/types.ts`](src/types.ts). Es wird kein Runtime-Invarianten-Companion veröffentlicht, weil das Paket weder Laufzeitzustand noch unabhängig beobachtbare Beziehungen hat.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

- [Profile-Launcher](../../boot/app-boot/README.de.md#profiles) — Manifest-Laden und -Komposition.
- [Deklarations-Eigentümerschaft](../../../.agents/notes/implemented/architecture/2026-09-05-package-manifest-types.de.md) — Scope- und Dependency-Begründung.

<a id="model-experience"></a>
## Model Experience

Keine, da dieses Paket nur Typen exportiert.

#### KV-Cache-Effekt

Typdeklarationen fügen keinen Model-Input hinzu, sodass die Provider-Cache-Wiederverwendung unberührt bleibt.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- **Nur statische Typisierung.** Diese Deklarationen validieren kein JSON, prüfen keine Dateiexistenz und liefern keine Defaults. `configTrees` bedient den experimentellen Image-Packer, und `sessionFormatMigration` wird nur für Workspace-Migrationspakete entdeckt; sie zu deklarieren registriert kein externes Plugin-Verhalten.

<a id="dev-note"></a>
### Entwicklerhinweis

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
