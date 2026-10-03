# Übersetzungsregeln
[English](translation-rules.md) | [中文](translation-rules.zh.md) | Deutsch


Wie zwischen den drei Seiten eines Dokumentenpaares in diesem Repository übersetzt wird. Alle drei Sprachen sind gleichberechtigt ([README.md](README.de.md)): Eine Änderung wird in jeder Sprache verfasst, und diese Seite ist die Quelle für diese Aktualisierung — diese Regeln regeln die Erstellung oder Aktualisierung der Gegenstücke. Sie binden Menschen und Agenten gleichermaßen. Die agentliche Routinearbeit übersetzt den geänderten Inhalt direkt in einem terminologiegeleiteten Durchgang; der erweiterte Workflow [.agents/skills/dsh-translate-docs](../../.agents/skills/dsh-translate-docs/SKILL.md) läuft nur, wenn der Benutzer ihn explizit aufruft. Die Regelstufen folgen der RFC-2119-Verwendung: **MUST** / **MUST NOT** blockieren Gate oder Review; für **SHOULD** ist ein Abweichungsgrund zu nennen; **MAY** ist Ermessenssache.

## Treue

- Das Gegenstück *MUST* dasselbe sagen wie die verfasste Seite — kein hinzugefügtes Verhalten, keine zusätzlichen Voraussetzungen, Warnungen, Versionsangaben oder Beispiele, und keine Weglassungen. Wenn sich das Paar in der Substanz nicht einig ist, gewinnt keine Sprache von vornherein: Korrigiere die falsche Seite und bringe die anderen Seiten in derselben Änderung mit.
- Das Gegenstück *SHOULD* als natürliche technische Schriftsprache seiner eigenen Sprache lesbar sein, nicht als wortweiser Glossar-Eintrag. Übersetze die Bedeutung, strukturiere Sätze um, wo es die Zielgrammatik verlangt, und behalte den Register der Autorin — Knappes bleibt knapp.
- Übersetze das Unübersetzbare nicht: Wenn ein Satz sich natürlicher Wiedergabe entzieht, weil er auf einem Idiom der Quellsprache aufliegt, übersetze die Idee, nicht das Idiom.

## Stimme

- Der Register wird durch [style-samples.md](style-samples.md) kalibriert — von Menschen freigegebene Goldpaare, eines pro Dokumentengattung. Das Gegenstück MUST zur Zielsprachenseite des nächstliegenden Beispiels passen; wo dessen Stimme und eine Prosastimmregel in Konflikt stehen, gewinnt das Beispiel. Chinesische Ziele verwenden institutionelles technisches Chinesisch; englische Ziele verwenden knappe professionelle Entwicklerprosa; deutsche Ziele verwenden knappe professionelle technische Deutschprosa.
- Schreibe als muttersprachliche technische Autorin, die den Inhalt neu formuliert, nicht als Übersetzerin, die Sätze transponiert, während du jede Quellklausel erhältst: nichts hinzugefügt, nichts weggelassen — Fluenz rechtfertigt nie das Verlieren einer Klausel.
- Verleihe Sätzen einen expliziten Akteur, wenn die Zielsprache ihn andernfalls verschleiern würde; im Chinesischen ersetze vage Passivkonstruktionen oder abstrakte Subjekte durch den tatsächlichen Akteur (系统、门禁、评审人).
- Bevorzuge etablierte Engineering-Idiome der Zielsprache gegenüber Lehnübersetzungen (误报／漏检 für false positive/negative, 执行红线 für enforcement frontier); lokalisiere Metaphern, statt sie zu transplantieren, und zerlege Nominalketten, wo es die Zielsprache verlangt.
- Teile lange Absätze nach semantischen Einheiten auf — eine Idee pro Absatz. Absatzgrenzen dürfen von der Quelle abweichen; die strukturelle Signatur zählt Absätze nicht.
- Beim Übersetzen ins Chinesische verwenden Kategorienomen Chinesisch mit einer Erstnennungs-Englisch-Anmerkung (实操手册（cookbook）); beim Übersetzen ins Englische verwende den konventionellen englischen Kategorienamen. Wörtliche Verweise auf Verzeichnisse oder Dateien bleiben codeformatiertes Englisch.

## Strukturerhalt

Das Pairing-Gate prüft Titeltiefen, eingefasste Codeblöcke, Tabellen- und Spaltenanzahlen, Listentypen, Startnummern geordneter Listen, Anzahl der Listeneinträge, Link-Locale und semantische Ziele. Erhalte den Rest des Rahmens manuell; die Paardateien MUST ein zu eins übereinstimmen in:

