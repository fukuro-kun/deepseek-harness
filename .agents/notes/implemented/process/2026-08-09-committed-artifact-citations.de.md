# Agent Note: Committete Artefakte zitieren, niemals Design-Session-Ordinalzahlen

Status: implemented

[English](2026-08-09-committed-artifact-citations.md) | [中文](2026-08-09-committed-artifact-citations.zh.md) | Deutsch

## Problem

Große Design- und Review-Sessions hinterlassen Arbeitskürzel — Entscheidungsnummern, Audit-Item-Codes, Plan-Abschnittsnummern, Task- und Stack-Ordinalzahlen, Reviewer-Entscheidungen —, die sich lesen, solange der Session-Transcript offen ist, und nach dem Schließen ins Leere verweisen. Ein repositoryweiter Audit fand das Muster konzentriert in `packages/client`: nackte `(decision 12/16/19/20/21)`-Zitate, von denen nur decision 21 einen committeten Eigentümer hatte; `(audit C2/S1/S3/S7)`-Codes ohne irgendein Audit-Dokument; `design §4.7` / `web2 §0` / `plan §1.4`-Verweise auf nicht committete Entwürfe; Plan-Phasen-Labels (`T2/T5/T9`, `P-I`, `W5`); Stack-Positionen ("a later PR in this stack") in dauerhaftem JSDoc; sowie Vokabular wie "ruling" und "design ledger". Dieselben Familien tauchten in Tests, CSS-Kommentaren, Generator-Templates, CI-Kommentaren und Agent Notes auf (die Perspektive "dieser PR/dieser Branch/diese Review-Runde", review-choreografische Zuschreibungen, veraltete "auf einen späteren PR verschoben"-Behauptungen, deren Ziele längst ausgeliefert waren). Der [Documentation Standard](../../../../docs/AGENTS.md) verbot bereits die Änderungshistorie-Hälfte (previously/now, PR- und Commit-Referenzen), enthielt aber keine Gegenregel für Zitate, sodass unauflösbare Ordinalzahlen weiter einliefen.

## Entscheidung

Dauerhafte Prosa — Kommentare, JSDoc, Docs, Notes, Testkommentare und -titel — zitiert nur committete Artefakte, die ohne grep-Archäologie im Repository auflösbar sind:

- Nenne die zuständige Agent Note (ihren Pfad mindestens einmal pro Datei, inline einen suchbaren Namen), den Pfad der Dokumentationsseite oder eine GitHub-Issue-Nummer. PR-, Commit-, Branch- und Stack-Positionen bleiben in Docs und Code per Documentation Standard verboten; Issues sind dauerhaft und zitierbar, und Agent Notes und Postmortems dürfen gemergte PRs und Issues als Belege zitieren, gemäß der Change-Story-Regelung des [Documentation Standard](../../../../docs/AGENTS.md).
- Eine Design-Session-Ordinalzahl, deren Entscheidung einen committeten Eigentümer hat, wird durch den Namen der Entscheidung ersetzt — die einst als "decision 21" vermerkte Ordinalzahl ist nun "die Plain-Text-Reference-Entscheidung", im Besitz der [Web-Input-Machine-Note](../../archived/architecture/2026-07-25-web-input-machine-and-slash-pipeline.md); die Ordinalzahl selbst löst nirgendwo im Repository auf und wurde überall entfernt. Eine Ordinalzahl ohne Eigentümer wird gelöscht und ihr sachlicher Satz so umformuliert, dass er allein besteht.
- Behobene Regressionen werden als Kontrafaktisches im Präsens gepinnt ("ohne X passiert Y"; "ein naiver X würde …"), niemals als Repository-Historie ("früher tat er Y").
- Implementierte Notes beschreiben die ausgelieferte Realität: Eine "auf einen späteren PR verschoben"-Behauptung, deren Ziel ausgeliefert wurde, nennt stattdessen die ausgelieferte Note.
- Aufgezeichnete Fixtures, Snapshots und archivierte Notes sind ausgenommen: Aufgezeichneter Modell-Output und versiegelte Historie behalten ihre ursprüngliche Stimme. Innerhalb der Change-Story-Abschnitte einer Note ist ein historischer Stufenname ("der erste Wurf lieferte X") regelkonform; indexikalische Markierungen ("dieser Wurf", "this cut") bleiben überall verboten.
- Recall-Probes verwenden lexikalische Grenzen und werden gegen ein bekanntes Positiv- und ein knappes Negativ-Beispiel kalibriert. Probes für die verfassende Sprache zielen auf die Sprachfläche der jeweils anderen Sprache, statt den gesamten chinesischen Korpus als unübersetzten Rest zu behandeln.
- Owner-first-Edits verfolgen jeden generierten Verbraucher. Wörtliche Code-Fences werden über die zweisprachigen Paare byteweise kopiert; modell- oder nutzersichtbarer Wortlaut ändert sich nur zusammen mit seiner zugehörigen Verhaltensevidenz, andernfalls lässt der Audit ihn unverändert und meldet die Verschiebung.

