---
description: "Client-Tool-Präsentations-Plugin für den dsh-Web-Client: Ganze-Aufruf-Baum-Komposition, der keyed pro-Tool-View-slot und die eingebauten atomaren Tool-Karten."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-tool
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

`dsh-client-ui-tool` ist das Client-Tool-Präsentations-Plugin des dsh-Web-Clients: Es rendert jeden Tool-Aufruf in der Konversation. `ui-conversation` dispatcht jeden geordneten `tool-call`-Conversation-Node über den passenden key von `conversation.chat.node`; dieses Paket rendert dessen root und seine Code-Dispatch-Kinder und dispatcht dann jeden atomaren Aufruf über den keyed slot `tool.call.toolview`. Nicht registrierte Tool-Namen verwenden die generische Karte. Business-UI-Pakete registrieren nur ihre wire-Tool-Namen und atomaren Views — sie paaren keine Session-Events, bauen das transcript nicht neu auf und besitzen nicht die root/subcall-Topologie, weil die Runtime für call/result-Paarung, Lifecycle und die rekursive `subCalls`-Projektion maßgeblich bleibt.

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

Tool-Aufrufe erscheinen in der Konversation als Karten: ein root-Aufrufbaum mit seinen verschachtelten Unteraufrufen, wobei jeder atomare Aufruf von seinem zuständigen View gerendert wird. Nutzer sehen laufende, erfolgreiche, fehlgeschlagene und unterbrochene Zustände, die ausschließlich aus dem eingefrorenen call/result-Slice stammen, und können Dateien öffnen oder Aufrufe über die Host-Callbacks inspizieren.

### Einen Business-Tool-View registrieren

Das zuständige Business-Paket registriert seinen wire-Tool-Namen in `tool.call.toolview`:

```text
ctx.slots.inject('tool.call.toolview', () =>
  ctx.slots.register({
    name: 'tool.call.toolview',
    key: '<wire tool name>',
  }, BusinessToolRow))
```

Die Owner-Payload ist `ToolCallOwnerProps`: `callId`, `toolName`, der eingefrorene `block`, optionale `cwd` und `home`, der session-autorisierte `loadImage`-Loader (für einen View, dessen Ergebnis dauerhafte Bilder trägt) und einfache `openFile`/`inspect`-Callbacks. Ein Code-Dispatch-block behält das `parentCallId` seines Events; ein root-Session-Aufruf hat dieses Feld nicht, sodass descendants über denselben keyed Dispatch laufen — ein registrierter View wie `read_image` rendert dort seine Karte, und nicht registrierte descendants behalten die generische abgeflachte Form. Pfad-Zusammenfassungen werden zuerst relativ zum Session-cwd verkürzt, dann wird ein verbleibendes POSIX-Host-home durch `~` ersetzt; `filePath` und Host-open behalten den vom Autor angegebenen Dateisystempfad. Die Registrierung erhält den normalen Session-slot-Runtime-Anteil, aber keinen React-Node und keinen Runtime-Service.

### Eingebaute Views

Dieses Paket besitzt den generischen Fallback und die eingebauten Präsentationen für shell/pwsh, read, read_image, write/edit, laufende `str_replace_editor`-`create`/`str_replace`, grep/glob, web, todo, question und Code Dispatch. Strukturierte Karten leiten sich direkt aus first-party-rohen Event-Feldern ab; Host-`presentCall`- und `presentResult`-Werte gelangen nie in den Client. Laufende und abgerechnete Standard-`bash`/`pwsh`- und `terminal_send`-Aufrufe im Vordergrund verwenden Terminal-Karten am root und in Code-Dispatch-Kindern, vorbehaltlich derselben Argument-, Ergebnis- und Fehlerprüfungen. Persistente `bash`/`pwsh`-Aufrufe verwenden Terminal-Karten nur solange sie laufen. Shell-Ausgabe, die in einem erkannten spill-policy-Hinweis endet, verwendet erweiterbare generische Ausgabe in shell-Zeilen und generische Ausgabe in Details; ein versetzter oder weggelassener Exit-Marker kann keinen Erfolg begründen. Abgerechnete persistente Shell-Ergebnisse bleiben generisch, weil reset- und Teil-Ausgabe-Diagnosen nicht immer einen einzelnen Prozess-Exit-Status beschreiben; root-persistente Ergebnisse sind erweiterbar, während Hintergrund-Bestätigungen eingeklappt bleiben. Eine erfolgreiche question-Zeile paart Aufruf-Fragen mit Ergebnis-Antworten über ihre stabilen ids und zeigt aufgeklappt lesbare Frage/Antwort-Zeilen. Eine abgebrochene oder unterbrochene Zeile zeigt ihr Urteil und die ursprünglichen Fragen, ohne Antworten zu erfinden. Nicht unterstützte, fehlerhafte oder mehrdeutige Eingaben fallen auf abgeflachten Tool-input/result-Text zurück. `ui-skill` demonstriert eine business-eigene Registrierung für `skill`.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Das Paket realisiert eine Dispatch-Regel: Atomare Tool-Views werden nach wire-Tool-Namen gekeyt und von ihren zuständigen Business-Paketen registriert; dieses Paket rendert nur den Baum und den Fallback.

