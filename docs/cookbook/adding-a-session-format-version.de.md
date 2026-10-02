# Cookbook: Hinzufügen einer Session-Log-Formatversion

[English](adding-a-session-format-version.md) | [中文](adding-a-session-format-version.zh.md) | Deutsch

## Zusammenfassung

Dieses Tutorial führt ein, wie die nächste strukturelle Session-Log-Version eingeführt wird, ohne bereits veröffentlichte Daten umzuschreiben. Lies die [Versions- und Release-Status-Autorität](../session-format-status.de.md), um den Checkout-Writer und das neueste veröffentlichte Format zu ermitteln. N sei das verifizierte veröffentlichte Format und N+1 das Ziel; ersetze diese Platzhalter in Namen und Metadaten durch numerische Werte. Beginne mit einem funktionierenden Contributor-Checkout und lies die [Package-Checkliste](adding-a-package.de.md), die [Format-Bibliothek](../../packages/session/session-format/README.de.md) und die [Entscheidung zum veröffentlichten Format](../../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.de.md).

## Inhaltsverzeichnis

- [1. Version und Release-Basis wählen](#choose-the-version)
- [2. Eine Identity-Edge hinzufügen](#add-an-identity-edge)
- [3. Per-Artifact-Stages und Validierung implementieren](#stages-and-validation)
- [4. Current-Version-Consumer aktualisieren](#current-version-consumers)
- [5. Snapshot-Nachfolger erstellen](#snapshot-successors)
- [6. Das integrierte Ergebnis validieren](#validate)
- [Dev Note](#dev-note)

<a id="choose-the-version"></a>
## 1. Version und Release-Basis wählen

Erhöhe die Formatversion bei einer strukturellen Änderung an Headern, Event-Hüllen, Kern-Event-Semantik oder der Oberflächenrekonstruktion. Gewöhnliche Event-Ergänzungen erfordern keine Erhöhung; folge der [Versionsregel](../../.agents/notes/implemented/architecture/2026-08-10-session-log-version-mechanism.de.md). Unterscheide die Session-Format-Ganzzahl von Package-Release-Versionen, SQLite-schema-Versionen, Projektions-Einheitsversionen und Protokoll-Wrapper-Versionen.

Verwende für N+1 eine gemeinsame `release/*`-Integrationsbasis. Die Basisänderung fügt den Writer, Codec, Catalog-Verdrahtung, Identity-Migration und Verifikation hinzu. Erstelle jeden unabhängigen Child-Branch von dieser Basis und richte sein PR auf den Release-Branch, nicht auf den Branch eines anderen unabhängigen Childs. Jedes Child fügt seine strukturelle Transformation, Validatoren, Consumer und Tests demselben angrenzenden Migrations-Package hinzu. Weise keine zusätzlichen Versionen zu, nur um die Review-Reihenfolge darzustellen. Merge überprüfte Childs über PRs in den Release-Branch und validiere das kombinierte Ergebnis vor dem Release. Beachte den Force-Push- und Löschschutz des Release-Branches; synchronisiere ihn nicht mit Force.

Veröffentlichte Codecs und Migrationssemantik bleiben eingefroren. Ändere keine veröffentlichte Edge, um ein neues strukturelles Feature zu implementieren. Nur die N→N+1-Edge darf koordinierte Änderungen aufnehmen, bevor N+1 ausgeliefert wird; nach dem Release erfordern weitere strukturelle Änderungen die nächste angrenzende Edge.

Verwende für unveröffentlichte N+1-Integrationstests verworfene, isolierte Harness-Homes. Eine Übergangs-N+1-Datei trägt bereits die Ziel-Writer-Version, sodass eine spätere Änderung an N→N+1 diese Datei nicht erneut migriert. Führe ab unverändertem historischem Eingang in einem frischen Test-Home neu aus; repariere dies nie durch Umschreiben einer committeten Generation oder Wiederverwendung eines echten Nutzer-Homes.

<a id="add-an-identity-edge"></a>
## 2. Eine Identity-Edge hinzufügen

Folge der Package-Checkliste, um eine Bibliothek für N→N+1 zu erstellen, kein gemountetes Plugin. Eine Identity-Body-Konvertierung ist nur ein anfängliches Verdrahtungsgerüst. Die [V2-zu-V3-Spezifikation](../../packages/session/session-format-v2-to-v3/README.de.md#v2-to-v3-specification) ist ein festes Beispiel für explizite Transformationen und Erhaltungsregeln, keine Edge zum Erweitern oder Behandeln als Identity-Konvertierung.

Deklariere `dsh.sessionFormatMigration` mit numerischem `from: N` und `to: N+1`, einem Export-Pfad sowie dem exportierten Migration-, Quell-Codec, Ziel-Codec, Ziel-Header-Validator und Ziel-Restorer. Verwende den vom vorherigen Edge-Package exportierten Quell-Codec erneut und hänge von diesem Package ab; kopiere oder redefine keinen veröffentlichten Codec. Exportiere den Ziel-Codec und die Validatoren aus dem neuen Package. Füge die Edge als direkte Abhängigkeit des Catalog hinzu und ergänze die TypeScript-Pfade und Projektreferenzen des Workspace.

Setze `SESSION_FORMAT_VERSION` in den [Core-Session-Typen](../../packages/core/session/src/types.ts) auf N+1 zusammen mit den neuen Edge-Deklarationen und generiere dann den Catalog. Der folgende Befehl erzeugt nur die deklarierte Kette; er implementiert keine neue Version:

```sh
pnpm run gen-session-format-catalog
```

Der [Generator](../../scripts/gen-session-format-catalog.ts) verlangt für jeden Schritt von null bis zur Writer-Version genau ein angrenzendes Package, übereinstimmende Verzeichnis-/Package-Namen, übereinstimmende angrenzende Codec-Exporte und deklarierte Abhängigkeiten. Er lehnt Lücken, doppelte oder zusätzliche Edges, unbekannte Metadaten-Member und einen Catalog ab, der Session nicht über Peer- plus Entwicklungsabhängigkeiten teilt. Korrigiere die Deklarationen statt `generated.ts` von Hand zu bearbeiten. Der Catalog ist build-statisch; Plugin-Mounting darf die historische Lesbarkeit nicht bestimmen.

<a id="stages-and-validation"></a>
## 3. Per-Artifact-Stages und Validierung implementieren

Verwende die [Stage-Interfaces](../../packages/session/session-format/src/types.ts), keinen ganzen Artifact-Array-zu-Array-Migrator. Eine unveränderliche `SessionFormatMigration`-Deklaration stellt `migrateHeader`, `validateTargetHeader` und `createStage` bereit. Jeder Aufruf von `createStage` erzeugt unabhängigen Zustand für ein Quell-Artifact. Halte Zähler, ausstehende Events und Referenz-Maps dort; teile nie eine veränderliche Stage über Sessions.

Implementiere `transformEvent(event, context)`, `transformRun(run, context)` und `finish(context)`. Emitte synchron über `context.emitEvent` oder `context.emitRun`; ein Aufruf kann null, ein oder viele Ausgaben erzeugen. Lass eine Stage Codec-eigene kompakte Runs direkt konsumieren oder iteriere `run.expand()`, ohne ein Zwischen-Array zu materialisieren. Der Aufrufer besitzt die Steuerung, und die Kette beendet vorgelagerte Stages vor nachgelagerten Stages.

Behandle den geerbten Cut als logische Event-Anzahl, nicht als physische Zeilenanzahl. Lege `headerInheritedEventCount` nur offen, wenn es vor EOF bekannt ist; `finish` gibt den exakten Ziel-Cut zurück. Eine vorausgehende kardinalitätsändernde Edge kann diese Anzahl bei der Konstruktion unbekannt machen. Leite sie bei Bedarf aus validierten Seed-Markern ab und teste die seeded Multi-Hop-Wiederherstellung von jeder unterstützten historischen Generation bis N+1, nicht nur direkten N-Eingang. Ersetze niemals einen unbekannten Cut durch null.

Definiere die Event-Admission- und Transformationsregeln der neuen Edge explizit. Der [V2-zu-V3-Quell-Audit](../../packages/session/session-format-v2-to-v3/README.de.md#source-audit) und die [Alpha-V0→V1-Regel](../../.agents/notes/implemented/architecture/2026-08-31-alpha-historical-unknown-event-refusal.de.md) besitzen die Richtlinien dieser veröffentlichten Edges, nicht die der neuen Edge. Verallgemeinere keine von beiden auf jede Edge. Eine Änderung an Struktur oder Event-Positionen erfordert die Klassifizierung von Quell-Events, Payload-Membern und Referenzen und eine explizite Entscheidung, ob opake Daten gültig bleiben können. [Equal-Version-Retention](../../.agents/notes/implemented/architecture/2026-08-30-retain-ignorable-external-session-events.de.md) allein beweist nicht, dass eine strukturelle Transformation sicher ist. Validiere die Ziel-Semantik und gib jedem neu akzeptierten Fall ein ablehnendes Gegenbeispiel; erweitere niemals ältere Edges, um eine nicht unterstützte Transformation zu verbergen.

Beweise strikte Wiederherstellung über `sessionFormatCatalog.createRestore(header, { recovery: 'strict', validation: 'current' })`, indem die Zeilen in Ordnung übergeben und `finish()` aufgerufen wird. Dies übt physisches Decodieren, die vollständige Kette und die installierte aktuelle Session-Validierung aus. Die recoverable/transformed-Richtlinie der Produktion ersetzt nicht die strikte Fixture- und Publikationsverifikation. Erhalte dokumentierte historische Validierungsausnahmen, statt eine strengere Quell-Validierung zu behaupten, als die Edge tatsächlich durchführt.

<a id="current-version-consumers"></a>
## 4. Current-Version-Consumer aktualisieren

Verfolge jeden Current-Version-Consumer, einschließlich Session-Erzeugung/-Wiederherstellung, JSONL-Dateinamenauswahl und -Publikation, den aktuellen Encoder/Restorer des Catalog, die Generation-Identität der Projektions-Cache-Erzeugung, Replay- und Snapshot-Normalisierung sowie TypeScript-/Python-SDK-Aufzeichnungen. Verwende die Writer-Konstante, wo ein Wert „aktuell" bedeutet; behalte literale historische Versionen in veröffentlichten Codecs und historischen Fixtures. Aktualisiere die aktuelle Dokumentation und generierte Referenzen über ihre jeweiligen Eigentümer.

Erhöhe nicht automatisch unverwandte Versionen. Der `sessionFormatVersion` eines Anfrage-Wrappers identifiziert die eingebettete Session-Generation; seine äußere schema-Version hat eine eigene Bedeutung. Projektions-Einheits-Zustandsversionen ersetzen ebenfalls nicht die Session-Generation-Identität des Caches.

Verifiziere Lese- und Schreibpfade. Ein reines Header-Listing darf keine Bodies lesen oder veröffentlichen. Ein historisches Lese-Open darf das migrierte In-Memory-Artifact ohne Schreiben zurückgeben; ein Schreib-Open muss nur den endgültigen aktuellen Nachfolger verifizieren und veröffentlichen, bevor angehängt wird. Quellpfad, Bytes und Inode bleiben unverändert. Eine neuere oder ungültige ausgewählte Generation darf keinen Fallback auf einen Vorgänger verursachen. Die [Vorbereitungs-Entscheidung](../../.agents/notes/implemented/architecture/2026-09-05-read-only-session-migration-preparation.de.md) besitzt die Publikations-Taktung.

<a id="snapshot-successors"></a>
## 5. Snapshot-Nachfolger erstellen

Lies die [Snapshot-Eigentümerschaft](../../snapshots/AGENTS.md) und die [Snapshot-Bibliothek](../../packages/test-support/session-snapshot/README.de.md). Wähle das besitzende Szenario, nicht einen Adapter, der nur darauf verweist. Nach Implementierung von N+1 behalte jede historische Datei und generiere ihren Nachfolger mit dem kanonischen Parent- und Child-Dateinamen der Zielversion. Benenne niemals einen Vorgänger in den Zieldateinamen um oder ändere nur seinen Header.

Verwende bei unverändertem Replay-Eingang ein schlüsselloses Refresh auf dem Eigentümer und dann Replay ohne Zurückschreiben. Diese SDK-Befehle verwenden `text-turn` und die Writer-Version des Checkouts. Implementiere und verdrahte N+1, bevor diese zur Erzeugung dieser Version verwendet werden, und wähle den tatsächlich betroffenen Eigentümer für ein Feature:

```sh
pnpm run test:snapshot:refresh snapshots/sdk/sdk.snapshot.ts -t text-turn
pnpm run test:snapshot snapshots/sdk/sdk.snapshot.ts -t text-turn
```

Prüfe die neue Generation, die Anfrage-Sidecar-Dateien und die Protokollausgabe zusammen. Verifiziere, dass jeder Vorgänger byte-identisch bleibt und dass Parent-/Child-Rollen zusammenhängend bleiben. Die Auswahl verwendet die numerisch höchste Generation, daher aktualisiere gemeinsame Referenzen auf den ausgewählten Parent des Eigentümers. Verwende den Packed-Layout-Migrator nicht als Versions-Upgrader. Wenn sich der Modell-Transcript ändern muss, verwendet der Szenario-Eigentümer eine Live-Aufzeichnung gemäß der [Testrichtlinie](../testing.de.md) mit dem erforderlichen Provider-Schlüssel.

Halte bewusste historische Fälle explizit über `sessionFormat.version` und unterstützte `coverage`-Namen in `snapshot.yml`; Record und Refresh lassen ihre Session-Fixtures unangetastet. Aktualisiere die [Corpus-Richtlinie](../../scripts/session-snapshot-corpus-policy.ts) auf die aktuelle Generation, während du fokussierte direkte-Edge-, Multi-Hop-, Packed-Row-, Retry-/Failure- und Shipped-Profile-Coverage behältst. Prüfe den Corpus und beide SDK-Projektionen; führe kein Massen-Refresh unverwandter Szenarien durch, nur um einen Validierungsfehler zu beheben.

<a id="validate"></a>
## 6. Das integrierte Ergebnis validieren

Führe vom Repository-Root aus. Diese Befehle prüfen Catalog-Deklarationen, Stage-Komposition, die veröffentlichte V2→V3-Edge und die Generationsauswahl. Sie sind eine Grundlinie; füge fokussierte Coverage für die neue Edge hinzu:

```sh
pnpm run verify-session-format-catalog
pnpm exec vitest run scripts/gen-session-format-catalog.spec.ts packages/session/session-format/tests packages/session/session-format-v2-to-v3/tests packages/session/session-format-catalog/tests
pnpm run test:snapshot scripts/session-snapshot-corpus.corpus.ts
```

Nach Implementierung der neuen Edge füge ihren tatsächlichen Test-Pfad zum fokussierten Vitest-Lauf hinzu. Füge die durch den tatsächlichen Diff ausgewählten JSONL-, Replay-, Projektions- und SDK-Tests hinzu, plus den gebauten Publikations-Worker-Smoke, wenn sich dieser Pfad ändert. Fordere erfolgreiche strikte Migration, Identitätserhalt des Skeletts, Ablehnung fehlerhafter und unbekannter erforderlicher Events, deterministische wiederholte Wiederherstellungen, unabhängigen nebenläufigen Stage-Zustand, geseedete Multi-Hop-Cuts, unveränderte Vorgänger und keinen Fallback. Melde exakte Befehle und Fehler, kein abgeleitetes Full-Suite-Ergebnis.

Aktualisiere die [zuständige Agent Note](../../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.de.md) anstatt einen redundanten Entscheidungs-Record hinzuzufügen. Lasse den [Release-Record](../session-format-status.de.md#updating-the-record) bis zur Publikation unverändert; nach der Publikation aktualisiere ihn mit verifizierten Release-Evidenzen. Prüfe verwandte aktive Notes auf Ablösung; behalte unabhängige Begründungen und lasse archivierte Notes eingefroren. Aktualisiere mehrsprachige Prosa zusammen, zeichne jedes geänderte Paar mit dem Repository-Tool neu auf und führe dann die Dokumentationsprüfungen aus:

```sh
pnpm run verify-translation-pairing --write docs/cookbook/adding-a-session-format-version.md
pnpm run test:docs
pnpm run doc-sync
pnpm run lint
git diff --check
```

<a id="dev-note"></a>
## Dev Note

Keine.
