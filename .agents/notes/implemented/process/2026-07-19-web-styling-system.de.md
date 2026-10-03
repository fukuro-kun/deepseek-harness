# Agent Note: Web-Styling-System — das Token-Framework und die Engineering-Constraints
[English](2026-07-19-web-styling-system.md) | [中文](2026-07-19-web-styling-system.zh.md) | Deutsch

Status: implemented

> Token-System-Update (2026-07-22): Die Framework-Festlegungen hier (CSS Modules + clsx, keine Component Library, kein Tailwind, nur Token-Farben) gelten weiterhin, aber die zweischichtige `--bg-*`/`--text-*`-Token-Tabelle und ihr Zuhause `web-ui/src/style/global.css` wurden durch die `--dsw-*` static+alias Sheets in `packages/client/ui-theme/src/styles/` ersetzt (dark = `body[data-ds-dark-theme]`-Override) — die Sheets selbst sind die Token-Autorität.


> Arbeitsteilung: Dieses RFC legt Framework und Constraints fest (ändert sich selten); [docs/web-styling.md](../../../../docs/web-styling.de.md) ist die lebende Spec (maßgebliche Token-Werte, die Coding-Rule-Checkliste, der Abweichungs-Record — sie entwickelt sich mit der Implementierung). Token-Änderungen und neue Regeln gehören dorthin; nur Änderungen am Framework selbst kommen hierher zurück (sein Umstoßen erfordert ein neues RFC).

## Problem

Die GUI hat keinen Designer-Nachschub; Styles werden von einem Agent geschrieben und reviewt. Ohne maschinell prüfbares Token-System und Coding-Regeln driften Farben/Radien/Motion als Literale über Komponenten hinweg, und Dark Mode wächst zu verstreuten Bedingungszweigen innerhalb von Komponenten.

## Entscheidung

| # | Entscheidung | Inhalt |
|---|---|---|
| 1 | **Visuelle Baseline = Chat-Alignment** | Jeder Wert stammt aus der Chat-Frontend-Studie (Markenblau `--accent: #3964fe`, Graustufen, Bubble-/Sidebar-Geometrie, Schattenstufen…); Abweichung ist erlaubt, muss aber in der Abweichungstabelle von web-styling.md erfasst werden |
| 2 | **Zwei Token-Ebenen, nicht drei** | Das Baseline-Repo nutzt drei Ebenen static→alias→specific; in unserer Größe komprimiert sich das auf „eine semantische Ebene, die echte Werte direkt hält (Kommentare zitieren die Base-Palette-Quelle) + eine Handvoll komponentenspezifischer Slots (`--bg-sidebar`/`--bubble-bg`)" — zwei Ebenen, alle in `web-ui/src/style/global.css` |
| 3 | **Font-Größen/Spacing werden nicht tokenisiert** | Gleiche Entscheidung wie im Baseline-Repo: Font-Größen werden in px innerhalb der Komponenten geschrieben und **immer mit einer Line-Height gepaart** (16/24, 14/22, 12/18); Spacing nutzt Vielfache von 4; Tokenisierung deckt nur Farben/Radien/Motion/Font-Stacks/Schatten ab |
| 4 | **Borders und Interaktionszustände nutzen das Opazitätsschema** | Borders `rgba(0,0,0,.04/.1)`, hover/active `rgba(38,49,72,.06/.1)` — sie halten auf jedem Elevation-Background, keine neuen soliden Grautöne |
| 5 | **Dark Mode passiert nur in der Token-Tabelle** | `:root` hält helle echte Werte + `[data-theme='dark']` überschreibt die gleichnamigen Variablen; **Komponenten-CSS hat null Theme-Selektoren**; wenn ein Nicht-Token-Wert wirklich themenabhängig variieren muss, die „CSS-Variablen-Brücke" nutzen (die Komponente definiert eine lokale Variable, der Theme-Block überschreibt nur die Variable) |

## Engineering-Constraints

