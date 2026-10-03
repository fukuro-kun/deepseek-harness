# Agent Note: Gepinnte Scroll-Deliveries vor Layoutänderungen abrechnen

Status: implemented

[English](2026-09-07-pinned-scroll-delivery-before-layout.md) | [中文](2026-09-07-pinned-scroll-delivery-before-layout.zh.md) | Deutsch

## Problem

Eine verzögerte Scroll-Stichprobe vergleicht Positionen aus verschiedenen Layouts. Solange Chat gepinnt ist, kann ein Schrumpfen von Composer oder Transcript die Bodenposition des Browsers verschieben; anschließendes Wachstum kann die Browserposition erneut verschieben, bevor `scrollend` oder der Sampling-Timer feuert. Das Follow in diesem Intervall aufzuschieben lässt das Observed-Top-Ledger veraltet und kann Browser-Layoutbewegung als Lesereingabe klassifizieren — Follow wird ohne Lesergeste deaktiviert.

## Entscheidung

[ChatView](../../../../packages/client/ui-chat/src/client/chat/ChatView.tsx) nutzt den vorhandenen Observed-Top-Vergleich, um nicht vom Leser stammende gepinnte Scroll-Deliveries synchron über dieselbe Sample-Operation zu sampeln, die anstehende Arbeit abräumt. Das gibt das Layout-Follow vor weiterem Wachstum frei. Echte Leserbewegung bleibt auch innerhalb der Follow-Schwelle anstehend bis zum vorhandenen Intervall oder `scrollend`: Wachstum darf kleine Gesten nicht auslöschen, bevor sie sich zu einem Scroll-away akkumulieren. Sofortige gepinnte Samples nutzen Scroll-Metriken, nicht Semantic-Row-Geometrie.

## Erwogene Alternativen

**Jede Delivery aufschieben.** Zusammenfassen reduziert Geometriearbeit beim Lesen der History, doch eine gepinnte Browserposition und ihr Boden müssen im selben Layout zugeordnet werden. Ein längeres Timeout oder ein Retry kann die Ownership nicht zurückgewinnen, sobald der veraltete Vergleich sie entwaffnet.

**Jede Delivery synchron sampeln.** Das stellt die Zuordnung wieder her, wiederholt aber auch Semantic-Anchor- und Reading-Line-Messungen während eines Scroll-Bursts eines away-Lesers. Nur die gepinnte Ownership braucht den Sofortpfad.

## Konsequenzen

Gepinnte Deliveries verursachen sofortige Scroll-Metrik-Lesevorgänge. Das Lesen der History behält seine begrenzte Sampling-Kadenz, und explizite Return-to-Bottom-Deliveries räumen jede anstehende Away-Probe ab. [Fokussierte Tests](../../../../packages/client/ui-chat/tests/chat-view.client.spec.tsx) decken Schrumpfen/Nachwachsen vor scrollend, Observer-Wachstum ohne Row-Messungen, erneutes Pinnen mit anstehender Probe, Timer- und scrollend-Sampling sowie Unmount-Abbruch ab. Das [schlüssellose Browser-Szenario](../../../../apps/web/tests/chat-scroll-contract.e2e.ts) deckt gepinntes Senden, echte Scroll-away-Eingaben, Streaming und Tool-Disclosure über das lange Transcript ab.