### Render-Vertrag

`ToolCallTree` erhält einen root-`ToolCallBlock`, der bereits rekursive `subCalls` enthält, den Session-`cwd` und die Callbacks des Owners zum Öffnen von Dateien und Inspizieren von Aufrufen. Es durchläuft die Standard-Aufrufblöcke rekursiv und schickt root und Kinder jeder Tiefe durch denselben atomaren Dispatch-Pfad, ohne eine separate parent-to-children-Map zu abonnieren. Jeder root- und child-Wrapper bewahrt den `data-chat-anchor-key="call:<id>"`- und `data-chat-call-id`-DOM-Vertrag, der für Paging und Selektion verwendet wird.

### Karten


Jede Karte wird an Ort und Stelle im Aufrufbaum gelesen; es gibt keine zweite, vollhöhige Präsentation eines ausgewählten Aufrufs. Zeilen-Renderer teilen ein reines Card-Model für jede Terminal-, read-, diff-, search- und web-Karte, und die Galerie der image-Karte rendert über den tool-eigenen `tool.call.images`-slot. Diese Models validieren rohe Aufrufargumente, Ergebnisinhalt, Fehlerzustand, persistierte Metadaten, Code-Dispatch-`parentCallId` und Session-Pfadfakten. Nicht unterstützte oder fehlerhafte Eingaben verwenden abgeflachten Tool-Ergebnis-Text. Eine Dateipfad-Zusammenfassung öffnet die Datei über das `openFile` des Owners, das die Chat-View zur Textvorschau der rechten Sidebar routet; `inspect` öffnet die Trajectory-View. Karten-spezifische Limits und Fallback-Regeln für die Terminal-, diff-, read-, search- und web-Karten bleiben im [ui-primitives-README](../ui-primitives/README.de.md); das Model der image-Karte in diesem Paket trägt seine eigenen Fallback-Regeln.

Das Terminal-Model verwendet `hasSpillNotice` aus dem browser-sicheren Einstieg `@deepseek-ai/dsh-spill-policy/notice`, kein unabhängiges UI-Muster. Das [spill-policy-README](../../spill/spill-policy/README.de.md#shared-notice-ownership) ist Eigentümer von Hinweis-Formatierung und -Erkennung. Diese Prüfung wählt konservativ generische Ausgabe; übereinstimmender Text kann seine Quelle nicht authentifizieren, und Replay lässt die aufgezeichneten Ergebnis-Bytes unberührt.
</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten decken den Konversations-Host, die View-slots und die Card-Models ab.

- [ui-conversation](../ui-conversation/README.de.md) — die Chat-Oberfläche, die `tool-call`-Nodes an dieses Paket dispatcht.
- [ui-primitives](../ui-primitives/README.de.md) — die Ausgabe-Karten-Atoms, aus denen die eingebauten Views komponieren.
- [ui-skill](../ui-skill/README.de.md) — eine business-eigene Registrierung für das `skill`-Tool.
- [Conversation-Subsystem](../../../docs/subsystems/conversation.de.md) — wie ein business-eigenes Feature einen Conversation-Node registriert.
- [Slot-System-Standard](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.de.md) — das Kompositionsmodell hinter dem keyed slot.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da das Paket eine browserseitige Tool-Präsentationsschicht ist, die geloggte Aufrufe rendert, ohne den Modellkontext zu verändern.

#### KV-Cache-Effekt

Keiner; dieses Paket assembliert oder sendet keine Provider-Anfrage.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren die Dispatch-Tiefe und die View-Eigentümerschaft; sie sind aktuelle Paket-Constraints.

- **Der Host schließt `run_code` aus PTC-mode-Programm-Bindings aus** — Produktions-Events erzeugen eine Dispatch-Ebene; der rekursive Runtime/UI-Vertrag unterstützt Verschachtelung.
- **First-party-Tool-Views sind hier kolokalisiert** — sie können unabhängig über den keyed slot in ihre zuständigen Business-Pakete umziehen.
- **Tool-Texte verwenden den `ui-conversation`-locale-namespace wieder** — Tool-Titel, Zeilen-Chrome und Cordis-freie primitive-Labels nutzen dieses Wörterbuch; presenter-Models behalten locale-keys oder Daten statt gerendertem Wortlaut.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Begleiter veröffentlicht. Die Tool-Komposition existiert nur im Browser und trägt keine Events oder plugin-übergreifenden veränderlichen Zustand bei; slot-Eigentümerschaft wird von ui-slots geprüft.
