# Das Web UI verwenden

[English](index.md) | [中文](index.zh.md) | Deutsch

Starte das Web UI über die [Wurzel-README](../../../README.de.md#run); der Befehl gibt seine URL aus. Dieser Leitfaden setzt an dem Punkt ein, an dem der Server läuft. Der `dsh`-Prozess verwendet sein Startverzeichnis als Standard-Dateisystemposition; ein frisches Web UI hat jedoch keinen ausgewählten Workspace, bis du einen hinzufügst.

## Ein Modell konfigurieren

Öffne **Settings → Models**, gib einen [DeepSeek API-Key](https://platform.deepseek.com/) ein und speichere ihn. Die Modell-Route ist sofort verwendbar, ohne den Server neu zu starten.

Der [Modell-Konfigurationsleitfaden](./providers.de.md) behandelt weitere Provider und eigene OpenAI-kompatible Endpoints.

## Einen Workspace wählen

Klicke **Choose workspace**, füge das Projektverzeichnis hinzu, in dem du `dsh` gestartet hast, und wähle es aus. Der Session-Composer bleibt unavailable, bis ein Workspace ausgewählt ist.

## Eine Aufgabe ausführen

Starte eine Session und sende:

> Summarize this repository and identify its main packages.

Der agent kann Workspace-Dateien lesen und bearbeiten, Befehle ausführen, Arbeit delegieren und einen Plan pflegen. Das Web UI fragt nach, bevor Operationen ausgeführt werden, die unter der aktiven Permission-Policy eine Freigabe erfordern.

## Weiter

- [Modelle konfigurieren](./providers.de.md)
- [Das Python-SDK verwenden](./python-sdk.de.md)
- [Andere CLI-Modi verwenden](../../../apps/cli/README.de.md)
- [Ein Plugin entwickeln](../develop/basic/index.de.md)
