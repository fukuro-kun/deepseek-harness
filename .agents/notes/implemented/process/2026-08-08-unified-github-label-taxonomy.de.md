# Agent Note: Einheitliche GitHub-Label-Taxonomie

Status: implemented

[English](2026-08-08-unified-github-label-taxonomy.md) | [中文](2026-08-08-unified-github-label-taxonomy.zh.md) | Deutsch

## Problem

Pull-Request-Labels beantworten zwei unabhängige Fragen: welche Art von Änderung die Arbeit vornimmt und welche dauerhaften Repository-Domänen sie materiell betrifft. Diese Dimensionen zu vermischen oder gleichbedeutende schlichte und namensraumbasierte Labels beizubehalten, macht Abfragen mehrdeutig, während ein geschlossenes Area-Inventar neue Domänen in ungenaue Kategorien zwingt.

Issues haben bereits einen nativen Issue-Typ und eine separate Source-Taxonomie. Pull-Request-Kind- oder Source-Labels über beide Objekttypen hinweg wiederzuverwenden, dupliziert Metadaten und schwächt die Bedeutung jeder Familie.

## Entscheidung

Jeder offene oder gemergte Pull Request trägt genau ein kanonisches `kind/*`-Label und mindestens ein `area/*`-Label für die materiell betroffenen Bereiche. Geschlossene Pull Requests, die nie gemergt wurden, behalten migrierte historische Zuordnungen, erhalten aber keine erfundene fehlende Klassifikation. Operative Labels können koexistieren, ohne eine der beiden Dimensionen zu erfüllen.

### Kinds

Das Kind-Set ist geschlossen und gegenseitig exklusiv:

| Kind | Bedeutung |
|---|---|
| `kind/feature` | Fügt Verhalten hinzu oder ändert es absichtlich. |
| `kind/bug-fix` | Korrigiert fehlerhaftes Verhalten. |
| `kind/doc` | Macht Dokumentation zur dominanten Absicht. |
| `kind/testing` | Ändert Tests oder Testinfrastruktur, ohne Produktverhalten zu ändern. |
| `kind/cleanup` | Behält Verhalten bei und pflegt oder vereinfacht Implementierung oder Repository-Prozess. |
| `kind/dependency` | Aktualisiert Abhängigkeiten ohne andere dominante Absicht. |

Das Kind erfasst die dominante Absicht. Begleitende Tests, Dokumentation, Cleanup oder Dependency-Bewegungen setzen sich nicht über ein Feature oder einen Bugfix hinweg. Ein neues Kind ändert diese Klassifikationsregeln und erfordert eine explizite Taxonomie- und Policy-Änderung.

Die Repository-Policy lehnt nicht unterstützte `kind/*`-Werte ab und reserviert jeden Alias, den die Vereinheitlichung entfernt hat: `kind/bug`, `kind/documentation`, `feature`, `bug-fix`, `doc`, `cleanup`, `testing`, `dependencies`, `ci`, `cli`, `llm` und `web-search`. Das exakte Reservieren des migrierten Sets verhindert, dass ein veraltetes Synonym als scheinbar unverbundenes operatives Label neu angelegt wird.

### Areas

Areas benennen dauerhafte Produkt- oder Engineering-Themen, nicht temporäre Initiativen, Zuständigkeiten oder jeden nur beiläufig berührten Pfad. Ein Pull Request trägt mehrere Areas, wenn er unterschiedliches Verhalten oder APIs ändert, kombiniert aber kein Umbrella- und ein engeres Label für dieselbe Änderung. GitHubs aktuelle `area/*`-Namen und -Beschreibungen besitzen das aktuelle Inventar; dieser Record definiert Auswahlfälle, die sich in kurzen Label-Beschreibungen nicht zuverlässig unterbringen lassen.

- `area/web` deckt Browser- und Electron-Oberflächen ab, `area/vscode` die Editor-Extension, und `area/api` schnittstellenübergreifende Protokolle und Sprach-SDKs.
- `area/planning` deckt Goals, Plans, Todos und Scheduling ab, während `area/workflow` ausführbare Workflows und Background-Job-Runtimes abdeckt.
- `area/artifact` bündelt bewusst Artifacts, Attachments und multimodale Auslieferung. Eine Aufteilung der Labels wird erst begründet, wenn diese Belange wieder unabhängige Reviews oder Abfragen brauchen.
- `area/tools` gilt für generische Registry-, Schema- und Ausführungs-Contracts. Eine konkrete Capability nutzt ihr eigenes Area, es sei denn, sie ändert auch einen dieser Contracts.
- `area/hooks` meint die Claude-Code- und Codex-Bridges, `area/infra` deckt Build, Release, CI, Repository-Gates, Generatoren, Abhängigkeiten und Developer-Tooling ab, und `area/windows` deckt native Windows-Produktunterstützung ab, nicht die Auswahl des CI-Runners.

