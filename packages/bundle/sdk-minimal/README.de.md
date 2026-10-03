---
description: "Eigenständiges Single-Tool-SDK-Profil für Nutzer, die einen minimalen plattformübergreifenden Coding-Agent ohne das geteilte Base-Bundle brauchen."
kind: "package-bundle"
---

# `@deepseek-ai/dsh-sdk-minimal`
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Verwenden Sie `dsh --profile sdk-minimal`, wenn ein SDK-Client eine kleine, explizite Coding-Agent-Runtime braucht. Das Profil offeriert nur eine plattformgewählte persistente Shell, persistiert Sessions als unkomprimiertes JSONL und wählt das Modell aus dem SDK-Initialisierungs-Request. Es liefert einen vollständigen Cordis-Baum und schließt `dsh-base`, Web, Settings, verwaltete Credentials, Telemetrie, Compaction, Filesystem-Tools, Workspace-Anweisungen, Skills, Jobs und Subagents bewusst aus. Seine Danger-Full-Access-Policy lässt die Shell jeden dem Prozess verfügbaren Pfad ändern, also verwenden Sie es nur mit einem isolierten Workspace.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Starten Sie das Profil direkt oder wählen Sie es aus dem Python SDK. Geben Sie ein explizites `DSH_HOME` an, verwenden Sie einen Wegwerf-Workspace und stellen Sie die Modell-Credential über `DEEPSEEK_API_KEY` bereit.

```sh
export DSH_HOME=/absolute/path/to/example-dsh-home
dsh --profile sdk-minimal
```

`DSH_CONTEXT_WINDOW` setzt die Fallback-Kapazität für ein Modell, das nicht im Advisory-Katalog des Adapters steht. `DSH_SYSTEM_PROMPT` ersetzt die Default-Persona. Der SDK-Initialisierungs-Request ist die einzige Modellauswahl und überschreibt Umgebungs-Defaults.

Verwenden Sie `dsh plugin --profile sdk-minimal`, um persistente externe Abhängigkeiten zu verwalten. Profil-, Home- und geordnete `--patch`-Dateien können Zeilen ersetzen oder Bundles oberhalb des vollständigen Default-Baums einfügen. Das ausgelieferte Template wendet Patches nur beim Start an.

Das Profil mountet exakt einen persistenten Shell-Stack: Bash auf Linux und macOS oder PowerShell auf Windows. Beide Stacks verwenden ein 300-Sekunden-Timeout und ein Owner-scoped Terminal; die Zeilen der anderen Plattform bleiben deaktiviert.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Der einzige Insert des Bundles ist der vollständige Anwendungsbaum: SDK-Stdio-Startup und JSON-RPC-Serving, ein umgebungskonfigurierter DeepSeek-Adapter, der explizite Agent-Kern, lokale Subprocess-Ausführung, eine plattformgewählte persistente Shell-PTY und unkomprimierte JSONL-Persistenz unter `$DSH_HOME/sessions`. Es erbt kein anderes Bundle, sodass jede zusätzliche Zeile eine explizite Profil-Änderung ist.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | Vollständiger eigenständiger Profil-Baum und seine umgebungsgestützten Defaults |
| [`src/index.ts`](src/index.ts) | Bundle-Paket-Einstieg |
| — | Es wird kein Runtime-Invarianten-Begleiter veröffentlicht; das Paket ist ein statischer Patch-Listen-Träger, dessen eingefügte Zeilen ihre eigenen Runtime-Beziehungen und Invarianten-Begleiter besitzen. |
| [`tests/sdk-minimal.spec.ts`](tests/sdk-minimal.spec.ts) | Exakte Kompositions-, Profilnamen- und Plattform-Auswahl-Checks |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

- [Python-SDK-Beispiel](../../../python/sdk/examples/README.de.md) — startet dieses Profil aus Python gegen ein explizites Harness-Home.
- [SDK-Anwendungs-Bundle](../sdk-app/README.de.md) — die JSON-RPC-Anwendungsschicht, die vollständige und minimale SDK-Profile wiederverwenden.
- [Base-Bundle](../base/README.de.md) — die vollständige Produkt-Grundlage, die dieses Profil bewusst weglässt.

-----

<a id="model-experience"></a>
## Model Experience

### Minimale Coding-Agent-Komposition

#### Was das Modell sieht

Der System-Prompt ist `DSH_SYSTEM_PROMPT` oder `You are a helpful software engineer assistant.`. Das einzige offerierte Tool ist das Owner-scoped persistente `bash` auf Linux/macOS oder `pwsh` auf Windows; Runtime-Kontext, Filesystem-Tools, Workspace-Anweisungen, Skills, Jobs-Kontrollen, Compaction und Harness-Identität fehlen.

#### Token-Effekt

Eine stabile Persona plus ein Tool-Schema. Tool-Ergebnisse und gewöhnliche Konversationshistorie wachsen mit der Session.

#### KV-Cache-Effekt

Stabil bei fester Persona, Plattform, Provider, Modell und Bundle-Patch-Stack. Profil-Änderungen greifen beim nächsten Prozess.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- **Die Komposition lässt geteilte Produkt-Services bewusst weg** — wählen Sie `dsh --profile sdk`, wenn Settings, verwaltete Credentials, Policy-Presets, Telemetrie, Web-Tools oder die volle Default-Tool-Liste benötigt werden.
- **Nutzer-Patches können den Baum erweitern und stdout korrumpieren** — Profil-Anpassung ist vertrauenswürdige Anwendungskomposition; ein Plugin, das gewöhnlichen Text auf stdout schreibt, kann das JSON-RPC-Framing brechen.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
