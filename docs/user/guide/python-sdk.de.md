# Erste Schritte mit dem Python SDK
[English](python-sdk.md) | [中文](python-sdk.zh.md) | Deutsch


Dieses Tutorial installiert das veröffentlichte Python SDK, führt das mitgelieferte eigenständige Minimal-Profil aus und zeigt, wie dasselbe `dsh`-Profil aus einem eigenen Programm heraus angepasst wird.

## Voraussetzungen

- Python 3.10 oder neuer
- Git
- Linux x64, Linux arm64, macOS 14 oder neuer auf arm64 oder Windows x64
- Ein DeepSeek-kompatibler API-Endpoint und Berechtigungsnachweis
- Ein isolierter Workspace und ein isoliertes Harness-Home

## SDK installieren

### Linux und macOS

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
python -m venv .venv
. .venv/bin/activate
python -m pip install deepseek-harness-sdk
```

### Windows PowerShell

```powershell
git clone https://github.com/deepseek-ai/deepseek-harness.git
Set-Location deepseek-harness
py -3.10 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install deepseek-harness-sdk
```

Die Installation umfasst ein passendes natives Runtime-Wheel und den `dsh`-Befehl. Der normale SDK-Betrieb benötigt kein System-Node.js. Repository-Mitwirkende, die die Artefakte bauen, sollten den [Python-Mitwirkenden-Workflow](../../../python/development.de.md) verwenden.

## Das eingecheckte Beispiel ausführen

Exportieren Sie den Berechtigungsnachweis und bei Bedarf einen kompatiblen Proxy-Endpoint:

### Linux und macOS

```sh
export DEEPSEEK_API_KEY=sk-your-key-here
# export DEEPSEEK_BASE_URL=http://127.0.0.1:8000/v1
```

### Windows PowerShell

```powershell
$env:DEEPSEEK_API_KEY = "sk-your-key-here"
# $env:DEEPSEEK_BASE_URL = "http://127.0.0.1:8000/v1"
```

Führen Sie eine Aufgabe mit expliziten Workspace- und Home-Pfaden aus:

### Linux und macOS

```sh
python python/sdk/examples/minimal.py \
  --workspace /absolute/path/to/disposable-workspace \
  --dsh-home /absolute/path/to/example-dsh-home \
  --session-id example-001 \
  "Inspect the repository and fix the failing tests."
```

### Windows PowerShell

```powershell
python python/sdk/examples/minimal.py `
  --workspace C:\work\disposable-workspace `
  --dsh-home C:\work\example-dsh-home `
  --session-id example-001 `
  "Inspect the repository and fix the failing tests."
```

Das Skript gibt die finale Assistant-Antwort aus. Das ausgewählte Home erhält das generierte `sdk-minimal`-Profil, die installierten Plugins und die unkomprimierten JSONL-Session-Logs unter `sessions/`. Das Beispiel und das SDK lesen `~/.dsh` niemals stillschweigend.

## Das SDK im eigenen Programm verwenden

```python
from pathlib import Path

from deepseek_harness import DeepSeekHarness

workspace = Path("/absolute/path/to/disposable-workspace").resolve()
dsh_home = Path("/absolute/path/to/example-dsh-home").resolve()
with DeepSeekHarness(
    provider="deepseek-official",
    model="deepseek-v4-flash",
    max_tokens=49_152,
    cwd=str(workspace),
    dsh_home=str(dsh_home),
    profile="sdk-minimal",
) as harness:
    result = harness.run(
        "Inspect the repository and fix the failing tests.",
        session_id="example-001",
    )

