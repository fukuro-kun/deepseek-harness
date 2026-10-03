---
description: "Nur-Entwicklungs-Hot-Reload für Browser-Client-Plugins: Der Neuaufbau eines Plugin-Bundles tauscht das laufende Plugin im Ort aus — für Entwickler, die an der Web-GUI iterieren."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-hmr
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`dsh-client-hmr` lädt ein Browser-Client-Plugin im Ort neu, wenn sein Bundle neu gebaut wird, sodass ein Entwickler, der Plugin-Quellcode bearbeitet, die Änderung ohne vollständigen Seiten-Reload sieht. Die Reload-Kette bleibt ohne Rebuild-Watcher im Leerlauf: nur ein `pnpm run dev:web`-artiger Prozess, der Client-Bundles neu schreibt, erzeugt die Rebuilds, auf die sie reagiert. Jeder Reload tauscht ein Plugin mit frischem Komponentenzustand aus, während die Datenschicht (Verbindung, Laufzeit und Session-Objekte) unangetastet bleibt. Alles hier ist Entwicklungsmaschinerie im Browser; das Modell sieht sie nie.

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

Aktivieren Sie den Rebuild-Watcher für das Plugin, das Sie bearbeiten, und speichern Sie dann: der Browser holt das neu gebaute Bundle vom Dev-Server ab und tauscht das Plugin ohne Seiten-Reload aus. Verwenden Sie es während der Client-Entwicklung; in einem Produktionsbuild geschieht nichts Beobachtbares, weil kein Watcher Bundles neu schreibt.

### Die Reload-Kette starten

Führen Sie `pnpm run dev:web` (oder einen beliebigen tsdown-watch-Prozess, der das `lib/client.js` des Plugins schreibt) gegen denselben Host aus; neu gebaute Plugins werden dann automatisch einzeln in den laufenden Browser eingetauscht.

### Was ein Reload tut

Jeder Reload führt das Plugin-Bundle erneut aus und mountet das Plugin mit frischem Zustand neu. Plugins, die vom neu geladenen abhängen, werden automatisch mit neu geladen. Ein fehlschlagender Reload wird sichtbar gemeldet und beim nächsten Rebuild von Grund auf wiederholt.

### Konfiguration

| Feld | Standard | Bedeutung |
|---|---|---|
| `pollIntervalMs` | `500` | Stat-Poll-Intervall des Bundles in Millisekunden |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-client-hmr) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Erfolg beobachten

