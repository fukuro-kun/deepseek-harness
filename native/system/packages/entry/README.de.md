---
description: "JavaScript-Einstieg für den vorgebauten Landlock-Launcher und asynchrones POSIX-flock."
kind: "package-library"
---
# @deepseek-ai/node-addon-system
[English](README.md) | [中文](README.zh.md) | Deutsch


Der `./landlock-run`-Einstieg exportiert den Landlock-Launcher-Pfad, die Enforcement-Probe, die Grant-Argumente und die Protokollkonstanten. Der unabhängige `./flock`-Einstieg exportiert `tryLockExclusive(fd): Promise<void>`; das Importieren eines der beiden Einstiege lädt `system.node` nicht. Das Paket hat keinen Root-Export.

Die Lock-Operation versucht `LOCK_EX | LOCK_NB` asynchron. Halte den aufrufereigenen Descriptor bis zum Abschluss offen; bei Konkurrenz wird mit `EAGAIN`/`EWOULDBLOCK` abgelehnt, andere Syscall-Fehler lehnen ebenfalls ab, und Fehler tragen ihren code, das positive errno und `syscall: 'flock'`. Fehler beim nativen Setup lehnen dasselbe Promise ab. Das Schließen des letzten Descriptors für die Open-File-Description gibt den Lock frei. Das Binding öffnet, dupliziert, schließt oder entsperrt keine Descriptors.

Optionale OS/CPU-Plattformpakete tragen die Binärdateien. Linux hat `bin/landlock-run` sowie getrennte `bin/glibc/system.node`- und `bin/musl/system.node`-Dateien; macOS hat `bin/system.node`. Fehlende oder nicht ladbare flock-Bindings lehnen die Acquisition ab, ohne Compilierung zur Installationszeit. Landlock bleibt ein separates Executable mit seinem bestehenden Fail-Closed-Protokoll; nicht unterstützte Kernel/Plattformen proben als unbrauchbar.

Die beiden C-Quellen werden zur Auditierbarkeit mitgeliefert. Siehe [Architektur](../../docs/architecture.md), [Support-Matrix](../../docs/support-matrix.md) und [CLI-Contract](../../docs/cli-contract.md) des Workspace.
