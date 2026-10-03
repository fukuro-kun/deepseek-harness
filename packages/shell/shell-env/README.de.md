---
description: "Die verwaltete DSH_*-Shell-Umgebung für Benutzer und Maintainer, die die Umgebung auswählen, konfigurieren oder erweitern, mit der jeder Shell-Aufruf des Modells läuft."
kind: "package-reference"
---

# @deepseek-ai/dsh-shell-env
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

`dsh-shell-env` stellt die vertrauenswürdige `DSH_*`-Umgebung bereit, mit der jeder Shell-Aufruf des Modells läuft — bash oder pwsh: eingebaute Fakten wie `DSH_HOME`, `DSH_SHELL=1` und die `DSH_SESSION_ID` des Agent. Plugin-Autoren können eigene Fakten mit deklarierten Keys registrieren; diese werden pro Ausführung gesammelt und mit ihrem Plugin disposed; doppelter Besitz oder nicht deklarierte Laufzeit-Keys schlagen laut fehl, statt still zu überschreiben. Die Registry ändert nichts sonst, das das Modell sieht — die Shell-Tools besitzen ihre eigenen Schemas und Prompts. Wähle sie in jeder Komposition, die ein Shell-Tool für das Modell mountet; die Konfiguration wählt nur das Harness-Home-Verzeichnis.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Lade dieses Plugin in jeder Komposition, die ein Shell-Tool für das Modell mountet (`dsh-tool-bash` oder `dsh-tool-pwsh`): Jeder Foreground- oder Background-Shell-Aufruf läuft dann mit einer frisch gesammelten verwalteten Umgebung statt mit den `DSH_*`-Werten, die der Prozess geerbt hat.

### Was jeder Shell-Aufruf erhält

Jeder Aufruf erhält `DSH_HOME` (das absolute Harness-Home), `DSH_SHELL=1` und, bei Agent-Aufrufen, `DSH_SESSION_ID` (die id der aufrufenden Session).

### Eigene Umgebungsfakten hinzufügen

Andere Plugins tragen Fakten bei, indem sie einen Contributor mit einem stabilen Namen, der vollständigen Menge der `DSH_*`-Keys, die er zurückgeben darf, einer Beschreibung pro Key und einem Resolver registrieren, der die Werte für eine Ausführung berechnet:

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-shell-env'

export const inject = ['shellEnv']

