---
description: "Web-Session-Header-\"Open In...\"-Split-Button: Startet die gemerkte Anwendung auf dem Session-Workspace-Verzeichnis und listet jede Anwendung, die der Host als installiert ermittelt hat."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-open-in-app
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Dieses Paket stellt die Browser-Oberfläche des Open-in-app-Features bereit: einen Session-Header-Split-Button, dessen Hauptbutton das Workspace-Verzeichnis der aktuellen Session (das `cwd` der Zusammenfassung) in der gemerkten Anwendung öffnet und dessen Chevron jede Katalog-Anwendung auflistet, die der Host als installiert ermittelt hat. Verfügbarkeit, Icons und Starts kommen von den Host-Routen von [`dsh-host-open-in-app`](../../host/open-in-app/README.de.md); mounte die beiden Pakete zusammen. Eine Session ohne Workspace-Verzeichnis oder ein Host ohne nennbare installierte Anwendung rendert gar keinen Button.

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

Mounte dieses Plugin in der Web-Komposition neben [`dsh-host-open-in-app`](../../host/open-in-app/README.de.md); das Paar komponiert das ganze Feature in zwei cordis.yml-Zeilen, und diese Zeile nimmt keine Config. Der Session-Header bekommt einen „Open In..."-Split-Button, sobald der Host mindestens eine installierte Katalog-Anwendung ermittelt hat und die Session ein bekanntes Workspace-Verzeichnis hat.

### Was dich erwartet

Der Hauptbutton zeigt das Icon der gemerkten Anwendung — das echte Anwendungs-Icon überall dort, wo der Host eines extrahiert (macOS-Bundle-Icons, Windows-Executable-Icons, Linux-Theme-Icons), ein generisches Glyph, wo er keins liefert — und einen Design-System-Tooltip („Lokal öffnen"); ein Klick startet sofort. Das Chevron öffnet ein dichtes Menü der installierten Anwendungen, in dem die gemerkte durch eine gefüllte Zeile markiert ist. Die Verfügbarkeit wird einmal pro Seite vom Host gelesen; die zuletzt gewählte Anwendung persistiert im Browser (`dsh.open-in-app.choice`), und eine nicht mehr installierte Wahl fällt auf den ersten verfügbaren Eintrag zurück. Ein schnell fertig werdender Start lässt den Button unberührt — die abgedunkelte Busy-Darstellung erscheint erst nach 250 ms in Flight — und ein fehlgeschlagener Start zeigt den Fehler-Tooltip und einen roten Rahmen für zwei Sekunden. Alle Texte leben im bilingualen `open-in-app`-Locale-Namespace; eine Anwendungs-id, die die Wörterbücher nicht benennen können, wird nicht angeboten.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen</summary>

Das Plugin registriert den Split-Button auf `conversation.session.header.utilities` über die übliche slot/inject-Währung und registriert die `open-in-app`-Wörterbücher als einen Effect. Ein seitenlebenslanger Controller ([`src/client/controller.ts`](src/client/controller.ts)) besitzt das einmal-pro-Seite-Verfügbarkeitslesen, den persistierten Choice-Snapshot-Store und den Launch-POST; die Komponente erhält beide Stores über das `hooks`-Compartment von inject, sodass jeder Session-Header dieselbe Wahrheit teilt. Routenpfade und Wire-Payload-Typen werden aus dem browsersicheren Subpath `@deepseek-ai/dsh-host-open-in-app/shared` des Host-Pakets inliniert. In-flight-Starts werden durch ein Ref abgesichert — wiederholte Klicks und Menüwahlen während eines Starts werden ganz ignoriert (eine Wahl würde sonst eine Auswahl persistieren, die die Geste nie geöffnet hat) — und die Busy-/Error-Darstellung wird per Timer um das `launch`-Promise gesteuert. Die Node-Hälfte ist ein leeres `apply`, das das Plugin auf der Host-Roster hält.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

- [dsh-host-open-in-app](../../host/open-in-app/README.de.md) — die Host-Routen für Verfügbarkeit, Icons und Starts und der Katalog dahinter.
- [dsh-session-log-export](../../session-query/session-log-export/README.de.md) — die geschwisterliche Session-Header-Aktion.
- [Web-Client-Architektur](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.de.md) — wie Browser-Plugin-Zeilen laden und Slots registrieren.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da der Split-Button Browser-Chrome ist; nichts hiervon erreicht eine Modellanfrage.

#### KV-Cache-Effekt

Keiner; dieses Paket assembliert oder sendet keine Provider-Anfrage.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- **Die Wörterbücher steuern das Menü.** Eine Host-Katalog-Erweiterung ohne passenden `app.<id>`-Eintrag in beiden Wörterbüchern bleibt unsichtbar, statt eine rohe id zu zeigen; den Katalog zu erweitern heißt, [`dsh-host-open-in-app`](../../host/open-in-app/README.de.md) und die Locales dieses Pakets gemeinsam zu erweitern.
- **Verfügbarkeit wird einmal pro Seite gelesen.** Eine während geöffneter Seite installierte Anwendung erscheint nach einem Reload (und host-seitig nach einem Host-Neustart).

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen</summary>

Die Feature-Ebene-Entscheidungen, einschließlich der Aufteilung in das Host-Paket und diese Oberfläche, sind in der [Promotion-Agent-Note](../../../.agents/notes/implemented/feature/2026-08-25-promote-open-anywhere-plugin.de.md) festgehalten.

</details>

**Runtime-Invariante:** Es wird kein Begleiter veröffentlicht. Das Plugin registriert einen Wörterbuch-Effect und einen Header-Slot-Eintrag, deren Dispose die HMR-Safety-Spec beweist; Verfügbarkeit und Wahl leben in den Snapshot-Stores des Controllers ohne zweite Kopie, die abweichen könnte.
