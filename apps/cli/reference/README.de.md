# `dsh`-CLI-Verhaltensreferenz

[English](README.md) | [中文](README.zh.md) | Deutsch

Diese Referenz definiert die Befehlsmodi für Profil-Boot, den Web-Alias, das Plugin-Management und den Config-Dump. argv wird einmal durch [`src/args.ts`](../src/args.ts) geparst, und [`src/bin.ts`](../src/bin.ts) importiert dynamisch nur den ausgewählten Runner.

## Profil-Boot

`dsh --profile <name>` bootet das Profil unter `$DSH_HOME/profiles/<name>`. Der effektive Baum wird über einer leeren Wurzel komponiert, indem nacheinander angewendet werden: jeder Bundle-Patch, den die `dsh.profile.bundles`-Liste des Profil-Manifests nennt, die eigene `cordis.patch.yml` des Profils, die Home-Ebene `$DSH_HOME/cordis.patch.yml` (maschinenlokale Einstellungen, die von jedem Profil geteilt werden und daher die pro-Profil-Ebene überstimmen), und jedes `--patch <path>`-Overlay in argv-Reihenfolge. Pro Zeile gewinnen spätere Ebenen; ein Patch ersetzt den vollständigen `config`-Wert der Zielzeile statt deren Keys tief zu mergen, und kann neue Zeilen einfügen. `dsh.profile.patchReload` wählt `live`-Überwachung der Patch-Dateien oder einmaliges Laden bei `startup`; bei einem benutzerdefinierten Profil gilt ohne Angabe `live`. Ein Parse-, Schema-, Auflösungs- oder Plugin-Boot-Fehler wird gemeldet und endet mit einem Exit-Code ungleich null. SIGINT und SIGTERM disposen die gemountete Wurzel vor dem Exit.

Bundle-Namen werden zuerst aus der dsh-Installation aufgelöst, dann aus dem Profilverzeichnis. Die im Lieferumfang enthaltenen Bundles (`@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app`, `@deepseek-ai/dsh-headless`, `@deepseek-ai/dsh-sdk-app`, `@deepseek-ai/dsh-sdk-minimal`, `@deepseek-ai/dsh-acp-app`) stammen daher immer aus derselben Installation wie das laufende `dsh`; externe Bundles kommen aus dem pnpm-verwalteten `node_modules` des Profils. Ein nackter Plugin-`name` in einer Patch-Zeile wird über den Parent-Walk von Node ab dem Profilverzeichnis aufgelöst, der den gepflegten Installations-Fallback `$DSH_HOME/profiles/node_modules` erreicht. Einfache Node-Installationen legen dort pro Paket des Dependency-Closures einen geheilten Symlink ab. Ein pkg-Executable legt stattdessen einen echten ESM-Proxy ab, der explizite Exports spiegelt und die virtuelle Paket-URL re-exportiert, weil Betriebssystem-Symlinks nicht in das `/snapshot`-Dateisystem von pkg eintreten können. Jeder Start verlinkt außerdem Pakete, die nur von ausgewählten externen Bundles getragen werden, über ein dsh-eigenes Verzeichnis in das `node_modules` des aktuellen Profils; bestehende pnpm-Einträge gewinnen, und jedes Profil besitzt seine Links unabhängig.

Die Profile `web`, `headless`, `sdk`, `sdk-minimal` und `acp` initialisieren sich bei erster Verwendung automatisch aus mitgelieferten Vorlagen (`web`: base + web-app mit Live-Patches; `headless`: base + headless mit Startup-only-Patches; `sdk`: base + sdk-app mit Startup-only-Patches; `sdk-minimal`: sein Standalone-Bundle mit Startup-only-Patches; `acp`: base + acp-app mit Startup-only-Patches). Jedes andere fehlende Profil schlägt laut fehl mit dem Hinweis, `dsh plugin --profile <name> add <package>` auszuführen.

