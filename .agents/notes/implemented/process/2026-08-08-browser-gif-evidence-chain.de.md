# Agent Note: Browser-GIFs bewahren eine einzige Beweiskette
[English](2026-08-08-browser-gif-evidence-chain.md) | [中文](2026-08-08-browser-gif-evidence-chain.zh.md) | Deutsch

Status: implemented


## Problem

Ein Browser-Demo-Storyboard kann aus einzeln wahrheitsgemäßen Screenshots bestehen, ohne eine wahrheitsgemäße Ausführung zu beweisen. Die Wiederverwendung globalen Anwendungszustands kann alte Einstellungen oder Sessions zulassen, die Aufzeichnungsautomatisierung kann versehentlich Frames aus getrennten Modell-Runs kombinieren, und ein Chat-Transcript kann einen erfolgreichen Fallback zeigen, ohne die Tool-Ablehnung offenzulegen, die ihn auslöste. Unscharfes Matching auf Accessibility-Namen kann außerdem Prompt-Echos oder Nachkommen-Text statt des beabsichtigten Ergebnisses akzeptieren.

Headless-Produktionsaufzeichnung hat zwei weitere Grenzen. Ein Produkt-Default kann eine native Betriebssystem-Oberfläche öffnen, die Automatisierung nicht bedienen kann, während der Ersatz dieser Oberfläche durch ein Mock oder einen Test-Hook bedeuten würde, dass das GIF den Produktionspfad nicht mehr zeigt. Nach der Veröffentlichung beweist ein erfolgreicher Upload oder Push weder, dass das hochgeladene Asset auf dem Review-Pfad erreichbar und intakt ist, noch dass GitHub das Pull-Request-Markdown als Bild erkennt.

## Entscheidung

Der [`record-browser-gif`](../../../skills/record-browser-gif/SKILL.md)-Workflow behandelt ein Storyboard als eine Beweiskette, gepinnt auf einen exakten Pull-Request-Head. Vor dem Bauen verlangt er einen sauberen worktree und zeichnet dessen Commit-SHA auf. Jeder Run verwendet frisches `DSH_HOME`, `DSH_AGENTS_HOME`, Workspace, Session und isolierten Browser-Zustand, und jeder veröffentlichte Frame stammt aus demselben Server- und modellgetriebenen Szenario-Run. Wenn kein frischer Browser-Kontext verfügbar ist, werden die Cookies und der Site-Storage des exakten Origin vor der Navigation gelöscht. Vorhandener Nutzer-Browser-Zustand wird nur auf Anfrage oder wenn erforderlich verwendet, wird neben dem GIF angegeben und belegt keinen frischen Client-Zustand. Ein fehlgeschlagener Aufzeichnungs-Run wird verworfen und aus frischen Wurzeln wiederholt, statt mit einem anderen Run kombiniert zu werden.

Die Browser-Automatisierung wartet auf eindeutige, exakte semantische Zustände. Wenn die Behauptung einen Tool-Call, eine Ablehnung oder eine Wiederherstellung betrifft, enthält das Storyboard einen Detail- oder Trajectory-Frame, der das Tool benennt, seinen Status oder stabilen Fehlercode zeigt und das nachgelagerte Ergebnis zeigt. Das final kodierte GIF bleibt Gegenstand der Verifikation; wenn ein Betrachter es nicht animieren kann, werden repräsentative Frames aus diesem GIF dekodiert, statt Quell-Screenshots als gleichwertige Evidenz zu behandeln.

Der verfügbare Browser-Control-Workflow bleibt bevorzugt. Wenn er nicht verfügbar ist, verwendet der Recorder die vom Repository deklarierte Playwright-Abhängigkeit in einem isolierten Headless-Browser, statt einen anderen Treiber zu installieren oder den Browser des Nutzers zu öffnen. Eine native Produktions-Oberfläche darf nur über die normale Anwendungskonfiguration durch ein offizielles, per Browser bedienbares Produktions-Backend ersetzt werden, und dieses Override wird neben dem GIF angegeben. Fixtures, Mock-Transports, synthetische Events und reine Test-Hooks belegen keine Echte-Produktion-Behauptung.

