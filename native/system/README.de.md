---
description: "Vorgebaute Systemprimitive für Linux-Confinement und POSIX-Session-Schreiblocks."
kind: "package-library"
---
# @deepseek-ai/node-addon-system

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Verwende das Linux-Executable `landlock-run`, um Subprocesses zu confinen, oder den `./flock`-Einstieg, um einen POSIX-Schreiblock zu erwerben. Plattformpakete enthalten die vorkompilierten Binärdateien; die Consumer-Installation baut niemals nativen Code. Landlock-Policy und Session-Lifecycle verbleiben beim Aufrufer.

## Inhaltsverzeichnis

- [Verwendung](#use)
- [Support](#support)
- [Entwicklung](#development)

<a id="use"></a>
## Verwendung

`@deepseek-ai/node-addon-system/landlock-run` exportiert `launcherPath`, `probe` und `grantArgs` für Landlock. Executable-Name, Flags und Fehlersemantik sind im [CLI-Contract](docs/cli-contract.md) definiert.

Der [flock-Verhaltenscontract](docs/flock-contract.md) bildet Descriptor-, Prozess- und Advisory-Lock-Semantik auf unabhängige native Tests ab.

`@deepseek-ai/node-addon-system/flock` exportiert `tryLockExclusive(fd): Promise<void>`. Halte den Descriptor bis zum Abschluss offen. Die Acquisition verwendet einen nicht blockierenden exklusiven flock; bei Konkurrenz wird mit `EAGAIN` oder `EWOULDBLOCK` abgelehnt, und das Schließen des letzten Descriptors für die Open-File-Description gibt den Lock frei. Siehe das [Entry-README](packages/entry/README.de.md).

Das Importieren eines der beiden Einstiege lädt kein Addon. Ein fehlendes Landlock-Executable probt als unbrauchbar; ein fehlendes flock-Binding lehnt die Acquisition ab. Keiner der beiden Pfade kompiliert oder gewährt stillschweigend nicht unterstütztes Verhalten.

<a id="support"></a>
## Support

Linux-x64/arm64-Pakete enthalten das statische Landlock-Executable sowie separate `system.node`-Dateien für glibc und musl. macOS-x64/arm64-Pakete enthalten nur `system.node`. Landlock benötigt zusätzlich einen enforcing Linux-Kernel; Windows verwendet die bestehende Locking-Implementierung des Harness. Die [Support-Matrix](docs/support-matrix.md) nennt Builder und Verifikationsverantwortliche.

<a id="development"></a>
## Entwicklung

In diesem Verzeichnis baut `pnpm build:ts` den Einstieg, `pnpm build:native` die vom Host deklarierte native Payload und `pnpm build:test-oracle` eine unabhängige flock-Syscall-Fixture. Anschließend prüft `pnpm test` Einstieg, Lock, Packaging und verfügbares Kernel-Verhalten. Ein vollständiger Build unter Linux erfordert musl-gcc; macOS verwendet cc. Das Root-`pnpm run build:native-system` baut nur das Host-Addon für die Source-Tests.

[Architektur](docs/architecture.md), [Packaging](docs/packaging.md) und der [Release-Prozess](docs/release.md) besitzen Implementierungs- und Publikationsdetails.

### Dev Note

Keine.