`dsh --profile <name> --from-default-profile <template>` initialisiert vor dem Boot ein neues benutzerdefiniertes Ziel aus einer dieser fünf mitgelieferten Vorlagen. Der Zielname darf kein mitgelieferter Profilname sein, und sein vollständiges Profilverzeichnis darf nicht existieren. Der Launcher beansprucht dieses Verzeichnis exklusiv, sodass Restdateien und ein weiterer konkurrierender Ersteller unverändert abgelehnt werden. Er kopiert die aktuelle Bundle-Liste und den `patchReload`-Wert der Vorlage in ein neues Manifest mit leeren Dependencies und einem leeren User-Patch. Er liest nicht das lokale Profil namens `<template>`, kopiert weder dessen Dependencies noch dessen Patch und persistiert kein Vererbungsfeld; spätere Änderungen der Vorlagenliste schreiben das neue Profil nicht um. Die in der kopierten Liste genannten In-box-Bundles werden weiterhin aus der aktuellen dsh-Installation aufgelöst. Eine erfolgreiche Initialisierung erzeugt keine Launcher-Ausgabe.

Ein bestehendes Profil lehnt `--from-default-profile` ab, ohne geändert oder gebootet zu werden; lassen Sie die Option weg, um es zu verwenden. Ein verbliebenes Zielverzeichnis wird ebenfalls erhalten und erfordert einen anderen Profilnamen. Eine unbekannte Vorlage oder ein mitgelieferter Zielname schlägt vor dem Erstellen des Ziels fehl. Diagnosen zu unbekannten Vorlagen nennen die gültigen Vorlagen. Die Initialisierung wird vor der Bundle-Auflösung und dem App-Boot committed, sodass ein späterer Fehlschlag das neue Profil auf der Platte lässt und der erneute Versuch die Erstellungsoption weglässt. `--dump-config` und `--dump-default-config` akzeptieren die Option, initialisieren das Ziel, geben den angeforderten Baum aus und booten ihn nicht.

```sh
dsh --profile rescue --from-default-profile web
dsh --profile rescue
```

### App-Argumente

Die Flags des Launchers stehen zuerst und enden beim ersten Token, das er nicht erkennt; alles ab dort wird unverändert über `ctx.cmdlineArgs` an das gebootete Profil weitergereicht, wo jedes injizierte App-Plugin es parsen darf ([`dsh-cmdline`](../../../packages/boot/cmdline/README.de.md)). `dsh --profile rescue --from-default-profile web --no-open` initialisiert daher, bevor `--no-open` an Web gereicht wird; `dsh --profile web --port 8080` erreicht das `--port` der Web-App; `dsh --profile web --help` gibt deren Hilfe aus und bootet nichts; und `dsh --help` (kein Profil zum Übergeben) gibt die eigene Hilfe des Launchers aus. `-V`/`--version` gibt die Version des Launchers aus, wenn es vor der App-Argument-Grenze steht.

Eine Komposition mountet einmal. Ein gewöhnliches Plugin injiziert `cmdlineArgs`, parst die Argumente dieser App und stellt das Aufgelöste als Service bereit; jede aus Flags konfigurierte Zeile injiziert diesen Service, und der Loader wartet auf ihn, bevor er die Config der Zeile auswertet (`port: !!js ctx.webStartup.port ?? 3080`). Ein Flag schlägt daher den daneben geschriebenen Wert. Diese Priorität setzt voraus, dass die Zeile diesen Ausdruck behält; ein User-Patch, das die gesamte `config` durch Literale ersetzt, entfernt den Laufzeit-Zugriff. Hilfe und abgelehnte Argumente fordern einen Exit an — ungleich null bei Ablehnung, 0 bei Hilfe — ohne Zeilen zu aktivieren, die vom Service des Providers abhängen. In einem `patchReload: live`-Profil wertet eine Patch-Datei-Änderung Ausdrücke gegen noch laufende Services neu aus, kann also einen bedienten Port nicht zurücksetzen.

Launcher-Flags müssen vor den App-Argumenten stehen, und der Parser des Launchers konsumiert ein `--`: ein App-Argument, das als literales `--` ankommen muss, braucht `-- --`. Ein erstes App-Argument gleich `web` oder `plugin` wählt stattdessen diesen Subcommand. `ctx.cmdlineArgs.get()` ist ein geteilter immutable Read: Mehrere Plugins dürfen denselben Snapshot parsen, während ein Profil ohne Reader seine App-Argumente ignoriert.