- Titelhierarchie (gleiche Ebenen, gleiche Reihenfolge — der Titel-TEXT wird übersetzt),
- Listenform und -nummern,
- Tabellen (gleiche Spalten, gleiche Zeilenreihenfolge; Kopfzeilenzellen nach Terminologie übersetzt),
- eingefasste Codeblöcke — **byteidentisch, einschließlich Kommentare**; die Pairing-Signatur vergleicht ihre Info-Strings und Inhalte, und ` ```ts `-Blöcke kompilieren unter `doc-typecheck`,
- Inline-Code-Spans (Befehle, Flags, Konfigurationskeys, Dateipfade, Eventnamen, API-Namen, Versionsnummern) — wortgleich, nie übersetzt oder neu formatiert,
- Links und Anker: Jeder relative Dokumentlink MUST dasselbe semantische Ziel und exakt denselben Query-/Fragment-Suffix behalten. Wenn das Ziel zum aktiven Korpus gehört, verwendet die englische Seite ihren `.md`-Pfad, die chinesische Seite ihren `.zh.md`-Pfad und die deutsche Seite ihren `.de.md`-Pfad; ein fehlendes Gegenstück in diesem Korpus ist ein Fehler, während Ziele außerhalb ihren ursprünglichen Pfad behalten. Externe URLs, Bilder und reine Seitenfragmente bleiben unverändert. Der Sprache-Switcher bleibt die explizite Cross-Locale-Ausnahme, und ein außerhalb von GitHub gerendertes README MAY die kanonische öffentliche Repository-URL zu seinem exakten Gegenstück verwenden, wie in [README.md](README.de.md) dokumentiert. Der Link-TEXT wird übersetzt.

Die Markdown-Konventionen des Repositories gelten für `.zh.md`- und `.de.md`-Dateien unverändert: eine physische Zeile pro Absatz (`verify-md-wrap`), auflösbare relative Links (`verify-md-links`), exakt ein abschließender Zeilenumbruch.

## Terminologie

- [terminology.md](terminology.md) ist die Quellwahrheit in beiden Richtungen. Lade sie vor dem Übersetzen; jeder aufgeführte Begriff MUST seiner Zeile und ihren „不要译作“-Verboten folgen. Ein chinesisches Ziel verwendet die Spalte „中文“ und ihre „首次出现“-Anmerkung; ein englisches Ziel verwendet die Spalte „English“ ohne hinzuzufügende chinesische Glossierung; ein deutsches Ziel verwendet die Spalte „English“, für die die Tabelle keine „Deutsch“-Gegenstücksspalte führt.
- Für ein chinesisches Ziel DARF ein nicht aufgeführter Fachbegriff eine etablierte Wiedergabe aus einer großen chinesischsprachigen OSS- oder Vendor-Quelle verwenden (K8s-/Vue-/MDN-Chinesisch-Dokumente, 微软简中风格指南, Großkonzern-Projektdokumente), im PR zitiert. Ohne solchen Präzedenzfall MUST er auf Englisch bleiben und unter 「待定术语」(ausstehende Begriffe) mit einem Vorschlag aufgeführt werden.
- Für ein englisches oder deutsches Ziel verwende den etablierten englischen Fachbegriff. Wenn der Quellbegriff kein eindeutiges etabliertes Äquivalent hat, erhalte ihn mit einer kurzen erklärenden Glossierung und liste ihn unter den ausstehenden Begriffen auf. Keine Richtung darf eine Wiedergabe inline erfinden; ein entschiedener Begriff kommt in [terminology.md](terminology.md) im selben PR oder in einem Folge-PR.

## Typografie

Diese Regeln regeln die chinesische Seite; die englische und die deutsche Seite folgen den normalen Markdown-Konventionen des Repositories (Wurzel-`AGENTS.md`). Die folgenden Mischskript-Regeln folgen dem Cross-Project-Konsens des [MDN-Vereinfachtes-Chinesisch-Übersetzungsführers](https://github.com/mdn/translated-content/blob/main/docs/zh-cn/translation-guide.md), des [Kubernetes-zh-cn-Lokalisierungsführers](https://kubernetes.io/zh-cn/docs/contribute/localization_zh/), der [Vue.js-Chinesisch-Übersetzungsregeln](https://github.com/vuejs-translations/docs-zh-cn/wiki/%E7%BF%BB%E8%AF%91%E9%A1%BB%E7%9F%A5) und des [中文文案排版指北](https://github.com/sparanoid/chinese-copywriting-guidelines), die ihrerseits auf [W3C clreq](https://www.w3.org/TR/clreq/) und GB/T 15834—2011 fußen:

- MUST einen halben Leerraum zwischen chinesischem Text und lateinischen Wörtern sowie zwischen chinesischem Text und Zahlen setzen: `每个 plugin 注册 3 个 tool`. Kein Leerraum zwischen einem Vollbreiten-Punktuationszeichen und irgendetwas.
- MUST in chinesischem Prosa Vollbreiten- (Chinesisch-)Punktuierung verwenden: `，。：；？！（）「」`. Halbbreite Punktuierung bleibt in Code-Spans, in vollständig zitierten englischen Sätzen und in Zahlen (`3.5`, `1,024`).
- Chinesische Prosa *SHOULD* Doppelpunkte, Punkte, Kommata oder Klammern gegenüber Gedankenstrichen bevorzugen. Behalte einen Gedankenstrich nur, wenn keine andere Punktuierung den Satz natürlich erhält.
- Aufzählungskomma: Eine chinesische Liste paralleler Einträge verwendet 顿号（、）, keine Kommata.
- MUST NOT Vollbreiten-Ziffern oder Vollbreiten-lateinische Buchstaben verwenden — `１２３` nie, `123` immer.
- Eigennamen behalten ihre kanonische Großschreibung: GitHub, TypeScript, DeepSeek — nie `github`/`Github`, außer bei Codezitat.
- Die zweite Person ist 你, nicht 您 (entspricht den Vue- und Kubernetes-Chinesisch-Konventionen und der direkten Stimme dieses Repositories).
- Hervorhebungsmarker (`**fett**`, `*kursiv*`) bleiben auf denselben Spans wie die Quelle; Chinesisch hat keine Kursivschreibung, daher kann die gerenderte Hervorhebung identisch aussehen — ersetze keine Anführungszeichen oder andere Dekoration.

## Qualitätsmaßstab

- Ein Paar ist fertig, wenn eine trilinguale Ingenieurin, die nur eine Datei liest, alles erhält, was eine Leserin der anderen Dateien erhält — gleiche Fakten, gleiche Warnungen, gleicher Ton — und nichts Zusätzliches.
- Führe `pnpm run verify-translation-pairing` und den Rest von `doc-sync` für Records, Switcher, Titeltiefen, Codeblöcke, Tabellen- und Spaltenanzahlen, Listentypen, Startnummern geordneter Listen, Anzahl der Listeneinträge, Links und Repository-Markdown-Regeln aus. Die menschliche Review trägt die Reihenfolge von Listen und Tabellen, nichtkanonische Listennummern, Inline-Code, Hervorhebung, Bedeutung, Terminologie und Ton.

## Referenzen

Von diesen Regeln zitierte Autoritäten, für Menschen und Agenten, die die zugrunde liegende Begründung wollen:

- [中文文案排版指北](https://github.com/sparanoid/chinese-copywriting-guidelines) — der de-facto-Community-Standard für Mischskript-Abstände und -Punktuierung.
- [MDN-zh-CN-Übersetzungsführer](https://github.com/mdn/translated-content/blob/main/docs/zh-cn/translation-guide.md) — eine im Repository befindliche Übersetzungsregel-Datei in derselben Form wie diese; Abstände, Punktuierung und Glossar-Praxis.
- [Kubernetes-zh-cn-Lokalisierungsführer](https://kubernetes.io/zh-cn/docs/contribute/localization_zh/) — Erstnennungs- und Punktuierungspraxis des größten zh-Lokalisierungsteams.
- [Vue.js docs-zh-cn 翻译须知](https://github.com/vuejs-translations/docs-zh-cn/wiki/%E7%BF%BB%E8%AF%91%E9%A1%BB%E7%9F%A5) — pro-Begriff-Übersetzen-/Beibehalten-Entscheidungen und Ton.
- [zh-style-guide](https://zh-style-guide.readthedocs.io) — eine Community-Stilrichtlinie für chinesisches technisches Schreiben, deren Regelstufentaxonomie (und RFC-2119-Schlagwortstufen) diese Datei übernimmt; aggregiert GB/T 15834/15835, clreq und Vendor-Führer.
- [W3C clreq](https://www.w3.org/TR/clreq/) und der [Microsoft-Vereinfachtes-Chinesisch-Stilführer](https://learn.microsoft.com/en-us/globalization/reference/microsoft-style-guides) — die formellen Typografie- und Vendor-Lokalisierungs-Baselines.
- GB/T 19682-2005《翻译服务译文质量要求》 — der nationale Standard, dessen drei Basisanforderungen (忠实原文、术语统一、行文通顺) die Treue- und Terminologie-Abschnitte dieser Datei operationalisieren.
