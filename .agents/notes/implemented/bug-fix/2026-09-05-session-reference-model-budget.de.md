# Agent Note: Modellrelative Session-Referenz-Budgets

Status: implemented

[English](2026-09-05-session-reference-model-budget.md) | [中文](2026-09-05-session-reference-model-budget.zh.md) | Deutsch

## Problem

Ein festes 64-KiB-Referenzbudget verwirft auf Modellen mit großem Kontext nützlichen Quellkontext. Der Ziel-Session-Header beschreibt einen früheren Request, während Agent-Options das Routing vorgeben; keines identifiziert notwendigerweise das für den eintretenden Schritt gewählte Modell.

## Entscheidung

[Session-reference](../../../../packages/context/session-reference/README.de.md) beobachtet das abgeschlossene `system-prompt/assemble`-waterfall mit einem lokalen prepend-Listener und speichert dessen Provider-/Modell-Paar in einer per Agent geschlüsselten WeakMap. Die Vorbereitung löst diese Route über den optionalen LLM-Service auf; direkte Vorbereitung vor jeder Assemblierung nutzt Agent-Options. Diagnosen ohne Agent aktualisieren die Map nicht.

Jede Quelle erhält `max(65536, floor(contextWindow × 4 × referenceContextFraction))` Bytes, mit einem Default-Anteil von `0.2`. Vier Bytes pro Token ist eine Größenheuristik. Ein explizites `maxReferenceBytes` umgeht die Modellabfrage und bleibt exakt. Fehlende Route, Service, Adapter oder Kapazität behalten den Bodenwert; andere Abfragefehler und Abbruch propagieren. Ein fehlender Adapter hindert Stream-Middleware nicht daran, die Route zu bedienen.

## Erwogene Alternativen

**Header oder Options bei jedem Schritt lesen.** Beide können nach einem Live-Wechsel ein veraltetes Modell wählen. Die abgeschlossene Assemblierung legt die von der Modellauswahl erfasste Route offen.

**Request-Routing während pre-step neu assemblieren oder neu dispatchen.** Diese Operationen wiederholen Plugin-Effekte und können eine andere Auswahl erfassen. Ein lokaler Beobachter braucht weder Loop-Änderungen noch eine weitere öffentliche Routing-API.

## Konsequenzen

Das Budget wächst mit der Modellkapazität, ohne Projektion, Retention oder Preview-Policy zu ändern. Es bleibt pro Quelle, keine aggregierte Token-Reservierung. Der Listener ist effect-eigen und disposable; die Map hält keine Agents. Fokussierte Tests decken den Bodenwert, die Anteilsumrechnung, explizite Overrides, Live-Auswahl, fehlende Metadaten, Abbruch, Abfragefehler und Listener-Entfernung ab.
