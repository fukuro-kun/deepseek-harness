# DeepSeek Harness Python SDK
[English](README.md) | [中文](README.zh.md) | Deutsch


Python-Subprocess-SDK, um DeepSeek Harness über zeilenbasiertes JSON-RPC auf stdio zu steuern. Installiere `deepseek-harness-sdk`; es installiert das exakt gleichversionierte `deepseek-harness-runtime-bin`-Wheel für die aktuelle Plattform.

```sh
python -m pip install deepseek-harness-sdk
```

## Eine Runtime starten

Das Python SDK hat keinen separaten Applikations-Einstiegspunkt. Es startet das gebündelte `dsh`-CLI mit `--profile sdk`; das gewählte Profil besitzt den JSON-RPC-Server, die agent-Komposition, Credentials, Persistenz, Tools und das Shutdown-Verhalten.

Jeder Start erfordert ein explizites Harness-Home. Übergib `dsh_home` oder stelle ein nicht leeres `DSH_HOME` in der Child-Umgebung bereit. Das SDK entdeckt bewusst niemals `~/.dsh`.

```py
from deepseek_harness import DeepSeekHarness

with DeepSeekHarness(
    dsh_home="/absolute/path/to/isolated-dsh-home",
    cwd="/absolute/path/to/workspace",
    provider="deepseek-official",
    model="deepseek-v4-flash",
    reasoning_effort="max",
    max_tokens=49_152,
) as harness:
    result = harness.run("Say hi.", session_id="example-001")

print(result.final_response)
```

`DeepSeekHarness` startet lazy und verwendet seine Runtime bis zu `close()` oder dem Verlassen des Context-Managers wieder. Der initiale Profil-Handshake hat über `initialize_timeout_seconds` eine unabhängige 30-Sekunden-Default-Schranke; gewöhnliche Turns bleiben unbegrenzt, sofern `request_timeout_seconds` nicht gesetzt ist. Ein Timeout nennt das gewählte Profil und enthält zurückgehaltene Runtime-Diagnostik. `cwd` ist der agent-Workspace; `runtime_cwd` wählt unabhängig das Working Directory des Subprocess. Beide werden vor dem Start absolut gemacht. `provider`, `model`, das optionale `reasoning_effort` und das optionale positive `max_tokens` werden während der JSON-RPC-Initialisierung gesendet. `base_url` und `api_key` überschreiben explizit `DEEPSEEK_BASE_URL` und `DEEPSEEK_API_KEY` in der Child-Umgebung.

## Plugins anpassen

Persistente Anpassung gehört zu einem `dsh`-Profil. Initialisiere das ausgelieferte SDK-Profil und installiere ein externes Bundle mit dem `dsh`-Befehl des Runtime-Wheels:

```sh
export DSH_HOME=/absolute/path/to/isolated-dsh-home
dsh --profile sdk --dump-default-config >/dev/null
dsh plugin --profile sdk add file:/absolute/path/to/my-plugin-bundle
```

Die `file:`-Form installiert das lokale Bundle in den Profil-Paketbaum, wo seine Peer-Imports den gebündelten Installations-Fallback erreichen. Das Profil-Manifest zeichnet installierte Dependencies und geordnete Bundle-Schichten auf; seine `$DSH_HOME/profiles/sdk/cordis.patch.yml` ist der persistente User-Patch. `dsh plugin` benötigt `pnpm` nur zur Verwaltung externer Pakete. Das Ausführen des SDK erfordert kein systemseitiges Node.js.

Für eine aufrufspezifische Änderung übergib eine oder mehrere Patch-Dateien. Sie werden absolut gemacht und nach den Profil- und Home-Patch-Schichten der Reihe nach weitergereicht:

```py
with DeepSeekHarness(
    dsh_home="/absolute/path/to/isolated-dsh-home",
    profile="sdk",
    patches=("/absolute/path/to/first.patch.yml", "/absolute/path/to/last.patch.yml"),
) as harness:
    result = harness.run("Make the requested code change.")
```