Ein einziger repositoryweiter Bereinigungslauf wendete diese Regeln auf alle Prosaflächen an, einschließlich der generator-eigenen Templates (`scripts/gen-doc-graphs.ts`, `scripts/gen-tool-catalog.ts`, der Seitenhinweis des Typert-Generators) mit Neugenerierung, des Type-Equiv-Quell-JSDoc mit erneutem Einfügen auf den Seiten und der zweisprachigen Gegenseiten mit erneutem Aufzeichnen der Paare. Der [dsh-trim-cot-leakage-Skill](../../../skills/dsh-trim-cot-leakage/SKILL.md) operationalisiert diese Regeln: die Audit-Taxonomie, die committeten Recall-Batterien und Few-Shot-Beispiele für die Entscheidung, was behalten oder gelöscht wird.

## Erwogene Alternativen

- **Die Design-Ledgers und Audit-Dokumente committen, damit die Ordinalzahlen auflösen.** Abgelehnt: Session-Transcripts sind Arbeitsartefakte, keine gepflegten Referenzen; sie zu committen würde ein paralleles, nicht gegates Entscheidungskorpus neben den Agent Notes schaffen, und ihre interne Nummerierung würde trotzdem driften.
- **Ein mechanisches Gate für das verbotene Vokabular.** Vertagt: Das Vokabular ist unbegrenzte natürliche Sprache, und die Recall-Batterien des Audits brauchen Urteilsvermögen, um Leckage von legitimer Prosa zu trennen ("wait" als Substantiv, kontrastives "actually", alte/neue Laufzeitzustände). Ein enges, hochpräzises Gate (zum Beispiel `\(decision \d`, `\(audit [A-Z]\d`, `\bcut \d`, `this cut`, ein nacktes `\bT\d\b`, `P-I`, `used to `, ein nacktes `\bv1\b` und `§\d` — letzteres ausgenommen Zitate, deren Abschnittsnummerierung einen committeten Eigentümer hat, wie die eigenen §N von web-styling.md) ist der Kandidat, falls das Muster wiederkehrt; das Review der Bereinigung selbst fand Reste genau in den Fällen, die diese Suchen verpassten, weshalb sie die Kandidatenliste anführen.
- **Die Begründung löschen, die tote Artefakte zitierte.** Abgelehnt: Die sachlichen Sätze wurden bewahrt oder umformuliert; entfernt wurden nur Zitate, Review-Choreografie und Ableitungstranskripte, gemäß der Regel vollständiger Aussagen im Prosa-Standard.

## Verifikation

Die grep-Batterien des Audits (Englisch und Chinesisch, Kommentare und Prosa, `--hidden` für `.agents/`) liefern außerhalb aufgezeichneter Fixtures, archivierter Notes, der eigenen Dateien des Trim-Skills und der in dieser Note zitierten Belege keine Design-Ordinalzahlen; `verify-type-equiv`, die `gen-*`-Freshness-Checks und `verify-translation-pairing` pinnen die regenerierten und neu aufgezeichneten Flächen. Abdeckungslücke: Kein Gate lehnt ein neues Ordinalzitat ab — das Review trägt die Regel.

## Konsequenzen

- Die Zitate eines Kommentars lösen über Pfad oder Namen auf; Leser müssen nie eine geschlossene Session rekonstruieren, um einem Zitat zu folgen.
- Design-Sessions müssen ihre Entscheidungen in Agent Notes landen lassen, bevor dauerhafte Prosa sie zitieren kann; Ordinalkürzel bleiben innerhalb der Session.
- Zitate werden länger (ein Note-Pfad statt "(decision 21)") im Tausch gegen grep-freie Auflösung.
