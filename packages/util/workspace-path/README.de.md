---
description: "Browser-sichere Workspace-Pfadhelfer zum Verbinden relativer Pfade, Kürzen von POSIX-Home-Verzeichnissen und Ableiten von Anzeigetiteln."
kind: "package-library"
---

# dsh-util-workspace-path
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Browser-sichere Pfadhelfer, die von Workspace-bezogenen Client- und Controller-Paketen geteilt werden. Das Paket verbindet Workspace-relative Pfade, kürzt POSIX-Home-Verzeichnisse für die Anzeige, leitet Workspace-Titel aus POSIX- oder Windows-Pfaden ab, zerlegt einen Pfad in seine Verzeichnisse und das letzte Segment für die Anzeige und besitzt die `dsh-resource://file/…`-Adressgrammatik, die eine Workspace-Datei zwischen Sidebar und Ressourcenmodell benennt. `relativizeToCwd` entfernt das Workspace-Präfix für die Anzeige und bewahrt Pfade außerhalb dieses Verzeichnisses. Es hat weder einen Cordis-Service noch Runtime-Zustand.

## Inhaltsverzeichnis

- [Dateiadressen](#file-addresses)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Entwicklerhinweis](#dev-note)

-----

<a id="file-addresses"></a>
## Dateiadressen

Eine Ressourcenadresse ist `dsh-resource://<type>/…`, und der Typ — der URI-Host — ist der Ressourcenprotokoll-Schlüssel (`file` oder ein Schlüssel, den ein Plugin in `ResourceProtocolMap` deklariert); jedes andere Scheme ist ein an anderer Stelle definiertes Navigationsprotokoll. `dsh-resource://file/session/<sessionId>/<path>` benennt die Session, die den Host-Zugriff autorisiert, sowie einen workspace-relativen oder absoluten Pfad. Führende Schrägstriche bleiben Teil des Pfads: `/etc/hosts` ist `dsh-resource://file/session/s//etc/hosts`, ein Windows-Laufwerk ist `dsh-resource://file/session/s/C:/x/y.txt` und UNC ist `dsh-resource://file/session/s///server/share/y.txt`. Der Host löst Pfade auf und erzwingt den Zugriff. Die Form `absolute/<path>` bleibt parsebar, trägt aber keine autorisierende Session, sodass der File-Provider sie nicht lesen kann und Preview sie nicht beansprucht; weder die aktuelle noch eine Tab-Session wird entliehen. Die Grammatik liegt in [`src/file-address.ts`](src/file-address.ts); die Pfadhelfer bleiben in [`src/index.ts`](src/index.ts), das sie re-exportiert.

`sessionFileAddress(sessionId, path)` normalisiert `\` zu `/` und entfernt führende `./`, bewahrt aber führende `/`-Zeichen. Jede ID und jedes Pfadsegment ist komponentenweise kodiert, `:` bleibt literal. `fileAddressFor(sessionId, cwd, path)` baut immer eine Session-Adresse: Pfade innerhalb von `cwd` werden relativ; andere absolute Pfade, auch bei unbekanntem `cwd`, bleiben innerhalb dieser Session-Adresse absolut. `absoluteFileAddress(absolutePath)` baut nur die sessionlose Form. `parseFileAddress(address)` prüft das exakte Dateiadressen-Präfix, ignoriert Query- und Fragment-Suffixe, dekodiert jedes Segment und gibt `{ scope, sessionId, path }` für eine Session-Adresse oder `{ scope, path }` für die sessionlose Form zurück. Ein anderer Typ oder ein anderes Scheme, ein unbekannter Scope, eine fehlende ID oder ein fehlender Pfad oder ein fehlerhaftes Escape ergibt `undefined`.

-----

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>

- **Die Auflösung ist lexikalisch** — sie erkennt POSIX-Absolutpfade, Windows-Laufwerkspfade und UNC-Pfade, bewahrt beim Verbinden eines relativen Pfads das Trennzeichen des Workspace-Pfads und greift weder auf ein Dateisystem zu noch kanonisiert sie `.`- und `..`-Segmente.
- **Home-Kürzung ist POSIX-only** — Windows-Pfade bleiben unverändert, weil ein portabler Browser Windows-Home-Pfadäquivalenz nicht sicher ableiten kann.


<a id="dev-note"></a>
### Entwicklerhinweis

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Dieses Hilfspaket besitzt keine veränderliche Runtime-Beziehung.
