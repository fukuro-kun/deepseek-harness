# Agent Note: Gemeinsame Client-Control-Primitives

Status: implemented

[English](2026-09-05-shared-client-control-primitives.md) | [中文](2026-09-05-shared-client-control-primitives.zh.md) | Deutsch

## Problem

Client-Feature-Plugins komponieren über Slots und importieren niemals Werte voneinander; `@deepseek-ai/dsh-client-ui-primitives` ist daher ihr einziger Kanal, eine React-Komponente zu teilen. Ein Control, das in einem Feature-Package wächst, ist für das nächste Package, das dasselbe braucht, unsichtbar, und das Kopieren seines Markups und CSS ist der billigste verfügbare Schritt. Drei Familien waren so auseinandergelaufen. Ein 36×20-Umschalter existierte nur innerhalb von `ui-settings-plugins`. Schreibgeschützte Kapsel-Badges wurden fünfmal getrennt deklariert, verteilt auf `ui-agent-preset`, `ui-settings-plugins` und `ui-settings-plugin-inventory`, mit zwei verschiedenen Eckenradien und separat erstellten Paletten. Ein Plugin-Phasen-Statuspunkt wurde in `ui-settings-plugin-inventory` neu implementiert, direkt neben dem geteilten `StateDot`, den er dupliziert.

Keine der beiden Fix-Hälften stand einem Autor zur Verfügung. Keine Checkliste wies ihn an, vor dem Schreiben eines Controls in `ui-primitives` nachzusehen, und das Package gab ihm nichts zum Nachsehen: Sein README nannte sechs Quelldateien, während das Package mehr als vierzig Symbole exportierte.

## Entscheidung

