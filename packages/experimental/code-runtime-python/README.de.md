---
description: "CPython-Subprozess-Code-runtime: die dsh-code-runtime-seam-Implementierung für Python-Modellcode, mit dem fd-3-Protokoll, das sie spricht."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-code-runtime-python

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

Dieses private experimentelle Paket lässt Source-Checkout-compositions modellgenerierten Python pro Anfrage in einem frischen CPython-3.10+-Subprozess ausführen. Programme können Top-Level-`await` und `return` verwenden, konfigurierte bindings aufrufen und normales stdout/stderr schreiben, während sie explizite Abschluss- oder Fehlerergebnisse erhalten. Ressourcenbudgets und Prozessgruppen-Teardown begrenzen außer Kontrolle geratene Arbeit, aber der Subprozess ist keine Sicherheitsgrenze: Modellcode hat bash-äquivalentes Vertrauen, über Läufe hinweg bleibt kein Zustand erhalten, und kein ausgeliefertes Profil aktiviert diese runtime.

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

Wähle dieses private experimentelle Paket nur in einer expliziten Source-Checkout-composition. Registriere `PythonCodeRuntime` neben `dsh-tools`; `run()` führt dann jedes Programm in einem frischen CPython-3.10+-Subprozess aus und resolved bei Erfolg mit `result.value`, bei Fehlschlag mit `result.error` (die orthogonale `CodeRunFailure.kind`-Taxonomie klassifiziert Parse-Fehler, geworfene Exceptions, ungültige Abschlusswerte, Output-Überläufe, Budgetablauf, Abbrüche und Substrat-Tod). Es rejectet nur bei seam-Missbrauch — einem malformed binding-Namensraum oder einem Aufruf nach dem dispose. Die Konfiguration wird beim Laden abgelehnt: eine Nicht-Unix-Plattform; ein explizites `pythonBin`, das keine ausführbare reguläre Datei ist, oder ein bare Name, der sich nicht auf `PATH` auflöst; ein Nicht-CPython-, Pre-3.10- oder Probe-fehlschlagender Interpreter; ein nicht-positives oder nicht-ganzzahliges Budget; ein `maxLogBytes` unter der Untergrenze des Truncation-Markers (64); ein Timer-Wert, den `setTimeout` klemmen würde; ein Budget größer als die effektive fd-3-Frame-Obergrenze (abgesenkt, wenn der Host-Heap einen nahe-am-Limit-Frame nicht sicher parsen kann); oder ein `addressSpaceMb`/Output-Budget-Paar, dessen Worst-Case-Spitze `RLIMIT_AS` brechen würde.

### Was du bekommst

Der Default-Export des Pakets ist das `PythonCodeRuntime`-Plugin. Seine öffentliche Oberfläche re-exportiert außerdem das host-seitige Protokollvokabular: `validateChildFrame` (baut jeden eingehenden Frame neu), den lossless-JSON-Codec und die Meter (`encodeJsonPlain`, `checkDoneValue`, `hasUnsafeIntegerToken`, `hasNonLosslessNumber`), `logTruncationMarker` (den gemeinsamen Truncation-Marker-Text), plus `resolvePythonBin` (Interpreter-Suche gegen das aktuelle `PATH`), `readProcessStart` (Prozessstart-Statistiken für Tests), `detachResidual` (ein Test-seam für die Ressourcenaufräumung des abgerechneten Laufs) und `hostFrameParseCeiling` (die heap-abgeleitete Frame-Parse-Obergrenze, die ein gegebenes Heap-Limit zulässt). Jede Obergrenze ist ein validiertes `Config`-Feld mit Default: `cpuSeconds` (60), `maxWallMs` (600000), `addressSpaceMb` (512, wird auf Darwin nicht angewendet), `maxLogBytes` (65536), `maxValueBytes` (32768), `graceMs` (3000) und `pythonBin` (`python3`, beim Laden resolved, auf Ausführbarkeit geprüft, mit einer Fünf-Sekunden-Force-Kill-Deadline versions-gemessen und eingefroren). Jedes Kind erhält nur `TMPDIR`; Umgebungs-Credentials, `PATH`, `HOME` und sonstiger Host-Zustand bleiben unzugänglich.

