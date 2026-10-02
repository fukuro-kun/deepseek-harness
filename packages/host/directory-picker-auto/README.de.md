---
description: "Adaptiver Chooser des directory-picker-seam: löst die Situation des Web-GUI-Hosts einmal beim Boot auf und mountet das passende native- oder browse-Backend."
kind: "package-reference"
---

# @deepseek-ai/dsh-host-directory-picker-auto

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`dsh-host-directory-picker-auto` wählt bei jedem Boot die richtige Verzeichniswahl-Interaktion: Es löst die Situation des Hosts einmal beim Boot auf und mountet das passende Backend — [native](../directory-picker-native/README.de.md) oder [browse](../directory-picker-browse/README.de.md) — samt seiner Browser-Hälfte als echte Loader-Einträge im In-Memory-Root-Tree. Die Auflösung ist eine reine Boot-Time-Stichprobe: `native` erfordert ein Loopback-only-Bind, einen Nicht-SSH-Launch und eine bedienbare Display-Session; alles Mehrdeutige löst zu `browse` auf, das überall funktioniert. Eine Interaktion festzulegen heißt, dieses Backend direkt zu komponieren. Die gemountete Capability bleibt über die Service-Lebensdauer stabil, wie der seam es verlangt.

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

Komponiere dieses Plugin statt eines konkreten Backends, wenn dieselbe Komposition Hosts mit unterschiedlichen Voraussetzungen bedienen muss: lokale Workstation-Sessions, in denen ein nativer Chooser funktioniert, und Remote- oder Headless-Sessions, in denen nur der In-App-Browser funktioniert. Der Chooser prüft den Host einmal beim Boot und mountet die passende Interaktion.

### Wie die Wahl getroffen wird

`native` erfordert jedes Signal dafür, dass die bedienende Person das Host-Display sehen kann und das native Backend es bedienen kann: ein Loopback-only-Bind (aus dem injizierten `webServer` gelesen; ein Bind auf allen Interfaces lässt Remote-Browser zu, die kein OS-Chooser erreichen kann), kein SSH-Launch (das gemeinsame [launch-environment](../../util/launch-environment/README.de.md)-Prädikat ignoriert Projekt-/Benutzer-`.env`-Werte und prüft nur geerbte nicht-leere `SSH_CONNECTION`/`SSH_TTY`) und eine bedienbare Display-Session — auf darwin und win32 angenommen; auf linux `DISPLAY`/`WAYLAND_DISPLAY` plus einem zenity- oder kdialog-Binary auf `PATH`; auf keiner anderen Plattform. Alles Mehrdeutige löst zu `browse` auf, das überall funktioniert.

### Was du bekommst

Die aufgelöste Interaktion kommt als gewöhnlicher Loader-Eintrag an: Das Backend registriert `ctx.directoryPicker`, und seine Browser-Hälfte wird von der Client-Modultabelle genauso entdeckt wie die einer Config-Zeile, sodass die eine-Zeile-tauscht-beide-Seiten-Invariante des seam hält. Das Entladen des Choosers entfernt den Eintrag und lädt beide Seiten mit. Die Stichprobe erfolgt genau einmal pro Boot, sodass die gemountete Capability über die Service-Lebensdauer stabil bleibt.

### Eine Interaktion festlegen

Festlegen ist hier kein Config-Feld: Komponiere stattdessen direkt die `-native`- oder `-browse`-Zeile — das ist der dokumentierte Austauschpunkt des seam. Chooser und eine Backend-Zeile gemeinsam zu mounten schlägt laut fehl (doppelter `directoryPicker`-Service, doppelter Client-Flow in den `single`-Löchern).

### Beobachtbare Fehler

Eine falsche `native`-Wahl degradiert zum vorhandenen wiederholbaren Fehlerdialog des Backends statt zu einer kaputten Komposition; für Deployments, deren Situation die Probe nicht beweisen kann, wählt das direkte Komponieren von `-browse` die sichere Interaktion.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

### Designkonzept

