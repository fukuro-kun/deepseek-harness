# Agent Note: Pull-Request-Validierung der installierten Python-Wheel-Runtime

Status: implemented

[English](2026-08-23-installed-python-wheel-black-box-ci.md) | [中文](2026-08-23-installed-python-wheel-black-box-ci.zh.md) | Deutsch

## Problem

Die Python-SDK-Unit-Suite treibt Fake-Peers, während der Packaged-Runtime-Workflow das Source-SDK gegen ein neu gebautes Executable fahren kann, bevor eine der beiden Python-Distributionen existiert. Seine saubere virtuelle Umgebung prüft nur die Default- und MCP-Fälle, und das required Pull-Request-CI baut nur Linux x64. Ein Source-Checkout, ein Editable-Install, ein ungleiches SDK-/Runtime-Paar, ein kaputtes natives Wheel, ein plattformspezifischer Closure oder eine Real-Provider-Integration kann daher der Evidenz entkommen, die einen Merge blockiert.

## Entscheidung

### Installierte-Artefakt-Grenze

Der required Python-Runtime-Workflow baut das reine SDK-Wheel und jedes Plattform-Runtime-Wheel vor den Verhaltenstests. Jedes native Target installiert diese zwei lokalen Dateien in eine neue Python-3.10-Virtual-Environment, wechselt in ein temporäres Verzeichnis außerhalb des Repositories, entfernt `PYTHONPATH` und `DSH_RUNTIME_MODE` und ruft nur die öffentlichen Python-Module plus das gepackte Executable auf.

Das Black-Box-Harness lehnt einen Nicht-Venv-Prozess, ein repository-relatives Arbeitsverzeichnis, einen Source- oder Editable-Import, ungleiche Distributionsversionen, eine SDK-Dependency, die die Runtime-Version nicht exakt pint, ein Executable außerhalb des installierten Runtime-Packages oder ein Executable, das im Runtime-Distribution-Record fehlt, ab. Dieser Provenance-Check läuft vor dem ersten Agent-Request, sodass ein bestandener Verhaltenslauf nicht verbergen kann, dass falscher Code lief.

### Schlüsselloses Verhalten

Jedes Target führt nach der Installation das komplette Packaged-Runtime-Szenario-Set aus. Ein lokales SSE-Modell hält Outputs deterministisch, während das öffentliche SDK das Default-SDK-Profile, geordnete Patch-Overlays, externe Bundle-Installation über `dsh plugin`, persistentes PTY- und Editor-Verhalten, Worker-Thread-Code- und Workflow-Ausführung, ripgrep-gestützte Suche, externe stdio-MCP-Discovery und -Ausführung, modellsichtbare und durable Snapshots, Zstandard-Persistenz, direktes JSON-RPC und Shutdown ausübt. Ein Restart-Snapshot launcht zwei komplette SDK-Runtime-Prozesse gegen eine Persistenz-Root und pint ihre isolierten Modell-Historien, High-Level-Resultate und separaten durable Logs. Der installierte Lauf ersetzt den Source-SDK-Pre-Wheel-Lauf; Executable und Wheel werden zusammen einmal getestet, statt zwei Verhaltensinventare zu pflegen.

Linux behält zusätzlich seinen manylinux-2.28-Clean-Install-Smoke und GLIBC-Checks. macOS behält Deployment-Target- und Native-Helper-Checks. Diese Plattform-Constraints ergänzen das gemeinsame Black-Box-Verhalten statt es zu ersetzen.

### Echte DeepSeek-API

Vertrauenswürdige Pull Requests und Master-Pushes führen auf jedem selektierten nativen Target einen zweiten Installed-Wheel-Check mit `DEEPSEEK_API_KEY_EXTERNAL` aus, gemappt nur in ein Preflight und den Live-Test-Step. Das Preflight schlägt fehl, wenn das Secret leer ist, sodass die Provider-Suite sich nicht selbst zu Grün überspringen kann. Der Test startet das öffentliche SDK gegen `https://api.deepseek.com`, bittet das Modell, eine exakte Sentinel-Datei über die Plattform-Shell zu schreiben, bittet einen zweiten Turn in derselben Session, sie zu lesen, und verifiziert den externen Zeileninhalt, die finalen Responses, die Completed-Turn-Reasons, die modell-angefragten Tool-Calls sowie die Existenz und das Zstandard-Framing seines Session-Logs. Dekodierter Record-Content und Completed-Turn-Durability sind deterministische schlüssellose Verpflichtungen, die der Restart-Snapshot besitzt, statt aus komprimierten Live-Provider-Bytes inferiert zu werden.

