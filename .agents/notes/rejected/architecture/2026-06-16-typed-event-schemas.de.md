# Agent Note: Runtime-Schemas für das Event-Vokabular (Zod gegen das Merge-Extensible-Map-Muster)
[English](2026-06-16-typed-event-schemas.md) | [中文](2026-06-16-typed-event-schemas.zh.md) | Deutsch

Status: rejected — runtime event-schema registry declined; event maps stay compile-time, Zod validates projection state, migrations validate durable payloads


## Problem

Der Harness modelliert sein Kernvokabular — Content Blocks, Message Sources, Finish Reasons, Turn Trigger, Turn-End Reasons und Session Events — als **merge-extensible Maps**: ein TypeScript-`interface` (z. B. `SessionEventMap`, `ContentBlockMap`), das Plugins per Declaration Merging erweitern, wobei die öffentliche Union als `Map[keyof Map]` abgeleitet wird. Das ist das universelle Erweiterungsmuster des Repos, dokumentiert in [docs/architecture.md](../../../../docs/architecture.de.md) („The same merge-extensible-map pattern is used for `MessageSource`, `FinishReason`, `TurnTrigger`, and `TurnEndReason`"), und sowohl die `defineTool`-`InferArgs`-DSL als auch die `assertNever`-Exhaustiveness-Konvention bauen darauf.

Das Muster ist **nur zur Compile-Zeit wirksam**. Die Typen verschwinden zur Laufzeit: Es gibt kein Schema-Objekt, gegen das ein eingehender Wert validiert, mit dem unvertrauenswürdige Eingabe geparst oder das zur Laufzeit enumeriert werden könnte. Der [Session-Persistence-Vertrag](../../implemented/architecture/2026-06-14-session-persistence.de.md) legt zwei Konsequenzen offen:

1. **Persistence behandelt `event.data` als opakes JSON.** Der JSONL-Provider führt `JSON.stringify` und `JSON.parse` auf jedem Event wortgleich aus; die einzige Runtime-Schranke ist `isJsonValue` (Round-Trip-Serialisierbarkeit — lehnt BigInt, Funktionen, Zyklen, nicht endliche Zahlen usw. ab), nicht strukturelle Validierung. Ein korruptes, aber weiterhin JSON-förmiges Event-Datum (falsche Feldtypen, fehlende Felder) durchläuft den Roundtrip still und wird nur später — wenn überhaupt — vom `switch` eines Consumers gefangen.
2. **Kein Runtime-Vertrag für plugin-hinzugefügte Varianten.** Ein Plugin, das per Declaration Merging einen neuen `SessionEventMap`-Key hinzufügt, erhält Compile-Zeit-Typing für den eigenen Code, doch nichts validiert, dass die erzeugten Werte der deklarierten Form entsprechen — weder beim Produzenten, an der Persistenzgrenze noch beim Reload.

Daraus ergibt sich die Frage, ob das Event-Vokabular auf **Zod** oder eine andere Runtime-Schema-Bibliothek umziehen sollte, damit dauerhafte und Plugin-Grenzen Runtime-Schemata statt erasurefter Typen besitzen.

## Warum dies keine Persistence-Änderung ist

Es liegt nahe, „Zod für die Serialisierung verwenden" als lokale Änderung an `dsh-session-persistence-jsonl/src/format.ts` zu lesen. Das ist es nicht, aus einem strukturellen Grund: **Ein Plugin kann ein Zod-Schema nicht per Declaration Merging erweitern.** Declaration Merging ist ein TypeScript-Compile-Zeit-Mechanismus; ein Zod-Schema ist ein Runtime-Wert. Um Events mit Zod zu validieren, braucht es eine **Runtime-Registry**, zu der jedes event-produzierende Paket sein Schema beiträgt (z. B. `ctx.sessionEvents.register('compaction/marker', z.object({…}))`) und aus der jeder Consumer liest. Diese Registry — nicht das Persistence-Backend — wird zur Source of Truth für das Vokabular und ersetzt das merge-extensible Interface.

Der eigentliche Vorschlag lautet also: **Das Compile-Zeit-Merge-Extensible-Map-Muster repo-weit durch eine Runtime-Schema-Registry ersetzen.** Das ist ein Redesign des Kernvokabulars.

## Blast Radius (gemessen)

Eine Migration der Event-/Vokabular-API auf Runtime-Schemata berührt mindestens:

- **Sechs merge-extensible Maps** (~370 LOC Kern­typen): `ContentBlockMap`, `MessageSourceMap`, `FinishReasonMap` (in `dsh-llm`); `TurnTriggerMap`, `TurnEndReasonMap`, `SessionEventMap` (in `dsh-session`).
- **~10 `declare module`-Augmentationsstellen** in `dsh-agent`, `dsh-agent-loop`, `dsh-shell`, `dsh-llm`, `dsh-session`, `dsh-session-persistence`, `dsh-system-prompt`, `dsh-tools` — jede würde von Declaration Merging auf einen Runtime-`register()`-Aufruf umziehen.
- **Die Event-Produzenten** — 16 `session.append(...)`-Aufrufstellen im Loop — formal unverändert, werden nun aber an der Grenze validiert.
- **~7 Switch-Consumer**, die auf diesen Unionen verzweigen: `deriveMessages` und der paket-eigene Invarianten-Begleiter (`dsh-session`), `BlockAssembler` (`dsh-llm`), beide LLM-Adapter (`dsh-llm-deepseek`, `dsh-llm-pi-ai`) und die Tool-Schema-Schicht (`dsh-tools`). Die `assertNever`-auf-geschlossenen-Unionen-gegen-Fall-Through-auf-erweiterbaren-Unionen-Konvention (eine dokumentierte Lint-Regel) müsste neu gedacht werden — Runtime-Varianten sind statisch nicht erschöpfend.
- **Die `defineTool`-`InferArgs`-DSL** (`dsh-tools`), die cast-freie `execute`-Arg-Typen aus einer Compile-Zeit-Schema-Spezifikation ableitet — das Vorzeigebeispiel des aktuellen Ansatzes.
- **Dokumentation**: architecture.md (das Muster wird als grundlegend beschrieben), [Dev-Mode-Invarianten](../../implemented/architecture/2026-06-11-dev-invariants-over-deep-readonly.de.md) und jede Agent Note, die das Muster referenziert.

Das ist ein repo-weites Vokabular-Redesign, kein Persistence-Implementierungsdetail.

## In Betracht gezogene Alternativen

### A. Status quo — merge-extensible Typen + `isJsonValue` an der Persistenzgrenze
Das Compile-Zeit-Muster beibehalten. Persistence bleibt Opakes-JSON + Serialisierbarkeits-Schranke. Plugins erweitern per Declaration Merging; die Korrektheit der Event-*Form* liegt beim Produzenten und wird von TypeScript zur Compile-Zeit durchgesetzt. Paket-eigene Invarianten-Begleiter prüfen bei Aktivierung ausgewählte record-übergreifende Beziehungen, liefern aber keine allgemeinen Runtime-Form-Schemata.

- **Pro**: kein Churn; Plugin-Erweiterung ist eine einzeilige `interface`-Augmentation mit voller Typinferenz und ohne Runtime-Registrierungszeremonie; keine neue Runtime-Dependency; die `defineTool`-DSL und `assertNever`-Exhaustiveness funktionieren weiter.
- **Contra**: keine strukturelle Runtime-Validierung an der Persistenzgrenze oder an Plugin-Grenzen; ein fehlerhaftes, aber JSON-förmiges Datum wird spät gefangen.

### B. Nur Header-/Closed-Shape-Validierung (schemastery), Events bleiben opak
Nur die tatsächlich geschlossenen Formen verschärfen, die bereits handgeschriebene Type Guards besitzen — etwa den JSONL-`HeaderLine`-Guard (`isHeaderLine`) — mit **schemastery** (der vorhandenen Schema-Bibliothek des Repos, bereits für jedes `static Config` der Plugins im Einsatz). Die merge-extensible Event-Union bleibt unverändert.

- **Pro**: klein, passt zur bestehenden Konvention (schemastery, keine neue Bibliothek); ersetzt handgeschriebene Guards auf geschlossenen Formen durch deklarative Schemata; kein Kern-Redesign.
- **Contra**: adressiert die Event-Data-Validierung nicht; nur die festen Metadaten-Records werden besser.

### C. Runtime-Schema-Registry für das gesamte Vokabular (Zod oder schemastery)
Die merge-extensiblen Maps durch eine Runtime-Registry ersetzen, zu der die Produzenten beitragen und gegen die die Persistence-/Consumer-Pfade validieren.

- **Pro**: echte Runtime-Validierung an der Persistenzgrenze und an Plugin-Grenzen; eine Source of Truth; ermöglicht generische Werkzeuge (automatisch generierte Docs, Fuzzing, Wire-Format-Prüfungen).
- **Contra**: der volle Blast Radius oben; **Zod ist derzeit keine direkte Dependency** (nur transitive Dependency von `@earendil-works/pi-ai`), und die gewählte Schema-Bibliothek des Repos ist **schemastery** — Zod breit einzuführen ist selbst eine Dependency-Entscheidung; die Declaration-Merge-Ergonomie (einzeilige Plugin-Erweiterung, volle Inferenz) wird durch Runtime-Registrierung plus manuellem Type-Wiring ersetzt; die `assertNever`-Exhaustiveness-Garantie schwächt ab (Runtime-Varianten sind statisch nicht erschöpfend).

## Vorschlag

Zurückstellen. Falls Runtime-Validierung an der Persistenzgrenze gewünscht wird, ist **Option B** (schemastery auf geschlossenen Header- und Metadaten-Formen) der verhältnismäßige Schritt innerhalb der bestehenden Konvention. **Option C** ist eine Architekturentscheidung, die ihre eigene Implementierungs-Agent-Note braucht, einschließlich einer Wahl zwischen Zod und schemastery.

## Akzeptanzkriterien

- Option C wird nur über ihre eigene Implementierungs-Agent-Note vorangetrieben, niemals als Persistence-Nebenwirkung.
- Falls Option B aufgegriffen wird, validieren die geschlossenen Header-/Metadaten-Formen (der JSONL-`isHeaderLine`-Guard und Verwandte) über schemastery anstelle handgeschriebener Guards, bei unveränderten merge-extensiblen Maps.

## Risiken

- Die Zurückstellung lässt Event-`data` an der Persistenzgrenze strukturell unvalidiert: Ein fehlerhaftes, aber JSON-förmiges Datum wird spät gefangen, vom `switch` eines Consumers — die Status-quo-Kosten, bewusst akzeptiert.
- Falls Option C je übernommen wird, ist der Ergonomieverlust real: Einzeiliges Declaration Merging wird zu Runtime-Registrierung plus manuellem Type-Wiring, und die statische `assertNever`-Exhaustiveness-Garantie schwächt ab.

## Offene Fragen

- Falls eine Registry übernommen wird, ist die Bibliothek **schemastery** (bereits im Baum, bereits die Config-Schema-Bibliothek) oder **Zod** (reicheres Ökosystem, derzeit nur transitiv)? Zwei Schema-Bibliotheken zu führen ist selbst ein Kostenfaktor.
- Kann ein Hybrid die Compile-Zeit-Inferenz bewahren (sodass `defineTool` und die Plugin-DX überleben) und zugleich ein *optionales* Runtime-Schema pro Variante ergänzen, das nur an der Persistenz-/Wire-Grenze validiert statt bei jedem in-process Append?
- Deckt der `ctx.invariants`-Service bei Aktivierung bereits genug der Runtime-Form-Lücke ab, sodass Grenzvalidierung nur für wirklich unvertrauenswürdige Eingabe nötig ist (Reload eines extern veränderten Logs)?
