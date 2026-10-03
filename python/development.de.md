# Python-Contributor-Workflows
[English](development.md) | [中文](development.zh.md) | Deutsch


Wählen Sie den Workflow für das benötigte Contributor-Ergebnis: Runtime-Artefakte bauen, das SDK validieren, gegen den Quellbaum laufen oder Distributionen bauen. Das Paketverhalten steht in der [SDK-Referenz](sdk/README.de.md) und der [Runtime-Carrier-Referenz](sdk-runtime/README.de.md).

## Runtime-Artefakte bauen

Plattform-Executables sind Build-Artefakte und werden nicht in git eingecheckt. Führen Sie den Build im Repository-Root aus:

```sh
pnpm install
pnpm exec tsx scripts/build-exe-for-python-sdk.ts
```

Verwenden Sie `--skip-build`, wenn die benötigten `lib/` Artefakte bereits existieren, oder `--targets=node24-linux-x64,node24-linux-arm64,node24-macos-arm64,node24-macos-x64,node24-win-x64`, um Plattformen auszuwählen. Bauen Sie jedes Target auf seiner nativen Architektur. Produkte landen in `dist-exe/`, und das Skript synchronisiert die ausgewählten Carrier nach `python/sdk-runtime/`. Windows erzeugt `.exe` und `-rg.exe`; macOS synchronisiert zusätzlich den passenden Spawn-Helper, den `node-pty` benötigt.

## Das SDK validieren

Halten Sie die virtuelle Umgebung außerhalb von `python/`, installieren Sie die Testgruppe und führen Sie die Python-Suite aus:

```sh
export UV_PROJECT_ENVIRONMENT="$PWD/tmp/py-sdk-venv"
uv sync --project python/sdk --group test
uv run --project python/sdk pytest
```

`python/sdk/tests/test_bundled_runtime.py` testet verfügbare gebündelte Carrier und überspringt einen Carrier, dessen Artefakt nicht gebaut wurde. Zur repository-weiten Testpolicy siehe [Testing](../docs/testing.de.md).

Diese Suite steuert gefälschte Runtime-Peers. `scripts/smoke-python-runtime.py` steuert dagegen die paketierte Runtime. Die `python-runtime`-CI-Jobs bauen Linux x64 und Windows x64 auf Pull Requests sowie Linux arm64 und beide macOS-Architekturen auf master-Pushes. Jedes ausgewählte Target installiert die passenden SDK- und Runtime-Wheels in eine neue Python-3.10-Umgebung, läuft außerhalb des Checkouts mit leerem `PYTHONPATH` und `DSH_RUNTIME_MODE`, beweist, dass beide Module und das Executable aus diesen Distributionen stammen, und führt dann jedes keyless-Szenario aus. Ein fokussierter lokaler Source-SDK-Lauf kann ein gebautes Executable und ein Szenario wählen:

```sh
uv run --project python/sdk python scripts/smoke-python-runtime.py \
  --scenario sdk-minimal --exe dist-exe/deepseek-harness-sdk-runtime-macos-arm64
```

Vier Szenarien vergleichen committed Expected Output unter `scripts/snapshots/python-sdk-single-exe/`. `minimal/model-visible.json` pinnt die vom `sdk-minimal`-Profil unter Linux/macOS assemblierten System-Prompts, die ausgegebenen Tool-Schemas und die modell-sichtbaren Messages; `minimal/win-x64/model-visible.json` pinnt das PowerShell-Gegenstück. Ein Plugin, das eine unbeabsichtigte System-Section oder User-Message beisteuert, lässt den Job daher fehlschlagen, und jede vom Profil emittierte Message wird verglichen. `advanced/` pinnt das SDK-Ergebnis eines komplexen Prozesses und die Parent/Child-Session-Logs über alle Targets. `restart/` startet zwei vollständige SDK-Runtime-Prozesse gegen denselben Persistence-Root und pinnt ihre isolierten Modell-Historien, High-Level-Ergebnisse und getrennten durable Logs über alle Targets. `sdk-minimal-in-history` verwendet das Persistent-Shell- und Editor-Szenario erneut, mit einer Section, die sich nach dem ersten erfolgreichen Shell-Call ändert. `minimal-in-history/prompt-history.json` pinnt beide Prompt-Versionen, den unveränderten führenden Prompt in späteren Requests, angehängte SDK-System-Message-Events und `request/context.systemPromptUpdate`; Tool-Schemas bleiben fixiert, und die Editor-Datei wird unabhängig geprüft. Führen Sie das zuständige Szenario mit `--update-snapshots` erneut aus und reviewen Sie diesen Diff vor dem Commit.

Vertrauenswürdige Pull Requests und master-Pushes führen zusätzlich `--scenario sdk-live --installed-wheel` auf jedem ausgewählten nativen Target aus. Dieses Szenario führt zwei Tool-nutzende Turns gegen `https://api.deepseek.com` aus: Es prüft die erstellte Datei sofort, ersetzt ihren Inhalt durch eine host-seitige Zufalls-Challenge und verlangt, dass der zweite Turn den geänderten Inhalt in eine frische Quittung kopiert, ohne die Quelle zu verändern. Beide Turns müssen mit der exakten Sentinel-Antwort und einem vom Modell angeforderten Tool-Call abschließen; externe Byte-Vergleiche prüfen die Dateien. Fehlende Repository-Secrets führen zu einem Fehlschlag statt zu einem Selbst-Skip. Fork- und Dependabot-Pull-Requests laufen über den kompletten keyless-Installed-Wheel-Pfad, erhalten aber keinen Key.

