# Agent Note: Compiler-unabhängiges Typert-Typmodell

Status: implemented

[English](2026-07-27-compiler-independent-typert-model.md) | [中文](2026-07-27-compiler-independent-typert-model.zh.md) | Deutsch

## Problem

Zod- und Reflection-Text direkt aus dem TypeScript-AST zu konstruieren koppelt Typanalyse und die Erkennung fachlicher Semantik an ein einziges Generierungsziel. Ein solcher Generator kann nur beantworten: „Kann diese Syntax generiert werden?" Er kann keine kanonische Repräsentation von Packages, Faces, Public Exports, Services, Events, Objekten und ihren Typbeziehungen liefern, und weder statische Checks noch spätere Generierungsziele können sie wiederverwenden.

Host und Client sind unabhängige TypeScript-Projekte; beide in einem `ts.Program` zu platzieren würde konfligierende Cordis-`Context`- und `Events`-Deklarationen verschmelzen. Gleichzeitig müssen Client-Typen weiterhin explizit auf Host-Typen verweisen, sodass weder vollständige Isolation noch duplizierte Typen auf beiden Seiten die tatsächlichen Abhängigkeiten ausdrücken können.

## Entscheidung

[`dsh-typert-generator`](../../../../packages/typert/generator/README.de.md) baut separate `ts.Program`-Instanzen aus dem Host- und dem Client-Projekt und nutzt Compiler-Nodes, -Symbole und -Checker ausschließlich als Extraktionswerkzeuge. Nach der Analyse konsumieren alle Generatoren und Scanner nur Typerts eigene `WorkspaceModel`-, `FaceModel`- und `TypeGraph`-Objekte; das Modell behält keine AST- oder Checker-Objekte. Der Generator hat keine Dependency auf `@deepseek-ai/dsh-typert-registry`.

TypeGraph bewahrt die vom Entwickler verfasste Typstruktur vor der Auswertung, einschließlich generischer Parameter und Anwendungen, expliziter Vererbung, Conditional- und Mapped-Types, rekursiver Referenzen und JSDoc. Ein erreichbarer Typ, der nicht verlustfrei repräsentiert werden kann, lässt die Analyse fehlschlagen. Kann ein Emitter einen bereits modellierten Node nicht verarbeiten, schlägt dieser Emitter fehl, statt den Typ zu flatten oder auf `unknown` zu degradieren.

Jedes Face besitzt unabhängig ein PackageModel und einen TypeGraph. Direkte Projektreferenzen aus `tsconfig.host.json` und `tsconfig.client.json` bestimmen die Face-Zugehörigkeit eines Packages, während `package.json#exports` seine Public Boundary definiert. Face-übergreifende Beziehungen entstehen nur aus expliziten Imports oder Re-Exports im Source und bleiben separate Links; externe npm-Typen werden als External vermerkt, ohne ihre Deklarationen zu lesen oder zu kopieren.

PackageModel erkennt Cordis-Services, Events, `@typert object`-Referenzobjekte und `@typert schema`-Datenwurzeln. Services und Objekte exposen nur öffentliche Instanz-Member — Konstruktoren sowie static-, private- und protected-Member sind ausgeschlossen; Vererbungskanten bleiben im TypeGraph, statt in geflattete Member kopiert zu werden. Fehlt einer öffentlichen Property, einem Parameter oder einem Return Type die Annotation, meldet der `check`-Modus einen Fehler, während der `write`-Modus das vom Checker inferierte Ergebnis schreibt, das Projekt neu baut und im Strict Mode erneut analysiert.

[`dsh-typert-registry`](../../../../packages/typert/registry/README.de.md) stellt `ctx.typert` bereit und übernimmt ausschließlich die Laufzeit-Registrierung: Ein Contribution trägt atomar die Package-Face-Reflection und ein optionales Zod-Schema, und das Cordis-Effect-Disposal widerruft sie. Die Registry analysiert weder TypeScript noch merged sie die beiden Faces. JSON Schema ist eine On-Demand-Projektion registrierter Zod-Schemas.

