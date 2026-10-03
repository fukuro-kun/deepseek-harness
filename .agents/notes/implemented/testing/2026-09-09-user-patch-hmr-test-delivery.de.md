# Agent Note: User-Patch-Transaktionen steuern die Zustellung von Dateisystem-Events
[English](2026-09-09-user-patch-hmr-test-delivery.md) | [中文](2026-09-09-user-patch-hmr-test-delivery.zh.md) | Deutsch

Status: implemented


## Problem

Der [macOS-Sandbox-Lauf](https://github.com/deepseek-harness/deepseek-harness/actions/runs/34238200206/job/102101292119) läuft in einen Timeout, während er auf das erste Hinzufügen eines User-Patches wartet. Gleichzeitige lokale Reproduktionen zeigen, dass keine Dateisystem-Benachrichtigung beim HMR ankommt. Eine Poll-Variante verpasst außerdem eine spätere Bearbeitung, solange HMR keinen anstehenden Refresh hat. Diese Fehler verhindern, dass die Transaktions-Assertions das Parser-, Aktivierungs- und Rollback-Verhalten ausüben, für das sie zuständig sind.

## Entscheidung

Der [User-Patch-Transaktionstest](../../../../packages/boot/app-boot/tests/user-patches.spec.ts) schreibt echte Patch-Dateien und liefert ihre add-, change- und unlink-Events über einen Chokidar-Watcher ohne native Watch-Handles zu. HMR-Registrierung, Refresh-Serialisierung, Include-Rekomposition, Plugin-Aktivierung, Fehler-Broadcast, Rollback und Recovery bleiben echt. Das Fixture stellt seine Watcher-Factory wieder her und dispost den Context selbst dann, wenn das Setup vor dem lokalen Cleanup-Block fehlschlägt.

Die separaten [HMR-Config-Tests](../../../../packages/boot/app-boot/tests/hmr-config.spec.ts) besitzen die native Benachrichtigungszustellung, einschließlich add/change/unlink, anfangs fehlender Elternverzeichnisse und Dateisystem-Aliase. Der Transaktionstest belegt keine Zustellgarantien des Betriebssystems.

## Erwogene Alternativen

**Native Benachrichtigungen für jede Transaktions-Assertion.** Abgelehnt, weil damit die Native-Delivery-Abhängigkeit über jeden Parser- und Aktivierungs-Zustandsübergang wiederholt würde. Ein fehlendes Event verschleiert, welches nachgelagerte Verhalten defekt ist.

**Polling und feste Settling-Verzögerungen.** Abgelehnt, weil keins davon die Zustellung der nächsten Bearbeitung bestätigt. Die Chokidar-Bereitschaft zeigt den Abschluss der asynchronen initialen Poll-Baseline von Node nicht an; eine lokale Poll-Reproduktion verpasst Änderungen weiterhin. Eine längere Test-Deadline kann ein Event nicht zurückholen, das nie ausgelöst wurde.

**HMR-Registrierung oder Include mocken.** Abgelehnt, weil der Test die transaktionale Rekomposition und die Last-Good-State-Assertions nach Aktivierungs- und Parse-Fehlern behalten muss.

## Konsequenzen

Die Transaktionssequenz behält jede semantische Assertion und entfernt die festen Change-Throttle-Sleeps. Unabhängige nebenläufige Prozesse prüfen die Isolation, und ein erzwungener Setup-Fehler verifiziert Watcher-Schließen und Factory-Wiederherstellung vor dem nächsten Fall. Native Watcher-Fehler bleiben in ihren eigenen Tests sichtbar und erfordern eine eigene Diagnose.
