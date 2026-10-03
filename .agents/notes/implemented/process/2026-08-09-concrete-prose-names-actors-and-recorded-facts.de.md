# Agent Note: Konkrete Prosa benennt Akteure und aufgezeichnete Fakten
[English](2026-08-09-concrete-prose-names-actors-and-recorded-facts.md) | [中文](2026-08-09-concrete-prose-names-actors-and-recorded-facts.zh.md) | Deutsch

Status: implemented


## Problem

Die Prosa des Repositorys verwendete abstrakte Kategoriebezeichnungen, wo Leser jeweils unterschiedliche konkrete Fakten brauchten. Dieselbe Bezeichnung konnte frühere Event-Seqs meinen, die ein Ersatz zitierte, den Provider und das Modell, die eine Nachricht erzeugt hatten, den Aufrufer, der Kontext geliefert hatte, die Datei, die eine Konfigurationszeile geliefert hatte, oder den CI-Job, der eine Binärdatei gebaut hatte. Leser mussten den Code prüfen, bevor sie sagen konnten, welches Faktum der Satz versprach.

Ein weit gefasstes Label durch ein anderes zu ersetzen, hätte diese Mehrdeutigkeit bewahrt. Typen, Felder und Protokollmitglieder bei einer redaktionellen Bereinigung umzubenennen hätte dagegen Verträge geändert, deren Änderung das Formulierungsproblem nicht erforderte.

## Entscheidung

Gepflegte Prosa benennt den genauen Akteur, die Aktion, die Quelle, das Ereignis, das Feld, die Datei oder den Prozess, den der lokale Vertrag braucht. Sie sagt, was aufgezeichnet wurde und wer oder was es aufgezeichnet hat. Autoren wenden eine Umgangssprachen-Prüfung an und ersetzen Wörter, die sie nicht verwenden würden, wenn sie einem Kollegen denselben Punkt erklärten.

Die Regel gilt für Markdown, READMEs, aktive Agent Notes, JSDoc und Kommentare, Prompts, Diagnostik und nutzersichtbare Zeichenketten. Ein Audit beurteilt jeden Satz einzeln; es ersetzt keinen Begriff repositoryweit durch ein bevorzugtes Synonym. Der bearbeitete Satz bewahrt Akteur, Aktion, Bedingungen, Reihenfolge, Modalität, Ausnahmen, Zuständigkeit, Fehlerverhalten und Konsequenzen.

Kommentare behalten nur Fakten, die der nahe Code nicht ausdrücken kann. Dokumentation bleibt auf ihrer zuständigen Ebene und lässt privaten Kontrollfluss und seltene Implementierungsfälle weg, sofern sie nicht unterstütztes Verhalten, sichere Nutzung, Kompatibilität, Datenintegrität, Sicherheit oder einen anderen gepflegten Vertrag ändern. Der [Vereinfachungs-Workflow](../../../skills/dsh-find-simplifications/SKILL.md) wendet diese Regel an, während er Code und Prosa gemeinsam durchmustert.

Exakte Code-Bezeichner, öffentliche APIs, dauerhafte Felder, Protokollmitglieder, Typnamen, Überschriften mit externen Referenzen und Dateinamen bleiben unverändert, sofern nicht eine unabhängig erforderliche koordinierte Vertragsumbenennung es verlangt. Die umgebende Prosa erklärt ihre Felder oder ihr Verhalten direkt. Generierte Dokumente und Kataloge werden aus ihrer zuständigen Quelle aktualisiert.

Bevor sie `contract`, `boundary` oder `shape` verwenden, prüfen Autoren, ob der Satz eine spezifischere Regel, Operation, Datenstruktur, Feldmenge, Validierungsstelle, Zeitstelle, API, einen Typ oder eine Fehlerbedingung meint. `Contract` bleibt korrekt für Vorbedingungen, Nachbedingungen, Invarianten, Kompatibilitätsversprechen und andere Verpflichtungen, auf die sich Aufrufer, Aufgerufene, Implementierer, Provider, Produzenten oder Consumer verlassen. `Boundary` bleibt korrekt für eine wörtliche Sicherheits-, Vertrauens-, Wire-, Prozess-, Serialisierungs-, Transaktions- oder Lebenszyklusgrenze. `Shape` bleibt korrekt, wenn die strukturelle Form selbst das Thema ist und kein engerer Begriff wie Felder, Schema, Typ, Union-Variante, Dateilayout oder Exportform den Sachverhalt ausdrückt. Code- und API-Namen, die diese Wörter enthalten, bleiben unverändert, sofern nicht eine separate koordinierte Umbenennung erforderlich ist.

Diese Entscheidung ergänzt die Entscheidung zu [Dokumentationsebenen und Budgets](2026-07-04-doc-tiers-and-budgets.de.md), die weiterhin Platzierung, Dokumentform und Wortbudgets steuert.

## Erwogene Alternativen

**Eine feste Wortliste verbieten.** Abgelehnt, weil ein Wort ein exakter Bezeichner oder der klarste Ausdruck in einem anderen Vertrag sein kann. So sind Aufrufer-/Aufgerufenen-Invarianten echte Verträge, und Prozess- oder Wire-Grenzen bezeichnen echte Trennungen. Die Prüfung auf Satzebene erkennt Mehrdeutigkeit, ohne gültige Namen abzulehnen.

**Jedes abstrakte Label durch „Quelle", „Ursprung" oder „Metadaten" ersetzen.** Abgelehnt, weil ein anderes weites Label Leser weiterhin raten lässt, ob der Satz eine Datei, einen Aufrufer, eine Event-Seq, ein Provider-/Modell-Paar, einen Commit oder einen Build-Job meint.

**Jeden passenden Bezeichner zusammen mit der Prosa umbenennen.** Abgelehnt, weil redaktionelle Klarheit keine unverbundenen API-, Protokoll-, Dauerformat-, Typ- oder Dateimigrationen rechtfertigt. Diese Änderungen erfordern ein eigenes Consumer-Audit und eine eigene Entscheidung.

## Konsequenzen

Dokumentation und Diagnostik dürfen ein paar Wörter mehr verwenden, aber jede Aussage sagt den Lesern, welcher Wert oder Prozess gemeint ist, ohne dass sie den Quelltext prüfen müssen. Repositoryweite Prosa-Audits erfordern semantische Klassifizierung und können kein blindes Ersetzen einsetzen. Zweisprachige Gegenseiten bewahren dasselbe konkrete Faktum, und generierte Kopien werden erst aktualisiert, nachdem sich ihre zuständige Quelle geändert hat.
