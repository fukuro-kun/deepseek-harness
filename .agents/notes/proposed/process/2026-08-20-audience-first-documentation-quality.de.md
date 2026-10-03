# Agent Note: Audience-first-Dokumentations-Qualitätskriterien

Status: proposed

[English](2026-08-20-audience-first-documentation-quality.md) | [中文](2026-08-20-audience-first-documentation-quality.zh.md) | Deutsch

## Problem

Das Dokumentations-System hat starke Platzierungs-, Freshness-, Link-, Bilingual- und Source-Äquivalenz-Checks, definiert aber „knapp, intuitiv und freundlich" nicht als reviewbare Ergebnisse für Nutzer, Neueinsteiger, Entwickler und Agents. Alle `doc-sync`-Checks und Übersetzungspaare bestehen, während die folgenden Designprobleme bleiben. Die ersten drei Befunde sind die Design-Prioritäten; der Kapazitätsbefund erklärt, warum das Hinzufügen weiterer stehender Regeln sie nicht lösen wird.

### Semantische Korrektheit kann ohne aktuellen Owner bestehen

Die Gates beweisen Struktur und generierte Freshness, nicht dass gepflegte Prosa immer noch den live-Mechanismus benennt. Der frühere `dsh-doc-site-sync`-Skill sagte Autoren, eine nicht existente `en-docs`-Sidebar wiederzuverwenden und Sektionen zu einer entfernten `sectionOrder` hinzuzufügen; [website/docs.ts](../../../../website/docs.ts) besitzt `en-guide`, `en-develop`, `en-reference` und `sections`. Die implementierte [Product-first-README-Entscheidung](../../archived/process/2026-07-22-product-first-root-readme.md) beschreibt eine interne Test-Ankündigung und ACP-, Python- und JSON-RPC-Flächen-Sektionen, die aus der [Root-README](../../../../README.de.md) fehlen, obwohl implementierte Agent Notes ausgelieferte Fakten verfolgen müssen.

