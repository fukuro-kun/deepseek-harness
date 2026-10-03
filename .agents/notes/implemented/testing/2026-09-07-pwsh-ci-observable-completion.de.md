# Agent Note: PowerShell-CI-Abschluss und Profil-Erwartungen
[English](2026-09-07-pwsh-ci-observable-completion.md) | [中文](2026-09-07-pwsh-ci-observable-completion.zh.md) | Deutsch

Status: implemented


## Problem

Der [gehostete Coverage-Job](https://github.com/deepseek-harness/deepseek-harness/actions/runs/34033367752/job/101605386802) lehnt ein Send an eine persistente PowerShell ab, weil es `inferred_idle` statt `stdin_read` zurückgibt. Ausgabestille ist eine unterstützte, begrenzte Ableitung, kein Beweis dafür, dass ein Befehl abgeschlossen wurde. Der Real-Shell-Test sucht außerdem in der Ausgabe nach Text, der bereits im zurückgegebenen (echoed) Befehl steht, und kann die Ausführung damit nicht unabhängig beweisen.

Der [Snapshot-Job](https://github.com/deepseek-harness/deepseek-harness/actions/runs/34033367752/job/101605386868) lehnt beide PowerShell-Szenarien ab, obwohl `PWSH_OK` erfolgreich ausgegeben wurde. Ihre Fixtures lassen die Policy-Events und die Runtime-Kontext-Nachricht des Headless-Profils aus; ihre Prompt- und Tool-Schema-Pins beschreiben außerdem eine ältere, kleinere Komposition. Hosts ohne PowerShell überspringen diese Fälle und können diesen Drift nicht erkennen.

## Entscheidung

Der [Real-Shell-Test](../../../../packages/terminal/terminal-bash/tests/local.spec.ts) akzeptiert beide unterstützten Readiness-Stufen, lehnt Timeout- und Exit-Settlements ab und beobachtet formatierte Kind-Ausgabe im Scrollback, um Umgebungs-Persistenz, aktuelles Verzeichnis und Credential-Scrubbing zu beweisen. Der erwartete Text kommt im abgesendeten Befehl nicht vor. Eine Private-File-Barriere hält die Ausführung über das Silence-Settlement hinaus zurück und gibt sie erst frei, nachdem das nächste Send abgeschlossen ist — so wird bewiesen, dass spätere Ausgabe beobachtbar bleibt, ohne die produktiven Timings zu verlängern. Der Session-Dispose geht dem Entfernen des privaten Testverzeichnisses voraus.

Die [One-Shot-](../../../../snapshots/session/pwsh-tool-turn/snapshot.yml) und [Persistent-](../../../../snapshots/session/persistent-pwsh-tool-turn/snapshot.yml)Fixtures sowie die eigenen Header-Pins werden über das gebaute Headless-Profil mit einer echten PowerShell-Ausführungsdatei und aufgezeichneten Modellantworten erneuert. Policy-Events und verfügbare Tools bleiben in den Erwartungen sichtbar; Tool-Ergebnis und Schlussantwort bleiben `PWSH_OK` und `DONE`.

## Erwogene Alternativen

- Silence- oder Handoff-Timeouts erhöhen: Das ändert die Latenz, ohne exakte Readiness deterministisch zu machen. Die [Persistent-Terminal-Entscheidung](../feature/2026-07-16-persistent-pty-sessions.de.md) behält sowohl exakte als auch abgeleitete Ergebnisse.
- Beliebige Wartegründe akzeptieren, ohne die Ausführung zu beobachten: Zurückgegebene Eingaben und verzögerte Befehle könnten den Test fälschlich bestehen lassen.
- Policy-Events filtern oder geerbte Headless-Tools deaktivieren: Das verbirgt das assemblierte Profil, statt es zu testen. Die [Snapshot-Corpus-Entscheidung](2026-08-24-session-log-snapshot-corpus.de.md) hält persistierte Ausgabe und Header-Pins autoritativ.

## Konsequenzen

Der datei-gesteuerte Fall lehnt die Nur-exakt-Assertion deterministisch ab, während der reparierte Test die Wirkungen des Befehls nach einem abgeleiteten Settlement beweist. Für diesen Nachweis ist ein echtes PowerShell erforderlich; ein lokal übersprungener Lauf ist keine Validierung. Das gezielte Built-Replay prüft sowohl Session-Ausgabe als auch Header-Pins ohne Normalizer-Änderungen. Produktives Terminalverhalten, Timing-Konfiguration und CI-Routing bleiben unverändert.
