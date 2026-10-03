# Review-Sessions aus GitHub-Webhooks erstellen
[English](github-review.md) | [中文](github-review.zh.md) | Deutsch


Dieses optionale Overlay fügt `dsh web` einen signierten GitHub-Endpunkt hinzu. Wenn ein Pull Request im konfigurierten Repository von draft zu ready for review wechselt, erstellt die Regel eine betitelte Root-Session unter dem Web Workspace des Repositorys und startet einen nur-lesenden Review-Prompt.

## Voraussetzungen

- Ein lokaler Checkout, den DSH als Web Workspace registrieren kann.
- Ein hochentropisches GitHub-Webhook-Secret, das über die `DSH_GITHUB_WEBHOOK_SECRET`-Credential-Referenz verfügbar ist.
- Ein TLS-Reverse-Proxy oder -Tunnel, der eine öffentliche URL an den Loopback-Listener weiterleiten kann.
- GitHub-Webhook-Abonnement für das Pull-requests-Ereignis mit Content-Type `application/json`.

Das Overlay verwendet standardmäßig das Startverzeichnis als Workspace und `127.0.0.1:3081` als Listener. Überschreibe sie mit `DSH_GITHUB_REVIEW_WORKSPACE` und `DSH_GITHUB_WEBHOOK_PORT`.

## DSH starten

Generiere ein Secret und behalte denselben Wert über Neustarts bei:

```sh
export DSH_GITHUB_WEBHOOK_SECRET="$(openssl rand -hex 32)"
printf '%s\n' "$DSH_GITHUB_WEBHOOK_SECRET"
```

Aus einem Entwicklungs-Checkout:

```sh
export DSH_GITHUB_REVIEW_WORKSPACE=/path/to/deepseek-harness
pnpm dsh web --patch apps/cli/config/examples/github-review/cordis.yml
```

Ein installiertes DSH verwendet dasselbe Overlay über einen absoluten Pfad:

```sh
dsh web --patch /absolute/path/to/github-review/cordis.yml
```

Für ein dauerhaftes Profil platziere `github-ready-review-rule.mjs` neben `$DSH_HOME/profiles/web/cordis.patch.yml`, hänge die Zeilen aus `cordis.yml` an diesen Patch an und starte mit `dsh web`. Die mitgelieferte CLI enthält bereits beide Webhook-Pakete; das Overlay allein aktiviert sie.

## Den dedizierten Endpunkt freigeben

Die Haupt-Web-UI und `/api` bleiben auf Port 3080. Das Overlay mountet einen zweiten WebServer in einem isolierten Realm; dort ist nur `POST /github` registriert, und jeder andere Pfad gibt `404` zurück.

Eine Caddy-Konfiguration kann nur diesen Listener freigeben:

```caddyfile
hooks.example.com {
  route {
    @github path /github
    reverse_proxy @github 127.0.0.1:3081
    respond 404
  }
}
```

GitHub konfigurieren mit:

```text
Payload URL:  https://hooks.example.com/github
Content type: application/json
Secret:       DSH_GITHUB_WEBHOOK_SECRET value
Events:       Pull requests
Active:       yes
```

## Regelverhalten

Die Regel akzeptiert nur Source `primary-github`, Repository `deepseek-harness/deepseek-harness`, Event `pull_request` und Action `ready_for_review`. Sie übergibt den exakten Head-SHA plus ausgewählte PR-Felder an den Review-Prompt, kennzeichnet das JSON als nicht vertrauenswürdige Metadaten und verbietet Datei-, Branch-, PR- oder GitHub-Mutationen.

Die Session-Anfrage wählt den `standard`-Agent-Preset und den `read-only`-Permission-Preset. `workspacePath` wird über `WorkspaceRegistry.create()` kanonisiert, sodass die erste passende Zustellung das Web Workspace bei Bedarf erstellt und spätere Zustellungen es wiederverwenden.

Die HTTP-Antwort ist bewusst schwächer als das Agent-Ergebnis: `202` bedeutet, dass Signatur und JSON akzeptiert und Regelaufrufe im Speicher geplant wurden. Es bedeutet nicht, dass diese Regel gepasst hat oder dass eine Session erstellt wurde.

## Programmatische Erweiterungen

`run()` ist gewöhnliches vertrauenswürdiges JavaScript. Eine Bereitstellung kann einen internen Policy-Service abfragen, bevor sie eine Session-Anfrage zurückgibt:

```js
const response = await fetch('https://policy.internal/pr-review', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ repository: payload.repository.full_name }),
  signal,
})
if (!response.ok || (await response.json()).automaticReview !== true) return null
```

Sie kann auch Repositories auf verschiedene lokale Pfade mappen:

```js
const workspacePath = {
  'deepseek-harness/deepseek-harness': '/path/to/deepseek-harness',
  'deepseek-harness/dsh-sdk': '/path/to/dsh-sdk',
}[payload.repository.full_name]
if (workspacePath === undefined) return null
```

## Zustellungssemantik

Die Webhook-Runtime speichert keinen Zustellungs- oder Ausführungszustand. Wiederholte Zustellung führt die Regel aus und kann eine weitere Session erstellen. Ein Absturz verliert Regelaufrufe, die ihren Prompt noch nicht angenommen haben. Nach der Prompt-Annahme gehört die Arbeit dem regulären Session-Log, der Persistence, dem Workspace und dem Agent-Lebenszyklus.

Das Webhook-Secret authentifiziert nur eingehende GitHub-Daten. Es gewährt weder dem Regelcode noch dem erstellten Agenten ausgehenden GitHub-Zugriff; konfiguriere diese Berechtigung separat, wenn eine Regel oder ein Agent sie benötigt.
