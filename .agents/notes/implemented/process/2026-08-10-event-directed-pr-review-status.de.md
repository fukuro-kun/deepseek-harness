# Agent Note: Ereignisgesteuerte PR-Review-Statuskommandos

Status: implemented

[English](2026-08-10-event-directed-pr-review-status.md) | [中文](2026-08-10-event-directed-pr-review-status.zh.md) | Deutsch

## Problem

Der Status eines Issue im Project zeichnet auf, wer den nächsten Schritt der Erledigung besitzt. Der aggregierte Pull-Request-Review-Status beantwortet, ob GitHub den Pull Request für mergebar hält, kann aber diese Übergabe nicht abbilden: Ein früheres `CHANGES_REQUESTED`-Review kann wirksam bleiben, nachdem der Autor den Code korrigiert und erneut um Review gebeten hat.

Eine monotone Projektion kann ein von der Automatisierung verwaltetes Issue auch nicht von `In review` nach `In progress` zurücksetzen, wenn ein Reviewer Änderungen anfordert. Das Rekonstruieren von Review-Runden oder Reviewer-Blockern würde Zustand einführen, den der geforderte Zwei-Ereignis-Vertrag nicht braucht.

## Entscheidung

Der Issue-Lifecycle-Workflow behandelt Review-Webhooks als Kommandos. `pull_request.review_requested` — auch eine wiederholte Anfrage — zielt auf `In review`. `pull_request_review.submitted` zielt nur dann auf `In progress`, wenn `review.state` gleich `changes_requested` ist; das submitted-Ereignis bleibt nötig, weil ein Reviewer Änderungen anfordern kann, ohne dass zuvor ein review-request-Ereignis ausgelöst wurde. Approved- und commented-Submissions führen ihren Lifecycle-Job aus, sind aber ein No-op (sie erreichen nie den Schritt, der das Project-Token erzeugt); dismissed Reviews sind nicht abonniert.

Gewöhnliche abonnierte Pull-Request-Ereignisse bleiben vorwärtsgerichtete Umsetzungssignale: Sie können `Inbox`, `Backlog` oder `Ready` nach `In progress` verschieben, aber `In review` nicht zurücksetzen. Review-request-Kommandos können jeden früheren aktiven Status nach `In review` verschieben. Changes-requested-Kommandos können frühere aktive Status vorwärts nach `In progress` verschieben und `In review` nur dann zurücksetzen, wenn das letzte Status-Ereignis des Ziel-Projects vom konfigurierten Lifecycle-Actor geschrieben wurde. Ist der letzte Actor ein Mensch oder unbekannt, bleibt der aktuelle Status erhalten.

Die Status-Projektion löst nur exakte `Fixes`-, `Closes`- oder `Resolves`-Referenzen im selben Repository auf. Sie ändert keine Endstatus, fügt dem Project kein Issue ohne Project-Status hinzu, hängt nicht von der Gültigkeit von PR-Metadaten ab, fragt `reviewDecision` nicht ab, rekonstruiert keine Review-Runden, sucht von Issues aus nicht nach Pull Requests und führt keinen geplanten Reconciler. [Project-local Issue planning fields](2026-09-02-project-local-issue-planning-fields.de.md) besitzt die separate Datumsinitialisierung für jede Issue-Referenz im selben Repository.

[Issue lifecycle](../../../../.github/workflows/issue-lifecycle.yml) bleibt von `pull_request.ready_for_review` abgemeldet; keines der beiden Ereigniskommandos hängt von dieser Action ab. [Issue policy](../../../../.github/workflows/issue-policy.yml) behält `ready_for_review`, weil es die Durchsetzung der Pflichtchecks besitzt, wenn ein menschlicher Pull Request in den Review eintritt.

## Verifikation

[Issue-management tests](../../../../.github/issue-management/policy.test.mjs) pinnen das Ereignis-zu-Kommando-Mapping, den Übergang bei wiederholter Review-Anfrage nach einem changes-requested-Kommando, die changes-requested-Rücksetzung, den Endstatus-Schutz und die Bewahrung menschlicher Überschreibungen. [Workflow tests](../../../../scripts/ci-workflow.spec.ts) pinnen die abonnierten Ereignisse, das Fehlen von `if` auf Job-Ebene zusammen mit dem Step-Level-Gate an den Token-/Board-Schritten (sodass approved/commented Reviews ohne Token-Erzeugung durchlaufen) sowie den separaten `ready_for_review`-Policy-Trigger.

## Erwogene Alternativen

**Status aus `reviewDecision` oder einer rekonstruierten Review-Runde ableiten.** GitHubs Aggregat kann nach einer wiederholten Review-Anfrage bei `CHANGES_REQUESTED` stehen bleiben, während ein Runden-Reducer Reviewer- und Reihenfolgesemantik einführt, die über die beiden expliziten Übergaben hinausgeht.

**Die nur vorwärts gerichtete Projektion behalten.** Monotones Fortschreiten schützt spätere Status, lässt ein Issue aber in `In review` stehen, während der Autor die angeforderten Änderungen umsetzt.

**Jedes Review-Kommando bedingungslos anwenden.** Das ist der kleinste Ereignishandler, erlaubt der Automatisierung aber, einen menschlich verwalteten Project-Status zu überschreiben. Der Actor des letzten Status-Ereignisses des Ziel-Projects schützt daher den einzigen Rückwärtsübergang.

**`ready_for_review` wiederherstellen oder eine Debounce-Queue einführen.** Der Ready-Status trägt keine der beiden Review-Übergaben, während eine weitere Queue Latenz und Control-Plane-Zustand hinzufügt, ohne eines der Kommandos zu ändern.

## Konsequenzen

Eine wiederholte Review-Anfrage verschiebt ein von der Automatisierung verwaltetes, gerade gelöstes Issue nach `In review`, auch wenn GitHub noch ein älteres blockierendes Review meldet. Ein späteres changes-requested-Review setzt es nach `In progress` zurück; Approval, Kommentare, Dismissal, Pushes und das Entfernen von Reviewern lassen den Status des jüngsten Kommandos unverändert.

Die Projektion bleibt ereignisgesteuert und repariert kein Ereignis, das nie läuft. Das erneute Abspielen eines alten Workflow-Runs kann dessen altes Kommando erneut ausführen, und ProjectV2 bietet weiterhin kein atomares Compare-and-Swap zwischen dem Lesen des letzten Zustands und der Mutation. Workflow-Concurrency pro Pull Request und die Human-Ownership-Schranke verringern diese Races, ohne dauerhaften Lifecycle-Zustand einzuführen.
