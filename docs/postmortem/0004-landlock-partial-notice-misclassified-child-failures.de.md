# Postmortem 0004: Landlock-Teildurchsetzungs-Hinweis fehlklassifizierte Child-Fehler

[English](0004-landlock-partial-notice-misclassified-child-failures.md) | [中文](0004-landlock-partial-notice-misclassified-child-failures.zh.md) | Deutsch

Status: gelöst

## Executive summary

Auf Kerneln mit älterer Landlock-ABI gibt der Launcher vor der Ausführung jedes Child-Prozesses einen harmlosen Hinweis zur teilweisen Durchsetzung aus. Die Harness behandelte das gemeinsame `landlock-run:`-Präfix plus einen beliebigen Nonzero-Child-Exit als Launcher-Fehler, sodass gewöhnliche Ergebnisse wie ripgreps Exit 1 für keine Treffer als `SANDBOX_UNAVAILABLE` gemeldet wurden; die damals bash-basierte Dateisystemsuche versteckte diesen strukturierten Fehler zusätzlich hinter `SEARCH_FAILED`. Zu breite Signatur-Regeln und fehlende Partial-ABI-Kompositions-Abdeckung ließen den Defekt durch. Die Runner-Klassifizierung erfordert jetzt status-gegate tödliche Evidenz nach exakten informativen Ausschlüssen, und ein assembliertes keyloses Szenario pinnt den verbleibenden bash-Pfad. Die Dateisystemsuche verwendet paketiertes ripgrep über die subprocess-seam und kreuzt nicht sandboxed bash.

## Summary

Der native Launcher-Vertrag unterscheidet zwei Arten von stderr-Zeilen. Ein teilweise durchsetzender Kernel gibt exakt `landlock-run: partial enforcement (older Landlock ABI)` aus und fährt mit dem Child fort. Ein Launcher-Fehler gibt eine weitere `landlock-run:`-Zeile aus und beendet sich mit Exit 125, ohne das Child auszuführen.

Die Harness stellte beide mit einem case-insensitiven `landlock-run: `-Substring dar. Ihr Consumer klassifizierte jeden Nonzero-Exit, der diesen Substring trug, als Runner-Fehler. Der Status des Child wurde daher dem informativen Hinweis des Launchers zugeordnet: `false`, ripgreps No-Match-Exit 1, Invalid-Pattern-Exit 2 und sogar ein vom Child gewählter Exit 125 konnten dem Sandbox trotz erfolgreicher Confinement und Ausführung zugeschrieben werden.

Zum Zeitpunkt des Vorfalls erzeugte die Dateisystemsuche einen zweiten Attributions-Fehler. Ihre bash-basierte `runRipgrep()` fing jeden abgelehnten bash-Lauf, der nicht abgebrochen wurde, ab und ersetzte ihn durch ein generisches cwd/Shell-Start-`SEARCH_FAILED`, einschließlich des strukturierten `SandboxUnavailableError`, das der Sandbox-Executor produzierte.

## Impact

Auf Partial-ABI-Landlock-Hosts konnten legitime Nonzero-Child-Ergebnisse als Sandbox-Infrastruktur-Fehler erscheinen. `glob` und `grep` waren besonders sichtbar, weil ripgrep Exit 1 als erfolgreiche leere Suche verwendet. Wenn ein echter Sandbox-Fehler durch die Dateisystemsuche auftrat, verloren Aufrufer dessen `SANDBOX_UNAVAILABLE`-Code und erhielten eine falsche Start-Diagnose.

Der Defekt schwächte weder Confinement noch führte er einen Befehl unconstrained aus. Seine Sicherheitswirkung war Verfügbarkeit und Diagnose-Integrität: ein gültiges confined Ergebnis wurde abgelehnt oder falsch markiert.

## Timeline

- Der native Launcher-Vertrag definierte Exit 125 für Launcher-Fehler, eine tödliche `landlock-run:`-Zeile für jeden solchen Fehler und den exakten Partial-Enforcement-Hinweis für erfolgreiche Child-Ausführung.
- Der Sandbox-Provider reduzierte diesen Vertrag auf `runnerFailureSignatures: ['landlock-run: ']`; der bash-Consumer kombinierte das Präfix mit einem beliebigen Nonzero-Exit und meldete die erste stderr-Zeile.
- Unit-Tests deckten saubere Erfolge, Denial-Diagnosen und tödliche Runner-Präfixe ab. Real-Runner-Tests self-skipped ohne einen verwendbaren Kernel und erzwangen nicht Partial-Enforcement gefolgt von einem Nonzero-Child.
- Ein minimaler POSIX-Wrapper, der den Hinweis ausgibt und sein Payload `exec`t, reproduzierte den Fehler mit `false` und ripgrep No-Match.
- Strukturierte Regeln plus gemeinsame Foreground/Background-Klassifizierung und assemblierte Replay-Abdeckung schlossen die verbleibende Sandbox-Attributions-Lücke. Die Dateisystemsuche verwendet paketiertes ripgrep über `ctx.subprocess`; der Fix lässt diesen Pfad außerhalb sandboxed bash.

