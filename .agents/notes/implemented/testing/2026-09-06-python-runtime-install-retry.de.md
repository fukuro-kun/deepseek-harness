# Agent Note: Begrenzter Retry für die Python-Runtime-Dependency-Installation

Status: implemented

[English](2026-09-06-python-runtime-install-retry.md) | [中文](2026-09-06-python-runtime-install-retry.zh.md) | Deutsch

## Problem

Der `Install (immutable)`-Schritt der Python-Runtime-Lane führt `pnpm install` auf jedem Target aus, und native Build-Downloads zur Installationszeit holen Node-Header von nodejs.org. Dieser Endpunkt stockt intermittierend: Am 2026-09-06 schlug die gehostete `node24-macos-x64`-Zelle fehl, als der node-gyp-Download des `fs-ext`-Builds nach einem 10-sekündigen Connect-Timeout einen `ConnectTimeoutError` gegen nodejs.org warf und die immutable Installation abbrach. Das Stocken ist extern und transient; die Lane hatte zuvor außer einem manuellen Job-Rerun keine Wiederherstellung.

## Entscheidung

Der Installationsschritt wiederholt `pnpm install --frozen-lockfile` bis zu insgesamt drei Versuche mit einer zehnsekündigen Pause zwischen Fehlschlägen und läuft auf jeder Plattform unter `bash` (Git Bash liegt den gehosteten Windows-Images bei). Erfolg in einem beliebigen Versuch beendet den Schritt sofort; eine File-Lock-Prüfung oder ein Native-Build-Fehler, die jeder Versuch scheitern würde, lässt den Schritt nach dem begrenzten Budget weiterhin fehlschlagen. Das spiegelt die dokumentierte Bounded-Transfer-Policy der Wine-Lane, ohne einen Mirror einzuziehen, denn diese Installationen lösen auch native Addons auf, deren Zweit-Download-Herkunft zählt.

## Erwogene Alternativen

**Connect- oder Job-Timeout erhöhen.** Abgelehnt: Das beobachtete Stocken ist ein Connect-Timeout nach 10 Sekunden, und die Wiederholung der gesamten Operation mit einer frischen Verbindung ist die Wiederherstellung, die dieser Fehlermodus verlangt; ein längeres Timeout schlägt weiterhin fehl, wenn der Endpunkt ausgefallen ist.

**Einen Mirror für Node-Header-Downloads verwenden.** Vertagt: Der Mirror der Wine-Lane setzt sein eigenes Archiv fort; die Python-Runtime-Lane bräuchte einen Mirror pro Target und eine eigene Prüfsummen-Autorität, die der Retry für einen transienten Ausfall nicht benötigt.

**Fehlgeschlagene Jobs von Hand erneut ausführen.** Als stehende Abhilfe der Lane abgelehnt: Er kostet einen vollen Lane-Zyklus und bleibt manuell; der begrenzte Retry absorbiert das Transiente, während ein anhaltender Ausfall weiterhin laut fehlschlägt.

## Konsequenzen

Ein transienter nodejs.org-Stillstand kostet höchstens zwei zusätzliche Installationsversuche (etwa zwanzig Sekunden), während ein deterministischer Installationsdefekt nach dem Budget weiterhin fehlschlägt. Alle Targets teilen denselben Retry-Pfad, und die Installationsdiagnostik bleibt die im Schritt erfasste pnpm-Ausgabe.
