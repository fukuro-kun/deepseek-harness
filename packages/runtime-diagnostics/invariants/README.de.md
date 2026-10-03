---
description: "Runtime-Invarianten-Prüfungen für live Kompositionen: der Registry-Service, der paket-eigene Checks ausführt — für Nutzer und Maintainer, die sie auswählen, konfigurieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-invariants
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

`dsh-invariants` führt paket-eigene Runtime-Checks — Invarianten — innerhalb einer DeepSeek-Harness-Komposition aus: Jedes Paket kann einen `./invariant`-Begleiter ausliefern, der seine eigenen durable Beziehungen (autoritative Event-Streams und mutierbare Snapshots) verifiziert, während die Komposition läuft. Checks laufen automatisch, und ein fehlschlagender Check meldet einen `InvariantError`, der dem Paket zugeordnet wird, das die verletzte Beziehung besitzt. Wählen Sie es für Kompositionen, die selbstprüfende Diagnostik mit globalem Schalter und Paketnamen-Filtern wollen; die Standard-Agent-Komposition mountet es bereits mit den vier Kern-Begleitern, und das alleinige Laden des Services installiert keine Checks.

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

Mounten Sie die Registry, wenn eine Komposition ihre eigenen Runtime-Verträge verifizieren soll, und entscheiden Sie dann, welche Paket-Checks laufen. Der Service legt `ctx.invariants` offen; Begleiter registrieren Checks unter dem exakten npm-Namen ihres Pakets, und jeder Fehlschlag trägt den Namen des besitzenden Pakets.

### Wann Sie es verwenden

Verwenden Sie die Registry für Kompositionen, die live Diagnostik wollen. [`dsh-sdk-minimal`](../../bundle/sdk-minimal/README.de.md) mountet sie mit den vier zustandsbehafteten Kern-Begleitern — `dsh-session`, `dsh-agent`, `dsh-scope` und `dsh-agent-loop`; `dsh-base` lässt Runtime-Diagnostik bewusst weg. Eigene Kompositionen mounten die Registry und fügen Begleiter für jedes weitere geladene Paket hinzu, dessen Verträge sie geprüft haben wollen. Die Registry allein zu laden installiert keine Checks: Sie liefert keine eigenen Produkt-Checks, sodass eine Komposition, die nie einen Begleiter mountet, kein Diagnostikverhalten beobachtet.

### Checks aktivieren und Pakete auswählen

Die Registry ist standardmäßig aktiviert und prüft jedes registrierte Paket, sofern Filter nichts anderes sagen. Verwenden Sie `enabled` als globalen Schalter, `package_allowlist`, um nur benannte Pakete zuzulassen, und `package_blocklist`, um Pakete nach dem Allowlist-Matching auszuschließen — ein Blocklist-Match setzt ein Allowlist-Match außer Kraft. Muster sind groß-/kleinschreibungssensitive JavaScript-Regex-Quellen (unverankert, sofern sie nicht `^` und `$` mitbringen), und ein ungültiger, leerer oder doppelter Eintrag lässt den Service-Start fehlschlagen, statt übersprungen zu werden.

