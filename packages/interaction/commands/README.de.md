---
description: "Menschliche Slash-Command-Registry für interaktive UIs: Plugin-eigene Commands, die direkt gegen einen Agent laufen, ohne eine Modellnachricht zu erzeugen — für Nutzer und Maintainer, die Command-Oberflächen zusammensetzen oder erweitern."
kind: "package-reference"
---

# @deepseek-ai/dsh-commands

[English](README.md) | [中文](README.zh.md) | Deutsch

## Überblick

`dsh-commands` lässt Nutzer `/command [input]`-Aktionen in interaktiven Harness-UIs ausführen, ohne das Command oder sein Ergebnis in eine Modellnachricht zu verwandeln. Commands können Input-Hints anzeigen, Attachments akzeptieren und genau einen Agent adressieren, während ein globales Command gleichen Namens für andere Agents erhalten bleibt. Jeder zugelassene Lauf wird im Session-Log des empfangenden Agents aufgezeichnet, während die UI das abgerechnete Ergebnis außerhalb der Modellhistory rendert. Verwende es für direkte menschliche Kontrollen in der `dsh`-CLI oder dem Web-Client; UI-lose Demos und ACP-Automation stellen diese Command-Oberfläche nicht bereit.

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

Komponiere diesen Service, wenn eine interaktive UI Nutzern ermöglichen soll, agent-seitiges Verhalten per Slash-Commands statt Modell-Prompts zu steuern. UI-lose Demo-Spines und ACP-Automation stellen keinen Command-Adapter bereit und brauchen ihn nicht.

### Ein Command registrieren

Ein Plugin registriert ein Command mit `ctx.commands.register()`: einen lowercase-Namen, eine in der Discovery angezeigte Beschreibung, einen optionalen `input`-Hint und einen Handler, der gegen den empfangenden Agent läuft.

```text
ctx.commands.register({
  name: 'plan',
  description: 'Enter plan mode',
  input: { hint: '<message>' },
  handler: ({ agent, rawInput }) => {
    // Runs directly against the agent; no model message is created.
    return { kind: 'success', text: 'plan mode selected' }
  },
})
```

Der Handler gibt `success` oder `error` zurück plus optionalem UI-Text, den der Adapter rendert. `recordInput` defaultet auf true; ein Command, dessen eigenes autoritatives Domain-Event die Payload bereits trägt, setzt es auf false, damit das Session-Log den Input nicht dupliziert. Dasselbe Name zweimal in einem Scope zu registrieren wirft.

### Command-Syntax

Eine Command-Zeile beginnt mit einem Slash an Byte null, einem lowercase-Namen aus Buchstaben, Ziffern, `_` oder `-`, dann entweder Ende des Inputs oder Whitespace. Alles nach dem Namen — einschließlich des Trenn-Whitespaces — ist der `rawInput` des Commands, und das Command besitzt seine eigene Grammatik dafür. Zeilen, die syntaktisch kein Command sind oder ein unbekanntes Command benennen, werden vom Adapter zurückgewiesen, statt zu einem Modell-Prompt zu werden.

### Agent-scoped Commands

Eine schlichte Registrierung ist global. Ein Command-produzierendes Plugin, das unterhalb des eigenen Kontexts eines Agents gemountet ist, deklariert seine `commands`-Injection und registriert ein exakt agent-scoped Command, das die globale Definition gleichen Namens nur für diesen Agent verschattet.

### Attachments

Ein Command kann `input.attachments` deklarieren, um Composer-Bilder und generische Dateien zu akzeptieren. Der Executor erzwingt die Deklaration: Attachments an ein nicht-deklarierendes Command, ein fehlender Attachment-Store, eine unbekannte Session-scoped File-Upload-Quittung oder ein über dem Limit liegender Bild-Batch werden jeweils als Fehler abgerechnet, bevor der Handler läuft. Bilder überqueren den Command-Wire als Base64-Input; generische Dateien zitieren Quittungen aus ihren abgeschlossenen Hintergrund-Uploads, sodass die Command-Submission ihre Bytes nie erneut liest. Zugelassene `ImageBlock`s und `FileBlock`s erreichen den Handler als ein eingefrorenes `invocation.attachments`-Array in der Auswahlreihenfolge des Nutzers, und der Handler besitzt ihre modelsichtbare Verwendung.

### Dispatch aus einem Adapter

Ein interaktiver Adapter ruft `execute(agent, line, attachments, signal)` mit dem exakten empfangenden Agent, der vollständigen Command-Zeile und den geordneten Attachments der Submission auf. Er gibt das abgerechnete `CommandExecution` zurück — das normalisierte Ergebnis plus seine Lifecycle-`commandId` — oder `undefined` bei ungültiger Syntax oder unbekanntem Namen. `list(agent)` und `find(agent, name)` bedienen die Discovery nach agent-scoped Verschattung.

### Cancellation

Das Abort-Signal des Callers stoppt das Warten der Registry auf einen Handler; ein Handler, der das Signal ignoriert, kann seine eigenen externen Side-Effects fortsetzen, nachdem der Caller aufgehört hat zu warten. Ein gecancelter oder geworfener Handler rechnet im Log als `command/done`-Fehler ab.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) beschrieben; dieser Abschnitt erklärt, wie die Registry gebaut ist und wo ihre Verträge liegen.

