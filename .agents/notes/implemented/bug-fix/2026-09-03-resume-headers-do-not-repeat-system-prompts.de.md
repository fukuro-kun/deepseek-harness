# Agent Note: Resume headers do not repeat system prompts
[English](2026-09-03-resume-headers-do-not-repeat-system-prompts.md) | [中文](2026-09-03-resume-headers-do-not-repeat-system-prompts.zh.md) | Deutsch

Status: implemented


## Problem

Das Forken einer Session kopiert die Quell-Historie in das Child. Der erste Modell-Request des Childs zeichnet dann einen `request/header` mit Reason `resume` auf, selbst wenn sein System-Feld mit dem vorausgehenden kopierten Header identisch ist. Chat behandelte jeden Resume-Header als neuen Anzeigepunkt, sodass das Fortsetzen des Forks eine zweite `System prompt`-Zeile zeigte und suggerierte, der System Prompt sei zweimal injiziert worden. Der Provider-Request trug das System-Feld weiterhin nur einmal; das Duplikat existierte nur in der Chat-Präsentation.

## Decision

Der durable Resume-Header zeichnet die Request-Grenze auf, die für exakte Session-Rekonstruktion nötig ist. Chat vergleicht diesen vollständigen Header mit dem vorausgehenden geladenen Request Prompt und zeigt einen nicht-leeren System Prompt nur für den initialen Request, einen expliziten Message-Serien-Start oder eine echte System-Feld-Änderung. Ein unverändertes Resume erzeugt keine sichtbare Wiederholung.

Ein partielles Historienfenster kann mit einem nicht-initialen Header beginnen und dem Vergleich den nötigen Vorgänger entbehren. Chat rendert diesen System Prompt konservativ. Liefert Prepend später einen identischen Vorgänger nach, wird der bestehende Request-Prompt-Node versteckt statt zurückgezogen; sein Key und sein Page-Lifetime-Anchor bleiben stabil. Ein abweichendes System-Feld bleibt sichtbar.

Trajectory exponiert jeden Request-Header und seine klassifizierten Änderungen. Die Chat-Präsentation verändert weder Provider-Requests noch Session-Events oder die Rekonstruktion.

## Alternatives considered

**Unveränderte Resume-Header aus dem Session-Log weglassen.** Verworfen: Resume ist eine echte Request-Grenze, und sie zu entfernen ließe exakte Rekonstruktion von Prozesshistorie abhängen, die das durable Log nicht enthält.

**Nur geforkte Sessions als Sonderfall behandeln.** Verworfen: Ein gewöhnlicher Prozess-Resume hat dieselbe Präsentationssemantik, und die Request-Header enthalten bereits die für einen direkten Vergleich nötigen System-Felder.

**Die Duplikatzeile als Lebenszyklus-Marker behalten.** Verworfen: `System prompt` beschreibt modellsichtbaren Request-Content, sodass sein Einsatz als Marker für einen Loop-Neustart fälschlich eine weitere Prompt-Injektion impliziert. Request-Lifecycle-Evidenz bleibt in Trajectory verfügbar.

## Consequences

Das Fortsetzen eines Forks oder das Resumen eines Prozesses mit unverändertem System-Feld hinterlässt eine sichtbare `System prompt`-Zeile für die aktuelle Message-Serie. Explizite Serienstarts und echte System-Änderungen wiederholen die Zeile weiterhin. Ein partielles Fenster kann anfangs eine konservative Zeile zeigen und sie nach dem Laden älterer Historie verstecken, während derselbe materialisierte Node erhalten bleibt.

Die Unit-Regression deckt Initial-, Serien-, unveränderte Resume-, System-Change- und Prepend-Fälle ab. Das Web-Recorded-Session-Szenario enthält einen unveränderten Resume-Header und assertiert, dass der gesettlete Chat exakt ein `System prompt`-Control rendert.
