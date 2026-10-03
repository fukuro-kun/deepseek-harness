---
description: "Erzeugte Dateien und klickbare Dateireferenzen für das Web GUI: die Deliverables-Zeile, mit der ein abgeschlossener Turn endet, und Inline-Code-Links im Abschlusstext; für Benutzer und Maintainer der Deliverables-Oberfläche."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-deliverables
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Dieses Paket rendert die Deliverables-Zeile, mit der ein abgeschlossener Turn endet — die Dateien, die die mutierenden Tools erstellt oder geändert haben — und verlinkt passende Inline-Code-Referenzen im Abschlusstext, sodass eine erwähnte Datei im Host geöffnet wird. Das Vokabular stammt aus den `locations` der mutierenden Tools selbst, niemals aus dem Abschlusstext — eine erzeugte Datei wird aufgelistet, unabhängig davon, ob das Modell sie benannt hat. Der ausgelieferte Web-Patch ist die einzige Composition, die dieses Paket lädt; das Entfernen seines cordis.yml-Eintrags entfernt Anleitung, Zeile und Prosa-Links gemeinsam.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Mounte dieses Plugin neben `ui-conversation`; ein abgeschlossener Turn endet dann mit der Zeile erzeugter Dateien zwischen dem Body der Abschlussnachricht und ihrer Aktionsfußzeile. Jeder Chip öffnet die Datei über das `openFile` des Owners, das die Chat-View als Textvorschau-Tab in die rechte Sidebar routet; relative Pfade werden gegen das Session-cwd aufgelöst. Die Zeile bietet keine Ordneraktion: die Sidebar kennt keine Verzeichnisform, sodass ein Rest ausgelassener Dateien nur ein Label ist.

<a id="explicit-deliveries"></a>
### Explizite Auslieferungen

Die Web-presets `standard`, `ptc` und `cordis` stellen `present` für finale Dateien bereit, die über das Session-Dateisystem erreichbar sind, einschließlich über Bash erstellter Dateien. Nach dem Erstellen der Dateien mit `files: [{ path, description? }]` aufrufen. Das [present-Tool](../../fs/tool-present/README.de.md) besitzt Dateianzahl-Limits und Session-Deklarationen. Der abschließende Turn zeigt eine Auslieferung als Karte in voller Breite und mehrere Auslieferungen in einem Grid mit höchstens zwei Karten pro Zeile. Eine Liste mit mehr als vier Dateien startet eingeklappt und stellt ein Control bereit, das die vollständige Liste ein- oder ausblendet. Jede Karte nutzt das geteilte `FileTypeIcon` und zeigt Basename und Beschreibung oder — ohne Beschreibung — den Dateityp; ein abschließendes geklammertes Suffix in der Beschreibung wird weggelassen, und beim Hovern ersetzt die Sidebar-Vorschau-Aktion diese Zeile. Ein Klick auf die Karte oder die linke Seite ihres geteilten Open-Controls zeigt die Datei in der rechten Sidebar an. Der Chevron öffnet das Standardmenü für die Standardanwendung des Hosts sowie „Im Finder anzeigen" auf macOS, „Im Datei-Explorer anzeigen" auf Windows und WSL oder „Enthaltenen Ordner öffnen" über den Standard-Dateimanager unter Linux. Passende Inline-Code-Referenzen öffnen dieselben Quelldateien, ohne einen Browser-Download zu starten. Eine wiederholte Deklaration eines Pfads wählt dessen neueste Beschreibung vor der Abschlussantwort.

