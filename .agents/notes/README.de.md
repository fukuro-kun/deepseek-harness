# Agent Notes

[English](README.md) | [中文](README.zh.md) | Deutsch

Hier lebt eine Art von Design-Dokument. Eine **Agent Note** dokumentiert eine Entscheidung oder einen Vorschlag, der diese Codebase betrifft — das *Warum* und *was wir aufgegeben haben*, die Anteile, die Code und Docs nicht tragen können. Diese Datei definiert, wo Agent Notes liegen, wann man eine schreibt und [das Dateiformat](#das-dateiformat).

## Layout und Benennung

Jede Agent Note hat zwei Achsen, beide in ihrem **Pfad** kodiert — `{lifecycle}/{class}/yyyy-mm-dd-topic-title.md`:

- **Lifecycle** (der oberste Ordner) ist der Status der Agent Note, und eine Agent Note wechselt zwischen Ordnern, wenn sich dieser Status ändert:
  - **`proposed/`** — Vorschläge, die vor der Implementierung geprüft wurden; noch nicht gebaut (oder nur teilweise).
  - **`implemented/`** — die Entscheidung ist ausgeliefert. Die Datei dokumentiert, was entschieden und was abgelehnt wurde, und wird **mit dem tatsächlich Ausgelieferten aktuell gehalten**: Wenn der Code später eine Datei verschiebt, ein Paket umbenennt oder einen Key/Default ändert, wird die Agent Note im selben Change entsprechend aktualisiert (nur Fakten — Pfade, Namen, Struktur — nicht die Entscheidung selbst). Siehe [implemented/AGENTS.md](implemented/AGENTS.md).
  - **`rejected/`** — der Vorschlag wurde geprüft und abgelehnt. Behalten wird er nur, solange seine Begründung einen verführerischen, bedeutsamen Fehler verhindert; andernfalls wird der komplette Triplet gelöscht.
- **Class** (der verschachtelte Ordner) ist die *Art* der Entscheidung — siehe [Klassifizierung](#klassifizierung) unten.

Das Datum im Dateinamen ist der Zeitpunkt, zu dem das Thema **zum ersten Mal vorgeschlagen** wurde (laut Git-Historie). Querverweise zwischen Agent Notes nutzen relative Markdown-Links (`[topic](../../implemented/architecture/2026-…-….md)`) — nie bloßen Fließtext oder Nummern — damit sie maschinell prüfbar sind und Verschiebungen zwischen Ordnern überstehen.

Der aktive Lifecycle-Baum ist das operative Inventar: Durchsuche seine lifecycle/class-Ordner oder das Repository. Füge keine zentrale `INDEX.md` hinzu; die [no-index-Agent Note](implemented/process/2026-07-19-remove-generated-agent-note-index.de.md) trägt die Begründung. Implemented-Records mit geringem zukünftigem Wert wandern in den separaten, eingefrorenen [`archived/`](archived/AGENTS.md)-Baum, der unten beschrieben ist.

## Klassifizierung

Jede Agent Note gehört zu einer pfadkodierten Class aus der geschlossenen Menge in `scripts/agent-note-tree.ts`; das Klassifizierungs-Gate lehnt andere Ordner ab. Hinzufügen einer Class erfordert die Aktualisierung der kanonischen Menge und dieses Abschnitts.

| Class | Abdeckung |
|---|---|
| `feature` | Eine neue für Nutzer oder Modell sichtbare Capability. |
| `bug-fix` | Korrigiert einen Defekt oder schließt eine Lücke, die ein Postmortem aufgedeckt hat. |
| `simplification` | Entfernt Code, Verhalten oder Oberfläche, ohne eine Capability hinzuzufügen. |
| `architecture` | Eine strukturelle Entscheidung über den **ausgelieferten Quelltext** — wie die Pakete zueinander stehen und welches Vokabular der Runtime hat. |
| `process` | Tooling, Policy oder Workflow **um** den Code herum — Gates, Paketmanager, Vendoring — nicht das Laufzeitverhalten. |
| `testing` | Test-Infrastruktur und -Strategie. |

Die Grenze zwischen `architecture` und `process`: **architecture** betrifft den Quelltext, den wir ausliefern; **process** ist das umgebende Tooling und der Workflow. (`refactor` fehlt bewusst — es überlappt `simplification`, deren Unterscheidungsfrage, „Ändert sich das beobachtbare Verhalten?", das bereits abdeckt.)

## Archivierung und Löschung

Archive eine implemented Agent Note, wenn die ausgelieferte Entscheidung abgeschlossen ist und ihre Begründung künftige Arbeit kaum noch leiten wird. Halte sie aktiv, solange ihre Alternativen, ihre Ownership-Grenze, ihre negative Garantie, ihre durable- oder wire-Semantik, ihre Sicherheitsregel oder ihre Reintroduktionsbedingung noch nützlich sind. Archive niemals eine proposed Note: lehne einen überholten Vorschlag ab. Behalte eine rejected Note nur, solange sie einen plausiblen Fehler verhindert; andernfalls lösche ihre englische, chinesische und sidecar-Datei gemeinsam. Nutze den kalibrierten [`dsh-archive-agent-notes`](../skills/dsh-archive-agent-notes/SKILL.md)-workflow statt Wortanzahl, Alter oder Kontingentziel.

Das Archiv ist pfadkodiert als `archived/{class}/yyyy-mm-dd-topic-title.md`; `implemented` fehlt bewusst, weil nur implementierte Notes hinein kommen. Ein Archivierungs-Change verschiebt den kompletten englisch/chinesischen/sidecar-Triplet, behält `Status: implemented`, fügt dieselbe `Archived: YYYY-MM-DD`-Zeile direkt unter diesem Status in beiden Sprachdateien ein, recordet das Sidecar neu und repariert oder löscht eingehende Links. Das sind die einzigen erlaubten Inhaltsänderungen bei der Archivierung.

Sobald versiegelt, ist jeder archivierte Triplet dauerhaft eingefroren. Bearbeite, übersetze, formatiere, aktualisiere, verschiebe oder lösche ihn nicht und behandle ihn nicht als Autorität für das aktuelle Verhalten. Dokumentations-Gates überspringen archivierte Quellen einschließlich ihrer ausgehenden Links; aktive Prosa darf gezielt auf eine archivierte Note verlinken, wenn sie bewusst Geschichte zitiert. [`verify-archived-agent-notes`](../../scripts/verify-archived-agent-notes.ts) erzwingt den geschlossenen Class-Baum, komplette Triplets, Archiv-Metadaten, Sidecar-Hashes und das append-only-Manifest des eingefrorenen Inhalts. Die [archive-policy-Agent Note](implemented/process/2026-07-26-frozen-agent-note-archive.de.md) trägt die Begründung.

## Wann man eine schreibt

Jede nicht triviale Änderung muss mindestens eine Agent Note im selben PR hinzufügen oder aktualisieren. Eine Änderung ist nicht trivial, wenn sie Verhalten, Architecture, einen über Dateien oder Pakete geteilten Contract, Process oder Tooling, die Teststrategie, ein On-Disk-, Wire- oder Konfigurationsformat oder eine andere Entscheidung ändert, die ein Maintainer nachvollziehen kann. Ein Vorschlag für umfangreiche künftige Arbeit beginnt in `proposed/`; eine bereits gefällte Entscheidung beginnt in `implemented/`. Wähle den Class-Ordner, der zur Entscheidung passt (siehe [Klassifizierung](#klassifizierung)).

Die Aktualisierung der Agent Note, der die Entscheidung bereits gehört, erfüllt die Regel; erstelle keine Duplikate. Nur eine rein mechanische oder lokale Änderung ohne Veränderung von Verhalten, Contracts, Struktur, Process oder Begründung ist befreit. Eine Agent Note wird nie zu einer *anderen Entscheidung* umgeschrieben: Ersetze sie durch eine neue und behalte beide Notes cross-verlinkt, außer die alte Note wird später nach der Regel unten vollständig konsolidiert. Die Bearbeitung einer `implemented/` Agent Note, um zu verfolgen, wo ihre bestehende Entscheidung lebt, ist Pflicht, kein Verstoß; siehe [implemented/AGENTS.md](implemented/AGENTS.md).

Eine vollständig abgelöste implemented Agent Note kann in die aktuelle tragende Note konsolidiert und gelöscht werden. Vor der Löschung muss der Owner jede einzigartige Begründung, jedes echte Alternative, jede Konsequenz, jede erforderliche Verifikation und jede benannte Abdeckungslücke erhalten; jeden eingehenden Link reparieren; und die chinesische Gegenstelle und den Konsistenz-Record im selben Change löschen. Teilweise Ablösung reicht nicht: Behalte beide Notes cross-verlinkt und aktualisiere jede Tatsache, die aktuell bleibt. Die Konsolidierung darf die alte Datei nicht in ihr Gegenteil umschreiben und sich nicht auf die Git-Historie als einzige Kopie der Begründung verlassen.

Eine Note über eine Feature-Hinzufügung kann in die spätere Note über deren Entfernung konsolidiert werden, nur wenn das Feature in Produktivcode, Configuration, Schemas, durable- oder Wire-Formaten, Migration und Kompatibilitätsverhalten fehlt; keine aktuelle Dokumentation es als verfügbar darstellt; und kein Test es als unterstütztes Verhalten übt. Die Begründung der Entfernung und Tests, die das Fehlen verifizieren, dürfen bleiben. Der Owner der Entfernung erhält die ursprüngliche Motivation, warum das Feature nicht mehr gerechtfertigt war, Alternativen zur vollständigen Entfernung, die aufgegebenen Capability, die Reintroduktionsbedingungen und die Verifikation der vollständigen Abwesenheit. Veraltete Implementierungs-Inventare und Tests, die nur das gelöschte Verhalten verifiziert haben, sind keine aktuelle Verifikations-Evidenz. Die Entfernung eines einzelnen Transports, Defaults, einer Implementierung oder einer Präsentation ist eine teilweise Ablösung, ebenso wie jedes überlebende durable-Datum oder jede Kompatibilitäts-Handhabung.

## Das Dateiformat

Jede aktive Agent Note folgt einem Dateiformat, erzwungen durch `pnpm run verify-agent-note-format` ([scripts/verify-agent-note-format.ts](../../scripts/verify-agent-note-format.ts), Teil von `doc-sync`); die Begründung für das Format — und die Alternativen, die es abgelehnt hat — ist die [uniform-format-Agent Note](implemented/process/2026-07-05-uniform-agent-note-format.de.md). Archivierte Notes behalten das Format, das sie bei der Versiegelung hatten, plus die Archiv-Datums-Zeile oben.

### Der Header-Block

Die ersten drei Zeilen jeder Agent Note lauten exakt:

```markdown
# Agent Note: <title>

Status: <status>
```

gefolgt von einer Leerzeile. Der `Status:`-Wert hat eine von drei Formen und muss mit dem Lifecycle-Ordner übereinstimmen, in dem die Datei liegt — das Gate prüft sie gegeneinander:

- `Status: proposed`
- `Status: implemented`
- `Status: rejected — <why, in one line>`

Der Status trägt keine Daten und keine Klammerzusätze: Der Dateiname trägt das Erstvorschlagsdatum, Git trägt alles andere, und eine Note „in geänderter Form akzeptiert" ist Körperinhalt (nenne die Änderung dort, wo die Entscheidung steht). Die Ablehnungsursache ist der einzige Status mit Inhalt, weil das Urteil einer rejected Agent Note die Tatsache ist, um die es Lesern geht.

### Das Gerüst des Textkörpers

Jede Agent Note öffnet ihren Textkörper mit `## Problem` — die Motivation, geschrieben so, dass sie ohne die Lösung steht. Was folgt, hängt vom Lifecycle ab; wiederkehrende Abschnitte nutzen diese kanonischen Namen und nichts anderes, während wirklich maßgeschneiderte technische Abschnitte (Paket-Topologie, Wire-Contracts, Schemas) in freier Form zwischen den Pflichtabschnitten bleiben.

#### `proposed/`

```markdown
## Problem
## Proposal
…bespoke sections…
## Alternatives considered
## Acceptance criteria
## Risks
```

`## Proposal` ist die beabsichtigte Änderung und darf legitim in der Futur sprechen — Pläne, Migrationsschritte und offene Fragen gehören hierher, solange die Arbeit ungebaut ist. `## Acceptance criteria` sagt, welcher beobachtbare Zustand „fertig" bedeutet. `## Risks` deckt ab, was schiefgehen kann, und was die Änderung bewusst aufgibt.

#### `implemented/`

```markdown
## Problem
## Decision
…bespoke sections…
## Alternatives considered
## Consequences
```

`## Decision` beschreibt die ausgelieferte Realität in der Präsens, und die ganze Datei wird gemäß [implemented/AGENTS.md](implemented/AGENTS.md) mit ihr aktuell gehalten. `## Consequences` dokumentiert, was der Kompromiss gekostet **und** eingebracht hat. Proposal-Ära-Headings sind hier Spec-Speak, und das Gate lehnt sie ab: `## Proposal`, `## Plan`, `## Migration plan` und `## Acceptance criteria` dürfen in einer implemented Agent Note nicht auftauchen (die [Slop-Checkliste](../../docs/AGENTS.md) nennt warum). Ein `## Testing`-, `## Deferred`- oder `## Related`-Abschnitt ist in Ordnung, wo er Präsens-Fakten feststellt.

#### `rejected/`

Eine rejected Agent Note ist der Vorschlag, eingefroren: Sie behält die Abschnitte, die sie zum Vorschlagszeitpunkt hatte (einschließlich `## Acceptance criteria` oder `## Plan`), und das Urteil lebt auf der `Status:`-Zeile. Gilt nur der Header-Block, der `## Problem`-Opener, ein `## Proposal`-Abschnitt und die Alternatives-considered-Pflicht unten.

### Erwogene Alternativen — verpflichtend

Jede Agent Note trägt einen `## Alternatives considered`-Abschnitt: jedes echte Alternative und warum es unterlag, ein fett geführter Absatz pro Alternative oder ein `### Why not <X>?`-Unterabschnitt pro umstrittener. Eine Entscheidung, die ohne das dokumentiert ist, was sie schlug, lädt zum erneuten Streit ein — der Fehlschlag, den Agent Notes verhindern sollen.

Alternativen werden recordet, nie erfunden. Eine Agent Note mit Datum vor 2026-07-05, deren Alternativen sich aus dem Record nicht rekonstruieren lassen, trägt anstelle des Abschnitts exakt diesen Kommentar, den das Gate nur für Pre-Format-Dateien akzeptiert:

```markdown
<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
```

### Verschieben zwischen Lebenszyklen

Das Verschieben einer Datei zwischen Lifecycle-Ordern bedeutet, die `Status:`-Zeile zu aktualisieren und das Gerüst dieses Ordners im selben Change erneut zu erfüllen — andernfalls schlägt das Gate die Verschiebung fehl. Konkret schreibt `proposed/` → `implemented/` `## Proposal` in ein Präsens-`## Decision` um, faltet `## Acceptance criteria` und `## Risks` in `## Consequences` (oder einen Präsens-`## Testing`/`## Verification`-Abschnitt für das, was jetzt das Verhalten festnagelt) und streicht Pläne zugunsten dessen, was ausgeliefert wurde — die Umstellung, die [implemented/AGENTS.md](implemented/AGENTS.md) verlangt, mechanisch gemacht. `proposed/` → `rejected/` fügt nur die Ursache auf der `Status:`-Zeile hinzu und friert die Datei ein.

### Chinesische Gegenstücke

Eine `.zh.md`-Gegenstelle spiegelt die Struktur ihrer englischen Schwesternote Abschnitt für Abschnitt unter dem [i18n-Contract](../../docs/i18n/README.de.md); die maschinengeprüften Header-Tokens (`# Agent Note: ` und die `Status:`-Zeile) bleiben wortwörtlich auf Englisch. Das Format-Gate überspringt `.zh.md`-Dateien — das Pairing-Gate prüft ihre Konsistenz.