Der Chooser ist eine reine Entscheidung plus ein Mount: `resolveDirectoryPickerBackend` sampled die Host-Fakten einmal beim Boot und gibt eine Backend-Art zurück, und `apply` mountet die passenden Backend- und Surface-Pakete als echte Loader-Einträge im In-Memory-Root-Tree — niemals in eine Config-Datei persistiert, weil das `write()` des Root-Trees ein No-op ist. Der Disposer des Effects entfernt beide Einträge und wartet den Teardown ihrer fibers ab, sodass das Entladen erst zurückkehrt, nachdem beide Seiten der gemounteten Interaktion zur Ruhe gekommen sind.

### Die Auflösungstabelle

| Bedingung | Backend |
|---|---|
| Bind-Host ist nicht `127.0.0.1` | `browse` |
| `SSH_CONNECTION` oder `SSH_TTY` vorhanden | `browse` |
| darwin oder win32 | `native` |
| linux mit Chooser-Binary und Display | `native` |
| alles andere | `browse` |

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `BACKEND_PACKAGES`/`SURFACE_PACKAGES`-Maps, `apply`-Mount und -Unmount |
| [`src/resolve.ts`](src/resolve.ts) | `resolveDirectoryPickerBackend` — die reine Boot-Time-Entscheidung |
| [`src/probe.ts`](src/probe.ts) | Host-Probes: `hasLinuxChooserBinary`, `canExecute` |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Vertrag des Choosers nicht ausreicht: zuerst die seam-Definition, dann die beiden Backends, die er mountet.

- [Directory-picker-seam](../directory-picker/README.de.md) — der Capability-Vertrag, den der Chooser komponiert.
- [Directory-picker-Capability-seam-Entscheidung](../../../.agents/notes/archived/architecture/2026-07-28-directory-picker-capability-seam.md) — warum sich die Backends in der Interaktionsform unterscheiden.
- [Natives Backend](../directory-picker-native/README.de.md) — die Interaktion, die für eine lokale bedienende Person gemountet wird.
- [Browse-Backend](../directory-picker-browse/README.de.md) — die Interaktion, die überall sonst gemountet wird.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da der GUI-Host-Picking-Chooser nur eine Backend-Zeile mountet und nichts Modellseitiges registriert.

#### KV-Cache-Effekt

Keiner; dieses Paket assembliert oder sendet keinen Provider-Request.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann die Boot-Time-Stichprobe den Host falsch einschätzen kann. Sie sind aktuelle Paket-Einschränkungen, kein Aufgabenrückstand.

- **Die Erkennung erschließt den Standort der bedienenden Person aus dem Launch-Kontext, den kein launch-seitiges Signal beweisen kann** — eine von ihrem SSH-Launch gelöste tmux-Session verliert die `SSH_*`-Marker; ein Darwin-Prozess außerhalb einer Aqua-Session gilt weiterhin als angezeigt; und ein Workstation-lokaler Launch, der später über `ssh -L` erreicht wird, kommt von `127.0.0.1` an, löst `native` auf und öffnet den Chooser auf der unbeaufsichtigten Workstation. Eine falsche `native`-Wahl degradiert zum vorhandenen wiederholbaren Fehlerdialog des Backends, und das direkte Komponieren von `-browse` wählt für solche Deployments die sichere Interaktion.
- **Die Linux-Chooser-Probe liest nur `PATH`** — ein anderweitig erreichbares zenity/kdialog (Shell-Alias, Installation außerhalb von PATH) löst weiterhin `browse` auf; die Installation eines der Binaries auf `PATH` stellt die `native`-Berechtigung beim nächsten Boot wieder her.
- **Nur Boot-Time** — eine Auflösung bedient jeden Client des Boots; pro-Verbindungs-Adaptivität (native für einen lokalen Browser, browse für einen entfernten, derselbe Server) bräuchte eine pro-Client-Capability und die Wire-Ankündigung, die der seam nicht trägt, und wartet auf ein Deployment, das beides gleichzeitig bedient.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Der einzige Effect ist ein Boot-Time-Loader-Entry-Mount im Besitz der Plugin-fiber; der Store ist autoritativ.
