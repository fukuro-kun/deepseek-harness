---
description: "Der Build-Time-Typert-Generator: Source-Type-Analyse, compiler-unabhängige Modelle und Artefakt-Emission für Maintainer, die Typert-Publikation verdrahten oder generierte Artefakte konsumieren."
kind: "package-library"
---

# @deepseek-ai/dsh-typert-generator
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`dsh-typert-generator` lässt Maintainer öffentliche TypeScript-Typen in Build-Artefakte und compiler-unabhängige Modelle überführen. Pakete steigen über die `./typert`- und optionalen `./client/typert`-Exports ein, und die Generierung lehnt Deklarationen, Publish-Listen, Remote-Exports oder Zod-Projections ab, die sie nicht korrekt repräsentieren kann. Repository-Builds können ausführbare Schemas und passende Deklarationen emittieren, während Tools `WorkspaceAnalyzer` für Inspektion oder Katalog-Generierung aufrufen können, ohne Artefakte zu publizieren. Die Generierung läuft nur zur Build-Zeit und niemals in einer Live-agent-Session.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Modell-Erfahrung](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev-Notiz](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Dieses Paket richtet sich an Paket- und Repository-Maintainer, die Typert-Generierung in einen Build einhängen oder generierte Artefakte konsumieren. Publikation ist Opt-in: deklariere die Export-Einträge, führe den Build aus, und die Artefakte erscheinen in `lib/`; statische Analyse braucht kein Artefakt.

### Typert-Artefakte aus einem Paket publizieren

Ein beitragendes Paket deklariert den Host-Face-Artefakt-Export in der `package.json`; Pakete, die beide Faces beitragen, deklarieren zusätzlich `./client/typert`, und Pakete mit Remote-Methoden deklarieren `./remote`:

```yaml
exports:
  "./typert":
    types: "./lib/typert.host.d.ts"
    default: "./lib/typert.host.js"
files:
  - "lib/typert.host.js"
  - "lib/typert.host.d.ts"
```

Nach dem Build existieren `lib/typert.host.js` und `lib/typert.host.d.ts`, und der [Loader](../loader/README.de.md) registriert den Beitrag in Loader-Kompositionen. Die generierte Deklarationsdatei exponiert `TYPERT` als `unknown`, sodass beitragende Pakete niemals von der Runtime-Registry abhängen. Der Generator lässt den Build fehlschlagen, wenn eine Deklaration fehlt, auf die falsche Datei zeigt oder Remote-Artefakte ohne Remote-Methoden publiziert; nicht unterstützte Zod-Projections schlagen mit einem `TypertEmitError` fehl, der das Konstrukt benennt, statt den Source-Typ zu flatten oder abzuschwächen.

### Einen Workspace statisch analysieren

Statische Consumer rufen `WorkspaceAnalyzer` direkt gegen die `tsconfig.host.json`- und `tsconfig.client.json`-Aggregate des Workspace auf, wählen ein Face und eine Paket-Untermenge und lesen das resultierende `FaceModel` und den Type-Graph, ohne Runtime-Artefakte zu emittieren oder zu laden. `analyzeInBatches()` verarbeitet eine große Paketauswahl über begrenzte Compiler-Programme mit derselben Model-Form, und `discoverPackages()` findet beitragende Pakete, ohne ein Type-Checker-Programm zu bauen.

### Generierung innerhalb eines tsdown-Builds laufen lassen

Der `./tsdown`-Subpath des Pakets stellt `typertPlugin()` für die Root-tsdown-Config bereit: Es senkt Standard-Dekoratoren in TypeScript-Dependencies vor dem Bundling ab und emittiert die model-getriebenen Face-Artefakte an der Paket-Ausgabe-Root. Im `package`-Modus emittiert es nur das gebündelte Paket; im `workspace`-Modus emittiert es jeden expliziten Contributor einmal.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen</summary>

Dieser Abschnitt erklärt, wie der Generator zu einem compiler-unabhängigen Modell kommt und was er emittiert; das beobachtbare Build-Verhalten ist in [Dieses Paket verwenden](#use-this-package) abgedeckt.

### Designkonzept

Der Generator baut auf einer Trennung auf: Extraktion und Emission sind über das compiler-unabhängige Modell entkoppelt. `WorkspaceAnalyzer` liest TypeScript-Programme, die aus den Face-Aggregat-tsconfigs geseedet sind, und produziert `FaceModel`- und `TypeGraph`-Daten; `FaceModelEmitter` konsumiert nur dieses Modell und erhält niemals Compiler-Knoten. Das Modell bewahrt Deklarationsidentität, generische Parameter und Applikationen, explizite Vererbung, Conditional- und Mapped-Types, Import-Attribute, Abstract-Modifier und Source-JSDoc, und schließt Konstruktoren, statische Member und nicht-öffentliche Member aus.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Öffentliche API: Analyzer, Emitter, Workspace-Generator, Renderer, Katalog-Projection |
| [`src/analyzer.ts`](src/analyzer.ts) | `WorkspaceAnalyzer`: Face-Programme, Check-/Write-Modi, Batching, Discovery, Source-Index |
| [`src/model.ts`](src/model.ts) | Compiler-unabhängige Modelltypen |
| [`src/emitter.ts`](src/emitter.ts) | `FaceModelEmitter`: Zod-Schema- und Deklarations-Emission, Remote-Deklarationen |
| [`src/workspace.ts`](src/workspace.ts) | `WorkspaceTypertGenerator`: Discovery, Generierung, Export- und Files-Validierung |
| [`src/tsdown-plugin.ts`](src/tsdown-plugin.ts) | tsdown-Plugin-Face: Decorator-Lowering und Artefakt-Emission |
| [`src/cordis-catalog.ts`](src/cordis-catalog.ts) | Katalog-Projection, die die generierten Cordis-Kataloge verwenden |

### Analyse und Faces

Host und Client sind unabhängige TypeScript-Programme. Direkte Projekt-Referenzen stellen die Compiler-Face-Zugehörigkeit her, während `dsh.client`-Paket-Subpaths den Runtime-Face-Beitrag herstellen; `package.json#exports` markiert jede paketübergreifende öffentliche Grenze, und Imports oder Re-Exports sind die einzigen Face-übergreifenden Kanten. Ein relativer Import, der innerhalb des referenzierenden Pakets auflöst, wird über die Re-Exports dieses Moduls weiterverfolgt, bis ein Paket-Spezifizierer auftaucht, sodass paketlokale Forwarding-Module ihre ursprünglichen Deklarationsreferenzen behalten; ein relativer Import, der in ein anderes Paket auflöst, schlägt fehl. Der `check`-Modus schlägt bei syntaktischen oder semantischen Diagnosen, fehlenden public Annotationen, privaten paketübergreifenden Referenzen und erreichbaren Declaration-Merges fehl, die das Modell nicht verlustfrei bewahren kann; der `write`-Modus fügt checker-abgeleitete Annotationen ein und liefert ein sauberes Check-Modus-Modell. Typen im Besitz von NPM-Dependencies bleiben `external`-Referenzen, statt expandiert zu werden.

### Emissions- und Publikationsvertrag

`FaceModelEmitter` emittiert ausführbares JavaScript mit den unterstützten Zod-Schemas und dem `TYPERT`-Beitrag, plus eine Deklarationsdatei, deren Schemas über den öffentlichen Export des Pakets als `z.ZodType<SourceType>` typisiert sind; nicht unterstützte Zod-Projections schlagen fehl. Das Host-Face mit Remote-Methoden emittiert zusätzlich `typert.remote-client.*`-Projections der Host-Remote-Verträge für den Client. `WorkspaceTypertGenerator` validiert die `package.json` jedes Contributors: `./typert` und `./client/typert` (und `./remote`, wenn Remote-Methoden existieren) müssen auf die exakten generierten Dateien zeigen, und die `files`-Liste muss sie enthalten.

### Katalog-Projection

Der Root-Export umfasst die model-getriebene Extraktion, Vollständigkeits-Checks und deterministische Text-Renderer, die die Cordis-Kataloge dieses Repositorys verwenden. Sie akzeptieren eine `CordisCatalogPolicy`; repository-eigene Type-Links, Foundation- und Exemption-Klassifizierungen sowie geerbte Cordis-Einträge bleiben in `scripts/gen-cordis-catalog.ts` und werden explizit übergeben, sodass dieses Paket Projection-Mechanik enthält, keine versteckte Kopie der Dokumentations-Taxonomie des Repositorys.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der paketweite Vertrag nicht ausreicht; sie führen vom generierten Modell zur Runtime und zum Remote-Call-Pfad.

- [Typert-Subsystem-Referenz](../../../docs/subsystems/typert.de.md) — die Remote-Verträge und Registry-Interfaces, die der Generator modelliert.
- [Typert-Protokoll](../protocol/README.de.md) — die Deklarationen, die generierte Artefakte erweitern und konsumieren.
- [Typert-Registry](../registry/README.de.md) — der Runtime-Store, den die emittierten Artefakte füttern.
- [API-Gateway-Referenz](../../../docs/api-gateway.de.md) — wie generierte Remote-Deskriptoren End-to-End aufgerufen werden.
- [Agent Note zum compiler-unabhängigen Modell](../../../.agents/notes/implemented/architecture/2026-07-27-compiler-independent-typert-model.de.md) — das Modell-Design, Alternativen und Konsequenzen.

-----

<a id="model-experience"></a>
## Modell-Erfahrung

Keine, da der Build-Time-Generator außerhalb jeder agent Runtime läuft und keinen Model-Request berührt.

#### KV-Cache-Effekt

Kein direkter Effekt; generierte Artefakte erreichen einen Request nur, wenn ein Consumer sie dort platziert.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, was der Generator nicht modellieren oder emittieren kann; sie sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Package-Export-Patterns werden übersprungen** — beitragende Pakete brauchen konkrete Export-Ziele; Wildcard-Export-Patterns werden nicht analysiert.
- **Namespace-Re-Exports über Faces hinweg schlagen fehl** — Named- und Star-Re-Exports erzeugen Links, aber ein Namespace-Re-Export kann nicht repräsentiert werden, bis `TypeTargetModel` einen Modul-Namespace modellieren kann, ohne ihn zu flatten.
- **Der Zod-Emitter unterstützt eine bewusste Teilmenge** — generische Schema-Deklarationen und berechnete Konstrukte wie Conditional- oder Mapped-Schema-Roots schlagen fehl, bis eine konkrete Schema-Factory-Policy existiert.
- **Keine generierten Schema-Imports über Faces hinweg** — Face-übergreifende Links werden für die Analyse repräsentiert, aber kein generiertes Schema benötigt einen Runtime-Cross-Face-Zod-Import.
- **Discovery deckt nur konkrete öffentliche Exports ab** — Deklarationen, die weder exportiert noch vom erreichbaren Graphen importiert werden, liegen absichtlich außerhalb des Paketmodells.

<a id="dev-note"></a>
### Dev-Notiz

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen</summary>

Keine.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Dieser Source-Projekt-Analyzer und Build-Time-Emitter läuft außerhalb jeder Cordis-Runtime; Modell-Snapshots, ausführbare Artefakte und Typechecks konsumierender Pakete erzwingen seinen Output-Vertrag.
