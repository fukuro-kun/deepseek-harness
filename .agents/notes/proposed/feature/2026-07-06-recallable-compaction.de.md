# Agent Note: Recallable compaction — index checkpoints, a state checkpoint, and in-session history recall
[English](2026-07-06-recallable-compaction.md) | [中文](2026-07-06-recallable-compaction.zh.md) | Deutsch

Status: proposed


## Problem

Kompaktion ist aus dem aktuellen Kontext des Modells heraus irreversibel. Die Zusammenfassung, die das Modell sieht, trägt keinen Verweis auf das, was sie verdeckt — `shadowedRange` lebt nur auf dem nur im Log vorhandenen `compaction/summary`-Event — und kein Tool lässt das Modell einen verdeckten Span zurücklesen. Was der Summarizer weglässt, steht dem Modell nicht zur Verfügung, auch wenn das append-only-Log jedes Byte hält. Wiederholte Kompaktion verschärft das: Der Head-Checkpoint wird jeden Pass umgeschrieben, sodass der Request-Präfix jedes Mal einen vollständigen Prompt-Cache-Miss erleidet, und frühere Zusammenfassungen werden Generation für Generation erneut zusammengefasst.

Die Ursache ist ein einzelnes Artefakt, das zwei widersprüchliche Rollen spielt. Ein **Index** will gefroren, chronologisch und billig sein; das **Arbeitsgedächtnis** des Modells will eine globale Ansicht, Neu-Priorisierung und Veränderbarkeit. Eine einzelne Zusammenfassung kann beides nicht gut.

Kein mainstream-Coding-Harness gibt dem Modell In-Loop-Recall, und keine der untersuchten Implementierungen macht Kompaktion prefix-cache-aware. Eine event-sourced Session — Originale dauerhaft, seq-adressierbar, replay-exakt — ist das natürliche Substrat für beides.

## Proposal

Teile den Checkpoint in zwei Klassen auf und mache verdeckte Historie erreichbar.

### Frozen index checkpoints

Frisch veraltete Historie teilt sich nach deterministischer Policy in Chunks auf: Akkumulieren bis `chunkTokens`, Kanten mit `toolPairingBalancedBefore` / `toolPairingBalancedAfter` einspannen, Turn-Grenzen bevorzugen und die letzte Grenze so nah an die Retain-Grenze wie die Balance erlaubt setzen, sodass das abschließende Slice auf etwa einen Turn schrumpft. Jeder Chunk wird von einem `compactRegion`-Call zu einem **Index-Stub** komprimiert (`stubTokens`, ~100–200 Tokens):

- zwei oder drei Zeilen dazu, was passiert ist;
- eine Keyword-Zeile mit niederfrequenten Literal-Ankern — exakte Fehler-Strings, Werte, Config-Keys — gruppiert nach Art;
- ein code-zusammengesetzter Footer: `[checkpoint c<summarySeq>: shadows conversation span #<start>–#<end>; originals retrievable via history_read]`. Code setzt diese Pointer aus dem `compaction/summary`-seq und `shadowedRange` zusammen; das Modell schreibt sie nie.

Ein committeder Stub wird nie umgeschrieben und nie wieder in eine spätere Kompaktions-Region aufgenommen. Der Input eines Stub-Calls ist geschichtet: der feste Preamble und der byte-identical Pass-Start-State-Checkpoint (der gemeinsame Präfix aller Calls in der Phase), dann die Keyword-Zeilen aller zuvor committeden Stubs — so indexiert ein neuer Eintrag, was für seinen Chunk charakteristisch ist, statt das Verzeichnis zu wiederholen — die ein oder zwei letzten committeden Stubs für chronologische Kontinuität, und das Slice selbst. Schwester-Stubs desselben Passes sind keine Inputs (die koncurrente Phase verbietet es; turn-alignierte Grenzen tragen stattdessen lokale Kontinuität), und der State-Checkpoint ist nur Background, nie Material, das in den Stub zusammengefasst wird. Ein Slice, das nur aus recalledem Inhalt besteht, wird allein durch Code gestubt — eine Pointer-Zeile, kein LLM-Call. Ein fehlgeschlagener Stub-Call degradiert auf die gleiche Weise: Sein Slice bekommt einen code-only-Pointer-Stub und der Pass fährt fort, womit der State-Rewrite die einzige harte LLM-Abhängigkeit in einem Pass ist.

