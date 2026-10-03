# Agent Note: Normalized unread filesystem tool diagnostic

Status: implemented

[English](2026-09-03-normalized-unread-fs-tool-diagnostic.md) | [中文](2026-09-03-normalized-unread-fs-tool-diagnostic.zh.md) | Deutsch

## Problem

Die `dsh-tool-fs`-Write- und -Edit-Operationen können `FS_NOT_OBSERVED` sowohl von der Observation-Policy als auch von einem Filesystem-Provider erhalten. Diese Quellen beschreiben dieselbe Anforderung mit operationsspezifischen Meldungen, sodass identische Recovery-Bedingungen das Modell mit unterschiedlichem Wortlaut erreichen. Provider-Text kann zudem offenlegen, ob die abgelehnte Operation ein bestehendes Ziel überschreiben würde, obwohl das Modell das Ziel nur lesen und erneut versuchen muss.

## Decision

`remediateFsError(error, displayPath)` ersetzt jede `FS_NOT_OBSERVED`-Meldung an der `dsh-tool-fs`-Modellgrenze durch `cannot modify "<path>": file has not been read — read the file, then retry`. Der Wrapper bewahrt den strukturierten Fehlercode und verkettet den Quellfehler als `cause`, sodass maschinelles Routing und Diagnosen den ursprünglichen Fehlschlag weiterhin inspizieren können.

`FS_STALE_VERSION` behält das angehängte Re-read-Remedy aus der [Guarded-Mutation-Remedy-Note](../../archived/feature/2026-08-03-fs-tool-error-remedy.md). Filesystem-Provider und -Policies behalten ihre operationsspezifischen Meldungen, weil andere Consumer die modellzugewandte Präsentation des Tools nicht teilen.

## Alternatives considered

**An jede Quellmeldung dasselbe Recovery-Suffix anhängen.** Verworfen, weil das Modell weiterhin unterschiedliche Gründe für eine geforderte Aktion erhielte, einschließlich providerspezifischer Zielexistenz-Details, die die Recovery nicht ändern.

**Die Provider- und Policy-Meldungen an ihrer Quelle normalisieren.** Verworfen, weil diese Komponenten maschinenorientierte Fehler besitzen, die von anderen Consumern als `dsh-tool-fs` genutzt werden; nur das Tool besitzt diesen modellsichtbaren Wortlaut.

**Einen weiteren Fehlercode für das normalisierte Ergebnis einführen.** Verworfen, weil die zugrunde liegende Bedingung und das Recovery-Routing `FS_NOT_OBSERVED` bleiben; das Ändern des Codes würde nützliche Kompatibilität für maschinelle Consumer verwerfen.

## Consequences

Write und Edit exponieren eine stabile Unread-Target-Diagnose, unabhängig davon, ob Policy oder Provider die Mutation ablehnt. Das Modell gibt quellspezifischen Wortlaut und den Zielexistenz-Hinweis des Providers zugunsten einer umsetzbaren Recovery-Instruktion auf. Die ursprüngliche Meldung bleibt über `cause` verfügbar.

Unit- und Integrationstests pinnen beide Quellpfade, Code-Erhaltung, Cause-Verkettung und den exakten modellsichtbaren Text. Die `fs-policy-reject`-Recorded-Session trägt dieselbe Diagnose für Replay.