print(result.final_response)
```

Das SDK startet den gebündelten `dsh --profile sdk-minimal`-Prozess verzögert und verwendet ihn bis zum Context-Manager-Exit weiter. Das Profil, sein persistenter Patch, der Home-Patch und ein geordnetes `patches`-Tupel bilden gemeinsam die Anwendungskonfiguration. Es gibt keinen separaten Python-Runtime-Bin oder eine Complete-Config-Option.

## Plugins installieren oder definieren

Verwenden Sie `dsh plugin` für Abhängigkeiten und Bundle-Layer, die in diesem Home persistent sein sollen:

### Linux und macOS

```sh
export DSH_HOME=/absolute/path/to/example-dsh-home
dsh --profile sdk-minimal --dump-default-config >/dev/null
dsh plugin --profile sdk-minimal add file:/absolute/path/to/my-plugin-bundle
```

### Windows PowerShell

```powershell
$env:DSH_HOME = "C:\work\example-dsh-home"
dsh --profile sdk-minimal --dump-default-config | Out-Null
dsh plugin --profile sdk-minimal add file:C:/work/my-plugin-bundle
```

Der erste Befehl initialisiert das mitgelieferte eigenständige Profil. Der zweite leitet das Paketmanagement an `pnpm` weiter und zeichnet dann alle installierten Pakete auf, die eine `dsh.bundle`-Layer exportieren. Installieren Sie `pnpm` nur für diesen Verwaltungsbefehl; das Starten des installierten SDK benötigt es nicht. Bearbeiten Sie `$DSH_HOME/profiles/sdk-minimal/cordis.patch.yml` für persistente Konfigurationsänderungen oder übergeben Sie Patch-Dateien aus Python für Änderungen pro Start.

Ein anderes `profile` ist gültig, wenn es `@deepseek-ai/dsh-sdk-app` oder eine andere JSON-RPC-Server-Zeile enthält. Fehlende Server-Zeilen, ungelöste Plugins und ungültige Patches schlagen beim Start fehl, anstatt auf eine andere Zusammensetzung zurückzufallen.

<a id="opt-in-to-str_replace_editor"></a>
### `str_replace_editor` aktivieren

Die gebündelte Runtime enthält `str_replace_editor`, aber `sdk-minimal` lässt es im Standard-Cordis-Tree weg. Um es zu verwenden, speichern Sie diese Konfiguration als `editor.patch.yml`; `insert` fügt sowohl den Editor als auch den Dateisystem-Provider hinzu, den das Minimal-Profil nicht enthält:

```yaml
- insert:
    - id: fs-local
      name: '@deepseek-ai/dsh-fs-local'
      config:
        cwd: !!js process.cwd()
    - id: tool-str-replace-editor
      name: '@deepseek-ai/dsh-tool-str-replace-editor'
```

Übergeben Sie `patches=("/absolute/path/to/editor.patch.yml",)` beim Konstruieren von `DeepSeekHarness(profile="sdk-minimal", ...)`, oder legen Sie den Patch in `$DSH_HOME/profiles/sdk-minimal/cordis.patch.yml` ab, um die Konfiguration persistent zu machen. Beim nächsten Runtime-Start enthalten Modell-Anfragen `str_replace_editor` neben der persistenten Shell. Der lokale Dateisystem-Provider verwendet das Runtime-Arbeitsverzeichnis für relative Pfade; wie die Minimal-Shell schränkt er den Zugriff nicht auf dieses Verzeichnis ein. Für das Standard-`sdk`-Profil fügen Sie nur die Editor-Zeile ein, damit es den vorhandenen Dateisystem-Provider und die Policies verwendet.

## Das Minimal-Profil verstehen

| Eigenschaft | Wert |
|---|---|
| System-Prompt | `DSH_SYSTEM_PROMPT`, Fallback auf `You are a helpful software engineer assistant.` |
| Modell in `minimal.py` | `--model`, dann `DSH_MODEL`, dann `deepseek-v4-flash` |
| Modellseitiges Tool | Persistente `bash`-Shell auf Linux/macOS oder `pwsh` auf Windows |
| Shell-Timeout | 300 Sekunden |
| Runtime-Context und Compaction | Nicht vorhanden |
| Session-Persistenz | Unkomprimiertes JSONL unter `<dsh_home>/sessions` |

Das einzige Bundle des Profils fügt den vollständigen Tree über einer leeren Root ein und enthält kein `dsh-base`; spätere Basis-Profil-Tools können daher nicht implizit erscheinen. Es umfasst das SDK-Protokoll, einen über die Umgebung konfigurierten DeepSeek-Adapter, lokale Ausführung und Persistenz, während Dateisystem-Tools, Settings, verwaltete Credentials, Telemetrie, Web-Tools, Subagents, lokale Instruction-Discovery und Compaction fehlen. Es fixiert `danger-full-access`, sodass die plattformseitig ausgewählte persistente Shell jeden für die Runtime sichtbaren Pfad ändern kann; verwenden Sie einen Checkout oder Container zum einmaligen Gebrauch.

Das installierte Wheel paketiert weiterhin das vollständige `web`-Profil und die Frontend-Assets. Führen Sie `dsh web` gegen ein explizites `DSH_HOME` aus, wenn eine Python-SDK-Bereitstellung zusätzlich die Browser-Anwendung benötigt; `web` ist eine separate CLI-Anwendung und kann keinen Python-SDK-Client bedienen.

Verwenden Sie ein neues Home, wenn Profile, Plugins, Credentials, Settings und Sessions isoliert sein müssen. Verwenden Sie eine neue Session-ID für unabhängige Arbeit; verwenden Sie Harness, Home und ID nur gemeinsam weiter, um dieselbe dauerhafte Konversation und die Session-eigenen Ressourcen fortzusetzen.

Die [Bundle-Referenz](../../../packages/bundle/sdk-minimal/README.de.md) definiert den exakten Tree, und die [Beispiel-Referenz](../../../python/sdk/examples/README.de.md) definiert das ausführbare Programm. Die [Python-SDK-Referenz](../../../python/sdk/README.de.md) behandelt Lifecycle, Ergebnisse, Benachrichtigungen und Low-Level-Verhalten; die [dsh-CLI-Referenz](../../../apps/cli/reference/README.de.md) behandelt Profile-Layering.