### Source-Map

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | `CommandRuntime`-Service: Registrierung, Scoping, Dispatch, Lifecycle-Events |
| [`src/types.ts`](src/types.ts) | Command-Definition, Descriptor, Execution- und Ergebnistypen |
| [`src/brand.ts`](src/brand.ts) | `CommandId`-Brand für Lifecycle-Pairing-IDs |
| [`src/invariant.ts`](src/invariant.ts) | Invarianten-Companion, der `command/run` mit `command/done` pro Session-Log paart |

### Lifecycle-Events

`execute()` minted eine `commandId`, appended `command/run` bevor der Handler läuft und appended `command/done` bei der Abrechnung mit Outcome-Kind und wörtlichem Text; die exakten Payload-Felder stehen in [`src/index.ts`](src/index.ts). Ein erfolgreiches Ergebnis kann über `sourceEventSeq` ein früheres nicht-command autoritatives Domain-Event benennen; ein geworfener oder abgebrochener Handler rechnet als `kind: 'error'` ab. Beide Events sind direkte eigenständige nur-Log-Appends: kein Turn wrappt sie, und die Persistenz drained sie zu normalen Checkpoints und beim Teardown. Admission-Misses (ungültige Syntax oder unbekannter Name) loggen nichts.

### Scoping

Registrierungen leben in globalen und agent-scoped Layern, die pro Agent über `ScopedLayers` gemergt werden. Die Child-Injection-Form — ein Command-produzierendes Plugin, das unterhalb von `agent.ctx` gemountet ist, deklariert seine eigene `commands`-Injection — bewahrt den Agent-Scope, ohne den Core-Agent-Loop von einem UI-Service abhängig zu machen. Doppelte Namen innerhalb eines Layers scheitern bei der Registrierung, und Registrierung oder Entfernung benachrichtigt jeden `commands/change`-Observer, damit live Adapter die Discovery refreshen können; Observer-Fehler werden geloggt und können die Mutation weder vetoes noch spätere Observer aushungern.

### Attachment-Admission

Attachment-Durchsetzung geschieht im Executor: Bilder werden über `admitEncodedImages` committet, Dateien über den einzigen Session-aware Receipt-Provider aufgelöst, und der Executor stellt ihre ursprüngliche gemischte Reihenfolge wieder her, bevor er den Handler aufruft. Eine Validierungszurückweisung startet keine Attachment-Schreibvorgänge. Ein Bild-Storage-Fehler kann unerreichbare content-addressed Objekte für spätere Sammlung hinterlassen, veröffentlicht aber keine modelsichtbare Nachricht. Cancellation wird vor dem Lauf des Handlers honoriert. Command-Fehler lassen Draft und Attachment-Karten des dispatchenden Composers intakt.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der paketweite Vertrag nicht reicht. Sie führen vom geteilten Command-Vokabular zu den Design-Belegen und angrenzenden Oberflächen.

- [Commands-Subsystem-Referenz](../../../docs/subsystems/commands.de.md) — Registry-Semantik, Input-Metadaten und die `ctx.commands`-Cordis-Oberfläche.
- [Command-Registrierungs-Agent-Note](../../../.agents/notes/implemented/feature/2026-07-19-plugin-command-registration.de.md) — der Grenz- und Dispatch-Vertrag hinter diesem Service.
- [Interaction-Gruppenkarte](../README.de.md) — benachbarte Approval-, Permission- und Question-Pakete.
- [Plan-Mode-Paket](../../plan/plan-mode/README.de.md) — ein ausgelieferter Command-Produzent, der modelsichtbare Arbeit treibt.

-----

<a id="model-experience"></a>
## Model Experience

### Direkte menschliche Commands

#### Was das Modell sieht

Die Registry selbst submitted nichts. Bekannte Slash-Commands führen in der UI-Command-Ebene aus, und ihr `CommandResult`-Text wird nicht als User-Message submitted. Unbekannter Slash-Command-Input wird von ausgelieferten Adaptern zurückgewiesen, statt zu einem Modell-Prompt zu werden. Ein Command-Produzent kann den empfangenden `Agent` explizit verwenden; zum Beispiel submitted [`dsh-plan-mode`](../../plan/plan-mode/README.de.md#model-and-human-interactions) nach Auswahl des Plan-Modus die optionale Nachricht und geordneten Attachments aus `/plan [message]`. Der Executor lässt Attachments nur zu dauerhaften Objekten zu; der deklarierende Produzent entscheidet, ob und wie sie zu modelsichtbarem Nachrichteninhalt werden.

#### Token-Effekt

Command-Discovery, -Ausführung und UI-Ausgabe fügen keine Modell-Tokens hinzu. Explizite Agent-Arbeit, die ein Command-Produzent schedult, hat denselben Token-Effekt wie der entsprechende Agent-Input.

#### KV-Cache-Effekt

Registry-Metadaten, Command-Input und direkte Ausgabe treten nie in einen Model-Request ein und beeinflussen dessen Cache nicht. Eine mutierte Domain besitzt jeden späteren Cache-Effekt.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, was die Registry nicht bietet. Sie sind aktuelle Paket-Constraints, kein UI-Rückstand.

- **Nur unstrukturierter Text-Input** — Formulare, Completion-Schemas und typisierte Argumente bleiben command-eigene Parsing-Angelegenheiten.
- **Kooperative Side-Effect-Cancellation** — der Dispatch hört bei Abort auf zu warten; Handler müssen das Signal honorieren, um Arbeit zu stoppen, die bereits in externe Systeme entkommen ist.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