Die Veröffentlichung verifiziert die Grenze erneut. Der bevorzugte Weg hängt mit `gh --attach` an (v2.99.0 oder neuer; nur github.com; höchstens 10 MB): Die Body-Datei referenziert den lokalen GIF-Pfad, das Kommando lädt das verifizierte Artefakt hoch und schreibt diese Referenz in-place um, und der Live-Body muss danach die umgeschriebene Upload-URL zeigen, die mit `200` und `image/gif` antworten muss. Wenn attach nicht anwendbar ist — das GIF überschreitet 10 MB, `gh` ist älter oder das Repository ist GitHub Enterprise Server — bleibt der Assets-Branch-Weg: Der Branch enthält nur Medien, die gestagten und veröffentlichten Bytes stimmen mit dem verifizierten Artefakt überein, und ein Private-Repository-Asset wird über authentifizierte API- oder Raw-Requests auf Pfad, Bytegröße, Prüfsumme, Antwortstatus und Medientyp geprüft — dies beweist nur den Review-Pfad für Repository-Mitglieder (die [Dokumentationsseiten-Bilder-Entscheidung](../../archived/process/2026-08-06-doc-site-carries-its-images.md) begründet, warum eine öffentliche Site nicht von einer privaten Raw-URL abhängen kann). Unmittelbar bevor sich der Pull-Request-Body ändert, muss der Live-Head noch dem aufgezeichneten Head entsprechen. Nach der Änderung wird der Live-Head erneut geprüft und muss auf dem aufgezeichneten Wert bleiben; GitHubs Markdown-Renderer muss separat das erwartete Bild erzeugen.

## Erwogene Alternativen

**Frames aus getrennten Runs zulassen, wenn ihre sichtbaren Zustände äquivalent aussehen.** Visuelle Ähnlichkeit belegt weder geteilten Zustand, kausale Reihenfolge noch eine Szenario-Ausführung. Neuaufzeichnen kostet eine weitere echte Runde, bewahrt aber die Aussage, die das Storyboard macht.

**Den Chat-Transcript als ausreichenden Beweis für Tool-Wiederherstellung verwenden.** Eine finale Antwort beweist, dass die Aufgabe abgeschlossen wurde, kann aber verbergen, welches Tool lief, ob der Fehlschlag strukturiert war und ob das Modell sich aus diesem Fehlschlag erholt hat. Ein Trajectory- oder Detail-Frame trägt diese Fakten direkt.

**Unzugängliche native UI durch eine Fixture oder einen Test-Hook ersetzen.** Das erleichtert die Automatisierung, indem es den beobachteten Produktpfad verändert. Die Wahl eines offiziellen Produktions-Backends über die normale Konfiguration hält die ausgeübte Implementierung real und macht den engeren Modus explizit.

**Einem erfolgreichen Upload oder Push vertrauen.** Ein Upload oder Push beweist nur, dass GitHub die Bytes angenommen hat — nicht, dass die Body-Referenz auf das hochgeladene Asset zeigt oder dass das Markdown das Bild rendert. Das erneute Lesen des Live-Bodys und das Rendern über GitHubs Markdown-API prüfen die beiden Publikationsgrenzen, die Reviewer verwenden.

## Konsequenzen

GUI-Evidenz belegt nun eine kausale Ausführung statt einer Collage plausibler Zustände, und Reviewer können sowohl einen strukturierten Tool-Fehlschlag als auch das vollendete Ergebnis prüfen. Die Veröffentlichung erkennt veraltete Pull-Request-Heads, beschädigte oder fehlplatzierte Medien und ungültiges Bild-Markdown, bevor der Body als fertig gilt.

Der Workflow verbraucht zusätzlichen Scratch-Zustand, kann nach einem Aufzeichnungsfehler eine echte Modell-Runde wiederholen und fügt üblicherweise einen Detail-Frame plus Publikationschecks hinzu — Live-Head- und Body-Nachlesungen, Markdown-Rendering und einen Upload-URL-Fetch; der Assets-Branch-Weg fügt seine authentifizierten Asset-Checks hinzu. Headless-Aufzeichnungen können weniger Produktions-Backends nutzen als ein interaktiver Desktop, und jedes gewählte Backend wird neben dem GIF angegeben.
