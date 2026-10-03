# Agent Note: Minimal-Profile nutzen eine Bare-Runtime
[English](2026-08-11-minimal-profiles-bare-two-tool-runtime.md) | [中文](2026-08-11-minimal-profiles-bare-two-tool-runtime.zh.md) | Deutsch

Status: implemented


## Problem

Das Web-`minimal`-Preset und die eigenständige JSON-RPC-Minimal-Komposition exponierten persistent `bash` und `str_replace_editor`, aber ihre tragenden Services passten nicht zur beabsichtigten Trainings-Runtime. Beide mounteten Context-Compaction; das Web-Preset erbte zudem das gesandboxte Filesystem des Hosts und die JSON-RPC-Komposition mountete `fs-sandbox` plus Filesystem-Policy. Eine lange Session konnte daher History ersetzen, und der Editor warb für und setzte eine Filesystem-Policy durch, die die bare lokale Referenz-Runtime nicht hat.

Die beiden Launch-Pfade haben auch unterschiedliche Konfigurations-Owner. Web mountet ein Per-Agent-Preset über einem laufenden Host, während das Python-SDK einen vollständigen stdio-JSON-RPC-Child-Prozess initialisiert. Beide als ein austauschbares Cordis-Leaf zu behandeln würde diese Lifecycle-Unterschiede verdecken, und das SDK-Beispiel hatte keinen Umgebungspfad zur Wahl seines Modells oder System-Prompts.

## Entscheidung

Das ausgelieferte Web-Minimal-Preset exponiert persistent `bash`; das eigenständige Profil exponiert persistent `bash` auf Linux/macOS bzw. `pwsh` auf Windows. Beide mounten weder Context-Compaction- noch Filesystem-Provider und unterdrücken jeden `dsh-system-prompt`-Runtime-Context-Beitrag für frische Sessions. Die [Nur-persistent-Shell-Entscheidung](../simplification/2026-09-03-minimal-profiles-persistent-shell-only.de.md) entfernt den Editor und seinen sonst ungenutzten `fs-local`-Provider aus beiden Kompositionen. Die Persona des Web-Presets bleibt der feste complete-Prompt im Besitz des früheren [Minimal-Preset-Kompositionsentscheids](../../archived/bug-fix/2026-08-10-minimal-preset-owns-rl-composition.md) und wendet die Runtime-Context-Unterdrückung nur auf diesen Agent-Scope an. Der eigenständige spine reicht dieselbe Einstellung an seinen prozesseigenen System-Prompt-Service weiter. Der Web-Host behält seine Sandbox- und Approval-Services; das eigenständige Profil mountet eine danger-full-access-Sandbox-Policy und keinen Approval-Service. Keines der beiden trägt modellzugewandten Policy-Kontext bei.

Das eigenständige [`@deepseek-ai/dsh-sdk-minimal`-Bundle](../../../../packages/bundle/sdk-minimal/README.de.md) bleibt eine vollständige JSON-RPC-Prozess-Komposition hinter `dsh --profile sdk-minimal`. Es mountet SDK-Startup und JSON-RPC-Serving, die für die plattformgewählte persistent Shell nötigen lokalen PTY- und Subprocess-Services, den Tool-Consumer dieser Shell und unkomprimierte JSONL-Persistenz unter `$DSH_HOME/sessions`. Es mountet weder `token-meter`, `compaction-basic`, `fs-local`, `fs-sandbox`, `fs-observation-policy` noch ein Filesystem-Tool. Die persistent Shell konsumiert die danger-full-access-Sandbox-Policy des Profils. [docs/architecture.md](../../../../docs/architecture.de.md) besitzt diese Bundle-Platzierung und ihre Trennung von `dsh-base`.

