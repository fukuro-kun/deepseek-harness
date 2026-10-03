# Agent Note: GUI-Testsystem — die dreistufige Struktur
[English](2026-07-20-gui-testing-system.md) | [中文](2026-07-20-gui-testing-system.zh.md) | Deutsch

Status: implemented

> Pfad-Update (2026-08-27, Remote-Migration): Die Drei-Tier-Philosophie und die Golden-Path-Methode hier bleiben aktuell; Object-Layer-Specs leben verteilt über `packages/api/session-controller/tests/` und `packages/test-support/client-runtime/tests/`, während Remote- und Carrier-Specs über `packages/api/gateway/tests/` und `packages/client/connection/tests/` verteilt sind. Component-Specs sind pro-Plugin-jsdom-Suites unter dem jeweiligen `packages/client/*/tests/`. Die Form der Component-Specs folgt dem [Slot-System-Standard](../architecture/2026-07-22-slot-type-chain-implementation.de.md): Props direkt füttern — der Store-Anteil kommt von `createXXXStore().create()` (die echte Engine, der freigegebene Zero-Machinery-Pfad), Framework-Hooks sind plain Stubs; keine Render-Machinerie, kein Provider-Mounting. Slot-Ownership und Registry-Semantik sind Tier-2-Gebiet (`ui-renderer`- + `ui-slots`-Suites), keine Component-Specs.


> Arbeitsteilung: Diese Note deckt nur die GUI-spezifische Teststruktur ab (`packages/{client,host}/*` + `apps/web`); die repo-weite Test-Policy (Tiering-Prinzipien, die With-Key-Policy, Real-Implementation-First, REAL-Composition) liegt in [docs/testing.md](../../../../docs/testing.de.md) und wird hier nicht wiederholt.

## Problem

Der GUI-Stack umspannt mehrere Anwendungsformen, und innerhalb einer Form mehrere Laufzeitumgebungen (den Node-Host, die Datenprotokollschicht, den Browser-Object-Layer, React/DOM); eine Single-Lane-Testsuite kann kein aussagekräftiges Signal liefern. Jedes Glied braucht eigene wirksame Tests plus die Basisfähigkeit zum Full-Chain-Testen.

## Entscheidung

Entlang der natürlichen Test-Hooks der Architektur in drei Tiers geschnitten, Bottom-up:

| Tier | Unter Test | Schlüsseltechnik | Dateiort |
|---|---|---|---|
| 1 Protokoll-Isomorphie | Generierte Typert-Remote-Deskriptoren + `ApiGateway` + der Connection-RPC-Carrier (Argumente / Ergebnisse / Fehler / Streams / Cancellation) | **Die volle Kette am isomorphen Punkt**: Gateway-Host/Client-Suites validieren Deskriptor-Codecs und Remote-Dispatch im Prozess; Connection-Host-Suites fahren dasselbe `/api`-Carrier-Framing und die Trust-Checks ohne Browser | `packages/api/gateway/tests/`, `packages/client/connection/tests/` |
| 2 Object-Layer-Orchestrierung | `Session`/`SessionManager`/`ConnectionController` (State Machines und Timing: Stitching / Dedup / Paging / optimistisches Draft-Clearing / pendingBuffers / Reconnect / Backoff) | **Der „Event-Sequenz rein → Snapshot raus"-Golden-Path**: programmierbare Fakes + Deferreds steuern Timing + Fake-Timers steuern Backoff | `packages/client/{runtime,connection}/tests/` |
| 3 Assemblierte Präsentation | Gebaute Artifacts × der echte Client-Loader und Plugin-Komposition | App-eigene semantische Snapshots booten alle acht gebauten Client-Plugins unter jsdom für deterministische Cross-Plugin-State-Änderungen; bare Playwright-Smoke beweist separat die echte Browser-/Carrier-Grenze, wobei Real-Host-Fälle ohne Key selbst skippen; die keyless Browser-e2e-Lane deaktiviert die ausgelieferte Model-Adapter-Zeile und replayt aufgezeichnete Session-Fixtures durch `dsh-llm-replay` in der echten In-Process-Web-Assembly gegen Conversation-Aria-Goldens ([Web-e2e-Lane](../testing/2026-07-24-web-gui-browser-e2e-lane.de.md), [erforderliches CI-Gate](../testing/2026-07-30-web-browser-snapshot-ci-gate.de.md)) | `apps/web/tests/*.snapshot.ts`, `apps/web/tests/smoke-{fixture,real}.e2e.ts`, `apps/web/tests/{replay-round-trip,seeded-history}.e2e.ts` |