Die Budget-Policy hat dieselbe Spaltung. [docs/AGENTS.md](../../../../docs/AGENTS.md#wordcount-budgets) benennt ein 1.800-Wort-Ziel und 5% Headroom für `architecture.md`, aber das [Budget-Manifest](../../../../scripts/doc-budgets.manifest.json) erlaubt 2.400 Wörter, während die Datei 1.313 enthält. Der Budget-Gate besteht, weil er die Manifest-Obergrenze prüft, nicht das Ziel oder die Ratchet-Regel. Hochwirksame Prosa benötigt daher eine benannte Quelle oder einen fokussierten Check, der die Quelle konsumiert; eine zweite handgeschriebene Kopie ist kein Freshness-Mechanismus.

### Leseerfolg ist implizit, nicht testbar

Der Standard klassifiziert Seiten als Tutorials oder Referenzen und bittet Autoren, einen Tutorial-Leser privat zu klassifizieren. Er verlangt keine reviewbare Aussage über den Ausgangszustand des Lesers, das gewünschte Ergebnis, den kürzesten erfolgreichen Pfad, den wahrscheinlichen Fehler oder die nächste nützliche Seite. Ein Dokument kann daher die Tier-Platzierung, Links, Wortlimits und Markdown-Struktur erfüllen, ohne zu beweisen, dass der beabsichtigte Leser die Aufgabe abschließen kann.

Die öffentliche Site macht den Druck sichtbar. Jede Locale veröffentlicht 84 Seiten: 3 Guide-Seiten, 17 Entwickler-Seiten und 63 Referenz-Seiten. Die 13 englischen Dateien unter `docs/user/` enthalten 7.540 Wörter, während 47 Subsystem-Seiten 100.759 Wörter enthalten. Der kurze Web-Quickstart ist ein guter Produkt-Einstieg, aber kein Korpus-Level-Kriterium verifiziert, dass ein Erstnutzer, ein Plugin-Newcomer und ein Maintainer jeweils einen offensichtlichen Pfad von Einstieg zu Ergebnis und Recovery haben.

### Generierte Genauigkeit und Abfragedqualität werden vermischt

Das Repository enthält 19 vollständig generierte englische Markdown-Dateien mit 49.611 Wörtern. Vierundvierzig von 47 Subsystem-Seiten enthalten auch generierte Cordis-Regionen; diese Region tragen 34.622 der 100.759 Wörter der Subsystem-Ebene bei. `config-catalog.md` hat 14.807 Wörter, `tool-catalog.md` hat 10.599, und die größten gemischten Subsystem-Seiten enthalten 5.600–7.781 Wörter.

Dies sind legitime umfassende Referenzen, daher würde ein pauschales Wortlimit Wert löschen. Ihre Generatoren beweisen Vollständigkeit und Freshness, aber der Standard hat kein separates Abfrage-Kriterium für einen Agent mit begrenztem Kontextfenster oder einen Menschen, der eine Antwort sucht. Eine generierte Referenz benötigt eine kompakte Einsteiger-Ebene, stabile Gruppierung, direkte Anker und eine Aufteilungsregel basierend auf Lookup-Kosten; umfassende Details können hinter dieser Einsteiger-Ebene umfassend bleiben.

### Der Standard hat keinen Platz für seine nächste Regel

Die ständige Dokumentations-Datei hat 1.320 Wörter bei einer 1.320-Wörter-Obergrenze und einem benannten 1.250-Wörter-Ziel. Root `AGENTS.md` hat 1.936 Wörter bei einem 1.600-Wörter-Ziel, `packages/AGENTS.md` hat 672 bei 650, und `packages/README.md` hat 969 bei 600. Die eingefrorenen Obergrenzen verhindern weiteres Wachstum, schaffen aber keinen Platz für Audience- und Outcome-Kriterien. Mehr ständige Prosa hinzuzufügen würde das Problem vertiefen, das der Standard verhindern soll.

### Baseline

Das Audit schließt `vendor/`, eingefrorene `.agents/notes/archived/`, aufgezeichnete Snapshots und Fixtures aus. Es zählt 1.042 englische Markdown-Dateien und 986 chinesische Gegenstücke im gepflegten Korpus mit 1.106.138 englischen Wörtern. Aktive Agent Notes stellen 580 Dateien und 637.850 Wörter; Markdown unter `packages/` stellt 276 Dateien und 225.630 Wörter; `docs/` stellt 112 Dateien und 193.456 Wörter. Diese Größen beschreiben Wartungs- und Abfragedruck, sind aber keine Defekte an sich.

Die stärksten Eigenschaften des Systems sollten bleiben: ein Fakten-Owner pro Tier, kanonisches Markdown, das ohne Kopien in die Website projiziert wird, vollständige Bilingual-Paare, generierte Kataloge, die bei Quelländerung fehlschlagen, typ-äquivalente Deklarationen, kompilierbare TypeScript-Beispiele, geprüfte Links und Anker, und package-lokale Model-Experience- und Limitierungs-Verträge. Der Vorschlag ändert Qualitätskriterien und Einstiegsstruktur, nicht diese Garantien.

## Vorschlag

Einen audience-first-Qualitätsvertrag mit fünf Definitionen annehmen:

- **Knapp** bedeutet, der übliche Pfad enthält nur die Fakten, die für sein Ergebnis benötigt werden. Umfassende Verträge bleiben über einen direkten Link oder generiertes Detail verfügbar; Knappheit bedeutet nie, erforderliches Verhalten, Fehler, Ownership oder Limits zu löschen.
- **Intuitiv** bedeutet, die Seite etabliert den Ausgangszustand ihres Lesers, führt Voraussetzungen vor abhängigen Konzepten ein, bietet eine offensichtliche nächste Aktion und verwendet die Produkt- oder Domänenbegriffe, nach denen ein Leser suchen wird.
- **Freundlich** bedeutet, ein Leser kann Erfolg erkennen, das materielle Risiko vor dem Handeln verstehen, vom wahrscheinlichen Fehler recovern und die nächste relevante Tiefe erreichen, ohne zuerst unverwandte Architektur zu lernen.
- **Genau** bedeutet, jeder dauerhafte Anspruch hat einen Owner und einen Verifikationspfad, der seinem Risiko angemessen ist. Generierte Fakten leiten sich aus der Quelle ab; handgeschriebene Workflow-Werte verlinken oder konsumieren ihren Owner, statt Enums und Pfade zu kopieren.
- **Agent-lesebar** bedeutet, Headings, Anker, Terminologie, Ownership und Current-versus-Proposed-Status sind explizit genug, um die benötigte Sektion zu retrieven, ohne ein ganzes Korpus zu laden oder Review-Historie zu rekonstruieren.

### Prototyp-Regeln

Der [dsh-doc-Skill](../../../skills/dsh-doc/SKILL.md) besitzt die erste ausführbare Version dieser Regeln. Das `session-persistence-jsonl`-README-Paar verwendet das ausgelieferte Append-, Recovery- und Encoding-Verhalten als Evidenz, statt seine frühere Prosa als Autorität zu behandeln.

- Jede erstellte Package-README beginnt mit durchsuchbarem YAML. Eine Skill-artige `description` und eine mechanisch abgeleitete `kind` sind erforderlich. Vier Kinds mappen eins-zu-eins auf vier Skill-Vorlagen: `package-group` (Gruppen-Map), `package-reference` (Plugin- oder Service-Package), `package-library` (einfacher Modull-Einstieg) und `package-bundle` (`dsh.bundle.patch`). Der Gegenstück-Pfad, Hashes und die physische Zeilenausrichtung gehören zum merge-sicheren Sidecar und seinem Gate, daher enthält das README-Frontmatter keinen `i18n`-Block. Der Titel oder das Package-Manifest besitzen bereits den Namen, der Dokument-Job drückt seine Audience aus, und Tags bleiben abwesend, bis eine governed Taxonomie und ein Such-Consumer Wert über Volltextsuche hinaus beweisen.
- Erstellte Seiten beginnen mit einer drei-bis-fünf-Sätze-`Summary`, dann mit einem verlinkten `Table of Contents`. Eine englische Package-README-Summary bleibt innerhalb von 100 `wc -w`-artigen Wörtern. Sie beschreibt lesebare Fähigkeit statt Cordis-Rollen, Registrierungen oder interner Komponenten und lässt Quell-Identifikatoren weg, es sei denn, Leser verwenden sie direkt in Konfiguration, Befehlen oder einer öffentlichen API. Format-besitzene Agent Notes, Postmortems, generierte Fragmente und Maschinen-Dateien behalten ihre erforderlichen Skelette.
- Jede substantielle Sektion beginnt mit einer kurzen Orientierung vor Unterabschnitten, Tabellen oder Code, und die Seite fortschreitet von grundlegender Nutzer-Nutzung zu fortgeschrittener Entwickler- und Maintainer-Details.
- Englische technische Prosa verwendet eine ASD-STE100-inspirierte, nicht-zertifizierte Klarheits-Review: explizite Akteure und Aktionen, stabile Begriffe, direkte Verben, getrennte Instruktionen und Bedingungen, und erhaltene Modalität, Ausnahmen, Timing und Zahlen. Die 20-Wörter-Instruktions- und 25-Wörter-Beschreibungs-Limits sind Review-Prompts. Präzision übersteigt sie.
- Package-Verträge bleiben neben Code. Cross-Package-Material bewegt sich absichtlich zu `docs/learn/overview/`, `docs/learn/cordis/`, `docs/learn/practices/`, `docs/user/`, `docs/developer/`, `docs/developer/discussion/`, `docs/scratch/` und der parallelen `docs/subsystems/`-Ebene.
- Englische und chinesische Seiten behalten gleichwertige Autorität, passende Struktur, Links, Code, Frontmatter-Layout und exakte physische Zeilenzahl.
- Inline-Paar-Metadaten sind die Ziel-Ersatz für Sidecars. Der Prototyp kann beide tragen, bis der Verifikator, Merge-Treiber, Recovery-Flow, generierte-Region-Recorder und Archiv-Checks einen nicht-selbst-referenziellen Paar-Digest konsumieren.
- Repository-Root-interne Links sind das Ziel-Autoring-Modell. Der Prototyp behält renderer-gültige relative Links, weil führender `/` derzeit das Repository auf GitHub verlässt, `verify-md-links` umgeht und von der Website nicht projiziert bleibt.
- `Further Exploration` ist eine optionale Newcomer-Route zu drei bis sieben benachbarten Seiten.
- Jede erstellte Seite endet mit `Dev Note`, dem einzigen Platz für aktiven groben Kontext. Er bleibt nicht-autoritativ, verlinkt statt Task-State zu duplizieren, und wird gefördert oder bereinigt, wenn Arbeit schließt.
- Unabhängig durchsuchbare Regeln, Praktiken, Beispiele und Entscheidungen verwenden kleine Dateien unter deskriptiven Ordnern, wenn sie unterschiedliche Owner oder Änderungsrhythmen haben; eng gekoppelte Verpflichtungen bleiben zusammen.

### Kriterien nach Dokumentart

| Dokumentart | Primäres Ergebnis | Erforderliche Einstiegs-Information | Verifikation |
|---|---|---|---|
| Produkt-Quickstart | Eine repräsentative Aufgabe abschließen | Voraussetzungen, ein Startpfad, erster Erfolg, Sicherheitsgrenze, nächster Schritt | Gebauster oder paketierter Smoke für den dokumentierten Pfad plus Link-/Site-Checks |
| Nutzer-Aufgaben-Guide | Eine Nutzer-Aufgabe abschließen oder davon recovern | Ausgangs-UI-/API-Zustand, geordnete Aktionen, beobachtbares Ergebnis, wahrscheinlicher Fehler und Recovery | Verhaltens-Test, Screenshot-Review, wenn visueller Zustand wichtig ist, oder benannter manueller Owner |
| Contributor-Tutorial | Einen geprüften Entwicklungs-Zustand erreichen | Unterstützte Runtime, Setup-Befehle, erwartetes Ergebnis, enge Folgebefehle | Clean-Checkout-Befehl-Smoke in einer unterstützten Umgebung |
| Architektur-Überblick | Das System von einer Seite rekonstruieren | Produkt-Komposition, Owner, Abhängigkeitsrichtung, Extension-Points, Links zu Details | Quell-gestützte Package- oder Graph-Checks plus fokussierte menschliche Review |
| Package- oder Subsystem-Referenz | Einen Vertrag nachschlagen, ohne Implementierung zu lesen | Scope, besitzene Typen oder Verhalten, Fehler, Lifecycle, Limits, verwandte Owner | Bestehende JSDoc, Typ-Äquivalenz, generierte-Region-, README- und Link-Checks |
| Generierte Referenz | Einen exakten Eintrag finden und seine Vollständigkeit vertrauen | Scope, Generierungs-Owner, Gruppierung/Index, stabile Anker, verwandte konzeptionelle Guide | Deterministischer `--check`, Vollständigkeits-Fixture, Site-Build und Abfrage-Größen-Report |
| Agent-Instruktion oder Skill | Einen Workflow ohne veraltete kopierte Werte anwenden | Scope, Autoritäts-Links, erforderliche Entscheidungen, exakte Befehle nur, wenn hier besessen | Metadaten-/Link-Checks und fokussierte Tests für kopierte Maschinen-Werte |
| Vorgeschlagene oder implementierte Agent Note | Eine Entscheidung, einen Trade-off und einen Zustand verstehen | Problem, Vorschlag oder Entscheidung, Alternativen, Akzeptanz oder Konsequenzen | Bestehende Lifecycle-, Format-, Paar- und Supersession-Checks; Review besitzt semantische Aktualität |

Die Tabelle gehört in eine kanonische Qualitäts-Referenz. `docs/AGENTS.md` sollte nur die kurzen ständigen Orders behalten, die immer dann benötigt werden, wenn Dokumentation bearbeitet wird, und auf diese Referenz verlinken. Dies schafft Budget-Headroom, statt einen weiteren vollständigen Standard in den Agent-Kontext zu stellen.

### Ein- und Detail-Ebenen für generierte Referenzen

Jede generierte Referenz sollte eine kompakte Einsteiger-Ebene vor der umfassenden Ausgabe offenlegen: Scope, beabsichtigter Lookup, Gruppierung oder Index, direkte Links zu konzeptioneller Anleitung und der Generierungs-/Check-Befehl. Generatoren sollten Seitenwörter, Eintragsanzahl, Headings-Anzahl und größte Sektion berichten. Eine Seite überschreitet eine Review-Schwelle, wenn ein Lookup das Scannen unverwandter Gruppen erfordert oder wenn eine Seite den Agent-Kontext dominiert; der Owner teilt sie dann nach einer stabilen Domäne auf, die bereits in Quell-Metadaten vorhanden ist, statt nach einem willkürlichen Wort-Schnitt.

Der erste Prototyp sollte einen großen Katalog und eine gemischte Subsystem-Seite verwenden. Er sollte Lookup-Schritte, generierte Diff-Größe, Build-Zeit, Route-Stabilität und den für repräsentative Fragen benötigten Agent-Kontext vergleichen, bevor eine korpus-weite Aufteilung. Bestehende Anker benötigen Aliase, wenn Routen sich bewegen.

### Durchführungs-Slices

1. `dsh-doc` erstellen und validieren, dann eine Package-README-Paar als zeilen-ausgerichtetes, Metadaten-tragendes Prototyp umschreiben, ohne Runtime-Ansprüche zu ändern.
2. Das gerenderte Prototyp mit Newcomer-, Nutzer-, Entwickler- und Agent-Aufgaben reviewen; den Skill revidieren, bevor das Format anderswo erzwungen wird.
3. Enge Metadaten-, Summary-Längen-, Sektions-Reihenfolge-, Zeilen-Ausrichtungs-, Link-Auflösungs- und Paar-Fixtures hinzufügen. Jedes bestehende Package-Summary migrieren, das die akzeptierte Einstiegs-Grenze verletzt, und Sidecars behalten, bis jeder Merge- und Recovery-Consumer Ersatz-Unterstützung hat.
4. Akzeptierte ständige Regeln in eine kanonische Qualitäts-Referenz extrahieren, `docs/AGENTS.md` unter sein Ziel kondensieren und ein kohärentes `docs/`-Thema nach dem anderen mit atomarem Link-/Navigations-Reparatur organisieren.
5. Generierte-Referenz-Ein-/Detail-Trennung auf `config-catalog.md` und `docs/subsystems/core.md` prototypen; bestätigte Muster anderswo nur anwenden, wenn gemessene Lookup-Kosten fallen, ohne verlorene Fakten oder Route-Fluktuation.

Diese Sequenz hält jede Änderung unabhängig reviewbar. Die ersten drei Slices verbessern Kriterien und Package-Einstiege, ohne die breitere Informationsarchitektur zu ändern; das generierte-Dokument-Prototyp liefert Evidenz vor einer breiteren strukturellen Änderung.

Slices 1–3 sind in dieser Form ausgeliefert: `dsh-doc` ist der konsolidierte Standard (`dsh-doc-standards` und `dsh-doc-site-sync` sind in ihn eingegliedert, und der Site-Workflow trägt die korrigierten Sidebar-Werte), das `session-persistence-jsonl`-README-Paar ist das Referenzbeispiel, und `pnpm run test:docs` erzwingt die Metadaten-, Paar- und Schnell-Dokumentations-Checks. Slices 4–5 bleiben offen.

### Nicht-Ziele

Dieser Vorschlag verkürzt keine umfassenden Fakten, merged keine Audience-Tiers, veröffentlicht keine internen Entscheidungs-Records, stellt keinen Agent-Note-Index wieder her, teilt keine eng gekoppelten Regeln um der Dateizahl-Symmetrie willen und behandelt das Audit nicht als Nutzerforschung. Er löscht keine aktuelle Paar- oder Link-Infrastruktur, bevor ihr Ersatz äquivalente Recovery- und Render-Checks besteht.

## In Erwägung gezogene Alternativen

**Eine Wort-Obergrenze für jedes Dokument anwenden.** Abgelehnt, weil umfassende Referenzeilen, öffentliche Verträge und Entscheidungs-Rationale lang und korrekt sein können. Einstiegs-Pfad-Länge und Lookup-Kosten sind die relevanten Constraints für diese Jobs.

**Eine universelle Seitenvorlage oder Audience-Frontmatter verlangen.** Abgelehnt, weil es generated Pages, Package-Referenzen und kurzen Instruktionen Zeremonie hinzufügen würde, ohne Leseerfolg zu beweisen. Der Standard definiert Ergebnisse nach Dokumentart, verwendet `kind` nur, wo es einen konkreten Package-Dokument-Standard auswählt, und fügt nur Felder hinzu, die ein fokussierter Check oder Reviewer konsumiert.

**Lesbarkeits-Scores als Qualitäts-Gate verwenden.** Abgelehnt, weil Formeln exakte technische Begriffe bestrafen und falsche Ownership, fehlendes Fehlerverhalten, veraltete Befehle oder einen gebrochenen Lese-Pfad nicht erkennen können.

**Das gesamte Dokumentations-Korpus sofort umschreiben oder aufteilen.** Abgelehnt, weil das aktuelle System mechanisch gesund ist und viele lange Referenzen angemessenerweise umfassend sind. Die begrenzte Package-Summary-Migration ändert keine Routen oder umfassenden Referenz-Inhalte; größere strukturelle Änderungen erfordern weiterhin gemessene Evidenz.

**Die bestehenden Gates behalten und für Freundlichkeit auf Review vertrauen.** Abgelehnt, weil die veralteten Workflow-Werte und die Budget-Policy-Diskrepanz zeigen, dass Review allein kopierte semantische Ansprüche nicht erhält, und die aktuellen Gates nicht fragen, ob ein Leser eine Aufgabe abschließen kann.

## Akzeptanzkriterien

- Eine kanonische Qualitäts-Referenz definiert knapp, intuitiv, freundlich, genau und agent-lesebare Dokumentation nach Dokumentart.
- `.agents/skills/dsh-doc` validiert und verlinkt direkt seine Metadaten-, Struktur-/Hierarchie- und Review-/Prototyp-Referenzen, ohne ihre detaillierten Regeln in `SKILL.md` zu duplizieren.
- Das `session-persistence-jsonl`-README-Paar demonstriert durchsuchbares YAML, Summary, Table of Contents, User-zu-Developer-Progression, Further Exploration, finales Dev Note, strukturelle Parität und exakte Zeilenzahl-Gleichheit, während es verifizierte Package-Verträge erhält.
- Jede englische Package-README-Summary bleibt innerhalb von 100 `wc -w`-artigen Wörtern; der fokussierte Gate berichtet die gemessene Anzahl und leitet Fehlschläge zu `dsh-doc` und der gewählten Kind-Vorlage.
- `docs/AGENTS.md` verlinkt diese Referenz, bleibt als ständige Instruktion ausreichend und liegt unter seinem Ziel mit mindestens 5% Headroom.
- Der Root-Nutzer-Pfad, der Web-Quickstart, das erste-Plugin-Tutorial, das Contributor-Setup und der Architektur-Überblick benennen jeweils ein beobachtbares Ergebnis und einen Verifikations-Owner, ohne Implementierungs-Details zu duplizieren.
- Das Budget-Manifest zeichnet sowohl Ziel als auch temporäre Obergrenze auf, und sein Check berichtet oder lehnt einen verletzten Headroom-/Ratchet-Zustand ab.
- Der Docs-Site-Workflow enthält keinen kopierten ungültigen Sidebar-Namen oder Sektions-Owner-Anspruch, und ein fokussierter Test verhindert Wiederkehr.
- Der Sidecar bleibt der einzige Konsistenz-Record, weil er gleichwertige Autorität, letzte-bestätigte-Text-Recovery, automatische Merge-Sicherheit, generierte-Region-Aufzeichnung und Archiv-Versiegelung erhält, ohne Owner-Datei-Konflikte zu erzeugen.
- Eine akzeptierte Repository-Root-Link-Form rendert korrekt auf GitHub und der Dokumentations-Site und bleibt lokal Ziel-/Anker-geprüft, bevor relative Links migriert werden.
- Ein großer eigenständiger Katalog und eine gemischte Subsystem-Seite demonstrieren eine kompakte Einsteiger-Ebene und niedrigere gemessene Lookup-Kosten, während sie umfassende generierte Wahrheit, stabile Links, Bilingual-Paare und deterministische Freshness erhalten.
- `pnpm run doc-sync`, `pnpm run lint`, die fokussierten neuen Checks und `git diff --check` bestehen.

## Risiken

- Metadaten können zu Boilerplate werden; der Package-README-Check erlaubt daher nur Felder mit aktuellen Retrieval-, Template-Auswahl- oder Bilingual-Konsistenz-Consumern.
- Harte Satzlängen-Limits können Erklärungen fragmentieren oder eine Bedingung von ihrer Konsequenz trennen. Die Controlled-English-Satzzahlen bleiben Review-Prompts, während die separate 100-Wörter-Package-Summary-Obergrenze nur den Einstiegs-Absatz begrenzt und exakte Verträge in den besitzenden Sektionen lässt.
- Exakte Zeilen-Ausrichtung kann Übersetzer zu unnatürlicher Prosa drängen; Review muss Bedeutung schützen und darf beide Seiten zusammen revidieren, statt eine zu schwächen.
- Aufteilen generierter Referenzen kann Routen und Link-Wartung erhöhen; Prototypen müssen Aliase erhalten und den Trade-off messen.
- Ein semantischer Check kann zu einem Repository-Topologie-Scanner werden, der legitime Änderungen blockiert; Checks sollten hochriskante kopierte Werte und repräsentative Journeys abdecken, während Review Prosa-Bedeutung besitzt.
- Package-README-Schnellreferenz-Tabellen wiederholen manuell ausgewählte Konfigurations-Defaults; bis ein Quell-gestützter Check sie besitzt, müssen Reviewer geänderte Werte gegen Quelle und generierten Konfig-Katalog verifizieren und die Tabellen ausgewählte statt umfassende halten.
- Optimierung für kurzen Agent-Kontext kann menschliche Referenzen fragmentieren; jede Aufteilung benötigt einen stabilen konzeptionellen Owner und einen offensichtlichen Navigations-Pfad.
- Ein permanentes Dev Note kann zu einer zweiten Queue oder einem veralteten History-Dump werden; Abschluss muss dauerhafte Wahrheit fördern und gelöschte Chatter entfernen.
- Das Audit verwendet Repository-Struktur, Gates und repräsentative Seiten statt Nutzerforschung. Vor breitem Rollout sollten Maintainer die vorgeschlagenen Leser-Ergebnisse mit echten Newcomer-, Nutzer-, Entwickler- und Agent-Aufgaben validieren.