**Ein Control, das ein zweites Client-Package braucht, lebt in `ui-primitives`.** Die Regel ist eine Anleitung für Autoren, kein Gate: Ein Feature-Package darf weiterhin eine eigene Komponente schreiben, wenn sein Bedarf wirklich spezifisch ist, und die Liste [was lokal bleibt](#what-stays-local) unten protokolliert die Fälle aus dieser Änderung. Was die Regel verbietet, ist die Kopie — existiert ein Control bereits, nutzt der Autor es entweder oder hebt den absichtlichen Unterschied in ein Prop.

`Tag` ist das schreibgeschützte Kapsel-Badge. Seine Geometrie ist auf die von `ui-agent-preset` etablierte Größe fixiert: `999px`-Radius, `1px 8px`-Padding, 11px Text auf einer 17px-Zeile, Gewicht 500, `inline-flex`, kein Umbruch. Eine einzige geschlossene `TagTone`-Union wählt die Palette, und jedes Mitglied existiert, weil eine ausgelieferte Aufrufstelle es brauchte: `outline` und `solid` aus dem Agent-Preset-Bereich, `neutral` und `quiet` aus den Plugin-Einstellungsfeldern und `success`, `info`, `warning` und `danger` aus den Aktivierungs-Tags des Plugin-Inventars. Die Komponente trägt keinen eigenen Text, wie es jedes Cordis-freie Primitive muss.

`Switch` ist der Zwei-Zustands-Umschalter mit der von `ui-settings-plugins` etablierten 36×20-Schiene und dem 16px-Regler. `label` ist erforderlich und hat keinen Default, sodass eine Renderstelle den zugänglichen Namen nicht weglassen kann; `title` trägt einen Sperrgrund, wo ein Deployment das Control deaktiviert.

`StateDotState` erhält `idle`, einen statischen grauen Punkt in derselben Halo-und-Kern-Konstruktion wie `done`, `warning` und `error`. Die Phasen `pending` und `unloading` des Plugin-Inventars bedeuten, dass keine Aktivität läuft, und die vier bestehenden Zustände hatten dafür kein Mitglied; ohne `idle` verlieren diese beiden Phasen ihre Markierung vollständig. Die Ergänzung ist sicher für die acht Packages, die `StateDot` bereits nutzen, denn jedes erzeugt `StateDotState` aus seiner eigenen geschlossenen Status-Union, und keines switcht über `StateDotState` selbst.

**Der Komponentenkatalog im `ui-primitives`-README macht die Regel erst benutzbar.** Er listet jede exportierte Komponente mit ihrem Zweck und dem Fall, für den sie falsch ist, und er benennt die drei Paare, die leicht zu verwechseln sind: `Tag` gegen `Pill`, `DisclosureRow` gegen kartenförmige Disclosure und das package-interne `FoldToggle` gegen die exportierte Oberfläche. `Pill` ist der auswählbare Kapsel-Button — er nimmt `active` und `onClick` und steuert Ansichtsumschalter und Filter; `Tag` ist das schreibgeschützte Badge und nimmt keines von beiden. `Pill`s eigener Header-Kommentar bewarb sich früher selbst für Badges, was dem Katalog widersprach, und tut dies nicht mehr.

Die Regel steht in [packages/client/AGENTS.md](../../../../packages/client/AGENTS.md) als erster Schritt der Checkliste für neue Komponenten, und [docs/web-styling.md](../../../../docs/web-styling.de.md) verweist auf den Katalog, sodass auch ein von der Styling-Seite kommender Autor ihn erreicht.

## Die Duplikate finden

Eine namensbasierte Suche zählt zu wenig. `.badge`, `.tag`, `.chip` und `.configTag` übersehen eine Kapsel, die nach ihrer Rolle statt nach ihrem Aussehen benannt ist — `PluginCard`s Marker für ungespeicherte Änderungen heißt `.pending`, und seine Regel war byte-identisch zum Badge zwei Dateien weiter. Was sie findet, ist die Geometrie: eine CSS-Modules-Regel mit sowohl `border-radius: 999px` als auch `padding: 1px 8px`. Nach dieser Änderung trifft diese Signatur exakt zwei Regeln: `Tag` selbst und das unten beschriebene kaputte Badge. Der Ungespeichert-Marker behält nur eine `flex: none`-Platzierungsklasse, die die Signatur nicht mehr trifft.

<a id="what-stays-local"></a>
## Was lokal bleibt

Eine mechanische Suche gruppiert diese Controls mit den drei hochgestuften. Sie bleiben in ihren eigenen Packages, weil die Gruppierung oberflächlich ist:

- **`ui-trajectory`s Toolbar-Umschalter** trägt `role="switch"`, ist aber ein 88px beschriftetes Control mit inline Schiene und rendert derzeit `hidden`. Es ist nicht dasselbe Widget wie `Switch`.
- **`ui-schedule`s Statuspunkt** ist ein statischer blauer Punkt für den nächsten Lauf, der bei Überfälligkeit bernsteinfarben wird. `StateDot` hat kein statisches Blau — sein einziges Blau ist `ongoing`, eine animierte Pixelmatrix — und eine Animation pro Zeile in einer Zeitplanliste würde die Bedeutung ebenso falsch darstellen wie das Aussehen.
- **`ui-plan`s Mode-Chip** und **`ui-conversation`s `ReferenceChip`** sind interaktiv: Der erste ist ein Button im Warning-Ton mit Hover-, Fokus-, Disabled- und Schließen-Affordanz; der zweite ist ein Lexical-Atomknoten mit eigener Kürzung. Keines ist ein schreibgeschütztes Badge.
- **`ui-trajectory`s Zellen-Tag** und **`ui-user-questions`s Empfehlungs-Badge** nutzen eigene Geometrie — einen 6px-Radius in Tabellendichte und einen 6px-Radius mit Gewicht 600 auf dem Sidebar-Akzent. Eines von beiden in die Kapsel-Basislinie zu zwingen, würde ein bewusstes Design ändern, kein versehentliches.
- **`TerminalBlock`s Exit-Status-Pill** bleibt ein statisches `Pill`. Es sitzt auf einer 24px-Kommandozeile in der eigenen Geometrie des Pills, und `Tag`s 11px-Kapsel würde nicht in diese Zeile passen. Die schreibgeschützt/auswählbar-Trennung ist der übliche Leitfaden, aber hier entscheidet die Größe, und der Katalog sagt das auch.
- **`ui-agent-preset`s kaputtes Badge** teilt die Kapselgeometrie, trägt aber eine gefüllte Error-Farbe, die keine zweite Stelle nutzt, und ist der Hover-Anker für ein eigenes Tooltip-Element. `Tag` müsste eine Paletten-Überschreibung im Feature-Stylesheet halten und sich auf dateiübergreifende CSS-Reihenfolge verlassen, um sie zu gewinnen.

## Erwogene Alternativen

**Ein `SettingsCard`-Primitive.** Abgelehnt. `.card` erscheint in fünfzehn Packages, aber nur drei tragen Settings-Seiten-Semantik, und diese drei unterscheiden sich im Verhalten statt im Aussehen: `ui-settings-plugins`' `PluginCard` puffert Bearbeitungen und klappt erst nach einem vom Host bestätigten Speichern ein, `ui-agent-preset`s Karten sind auswählbar, und die des Plugin-Inventars sind schreibgeschützt. `PluginCard`s eigener Header-Kommentar protokolliert bereits, warum es die geteilte Disclosure-Zeile nicht nutzen kann. Eine einzelne Komponente müsste alle drei Verhalten über Props akzeptieren, von denen kein Aufrufer mehr als eines nutzt.

**Ein Gate, das `role="switch"` oder eine `.switch`-Regel außerhalb von `ui-primitives` ablehnt.** Abgelehnt. Das Ziel ist, dass Autoren das Bestehende wiederverwenden, nicht dass sie am Bauen gehindert werden. Ein Gate würde ein Package mit einem legitim spezifischen Control scheitern lassen — `ui-trajectory`s beschrifteter Toolbar-Umschalter ist genau dieser Fall — und die Kosten der falschen Ablehnung trägt der Autor, der am wenigsten dagegen argumentieren kann. Katalog plus Checklisten-Schritt adressieren das tatsächliche Versagen: dass Autoren nicht wussten, dass das Control existiert.

**Jedes aktuelle Aussehen hinter zusätzlichen `Tag`-Props bewahren.** Abgelehnt. Der 5px-Radius des Plugin-Inventars und die Agent-Preset-Kapsel sind dieselbe Art Tag in zwei Formen, und keiner der Unterschiede war entschieden. Beide zu behalten würde einen Zufall in eine öffentliche Union fixieren und den nächsten Autor raten lassen, welche er wählen soll.

**`Pill` erweitern statt `Tag` hinzuzufügen.** Abgelehnt. `Pill` ist 24px hoch auf einem 12px-Radius mit 12px Text; die Badge-Basislinie ist dichter und runder. Sie zu vereinen würde eine Komponente erzeugen, deren Größe davon abhängt, ob `onClick` vorhanden ist, und die schreibgeschützt/auswählbar-Unterscheidung verwischen, die der Katalog braucht, um „welches will ich" zu beantworten.

**Eine Zwei-Achsen-API `variant × tone` für `Tag`.** Abgelehnt. Drei Varianten gegen sechs Töne beschreibt achtzehn Kombinationen, von denen acht ausgeliefert werden, und es erlaubt einem Aufrufer, Kombinationen ohne definiertes Aussehen anzufordern. Die flache Union mit acht Mitgliedern bildet jeden Wert auf exakt ein ausgeliefertes Aussehen ab.

**Keinen Punkt für `pending` und `unloading` rendern statt `idle` hinzuzufügen.** Abgelehnt. Diese Zeilen zeigen heute einen grauen Punkt, und ihn wegzulassen würde Information aus dem Inventar entfernen — in einer Änderung, deren Zweck die Konsolidierung der Darstellung ist.

**Die Wiederverwendungsregel ins Root-`AGENTS.md` setzen.** Abgelehnt. Die Regel betrifft nur `packages/client`, und die Root-Datei sitzt exakt an ihrer 1950-Wörter-Grenze in `scripts/doc-budgets.manifest.json`; sie dort aufzunehmen müsste eine unverwandte repositoryweite Regel verdrängen.

## Tests

`Tag`, `Switch` und der erweiterte `StateDot` tragen Komponenten-Specs in `packages/client/ui-primitives/tests`, innerhalb des 100-%-Coverage-Gates pro Datei. `StateDot`s Palette wird durch Lesen seines Stylesheets fixiert: CSS Modules lösen in den Komponenten-Suites zu Klassennamen-Maps auf, sodass ein Zustand mit fehlender Farbregel auf der geerbten Farbe rendert und keine Render-Assertion es bemerkt.

Die migrierten Renderstellen behalten ihre bestehenden Package-Specs unverändert. Die Web-e2e-Goldens sind ARIA-Snapshots, und die vollständige wiedergegebene Web-Suite läuft ohne Neuaufzeichnung durch, weil die Migration jede Rolle, jeden zugänglichen Namen und jeden Zustand bewahrt — `Switch` behält `role="switch"` mit `aria-checked`, und der Phasenpunkt des Inventars behält seinen `role="img"`-Namen auf einem Wrapper, da `StateDot` `aria-hidden` ist.

Das ist zugleich die Grenze der automatisierten Belege. Kein Gate in diesem Repository vergleicht Pixel; Kapselgeometrie, Punkt-Halo und die Änderung der Schriftstärke werden durch Review anhand der Hell- und Dunkel-Screenshots im Pull Request verifiziert.

## Konsequenzen

- Ein neues Client-Control hat nun einen Ort zum Nachsehen und einen Ort zum Hinzufügen, und der Katalog macht das Nachsehen zu einem einzelnen Dateilesen statt zu einem `grep` über vierzig Exporte.
- `TagTone` ist acht Mitglieder breit, weil acht Aussehen ausgeliefert wurden. Ein neuntes hinzuzufügen erfordert eine Renderstelle, die es braucht, nicht ein Symmetrie-Argument.
- Die Tags des Plugin-Inventars wechseln von einem 5px-Rechteck zu einer Kapsel, und die Füllung des deaktivierten Tags wandert von `--dsw-alias-bg-layer-1` zum `--dsw-alias-bg-module-platform` des `neutral`-Tons — ein sichtbares Grau, wo vorher fast transparent. Seine Phasenpunkte erhalten einen Halo und animieren durch `loading` und `unloading`. Das Badge für nicht konfigurierte Secrets in den Plugin-Einstellungsfeldern wandert von Stärke 400 auf die Basislinie 500. Das sind bewusste visuelle Änderungen, hier protokolliert, damit ein späterer Leser sie nicht als Regressionen behandelt.
- Die Migration entfernt ein literales `#b45309`. Das `conditional`-Tag des Plugin-Inventars las `var(--dsw-alias-state-warning-primary, #b45309)`, und dieser Alias existiert nicht — das echte Token ist `--dsw-alias-state-warn-primary` —, sodass beide Themes den hartkodierten Fallback malten, den [docs/web-styling.md](../../../../docs/web-styling.de.md) verbietet.
- Die Regel lässt sich nicht mechanisch prüfen. Ein künftiger Autor kann weiterhin ein Control kopieren, und nur das Review wird es fangen. Das ist der akzeptierte Preis des Nicht-Gatens: Die Alternative lehnt legitime Arbeit ab, und die oben lokal bleibenden Packages sind der Beweis, dass legitime Arbeit existiert.
- `ui-primitives` wächst um zwei Komponenten, die heute je ein Package nutzt. Der Umschalter ist insbesondere ein Primitive mit einem einzigen Consumer, hochgestuft, weil es ein allgemeines Control ist und weil die bereits laufende Plugin-Verwaltungsarbeit es übernehmen wird, statt zwei weitere Kopien hinzuzufügen.
