# Entwicklungshandbuch
[English](development.md) | [中文](development.zh.md) | Deutsch


Die Einrichtungsanleitung führt neue Mitwirkende von den Voraussetzungen bis zum geprüften Checkout. Die folgende Referenz für Mitwirkende behandelt das Repository-Layout, den täglichen Arbeitsablauf und die CI-Organisation. Design-Rationale und Implementierungsdetails gehören zu den verlinkten Agent Notes und Skripten.

## Einrichtungsanleitung

### Voraussetzungen

- Node.js unterstützt 22.19+ und 24+. CI deckt 22.19, 24 und 26 ab; siehe die [Agent Note zum Node-Engine-Floor](../.agents/notes/implemented/process/2026-07-06-node-engine-floor.de.md).
- pnpm mit aktiviertem Corepack. Das Repository fixiert `pnpm@11.7.0` in `package.json`; führen Sie `corepack enable` aus, wenn `pnpm --version` nicht über Corepack aufgelöst wird.
- Git 2.26 oder neuer; die Hook-Einrichtung aktiviert die Git-Erweiterung für worktree-spezifische Konfiguration.
- Optional: ein DeepSeek-API-Schlüssel für die Web-, Headless- und ACP-Automatisierungsdemos sowie für die e2e-Tests gegen die echte API.

### Windows und WSL 2

Unter Windows können Sie mit nativen Tools entwickeln oder WSL 2 für eine Linux-Umgebung verwenden. WSL 2 eignet sich, um Linux-Verhalten zu verifizieren und Linux-Toolchains zu nutzen, wenn das native Kompilieren von Abhängigkeiten oder Dateisystemberechtigungen die Windows-Entwicklung behindern. Jede Umgebung benötigt ihr eigenes Runtime, ihre Build-Tools und ihre Berechtigungen; WSL ist optional.

