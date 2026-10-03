---
description: "Vorkompilierter Landlock-Launcher und POSIX-flock-Addons für Linux x64."
kind: "package-library"
---
# @deepseek-ai/node-addon-system-linux-x64
[English](README.md) | [中文](README.zh.md) | Deutsch


Dieses Plattform-Paket enthält die statische musl-Executable `bin/landlock-run` sowie die Node-API-v8-Addons `bin/glibc/system.node` und `bin/musl/system.node`. Das Entry-Paket wählt das Addon passend zur libc des laufenden Node-Prozesses; die Landlock-Executable bedient beide libc-Systeme.

Das Paket enthält weder JavaScript noch ein Installations-Buildskript. Die Plattform-Prepack-Prüfung kontrolliert vollständige Payloads, ELF-Architektur, Node-API-Exporte und die Ausführbarkeit des Launchers; die Probe des installierten Artefakts prüft die Bytes und führt das native Verhalten aus. Siehe die [Support-Matrix](../../docs/support-matrix.md) des Workspace.
