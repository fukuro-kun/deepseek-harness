# Agent Note: Repairable pi-ai settings after catalog changes
[English](2026-09-07-pi-ai-settings-catalog-recovery.md) | [中文](2026-09-07-pi-ai-settings-catalog-recovery.zh.md) | Deutsch

Status: implemented


## Problem

Ein installierter pi-ai-Katalog kann die Gültigkeit unveränderter Benutzer-Settings ändern. OpenRouter-Modelle außerhalb des Katalogs können ein Protokoll erben, solange alle ausgelieferten Modelle übereinstimmen; das Hinzufügen eines zweiten Protokolls entfernt diese Inferenz. Das Entfernen eines Katalogmodells invalidiert auch einen Override, der auf seine frühere Id keyed ist. Den gesamten Settings-Namespace bei der Registrierung abzulehnen lässt unbeteiligte Provider verschwinden und entfernt die Controls, die zur Reparatur der Konfiguration nötig sind.

## Decision

Der pi-ai-Consumer nutzt den bestehenden `validate`-Callback der Settings. Während der Namespace-Registrierung toleriert er Katalogdiagnosen; nach der Registrierung prüft er geänderte Provider strikt gegen die aktuell aufgelöste Sektion. Settings ruft diesen Callback vor der Persistenz bei Update, Ersetzung und Pfad-Mutation auf. Externer Reload nutzt dieselbe strikte Prüfung und behält bei Fehlschlag die zuletzt akzeptierte Sektion. Der Settings-Service und seine öffentliche API bleiben unverändert.

Die initiale Profile-Auflösung behält Katalogdiagnosen, während Schema- und in sich geschlossene Profile-Constraints das Laden weiterhin ablehnen. Writes lösen jeden neuen oder geänderten Provider strikt auf und vergleichen effektive Provider-Werte mit dem committed Snapshot. Unveränderte fehlerhafte Provider blockieren nicht den Edit eines anderen Providers, und Löschen bleibt möglich. Das Editieren einer providerweiten Einstellung validiert alle betroffenen Modelle.

Die Profile-Auflösung behält gültige Modelle neben per-Modell-Fehlern. Ein Override mit fehlendem Referenten behält seine Diagnose, ohne den restlichen Katalog zu deaktivieren. Ein routenweiser Katalogfehler behält seinen Provider und editierbare Settings, liefert aber keine aufrufbaren Modelle. Wenn die routenweite Validierung die Katalogauflösung abbricht, werden der unvollständige Katalog und seine gesammelten per-Modell-Diagnosen verworfen; Modell-Requests auf dieser Route melden den Routenfehler. Der Adapter prüft den aufgezeichneten Fehler des gewählten Modells vor Credentials oder Netzwerk-I/O und meldet `INVALID_CONFIG`. Während des Ladens wird kein Protokoll geraten und keine Benutzerkonfiguration umgeschrieben. Immutable Snapshots halten einen in-flight Request weiterhin auf seiner erfassten Konfiguration.

`LlmConfigurableProvider.error` trägt die erste verfügbare Modelldiagnose für die Provider-Zeile und fällt auf den Routenfehler zurück. Ein Provider-Konstruktionsfehler überschreibt keine gesammelte Modelldiagnose und bewahrt so die konkrete Korrektur für ein fehlendes Protokoll. Das Configurable-Provider-Directory publiziert Diagnoseänderungen, sodass Konfigurationsreparatur den Browser aktualisiert, ohne den Adapter neu zu registrieren. Fehlgeschlagene Modell-Ids bleiben in den Settings, während der Modellselektor bedienbare Einträge erhält. Models-Settings zeigt die Diagnose und behält Edit-/Delete-Controls. Beide Add-Aktionen erfordern ihren zugehörigen Settings-Namespace; das gewöhnliche Add-Menü filtert nicht verfügbare Namespaces heraus.

Dies erweitert die [Provider-Routed-Adapter-Entscheidung](../architecture/2026-07-14-provider-routed-llm-adapters.de.md): Provider-Ownership und Request-Snapshots bleiben unverändert, während Kataloggültigkeit nicht bestimmt, ob Settings verwaltet werden können. Jene Note bleibt für Routing-, Ownership- und Replay-Begründung aktiv.

## Alternatives considered

**Katalogfehler bei der Registrierung ablehnen.** Das verhindert, dass Benutzer eine ansonsten parsbare Konfiguration reparieren, und lässt ein ungenutztes veraltetes Modell unbeteiligte Provider deaktivieren.

**Save-Validierung ebenfalls lockern.** Ein neu eingegebenes Modell ohne inferierbares Protokoll kann sofort abgelehnt werden, mit benanntem Provider und Modell. Es zu akzeptieren erzeugt einen vermeidbaren Request-Time-Fehler.

**Den gesamten Namespace bei jedem Save strikt neu validieren.** Ein alter Fehler eines unbeteiligten Providers würde das Hinzufügen eines gesunden Providers oder das unabhängige Reparieren von Providern blockieren.

**OpenRouter ein festes Routenprotokoll zuweisen.** Ein Routen-Override ersetzt das Protokoll jedes Modells und kann funktionierende Katalogeinträge ändern, die absichtlich eine andere API nutzen.

## Consequences

Upgrade-abhängige Fehler bleiben sichtbar und reparierbar, ohne die Validierung neuer Provider-Edits abzuschwächen. Konfigurationsfehler bleiben von entfernter Modellexistenz unterschieden: Eine katalogexterne Id mit explizitem Protokoll wird akzeptiert, und ihr Endpoint entscheidet, ob diese Id existiert. Skalar- oder Dokumentfehler failen weiterhin früh. Models-Settings erklärt keine Namespace-Registrierungsfehler; diese Fehler erfordern Inspektion der Konfiguration und der Startup-Diagnosen. Keine Settings-API, kein Storage-Format und kein Session-Event wird hinzugefügt; Configurable-Provider-Einträge erhalten ein optionales Diagnosefeld.

## Testing

Adapter-Tests decken gemischte gültige/ungültige Modelle, gelöschte Override-Referenten, unabhängige Provider-Edits, Routenlöschung, Pre-Network-Fehler und Reparatur ab. Eine File-Watcher-Regression verifiziert, dass ungültige externe Edits die zuletzt akzeptierten Profiles behalten und eine reparierte Datei wirksam wird. Die assemblierte Web-Erwartung bootet mit veralteten OpenRouter-Settings, bewahrt zai und beide Add-Controls, lehnt einen ungültigen Save ab, ohne die Datei zu ändern, und repariert die Route durch Entfernen des veralteten Modells. Bestehende Snapshot-Tests bleiben Eigentümer von Request-Freezing und Replay-Verhalten.
