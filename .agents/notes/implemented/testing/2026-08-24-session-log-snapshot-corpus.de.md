# Agent Note: Session-Log-Snapshot-Corpus
[English](2026-08-24-session-log-snapshot-corpus.md) | [中文](2026-08-24-session-log-snapshot-corpus.zh.md) | Deutsch

Status: implemented


## Problem

Der schlüssellose Snapshot-Corpus nutzt ACP als Controller für viele Szenarien, deren assertiertes Verhalten dem assemblierten Agent, Tools, Persistenz oder einem anderen Produkt-Interface gehört. Das lässt ein Automation-Protokoll wie den Owner von Backend-Verhalten aussehen, behält Test-only-Application-Entrypoints neben dem unterstützten `dsh`-Launcher und verstreut aufgezeichnete Sessions über Beispiel-, SDK-, Web- und Script-Verzeichnisse.

Der Begriff Snapshot deckt außerdem unverwandte ARIA-, Geometry-, Generator- und Package-Unit-Expected-Outputs ab. Contributors können aus einem Pfad nicht ableiten, ob ein Test von einer aufgezeichneten Session getrieben wird, ob die Session sowohl Replay-Input als auch Expected Output ist, oder welches Kommando einen Refresh besitzt.

## Entscheidung

Der Top-Level-`snapshots/`-Baum und das `*.snapshot.ts`-Suffix sind für Szenarien reserviert, die aufgezeichnetes Session-JSONL besitzen oder explizit referenzieren. Jedes Process-Level-Szenario launcht ein ausgeliefertes Profile über `dsh`; ein kleiner Adapter steuert Headless-, SDK-, ACP- oder Web-Verhalten, ohne ein weiterer Application-Entrypoint zu werden. Ein deklaratives `snapshot.yml` hält nur Profile-, Patch-, Lifecycle-Control-, Platform-, Header-Pin- und Workspace-Fakten, die die abgeschlossene Session nicht ausdrücken kann.

Diese Entscheidung ersetzt die ACP-spezifische Platzierung und Controller-Ownership der [Record-once/Replay-deterministic-Entscheidung](2026-06-19-acp-snapshot-tests.de.md), während jene Note für Session-Log-Replay, Ausnahme-Overrides, Normalisierung und ACP-Transcript-Vergleich maßgeblich bleibt.

Die aufgezeichnete Session bleibt der primäre Input und, für Current-Generation-Szenarien, der Expected Output. Human-originierte Messages treiben das selektierte öffentliche Interface, aufgezeichnete Assistant-Chunks treiben deterministisches Modell-Replay, und das normalisierte persistierte Ergebnis muss dem Fixture entsprechen. Parent- und Child-Sessions teilen eine typisierte Redaction-Map. Committete Fixtures enthalten Relationship-erhaltende Identity-Tokens und ersetzen Request-System-Prompts und Tool-Schemas durch Tokens; jede distinkte Header-Klasse behält einen expliziten Sidecar-Owner.

Fixture-Dekodierung und -Vergleich hängen nur vom selektierten JSONL-Content ab; Dateinamen identifizieren Inventory-Rollen, sind aber keine Parser-Inputs. Derselbe strikte statische Katalog validiert Replay-, Seed-, Record-, Refresh- und Normalized-Comparison-Pfade.

Headless-Stderr-Rekonstruktion expandiert eingebettetes Reasoning sowohl aus `assistant/message`- als auch aus Log-only-`assistant/attempt`-Settlements, sodass fehlgeschlagene oder retried Reasoning Teil des projizierten Prozess-Outputs bleibt.

Jede Parent- oder Child-Rolle nutzt `session[.<ordinal>][.vN].jsonl`, wobei v0 durch eine weggelassene Version kodiert ist und jeder Dateiname mit seinem Header übereinstimmt. Replay, Record und Refresh selektieren die numerisch höchste Generation pro Rolle. Die meisten Owner lassen `sessionFormat` weg und folgen dem aktuellen Writer; ein begrenzter historischer Owner deklariert seine exakte Version und geschlossene Coverage-Namen. Der Corpus behält selektierte v0-Rollen für Multi-Hop-, Packed-Row-, Retry-/Failure- und Shipped-Profile-Coverage plus selektierte v1-Rollen für die v1→v2-Structural-Edge innerhalb der kompletten Migrationskette. Record und Refresh schreiben niemals ein explizit behaltenes historisches Fixture neu, benennen eine committete Generation um oder löschen eine durch automatisches Cleanup. Eine behaltene Session-Generation friert ihre Nicht-Session-Expected-Outputs nicht ein: Refresh schreibt weiterhin eigene System-Prompt- und Tool-Schema-Sidecars aus dem aktuellen Lauf. Reviewte Source-Tree-Kuration entfernt einen Vorgänger erst, nachdem dieselbe Rolle einen verifizierten aktuellen Nachfolger hat. Die Corpus-Policy verlangt, dass selektierte aktuelle Rollen in der Mehrheit bleiben, und begrenzt selektierte historische Rollen auf zehn; niedrigere Vorgänger-Generationen dürfen neben einem selektierten aktuellen Nachfolger verbleiben.

