# Defensive Muster

[English](defensive-patterns.md) | [中文](defensive-patterns.zh.md) | Deutsch

Hart erarbeitete Regeln für Fehlerklassen: Jedes der folgenden Muster ist eine Klasse von Defekten, die hier tatsächlich ausgeliefert oder beinahe ausgeliefert wurde, formuliert als die Regel, die ihr Wiederauftreten verhindert. Lies dies, bevor du Lebenszyklus-, Nebenläufigkeits-, Unterprozess- oder Teardown-Code schreibst. Die Gegenstücke auf Test-Ebene (echter Einstiegspfad, Welt-Verifikation, Ressourcenverantwortlichkeit) stehen in [testing.md](testing.de.md).

## Orthogonale Ergebnisse unabhängig melden

Ein Ergebnis kann mehrere Dinge zugleich sein — ein Prozess kann timeouten UND mit Exit-Code 0 enden, weil er das Signal abgefangen hat. Gib jede unabhängige Tatsache (`timedOut`, `signal`, `exitCode`) für sich aus; schachtele nie die Meldung eines Flags in den Zweig eines anderen, sonst liest ein Aufrufer einen vorzeitig abgebrochenen Lauf als sauberen Erfolg.

## Öffentliche Verträge auf BEIDEN Seiten einhalten

Wenn eine Implementierung mehrere Repräsentationen eines Ergebnisses empfängt, normalisiere sie, bevor sie durch die öffentliche API zurückgegeben wird. `LlmAdapter.stream()`-Implementierungen dürfen werfen oder `finish {kind:'error'|'aborted'}` emittieren, aber `LlmRuntime.stream()` macht Modell-Anfrage-Fehlschläge nur als terminale Finish-Chunks sichtbar; Middleware- und Consumer-Defekte bleiben geworfen. So müssen Consumer nicht raten, ob eine gefangene Ausnahme vom Provider, einem Wrapper, dem Chunk-Logging oder der eigenen Assemblierung stammt. Dokumentiere den normalisierten Vertrag dort, wo der Typ definiert ist; übe jede Quellform über den realen Consumer aus.

## Asynchroner Zustand ist kein synchroner Zustand

`agent.followup()` hat kein pro-Nachricht-Completion oder -Ergebnis; der Abschluss eines Hintergrund-Jobs rast mit Turn-Grenzen; `reader.close()` feuert sowohl bei EOF als auch bei dispose. Behandle `agent/status` oder `whenIdle()` nie als das Ergebnis eines einzelnen followup: mehrere gequeuete followups, steering und injizierte Arbeit können sich ein `running`-Intervall teilen, während Cancel oder dispose noch nicht gestartete Einträge verwerfen können. Ein Automatisierungs-Aufrufer, der einen Lauf tatsächlich besitzt, muss sein Intervall explizit definieren — beispielsweise vom persistenten Inbox-Quittungspunkt seiner Nachricht bis zum nächsten ganzen-agent `idle` — und jede ausgewählte Ausgabe als intervallweit beschreiben, statt sie kausal dieser Nachricht zuzuschreiben. Diese Schutzmaßnahme wirkt in beide Richtungen: Wenn der erwartete Übergang nie eintreten kann, hängt das Warten, also behandle den „nichts zu warten"-Zweig explizit.

<a id="dispose-must-reach-quiescence-not-just-request-it"></a>

## dispose muss quiescence erreichen, nicht nur anfordern

Ein Teardown, das Kills/Aborts ausgibt, aber zurückkehrt, bevor die Arbeit gestoppt ist, hinterlässt Orphans. Mache Cleanup asynchron und await den Exit der Kinder (kill → await `done`), und schließe Listener-/Notification-Registries VOR dem Killen, damit verspätete Completions still bleiben.

## Callback-Ausnahmen im Dispatcher eindämmen

Ein vom Nutzer gelieferter Listener, der wirft, darf nicht das Promise ablehnen, in dem er läuft, noch die Listener nach ihm verhungern lassen. Umschließe die Dispatch-Schleife mit try/catch und protokolliere; ein schlechter Subscriber darf nie den Kern-Lebenszyklus brechen.

## Niemals untrusted Output die Ambient-Environment oder vorhersagbare Pfade übergeben

Gestartete Befehle erhalten eine bereinigte Environment (entferne `*KEY*`/`*SECRET*`/`*TOKEN*`/`*PASSWORD*`), damit harness-Credentials nicht in Output, `env` oder spill-Dateien leaken können. Temp-/spill-Dateien verwenden ein privates (0700) Verzeichnis, zufällige Namen und exklusive Owner-only-Opens (`'wx'`, `0o600`) — vorhersagbare weltlesbare Pfade laden Symlink-Races und Disclosure ein.

## Link-förmige Pfade mit unlink entfernen

Ein Pfad, der ein Symlink oder eine Windows-Junction sein könnte, wird mit `lstatSync().isSymbolicLink()` geprüft und dann mit `unlinkSync` entfernt: unlink löscht nur den Link und lehnt ein echtes Verzeichnis ab, folgt also nie dem Link in sein Ziel. Windows `rmSync(link)` wirft `ERR_FS_EISDIR` auf einer Junction; rekursives Löschen kann durch eine Junction in ihr Ziel hinabsteigen. Verwende rekursives `rmSync` nur für bekannte echte Verzeichnisse.