### The state checkpoint

Ein einziges mutables Arbeitsgedächtnis-Dokument (maximal eines; null vor dem ersten Pass), positioniert nach allen Stubs und vor dem behaltenden Tail. Jeder Pass schreibt es aus dem vorherigen Zustand plus dem veralteten Inhalt dieses Passes neu — O(previous + new), unter der merge-don't-restate-Regel, die bereits in der Summarization-Prompt steht — und deckt Entscheidungen, aktuellen Zustand, Constraints und nächste Schritte ab. Es trägt eigenen Footer und eine Size-Cap in der Größenordnung der bestehenden Zusammenfassung.

Ein Inflation-Guard begrenzt den ganzen Pass: Wenn die Post-Kompaktions-Größe nicht strikt unter der Pre-Kompaktions-Größe liegt, committet nichts und der Turn fährt fort; der Versuch verschiebt sich, bis mehr veraltete Historie akkumuliert. Der Guard vergleicht eine Metrik auf beiden Seiten — provider-berichtete Usage aus dem Request-Pfad, mit Fallback auf den Character-Estimator auf beiden Seiten.

### Pass execution

- Chunk-Slices sind Surface-Positions-Ranges. Ein Pass läuft in zwei Phasen: Alle Summarize-Calls führen koncurrent aus, gepuffert außerhalb der Surface; dann committen Regionen strikt von links nach rechts — zuerst Chunks, zuletzt das abschließende Slice — so dass der State-Checkpoint durch kontiguierte Single-Node-Replaces nach jedem Stub landet. Die Wall-Clock-Zeit bleibt nahe bei einem Summarize-Call.
- Der supersedete State-Checkpoint faltet sich als gewöhnliche Historie in den ersten Chunk des nächsten Passes ein: kein Tombstone, kein neues Primitive. Sein Stub lässt ihn aus, `history_read` rendert ihn mit dem Label `[prior state checkpoint]`, und sein Footer reist mit dem gerenderten Text, sodass jedes abschließende Slice über die Two-Hop-Kette erreichbar bleibt.
- Die Range-Auswahl ist frozen-aware: Der komprimierbare Span beginnt nach dem letzten committeden Index-Checkpoint, an der Surface-Head nur, wenn keiner existiert. Der bestehende Head-Checkpoint einer Legacy-Session wird als State-Class adoptiert — sein Text ist die Merge-Basis, sein Node faltet sich wie jeder supersedete State.
- Ein Crash in der Summarize-Phase committet nichts; ein Crash mitten im Commit lässt ein von links nach rechts committedes Präfix zurück, und der fortgesetzte Pass liest seine Merge-Basis aus dem neuesten State-Class-`compaction/summary`-Event des Logs und committet die verbleibenden Regionen bedingungslos — die Wiederherstellung von `[stubs…][state][tail]` hat Vorrang vor dem Schrumpfen.

### The recall tools

Ein neues Paket `@deepseek-ai/dsh-tool-recall` (consumer-only, über den `dsh-session`- und `dsh-compaction`-Vokabularen) registriert zwei model-facing-Tools:

- `history_read(checkpoint, offset?)` — rendert den verdeckten Span jedes Checkpoints im Log, einschließlich supersedeter, als `User:`/`Assistant:`/`Tool result:`-Transcript, paginiert nach konfigurierbarem Budget mit Fortsetzungs-Cursor.
- `history_search(query, checkpoint?, limit?)` — case-insensitiver Literal-Scan über jeden verdeckten Span; liefert Snippets mit Checkpoint-IDs und Coverage-Metadaten (`scanned`/`matched`/`truncated`). Der Zero-Match-Hinweis merkt an, dass der Scan literal ist, und verweist auf direkten `history_read` eines plausiblen Checkpoints.