Die mitgelieferten Apps besitzen diese Kommandozeilen:

| Profil | Argumente |
|---|---|
| `web` | `--host`, `--port`, wiederholbares `--trusted-host`, `--no-open` |
| `headless` | der Task-Text als Positionsargument |
| `sdk` | keine Optionen; stdio trägt das JSON-RPC-Protokoll |
| `sdk-minimal` | keine Optionen; stdio trägt dasselbe JSON-RPC-Protokoll |
| `acp` | keine Optionen; stdio trägt das Agent Client Protocol |

Ein One-shot-Task (`dsh --profile headless "run the tests"`) erstellt über die Core-Registry einen frischen persistierten Agent, reicht den Task ein, wartet auf Quiescence und flusht die Session, bevor er den letzten nicht-leeren Assistant-Text und den finalen `turn/end`-Reason aus ihrem durable Interval ableitet. Er streamt nicht-leere Provider-Reasoning-Deltas unter einer `dsh: reasoning:`-Überschrift nach stderr, gibt auf stdout nur den finalen Text aus und endet mit 0 bei `completed`, sonst 1; eine erfolgreiche Antwort ohne Reasoning lässt stderr leer. Ein Aufruf ohne Task ist ein Usage-Error dieser App. Das mitgelieferte Headless-Profil mountet keine Browser-Connection, keinen HTTP-Server, keine Web-Runtime und keinen Browser-Client und öffnet keinen Listening-Port.

Den komponierten Baum ohne Boot prüfen:

```sh
dsh --profile web --dump-default-config
dsh --profile web --patch ./extra.yml --dump-config
```

`--dump-default-config` gibt nur die Bundle-Ebenen aus; `--dump-config` fügt die `cordis.patch.yml` des Profils, die Home-Ebene `$DSH_HOME/cordis.patch.yml` und `--patch`-Overlays hinzu. Beide geben Kommentare aus, die die Datei nennen, die jede Zeile lieferte, und jedes Overlay, das sie änderte; `!!js`-Ausdrücke bleiben unausgewertet, relative Plugin-Namen in eingefügten Zeilen werden neben ihrer Patch-Datei aufgelöst, und nicht getroffene Patch-Ziele werden auf stderr gemeldet. Ein Dump initialisiert fehlende Profildateien, bereitet aber nicht den Runtime-Modul-Fallback unter `$DSH_HOME/profiles/node_modules` vor. Er führt nie App-Kommandozeilen-Provider aus, zeigt also den komponierten Baum vor der Auflösung jedes App-Arguments und lehnt einen Aufruf mit App-Argumenten ab.

## Plugin-Management

`dsh plugin --profile <name> <args...>` initialisiert das Profil, falls es fehlt (mitgelieferte Vorlage, oder `@deepseek-ai/dsh-base` allein für andere Namen), und reicht dann `<args...>` mit dem Profilverzeichnis als Arbeitsverzeichnis an `pnpm` weiter — `add`, `remove`, `why`, `update` und jedes andere pnpm-Verb funktionieren unverändert; pnpm muss im PATH liegen. Relative Pfad-Specs (`.`, `../plugin` und ihre `file:`/`link:`-Formen) werden zuerst auf das aufrufende Verzeichnis verankert, sodass `add .` aus einem Plugin-Checkout dieses Checkout installiert, nicht das Profil. Nach jedem erfolgreichen Lauf wird `dsh.profile.bundles` gegen den installierten Zustand abgeglichen: Jede Dependency, die auf ein Paket auflöst, dessen Manifest `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` deklariert, tritt dem Layer-Stack bei (sodass ein `update`, das die Deklaration gewinnt, sie aktiviert); eine bundle-lose Dependency bleibt mit einer einmaligen Warnung schlicht, und eine entfernte Dependency verlässt den Stack.

Die Codex- und Claude-Code-Subagent-Provider sind separate optionale Bundles. Fügen Sie eines der Pakete hinzu, beide in einem Befehl, oder entfernen Sie jedes Paket unabhängig:

