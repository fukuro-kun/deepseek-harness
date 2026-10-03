# Agent Note: Warten auf die Windows-Python-Konsolenlaufzeit
[English](2026-09-06-windows-python-console-spawn-wait.md) | [中文](2026-09-06-windows-python-console-spawn-wait.zh.md) | Deutsch

Status: implemented


## Problem

Der installierte Python-Konsolenbefehl `dsh.exe` beendet sich intermittierend mit der Windows-Zugriffsverletzung `0xc0000005`, bevor ein Profil initialisiert wird. Seine Smoke-Assertion ließ den Prozessstatus aus und meldete nur leere Streams. Eine [native faulthandler-Sonde](https://github.com/deepseek-harness/deepseek-harness/actions/runs/34030851888) lokalisiert den Fehler in Python-3.10-`os._execvpe`, aufgerufen durch den Runtime-Konsoleneinstieg, und nicht in der gebündelten Node-Executable. Direkte Executable-Kontrollen bestehen.

## Entscheidung

Der [Python-Konsoleneinstieg](../../../../python/sdk-runtime/src/deepseek_harness_runtime/__init__.py) verwendet unter Windows `subprocess.run`, erbt Standard-Streams und Umgebung, wartet auf den Abschluss der Laufzeit und beendet sich mit dem Laufzeitstatus. POSIX behält die Prozessersetzung per `os.execvpe`. Windows-CRT-exec ist keine POSIX-Prozessersetzung; der explizite spawn-and-wait-Pfad vermeidet die beobachtete native exec-Operation.

Der [Smoke-Test des installierten wheel](../../../../scripts/smoke-python-runtime.py) meldet beim Scheitern der Profilinstallation den dezimalen und den vorzeichenlosen 32-Bit-Hexadezimalstatus zusammen mit den erfassten Streams. Das bewahrt die Unterscheidung zwischen gewöhnlichem Befehlsfehler und nativen Prozessausnahmen.

## Erwogene Alternativen

**Node-Compile-Caching deaktivieren.** Nicht gewählt: Änderungen der Cache-Umgebung korrelierten bei frühen Sonden mit dem Ergebnis, doch auch Kontrollen mit kaltem Cache bestanden, und der Python-faulthandler lokalisiert den tatsächlichen Fehler am nativen exec-Aufruf. Die Cache-Konfiguration bleibt unverändert.

**Den installierten Konsolenbefehl wiederholen oder umgehen.** Abgelehnt, weil beides den Fehler des ausgelieferten Befehls maskiert, statt dessen Prozessstart zu reparieren. Die schlüssellose Assertion des installierten wheel bleibt erforderlich.

## Konsequenzen

Windows behält einen Python-Elternprozess, bis die Laufzeit endet; sie hängt nicht mehr vom CRT-Overlay-Verhalten ab. Die standardmäßige synchrone Subprozess-Implementierung besitzt Warten und Aufräumen bei Unterbrechung. Es wird kein eigener Prozessbaum-Manager und keine globale Host-Einstellung hinzugefügt.

[Runtime-Resolution-Tests](../../../../python/sdk/tests/test_runtime_resolution.py) behalten die POSIX-Weitergabe und decken Windows-Argument-/Umgebungsweitergabe, die Status 0/37/513, echten Kindprozess-Abschluss, Unicode-Streams und Argumente mit Leerzeichen ab. Der Fall des breiten Exit-Status gehört nativem Windows, weil POSIX Prozessstatus auf acht Bit kürzt. Der [native Vergleich mit fester Anzahl](https://github.com/deepseek-harness/deepseek-harness/actions/runs/34031142773) besteht alle vier gepatchten Starts mit aktiviertem Compile-Caching; alle vier ungepatchten Kontrollen bestehen in diesem Batch ebenfalls, daher ist es keine Reproduktion im selben Batch. Die vollständige installiertes-wheel-CI muss das finale Artefakt getrennt von lokalen Branch-Level-Tests validieren.