Fork- und Dependabot-Pull-Requests erhalten niemals das Repository-Secret. Ihre nativen Jobs führen den kompletten schlüssellosen Pfad aus und überspringen beide secret-tragenden Steps; `pull_request_target` ist verboten, weil es unvertrauenswürdigen Code mit dem Key ausführen würde.

### Required Targets

Der Pull-Request-`python-runtime`-Job ruft den wiederverwendbaren Builder für Linux x64 und Windows x64 auf; Master-Pushes selektieren Linux arm64 und beide macOS-Architekturen unter der [Master-only-Plattform-Policy](../process/2026-09-06-master-only-platform-ci.de.md). Sein Aggregat-Ergebnis bleibt eine Dependency von `all checks passed`, sodass ein fehlgeschlagener, abgebrochener oder fehlender nativer Träger das required Verdict blockiert. Das [sdk-runtime-README](../../../../python/sdk-runtime/README.de.md) besitzt das Windows-Target und seinen PowerShell-spezifischen Minimal-Snapshot.

## Bestehende Entscheidungen und Ablösung

Diese Entscheidung ersetzt die Single-Target-Topologie der archivierten [required-Python-Runtime-Pull-Request-Validierung](../../archived/testing/2026-08-12-required-python-runtime-pull-request-ci.md) und behält dabei ihre Anforderung, dass echtes Executable, Snapshots, Wheels und saubere Installation in jedem selektierten Target-Check zusammentreffen. [docs/architecture.md](../../../../docs/architecture.de.md) besitzt die gelaunchte Anwendung und die Customization-Oberfläche; die [Single-File-Python-SDK-Runtime-Distribution](../architecture/2026-07-10-single-file-executable-sdk-runtime-distribution.de.md) bleibt maßgeblich für SEA-Packaging, native Sidecars, Wheel-Tags und Release-Artefakte.

## Erwogene Alternativen

**Linux x64 als einzigen required Träger behalten.** Abgelehnt, weil native Addons, Executable-Konstruktion, Wheel-Tags und Helper-Dateien sich über die fünf publizierten Targets unterscheiden. Discovery zum Release-Zeitpunkt ist zu spät für ein Artefakt, das jede Python-SDK-Installation plattformbezogen auswählt.

**Volles Verhalten vor der Wheel-Konstruktion laufen lassen und zwei kleine installierte Smokes behalten.** Abgelehnt, weil das das Executable gegen Source-Imports beweist und dann zu wenig über die Distribution beweist, die Nutzer installieren. Die saubere installierte Umgebung ist der stärkere gemeinsame Ort für dieselben Szenarien.

**Nur schlüssellose Modell-Emulation nutzen.** Abgelehnt, weil ein lokaler SSE-Endpoint weder Authentifizierung, Request-Kompatibilität, Streaming, Tool-Call-Interpretation noch einen kompletten Turn gegen den echten Provider beweisen kann.

**Den Key an geforkte Pull Requests über `pull_request_target` exponieren.** Abgelehnt, weil beliebiger Fork-Code das Repository-Secret exfiltrieren könnte. Fehlende credentialed Evidenz auf einem unvertrauenswürdigen Ref ist explizit und sicherheitserhaltend; vertrauenswürdige Heads und Post-Merge-Provider-CI behalten das Live-Signal.

## Konsequenzen

Jeder Pull Request zahlt für zwei native Executable- und Wheel-Builds plus deterministische Installed-Artifact-Szenarien. Vertrauenswürdige Same-Repository-Pull-Requests zahlen zusätzlich für eine Two-Turn-DeepSeek-Aufgabe pro Target. Im Gegenzug beschreibt das required Ergebnis die Dateien, die Python-Nutzer installieren, beweist die selektierten Träger vor dem Merge und kann nicht durch Importieren des Checkouts oder stilles Überspringen des echten Providers bestehen.
