---
description: "Worker-Thread-Codeausführung für Nutzer und Maintainer, die das ausgelieferte TypeScript-Backend zusammensetzen, dimensionieren oder debuggen — es führt jedes Programm in einem frischen Node-Worker aus."
kind: "package-reference"
---

# @deepseek-ai/dsh-code-runtime-worker-thread

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

Dieses Paket lässt PTC-Compositionen modellgeschriebenes TypeScript mit hostbereitgestellten Bindings ausführen und den Abschlusswert, geordnete Logs oder einen strukturierten Fehler zurückgeben. Jede Anfrage startet ohne Zustand früherer Läufe, und Fehler wie Syntaxfehler, Budgetablauf, Abbrüche, Speichererschöpfung und Ausgabe-Überlauf werden zurückgegeben statt geworfen. Behandeln Sie ausgeführten Code als bash-äquivalent: Das Paket begrenzt Umgebungs-Exposition und Ressourcennutzung, isoliert den Code aber nicht vom Host. Konfigurierbare Rechen-, Wanduhr-, Heap- und Ausgabelimits beenden den Lauf und begrenzen seine Ergebnisse.

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

Mounten Sie dieses Backend mit dem code-runtime seam, wenn eine Composition modellgeschriebene TypeScript-Programme ausführen soll; der PTC-Modus in `dsh-tools` treibt es dann über `ctx.codeRuntime`, sobald das Modell `run_code` aufruft. Jede Ausführungsobergrenze ist validierte Konfiguration, sodass Sie die Runtime für Ihr Deployment aus `cordis.yml` dimensionieren können.

### Minimale Konfiguration

