# Agent Note: Leerheitsregel des Composer-Placeholders

Status: implemented

[English](2026-09-09-composer-placeholder-whitespace.md) | [中文](2026-09-09-composer-placeholder-whitespace.zh.md) | Deutsch

## Problem

Wenn die Whitespace-getrimmte Submission-Prüfung mit dem Placeholder-Rendering geteilt wird, bleibt die Guidance über einem Entwurf gezeichnet, der Leerzeichen enthält.

## Entscheidung

Der Composer versteckt seinen Placeholder, sobald der rohe Entwurf nichtleer ist. Die Submission behält ihre Prüfung auf getrimmten Inhalt. Attachments und beanspruchte Befehle behalten ihre bisherige Placeholder-Unterdrückung.

## Erwogene Alternativen

**Die Submission-Prüfung wiederverwenden.** Whitespace hat keinen sendbaren Nachrichteninhalt, belegt aber den Editor und bewegt seinen Caret. Eine geteilte Prüfung vermischt diese beiden Zustände.

## Konsequenzen

Alle Placeholder-Varianten, einschließlich der Steering-Guidance für Queued Messages, verschwinden nach Whitespace-Eingabe und kehren nach dem Löschen zurück. Ein reiner Whitespace-Entwurf ohne Attachments bleibt unsendbar. [Komponententests](../../../../packages/client/ui-conversation/tests/input-bar.client.spec.tsx) decken Sichtbarkeit, Komposition, Rerendering und Submission ab; die [Browser-Regression](../../../../apps/web/tests/composer-placeholder.e2e.ts) prüft Tastatur- und Zwischenablage-Gesten gegen die gebaute UI.
