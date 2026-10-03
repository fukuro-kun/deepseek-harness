# Agent Note: Kompaktierung als Capability Seam (abstrakter Vertrag + Basis-Backend)

Status: implemented

[English](2026-06-18-compaction-capability-seam.md) | [中文](2026-06-18-compaction-capability-seam.zh.md) | Deutsch

## Problem

Eine langlaufende Agent-Konversation wächst unbegrenzt. Während das Ereignisprotokoll Turns ansammelt, nähert sich die abgeleitete Nachrichtenhistorie irgendwann dem Kontextfenster des Modells — das Modell bricht dann mitten in der Antwort ab (`max-tokens`) oder degradiert. **Kompaktierung** ist die Gegenmaßnahme: Eine Folge älterer Historie wird durch eine knappe Zusammenfassung ersetzt, während der jüngste Kontext intakt bleibt.

Die [Session-Surface](../architecture/2026-06-18-session-surface.md) wurde genau dafür als Fundament gebaut — eine geordnete Projektion über dem Ereignisprotokoll mit einer eigens dafür entworfenen `surfaceOp: { op: 'replace', startSeq, endSeq }`-Operation, die einen Eintragsbereich abschattet und einen Ersatz einfügt, wobei `sourceEventSeqs` jedes Quellereignis auflistet, damit das Replay prüfen kann, dass der Ersatz jedes Ereignis zitiert, das er entfernt. Was fehlte, war das Plugin, das *entscheidet, was kompaktiert wird, und die Zusammenfassung erzeugt*.

Zwei Kräfte prägen das Design. Erstens variieren Kompaktierungsstrategie und wiederverwendbare Token-Messung unabhängig voneinander: Die Messung gehört dem [`ctx.tokenMeter`-Dienst](../../archived/architecture/2026-07-15-replay-token-meter-service.md) der LLM-Familie, während die Zusammenfassung ein Modellaufruf, ein Template oder ein Remote-Dienst sein kann. Zweitens ist `SurfaceEventType` auf die nachrichtenerzeugenden Ereignistypen geschlossen (`user/message`, `assistant/message`, `tool/result`); nur diese dürfen `surfaceOp` tragen. Ein spezielles `compaction/*`-Ereignis kann daher **nicht** selbst auf der Surface erscheinen — der Compiler und die stets aktive Append/Seed-Grenze der Session lehnen `surfaceOp` darauf ab.

## Entscheidung

### Kompaktierung ist ein Capability Seam mit getrennten Service-Definition- und Service-Provider-Rollen

Gemäß dem [Capability-Seams-Agent-Note](../architecture/2026-06-13-capability-seams.md) wird die Kompaktierung als getrennte Pakete ausgeliefert, damit Vertrag, Algorithmus und (später) die Consumer-API unabhängig voneinander weiterentwickelt werden können:

1. **Schnittstelle** — `@deepseek-ai/dsh-compaction`: eine abstrakte `CompactionEngine`, die den `ctx.compaction`-Schlüssel, das `CompactionResult`-Vokabular, die `compaction/*`-Session-Ereignisse, die Taxonomie manueller Fehler und die kanonische Checkpoint-Nachrichtenquelle besitzt. Sie deklariert `compactIfNeeded()`, `compactNow()` und `compactRegion()` als **abstrakt** — der Vertrag legt fest, *was* Kompaktierung tut, nicht *wie*.
2. **Implementierung** — `@deepseek-ai/dsh-compaction-basic`: eine konkrete `BasicCompactionEngine`, die `ctx.tokenMeter` konsumiert und den Tail→Head-Retention-Walk, die Zusammenfassung über `ctx.llm.stream()`, die Surface-Ersetzung, die Sperre, den Pre-Step-Druck und die kanonische Kontextüberlauf-Wiederherstellung besitzt. `summarize()` ist ihr einziger Subklassen-Hook; Preisgestaltung und Replay bleiben beim Meter.
3. **Modellfreier Begleiter** — `@deepseek-ai/dsh-compaction-tool-result-pruner`: ein konkreter optionaler Dienst, der übergroße aktuelle `tool/result`-Knoten umschreibt, bevor das Backend einen Zusammenfassungsbereich wählt. Er ist keine zweite Kompaktierungsimplementierung und implementiert `CompactionEngine` nicht.
4. **Menschlicher Consumer** — `@deepseek-ai/dsh-command-compact` registriert das argumentenlose `/compact` über `ctx.commands` und ruft die backend-unabhängige Operation `compactNow()` auf. Es ist direkte menschliche Kontrolle, kein modellseitiges Tool.

