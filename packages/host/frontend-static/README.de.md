---
description: "SPA-dist-Server für die Web-Shell: beansprucht den Webserver-Fallback-Seat und liefert das gebaute Frontend mit Traversal-Ablehnung und SPA-index-Fallback aus."
kind: "package-reference"
---

# @deepseek-ai/dsh-host-frontend-static
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

Liefert die gebaute Web-Shell aus dem konfigurierten Distributionsverzeichnis an Browser aus. Die Wurzel und der konfigurierte index-Pfad rendern das gebootstrapte index; existierende Assets werden direkt ausgeliefert, während fehlende oder Nicht-Datei-Pfade 404, Traversal 403 und nicht unterstützte Methoden 405 zurückgeben. Der index-Zugriff erfordert ein gültiges Prozess-token oder Browser-Cookie, statische Assets bleiben aber öffentlich. Nur eine Instanz kann nicht übereinstimmende Routen gleichzeitig behandeln; eine zweite Aktivierung schlägt fehl, und das Entladen der aktiven Instanz lässt nicht übereinstimmende Anfragen 404 zurückgeben.

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

Komponieren Sie dieses Plugin in einem browserzugewandten Host, der die gebaute Web-Shell ausliefert: Es beansprucht den Fallback-Seat des Webservers und beantwortet jede Anfrage, auf die keine benannte Route passt. Es braucht einen Konfigurationswert — wo die `index.html` des gebauten Frontends liegt.

### Minimale Konfiguration

```yaml
- name: '@deepseek-ai/dsh-host-frontend-static'
  config:
    distIndex: /absolute/path/to/dist/index.html
```

`distIndex` ist eine Assembly-Tatsache der komponierenden Anwendung: [`dsh-web-app`](../../bundle/web-app/README.de.md) löst es über die Exports des Frontend-Pakets auf und mountet dieses Plugin; ein Deployment hardcodiert es niemals.

### Was der Server erzwingt

Anfragen werden aus der dist-Wurzel (dem Verzeichnis, das `distIndex` enthält) ausgeliefert. Die dist-Wurzel und der konfigurierte index-Pfad rendern `index.html` mit HTTP 200; jede andere existierende Datei wird direkt mit ihrem MIME-Typ ausgeliefert, und unbekannte Erweiterungen gehen als `application/octet-stream` raus. Ein Pfad, der außerhalb der Wurzel auflöst, wird mit 403 abgelehnt, sodass ein präparierter Pfad keine Dateien oberhalb des dist lesen kann. Ein fehlendes oder Nicht-Datei-Ziel innerhalb der dist-Wurzel — eine fehlende Datei, ein Verzeichnis oder ein fehlender konfigurierter index — gibt ein leeres 404 zurück. Nicht-GET/HEAD-Anfragen ohne passende benannte Route werden mit 405 beantwortet. Jede erfolgreiche index-Antwort wird über das `renderIndex` des Webservers gerendert, sodass das Boot-manifest auf `/` und auf dem konfigurierten index-Pfad die Seite erreicht.

Wurzel- und konfigurierte-index-Antworten rufen `ctx.connection.authorizeIndex` auf, bevor sie HTML lesen. Ein gültiges Prozess-token erhält eine 303-Weiterleitung plus das persistente Browser-Cookie; ein vorhandenes gültiges Cookie liefert den index aus; jede andere index-Anfrage erhält die Connection-eigene 401-Antwort. Nicht-index-Dateien bleiben öffentliche statische Assets. Connection besitzt die Semantik von token, Cookie, Ablauf und Signier-Record.

### Beobachtbare Fehler

Traversal gibt 403 zurück statt einer Fehlerseite. Ein fehlendes oder Nicht-Datei-Ziel innerhalb der dist-Wurzel gibt ein leeres 404 zurück, sodass ein veralteter Link oder ein falsch getippter pathname ein expliziter Fehlschlag ist statt eines stillen SPA-Fallbacks. Den Seat zweimal zu beanspruchen wirft, und solange der Seat unbeansprucht ist, antwortet der Webserver 404 — genau das, was ein Browser sieht, wenn die Fiber dieses Plugins disposed wird.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

### Designkonzept

Das Paket ist ein Function-Plugin um `serveStatic`: `apply` löst die dist-Wurzel aus `distIndex` auf, baut eine `renderIndex`-Closure, die `ctx.webServer.renderIndex` über dem rohen `index.html` ausführt, und registriert den Fallback-Handler unter einem Effect-Scope. Der Seat ist per Webserver-Vertrag Single-Owner — eine zweite Registrierung wirft — und Effect-scoped, sodass das Disposen der Fiber den Seat freigibt.

### Die Traversal-Schranke

`serveStatic` normalisiert den angefragten pathname und joint ihn zur dist-Wurzel, dann verlangt es, dass das Ziel die Wurzel selbst ist oder darunter bleibt. Die Prüfung nutzt `sep` statt `/`, weil `resolve()` unter Windows Backslash-Pfade emittiert, wo ein `/`-Suffix jeden legitimen Unterpfad als Traversal ablehnen würde.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | `serveStatic` und `apply`: Fallback-Beanspruchung, Traversal-Ablehnung, index-Rendering, MIME-Tabelle |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Auslieferungsvertrag nicht ausreicht: zuerst der Vertrag des Seat-Besitzers, dann die Komposition, die das dist auflöst, und die Subsystem-Referenz.

- [Webserver](../webserver/README.de.md) — der Fallback-Seat, den dieses Plugin beansprucht, und die index-Taps, die es ausführt.
- [dsh-web-app-bundle](../../bundle/web-app/README.de.md) — die Anwendung, die `distIndex` auflöst und dieses Plugin mountet.
- [HTTP-Server-Subsystem](../../../docs/subsystems/web-server.de.md) — wie der Fallback-Seat in die Routing-Tabellen passt.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-host-frontend-static) — jedes akzeptierte Konfigurationsfeld und seine Quelldeklaration.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da der SPA-dist-Server Browser-Asset-Anfragen beantwortet und nichts Modell-seitiges registriert.

#### KV-Cache-Effekt

Keiner; dieses Paket stellt weder eine Provider-Anfrage zusammen noch sendet es eine.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann eine ausgelieferte Asset-Klasse noch nicht abgedeckt ist. Sie sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Die Starter-MIME-Tabelle ist minimal** — sie deckt das von Vite emittierte Asset-Set plus das ausgelieferte PWA-manifest ab; andere Erweiterungen fallen auf `application/octet-stream` zurück, bis eine Asset-Klasse ausgeliefert wird.
- **Pathname-Routing ist explizit** — der aktuelle Client tritt über die Wurzel oder den konfigurierten index-Pfad ein und hat keine History-API-pathname-Routen. Eine hinzuzufügen erfordert eine explizite Server-Regel und Real-Composition-Abdeckung statt eines breiten Fallbacks für jeden Miss.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-invariant:** Es wird kein Begleitexport veröffentlicht. Die einzige eigene Beziehung ist der einzelne Fallback-Seat, der sich nicht aus dem Teardown-Strom prüfen lässt — `internal/plugin` feuert, bevor die Effects der disposenden Fiber laufen, sodass der legitime Besitzer den Seat zum Benachrichtigungszeitpunkt noch hält und jede Claim-Probe bei jedem korrekten Disposal falsch positiv wäre (anders als beim Webserver-Begleitexport, dessen Reserved-Path-Probes nie mit einer live Registrierung kollidieren). Die register/release-Symmetrie des Seats wird stattdessen durch den Real-Composition-HMR-Safety-Test des Pakets abgedeckt.