Beide lesen `exec.agent.session.snapshotEvents()` (das tool-todo-Zugriffs-Muster; non-agent-Caller werden abgelehnt), rendern nur surface-type-Message-Events und geben gewöhnliche `tool/result`s zurück — recallede Bytes landen am Kontext-Tail, geloggt, sodass Rekonstruierbarkeit ohne Sonderbehandlung gilt. Es gibt keine neue Speicherung und keinen Sidecar-Index: Das Session-Log speichert den Inhalt, `compaction/summary.shadowedRange` und `shadowedSeqs` identifizieren, was jeder Checkpoint ersetzt hat, und die Tools lesen beides. Die Tool-Schemas und die eine System-Prompt-Sektion des Pakets sind statische Strings; Checkpoint-IDs erreichen das Modell nur über Footer. Der Transcript-Renderer zieht von `compaction-basic` in `dsh-session` um, geteilt von Summarizer und Tools.

### Cache and cost

Der Request-Präfix nach einem Pass ist `[system][stubs…][state][tail]`. Gefrorene Stubs sind byte-stabil über Pässe hinweg, also beginnt der Miss bei dem Token, das den vorherigen State-Checkpoint ersetzt, und bleibt O(new chunks + state + tail) — statt des Position-Null-Misses der Baseline. Recall-Output landet am Tail und lässt den Präfix unberührt. Der Summarize-Input pro Pass ist etwa das Doppelte des Baseline-Inputs plus ein m·S-Background-Term, begrenzt durch eine `chunkTokens`-Untergrenze (ein kleines Vielfaches der State-Cap) und eine validierte `stubTokens`/`chunkTokens`-Verhältnis-Obergrenze; eine shared-prefix-Input-Layout (Preamble, dann der byte-identical Pass-Start-State, Slice-Inhalt im Tail) lässt Schwester-Calls cached-rate-Rereads erzielen.

### Packaging

Das Design shippt als neuer Backend `dsh-compact-recallable` auf der bestehenden `ctx.compaction`-Seam, standardmäßig aktiviert in den ausgelieferten Beispiel-Configs; `compaction-basic` bleibt als Referenzimplementierung und Design-Twin der Seam, im Muster der gepaarten LLM-Adapter. Die Klausel „at most one auto-generated checkpoint, always at the head“ in der Seam-JSDoc wird gelockert, um beide Backend-Verhalten zu benennen.

### Relation to in-flight work

- **Tool-result pruning** (der in-flight Pruning-Service): Seine Ersetzungs-Node tragen `sourceEventSeqs`; derselbe Registry-Fold listet pruned Results als recallable. Follow-up-Scope; keiner blockiert den anderen.
- **Provider-usage token accounting** (der in-flight Move der Kompaktions-Druck auf provider-berichtete Usage): liefert das Accounting des Guards; die Implementierung stapelt sich dahinter.
- **„Query sessions“ backlog item**: die Cross-Session-Generalisierung; diese Agent Note scopest auf die Live-Session, mit Tool-Namen und Rendering so gewählt, dass die Arbeit erweitert statt kollidiert.
- **Training**: Wann recalled wird, ist ein gelerntes Verhalten. Die deterministischen Footer und Keyword-Anker geben dem Training ein stabiles Ziel, und Recall-Usage ist vollständig im Session-Log für Trajectory-Export sichtbar; Benchmark- und RL-Design verfahren mit der Post-Training-Seite.

### Follow-ups

Aufgeschoben, bis Beobachtung sie verlangt:

- Guard-Degradations-Leiter (code-only-Rollup des ältesten Stub-Präfixes, Footer erhalten, gerollte IDs bleiben Recall-Ziele; dann eine Zusammenfassung nach der gefrorenen Grenze) — bei beobachtetem Guard-Livelock oder Stub-Region-Druck.
- Echo-Erkennung auf Stub-Outputs (Satzen-Skala n-Gramme, kurze Literale befreit, Retry dann Strip) — bei beobachteter Division-of-Labor-Leckage.
- Periodischer State-Refresh aus Chunk-Originalen — bei beobachtetem Drift in der Handoff-Probe.
- `stateFallbackThreshold` (Full-Detail-State-Prompt unterhalb einer Stub-Anzahl) — bei Short-Session-Regression.
- Lazy-Registrierung der Recall-Tools — bei gemessenem Kontext-Steuer in nie-kompaktierenden Sessions.
- Amortisiertes Stub-Drafting am Pre-Step: Sobald veralteter, aber unkompaktierter Inhalt sich über `chunkTokens` akkumuliert, wird der Stub dieses Chunks am nächsten Pre-Step drafted (ein log-only-Draft-Event, geschrieben, solange der umgebende Kontext des Chunks noch live ist), und der Kompaktions-Pass committet Drafts statt in Bulk zusammenzufassen — das deterministische, replay-exakte Äquivalent von Background-Kompaktion (das Claude-Code-Session-Memory-Muster; OpenClaw zeigt, dass die synchrone Semantik identisch ist). Trigger: beobachtete Pass-Latenz oder Stub-Qualitäts-Gewinne aus near-live-Drafting, die sich beweisen.
- Aufgeteilte Summarizer-Modelle; model-choosene Chunk-Grenzen; Cross-Session-Recall; Semantic-Search-Fallback — jeweils hinter eigener Evidenz.
- Reichere `history_search`-Query-Formen — Regex und strukturierte Queries über geloggte JSON-Tool-Resultate (sql/jq-Stil oder agent-authorde Queries gegen einen indizierten Store) — auf Nachfrage aus beobachteten Search-Misses; Literal-Matching shippt zuerst, weil der Recall-Pfad eine reine Funktion des Logs bleibt.

