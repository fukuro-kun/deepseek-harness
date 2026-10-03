# Agent Note: Locale-eigene Client-UI-Texte
[English](2026-08-23-locale-owned-client-ui-copy.md) | [中文](2026-08-23-locale-owned-client-ui-copy.zh.md) | Deutsch

Status: implemented


## Problem

Typisierte locale-Namespaces und die Parität bilingualer Wörterbücher bewiesen, dass registrierte Wörterbücher vollständig waren, konnten aber nicht beweisen, dass der Darstellungscode sie verwendete. JSX-Text, Accessibility-Attribute, Formatter-Rückgaben und Cordis-freie Primitive-Defaults konnten `t` umgehen, während jede locale-Prüfung grün blieb. Die zurückgestellten und vermeintlich sprachneutralen Ausnahmen, die in der [ursprünglichen Vollrollout-Entscheidung](../../archived/architecture/2026-07-30-client-locale-full-rollout.md) festgehalten wurden, sammelten sich zu einer gemischtsprachigen UI, besonders in der Trajektorien-Inspektion und generischen Tool-Karten.

## Entscheidung

**locale-Wörterbücher besitzen alle vom Produkt verfassten Client-UI-Formulierungen.** Sichtbarer Text, Accessibility-Namen, Tooltips, Platzhalter, Leerzustände, Statuslabels, Einheiten und Formatierungsvorlagen erreichen die Darstellung über einen typisierten `t`-Sitz oder ein bereits lokalisiertes prop. Ein von einem Benutzer, Modell, provider, Plugin, Protokoll-Peer oder Betriebssystem verfasster Wert bleibt Daten und wird wörtlich gerendert; Protokoll-Tags, Tool-Namen, Pfade, URLs, JSON/JavaScript-Literale und stabile interne IDs werden nicht übersetzt.

Produkt-eigene Katalogbeschreibungen folgen derselben Regel. Der Client bildet einen exakten eingebauten provider, ein Modell und eine Beschreibung auf einen locale-Schlüssel ab; eine geänderte Beschreibung oder eine externe provider-Beschreibung bleibt provider-Daten und wird wörtlich gerendert.

**Cordis-freie Primitive erfordern vollständige lokalisierte Text-props und besitzen keinen Sprach-Fallback.** `MarkdownText`, `JsonTree`, `TerminalBlock`, `DiffBlock`, `ReadBlock`, `SearchBlock`, `WebBlock`, `CodeBlock`, `JsonBlock`, `HoverCard` und `ConnectionIndicator` erhalten ihre Oberflächentexte vom Feature-Render-Ort. Dies bewahrt die Laufzeitunabhängigkeit des Primitive-Pakets und macht das Weglassen zu einem Typfehler, statt still Chinesisch oder Englisch zu wählen. Geteilte Wörter leben im `common`-Namespace; Feature-spezifische Formulierungen bleiben beim Feature, das ihre Bedeutung entscheidet.

**Lokalisierter Anzeigetext ist niemals eine Identität.** Modelle und Speicher behalten Diskriminanten, stabile IDs und nicht-anzeigende Marker. Renderer übersetzen nach dem Matching, und Request-Maps tragen stabile Gruppenzugehörigkeit in das Trajektorien-Ledger. Ein Client-synthetisierter Fehler, der in einem View-Modell überleben muss, verwendet einen stabilen Marker und wird nur bei der Anzeige übersetzt. Ein Sprachwechsel ändert daher die Formulierung, ohne Auswahl, Gruppierung, Suchidentität oder Lifecycle-Zustand zu ändern.

**`verify-client-ui-i18n` setzt die Quellen-Ownership durch.** Die TypeScript-AST-Prüfung entdeckt jeden Paket-`src/client`-Baum, der TSX enthält, alle Helper-TS-Dateien unter `packages/client/ui-*` und die Web-App-Quelle. Sie lehnt natürlichsprachlichen JSX-Text, texttragende Attribute und Komponenten-props, literale JSX-Zweige, Label-/Text-Daten, benannte Text-Helfer, String-zurückgebende Anzeige-Formatter und Destrukturierungs-Defaults ab. locale-Wörterbuch-Eigentümer und unveränderliche Sprach-tokens sind die engen syntaktischen Ausnahmen. Die Entdeckung verweigert einen verengten Korpus, Unit-fixtures pinnen zugelassene und ausgeschlossene Formen, und die Prüfung läuft in den statischen CI- und `hygiene`-Graphen. Die Wörterbuch-Schlüssel-Parität bleibt eine separate Prüfung: Eine Schranke beweist, dass Text in den locale-Pfad gelangt, während die andere beweist, dass beide ausgelieferten Sprachen diesen Pfad implementieren.

