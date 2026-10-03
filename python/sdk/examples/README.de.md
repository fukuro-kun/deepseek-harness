# Python-SDK-Beispiel
[English](README.md) | [中文](README.zh.md) | Deutsch


Ausführbares Python-SDK-Beispiel über den einzigen Applikations-Launcher `dsh --profile sdk-minimal`. Der Python-Client besitzt JSON-RPC-stdio; das Profil besitzt die agent-Komposition, Persistenz, Execution-Policy und Plugins.

## Den minimalen agent ausführen

Installiere `deepseek-harness-sdk`, exportiere ein Modell-Credential und gib anschließend ein isoliertes Harness-Home und einen Workspace an:

```sh
export DEEPSEEK_API_KEY=sk-your-key-here
python python/sdk/examples/minimal.py \
  --dsh-home /absolute/path/to/example-dsh-home \
  --workspace /absolute/path/to/disposable-workspace \
  --session-id example-001 \
  "Inspect the repository and fix the failing tests."
```

Setze `DEEPSEEK_BASE_URL` für einen kompatiblen Proxy, `DSH_MODEL` für das Default-Modell des Skripts oder `DSH_SYSTEM_PROMPT` für die Deployment-Persona. `--model` ist die einzige Runtime-Modellauswahl; keine passende Environment-Variable ist erforderlich. `--profile` kann ein anderes SDK-servierendes Profil wählen. Das gewählte Home speichert das erzeugte `sdk-minimal`-Profil und unkomprimierte JSONL-Session-Logs unter `sessions/`; das Skript liest niemals implizit `~/.dsh`.

Das ausgelieferte [`@deepseek-ai/dsh-sdk-minimal`-Bundle](../../../packages/bundle/sdk-minimal/README.de.md) ist der vollständige explizite Cordis-Baum für diesen Modus. Es exponiert exakt:

- owner-scoped persistent `bash` unter Linux/macOS oder `pwsh` unter Windows

Das Bundle enthält `dsh-base` nicht, sodass jede zusätzliche Row eine explizite Profiländerung ist. Runtime-Kontext, Dateisystem-Tools, lokale Instruction-Discovery, Compaction, Settings, verwaltete Credentials, Telemetrie, Web-Tools, subagents und der vollständige Default-Tool-Satz fehlen. Der Baum behält SDK-Startup und JSON-RPC-Serving, einen per Umgebung konfigurierten DeepSeek-Adapter, lokale Ausführung und JSONL-Persistenz.

Die persistente PTY kann jeden für den Runtime-Prozess erreichbaren Pfad verändern — verwende daher einen Wegwerf-Checkout oder Container.

## Plugins hinzufügen

Verwende den `dsh`-Befehl des Runtime-Wheels gegen dasselbe explizite Home für persistente Profiländerungen:

```sh
export DSH_HOME=/absolute/path/to/example-dsh-home
dsh plugin --profile sdk-minimal add file:/absolute/path/to/my-plugin-bundle
```

Verwende in diesem Befehl `sdk-minimal`, um dieses Beispiel zu erweitern, oder `sdk`, um das vollständige, auf base gestützte SDK-Profil zu erweitern. Der Python-Aufruf kann in `patches=(...)` zusätzlich absolute Patch-Pfade übergeben; spätere Dateien gewinnen. Ein gewähltes Profil muss `@deepseek-ai/dsh-sdk-app` oder eine andere JSON-RPC-Server-Row behalten. Das Beispiel akzeptiert weder eine vollständige Cordis-Datei noch beliebige Prozess-argv.

Dasselbe Runtime-Wheel paketiert das `web`-Profil samt Frontend-Assets für die direkte CLI-Nutzung: `dsh web` startet diese separate Applikation. Ein Python-SDK-Client kann `web` nicht wählen, weil es keine JSON-RPC-Server-Row hat.

Siehe das [Python-SDK-Tutorial](../../../docs/user/guide/python-sdk.de.md) und die [SDK-Referenz](../README.de.md).
