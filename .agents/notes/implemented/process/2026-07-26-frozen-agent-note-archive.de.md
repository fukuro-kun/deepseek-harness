# Agent Note: Agent Notes mit geringem Zukunftswert außerhalb des aktiven Bestands einfrieren

Status: implemented

[English](2026-07-26-frozen-agent-note-archive.md) | [中文](2026-07-26-frozen-agent-note-archive.zh.md) | Deutsch

## Problem

Implementierte Agent Notes werden als aktuelle Entscheidungsaufzeichnungen gepflegt, daher ist jeder Pfad, jedes Symbol, jeder Standardwert, jede Übersetzung, jeder Codeblock, jede Paketreferenz und jeder ausgehende Link im aktiven Bestand eine fortlaufende Verpflichtung. Dieser Aufwand ist gerechtfertigt, wenn die Begründung künftige Arbeit leiten kann, aber nicht für abgeschlossene UI-Details, kleinere Korrekturen, überholte Implementierungsmechaniken oder Prozessgeschichte, deren aktuelle Autorität andernorts liegt. Jede wenig wertvolle implementierte Aufzeichnung zu löschen würde nützliche historische Belege vernichten, während das Aufbewahren jedes abgelehnten Vorschlags Ideen erhielte, die weder plausibel noch lehrreich sind. Der Bestand braucht eine Aufbewahrungsgrenze, die aktive Anleitung von eingefrorener Geschichte trennt, ohne die Archivierung zu einer weiteren Pflegeebene zu machen.

## Entscheidung

Nur implementierte Agent Notes können archiviert werden. Eine implementierte Note wird verschoben, wenn ihre ausgelieferte Entscheidung vollständig ist und ihre Begründung, Alternativen, Konsequenzen, Ausschlussgarantien und Wiedereinführungsbedingungen künftige Arbeit voraussichtlich nicht mehr leiten. Grundlegende Grenzen, dauerhafte und Protokollsemantik, Sicherheitsregeln, wiederkehrende verführerische Designmuster und ungelöste Wiedereinführungsbedingungen bleiben unabhängig von Alter oder Wortzahl aktiv. Proposed Notes gelangen niemals ins Archiv; ein überholter Vorschlag wird rejected. Eine rejected Note bleibt nur erhalten, solange sie einen verführerischen, bedeutsamen Fehler verhindert, und wird andernfalls als vollständiges Triplett gelöscht.

Das Archiv verwendet `.agents/notes/archived/{kind}/yyyy-mm-dd-topic.md`; das redundante `implemented`-Segment entfällt. Die Archivierungsänderung verschiebt das vollständige englische, chinesische und Sidecar-Triplett, belässt `Status: implemented` und fügt in beiden Sprachdateien unmittelbar darunter `Archived: YYYY-MM-DD` ein. Verschiebung, diese Metadatenzeile, die entsprechende Sidecar-Neuaufzeichnung und die mechanische Reparatur eingehender Links sind die einzigen zulässigen Archivierungsänderungen.

Das Root-`.rgignore` schließt das Archiv aus Suchen aus, die ein übergeordnetes Verzeichnis durchlaufen. Historische Abfragen nennen das Archivverzeichnis explizit, sodass der absichtliche Zugriff weiterhin möglich ist, ohne eingefrorene Fakten in die Suche nach aktiven Entscheidungen zu mischen.

Nach der Archivierung ist das Triplett dauerhaft eingefroren und gilt als historischer Kontext, nicht als aktuelle Autorität. Es wird nicht für umbenannte Pakete, geändertes Verhalten, Übersetzungsstandards, Formatierungsregeln, defekte ausgehende Links oder spätere Dokumentationskonventionen aktualisiert. Aktive Texte dürfen absichtlich auf eine archivierte Note verlinken, diesen Link auf die aktuelle Autorität umleiten oder löschen. Repository-Gates validieren daher Links in archivierte Dateien, behandeln archivierte Dateien aber nie als Linkquellen.

[`verify-archived-agent-notes`](../../../../scripts/verify-archived-agent-notes.ts) hält die eingefrorene Grenze aufrecht. Es akzeptiert nur die geschlossene Menge der Agent-Note-Arten, verlangt ein vollständiges Triplett mit implemented-Status und übereinstimmenden gültigen Archivierungsdaten, verifiziert den Sidecar gegen beide aktuellen Git-Blob-Hashes und versiegelt jedes Artefakt per Pfad und SHA-256-Inhaltshash in einem rein anhängenden Manifest. Sein `--write`-Modus beweist zuerst, dass jedes bestehende Siegel unverändert ist, und hängt anschließend nur neu archivierte Artefakte an. Die Pull-Request-CI liefert den vertrauenswürdigen Basis-SHA und checkt die vollständige Historie aus, bevor der Verifier läuft, sodass ein flacher Checkout eines wiederverwendeten Runners das Basis-Manifest nicht auslassen kann. Die üblichen Gates für Agent-Note-Format, Übersetzungspaarung, Zeilenumbruch, Markdown-Links, Paketpfade, Mermaid, Dokumentations-TypeScript und Typäquivalenz schließen Archivquellen aus; ihre sich weiterentwickelnden Standards erzeugen keinen Druck, Geschichte zu bearbeiten.

