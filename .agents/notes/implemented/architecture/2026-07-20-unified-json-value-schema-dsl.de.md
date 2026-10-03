# Agent Note: Unified JSON-Value-Schema-DSL

Status: implemented

[English](2026-07-20-unified-json-value-schema-dsl.md) | [中文](2026-07-20-unified-json-value-schema-dsl.zh.md) | Deutsch

## Problem

Tool-Parameter nutzten eine kleine Author-DSL, während strukturierte Subagent-/Workflow-Outputs ein separates Raw-JSON-Schema-Subset und einen separaten Validator nutzten. Die zwei Vocabularies widersprachen sich bei Roots, skalaren Constraints und Validierung, sodass ein typisierter kanonischer Tool-Output-Contract entweder beide Pfade erneut duplizieren oder Schemas akzeptieren müsste, die eine Projektion nicht erzwingen könnte.

## Entscheidung

`dsh-tools` besitzt ein JSON-Value-Schema-Vocabulary mit zwei Repräsentationen. `ValueSchemaSpec` ist die Author-Form für jede JSON-Root; `ParameterSchemaSpec` ist seine implizite Object-Property-Map-Form mit per-property `required: true`. `JsonSchemaNode` ist die Raw-Wire-Form. Beide unterstützen String, finite Number, Integer, Boolean, Null, Array, Object, typkorrektes skalares `enum`/`const` und Exact-One-`oneOf`; `{ type: 'json' }` ist Author-only-Sugar für einen annotations-only-uneingeschränkten Raw-Node.

Ein explizites Author-Object muss `additionalProperties: true | false` deklarieren. Die implizite Parameter-Root und Raw-JSON-Schema bewahren den standardmäßig offenen Default. Schema-Records enthalten nur eigene enumerable String-Keys, Schema-Arrays sind dense intrinsische Arrays, und unterstützte Keywords werden als eigene Properties gelesen; custom Prototypen, geerbte Constraints, Symbole und JSON-unsichtbare Dekorationen können daher nicht bewirken, dass Compilation, Projektion und Validierung unterschiedliche Deklarationen beobachten. Intrinsische plain-Object- und -Array-Container bleiben über JavaScript-Realms hinweg plain, während Subklassen und gefälschte Constructor-Prototypen exotisch bleiben.

`InferValue<S>` und `InferArgs<P>` leiten TypeScript-Werte aus denselben Deklarationen ab, die `valueSchemaSpecToJsonSchema()` und `parameterSchemaSpecToJsonSchema()` kompilieren. Exakte Inferenz ist auf 16 Container-Ebenen begrenzt und nutzt danach `JsonValue`, was verhindert, dass TypeScripts Type-Instantiation-Stack zum Authoring-Limit wird. `assertSupportedJsonSchema()` lehnt nicht unterstützte oder falsch platzierte Keywords ab, und `validateJsonSchemaValue()` erzwingt das akzeptierte Subset gegen die lossless-`JsonValue`-Grenze: kein `undefined`, keine negative Null, keine nicht-finiten Zahlen, keine Sparse Arrays, keine Zyklen, keine exotischen Objekte, Funktionen, Symbole oder anderen koerziven Werte. Author-Compilation, Raw-Schema-Assertion, Wertvalidierung, Schema-zu-TypeScript-Rendering, Registry-Detachment sowie dynamische Cordis-Cross-Realm-Normalisierung und -Cloning nutzen explizite Work-Stacks, sodass Runtime-Nesting durch verfügbaren Speicher statt durch den JavaScript-Call-Stack begrenzt ist.

Object-Rooting ist eine Consumer-Regel statt einer Vocabulary-Einschränkung. Caller-definierte strukturierte Subagent- und Workflow-Outputs nutzen `assertObjectJsonSchema()` und `ObjectJsonSchema`; Tool-Outputs dürfen jede Root verwenden. Dynamische Cordis-Registrierungen bauen realm-fremde Schemas zu host-eigenem JSON um, bewahren Raw-Wrapper-Offenheit und erfordern Direct-DSL-Object-Offenheit, bevor sie denselben Compiler aufrufen. Die dynamische Grenze lehnt JSON-unsichtbare Record-Keys und exotische Schema-Arrays vor der Normalisierung ab, sodass sie weder ein Constraint still verwerfen noch custom Iterationssemantik konsumieren kann.

## Erwogene Alternativen

- **Separate Parameter- und Structured-Output-Schema-Systeme behalten:** abgelehnt, weil jedes hinzugefügte Output-Konstrukt parallele Inferenz-, Compilation-, Validierungs- und Code-Generierungs-Änderungen ohne nützliche Ownership-Grenze erfordern würde.
- **Schemastery für Tool-Parameter verwenden:** abgelehnt, weil Schemastery Validierung und Transformation über Standard-Schema statt JSON-Schema-Generierung anvisiert. Es würde eine Adapter-Schicht hinzufügen, ohne das model-facing Wire-Schema oder das geteilte Output-Vocabulary zu erzeugen.
- **Volles JSON-Schema oder Ajv übernehmen:** abgelehnt, weil der Harness bei jedem Konstrukt fehlschlagen muss, das er nicht in sein generiertes SDK und seine Validatoren projizieren kann; eine größere Sprache zu akzeptieren würde Erzwingung und Model-Guidance unredlich machen.
- **Jedes Objekt implizit offen oder geschlossen machen:** abgelehnt, weil beide Optionen eine folgenreiche Author-Entscheidung verbergen. Nur die legacy-förmige implizite Parameter-Root und externe Raw-Schemas behalten einen bewussten Default.
- **`oneOf` als First-Match definieren:** abgelehnt, weil Branch-Reihenfolge die Validierungssemantik ändern und überlappende Branches mehrdeutige Werte verbergen lassen würde.

## Konsequenzen

- Parametervalidierung, Output-Validierung, Schema-zu-TypeScript-Generierung, Subagent-/Workflow-Guards und dynamische Registrierung teilen ein erzwungenes Vocabulary.
- Output-Deklarationen können Object-, Array-, skalare oder Null-Roots inferieren; strukturierte Subagent-/Workflow-Outputs bleiben an ihren bestehenden Seams objekt-wurzelig.
- Explizite Objekt-Offenheit und typkorrekte Literal-Constraints lassen malformed Deklarationen beim Authoring oder der Registrierung statt bei einem späteren Model-Call fehlschlagen.
- Begrenzte Typinferenz bewahrt nützliche exakte Typen für gewöhnliche Deklarationen und degradiert ungewöhnlich tiefe Tails zu `JsonValue`; Runtime-Schema-Erzwingung bleibt in jeder Tiefe exakt.
- Raw-Tools können weiterhin breiteres JSON-Schema direkt registrieren, doch unified Code-Generierung behandelt nicht unterstützte Schemas als unknown, statt deren Erzwingung vorzutäuschen.
- Per-Property-`required: true` bleibt der Tool-Author-Contract, und Type-Level-Regression-Abdeckung pinnt Required-Keys als non-optional, nachdem der ursprüngliche Inferenzpfad einen Optionality-Bug aufgedeckt hatte.
- Runtime- und Compile-Time-Tests decken jede Root, Exact-One-Overlap-/No-Match-Verhalten, Raw-Open-Defaults, explizite Offenheit, lossy JSON-Werte, Inferenz, tiefes Nesting über Core- und Dynamic-Projektionen, JSON-unsichtbare Dynamic-Keys und exotische Schema-Arrays ab.