### Der Vertrag hängt von `dsh-session` und `dsh-llm` ab — eine bewusste Abweichung

Der Capability-Seams-Agent-Note sagt, das Service-Definition-Paket hänge "nur von cordis ab" (zutreffend für `dsh-shell`, dessen Vokabular in sich geschlossen ist). Kompaktierung **kann** das nicht einhalten: Ihre Verben wirken auf eine agent-eigene `Session` (`compactRegion(start, end, agent)`), und ihre Ausgabe nutzt das Inhaltsvokabular (`CompactionResult.summary: ContentBlock[]`). Es gibt keine Möglichkeit, den Vertrag auszudrücken, ohne `Session`/`SessionEvent` (aus `dsh-session`) und `ContentBlock` (aus `dsh-llm`) zu benennen.

Das ist kein Kopplungs-Smell — es ist die Domäne des Vertrags. Die "nur cordis"-Leitlinie war von Anfang an eine Abkürzung für "die Schnittstelle hängt nur von dem ab, was der Vertrag tatsächlich benennt, und niemals von einer Implementierung". `dsh-session` und `dsh-llm` sind selbst Schnittstellen-/Vokabularpakete, keine Implementierungen; `dsh-compaction` importiert weiterhin kein Backend. Die eigentliche Invariante des Seam — *Consumers und Implementierungen entwickeln sich hinter einem abstrakten Dienst unabhängig weiter* — bleibt intakt.

### Drei abstrakte Operationen, Algorithmus im Backend

Den vollständigen Algorithmus (den Retention-Walk, Token-Summierung, Textextraktion) als konkrete Methoden auf die Schnittstelle zu legen, würde den Vertrag wieder an eine Strategie koppeln: Ein Backend, das eine andere Retention-Politik oder Ereignisreihenfolge will, müsste gegen geerbten konkreten Code ankämpfen. Alle drei Operationen abstrakt zu machen, verlagert jede *Wie*-Entscheidung ins Backend und hält die Schnittstelle eine Aussage über das *Was*. Token-Messung ist überhaupt kein Kompaktierungs-Hook; der Singleton-Dienst lässt mehrere Consumers einen Pro-Session-Replay-Fold teilen.

`compactIfNeeded(agent, trigger, signal)` nimmt einen expliziten `'pressure' | 'context-overflow'`-Trigger und ein Abbruchsignal entgegen. Es liest nur die neueste dauerhafte geroutete Anfrage; kein Header heißt keine Arbeit, während jedes geroutete Provider-/Modellziel den Singleton-Schätzer nutzt. `compactNow(agent, signal)` erfordert einen im Leerlauf befindlichen Agent und führt selbst unterhalb des Drucks eine nützliche balancierte Reduktion durch; existiert keine, gibt es `null` ohne Schreibvorgänge zurück. `compactRegion(start, end, agent, signal?)` nutzt `agent.session` als einzige Session-Identität und behält ein optionales Signal für explizite Aufrufer. Der Standard-Summarizer löst sein Ziel aus expliziter Konfiguration, dem zuletzt protokollierten gerouteten Ziel und dann den Agent-Optionen auf und zeichnet das Provider-/Modellpaar nach jedem `llm/stream`-Routing auf. Er spielt das Präfix der gerouteten Anfrage nach und hängt die Kompaktierungsanweisung als abschließende User-Nachricht an, damit der warme KV-Cache des Providers wiederverwendet wird — siehe das [`dsh-compaction-basic` README](../../../../packages/compaction/compaction-basic/README.de.md). Das Ergebnis trägt `llmStreamCall: true`, weil es genau einen Aufruf über den LLM-Dienst dieses Kontexts verbraucht hat; eine Subklasse setzt diese Markierung nur unter derselben Bedingung, da ein behaltenes `rawOutput` allein den Aufrufpfad nicht identifiziert. Der Aufruf setzt den provider-neutralen `GenerateOptions.purpose` auf `compaction`; Adapter dürfen diesen Zweck auf modellverborgene Transportmetadaten abbilden, und der DeepSeek-Adapter sendet `x-deepseek-harness-compact: 1`.