Das Area-Set ist bewusst erweiterbar. Wenn keine bestehende Beschreibung eine dauerhafte und wiederverwendbare Domäne ehrlich abdeckt, darf ein Agent ohne separate Genehmigung ein prägnantes `area/<lowercase-kebab-case>`-Label anlegen. Er darf kein Area für einen einzelnen Pull Request, einen beiläufigen Pfad, ein temporäres Projekt, einen Status oder eine Person oder ein Team anlegen, und er meldet dem Anfragenden das neue Label samt Begründung, nachdem er es angewendet hat. Ein ungenaues Area nur wiederzuverwenden, um eine gerechtfertigte Ergänzung zu vermeiden, ist nicht akzeptabel.

### Issues und Migrationen

Issues verwenden den nativen Issue-Typ statt `kind/*`; ihre `area/*`-Labels bleiben optional. `source/*`-Labels erfassen, wie ein Issue erstellt wurde, und gelten nicht für Pull Requests. Priorität, GitHub-Defaults und Workflow-Trigger bleiben unabhängige operative Metadaten.

Der Repository-Lifecycle entfernt Pull-Request-`kind/*`-Labels und reservierte Aliase von einem Issue, bevor er es auditet. Policy-Kommentare melden nur Verstöße, deren beabsichtigter Wert nicht aus dem Issue abgeleitet werden kann, etwa ein fehlender nativer Typ oder eine nicht unterstützte Priorität.

Label-Migrationen bewahren die Bedeutung, bevor Aliase entfernt werden: zuerst den kanonischen Ersatz hinzufügen, das Labelable verifizieren, dann die veraltete Zuordnung entfernen. Ein Label wird erst gelöscht, wenn kein Pull Request und kein Issue es mehr nutzt, und unverbundene Labels werden nie als Set ersetzt.

## Berücksichtigte Alternativen

**Unpräfixierte Labels.** Schlichte Namen reduzieren visuelles Rauschen, zeigen aber nicht, ob ein Label Absicht, Domäne, Herkunft, Priorität oder Automatisierung klassifiziert. Sowohl schlichte als auch namensraumbasierte Synonyme zu behalten, macht Abfragen und Policy-Durchsetzung mehrdeutig.

**Ein undifferenziertes Label-Set.** Das Vorhandensein eines Labels bewiese nicht, dass sowohl Absicht als auch semantischer Scope bedacht wurden.

**Eine feste Area-Allowlist in der Repository-Policy.** Dauerhafte Repository-Domänen entwickeln sich weiter. Der `area/*`-Namensraum bleibt maschinell erkennbar, während die aktuellen Beschreibungen das erweiterbare Inventar tragen.

**Paket- oder pfadabgeleitete Areas.** Areas beschreiben semantische Wirkung über Paketgrenzen hinweg, während geänderte Pfade beiläufige Tests, Dokumentation und Hilfsdateien umfassen.

**Separate Labels für jede Auslieferungshülle oder jeden Medien-Lebenszyklus.** Browser- und Electron-Auslieferung teilen sich eine grafische Domäne, und Artifact, Attachment und multimodale Auslieferung teilen sich derzeit eine Review-/Query-Domäne. Eine Aufteilung gehört nur dann in eine spätere Taxonomie-Änderung, wenn sie nützliche unabhängige Klassifikation wiederherstellt.

**Breite Implementierungslabels statt Produkt- oder Engineering-Themen.** Eine konkrete Capability ist nicht bloß ihre Tool-, Interface-, Filesystem- oder Prozess-Implementierung. Generische Implementierungs-Areas gelten nur, wenn sich ihr eigenes Verhalten oder ihre API ändert.

**Kinds auf Issues.** Der native Issue-Typ besitzt diese Klassifikation bereits; sie als Label zu duplizieren erzeugt Drift.

**Issue-Durchsetzung nur per Kommentar.** Ein Kommentar bewahrt ungültige Metadaten und erfordert menschliche Bereinigung, selbst wenn das einzig gültige Ergebnis das Entfernen ist. Der Lifecycle führt dieses Entfernen durch und behält Kommentare für Entscheidungen, die er nicht ableiten kann.

**Genau ein Area pro Pull Request.** Kohärente Änderungen können mehrere unabhängige APIs oder Verhaltensweisen materiell betreffen, und das Streichen sekundärer Areas verbirgt betroffenen Scope.

## Konsequenzen

Reviewer und Automatisierung können Absicht, semantischen Scope, Erstellungsweg eines Issues, Priorität und operative Trigger unabhängig abfragen. Ungültige Issue-Labels verschwinden ohne Policy-Kommentar, und das Label-Event protokolliert die Reparatur; wenn kein anderer Verstoß verbleibt, löscht der Lifecycle jeden früheren Policy-Kommentar. Maintainer müssen die Änderung und die aktuellen Label-Beschreibungen lesen, statt die Klassifikation aus Titelpräfixen oder Pfaden abzuleiten. Der aktuelle Katalog, diese Begründung und die Policy-Durchsetzung müssen sich gemeinsam bewegen, wenn sich ein Kind oder eine nicht-triviale Area-Grenze ändert, und Taxonomie-Migrationen verursachen explizite Kosten für historisches Backfill und Verifikation.