### Der Wire

Frames reisen auf fd 3 des Kindes als JSON-lines — ein Objekt pro Zeile —, sodass stdout/stderr für die eigene Ausgabe des Programms frei bleiben. Kind → Host: `boot-ack`, `call`, `log`, `done`. Host → Kind: `boot` (erster Frame, trägt alle Obergrenzen und die Namensraumdeklarationen), `run` (nach `boot-ack`, trägt nur den Programmkörper) und ein `reply` pro `call`. Ein gefälschter Frame kann auf `done` sowohl `value` als auch `error` tragen, daher muss ein consumer zuerst `error` prüfen und `value` ignorieren, wenn es gesetzt ist. Das `open`-Flag eines `log`-Frames markiert eine unbeendete Zeile, die per explizitem flush committet wurde: Der Host hängt den nächsten log-Frame an denselben Eintrag, sodass `print('a', end='', flush=True); print('b')` als ein `'ab'`-Eintrag zurückkommt statt als falscher Zeilenumbruch (die Split-Billing-Arithmetik steht im Wire-Contract-Abschnitt der fd-3-Protokoll-Agent-Note). Die einzige Ausnahme vom Mergen ist die Truncation: Wenn ein späteres Over-Budget-Frame das Ledger auslöst, wird das bereits verrechnete Präfix als eigener Eintrag committet, und der Truncation-Marker folgt ihm (der Marker bleibt letzter, ohne Neuverrechnung).

### Was schiefgehen kann

Die host-seitige Validierung verwirft Müll ohne zu werfen, sodass ein malformed oder gefälschter Frame den Host-Prozess nie zum Absturz bringt: `validateChildFrame` gibt `undefined` für alles zurück, was sich nicht sauber neu bauen lässt, eine nicht-numerische call-id kann nie in ein reply zurückgespiegelt werden, und gefälschte Zusatzfelder reiten nie mit. Ein Abschlusswert, der kein lossless JSON ist oder das konfigurierte Byte-Budget überschreitet, wird explizit abgelehnt (`non-lossless` / `over-budget`) statt still gerundet oder abgeschnitten. Ein fd-3-Frame, dessen Rohlänge die effektive Frame-Parse-Obergrenze überschreitet (64 MiB, oder niedriger, wenn der konfigurierte Host-Heap einen nahe-am-Limit-Frame nicht sicher parsen kann — siehe `hostFrameParseCeiling`), lässt den Lauf als `worker-exit` abrechnen (der Empfangspfad begrenzt Roh-Frames vor `toString`/`JSON.parse`, sodass ein kompakter breiter Frame nicht zu weit mehr Host-Speicher dekodieren kann, als seine Wire-Bytes zuließen).

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Design hinter dem Backend; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig beschrieben.

### Designkonzept

Eine Vertrauensrichtung: Der Host behandelt jeden eingehenden Frame als feindlich (Modellcode kann auf fd 3 alles fälschen) und BAUT ihn Feld für Feld neu, bevor er ihn liest; die Python-Seite vertraut den Host-Antworten. Das Bootstrap (`py/bootstrap.py`) führt das Programm als Körper einer async-Funktion aus, sodass Top-Level-`await` und `return` funktionieren; binding-Aufrufe reisen über fd 3 als JSON-lines, und Antworten werden über die Pumpe geregelt, sodass eine Flut großer Antworten den fd-3-Schreibpuffer des Hosts nicht festnageln kann.

### Wire-Vertrag

