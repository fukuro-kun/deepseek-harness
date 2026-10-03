---
description: "Browser-Chat-Target, das Session-Konversations-Nodes, historische Bilder, Aktionen, Lokalisierung und Scroll-State rendert."
kind: "package-reference"
---
# @deepseek-ai/dsh-client-ui-chat
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Verwenden Sie dieses Paket, um einen Browser-Chat aus aufgezeichneten Session-Konversationen zu rendern, einschließlich historischer Bilder, lokalisierter Aktionen und wiederhergestellter Scroll-Position. Die kompakte Anzeige faltet Prozess-Zeilen abgeschlossener Turns, während die finale Antwort und unabhängig nützlicher Kontext sichtbar bleiben; gepackte historische Assistant-Läufe bleiben eingefaltet. Lokale Transcript- und Steering-Submissions erscheinen sofort, bleiben in ihrer ursprünglichen Oberfläche und verschwinden atomar, wenn autoritative Session-Records eintreffen, während gequeuete Submissions außerhalb von Chat bleiben. Das Paket assembliert oder modifiziert keine Modell-Requests.

File-Mention-Provider erhalten die betrachtete Session-ID mit dem Owner des schließenden Turns, sodass Links in geerbte Historie den Fork selbst adressieren können.

## Inhaltsverzeichnis

