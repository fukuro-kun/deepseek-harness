# Agent Note: Workspace-Registrierung löschen
[English](2026-07-27-workspace-registration-deletion.md) | [中文](2026-07-27-workspace-registration-deletion.zh.md) | Deutsch

Status: implemented


## Problem

Ein Workspace registriert ein bestehendes Code-Verzeichnis, damit die GUI es benennen und seine Sessions ordnen kann. Dieser Datensatz sagt nicht, dass Harness das Verzeichnis erzeugt hat oder besitzt, und das Session-Log ist ein unabhängiges Persistenzobjekt. Die Delete-Aktion der Zeile als rekursive Quell-Löschung oder Session-Löschung zu behandeln würde Daten außerhalb der Ownership-Grenze des Datensatzes zerstören.

Die bestehende nur visuelle Menüzeile ließ die Löschsemantik außerdem über durable Ordnung, die Workspace-Tabelle, Host-Streams, gleichzeitige Browser-Tabs, Reconnect-Baselines und eine mit der Mutation racende List-Anfrage hinweg undefiniert.

## Entscheidung

`ctx.workspaceRegistry.delete(id)` löscht nur die Workspace-Registrierung: Seine Id verlässt die durable `workspaceIds`, seine `workspaces`-Tabellenzeile und sein Entity-Cache-Eintrag verschwinden, und sein geordneter `sessionIds`-Account verschwindet mit dieser Zeile. Es ruft niemals Filesystem-Entfernung oder `SessionPersistence` auf; das Verzeichnis, jede Nutzerdatei, jede live Session und jedes persistierte Session-Log bleiben erhalten. Da die Sidebar-Gruppierung das Komplement aller überlebenden Workspace-Accounts ist, erscheinen diese Sessions sofort unter Ungrouped, einschließlich der aktuellen Session.

Unbekannte Ids geben am Domain-Contract `false` zurück. `workspace.delete({ workspaceId })` bildet diesen Unterschied auf `workspace-not-found` ab; Erfolg gibt `{ deleted: true }` zurück. `workspace.list` bleibt die Reconnect-Baseline.

## Durable Commit und Publikation

Registry-Operationen serialisieren Create und Delete. Die Löschung schreibt zuerst die Workspace-Ordnung ohne die Id, entfernt dann die Entity aus dem Cache und löscht zuletzt die Tabellenzeile. Die Tabellenlöschung ist der Notification-Commit-Point: Die Package-Invariante akzeptiert sie erst, nachdem der Cache die Entity nicht mehr publiziert, und der Host emittiert `host/workspace-removed` nur aus dieser committeten Löschung. Ein Tabellen-Schreibfehler stellt den Cache und die vorherige durable Ordnung wieder her; es wird kein Removal-Frame publiziert.

Der Host-Stream behält seine committete Id-Menge durch die vorangehende Global-Order-Schreibung und entfernt die Id erst bei der Tabellenlöschung. Ein Create-Rollback emittiert daher kein falsches Removal, während jeder verbundene Tab exakt die Id erhält, die nötig ist, um seine Projektion zu löschen.

Create und Delete schreiben ein durable `pendingMutation`, bevor ihr Record-/Order-Paar divergieren kann. Der Startup vollendet nur die von diesem Marker benannte Operation und löscht ihn; eine verwaiste Zeile allein identifiziert nicht, welche Operation unterbrochen wurde. Unmarkierte Order/Table-Divergenz behält daher das Fail-loud-Corruption-Verhalten der Registry. Eine Löschung, deren Tabellen-Write committet hat, deren Marker-Bereinigung aber fehlschlug, meldet trotzdem Erfolg — der angeforderte Zustand und der Removal-Frame sind bereits committet — und der nächste Startup löscht den Marker idempotent.

## Client-Konvergenz

`WorkspaceManager` behandelt sowohl `host/workspace-changed` als auch `host/workspace-removed` als geordnete Deltas, die über eine laufende `workspace.list`-Antwort replayt werden. Ein erfolgreiches unäres Delete entfernt die Zeile sofort, statt auf sein eigenes Stream-Echo zu warten. Entfernung ist idempotent, und ein prozesslokaler Tombstone weist späte Changed-Frames oder veraltete Baseline-Zeilen für die nie wiederverwendete Workspace-Id ab. Ein Reconnect aktualisiert weiterhin aus `workspace.list`; Session-Zustand wird nie durch ein Workspace-Delta beschnitten.

Die Löschbestätigung bleibt pending, bis die React-Workspace-Projektion die entfernte Id committet hat, sodass die nächste Workspace-Geste keinen veralteten Listen-Frame beobachten oder anvisieren kann.

## Bestätigungsinteraktion

