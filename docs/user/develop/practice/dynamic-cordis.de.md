# Einen laufenden agent mit Cordis tools erweitern

[English](dynamic-cordis.md) | [中文](dynamic-cordis.zh.md) | Deutsch

Dieser Praxisleitfaden aktiviert [`@deepseek-ai/dsh-tool-cordis`](../../../../packages/extensions/tool-cordis/README.de.md). Der agent kann seinen aktuellen Cordis-Prozess inspizieren und vom model erstellte plugins im Speicher mounten oder unmounten. Temporäre plugins verschwinden beim Unmounten oder beim Beenden des Prozesses und können andere sessions im selben Prozess beeinflussen.

## Ausführen

Die Browser-Oberfläche mit dem eingecheckten overlay starten:

```sh
pnpm dsh web --patch apps/cli/config/examples/cordis/cordis.yml
```

Der Befehl erfordert ein model credential. Die [Cordis tool-Referenz](../../../../packages/extensions/tool-cordis/README.de.md) definiert die tool-Argumente, die Lebensdauer, das Cleanup und die Sicherheitsverträge.
