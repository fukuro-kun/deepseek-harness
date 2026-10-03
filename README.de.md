# DeepSeek Harness
[English](README.md) | [中文](README.zh.md) | Deutsch


DeepSeek Harness (`dsh`) ist ein quelloffener Agent-Harness, entwickelt von [DeepSeek AI](https://deepseek.com).

Er basiert auf einer **Everything-is-a-Plugin**-Architektur und wird von [Cordis](https://github.com/cordiverse/cordis) angetrieben, dessen Design in [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512) beschrieben ist.

Dokumentation: [https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

## Developer-Preview

DeepSeek Harness befindet sich in _Developer Preview_ und entwickelt sich schnell weiter. **ES WIRD KOMPATIBILITÄTSBRECHENDE ÄNDERUNGEN GEBEN.**

Lies vor dem Ausführen des Projekts den [Sicherheitshinweis](SAFETY.de.md).

<a id="run"></a>
## Ausführen

### Ausführen über `npm`

Installiere `Node.js` und führe dann aus:

```sh
npx @deepseek-ai/dsh web
```

Der Befehl startet die Web-UI standardmäßig auf `http://127.0.0.1:3080` und öffnet sie beim lokalen Start im Standard-Browser. Bei einem Start über SSH wird nur die Host-URL ausgegeben, weil der SSH-Client oder Editor die lokal weitergeleitete Adresse besitzt. Mit `--no-open` läuft der Server, ohne einen Browser zu öffnen. Siehe [Web-UI-Anleitung](docs/user/guide/index.de.md).

### Aus dem Source-Checkout ausführen

Aus einem Repository-Checkout heraus:

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` erzeugt die Repository-Artefakte. `pnpm dsh web` nutzt diese gebauten Artefakte ohne erneutes Bauen.

## Community und Support

- Feedback oder Bug-Reports über [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) einreichen.
- Das Topic [`dsh-plugin`](https://github.com/topics/dsh-plugin) zum Plugin-Repository hinzufügen, damit es auffindbar ist.
- Der <a href="https://discord.gg/Ycq5dCaS4">DeepSeek Harness Discord-Community</a> beitreten.

## Mitwirken

Siehe [CONTRIBUTING.md](CONTRIBUTING.de.md).

## Entwicklung

Beginne mit dem [Development Guide](docs/development.de.md) und der [Architektur-Dokumentation](docs/architecture.de.md).

Für Agents gelten die Regeln in [AGENTS.md](AGENTS.md).

## Lizenz

[MIT](LICENSE)

Lizenzen von Drittanbieter-Abhängigkeiten sind in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) offengelegt.