`DSH_SYSTEM_PROMPT` wählt die eigenständige Persona, und `DSH_CONTEXT_WINDOW` liefert Fallback-Kapazität für ein Modell ohne exakte Katalog-Metadaten. Der JSON-RPC-`initialize`-Request des SDK-Clients ist die einzige Runtime-Modellauswahl. [`minimal.py`](../../../../python/sdk/examples/minimal.py) darf `DSH_MODEL` nur als Default-`model`-Argument des Kommandos lesen; ein explizites `--model` braucht keinen passenden Child-Umgebungswert. Endpoint- und Credential-Variablen bleiben im Besitz des bestehenden Umgebungsauflösungspfads des DeepSeek-Adapters.

## Verifikation

Das Web-Replay bootet den vollständigen Web-Host, erzeugt den Agent über den Preset-Service und assertiert, dass kein gescopter Filesystem- oder Compaction-Service existiert, keine system-prompt-eigene Runtime-Context-Message appended wurde und der assemblierte Request exakt den festen Prompt und persistent Bash enthält. Anschließend führt es persistent Bash gegen die echten gescopten Services aus.

Der SDK-Keyless-Source-Test bootet echtes `dsh --profile sdk-minimal`, vollendet einen Turn mit einem umgebungsgewählten Prompt und assertiert das generierte Ein-Bundle-Manifest. Der Python-SDK-Bundled-Runtime-Snapshot besitzt den assemblierten Prompt, den exakten Ein-Tool-Katalog und das Fehlen jeder system-prompt-eigenen Runtime-Context-Message. Packaged-Runtime-Coverage initialisiert das eigenständige Profil über jeden verfügbaren Carrier mit umgebungsgewählten Modell-, Modellkapazitäts- und Prompt-Werten und führt dann die gewählte persistent Shell aus. Cordis-Validierung prüft, dass beide Konfigurationen ihre deklarierten Plugins und Konfigurationsfelder auflösen.

## Erwogene Alternativen

**`compaction-basic` mit hohem Threshold mountet behalten.** Abgelehnt, weil selbst ein bei kurzen Tests inerter Provider in längeren Sessions History-Ersetzung erlaubt und die Minimal-Komposition von Modellkapazitäts-Metadaten und dem Token-Meter abhängig lässt.

**`fs-local` nach Editor-Entfernung behalten.** Abgelehnt, weil keine der beiden Minimal-Kompositionen einen weiteren Filesystem-Consumer hat. Den Provider zu behalten würde den Runtime-Roster vergrößern, ohne eine modellsichtbare Capability hinzuzufügen.

**Ein Cordis-Leaf für Web- und Python-SDK-Start verwenden.** Abgelehnt, weil ein Web-Preset Agent-gescopte Services zu einem bestehenden Multi-Session-Host beiträgt, während das Python-SDK einen vollständigen Prozess mit dem JSON-RPC-Server und seinen prozessweiten Dependencies starten muss.

**Das angeforderte Modell nach `DSH_MODEL` spiegeln.** Abgelehnt, weil der Direct-Adapter Modell-ids außerhalb seines advisory Katalogs akzeptiert und Fallback-Kontext-Metadaten für sie auflöst. Spiegeln erzeugt zwei Eingaben für eine Auswahl; der SDK-Initialize-Request ist maßgeblich, während `DSH_MODEL` nur ein Convenience-Default in `minimal.py` bleibt.

## Konsequenzen

Minimal-Sessions fassen frühere History nie zusammen oder ersetzen sie und fügen nie einen Runtime-Context-Snapshot hinzu; Caller müssen Turns innerhalb der Kontextkapazität des gewählten Modells halten und dürfen sich nicht auf modellsichtbare Nennung stehender Sandbox- oder Approval-Policy verlassen. Die beiden Launch-Pfade teilen ihre Ein-Tool-, Kein-Filesystem-, Kein-Kontext- und Keine-Compaction-Garantien und behalten zugleich unterschiedliche, ihren Ownern angemessene Prompt- und Modellkonfiguration. Der Python-SDK-Pfad kommuniziert ausschließlich über das gebundelte `dsh`-stdio-JSON-RPC-Profil.