```sh
dsh plugin --profile <name> add @deepseek-ai/dsh-subagent-codex
dsh plugin --profile <name> add @deepseek-ai/dsh-subagent-claude-code
dsh plugin --profile <name> add @deepseek-ai/dsh-subagent-codex @deepseek-ai/dsh-subagent-claude-code
dsh plugin --profile <name> remove @deepseek-ai/dsh-subagent-codex
dsh plugin --profile <name> remove @deepseek-ai/dsh-subagent-claude-code
```

Die erfolgreiche pnpm-Operation ändert das Profil-Manifest und die Bundle-Liste auf der Platte; ein laufendes Profil behält die Bundle-Menge seines aktuellen Starts. Starten Sie dieses Profil nach dem Hinzufügen, Entfernen oder Aktualisieren eines Bundles neu. Diese Start-Grenze gilt für die Bundle-Mitgliedschaft, während gewöhnliche Änderungen an der Profil- oder Home-`cordis.patch.yml` per Hot Reload wirksam werden. Beim nächsten Start registriert jedes installierte Bundle nur seinen dormanten Host-Provider; ein kopiertes Preset muss die passende Tool-Zeile für neue Agents separat aktivieren. Das [Codex-Provider-README](../../../packages/subagent/subagent-codex/README.de.md) und das [Claude-Code-Provider-README](../../../packages/subagent/subagent-claude-code/README.de.md) decken Executable-, Authentifizierungs-, Payload- und Fehlerdetails ab; die [Base-Bundle-Referenz](../../../packages/bundle/base/README.de.md) deckt den Standard-Dependency-Closure ab.

```sh
dsh plugin --profile tui add github:deepseek-harness/turtle-ui
dsh plugin --profile tui remove turtle-ui
dsh --profile tui
```

Git-gehostete Plugins, die Quellen liefern, bauen während der Installation über ihr `prepare`-Skript, das pnpm ≥10 blockiert, bis der Consumer es erlaubt: Das erste `add` schlägt mit dem `allowBuilds`-Hinweis von pnpm fehl (plus einem dsh-Zeiger auf die `pnpm-workspace.yaml` des Profils); kopieren Sie den ausgegebenen Key dorthin und führen Sie den Befehl erneut aus. Die Installation eines gebauten Tarballs oder eines lokalen Checkouts benötigt keine Freigabe.

## Web-Alias

`dsh web` ist ein hartcodierter Alias für `--profile web`; die Flags danach gehören der Web-App, deren gewöhnlicher Bundle-Provider sie parst. `--host` und `--port` überschreiben die komponierten Werte der Zeilen, die sie tragen; das wiederholbare `--trusted-host` steuert Aufruf-Authorities über `ctx.webRuntime.trustedHosts` bei (ein Deployment-Ausdruck verkettet seine eigenen Authorities), und `--no-open` deaktiviert die Default-Browser-Übergabe für diesen Aufruf. Der Client-Plugin-HMR-Receiver ist immer gemountet und bleibt idle, bis ein separater `pnpm run dev:web`-Watcher die Client-Bundles neu baut.

```sh
dsh web
dsh web --no-open
dsh web --patch ./extra.cordis.yml
dsh web --dump-config
dsh web --help
```

Der Produktions-Web-Runner benötigt gebaute Paket- und Frontend-Artefakte (`pnpm run build`). Er bedient standardmäßig `http://127.0.0.1:3080` und öffnet bei einem lokalen Start diese kanonische Host-URL erst, nachdem der vollständige Loader-Baum abgerechnet ist. Ein nicht-leeres geerbtes `SSH_CONNECTION` oder `SSH_TTY` unterdrückt die Browser-Übergabe, weil der SSH-Client oder Editor die lokal weitergeleitete Adresse besitzt; die Host-URL wird trotzdem ausgegeben. Die CLI unterstützt `--host 0.0.0.0` bewusst nicht und endet mit einem Usage-Error. Unmittelbar vor einer lokalen Übergabe gibt sie `dsh web: opening the default browser; pass --no-open to disable` aus; schlägt die Betriebssystem-Übergabe fehl, nennt eine Diagnose auf stderr den Grund, lässt den Server laufen und nennt die URL für die manuelle Nutzung. `--trusted-host` fügt benannte Authorities hinzu, die der `/api`-Browser-Trust-Fence akzeptiert.

