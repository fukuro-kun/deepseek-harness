# Agent Note: Deutsch als gleichberechtigte Paarungssprache etablieren
[English](2026-09-30-german-third-language-translation-pairing.md) | [中文](2026-09-30-german-third-language-translation-pairing.zh.md) | Deutsch

Status: implemented


## Problem

Das Dokumentationskorpus paarte jede englische Quelldatei mit einer einzigen chinesischen Übersetzung: Gate, Manifest, Merge-Treiber und Standard modellierten genau zwei Sprachen. Produktdokumentation wurde auch auf Deutsch benötigt, und ein optionales deutsches Schwesterdokument ohne Gate-Abdeckung hätte Struktur, Links und Sync-Zustand der dritten Sprache unverifiziert gelassen, während es Parität mit den anderen beiden Seiten behauptete.

## Decision

Deutsch ist eine gleichberechtigte dritte Sprache des Übersetzungs-Paarungsvertrags. Ein Paar besteht aus `foo.md`, `foo.zh.md`, `foo.de.md` und `foo.i18n.yaml`; alle drei Sprachen tragen gleiche Autorität, spiegeln die Struktur der anderen und halten generierte Regionen byte-identisch, abgesehen von den Regionspfaden. Die Konsistenz-Record hält drei Blob-Hashes für ein konvertiertes Paar und zwei für ein Paar, dessen deutsche Seite noch aussteht.

`verify-translation-pairing` verifiziert die trilinguale Struktur: den kanonischen Switcher auf jeder Seite, die strukturelle Signatur und das Link-Lokale jeder Seite. Eine Seite verlinkt ihre eigene Lokale-Schwester; ein `.de.md`-Ziel löst sich über seine bestehende Paar-Quelle auf, solange der Rollout es noch schuldet, sodass ein konvertiertes Dokument auf ein Ziel verweisen kann, dessen deutsche Seite noch nicht geschrieben ist. Ein veralteter `pending-german`-Eintrag für ein konvertiertes Paar ist ein Gate-Fehler.

Die `pending-german`-Liste im Manifest verfolgt die Paare, die vor der deutschen Seite entstanden sind. Jedes Dokument im Scope, aktuell und zukünftig, merge als komplettes trilinguales Paar; die Liste ist die sanktionierte temporäre Ausnahme, und die Konvertierung eines Paares ist eine Änderung, die die deutsche Seite hinzufügt, die Switcher auf die trilinguale Form aktualisiert, den Manifest-Eintrag entfernt und die drei Hashes neu aufzeichnet. Der Pairing-Merge-Treiber verweigert ein Merge, das eine 2-Hash-Record mit einer 3-Hash-Record mischen würde, sodass eine Konvertierung nie still gegen eine veraltete Record komponiert.

Die deutsche Seite folgt dem Lightweight-Pfad: ein struktureller Spiegel, verifiziert vom Gate, ohne dedizierte Prompt/Brief-Pipeline, ohne deutsche Spalte im Terminologielexikon und ohne Stilexemplare, bis der Korpus-Rollout sie liefert. Die [Agent Note zu automatischen Pairing-Merges](2026-08-08-automatic-translation-pairing-merges.de.md) besitzt den Merge-Mechanismus und bleibt unverändert; sie trägt die trilingualen Records.

## Alternatives considered

**Deutsch als optionales, ungatedes Schwesterdokument hinzufügen.** Ein ungeprüftes drittes Dokument würde sich von der Struktur und den Links des Paares lösen, während das Gate weiterhin nur zwei Seiten zertifiziert; Paritätsbehauptungen würden die Verifikation überholen.

**Das ganze Korpus in dieser Änderung konvertieren.** Das Korpus umfasst Hunderte von Paaren; eine einmalige Konvertierung würde den Sprachstandard an einen Massenübersetzungsprozess koppeln und dessen Landung an der Übersetzungs-Throughput hängen lassen. Die `pending-german`-Liste verfolgt den Rollout stattdessen.

**Deutsch unter Englisch und Chinesisch einreihen.** Der Pairing-Vertrag gibt jeder Sprache gleiche Autorität und einen strukturellen Spiegel; eine abgeleitete dritte Sprache bräuchte ihre eigene Sync-Richtung und ihre eigene Failure-Fläche ohne Vorteil gegenüber dem bestehenden Modell.

## Consequences

- Jedes neue Dokument im Scope ist bei der Erstellung ein komplettes Tripel; das Gate schlägt ein konvertiertes Paar fehl, dem eine Seite fehlt.
- Konvertierungen werden pro Paar mit `pnpm run verify-translation-pairing --write` aufgezeichnet; die Record eines konvertierten Paares hält drei Hashes, und sein `pending-german`-Eintrag wird entfernt.
- Der Merge-Treiber verweigert es, eine 2-Hash-Record mit einer 3-Hash-Record zu komponieren, sodass eine parallele Konvertierung als expliziter Konflikt auftritt.
- Die `pending-german`-Zahl ist die restliche Arbeit des Korpus; `pnpm run verify-translation-pairing --list` berichtet den aktuellen Zustand jedes Dokuments im Scope.
- Die Prompt/Brief-Pipeline, die deutsche Spalte im Terminologielexikon und die deutschen Stilexemplare bleiben dem Korpus-Rollout vorbehalten, wie im [Standard](../../../../docs/i18n/README.de.md) festgehalten.
