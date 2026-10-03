# Agent Note: Fire-and-forget-Webhook-Sessions
[English](2026-08-22-fire-and-forget-webhook-sessions.md) | [中文](2026-08-22-fire-and-forget-webhook-sessions.zh.md) | Deutsch

Status: implemented


## Problem

Externe Repository-Events müssen gewöhnliche DSH-Arbeit starten, ohne dass jeder Provider-Adapter Agent-Presets, Workspace-Attachment, Titel, Permissions und Callback-Teardown verstehen muss. GitHub-Pull-Requests, die ready for review werden, sind der erste Anwendungsfall: Ein signiertes Event kann eine Review-Session erzeugen, die Nutzer unter dem Repository-Workspace durchsehen können.

Daraus eine durable Automation-Engine zu machen würde neben Sessions einen zweiten Lifecycle einführen: Delivery-Datensätze, Execution-Zustände, Retry- und Deduplizierungs-Policy, Crash-Recovery und eine Antwort darauf, ob HTTP-Akzeptanz, Prompt-Admission, Agent-Idle oder Modell-Output Vollendung bedeutet. Die angeforderte Capability braucht keine dieser Bedeutungen.

## Entscheidung

`@deepseek-ai/dsh-webhook` besitzt eine Zwei-Operationen-Host-Runtime: Regeln registrieren sich über `register()`, und authentifizierte Provider-Adapter rufen `dispatch()` auf. Jeder passende Callback läuft unabhängig als beliebiger vertrauenswürdiger Code und gibt `null` oder eine Workspace-gestützte Session-Anfrage zurück. Dispatch kehrt zurück, bevor Callbacks settlen, während das Effect-Disposal nur die Aufrufe abbricht und entleert, die es besitzt.

Die Runtime speichert keinen Provider-Delivery- oder Execution-Datensatz. Sie wiederholt nicht, dedupliziert nicht, setzt Callback-Arbeit nicht fort, beobachtet keinen Agent-Status und sammelt kein Ergebnis. Eine wiederholte Delivery kann eine weitere Session erzeugen. `WebhookDeliveryId` bleibt für eine Regel verfügbar, die Idempotenz bewusst über eigenen Zustand implementiert.

## Provider-Adapter

Authentifizierung gehört den Provider-Adaptern. `@deepseek-ai/dsh-webhook-github` registriert eine exakte Route auf einem injizierten WebServer, begrenzt den unveränderten UTF-8-Body, löst seine Secret-Referenz pro Request auf, verifiziert `X-Hub-Signature-256` vor dem Parsen und übergibt ein signiertes Lossless-JSON-Objekt an die Runtime. `202` bedeutet nur verifizierten In-Memory-Dispatch; es liegt vor Regel-Matching, externen Aufrufen und Session-Erzeugung.

Die normale Web-Komposition hält ihren UI/API-WebServer getrennt. Das GitHub-Beispiel mountet einen weiteren WebServer und seinen Adapter in einer Gruppe, die nur `webServer` isoliert, sodass ein Reverse-Proxy den Webhook-Port exponieren kann, ohne `/api`, WebSockets oder Frontend-Dateien zu exponieren.

Das Patch-Loading verankert relative Plugin-Namen in eingefügten Zeilen an der Patch-Datei. Derselbe `./github-ready-review-rule.mjs`-Eintrag funktioniert daher sowohl aus einem Entwicklungs-`--patch`-Overlay als auch aus einem permanenten Profile-Patch, ohne die Regel in ein Paket zu verwandeln.

## Session-Erzeugung

Ein Regel-Ergebnis benennt einen lokalen Workspace-Pfad, Titel, Text-Prompt, Agent-Preset, Permission-Preset und optional eine explizite Provider/Modell-Route mit Output-Cap. Ohne diese Route snapshotet die Runtime den vollständigen live Default einschließlich Reasoning-Effort, bis der erste Request seinen durablen Header aufzeichnet. Sie validiert Presets vor der Mutation, löst den kanonischen Workspace auf oder erzeugt ihn, erzeugt den Agent mit diesem Pfad als Session-cwd, mountet das Preset vor der Publikation und hängt die Session an, bevor der Prompt zugelassen wird.

