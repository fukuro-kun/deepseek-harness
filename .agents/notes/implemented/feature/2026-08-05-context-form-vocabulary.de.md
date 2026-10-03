# Agent Note: Produzent-deklarierte Kontextformen

Status: implemented

[English](2026-08-05-context-form-vocabulary.md) | [中文](2026-08-05-context-form-vocabulary.zh.md) | Deutsch

## Problem

Jede geloggte Nicht-Nutzer-`user/message` renderte über einen einzigen Body: die ganze Message als Inline-JSON serialisiert. Ein Leser, der eine Zeile öffnete, sah `{ "content": [ { "type": "text", "text": "…\n\n…" } ], "source": { … } }`, wobei das Escaping das einzig Lesenswerte — die modellsichtbare Prosa — zu einer einzigen Zeile kollabiert hatte und die Produzentenfelder im selben Blob saßen.

Den Produzenten im Header zu benennen (die [Source-and-Steer-Marks-Entscheidung](../../archived/feature/2026-08-04-web-context-source-and-steer-marks.md)) löste *wer das hinzugefügt hat*. Es konnte nicht lösen, *welche Art von Ding* hinzugefügt wurde, weil nichts im Log das sagte. Injizierter Kontext ist nicht eine Form: Ein reconciltes `AGENTS.md`, ein Katalog verfügbarer Skills, ein Runtime-Policy-Snapshot und der Bericht eines Subagents unterscheiden sich voneinander so sehr wie eine Terminal-Card von einer Diff-Card, und doch präsentierten alle vier als dieselbe Wand aus escaped JSON.

Die Tool-Oberfläche hatte dieses Form-Problem bereits gelöst. `ToolCallView` hat drei Cards, nicht eine pro Tool, und ein Tool deklariert, welche Card sein Aufruf ist. Kontext hatte kein Äquivalent: kein Vokabular von Formen und keine Möglichkeit für einen Produzenten zu sagen, welche er emittiert.

## Entscheidung

`MessageSource` erhält ein optionales produzent-deklariertes `form: ContextForm` — ein kleines getaggtes Vokabular von Informations*formen*, unabhängig von `kind`:

- `kind` beantwortet **wer dies erzeugt hat** und trägt keine Präsentationswahl.
- `form` beantwortet **welche Informationsform es ist**. Mehrere Produzenten können eine Form teilen, und ein Produzent kann über eine Session mehr als eine emittieren.

Das Vokabular ist semantisch, niemals visuell. Ein Wert stellt fest, dass der Inhalt die Instruktionen einer Datei oder ein Katalog verfügbarer Elemente ist; Farben, Icons, Ordnung und Collapse-Defaults sind Sache des Consumers und dürfen nicht in die Union eintreten. Sie wächst um je einen Wert, wenn Produzenten die strukturierten Felder erhalten, die ihre Form braucht. Die deklarierten Formen:

**`instructions`** — aus Workspace-Dateien gelesene Instruktionen. `agent-instructions` deklariert sie sowohl auf der Startup-Baseline als auch auf späteren Deltas; sein bestehendes `changes[]` trug bereits die Pfade, Aktionen und Digests, die die Präsentation braucht, sodass kein Feld hinzugefügt wurde. Der Body listet die reconcilten Dateien über dem Text und behält das `<system-reminder>`-Framing wörtlich: Das Framing ist Teil dessen, was das Modell gelesen hat, sodass es zu verbergen den Request falsch wiedergeben würde.

**`catalog`** — ein Katalog von Elementen, die in dieser Session verfügbar sind, neu publiziert bei Änderungen. `dsh-tool-skill` zieht vom geteilten `plugin`-Kind auf eine eigene `skill-catalog`-Source um, die `entries` (die exakt publizierten `name`/`description`-Paare) und bei einem Ersatz `update` trägt, das der Body als Ersatz-Hinweis rendert. Der Body listet diese Einträge, statt den `<available_skills>`-Block aus der Prosa erneut zu parsen.

Einträge zeichnen den publizierten Fakt **unescaped** auf. Das Pseudo-XML-Escaping gehört zum `<available_skills>`-Frame, der für das Modell existiert, daher wird es beim Rendern dieses Frames angewendet und nie gespeichert; sonst müsste ein Consumer die Kodierung des Frames kennen, um eine Beschreibung mit `<` darzustellen, und genau das Frame-Wissen, das diese Entscheidung entfernt, würde in anderer Form zurücklecken. `escapeText` ist deterministisch und injektiv, sodass das Digesten der unescaped Einträge die Republish-Semantik exakt bewahrt und der modellsichtbare Text byte-identisch bleibt.

