# DSH hinter einem Netzwerk-Proxy betreiben
[English](network-proxy.md) | [中文](network-proxy.zh.md) | Deutsch


DSH leitet seine ausgehenden Anfragen — Modellaufrufe, Websuche, Seitenabrufe und MCP-Server über HTTP — durch den Proxy, den die üblichen Proxy-Umgebungsvariablen nennen. Es liest sie beim Start; nichts weiter muss konfiguriert werden. Einige Pfade bleiben bewusst oder aus Laufzeitgründen direkt, aufgeführt unter „Was direkt bleibt" weiter unten.

## Die Variablen exportieren

```sh
export HTTPS_PROXY=http://127.0.0.1:7890
export HTTP_PROXY=http://127.0.0.1:7890
```

Setzen Sie beide Zeilen in Ihr Shell-Profil, damit jeder `dsh`-Aufruf sie erbt, oder in `$DSH_HOME/.env` (standardmäßig `~/.dsh/.env`) neben Ihrem API-Schlüssel; eine exportierte Variable gewinnt immer gegenüber dieser Datei. Die eigene `.env` eines Projekts kann sie nicht setzen: Sie kommt mit `git clone` mit, und DSH verweigert den Start, statt ein Repository entscheiden zu lassen, wohin Ihr Verkehr geht.

Ein Proxy, der Zugangsdaten braucht, nimmt sie in der URL: `http://user:password@proxy.example:8080`. DSH gibt die URL niemals zurück: Eine Diagnose nennt die Variable, die sie abgelehnt hat, sodass weder Benutzername noch Passwort irgendwo erscheinen.

## Warum Ihr Browser über einen Proxy läuft, Ihr Terminal aber nicht

Das ist die häufigste Überraschung, und sie ist nicht DSH-spezifisch. Es gibt keinen einzigen „System-Proxy", dem alle Software folgt — es gibt drei voneinander unabhängige Mechanismen:

| Mechanismus | Wer ihn befolgt |
|---|---|
| Die Proxy-Einstellungen des Betriebssystems | Safari, die meisten nativen macOS-Apps, Chrome und Edge |
| Die Umgebungsvariablen `HTTP_PROXY` / `HTTPS_PROXY` | `curl`, `git`, `npm`, `pip` und DSH |
| TUN-Modus (eine virtuelle Netzwerkschnittstelle) | Alles, transparent |

Der „System-Proxy"-Schalter in einer Proxy-Anwendung wie Clash schreibt nur den ersten. Browser übernehmen ihn; Kommandozeilen-Werkzeuge sehen ihn nie. Deshalb ist das Exportieren der Variablen ein eigener Schritt, und deshalb lässt der TUN-Modus beides ganz ohne Variablen funktionieren.

DSH liest die Proxy-Einstellungen des Betriebssystems nicht. Exportieren Sie die Variablen oder verwenden Sie den TUN-Modus.

## Wählen, was direkt bleibt

`NO_PROXY` listet Hosts, die direkt erreicht werden sollen:

```sh
export NO_PROXY=internal.example.com,.corp.example.com,registry.local
```

Ein Eintrag nennt einen Host und matcht ihn zusammen mit jeder Subdomain darunter: `NO_PROXY=example.com` schickt auch `api.example.com` direkt. Ein führender `.` oder `*.` wird akzeptiert und bedeutet dasselbe. Ein Eintrag darf einen `:port` tragen, und `*` umgeht alles.

**CIDR-Bereiche funktionieren nicht.** Eine Bypass-Liste des Betriebssystems enthält oft Einträge wie `10.0.0.0/8` oder `192.168.0.0/16`; diese in `NO_PROXY` zu kopieren, hat keine Wirkung. Verwenden Sie stattdessen Hostnamen oder Domain-Suffixe.

`localhost` oder `127.0.0.1` müssen Sie nicht auflisten. DSH umgeht Loopback immer, weil seine eigene Web-UI und lokale Server sonst durch den Proxy geroutet und in eine Schleife laufen würden.

## Grenzen, die man kennen sollte

