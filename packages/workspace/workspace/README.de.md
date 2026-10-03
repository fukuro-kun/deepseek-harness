---
description: "Workspace-Entitätsregistry (ctx.workspaceRegistry) für Hosts, die dauerhafte Workspace-Einträge und header-validierte Session-Mitgliedschaft wählen, mounten oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-workspace
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Verwenden Sie dieses Paket, um eine geordnete, persistente Liste von Projektverzeichnissen und der in jedem Verzeichnis gelaufenen Sessions zu führen. Hosts können Projekt-Sidebars aufbauen, Sessions aus der Gruppierung ausblenden, ohne ihre Historien zu löschen, und Projekte entfernen, ohne Ordner, Dateien oder Sessions zu löschen. Das erneute Hinzufügen eines entfernten Verzeichnisses erzeugt ein frisches Projekt, während Sessions, deren Verzeichnisse nicht validiert werden können, ungruppiert bleiben. Wählen Sie es für GUI- oder Host-Workflows, die dauerhafte Projektgruppierung brauchen; es ist für Modelle unsichtbar und verursacht keine Prompt- oder Anfragekontextkosten, benötigt aber Session-Persistenz und Storage-Backends.

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

Verwenden Sie dieses Paket, um dem Produkt eine Projektliste zu geben: benannte Verzeichnisse, in denen der Benutzer arbeitet, die in jedem gelaufenen Sessions, eine stabile Reihenfolge und eine Möglichkeit, Sessions zu verbergen, ohne sie zu verlieren. Die API-Verträge hinter jeder Aktion stehen im Implementierungsabschnitt.

### Wann man es verwendet

Verwenden Sie es, wenn das Produkt eine persistente Workspace-Oberfläche zeigt — eine Sidebar, Session-Gruppierung oder Automatisierung, die Verzeichnisse benennt und ordnet. Es ist für das Modell unsichtbar und verursacht daher keine Token- oder Anfragekosten. Lassen Sie es weg, wenn es keine Gruppierungsoberfläche gibt; nichts anderes im harness braucht es.

### Einrichtung

Das Paket nimmt keine eigene Konfiguration an; es braucht einen Session-store, ein Session-Persistenz-Backend und die Storage-Zeilen, die seine Einträge halten. Eine minimale Komposition:

```yaml
- name: '@deepseek-ai/dsh-session'
- name: '@deepseek-ai/dsh-session-persistence-jsonl'
- name: '@deepseek-ai/dsh-storage'
- name: '@deepseek-ai/dsh-storage-json'
- name: '@deepseek-ai/dsh-storage-domain'
  config:
    backend: json
- name: '@deepseek-ai/dsh-workspace'
```

Sind diese Zeilen gemountet, erscheint ein erstelltes Projekt sofort in der Liste und überlebt einen Neustart; der erste Start gruppiert außerdem bestehende Sessions nach dem Verzeichnis, in dem sie liefen. Fehlt ein benötigter Peer, bleibt die Workspace-Funktion nicht verfügbar, bis er gemountet ist.

### Projekte erstellen und ordnen