Dieser Umzug verlagert auch die Katalog-**Identität**: Der Republish-Digest deckt jetzt die durablen Einträge statt des gerenderten Texts ab, sodass das modellsichtbare Framing nicht mehr entscheiden kann, ob ein Republish nötig ist, und das Text-Slicing, das Einträge aus einer geloggten Message zurückgewann, ist weg. Die v0-zu-v1-Kante bewahrt ein akzeptiertes älteres Katalog-Payload, sodass eine fortgesetzte Session, deren neuester Katalog dieser Änderung vorausgeht, einmal republiziert. Ein Fall heilt nicht selbst: Ist dieser Alt-Form-Katalog der einzige und hat die aktuelle View keine Skills, sieht das Plugin keinen publizierten Katalog und emittiert keinen Tombstone, sodass das Modell einen veralteten Katalog behält, den nichts ersetzt. Das ist die explizite Degradation des Kontext-Features, keine Session-Format-Weigerung.

**`snapshot`** — aktueller Zustand, den ein späterer Snapshot desselben Produzenten ersetzt. Der Runtime-Kontext-Snapshot, `time-context` und `tmux-context` deklarieren ihn. `renderContextSections()` exponiert die benannten Beiträge der Assembly, die `renderContextSnapshot()` bereits für das Modell zusammenfügte, sodass der Body jeden Teil dem Subsystem zuschreibt, das ihn erzeugt hat, ohne verbundene Prosa erneut zu spalten. Die zwei Einzelbeitrags-Produzenten zeichnen je eine Section auf. Der geleerte Runtime-Kontext-Marker hat keine Beiträge mehr und deklariert keine Form.

**`notice`** — eine einmalige Mitteilung über etwas gerade Geschehenes. `tool-jobs`, `tool-goal`-Wrap-up, `plan-mode`-Wechsel und `repeat-tool-reminder`-Erinnerungen deklarieren es mit einer `summary`, die auf der **collapsed** Zeile mitfährt: Eine Notice soll lesbar sein, ohne sie je zu expandieren. Die Summary ist dort begrenzt, wo ihre Eingaben Caller-Text sind (das Label und Statusdetail eines Tasks haben keine eigene Länge). Goal-Zustandsänderungen bleiben domain-eigene `goal/change`-Events statt Modell-Kontext und deklarieren daher keine Form.

**`relay`** — eine Message, die ein anderer Agent an diesen adressiert hat. Beide subagent-adressierten Sources deklarieren sie; der Sender wird als die opaque Session-Id gezeigt, die die Source bereits aufzeichnet, weil dieser Client sie nicht zu einem Titel auflösen kann.

**`recall`** — Material, das aus dem Log einer anderen Session geholt wurde. `session-reference` deklariert es und brauchte kein neues Feld: Seine Referenzen zeichnen bereits Label, behaltene und weggelassene Anzahlen und das Truncation-Flag auf, die der Body zuerst zeigt, weil recalled Kontext auf dem Weg herein begrenzt ist und eine Card, die die weggelassene Anzahl verbärge, übertreiben würde, was das Modell erhielt.

Beide Reader sind **alles oder nichts**: Ein unlesbarer Eintrag disqualifiziert den Datensatz, statt fallengelassen zu werden, weil ein Body, der den modellsichtbaren Text ersetzt, keinen selbstsicheren, aber unvollständigen Bericht dessen zeigen darf, was das Modell las. Der Form-Marker der Zeile meldet, was tatsächlich renderte, nicht was deklariert wurde.

Die Produzentenseite validiert dieselben durablen Daten mit derselben Haltung. `catalogHistory` liest `source.entries` aus `agent.session.snapshotEvents()`, das bei Resume oder Fork ein Persistence-Seed ist, dessen Validierung nur ein Source-Objekt mit nicht leerem `kind` garantiert — kein Per-Kind-Feld wird geprüft. Ein unlesbarer Katalog wird daher als „nicht der Datensatz dieses Plugins“ übersprungen, die Haltung, die der ersetzte Content-Digest hatte; dort zu werfen würde jeden späteren Schritt dieser Session am spätesten, am schlechtesten diagnostizierbaren Punkt scheitern lassen.

Alles andere — einschließlich einer Form, die diese UI-Version nicht präsentiert, einer in der Source fehlenden Form und eines `catalog` mit unbrauchbaren Einträgen — rendert den **opaque** Body: den modellsichtbaren Text mit seinen echten Zeilenumbrüchen, dann die verbleibenden Source-Daten als Felder. Opaque ist der dokumentierte Default; der Contract weist ihm diese nicht unterstützten Fälle zu. Ein fortgesetztes, geforktes oder fremdes Log muss rendern, ob sein Produzent hier gemountet ist oder nicht — auch darum lebt die Klassifikation in der durablen Source statt in einer clientseitigen, nach Produzent gekeyten Tabelle.

## Warum keine Presenter-Registry

