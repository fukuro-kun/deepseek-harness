---
description: "Der One-Shot-Codex-subagent-Provider für Nutzer und Maintainer, die ein Produkt-Backend wählen, ein Profile-bundle installieren oder eine unbeaufsichtigte Codex-Delegation konfigurieren."
kind: "package-bundle"
---

# @deepseek-ai/dsh-subagent-codex

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Installiere `@deepseek-ai/dsh-subagent-codex` in ein Profile, wenn delegierte Arbeit in einer echten, unbeaufsichtigten Codex-session im Workspace der parent-session laufen soll. Jede Delegation verwendet einen frischen, isolierten Codex-thread für eine in sich geschlossene Textaufgabe und gibt nur deren finale Antwort oder eine sichere Fehlerdiagnose zurück. Die native Codex-Konfiguration und -Authentifizierung bleiben maßgeblich, während `permissionMode` das nicht-interaktive Freigabe- und Sandbox-Verhalten wählt. Das bundle liefert eine kompatible native Codex-Nutzlast, stellt dem Modell aber erst dann eine capability bereit, wenn ein Delegations-tool konfiguriert ist.

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

Mounte diesen Provider, wenn eine Delegation als echte Codex-session im Workspace des parents laufen soll. Der übliche Weg ist explizit: das bundle in ein Profile installieren, optional die Provider-Zeile konfigurieren und es dem Modell über eine Delegations-tool-Zeile zugänglich machen.

### Das bundle installieren

Installiere das Paket in das Ziel-Profile und starte dieses Profile anschließend neu. Die Installation bringt den offiziellen wrapper und eine kompatible native Plattform-Nutzlast in das Profile; die deklarierte patch-Schicht registriert nur den dormanten Provider und startet keinen Codex-Prozess.

```sh
dsh plugin --profile <name> add @deepseek-ai/dsh-subagent-codex
dsh plugin --profile <name> remove @deepseek-ai/dsh-subagent-codex
dsh --profile <name>
```

Das Entfernen des Pakets zieht den Provider und seinen privaten Runtime-Verschluss beim nächsten Profile-Start zurück. Die Installation steuert die Host-Verfügbarkeit, nicht die Modell-Berechtigung: Das Modell erreicht den Provider nur über eine Delegations-tool-Zeile, die du komponierst.

### Konfiguration

| Feld | Standard | Bedeutung |
|---|---|---|
| `providerName` | `codex` | Nicht-leerer registry-Name auf `ctx.subagents`; jede gemountete Instanz braucht einen eindeutigen Wert |
| `model` | native Codex-Einstellungen | Optionaler nicht-leerer Modellname, fest für jeden thread dieser Provider-Instanz; Weglassen sendet keinen app-server-Override |
| `env` | `{}` | Explizite Kind-Umgebung, über der von Credentials bereinigten parent-Umgebung gelegt |
| `permissionMode` | `never` | Natives nicht-interaktives Freigabe- und Sandbox-Verhalten, fest für jeden thread dieser Provider-Instanz |
| `disposeGraceMs` | `3000` | Karenzzeit zwischen den Terminierungsstufen des geteilten managed-range-Eigners |

| `permissionMode`-Wert | `thread/start`-Felder | Natives Verhalten |
|---|---|---|
| `never` | `approvalPolicy: never`; sandbox weggelassen | Nie nach Freigabe fragen; Ausführungsfehler gehen unter der nativen sandbox ans Modell zurück |
| `approve-for-me` | `approvalPolicy: on-request`, `approvalsReviewer: auto_review`, `sandbox: workspace-write` | Leitet Berechtigungsanfragen durch die automatische Codex-Prüfung ohne Menschen |
| `dangerously-bypass-approvals-and-sandbox` | `approvalPolicy: never`, `sandbox: danger-full-access` | Überspringt Freigabe- und sandbox-Durchsetzung; dieser Wert muss explizit gewählt werden |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-subagent-codex) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc. Ein konfiguriertes `model` wird unverändert an jeden ephemeren `thread/start` weitergereicht; Weglassen lässt die native Modellauswahl in Kraft. Der Provider entdeckt keine Modelle, schreibt keine Aliase um, wählt weder `modelProvider` noch `serviceTier` und setzt keinen fallback. Credential-förmige Umgebungsvariablen werden vor dem expliziten `env`-Overlay entfernt; ein für das Kind bestimmter API-Schlüssel muss also dort angegeben werden.

