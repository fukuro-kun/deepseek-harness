# Agent Note: Das einzige Compaction-Backend in sein Service-Paket einklappen

Status: rejected — weitere Compaction-Backends sind geplant, daher bleiben das Service-Definition-Paket und das Basic-Provider-Paket getrennt.

[English](2026-07-19-fold-compaction-package-split.md) | [中文](2026-07-19-fold-compaction-package-split.zh.md) | Deutsch

## Problem

Compaction ist auf zwei Pakete aufgeteilt: `@deepseek-ai/dsh-compaction` besitzt einen abstrakten Service mit zwei Methoden sowie gemeinsame Typen, und `@deepseek-ai/dsh-compaction-basic` besitzt den einzigen vollständigen Provider. Ausgelieferte Konfigurationen laden nur das Basic-Paket, und kein Produktionspaket konsumiert das Service-Definition-Paket unabhängig außer eben diesem Provider.

Die Aufteilung fügt ein Paket-Manifest, ein README, eine Projektgrenze, eine Abhängigkeitskante, eine abstrakte weiterleitende Klasse, generierte Katalogeinträge und Composition-Verdrahtung hinzu, ohne eine Backend-Substitution zu demonstrieren. Die [Capability-Seam-Entscheidung](../../implemented/architecture/2026-06-13-capability-seams.de.md) verlangt eine reale Schnittstelle, Implementierung und einen Consumer statt einer vorauseilenden Aufteilung; die [Compaction-Entscheidung](../../implemented/feature/2026-06-18-compaction-capability-seam.de.md) hält fest, dass ihr unabhängiger Consumer zurückgestellt wurde.

## Vorschlag

Die Basic-Implementierung nach `@deepseek-ai/dsh-compaction` verschieben und `@deepseek-ai/dsh-compaction-basic` entfernen. `ctx.compaction`, `CompactionResult`, die gemeinsamen Transcript- und Tool-Pairing-Helfer, die bestehende Konfiguration und der konkrete Compaction-Algorithmus liegen in einem Paket.

`summarize()` bleibt als geschützter Anpassungshook erhalten. Ein deployment-spezifischer Summarizer kann den bestehenden LLM-Aufruf ableiten oder abfangen, ohne ein zweites Capability-Paket zu benötigen. Ein separates Service-Definition-Paket wird erst wieder eingeführt, wenn ein zweites vollständiges Backend und ein unabhängiger Consumer eine Substitution benötigen.

Bei Annahme dieses Vorschlags sind die implementierte Compaction-Entscheidung und der [Recallable-Compaction-Vorschlag](../../proposed/feature/2026-07-06-recallable-compaction.de.md) zu ändern, damit die Paketverantwortung nur eine dauerhafte Beschreibung hat.

## In Betracht gezogene Alternativen

**Die Aufteilung behalten, weil ein Remote- oder Recall-Backend kommen könnte.** Eine mögliche zukünftige Implementierung rechtfertigt die heutige Paketgrenze nicht. Recall fügt einen Consumer von Compaction-Ergebnissen hinzu, nicht zwingend eine weitere Implementierung, und ein entfernter Summarizer kann den geschützten Hook nutzen.

**Den Provider-Paketnamen auf das Service-Definition-Paket übertragen.** `compaction-basic` als überlebenden Namen zu behalten, ließe den Produktservice wie ein optionales Backend erscheinen. `compact` ist die stabile Service-Identität, die `ctx.compaction` bereits verwendet, und der klarere Einzelpaket-Eigentümer.

## Akzeptanzkriterien

- `@deepseek-ai/dsh-compaction-basic` und seine Workspace-/Paket-Metadaten sind entfernt.
- `@deepseek-ai/dsh-compaction` besitzt die aktuelle Konfiguration, Plugin-Klasse, den Algorithmus, die Typen, Events und gemeinsamen Helfer.
- Bestehende Deployments können das verbleibende Paket mit äquivalenter Konfiguration und äquivalentem modellsichtbarem Verhalten laden.
- Automatische und manuelle Compaction bewahren Cancellation, Locking, Token-Abrechnung, Tool-Pairing, dauerhafte Events, zitierte Quell-Event-Seqs, Retry-Konvergenz und Transcript-Rendering.
- Loader-Composition-, Unit-, Runaway-Turn-, Cancellation-, Snapshot- und Real-Model-Compaction-Tests bestehen; generierte Kataloge und Modulgraphen sind aktuell.

## Risiken

Dies ist eine bewusste Paketnamen-Kontraktion vor dem Release. Embedder, die `@deepseek-ai/dsh-compaction-basic` laden, müssen das Paket wechseln, und eine künftige Backend-Substitution erforderte das erneute Herauslösen einer Grenze. Die Kosten sind nur vertretbar, solange genau eine vollständige Implementierung existiert; die Annahme ist neu zu bewerten, falls zuerst ein zweites Backend landet.