Der Prozess-Shutdown gibt dem Plugin-Baum bis zu fünf Sekunden zum Disposen. Das erste `SIGINT`/`SIGTERM` startet diesen Graceful Drain — `SIGTERM` ist die normale Stopp-Anfrage eines Supervisors und endet auf jeder Oberfläche mit 0, `SIGINT` meldet 130; ein zweites Signal erzwingt den sofortigen Exit. Steckt ein One-shot-Lauf bereits im Dispose fest, ist das erste `Ctrl+C` die Eskalation und beendet sofort, statt verschluckt zu werden.

Die base-gestützten Modi behandeln das aufrufende Verzeichnis als Standard-Workspace-Root, laden anwendbare `AGENTS.md`- oder `CLAUDE.md`-Instruktionen mit einem Render-Budget von 65.536 Bytes und verwenden einen In-memory-SQLite-Session-Content-Index. Das Standalone-Profil `sdk-minimal` verwendet das aufrufende Verzeichnis als Sandbox-Policy-Root, lässt aber bewusst Dateisystem-Tools, Instruction-Discovery und SQLite weg. Ein `patchReload: live`-Profil überwacht gültige Änderungen beider `cordis.patch.yml`-Ebenen (Profil und Home) und wendet sie transaktional erneut an; ein `startup`-Profil wendet sie einmal an. Eine One-shot-Oberfläche endet über ihren begrenzten Shutdown, der alle lebenden Watcher disposed.

Neue Sessions in base-gestützten Profilen verwenden standardmäßig das `workspace-write`-Permission-Preset. Bash- und Dateisystem-Mutationen sind auf den Session-Workspace und die plattformeigenen Temp-Roots beschränkt; Reads und Netzwerkzugriff sind nicht eingeschränkt, während die Prozess-Sichtbarkeit vom gewählten Sandbox-Backend abhängt — bwrap führt Befehle in einem privaten PID-Namespace aus, der Host-Prozesse verbirgt, und Landlock sowie Seatbelt lassen die Host-Prozess-Sichtbarkeit unverändert. `DSH_PERMISSION_MODE` ändert den Prozess-Fallback. Gespeicherte General-Settings-Permissions wirken auf spätere Web-Sessions, nicht auf eine bereits offene. Der Standalone-`sdk-minimal`-Baum pinnt stattdessen `danger-full-access` und mountet keinen Approval- oder Permission-Settings-Service.

`DSH_TOOLS_MODE` wählt `native`, `ptc` oder `both` für den Prozess; ein anderer Wert schlägt beim Boot fehl. Das mitgelieferte `minimal`-Agent-Preset behält diese Deployment-Präsentation, fixiert den vollständigen System-Prompt auf `You are a helpful software engineer assistant.` und komponiert nur die plattformgewählte persistente Shell. Wählen Sie beim Erstellen einer Web-Session 极简模式; jede andere Prompt-Section und jedes modell-zugewandte Plugin bleibt in diesem Agent abwesend, während der geteilte Browser-, Workspace-, Persistence-, Sandbox- und Permission-Host bestehen bleibt.

## Geteiltes Deployment-Verhalten

Das Base-Bundle mountet den nativen DeepSeek-Adapter, Settings- und Credential-Provider, die stabilen `web_search`- und `web_fetch`-Tools, den public-only-HTTP-Fetch-Provider, den opt-in-Upload des DeepSeek-Session-Logs und den Feedback-gesteuerten OTel-Upload für alle Benutzer. Provider-Credentials werden aus der geerbten Umgebung, `$DSH_HOME/.credentials.yaml`, der `.env` des aufrufenden Verzeichnisses und dann `$DSH_HOME/.env` aufgelöst; das verwaltete Dokument wird nie in `process.env` materialisiert, während beide `.env`-Dateien gewöhnliche Launch-Environment-Ebenen sind. Die Suche verwendet `DEEPSEEK_API_KEY` und akzeptiert `DEEPSEEK_SEARCH_BASE_URL`. Aktivierte Fetch-Calls laufen in jedem Sandbox- und Approval-Modus ohne Bestätigung pro Call; der Provider lehnt nicht-öffentliche Ziele vor dem Verbindungsaufbau ab. Die Web-App deaktiviert die Base-Tool-Zeile und exponiert dieselben Tools über ihre `cordis`-, `ptc`- und `standard`-Agent-Presets.