Die produktverfassten Fehler- und Design-Literal-Ausnahmen, Primitive-Defaults und die Trajektorien-Zurückstellung aus dem [ursprünglichen Rollout](../../archived/architecture/2026-07-30-client-locale-full-rollout.md) werden durch diese Entscheidung abgelöst. Ihre Label-Thunk-, Typed-Seat-, Browser-locale-, Datumsformatierungs- und Suchplatzhalter-Entscheidungen bleiben aktiv.

## Verifikation

Die eigene Vitest-Spec der AST-Prüfung pinnt direktes JSX, Template-Zweige, semantische Text-props, Label-Daten, Formatter-Rückgaben, locale-Schlüssel-Aufrufe, strukturelle Attribute und Wörterbuch-Eigentümer. Die locale-Wörterbuch-Parität pinnt identische `zh`/`en`-Schlüssel. Client-Suiten üben direkte übersetzte Sitze, locale-prop-adapter und eingebaute Katalogbeschreibungs-Lokalisierung, ohne externe Beschreibungen zu ändern. Die assemblierte Web-Wiedergabe plus das erforderliche Real-Server-GIF demonstrieren den ausgelieferten Sprachwechsel auf der tatsächlichen Trajektorien-Oberfläche.

## Erwogene Alternativen

**Sich nur auf Review und AGENTS.md verlassen.** Abgelehnt, weil die bestehende Regel und typisierte Wörterbücher mit Hunderten von Umgehungen koexistierten; Reviewer benötigen einen Quell-Level-Fehler an der einführenden Zeile.

**Einen Text-Regex verwenden oder jedes String-Literal verbieten.** Abgelehnt, weil TypeScript und JSX Imports, CSS-Klassen, Diskriminanten, Ereignisnamen, SVG-Daten und Benutzer-/Protokollwerte enthalten. Syntaxbewusste Kontexte liefern ein nützliches Signal ohne eine ständig wachsende Datei-Allowlist, während die minimale Entdeckungsanzahl ein fälschlich grünes verengtes Scannen verhindert.

**Primitive-Fallback-Text für bequeme direkte Nutzung behalten.** Abgelehnt, weil ein Fallback selbst eine implizite locale-Wahl ist. Erforderliche Label-props halten Primitive framework-frei und lassen jeden Produkt-Render-Ort seinen Text-Eigentümer benennen.

**Jeden String übersetzen, der das DOM erreicht.** Abgelehnt, weil verfasste Daten und Protokoll-/Code-tokens keine Produktformulierung sind. Ihre Übersetzung korrumpiert Nachweise, Identifikatoren, Befehle, Pfade, URLs und provider-Diagnosen; nur das umgebende Produkt-Chrome gehört zum locale-System.

## Konsequenzen

- Das Hinzufügen oder Ändern von Client-UI-Text erfordert einen typisierten Wörterbuchschlüssel in beiden locales und Verhaltensnachweise für den betroffenen Render-Pfad.
- Reine Primitive haben größere explizite prop-Typen, und Tests liefern bewusste Label-fixtures; dieser Preis verhindert verstecktes locale-Verhalten.
- Die AST-Prüfung fängt verfasste literale Umgehungen ab, kann aber nicht beweisen, dass ein beliebiges dynamisches String-prop übersetzt wurde. Typen, Wörterbuch-Parität, Komponententests und Review besitzen weiterhin diese semantische Unterscheidung.
- Boot-Markup, das vor dem locale-Service rendert, und extern verfasste Laufzeitdaten bleiben außerhalb des Wörterbuchpfads; die Produkt-UI ersetzt Boot-Text nach der locale-Aktivierung.