### Automatischer Druck läuft nach erfolgreicher dauerhafter Schrittarbeit

Der Druck nach erfolgreichem Aufruf läuft beim nächsten `agent/pre-step`, nachdem die vorangegangene Antwort, Tool-Ergebnisse, gepufferter Kontext und Steering dauerhaft sind und bevor die nächste Anfrage abgeleitet wird. `dsh-compaction-basic` misst die kanonische protokollierte Anfrage über `ctx.tokenMeter`, sodass die nächste Anfrage jede Ersetzung ohne spekulativen Envelope-Override sieht. Sobald der Druck die Bedingung erfüllt, läuft das optionale `ctx.toolResultPruner`-Umschreiben vor der Zusammenfassungswahl; compaction-basic misst die dauerhafte Surface erneut und überspringt die Zusammenfassung, wenn das Pruning den Druck wieder auf ein sicheres Maß senkt.

Der kanonische Provider-Kontextüberlauf nimmt einen eigenen Pfad. Der fehlgeschlagene Schritt wird geschlossen, und `agent/request-error` empfängt den ursprünglichen Anfragefehler. Compact-basic besitzt seinen Überlaufzähler pro Agent, prunt vor dem Erzwingen einer nützlichen balancierten Reduktion und gibt `{ kind: 'retry' }` nur dann zurück, wenn `session.surface.replaceGeneration` steigt — einschließlich reinem Pruning-Fortschritt, wenn kein Zusammenfassungsbereich existiert. Die Schleife schließt dann den fehlgeschlagenen Turn, öffnet einen neuen nummerierten Retry-Turn und rekonstruiert seine Anfrage aus dem dauerhaften Protokoll. Keine Ersetzung, ein Wiederherstellungsfehler vor jeder Ersetzung, Abbruch, eine erschöpfte Obergrenze oder ein nicht zusammenhängender Fehler bewahrt den ursprünglichen Provider-Fehlschlag. Hat das Pruning die Generation bereits vorangebracht, bevor spätere Zusammenfassungsarbeit fehlschlägt, wiederholt die Wiederherstellung ab der dauerhaften geprunten Surface, es sei denn, Abbruch oder Dispose geht vor. Die vollständige Lebenszyklus-Entscheidung steht im [Agent Note zur Wiederherstellung nach dem Aufruf](../architecture/2026-07-10-after-call-compaction-pressure-and-overflow-recovery.md).

```
assistant/message → tool/result/context/steering → step/end
claim the next batch → await waterfall agent/pre-step  ⟵ pressure compaction before the next request
enter → next step/start

provider overflow → step/end
await waterfall agent/request-error  ⟵ forced compaction between attempts
retry → next numbered step/start      ⟵ derives from the replacement surface
```

### Retention ist turn-agnostisch; die Tool-Paarungs-Balance ist der einzige strukturelle Schutz

Die Auto-Kompaktierung prüft nach **jedem erfolgreichen** Schritt, nicht einmal pro Turn. Das ist tragfähig für das Überleben ausufernder Turns: Ein tool-lastiger ReAct-Turn hängt pro Schritt eine `assistant/message` + ein `tool/result` an, sodass die Surface innerhalb eines Turns wächst. Die nächste Pre-Step-Prüfung kann frühe geschlossene Tool-Paare kompaktieren, bevor die Fortsetzung einen weiteren Schritt öffnet, und der provider-bestätigte Überlauf bleibt die Auffanglösung, wenn eine Anfrage zuerst das Limit überschreitet.