### Das tool zugänglich machen

Jede Delegations-tool-Zeile nennt einen Provider und braucht einen eigenen `toolName`, sodass das Modell statische tools sieht statt eines dynamischen Provider-Selektors. Vollständige Agent-Presets tragen eine passende Standard-tool-Zeile mit `disabled: true`; kopiere ein preset und entferne dieses Feld, um `subagent_codex` nur den aus der Kopie komponierten agents zugänglich zu machen.

```yaml
- id: jobs
  name: '@deepseek-ai/dsh-jobs-local'
- id: tool-jobs
  name: '@deepseek-ai/dsh-tool-jobs'
- id: tool-subagent-codex
  name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: codex
    toolName: subagent_codex
    backgroundMode: one-shot
    maxDepth: provider-managed
```

Die `one-shot`-policy hält Aufrufe mit weggelassenem oder `false`-`run_in_background` im Vordergrund, während explizites `true` eine parent-eigene Job-id für `job_output` oder `job_kill` zurückgibt; der basis-Host und die vollständigen presets stellen bereits das generische Job-registry und die Steuerungen bereit.

### Was du bekommst

Ein Vordergrund-Aufruf gibt dem Modell die ausgewählte finale Codex-Antwort oder — bei einem fehlgeschlagenen Lauf — einen Fehler mit Stop-Grund und optionaler sicherer Diagnose. Ein Hintergrund-Aufruf gibt zuerst eine Job-id zurück; die generischen Job-Steuerungen liefern später eine Abschlussmeldung und legen dieselbe finale Antwort oder denselben Fehlerstatus über `job_output` offen. Codex-Kommentare, reasoning, tool-Aktivität, rohes stderr und Workspace-Diffs gelangen nie in die parent-session.

### Fehler und Wiederherstellung

Eine Installation, die optionale Abhängigkeiten weglässt, eine nicht unterstützte Plattform verwendet oder die gewählte Nutzlast verliert, lässt den Provider dormant und lässt die erste Delegation bei `initialize` mit der sicheren Kategorie `unknown` und jedem beobachteten Prozessergebnis fehlschlagen; es gibt keinen host-CLI-fallback. Roher wrapper-Text bleibt auf Host-stderr. Ein abgebrochener Lauf geht als `aborted` auf.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie der Provider einen echten Codex-app-server ansteuert und woher das beobachtbare Verhalten kommt; der vollständige Vertrag steht in [Dieses Paket verwenden](#use-this-package).

### Designkonzept

- **Ein frischer Prozess, thread und turn pro Lauf.** Jeder Lauf spawned einen frischen app-server, erstellt einen ephemeren thread und führt exakt einen turn aus; es gibt keine Fortsetzung, kein resume und kein Pooling.
- **Native Konfiguration ist maßgeblich.** Codex-Konfiguration und -Authentifizierung bleiben nativ über parent-cwd, `HOME` und `CODEX_HOME`; der Provider überschreibt nur das optionale Modell und die approval-, reviewer- und sandbox-Felder des threads.
- **Unbeaufsichtigt by design.** approval-, user-input- und MCP-Anfragen werden ohne Menschen beantwortet oder abgelehnt; unbekannte Server-Anfragen lassen den Lauf fehlschlagen.

### Quelltext-Karte

| Datei | Aufgabe |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: config-schema, Provider-Registrierung |
| [`src/run.ts`](src/run.ts) | Der Lauf-Lifecycle, turn-Ausführung, Ergebnisauswahl und Diagnose |
| [`src/wire.ts`](src/wire.ts) | Die minimale app-server-JSON-RPC-wire-Implementierung |
| [`cordis.patch.yml`](cordis.patch.yml) | Die Profile-patch-Schicht, die den dormanten Provider registriert |

### Laufablauf

Ein Start akzeptiert nur eine nicht-leere Folge von Textblöcken und leitet das child-cwd aus der parent-session ab. Er spawned den festen Befehl über die subprocess-seam, führt den `initialize`-→-`initialized`-Handshake aus, bildet den vom Profile gewählten Modus und das optionale Modell auf offizielle `thread/start`-Felder neben `{ cwd, ephemeral: true }` ab und veröffentlicht den Lauf erst, nachdem Codex einen gültigen ephemeren thread zurückgegeben hat. Das veröffentlichte Ergebnis startet exakt einen turn, akzeptiert nur Benachrichtigungen für thread und turn dieses Laufs und wartet auf das maßgebliche `turn/completed`-Terminale. Die neueste `agentMessage` mit `phase: "final_answer"` gewinnt; wenn Codex keine explizite finale Phase sendet, ist die neueste Nachricht mit `phase: null` der Kompatibilitäts-fallback. Ein erfolgreicher turn ohne nicht-leere Antwort geht als Fehler auf. Fehlgeschlagene turns verwenden die groben Kategorien `limit`, `access-policy`, `service`, `transport`, `product-error`, `invalid-result` oder `unknown`; ein früher app-server-Exit verwendet `process`, und zutreffende Verbindungs- und stream-Fehler behalten einen numerischen `httpStatusCode`.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-vertrag nicht ausreicht. Sie führen von diesem Provider zur seam, in die er einsteckt, und zum Schwester-Produkt-Provider.

- [Subagent-Subsystem](../../../docs/subsystems/subagent.de.md) — der service-Vertrag, Provider-Vertrag und die Semantik terminierter Ergebnisse.
- [dsh-subagent-seam](../subagent/README.de.md) — registry und start-API, auf denen sich dieser Provider registriert.
- [Claude-Code-subagent-Provider](../subagent-claude-code/README.de.md) — das Schwester-Produkt-Backend über das offizielle Agent SDK.
- [Claude-Code- und Codex-Backends](../../../.agents/notes/implemented/feature/2026-08-04-claude-code-and-codex-subagent-backends.de.md) — die Design-Aufzeichnung für die Produkt-Provider.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-subagent-codex) — jedes akzeptierte config-Feld und seine Quelldeklaration.