Die `present`-Tool-Zeile zeigt den Status laufend, ausgeliefert, fehlgeschlagen oder unterbrochen; das Aufklappen einer abgeschlossenen Zeile zeigt ihr aufgezeichnetes Ergebnis. Das einklappbare Karten-Grid behält jede ausgelieferte Datei. Beide Menüaktionen teilen den Pending-Zustand und zeigen Fortschritt, eine Bestätigung oder einen aktionsspezifischen wiederholbaren Fehler. Desktop-Informationen werden gelesen, wenn Auslieferungskarten erscheinen, und bei einem Verbindungswechsel invalidiert; Antworten einer ersetzten Verbindung können keine Metadaten veröffentlichen. Die Auswahl einer nativen Menüaktion gibt den Tastaturfokus an die verfügbare Open-Schaltfläche der Sidebar zurück. Ausstehende Aktionen schließen das Menü, bis eine weitere explizite Geste erfolgt. Ein fehlender Desktop deaktiviert das Open-Menü; ein fehlgeschlagener Lesevorgang der Desktop-Informationen bietet „Wiederholen". Voraussetzung sind ein Desktop und eine geeignete Standardanwendung auf dem ausliefernden Host; ein Remote-Browser öffnet keine Anwendungen auf seinem eigenen Gerät.

### Die Zeile

Die Zeile „Geänderte Dateien" listet erfolgreiche File-Tool-Mutationen; finale Dateiauslieferungen erfordern `present`. Sie nutzt CSS-Containerbreiten-Stufen, um ein responsives Präfix von bis zu sechs Datei-Chips zu zeigen. Flexbox schrumpft und kürzt Basename-Text mit Ellipse, während CSS das passende lokalisierte `+ N Dateien`-Label für ausgelassene Pfade wählt; der volle Pfad bleibt als title verfügbar, und die Zeile führt weder JavaScript-Layoutbeobachtung noch horizontales Scrollen aus.

### Inline-Code-Links

Der Abschlusstext trägt dasselbe Vokabular: ein Inline-Code-Token wird über den exakten Pfad aufgelöst oder dadurch, dass es exakt der Basename genau eines erzeugten Pfads ist — ein Basename, den zwei Pfade teilen, bleibt inert, statt zu raten, sodass eine Erwähnung niemals die falsche Datei öffnen kann. Eine aufgelöste Erwähnung behält ihren Code-Chip und übernimmt die Link-Sprache des Markdown-Sheets, mit dem vollständigen Pfad als title.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Die Node-Hälfte registriert die statische Systemprompt-Sektion `ui:deliverable-file-references`, die das Modell auffordert, primäre Dateien aus erfolgreichen Erstellungs- oder Änderungsaufrufen zu nennen und diese sowie alle anderen Referenzen auf geänderte Dateien als Markdown-Inline-Code zu schreiben. Die Browser-Hälfte registriert einen Wrapper um `ProducedFiles` und explizite Auslieferungen im `conversation.chat.turnTail`-hole der Chat-View. `deliverablesDefinition` faltet die erfolgreichen First-Party-Mutationsaufrufe jedes Turns aus den validierten Rohargumenten von `write`, `edit` und mutierenden `str_replace_editor`-Befehlen zu `DeliverablesTurnData`. Reads, Deletes, nicht unterstützte Tools, fehlerhafte Aufrufe und fehlgeschlagene Ergebnisse tragen nichts bei. Ein neues Mutation-Tool benötigt einen expliziten Client-Beitrag, bevor es der Liste beitritt. Das Paket stellt außerdem den `chatFileMentions`-Service bereit, den die Chat-View pro Abschlussnachricht befragt; das Herauskomponieren des Plugins entfernt beide Oberflächen und hinterlässt die leere chain der View ohne Kosten.

Natives Öffnen nutzt ein authentifiziertes POST, das über die betrachtete Session, die Event-Sequenz und den ursprünglichen Dateiindex adressiert wird. Der Host liest den Session-Header der betrachteten Session mit der Deklaration und übergibt dessen cwd — oder bei Fehlen das Deployment-Workspace-Root — an `workspaceFiles.stat`. Dies nutzt dasselbe komponierte Dateisystem wie Sidebar-Vorschauen und aktiviert keinen Agent, auch nicht für Kind-Sessions. Native Aktionen erfordern, dass der kanonische Prozesspfad von einem Host-Pfad zurück auf denselben Prozesspfad abgebildet werden kann. Provider ohne dieses Mapping liefern 422, und die Karte verweist den Benutzer auf die Sidebar-Vorschau; eine gleichnamige Host-Datei genügt nicht. Dieselbe konfigurierte Desktop-Verfügbarkeit steuert Metadaten und Ausführung. Änderungen wirken auf spätere Öffnungen; ein Löschen liefert einen Fehler. Es wird weder eine Kopie des Dateiinhalts noch ein attachment erstellt. Das Entsorgen des Plugins bricht ausstehende Native-Open-Anfragen ab und wartet sie ab.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn die Deliverables-Oberfläche nicht ausreicht. Sie führen von der Zeile zum turn-tail-hole und den Entscheidungen hinter dem Vokabular.

