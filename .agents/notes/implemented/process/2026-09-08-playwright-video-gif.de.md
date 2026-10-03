# Agent Note: Playwright-Video erfasst kontinuierliche Browser-Demos

Status: implemented

[English](2026-09-08-playwright-video-gif.md) | [中文](2026-09-08-playwright-video-gif.zh.md) | Deutsch

## Problem

Ein Screenshot-Storyboard lässt Zwischenanimationsframes weg und kann kurzlebige Fortschrittsanzeigen verpassen. Das Erhöhen der kodierten GIF-Bildrate kann keine Bewegung zurückholen, die in den Quellbildern fehlt. Kontinuierliche Aufzeichnung liefert diese Frames, während der verfügbare Browser-Control-Workflow die Interaktion übernimmt.

## Entscheidung

Der [Aufzeichnungs-Skill](../../../skills/record-browser-gif/SKILL.md) behält den verfügbaren Browser-Control-Workflow als bevorzugt. Wenn dieser Workflow `recordVideo` anbietet, erfasst Video Zwischenframes im selben kontrollierten Kontext; andernfalls erfasst der Workflow Screenshots. Eigenständiges, im Repository deklariertes Playwright bleibt der Fallback, wenn Browser-Control nicht verfügbar ist. Bei Video stimmen Viewport- und Aufzeichnungsmaße explizit überein und vermeiden Playwrights Standardskalierung auf 800×800. Der Recorder behält das Seiten-Video, wartet auf Kontextschließung und speichert das fertige WebM vor dem Kodieren.

Ein Encoder akzeptiert entweder eine Videodatei oder ein Screenshot-Verzeichnis. Videoeingabe wählt ein kontinuierliches Intervall, wendet einen deklarierten Wiedergabemultiplikator an und verlängert seinen letzten Frame. Die JSON-Zusammenfassung protokolliert Quelldauer, gewähltes Intervall, Geschwindigkeit, Endhaltezeit sowie kodierte Maße, Dauer, Frameanzahl und Größe. Modus-unpassende Optionen und ungültige Intervalle schlagen fehl. Das Originalvideo bleibt zur Prüfung verfügbar; Trimmen und Geschwindigkeit begründen niemals Modell-Antwortlatenz.

Die [Evidence-Chain-Entscheidung](2026-08-08-browser-gif-evidence-chain.de.md) besitzt Browser-Control-Auswahl, isolierten Anwendungszustand, echte Modellausführung, exakte Commit-Zuordnung und verifizierte Veröffentlichung. Video fügt innerhalb dieser Regeln eine Aufzeichnungsoption mit höherer Kadenz hinzu. Fehlgeschlagene Aufzeichnungen können keine Frames zu einem erfolgreichen Lauf beitragen.

## Betrachtete Alternativen

**Nur die kodierte Bildrate erhöhen.** Das Wiederholen spärlicher Screenshots erfasst keine zusätzliche Bewegung. Screenshots bleiben nützlich für explizite Zustandshalte, angeforderte Storyboards und Browser-Workflows ohne Videounterstützung.

**Einen separaten Recorder installieren oder den Desktop aufzeichnen.** Das Repository deklariert Playwright bereits. Ein weiterer Treiber fügt Setup und Versionsverwaltung hinzu; Desktop-Aufzeichnung kann unbeteiligte Fenster und persönlichen Zustand enthalten.

## Konsequenzen

Kontinuierliche Aufzeichnung bewahrt Zwischenzustände, sodass Prüfer das gewählte Intervall auf sensible Inhalte und Lesbarkeit untersuchen müssen. Rohes Video verbraucht zusätzlichen Scratch-Speicher, und das Kodieren kann Trimmen oder Skalieren erfordern, um das Byte-Limit einzuhalten. Kontextschließung ist Teil einer erfolgreichen Aufzeichnung, keine optionale Bereinigung.

Die lokale Python-unittest-Suite des Encoders ruft echtes ffmpeg und ffprobe auf, um Timing, Palettenreihenfolge, Screenshot-Halte, abgelehnte Optionen, Überschreibschutz und Größenlimits zu prüfen. Sie erfordert die Medien-Voraussetzungen des Skills und wird explizit ausgeführt; Repository-CI stellt diese Medienbinaries nicht bereit. Produktdemonstrationen üben zusätzlich den gebauten Server des Pull Requests und den echten Modellfluss aus.
