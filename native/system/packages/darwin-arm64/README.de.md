---
description: "Vorkompiliertes system.node für POSIX-Locks unter macOS arm64."
kind: "package-library"
---
# @deepseek-ai/node-addon-system-darwin-arm64

[English](README.md) | [中文](README.zh.md) | Deutsch

Dieses Plattform-Paket liefert `bin/system.node`, ein stabiles Node-API-v8-Addon, das von `@deepseek-ai/node-addon-system/flock` verwendet wird. Es enthält weder eine Landlock-Executable noch einen JavaScript-Loader oder ein Installations-Buildskript. Der native Workflow baut es unter macOS arm64 und verantwortet die Validierung des installierten Artefakts.