Szenario-eigene HTTP-Fixtures trennen die in der Session aufgezeichnete stabile Authority von ihrem Transport-Listener. Jedes Fixture bindet Loopback-Port `0`, lässt das Betriebssystem den Port atomar allokieren und binden und mappt die aufgezeichnete URL oder den Endpoint über den echten Provider auf diesen Listener. Jede process-globale Transport-Interception matcht nur den aufgezeichneten Endpoint, gehört dem Fixture-Fiber und wird vor dem Schließen des Listeners restauriert.

Jedes bestehende ACP-Szenario erhält ein verhaltenserhaltendes Ziel. Gewöhnliches One-Shot-Verhalten nutzt das Headless-Profile, persistente Maschinensteuerung nutzt das SDK-Profile, und nur ACP-Protokollverhalten bleibt ACP-owned. Von einer aufgezeichneten Session getriebene Web-Szenarien treten dem Corpus bei und behalten ihre ARIA- oder Geometry-Expected-Outputs als sekundäre Evidenz. Web- und Package-Tests ohne Recorded-Session-Quelle behalten owner-lokale Expected Outputs und hören auf, Snapshot-Pfade oder -Dateinamen zu nutzen.

Workspace-Inputs bleiben szenario-lokal. Ein mutierendes Szenario vergleicht einen kompletten erwarteten finalen Workspace, den Record und Refresh nie neu schreiben, sodass ein Modell- oder Tool-Self-Report den Test nicht erfüllen kann. Bestehende absichtliche Session-Wiederverwendung bleibt eine explizite azyklische Owner-Referenz; der Corpus fügt keine Workspace-Vererbung oder einen allgemeinen Fixture-Merging-Mechanismus hinzu.

Current-Writer-Request-Header-Pins sind von behaltenen Migrations-Inputs getrennt: `tool-call-turn` pint die Default-Komposition und `empty-response-retry-current` pint die Retry-Komposition. Ihre lesbaren Sidecars bleiben im Besitz von `text-turn`. Die sechs behaltenen historischen Inputs bleiben byte-gefroren und für Replay selektiert; ihre gepinnten Verzeichnisse enthalten kein neueres kanonisches Sibling, das sie verdrängen könnte. Separate `writer.expected.jsonl`- und `writer.<ordinal>.expected.jsonl`-Dateien pinnen exakten normalisierten nativen Current-Format-Parent- und -Child-Output, während behaltene SDK-Szenarien aktuelle Notifications in `notifications.current.expected.jsonl` pinnen. Diese Output-Orakel sind keine Replay-Generationen. Das [Snapshot-Kit](../../../../packages/test-support/session-snapshot/README.de.md) besitzt Selektions- und Refresh-Verhalten. Strukturelle Migration kann Request-Bedeutung bewahren, ohne natives Writer-Event-Layout zu reproduzieren, sodass die offizielle Migration unabhängige Korrektheitstests hat. Reverse-Projektion in historische Header, das Abstreifen struktureller Unterschiede, das Überspringen von Output-Gleichheit oder das Ersetzen gefrorener Inputs würde Regressionen verbergen statt diese separaten Verpflichtungen zu verifizieren.

## Erwogene Alternativen

**ACP als universellen Treiber behalten.** Dies bewahrt das bestehende Harness, koppelt aber weiterhin Backend-Coverage an ein Protokoll niedriger Priorität und kann die unterstützten Headless-, SDK- und Web-Launch-Pfade nicht beweisen.

**Jedes Szenario auf einen neuen Headless-Test-Treiber verschieben.** Ein privater Treiber würde das Application-Entrypoint-Problem reproduzieren und könnte Multi-Turn-, Cancellation- oder Background-Lifecycle-Control nicht ausdrücken, die das ausgelieferte SDK-Profile bietet.

**Jeden Expected Output unter `snapshots/` zentralisieren.** ARIA-, Geometry-, Generator- und Unit-Erwartungen nutzen keine aufgezeichnete Session als Input und Ergebnis zugleich. Das Mischen würde die aktuelle mehrdeutige Terminologie beibehalten und Package-Ownership schwächen.

**Eine deklarative Browser- und Terminal-Sprache schaffen.** Komplexe UI- und PTY-Szenarien brauchen Interaktionscode. Ein geteilter Snapshot-Kern plus Interface-Adapter entfernt Application-Treiber, ohne ein zweites Testframework hinzuzufügen.

**Workspaces und aufgezeichnete Sessions automatisch deduplizieren.** Die aktuelle Workspace-Duplizierung ist klein und absichtliche Lokalität ist leichter reviewbar. Nur bestehende semantische Session-Wiederverwendung rechtfertigt eine explizite Referenz.

