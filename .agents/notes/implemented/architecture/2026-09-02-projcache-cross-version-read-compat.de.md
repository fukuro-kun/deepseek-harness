# Agent Note: Vorgänger-Wiederherstellung des Projection-Cache und Bindung an das Session-Format (session_projcache v3-v6 → v7)
[English](2026-09-02-projcache-cross-version-read-compat.md) | [中文](2026-09-02-projcache-cross-version-read-compat.zh.md) | Deutsch

Status: implemented


## Problem

Die Storage-Domain `session_projcache` hat mehrere On-Disk-Generationen durchlaufen. Ein aktualisiertes DSH_HOME barg drei Risiken:

- **Ein v3-Single-File-Home blockierte den Start nach dem Upgrade**: der Legacy-Bootstrap des Per-Record-Layouts migrierte die alte Whole-Unit-Datei, ohne deren `unit.version` zu prüfen, und stempelte die alten Records mit der aktuellen Version in den neuen Baum; die Per-Record-Zod-Validierung der Domain-Ebene beim Öffnen stieß dann auf die fehlenden, inzwischen Pflichtfelder → `invalid-record` → die gesamte Domain verweigerte das Öffnen → der Plugin-Baum lud nicht. Und weil der Bootstrap vor der Validierung schreibt, **schrieb der erste Boot die fehlerhaften Dokumente dauerhaft in den neuen Baum** („Poisoning") — jeder spätere Boot sah einen nicht-leeren Baum, nahm den Legacy-Pfad nie wieder, und das Home blieb unbrauchbar.
- **Ein v4-Per-Record-Home verlor nach dem Upgrade seine Listing-Titel**: v4-Dokumente wurden vom Version-Stamp-Check stillschweigend verworfen (der Per-Record-Contract), und SessionList ist ein Zero-I/O-Read nur aus dem Cache, sodass ein Miss die Zeile ohne Projektionen lieferte; Titel kehrten erst zurück, wenn jede Session einzeln neu geöffnet wurde.
- **Ein Session-Format-Bump konnte einen unter älterer Event-Semantik erzeugten Fold wiederverwenden**: die Versionen 3 bis 6 zeichneten die Session-Format-Generation nicht auf. Eine fehlende Generation als aktuell zu behandeln, hätte eine Cache-Zeile an einer begrenzten historischen Normalisierung oder einer die Kardinalität ändernden Migration vorbeilassen können.

Der eigene Contract der Cache-Domain lautet „ein stale oder unlesbarer Cache kostet einen längeren Tail-Replay, nie einen falschen Wert, nie einen verweigerten Load" — der Hard-Failure und das pauschale Verwerfen brachen jeweils die erste Hälfte dieses Contracts oder die Produkterwartung.

## Die On-Disk-Generationen

| Domain-Version | ausgeliefert in | Layout | On-Disk-Form | Identity-Felder | Zeilenfelder |
|---|---|---|---|---|---|
| 3 | 0.1.1-rc.2 | single | eine Datei `storages/session_projcache.json` (`{unit:{name,version}, global, tables}`) | `createdAt`, `cwd?` | `ver`, `seq`, `val` |
| 4 | 0.1.2-alpha.3 | per-record | eine Datei pro Session `storages/session_projcache/sessions/<sessionId>.json` (`{version, record}`) | `createdAt`, `cwd?` | gleich |
| 5 | 0.1.2-alpha.4 | per-record | wie v4 | + `isSeeded` (ausgeliefert als required; jetzt optional), `inheritedEventCount` (gleich) | gleich (`seq`-Zahlen bedeuten dasselbe wie bei v4; es wurden nur Type Brands hinzugefügt) |
| 6 | pre-v1 mainline | per-record | wie v5 | wie v5 | gleich |
| 7 | aktuell | per-record | wie v5 | + `formatVersion`; aktuelle Writes verlangen zusätzlich beide Lineage-Felder | gleich |

Der einzige substanzielle Unterschied von v4 zu v5 sind die beiden Lineage-Identity-Felder; v6 änderte nur den Write-Stamp. Die `ver/seq/val`-Zeilenrepräsentation ist über diese Vorgänger-Generationen hinweg identisch, und die `seq`-Nummerierung änderte sich nicht ([die Agent Note zu seq/offset brands vom 2026-08-31](../../archived/architecture/2026-08-31-session-sequence-and-log-offset-brands.md) hält fest, dass die On-Disk-Zahlen unverändert bleiben). v3→v4 war eine Layout-Migration mit identischem Record-Inhalt. Version 7 fügt die Session-Format-Generation zur Cache-Identität hinzu, weil Zeilensemantik nicht aus dem Domain-Stamp abgeleitet werden kann.

Es existiert auch eine abgeleitete Form: ein v3-Home, das einmal mit dem v5-Build lief (der vergiftete Zustand) — dessen neuer Baum enthält Dokumente **mit Stamp 5, deren Inhalt ein v3-Record ist** (keine Lineage-Felder).

## Entscheidung

Deklarierte Read-Kompatibilität — Reads tolerieren verbürgte ältere Versionen, Writes stempeln immer die aktuelle:

1. **`DomainSpec.compatibleVersions` (neu, optional)**: der Domain-Eigentümer deklariert „unter diesen älteren Versionen gespeicherte Records sind unter den aktuellen Record-Schemas ebenfalls lesbar" (typischerweise indem die Felder, die alten Records fehlen, als optional deklariert werden). `defineDomain` validiert jeden Eintrag als nicht-negative Ganzzahl unterhalb der aktuellen Version; `descriptorOf` projiziert die Menge auf das `KvUnitDescriptor` des Backends.
2. **Per-Record-Reads des json-Backends** akzeptieren Version-Stamps in „current ∪ compatibleVersions"; alles außerhalb der Menge wird weiterhin als fremd verworfen. **Der Write-Pfad stempelt immer die aktuelle Version** (der erste Checkpoint nach dem Lesen eines alten Records hebt ihn natürlicherweise an). Das `single`-Layout bleibt exakt-versioniert.
3. **Version-Gate des Legacy-Bootstraps (der eigentliche Bugfix)**: die `unit.version` der alten Whole-Unit-Datei muss innerhalb der akzeptierten Menge liegen, um migriert zu werden; andernfalls bleibt die Datei unberührt und die Unit liest leer — das Stempeln von Records, für die der Eigentümer sich nie verbürgt hat, verwandelt einen verwerfbaren stale Cache in harte Schema-Fehler auf Domain-Ebene.
4. **Die Projcache-Domain deklariert `version: 7, compatibleVersions: [3, 4, 5, 6]`**, und die Format- und Lineage-Identity-Felder sind im gespeicherten Schema optional, damit verbürgte Vorgänger-Records öffnen können. Aktuelle Writes enthalten immer alle drei Felder.
5. **Identity-Matching ist strenger als strukturelle Zulassung**: ein fehlendes `formatVersion` matcht nie eine aktuelle Session, sodass Vorgänger-Zeilen keine Projektion seeden können und aus dem autoritativen Log neu gefaltet werden. Sobald das Format matcht, normalisiert `identityMatches` fehlende Lineage zu unseeded (`?? false` / `?? 0`): exakt für eine unseeded Session, während eine seeded Erwartung den Match scheitern lässt. Vergiftete v5-Homes booten daher sicher, aber ihre ungebundenen Zeilen werden nicht als aktuelle Werte ausgespielt.
6. **Schema-Validierungs-Backstop: `invalidRecords: 'backup-and-skip'` (nur von dieser Domain deklariert)**. Ein gespeicherter Record, der jenseits der Read-Kompatibilität weiterhin nicht parst, verweigert nicht mehr die gesamte Domain: die Domain-Ebene ruft das `KvUnit.backupRecord` des Backends auf (json-Per-Record-Implementierung = Umbenennen des Dokuments zu `<key>.json.bak.<YYYYMMDDHHmm>`, Bytes bleiben erhalten, werden nie wieder gelesen), gibt den konkreten Fehler per `logger.error` aus (Domain, Tabelle, Key, Ziel, Zod-Ursache) und setzt das Öffnen mit abwesendem Record fort; der nächste Cold-Read baut den Cache dieser Session neu auf und schreibt ihn neu. **Die Policy ist eine explizite Per-Domain-Deklaration, und der Default bleibt Fail-loud** — andere Domains verweigern bei ungültigen gespeicherten Daten weiterhin den gesamten Load, und ein Backend ohne `backupRecord` (single-Layout, Row-Stores) fällt ebenfalls auf Fail-loud zurück. Namensgeschichte: quarantine → backup-and-skip (Nutzerentscheid: das Wort muss sowohl „back up" als auch „skip" tragen und die Wurzel mit dem `.bak`-Suffix teilen; skip-backup wurde abgelehnt, weil die CLI-Konvention `--skip-X` es als „nicht sichern" liest). Für diese Domain löst sie den Reset/Destroy-Recovery-Pfad des [Storage-Recovery-Proposals vom 2026-07-28](../../proposed/architecture/2026-07-28-storage-root-and-derived-medium-recovery.de.md) ab, der für autoritative und Medium-weite Schäden weiterhin gilt.
7. **Ein Vorgänger-Titel ist ein Listing-Hinweis, kein Fold-Shortcut**: der Session-List-Start bleibt metadata-/cache-only und öffnet nie kalte Log-Bodies. Der Log-Header ist autoritativ; ein lebenszykluspassender Checkpoint ist ein Durable-Prefix-Zeuge, der dem Log hinterherhinken, ihm aber nie voraus sein darf. `cachedPredecessorTitle` exponiert daher nur eine Vorgänger-`title`-Zeile, die weiterhin `stateVersion` und Schema der aktuellen Titel-Unit besteht. Beide angrenzenden Session-Format-Kanten erhalten den Titeltext. Der Hinweis verwendet `asOfSeq: -1` statt der gespeicherten Zeilen-Sequenz, weil eine kardinalitätsändernde Log-Migration diese Koordinate neu belegen kann. Andere Vorgänger-Zeilen bleiben verborgen, und `hydratePrepared`/`coldSnapshot` behalten strikte Format-Identität, weil Normalizer Werte wie `blank` oder `lastPromptAt` ändern können, selbst wenn der Storage physisch konsistent ist.

### Disposition v3-v6 → v7

Die Versionen 3 bis 6 bleiben strukturell lesbar, weil ihre Record- und Zeilenrepräsentationen gültige Eingaben des aktuellen Schemas sind. Ihren Identitäten fehlt `formatVersion`, sodass sie bewusst als aktuelle Fold-Shortcuts unbrauchbar sind. Ein unseeded, lebenszykluspassender Record kann der Zero-I/O-Listung weiterhin seinen versionskompatiblen Titel liefern; er kann keinen autoritativen Seed liefern. Ein Cold-Read oder Live-Checkpoint baut die Werte aus dem migrierten Session-Log neu auf und schreibt einen v7-Record mit vollständiger Format- und Lineage-Identität. Beim Start läuft keine eager Wert-Migration; ein schema-ungültiger akzeptierter Record folgt `backup-and-skip`.

### Upgrade-Matrix

| Home-Form | Verhalten nach dem Fix |
|---|---|
| v3 single-file (nicht vergiftet) | Bootstrap migriert (3 ∈ akzeptierte Menge) → Boot gelingt; kompatibler Titel ist listen-sichtbar, ungebundener Fold wartet auf Cold-Rebuild |
| v3 + vergifteter neuer Baum | New-Tree-Dokumente parsen unter optionalen Feldern → Boot wiederhergestellt; kompatibler Titel ist listen-sichtbar, ungebundener Fold wartet auf Cold-Rebuild |
| v4/v5/v6 per-record | Dokumente lesen strukturell → fehlende Format-Generation weist den Fold-Shortcut ab; kompatibler Titel ist listen-sichtbar; aktueller Checkpoint schreibt v7 |
| v7 aktuell mit matchender Identität | gecachte Werte werden normal ausgespielt |
| format-matchender Record ohne Lineage | unseeded Caller darf ihn nutzen; seeded Caller weist ihn ab und faltet kalt neu |

## Erwogene Alternativen

- **Vorgänger-Stamps in der Storage-Ebene ablehnen**: sicher für Projektionen, verhindert aber den abgesicherten Legacy-Bootstrap und verliert die Fähigkeit, einen strukturell intakten Record zu behalten, bis ein autoritativer Refold ihn ersetzt. Strukturelle Zulassung plus semantische Identity-Ablehnung hält den Boot wiederherstellbar, ohne einen unbewiesenen Wert auszuspielen.
- **Eine fehlende Format-Generation für jede Verwendung als aktuell behandeln**: erhält gecachte Werte, lässt aber einen Pre-Migration-Fold an der Session-Format-Kante vorbei. Abgelehnt, weil v0→v1 begrenzte historische Normalizer enthält und spätere Kanten die Event-Kardinalität ändern können. Der reine Titel-Listing-Hinweis ist enger: er seedet keinen Fold, und Titeltext ist über die installierten Kanten hinweg invariant.
- **Schema-`.default()`-Füllungen**: verhaltensäquivalent zu optional + Reader-Normalisierung, brennt aber die Interpretation „abwesend = unseeded" in den Output-Typ des durable Schemas ein; optional wurde gewählt — das Schema beschreibt ehrlich jede akzeptierte On-Disk-Form, und die Interpretation lebt beim Consumer (Nutzerentscheid, 2026-09-02).
- **Domain-Version zurück auf 4 rollen**: ein kleiner Diff, bricht aber die Versions-Monotonie, hängt selbst vom Bug „bootstrap skips no versions" ab und verwirft den Cache jedes vergifteten und gesunden v5-Homes.

## Konsequenzen

- Ein Deployment, das diese Domain an das sqlite-Backend routet, bekommt nichts von der Toleranz: sqlite implementiert weder `compatibleVersions` noch `backupRecord`, sodass das Verhalten auf die alte Strict-Version-Semantik zurückfällt (ein Whole-Unit-Versionskonflikt verweigert weiterhin mit `version-mismatch`; nichts lockert sich, nichts spielt falsche Werte aus). Ausgelieferte Kompositionen routen diese Domain an json, sodass dies nur ein Deployment-Konfigurationsrisiko bleibt.
- Das optionale Format-Feld lässt Vorgänger-Records die strukturelle Validierung passieren, aber Abwesenheit scheitert immer am aktuellen Identity-Matching. Optionale Lineage wird erst normalisiert, nachdem das Format matcht; ein seeded Caller verweigert weiterhin einen lineage-losen Record. Der Per-Row-`ver`-Guard filtert weiterhin jeden ausgespielten Wert.
- `backupRecord` überschreibt ein Backup desselben Keys in derselben Minute (die neueren Bytes gewinnen); unterschiedliche Minuten und unterschiedliche Keys kollidieren nie.

## Tests

- `storage-json`-Unit-Tests: Compat-gestempelte Reads / Discards außerhalb der Menge / Writes mit aktuellem Stamp; Legacy-Bootstrap migriert nur akzeptierte Versionen (einschließlich der Assertion, dass migrierte Dokumente den aktuellen Stamp tragen); `backupRecord`-Move / abwesender Read / Rewrite / Closed-Guard.
- `storage-domain`-Unit-Tests: Validierung der `compatibleVersions`-/`invalidRecords`-Deklaration; Backup-and-Skip fällt auf Fail-loud zurück, wenn das Backend kein `backupRecord` hat.
- `session-projection-cache`-Unit-Tests: ein matchendes Format mit fehlender Lineage bedient nur eine unseeded Session; ein Vorgänger-Record ohne Format-Generation kann keinen Fold seeden, darf aber nur seinen kompatiblen Titel-Hinweis liefern.
- **Recovery-Tests mit archivierten Fixtures** (`tests/fixtures.spec.ts` + `tests/fixtures/`): vier Medien-Archive, erzeugt von den echten veröffentlichten Builds — `v3-single-unit.json` (die Whole-Unit-Datei von 0.1.1-rc.2), `v4-session-doc.json` (0.1.2-alpha.3), `v5-session-doc.json` (0.1.2-alpha.4), `v5-lineageless-doc.json` (die vergiftete Form des ungeschützten Bootstraps, aus dem v3-Record synthetisiert) — jedes öffnet durch den echten Storage-Stack, liefert nur seinen kompatiblen Vorgänger-Titel, liefert nie seinen ungebundenen Fold und akzeptiert anschließend einen Live-Write, der es durch einen v7-Record mit vollständiger Identität und frischem Wert ersetzt. Dieselbe Suite beweist Backup-and-Skip für einen schema-fehlschlagenden Record: Boot überlebt, `.bak` landet, die Diagnostik benennt den Fehler, und ein benachbarter Vorgänger-Record bleibt überschreibbar.

Verfahren für künftige Bumps: eine ältere Domain-Version nur dann zu `compatibleVersions` hinzufügen, wenn das aktuelle gespeicherte Schema sie parsen kann, und den zuständigen Reader entscheiden lassen, ob dessen semantische Identität ausreicht. Eine Session-Format-Änderung erbt nie eine fehlende Format-Generation. Das Package-README verlangt, dass jeder Bump mit archivierten Fixtures und Tests landet, die strukturelle Zulassung, semantische Nutzung oder Ablehnung und Rewrite auf die aktuelle Version beweisen.
