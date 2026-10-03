# Agent Note: das code-runtime-python-fd-3-frame-Protokoll

Status: implemented

Der CPython-code-runtime liegt nun unter `packages/experimental/code-runtime-python` (private, npm-Name `@deepseek-ai/dsh-experimental-code-runtime-python`); die Beförderung zu einem released package folgt der experimental-packages-Entscheidung.

[English](2026-07-31-code-runtime-python-fd3-protocol.md) | [中文](2026-07-31-code-runtime-python-fd3-protocol.zh.md) | Deutsch

## Problem

`@deepseek-ai/dsh-experimental-code-runtime-python` besitzt das wire-Protokoll, das für einen CPython-code-runtime-provider gedacht ist. Ein solcher provider führt jedes model-Programm in einem frischen `python3 -I`-subprocess aus und brückt binding-calls und completion-Werte über fd 3 des childs. Der host kann diesem channel nicht trauen: model-code hat vollen Zugriff auf fd 3 und kann jeden frame fälschen, sodass jeder eingehende frame hostile input ist, den der host validieren und neu aufbauen muss, bevor er ihn liest. Das Protokoll muss außerdem lossless JSON ohne das depth-Limit tragen, das `JSON.stringify` und `json.dumps` auferlegen, weil der `CodeJsonValue` der seam depth-unbegrenzt ist.

Das private experimentelle Paket enthält sowohl die Protokoll- als auch die runtime-Implementierung: `PythonCodeRuntime` (der default-export des plugins), der `python3 -I`-subprocess-Pfad und der Python-seitige JSON-codec liegen alle in `@deepseek-ai/dsh-experimental-code-runtime-python`. Das Protokoll baut auf der [portable-identifier-seam](../../archived/architecture/2026-07-31-code-runtime-portable-identifier-seam.md) auf.

## Entscheidung

`src/protocol.ts` ist die host-Seite des wire-Vokabulars und sein hostile-frame-codec:

- **`validateChildFrame`** shape-validiert und BAUT jeden eingehenden frame NEU auf. Die compile-time-union bedeutet auf fd 3 nichts — ein gefälschter frame kann `null`, vergiftete Felder tragen oder erforderliche weglassen — also wird jeder akzeptierte frame Feld für Feld rekonstruiert: gefälschte extras reiten nie mit, eine nicht-endliche call-id kann nie in eine reply geechot werden, und Müll gibt `undefined` zurück, um verworfen zu werden, statt im message-handler des hosts zu werfen.
- **`encodeJsonPlain` / `checkDoneValue` / `hasUnsafeIntegerToken` / `hasNonLosslessNumber`** sind der lossless-JSON-codec und seine meters. Sie traversieren iterativ (ein expliziter stack, keine Rekursion), sodass ein tiefes value unter dem byte-budget intakt hinüberkommt; `checkDoneValue` faltet byte-metering und number-losslessness in einen walk, der eine über-budget-payload vor der inkrementellen Arbeit ablehnt, die sie sonst hinzufügen würde — die gequeueten children; strings und keys werden durch einen nicht-allozierenden escaped-size-scan (`jsonStringBytesUpTo`) gemessen, sodass die escaped Kopie nie materialisiert wird. Er begrenzt die eigene Breite des frames nicht neu: `done.value` ist bereits `JSON.parse`'d, wenn der check läuft, sodass eine konsumierende runtime fd-3-bytes vor dem Parsen deckeln muss. Beyond-safe-range-integral-doubles serialisieren über `BigInt`-Ziffern, sodass der exakte integer hinüberkommt, nicht `String()`s gerundete Form.
- **`logTruncationMarker`** erzeugt den in-band-marker-Text, den ein log-ledger emittiert, wenn es sein byte-budget erschöpft.

`py/protocol.py` spiegelt die message-shapes als `TypedDict`s und deklariert die zwei surfaces neu, gegen die beide Seiten AUSFÜHREN — `PROTOCOL_FD = 3` und `log_truncation_marker` — mit byteweise identischem Text.

Das Paket liefert die runtime neben dem Protokoll aus; es bleibt unabhängig buildbar. `check-workspace-constraints` liest jedes `packages/<group>/<pkg>/package.json` bedingungslos, während die coverage- und invariant-topology-checks das Paket ausüben, sobald sein Verzeichnis existiert.

## Wire-contract