`profile` kann ein anderes bestehendes Profil wählen, aber diese Komposition muss `@deepseek-ai/dsh-sdk-app` oder eine andere `@deepseek-ai/dsh-sdk-jsonrpc-server`-Row behalten. Fehlkonfiguration schlägt beim CLI-Boot oder der SDK-Initialisierung fehl; es gibt keinen Complete-Config-Fallback. `dsh_bin` kann ein anderes `dsh`-Executable wählen und behält dabei dieselbe Profilgrammatik. Beliebiger argv-Ersatz bleibt ein interner Fake-Runtime-Testadapter, keine öffentliche API.

`provider` wählt eine Provider-Route, die von der gewählten Cordis-Komposition registriert wird; `model` ist die von diesem Adapter aufgelöste Modell-id. `reasoning_effort` ist ein optionaler, nicht leerer adaptereigener Identifier für genau diese Route; Weglassen bewahrt den modellseitigen Default. `max_tokens` ist ein optionales positives Output-Token-Cap pro Request für den Root-agent und seine In-Process-Nachfahren; Weglassen überlässt dem Provider-Default die Kontrolle. Die Initialisierung lehnt einen fehlenden Adapter, ein nicht verfügbares Modell oder ein nicht unterstütztes Effort ab, bevor ein Prompt läuft. Compaction-Summaries behalten das separate Limit, das ihr Compaction-Plugin konfiguriert. Die gebündelte Default-Komposition registriert `deepseek-official`. Eine eigene Komposition kann `llm-pi-ai` mounten, dort providerspezifische Credentials/Endpoints konfigurieren und jede Provider/Model-Kombination aus dem installierten pi-ai-Katalog wählen.

Das ausgelieferte `sdk-minimal`-Profil ist ein eigenständiger expliziter Baum statt eines Overlays auf `dsh-base`. Wähle es mit `profile="sdk-minimal"`; das gewöhnliche `model`-Argument ist die einzige Runtime-Modellauswahl, auch für Modell-ids außerhalb des beratenden Adapter-Katalogs. Es bietet nur eine plattformgewählte persistente Shell, lokale Ausführung und JSONL-Sessions; Dateisystem-Tools, Settings, verwaltete Credentials, Telemetrie, Web-Tools und der vollständige Default-Tool-Satz bleiben über die separaten vollständigen `sdk`- und `web`-Profile verfügbar.

## Ergebnisse und Notifications

`Session.run()` besitzt ein Aktivitätsintervall vom durable Inbox-Receipt des Prompts bis zum nächsten Whole-agent-Idle und gibt `RunResult(session_id, final_response, finish_reason, events, notifications)` zurück. `final_response` ist der letzte committed Root-Session-Assistant-Text im Intervall. `finish_reason` ist der `kind` des letzten Root-Session-`turn/end`, etwa `completed`, `max-tokens` oder `error`, und `None`, wenn kein Turn endete. Ein `turn/end` ohne String-`data.reason.kind` verletzt das Protokoll und wirft `SdkProtocolError`.

`HarnessClient` behält die entdeckte subagent-Abstammung für die Lebensdauer des Runtime-Prozesses. Während `Session.run()` erhalten `RunResult.notifications` und `on_notification` die Root-Session und bekannte Nachfahren in Wire-Reihenfolge. `RunResult.events` enthält nur Root-Session-Events, sodass Nachfahren-Output die Root-Antwort nicht ersetzen kann. Das Low-level-`session_prompt()` gibt die gequeuete Message-id sofort zurück; Aufrufer, die `Session.run()` umgehen, besitzen die spätere Aktivitätsgrenze selbst.

Das gewählte Home speichert Profile, Plugins und jede profileigene durable Ressource. Das vollständige `sdk`-Profil verwendet seine Credentials-, Settings- und Session-Stores; `sdk-minimal` verwendet nur seinen JSONL-Session-Store. Verwende ein frisches Home, wenn diese Ressourcen isoliert sein müssen, und eine frische Session-id für unabhängige Arbeit. Die Wiederverwendung von Harness und Session-id setzt die durable Konversation und sessioneigene Ressourcen fort.

Siehe das [Python-Tutorial](../../docs/user/guide/python-sdk.de.md), das [ausführbare Beispiel](examples/README.de.md) und die [Runtime-Wheel-Referenz](../sdk-runtime/README.de.md).