Ein interaktiver Smoke-Test benötigt `DEEPSEEK_API_KEY` in der Umgebung oder in der `.env` im Repository-Root:

```python
from deepseek_harness import DeepSeekHarness

with DeepSeekHarness(dsh_home="/absolute/path/to/test-dsh-home") as harness:
    print(harness.run("say hi").final_response)
```

Alternativ lässt sich ein nicht-leeres `DSH_HOME` exportieren. Das SDK lehnt einen Start ab, der stillschweigend `~/.dsh` verwenden würde.

## Gegen Node-Quellcode laufen

Repository-Contributors können eine der beiden Entwicklungsrouten wählen; beide führen den normalen `dsh --profile sdk`-Launcher aus:

- `DSH_RUNTIME_MODE=node` setzen, um den gebauten Node-Carrier auf System-Node `>=22.19` zu verwenden. Das Build-Skript aktualisiert diesen Carrier, aber Distributionen enthalten oder wählen ihn nie automatisch.
- `dsh_bin` auf den absoluten Pfad des gebauten `apps/cli/lib/bin.js` setzen, um die CLI des Checkouts direkt zu testen. Geben Sie explizit `dsh_home` sowie nach Bedarf `profile` und geordnete `patches` an.

`python/sdk/tests/manual_sdk_agent_smoke.py` verwendet den internen `_launch_args`-Testadapter, um die ungebaute TypeScript-CLI unter tsx zu testen. Eine beliebige argv-Ersetzung ist im öffentlichen SDK bewusst nicht vorhanden.

## Distributionen bauen

Die Version in der Root-`package.json` ist für beide Python-Distributionen maßgeblich. Das Staging-Skript injiziert diese Version in beide Wheels und pinnt das SDK auf dieselbe `deepseek-harness-runtime-bin`-Version.

Bauen Sie das reine SDK-Wheel einmal und je ein Runtime-Wheel pro nativer Plattform:

```sh
version="$(python - <<'PY'
import runpy

release = runpy.run_path("scripts/build-python-release.py")
print(release["pep440_version"](release["repository_version"]()))
PY
)"
python scripts/build-python-release.py --package sdk --output-dir dist-python
python scripts/build-python-release.py --package runtime --platform macos-arm64 --runtime-exe dist-exe/deepseek-harness-sdk-runtime-macos-arm64 --output-dir dist-python
pip install \
  "dist-python/deepseek_harness_sdk-$version-py3-none-any.whl" \
  "dist-python/deepseek_harness_runtime_bin-$version-py3-none-macosx_14_0_arm64.whl"
```

Die Runtime-Distribution ist nur als Wheel verfügbar. Die Release-Pipeline veröffentlicht fünf Plattform-Wheels zusammen mit dem reinen SDK-Wheel: Linux x64, Linux arm64, macOS 14 oder neuer auf arm64 und x64 sowie Windows x64 (`win_amd64`). Ein `python-v<repository-version>`-Tag wird nur akzeptiert, wenn es mit der Repository-Version übereinstimmt; Prerelease-Repository-Versionen wie `0.0.1-rc.1` verwenden in Wheel-Dateinamen und -Metadaten die normalisierte PEP-440-Schreibweise, etwa `0.0.1rc1`.

## Einen Release-Kandidaten validieren

Führen Sie den GitHub-Workflow `Release (Python)` manuell mit `publish=false` aus, um alle sechs Wheels zu bauen, das Linux-Release-Set unter Python 3.10 und 3.14 zu installieren, exakte Dateinamen und Metadaten zu prüfen, das standardmäßige PyPI-Limit pro Datei zu erzwingen und ein aggregiertes Artefakt mit SHA-256-Hashes zu behalten. Der Lauf hat keine Registry-Credentials; ein Dry-Run kann keinen der beiden Publication-Jobs erreichen.

Die öffentliche Veröffentlichung läuft aus dem privaten Automation-Repository. Die Paket-Metadaten zeigen auf das separate Read-only-Quellmirror, das keine Release-Actions ausführt. Das private Repository definiert die Repository-Variable `PYPI_PUBLISHER_REPOSITORY` als sein eigenes `owner/name` und hält `PUBLIC_PYPI_RELEASE_ENABLED=false`, außer während eines beabsichtigten Releases.

Getrennte Runtime- und SDK-Jobs erlauben es, einen fehlgeschlagenen SDK-Upload fortzusetzen, ohne die immutable Runtime-Dateien erneut zu senden. Sie akzeptieren `publish=true` nur, wenn der Workflow aus dem konfigurierten Publisher-Repository am passenden `python-v*`-Tag läuft und die geschützten `pypi-runtime`- bzw. `pypi`-Umgebungen den Runtime- bzw. SDK-Job genehmigen. PyPI Trusted Publishing liefert weiterhin kurzlebige OIDC-Credentials, aber öffentliche Attestierungen sind deaktiviert, weil sie die Identität des privaten Publishers offenlegen würden.