-----

<a id="model-experience"></a>
## Model Experience

### Child-Anfrage

#### Was das Modell sieht

Das Codex-Kind empfängt die eigenständigen Textblöcke als einen turn in einem frischen ephemeren thread. Sein Workspace ist der parent-session-cwd; die gewählte Provider-Instanz fixiert jedes konfigurierte Modell, die Umgebung, die nicht-interaktive Freigabe-policy und den sandbox-Modus, während ein weggelassenes Modell und jede andere Produkteinstellung aus der nativen Codex-Konfiguration stammen. Die ausführbare Version kommt aus der im bundle gepinnten Plattform-Nutzlast.

#### Token-Wirkung

Das Kind bezahlt für einen unabhängigen Codex-Kontext und -turn. Child-tokens gelangen nicht in den parent-Kontext.

#### KV-Cache-Wirkung

Unabhängig vom parent-Anfrage-Cache. Wiederverwendung hängt nur von Codex' eigenem Provider, Modell, Instruktionen, tools und der ephemeral-thread-Anfrage ab.

### Parent-Scheduling und Ergebnisse, indirekt

#### Was das Modell sieht

Über `dsh-tool-subagent` gibt ein Vordergrund-Aufruf dem parent die ausgewählte finale Codex-Antwort oder einen Fehler mit Stop-Grund und optionaler sicherer Diagnose für ein nicht abgeschlossenes Ergebnis. Die Diagnose kann grobe Aktionskategorie, Protokollstufe, zutreffenden numerischen HTTP-Status und beobachtetes Prozessergebnis unterscheiden, ohne Produktprosa oder stderr zu kopieren. Ein Hintergrund-Aufruf gibt zuerst eine Job-id zurück; die generischen Job-Steuerungen liefern später eine Abschlussmeldung, legen dieselbe finale Antwort oder Fehlerstatus-Details über `job_output` offen und lassen `job_kill` einen Abbruch anfordern. Codex-Kommentare, reasoning, tool-Aktivität, rohes stderr, Workspace-Diffs, usage, Produkt-ids, Befehle, Pfade und Protokoll-Nutzlasten werden nicht in die parent-session kopiert.

#### Token-Wirkung

Vordergrund-Eingabe wächst um die zurückbehaltene finale Antwort oder den Fehler. Hintergrund-Eingabe enthält zusätzlich die Startbestätigung, die Abschlussmeldung und etwaige `job_output`-, `job_kill`- oder spätere Statusergebnisse; child-tokens gelangen weiterhin nicht in den parent-Kontext. Dieser Provider fügt selbst kein parent-tool-schema hinzu.

#### KV-Cache-Wirkung