export function apply(ctx: Context): void {
  ctx.shellEnv.register({
    name: 'deployment-region',
    variables: { DSH_DEPLOYMENT_REGION: { description: 'Current deployment region.' } },
    resolve: execution => execution.agent === undefined ? {} : { DSH_DEPLOYMENT_REGION: 'cn-north' },
  })
}
```

Contributors müssen jeden Key deklarieren, den sie zurückgeben; ein nicht deklarierter oder nicht-string Wert lässt den Aufruf fehlschlagen. Die Registrierung wird mit dem registrierenden Plugin disposed, sodass ein Hot-Reload eines Plugins seine Fakten entfernt.

### Das Harness-Home wählen

Das einzige Config-Feld wählt das als `DSH_HOME` exponierte Home-Verzeichnis; die Standard-Auflösungsreihenfolge ist die `dshHome`-Config, dann die Umgebungsvariable `$DSH_HOME`, dann `~/.dsh`.

| Feld | Standard | Bedeutung |
|---|---|---|
| `dshHome` | `$DSH_HOME`, dann `~/.dsh` | Absolutes Harness-Home, das als `DSH_HOME` exponiert wird |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-shell-env) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Was schiefgehen kann

Zwei Contributors, die denselben Key deklarieren, oder ein Contributor, der einen reservierten Built-in beansprucht (`DSH_HOME`, `DSH_SHELL`, `DSH_SESSION_ID`), lassen das Plugin-Laden laut fehlschlagen. Ein `DSH_*`-Key muss Großbuchstaben mit Unterstrichen sein (zum Beispiel `DSH_REGION`), und eine fehlende Beschreibung lässt die Registrierung fehlschlagen.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter der Registry und zeigt auf den Code, der sie umsetzt; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig beschrieben.

### Designphilosophie

- **Vertrauenswürdiger Namespace, pro Aufruf neu gebaut.** Die Umgebung ist ein Harness-eigener `DSH_*`-Namespace: Der Shell-Executor verwirft geerbte `DSH_*`-Werte und merged den aktuellen Snapshot der Registry für jede Ausführung, sodass verschachtelte Harnesses und nebenläufige Parent/Child-Agents keine stale Identitäten leaken können, und `process.env` wird nie verändert.
- **Deklarierter Besitz, laute Konflikte.** Contributors deklarieren ihre Keys im Voraus, sodass doppelter Besitz vor dem ersten Kommando erkannt wird; Resolver dürfen nur deklarierte Keys zurückgeben.
- **Built-ins bleiben hier.** `DSH_HOME`, `DSH_SHELL` und `DSH_SESSION_ID` sind für die Registry reserviert; Contributors können sie nicht beanspruchen.

### Source Map

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg, `ShellEnvRegistry`-Service und die eingebauten Fakten |
| — | Es wird kein Runtime-Invariant-Companion veröffentlicht; die Umgebungsregistry validiert Besitz und gesammelte Werte bei jeder Registrierung/Sammlung; sie veröffentlicht keinen unabhängigen Snapshot, den ein Companion gegenprüfen könnte. |

### Sammlung

`collect(execution)` beginnt mit den Built-ins, fügt die Session-ID hinzu, wenn die Ausführung einen Agent trägt, und merged dann die aufgelösten Werte jedes registrierten Contributors, sortiert nach Contributor-Name. Das Ergebnis ist ein eingefrorener, nach Keys sortierter Snapshot, der über `ShellExecRequest.dshEnv` weitergereicht wird. `list()` enumeriert Deklarationen, ohne Resolver auszuführen, und kann daher ausführungsabhängige Werte nicht widerspiegeln.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Vertrag nicht ausreicht. Sie führen von der Shell-Familie zum Executor-Seam und den generierten Katalogen.

- [Shell-Paketkarte](../README.de.md) — die Bash-Capability-Familie und ihre Rollen.
- [Bash-Executor-Subsystem](../../../docs/subsystems/shell.de.md) — der `ctx.shell`-Seam, über den die Tools ausführen.
- [tool-bash](../tool-bash/README.de.md) — das Bash-Tool, das diese Umgebung konsumiert.
- [tool-pwsh](../tool-pwsh/README.de.md) — das pwsh-Tool, das diese Umgebung konsumiert.
- [home-paths-Paket](../../util/home-paths/README.de.md) — wie `DSH_HOME` aufgelöst wird.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-shell-env) — jedes akzeptierte Config-Feld und seine Quelldeklaration.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über die Shell-Tools (`dsh-tool-bash`, `dsh-tool-pwsh`), die die verwalteten `DSH_*`-Fakten dieser Registry in jedem Shell-Tool-Aufruf exponieren.

#### KV-Cache-Effekt

Die verwaltete Umgebung tritt nie in das Request-Präfix ein und invalidiert daher keine Provider-Cache-Wiederverwendung; die Definitionen der Shell-Tools und der aktuelle Request-Envelope besitzen jede Präfix-Änderung.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann die Registry schlecht passt oder Sorgfalt erfordert. Sie sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **`list()` enumeriert nur Plugin-beigesteuerte Variablen** — Registry-eigene Built-ins (`DSH_HOME`, `DSH_SHELL`, `DSH_SESSION_ID`) sind nicht enthalten, daher dürfen Diagnostics-, Prompt- oder UI-Code `list()` nicht als erschöpfenden Umgebungskatalog behandeln.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
