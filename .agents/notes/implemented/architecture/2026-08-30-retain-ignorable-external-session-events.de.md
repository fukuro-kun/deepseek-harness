# Agent Note: Ignorable Session-Events für externe Plugins beibehalten
[English](2026-08-30-retain-ignorable-external-session-events.md) | [中文](2026-08-30-retain-ignorable-external-session-events.zh.md) | Deutsch

Status: implemented


## Problem

Der Session-Event-Envelope trägt `ignorable?: true`, damit ein Leser ein nicht erkanntes Informationsevent akzeptieren kann, ohne jede Vokabular-Erweiterung als neues Session-Format zu behandeln. [PR #3087](https://github.com/deepseek-harness/deepseek-harness/pull/3087) entfernte das Feld, nachdem kein First-Party-Produzent gefunden wurde, und machte jedes unbekannte Event beim Lesen erforderlich.

Diese Produzenten-Inventur deckte ein Drittanbieter-Plugin nicht ab, das derzeit auf das Feld angewiesen ist. Ohne `ignorable` lehnt ein First-Party-Leser eine gespeicherte Session ab, die das Informationsevent des Plugins enthält, weil das Event außerhalb der Repository-generierten `KNOWN_SESSION_EVENT_TYPES` liegt. Das Plugin hat keinen Ersatz-Registrierungs- oder Versionierungsmechanismus; das Feld zu löschen, bevor ein Ersatz existiert, bricht einen aktuellen externen Consumer.

## Entscheidung

Der kanonische `SessionEvent`-Envelope behält `ignorable?: true`, und jede Repräsentation bewahrt es: Seed-Validierung, JSONL, API-Transport, generierte Kataloge und Test-Fixtures. Die Stored-Event-Validierung des Persistenz-Seams (`validateStoredEvents`) verweigert weiterhin ein unbekanntes Event, es sei denn, sein gespeicherter Envelope trägt explizit `ignorable: true`; ohne Marker bleibt es beim Lesen erforderlich.

Das Feld darf erst entfernt werden, wenn ein Ersatz das aktuelle Drittanbieter-Plugin über Event-Produktion, Persistenz, Reload und Transport hinweg unterstützt, mit einem expliziten Cutover für Sessions, die den Marker bereits enthalten. Die [Session-Log-Versionierungsentscheidung](2026-08-10-session-log-version-mechanism.de.md) besitzt weiterhin die Default-Erforderlich-Sicherheitsregel und die Format-Versions-Policy.

Die historische Formatmigration ist in der Alpha-Implementierung bewusst strenger. Die v0-zu-v1-Kante verweigert jeden unbekannten v0-Typ, einschließlich eines ignorable-markierten, weil ein opakes Payload Referenzen enthalten kann, die eine Formatkante nicht validieren kann. Die [Alpha-Entscheidung zu historischen Events](2026-08-31-alpha-historical-unknown-event-refusal.de.md) besitzt diese begrenzte Ausnahme; Gleichversions-Append und -Reload folgen weiterhin dieser Notiz.

## Erwogene Alternativen

**Jedes unbekannte Event beim Lesen verlangen.** Abgelehnt, weil das aktuelle Drittanbieter-Plugin ein Informationsevent außerhalb des Repository-generierten Vokabulars emittiert. Ein First-Party-Reload würde diese Session ablehnen, obwohl das Weglassen des Events sicher ist.

**Das Feld löschen und später einen Ersatz entwerfen.** Abgelehnt, weil diese Reihenfolge eine sofortige Kompatibilitätslücke ohne Migrations- oder Cutover-Pfad für das Plugin oder seine gespeicherten Sessions erzeugt.

**Jedes Repository-externe Event als ignorable behandeln.** Abgelehnt, weil ein Leser nicht ableiten kann, dass ein unbekanntes dauerhaftes Event informativ ist. Ein externes Event kann spätere Rekonstruktion oder Plugin-eigenen Zustand ändern.

**Gemountete Plugin-Event-Namen als bekannt registrieren.** Nicht als Entfernungsmechanismus übernommen, weil Event-Namen-Registrierung allein nicht klassifiziert, ob ein Fehlen sicher ist, und die Akzeptanz von der aktuellen Komposition des Lesers abhinge statt vom gespeicherten Record.

## Konsequenzen

Drittanbieter-Informations-Events können reloadbar bleiben, wenn ihre gespeicherten Records den expliziten Marker tragen, während unbekannte erforderliche Events weiterhin laut fehlschlagen. Das Feld bleibt Teil des öffentlichen Event-Envelopes, der JSONL-Repräsentation, der Transporttypen, der generierten Referenzen und ihrer Tests, bis ein Ersatz die Cutover-Bedingung erfüllt.