Frames sind JSON-lines auf fd 3, ein Objekt pro Zeile, sodass stdout/stderr für den eigenen output des Programms frei bleiben. Child → host: `boot-ack`, `call`, `log`, `done`. Host → child: `boot` (erster frame), `run` (nach `boot-ack`) und eine `reply` pro `call`. Das `truncated`-flag des `log`-frames markiert den frame, der der eigene truncation-marker des child-ledgers IST, sodass der host am selben Punkt aufhört zu erfassen wie das child, statt ihn aus seinem eigenen budget abzuleiten. Das `open`-flag des `log`-frames markiert eine unterminierte Zeile, die durch einen expliziten flush committet wurde: der host hält sie und hängt den nächsten frame an denselben Eintrag, sodass ein expliziter flush gefolgt von mehr Text als eine Zeile statt als falsches newline zurückliest. Die eine Ausnahme ist truncation: wenn ein späterer over-budget-frame das ledger auslöst, wird das bereits verrechnete prefix als eigener Eintrag committet und der truncation-marker folgt ihm (marker zuletzt, keine Neuverrechnung). Die wire-Kosten des gemergten Eintrags werden genau einmal verrechnet, inkrementell über seine Fragmente auf beide Seiten verteilt (O(k) für k Fragmente, nie ein re-walk des gesamten Holds): das ERSTE Fragment zahlt die vollen JSON-string-Kosten plus den separator, jede Fortsetzung und der schließende frame zahlen nur ihren content; die exact-cost-caps des hosts sind `logBudget - 1` für ein erstes Fragment (das reservierte byte des ledgers, passend zu `admit`) und `logBudget + 2` für einen Fortsetzungs- oder schließenden frame (verrechnet ohne die zwei quotes), und `jsonStringCostUpTo` gibt `undefined` unter einer 2-byte-cap zurück; das child keyed seine geteilte Verrechnung allein auf `_open_started`, sodass ein schließender frame als gemergter tail verrechnet. `done.error.kind` ist eines von `exception`, `invalid-output`, `output-limit`; wall/CPU-budgets, aborts und substrate-Tod werden host-seitig beobachtet, nicht als frames getragen.

## Mirror-Ausrichtung

`py/protocol.py` und `src/protocol.ts` stimmen darin überein, dass `LogMessage` `truncated` trägt, `DoneMessage.error` `kind` trägt und `Namespace` `errorClass` tragen darf. `tests/protocol-mirror.e2e.ts` spawned ein echtes `python3` und assertiert `PROTOCOL_FD`, `log_truncation_marker` und die required- und optional-wire-Feldmengen jedes `TypedDict` gegen `src/protocol.ts`. Ein umbenanntes oder fallengelassenes Feld oder ein required/optional-mismatch lässt den Test fehlschlagen. Feld-*Typen* werden über die Sprachgrenze nicht verglichen; review und die real-subprocess-suite der runtime (`runtime.spec.ts`) besitzen diese Lücke.

## In Betracht gezogene Alternativen

**Von einem zukünftigen Python-JSON-codec (`_encode_json_plain` / `_decode_json_plain`) verlangen, für cross-side-Symmetrie mit `protocol.ts` in `py/protocol.py` zu leben.** Abgelehnt. Die Regel des repositories "prefer symmetry for parallel values" zeigt auf genuin parallele Werte; diese sind es nicht. Der host-seitige codec in `protocol.ts` validiert hostile input und ist in sich geschlossen. Ein child-seitiger codec würde trusted output produzieren und zu bootstrap-owned-Emission und Kostenverrechnung gehören; nur seine Einstiegspunkte in `protocol.py` zu zwingen würde den Vokabular-mirror an runtime-internals koppeln oder einen import-Zyklus erzeugen. `protocol.py` bleibt ein reiner wire-Vokabular-mirror; der codec (`_encode_json_plain` / `_decode_json_plain`) lebt in `bootstrap.py` bei der runtime, die er bedient.

**Die Protokolldateien außerhalb eines buildbaren Pakets halten, bis eine runtime ausgeliefert wird.** Abgelehnt: die workspace-constraint-, coverage- und invariant-topology-checks verlangen, dass jedes Verzeichnis unter `packages/<group>/<pkg>` ein buildbares Paket ist, und das Protokoll hat unabhängige Tests und ein öffentliches wire-Vokabular.

## Konsequenzen

Gekauft: das fd-3-Protokoll und sein hostile-input-codec bilden eine in sich geschlossene, vollständig unit-abgedeckte Schicht mit einer ausführenden guard gegen TypeScript/Python-field-set-drift. Die darauf gebaute runtime (`bootstrap.py`) konsumiert den reviewten wire-contract.

Kosten: der Paketname bezeichnet eine Python-runtime-Familie, und `src/index.ts` exportiert die volle `PythonCodeRuntime`-Implementierung, sodass das Protokoll-Vokabular nur ein Teil der Paketoberfläche ist. Der mirror-e2e vergleicht Feldnamen und required/optional-Status über die beiden Seiten, aber nicht Feldtypen; Typdeklarationen über TypeScript und Python zu vergleichen hat kein mechanisches Äquivalent, sodass review und die real-subprocess-suite der runtime diese Verantwortung behalten.