## Alternatives considered

- **Staged delivery** (Recall-Tools allein über dem bestehenden Backend shippen; die Checkpoint-Spalte an beobachteten Recall-Usage koppeln) — abgelehnt: untrainierte Modelle unterbenutzen jedes neue Tool, also würde das Gate Trainingsabwesenheit statt Designwert messen, während die Training-Seite den kompletten Mechanismus braucht, um Umgebungen dagegen aufzubauen; das Pre-Release-Fenster ist, wenn Persisted-Format-Änderungen am günstigsten sind; und die Cache-Ökonomie ist First-Party-Wissen, keine Hypothese, die auf Telemetrie wartet. Der Mechanismus führt die Recall-Tools immer noch vor der Checkpoint-Spalte ein; das ist Konstruktionsreihenfolge, kein Entscheidungs-Gate.
- **Allgefrorene Full-Size-Zusammenfassungen, kein State-Checkpoint** — abgelehnt: unbeschränktes permanent-Präfix-Wachstum, selbstbeschleunigend Richtung Thrashing, ohne etwas, das neu priorisiert werden könnte.
- **Pure Stubs, kein State-Checkpoint** — abgelehnt: geht davon aus, dass das Modell weiß, was ihm fehlt; scheitert an unbekannten Unbekannten.
- **LLM-Aging/-Konsolidierung gefrorener Chunks** — abgelehnt als routinemäßiger Mechanismus: Summary-of-Summary-Verlust und Frozen-Präfix-Churn; der code-only-Rollup ist seine überlebende Form, aufgeschoben.
- **Vollständiger Präfix als Chunk-Summarizer-Input** — abgelehnt: O(N²); das State-Dokument liefert denselben Background mit O(state).
- **Ein Summarize-Call, der alle Outputs emittiert** — abgelehnt: der Summarize-Pfad hat keine Structured-Output-Enforcement; eine Free-Text-Response auseinanderzuparken ist die fragile Grenze, die das fail-closed-Design vermeidet.
- **Model-choosene Chunk-Grenzen** — aufgeschoben: Parse-und-Validate-Kosten gegenüber unbewiesenem Wert; Chunk-Policy sitzt hinter Config.
- **Model-authorde Pointer** — abgelehnt: Pointer müssen exakt sein; deterministische Assembly ist es.
- **FTS/Vektor-Index-Sidecar** — in-Session abgelehnt: das Live-Log ist in Memory und begrenzt, ein Literal-Scan unter Budget genügt; ein Index lohnt sich erst im Cross-Session-Scope.
- **Semantic-Search-Fallback / Sekundärmodell-Extraktion im Recall-Pfad** — abgelehnt: ein LLM- oder Embedding-Call dort bricht den Keyless-Replay-Determinismus; Recall bleibt eine reine Funktion des Logs.
- **Roh-Events statt gerendertem Transcript** — abgelehnt: leakt log-only-Vokabular und Chunk-Rauschen; das Modell liest, was ein Modell einmal sah.
- **Nichts tun (Resume/Fork als Recovery)** — abgelehnt: es macht Recovery zu einer menschlichen Handlung.

## Acceptance criteria