Ein erfolgreicher Tausch zeigt die bearbeitete UI sofort ohne Seiten-Reload, und das Plugin arbeitet nach dem Tausch weiter. Denken Sie an den Trade-off: React-Zustand innerhalb des neu geladenen Plugins geht verloren, während Session-, Workspace- und Verbindungszustand überlebt.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie die Reload-Kette aufgebaut ist; das beobachtbare Verhalten wird in [Dieses Paket verwenden](#use-this-package) behandelt.

### Designkonzept

Die Kette besteht aus zwei Hälften mit einem Vertrag: die Node-Hälfte besitzt Bundle-Erkennung und Benachrichtigung, die Browser-Hälfte besitzt den Tausch. Die Node-Hälfte führt ein Intervall aus, das jedes Graph-Bundle gegen die vorab gelesene Baseline des Modul-Hosts stat-pollt. Eine unveränderte Startzeile beginnt zu beobachten, ohne Inhalt zu lesen oder zu hashen; eine geänderte Zeile — oder eine dirty Zeile, deren Artefakt wieder auftaucht — gelangt in `rebuilt()`, und nur echte Revisionsänderungen werden gebroadcastet. `rebuilt()` liest die aktuelle Source Map zusammen mit dem geänderten Bundle; ein reiner Map-Schreibvorgang lädt keinen ausführbaren Code neu. Die Node-Hälfte bedient außerdem `/plugins/events`, einen SSE-Kanal, der `graph`- und `rebuilt`-Frames broadcastet.

### Der Browser-Tausch

Bei einem `rebuilt`-Frame lässt die Revision `invalidate` die unveränderliche Ein-Ressourcen-Combo-URL des Plugins statt seiner anfänglichen Mehrressourcen-URL wählen. `prefetch` lädt und registriert die neue factory, während die alte fiber noch bedient. Die restliche Reihenfolge: Registry-first-Abbau (`registry.delete` vor dem `internal/plugin`-Emit des fiber-disposers, sonst markiert der vendored Loader den Eintrag als deaktiviert), die Entladung der alten fiber abwarten, `entry.fiber` löschen, eigene `<style data-plugin>`-Tags entfernen, dann importiert und mountet `entry.refresh()` neu, und `fiber.await()` wirft Startfehler hörbar erneut. Der Tausch ist sicher, weil Ausführung unter dem lazy-CJS-Modell reine Registrierung ist: jeder Modul-Seiteneffekt lebt in der factory-Closure und läuft bei der Materialisierung.

### Kaskade und Selbst-Reload

Die Aktivierungs-epoch einer fiber verkettet die uids ihrer Service Providers; das Ersetzen der fiber eines Providers rekaskadiert daher jeden Abhängigen über cordis selbst, ganz ohne HMR-seitige Buchführung. Dieses Plugin ist selbst ein Graph-Eintrag, daher kann ein `rebuilt`-Frame es nennen; der laufende Reload läuft in der Closure des alten Bundles weiter, und das apply des neuen Bundles öffnet einen frischen Kanal.

### Fehlerpolitik

Kein Rollback: ein Importfehler lässt den Eintrag fiberlos zurück (der nächste `rebuilt`-Frame versucht von Grund auf neu), und ein apply-Fehler hinterlässt eine FAILED-fiber, die in der Statusprojektion der Shell sichtbar ist. Beide loggen laut.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Node-Hälfte: Bundle-stat-Poll, `rebuilt`-Meldung, `/plugins/events`-SSE-Kanal |
| [`src/client/index.ts`](src/client/index.ts) | Browser-Hälfte: SSE-Subscription, serialisierte Reload-Queue, fiber-Tausch |
| [`src/events.ts`](src/events.ts) | Geteilte Frame-Typen (`graph` / `rebuilt`) und die Endpunkt-Konstante |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese, wenn der Reload-Vertrag nicht reicht: das Modulsystem, das die Bundles bedient, die Shell, die sie bootet, und die Modulgraph-Regeln hinter den externals.

- [Client-Modulsystem](../modules/README.de.md) — die lazy-CJS-Modultabelle und die `invalidate`/`prefetch`-Hooks, die dieser Treiber ansteuert.
- [Web-Boot-Kernel](../web/README.de.md) — die Shell, die den Plugin-Baum bootet und den Eintragsstatus zeigt.
- [Client-Gruppenkarte](../README.de.md) — die Browser-Hälfte, die dieses Paket neu lädt.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-client-hmr) — jedes akzeptierte Konfigurationsfeld und seine Quelldeklaration.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da der Reload-Treiber eine browserseitige UI-Plugin-Schicht ist, die nichts Modellzugewandtes registriert.

#### KV-Cache-Auswirkung

Keine; dieses Paket stellt weder einen Provider-Request zusammen noch sendet es einen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, was der Reload-Treiber nicht bewahrt oder wiederherstellt. Sie sind aktuelle Paketrestriktionen, kein Aufgabenrückstand.

- **Reload ist bewusst grob** — eine frische fiber und frische Komponenten; React-Zustand im neu geladenen Plugin geht verloren, während die Datenschicht (connection/runtime fibers, Session-Objekte) unangetastet bleibt. Zustandserhaltung auf react-refresh-Niveau kollidiert mit der erneuten Bundle-Ausführung und ist bewusst ausgeschlossen.
- **Kein Fehler-Rollback** — ein fehlschlagender Reload lässt den Eintrag FAILED und in der Loader-Statusprojektion sichtbar; das vorherige Bundle wird nicht automatisch wiederhergestellt.
- **Rebuild-Frames ersetzen den Boot-Graph nicht** — jeder Frame trägt die Plugin-Artefakt-Revision, die für seinen Ein-Ressourcen-Combo-Reload nötig ist; ein Seiten-Reload erhält den neu komponierten Startgraphen.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