Die Frames sind `boot` / `run` (Host → Kind) und `boot-ack` / `call` / `log` / `done` plus ein `reply` pro call (Kind → Host). Das `truncated`-Flag des `log`-Frames markiert den Frame, der DAS Truncation-Marker des Kind-Ledgers ist, sodass der Host an genau dem Punkt aufhört zu erfassen, an dem das Kind aufgehört hat, statt ihn aus seinem eigenen Budget zu erschließen. Das `open`-Flag des `log`-Frames markiert eine unbeendete Zeile, die per explizitem flush committet wurde: Der Host merged den nächsten log-Frame in denselben Eintrag, sodass `print('a', end='', flush=True); print('b')` als ein `'ab'`-Eintrag zurückkommt statt als falscher Zeilenumbruch (die Split-Billing-Arithmetik steht im Wire-Contract-Abschnitt der fd-3-Protokoll-Agent-Note). Die einzige Ausnahme vom Mergen ist die Truncation: Das bereits verrechnete Präfix wird als eigener Eintrag committet, und der Truncation-Marker folgt ihm (Marker zuletzt, keine Neuverrechnung). `done.error.kind` ist eines von `exception`, `invalid-output`, `output-limit`; Wall-/CPU-Budgets, Abbrüche und Substrat-Tod werden host-seitig beobachtet, nicht als Frames getragen.

### Lossless-JSON-Übergang

Abschlusswerte und binding-Argumente queren als exaktes JSON: Werte serialisieren ohne Rekursion, sodass ein tiefes Payload unter dem Byte-Budget überlebt statt am Stack-Limit von `JSON.stringify` zu sterben, und integrale Doubles jenseits des sicheren Bereichs queren als exakte Ziffern statt als still gerundete Tokens; die Meter in `src/protocol.ts` erzwingen Byte-Budgets und Zahlen-Losslessness, bevor irgendetwas anderes das Payload liest.

### Mirror-Abgleich

`tests/protocol-mirror.e2e.ts` spawnt ein echtes `python3` und asserted gegen `src/protocol.ts` sowohl `PROTOCOL_FD` / den Truncation-Marker-Text als auch den required/optional-Wire-Feldsatz jedes `TypedDict` in `py/protocol.py`, sodass ein umbenanntes oder fallengelassenes Feld — oder eine Seite, die ein Feld optional macht, das die andere erfordert — den Test scheitern lässt. Feld-*Typen* werden über die Sprachgrenze hinweg nicht verglichen; dieser Rest bleibt beim Review plus der Real-Subprozess-Suite des Backends (`tests/runtime.spec.ts`).

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `PythonCodeRuntime` — Spawn, Frame-Pumpe, Budgets, Containment, Teardown; re-exportiert das Protokollvokabular |
| [`src/protocol.ts`](src/protocol.ts) | Host-Seite: Frame-Codec, Hostile-Frame-Validatoren, Lossless-JSON-Meter, gemeinsamer Marker-Text |
| [`py/bootstrap.py`](py/bootstrap.py) | Kind-Seite: fd-3-Kanal, Programmausführung, binding-Dispatch, Ledger und Settlement |
| [`py/protocol.py`](py/protocol.py) | Python-Seite: `PROTOCOL_FD`, `TypedDict`-Frame-Mirrors, `log_truncation_marker` |
| [`tests/runtime.spec.ts`](tests/runtime.spec.ts) | Real-Subprozess-Suite: Budgets, Containment, Hostile-Frames, Namens-Rebinding |
| [`tests/protocol-mirror.e2e.ts`](tests/protocol-mirror.e2e.ts) | Sprachübergreifender Mirror-Test gegen ein echtes `python3` |
| — | Es wird kein Runtime-Invariant-Begleiter veröffentlicht: Frame-Reihenfolge, Budgetabrechnung und Teardown leben im CPython-Kind oder auf fd 3, sodass dieses Paket keine gleichprozessige Event-Sequenz oder unabhängig gepflegte mutable Relation freigibt, die ein Cordis-Listener vergleichen könnte; der Protokoll-Mirror und die Real-Subprozess-Tests decken diese Prozessgrenzen-Verhalten ab. |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese, wenn der runtime-Vertrag nicht ausreicht. Sie führen von der seam-Definition zum Designprotokoll und zum Companion-Backend.

