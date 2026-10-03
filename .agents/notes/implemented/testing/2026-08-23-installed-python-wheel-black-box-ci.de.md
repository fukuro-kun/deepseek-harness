# Agent Note: Installed-wheel-Python-runtime-Pull-Request-Validierung

Status: implemented

[English](2026-08-23-installed-python-wheel-black-box-ci.md) | [中文](2026-08-23-installed-python-wheel-black-box-ci.zh.md) | Deutsch

## Problem

Die Python-SDK-Unit-Suite treibt fake peers, während der packaged-runtime-Workflow das Source-SDK gegen eine neu gebaute ausführbare Datei laufen lassen kann, bevor beide Python-Distributionen existieren. Seine saubere virtuelle Umgebung übt nur die Default- und MCP-Fälle aus, und die verbindliche Pull-Request-CI baut nur Linux x64. Ein Source-Checkout, ein editable install, ein unpassendes SDK/runtime-Paar, ein defekter nativer wheel, eine plattformspezifische Closure oder eine echte provider-Integration können daher der Evidenz entkommen, die einen Merge blockiert.

## Entscheidung

### Installierte-Artefakt-Grenze

Der verbindliche Python-runtime-Workflow baut das reine SDK wheel und jedes Plattform-runtime-wheel vor den Verhaltenstests. Jedes native Ziel installiert diese zwei lokalen Dateien in eine neue Python-3.10-virtuelle Umgebung, wechselt in ein temporäres Verzeichnis außerhalb des Repositorys, entfernt `PYTHONPATH` und `DSH_RUNTIME_MODE` und ruft nur die öffentlichen Python-Module plus die paketierte ausführbare Datei auf.

Der black-box-harness lehnt einen Nicht-venv-Prozess, ein Repository-relatives Arbeitsverzeichnis, einen Source- oder editable import, ungleiche Distributionsversionen, eine SDK-Abhängigkeit, die die runtime-Version nicht exakt pinnt, eine ausführbare Datei außerhalb des installierten runtime-package oder eine ausführbare Datei ab, die im runtime-Distributionsrecord fehlt. Diese Provenance-Prüfung läuft vor der ersten agent-Anfrage, sodass ein bestandenes Verhalten nicht verbergen kann, dass der falsche Code lief.

### Keyless-Verhalten

Jedes Ziel führt nach der Installation das vollständige packaged-runtime-Szenario-Set aus. Ein lokales SSE-Modell hält die Ausgaben deterministisch, während das öffentliche SDK das Default-SDK-profile, geordnete patch overlays, externe bundle-Installation über `dsh plugin`, persistentes PTY- und editor-Verhalten, worker-thread-Code- und workflow-Ausführung, ripgrep-gestützte Suche, externe stdio-MCP-Entdeckung und -Ausführung, modell-sichtbare und durable snapshots, Zstandard-persistence, direktes JSON-RPC und shutdown ausübt. Ein restart-snapshot startet zwei vollständige SDK-runtime-Prozesse gegen eine persistence-root und pinnt ihre isolierten Modell-Historien, High-level-Ergebnisse und separaten durable logs. Der installierte Lauf ersetzt den Source-SDK-pre-wheel-Lauf; die ausführbare Datei und das wheel werden zusammen einmal getestet, statt zwei Verhaltensinventare zu pflegen.

Linux behält zusätzlich seinen manylinux-2.28-clean-install-smoke und GLIBC-Checks. macOS behält Deployment-target- und native-helper-Checks. Diese Plattform-Einschränkungen ergänzen das gemeinsame black-box-Verhalten statt es zu ersetzen.

### Echte DeepSeek-API

Vertrauenswürdige Pull Requests und master-Pushes führen auf jedem ausgewählten nativen Ziel einen zweiten installed-wheel-Check mit `DEEPSEEK_API_KEY_EXTERNAL` aus, der nur in einen Preflight und den live-Test-Step gemappt wird. Der Preflight scheitert, wenn das Secret leer ist, sodass sich die provider-Suite nicht selbst zu Grün überspringen kann. Der Test startet das öffentliche SDK gegen `https://api.deepseek.com`, bittet das Modell, eine exakte sentinel-Datei über die Plattform-shell zu schreiben, bittet einen zweiten turn in derselben Session, sie zu lesen, und verifiziert den externen Zeileninhalt, die finalen Antworten, die abgeschlossenen turn-Gründe, die modell-angeforderten tool calls sowie die Existenz und das Zstandard-framing seines session log. Dekodierter Record-Inhalt und abgeschlossene turn-Persistenz sind deterministische keyless-Verpflichtungen im Besitz des restart-snapshot statt aus komprimierten live-provider-Bytes abgeleitet.