Inter-Tier-Disziplin: **Jeder Tier testet seine eigene Schicht, obere Tiers testen nie untere erneut** — ein App-Semantic-Snapshot pinnt nur die nutzersichtbare Projektion über der assemblierten Plugin-Grenze, während Playwright-Smoke Browser- und Carrier-Liveness beweist; Wire-Semantik gehört Tier 1 und Datensemantik Tier 2. Pure-Function-Schichten (lineage/partial/notifier/transcript-adapter) werden direkt mit null Fakes im selben Paket tests/ neben Tier 2 getestet.

- **Host- und Client-Source** stehen unter dem repo-weiten per-File-100%-Coverage-Gate, mit Ausnahme der engen Browser-Grade-Ausschlüsse, die in `vitest.config.ts` annotiert sind; Component-Suites nutzen per-File-jsdom-Pragmas und Testing Library, ohne Node-Suites zu verändern.
- **App-eigene semantische Snapshots** lesen gebaute Client-Bundles, führen sie durch den echten Loader aus und fahren nur deterministische Fixture-Hooks. Sie besitzen stabilen sichtbaren State wie Sidebar-Labels, Breadcrumbs und `document.title`, nicht CSS-Pixel oder State-Machine-Details unterer Schichten.

## Lane-Map

| Szenario | Befehl | Inhalt | Wann laufen lassen |
|---|---|---|---|
| Baseline | `pnpm run test:gui` | Tier-1+2-vitest (`packages/client packages/host`), sekundenschnell, kein Browser, kein Server | Beiläufig, nach dem Anfassen beliebiger GUI-Source |
| Semantic Snapshot | `DSH_EXAMPLE_MODE=lib pnpm run test:snapshot` | Keyless assemblierte Anwendungssemantik plus die transportspezifischen Expected Outputs des Repos | Nach einer nutzersichtbaren GUI-Änderung; vor der Auslieferung |
| Browser-End-to-End | `pnpm run test:web` | Baut zuerst das Frontend-dist neu, dann das Tier-3-Browser-Set: der zweistufige Smoke (Fixture-Stufe + Real-Host-Stufe mit Self-Skip) plus die keyless replayten e2e-Szenarien (`DSH_SNAPSHOT=record`/`refresh` re-recorded Fixtures / rewrite Goldens) | Nach dem Anfassen von Build-Fläche/Boot/Carriage; vor der Auslieferung |
| Browser-Expected-Output-Gate | `DSH_SNAPSHOT=replay pnpm run test:web:built` | Nutzt CI-gebaute Artifacts wieder und vergleicht jedes committed Browser-Golden ohne Schreiben | Jeder Linux-Pull-Request |
| Gate | `pnpm run test:coverage` | Das repo-weite Gate (Host- und Client-GUI-Pakete eingeschlossen, außer annotierten Browser-Grade-Ausschlüssen) | Das PR-Fenster |

**Arbeitsteilung zwischen den Browser-Skripten und vitest**: Playwright besitzt Browser-/Carrier-Blackbox-Regression und lange sequentielle User Journeys; gewöhnliches vitest besitzt Data-Layer-Semantik wie Referenzstabilität, Timing und Wire-Shapes; Snapshot-vitest besitzt stabile App-Level-Semantik-Outputs durch die gebaute Komposition. Diese Lanes ergänzen sich, statt Assertions zu duplizieren.