Feedback wird im Session-Log aufgezeichnet, ohne Modellarbeit zu starten. Aktivieren Sie den [DeepSeek-Session-Log-Contributor](../../../packages/session/session-log-deepseek/README.de.md), um vollständige nicht akzeptierte Log-Suffixe mit nachfolgenden DeepSeek-Requests zu senden, einschließlich konfigurierter Gateways. Der [OTel-Session-Upload](../../../packages/session/session-telemetry-otel/README.de.md) gilt für alle Benutzer und Provider, einschließlich `deepseek-official`, ohne einen Request-Header zu benötigen. Die Base verwendet standardmäßig `FEEDBACK_ONLY`: Neues eigenes Text-Feedback, Message-Ratings, Edits und Widerrufe geben das vollständige kanonische Präfix bis zu diesem Event frei, einschließlich gespeichertem Kontext; spätere Records warten auf das nächste explizite Feedback. Geerbtes Parent-Feedback autorisiert keinen Fork. Requests, Wiederherstellung, Mount und HMR lösen keine Erfassung aus. SDK-Batching kann einen autorisierten Upload ohne weitere Interaktion oder Modellarbeit abschließen. `DSH_TELEMETRY_MODE=DISABLED` deaktiviert die OTel-Auslieferung; `FULL` wird abgelehnt, und jedes nicht-leere `DSH_TELEMETRY_DISABLED` deaktiviert seine Zeile. `DSH_TELEMETRY_OTLP_URL` wählt den Collector. Die Übergabe ist Best-Effort, keine Collector-Akzeptanz; es gibt kein durable Outbox und keine Retry-Garantie. Diese OTel-Einstellungen aktivieren oder deaktivieren den DeepSeek-Beitrag nicht. Keiner der beiden Pfade ändert Modell-Input, aber Exporte können Message-Text, Tool-Argumente und -Ergebnisse sowie Workspace-Pfade enthalten.

Installieren Sie externe Plugin-Bundles über `dsh plugin --profile <name> add <package-or-git-spec>`. Das installierte Paket besitzt seine Dependencies und trägt seine deklarierte `cordis.patch.yml`-Ebene bei. Die CLI liefert außerdem `@deepseek-ai/dsh-mcp-client` als Dependency für Patch-Ebenen mit, aber kein MCP-Server ist standardmäßig aktiviert, weil jeder Server-Befehl vertrauenswürdiger ausführbarer Code außerhalb der Agent-Sandbox ist.

<a id="source-execution"></a>
## Ausführung aus dem Quellbaum

Führen Sie vom Repository-Root `pnpm run build` separat nach einem frischen Checkout und immer dann aus, wenn Artefakte aktualisiert werden müssen, und verwenden Sie danach `pnpm dsh <args...>`. Das `package.json`-Skript startet `apps/cli/src/bin.ts` mit `node --import tsx/esm` ohne Build und reicht jedes Argument weiter. Fehlende Typert-Host-Artefakte lassen den Profil-Boot über Modulauflösungsfehler ohne Build-Hinweis fehlschlagen. Sobald diese Host-Artefakte existieren, lassen fehlende Frontend- oder Client-Plugin-Bundles den Start mit der Anweisung fehlschlagen, `pnpm run build` auszuführen. Der Launcher prüft keine Frische, sodass vorhandene stale Bundles bis zum Rebuild älteren Browser-Code ausführen können. Der Prozess erbt die Launch-Umgebung, und `runProfile` löst den ausgehenden Proxy aus diesem Snapshot auf, bevor ein Entry mountet, sodass `HTTP_PROXY`/`HTTPS_PROXY` (und ein in einer `.env`-Ebene deklarierter Proxy) ohne weiteres Flag greifen. Die installierte Form startet das gebaute `apps/cli/lib/bin.js`, ohne das Repository neu zu bauen.