Fork- und Dependabot-Pull-Requests erhalten niemals das Repository-Secret. Ihre nativen Jobs führen den vollständigen keyless-Pfad aus und überspringen beide Secret-führenden Steps; `pull_request_target` ist verboten, weil es nicht vertrauenswürdigen Code mit dem Schlüssel ausführen würde.

### Verbindliche Ziele

Der Pull-Request-`python-runtime`-Job ruft den wiederverwendbaren Builder für Linux x64 und Windows x64 auf; master-Pushes wählen Linux arm64 und beide macOS-Architekturen unter der [master-only-Plattform-Policy](../process/2026-09-06-master-only-platform-ci.de.md). Sein aggregiertes Ergebnis bleibt eine Abhängigkeit von `all checks passed`, sodass ein gescheiterter, abgebrochener oder fehlender nativer Träger das verbindliche Urteil blockiert. Das [sdk-runtime-README](../../../../python/sdk-runtime/README.de.md) besitzt das Windows-Ziel und seinen PowerShell-spezifischen minimalen snapshot.

## Bestehende Entscheidungen und Ersetzung

Diese Entscheidung ersetzt die Einzel-Ziel-Topologie in der archivierten [verbindlichen Python-runtime-Pull-Request-Validierung](../../archived/testing/2026-08-12-required-python-runtime-pull-request-ci.md), behält aber deren Anforderung, dass die echte ausführbare Datei, snapshots, wheels und saubere Installation in jedem ausgewählten Ziel-Check zusammentreffen. [docs/architecture.md](../../../../docs/architecture.de.md) besitzt die gestartete Anwendung und die Customizing-Oberfläche; die [single-file-Python-SDK-runtime-Distribution](../architecture/2026-07-10-single-file-executable-sdk-runtime-distribution.de.md) bleibt maßgeblich für SEA-Packaging, native sidecars, wheel-Tags und Release-Artefakte.

## Erwogene Alternativen

**Linux x64 als einzigen verbindlichen Träger behalten.** Abgelehnt, weil native addons, ausführbare-Datei-Konstruktion, wheel-Tags und helper-Dateien sich über die fünf veröffentlichten Ziele unterscheiden. Eine Entdeckung zum Release-Zeitpunkt ist für ein Artefakt zu spät, das jede Python-SDK-Installation plattformbezogen auswählt.

**Vollständiges Verhalten vor der wheel-Konstruktion laufen lassen und zwei kleine installierte smokes behalten.** Abgelehnt, weil das die ausführbare Datei gegen Source-imports beweist und dann zu wenig über die Distribution beweist, die Benutzer installieren. Die saubere installierte Umgebung ist der stärkere gemeinsame Ort für dieselben Szenarien.

**Nur keyless-Modell-Emulation nutzen.** Abgelehnt, weil ein lokaler SSE-Endpoint weder Authentifizierung, Request-Kompatibilität, Streaming, tool-call-Interpretation noch einen vollständigen turn gegen den echten provider beweisen kann.

**Den Schlüssel über `pull_request_target` an geforkte Pull Requests ausgeben.** Abgelehnt, weil beliebiger fork-Code das Repository-Secret exfiltrieren könnte. Fehlende credentialed Evidenz auf einem nicht vertrauenswürdigen ref ist explizit und sicherheitsbewahrend; vertrauenswürdige heads und post-merge-provider-CI behalten das live-Signal.

## Konsequenzen

Jeder Pull Request zahlt für zwei native ausführbare-Datei- und wheel-Builds plus deterministische installed-artifact-Szenarien. Vertrauenswürdige same-repository-Pull-Requests zahlen zusätzlich für eine Zwei-turn-DeepSeek-Aufgabe pro Ziel. Im Gegenzug beschreibt das verbindliche Ergebnis die Dateien, die Python-Benutzer installieren, beweist die ausgewählten Träger vor dem Merge und kann nicht durch Importieren des Checkouts oder stilles Überspringen des echten provider bestehen.