Das initiale Follow-up ist eine gewöhnliche durable User-Role-Message mit Webhook-Provider-, Source-, Delivery- und Regel-Provenienz. Ihre Inbox-Insertion ist die letzte Grenze der Webhook-Operation. Gewöhnliche Session-Persistenz und der Agent-Lifecycle besitzen spätere Arbeit; die Runtime flusht weder speziell noch wartet sie auf einen Turn.

## Erwogene Alternativen

**Deliveries und Execution-Zustände persistieren.** Abgelehnt, weil `pending`, `admitted`, `running` und `settled` Retry-, Deduplizierungs-, Crash- und Completion-Semantik erfordern, die die aktuelle Capability nicht konsumiert.

**GitHub erst nach der Session-Erzeugung bestätigen.** Abgelehnt, weil beliebige Regeln externe Systeme aufrufen und das HTTP-Fenster des Providers überschreiten können; eine gültige Delivery sollte Transport-Verfügbarkeit nicht an spätere Regel-Arbeit koppeln.

**Die Route auf dem Haupt-WebServer registrieren.** Abgelehnt, weil Betreiber Webhook-Ingress exponieren müssen, ohne zugleich die Browser-API zu exponieren. Eine isolierte zweite Instanz verwendet das bestehende HTTP-Modul wieder, ohne eine weitere Server-Implementierung zu schaffen.

**Regeln auf eine deklarative Prädikatensprache beschränken.** Abgelehnt, weil programmatische Regeln explizit beliebige externe Aufrufe brauchen. Vertrauenswürdige Cordis-Plugins liefern bereits die erforderliche Authority und den Lifecycle.

**Jeden Adapter Sessions direkt erzeugen lassen.** Abgelehnt, weil Workspace-, Preset-, Permission-, Titel-, Rollback- und Provenienz-Logik sich über die Provider-Pakete verteilen würde.

## Verifikation

Package-Tests pinnen unabhängige Callback-Ausführung, Fire-and-forget-HTTP-Timing, Cancellation und quiescent Disposal, Request-Validierung, Workspace-Attachment vor Prompt-Admission, Rollback, GitHub-HMAC- und Body-Limits, Credential-Rotation und exakte Loader-Komposition. Das assemblierte Web-Beispiel sendet eine signierte Ready-for-Review-Delivery an einen isolierten zweiten Listener und zeichnet die resultierende gewöhnliche Workspace-Konversation auf.

Ein Real-API-e2e-Test startet die gebaute `dsh web`-CLI mit dem Webhook-Overlay und isoliertem Listener, synthetisiert nur die signierte eingehende GitHub-Delivery, beobachtet Workspace-Attachment und durable Provenienz über die öffentliche Web-API und wartet auf die echte DeepSeek-Antwort. Kein DSH-Service, Modell-Adapter oder Provider-Aufruf wird durch ein Test-Double ersetzt.

Source-Audits halten Execution-Datensätze, Retry-Timer, Dedupe-Maps, Completion-Events und Agent-Status-Listener abwesend.

## Konsequenzen

- Provider-Adapter bleiben klein und provider-spezifisch, während die Session-Erzeugung einen Owner hat.
- Nutzer erhalten gewöhnliche betitelte Sessions unter Web-Workspaces statt einer zweiten Automation-UI.
- HTTP-Erfolg sagt absichtlich nichts über Downstream-Matching oder Agent-Erfolg aus.
- Abstürze und wiederholte Deliveries behalten einfache At-most-Process-Lifetime-Semantik; Deployments, die durable Automation brauchen, müssen ein separat entworfenes Subsystem hinzufügen, statt diese Runtime umzudeuten.
