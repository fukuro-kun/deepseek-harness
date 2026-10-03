# Agent Note: Artifact-first-NPM-Baseline-Veröffentlichung

Status: rejected — superseded by 2026-08-10-npm-release-sequences: numbered versions and pack→protected publish shipped; timestamp versions were not adopted

[English](2026-08-04-artifact-first-npm-baseline-publication.md) | [中文](2026-08-04-artifact-first-npm-baseline-publication.zh.md) | Deutsch

## Problem

Lauffähiger Quelltext im Monorepo beweist nicht, dass veröffentlichte Pakete lauffähig sind. Workspace-Links, TypeScript-Paths, tsx-Source-Loading und restliche `lib/`-Dateien im Arbeitsbaum können Dateien oder Dependencies liefern, die in einem veröffentlichten Tarball fehlen. Bestehende Built-Artifact-Tests lesen `lib/` weiterhin direkt aus dem Arbeitsbaum, prüfen also weder, was `package.json#files` auswählt, noch das Layout, das eine Paketmanager-Installation erzeugt. Eine Ausführung, die im Entwicklungsmodus gelingt, kann daher ohne einen benötigten Bundle-Chunk, eine Deklaration, eine Konfigurationsdatei oder ein Asset veröffentlicht werden.

Viele voneinander abhängige `@deepseek-ai`-Pakete zu veröffentlichen erzeugt außerdem ein Mengenkonsistenz-Problem. Packt und veröffentlicht ein Skript jedes Paket sofort nacheinander, lässt ein späterer Pack- oder Validierungsfehler den ersten Teil einer unbrauchbaren Baseline in der Registry zurück. Die npm-Registry kennt keine paketübergreifende Transaktion, „einmal veröffentlichen" kann also keinen atomaren Commit versprechen. Versprechen kann es, dass die gesamte Veröffentlichungsmenge vor jedem Remote-Write gepackt und validiert wird und anschließend von einem fortsetzbaren Orchestrierungsbefehl aus dieser immutable Menge veröffentlicht wird.

Die aktuelle Baseline verlangt außerdem, dass ein Mensch Versionen ableitet, sich authentifiziert, packt, publiziert und von einem lokalen Rechner aus retry't. Ein späterer GitHub-Actions-Workflow muss dasselbe Release-Bundle und dieselbe Validierungslogik wiederverwenden. Er darf nach Veröffentlichungsfreigabe keinen anderen, ungetesteten Satz Tarballs neu bauen.

## Vorschlag

Der Veröffentlichungsfluss nutzt ein immutable Release-Bundle als Grenze. Die Pack-Phase baut jedes Zielpaket von einem festen Git-Commit, erzeugt jeden Tarball, validiert Tarball-Inhalte und besteht einen Installed-Artifact-Integrationstest. Die Publish-Phase liest nur diese Tarballs und ihr Manifest; Rebuild oder Repack ist verboten.

Die Zielmenge enthält nur `@deepseek-ai/*`-Workspace-Pakete, die aus `packages/*/*/package.json` und `apps/*/package.json` entdeckt werden. Das Root-Projekt, `website/`, vendor-, Python- und native Workspaces liegen außerhalb dieser NPM-Baseline. Die Discovery muss doppelte Namen, gemischte Basisversionen, einen unerwarteten Publication-Privacy-Status und unbekannte Pakete im Bundle ablehnen, statt sich auf eine weitere handgepflegte Paketnamenliste zu verlassen.

Die Prerelease-Version besteht aus der stabilen Paketbasisversion, einem auf die Sekunde genauen UTC-Zeitstempel zum Befehlsstart und dem 10-stelligen Short-SHA des Ziel-Commits: `<base>-<YYYYMMDDHHmmss>-<short-commit>`. Der Dist-Tag wird als `dev-<base>` abgeleitet. Beispiel: Basis `0.0.1`, Zeit `2026-08-04T00:32:00Z` und Commit `909292dd7b` ergeben Version `0.0.1-20260804003200-909292dd7b` und Tag `dev-0.0.1`. Ein Retry desselben Release-Bundles muss Version und Manifest beibehalten; ein Repack erzeugt eine Version aus der neuen Befehlsstartzeit.

Die Pack-Phase läuft in dieser Reihenfolge:

1. Den Ref zu einem immutable Commit auflösen, den UTC-Zeitstempel erfassen, die Version aus dem Root-Manifest dieses Commits ableiten und Commit, Zeitstempel, Version, Tag, Registry und Ausgabepfad anzeigen. Sowohl `pack` als auch `release` warten an dieser Stelle vor teurer Arbeit auf Enter; `--yes` überspringt diese Bestätigung für Automatisierung.
2. Den Frozen-Lockfile in einem isolierten detached Worktree installieren und Source-Manifest-Publication-Constraints vor dem Staging ausführen. Uncommittete Dateien und alte Build-Ausgaben aus dem Arbeitsbaum des Aufrufers dürfen die Veröffentlichung nicht beeinflussen.
3. Jedes Ziel-Manifest mit der abgeleiteten Version stagen, seine `private`-Markierung zur Veröffentlichungszeit entfernen und interne Workspace-Dependencies in `dependencies`, `devDependencies`, `optionalDependencies` und `peerDependencies` auf dieselbe exakte Version umschreiben.
4. Den Ziel-Commit vollständig bauen, dann publint und Built-Package-Invarianten laufen lassen.
5. Jedes Paket der Zielmenge packen, ohne einen Registry-Write auszuführen.
6. Paket-Manifest, Dateiinventar, interne Dependency-Versionen, Name und Version jedes Tarballs prüfen und fehlende, doppelte oder zusätzliche Tarballs ablehnen.
7. Ein Release-Manifest und Checksums erzeugen mit Commit, Version, Tag, Registry sowie Tarball-Pfad, SHA-256 und npm-Integrity jedes Pakets.
8. Einen isolierten Consumer aus den lokalen Tarballs installieren und die in der aktuellen Implementierung verfügbaren Installed-Artifact-Probes laufen lassen; diese Probes auf die unten definierte vollständige Artifact-Plane-Integrationsmatrix erweitern.
9. Erst nachdem die gesamte Menge besteht, einen direkt ausführbaren Publish-Befehl ausgeben. Der Pack-Befehl selbst bleibt immer frei von Remote-Writes.

Der lokale `release`-Befehl komponiert Pack und Publish. Er nutzt zuerst die obige Pack-Bestätigung, um den erwarteten Zeitstempel und die Version festzulegen, wartet dann nach erfolgreichem Pack erneut auf Enter, bevor er dasselbe Manifest publiziert; `release --yes` überspringt beide Bestätigungen. Separate `pack`- und `publish --manifest`-Operationen bleiben die Primitive für geteilte CI-Jobs und Recovery.

## Aktuelle Implementierungsgrenze

Der eingecheckte Pack-Befehl implementiert Fixed-Commit-Staging, exakte interne Dependency-Pins, statische und Tarball-Payload-Prüfungen, das immutable Manifest und eine isolierte npm-Installation mit jedem Release-Tarball als lokaler Top-Level-Dependency. Er führt die installierten `dsh --version`- und `dsh --dump-default-config`-Einstiege unter plain Node aus, startet dann die installierte Default-TUI in einem POSIX-PTY, wartet auf ihr `main-session-`-Ready-Signal und beendet über `/exit`, bevor er den Publish-Befehl ausgibt. Publish unterstützt integrity-basierte Fortsetzung, trennt Read-Only-Registry-Verifikation vom authentifizierten Identity-Check und endet mit einem vollständigen Remote-Integrity- und Dist-Tag-Verifikationsdurchlauf.

Pull-Request-CI ruft den Pack-Befehl nicht auf; die Installed-Entry-Probes sind lokale Release-Checks, keine Merge-Gates. Credential-freie CI-Ausführung, paket-eigene Probes für jeden anderen bin- und öffentlichen Runtime-Einstieg, Workflow-Artifact-Transfer und der geschützte Publication-Job bleiben Vorschlagsumfang.

## Publication-Payload-Vertrag

Veröffentlichte Pakete enthalten nur Build-Artifacts, die Consumer benötigen. `package.json#files` darf weder `src` noch `lib/types/**/*.d.ts.map` enthalten; ein unabhängiges Tarball-Content-Gate muss zusätzlich bestätigen, dass kein `package/src/**`- oder `package/**/*.d.ts.map`-Eintrag existiert, damit Manifest-Pattern oder Pack-Verhalten die statische Bedingung nicht umgehen. Runtime-JavaScript, `.d.ts`-Deklarationen, Konfiguration, Assets, Worker-Dateien und dynamische Bundle-Chunks müssen den tatsächlichen Entrypoint-Abschluss abdecken.