Erstellen Sie ein Projekt aus jedem vollqualifizierten, existierenden Verzeichnis: Dateisystem-Roots wie `C:\` und gewöhnliche Verzeichnisse sind gültig. Relative Pfade, Windows-laufwerkrelative Pfade wie `C:work`, fehlende Pfade und Dateien werden ohne Projekterstellung abgelehnt; das Erstellen eines Projekts für ein Verzeichnis, das bereits eines hat, gibt das bestehende Projekt unverändert zurück. Benennen Sie ein Projekt jederzeit um und verschieben Sie es an eine beliebige Position in der Liste:

```text
// Host consumer code, after the composition above is loaded:
const project = await ctx.workspaceRegistry.create('/path/to/dir', 'My Project')
await project.setTitle('Renamed')
ctx.workspaceRegistry.list() // shows the project, newest first
```

### Sessions unter einem Projekt gruppieren

Eine Session tritt dem Projekt des Verzeichnisses bei, in dem sie läuft: erstellen Sie eine Session im Verzeichnis eines Projekts, und sie erscheint unter diesem Projekt, neueste zuerst. Eine Session kann nur zu einem Projekt gehören. Eine Session, deren Verzeichnis nicht validiert werden kann — kein aufgezeichnetes Verzeichnis oder ein verschobener bzw. gelöschter Ordner — kann nicht beitreten und bleibt ungruppiert.

### Sessions verbergen und Projekte entfernen

Verbergen Sie eine Session aus der Gruppierung, wenn sie dort nicht mehr erscheinen soll: sie verschwindet aus der sichtbaren Liste, während ihre Session, Historie und Position im Projekt intakt bleiben. Entfernen Sie ein Projekt, wenn es nicht mehr gebraucht wird: es verlässt die Liste, und sein Ordner, seine Dateien und Session-Historien werden nie angetastet — diese Sessions werden ungruppiert. Das erneute Hinzufügen desselben Verzeichnisses danach beginnt ein frisches Projekt ohne die alten Sessions.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter der Funktion und verweist auf den Code, der sie umsetzt; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) behandelt.

### Designphilosophie

- **Ein Eintrag pro kanonischem Pfad.** `fs.realpath` ist der einzige Eindeutigkeitskanon: Pfade werden kanonisiert gespeichert, sodass ein Symlink auf ein bereits verwaltetes Verzeichnis kollidiert, und Eindeutigkeit ist String-Gleichheit kanonischer Pfade.
- **Mitgliedschaft ist Eigentum plus eine lebendige cwd-Tatsache.** Das geordnete `sessionIds` des Eintrags ist die Eigentums-Quelle; der Start-Header-Index validiert es, und `sessionIds` filtert beim Lesen, während die nächste Mutation dauerhaft beschneidet.
- **Nur-Header-Lesevorgänge.** Bootstrap und Attach-Validierung lesen nur `SessionHeader`-Felder; Event-Bodies werden nie geladen.
- **Zwei-Schreib-Mutationen mit explizitem Marker.** Create und Delete persistieren einen `pendingMutation`-Marker, bevor das Eintrags-/Reihenfolgen-Paar divergieren kann, sodass der Start genau die unterbrochene Operation zu Ende führt und unmarkierte Divergenz laut als Korruption fehlschlägt.
- **Serialisierte Schreibvorgänge.** Registry-Operationen laufen auf einer Operationskette; Entitätsmutationen gehen über `table.update` auf der Domain-Schreibkette, stempeln `updatedAt` und entscheiden die Mitgliedschaft an ihrem Kettenslot.

### API-Verhalten

Die API ist eine kleine Familie mit zwei Eigentümern: `WorkspaceRegistry` erstellt, ordnet und löscht Projekte und verwaltet ihre Session-Buchführung; die `Workspace`-Entität legt Anzeigetitel, Verzeichnisstatus und die Session-Projektion offen. Methodenverträge stehen im Code, nicht in diesem README — siehe [src/index.ts](src/index.ts) und [src/entity.ts](src/entity.ts).

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `WorkspaceRegistry`-Dienst, Header-Index, Bootstrap, Operationsserialisierung |
| [`src/entity.ts`](src/entity.ts) | Paketprivate `Workspace`-Implementierung und ihr einziger `mutate`-Schreibpfad |
| [`src/spec.ts`](src/spec.ts) | Domain-Deklaration: Eintragsschema, Registry-Zustand, `defineDomain`-Spec |
| [`src/types.ts`](src/types.ts) | Öffentliches `Workspace`-Interface und `WorkspaceId`-Brand |
| [`src/paths.ts`](src/paths.ts) | Der `realpath`-Eindeutigkeitskanon |
| [`src/invariant.ts`](src/invariant.ts) | Invarianten-Begleiter: der Entitätscache spiegelt die persistente Tabelle |

### Persistente Form

Die Registry öffnet die `workspace`-Domain (Version 2): eine `workspaces`-Tabelle mit Schlüssel `WorkspaceId` plus ein globaler Zustand, der `workspaceIds` (die autoritative Anzeigereihenfolge), `archivedSessionIds` und den optionalen `pendingMutation`-Marker hält. Einträge, die vor der Existenz von `archivedSessionIds` geschrieben wurden, parsen über den Schema-Default mit einer leeren Menge.

### Lebenszyklus

Beim Start öffnet die Registry die Domain, vollendet eine markierte Mutation, falls eine aussteht, validiert den gespeicherten Zustand — doppelte Pfade, doppelte Session-Konten und Reihenfolgedrift schlagen alle laut fehl — und bootstrapt, wenn noch nicht initialisiert, die Historie aus persistierten Headern, bevor der Initialisierungsmarker zuletzt geschrieben wird, sodass ein unterbrochener Bootstrap sicher wieder aufnimmt. Eine frische leere Registry ist einmal initialisiert real; sie bootstrapt nie erneut.

### Fehler und Wiederherstellung

Schlägt bei einem Create oder Delete der zweite Schreibvorgang fehl, werden Cache und vorherige Reihenfolge zurückgerollt; wenn sowohl die Operation als auch ihr Rollback fehlschlagen, benennt der persistente Marker noch immer die unterbrochene Operation, und der nächste Start vollendet sie oder rollt sie zurück. Ein committetes Delete, dessen Marker-Bereinigung fehlschlägt, meldet trotzdem Erfolg, und der nächste Start räumt den Marker idempotent ab.

### Invariante

Der `workspace-invariant`-Begleiter registriert die verwaltete Beziehung: jeder persistente `domain/changed` für die `workspaces`-Tabelle muss einen Eintrag benennen, den der Entitätscache bereits hält — ein Delete ist nur gültig, nachdem die Registry die Entität aus ihrem Cache entfernt hat, sodass ein umgehender Schreibpfad die Invariante scheitern lässt.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn die Sicht dieses Pakets nicht ausreicht: die Subsystem-Referenz ist der autoritative Funktionsvertrag, und die Agent Notes dokumentieren, warum Projekte aus der Session-Historie beginnen und warum das Entfernen nicht destruktiv ist.

- [Workspace-Subsystem](../../../docs/subsystems/workspace.de.md) — der Funktionsvertrag für Projekte und ihre Sessions sowie die generierte API des Workspace-Dienstes.
- [Workspace-Paketkarte](../README.de.md) — das einzige Paket der Gruppe und seine Position im Repository.
- [Domain-KV-Storage-Agent-Note](../../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.de.md) — warum Projekteinträge die Domain-Datenform verwenden.
- [Workspace-UI-Produktfluss-Agent-Note](../../../.agents/notes/archived/feature/2026-07-25-workspace-ui-product-flow.md) — wie der erste Start Projekte aus der Session-Historie aufbaut und wie die GUI sie ordnet.
- [Entscheidung zum Löschen der Workspace-Registrierung](../../../.agents/notes/implemented/feature/2026-07-27-workspace-registration-deletion.de.md) — warum das Entfernen eines Projekts nie seinen Ordner oder seine Sessions löscht.

-----

<a id="model-experience"></a>
## Model Experience

### Workspace-Einträge und Session-Konten

#### Was das Modell sieht

Nichts. `ctx.workspaceRegistry` bedient Workspace-Einträge nur für hostseitige Consumer: das Paket registriert keine Tools, injiziert keine Prompts und schreibt keine Session-Events, sodass kein Anfragefeld je die Daten dieses Pakets trägt.

#### Token-Effekt

Null direkte Tokens bei jeder Anfrage.

#### KV-Cache-Effekt

Unabhängig von laufenden Anfragen: das Paket berührt nie ein Anfragepräfix und kann daher die Provider-Cache-Wiederverwendung nicht ungültig machen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann die Projektliste schlecht passt oder besondere betriebliche Sorgfalt braucht. Sie sind aktuelle Paketbeschränkungen, kein Aufgabenrückstand.

- **Entfernen löscht nie Daten** — das Entfernen eines Projekts lässt Ordner, Dateien und Session-Historien an Ort und Stelle; diese Sessions werden ungruppiert, und Session-Löschung oder Ordner-Entfernung sind separate, nicht vorhandene Fähigkeiten ([Entscheidung](../../../.agents/notes/implemented/feature/2026-07-27-workspace-registration-deletion.de.md)).
- **Eine Session tritt nur mit aufgezeichnetem Verzeichnis bei** — eine Session gehört nur dann zu einem Projekt, wenn ihr Eintrag ein Verzeichnis trägt, das auf den Projektpfad auflöst; Sessions ohne eines bleiben ungruppiert, und eine Session aus einem anderen Verzeichnis kann nicht verschoben werden.
- **Externe Änderungen werden spät gesehen** — wenn ein anderer Prozess ein Verzeichnis löscht oder beschädigt, spiegelt das Projekt das erst bei der nächsten Aktualisierung oder dem nächsten Neustart wider.
- **Archivierung ist nur Anzeige** — eine verborgene Session behält ihre Historie, ihre Workspace-Mitgliedschaft und ihren Ordnungsslot; Archivieren und Dearchivieren bearbeiten nur die persistente Archivmenge.
- **Erneutes Hinzufügen eines Verzeichnisses beginnt frisch** — nach dem Entfernen erzeugt das Hinzufügen desselben Verzeichnisses ein neues Projekt mit leerer Session-Liste; die alten Sessions kommen nicht automatisch zurück.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: offene Fragen und Richtungen, die nicht entschieden sind. Sie ist ausdrücklich nicht autoritativ — ausgeliefertes Verhalten, Grenzen und akzeptierte Begründungen stehen in den Abschnitten oben, im Paketcode und in den verlinkten Agent Notes.

#### Offen: der `create(path, title?)`-Titelparameter

Der `title`-Parameter hat seit dem Entfernen des Create-by-Name-Zweigs des Gateway keinen Produktionsaufrufer mehr; ein Code-TODO schlägt vor, den Parameter zusammen mit seiner `@param`-Klausel zu streichen ([Notiz](../../../.agents/notes/archived/simplification/2026-07-31-one-route-to-add-a-workspace.md)).

</details>