```yaml
- name: '@deepseek-ai/dsh-code-runtime'
- name: '@deepseek-ai/dsh-code-runtime-worker-thread'
  config:
    computeMs: 60000            # busy-time budget (measured event-loop active time)
    maxWallMs: 600000           # wall-clock ceiling; never pauses for anything
    maxOutputBytes: 67108864    # combined serialized outer-output cap (64 MiB)
    maxOldGenerationSizeMb: 512 # worker heap cap
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `computeMs` | `60,000` | Busy-Zeit-Budget: Der Lauf schlägt mit `timeout` fehl, sobald die gemessene Event-Loop-Aktivzeit des Workers es überschreitet |
| `maxWallMs` | `600,000` | Wanduhr-Obergrenze, die Absicherung für Wartevorgänge, die Busy-Zeit nicht sehen kann; höchstens `2_147_483_647` |
| `maxOutputBytes` | `67,108,864` | Harte Obergrenze für serialisierte Logs plus Abschlusswert oder Fehlermeldung; mindestens `4` |
| `maxOldGenerationSizeMb` | `512` | Worker-Heap-Obergrenze; Überlauf tötet den Worker und erscheint als `worker-exit` |

Jedes Feld wird beim Laden validiert und mit Defaults belegt; es gibt keine weiteren Stellschrauben. Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-code-runtime-worker-thread) ist die erschöpfende Quelle für jedes akzeptierte Feld.

### Was ein Lauf zurückgibt

Ein erfolgreicher Lauf gibt den lossless-JSON-Abschlusswert des Programms als `result.value` und den Text, den es ausgab, der Reihe nach als `result.logs` zurück. Top-Level `await` und `return` funktionieren, und das Programm kann die hostbereitgestellten Binding-Funktionen (der PTC-Modus stellt ein `tools`-Objekt bereit) wie gewöhnliche async-Aufrufe aufrufen.

### Containment, keine Sicherheitsgrenze

Ein Programm läuft mit einer Autorität vergleichbar dem Bash-Tool: Es kann Node-APIs erreichen, und das Backend verspricht bewusst keine Isolation vom Host. Was es bereitstellt, ist Containment — ein separates Isolate, eine leere Umgebung (keine Umgebungs-Credentials, keine geerbten Loader-Flags), eine konfigurierbare Heap-Obergrenze und hartes Terminieren, das auch eine heiße synchrone Schleife stoppt. OS-Prozesse, die ein Programm spawnt, überleben `terminate()` und brauchen Bereinigung auf Deployment-Ebene.

### Was schiefgehen kann

Jedes Programm-Ergebnis resolved als Resultat, sodass ein fehlgeschlagener Lauf ein `result.error` ist, kein Rejection: Ein Syntaxfehler oder nicht-löschbares TypeScript (`enum`, namespaces) schlägt als `exception` fehl, bevor irgendein Worker spawnt; Budgetablauf ist `timeout`; das Abort-Signal ist `abort`; ein Heap-Überlauf oder anderer Worker-Tod ist `worker-exit`; ein Abschlusswert, der kein lossless JSON ist, ist `invalid-output`; und serialisierte Ausgabe über der Obergrenze ist `output-limit` — mit dem passenden erfassten Log-Präfix erhalten. Rejection bedeutet Aufrufer-Missbrauch, etwa ein nach Disposal eingereichter Lauf.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Design hinter dem Backend; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig beschrieben.

### Designkonzept

Das Backend ruht auf einer Trennung: **Containment, keine Sicherheitsgrenze**. Modell-Code hat bash-äquivalentes Vertrauen (die Trust-posture des [PTC-mode Agent Note](../../../.agents/notes/implemented/feature/2026-06-15-ptc.de.md)), sodass das Design auf Rekonstruierbarkeit und begrenzte Ressourcennutzung optimiert statt auf eine harte Multi-Tenant-Grenze — die erwartet ein container-klassiges Backend. Jeder Lauf erhält einen frischen Worker, sodass die Welt eines Programms mit seinem Worker stirbt: Es existiert kein läufigkeitsübergreifender Zustand, der leaken oder protokolliert werden könnte, und ein Lauf ist allein aus dem Session-Log rekonstruierbar.

### Ausführungsfluss

Ein Lauf wird host-seitig typ-gestrippt (`node:module`s `stripTypeScriptTypes`, positionserhaltend), als Body einer async-Funktion verpackt, sodass Top-Level `await`/`return` funktionieren, und an einen frischen Worker gesendet, dessen Bootstrap die Binding-Namespaces materialisiert. Binding-Aufrufe überqueren den Message-Port als lossless JSON und werden höchstens einmal pro Call-id beantwortet. Log-Text streamt eifrig zum Host, sodass ein getötetes Programm immer noch zeigt, was es ausgegeben hat. Genau ein Ausgang setzt den Lauf — ein `done`-Frame, ein Budgetablauf, ein Abort oder Worker-Tod — woraufhin der Host den Worker terminiert und sein Exit abwartet.

### Hostile-peer-Port

Modell-Code kann `parentPort` erreichen und Verkehr fälschen, sodass jede eingehende Nachricht formvalidiert und Feld für Feld neu aufgebaut wird, bevor irgendetwas sie liest: Gefälschte Zusatzfelder reiten niemals mit, eine nicht-numerische Call-id kann niemals in eine Antwort zurückgeechot werden, Binding-Namen lösen nur als own properties auf (ein gefälschter `constructor` kann keine Prototypenkette entlangwandern), und Müll wird still verworfen. Worker-seitige Namespaces sind null-prototype, sodass `__proto__`-förmige Binding-Namen gewöhnliche Schlüssel sind.

### Budgets

Zwei unabhängige Budgets existieren, weil der Peer feindselig ist: `computeMs` misst die gemessene Busy-Zeit des Workers (`eventLoopUtilization()`-Polling alle 25 ms), sodass eine heiße Schleife es ablaufen lässt, ob ein Köder-Dispatch in-flight ist oder nicht, während ein auf ein langsames Binding wartendes Programm nichts ansammelt; `maxWallMs` sichert das ab, was Busy-Zeit nicht sehen kann, etwa ein Promise, das niemand auflöst. Beide münden in `worker.terminate()`. `maxWallMs` wird beim Laden gegen `MAX_TIMER_DELAY_MS` bereichsgeprüft, weil `setTimeout` eine längere Verzögerung auf 1 ms klemmt.

### Ausgabe-Ledger

`maxOutputBytes` verrechnet die JSON-Serialisierung des äußeren `logs`-Arrays plus dem Abschlusswert- oder Fehlermeldungs-Payload; feste `CodeRunResult`-Feldnamen und Envelope-Syntax liegen außerhalb dieses Ledgers. Bei oder unter der Obergrenze kommt der exakte Wert zurück; ein verlustbehafteter Abschluss ist `invalid-output`, und ein kombinierter Überlauf ist `output-limit` statt eines ersetzten inspected Strings. Der Fehler behält ein passendes erfasstes Präfix der Logs.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `Config`-schema, `WorkerThreadCodeRuntime`, Lauf-Orchestrierung, Ausgabe-Ledger |
| [`src/worker.ts`](src/worker.ts) | Quellmodus-Worker-Einstieg (löschbares TypeScript, keine `lib/`-Abhängigkeit) |
| [`src/bootstrap.ts`](src/bootstrap.ts) | Worker-seitiger Bootstrap: Namespace-Materialisierung, console-shim, Log-Erfassung |
| [`src/protocol.ts`](src/protocol.ts) | Port-Nachrichtenvokabular zwischen Host und Worker |
| [`src/worker-json.ts`](src/worker-json.ts) | Worker-seitiges lossless-JSON-Encode/Decode |
| [`src/output-json.ts`](src/output-json.ts) | Byte-Messung und Kürzung für den äußeren Ledger |
| — | Es wird kein Runtime-invariant-Begleitexport veröffentlicht; diese prozessgrenzenüberschreitende Implementierung stellt keine same-process-Event-Beziehung bereit; Worker-Protokoll- und Built-Worker-Tests decken sie ab. |

### Der Worker-Einstieg, ungebaut und gebaut

Der Quellmodus lädt das nur-löschbare `src/worker.ts` über Nodes natives Type-Stripping; sein transitiver Runtime-Abschluss enthält nur Node-Builtins und relative Quellmodule, sodass ein frischer Checkout niemals den ungebauten `lib/`-Export eines Geschwister-Workspace-Pakets braucht. Der Built-Modus übergibt das Geschwister-`lib/worker.cjs` als Dateisystempfad, weil pkgs VFS-Worker-hook CommonJS erwartet; derselbe Pfad funktioniert unter gewöhnlichem Node.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese, wenn der Backend-Vertrag nicht ausreicht. Sie führen von der seam-Definition zum Consumer und der Konfigurationsoberfläche.

- [Code-runtime seam](../code-runtime/README.de.md) — der abstrakte Vertrag, den dieses Backend implementiert.
- [PTC-mode Agent Note](../../../.agents/notes/implemented/feature/2026-06-15-ptc.de.md) — wie `dsh-tools` `ctx.codeRuntime` konsumiert und `run_code` darstellt.
- [Code-runtime-Subsystem-Referenz](../../../docs/subsystems/code-runtime.de.md) — Request/Result-Vokabular, Bindings und Fehlertaxonomie.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-code-runtime-worker-thread) — jedes akzeptierte Config-Feld und seine Quelldeklaration.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über den PTC-Modus in `dsh-tools`, der den exakten äußeren Wert rendert, wenn er passt, oder einen expliziten `invalid-output`-/`output-limit`-Fehler, während nur das äußere `run_code`-Ergebnis unter seiner gewöhnlichen spill-Richtlinie in den Modellkontext gelangt und Binding-Verkehr plus Zwischenwerte ausführungslokal bleiben.

#### KV-Cache-Effekt

Keine direkte Invalidierung; der benannte Consumer besitzt etwaige Anfrage-Präfix-Änderungen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann das Backend schlecht passt oder besondere Betriebssorgfalt braucht. Sie sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **OS-Prozesse, die ein Programm spawnt, überleben die Terminierung** — `worker.terminate()` beendet nur den Thread, schwächer als bash-locals Prozessgruppen-Kill; die Bereinigung verwaister Prozesse ist eine Deployment-Angelegenheit, bis ein Container-Backend existiert.
- **Das Type-Stripping reitet auf Nodes experimenteller `stripTypeScriptTypes`-API** — amaro oder sucrase sind die benannten Drop-in-Ersatzkandidaten, falls sich das Verhalten, auf das man sich verlässt, verschiebt.
- **`computeMs`-Ablauf kann um bis zu ein Poll-Intervall überschießen** — Busy-Zeit wird alle 25 ms gesampelt (eine interne Konstante, bewusst nicht konfigurierbar).
- **Programme erhalten ein `console`-shim mit fünf Methoden** (`log`/`info`/`warn`/`error`/`debug`) — bewusst nicht Nodes vollständige console-API.
- **Zwischen-Binding-Werte haben keine Byte-Obergrenze** — ein Programm kann Prozess- oder Worker-Speicher mit einem Wert erschöpfen, der niemals äußere Ausgabe wird.
- **Die 64-MiB-Standardobergrenze ist eine Ablehnungsgrenze, kein wiederherstellbarer Speicher** — äußeres spill kann nur die begrenzten Logs und die Diagnose speichern, die nach `output-limit` zurückgegeben werden; über der Runtime-Obergrenze abgelehnte Bytes erreichen die spill-Schicht nie.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