Das bestehende Workspace-Zeilenmenü öffnet vor der Löschung ein geteiltes `Modal`. Der Text nennt alle drei Konsequenzen: Der Workspace verlässt die Liste, Ordner und Session-Logs bleiben, und seine Sessions erscheinen unter Ungrouped. Während die Anfrage pending ist, sind die Confirm- und Cancel-Controls deaktiviert, doppelte Bestätigung wird ignoriert, und Escape oder Close können die Operation nicht abbrechen. Ein Fehlschlag hält das Modal mit dem Fehler offen; Cancel, Escape und Close vor dem Absenden löschen niemals.

Menü, Modal und Buttons behalten ihre bestehende Struktur und Design-Tokens. Session-Löschung bleibt nur visuell und liegt außerhalb dieser Entscheidung.

## Erwogene Alternativen

**Sessions kaskadierend löschen.** Abgelehnt, weil die Workspace-Registrierung nicht die Session-Persistenz besitzt und die Produktanforderung ist, Histories unter Ungrouped zu bewahren. Session-Löschung braucht eigenen Lifecycle, Running-Checks, Descendant-Semantik und explizite UI.

**Den Ordner in den Papierkorb verschieben.** Abgelehnt, weil der Datensatz Directory-Ownership nicht beweisen kann. Eine künftige destruktive Filesystem-Aktion muss separat benannt, separat bestätigt werden und explizite Sicherheitsgrenzen durchsetzen.

**Die Tabellenzeile löschen und die Ordnung später reparieren.** Abgelehnt, weil ein Absturz oder Schreibfehler eine initialisierte Registry hinterließe, deren Ordnung und Tabelle nicht übereinstimmen. Die Registry aktualisiert beide unter einer serialisierten Operation und stellt die vorherige Ordnung bei Tabellenfehler wieder her.

**Jede nicht referenzierte Zeile beim Startup löschen.** Abgelehnt, weil dieselbe Form aus unerklärter Order-Korruption stammen kann; sie still zu verwerfen könnte Workspace-Metadaten und Session-Accounting verlieren. Recovery erfordert den expliziten Pending-Marker, den die besitzende Mutation schreibt.

**Nach Erfolg beide Listen neu abrufen.** Abgelehnt, weil der committete Removal-Frame plus sofortiges unäres Echo genügt, das aktuelle Session-Objekt bewahrt und verhindert, dass eine lokale Mutation zu zwei List-Anfragen wird. Reconnect-Baselines bleiben der Reparaturpfad.

## Verifikation

Workspace-Package-Tests pinnen erfolgreiche Metadata-only-Löschung, Same-Path-Re-Registrierung, Unknown-Id-Idempotenz, Table-Failure-Rollback, Explicit-Marker-Restart-Recovery, Unexplained-Corruption-Ablehnung und Cache/Table-Invariant-Verhalten. Apiproxy- und Carrier-Tests pinnen das Schema, den Handler, `workspace-not-found`, behaltene Session/Ordner, Fresh-Id-Re-Registrierung und den committeten `host/workspace-removed`-Frame. Client-Tests pinnen unäres direktes Echo, doppelte Entfernung, späte Changed-Frames und eine Löschung, die mit einer laufenden Baseline racet. Komponententests pinnen Bestätigung, Projection-settled-Schließen, Success-Frame-vor-Unäres-Reihenfolge, Fehlschlag, Cancel, Escape und Close. Das Browser-Szenario beobachtet jedes transiente Alert, Slot-Error, Console-Error und Page-Error, während es einen gelöschten Titel für ein anderes Verzeichnis wiederverwendet.

Das assemblierte schlüssellose Web-Szenario registriert ein bestehendes temporäres Projektverzeichnis, verrechnet eine persistierte Session, macht diese Session zur aktuellen, bestätigt die Löschung in Chromium und verifiziert, dass die Workspace-Gruppe verschwindet, während Ungrouped die aktuelle Session behält. Es prüft die Nutzerdatei und das JSONL-Log vor und nach der Löschung und wiederholt die UI-, Verzeichnis- und Log-Assertionen nach einem Reload. Das Szenario hält den Attachment-Frame des Seeds zurück, bis der Browser die durch die Adoption erzeugte New Session auswählt, beweist, dass der Seed in der Gruppe fehlt, liefert dann den Frame und wählt die einzige nicht leere Session. Host-Attachment-Vollendung und eine Zwei-Zeilen-Zählung können die Browser-Mitgliedschaft nicht beweisen: Der Gruppenheader plus New Session erfüllen diese Zählung bereits, und der ankommende Seed kann den Positions-Locator zwischen Klick und Assertion ersetzen.

## Konsequenzen

Das Löschen eines Workspace ist absichtlich reversibel, indem dasselbe Verzeichnis mit einer frischen Id erneut registriert wird, obwohl dessen frühere manuelle Session-Ordnung verloren ist; eine Re-Registrierung adoptiert bestehende Sessions nach dem Bootstrap nicht automatisch erneut. Die Operation verzichtet auf eine Ein-Klick-Bereinigung von Session-Histories oder Quellverzeichnissen im Tausch gegen eine Löschgrenze, die dem entspricht, was der Datensatz tatsächlich besitzt.
