# DeepSeek Harness Python SDK
[English](README.md) | [中文](README.zh.md) | Deutsch


Python-Pakete, um DeepSeek Harness als Subprocess zu steuern. Das Client-SDK kommuniziert über zeilenbasiertes JSON-RPC auf stdio mit der gebündelten Runtime.

## Pakete

| Verzeichnis | Dist / Modul | Rolle |
|---|---|---|
| [sdk](sdk/README.de.md) | `deepseek-harness-sdk` / `deepseek_harness` | High-level-Turn-API und Low-level-JSON-RPC-Client |
| [sdk-runtime](sdk-runtime/README.de.md) | `deepseek-harness-runtime-bin` / `deepseek_harness_runtime` | Gebündeltes `dsh`-CLI-Executable und native Sidecars |

## Verhalten

Das SDK startet die passende gebündelte `dsh --profile sdk`-Runtime, sofern der Aufrufer kein anderes `dsh`-Executable oder Profil wählt. Das ausführbare Minimalbeispiel wählt das ausgelieferte, eigenständige `sdk-minimal`-Profil; dieselbe Runtime paketiert auch `dsh web` samt Frontend-Assets für die separate CLI-Nutzung. Jeder Start erfordert ein explizit gewähltes Harness-Home; Python liest niemals implizit `~/.dsh`. Die [SDK-Referenz](sdk/README.de.md) und die [Runtime-Carrier-Referenz](sdk-runtime/README.de.md) besitzen Runtime-Auswahl, Profile, Patches und die Verwaltung externer Plugins.

## Contributor-Workflows

Die [Python-Contributor-Workflows](development.de.md) behandeln den Bau der Runtime-Artefakte, die Validierung der Pakete, die Entwicklung im Source-Modus und die Distribution.