`compactIfNeeded` behält den kleinsten Tail ganzer Surface-Einheiten, deren geschätzte Größe das aufgelöste Retained-Token-Budget erreicht, und kompaktiert ältere Knoten. Eine Einheit ist ein vollständiger geschlossener Schritt oder eine schrittlose Nachricht. Landet der Token-Cutoff innerhalb eines Schritts, wird die Retention erweitert, bis der Schnitt Tool-paarungs-balanciert ist. Die Balance wird an der Surface-Reihenfolge geprüft, nicht an der Protokollsequenz, weil Ersatzzusammenfassungen neue Sequenznummern an alten Surface-Positionen haben. `dsh-compaction` exportiert die Before/After-Kantenhelfer; ihr Pro-Session-Cache foldet nur angehängte Surface-Tail-Knoten, solange `replaceGeneration` unverändert ist, liest bei reinem Protokollwachstum keine Ereignisse und baut aktuelle Mitgliedschaft und Balancen nach einer Ersetzung neu auf. `compactRegion` lehnt Grenzen ab, die einen Tool-Aufruf von seinem Ergebnis trennen. Der laufende Turn erhält keine Sonder-Retention.

Ein ausufernder Turn wird also genau wie jede andere Historie kompaktiert: Seine frühen *geschlossenen* Schritte werden zusammengefasst, während seine jüngsten Schritte wörtlich bleiben. Wenn der einzige kompaktierbare Inhalt nur noch ein unteilbarer offener Tail-Schritt ist (dessen Tool-Aufrufe noch keine Ergebnisse haben), lehnt die Kompaktierung ab (`null`) und versucht es erneut, sobald dieser Schritt schließt.

**Ein gewisser Einzeleinheiten-Überlauf bleibt außerhalb des Geltungsbereichs.** Die Zusammenfassungsbereichswahl kann eine unteilbare Einheit nicht teilen. Der optionale Pruner kann ein geschlossenes Tool-Paar reparieren, wenn entfernbarer texttragender Tool-Ergebnis-Inhalt den Großteil ausmacht und der geprunte Rest hineinpasst. Reiner Envelope-Druck, ein übergroßer unteilbarer Nicht-Tool-Knoten wie eine eingefügte `user/message` und eine Tool-Einheit, deren nicht prunbarer Rest weiterhin zu groß ist, bleiben außerhalb der Kompaktierung; die Begrenzung dieser Einheiten ist ein eigenes Thema.

### Kopf-Verankerung: ein Auto-Checkpoint, immer am Kopf

Die Auto-Kompaktierung beginnt immer am Surface-Kopf und verschmilzt den vorherigen Checkpoint mit der neu kompaktierten Historie, sodass nur ein automatischer Checkpoint übrig bleibt. `shadowedRange` ist daher positional und kein numerisches Sequenzintervall: Eine neuere Zusammenfassungssequenz kann eine ältere Surface-Position einnehmen. `shadowedSeqs` zeichnet die maßgebliche Surface-Reihenfolge auf. Manuelle Mid-Range-Kompaktierung kann mehrere Checkpoints hinterlassen.

### Ungefähre Konvergenz-Invariante

`resolveConfig` liefert brauchbare Standardwerte: Schwellenverhältnis `0.8`, Retained-Tail-Verhältnis `0.16`, leere Zusammenfassungs-Provider-/Modell-Overrides, `maxTokens: 8192`, `compactionRetries: 1`, `maxOverflowRetries: 1` und `auto: true`. Optionale exakte Provider-/Modell-Policies überschreiben die Top-Level-Defaults teilweise; Druck skaliert die Verhältnisse gegen die Kapazität des routenbesitzenden LLM-Adapters, während `retainTokens` die Verhältnis-Retention ersetzen kann. Die Retention muss unter dem resultierenden Schwellenwert bleiben. Die Konvergenz bleibt dynamisch, weil Provider-Ausgabelimits für verborgene oder aufgetauchte Reasoning-Tokens aufgewendet werden können und die Zusammenfassungsgröße unvorhersehbar ist. Bleibt der Druck über dem Schwellenwert, kompaktiert `compactIfNeeded()` den Kopf-Checkpoint bis zur konfigurierten Wiederholungszahl erneut, doch jede committete Zusammenfassung muss kleiner sein als das, was sie abschattet. Überlauf braucht keine Kapazitätsmetadaten und umgeht Schwellenwert- und Retained-Tail-Policy für eine maximale balancierte Kopfreduktion, die die neueste unteilbare Einheit stehen lässt. Die Eigentumsaufteilung wird vom [Agent Note zu geroutetem Modellkontext und Kompaktierungspolicy](../architecture/2026-07-20-routed-model-context-and-compaction-policy.md) festgelegt.