- **CSS Modules + clsx, keine Component Library, kein Tailwind**: Jede Komponente hat eine gleichnamige `.module.css` im selben Verzeichnis; Klassennamen sind camelCase, einzeladjektivische State-Klassen werden via clsx angehängt; Komponenten reichen `className` durch.
- **`composes` ist verboten**; `:global` durchsticht nur Drittanbieter-/paketübergreifende Klassennamen und definiert nie neue globale Klassen; globale Utility-Klassen leben nur in global.css und bleiben einstellig (derzeit `.scrollable`).
- **PostCSS-Plugins sind derzeit null** (vite hat keine postcss-Config; flaches CSS reicht — die Einführung von nested/custom-media muss zuerst in web-styling.md vermerkt werden); CSS-Modules-Typdeklarationen nutzen das Wildcard-declare in `css-modules.d.ts` (typed-css-modules per-File-Generierung ab 20 Komponenten neu bewerten).
- **Dynamische Styles laufen über die CSS-Variablen-Brücke**: JS schreibt nur Variablen (`style={{'--x': v}}`), Regeln bleiben im CSS; das Zusammenbauen von Style-Objekten in TSX für Theme-/State-Branches ist verboten.
- Transitions sind immer `var(--dur*) var(--ease)` und transitionen nur opacity/transform/background-color/shadow; Scroll-Container nutzen einheitlich `.scrollable` (das Schreiben von `::-webkit-scrollbar` in Komponenten ist verboten).

## Die Ausführungsform für Agents

Die Spec wird als **Review-Checkliste** gepflegt (web-styling.md §3, 12 Punkte): Jeder Punkt ist ein entscheidbares „sieh X, reject" — kein Stilvorschlag —, und Styles schreiben und Styles reviewen teilen sich dieselbe Tabelle.

Einstiegspunkte für häufige Aufgaben (operative Checklisten):

- **Neue Komponente stylen**: gleichnamige `.module.css` im selben Verzeichnis, Selbstcheck gegen web-styling.md §3 Punkt für Punkt; Farben/Radien/Motion referenzieren nur §1-Tokens.
- **Einen Token hinzufügen**: zuerst eine Zeile in der web-styling.md-§1-Tabelle ergänzen (heller Wert + dunkle Spalte + Base-Palette-Quellkommentar) → sowohl den global.css-`:root`- als auch den `[data-theme='dark']`-Block aktualisieren → erst dann in einer Komponente referenzieren.
- **Von einer Visual-Baseline-Konstante abweichen** (die Geometrie-/Schattenwerte von web-styling.md §2): zuerst eine Zeile in der §5-Abweichungstabelle erfassen (Datum/Punkt/Begründung), dann den Code landen.
- **Ein Nicht-Token-Wert, der themenabhängig variieren muss** (Gradient-Endpunkte und ähnliches): Die Komponente definiert eine lokale CSS-Variable, und der Theme-Block überschreibt nur die Variable (die Variablen-Brücke); Komponenten-CSS behält null `[data-theme]`-Selektoren.

## Arbeitsteilung mit web-styling.md

| Inhalt | Zuhause |
|---|---|
| Die fünf Framework-Regeln, Engineering-Constraints, warum zwei Ebenen / warum Font-Größen nicht tokenisiert sind | Dieses RFC (es zu ändern = ein neues, superseding RFC) |
| Maßgebliche Werte pro Token (inkl. dark), Visual-Baseline-Konstanten (Sidebar-/Bubble-/Session-Row-/Input-Card-Geometrie), das RPC-Vier-Quadranten-Richtungsmarker-Vokabular, die 12 Coding-Regeln, der Abweichungs-Record | web-styling.md (lebendes Dokument, entwickelt sich mit der Implementierung) |
| Wert-Evidenz (deepseekchat file:line) | Das Studien-Archiv hat seinen Zweck erfüllt; die Git-History bewahrt es |

## Konsequenzen

Styles konvergieren maschinell prüfbar: Farben/Radien/Motion/Schatten referenzieren nur die §1-Tokens von web-styling.md, Dark Mode ist eine einzige Attribut-Selektor-Override-Tabelle, und das Review läuft über dieselbe 12-Punkte-Checkliste, gegen die der Autor selbst prüft. Der akzeptierte Preis: Font-Größen/Spacing beruhen auf der Paired-Line-Height- und Vielfache-von-4-Disziplin statt auf Tokens, und jede Framework-Änderung erfordert ein superseding RFC.

## Berücksichtigte Alternativen

| Abgelehnt | Ein-Zeilen-Begründung |
|---|---|
| Tokenisierung von Font-Größen/Spacing | Das Baseline-Repo beweist Konvergenz ohne sie (die Paired-Line-Height-Disziplin ersetzt sie); eine aufgeblähte Token-Tabelle verwässert die Autorität der Farb-Tokens |
| Dark Mode via `prefers-color-scheme` oder In-Component-Branches | Attribut-Selektor-Ganztabellen-Override hält Komponenten ahnungslos; Systempräferenz kann später auf den Toggle gelegt werden, ohne den Token-Mechanismus anzufassen |
