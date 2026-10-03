# Agent Note: Paket-verankerte Subsystem-Seiten und schlanke Gruppen-READMEs

Status: implemented

[English](2026-08-03-package-anchored-subsystem-pages.md) | [中文](2026-08-03-package-anchored-subsystem-pages.zh.md) | Deutsch

## Problem

Der [Subsystems-Katalog](../../archived/process/2026-06-20-core-data-structures-catalog.md) grenzte seine Frontseite nach der Spine-vs-Seam-Regel ab: Ein Typ war „core", wenn der Loop ihn auf jedem Turn hält, ableitet, streamt oder protokolliert. Diese Regel wählte Typen, nicht Pakete — als der Ordner auf über vierzig Seiten anwuchs, wurde die Frontseite daher zum paketübergreifenden Sammelbecken: LLM-Gesprächsvokabular stand über den Agent-Kontrakten, das Erzeugungs-/Ownership-Vokabular (`AgentHandle`, `CreateAgentOptions`, `ResumeAgentOptions`, `AgentFactory`) war nirgends im Ordner dokumentiert, weil der Generator es in ein Paket-README ausnahm, und ein Leser konnte aus dem Ort, an dem ein Typ lebt, nicht vorhersagen, welche Seite ihn dokumentiert. Die Paketgruppen-READMEs hatten unterdessen keine gemeinsame Form — manche trugen gegliederte Tabellen, verstreute Design-Essays oder Schlussabsätze, die auf eine Subsystem-Seite gehörten.

## Entscheidung

Jede `docs/subsystems/`-Seite verankert sich an dem Paket oder der Paketgruppe, die ihr Vokabular deklariert, und die Seitenzugehörigkeit folgt dem Repository-Layout: [core.md](../../../../docs/subsystems/core.de.md) ist die `packages/core`-Seite (Erzeugung und Ownership, das `Agent`-Handle mit seinen Delivery-/Cancellation-/Interception-Kontrakten, Verweise auf die dedizierten Seiten der Gruppe), [llm-streaming.md](../../../../docs/subsystems/llm-streaming.de.md) deckt `packages/llm` vollständig ab, und so weiter. Repositoryweite Typmuster (`…Map → derived-union`, gebrandete IDs) bleiben auf core.md in einem ausdrücklich gerahmten Schlussabschnitt, statt mit dem Paketinhalt verwoben zu werden. Dies ersetzt die Spine-vs-Seam-Regel *als Seitenscoping-Regel*; die überlebende Platzierungsheuristik ist einfacher: Ein Typ wird dort dokumentiert, wo die Seite seines deklarierenden Pakets ist, und Maschinerie bleibt bei ihrer Maschinerie.

Jeder Typ, den eine generierte Signatur referenziert, muss irgendwo im Ordner auflösen: Das Agent-Ownership-Vokabular wanderte aus den `TYPE_LINK_EXEMPTIONS` des Generators nach `LINK_MAP → core.md`, sodass Ausnahmen für tatsächlich service-lokale oder vendored Formen reserviert bleiben. Jede eingefügte Deklaration hat genau ein Zuhause (`SessionEvent` lebt auf [session.md](../../../../docs/subsystems/session.de.md); core.md fasst zusammen und verlinkt).

Jedes `packages/<group>/README.md`-Paar ist ein schlanker Einstiegspunkt in einer einzigen Form: ein einleitender Absatz, der mit dem Warum beginnt, eine Paket-Tabelle (Package / Role / ctx key) und ein abschließender Verweis auf die zuständige Subsystem-Seite. Eine Gruppe, die keine eigenständige Subsystem-Referenz deklariert, wird stattdessen mit einer nicht-leeren Begründung in `GROUPS_WITHOUT_SUBSYSTEM_PAGE` klassifiziert. Tragende Prosa, die diese Form sprengt, wird auf die zuständige Subsystem-Seite verlagert statt gelöscht.

`verify-subsystem-pages` ermittelt Gruppen sowohl aus Gruppen-READMEs als auch aus den Manifesten der Kindpakete. Es lehnt ein fehlendes Gruppen-README ab, eine Gruppe ohne leser sichtbaren direkten Link auf eine englische Datei unter `docs/subsystems/` und ohne explizite Ausnahme, eine leere oder verwaiste Ausnahme, eine ausgenommene Gruppe, die einen Link hinzugewinnt, und einen Link, dessen Seite fehlt; Code, Kommentare, Bilder, verschachtelte Pfade und Traversal erfüllen die Ownership nicht. Der Check läuft als eigenständiges `doc-sync`-Blatt, sodass das Hinzufügen einer Paketgruppe ihren Dokumentations-Eigentümer nicht still weglassen kann.

Das [Subsystems-README](../../../../docs/subsystems/README.de.md) indexiert jede Seite des Ordners auf beiden Sprachseiten; `scripts/project-doc-site.spec.ts` erzwingt eine Tabellenzeile pro Seite, sodass eine hinzugefügte oder zusammengelegte Seite dem Index nicht still entgehen kann.

## Erwogene Alternativen

**Die Spine-vs-Subsystem-Scoping-Regel behalten.** Sie beantwortete pro Typ „ist dieser Typ core?" — weshalb die Frontseite Typen aus vier Paketen sammelte, während ihr die Hälfte der öffentlichen API von `packages/core/agent` fehlte. Die Vorhersagbarkeit nach Repository-Layout setzte sich durch.

**Ein flacher Einzel-Dokument-Katalog.** Bereits in der [ursprünglichen Katalog-Note](../../archived/process/2026-06-20-core-data-structures-catalog.md) abgelehnt; das Wachstum auf einundvierzig Seiten bestätigte dieses Urteil.

**Ownership-Vokabular nur in Paket-READMEs dokumentieren (der Ausnahme-Status-quo).** Dies ließ `AgentHandle` und die create-/resume-Optionen für den Ordner unsichtbar, der die Typenreferenz sein will, und die generierten `Types:`-Footer konnten sie nicht verlinken.

## Konsequenzen

- Welche Seite einen Typ dokumentiert, ist aus `packages/<group>/` vorhersagbar; das Subsystems-README ist ein per Test erzwungener vollständiger Index.
- Jede Paketgruppe macht ihren Subsystem-Eigentümer oder ihr begründetes Fehlen überprüfbar, und `verify-subsystem-pages` lehnt unklassifizierte Neuzugänge und veraltete Ausnahmen ab.
- Generierte Signatur-Footer verlinken das Agent-Ownership-Vokabular, statt es still auszunehmen.
- Das 1:1-Manifest von `verify-type-equiv` hält jede Einfügung eindeutig beheimatet; die doppelte `SessionEvent`-Einfügung ist entfernt.
- Die [ursprüngliche Katalog-Note](../../archived/process/2026-06-20-core-data-structures-catalog.md) bleibt Eigentümerin des `ts type-equiv`-Drift-Gate-Mechanismus; ersetzt wird hier nur ihre Seitenscoping-Regel.
