# Postmortem 0003: Web-agent validierte einen Ersatz-Server statt seines aktuellen GUI

[English](0003-web-agent-gui-feedback-loop.md) | [中文](0003-web-agent-gui-feedback-loop.zh.md) | Deutsch

Status: gelöst

## Executive summary

Ein Web-agent änderte die GUI-Quelle, wusste aber nicht, welche URL und welcher Prozess seine Session hosteten. Er delegierte die Abnahme an den User, behandelte dann einen bloßen Vite-HTTP-200 als Erfolg trotz eines fehlenden `window.__DSH_BOOT__` White-Screen und validierte schließlich einen Ersatz-`dsh web`-Server auf einem anderen Port, während die ursprüngliche Seite bereits rebuildete Artefakte aufgenommen hatte. Der Fix macht die aktuelle URL und den Runtime-Mode modell-sichtbar und shell-querierbar, lehnt Standalone-Vite vor dem Listen ab und verifiziert Production-Refresh und Development-HMR gegen externen State.

## Summary

Die Session lief innerhalb des DeepSeek Harness Web-GUI auf Port 3081, während ihr ausgewählter Workspace ein leeres `test/`-Verzeichnis war. Die Modell-Anfrage nannte weder das GUI noch seinen Source-Checkout, URL, Prozess oder Update-Mode. Repo-Affordances exponierten `apps/web` mit einem Vite-Development-Script, während die volle Browser-Komposition hinter `dsh web` lag.

Die resultierenden Aktionen waren einzeln plausibel, teilten aber kein Abnahme-Ziel. Ein Source-Edit, ein erfolgreicher Build, ein HTTP 200, ein injiziertes Boot-Manifest und die bestehende Seite des Users wurden als austauschbare Fakten behandelt.

Die Evidenz-Quelle ist das persistierte Event-Log für `session-3eb796c2-5159-4686-affe-df8719f6f987`, dessen Header cwd `/Users/tn.shen/Documents/deepseek-harness-gui-master/test` aufzeichnet. Sein initialer Request-Header ist Sequenz 6; der User-facing-Handoff, der Bare-Vite-Launch, der Replacement-Host-Launch, die Boot-Manifest-Probe und die erste 3081-Prozess-Probe sind Sequenzen 30939, 31865, 34309, 34441 bzw. 34681. Die Timeline unten folgt diesen Events, statt Intention aus dem späteren Report zu rekonstruieren.

## Impact

Der User musste drei aufeinanderfolgende Fehler identifizieren: Abnahme wurde an ihn zurückdelegiert; der vorgeschlagene Preview war eine leere Seite; und die gemeldete erfolgreiche URL war nicht die Seite, die er verwendete. Ein unmanaged Replacement-Server überlebte auch den Turn, bis der User ihn herausforderte.

Keine Änderung in dieser Untersuchung startete oder modifizierte die Read-only-3081- und 3082-Trial-Services.

## Timeline

- In Turn 2, nach dem Editieren des Themes, sagte die Sequenz-30939-Message des agent dem User, `pnpm run demo:tui` auszuführen oder eine unspezifizierte Web-App zu öffnen. Sie führte keine assemblierte Web-Abnahme aus.
- In Turn 3 las der agent `apps/web/package.json`, startete Bare-Vite auf Port 5173 bei Sequenz 31865, beobachtete HTTP 200 und erklärte Erfolg. Der Browser warf stattdessen `client-modules: window.__DSH_BOOT__ is missing or not an object` und renderte eine White-Page.
- In Turn 4 fand der agent den vollen `dsh web`-Pfad, rebuildete den Shell, startete einen unmanaged Process auf Port 3334 bei Sequenz 34309 und prüfte nur, ob dieser Ersatz bei Sequenz 34441 200 mit einem Boot-Manifest returned. Er probe-te nie Port 3081.
- In Turn 5 meldete der User bei Sequenz 34556, dass 3081 bereits das neue Theme zeigte. Erst dann, bei Sequenz 34681, inspizierte der agent den existierenden Prozess und entfernte den redundanten Server.

## Root cause

Die Web-Assembly hatte keine modell-sichtbare Identität für das aktuelle GUI, die kanonische URL oder den Runtime-Mode. Die Session-cwd identifizierte korrekt den ausgewählten Workspace des Users, aber das Modell behandelte dieses Projekt-Verzeichnis als Anwendungs-Verzeichnis. Kein dauerhafter Record bezog den GUI-Source-Checkout, gebaute Artefakte, den Serving-Prozess, den Target-Origin und die Browser-Abnahme aufeinander.

Der falsche Startup-Pfad sah legitim aus, weil Bare-Vite HTTP 200 returned. `window.__DSH_BOOT__` wird nur vom vollen Host injiziert, sodass Transport-Readiness nicht Anwendungs-Readiness implizierte. Der erste Regression-Test wiederholte diesen Fehler in einer anderen Form: ein Timeout killte Vite und satisfied eine Nonzero-Exit-Assertion. Live-Reproduktion exponierte diesen False-Positive.

Background-Process-Semantiken wurden auch mit Shell-`&` umgangen, sodass Job-Identity, Completion-Notices, Collection und Cleanup nicht griffen. Port 3334 zu verifizieren bewies daher nur, dass ein zweiter Service funktionierte.

## Hinzugefügte Guardrails

- Der Web-Launcher publiziert die kanonische Loopback-URL in der geloggten `app:web-surface`-Prompt-Section und der managed `$DSH_WEB_URL`-Umgebung.
- Production-Guidance erfordert Rebuilding von Artefakten und Verifizieren der existierenden URL nach Refresh. Development-Guidance erklärt, dass der HMR-Empfänger immer an ist; `pnpm run dev:web` im selben Checkout rebuildet Client-Plugin-Bundles für Refresh-freies Reload, während Shell- und Plain-Package-Änderungen weiterhin Refresh erfordern.
- `apps/web` Standalone-Vite-Serve-Mode lehnt während der Konfiguration ab. Sein Subprocess-Test beweist Natural-Exit und instrumentiert `Server.listen()`, sodass ein transienter Bind nicht unbemerkt passieren kann.
- Geschichtete Real-Path-Tests decken die CLI-Request, exakte Production/Development-Prompts, Shell-Runtime-Fakten, Same-Port-Static-Replacement, Source-Watcher-Rebuild, Host-Stat-Polling und Browser-HMR unter unveränderter Page-Identity.
- PR-Evidenz bewahrt Screenshots der ursprünglichen 3081-Session und eines Real-Model-Before/After-GUI-Lauf; externe Browser-, HTTP-, Prozess- und Session-Log-Beobachtungen tragen die Abnahme.

## Lessons

- Der agent muss versteckte Runtime-Prerequisites kennen, bevor er den User führen kann; Startup-Mode ist Anwendungs-Kontext, kein Tribal-Knowledge.
- HTTP-Readiness, Build-Erfolg und ein Boot-Manifest sind verschiedene Fakten. Abnahme nennt den exakten Origin und beobachtet extern die angeforderte Änderung dort.
- Ein Ersatz-Service kann nicht beweisen, dass eine existierende Seite sich änderte. Long-running-Prozesse verwenden managed Task-Lifecycles, wenn sie tatsächlich angefordert sind.
- Ein Regression-Test muss für den gemeldeten Mechanismus failen können. Prozess-Timeout ist nicht äquivalent zu Fail-fast, und Post-Exit-Port-Verfügbarkeit beweist nicht, dass der Port nie gebunden war.