Die Publikation von Package-Artefakten bleibt ein explizites Opt-in über Package-Exports. Aufgerufen validiert `WorkspaceTypertGenerator`, dass jedes angeforderte Host-Face den nutzerseitigen Subpath `package/typert` aus dem Root-Artefakt `package/lib/typert.host.{js,d.ts}` exponiert bzw. dass jedes angeforderte Client-Face `package/client/typert` aus `package/lib/typert.client.{js,d.ts}` exponiert; diese Exports werden niemals editiert. Das spätere [Typert-Remote-Design](2026-08-02-typert-remote-method-calls.md) ergänzt einen Workspace-weiten Host-Contract-Pass für Root-Build, Typecheck, Lint und Documentation-Typecheck. Für opt-in Host-Packages emittiert dieser Pass sowohl lokale Reflection als auch strikte Host-for-Client-`/remote`-Contracts, bevor Consumer sie auflösen. Generierte lokale Deklarationen halten `TYPERT` als `unknown` typisiert, sodass Business-Packages nicht von der Registry abhängen.

Zur Build-Zeit konsumiert `CordisCatalogProjector` das analysierte `FaceModel` und den `TypeGraph` einmalig, um `docs/cordis-catalog/events.md`, `docs/cordis-catalog/services.md` und den statischen `SERVICE_API`-, `EVENT_API`- und `TYPE_API`-Katalog zu generieren, der für `tool-cordis` committed wird. `tool-cordis` liest diesen statischen Katalog und hat keine Runtime-Dependency auf `ctx.typert`. [`dsh-typert-loader`](../../../../packages/typert/loader/README.de.md) und die Registry bleiben ein unabhängiger Runtime-Pfad: Der Loader folgt den Entry-Lifecycle-Events des Cordis Loaders, importiert ein explizit publiziertes `./typert`-Host-Artefakt und registriert es über `ctx.typert`; keine der beiden Komponenten liefert den aktuellen `cordis_inspect`-Katalog.

## Verifikationsvertrag

Ein kleines Two-Face-Projekt im Repository snapshotet das vollständige Typmodell einschließlich seines Source-Declaration-Index. Gebatchte Workspace-Analyse und direkte fokussierte Analyse müssen für dieselben Faces modell-äquivalente `FaceModel`- und `TypeGraph`-Ergebnisse liefern. Compile-Zeit-Exhaustive-Maps und Runtime-Set-Vergleiche stellen sicher, dass jeder Node-, Target-, Declaration- und Member-Diskriminant durch Source-autorierte TypeScript-Syntax ausgeübt wird; eine Feldsemantik-Matrix deckt jedes Keyword, jeden Typ-Operator und jede Literalwert-Kategorie ab sowie jeden Zustand von Generics, Parametern, Tuples, Mapped-Modifiers, Import-Attributen, abstrakten Formen, Predicates und Enum-Initializern.

Für jede Property in `SyntaxZoo` normalisiert der TypeScript-Printer den Source-Typ, der exakt mit dem TypeGraph-Rendering übereinstimmen muss; TypeScript rekompiliert anschließend jede gerenderte Deklaration. Diese Schicht prüft, dass die internen Informationen jedes Nodes verlustfrei erhalten bleiben — einschließlich No-Substitution-Template-Literals, Type-Queries mit Type-Arguments und constrained `infer` — ohne Diskriminanten- oder Code-Coverage mit struktureller Äquivalenz zu verwechseln.

Boundary-Fälle pinnen explizite Package-Imports innerhalb und über Faces hinweg, Face-übergreifende Named Re-Exports, exakte Export-Aliase, qualifizierte `import()`-Links und die External-Klassifikation globaler `@types`-Deklarationen; sie lehnen TypeScript-Diagnosen aus Package-eigenen Dateien, Relative-Path-Boundary-Crossings, Referenzen außerhalb von `package.json#exports` und Face-übergreifende Namespace-Re-Exports ohne Modell-Target ab. Interface Declaration Merging bewahrt explizit jeden autorierten Teil; andere Merges, die nicht verlustfrei repräsentierbar sind, schlagen fehl.