### Surface-Ersetzung: `compaction/*`-Ereignisse sind nur im Protokoll; eine `user/message` trägt die Zusammenfassung

Weil `SurfaceEventType` geschlossen ist, kann die Zusammenfassung nicht auf einem `compaction/*`-Ereignis mitreiten. Das Backend hängt stattdessen eine **einzelne `user/message`** mit `source: COMPACT_CHECKPOINT_SOURCE` und `surfaceOp: { op: 'replace', startSeq, endSeq }` an, deren `content` die (gerahmte) Zusammenfassung ist und deren `sourceEventSeqs` die abgeschatteten Einträge *und* die Buchhaltungsereignisse abdeckt. Die Schnittstelle exportiert diese Quelle und `isCompactCheckpointSource()`, damit Consumers einen persistierten oder geklonten Checkpoint erkennen, ohne von der Paketidentität des Backends abzuhängen. Die `compaction/*`-Ereignisse zeichnen Sperre, Zusammenfassung, gewählten Bereich, abgeschattete Seqs, Token-Anzahl und Modellaufruf auf, ohne der Surface beizutreten. Die Surface-Mutation sitzt **innerhalb** der Sperre — `compaction/end` ist das zuletzt angehängte Ereignis:

```
compaction/start    → log-only. Acquires the lock.
[summarize older range via the backend]
compaction/summary  → log-only. Records the raw summary, local-call marker, range, shadowed seqs, and token count.
user/message     → canonical checkpoint source + surfaceOp { op:'replace', startSeq, endSeq }.
                   THE surface mutation (framed summary).
                   deriveMessages() renders it as a user-role message.
compaction/end      → log-only. Releases the lock (carries `error` on a recoverable failure).
```

`deriveMessages()` liefert dann `[summary_as_user_message, ...retained_entries]`. Die Wiederverwendung von `user/message` ist ehrlich statt eines Workarounds: Eine Zusammenfassung *ist* wirklich User-Rollen-Kontext.

### Checkpoint-Rahmung + inkrementelles Mergen (Backend-privat)

Das Basis-Backend verpackt die Zusammenfassung als etablierten Checkpoint-Kontext und markiert sie für das inkrementelle Mergen beim nächsten Zyklus. Die rohe Zusammenfassung bleibt auf `compaction/summary`. Rahmung ist Backend-Policy; der Seam verspricht, dass eine Ersatz-User-Nachricht die möglicherweise gerahmte Zusammenfassung trägt und die kanonische Checkpoint-Quelle nutzt.

### Blockieren über eine protokollierte Sperre, plus eine Taxonomie für Absturz/behebbare Fehler

Die `compaction/start … compaction/end`-Klammer ist durch zwei Rollen gerechtfertigt:

1. **Absturzerkennbares Verwaistsein plus aufgezeichnete Zusammenfassungseingaben** (primär). Die Zusammenfassung ist ein langsamer Modellaufruf, der *nach* `compaction/start` persistiert wird. Ein Absturz mitten in der Zusammenfassung hinterlässt ein `compaction/start` ohne passendes `compaction/end` — ein erkennbares Verwaistsein. Die Sperre zuletzt (statt zuerst) freizugeben, verwandelt das Absturzfenster von *stiller Korruption* in dieses erkennbare Verwaistsein.
2. **Verhindert nebenläufige Kompaktierung.** Jeder automatische, manuelle und Explicit-Range-Einstiegspunkt verweigert ein lebendes ungematchtes `compaction/start`. Die Klammer ist die einzige Sperre; kein prozesslokaler Mutex dupliziert sie.

Die Sperre schließt eine andere Kompaktierung aus, nicht unabhängige Fakten. Ihre Marker sind Zeitpunkte statt eines exklusiven Containers, daher dürfen dauerhafte Inbox-Splices zwischen einem eigenständigen manuellen Start und Ende erscheinen. Automatische Arbeit erfordert Ganz-Surface-Stabilität innerhalb ihres Turns. Manuelle Arbeit revalidiert nur die gewählte positionale Spanne und lässt nur-appende Kontext außerhalb davon nach der Ersetzung sichtbar bleiben.