**SOCKS-Proxies werden nicht unterstützt.** Ein `socks5://`-Wert wird beim Start gemeldet und übersprungen, und DSH verbindet für das Schema, das ihn nannte, direkt — `HTTPS_PROXY=socks5://…` neben einem brauchbaren `HTTP_PROXY` lässt `https:` also direkt, statt den HTTP-Proxy zu borgen. Richten Sie die Variablen stattdessen auf den HTTP-Port Ihrer Proxy-Anwendung — die meisten bieten beides an, und der HTTP-Port ist meist eine benachbarte Portnummer.

**`ALL_PROXY` allein genügt.** DSH fällt für beide Schemata darauf zurück, auch wenn Node und curl sich hier unterscheiden. `HTTPS_PROXY` explizit zu setzen ist trotzdem klarer.

**Ein TLS-terminierender Unternehmens-Proxy braucht sein Zertifikat.** Wenn Anfragen mit einem Zertifikatsfehler fehlschlagen, sobald der Proxy erreichbar ist, zeigen Sie Node vor dem Start auf das CA-Bundle Ihrer Organisation:

```sh
export NODE_EXTRA_CA_CERTS=/path/to/corporate-ca.pem
```

Node liest diese Variable nur beim Prozessstart, exportieren Sie sie also vor dem Aufruf von `dsh`.

**Werkzeuge, die DSH für Sie ausführt, folgen demselben Proxy.** Befehle im Bash-Werkzeug, `git`, `gh` und als Kindprozesse gestartete MCP-Server erben diese Variablen alle. Ein Kindprozess, der selbst ein Node-Programm ist, beachtet sie erst ab Node 22.21; ein älteres Node verbindet direkt. Wenn eine Ihrer Proxy-Variablen einen von DSH abgelehnten Wert enthält — etwa eine SOCKS-URL — verbinden sich Node-basierte Werkzeuge ebenfalls direkt, statt den Start zu verweigern, während `curl` und `git` diesen Wert weiterhin lesen.

**Ein Passwort in der Proxy-URL erreicht diese Werkzeuge ebenfalls.** `HTTPS_PROXY=http://alice:s3cret@proxy.example:8080` ist eine normale Umgebungsvariable, sodass jeder von DSH ausgeführte Befehl — einschließlich derer, die das Modell schreibt — sie lesen kann, und ein Befehl, der seine Umgebung ausgibt, legt das Passwort in einer Ausgabe ab, die aufbewahrt wird. So verhält sich die Variable ohnehin für alles andere in Ihrer Shell. Wenn das relevant ist, geben Sie dem Proxy einen Einstiegspunkt ohne Zugangsdaten oder authentifizieren Sie ihn anders als über die URL.

## Was direkt bleibt

Nicht jede Anfrage, die DSH stellt, geht durch den Proxy:

- **Alles auf diesem Rechner.** Loopback ist immer direkt: `localhost`, der gesamte `127.0.0.0/8`-Bereich, `::1` und `0.0.0.0`. Ein Proxy kann einen Dienst, der nur lokal lauscht, nicht sinnvoll erreichen.
- **Code, den das Modell schreibt.** Die Workflow- und Code-Runtime-Worker erhalten die Proxy-Einstellungen nie, sodass ein Skript, das das Modell verfasst, keine Proxy-URL lesen kann, die ein Passwort tragen könnte. Ein solches Skript erreicht das Netz nur, wenn es das selbst konfiguriert.
- **Nutzungstelemetrie.** Der OTLP-Exporter verwendet Nodes eigenen HTTP-Client statt des, den ein Proxy konfiguriert, sodass Telemetrie direkt verbindet und dort einfach fehlschlägt, wo direkter Ausgang blockiert ist. Nichts, was Sie in DSH tun, hängt davon ab. Setzen Sie `DSH_TELEMETRY_MODE=DISABLED`, um sie ganz abzuschalten.
- **`web_fetch` auf eine literale private Adresse.** Eine URL, die eine Adresse wie `http://10.0.0.5/` nennt, wird verweigert, statt an den Proxy weitergereicht zu werden — dieselbe Verweigerung, die sie ohne konfigurierten Proxy bekommt.

## Prüfen, ob es funktioniert hat

Bitten Sie den Agenten, eine Seite abzurufen, und beobachten Sie das Verbindungslog Ihrer Proxy-Anwendung:

```sh
dsh --profile headless "fetch https://example.com and tell me the page title"
```

Erscheint die Anfrage dort nicht, vergewissern Sie sich, dass die Variablen in DSHs eigener Umgebung ankommen:

```sh
env | grep -i proxy
```
