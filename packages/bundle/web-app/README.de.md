---
description: "Die Browser-GUI für dsh: interaktiver Chat, Modell- und Einstellungsverwaltung und Session-Verlauf, für Nutzer der dsh-Web-Oberfläche."
kind: "package-bundle"
---

# @deepseek-ai/dsh-web-app
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

`dsh --profile web` öffnet eine interaktive Browser-GUI mit Chat, Modell- und Einstellungsverwaltung und Session-Verlauf. Sie nutzt denselben Modellzugang, dieselben Tools und Sicherheits-Defaults wie andere dsh-Oberflächen. Der Start gibt eine authentifizierte URL aus und öffnet sie normalerweise im Default-Browser; SSH-Sessions und `--no-open` überlassen die URL dem manuellen Öffnen. Du kannst den Port ändern und zusätzliche Hosts erlauben, aber nicht an alle Netzwerkschnittstellen binden. Wähle dieses Paket für interaktive Browser-Arbeit; verwende `dsh-headless` für einmalige Kommandozeilen-Tasks.

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

Starte die GUI, öffne deinen Browser und beginne, mit dem agent zu sprechen. Die Flags stimmen den Aufruf fein ab.

### Die Web-GUI starten

```sh
dsh --profile web
dsh --profile web --no-open --port 8080
```

Nach dem Start siehst du eine `dsh web:`-Zeile, deren Root-URL einen frischen Prozess-Token trägt. Sofern `--no-open` oder eine SSH-Session es nicht unterdrückt, öffnet der Default-Browser diese URL, erhält ein signiertes Cookie und leitet zur sauberen Root-Seite weiter. Du erkennst den Erfolg daran, dass die Seite lädt und du mit dem agent chatten kannst. Zwei Fehler sind zu erwarten: Ist das Frontend nicht gebaut, stoppt der Start mit einem Build-Hinweis (`pnpm run build` in einem Checkout); lässt sich der Browser nicht öffnen, erscheint eine credential-freie Diagnostik auf stderr, während der Server weiterläuft — öffne die gedruckte Start-URL selbst.

### Konfiguration

Die meisten Nutzer setzen diese nie; die Kommandozeilen-Flags speisen die vier Einstellungen unten — `--host`, `--port` und `--trusted-host` kommen aus dem Aufruf, und `--no-open` schaltet die Browser-Übergabe für diesen Aufruf aus:

| Feld | Default | Bedeutung |
|---|---|---|
| `openBrowser` | `true` | Öffnet den Default-Browser nach dem Start; SSH-Launches unterdrücken ihn |
| `printUrl` | `true` | Gibt die `dsh web:`-URL-Zeile beim Start aus |
| `surfaceContext` | `true` | Gibt dem agent GUI-Orientierungskontext und legt `DSH_WEB_URL` für seine Shell-Kommandos offen |
| `trustedHosts` | `[]` | Zusätzliche Hosts, die die GUI aus dem Netzwerk erreichen dürfen |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-web-app) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### LAN-Zugriff und vertrauenswürdige Hosts

Standardmäßig akzeptiert die GUI nur Verbindungen von dieser Maschine. Ein Deployment, das an alle Netzwerkschnittstellen bindet, erlaubt auch Browser aus dem LAN, und die gedruckte URL enthält dann eine LAN-Adresse; `--trusted-host` fügt in beiden Fällen weitere Hosts hinzu. Host- und Origin-Prüfungen steuern die Erreichbarkeit, während der Token-Austausch jede Host-API-Methode und jeden WebSocket-Stream authentifiziert. Die LAN-Adressen werden einmal beim Start gesampelt, sodass eine spätere Netzwerkänderung nicht übernommen wird — starte die GUI neu, um sie erneut anzukündigen.

### Betrieb über SSH

Wenn du `dsh --profile web` über SSH startest, erscheint die URL-Zeile weiterhin, aber der Browser wird nicht für dich geöffnet: Der SSH-Client oder Editor besitzt die lokale Forwarding-Adresse. Öffne die weitergeleitete URL auf deiner Maschine selbst; die gedruckte URL benennt den Loopback-Endpunkt des Remote-Hosts.

### Agent-Setup pro Session