- [Code-runtime-seam](../../code-runtime/code-runtime/README.de.md) — der abstrakte Vertrag, den dieses Backend implementiert.
- [fd-3-Protokoll-Agent-Note](../../../.agents/notes/implemented/architecture/2026-07-31-code-runtime-python-fd3-protocol.de.md) — Designrationale und Wire-Vertrag.
- [Settlement-Fixes-Agent-Note](../../../.agents/notes/archived/bug-fix/2026-07-31-code-runtime-python-settlement-fixes.md) — Settlement-, Metering- und Containment-Fixes und ihre Regression-Cases.
- [Worker-Thread-Backend](../../code-runtime/code-runtime-worker-thread/README.de.md) — das veröffentlichte TypeScript-Geschwister.
- [Code-runtime-Subsystem-Referenz](../../../docs/subsystems/code-runtime.de.md) — Request-/Result-Vokabular, bindings und Fehlertaxonomie.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über den PTC-Modus in `dsh-tools`, wenn eine explizite Source-Checkout-composition diesen provider mountet; er rendert den Abschlusswert oder Fehlschlag des Programms in ein retained `run_code`-Ergebnis, und kein ausgeliefertes Profil mountet dieses private Paket.

#### KV-Cache-Effekt

Keine direkte Invalidierung; der benannte consumer besitzt alle Request-Prefix-Änderungen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, was das Paket abdeckt und was nicht; es sind aktuelle Paketconstraints, kein Aufgabenstapel.

