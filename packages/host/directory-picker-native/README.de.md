---
description: "Native-OS-Chooser-Backend des Directory-Picker-Seams: öffnet pro Pick einen Plattform-Chooser für Operatoren am Display des Web-GUI-Hosts."
kind: "package-reference"
---

# @deepseek-ai/dsh-host-directory-picker-native

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

Ein Operator am Display des Hosts wählt ein Workspace-Verzeichnis über einen nativen OS-Chooser: `dsh-host-directory-picker-native` öffnet pro Pick einen Plattform-Verzeichnis-Chooser und resolved den gewählten absoluten Pfad (`null` bei Abbruch). macOS treibt `osascript`, Linux verwendet Zenity mit KDialog-Fallback, und Windows öffnet den modernen `IFileOpenDialog` in einem gespawnten Child-Prozess. Nur brauchbar, wenn der Operator am Display des Hosts sitzt — Remote-Deployments komponieren stattdessen das [Browse-Backend](../directory-picker-browse/README.de.md). Eine Kompositionszeile registriert außerdem die passende browserseitige Interaktion im Workspace-Flow und wählt damit beide Seiten.

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

Komponiere dieses Backend, wenn der Operator am Display des Hosts arbeitet und ein nativer Chooser die richtige Interaktion ist. Ein Workspace-Flow, der einen Directory Picker öffnet, ruft `pick(signal)` einmal pro Open-Request auf; das zurückgegebene Promise resolved mit dem gewählten absoluten Pfad oder mit `null`, wenn der Operator abbricht.

### Wann es zu wählen ist

Wähle dieses Backend für einen workstation-lokalen Operator auf macOS, Windows oder Desktop-Linux. Wähle das [Browse-Backend](../directory-picker-browse/README.de.md), wenn Clients keinen OS-Chooser erreichen können — Remote-Browser, SSH-geforwardete Sessions oder unbeaufsichtigte Hosts. Wenn die Situation variiert, resolved der [adaptive Chooser](../directory-picker-auto/README.de.md) sie beim Boot.

### Was ein Operator erlebt

Jeder Aufruf öffnet einen nativen Chooser auf dem Host-Display und wartet auf den Operator; das Abort des Caller-Signals terminiert den Chooser-Prozess, statt ihn offen zu lassen. Auf Linux braucht der Chooser entweder installiertes Zenity oder KDialog; ist keins von beiden vorhanden, rejectet `pick` mit einem handhabbaren Fehler, statt auf einen Typed-Path-Prompt zurückzufallen. Die Browser-Hälfte dieses Pakets registriert einen renderlosen Flow-Insassen im Workspace-Flow — jeder `open`-Request treibt `directoryPicker/pick` und meldet das eine Ergebnis (gewählter Pfad, Abbruch oder Fehlschlag).

### Beobachtbare Fehlschläge

Ein Abbruch liefert `null`, keinen Fehler. Fehlendes Plattform-Tooling, ein fehlgeschlagener Chooser-Launch oder ein abgebrochener Pick erscheint als Rejection, die die UI präsentieren kann; das [Browse-Backend](../directory-picker-browse/README.de.md) bleibt der Composition-Level-Fallback für Deployments, in denen natives Picken unzuverlässig ist.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

### Designkonzept

Das Backend ist ein dünner Service über einem Plattform-Chooser: `NativeDirectoryPicker` registriert die `native`-Capability, deren `pick` an `pickNativeDirectory` weiterleitet, und der Chooser läuft als Subprocess, sodass der Host-Prozess nie am Dialog blockiert. Die Kommandogrenze (`DirectoryPickerRunner`) und Plattform-Fakten sind injizierbar, und der geteilte Shell-freie Subprocess-Runner lebt in [`dsh-native-command`](../../util/native-command/README.de.md).

### Plattform-Mechanik

Plattform-Tools laufen ohne Shell: `osascript` auf macOS und Zenity mit KDialog-Fallback auf Linux; der Caller-Abort terminiert den nativen Prozess. Windows öffnet den modernen `IFileOpenDialog` in einem gespawnten Child-Prozess — eine koffi-getriebene COM-Konversation auf dem Main-Thread des Childs mit der besten Thread-DPI-Awareness, die der Host akzeptiert (zuerst per-monitor-v2), abgebrochen durch Posten von `WM_CLOSE` an den Dialog-Thread. Unmittelbar vor `Show` synthetisiert das Child einen Alt-Tastendruck über `keybd_event`, wodurch der Dialog sich als Foreground-Fenster aktivieren kann, selbst wenn ein Hintergrund-Host-Prozess das Child gespawnt hat.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Entry: `NativeDirectoryPicker`-Service mit der stabilen `native`-Capability |
| [`src/native-picker.ts`](src/native-picker.ts) | Chooser-Dispatch: Plattformauswahl, Subprocess-Ausführung, Abort-Verdrahtung |
| [`src/win32-dialog.ts`](src/win32-dialog.ts) + Geschwister | Windows-Child-Prozess-`IFileOpenDialog` via koffi, DPI-Handling, `WM_CLOSE`-Abort |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Backend-Vertrag nicht reicht: zuerst die Seam-Definition, dann das alternative Backend und den Chooser, der zwischen beiden auswählt.

- [Directory-Picker-Seam](../directory-picker/README.de.md) — der `native`-Capability-Vertrag und das typisierte Fehlervokabular.
- [Directory-Picker-Capability-Seam-Entscheidung](../../../.agents/notes/archived/architecture/2026-07-28-directory-picker-capability-seam.md) — warum sich die Backends in der Interaktionsform unterscheiden.
- [Browse-Backend](../directory-picker-browse/README.de.md) — die In-App-Alternative für Remote-Clients.
- [Adaptiver Chooser](../directory-picker-auto/README.de.md) — Boot-Time-Resolution zwischen native und browse.
- [Shell-freier Subprocess-Runner](../../util/native-command/README.de.md) — das geteilte Subprocess-Primitive, auf dem der Chooser läuft.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da das GUI-Host-Picking-Backend nichts Modellseitiges registriert.

#### KV-Cache-Effekt

Keiner; dieses Paket assembliert weder einen Provider-Request noch sendet es einen.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann die native Interaktion nicht verfügbar oder fragil ist. Sie sind aktuelle Paket-Constraints, kein Aufgaben-Backlog.

- **Linux erfordert Desktop-Tooling** — ist weder Zenity noch KDialog installiert, rejectet `pick` mit einem handhabbaren Fehler; es fällt nicht auf einen Typed-Path-Prompt zurück (das Browse-Backend ist dieser Fallback auf Composition-Ebene).
- **Windows hat keinen Mechanismus-Fallback** — der Child-Prozess-Picker über das paketierte koffi ist die einzige native Stufe, sodass eine COM-Verweigerung oder ein Dialog-Crash den Fehlschlag meldet; das Browse-Backend bleibt der Fallback auf Composition-Ebene.
- **Die Windows-Foreground-Grant beruht auf injizierter Eingabe** — das Child synthetisiert vor `Show` einen Alt-Tastendruck, damit der Dialog den Vordergrund von einem Hintergrund-Host übernehmen kann; wo synthetisierte Eingabe unterdrückt wird (Secure Desktops, eingeschränkte Remote-Sessions, ein elevated Foreground-Fenster), kann der Dialog trotzdem hinter anderen Fenstern öffnen. Die Technik ist nur auf Windows 11 validiert.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Jeder Pick ist ein zustandsloser Subprocess-Roundtrip; das Chooser-Ergebnis ist nur der zurückgegebene Pfad.