Der Tool-Präsentations-Contract paart sein Vokabular mit `presentCall(args)`, einer host-seitigen reinen Funktion, die jedes Tool implementiert. Kontext hat bewusst kein Äquivalent, weil sich die Eingabe in der Ownership unterscheidet: Die `args` eines Tools werden vom **Modell** gegen ein modellsichtbares Schema erzeugt, sodass ein Übersetzungsschritt unvermeidlich ist; eine Kontext-`source` wird vom **produzierenden Plugin** selbst konstruiert, ohne externe Beschränkung, und kann schlicht die Fakten aufzeichnen, die eine Präsentation braucht. Eine Registry hinzuzufügen hätte eine Übersetzung erkauft, die niemand braucht, zum Preis eines Host-Berechnungspunkts, eines Wire-Felds pro Kontext-Message und eines Browser-Bundles für jedes produzierende Paket (das Client-Purity-Gate verbietet Host-Paketen, Komponenten beizutragen).

## Erwogene Alternativen

**Source-Kinds im Client auf Renderer abbilden.** Am billigsten zu schreiben und erfordert keine Formatänderung, aber es stellt Produzentenwissen zurück in den Client: Jedes neue Kind braucht dann ein Client-Release, um als etwas anderes als opaque zu rendern, und ein fremdes Log kann überhaupt nicht klassifiziert werden. Es führt außerdem genau die Kopplung wieder ein, die die [Source-and-Steer-Marks-Entscheidung](../../archived/feature/2026-08-04-web-context-source-and-steer-marks.md) für Labels entfernt hat.

**`kind` als Form wiederverwenden.** Ein Diskriminant ist einfacher, und `agent-instructions` ist bereits 1:1 mit seiner Form. Dieses Design verliert Information, wenn mehrere Produzenten eine Form teilen: Drei ausgelieferte Produzenten emittieren Runtime-Snapshots, und sie zu einem Kind zu vereinen würde unmöglich machen zu sagen, welcher Produzent jede Message lieferte. Getrennte `kind`- und `form`-Felder zeichnen den Produzenten auf, während mehrere Produzenten eine Präsentation teilen können.

**Den Client die modellsichtbare Prosa parsen lassen.** Die Einträge und Datei-Sections sind im Text sichtbar strukturiert. Sie zu parsen koppelt die Präsentation an die Prompt-Formulierung, sodass jede Umformulierung still eine Card bricht — derselbe Grund, aus dem die Katalog-Identität vom Text wegzog.

**Instructions als Markdown rendern.** Der Body ist eine Markdown-Datei und liesse sich gerendert besser lesen. Der Text trägt aber auch `<system-reminder>`-Framing, das der Markdown-Renderer als rohes HTML verwirft, sodass ein Markdown-Body still einen Teil dessen verbergen würde, was das Modell las. Zurückgestellt, bis der Produzent Per-File-Inhalt strukturell aufzeichnet.

## Tests

- `packages/client/runtime` pinnt die Form-Projektion, einschließlich der unbekannten, leeren, falsch typisierten und fehlenden Werte, die zu opaque degradieren müssen.
- `packages/client/ui-conversation` pinnt jeden Body: die bewahrten Zeilenumbrüche und Source-Felder des opaque Bodys, die Dateiliste und das wörtliche Framing des instructions Bodys, die Eintragsliste des catalog Bodys und einen Katalog mit unbrauchbaren Einträgen, der zu opaque zurückfällt.
- `packages/skill/tool-skill` pinnt die neue Source bei Erstpublikation und Ersatz, das durch die durablen Einträge getriebene Republish-Verhalten und einen malformed durable Katalog, der die Step-Beobachtung intakt lässt.
- Das schlüssellose Assembled-Web-Seeded-History-Szenario expandiert einen echten `instructions`-Kontext in Chromium und assertiert seine Dateiliste, das wörtliche Framing und die unveränderte Disclosure-Geometrie. `catalog` hat keine Assembled-Abdeckung: Das hermetische Gerüst publiziert keine Skills, sodass kein Katalog ein Browser-Szenario erreicht.

## Konsequenzen

- Ein Leser erkennt ohne Expandieren, was hinzugefügt wurde, und es zu lesen bedeutet nicht mehr, escaped JSON zu lesen.
- Die durable `MessageSource` zeichnet jetzt Inhaltsform neben dem Produzenten-Kind und seinen Feldern auf. Die Grenze ist tragend: nur Fakten und Form, niemals Präsentation. Ein Produzent, der eine bessere Card will, zeichnet bessere Fakten auf.
- Die Katalog-Identität hängt nicht mehr von der modellsichtbaren Prosa ab und löscht den Text-Slicing-Pfad, der einen umformulierten Katalog für einen geänderten halten konnte.
- Jeder ausgelieferte Produzent außer den zwei Hook-Bridges deklariert jetzt eine Form. Die Bridges bleiben per Design opaque: Ihr Inhalt ist, was immer ein externes Programm druckte, sodass keine Form versprochen werden kann. Unbekannte Kinds und unlesbare Datensätze landen ebenfalls dort.
- `ContextFormed` ist über `form` diskriminiert, sodass ein Produzent keine Form ohne die Fakten deklarieren kann, aus denen diese Form präsentiert wird — eine `notice` ohne ihre Summary oder ein `snapshot` ohne seine Sections kompiliert nicht.
