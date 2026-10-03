# Agent Note: Die Alpha-Session-Migration verweigert jedes unbekannte historische Event

Status: implemented

[English](2026-08-31-alpha-historical-unknown-event-refusal.md) | [中文](2026-08-31-alpha-historical-unknown-event-refusal.zh.md) | Deutsch

## Problem

Das Lesen einer Session mit gleicher Version kann ein unbekanntes Event nur dann sicher überspringen, wenn sein Produzent den Envelope mit `ignorable: true` markiert hat. Eine kardinalitätserhaltende Migration hat eine strengere Verpflichtung: Sie muss beweisen, dass jedes bewahrte Payload in der Zielgeneration semantisch gültig bleibt. Ein unbekanntes JSON-Payload kann Session-Sequenznummern, Lebenszyklus-Fakten oder modellsichtbaren Zustand enthalten, den Compile-Zeit-Brands nicht aufdecken können.

Ein solches Event still zu kopieren kann veraltete numerische Referenzen hinterlassen, nachdem eine spätere Kante Event-Positionen ändert. Es still wegzulassen verliert dauerhafte Daten. Die exakte unveränderliche v0-Generation zu behalten macht keines der beiden transformierten v1-Ergebnisse verlustfrei.

## Entscheidung

Die Alpha-v0-zu-v1-Kante besitzt ein eingefrorenes vollständiges Released-v0-Event- und -Payload-Inventar. Sie verweigert vor dem Target-Staging jeden unbekannten historischen Event-Typ, einschließlich eines mit `ignorable: true` markierten Events, und verweigert unerwartete Member bekannter Payloads, außer Feldern, die explizit als Owner-opakes JSON klassifiziert sind. Merge-erweiterbare verschachtelte Diskriminanten bleiben Teil dieser expliziten Policy: Unbekannte Content-Block-Typen, Message-Source-Arten, Assistant-Finish-Reason-Arten und Turn-Ending-Reason-Arten werden als Owner-opakes JSON bewahrt, während bekannte Arme strukturelle Validierung erhalten. Die Diagnose benennt den Event-Typ, seine Sequenznummer und die unveränderte Quellgeneration.

Die Regel gilt nur beim Überschreiten einer historischen Formatkante. Das gewöhnliche Lesen im aktuellen Format behält das etablierte Envelope-Verhalten: Ein unbekanntes erforderliches Event verweigert, während ein unbekanntes Event mit `ignorable: true` lesbar bleibt. Native externe Events im aktuellen Format behalten daher die bestehende Gleichversions-Erweiterungsnaht, werden aber durch eine zukünftige Formatkante nicht implizit migrierbar.

Jeder First-Party-Quell-Event-Typ hat eine ausführbare Disposition und einen Zielvalidator im Edge-Package. Der Katalog ist build-statisch und profilunabhängig; das Mounten oder Weglassen des Produzenten-Plugins kann daher nicht ändern, ob ein altes Artefakt migriert.

## Konsequenzen

Manche v0-Sessions, die von Repository-externen Informations-Plugins erzeugt wurden, können die Alpha-Migration verweigern, obwohl der v0-Codec sie dekodieren kann. Eine Verweigerung publiziert keinen Nachfolger; der suffixlose v0-Pfad, die Bytes und die Inode bleiben daher maßgeblich und unverändert. Operatoren können den blockierenden Typ an der Diagnose erkennen und behalten vollen Zugriff auf seinen Rohtext.

Community-Feedback wird die nächste Policy bestimmen. Ein späterer Release kann eine explizite Migrations-Schnittstelle für externe Owner hinzufügen, das Weglassen explizit ignorabler historischer Events bei Beibehaltung der exakten Quellgeneration erlauben oder die strikte Verweigerung beibehalten. Keine Option wird durch den Alpha-Marker impliziert.

`SessionSeq` und `SessionLogOffset` machen bekannte First-Party-Zahlenfelder auditierbar, können aber Zahlen in einem unbekannten Laufzeitobjekt nicht klassifizieren. Die Migrationsregel kann daher aus dem Fehlen eines erkannten gebrandeten Felds keine Sicherheit ableiten.

Diese Notiz ersetzt [Ignorable externe Session-Events beibehalten](2026-08-30-retain-ignorable-external-session-events.de.md) nur für die historische Formatmigration. Jene Entscheidung bleibt für Gleichversions-Append und -Reload aktuell.

## Erwogene Alternativen

- **Unbekannte ignorable Events wörtlich kopieren** — bewahrt Bytes, kann aber nicht beweisen, dass opake numerische oder Lebenszyklus-Fakten nach strukturellen Kanten gültig bleiben.
- **Unbekannte ignorable Events verwerfen** — hält die Migration verfügbar, ist aber nicht verlustfrei und lässt den Marker eine Datenlöschung autorisieren.
- **Unbekanntes JSON nach zahlenähnlichen Feldnamen durchsuchen** — Heuristiken können keine semantische Identität begründen und erzeugen falsches Vertrauen.
- **Gemountete Plugins dynamisch befragen** — macht die Migrationsverfügbarkeit von einer Deployment-Komposition abhängig und schlägt fehl, bevor ein abwesender Produzent mounten kann.
- **Erst verweigern, wenn die erste strukturelle Kante ausgeliefert wird** — ließe v1 historische Werte enthalten, deren sichere Interpretation nie hergestellt wurde; die Identitäts-Generalprobe ist der Punkt, an dem die Policy ausführbar werden muss.