**Den numerischen Port der aufgezeichneten URL binden.** Ein stabiler Listener-Port hält Transport- und Transcript-Werte identisch, aber concurrent Snapshot-Jobs auf einem Host teilen den Netzwerk-Namespace und racen um diesen Port.

**Vor dem Launch des Szenarios einen unbenutzten Port proben.** Das Freigeben eines geprobten Ports, bevor das Child ihn bindet, erzeugt eine Time-of-Check/Time-of-Use-Race. Das Binden von Port `0` im besitzenden Prozess hält Allokation und Ownership atomar.

**Jedes selektierte Fixture aktuell machen.** Dies minimiert Fixture-Versionen, entfernt aber den Shipped-Profile-Beweis, dass die komplette benachbarte Migrationskette noch releaste Inputs restaurieren kann.

**Jedes Szenario auf seiner ältesten Generation selektiert halten.** Dies maximiert Migrationsaufrufe, verhindert aber, dass der Snapshot-Corpus den aktuellen Writer und den Current-Format-Fast-Path als seinen gewöhnlichen Fall ausübt.

## Invarianten

- Jedes bestehende Recorded-Session-Szenario hat einen bestandenen Ersatz, bevor sein alter Owner entfernt wird.
- Jeder Process-Level-Snapshot startet über `dsh`, und das Application-Entrypoint-Inventar erlaubt die ausgemusterten Snapshot-Treiber nicht mehr.
- Jedes Top-Level-Szenario besitzt oder referenziert Session-JSONL; Nicht-Session-Expected-Output bleibt owner-lokal.
- Committete Session-Fixtures sind Redaction-Fixpunkte, enthalten keinen System-Prompt- oder Tool-Schema-Bulk und behalten genau einen Pin pro Header-Klasse.
- Kanonische Fixture-Namen entsprechen ihren Header-Versionen; jede Referenz benennt die selektierte Parent-Generation ihres Owners; höchstens zehn selektierte Rollen nutzen explizite v0/v1-Deklarationen, aktuelle selektierte Rollen sind zahlreicher, und deren Coverage-Namen umfassen jedes behaltene Migrationsverhalten.
- Mutierende Szenarien verifizieren ihren finalen Workspace extern.
- Owner-lokale Prozess-Erwartungen nutzen `*.expected.e2e.ts` und ein separates Built-Output-Gate.
- Source- und Built-Adapter installieren Replay-only-Packages in isolierten Profile-Fallbacks; distinkte Prompt-Section-Reihenfolgen halten ihre Request-Header byte-identisch.
- Szenario-HTTP-Fixtures binden OS-zugewiesene Loopback-Ports und bewahren dabei ihre aufgezeichneten modellsichtbaren Authorities.
- Source- und Built-Launch-Modi, Browser-Replay, SDK-Projektionen, Packaged-Python-Runtime-Fälle, Dokumentations-Gates und Repository-Hygiene bestehen.

## Konsequenzen

Der Corpus macht Controller-Ownership sichtbar: Gewöhnliches Agent-Verhalten erbt keinen ACP-Protokoll-Output mehr, SDK- und Web-Projektionen behalten ihre Interface-spezifische Evidenz, und nur ACP-Cancellation- und -Permission-Austausche bleiben ACP-owned. Contributors reviewen einen normalisierten Session-Diff plus die Sidecars oder UI-Erwartungen, die unabhängige Evidenz liefern. Das Hinzufügen einer Komposition erfordert einen Manifest-Klassen-Pin; das Hinzufügen einer volatilen Identität erfordert eine typisierte Relationship-erhaltende Redaction-Regel statt eines breiteren Text-Scrubbers. Concurrent Jobs können netzwerkgestützte Fixtures replayen, ohne repository-weite Ports zu reservieren, auf Kosten eines Fixture-lokalen Mappings zwischen der aufgezeichneten Authority und ihrem Transport-Listener.

Historische Migrations-Coverage kostet explizite Per-Szenario-Metadaten und behaltene Vorgänger-Dateien, während die selektierte aktuelle Mehrheit verhindert, dass Kompatibilitäts-Fixtures Current-Writer-Regressionen verbergen.

## Risiken

Der Corpus kann Hunderte Fixtures ändern und Verhaltensänderungen im Generation-Namens-Churn verstecken. Mechanischer Generation-Output, Normalisierungsverhalten und Controller-Verhalten bleiben daher im Diff und in der Validierung separat attribuierbar, und Expected-Output-Rewrites erfordern Review auf Szenario-Ebene.

Eine aufgezeichnete Session, die sowohl als Replay-Input als auch als Expected Output dient, kann ein schlechtes Modell-Skript konsistent reproduzieren. Unabhängige World-State-Assertions, Protokoll- oder UI-Erwartungen, Real-Model-Aufzeichnung und fokussierte Package-Tests bleiben erforderliche komplementäre Evidenz.
