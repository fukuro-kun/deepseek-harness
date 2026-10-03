# Agent Note: Session-Projektionen als erforderlicher Reader-Seam

Status: implemented

[English](2026-08-19-session-projection-mandatory-seam.md) | [中文](2026-08-19-session-projection-mandatory-seam.zh.md) | Deutsch

## Problem

Eine optionale Projektions-Registry lässt ein Plugin, dessen Host-Verhalten projizierten Zustand liest, ohne diesen Zustand aktivieren. Sofern der Reader die fehlende Registry oder den fehlenden Schlüssel nicht ablehnt, können das Host-Verhalten oder Subagent-Katalogfelder still verschwinden. Nur-Batch-Reads materialisieren außerdem jede Client-View, wenn ein Verbraucher einen einzelnen Host-Wert braucht. Manche Contributor-Stellen behalten absichtlich die optionale `ctx.inject`-Registrierung, sodass ihre Reader eine explizite Regel für fehlenden Zustand brauchen.

## Entscheidung

Diese Entscheidung baut auf der Trennung zwischen Host-Projektionszustand und Client-Views in [Session projection state and client views](../../archived/architecture/2026-08-19-session-projection-state-and-client-views.md) auf.

Jeder Host-Reader behandelt die Projektions-Registry und ihren erforderlichen Schlüssel als zwingenden Zustand. Ein Plugin deklariert entweder `sessionProjections` als erforderliche Injection oder löst Registry und Schlüssel explizit auf und wirft beim ersten abhängigen Zugriff. Offizielle Kompositionen mounten die Registry vor diesen Plugins. `ApiProxyService` folgt der Required-Injection-Form; die tiefergelegene `createApiProxy`-Factory bleibt für isolierte Tests und Diagnostik tolerant.

Ein Domain-Contributor darf seine Einheit über `ctx.inject(['sessionProjections'], ...)` registrieren. Optionale Registrierung steuert nur den Child-Lebenszyklus; sie autorisiert einen Reader nicht, bei fehlender Registry oder fehlendem Schlüssel einen Default zu substituieren.

Die Registry stellt `stateOf(session, key)` für einen typisierten Host-Zustand bereit und behält `snapshot()` für Batch-Carrier. Client-Views enthalten nur konsumierte Felder; Host-Reader verwenden `stateOf` für reichhaltigeren Zustand.

`onChanged` veröffentlicht nur client-sichtbare Wertänderungen. Unit-Registrierung und -Entfernung bleiben effect-scoped Registry-Lebenszyklus; `register()` gibt den exakten Cordis-Disposer zurück, sodass ein zusammengesetzter Domain-Eigentümer Cleanup gegen projizierten Zustand abschließen kann, bevor er seine Einheit entfernt. Registrierungsänderungen erzeugen keinen zweiten Host-Event-Stream oder Client-Tombstone-Protokoll. Eine spätere autoritative History- oder Listen-Baseline spiegelt die aktive Schlüsselmenge.

## Alternatives considered

- **Fehlenden projizierten Zustand mit Default belegen.** Dies erhält mehr partielle Kompositionen, macht aber fehlenden Host-Zustand von einem gültigen leeren Wert ununterscheidbar. Abgelehnt, weil offizielle Profile die Registry mounten und Konfigurationsfehler explizit fehlschlagen müssen.
- **Jeden Contributor bei Aktivierung erzwingen.** Dies macht die Schlüsselmenge uniform, koppelt aber den Contribution-Lebenszyklus unnötig an die Service-Aktivierung. Explizites Fehlschlagen beim ersten Zugriff erhält die optionale Registrierungsform ohne stille Degradation zu erlauben.
- **`snapshot()` für jeden Read verwenden.** Dies behält eine Methode, berechnet aber unbeteiligte Wire-Views und ermutigt Verbraucher, sich für Host-Logik auf Batch-Transportdaten zu verlassen. Abgelehnt zugunsten typisierter Single-Key-State-Reads.
- **Volle Host-Werte an Clients senden.** Dies vermeidet separate View-Typen, exponiert aber Provenienz- und Policy-Regler, die kein Client konsumiert. Abgelehnt zugunsten explizit zugeschnittener Views.
- **Registry-Hinzufügungen und -Entfernungen über Host- und Mux-Streams broadcasten.** Die Streams haben keine geteilte Reihenfolge, also bräuchten Clients Tombstones, gepufferte Frames und Baseline-Retries, um sie zu vereinbaren. Abgelehnt, weil Plugin-Key-Wechsel kein zweites Synchronisationsprotokoll rechtfertigt.

## Konsequenzen

- Fehlende Projektions-Komposition scheitert entweder bei der Aktivierung oder beim ersten abhängigen Host-Zugriff; sie degradiert nie zu einem Default-Wert.
- Host-Verbraucher vermeiden wiederholte Whole-Registry-Snapshots und Log-Scans.
- Wire-Payloads schließen Host-only-Felder und Per-Key-Watermark-Wrapper aus; gewöhnliche Baselines kommunizieren die aktive Schlüsselmenge.