## Anti-Regressions-Disziplin

- **Jeder Bugfix pinnt eine Assertion**: Ein browser-sichtbarer Bug wird in seine zugehörige Browser-Spec gepinnt (Smoke oder e2e-Szenario); ein Data-Layer-Bug wird in die passende Spec gepinnt (Präzedenzfall: das res-close-Misjudgement in der Webserver-Bridge-Suite gepinnt — pure Node, reproduziert in Sekunden, braucht den 12s-Browser-Sentinel nicht mehr als einzige Verteidigung).
- **All-green auf Fixture ist nicht fertig, der echte Wire muss auch bestehen**: Was das Fixture kurzschließt, ist genau die Wire-Carriage-Kette (node:http-Bridge-Close-Semantik, echtes Netzwerk-Timing); beide empirisch bestätigten Bugs versteckten sich dort. Änderungen, die Connection/Bridge/Handler/SSE berühren, müssen die Browser-Lane laufen lassen (`pnpm run test:web`) — ihre keyless e2e-Szenarien fahren den echten HTTP/SSE-Carriage, und der With-Key-Real-Host-Smoke bleibt das Live-Model-Komplement.
- Der Code-on-Disk-is-the-Answer-Abgleich-Workflow: Wenn eine Verhaltensänderung landet und bestehende Fälle rot macht, vor Ort abgleichen (den Test fixen oder den Code fixen, mit dem RFC/Contract als Schiedsrichter); kein Rot hängen lassen.

## Konsequenzen

Jede Lane testet ihren eigenen Tier: Das Anfassen beliebiger GUI-Source liefert sekundenschnelles `test:gui`-Feedback, Wire-/Object-Layer-Semantik assertet in Millisekunden in Node, Built-Composition-Snapshots pinnen deterministische nutzersichtbare Projektion, und der Browser trägt Wiring- und Carrier-Abnahme. Inter-Tier-Disziplin bleibt Review-verantwortet, während Linux-CI die Browser-Golden-Freshness maschinell erzwingt. Jeder neue App-Snapshot muss instabiles Layout oder Clock-Output vermeiden.

## Berücksichtigte Alternativen

| Abgelehnt | Ein-Zeilen-Begründung |
|---|---|
| Single e2e (alles durch den Browser) | Browser-Start ist Sekunden × N langsamer und Timing ist unkontrollierbar; Wire-/Object-Layer-Invarianten lassen sich in Millisekunden in Node-env vollständig asserten |
| Migration der Verify-Skripte zu vitest | Ein geordnetes Skript teilt eine Browser-Session; die Fälle aufzuteilen formalisiert es entweder (sequentiell + geteilte Page) oder führt das Preamble × N erneut aus; Streaming-PASS/FAIL-Output ist genau das Lokalisierungs-Interface des Agent |
| FixtureApiClient in Tests wiederverwenden | Das Demo-Skript läuft auf echter Uhr, Tests brauchen deferred handgesteuertes Timing — orthogonale Zwecke; erzwungene Wiederverwendung kettet die Tests an den Rhythmus der Demo |
| Ein standalone vitest-Config für GUI-Pakete (einst als vitest.gui.config.ts entworfen) | Paket-Level-tests/ werden bereits vom Root-Include erfasst; `vitest run packages/client packages/host`-Pfadfilterung ist der enge Loop — null neue Config |
| Hooks-/Component-Layer-Unit-Tests aufschieben | jsdom bleibt die Coverage-Mainline, weil es schnelles per-File-Component-Verhalten liefert; das erforderliche Browser-Replay-Gate ergänzt es auf dem assemblierten Tier statt es zu ersetzen ([CI-Gate-Entscheidung](../testing/2026-07-30-web-browser-snapshot-ci-gate.de.md)) |