- [System-Prompt-Zeile](#system-prompt-row)
- [Turn-Token-Usage](#turn-token-usage)
- [Turn-Prozess-Faltung](#turn-process-folding)
- [Scroll-Ownership](#scroll-ownership)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="system-prompt-row"></a>
## System-Prompt-Zeile

Jedes nichtleere angehängte `system/message` besitzt eine eingefaltete Prompt-Zeile, einschließlich eines vollständigen Prompts am Start eines headerlosen Fensters; der Header desselben Steps dupliziert sie nicht. Chat zeigt außerdem eine eingefaltete `System prompt`-Zeile für einen nichtleeren initialen Request, einen expliziten Message-Serien-Start oder einen `system/message`-Surface-Node-Ersatz mit abweichendem Text, wobei der letzte nichtleere überlebende System-Node in Surface-Reihenfolge am `request/header` gelesen wird; ein nicht-initialer Request, dessen vorangehender Header außerhalb des geladenen Historienfensters liegt, zeigt ebenfalls eine. Ein Resume wiederholt die Zeile selbst bei unverändertem System-Text, auch nachdem Pagination den vorangehenden Header und System-Node nachgeliefert hat; serien-interne reine Config- oder reine Tool-Änderungen, Tool-Steps und Retries erzeugen keine Wiederholung, und ein `system/message`-Event wird nie als Transcript-Message gerendert. Die Zeile erscheint vor den User-Messages dieses Requests, passend zum Provider-Envelope, und expandiert zum exakten modellsichtbaren Text mit seinen ursprünglichen Zeilenumbrüchen. Ein Request, dessen System-Node leer ist oder außerhalb des geladenen Fensters liegt, erzeugt keine Zeile, bis die den Node tragende Seite eintrifft.

<a id="turn-token-usage"></a>
## Turn-Token-Usage

Ein abgeschlossener Turn zeigt nur dann eine expandierbare Usage-Zeile, wenn das geladene Fenster `turn/start` enthält und jeder gestartete Modellversuch sichere, exakte Usage meldet. Die Zeile lässt nicht verfügbare optionale Buckets weg. Unvollständige oder widersprüchliche Abrechnung verbirgt die komplette Aufstellung, statt eine Teilsumme zu präsentieren.

-----

<a id="turn-process-folding"></a>
## Turn-Prozess-Faltung

Settings → General exponiert eine persistierte, lokalisierte `Normal`-/`Compact`-Konversations-Anzeige-Präferenz im `ui-chat`-Namespace; `Compact` ist der Default. Normal lässt Prozess-Zeilen sichtbar und rendert kein Turn-Prozess-Control. Im Compact-Modus bleibt der System Prompt während des gesamten Turns unabhängig sichtbar vor dem eröffnenden User. Context-Injection-, Reasoning-, Assistant-Material-, Tool- und Retry-Zeilen bleiben expandiert, solange ein Turn offen ist. Bei `turn/end` wird sein neuester Step nur dann zur Final-Answer-Grenze, wenn er nicht-leeren Text, ein Bild oder einen unbekannten sichtbaren Block enthält — und keinen Tool-Call-Block; vorangehende Context-Injection-, Reasoning-, frühere Assistant-Material-, Tool- und Retry-Zeilen falten dann per Default. Das Control berichtet turn-weite durable Zählungen für Nicht-subagent-Tool-Calls, antwort-tragende Assistant-Messages vor der finalen Antwort und subagent-Delegation-Calls; null-wertige Segmente werden weggelassen, die Tool- und subagent-Zahlen schließen sich gegenseitig aus, und weder System Prompt noch Context Injection tragen eine Zählung bei. Wenn alle drei Zählungen null sind, faltet der Prozess trotzdem und das Control lautet `Thought for a while`. Eine vollbreite Trennlinie unter der Summary separiert sie von der Antwort oder expandierten Prozess-Zeilen. User- und Steering-Messages, System Prompt, Fehler-, Max-Token- und Turn-Tail-Zeilen bleiben außerhalb, und ein geschlossener Turn ohne finale Antwort hält alle Prozess-Nachweise sichtbar. Ein neu verfügbares Prozess-Control wird eingefügt, ohne die relative Reihenfolge bestehender Zeilen zu ändern: Eröffnende menschliche Eingabe steht ab ihrer ersten Projektion vor dem Control und den Prozess-Zeilen, während System Prompt über dieser Eingabe bleibt. Solange ältere Historie über Load earlier verfügbar bleibt, bleiben Prozess-Controls abwesend und keine Member werden versteckt; sobald die Historie vollständig ist, verwendet jeder geeignete geschlossene Turn sofort den eingefalteten Default. Stabile Chat-Node-Seats halten jeden Renderer gemountet, versteckte Member fügen keinen Flow-Abstand hinzu, und ein geschlossenes Control sitzt 8px über seiner Antwort, nur wenn keine unabhängige Eingabe dazwischenliegt. Die Faltung bei Abschluss hängt nicht von der Tail-Follow-Position ab, sodass ein Leser oberhalb des Tails ein Reflow des Transkripts sehen kann. Eine automatische Faltung, die den Tastaturfokus verstecken würde, hält die Gruppe offen und lässt den Fokus an Ort; ein manuelles Schließen fokussiert das Prozess-Control, bevor seine Member versteckt werden. Der session-gescopte Store zeichnet nur manuell expandierte Turn-und-Answer-Step-Generationen auf; eine andere Answer-Generation startet eingefaltet.

-----

<a id="scroll-ownership"></a>
## Scroll-Ownership

Chat stellt semantische Anker über Historien-Prepends und Renderer-Remounts hinweg wieder her. Gepinnte Scroll-Deliveries ohne Leser-Bewegung aktualisieren die Follow-Ownership sofort, bevor nachfolgende Layout-Änderungen ihren Floor invalidieren können. Leser-Bewegung bleibt bis zum Sampling-Intervall oder `scrollend` ausstehend, selbst innerhalb der Follow-Schwelle, sodass Layout-Wachstum kleine Scroll-Gesten nicht auslöschen kann. Solange der Leser am Floor gepinnt ist, folgt `ResizeObserver` dem neuen Floor und wählt den neuesten geladenen Turn, ohne Zeilen-Geometrie zu lesen. Sobald der Leser sich entfernt, bewahren Flow-Höhen-Änderungen die Top-Position, und die Reading-Line-Geometrie wählt den aktiven Turn. Turn-Rail-Previews zeichnen über sticky Markdown-Codeblock-Bannern, während der Rail-Frame innerhalb des Transcript-Bands über dem Composer bleibt.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da dieses Paket geloggten Konversations-State im Browser rendert und nichts Modellseitiges registriert.

#### KV-Cache-Effekt

Keiner; die Chat-Präsentation assembliert oder mutiert keine Provider-Requests.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- **Das Transkript spiegelt das geladene Session-Fenster** — ältere Transcript-Nodes werden erst verfügbar, nachdem der Session Controller die vorangehende Event-Seite lädt. Turn-Navigation ist breiter als das Fenster: Die Rail mergt die geladenen Turns mit der Host-`turnOutline`-Projektion, sodass jeder gestartete Turn eine fest-pitch Markierung bekommt (10px Abstand; eine Leiter höher als der Frame scrollt darin mit Gradient-Fades), und das Aktivieren einer ungeladenen Markierung paginiert Historie über die `turn/start`-Seq des Turns, bevor sie auf seiner Zeile landet. Ohne die Projektion (Assemblies, die `dsh-session-turn-outline` nicht mounten) fällt die Rail auf nur geladene Turns zurück.
- **Rail-Previews sind karten-groß** — eine Prompt-Zeile (50 Zeichen) und bis zu drei Response-Zeilen (120), bei geladenen wie ungeladenen Turns gleichermaßen; die Response eines ungeladenen Turns kommt erst aus der Outline, sobald der Turn abgerechnet ist, sodass ein offener Turn bis dahin seinen Prompt (oder nur die Turn-Nummer) vorschaut.


<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>

**Runtime-Invariante:** Es wird kein Begleiter veröffentlicht. Conversation- und Slot-Registrierung erzwingen Chat-Target-Konsistenz.
