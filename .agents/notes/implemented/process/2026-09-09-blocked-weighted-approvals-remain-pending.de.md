# Agent Note: Blockierte gewichtete Genehmigungen bleiben pending

Status: implemented

[English](2026-09-09-blocked-weighted-approvals-remain-pending.md) | [中文](2026-09-09-blocked-weighted-approvals-remain-pending.zh.md) | Deutsch

## Problem

Der gewichtete Genehmigungs-Commit-Status muss eine unerfüllte Merge-Bedingung von einer fehlgeschlagenen Policy-Auswertung unterscheiden. Ein wirksames `CHANGES_REQUESTED`-Review eines schreibberechtigten Reviewers verhindert, dass ein Pull Request die Genehmigungs-Policy erfüllt, ist aber ein reversibler Review-Zustand und kein Auswertungsfehler.

`failure` für diesen Review-Zustand zu veröffentlichen vermischt die Genehmigungsentscheidung mit dem Zustand des Publishers. Es behandelt eine unerfüllte Policy-Bedingung zudem anders als einen Draft-Pull-Request oder unzureichende Genehmigungspunkte, die pending bleiben, solange Mitwirkende sie beheben können.

## Entscheidung

Eine abgeschlossene gewichtete Genehmigungsauswertung veröffentlicht `pending`, wenn der Pull Request ein Draft ist, weniger als die erforderlichen Genehmigungspunkte hat oder ein wirksames `CHANGES_REQUESTED`-Review eines schreibberechtigten Reviewers vorliegt. Ein blockierendes Review dominiert die Punktsumme, sodass der Status pending bleibt, selbst wenn gezählte Genehmigungen den Schwellenwert erreichen.

Die Auswertung veröffentlicht `success` nur, wenn der Pull Request bereit ist, der Punktschwellenwert erreicht ist und kein blockierendes Review existiert. Der separate `weighted approval publisher`-Actions-Job meldet, ob Auswertung und Statusveröffentlichung abgeschlossen wurden. Ein Auswertungsfehler veröffentlicht einen `error`-Commit-Status und lässt diesen Job fehlschlagen.

## Verifikation

[Genehmigungs-Policy-Tests](../../../../.github/review-ownership/check-approval.test.mjs) pinnen den Fall des schwellenerreichenden Blockers und die exakt veröffentlichte `pending`-Payload. [Workflow-Tests](../../../../scripts/ci-workflow.spec.ts) pinnen den separaten Publisher-Job-Namen.

## Betrachtete Alternativen

**`failure` für ein blockierendes Review veröffentlichen.** Das hält einen sichtbar fehlgeschlagenen Status, bis sich das Review ändert, stellt aber eine unerfüllte und reversible Merge-Bedingung als Fehlfunktion dar und vermischt das Policy-Ergebnis mit dem Zustand des Publishers.

**Genehmigungspunkte ein blockierendes Review überstimmen lassen.** Das macht die Punktzahl zur einzigen Erfolgsbedingung, erlaubt aber einen erfolgreichen Status, während die wirksame Entscheidung eines schreibberechtigten Reviewers noch Änderungen verlangt.

## Konsequenzen

Branch-Regeln mit Pflichtstatus blockieren einen Pull Request, weil `pending` den erforderlichen Status nicht erfüllt. Mitwirkende können verbleibende Review-Arbeit von einer fehlgeschlagenen Genehmigungsauswertung unterscheiden, während der Publisher-Job und der `error`-Status das operationelle Fehlschlagsignal bewahren.

Consumer erhalten nicht allein wegen eines blockierenden Reviews einen fehlgeschlagenen Commit-Status. Sie müssen die Statusbeschreibung oder die wirksamen Reviews prüfen, wenn sie einen Blocker von anderen pending-Genehmigungsbedingungen unterscheiden müssen.
