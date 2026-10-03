# Agent Note: die end-seed-log-Grenze
[English](2026-07-30-session-end-seed-log-boundary.md) | [中文](2026-07-30-session-end-seed-log-boundary.zh.md) | Deutsch

Status: implemented


## Problem

Ein plugin, das eine eigenständige open/close-Klammer im session log besitzt, kann einen toten marker nicht von einem lebenden unterscheiden. `compaction/start` … `compaction/end` ist der ausgelieferte Fall: bei Aufnahme eines logs, dessen letztes compaction-event ein ungematchter `compaction/start` ist, sind "der vorherige writer starb mitten in der compaction" und "eine compaction läuft gerade" byteweise identische gespeicherte Historie. Der owner muss entweder das Compacten eines tatsächlich freien logs verweigern (was die session blockiert) oder über eines fortfahren, das wirklich beschäftigt ist.

Nichts im log markierte, wo geerbte Historie endete. `session/created`, `session/disposed` und `session/flush` sind cordis-runtime-Signale, keine log-events; `agent/session-start` ist emit-only. `Session.firstLiveSeq` hielt die Antwort bereits exakt — der seq des ersten eigenen writes dieses lifecycles — aber nur im Speicher, sodass ein consumer, der gespeicherte bytes liest, es nicht sehen konnte.

Crash-repair schließt die Lücke nicht und darf es nicht: `interruptedTurnClosers` synthetisiert turn-, step- und tool-Grenzen, weil core dieses Vokabular besitzt, und `compaction/*` gehört zur compaction-seam. Ein core-repair-pass, der plugin-Klammern schlösse, würde die Klammersemantik jedes plugins in core legen.

## Entscheidung

Der Konstruktor von `Session` hängt das log-only `session/end-seed`-event unmittelbar nach einem explizit gelieferten Konstruktor-seed an, einschließlich eines leeren, als ersten live write der geseedeten session am seq, den `firstLiveSeq` benennt. Das event ist die durable Projektion dieses Felds: `firstLiveSeq` beantwortet einem consumer, der das Objekt hält, wo die writes dieses lifecycles beginnen, während `session/end-seed` dieselbe Frage für einen beantwortet, der nur gespeicherte bytes hält. Seine payload ist leer — Position und `time` tragen die gesamte Bedeutung — und es ist kein `SurfaceEventType`, also erzeugt es keine message und kann abgeleitete Historie nicht stören. Der seq-0-marker unterscheidet eine leere resumed session von einer echt frischen session und verhindert, dass new-session-defaults während resume angewendet werden.

Ein Klammer-owner liest es positional: ein ungematchter öffnender marker vor `session/end-seed` hat einen kleineren seq, kam aus dem Konstruktor-seed und gehört einem beendeten lifecycle. Core schreibt die Grenze und liest nichts aus ihr; das Vokabular jeder Klammer bleibt bei seinem besitzenden plugin, sodass kein core-prädikat-helper ohne einen consumer ausgeliefert wird, der ihn formt.

Der Konstruktor ist die Platzierung, weil er die einzige waist ist, durch die jede geseedete session geht. Alle sechs Einstiegspunkte erreichen ihn: `agents.resume()`, config-gesteuertes startup auf einer persistierten id (`restoreOrCreateConfigured`), `sessions.fork()`, ein subagent-fork-child, der live-prefix-Pfad von `coordinator.adopt()` und ein bloßes `sessions.create(id, {seed})`. Eine beim persistence-load geschriebene Grenze würde beide fork-Pfade verfehlen — und ein fork-child, das einen offenen `compaction/start` eines noch laufenden Elternteils erbt, ist genau der Fall, der klassifizierbar sein muss. Eine beim loop-start geschriebene Grenze würde `fork()` und `adopt()` verfehlen und müsste auf `SessionStartSource: 'startup'` feuern, was ein fork-child publiziert, sodass dieses Feld aufhören würde zu diskriminieren.

Zwei guards halten den marker präzise. Ein ausgelassener seed schreibt nichts, weil die session frisch ist. Ein seed, der bereits mit einem endet, wird nicht erneut markiert, was den write idempotent macht. Idempotenz ist tragend statt bloßer Ordentlichkeit: jede Agent-gebundene Aufnahme einer kalten session läuft durch `agentFor()`, und ohne den guard würden wiederholte controls das log wachsen lassen, selbst wenn sie keine Arbeit verrichten. Die nur-inspizierenden `session.history`- und `session.fork`-source-Pfade erzeugen diese Grenze in der Quelle nicht.

## Persistence braucht keine Änderungen

Der Konstruktor-append passiert vor `enter()`, sodass die session keine store-Attachment hat: der marker publiziert nie auf `session/event`, genau wie die seed-events davor. Er ist stattdessen Teil des logs, den `initFor` als creation-seed erfasst, und persistiert über den gewöhnlichen seed-Pfad — `onCreated`s `createCore` + `appendCore` oder den ownerless-claim-suffix-write. Ein consumer, der den firehose beobachtet, sieht die Grenze daher nie und muss sie aus dem log lesen.

