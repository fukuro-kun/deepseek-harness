# native/

[English](README.md) | [中文](README.zh.md) | Deutsch

Mit DeepSeek Harness gepflegte native Quellen und öffentliche Pakete. Der [`system/` Workspace](system/README.de.md) besitzt den Landlock-Launcher und das POSIX-flock-Binding, ihre Plattformpakete und den [Release-Prozess](system/docs/release.md).

## Workspace- und Release-Grenze

`system/` und seine Pakete gehören zum pnpm-Workspace und zur Lockfile des Repository-Stamms. Harness-Consumer verwenden in Entwicklung und CI das aktuelle Workspace-Entry-Package, sodass eine Änderung am Launcher-Contract und das zugehörige Consumer-Update gemeinsam landen und getestet werden können.

Der `Node Addon System`-Workflow des Haupt-Repositories baut und testet jede unterstützte Architektur. `Node Addon System Release` sammelt diese nativen Artefakte, packt und verifiziert die npm-Tarballs und veröffentlicht sie optional unter einer nativen Version. Das Entry-Package führt die Plattformpakete weiter als npm-Optional-Dependencies, sodass npm weiterhin nur das zum Betriebssystem und zur CPU des Nutzers passende Paket installiert.