Source-Manifeste dürfen `exports["./src/*"]` für die Source-Plane-Auflösung dieses Repos behalten. Dieser Export legt keinen Quelltext in die Publication Payload und ist kein Consumer-Vertrag des veröffentlichten Pakets. Statische Gates müssen Source-Plane und Publication Payload getrennt prüfen: Das Löschen des Source-Exports darf kaputte Workspace-Auflösung nicht verdecken, und das Veröffentlichen von `src` darf fehlende Build-Artifacts nicht reparieren.

Jeder Tarball muss frei von `workspace:`-Specifiers sein, und jede interne Dependency und Peer Dependency, die in die Veröffentlichungsmenge zeigt, muss exakt der abgeleiteten Version entsprechen; `^`, `~` und andere Semver-Ranges dürfen Commit-Baselines nicht überschreiten. Abgesehen von `exports["./src/*"]`, das ausdrücklich nur Source-Plane ist, muss jeder vom Paket-Manifest deklarierte Consumer-Einstieg auf eine im Tarball vorhandene Datei zeigen. Dynamische Imports, zur Laufzeit berechnete Pfade und nicht exportierte Assets können nicht allein aus dem Manifest validiert werden und erfordern installierte Ausführung.

## Artifact-Plane-Integrationstest

Der Integrationstest läuft, nachdem alle Tarballs existieren und vor jedem Publish. Er erzeugt ein frisches temporäres Projekt außerhalb des Monorepos, installiert den deklarierten Dependency-Abschluss über lokale `.tgz`-Dateien aus dem Release-Manifest und führt aus dieser Installation aus. Der Test muss plain Node und paketmanager-erzeugtes `node_modules` verwenden; tsx, tsconfig-Paths, Workspace-Links, Repo-Source-Pfade, Arbeitsbaum-`lib/` und dieselbe Version aus der veröffentlichten Registry sind verbotene Auflösungseingaben. Der Test asserted außerdem, dass kritische Module und Bins auf reale Pfade innerhalb des temporären Consumers auflösen.

Die Installation nutzt das für diese Veröffentlichung gewählte Client-Verhalten. Registry-Uploads müssen die `npm`-CLI verwenden, da die private Registry nur den npm-Client akzeptiert; pnpm darf Builds weiterhin orchestrieren. Tarball-Tests dürfen diese Pakete weder zuerst in die echte Registry publizieren noch nach dem Test repacken.

Der Test deckt mindestens diese Ausführungsflächen ab:

- Installiertes `@deepseek-ai/dsh` führt `dsh --version` und `dsh --dump-default-config` erfolgreich unter plain Node aus und deckt damit den statischen CLI-Einstieg und einen dynamischen Mode-Einstieg ab.
- Die installierte Default-`dsh` vollendet einen keyless TUI-Start in einem PTY und wird unter Testkontrolle beendet, nachdem ein definiertes Ready-Signal erreicht ist. Dieser Pfad muss den echten dynamischen TUI-Chunk laden, sodass eine fehlende Publication-Datei wie `lib/tui-*.js` das Gate scheitern lässt.
- Jeder andere veröffentlichte `bin` definiert ein paket-eigenes Smoke-Kommando, das weder einen echten Service erreicht noch User-State verändert. Verschiedene CLIs werden nicht gezwungen, `--help` zu teilen; der Test führt den tatsächlichen installierten Einstieg aus und prüft sein vereinbartes Exit- oder Ready-Signal.
- Node-kompatible öffentliche Runtime-Einstiege laden aus der Installation. Browser-, Worker- oder Host-Protocol-only-Einstiege nutzen passende isolierte Fixtures, doch ihre Eingaben müssen weiterhin ausschließlich die aktuellen Tarballs sein.

Diese Tests beweisen Ausführbarkeit; sie ersetzen keine Unit-Tests, Snapshots, Real-API-e2e oder publint. Test-Fixtures sollten Verhaltensassertionen bestehender Built-Bin- und PTY-Szenarien wiederverwenden, den Einstieg aber auf die Tarball-Installation umstellen. Ein Test, der Arbeitsbaum-`lib/bin.js` direkt ausführt, erfüllt dieses Gate nicht.

## Veröffentlichung und Recovery

Der Publish-Befehl validiert das Release-Manifest, jede lokale Checksum, die Ziel-Registry, `npm ping` und `npm whoami`, bevor er Tarballs in deterministischer Reihenfolge hochlädt. Er akzeptiert nur ein von der Pack-Phase erzeugtes Manifest, niemals Workspace-Verzeichnisse. Die Default-Registry ist `https://registry.npm.harnessment.com/`; jeder Publish übergibt Registry und abgeleiteten Tag explizit, damit ein User-Level-`.npmrc` den Vorgang nicht umleiten kann.

