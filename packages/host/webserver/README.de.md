---
description: "Der HTTP-Server des Web-GUI-Hosts: benannte Routen- und Upgrade-Registrierung, Index-Transforms und der einzelne Fallback-Platz, der das SPA-dist der Web-Shell bedient."
kind: "package-reference"
---

# @deepseek-ai/dsh-host-webserver
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Browser erreichen das Web-GUI per HTTP über `dsh-host-webserver`: einen `node:http`-Server, in dem andere Plugins benannte Routen, Upgrade-Routen, Index-Starteingaben und einen Fallback-Handler registrieren. Er kennt keine Harness-Konzepte und liefert keine Dateien aus — die `/api`-Brücke, Plugin-Bundles, der HMR-Eventstream und das SPA-dist gehören den Plugins, die sie registrieren. Das Routenmatching ist fest: exakt über die gesamte Tabelle, dann längstes Präfix, dann der Fallback-Handler. Er bedient nur Browser; Electron lädt dist über `file://` und trägt fetch über eine IPC-Brücke.

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

Komponiere den Webserver als HTTP-Transport eines browserseitigen Hosts und lass die Feature-Plugins ihre Routen beanspruchen. Die Aktivierung lauscht sofort; die Registrierungsreihenfolge trägt keine requestseitige Semantik, weil benannte Routen disjunkt komponiert werden.

### Minimalkonfiguration

```yaml
- name: '@deepseek-ai/dsh-host-webserver'
  config:
    host: 127.0.0.1
    port: 3000
```

`host` akzeptiert genau zwei Werte: `127.0.0.1` (Standardhaltung, nur Loopback) und `0.0.0.0` (bewusste Netzwerk-Exposition — der Server trägt selbst kein TLS, keine Authentifizierung und keine Origin-Policy). `port` 0 fordert einen OS-zugewiesenen Port an; `ctx.webServer.port` liest danach den lauschenden Port.

Setze `compression: 'gzip'`, um berechtigte socket-gestützte Responses zu verpacken, ohne Routen-APIs zu ändern. Der Client muss gzip akzeptieren und der Media-Type muss komprimierbar sein; Responses mit bekannter Länge unterhalb von `compressionThresholdBytes` bleiben unkomprimiert, während Streams unbekannter Länge sofort berechtigt sind. Bestehende Encodings, `Cache-Control: no-transform`, Range-Responses, SSE, ZIP und das gepackte `.gz`-Worker-Image bleiben unverändert. Das ausgelieferte Web-Bundle nutzt Kompressionslevel 1 mit einer 1024-Byte-Schwelle; andere Kompositionen verwenden standardmäßig keine Kompression.

### Routen registrieren

`register(route)` fügt eine benannte `exact`- oder `prefix`-HTTP-Route hinzu, `registerUpgrade(route)` fügt eine Upgrade-Route für einen exakten Pfadnamen hinzu, und beide geben einen Disposer zurück, der die Registrierung entfernt. Ein doppelter Pfad in derselben Tabelle wirft — Routenmuster sind ein Kompositions-vertrag, eine Kollision ist also eine Fehlkonfiguration. HTTP-Matching läuft exakt über die gesamte Tabelle, dann längstes Präfix, dann der Fallback-Handler; Upgrades matchen exakt, und nicht gematchte Verbindungen werden geschlossen.

### Der Fallback-Platz

`registerFallback(handler)` beansprucht den einen Handler für jede Anfrage, die keine benannte Route matcht. Eine zweite Registrierung wirft; solange kein Fallback registriert ist, antwortet der Server 404. In der ausgelieferten Web-Komposition besitzt der [SPA-dist-Server](../frontend-static/README.de.md) den Platz und ruft `renderIndex` auf jeder von ihm gerenderten Index-Response auf.

Index-Starteingaben sind zwei Schichten. `collectIndexInjections()` sammelt eine frische Injection-Tabelle — ein `webserver/index-inject`-Emit pro Aufruf, jeder Subscriber schiebt seine aktuellen Zeilen — und `renderIndex(html)` rendert diese Zeilen in den index.html-Body, bevor es die rohen `tapIndex(transform)`-Transforms in Registrierungsreihenfolge anwendet. Eine `script-preload`-Zeile rendert einen advisory Classic-Script-Preload-Link. Statische Deployments tragen dieselben Zeilen in ihrem Boot-Payload. `applyIndexTaps(html)` wendet nur die rohen Transforms an; es ist der Notausgang für Markup, das keine Zeile ausdrückt.