- [ui-conversation](../ui-conversation/README.de.md) — deklariert das `conversation.chat.turnTail`-hole und rendert den Abschlusstext.
- [Workspace-Dateilinks](../../../.agents/notes/implemented/feature/2026-07-31-web-workspace-file-links.de.md) — die Entscheidung hinter der Zeile erzeugter Dateien; ihr Host-Open-Pfad wurde von der [rechten Sidebar](../../../.agents/notes/implemented/feature/2026-09-04-right-sidebar-docking-infrastructure.de.md) abgelöst.
- [Inline-Dateierwähnungen](../../../.agents/notes/archived/feature/2026-08-07-web-inline-file-mentions.md) — die Entscheidung hinter klickbaren Erwähnungen im Abschlusstext.
- [Client-Paketkarte](../README.de.md) — benachbarte Browser-UI-Pakete.

-----

<a id="model-experience"></a>
## Model Experience

### Anleitung zu klickbaren Dateireferenzen

#### Was das Modell sieht

Ein fester Absatz weist das Modell an, primäre Dateien aus erfolgreichen Erstellungs- oder Änderungsaufrufen in seiner finalen Antwort zu benennen und diese sowie alle anderen Referenzen auf geänderte Dateien als Markdown-Inline-Code mit exaktem Pfad oder eindeutigem Basename zu formatieren, etwa `out/report.html`.

#### Token-Auswirkung

Ein fester Prompt-Absatz, wann immer dieses Paket geladen ist. Das [present-Tool](../../fs/tool-present/README.de.md#model-experience) besitzt das Auslieferungs-schema und den Ergebnistext.

#### KV-Cache-Auswirkung

Die Sektion bleibt für die Lebensdauer des Paket-Mounts statisch an First-Party-Position 9000, sodass sie im wiederverwendbaren Prompt-Präfix verbleibt und sich nicht über Turns hinweg ändert.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren das aktuelle Deliverables-Vokabular. Sie sind aktuelle Paket-Constraints, kein allgemeiner Dateiverlinkungs-Vergleich und kein Aufgaben-Backlog.

- **Mention-Matching erfordert exakten Pfad oder eindeutigen Basename** — eine Suffix-Erwähnung bleibt inert; die Erweiterung des Matchers ist zurückgestellt, bis eine reale Abschlussnachrichten-Form sie benötigt.
- **Im Terminal erstellte Dateien erfordern explizite Auslieferung** — `present` aufrufen, um sie für natives Öffnen zu deklarieren.
- **Deklarationen bewahren keine Dateiinhalte** — das erneute Öffnen oder Übertragen einer Session erfordert, dass Quelldateien über das Dateisystem der betrachteten Session erreichbar sind. Fehlende Dateien, Verzeichnisse und finale symbolische Links liefern 404.
- **Verzeichnisse haben kein Ziel** — Chips öffnen Dateien in der Textvorschau der rechten Sidebar, die nur Dateien anzeigt; die frühere native Ordner-Übergabe wurde entfernt und nicht ersetzt.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Laufzeitinvariante:** Es wird kein Companion veröffentlicht. Prompt-, Slot-, Dictionary-, File-Action-Route- und optionale Service-Registrierungen sind effect-owned; das Session-Log besitzt die Deklarationen und das Dateisystem besitzt die Dateiinhalte.