Die Lebenszyklusgrenze macht den Absturzzustand eindeutig:

- **Aktueller Lebenszyklus:** Ein hängendes `compaction/start` nach dem neuesten `session/end-seed` ist die lebende dauerhafte Sperre und meldet Busy.
- **Späterer Lebenszyklus:** Ein neueres konstruktorgeschriebenes `session/end-seed` beweist, dass der ältere ungematchte Start stale ist, sodass Resume, Fork und Adoption nicht durch einen toten Writer dauerhaft blockiert bleiben.
- **Behebbarer Fehler:** Sobald Start landet, unternimmt das Backend genau einen `compaction/end { error }`-Versuch. Zusammenfassungs- oder Stabilitätsfehler lassen die Konversations-Surface unverändert, während der fehlgeschlagene Versuch im Protokoll erhalten bleibt. Schlägt das Close-Append fehl, bleibt der ungematchte Start absichtlich blockierend.

`compaction/end` behält sein `error?`-Feld (spiegelt den in sich geschlossenen Fehler von `tool/result` — ein Ereignis unterscheidet Erfolg von Fehlschlag, ohne ein Geschwisterereignis zu korrelieren). Es gibt kein separates `compaction/error`-Ereignis.

**Die Core-Session-Reparatur bleibt kompaktierungs-agnostisch — bewusst.** `interruptedTurnClosers` wird niemals über `compaction/*` belehrt. Die allgemeine `session/end-seed`-Lebenszyklusgrenze liefert die Evidenz, die der Kompaktierungsbesitzer braucht; die Kompaktierungsinvariante und das Backend interpretieren sie, ohne plugin-spezifische Reparatur in den Core zu bringen.

## Erwogene Alternativen

- **Der vollständige Algorithmus als konkrete Schnittstellenmethoden** — abgelehnt, weil er den Vertrag wieder an eine Retention-Strategie koppelt. Alle drei Operationen sind abstrakt; wiederverwendbare Messung ist ein separater LLM-Familien-Dienst, und `summarize()` ist basics einziger Hook.
- **Kompaktierung auf `agent/request` oder einem kompaktierungsspezifischen Loop-Callback** — abgelehnt, weil ersteres eine provisorische Anfrage beobachtet und letzteres generischen Lebenszyklus an Kompaktierungspolicy koppelt. Pre-Step-Replay der vorherigen dauerhaften Anfrage plus kanonische Überlaufwiederherstellung deckt erfolgreiche und abgelehnte Aufrufe ab.
- **Ein `compact`-Boolean oder eine ungetypte Request-Metadaten-Map** — abgelehnt, weil mehrere Hilfsaufrufarten zu sich gegenseitig ausschließenden Flags würden, während ein offener Sack compilergeprüftes Vokabular wegwirft. Ein getyptes `purpose`-Diskriminanzmerkmal erweitert um zusätzliche Aufrufarten, ohne ein weiteres `GenerateOptions`-Feld hinzuzufügen.
- **Ein separates `compaction/error`-Ereignis** — abgelehnt: `compaction/end` behält ein `error?`-Feld, spiegelt den in sich geschlossenen Fehler von `tool/result` — ein Ereignis unterscheidet Erfolg von Fehlschlag, ohne ein Geschwisterereignis zu korrelieren.
- **Core-Turn-Reparatur über `compaction/*` belehren** — abgelehnt: Die allgemeine End-Seed-Grenze unterscheidet bereits Prior-Lifecycle-Historie, und Core für jedes künftige `xxx/start … xxx/end`-Paar zu patchen, ist genau die Kopplung, deren Vermeidung der Grund für die Capability-Seam-Architektur ist.

## Konsequenzen