### Verhalten bei Fehlern

Ein Listen-Fehler (zum Beispiel EADDRINUSE) lässt die Plugin-Initialisierung mit dem Bind-Diagnostikum fehlschlagen. Ein HTTP-Request, dessen Handler wirft, wird mit 400 beantwortet — oder der Socket zerstört, wenn Header bereits raus sind — und als Warnung geloggt; er beendet niemals den Prozess. Eine Exception im Upgrade-Handler oder ein Transportfehler auf einem geupgradeten Socket loggt eine Warnung und zerstört dessen Socket.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

### Designkonzept

Das Paket ist eine schlichte Routenregistratur ohne Harness-Vokabular: `WebServer` erweitert Cordis `Service` und hält drei Routentabellen plus den Fallback-Slot, die rohe Index-Tap-Liste und das `webserver/index-inject`-Event, über das der Index-Renderer Zeilen sammelt. Index-Rendering komponiert pro Response zwei Schichten: `renderIndex` rendert die frische Injection-Tabelle — einschließlich advisory `script-preload`-Zeilen — in den Body und wendet danach die rohen Taps in Registrierungsreihenfolge an; `applyIndexTaps` führt die Taps allein aus. Der Upgrade-Handler besitzt den Protokoll-Handshake und die Verbindungsinhalte; der Webserver liefert nur den rohen Socket und den Request. Die Getter `host` und `port` stellen Kompositionsfakten bereit, an die sich andere Plugins anpassen (zum Beispiel der directory-picker-Chooser).

### Matching und Lebenszyklus

`match(pathname)` fragt zuerst die exakte Tabelle, dann läuft es die Präfixtabelle nach dem längsten Match ab, dann den Fallback. Die Aktivierung (`[Service.init]`) lauscht sofort; die Disposal startet `close()` und `closeAllConnections()`, zerstört jeden verfolgten geupgradeten Socket und kehrt erst zurück, nachdem Server und diese Sockets geschlossen sind. Node schließt geupgradete Sockets nicht in `closeAllConnections()` ein, daher verfolgt der Service sie explizit.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | `WebServer`-Service: Routentabellen, Fallback-Platz, Index-Rendering, Matching, Lebenszyklus |
| — | Es wird kein Runtime-Invarianten-Companion veröffentlicht; Routenregistrierung und -disposal mutieren dieselbe Routentabelle über denselben Service, sodass eine register/dispose-Sonde nur die Implementierung erneut ausführt. Echte Routing- und HMR-Tests besitzen das Verhalten. |
| [`src/injections.ts`](src/injections.ts) | Strukturierte `IndexInjection`-Zeilen und `renderIndexInjections`-Zeilenrendering |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Server-Vertrag nicht ausreicht: die Subsystem-Referenz, dann der Fallback-Besitzer und die Schichtungsentscheidung, wer welche Route registriert.

- [HTTP-Server-Subsystem](../../../docs/subsystems/web-server.de.md) — Routen, Matching-Reihenfolge und die vom Server akzeptierte Config.
- [SPA-dist-Server](../frontend-static/README.de.md) — der ausgelieferte Besitzer des Fallback-Platzes.
- [Web-config-tree-Boot und Transportschichtung](../../../.agents/notes/implemented/architecture/2026-07-24-web-config-tree-boot-and-transport-layering.de.md) — warum Feature-Plugins jede Route besitzen.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-host-webserver) — jedes akzeptierte Config-Feld und seine Quelldeklaration.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da der HTTP-Träger Browser und API-Handler brückt und nichts Modellseitiges registriert.

#### KV-Cache-Effekt

Keiner; dieses Paket assembliert oder sendet keinen Provider-Request.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wo der Server bewusst minimal bleibt. Sie sind aktuelle Paket-Einschränkungen, kein Aufgabenrückstand.

- **Kein serverweites TLS, keine Authentifizierung, keine Origin-Policy** — Routenbesitzer wie `dsh-client-connection` setzen ihre eigene Request-Policy durch. Das Binden einer Nicht-Loopback-Adresse exponiert weiterhin ungeschützte Routen und statische Assets in dieses Netz.
- **Socket-Optionen sind fest** — die Config wählt Bind-Host und Port, während Backlog und andere Socket-Einstellungen intern bleiben, bis ein Deployment sie braucht.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