npm bietet keine Multi-Package-Atomic-Transaktion, Uploads erfolgen also weiterhin Paket für Paket. Der Orchestrator verkleinert die Fehlerfläche durch idempotente Recovery: Upload, wenn entferntes `<name>@<version>` nicht existiert; Skip, wenn es mit der Integrity des Release-Manifests existiert; sofortiger Fail, wenn es mit anderem Inhalt existiert. Dist-Tag-Inspektion liest Tag-Zuweisungen, ohne das Ziel eines Default-Tags aufzulösen, sodass ein unbeteiligter verwaister Tag die Recovery nicht blockieren kann. Zum Abschluss muss er die Integrity jeder Paketversion und jeden Dist-Tag gegen die Release-Version bestätigen. Der Workflow meldet Erfolg nur, wenn die gesamte Menge die finale Verifikation besteht.

Schlagen Pack, Tarball-Inspektion oder Installed-Artifact-Integration fehl, muss die Registry null Writes erhalten. Schlägt Publish nach einem Teil-Upload fehl, führt der Operator Publish mit demselben Release-Manifest erneut aus und darf nicht stattdessen in eine andere getimestampete Version repacken. Nur eine Code- oder Build-Input-Änderung, die andere Tarballs erfordert, führt den kompletten Pack- und Testfluss erneut aus.

## GitHub-Actions-Integration

GitHub Actions trennt einen credential-freien Pack-and-Test-Job von einem geschützten Publish-Job. Ersterer checkt den exakten Commit aus, ruft denselben Pack-Einstieg wie lokal auf, führt Tarball-Consumer-Tests aus und lädt das komplette Release-Bundle als Workflow-Artifact hoch. Letzterer hängt vom ersten ab, lädt jenes Workflow-Artifact herunter, revalidiert Manifest und Checksums und ruft denselben Publish-Einstieg auf. Er kann nach dem Checkout nicht neu bauen.

Pull Requests und gewöhnliche Pushes dürfen das credential-freie Pack-and-Test-Signal laufen lassen, damit Payload-Regressionen vor dem Merge auffallen. Die tatsächliche Private-Registry-Veröffentlichung startet als `workflow_dispatch` mit nur einem Ziel-Ref als Eingabe; der UTC-Zeitstempel entsteht im Pack-Job, während Basisversion, Short-SHA, Tag, Registry und Paketinventar aus Repo-State oder versionierter Konfiguration abgeleitet werden. Stable-Release-Triggering liegt außerhalb dieses Baseline-Vorschlags.

Der Registry-Token wird nur in den Publish-Job injiziert, der eine geschützte GitHub-Umgebung nutzt, um menschliche Freigabe, erlaubte Branches oder Tags und Concurrency zu regeln. Der Pack-and-Test-Job kann keine Veröffentlichungscredentials lesen. Das Workflow-Artifact darf eine kurze Aufbewahrungsfrist haben, doch der Publish-Job muss das vom selben Workflow-Run erzeugte Bundle verwenden, statt Tarballs anhand der Version aus einer unvertrauenswürdigen Quelle zu suchen.

## In Betracht gezogene Alternativen

**Rekursiv aus dem Workspace publizieren.** Abgelehnt, weil es Packen und Registry-Writes verzahnt, die Vollständigkeit der Menge vor dem ersten Write nicht beweisen kann und Workspace-Auflösung sowie Arbeitsbaum-State des Aufrufers die Veröffentlichung beeinflussen lässt.

**Nur gebautes `lib/` im Arbeitsbaum testen.** Abgelehnt, weil das den Build-Baum validiert statt des von `package.json#files` ausgewählten Tarballs. Ein dynamischer Chunk, der im Arbeitsbaum vorhanden ist, aber im Tarball fehlt, ist genau der Fehler, den dieser Vorschlag fangen muss.

**Nur `dsh --help` ausführen.** Abgelehnt, weil Commander Hilfe ausgeben und beenden kann, bevor der dynamische TUI-, Web- oder Headless-Einstieg geladen wird. Es beweist nicht, dass der Default-Produktionsstartpfad vollständig ist.

**`src` und Declaration-Maps veröffentlichen, um Fehldatei-Risiko zu senken.** Abgelehnt, weil die Source-Plane kein Produktions-Runtime-Fallback ist. Den Payload zu vergrößern verdeckt Bundle-Closure-Fehler und macht lokale Debug-Ausgaben zu versehentlichen Veröffentlichungsverträgen.