- Auto-Kompaktion über eine lange Session liefert `[stubs…][state][tail]` nach jedem abgeschlossenen Pass; frühere Stubs bleiben byte-identical über Pässe hinweg; committede Stubs fallen nie in eine spätere Region; der supersedete State-Checkpoint faltet sich ohne Tombstone, rendert gelabelt und bleibt über die Two-Hop-Kette erreichbar und durchsuchbar.
- Der Surface-Text jedes Checkpoints endet mit dem deterministischen Footer; Footer round-trippen durch Replay byte-identical; der `shadowedRange` des State-Checkpoints recordet seinen weiteren Input-Range.
- Nichts committet, bevor alle Zusammenfassungen existieren und der Guard bei like-for-like-Accounting passiert; ein Guard-Fehlversuch committet nichts und lässt den Turn nicht fehlschlagen; ein Mid-Commit-Kill, fortgesetzt am nächsten Pre-Step, vervollständigt den Pass mit bedingungslos committeder State-Region, Merge-Basis aus dem Log gelesen; ein Legacy-Head-Checkpoint wird als State-Class adoptiert.
- `history_read` rendert den Span jedes geloggten Checkpoints unter Budget mit funktionierendem Cursor; `history_search` deckt jeden verdeckten Span mit Checkpoint-ID-Snippets und Coverage-Metadaten ab, insbesondere dadurch verifiziert, dass Inhalt gefunden wird, der nur in einem von supersedetem State-Checkpoint verdeckten Span existiert — der Regression-Pin für Trailing-Slice-Erreichbarkeit; beide lehnen non-agent-Caller und nie-existierende IDs oder verwaiste `compaction/start` mit typed Errors ab; recalleder Inhalt erscheint als gewöhnliche `tool/result`s; Request-Rekonstruktions-Invarianten bestehen über Sessions mit Kompaktion plus Recall; ein Keyless-Snapshot-Szenario deckt compact-then-recall Ende-zu-Ende ab; Tool-Schemas und Prompt-Sektion sind byte-identical über Pässe hinweg.
- Auf der Long-Horizon-Bench-Suite: Task-Erfolg regressed nicht gegen `compaction-basic` bei gleichen Budgets; eine Handoff-Fidelity-Probe (K bekannte Entscheidungen und Constraints nach einem Pass neu artikulieren) erreicht keine schlechtere Punktzahl; Recall-Usage-Frequenz und Hit-Nützlichkeit werden pro Run über die dsh-bench-Report-Pipeline gemeldet, zusammen mit der Stub-Verzeichnis-Aufmerksamkeitsmessung und Cache-Hit-Telemetrie.
- Seam-JSDoc, die Compaction-Capability-Seam-Agent-Note, `architecture.md` und die generierten Tool-, Config-, Persistence- und Module-Graph-Kataloge aktualisieren in derselben Änderung; alle Budgets leben in Config; neue Source-Verzeichnisse halten 100% Coverage pro Datei mit HMR-Disposition-Tests.

## Risks

- **Recall ist ein gelerntes Verhalten**: untrainierte Modelle werden es unterbenutzen, und der Bench-Report existiert, um die Lücke zu tracken, während Training sie schließt. Bis dahin hält der State-Checkpoint den Boden bei der bestehenden Zusammenfassungsqualität.
- **Unbekannte Unbekannte bleiben**: ein Detail, das weder in Zusammenfassungen noch in Keywords vorkommt, zieht keinen Recall. Recall wandelt „unerreichbar selbst bei Verdacht“ in „erreichbar bei Verdacht“ um.
- **Das Stub-Verzeichnis beansprucht Aufmerksamkeit**: Dutzende stabiler Index-Karten pro Request können den Fokus verwässern; die Bench-Messung in den Akzeptanzkriterien trackt sie gegen `compaction-basic`.
- **Kosten**: Summarize-Input pro Pass ist etwa das Doppelte des Baseline-Inputs; kurze Sessions liegen nahe an Baseline-Kosten und -qualität, und das Design rechnet sich mit Session-Länge.
- **State-Drift und Division-of-Labor-Leckage** sind über die Handoff-Probe und Stub-Review beobachtbar; ihre Gegenmaßnahmen sind als Follow-ups spezifiziert.
- **Zwei Backends** sind eine Maintenance-Last; der Seam-Vertrag und der geteilte Recall-Consumer begrenzen sie, und der Bench-Vergleich entscheidet langfristig über das Default.