Append-only: Vordergrund fügt ein Ergebnis nach dem wiederverwendbaren parent-Prefix an, während Hintergrund die Job-Bestätigung, die Meldung und spätere Steuer- oder Sammlungsergebnisse anhängt. Hintergrund-Scheduling kann einen durch eine Meldung ausgelösten turn hinzufügen, aber keine dieser Nachrichten schreibt das frühere Prefix um.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann dieser Provider ungeeignet ist oder besondere betriebliche Sorgfalt braucht. Es sind aktuelle Paket-Constraints, kein allgemeiner Codex-Vergleich und kein Aufgabenrückstand.

- **Ein frischer Prozess, thread und turn pro Lauf** — es gibt keine Fortsetzung, kein resume, kein Pooling, keinen Fortschritts-stream und keine Produkt-session-Persistenz.
- **Statische Instanzauswahl** — Profile-Zeilen fixieren Provider-Namen, optionale Modelle und tool-Bindungen; Aufrufe können weder Provider noch Modell dynamisch wählen oder ändern, und jedes zugängliche tool braucht einen eindeutigen `toolName`.
- **Authentifizierung und Kontozustand bleiben nativ** — das bundle liefert die CLI, erstellt aber kein Konto, meldet sich nicht an, vertraut keinem Projekt und schreibt keine Codex-Einstellungen um; Konfigurations- und Authentifizierungsfehler treten mit ihrer Lifecycle-Stufe und dem sicheren `unknown`-fallback auf statt mit einer eigenen öffentlichen Taxonomie.
- **Die native Plattform-Nutzlast ist zur Delegationszeit erforderlich** — Installationen, die optionale Abhängigkeiten weglassen, nicht unterstützte Plattformen sowie fehlende oder beschädigte Nutzlasten scheitern beim ersten Lauf; es gibt keinen host-CLI-fallback.
- **Kompatibilität ist durch Entwicklungsnachweise gepinnt** — ein Upgrade von der verifizierten 0.153.4-Protokollbasis erfordert das Neugenerieren der Upstream-schema-Nachweise und das erneute Laufen der Handshake-, Antwortauswahl-, approval-, Abbruch-, schlüssellosen Echtprodukt- und credentialed-DeepSeek-nonce-Tests.
- **Kein menschlicher Freigabe-Pfad** — bekannte unbeaufsichtigte Freigabeanfragen werden abgelehnt, und unbekannte Server-Anfragen scheitern geschlossen; die drei Profile-Modi schaffen weder einen DSH-Interaktionskanal noch eine allow-policy pro Aufruf.
- **Assistant-Nutzlast ist nur finaler Text** — ein fehlgeschlagener Lauf kann zusätzlich die getrennte sichere Diagnose offenlegen; reasoning, Kommentare, Zwischennachrichten, tool-Verkehr, usage, rohes stderr und Workspace-Diffs bleiben außerhalb der parent-session, während generische Job-ids, Meldungen und Status aus der geteilten Job-Runtime stammen.
- **Keine optionalen geteilten capabilities** — `agentOptions`, Ausgabe-schemas, child-Personas, tool-Filterung und harness-Tiefendurchsetzung werden vom geteilten service für diesen Provider zurückgewiesen.
- **Kein Wall-Clock-Timeout und kein Nebeneffekt-Rollback** — der Aufrufer bricht lange Arbeit ab, und vor dem Abbruch geänderte Dateien oder externe Systeme werden nicht zurückgesetzt.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: offene Fragen und unentschiedene Richtungen. Sie ist ausdrücklich nicht maßgeblich — ausgeliefertes Verhalten und Grenzen stehen in den Abschnitten oben und im Paket-Code.

- **Nutzlastgrößen-Offenlegung** — die aktuelle darwin-arm64-Plattform-Nutzlast packt auf etwa 114 MB und entpackt auf etwa 282 MB; dies sind Offenlegungszahlen, keine Installationsschwellen.
- **Version-gepinntes Protokoll** — die Runtime-Abhängigkeit ist auf `@openai/codex@0.153.4` gepinnt; ein Upgrade erfordert das Neugenerieren der Upstream-schema-Nachweise und das erneute Laufen der credentialed-nonce-Tests.

</details>

**Runtime-Invariante:** Es wird kein companion veröffentlicht. Lifecycle-pairing gehört dem geteilten subagent-service, und die managed-range-Eigentümerschaft gehört dem subprocess-service.