```yaml
- name: '@deepseek-ai/dsh-invariants'
  config:
    enabled: true
    package_allowlist:
      - '^@deepseek-ai/dsh-'
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `enabled` | `true` | Globaler Schalter für alle registrierten Checks |
| `package_allowlist` | `[]` | Regex-Quellen, die Paketnamen zulassen; leer lässt alle zu |
| `package_blocklist` | `[]` | Regex-Quellen, die Paketnamen nach dem Allowlist-Matching ausschließen |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-invariants) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Welche Checks laufen

Jeder Begleiter schützt Beziehungen, die sein Paket besitzt, und ein Begleiter installiert einen Check nur für eine beobachtbare Event- oder Mutierbare-Daten-Beziehung — nie für das Vorhandensein eines Services oder einer Methode. Die ausgelieferten ausführbaren Begleiter decken ab:

| Begleiter | Checks |
|---|---|
| `dsh-session`, `dsh-agent`, `dsh-scope`, `dsh-agent-loop` | Session-Log-Enclosure und Call/Ergebnis-Trace, Agent-Status-Übergänge, scope-gefilterte Dispatch-Subjekte, loop-gebaute Request-Rekonstruktion |
| `dsh-llm`, `dsh-llm-retry`, `dsh-tools`, `dsh-system-prompt` | LLM-Stream-Grammatik, Retry-Fehler-Form, Tool-Pipeline-Stufen-Paarung und eingefrorene Ergebnisse, Prompt-Assembly-Abschnittsnamen |
| `dsh-compaction`, `dsh-hook-protocol`, `dsh-sandbox-policy` | Compaction-Stream-Paarung, Hook-Invocation/Ergebnis-Paarung, Sandbox-Mode-Werte |
| `dsh-fs`, `dsh-subagent`, `dsh-workflow`, `dsh-tool-workflow` | Filesystem-Event-Identität, subagent-Provider- und Start/Ende-Paarung, Workflow-Lebenszyklus-Identität, Workflow-Record-Form |
| `dsh-goal`, `dsh-goal-round-driver` | Durable Goal-Stream-Folds und rekonstruierte Fortsetzungs-Prompts |
| `dsh-permission-presets`, `dsh-user-approval`, `dsh-commands` | Preset-Referenzen auf live Presets, Approval-Asked/Decided-Paarung, Command-Run/Done-Paarung |
| `dsh-jobs`, `dsh-tool-todo`, `dsh-time-context` | Job-Snapshot-Feldbeziehungen, Ganze-Liste-Todo-Form, durable Uhrablesungen |
| `dsh-credentials`, `dsh-settings`, `dsh-storage-domain`, `dsh-workspace` | Commit-Events gegen den live Service- oder Speicherzustand, Entity-Cache-Spiegelung |
| `dsh-agent-presets`, `dsh-session-title`, `dsh-plan-mode`, `dsh-schedule` | Preset-Mount-Platzierung, Titel-Quell-Zitation, Plan-Mode-Payload, Schedule-Stream |
| `dsh-client-hmr`, `dsh-client-modules`, `dsh-client-runtime` | Browser-/Node-Hälfte-Stat-Watcher-Lebenszyklus, Boot-Eintrags-Graph, Slot-Mutations-Versionierung |

Jedes andere Workspace-Paket lässt den Begleiter weg und begründet das paketspezifisch in seinem README.

### Einen Begleiter zu einer eigenen Komposition hinzufügen

Ein Begleiter ist ein normales Plugin, das Sie neben der Registry mounten. Er deklariert die Services, die er braucht, und registriert unter dem exakten npm-Namen seines Pakets; die Registry joint sein Setup, bevor die Registrierung abgeschlossen wird.

```ts
import type { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as SessionInvariant from '@deepseek-ai/dsh-session/invariant'

declare const ctx: Context

ctx.plugin(InvariantRegistry, { enabled: true })
ctx.plugin(SessionInvariant)
```

### Wenn ein Check fehlschlägt

Eine Verletzung wirft einen `InvariantError` aus dem Context, der sie gemeldet hat: Er trägt den stabilen Code `INVARIANT`, den vollständigen npm-`packageName` des besitzenden Pakets und eine Nachricht mit Präfix `invariant violated by "<package>": …`. Der Fehlschlag ist damit einem Paket zurechenbar, ohne dass die Registry Produkt-Code importiert. Ein Begleiter, dessen Installer selbst fehlschlägt, wird disposed und seine Registrierung zurückgerollt, sodass ein kaputter Check keine Teil-Listener zurücklassen kann.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Design hinter der Registry; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) abgedeckt.

### Designphilosophie

- **Produktunabhängige Registry.** Der Service importiert kein Session-, Agent-, Scope- oder Agent-Loop-Paket und enthält keine ihrer Checks; Begleiter tragen Checks neben ihren Besitzern.
- **Echte Beziehungen, keine synthetischen Assertions.** Ein Begleiter prüft eine Event-Stream- oder Mutierbare-Daten-Beziehung, die sein Paket besitzt; das Bestätigen einer Methode, eines Plugin-Namens, einer Injection oder eines festen reinen Ergebnisses ist eine Typ-, Load- oder Unit-Test-Angelegenheit, nie eine Runtime-Invariante.
- **Registrierung reserviert Ownership.** Ein Paketname ist reserviert, auch wenn Filter seinen Installer inaktiv halten, sodass zwei Plugins nie still denselben Namen beanspruchen können.
- **Begleiter-Verdrahtung wird mechanisch erzwungen.** `pnpm run verify-package-invariants` lehnt leere Installer, Installer, die den Reporter weglassen oder ignorieren, falsche Registrierungsnamen, unvollständige Publikations-Verdrahtung und veraltete Verdrahtung für weggelassene Begleiter ab ([Begleiter-Weglass-Notiz](../../../.agents/notes/implemented/simplification/2026-08-28-omit-unneeded-invariant-companions.de.md)).

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `Config`-Schema, `InvariantRegistry`-Service, Selektion, Registrierung, `InvariantError` |
| — | Es wird kein Runtime-Invariant-Begleiter publiziert; Registrierungs-Ownership und Kind-Lebenszyklus sind selbst die Mutationsgrenze des Services; sie aus derselben Registry zu beobachten würde nur ihre Implementierung duplizieren. |

### Selektions- und Registrierungslebenszyklus

`register(packageName, installer)` reserviert den vollständigen npm-Namen und gibt einen effect-scoped Disposer zurück. Ein aktivierter Installer läuft in einem dedizierten Kind-fiber; `installer.inject` deklariert die Services, auf die dieser fiber zugreifen darf, und synchrones oder asynchrones Abschließen wird gejoint, bevor die Registrierung erfolgreich ist. Ein Fehlschlag disposed das Kind und gibt die Reservierung atomar frei. Der Service besitzt jeden Registrierungs-fiber, während der zurückgegebene Disposer auch zum Begleiter-fiber gehört, sodass das Entladen einer der beiden Seiten Listener, Trace-State und die Reservierung entfernt — ein Begleiter kann neu laden und denselben Namen erneut registrieren, ohne zurückbehaltenen Zustand. Session-gestützte Begleiter bauen ihre Baseline aus durable Events neu auf; nur-live Begleiter beobachten Operationen, die nach dem Reload beginnen.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der paketweite Vertrag nicht ausreicht. Sie bewegen sich von der generierten Service-Referenz zur Entscheidungsevidenz und der Gruppenkarte.

- [Runtime-Invarianten-Subsystem](../../../docs/subsystems/invariants.de.md) — die generierte Referenz für `Config`, den Installer, den Service und den Begleiter-Vertrag.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-invariants) — jedes akzeptierte Config-Feld und seine Quelldeklaration.
- [Invarianten-Runtime-Verträge-Agent-Note](../../../.agents/notes/implemented/architecture/2026-07-19-package-invariant-runtime-contracts.de.md) — was eine Runtime-Invariante behaupten darf und das mechanische Gate, das die Begleiter-Verdrahtung erzwingt.
- [Runtime-Diagnostics-Gruppenkarte](../../README.de.md) — benachbarte Diagnostik-Pakete.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da der Beobachter Requests validiert, aber nie deren Kontext umschreibt.

#### KV-Cache-Effekt

Checks beobachten assemblierte Requests und durable State, ohne Request-Inhalt zu mutieren, sodass die Provider-Cache-Wiederverwendung exakt der entspricht, die die zugrundeliegende Komposition erzeugt.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Einschränkungen definieren, wann die Registry schlecht passt oder betriebliche Aufmerksamkeit braucht. Sie sind aktuelle Paket-Constraints, kein Aufgaben-Backlog.

- **Filter sind für die Service-Lebensdauer fixiert** — `enabled`, `package_allowlist` und `package_blocklist` werden einmal beim Start kompiliert; sie zu ändern erfordert ein Cordis-Plugin-Reload.
- **Nur-live Begleiter verpassen Pre-Reload-Operationen** — ein Begleiter, der nur live Operationen beobachtet, kann keine Operationen rekonstruieren, die vor seinem eigenen Reload begannen; session-gestützte Begleiter bauen ihre Baseline aus durable Events neu auf.
- **Request-Rekonstruktion deckt nur loop-gebaute Requests ab** — der `dsh-agent-loop`-Begleiter rekonstruiert Requests, die der Loop explizit gebaut hat; direkte Einmal-LLM-Calls bleiben außerhalb dieses Vertrags, selbst wenn Aufrufer sie einfrieren oder eine Session-id anhängen.
- **Keine Checks ohne Begleiter** — die Registry liefert keine Produkt-Checks; eine Komposition, die nur den Service mountet, beobachtet nichts.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
