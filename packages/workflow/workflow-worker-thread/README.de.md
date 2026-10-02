---
description: "Die Worker-Thread-Workflow-Engine: führt modellgeschriebene Orchestrierungsskripte außerhalb des Host-Event-Loops aus, für Nutzer und Maintainer, die Ausführungsisolation wählen oder konfigurieren."
kind: "package-reference"
---

# @deepseek-ai/dsh-workflow-worker-thread

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

Nutzen Sie `dsh-workflow-worker-thread`, um modellgeschriebene Workflow-Skripte fernab des Host-Event-Loops auszuführen. Jeder Run erhält seinen eigenen Worker-Thread, sodass synchrone Schleifen den Harness nicht blockieren und Skripte, die Cancellation ignorieren, terminiert werden können. Die Engine unterstützt die `workflow`- und `ralph`-Tools in den ausgelieferten Kompositionen und kann mit `dsh-tool-workflow` kombiniert werden, um `workflow` in einer anderen Komposition zu exponieren. Diese Isolation begrenzt Verfügbarkeitsfehler, ist aber keine Security-Boundary; wirklich nicht vertrauenswürdige Skripte benötigen einen separaten Prozess oder Container.

## Inhaltsverzeichnis

- [Das Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Das Paket verwenden

Mounten Sie diese Engine, wenn eine Komposition die Workflow-Capability benötigt: Jedes Orchestrierungsskript läuft in seinem eigenen Worker-Thread fernab des Host-Event-Loops, und die `workflow`- und `ralph`-Tools der ausgelieferten Komposition führen darauf aus. Verwenden Sie sie nicht als Sandbox für wirklich nicht vertrauenswürdige Skripte — feindlicher Code benötigt eine Separate-Process- oder Container-Engine.

### Minimale Konfiguration

Das Laden der Engine registriert `ctx.workflowEngine`; das Hinzufügen von `dsh-tool-workflow` gibt dem Modell das `workflow`-Tool. Jedes Config-Feld ist optional:

```yaml
- name: '@deepseek-ai/dsh-workflow-worker-thread'
- name: '@deepseek-ai/dsh-tool-workflow'
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `provider` | `spawn` | Host-seitiger Subagent-Provider, den `agent()`-Aufrufe nutzen. |
| `maxConcurrentAgents` | `0` | Obergrenze für konkurrierende `agent()`-Aufrufe; `0` wird aus dem verfügbaren CPU-Parallelismus aufgelöst. |
| `maxTotalAgents` | `1000` | Gesamtzahl der `agent()`-Aufrufe, die ein Run starten darf — die Auffanggrenze für ausufernde Schleifen. |
| `maxItemsPerCall` | `4096` | Einträge, die ein `parallel()`- oder `pipeline()`-Aufruf annimmt. |
| `syncTimeoutMs` | `5000` | VM-Timeout für das initiale synchrone Segment des Skripts, in Millisekunden. |
| `disposeGraceMs` | `5000` | Grenze vor Force-Settlement und Worker-Terminierung; begrenzt auch `dispose()`. |

Ein besitzender Consumer darf `WorkflowStartRequest.subagentProvider` und `WorkflowStartRequest.maxTotalAgents` für einen Run setzen — Engine-Level-Policy, keine Skript-Hooks; das gewöhnliche `workflow`-Tool lässt beide ungesetzt, und eine Per-Run-Gesamt-Child-Obergrenze darf die konfigurierte Grenze senken, aber niemals erhöhen. Der generierte [Konfigurationskatalog](../../../docs/config-catalog.md#deepseek-aidsh-workflow-worker-thread) ist die erschöpfende Quelle für jedes akzeptierte Feld.

### Was ein Run liefert

Wenn ein Run startet, wird der Skript-Body im Worker mit Top-Level-`await` und den Hooks `agent()`, `parallel()`, `pipeline()`, `phase()` und `log()` ausgeführt; `meta` und `args` kommen als reine JSON-Daten an, niemals als ausgewerteter Code. Jeder `agent()`-Aufruf startet einen host-seitigen Subagent unter dem konfigurierten Provider, wobei der Parent des Runs der Parent jedes Childs ist. Der Run settled mit dem finalen JSON-Wert des Skripts; ein gewöhnlicher Child-Fehler löst `agent()` zu `null` auf, damit das Skript ihn behandeln kann.

Ein fehlerhafter Meta-Block, ein Body, der nicht parst, eine nicht verfügbare Provider-Route oder eine Per-Run-Obergrenze über der Grenze wird synchron abgelehnt, bevor ein Worker existiert, sodass der Aufrufer eine Verletzungsliste sieht und den Aufruf korrigieren kann. Während der Ausführung töten Hook-Missbrauch und ausgelöste Obergrenzen das Skript mit einem fatalen Workflow-Fehler. Cancellation ist begrenzt: Ein Skript, das sie ignoriert, wird nach `disposeGraceMs` als cancelled force-settled und sein Worker terminiert.

### Vertrauenserwartungen

Skript-CPU-Arbeit und synchrone Spins bleiben fern des Host-Event-Loops, `worker.terminate()` gibt dem Disposal einen echten finalen Stopp, und der Worker startet mit einer bereinigten Umgebung — nur Plattform-Temp-Pfade und, im Source-Modus, `TSX_TSCONFIG_PATH` — sodass Umgebungs-Credentials nicht über `process.env` übergreifen. Host/Worker-Nachrichten nutzen Structured-Clone-Daten mit Plain-JSON-Validierung an der Skriptgrenze.

Nichts davon ist eine Security-Boundary: Es werden absichtlich keine Timer, Filesystem-APIs oder Node-Globals injiziert, aber entkommener Code kann Node weiterhin mit der Prozess-Autorität des Workers erreichen.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Isolationsdesign und die Run-Mechanik der Engine; das beobachtbare Verhalten ist in [Das Paket verwenden](#use-this-package) vollständig beschrieben.

### Designkonzept

Ein Worker-Thread pro Run verhindert, dass ein fehlerhaftes Skript den Host blockiert, und ermöglicht Force-Terminierung: Das Skript läuft in einem verlassbaren `node:vm`-Kontext innerhalb des Workers, und `agent()`-Aufrufe überqueren ein typisiertes Host/Worker-Protokoll zurück zu `ctx.subagents`. Der VM-Kontext formt die API-Fläche des Skripts; er ist keine Security-Sandbox.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Eintritt: `Config`-Schema, Vorab-Validierung, `start()`-Verdrahtung |
| [`src/host.ts`](src/host.ts) | Host-Seite eines Runs: Worker-Spawn, Child-Orchestrierung, Settlement, Disposal |
| [`src/worker.ts`](src/worker.ts) | Worker-Eintritt: Skriptausführung, Hook-Implementierung, Wert-Materialisierung |
| [`src/runtime.ts`](src/runtime.ts) | Skript-Runtime: Hook-Contracts, `parallel()`- und `pipeline()`-Kombinatoren |
| [`src/realm.ts`](src/realm.ts) | Cross-Realm-Materialisierung: Annahme- und Ablehnungsregeln für reine JSON-Daten |
| [`src/protocol.ts`](src/protocol.ts) | Typisiertes Host/Worker-Nachrichtenprotokoll |
| [`src/meta.ts`](src/meta.ts) | `meta`-Formvalidierung und -Normalisierung |
| [`src/session.ts`](src/session.ts) | Child-Run-Projektion und Snapshotting vor dem Übergang zum Worker |
| — | Es wird kein Runtime-Invariant-Companion veröffentlicht; diese Prozessgrenzen-Implementierung exponiert keine Same-Process-Event-Relation; Worker-Protokoll- und Built-Worker-Tests decken sie ab. |

### Run-Sequenz

`start()` validiert den Meta-Block, parst den Body, löst die Provider-Route auf und löst die Per-Run-Gesamt-Child-Obergrenze auf, bevor ein Worker erstellt oder `workflow/start` publiziert wird. Ein Ready/Go-Handshake verhindert, dass eine Start-Signal-Cancellation, die mit dem Worker-Boot rasst, das initiale synchrone Segment des Skripts ausführt; der Source-Modus installiert TypeScript-Transforms über einen Data-URL-Bootstrap, während der Built-Modus das geschwisterliche `lib/worker.cjs`-Bundle übergibt.

Für jeden `agent()`-Aufruf sendet der Worker ein `child-start`; der Host startet den Provider (das Override des Requests oder der konfigurierte Provider) über das Subagent-Seam, attribuiert das Child auf den Parent des Runs und meldet Start oder Start-Fehler zurück. Die Provider-Wahl gilt für jedes Child im Run und ist für das Skript nicht sichtbar. Provider-Starts werden getrennt von publizierten Childs verfolgt, sodass ein ausstehender Start vom geteilten Signal abgebrochen wird, wenn Cancellation, Worker-Tod oder normales Settlement die Admission schließt.

### Wertgrenze

Werte, die das Skript verlassen, durchlaufen die Realm-Materialisierung, die reine verlustfreie JSON-Daten annimmt und exotische Prototypen, Funktionen, Symbole, Zyklen, Sparse-Arrays, nicht-finite Zahlen und verschachteltes `undefined` ablehnt. Child-Ergebnisse werden projiziert und gesnapshottet, bevor sie vom Host zum Worker übertreten — eine echte prozessartige Serialisierungsgrenze, bewusst anders als die geborgten immutablen Werte von Same-Process-Workflow-Events.

### Cancellation und Disposal

`cancel()` zeichnet den ersten Grund auf, weist den Worker zum Abbrechen an, bricht das eine Signal ab, das von jedem ausstehenden und publizierten Child geteilt wird, und armiert den `disposeGraceMs`-Timer; Worker-Hooks werfen dann `CANCELLED` bei ihrem nächsten Await. Wenn der Run zur Deadline unabgerechnet bleibt, löst der Host ihn als cancelled auf, paart gestrandete Child-Lifecycle-Events und terminiert den Worker.

`dispose()` ist idempotent: Es bricht den Run ab, startet sofort das host-getriebene Disposal, wartet auf Ergebnis- und Child-Quiescence bis zur selben Grace, terminiert den Worker bedingungslos und führt einen finalen Survivor-Sweep durch. Per-Child-Disposal ist memoisiert, sodass Worker-RPC, Host-Cancellation, Death-Cleanup und öffentliches Disposal alle in eine Operation münden.

### Ergebnis- und Event-Garantien

Das finale Ergebnis ist First-Wins an den Host-Claim-Punkten: Eine angenommene externe Cancellation überstimmt ein späteres nicht-cancelled Worker-Ergebnis, und ein Ergebnis oder Worker-Tod, der zuerst claimt, kann nicht von reentranten Cleanup-Callbacks umgeschrieben werden. Worker-Fehler, Nachrichtenversagen oder vorzeitiges Beenden schließen die Nachrichten-Admission vor dem Cleanup und lösen dann `error` auf, es sei denn, Cancellation besitzt den Run bereits.

Der Host führt ein Ledger der weitergeleiteten Child-Starts; ein sauber beendeter Worker liefert ihre Ends, während Tod oder Force-Terminierung jedes fehlende End als cancelled synthetisiert — jedes weitergeleitete `workflow/agent-start` wird genau einmal gepaart.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Engine-Level-Contract nicht ausreicht. Sie führen vom Seam-Contract zu den modellseitigen Consumern und den Designentscheidungen.

- [Workflow-Subsystem](../../../docs/subsystems/workflow.de.md) — der Seam-Contract, den diese Engine implementiert.
- [Workflow-Seam](../workflow/README.md) — das Run- und Ergebnisvokabular hinter `ctx.workflowEngine`.
- [workflow-Tool](../tool-workflow/README.md) — der modellseitige Consumer, der Skripte auf dieser Engine ausführt.
- [Gruppenkarte](../README.de.md) — die Workflow-Capability-Familie und ihre Pakete.
- [Dynamic-Workflows Agent Note](../../../.agents/notes/implemented/feature/2026-07-05-dynamic-workflows.md) — das Seam-Design und seine Entscheidungen.

-----

<a id="model-experience"></a>
## Model Experience

### Child-Agent-Requests

#### Was das Modell sieht

Jeder `agent()`-Aufruf des Skripts sendet seinen Prompt wörtlich sowie optionales Modell oder Structured-Output-Schema an einen Subagent-Provider. Jedes Child sieht den eigenen Kontext dieses Providers; Phase- und Log-Narration bleiben auf Observer-Events.

#### Token-Effekt

Potenziell werden viele unabhängige Child-Kontexte bezahlt, begrenzt durch `maxConcurrentAgents`, `maxTotalAgents` und `maxItemsPerCall`; sie treten niemals direkt der Parent-History bei.

#### KV-Cache-Effekt

Unabhängig vom Parent-Request-Cache und von Sibling-Childs. Jedes Child kann nur ein byte-identisches Präfix unter seinem eigenen Provider, Modell, Prompt und Schema wiederverwenden; seine spätere History wächst nur-append.

### Parent-Tool-Ergebnis, indirekt

#### Was das Modell sieht

Über [`dsh-tool-workflow`](../tool-workflow/README.md) exponiert ein Erfolg nur den materialisierten finalen JSON-Wert und die Child-Anzahl im Wrapper dieses Consumers. Diese Engine liefert stabile Fehler, darunter `workflow script does not parse: <error>`, `invalid meta: <violations>`, `agent() requires a non-empty prompt string`, `agent() could not start a child: <error>` und `child agent run failed: <error>`, plus ihre exakten `parallel()`-, `pipeline()`-, `phase()`-, Options-, Schema- und JSON-Grenzen-Validierungsmeldungen. Zwischenzeitliche Child-Ausgaben stehen dem Skript zur Verfügung, nicht aber dem Parent-Modell.

#### Token-Effekt

Null direkte Parent-Tokens von dieser Engine. Die Größe des finalen Ergebnisses wird vom Tool-Consumer begrenzt und bis zur Compaction vorgehalten.

#### KV-Cache-Effekt

Nur-append; neu sichtbarer Inhalt folgt dem wiederverwendbaren Request-Präfix und invalidiert keine bestehenden KV-Cache-Einträge.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann die Engine schlecht passt oder besondere operative Sorgfalt braucht. Sie sind aktuelle Constraints, kein Aufgabenrückstand.

- **Worker und VM sind keine Security-Boundary** — modellgeschriebener Code kann `node:vm` entkommen und die Prozess-Autorität des Workers erreichen; ein Deployment mit feindlichem Code benötigt eine Separate-Process- oder Container-Engine.
- **Ein Worker-Thread wird pro Run bezahlt** — es gibt keinen Pool, keine warme Runtime und keinen Run-übergreifenden Skript-Cache.
- **Es werden keine ambienten Timer, kein Filesystem und kein Netzwerk injiziert, aber entkommener Code kann Node weiterhin erreichen** — die fehlenden Globals sind eine Portabilitäts-API, keine Isolation.
- **Terminierung kann nur host-beobachtete Starts melden** — `agentsStarted` schließt Worker-seitige Aufrufe aus, die bei erzwungener Terminierung noch hinter der Konkurrenzgrenze queuen und damit unbekannt werden.
- **Cross-Realm-Fehler bestehen `instanceof Error` nicht innerhalb von Skripten** — Workflow-Autoren müssen über stabile Felder wie `name` und `code` verzweigen.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: gemessene Artefakte und noch nicht entschiedene Richtungen. Sie ist explizit nicht autoritativ — ausgeliefertes Verhalten, Grenzen und akzeptierte Begründungen leben in den Abschnitten oben, dem Paket-Code und den verlinkten Agent Notes.

Offene Richtungen: eine gepoolte oder warme Runtime und ein Run-übergreifender Skript-Cache, um einen Worker pro Run zu vermeiden; eine echte Prozess- oder Container-Engine für nicht vertrauenswürdige Skripte hinter demselben Seam. Der gebaute `./worker`-Eintritt wird als CommonJS-Bundle ausgeliefert, weil der VFS-Hook von pkg CommonJS erwartet; der Source-Modus installiert tsx-Transforms über einen Data-URL-Bootstrap.

</details>
