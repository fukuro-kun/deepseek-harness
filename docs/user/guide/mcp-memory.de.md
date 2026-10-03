# Einen Drittanbieter-Memory-MCP-Server verbinden
[English](mcp-memory.md) | [中文](mcp-memory.zh.md) | Deutsch


Diese drei **standardmäßig deaktivierten Referenzkonfigurationen** verbinden ein Speichersystem über [`@deepseek-ai/dsh-mcp-client`](../../../packages/mcp/mcp-client/README.de.md) mit DSH. Wählen Sie eine aus oder kopieren Sie die gleiche generische MCP-Zeile für einen anderen Server.

Diese Drittanbieterkonfigurationen dienen ausschließlich als Interoperabilitätsbeispiele. Ihre Aufnahme impliziert keine Endorsement-, Empfehlungs-, Partnerschafts- oder fortlaufende Unterstützungszusage durch DeepSeek.

## Was DSH übernimmt

DSH parst das ausgewählte Cordis-Overlay, startet einen konfigurierten stdio-Befehl oder verbindet sich mit einer konfigurierten Streamable-HTTP-URL, entdeckt MCP-Tools und stellt sie als `mcp__<serverName>__<tool>` bereit. DSH lädt den Server **nicht** herunter, initialisiert seine Datenbank, wählt sein Modell oder seinen Embedding-Anbieter, erstellt ein Cloud-Konto, migriert Anbieterdaten oder überwacht einen separaten HTTP-Dienst. Bei stdio startet und stoppt der generische Client den Kindprozess mit dem DSH-Plugin-Lebenszyklus; bei HTTP muss der Upstream-Dienst bereits laufen.

Die stdio-Bridge entfernt vor dem Starten eines Kindprozesses bewusst Umgebungsvariablen, deren Namen üblicherweise Credentials identifizieren, sowie alle `DSH_*`-Variablen; andere Umgebungsvariablen werden vererbt. Jedes Beispiel fügt nur die Baseline-Override hinzu, die es benötigt. Wenn eine optionale Upstream-Funktion ein weiteres Secret benötigt, fügen Sie diese Variable der Zeile `config.env` hinzu, anstatt das Secret direkt ins YAML zu schreiben.

## Wählen Sie eine aus

