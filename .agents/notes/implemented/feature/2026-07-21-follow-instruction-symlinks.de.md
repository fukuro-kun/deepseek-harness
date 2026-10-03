# Agent Note: Symlinks auf Instruktionsdateien folgen
[English](2026-07-21-follow-instruction-symlinks.md) | [中文](2026-07-21-follow-instruction-symlinks.zh.md) | Deutsch

Status: implemented


## Problem

Das [agent-instructions-Plugin](../../archived/feature/2026-06-24-workspace-context.md) probierte jeden Instruktionskandidaten vor dem Auflösen mit `ctx.fs.lstat` und lehnte jeden Symlink in der letzten Komponente ab, damit ein repo-eigener Link das Instruktionsladen nicht auf Inhalte außerhalb des Workspace lenken konnte. Diese No-Follow-Invariante blockierte ein bewusstes, unterstütztes Setup: Ein Nutzer, der `$DSH_HOME/AGENTS.md` — oder eine Projekt-`AGENTS.md` — auf eine kanonische Instruktionsdatei symlinkt, die anderswo liegt, um eine Hausstildatei über Tools und Homes zu teilen, sah den Link still ignoriert. Es zwang außerdem die Content-Dedup, den ubiquitären `CLAUDE.md → AGENTS.md`-Spiegel als speziellen Skip-Fall zu behandeln statt als gewöhnliches Duplikat. Der Repo-Owner bat darum, symlinkten Instruktionsdateien über jeden Scope hinweg bedingungslos zu folgen, unter Akzeptanz des unten festgehaltenen residualen Trust-Boundary-Risikos.

## Entscheidung

Die Instruktions-Discovery inspiziert die letzte Komponente nicht mehr mit `lstat`. Jeder Kandidat — das user-globale `$DSH_HOME/AGENTS.md`, jeder Basis-Kandidat und jeder Local-Overlay-Kandidat — wird aufgelöst und sein aufgelöstes Ziel gestattet, gleichermaßen bei der Baseline-Komposition und bei jeder `tools/post-execute`-Reconciliation. Ein Symlink, dessen Ziel eine reguläre Datei ist, lädt den Inhalt dieses Ziels; ein aufgelöstes Nicht-Datei-Ziel (einschließlich eines Links auf ein Verzeichnis) ist eine bestätigte Abwesenheit, die den Scope wie eine fehlende Datei entfernt; eine `resolve`- oder `stat`-Exception wird als vorübergehend nicht verfügbar klassifiziert und entfernt niemals einen bereits geladenen Scope. `nodeStatFile` ruft `stat` (Host-Pfad) und `fsStatFile` ruft `resolve` und dann `stat` (Provider-Pfad); keiner ruft `lstat`.

Ein gefolgter Symlink ist für jeden nachgelagerten Schritt eine gewöhnliche Datei. Er nimmt an der per-directory Content-Dedup teil ([load-all-+-Dedup-Notiz](../../archived/feature/2026-07-21-instruction-load-all-dedup.md)), sodass ein `CLAUDE.md`, das auf seinen Geschwister-`AGENTS.md` symlinkt, nun zu identischem Inhalt auflöst und wie jedes byteidentische echte Duplikat kollabiert, statt als Spezialfall übersprungen zu werden.

### Trust Boundary und Restrisiko

Repo-eigenen Links zu folgen kreuzt die Trust Boundary des Plugins: Ein geklontes, nicht vertrauenswürdiges Repository kann ein `AGENTS.md` tragen, dessen Symlink-Ziel jede vom Prozess lesbare Datei ist und so Off-Tree-Inhalte als Workspace-Anleitung sichtbar macht. Dieser Inhalt tritt nur als user-Rolle-Präfix niedrigerer Autorität ein, gerahmt vom System-Reminder-Muster; er überschreibt niemals System-, Developer- oder direkte Nutzer-Instruktionen und wird als Daten behandelt, nicht als Autorität. Die mitigierende Grenze ist die Dateisystemschicht, nicht dieses Plugin: `ctx.fs` mit dem `dsh-fs-observation-policy`-Gate oder einer OS-Sandbox einschränken ([Cross-Family-fs-Sandbox](2026-07-14-cross-family-fs-sandbox.de.md)), wenn ein Deployment nicht vertrauenswürdige Repositories lädt. Dies ist ein expliziter, vom Owner akzeptierter Trade-off, kein Versehen.

## Erwogene Alternativen

**Die `lstat`-No-Follow-Invariante behalten.** Vom Repo-Owner verworfen: Sie blockiert das unterstützte Symlink-zur-kanonischen-Datei-Setup und zwingt den Symlink-Mirror-Fall dazu, ein übersprungener Spezialfall statt eines schlichten Duplikats zu sein. Die Lese-Autoritätsgrenze, die sie annäherte, gehört in die Filesystem-Policy- und Sandbox-Schicht, die dasselbe Risiko präziser eindämmt.

**Nur dem user-globalen `$DSH_HOME`-Kandidaten folgen und No-Follow für Projektdateien behalten.** Verworfen: Der Owner verlangte einheitliches Verhalten über jeden Scope, und eine geteilte Regel ist schwerer zu durchdenken als eine konsistent angewandte Policy plus dokumentierter Grenze. Ein Projekt, das der Nutzer öffnete, ist nicht nennenswert vertrauenswürdiger als das eigene Home des Nutzers.

**Symlinks folgen, aber Ziele ablehnen, die außerhalb des Projekt-Roots auflösen.** Verworfen: Es führt eine partielle Trust Boundary in der falschen Schicht wieder ein — Pfadgeometrie statt Leseautorität —, bricht den legitimen `$DSH_HOME`-nach-anderswo-Fall und dupliziert Containment, das das Filesystem-Policy-Gate bereits besitzt.

## Konsequenzen

Eine per Symlink referenzierte Instruktionsdatei wird nun geladen und gerendert wie ihr Ziel, was geteilte kanonische Instruktionsdateien über Tools und Homes ermöglicht, und der `CLAUDE.md → AGENTS.md`-Spiegel dedupliziert über Inhalt statt übersprungen zu werden. Das Plugin hängt für das Instruktionsladen nicht mehr von `ctx.fs.lstat` ab; ein aufgelöstes Nicht-Datei-Ziel ist eine bestätigte Abwesenheit, und nur eine Provider-Exception ist vorübergehend nicht verfügbar. Die Trust Boundary zieht aus diesem Plugin in die Filesystem-Policy- und Sandbox-Schichten, die `ctx.fs` einschränken müssen, wenn ein Deployment nicht vertrauenswürdige Repositories lädt. Die [agent-instructions-Notiz](../../archived/feature/2026-06-24-workspace-context.md) und die Paket-README tragen dasselbe Follow-Verhalten und die Restrisiko-Aussage.