Für jede unterstützte Node-Art und Literal-Kategorie führen Zod-Emitter-Tests sowohl erfolgreiche als auch scheiternde Parses aus; für jede nicht unterstützte Art assertieren sie einen expliziten `TypertEmitError`. Emitter-Fixtures snapshoten generierten Zod-JavaScript- und `.d.ts`-Text, führen das JavaScript aus und typechecken die Deklarationen. `dsh-typert-registry`-Tests pinnen atomare Registrierung, Queries, JSON Schema und Effect-Disposal; `dsh-typert-loader`-Tests beweisen zusätzlich verzögertes Mounting, Unloading und Disposal, während ein Dynamic Import noch pending ist. Ein echter `dsh-tools`-Vertical-Slice generiert einen Contribution aus dem Modell, lädt ihn über die Runtime-Registry und vergleicht seine Service-, Event- und Related-Type-Records mit dem committed statischen `SERVICE_API`-, `EVENT_API`- und `TYPE_API`-Katalog. Ein Full-Workspace-Projector-Test regeneriert die beiden Cordis-Katalog-Dokumente und den `tool-cordis`-API-Katalog und verlangt, dass alle drei Texte Byte für Byte mit den committed Artefakten identisch sind.

## Erwogene Alternativen

**Das TypeScript-AST direkt behalten.** Das AST bewahrt Source-Syntax, würde aber jeden Consumer vom Compiler-Lifecycle, der Node-Identität und dem Checker-Kontext abhängig machen und damit eine stabile Architekturgrenze verhindern. Es wird daher nur während der Extraktion genutzt.

**Finale Typen aus dem Checker generieren.** Ein geflatteter `ts.Type` lässt sich direkt gut traversieren, verliert aber den Ausdruck des Entwicklers für Generics, Conditional- und Mapped-Types sowie Alias-Anwendungen und kann daher weder Reflection noch spätere Generierungsbedarfe tragen.

**Die Host-/Client-Projekte mergen oder Host-Typen duplizieren.** Ein Merge würde das Cordis Declaration Merging kontaminieren; Duplikation würde eine zweite Source of Truth für Typen schaffen. Unabhängige Faces mit expliziten Cross-Face-Links bewahren Projektisolation und die tatsächlichen Referenzbeziehungen.

**`dsh-typert-registry` für Typauflösung und Package-übergreifende Komposition verantwortlich machen.** Das würde TypeScript-Compiler, Cordis-Lifecycle und eine spezifische Schema-Policy erneut koppeln. Die Registry bleibt ein Lifecycle-Container für generierte Artefakte, während das Build-Zeit-Modell die komplexe Analyse behält.

## Konsequenzen

Neue Generierungsziele und statische Checks können denselben TypeGraph wiederverwenden, und Business-Kategorien können PackageModel erweitern, ohne das AST erneut zu parsen. Das Bewahren von Pre-Evaluation-Typen und unabhängigen Faces macht das Modell komplexer als ein geflattetes Schema; Emitter müssen ihren unterstützten Umfang explizit deklarieren und bei fehlenden Capabilities fehlschlagen.

Das explizite Package-Opt-in hält Artefakt-Publikation und Exports unter Package-Ownership. Die Repository-Orchestrierung darf den Workspace-weiten Host-Contract-Pass weiterhin für jedes opted-in Package laufen lassen; dieser Pass bleibt im Besitz der späteren Remote-Gateway-Agent-Note. Die statischen Cordis-Kataloge bleiben aus dem kanonischen Modell reproduzierbar, ohne `tool-cordis` an Runtime-Registry-State zu koppeln. `ctx.typert` reflektiert nur in der aktuellen Runtime gemountete Artefakte, und Unloading kontrolliert keine Zod-Instanzen, die Consumer nach direktem Import weiterhin halten.