| System | Getesteter Pin | Transport | Upstream-Voraussetzung |
|---|---:|---|---|
| [Memorix](https://github.com/AVIDS2/memorix) | `memorix@1.3.0` (`500792cad3144142293bfbb20acb4841c9f7fcfa`) | stdio | Node 22.18+ und `npm install --global memorix@1.3.0` |
| [MCP Reference Memory](https://github.com/modelcontextprotocol/servers/tree/main/src/memory) | `@modelcontextprotocol/server-memory@2026.7.4` (`6dd0a683e198783e30feabf7abaf42f925bd18b1`) | stdio | `npm install --global @modelcontextprotocol/server-memory@2026.7.4` |
| [Engram](https://github.com/Gentleman-Programming/engram) | `v1.20.0` (`ba9e46ced152c37a7cb9e576153c41995873e2fc`) | stdio | Go 1.25.10+ und `go install github.com/Gentleman-Programming/engram/cmd/engram@v1.20.0`, oder die passende Release-Binary |

## Eine aktivieren

Übergeben Sie ein Overlay an DSH:

```sh
dsh web --patch "$PWD/apps/cli/config/examples/mcp-memory/memorix.cordis.yml"
```

Ersetzen Sie den Dateinamen durch `mcp-reference-memory.cordis.yml` oder `engram.cordis.yml`. Der Pfad kann auf eine kopierte Datei überall auf der Festplatte verweisen. In der mitgelieferten Composition ist kein Speicherserver enthalten, daher bleiben alle drei deaktiviert, wenn `--patch` weggelassen wird.

Um die Auswahl über mehrere Läufe beizubehalten, mergen Sie den einzelnen `insert`-Patch der gewählten Datei in eine User-Patch-Schicht — `$DSH_HOME/profiles/<name>/cordis.patch.yml` für ein Profil oder `$DSH_HOME/cordis.patch.yml` für alle Profile auf dem Rechner. Überschreiben Sie keine bestehende Datei: Sie könnte bereits unrelated User-Patches enthalten.

## Anbieter-Einrichtung

### Memorix

```sh
npm install --global memorix@1.3.0
dsh web --patch "$PWD/apps/cli/config/examples/mcp-memory/memorix.cordis.yml"
```

Memorix arbeitet im lokalen heuristischen Modus ohne LLM- oder Embedding-Dienst. Konfigurieren Sie optionale Anbieter in Memorix' eigener `~/.memorix/config.toml` oder der Projektdatei `memorix.toml`. Das Beispiel übernimmt die Git-Projekt-Identität aus dem DSH-Arbeitsverzeichnis und verwendet Memorix' eigenes Standardverzeichnis `~/.memorix/data`. Setzen Sie `MEMORIX_DATA_DIR` vor dem Starten von DSH, um dies zu überschreiben.

### MCP Reference Memory

```sh
npm install --global @modelcontextprotocol/server-memory@2026.7.4
dsh web --patch "$PWD/apps/cli/config/examples/mcp-memory/mcp-reference-memory.cordis.yml"
```

Dieser Referenzserver speichert einen lokalen Knowledge Graph und stellt Entity-, Relation-, Observation-, Read-, Search- und Open-Tools bereit. Er benötigt keinen Modell- oder Embedding-Dienst. Das Beispiel speichert die JSONL unter `$HOME/.dsh-mcp-reference-memory.jsonl` statt im Installationsverzeichnis des npm-Pakets. Setzen Sie `MEMORY_FILE_PATH` vor dem Starten von DSH, um dies zu überschreiben.

Die Suche ist case-insensitive Substring-Matching über Entity-Namen, -Typen und Observations, keine semantische Suche. Der Server fügt keine Embeddings, automatische Zusammenfassung, Konfliktlösung oder Vergessens-Policy hinzu.

### Engram

```sh
go install github.com/Gentleman-Programming/engram/cmd/engram@v1.20.0
dsh web --patch "$PWD/apps/cli/config/examples/mcp-memory/engram.cordis.yml"
```

Engram verwaltet Speicherung und Projektauswahl selbst: Es verwendet standardmäßig `~/.engram`, erkennt das Git-Projekt aus dem DSH-Arbeitsverzeichnis und akzeptiert `ENGRAM_DATA_DIR` oder `ENGRAM_PROJECT` als Umgebungs-Overrides.

## Optionale gemeinsame Modell-Anweisung

Fügen Sie diese kurze, anbieterneutrale Anweisung Ihren bestehenden Modell-Anweisungen hinzu, wenn die Tool-Beschreibungen des Servers die Speichernutzung nicht zuverlässig auslösen:

> Wenn der Nutzer Sie bittet, sich etwas zu merken, rufen Sie ein Memory-Write-Tool auf. Wenn historische Informationen relevant sein könnten, durchsuchen Sie den Speicher und verwenden Sie die relevanten Ergebnisse.

Dies ist nur additive Anleitung. Die Beispiele ersetzen nicht die System-Prompt-Persona von DSH.

## Schreiben, Recall in neuer Session und Verwendung verifizieren

Verwenden Sie einen eindeutigen Wert und lassen Sie den Speicher-Scope des Anbieters durchgehend unverändert:

1. In DSH-Session A fragen Sie: `Remember that my validation drink is lapsang-<unique suffix>.` Bestätigen Sie, dass das Modell das Write-Tool des Anbieters aufgerufen hat und das Tool Erfolg zurückgegeben hat.
2. Erstellen Sie DSH-Session B im selben laufenden Host. Kopieren Sie nicht die Konversation von Session A. Fragen Sie: `What is my validation drink? Check memory.` Bestätigen Sie, dass das Modell das Search- oder Recall-Tool des Anbieters aufgerufen und den Wert zurückgegeben hat.
3. Noch in Session B fragen Sie: `Use that preference to suggest one drink for the meeting.` Bestätigen Sie, dass die Antwort den abgerufenen Wert verwendet.

Eine neue DSH-Session ist erforderlich; ein Host-Neustart nicht. Ein abgestürzter MCP-Kindprozess löst automatische Wiederverbindung mit Backoff und ein Tool-Re-Sync aus; Tools bleiben gelistet und Aufrufe schlagen nur während des Ausfalls fehl; nachdem das Reconnection-Budget erschöpft ist, werden die Tools deregistriert und die Wiederverbindung stoppt bis zu einem Reload oder Neustart. Die anfängliche Discovery ist asynchron, warten Sie also auf die `mcp__...`-Tools des Anbieters, bevor Sie den ersten Validierungs-Prompt senden.

## Einen weiteren MCP-Server einbinden

Kopieren Sie die gleichen Eintragsfelder und verwenden Sie eine eindeutige `id` und `serverName`:

```yaml
- insert:
    - id: memory-my-server
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: my-memory
        transport: stdio
        command: my-memory-mcp
        args: []
        env: {}
        cwd: !!js process.cwd()
```

Für einen Remote-Server verwenden Sie stattdessen `transport: streamable-http`, `url` und `headers`. Installation, Identität, Authentifizierung, Modelle, Embeddings, Persistenz und Lizenzierung des jeweiligen Anbieters bleiben in der Verantwortung des Anbieters.