- **Der sprachübergreifende Guard deckt die ausgeführten Oberflächen und die Frame-Feldformen ab, nicht die Feldtypen** — das Mirror-e2e vergleicht required/optional-Feldsätze, nicht ob `cpuSeconds` auf beiden Seiten ein `int` ist; eine Drift auf Typebene fängt das Review plus die Real-Subprozess-Suite des Backends.
- **Ein Nachfahre, der der Prozessgruppe des Kindes mit `setsid()` entkommt, wird vom Gruppen-Teardown nicht eingesammelt** — `kill(-pid)` erreicht ihn nicht; der Lauf rechnet trotzdem mit dem Wert ab, den der done-Frame entschieden hat, und die Close-Deadline-Backstop erzwingt das Settlement, wenn der orphan die Pipes offen hält, aber der orphan selbst überlebt den fiber, bis er von selbst beendet.
- **Ein `log`-Frame, der nach dem Settlement ankommt, wird verworfen** — sobald der Lauf settled ist, ist die host-seitige Erfassung geschlossen; ein später fd-3-`log`-Frame (von einem Thread, der den done-Frame überlebt hat) wird verworfen statt an `logs` angehängt.
- **Ein binding-REPLY-Wert hat keine seam-Level-Byte- oder Tiefenobergrenze** — `maxValueBytes` misst nur den Abschlusswert des done-Frames; ein breites binding-reply wird host-seitig neu gebaut (`snapshotJsonValue`-Traversal) und ganz enkodiert, auf beiden Seiten nur durch den Prozessspeicher begrenzt (wie ein binding-Argument, das ebenfalls kein kindseitiges Budget hat).
- **Kein ausgeliefertes Profil mountet diesen provider** — der keyless `ptc-python-turn`-Snapshot ersetzt die headless-PTC-runtime durch den echten Loader; ausgelieferte Profile verwenden weiterhin das Worker-Thread-Backend.
- **Kanalübergreifende Log-Verschachtelung ist backend-abhängig** — Python-stdout, -stderr und fd-3-log-Frames reisen unabhängig; jeder Kanal bewahrt seine eigene Reihenfolge, während ihre Gesamtreihenfolge in `result.logs` abweichen kann.
- **CPython 3.10 oder neuer ist erforderlich** — das konfigurierte Executable wird beim Laden resolved und versions-gemessen; nicht unterstützte Interpreter scheitern, bevor `ctx.codeRuntime` registriert wird.
- **Der Truncation-Marker-Text und das Tempdir-Präfix behalten die Kurznamen vor der Umbenennung** — der Marker `[dsh-code-runtime-python] log capture truncated at <N> bytes` und das `dsh-code-runtime-python-`-Tempdir-Präfix sind byte-ankernd durch Tests und unabhängig vom npm-Paketnamen; die Promotion (Weglassen des `experimental-`-Präfixes) benennt sie nicht um.
- **`run()` ist one-shot** — `logs` stehen erst zur Verfügung, nachdem `CodeRunResult` resolved ist; es gibt kein Streaming-Log- oder Fortschritts-Interface für die Ausgabe eines laufenden Programms.
- **Über Läufe hinweg bleibt kein Zustand erhalten** — jede Anfrage läuft in einem frischen Subprozess; ein persistenter REPL-artiger Kernel bleibt zurückgestellt, bis ein Backend sein eigenes Log-Schema mitbringt.
- **Ein fd-3-Frame, dessen Rohlänge die effektive Frame-Parse-Obergrenze überschreitet, lässt den Lauf als worker-exit abrechnen** — die Obergrenze ist 64 MiB oder niedriger, wenn der konfigurierte Host-Heap einen nahe-am-Limit-Frame nicht sicher parsen kann (`hostFrameParseCeiling`); `maxLogBytes`/`maxValueBytes` sind beim Laden auf dieselbe Obergrenze begrenzt, sodass die Frames eines ehrlichen Kindes immer passen; ein modellkonstruiertes binding-ARGUMENT über der Obergrenze (ein Wert ohne seam-Level-Budget) löst sie ebenfalls aus — ein akzeptierter Rest des OOM-Guards.
- **Ein Kind, das seine Antworten nicht mehr liest, lässt den Lauf als worker-exit abrechnen, sobald der Reply-Backlog 1024 Frames überschreitet** — der Host schreibt Antworten eine nach der anderen und wartet auf `drain`, wenn die Pipe voll ist; ein Kind, das weiter Calls sendet, ohne Antworten zu konsumieren, würde den retained Backlog (und die binding-Ergebnisse, die er festnagelt) sonst bis zur Wall-Clock wachsen lassen, daher lässt die Backlog-Obergrenze den Lauf vorzeitig scheitern. binding-Ergebnisse tragen keine seam-Level-Byte-Obergrenze, also ist dies eine Zähl-, keine Byte-Obergrenze.
- **Ein Kind, das Calls gegen ein binding flutet, das nie settled, lässt den Lauf als worker-exit abrechnen, sobald 1024 Calls in Flight sind** — binding-Calls werden vor dem Dispatch gezählt und beim Settle des async-Körpers freigegeben; ein binding, dessen Promise nie resolved, würde sonst pro Call-Frame eine async-Closure bis zur Wall-Clock ansammeln. Wie beim Reply-Backlog ist dies eine Zähl-, keine Byte-Obergrenze.
- **Eine kombinierte Log-und-Wert-Spitze wird vom Load-Gate nicht modelliert** — ein Modell-Daemon-Thread, der weiter schreibt, während der Abschlusswert gemessen und geframed wird, kann die beiden Spitzen so addieren, dass kein Gate sie zulässt oder ablehnt; der Lauf stirbt als `worker-exit`, das Containment hält, und nur die Fehlerklassifikation ist degradiert.
- **Ein 1-Sekunden-Dual-Limit-`ulimit -t 1`-CPU-Überlauf wird als `worker-exit` gemeldet, nicht als Timeout** — startet der Host unter einem harten CPU-Limit gleich dem weichen und dieses Limit ist 1, kann `_clamped` das weiche nicht senken, der Kernel SIGKILLt die Busy-Loop, und SIGXCPU wird nie zugestellt; das Containment hält, nur die Klassifikation ist degradiert.
- **Keine Byte-Obergrenze für Zwischen-binding-Werte** — die Implementierung bleibt durch die Lossless-JSON-Serialisierungskosten und den Prozessspeicher begrenzt, und ein provider oder executor kann sein eigenes Fetch-Limit anwenden.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