## Root cause

Der öffentliche Sandbox-Ergebnistyp konnte nur eine Menge von Substrings ausdrücken. Er konnte nicht aussagen, dass Landlock-Fehler Exit 125 erfordert, dass Evidenz innerhalb einer tödlichen Zeile auftreten muss, oder dass eine exakte Zeile unter demselben Präfix informativ ist. Der boolesche Consumer verband folglich unabhängige Fakten aus verschiedenen Prozessen und wählte die erste stderr-Zeile als Detail, selbst wenn eine spätere Zeile die tödliche Evidenz war.

Die Test-Matrix spiegelte diese Darstellung. Fake-Provider emittierten entweder keine Runner-Zeile oder ein eindeutig tödliches Präfix; sie emittierten nie eine harmlose Runner-Zeile vor einem Child-kontrollierten Nonzero-Exit. Real-Landlock-Abdeckung hing vom Host-ABI ab, sodass Full-ABI-Hosts den Hinweis nicht exerciseieren konnten. In der zum Vorfallzeitpunkt aktuellen Such-Implementierung modellierten Dateisystemsuche-Tests rohe Spawn-Fehler, aber keinen strukturierten Fehler, den die echte sandboxed-bash-Komposition warf.

stderr bleibt ein In-Band-Attributions-Kanal. Ein confined Child kann absichtlich die gegatete tödliche Zeile und den Exit-Status eines Runners reproduzieren, was eine Verfügbarkeits-/Diagnose-Fehlattribution verursacht. Die engere Konjunktion verhindert die versehentliche Kollision in diesem Vorfall, authentifiziert aber nicht den Schreiber; ein Out-of-Band-Status-Protokoll bleibt separates Hardening, kein Sandbox-Bypass-Fix.

## Hinzugefügte Guardrails

- [`RunnerFailureRule`](../subsystems/sandbox.de.md#wrapped-argv-and-classification-dialects) trägt optionale erlaubte Exit-Codes, case-insensitive Per-Line-tödliche Signaturen und case-insensitive exakte informative-Zeilen-Ausschlüsse.
- [`dsh-sandbox-local`](../../packages/sandbox/sandbox-local/) mappt Landlock auf Exit 125 plus eine Nicht-Hinweis-`landlock-run:`-Zeile, während bwrap, Seatbelt und Custom-Runner signatur-only bleiben.
- [`dsh-bash-sandbox`](../../packages/shell/bash-sandbox/) spawnt die Provider-argv direkt, sodass eine Pre-Start-Ablehnung den Spawn-Error-Kanal statt lokalisierter Shell-Diagnosen verwendet. Abgewickelte Foreground- und Background-Ausführung teilen einen Evidenz-returnierenden Klassifizierer; tödliche Evidenz rangiert über Denial, und Foreground-Fehler melden die gematchte tödliche Zeile, ohne captured stderr zu ändern.
- [`dsh-tool-fs-search`](../../packages/fs/tool-fs-search/) verwendet paketiertes ripgrep über `ctx.subprocess` und bleibt außerhalb der sandboxed-bash-seam.
- Die Native-Boundary-Regression-Fälle leben in [`partial-landlock.spec.ts`](../../packages/shell/bash-sandbox/tests/partial-landlock.spec.ts), einschließlich informativer Hinweise, tödlicher Evidenz und Foreground/Background-Klassifizierung.
- Der assemblierte Produkt-Pfad wird durch die [`partial-landlock`-Snapshot-Komposition](../../snapshots/session/partial-landlock-child-failure/cordis.snapshot.yml) gepinnt, unabhängig von Dateisystemsuche-Implementierungsentscheidungen.

## Lessons

- Prozess-Attribution erfordert eine Konjunktion unabhängiger Evidenz; ein gemeinsames Präfix ist kein Protokoll.
- Informativ- und tödlich-Diagnosen können einen Namespace teilen, sodass Ausschlüsse exakt und eng sein müssen, während unbekannte tödliche Zeilen fail-closed bleiben.
- Ein Adapter muss strukturierte Fehler der darunterliegenden seam bewahren, statt sie durch seine eigene nächstgelegene generische Kategorie zu ersetzen.
- Plattform-abhängiges Verhalten benötigt einen deterministischen Fake an der nativen Boundary plus einen assemblierten Produkt-Pfad; ein self-skipping Real-Kernel-Test kann diese Regression nicht allein tragen.
