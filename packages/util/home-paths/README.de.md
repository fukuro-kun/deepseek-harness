---
description: "Gemeinsame Auflösung der DeepSeek-Harness-Home- und Benutzerdatenpfade für Pakete, die ein konsistentes Wurzelverzeichnis, Tilde-Expansion und stabile Watch-Pfade benötigen."
kind: "package-library"
---

# @deepseek-ai/dsh-home-paths
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

`@deepseek-ai/dsh-home-paths` ermöglicht Paketautoren, ein einheitliches DeepSeek-Harness-Datenwurzelverzeichnis aufzulösen und Kindpfade daraus abzuleiten. Ein expliziter Pfad gewinnt vor `$DSH_HOME`, das wiederum vor `~/.dsh` gewinnt; leere Umgebungswerte werden ignoriert. Die öffentlichen Helfer können das Wurzelverzeichnis darstellen, ohne einen absoluten Maschinenpfad preiszugeben, expandieren nur nackte oder Current-User-Tilde-Formen und kanonisieren Watch-Ziele, deren letzte Pfadkomponenten noch nicht existieren. Das Paket ist als direkte Bibliotheksabhängigkeit zu verwenden, nicht über `cordis.yml`.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Entwicklerhinweis](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Diese Helfer sind überall dort einzusetzen, wo ein Paket sich mit dem Rest des Harness darüber einigen muss, wo Benutzerdaten liegen: das Home-Verzeichnis einmal auflösen und dann jeden Kindpfad daraus ableiten.

### Das Home-Verzeichnis auflösen

```ts
import { resolveDshHome, dshHomePath } from '@deepseek-ai/dsh-home-paths'

const home = resolveDshHome()                // configured path, else $DSH_HOME, else ~/.dsh
const settings = dshHomePath('settings')     // join one child onto the resolved home
```

Ein explizit konfigurierter Pfad hat die höchste Priorität, danach `$DSH_HOME`, danach der Standard `~/.dsh`. Ein leeres oder nur aus Whitespace bestehendes `$DSH_HOME` gilt als nicht gesetzt, sodass ein leerer Override das Home-Verzeichnis niemals auf das aktuelle Arbeitsverzeichnis auflöst.

### Ein Home-Verzeichnis darstellen

Benutzerseitige Pfade stellen das Wurzelverzeichnis symbolisch dar statt als Maschinenpfad: das Standard-Home wird als `~/.dsh` angezeigt, jedes konfigurierte Home als `$DSH_HOME`. Die Darstellungsform gibt niemals einen absoluten Maschinenpfad preis.

### Benutzerpfade expandieren

`expandHomePath` expandiert ein führendes `~`, `~/` oder `~\` gegen das Home-Verzeichnis des Betriebssystems und lässt alles andere unverändert — Nicht-Tilde-Pfade und Named-User-Formen wie `~alice/...` gehen unverändert durch.

### Watch-Pfade kanonisieren

`canonicalizeWatchPath` gibt einem nativen Dateisystem-Watcher eine kanonische Schreibweise seines Ziels: der tiefste existierende Vorfahre wird über `realpath` aufgelöst und ein fehlendes Suffix wird wieder angehängt, sodass eine Datei oder ein Verzeichnis bereits vor seiner Erstellung beobachtet werden kann. Das verhindert, dass Windows einen regulären Datei-Vorfahren als gewöhnliches Fehlen behandelt, und verhindert, dass 8.3-Kurznamen-Aliase mit den langen Pfaden vermischt werden, die das native Watcher-Backend ausgibt.

-----

<a id="understand-the-implementation"></a>
## Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Das Paket beruht auf einem Prinzip: alle Harness-Benutzerdaten liegen unter einem Wurzelverzeichnis, und jeder andere Helfer leitet sich aus dieser Entscheidung ab.

### Quelltextkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Home-Auflösung, Pfadverknüpfung, Darstellung, Tilde-Expansion und Watch-Pfad-Kanonisierung |
| — | Es wird kein Runtime-Invariant-Begleiter veröffentlicht; dieses reine Hilfswerkzeug besitzt keinen Event-Stream und keine veränderlichen Laufzeitdaten; seine Wertalgebra wird durch Unit-Tests abgesichert. |

### Auflösungsregeln

`resolveDshHome` liest zuerst den expliziten Override, dann `$DSH_HOME` und fällt schließlich auf das Betriebssystem-Home verknüpft mit `.dsh` zurück. Der gewählte Wert wird tilde-expandiert und zu einem absoluten Pfad normalisiert; `dshHomePath` verknüpft Kindsegmente nach Nodes Plattform-Pfadregeln. `dshHomeDisplay` vergleicht den aufgelösten Pfad mit dem Standardwurzelverzeichnis und gibt die symbolische Bezeichnung zurück, sodass ein konfiguriertes Home niemals seinen absoluten Pfad preisgibt.

### Kanonisierungsmechanik

`canonicalizeWatchPath` steigt vom Ziel nach oben, bis es einen existierenden Vorfahren findet, löst diesen mit `realpath` auf, weist nach, dass es ein aufzählbares Verzeichnis ist, und hängt das fehlende Suffix wieder an. Andere Fehler als Fehlen propagiert es, und ein Missing-Suffix-Vorfahre, der kein Verzeichnis ist, wird zurückgewiesen.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn der Launcher oder die Consumer gebraucht werden, die von einem einzigen Home-Wurzelverzeichnis abhängen.

- [Boot-Paket](../../boot/app-boot/README.de.md) — der Launcher, der das Home-Verzeichnis auflöst, bevor ein Plugin mountet.
- [Shell-Umgebung](../../shell/shell-env/README.de.md) — wie `DSH_HOME` die Modell-Shell-Aufrufe erreicht.
- [Anonyme Benutzer-ID](../../identity/anonymous-user-id/README.de.md) — eine gespeicherte Identitätsdatei unter dem aufgelösten Home.

-----

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann die Helfer nicht das richtige Werkzeug sind. Es sind aktuelle Paketbeschränkungen, kein Aufgabenrückstand.

- **Die Expansion ist bewusst eng** — nur nacktes `~`, `~/...` und `~\...` verwenden das aktuelle Betriebssystem-Home; Named-User-Formen wie `~alice/...`, Umgebungsvariablen und Shell-Ausdrücke bleiben unverändert.
- **Kanonisierung liest, mutiert aber nie** — `canonicalizeWatchPath` führt `realpath`-Probes durch und propagiert andere Fehler als Fehlen; Verzeichniserstellung, Berechtigungen und die Trust-Policy für den resultierenden Pfad bleiben beim Aufrufer.

<a id="dev-note"></a>
### Entwicklerhinweis

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