Jede Browser-Session komponiert ihren eigenen agent aus den ausgelieferten Presets (standardmäßig das `standard`-Preset), statt einen prozessweiten Tool-Satz zu teilen. Du kannst das Default-Preset ändern oder eigene Presets unter `$DSH_HOME/.agent-presets` hinzufügen.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Das Bundle ist ein Patch plus ein Runtime-Glue-Plugin. Der Storage-Stack und der Projection-Cache kommen von `dsh-base`; die Workspace- und Message-Feedback-Zeilen des Web-Overlays konsumieren diesen geteilten `storageDomain`-Service. Der Patch wiederholt die oberflächenspezifischen Werte, die die Base bewusst auslässt, fügt die Web-only-Host-Zeilen und das Browser-Roster ein und verschiebt dann die agent-Ebene hinter Presets. Das Glue-Plugin besitzt Dist-Serving, Trust-Sampling, Prompt-Sektionen, die Bash-Variable und die Readiness-Ankündigungen.

### Patch-Semantik

Ein Patch ersetzt die gesamte `config` der adressierten Zeile, sodass jede Web-Zeile jeden von ihr besessenen Key wiederholt: die Persona-Prefix- und -Suffix-Templates, das `DSH_TOOLS_MODE`-PTC-Mode-Opt-in und die `session-query-sqlite`-Werte auf den Base-Zeilen; danach fügt `insert` die Web-Host-Zeilen, den Transport und das Browser-Roster hinzu. Die Pro-agent-Tool-Zeilen, die die Base prozessweit mountet, sind hier deaktiviert, und das Preset-Roster übernimmt; die Begründung jeder Host-Plane- versus Preset-Plane-Entscheidung steht inline im Patch.

### Readiness

Die URL-Zeile und die Browser-Übergabe sind Readiness-Signale: Supervisoren rufen per RPC an, sobald sie die Zeile beobachten, und ein Browser fordert die Seite an, sobald er sich öffnet — beides läuft also erst, nachdem sich der Loader-Baum settled und die Connection-Authentifizierung verfügbar ist, oder sofort in einem handgebauten Baum ohne Loader. Ein mitten im Boot disposed Baum kündigt nichts an.

### LAN-Trust-Sampling

`resolveLanTrust` sampelt das Netzwerk einmal beim Boot: Ein Loopback-Bind (`127.0.0.1`) leitet keine LAN-Adressen ab, während ein All-Interfaces-Bind jedes nicht-interne IPv4-Literal hinzufügt. Die abgeleiteten Literale plus die expliziten `--trusted-host`-Authorities bilden den `/api`-Browser-Trust-Zaun, und die gedruckte LAN-URL passt immer zu diesem Zaun.

### Source Map

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Das `web-app`-Glue-Plugin: Dist-Auflösung, LAN-Trust-Sampling, Prompt-Sektionen, Bash-Variable, URL-Zeile, Browser-Übergabe |
| [`src/startup.ts`](src/startup.ts) | Der `web-startup`-Provider: `--host`, `--port`, `--trusted-host`, `--no-open`, `--help` |
| [`cordis.patch.yml`](cordis.patch.yml) | Der Web-Patch: wiederholte Base-Werte, Web-Host-Zeilen, Browser-Roster, agent-Ebene hinter Presets |
| — | Es wird kein Runtime-Invariant-Companion veröffentlicht; jede Contribution (Frontend-Static-Child-Plugin, Prompt-Sektion, bashEnv-Registrierung) wird mit dem Fiber registry-disposed, und das Paket der jeweils besitzenden Registry trägt die Invariante dieser Relation; das Paket hält keinen eigenen veränderlichen Zustand zum Auditieren. |
| [`tests/web-app.spec.ts`](tests/web-app.spec.ts) | Dist-Auflösung, Fallback-Seat, Prompt-Sektionen, Readiness |
| [`tests/startup.spec.ts`](tests/startup.spec.ts) | Kommandozeilen-Parsing über einen echten Loader-Baum |
| [`tests/trusted-hosts.spec.ts`](tests/trusted-hosts.spec.ts) | LAN-Trust-Sampling |
| [`tests/browser-open.spec.ts`](tests/browser-open.spec.ts) | Default-Browser-Übergabe, sobald die Seite erreichbar ist |

### Invariant-Ownership