Halten Sie Checkout, installierte Abhängigkeiten und Toolchain in derselben Betriebssystemumgebung. Speichern Sie den Checkout bei WSL 2 im Linux-Dateisystem; verwenden Sie bei nativen Windows-Tools das Windows-Dateisystem. Der Zugriff auf Dateien über die beiden Dateisysteme hinweg verursacht Overhead bei I/O-intensiven Operationen wie Git, Abhängigkeitsinstallation und Builds. Siehe die [Richtlinien von Microsoft zu Dateispeicherung und -leistung](https://learn.microsoft.com/en-us/windows/wsl/filesystems#file-storage-and-performance-across-file-systems).

Installieren Sie die Abhängigkeiten in jeder Umgebung separat, da native Binärdateien und Links zwischen Betriebssystemen abweichen können. Testergebnisse gelten für die Umgebung, in der die Tests liefen; Windows-spezifisches Verhalten erfordert weiterhin die Validierung unter nativem Windows.

### Ersteinrichtung

Installieren Sie die Abhängigkeiten aus dem Repository-Wurzelverzeichnis:

```sh
pnpm install
```

Die Installation richtet über `scripts/install-lefthook.mjs` zusätzlich die worktree-lokalen Lefthook-Hooks und den `dsh-translation-pairing`-Git-Merge-Treiber ein. Die [Agent Note zu worktree-lokalen Hooks](../.agents/notes/implemented/process/2026-07-27-worktree-local-lefthook.de.md) trägt den Sicherheitsvertrag für Hook-Pfade; die [Agent Note zu automatischen Pairing-Merges](../.agents/notes/implemented/process/2026-08-08-automatic-translation-pairing-merges.de.md) trägt den Merge-Treiber.

Fehlt eine der beiden Integrationen, weil Abhängigkeiten aus dem Cache wiederhergestellt wurden oder `postinstall` übersprungen wurde, installieren Sie sie manuell:

```sh
node scripts/install-lefthook.mjs
```

Lehnt der Wrapper eine vorhandene Git-Konfiguration ab oder meldet er ein veraltetes Lock, folgen Sie seiner Diagnose und der verlinkten Agent Note, statt Worktree-Metadaten spekulativ zu bearbeiten. Führen Sie den Wrapper nach einem Verschieben des Checkouts erneut aus, um den verwalteten Pfad neu zu erzeugen.

Führen Sie nach einem frischen Klon einmal die Typprüfung aus:

```sh
pnpm run typecheck
```

Die Einrichtung ist abgeschlossen, wenn `pnpm run typecheck` erfolgreich beendet wird.

## Referenz für Mitwirkende

<a id="typescript-project-layout"></a>
### TypeScript-Projektlayout

Das Repository verwendet isolierte Host- und Client-Aggregate. Ein übliches Paket ist in genau einem Aggregate registriert: Host-Pakete in `tsconfig.host.json` und Client-Pakete in `tsconfig.client.json`; drei Pakete (`host/webserver`, `compaction/compaction`, `typert/registry`) werden von beiden Aggregaten als gemeinsame Leaves referenziert, damit jede Seite dieselbe Quelle typprüft.

| Datei | Rolle | Bildet ein Programm? |
|---|---|---|
| `tsconfig.json` | Solution-Wurzel: `extends` base, `files: []` und Referenzen auf die beiden Aggregate. Sie ist der Discovery-Einstiegspunkt von tsserver und der Einstiegspunkt für die explizite Ausführung des vollständigen Project-Reference-Graphen; über die geerbten `paths` ist sie zugleich die Auflösungskonfiguration für tsx bei der Ausführung von `scripts/`. | Nein |
| `tsconfig.host.json` | Host-Aggregat: Host-Pakete, Beispiele, Tests, Skripte, Website und das ausnahmsweise Host-Projekt von `api/remotes`. | Ja |
| `tsconfig.client.json` | Client-Aggregat: die Pakete `packages/client/*` und deren Tests, `apps/web` und das ausnahmsweise Client-Projekt von `api/remotes`. | Ja |
| `tsconfig.base.json` | Gemeinsame compilerOptions und die Quell-`paths`-Karte. Zugleich die Auflösungs-Fassade, auf die die vitest-Konfigurationen vite-tsconfig-paths ausrichten: Sie hat kein `include`, daher gelten ihre `paths` für jeden Importeur. | Nein |
| `tsconfig.base.client.json` | Browser-Compilereinstellungen (`jsx`, DOM-Libs, `types: []`), die vom Client-Aggregat und jedem Paket `packages/client/*` erweitert werden. | Nein |

Host und Client bleiben zwei Aggregat-Programme, weil beide Seiten die cordis-`Context`-Schnittstelle unter denselben Schlüsseln mit unterschiedlichen Diensten zusammenführen (Deklarations-Merge); ein einzelnes Programm, das beide Zusammenführungen sieht, meldet eine Kollision. Die Kollision existiert nur innerhalb eines `ts.Program` — die Modulauflösung löst sie nie aus — deshalb darf die Solution auf beide Aggregate verweisen und eine einzige `paths`-Fassade beide Seiten überspannen. Daraus folgen drei Disziplinen:

- `tsconfig.base.json` erhält nie `include` oder `files`: Sie würden in jedes ererbende Paket-Projekt auslaufen und den alles-abdeckenden Bereich der Fassade verengen.
- Ein Skript, das ein repository-weites `ts.Program` aufbaut, verwendet ausdrücklich `tsconfig.host.json` oder `tsconfig.client.json` als Startpunkt — nie die Solution-Wurzel, denn das Zusammenfließen beider Aggregate in einem einzigen Programm kollidiert mit den `Context`-Zusammenführungen.
- Ein neues Paket wird in genau einem Aggregate registriert; nur die oben genannten aufgeteilten Pakete tragen beide Leaf-Konfigurationen, und die gemeinsamen Leaves sind in beiden Aggregaten registriert, weil jede Seite dieselbe Quelle typprüfen muss. Der Besitz sowohl eines Node-Loader-Einstiegspunkts als auch eines Browser-Einstiegspunkts ist kein Grund, ein Paket aufzuteilen; ein übliches Client-Plugin erzeugt beide Laufzeit-Artefakte in der Client-Buildphase.

Sechs Pakete teilen ihre Host- und Client-Tsconfigs: `api/remotes`, `api/gateway`, `api/session-controller`, `api/workspace-controller`, `client/connection` und `session-query/session-log-export`. Der Host-Einstiegspunkt von `api/remotes` nimmt am Host-Typert-Graphen teil, während sein Client-Einstiegspunkt die erzeugten `/remote`-Deklarationen importiert; `session-log-export` hält die Node-Archiv-Produktion aus seinem Browser-Controller heraus. Jede Wurzel-`tsconfig.json` eines aufgeteilten Pakets ist daher nur eine Solution, und die beiden Aggregate sowie direkte Consumer referenzieren jeweils `tsconfig.host.json` oder `tsconfig.client.json`. Das Workspace-`constraints`-Gate durchläuft den erreichbaren Project-Reference-Graphen und prüft die eigene Compiler-Face jedes referenzierenden Projekts: Ein Ziel mit einzelner Konfiguration bleibt von jeder Face aus gültig, während ein aufgeteiltes Ziel das passende Leaf benennen muss und nicht seine Solution-Wurzel oder das gegenüberliegende Leaf; es entdeckt aufgeteilte Pakete anhand des Vorhandenseins beider Leaf-Konfigurationen, sodass eine neue Aufteilung automatisch ins Gate eintritt. Die [README von `api-remotes`](../packages/api/remotes/README.de.md) und die [README von `session-log-export`](../packages/session-query/session-log-export/README.de.md) erklären ihre Aufteilung.

Der Wurzel-Build folgt der erzeugten Abhängigkeitsreihenfolge:

```sh
tsc -b tsconfig.host.json
tsdown --env.DSH_BUILD_FACE host
tsc -b tsconfig.client.json
tsdown --env.DSH_BUILD_FACE client
pnpm run build:web
```

Beide tsdown-Pässe verwenden denselben vollständigen Workspace-Abgleich. Sie scannen weder Build-Artefakte, um Client-Pakete zu entdecken, noch pflegen sie eine Host/Client-Paket-Filterliste. Paket-lokale tsdown-Konfigurationen wählen die Einstiegspunkte der aktuellen Phase über `DSH_BUILD_FACE` aus: Ein übliches Client-Plugin erzeugt in der Client-Phase sowohl seinen Node-Loader als auch sein Browser-Bundle; `api-remotes` nutzt `hostPhase: true`, um seinen Host-Einstiegspunkt früh zu erzeugen und in der Client-Phase nur sein Browser-Bundle. Tsdown verbraucht ausschließlich das JavaScript, das die vorgelagerte tsc-Phase nach `lib/types` ausgegeben hat.

Typert läuft nur während des Host-tsdown, gestartet mit `tsconfig.host.json`. Es analysiert die Host-Typen und erzeugt sowohl die Host-Reflexions-Artefakte als auch die Host-für-Client-Remote-Projektion; das Client-tsdown startet Typert nicht. Folglich führt `pnpm run typecheck` die vollständige Host-lib-Phase vor dem Client-tsc aus, während `pnpm run build` durch das Client-tsdown und den Web-Build fortsetzt.

`pnpm run build` bäumt die Version des Wurzel-Pakets, den siebenstelligen Quell-Commit und — wenn Git lokale Änderungen meldet — ein Dirty-Flag ein; es erbt auch andere vom Aufrufer gelieferte `DSH_CLIENT_*`-Werte. `pnpm run build:official` ist das plattformübergreifende lokale Äquivalent des CI- und Release-Artefakt-Builds und lässt das lokale Dirty-Flag weg. Jeder erfolgreiche vollständige Build schreibt eine gitignorierte Aufzeichnung, die die exakten öffentlichen Werte mit der Vite-Ausgabe und den dynamischen Client-Bundles verknüpft; die Release-Paketierung und die gebauten Web-Tests lehnen eine fehlende Aufzeichnung oder Artefakte ab, die ein späterer Teil-Build geändert hat. `pnpm run dev:web` erfordert weiterhin den Artefakt-Baum eines vorangegangenen vollständigen Builds, liest aber die aktuelle Version und den Git-Zustand einmalig beim Start ein und teilt diese Umgebung über alle Watcher-Stufen der Sitzung hinweg; es validiert die Aufzeichnung des vollständigen Builds nicht, da die Watcher-Stufen deren aufgezeichnete Artefakte neu schreiben.

Statische Analyse und Tests lösen Workspace-Imports über die `paths`-Karte der Base-Konfiguration nach `src` auf und müssen auf einem sauberen Baum bestehen; Gates, die gebaute `lib/`-Ausgabe verbrauchen, erklären diese Abhängigkeit ausdrücklich. Die erzeugten Host-für-Client-Remote-Deklarationen sind die bewusste Ausnahme: Die öffentlichen Befehle `typecheck`, `lint` und `doc-typecheck` erzeugen sie zuerst, während interne `*:contracts-ready`-Skripte davon ausgehen, dass der aufrufende öffentliche Befehl oder das Scheduler-Gate bereits von der Typert-Vertrags-Erzeugungsphase oder dem vollständigen Build abhängt. Siehe die [Agent Note zu ts-build-config](../.agents/notes/implemented/process/2026-06-17-ts-build-config.de.md) für die Emit-Verantwortlichkeit mit tsc an erster Stelle und die [Agent Note zu Typert Remote](../.agents/notes/implemented/architecture/2026-08-02-typert-remote-method-calls.de.md) für den Gate-Vorbereitungsvertrag.

Geschäftsdienste erklären aufrufbare Methoden auf dem Host mit `@Remote` oder `@RemoteScope`; der Host-Build erzeugt die Host-für-Client-Typen und Laufzeit-Beiträge, und die `api-remotes`-Komposition des Clients lädt diese Beiträge in die Namespaces `ctx.remote` und den scope-begrenzten `agentCtx.remote`. Die [API Gateway](api-gateway.de.md) beschreibt die erzeugten Artefakte beider Seiten, ihre Assembly-Beziehungen, den SRC-Entwicklungs-Fallback und die Web-Build-Reihenfolge.

Verbraucht ein relevanter lokaler Check gebaute Paket-Ausgabe, führen Sie zuerst einmal den Build aus:

```sh
pnpm run build
```

`pnpm run hygiene` umfasst `publint`, das die Paket-Einstiegspunkte gegen die gebauten `lib/*.js`-Dateien validiert, und `verify-node-next-types`, das die gebauten Deklarationen gegen einen temporären NodeNext-Consumer validiert. Ein frischer Worktree hat kein gebündeltes JS und keine Deklarationen, bis `pnpm run build` ausgeführt wurde; übliche Commits und Pushes erfordern diesen Build nicht, es sei denn, ihre ausgewählten Checks verbrauchen ihn.

### Umgebungsvariablen

Der echte DeepSeek-Adapter und die schlüsselbasierten Agent-Demos lesen Zugangsdaten aus der Umgebung oder aus einer gitignorierten `.env` im Repository-Wurzelverzeichnis:

```sh
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://... # optional
```

`DEEPSEEK_BASE_URL` ist optional; Standard ist die öffentliche API. Commiten Sie niemals echte Zugangsdaten. Die e2e-Suiten gegen die echte API springen von selbst über, wenn `DEEPSEEK_API_KEY` nicht gesetzt ist.

### Git-Integrationen

Der Pairing-Merge-Treiber leitet einen konfliktbehafteten `.i18n.yaml`-Datensatz aus dem bestätigten Vorfahren sowie den aktuellen und gegenüberliegenden Owner-Blobs ab, wenn beide Sprachdateien die Standard-Textstrategie von Git verwenden und sich sauber mergen. Bei Owner-Konflikten, nicht-textueller Merge-Konfiguration oder ungültigen Datensätzen verweigert er die Verarbeitung; nach einem bereits gestoppten Merge führen Sie `pnpm run resolve-translation-pairing-conflicts` aus, das jeden sicheren Pairing-Datensatz stagt und bei verbleibenden manuellen Pairing-Konflikten mit einem Fehler endet. Die [Vertragsbeschreibung für zweisprachige Dokumentation](i18n/README.de.md#the-pairing-contract) nennt die exakten Dateien und Zustände, die der Treiber akzeptiert.

Der Installer prüft den exakten Node/tsx-Treiber-Einstiegspunkt, bevor er seine Worktree-Konfiguration veröffentlicht. Wird dieses Runtime später nicht mehr verfügbar, schreibt der Node-unabhängige Launcher das gewöhnliche Text-Ergebnis von Git, lässt den Sidecar ungelöst und gibt den Wiederherstellungspfad aus; stellen Sie die Abhängigkeiten wieder her und führen Sie `pnpm run resolve-translation-pairing-conflicts` aus, oder führen Sie `git merge --abort` aus. Lehnt `pre-merge-commit` einen ansonsten sauberen Merge ab, belässt Git das vollständige Ergebnis gestaggt, ohne einen Commit zu erstellen; beheben Sie den Fehler und führen Sie `git commit` aus, oder brechen Sie ab. Die [Agent Note zu automatischen Pairing-Merges](../.agents/notes/implemented/process/2026-08-08-automatic-translation-pairing-merges.de.md#failure-contract) trägt die exakten Index- und `MERGE_HEAD`-Zustände.

lefthook ist in `lefthook.yml` als schneller lokaler Kontrollpunkt konfiguriert:

- `pre-commit` validiert die gestagten Pairing-Datensätze gegen die gestagten Owner-Blobs, prüft die gestagten Dateien mit dem projektunabhängigen Profil `.oxlintrc.staged.json` und wendet Oxlint-Fixes mit einem begrenzten Wiederholungsversuch an, erzeugt `THIRD_PARTY_NOTICES.md` neu, wenn eine gestagte Datei eine seiner Eingaben ist, prüft den gestagten Diff auf Leerzeichenfehler und führt die Vendor-Manifest-Prüfung aus.
- `pre-merge-commit` führt dieselbe index-basierte Pairing-Prüfung aus, bevor Git einen automatischen Merge-Commit erstellt.
- `pre-push` führt `pnpm run typecheck` aus, das die Host-lib-Phase, einschließlich der erzeugten Typert-Verträge, vor der Client-TypeScript-Prüfung abschließt.

Die Vendor-Manifest-Prüfung stellt sicher, dass Änderungen unter `vendor/*/src` zusammen mit der entsprechenden `vendor/README.md`-Manifest-Aktualisierung gestaggt sind. Lesen Sie `vendor/README.md`, bevor Sie vendorisierten Code bearbeiten.

Abgesehen von der auf den Scope begrenzten Validierung der gestagten Datensätze führen die Hooks bewusst keine Tests, Snapshots, Dokumentations-Checks, Builds oder Hygiene aus. Mitwirkende führen die [Checks, die zum geänderten Verhalten relevant sind](../AGENTS.md#run-relevant-checks-locally) einmal aus; CI trägt die vollständige Abdeckung, die Artefakt-Smoke-Tests und die Kompatibilitätsmatrix für Node 22.19, 24 und 26.

Mitwirkende können den umfassenden lokalen Gate-Satz mit `pnpm run check:all` aktivieren. Der Befehl ist unabhängig von den Git-Hooks und keine Anweisung an den Agenten.

### CI-Gates

Der schlüssellose [CI-Workflow](../.github/workflows/ci.yml) gruppiert unabhängige Gates in breite Lanes und führt ein kleineres Kompatibilitätssignal über die unterstützten Node-Versionen hinweg aus. Artefakt-Consumer warten in ihrer Lane auf einen Build. Erforderliche Benchmarks laufen getrennt auf standardmäßig von GitHub gehostetem Linux; die [Entscheidung zum Benchmark-Runner](../.agents/notes/implemented/testing/2026-09-06-standard-hosted-benchmark-runner.de.md) trägt die Routing- und Job-Timeout-Regelung. Der getrennte Workflow für die echte API führt `pnpm run test:e2e` mit seiner konfigurierten Worker-Grenze aus. Die aktuellen Gate- und Job-Listen finden Sie in [scripts/run-gates.ts](../scripts/run-gates.ts) und den Workflow-Dateien.

Die Generalproben des dsh-Abhängigkeitslayouts und der dsh/vendor-Paketierung ohne Zugangsdaten verwenden den bestehenden selbstgehosteten Linux-Pool nur, wenn `DSH_CI_FAILOVER_LINUX=selfhosted` gesetzt ist und das Ereignis ein vertrauenswürdiger Push auf master oder ein Pull Request aus demselben Repository ohne Fork und ohne Dependabot ist. Alle anderen Fälle, einschließlich manuell ausgelöster Läufe, verwenden `ubuntu-24.04`; die manuelle Veröffentlichung bleibt gehostet. Die [Entscheidung zum Release-Generalprobe-Runner](../.agents/notes/implemented/process/2026-09-06-release-rehearsal-selfhosted.de.md) beschreibt die Isolation des persistenten Speichers und die Fallback-Grenzen.

### Tägliche Befehle

Die [Anweisungen für Mitwirkende](../AGENTS.md#commands) in der Wurzel fassen die üblichen Befehle zusammen, während [`package.json`](../package.json) und [scripts/run-gates.ts](../scripts/run-gates.ts) die aktuellen Script- und Gate-Listen führen. Wählen Sie die kleinsten Checks, die die geänderten Bereiche abdecken. Dokumentationsänderungen verwenden `pnpm run doc-sync`; Änderungen am öffentlichen Paketverhalten aktualisieren zusätzlich die zuständige README oder JSDoc, und Checks auf gebaute Artefakte erfordern zuerst `pnpm run build`.

### Profil-Ausführungen

Führen Sie vor der Verwendung dieser Quell-Checkout-Demos den Repository-Build getrennt aus:

```sh
pnpm run build
```

Der einmalige Headless-Coding-Agent benötigt `DEEPSEEK_API_KEY` in der Umgebung oder in der `.env` im Repository-Wurzelverzeichnis:

```sh
pnpm dsh --profile headless "summarize this workspace"
```

Die PTC-Mode-Demo führt dasselbe Headless-Profil mit aktiver Code-Präsentation aus:

```sh
pnpm run demo:ptc -- "summarize this workspace"
```

### TODO-Markierungen

Markieren Sie bekannte Probleme im Code mit einem von drei Kommentar-Tags, geordnet nach Dringlichkeit:

- `FIXME` — ein Problem, das eine neue Version blockieren sollte. Eine Version sollte nicht mit einem offenen `FIXME` ausgeliefert werden, es sei denn, die Reviewer stimmen ausdrücklich zu, dass die Änderung dennoch gemergt werden kann.
- `TODO` — ein Problem, das bald behoben werden sollte, sobald die Ressourcen vorhanden sind.
- `XXX` — ein Problem, das wir vielleicht irgendwann beheben; niedrigste Priorität, kein Versprechen.

Wählen Sie das Tag, das zur Dringlichkeit passt, damit jeder, der den Code durchsieht, einen Release-Blocker von einem Vielleicht-irgendwann unterscheiden kann.

### Typen wörtlich dokumentieren (`ts type-equiv`)

Die [Subsystem](subsystems/README.de.md)-Seiten fügen quelläquivalente Deklarationen zusammen mit ihrer ursprünglichen JSDoc ein, damit der Leser die exakte Typdefinition und den Quell-Vertrag sieht. Damit ein eingefügter Block bei Quelländerungen nicht von der Quelle abweicht, kennzeichnen Sie ihn als ` ```ts type-equiv ` (statt ` ```ts `) und tragen Sie ihn in `scripts/type-equiv.manifest.json` mit der Quelldatei und dem Symbol ein, die er spiegelt:

```json
{ "doc": "docs/subsystems/session.md", "symbol": "SessionEvent", "source": "packages/core/session/src/types.ts" }
```

`pnpm run verify-type-equiv` (ein Teil von `doc-sync`) extrahiert daraufhin über den TypeScript-Parser die Deklaration dieses Symbols und die zugehörige JSDoc aus dem Quellcode und prüft, dass der Block mit beiden übereinstimmt. Für eine Klasse, deren Implementierungsblöcke nicht in den Katalog gehören, verwenden Sie ` ```ts public-api ` und setzen Sie `"projection": "public-api"`; die geprüfte Projektion behält die öffentlichen Felder, den Konstruktor, die Accessoren, die Methoden und die ursprüngliche JSDoc von Klasse und Mitgliedern bei, lässt aber die Blöcke sowie private und geschützte Mitglieder weg. Der Vergleich ignoriert Leerzeichen und nicht-JSDoc-Kommentare, verlangt aber jeden ursprünglichen JSDoc-Kommentar, einschließlich der Mitglieder-Dokumentation, damit Leser den Quell-Vertrag neben der exakten Typdefinition sehen. Das Gate erzwingt eine 1:1-Zuordnung nach Dokument, Symbol und Projektion zwischen Primärblöcken und Manifest-Einträgen; ein gepaarter `.zh.md`-Block übernimmt den Eintrag seines ungesuffixten Schwester-Dokuments nur, wenn die gesamte nachverfolgte Zäunen-Sequenz byte-identisch und in gleicher Reihenfolge ist. `doc-typecheck` wendet dieselbe Ableitungsregel auf kompilierbare Blöcke an, lässt dabei beide Quelläquivalenz-Blockarten bei der Kompilierung und beim Opt-out-Verhältnis aus. Ändern Sie eine dokumentierte Deklaration oder deren JSDoc, schlägt das Gate fehl, bis Sie den eingefügten Text aktualisieren; fügen Sie einen Primärblock hinzu oder entfernen Sie einen, aktualisieren Sie das Manifest in derselben Änderung.