Der Workflow [`dsh-archive-agent-notes`](../../../skills/dsh-archive-agent-notes/SKILL.md) ist für die Klassifizierung zuständig. Er verlangt ein semantisches Audit Note für Note, nutzt Code und aktuelle Dokumentation, um die gegenwärtige Autorität zu bestimmen, behandelt die Wortzahl nur als Vorauswahl, enthält kalibrierte Beispiele für Behalten/Archivieren/Löschen und meldet wirklich grenzwertige Ergebnisse zur Überprüfung.

Die Ersetzungsprüfung erfolgt beim Schreiben einer neuen Agent Note, nicht aufgeschoben auf eine spätere Bestandsbereinigung. Der Autor vergleicht die neue Note mit aktiven Notes, die dieselbe Entscheidung, denselben Mechanismus oder dieselbe verworfene Alternative abdecken, und klassifiziert jede vollständige oder teilweise Ersetzung. Qualifizierte implementierte Tripletts werden im selben Pull Request archiviert; teilweise Ersetzungen und eigenständig nützliche Begründungen bleiben aktiv und werden querverlinkt, während gefundene proposed- und rejected-Notes ihren eigenen Lebenszyklusregeln folgen.

## Erwogene Alternativen

**Jede Note löschen, die den aktiven Bestand verlässt.** Abgelehnt, weil eine implementierte Aufzeichnung einen geringen zukünftigen Leitwert haben und dennoch nützliche historische Belege für eine abgeschlossene Entscheidung liefern kann. Ein inhaltlich versiegeltes Archiv bewahrt diese Belege, ohne zu behaupten, sie seien noch aktuell.

**Jede implementierte und rejected Note aktiv behalten.** Abgelehnt, weil Pflegeaufwand und Suchrauschen mit Aufzeichnungen wachsen, die einer künftigen Entscheidung nicht mehr helfen. Insbesondere rejected Notes rechtfertigen ihre Aufbewahrung nur dadurch, dass sie einen plausiblen Trugschluss verhindern.

**Archivierte Notes in den Standard-Suchergebnissen des Repositorys belassen.** Abgelehnt, weil archivierte Fakten per Design veraltet sein können und aktuelle Ergebnisse durch lexikalische Treffer überholen können. Historische Arbeit kann das Archivverzeichnis explizit durchsuchen.

**Die Ersetzungsbereinigung auf periodische Bestandsaudits verschieben.** Abgelehnt, weil der Autor einer Ersatz-Note die frischesten Belege über Zuständigkeit und Überschneidung besitzt. Ein Aufschub hinterlässt redundante aktive Autoritäten und macht eine spätere Klassifizierung teurer.

**Auch rejected- oder proposed-Notes archivieren.** Abgelehnt, weil der Archivstatus „implementierte historische Entscheidung" bedeutet. Ein überholter Vorschlag braucht eine explizite Ablehnung, während eine Ablehnung ohne Schutzwert gelöscht werden muss statt in einen zweiten wertarmen Ablagebereich verschoben zu werden.

**Weiterhin alle Dokumentations-Gates auf archivierte Notes anwenden.** Abgelehnt, weil eine spätere Formatierungs-, Übersetzungs-, Code-, Paket- oder Linkregel das Umschreiben der historischen Momentaufnahme erfordern würde. Der dedizierte Verifier übernimmt stattdessen Vollständigkeit und Unveränderlichkeit.

**Sachliche Aktualisierungen erlauben und nur die Begründung einfrieren.** Abgelehnt, weil das die Beurteilungs- und Übersetzungslast des aktiven Bestands wieder einführt und unklar macht, welche Aussagen historisch sind. Aktuelle Fakten gehören in die aktive Dokumentation oder eine neue aktive Agent Note.

## Konsequenzen

Der aktive Bestand wird zu einer Menge von Entscheidungen, die künftige Arbeit beeinflussen sollen, während wenig wertvolle implementierte Geschichte explizit durchsuchbar und verlinkbar bleibt, ohne Pflegeaufmerksamkeit zu verbrauchen oder in Verzeichnis-übergreifenden Suchen aufzutauchen. Das Schreiben einer neuen Note umfasst eine begrenzte Ersetzungsprüfung, sodass Ersatzentscheidungen nicht unbemerkt redundante aktive Aufzeichnungen zurücklassen können. Verworfener Ballast kann verschwinden, wenn er keine sinnvolle Wahl mehr schützt, und Vorschläge können einem Urteil nicht unauffällig durch Archivierung entkommen. Das Archiv fügt ein Manifest, einen dedizierten Verifier und einen expliziten einmaligen Metadatenschritt hinzu. Archivierte Fakten und ausgehende Links können per Design veralten, daher müssen Leser und Agents aktiven Code und aktive Dokumentation als Autorität behandeln und eine archivierte Note nur als Geschichte zitieren.
