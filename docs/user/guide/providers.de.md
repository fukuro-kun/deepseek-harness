# Modelle konfigurieren
[English](providers.md) | [中文](providers.zh.md) | Deutsch


Dieser Leitfaden setzt voraus, dass du die Web UI über das [Root-README](../../../README.de.md#run) gestartet hast. Modelländerungen wirken bei der nächsten Anfrage, ohne den Server neu zu starten.

## DeepSeek konfigurieren

Öffne **Settings → Models**. Die DeepSeek-Karte bietet ein API-Key-Feld; gib den Key ein und speichere.

![The Models page: the DeepSeek card, with Add provider and Add a custom provider below it](providers-models-page.png)

Keys sind Write-Only. Die Seite erhält nach dem Speichern einen redigierten Deskriptor, niemals das Literal-Secret. Der Key wird in `$DSH_HOME/.credentials.yaml` gespeichert, während die Settings nur dessen Credential-Referenz behalten.

## Einen eingebauten Provider hinzufügen

Wähle **Add provider** und wähle einen Provider, den dsh mitliefert; die Liste zeigt Provider-IDs wie `anthropic`, `openai`, `moonshotai` für Kimi oder `zai` für GLM. Gib den API-Key ein und speichere. Der installierte Katalog liefert Endpoint, Protokoll und Modellliste.

Provider, die sich per OAuth anmelden, wie Codex, werden hier noch nicht unterstützt.

## Einen benutzerdefinierten Provider hinzufügen

Wähle **Add a custom provider** für ein Firmen-Gateway, einen selbstgehosteten Server oder einen Provider, der im installierten Katalog fehlt. Gib eine kleingeschriebene Provider-ID, Base-URL, API-Protokoll, Credential und mindestens ein Modell an. Das **API-Protokoll** muss das sein, das dein Gateway spricht, und das Formular bietet drei: `openai-completions` für OpenAI Chat Completions, `openai-responses` für die OpenAI Responses API und `anthropic-messages` für die Anthropic Messages API. Ein Provider spricht ein Protokoll, sodass ein Gateway, das zwei bedient, zwei Provider benötigt.

![The custom provider form: Provider ID, display name, base URL, API protocol, and API key](providers-custom-form.png)

Die Provider-ID ist permanent, weil Anfragen, gespeicherte Sessions, Modell-Defaults und Credential-Referenzen sie verwenden. Um einen Provider umzubenennen, füge einen neuen Provider hinzu und lösche den alten. Display-Name, Base-URL, Protokoll, Credential und Modelle bleiben editierbar.

### Modelle entdecken

Wähle unter **Model catalog** die Option **Fetch available models**, um den Endpoint zu fragen, welche Modelle er bedient. Die Anfrage verwendet die Base-URL, das Protokoll und den Key, die aktuell im Formular stehen, oder den gespeicherten Key eines gespeicherten Providers, und die Antwort öffnet einen durchsuchbaren Picker: suche, markiere die gewünschten Modelle und wähle **Add selected**. Nichts wird gespeichert, bis du den Provider speicherst oder erstellst.

Discovery liest die Listenformate, die gängige Gateways veröffentlichen, aber nicht jeder Endpoint antwortet in einem von ihnen, also behandle es als Komfort, nicht als Garantie: wenn es fehlschlägt oder nichts auflistet, füge die Modell-IDs von Hand hinzu und sie funktionieren genauso. Ein eingebauter Provider wird immer aus dem installierten Katalog beantwortet, auch wenn seine Base-URL auf ein Gateway zeigt; führe also Discovery über einen benutzerdefinierten Provider aus, um zu sehen, was das Gateway wirklich bedient.

## Ein Modell auswählen

Konfigurierte Provider erscheinen im Modell-Picker. Die Auswahl eines Modells macht es auch zum Default für neue Sessions. Eine Session, die bereits eine Anfrage gesendet hat, behält das in ihrem eigenen Log aufgezeichnete Modell.

Wenn ein gespeicherter Default einen Provider nennt, der gelöscht wurde, zeigt der Composer **Select model** und blockiert die Eingabe, bis ein anderes Modell ausgewählt wird.

## Erweiterte Konfiguration

Der generierte [Plugin-Konfigurationskatalog](../../config-catalog.de.md) listet jedes unterstützte Feld und jeden Default für jedes Plugin; [`dsh-llm-pi-ai`](../../config-catalog.de.md#deepseek-aidsh-llm-pi-ai) ist der Provider-Abschnitt, den diese Seite konfiguriert. Die [`dsh-llm-pi-ai`](../../../packages/llm/llm-pi-ai/README.de.md)- und [`dsh-llm-deepseek`](../../../packages/llm/llm-deepseek/README.de.md)-Referenzen besitzen direkte `settings.yaml`-Konfiguration, Katalog-Auflösung, Reasoning-Steuerung, Credentials und Adapter-Fehler.

::: tip Das Formular ist absichtlich klein
Die Models-Seite exponiert nur, was eine Route zum Existieren braucht: den API-Key, Display-Name, Base-URL, API-Protokoll und für jedes Modell seine ID, den Display-Namen, das Context-Window und die Max-Output-Token. Jedes andere Feld — Reasoning-Effort-Level, Image-Input, Request-Compatibility-Switches, Header, Timeouts, Retry-Policy — wird in `$DSH_HOME/settings.yaml` gesetzt, demselben Dokument, das die Seite schreibt. Editiere es direkt, oder, wenn der Browser auf derselben Maschine wie der Server läuft, öffne es mit **Open configuration file** im Settings-Header; die Adapter lesen es bei der nächsten Anfrage neu, sodass nichts einen Restart braucht. Die Unterabschnitte unten behandeln die Felder, die die meisten Gateways brauchen.
:::

### Image-Input

Ein Modell, das du von Hand eingibst, wird als Text-only behandelt, bis es etwas anderes deklariert, weil nichts einen Endpoint fragen kann, welche Modalitäten er akzeptiert. Ein Bild an ein solches Modell anzuhängen wird vor dem Senden abgelehnt und nennt das Modell beim Namen.

Ein Vision-Modell auf einem benutzerdefinierten Provider braucht also eine Zeile. Das Formular hat kein Feld dafür; füge `input` zum Modell in `$DSH_HOME/settings.yaml` hinzu:

```yaml
llm-pi-ai:
  providers:
    my-gateway:
      apiKeyEnv: GATEWAY_API_KEY
      api: openai-completions
      baseURL: https://gateway.example/v1
      models:
        - id: legacy-chat
        - id: vision-preview
          input: [text, image]
```

`input` akzeptiert `text` und `image` und gilt nur für dieses Modell, sodass eine Route beide Arten bedienen kann. Das Weglassen — oder das Schreiben einer leeren Liste, was dasselbe bedeutet — behält, was der installierte Katalog für dieses Modell aufzeichnet, und fällt für ein Modell, das der Katalog nicht beschreibt, auf die Route-`defaultInput` zurück.

Wenn alle von Hand eingegebenen Modelle Bilder akzeptieren, setze den Fallback einmal auf die Route statt auf jedes einzelne:

```yaml
llm-pi-ai:
  providers:
    vision-gateway:
      apiKeyEnv: GATEWAY_API_KEY
      api: openai-completions
      baseURL: https://vision.example/v1
      defaultInput: [text, image]
      models:
        - id: first-model
        - id: second-model
```

`defaultInput` ist ein Fallback, kein Override, und hat den Default `[text]`: bei einem eingebauten Provider antwortet es nur für Modelle, die sein Katalog nicht beschreibt, sodass es nie Bilder von einem Katalog-Modell entfernt, das sie hat. Eng einen solchen ein mit dem eigenen `input` des Modells. Ein eingebauter Provider hat keine `models`-Liste, in die es eingetragen wird, also schreibe es unter `modelOverrides`, verschlüsselt nach Modell-ID:

```yaml
llm-pi-ai:
  providers:
    anthropic:
      modelOverrides:
        claude-sonnet-4-5:
          input: [text]
```

Jede Liste muss mindestens eine Modalität nennen, außer der eines Modells selbst, wo eine leere Liste dasselbe bedeutet wie das Weglassen. Eine unbekannte Modalität wird überall abgelehnt, wo sie geschrieben wird.

Beide Felder stellen eine Behauptung über deinen Endpoint auf, anstatt ihn zu prüfen. Ein Modell, das Bilder deklariert, die sein Endpoint nicht bedient, wird hier nicht abgefangen; der Provider lehnt die Anfrage stattdessen ab.

### Reasoning-Effort

Der Modell-Picker bietet ein **Effort**-Menü für ein Modell, das Reasoning-Level deklariert. Die Modelle eines eingebauten Providers erben ihre Level aus dem installierten Katalog. Ein von Hand eingegebenes Modell deklariert keine, sodass der Effort-Eintrag im Menü nicht erscheint und der eigene Default des Endpoints entscheidet, ob das Modell denkt. Deklariere die Level mit `reasoningEfforts` in `$DSH_HOME/settings.yaml`:

```yaml
llm-pi-ai:
  providers:
    my-gateway:
      apiKeyEnv: GATEWAY_API_KEY
      api: openai-completions
      baseURL: https://gateway.example/v1
      reasoning: high
      models:
        - id: my-reasoner
          reasoningEfforts:
            off:
            high: high
            max: max
```

Jeder Schlüssel ist ein Level, das das Menü anbietet, und sein Wert ist die Schreibweise, die als `reasoning_effort` auf dem Wire gesendet wird, sodass `max: xhigh` ein Level für ein Gateway mit eigenem Vokabular umbenennt. Nur `off` darf leer bleiben, weil für die meisten Endpoints Nicht-Denken die Abwesenheit des Parameters ist. Das `reasoning` der Route ist das Level, das verwendet wird, solange eine Session keines gewählt hat; das Auswählen eines Effort im Picker speichert es, mit dem Modell, als Default für neue Sessions.

Ein leeres `off` sendet nichts, was nur ein Modell stoppt, das auf Anfrage denkt; ein `off` mit einem Wert sendet diesen Wert als `reasoning_effort`. Ein Modell, das denkt, wenn es nicht angewiesen wird aufzuhören — DeepSeek V4 hinter einem OpenAI-kompatiblen Gateway zum Beispiel — braucht `compat.thinkingFormat: deepseek`, was `off` `thinking: {type: disabled}` senden lässt und jedes andere Level `thinking: {type: enabled}` neben dem Effort senden lässt:

```yaml
      models:
        - id: deepseek-v4-pro
          compat:
            thinkingFormat: deepseek
          reasoningEfforts:
            off:
            high: high
            max: max
```

Ein Modell eines eingebauten Providers, dessen Gateway nicht reasoned, verliert seine Level mit `reasoningEfforts: false` unter `modelOverrides`; einen Effort dafür auszuwählen wird dann als `UNSUPPORTED_REASONING_EFFORT` abgelehnt. DeepSeeks eigene Route braucht nichts davon: ihre Modelle bieten bereits `off`, `low`, `high` und `max`, und `llm-deepseek.reasoningEffort` setzt den Default, von dem der Picker startet:

```yaml
llm-deepseek:
  reasoningEffort: max
```

### Request-Compatibility

Ein Gateway kann einen funktionierenden Key unter einer erreichbaren Adresse halten und trotzdem jede Anfrage ablehnen. pi-ai entscheidet die Form einer Anfrage — welche Rolle den System-Prompt trägt, welches Feld den Output deckelt, wie ein Thinking-Level reist — aus der URL des Endpoints, und eine Adresse, die es nicht erkennt, wird angesprochen, als sei sie OpenAI selbst. Die meisten OpenAI-kompatiblen Gateways lehnen mindestens eine Sache ab, die OpenAI akzeptiert.

Zwei machen den Großteil davon aus. Ein Modell, das Reasoning deklariert, hat seinen System-Prompt als `role: "developer"` gesendet, was viele Gateways rundweg ablehnen, und die Output-Deckel wird als `max_completion_tokens` gesendet, was ein Server, der nur `max_tokens` kennt, ablehnt. Das Formular hat für keines von beiden ein Feld; korrigiere sie auf der Route in `$DSH_HOME/settings.yaml`:

```yaml
llm-pi-ai:
  providers:
    my-gateway:
      apiKeyEnv: GATEWAY_API_KEY
      api: openai-completions
      baseURL: https://gateway.example/v1
      compat:
        supportsDeveloperRole: false
        maxTokensField: max_tokens
      models:
        - id: my-model
```

Das `compat` einer Route ist der Default für ihre Modelle, und das eines Modells gewinnt Feld für Feld, sodass ein Modell korrigiert werden kann, ohne die Route zu wiederholen:

```yaml
      models:
        - id: my-model
        - id: my-reasoner
          compat:
            thinkingFormat: deepseek
```

Was keiner setzt, behält den Wert des installierten Katalogs für dieses Modell, und was der Katalog nicht beschreibt, fällt auf pi-ais Erkennung. Gib jedem Switch, den du nennst, einen Wert: ein leer gelassener Schlüssel (`supportsDeveloperRole:`) wird abgelehnt statt ignoriert, weil ein leerer Wert löschen würde, was der Katalog weiß, ohne etwas an seine Stelle zu sagen. Ein Name, den kein Protokoll akzeptiert, wird ebenfalls abgelehnt, und die Meldung listet die verfügbaren.

Jeder Switch gehört zu den Protokollen, die ihn deklarieren, sodass ein Switch, der auf einem `api` gültig ist, auf einem anderen abgelehnt werden kann — die Meldung nennt, was dieses Protokoll anbietet. Wie `input` oben stellt ein Switch eine Behauptung über deinen Endpoint auf, anstatt ihn zu prüfen: einen Switch zu setzen, den dein Gateway nicht braucht, sendet einfach eine andere Anfrage.

Jeder Switch, seine akzeptierten Werte und die Protokolle, die ihn nehmen, sind unter `PiAiCompatProfile` in der [generierten `dsh-llm-pi-ai`-Konfigurationsreferenz](../../config-catalog.de.md#deepseek-aidsh-llm-pi-ai) aufgelistet — die aus der Quelle abgeleitet ist, sodass sie nicht hinter dem zurückbleiben kann, was der Adapter akzeptiert.

## Fehlerbehebung

- **`MISSING_CREDENTIAL`** — Speichere den Provider-Key über die Models-Seite oder stelle die referenzierte Umgebungsvariable bereit.
- **`UNKNOWN_MODEL`** — Wähle ein konfiguriertes Modell oder füge das fehlende Modell zum benutzerdefinierten Provider hinzu.
- **Fetch available models gibt 401 zurück** — Prüfe den Key. Model Discovery ruft den OpenAI-kompatiblen `GET /models`-Endpoint auf; gib Modelle manuell ein für Endpoints, die ihn nicht anbieten.
- **Fetch available models meldet weder ein `data`-Array noch ein `models`-Objekt** — Die Liste des Endpoints liegt in einem Format, das Discovery nicht liest. Gib die Modelle von Hand ein.
- **Das Gateway lehnt jede Anfrage ab, obwohl Key und URL stimmen** — Seine Request-Form unterscheidet sich von OpenAI. Beginne mit `compat.supportsDeveloperRole: false` und `compat.maxTokensField: max_tokens` auf der Route.
- **Nur Reasoning-Modelle schlagen fehl** — pi-ai sendet ihren System-Prompt als `developer`-Rolle, die das Gateway ablehnt. Setze `compat.supportsDeveloperRole: false`.
- **Das Effort-Menü erscheint nicht für ein von Hand eingegebenes Modell** — Es deklariert keine Level. Füge `reasoningEfforts` zum Modell in `settings.yaml` hinzu.
- **`off` stoppt ein DeepSeek-Modell nicht am Denken** — Ein leeres `off` sendet überhaupt kein Reasoning-Feld, und ein Endpoint, der standardmäßig denkt, denkt weiter. Setze `compat.thinkingFormat: deepseek` auf dem Modell oder der Route.
- **Ein Compat-Switch wird wegen fehlendem Wert abgelehnt** — Ein Schlüssel, nach dessen Doppelpunkt nichts steht. Gib ihm einen Wert oder entferne den Schlüssel, um den des installierten Katalogs zu behalten.
- **Ein Bild wird vor dem Senden abgelehnt** — Das Modell deklariert keine Bild-Modalität. Gib einem Modell eines benutzerdefinierten Providers `input: [text, image]`; auf DeepSeeks eigener Route wähle einen Image-fähigen Eintrag aus dem konfigurierten Katalog (`deepseek-flash` als Default) und bestätige, dass dein Gateway dieses Modell mit Bild-Eingabe bedient.
- **Der Provider lehnt eine Anfrage mit Bild ab** — Das Modell deklariert Bilder, die sein Endpoint nicht bedient. Entferne `image` aus der Liste, die sie gewährt hat — dem `input` des Modells oder dem `defaultInput` der Route — und starte dann eine neue Session: das angehängte Bild bleibt im Session-Log, sodass dieselbe Anfrage wiederholt wird, bis die Session davon abrückt.
