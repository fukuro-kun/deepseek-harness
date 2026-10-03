# Agent Note: Explizite Schedule-Time-Zone-Grenze

Status: implemented

[English](2026-08-09-explicit-schedule-time-zone.md) | [中文](2026-08-09-explicit-schedule-time-zone.zh.md) | Deutsch

## Problem

Impliziter lokaler `at`-Input machte einen Browser-Fakt zu geteiltem Produkt-State. Einen Default-Zeitzonen-Wert bei Session-Creation zu erfassen erforderte neue Session-Header, Create/Resume/Fork-Konfliktregeln, JSONL-Metadaten, eine SQLite-Migration, Client-Creation-Plumbing, Host-Vergleiche und Schedule-Logik, die an Time-Context-Marker gekoppelt war. Reisen, konkurrierende Tabs, fehlende Provenance und alte Sessions brauchten dann ein Confirmation-Protokoll, nur um zu entscheiden, ob ein weggelassenes Feld sicher war.

Der Großteil dieser Komplexität lag außerhalb von Schedule. Das Modell interpretiert bereits natürliche Sprache, bevor es das Tool aufruft, sodass ein durabler Session-Default eine Annahme duplizierte, statt die Absolute-Time-Grenze zu stärken.

## Entscheidung

Die Browser-Zone ist Request-lokale Provenance. Der Web-Client sampled `Intl.DateTimeFormat().resolvedOptions().timeZone` für jeden Prompt. Der Host akzeptiert eine optionale `clientTimeZone`, validiert und kanonisiert `UTC` oder eine IANA-Area/Location an der RPC-Grenze und loggt sie auf genau dieser `user-rpc`-Message. Ungültige Werte lehnen die Prompt-Admission ab. Nicht-Browser-Clients dürfen sie weglassen.

Time-Context leitet eindeutige, gemischte oder fehlende Browser-Fakten aus den originalen User-RPC-Messages im offenen Turn ab. Eine eindeutige Zone formatiert die Uhr und sagt dem Modell, ansonsten unqualifizierte Daten und Zeiten in dieser Zone zu interpretieren. Gemischte oder fehlende Provenance sagt dem Modell, den User zu fragen. Die konfigurierte oder Prozess-Zone ist nur ein Display-Fallback und wird nie als User-Autorität präsentiert.

Schedule akzeptiert keine implizite lokale Zone. `at` ist entweder ein strikter Offset-tragender RFC-3339-String oder exakt `{ date, time, time_zone }`. Die strukturierte Form verlangt ihre Zone selbst dann, wenn Time-Context dem Modell gerade eine Browser-Zone gezeigt hat. Schedule importiert kein Time-Context, inspiziert keine User-Message-Provenance, liest keinen Session-Header und erzeugt keinen Confirmation-Error. Sein Parser validiert den expliziten Wert, lehnt Daylight-Saving-Lücken ab, wählt den ersten Instant in Overlaps und speichert nur das kanonische UTC-`scheduledAt`.

Kein Session-Time-Zone-Feld, kein Create/Resume/Fork-Zonenkonflikt, kein JSONL-Header-Feld, keine SQLite-Spalte oder -Migration, kein Connection-Default und keine Schedule-spezifische Host-/Client-Präsentation bleibt. Die Browser-Annahme kreuzt in Schedule nur über die expliziten Tool-Argumente des Modells.

## Erwogene Alternativen

**Die erste Browser-Zone als immutable Session-Default persistieren.** Dies macht späteren lokalen Input deterministisch, verteilt aber Ownership über Core und Persistenz, während Reisen und konkurrierende Tabs weiterhin Mismatch-Handling erfordern.

**Die jüngste Browser-Zone als mutablen Session-State verwenden.** Dies reduziert Confirmation-Prompts, lässt aber einen Tab still die Interpretation eines anderen Tabs ändern und macht Replay von der Update-Reihenfolge abhängig.

**Schedule die jüngste Time-Context-Message inspizieren lassen.** Ein Prosa-Snapshot ist modell-sichtbarer Beleg, kein typisierter Package-Seam. Ihn zu konsumieren würde Schedule an die AgentLoop-History koppeln und Validierung gegen die originale Provenance duplizieren.

**Den Host `time_zone` in Tool-Calls injizieren lassen.** Der Host kann nicht wissen, welchen natürlichsprachlichen Ausdruck das Modell interpretiert hat oder ob der User eine andere Zone nannte. Modell-Argumente umzuschreiben verbirgt Bedeutung an der falschen Grenze.

**Das Modell verpflichten, bei jeder unqualifizierten Zeit zu fragen.** Dies ist sicher, unterbricht aber unnötig den üblichen Browser-lokalen Fall. Die Request-lokale Instruktion liefert die intendierte Annahme, während gemischte oder fehlende Provenance weiterhin fragt.

## Verifikation

Host-Tests pinnen kanonische Aliase, Weglassen und Rejection vor dem Agent-Entry. Client-Tests pinnen ein Browser-Zone-Sample pro Prompt. Time-Context-Tests pinnen die eindeutige, gemischte und fehlende Current-Turn-Ableitung sowie die exakte Modell-Policy. Schedule-Tests pinnen das erforderliche `time_zone`, strikte Offsets, Calendar-Validierung, kanonische Zonen, Gap-Rejection, Overlap-First-Auswahl und die Abwesenheit eines impliziten Context-Pfads. Das assemblierte Web-Szenario fixiert Playwright auf `Asia/Shanghai`, sendet durch den echten Composer, beobachtet dieselbe Zone im Modell-Request, verifiziert einen expliziten lokalen Tool-Call und snapshotet die gewöhnliche Reminder-Antwort.

Source-Audits lehnen `SessionHeader.timeZone`, Persistenz-`time_zone`-Spalten, Confirmation-Errors, Schedule-Imports von Time-Context und unabhängige Receipt-Machinerie ab.

## Konsequenzen

- Browser-lokale natürliche Sprache funktioniert ohne ein persistiertes Session-Zone-Subsystem.
- Schedule hat eine explizite, unabhängig testbare Absolute-Time-Grenze.
- Reisen und konkurrierende Tabs betreffen nur ihre eigenen Prompts; ein Turn mit gemischter Provenance fragt, statt geteilten State zu mutieren.
- Nicht-Browser-Clients bleiben gültig, müssen aber genug natürlichsprachlichen Context oder explizite Tool-Argumente liefern.
- Das Modell kann weiterhin einen Interpretationsfehler machen; das Tool garantiert nur, dass der explizite Kalenderwert gültig und deterministisch ist.