- **Pakete**: `packages/compaction/compaction` liefert die Schnittstelle, `compaction-basic` liefert das Backend, `compaction-tool-result-pruner` liefert optionales deterministisches Umschreiben, und `command-compact` liefert menschliches `/compact`. `packages/llm/token-meter` besitzt replay-bewusste Messung unabhängig.
- **Automatische Erweiterungspunkte**: `agent/pre-step` (`@mode waterfall`) behandelt Druck vor der Anfrageableitung, und `agent/request-error` (`@mode waterfall`) behandelt finale Anfragefehlschläge, nachdem der fehlgeschlagene Schritt schließt. Die Pre-Step-Payload trägt den beanspruchten Batch, Turn, Schritt und Signal (siehe die [Payload-Object-Events-Entscheidung](../../archived/architecture/2026-08-06-agent-event-payload-objects.md)), ohne kompaktierungsausschließliche Prompt-/Präfix-Payload.
- **`SessionEventMap`** gewinnt `compaction/start` / `compaction/summary` / `compaction/end` durch Declaration Merging (merge-erweiterbar); `SurfaceEventType` wird **nicht** angefasst. Dies sind Session-Ereignisse, keine cordis `Events`, daher braucht das Event-Taxonomie-Gate keinen Eintrag.
- **`dsh-compaction`** besitzt `COMPACT_CHECKPOINT_SOURCE`, `isCompactCheckpointSource(source)`, `toolPairingBalancedBefore(session, seq)` und `toolPairingBalancedAfter(session, seq)`. Die Markierung identifiziert Ersatzzusammenfassungen über Backend-Implementierungen hinweg. Die gecachten Surface-Kantenprüfungen verhindern, dass `compactRegion` und `compactIfNeeded` ein Tool-Aufruf/Ergebnis-Paar spalten, validieren aktuelle Mitgliedschaft per Seq, beantworten beide Kanten aus einer Balance-Sequenz pro Schnitt und lehnen stale oder fehlende Seqs sowie verwaiste Ergebnisse ab.
- **`dsh-session`** validiert positionale Ersetzung, vollständige zitierte Quellereignis-Abdeckung und reine Inhalts-Einzelknoten-`tool/result`-Umschreibungen über seinen einen Surface-Manager. Sein Invarianten-Begleiter behandelt frisch angehängte Tool-Ergebnisse als Ausführungen, die einen offenen Schritt und einen ausstehenden Aufruf erfordern, während der Kompaktierungs-Begleiter numerische-Turn- versus Standalone-Null-Klammerbeziehungen besitzt.
- **Verdrahtung**: `examples/tui-agent/cordis.yml` lädt nullkonfiguriertes `dsh-token-meter`, `dsh-compaction-tool-result-pruner`, `dsh-compaction-basic`, dann `dsh-command-compact`; dienstweite Standardwerte machen die Komposition ohne wiederholte numerische Policy nutzbar.

## Tests

- **Unit:** Echter Loader und Invarianten-Plugins decken Ganz-Einheiten-Retention, Pruning-Konfiguration und -Replay, Rich-Block-Reihenfolge, Metadatenerhalt, Konvergenz, beide `compaction/end`-Ausgänge, Open-Tail-Ablehnung, reines-Pruning- und zusammengefasste Überlaufwiederherstellung, Generationsnachweis, Obergrenzen und Originalfehler-Erhalt ab.
- **Loop:** Tests pinnen Pre-Step nach dem vorangegangenen `step/end` und vor dem nächsten `step/start`, tatsächliches `agent/request`-Routing, geschlossene fehlgeschlagene Schritte, frische Retry-Nummerierung und die vollständige geworfene/In-Band-Überlauf → Kompaktierung → rekonstruierte-Retry-Komposition.
- **Manuell:** Maintenance-Serialisierung, Marker-Reihenfolge, Injektions-Retention, Live-/Stale-Verwaiste-Klassifikation, Abbruch, Close-/Flush-Fehlschläge, Befehlszuordnung und die queued TUI-Reise sind ohne Modellschlüssel gepinnt.
- **Mit-Schlüssel-e2e:** Ein echtes Modell und eine Bash-Session mit abgesenkten Limits löst Kompaktierung aus, zeichnet ein vollständiges `compaction/start…end`-Paar auf, schrumpft die Surface und beendet die Aufgabe.
- **Snapshot:** Das zusammengesetzte Kontextüberlauf-Szenario leitet den Hilfsaufruf nur dann von `compaction/summary` ab, wenn `llmStreamCall: true` beweist, dass der lokale LLM-Dienst ihn verbraucht hat; kanonisch rekonstruierte Blöcke pinnen die vollständige Wiederherstellung ohne Provider-Delta-Partitionierung.
