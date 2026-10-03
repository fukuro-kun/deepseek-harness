# Agent Note: Vorgefertigte System-Primitives

Status: implemented

[English](2026-09-07-prebuilt-system-primitives.md) | [中文](2026-09-07-prebuilt-system-primitives.zh.md) | Deutsch

## Problem

Die `fs-ext`-Abhängigkeit des JSONL-Writers kompilierte während der Installation beim Consumer ein NAN-Addon. Die Verfügbarkeit eines nativen Compilers und Änderungen der Node-Modul-ABI wirkten sich daher auf gewöhnliche Installationen aus, einschließlich Node 26. Das Repository pflegte bereits den Landlock-Launcher und dessen Veröffentlichungs-Workflow pro Plattform.

## Entscheidung

Die unabhängig versionierte `@deepseek-ai/node-addon-system`-Familie in [native/system](../../../../native/system/README.de.md) vertreibt die vorhandene `landlock-run`-Ausführungsdatei und ein stabiles Node-API-v8-Addon `system.node`. Die Plattform-Pakete wählen Betriebssystem und CPU aus; Linux führt getrennte Addon-Dateien für glibc und musl. macOS führt das Addon ohne Landlock-Ausführungsdatei. Weder das Einstiegs- noch die Plattform-Pakete kompilieren während der Installation.

Das Paket hat keinen Root-Export. Der JavaScript-Einstieg `./landlock-run` behält Landlocks API und [CLI-Protokoll](../../../../native/system/docs/cli-contract.md) bei. Der Einstieg `./flock` lädt sein Addon erst beim Aufruf von `tryLockExclusive(fd)`. Er führt `flock(fd, LOCK_EX | LOCK_NB)` in asynchroner nativer Arbeit aus und erfasst errno auf diesem Worker. Der Aufrufer besitzt den Descriptor bis zum Abschluss und gibt seine Sperre durch Schließen frei. Fehlende Bindings lassen die Acquisition fehlschlagen, statt eine ungeschützte Sperre zu gewähren.

Die [Session-Write-Lease-Entscheidung](../feature/2026-08-31-cross-process-session-write-lease.de.md) bleibt Eigentümerin von Acquisition-Timing, inode-Prüfungen, Close-Ownership und Crash-Semantik. Windows behält sein vorhandenes koffi-Semaphor. Der Browser-Worker ersetzt nur den flock-Subpath; er nutzt die unveränderte JavaScript-API `./landlock-run`.

Quell Builds kompilieren das Host-Addon explizit vor Repository-Tests und -Builds, die es benötigen. Die native CI baut die vollständige Plattform-Payload und testet dieselben Addon-Bytes über Node-Releases hinweg; Linux prüft zusätzlich die musl-Payload in Alpine. Der Plattform-Prepack weist fehlerhafte oder unvollständige Binärdateien zurück, und eine Offline-npm-Install-Probe prüft installierte Bytes und reales Sperrverhalten. Native [Tests](../../../../native/system/test/flock.test.js) decken Descriptor-/Prozess-Konflikte, Freigabe durch Schließen und Crash, unabhängige errno-Werte und Worker-Teardown ab.

## Betrachtete Alternativen

**NAN behalten und einen Build pro Node-ABI veröffentlichen.** Das behält eine Build-Matrix pro Node-Hauptversion für ein Binding, das nur stabile Node-API-Operationen benötigt. Das evaluierte `fs-ext-extra-prebuilt@2.2.14` wählte unter Node 26 ABI 147 eine Binärdatei für Node 25 ABI 141; sein Default-Install-Fallback beendete sich außerdem ohne zu bauen, wenn NAN gehoistet war.

**fs-ext in das Eltern-Tarball bündeln.** npm führt Installations-Hooks gebündelter Abhängigkeiten normalerweise weiterhin aus. Bündeln allein unterdrückt weder die Kompilierung noch macht es eine Binärdatei über Betriebssysteme, CPUs, libc-Implementierungen oder Node-ABIs hinweg portabel.

**flock durch OFD/fcntl-Sperren ersetzen.** Auf gewöhnlichen Linux-Dateisystemen schließen diese Sperren vorhandene flock-Inhaber nicht zwingend aus. Eine tmpfs-Probe ließ eine OFD-Sperre zu, während fs-ext flock hielt; dies ist also kein verhaltenserhaltender Ersatz.

**koffi für den POSIX-Aufruf verwenden.** Ein synchroner Aufruf ändert das Blocking-Verhalten der Event Loop; das Lesen von errno nach dessen asynchronem Callback liest den Wert des falschen Threads. Ein nativer Async-Work-Adapter hält Syscall-Ergebnis und errno zusammen, ohne eine weitere FFI-Koordinationsschicht.

## Konsequenzen

Die Familie besitzt ein kleines C-Binding, Plattform-Builds und die Verifikation installierter Artefakte statt einer gesamten Dateisystem-Erweiterungs-API. Node-API beseitigt die Anforderung einer Binärdatei pro Node-Hauptversion, nicht die Anforderungen an OS/CPU/libc. Das gemeinsame native Release enthält beide Fähigkeiten, aber das Importieren oder Verwenden der einen lädt die andere nicht. Landlock-Binärsemantik, Windows-Sperrung und veröffentlichte Session-Datenformate bleiben unverändert.