Es wird kein Invariant-Companion veröffentlicht, weil jede Contribution — das Frontend-Static-Child-Plugin, die Prompt-Sektionen und die Bash-Variablen-Registrierung — mit dem Fiber registry-disposed ist und das Paket jeder besitzenden Registry die Invariante dieser Relation trägt.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn du tiefer in den gemeinsamen Kern, die Browser-Reload-Pipeline oder das gebaute Frontend einsteigen willst.

- [Bundle-Paketkarte](../README.de.md) — die Oberflächen auf demselben Kern.
- [dsh-base](../base/README.de.md) — der gemeinsame Kern, auf dem die GUI läuft.
- [dsh-client-hmr](../../client/hmr/README.de.md) — wie Client-Plugin-Änderungen während der Entwicklung reloaden.
- [frontend-static](../../host/frontend-static/README.de.md) — wie das gebaute Frontend ausgeliefert wird.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-web-app) — jedes akzeptierte Config-Feld und seine Quelldeklaration.

-----

<a id="model-experience"></a>
## Model Experience

### Harness-Source- und Web-Oberflächen-Kontext

#### Was das Modell sieht

Wenn `surfaceContext` wahr ist, identifiziert die `harness:source`-Sektion die On-Disk-Harness-Implementierung, ohne zu behaupten, sie sei das Arbeitsverzeichnis, und die globale `app:web-surface`-Sektion (First-Party-Reihenfolge 10100, nach den Reusable-Instructions) orientiert das Modell an der GUI: die kanonische lokale URL, der „diese Seite"-Referent, der Update-Contract (der Reload-Receiver ist immer an; Refresh-freie Reloads brauchen zusätzlich den `pnpm run dev:web`-Watcher) und die Anweisung, keine Ersatzserver zu starten. `DSH_WEB_URL` erscheint zusätzlich in der verwalteten Bash-Umgebung mit seiner Beschreibung, pro Aufruf aus dem laufenden Server resolved. Wenn es falsch ist, werden weder Sektion noch Variable registriert.

#### Token-Effekt

Eine Source-Zeile und ein Prompt-Absatz pro Session plus zwei Zeilen für managed-Environment-Variablen; konstant pro Prozess.

#### KV-Cache-Effekt

Source- und Web-Sektionen folgen den First-Party-Reusable-Instructions. Verschiedene Checkout-Pfade oder lokale Ports lassen den vorhergehenden Präfix unverändert, wenn Tools und Konfiguration übereinstimmen; Provider-Cache-Wiederverwendung ist nicht garantiert.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen sagen dir, was du in ungewöhnlichen Setups erwarten kannst — ein Source-Checkout, SSH-Sessions oder strikte Netzwerke. Sie sind aktuelle Paket-Constraints, kein allgemeiner Browser-Vergleich und kein Aufgabenstapel.

- **Das Frontend muss gebaut sein** — ein Source-Checkout braucht zuerst `pnpm run build`; der Start stoppt mit einem Build-Hinweis, wenn das Dist fehlt, und es gibt keinen Source-Serving-Fallback.
- **LAN-Adressen werden einmal beim Start gesampelt** — Schnittstellenänderungen nach dem Boot werden nicht erneut angekündigt; die gedruckte LAN-URL entspricht immer dem Gesampelten.
- **Nur der Übergabe-Start ist beobachtbar** — die GUI meldet, dass der Browser zum Öffnen aufgefordert wurde, nicht dass er tatsächlich geöffnet hat; ein späteres Browser-Exit wird nie gemeldet, und die gedruckte URL ist dein manueller Fallback.
- **SSH-Sessions behalten die URL, überspringen aber die Browser-Übergabe** — die gedruckte URL benennt den Loopback-Endpunkt des Remote-Hosts; der SSH-Client oder Editor muss die lokale Forwarding-Adresse bereitstellen und öffnen.
- **`BROWSER`-Overrides kommen nur aus der Umgebung** — eine discovered `.env` kann `BROWSER` nicht setzen; nur ein geerbter Wert kann das Executable für die automatische Übergabe wählen.
- **Binden an alle Netzwerkschnittstellen wird nicht unterstützt** — `--host 0.0.0.0` wird beim Start aus Sicherheitsgründen abgelehnt; verwende den Default-Loopback-Host.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