**Wirklich atomare paketübergreifende Veröffentlichung verlangen.** Abgelehnt, weil die npm-Registry keine solche Transaktion hat. Ein immutable Release-Bundle, vollständige Pre-Publication-Validierung, Integrity-Vergleich und idempotente Recovery bieten eine umsetzbare Grenze unter Beibehalt der expliziten Einschränkung, dass Teil-Uploads kurz sichtbar sein können.

**Im Publish-Job nach Freigabe neu bauen.** Abgelehnt, weil die getesteten und hochgeladenen Tarballs ihre Inhaltsidentität verlieren würden. Workflow-Artifact und Checksums müssen die Testeingaben direkt in die Veröffentlichung tragen.

## Akzeptanzkriterien

- Ein Pack-Einstieg entdeckt jedes Ziel unter `packages/*/*` und `apps/*` von einem festen Commit, leitet eine Version aus UTC-Sekunde und Short-Commit ab, zeigt sie vor dem Enter-Warten an, erzeugt das komplette Release-Bundle vor jedem Registry-Write und gibt einen kopierbaren Publish-Befehl aus; `release` wartet nach dem Packen erneut, `--yes` überspringt beide Bestätigungen.
- Statische Manifest- und Tarball-Content-Gates lehnen veröffentlichtes `src` und `.d.ts.map` ab, während Source-Manifeste `exports["./src/*"]` behalten.
- Das Release-Bundle zeichnet die komplette Paketmenge, Commit, abgeleitete Version, Tag, Registry und Per-Tarball-Integrity auf; jede interne Dependency ist exakt auf jene Version gepinnt, und Publish konsumiert nur dieses Bundle ohne Rebuild.
- Ein isolierter Integrationstest installiert aus lokalen Tarballs und startet die installierte Default-`dsh`-TUI unter plain Node; das Löschen eines benötigten dynamischen Chunks lässt den Test deterministisch fehlschlagen.
- Jeder veröffentlichte bin und jeder anwendbare öffentliche Runtime-Einstieg hat Post-Tarball-Install-Ausführungsabdeckung, mit Auflösungspfaden, die beweisen, dass kein Monorepo-Fallback stattfand.
- Publish setzt nach Teilerfolg sicher mit demselben Manifest fort: Übereinstimmende Integrity wird übersprungen, konfligierende Integrity abgelehnt, und die finale Verifikation verlangt Übereinstimmung jeder Version und jedes Tags.
- Ein credential-freier GitHub-Actions-Job erzeugt und testet das Bundle, ein geschützter Job lädt das identische Bundle hoch, und der Publication-Token existiert nur im letzteren.

## Risiken

Vollständiges Packen, Installieren und Starten erhöht CI-Zeit und Workflow-Artifact-Volumen. Die Implementierung sollte externe Dependencies und den pnpm-Store cachen, darf aber installierten Workspace-Output für Zielpakete weder cachen noch wiederverwenden. Sichere Consumer-Probes können parallel laufen, um Latenz zu senken.

Jeden Tarball als Top-Level-Dependency eines temporären Projekts zu installieren kann eine undeklarierte interne Dependency verdecken. Der Testgenerator sollte den deklarierten rekursiven Abschluss jeder getesteten Anwendung installieren und bestehende Dependency-Gates beibehalten. Für `@deepseek-ai/dsh`, dessen Dependency-Fläche sich der Vollmenge nähert, bleiben Paket-Manifest- und statische Graph-Prüfungen nötig, um undeklarierte Kanten zu finden.

Plattformspezifische Optional-Dependencies, native Addons, PTYs und Browser-Einstiege können plattformeigene Probes erfordern. Die erste Phase muss den primären `dsh`-Start auf dem Publication-Linux-Runner und einen lokalen macOS-Pfad abdecken und die Matrix dann mit den tatsächlichen Veröffentlichungsplattformen erweitern. Einen instabilen Probe zu überspringen darf keinen Produktionspfad aus dem Gate herausnehmen.

Recovery kann npm's Teil-Sichtbarkeit nicht beseitigen. Während einer fehlgeschlagenen Veröffentlichung kann die Registry kurzzeitig nur einige Paketversionen des Bundles enthalten. Operatoren und Automatisierung müssen die finale Bundle-Verifikation als Baseline-Verfügbarkeits-Signal behandeln, nicht ein erfolgreiches einzelnes `npm publish`.
