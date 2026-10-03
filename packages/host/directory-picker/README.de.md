---
description: "Workspace-Verzeichnis-Auswahl-Seam für den Web-GUI-Host: der Service-Vertrag, das Capability-Vokabular und die Fehlercodes, die die native- und browse-Backends implementieren."
kind: "package-reference"
---

# @deepseek-ai/dsh-host-directory-picker
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

Das Web-GUI lässt einen Operator ein Workspace-Verzeichnis entweder mit einem OS-Chooser oder einem In-App-Browser wählen. Verwende die native Option, wenn der Operator das Host-Display erreichen kann; verwende die Browser-Option für Remote-Clients oder wenn Directory-Listing und -Erstellung in der App bleiben müssen. Consumer erhalten die Interaktionsart und können den passenden Workflow präsentieren. Die Verzeichnisauswahl ist auf den GUI-Host beschränkt und berührt den Agent Loop nie. Der Browser-Workflow exponiert jeweils einen Verzeichnisbaum; mehrere Roots werden nicht unterstützt.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Mounte genau ein Directory-Picker-Backend und lass den Workspace-Flow es treiben: Der Seam selbst ist nur der Service-Vertrag, sodass eine Komposition ohne Backend keine Möglichkeit hat, ein Verzeichnis zu wählen.

### Ein Backend wählen

Das [native Backend](../directory-picker-native/README.de.md) ist die richtige Wahl, wenn der Operator am Display des Hosts sitzt: `directoryPicker/pick` öffnet einen OS-Chooser und liefert den gewählten absoluten Pfad oder `null` bei Abbruch. Das [Browse-Backend](../directory-picker-browse/README.de.md) funktioniert überall — es listet eine Verzeichnisebene und erstellt Kindverzeichnisse aus dem Browser, sodass Remote-Clients, die keinen OS-Dialog erreichen können, trotzdem ein Workspace wählen. Wenn die Host-Situation zwischen Boots variiert, komponiere den [adaptiven Chooser](../directory-picker-auto/README.de.md), der die Situation einmal beim Boot resolved und das passende Backend mountet.

### Der Capability-Vertrag

`capability()` liefert eine diskriminierte Union, die beschreibt, wie ein Operator ein Verzeichnis auswählt: `{ kind: 'native', pick(signal) }` für den OS-Chooser oder `{ kind: 'browse', list(path?), createDirectory(path, name) }` für den In-App-Browser. Consumer schalten auf `kind`; eine Capability-Art, die keine Komposition implementiert, führt dazu, dass die UI die Picking-Affordance verbirgt statt zu scheitern. Browse-Fehlschläge werfen den typisierten `DirectoryPickerError` mit einem geschlossenen Code-Set — `directory-unreadable`, `directory-exists` oder `directory-create-failed` — wobei jeder den Subjekt-Pfad trägt, den der Picking-Remote-Controller auf Wire-Fehlercodes abbildet.

### Was Zeilen tragen

`DirectoryEntry`-Zeilen exponieren den absoluten `path` und ein Host-eigenes `hidden`-Flag (dot-prefixed auf POSIX), sodass die Display-Policy clientseitig bleibt; Clients joinen Pfadsegmente nie selbst. `DirectoryListing.crumbs` ist die Ancestor-Kette vom Dateisystem-Root zum gelisteten Verzeichnis — jeder Crumb ist ein Sprungziel, und der Root-Crumb ist mit seinem vollständigen Pfad beschriftet.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

### Designkonzept

Der Seam baut auf einer Trennung auf: Die Interaktionsform, die ein Backend bereitstellt, ist Vertrag, kein Implementierungsdetail. `DirectoryPicker` ist ein abstrakter Cordis-Service mit einer einzigen `capability()`-Methode; eine Backend-Subklasse registriert sich als `ctx.directoryPicker`, und das Laden einer zweiten Implementierung wirft den Standard-Duplicate-Service-Fehler. Das Capability-Objekt muss für die Service-Lebensdauer stabil sein, weil Consumer es über Aufrufe hinweg halten können.

### Das merge-erweiterbare Vokabular

`DirectoryPickerCapabilities` ist eine merge-erweiterbare Map, die über die Capability-Art gekeyed ist, und `DirectoryPickerCapability` leitet die Union daraus ab. Ein neues Backend declaration-merged seine Form hier (das `kind`-Literal des Eintrags muss seinem Key gleichen), statt dieses Paket zu editieren. Jedes Backend-Paket liefert außerdem einen Browser-Entrypoint, der die passende Interaktion in den Directory-Flow-Slots von ui-workspace registriert, sodass eine Kompositionszeile sowohl die Host-Capability als auch den Client-Flow wählt.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Service Definition: abstrakter `DirectoryPicker`, Capability-Vokabular, typisierter Fehler, Context-Merge |

### Fehlervokabular

`DirectoryPickerError` trägt einen geschlossenen `DirectoryPickerErrorCode` plus den absoluten Subjekt-Pfad, sodass Consumer Business-Codes ohne String-Matching abbilden. Die Seam-Agent-Note hält die Designbegründung, die Trennung von `ctx.fs` und die Policy-Entscheidungen fest.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Seam-Vertrag nicht reicht: zuerst den Entscheidungsrecord, dann die zwei Backends und den adaptiven Chooser, die ihn komponieren.

- [Directory-Picker-Capability-Seam-Entscheidung](../../../.agents/notes/archived/architecture/2026-07-28-directory-picker-capability-seam.md) — Designbegründung, die `ctx.fs`-Trennung und die Policy-Entscheidungen.
- [Native Backend](../directory-picker-native/README.de.md) — die OS-Chooser-Interaktion und ihr Plattform-Tooling.
- [Browse-Backend](../directory-picker-browse/README.de.md) — die In-App-Listing- und -Erstellungs-Interaktion für Remote-Clients.
- [Adaptiver Chooser](../directory-picker-auto/README.de.md) — Boot-Time-Resolution zwischen den beiden Backends.
- [Workspace-Subsystem](../../../docs/subsystems/workspace.de.md) — die Workspace-Records, die das gewählte Verzeichnis speist.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da der GUI-Host-Picking-Seam nichts Modellseitiges registriert.

#### KV-Cache-Effekt

Keiner; dieses Paket assembliert weder einen Provider-Request noch sendet es einen.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann der Seam-Vertrag eine Entscheidung einem zukünftigen Consumer überlässt. Sie sind aktuelle Paket-Constraints, kein Aufgaben-Backlog.

- **Keine Multi-Root-Unterstützung** — der Browse-Vertrag exponiert pro Listing eine Ancestry-Kette; Pro-Deployment-Root-Scoping (und die Windows-Drive-Root-Enumeration oberhalb eines Laufwerks) wartet auf einen Consumer, der es braucht, gemäß der DirectoryPicker-Agent-Note.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Diese zustandslose Service Definition besitzt das Capability-Vokabular, während Backends und der Remote-Controller die Beobachtungen besitzen.