Konsequenzen für die seam: `load()` bleibt ein reiner read, ohne revision-bump, ohne `commitRepair` auf einem balancierten log und ohne durable mark, das ein abgelehnter `append` hinterlässt. **Attaching ist jedoch kein reiner read** — eine Aufnahme schreibt jetzt, wo vorher nichts geschrieben wurde, sodass eine read-only- oder volle Platte bei `session/created` statt beim ersten echten turn fehlschlägt. Das ist die eine Kostenstelle, die diese Platzierung hinzufügt, und sie ist enger als die der load-path-Version (die den load selbst scheitern ließ).

Ein crash, bevor der seed-write die Platte erreicht, verliert die Grenze, und das kostet nichts: der pending batch wird in Reihenfolge geschrieben, sodass eine verlorene Grenze bedeutet, dass jedes event danach ebenfalls verloren ist. Die nächste Aufnahme liest dieselben bytes wie die vorherige, hängt ihre eigene Grenze an und klassifiziert die Klammer identisch. In-process-consumer sollten `firstLiveSeq` bevorzugen, das vor jedem write exakt ist.

## Umfang der Garantie

Das Prädikat gilt für eine Klammer, die *diese* session geerbt hat, nicht als liveness-Signal über andere writer. Eine gleichzeitig lebende session kann eine offene Klammer über derselben gespeicherten Historie halten, während ihre eigene Grenze anderswo sitzt. Ein consumer, der nebenläufige writer tolerieren muss, braucht ein liveness-Signal jenseits des logs und kann es auf der Stärke dieses events nicht auslassen.

## In Betracht gezogene Alternativen

**Eine Grenze, geschrieben vom cold-load-Pfad des persistence-coordinators.** Eine frühere Iteration schrieb eine `session/resumed`-Grenze; sie verlor, weil sie keinen fork abdeckt — der eine Fall, in dem der owner der geerbten Klammer noch laufen kann — und weil ein beim load geprägter marker ein durable write auf einem read-Pfad sein musste, was Kosten über die seam verteilte: ein revision-bump bei jedem cold load, ein `commitRepair`-batch auf einem balancierten log ohne zu reparierendes, ein stored-time-floor, um den clamp monoton zu halten, und ein load, der gegen einen read-only-store scheiterte.

**Eine Grenze, beim loop-start angehängt.** Der loop ruft `resumeWith`, deckt also die resume-Pfade ab, verfehlt aber `fork()` und `adopt()` vollständig, und das event müsste auf `'startup'` feuern — die source, die ein fork-child publiziert — sodass `SessionStartSource` aufhören würde zu diskriminieren. Es publiziert die session auch, bevor der marker angehängt ist, sodass ein `session/created`-listener ein geseedetes log ohne Grenze beobachten könnte.

**Wiederverwendung von `Session.inheritedEventCount`.** Es ist der durable *fork-lineage*-Schnitt und behält bewusst den ursprünglichen fork-Wert über ein resume hinweg, bei dem der Konstruktor-seed das gesamte gespeicherte log ist. Die beiden facts unterscheiden sich, und ihre Vermengung würde beide verlieren.

**Crash-repair, das `compaction/*` neben turn-Grenzen schließt.** Abgelehnt: es verlagert die Klammersemantik jedes plugins in den repair-pass von core, und core kann nicht wissen, was das Schließen einer Klammer eines anderen Pakets aufzeichnen sollte.

## Konsequenzen

Gekauft: eine Grenze, an einer Stelle geschrieben, korrekt für alle sechs seeded-start-Pfade — einschließlich der fork-Lücke, die die persistence-layer-Version nicht erreichen konnte. Die persistence-Pakete behalten einen reinen read-Pfad. `firstLiveSeq` erhält einen durable Zwilling statt einer zweiten, konkurrierenden Vorstellung derselben Grenze.

Kosten: das log einer geseedeten session ist um ein event länger, einschließlich eines leeren resumed logs. Seq-Erwartungen bewegen sich mit dieser Grenze. Zwei Aktualisierungen sind tragend statt mechanisch: telemetrys adoptions-Tests assertieren, dass die Erfassung mit der neu angehängten Grenze des aktuellen lifecycles beginnt und den Konstruktor-seed ausschließt, und die replay-invariant der property-suite lautet "seed wortgetreu reproduziert plus eine log-only-Grenze", mit Idempotenz als eigener Eigenschaft.

`session/end-seed` tritt dem on-disk-Vokabular bei. Das aktuelle Format verlangt die validierte marker-Semantik, die Session besitzt; der eingefrorene v0-codec und die migration-edge besitzen, welche historischen v0-seed-Layouts zulässig bleiben. Der exakte geerbte Schnitt bleibt vom logischen header getrennt und ist nach einem body-read verfügbar.

Die [queued-manual-compaction-Entscheidung](../feature/2026-07-30-queued-manual-compaction.de.md) liefert nun den ersten consumer. Ihr tail-scan findet unabhängig den ungematchten `compaction/start` und den neuesten end-seed, behandelt nur einen start nach dieser Grenze als live und räumt die invariant-spur beim selben replay-Übergang auf. Das Prädikat bleibt im compaction-Paket, statt ein generischer core-helper zu werden.
