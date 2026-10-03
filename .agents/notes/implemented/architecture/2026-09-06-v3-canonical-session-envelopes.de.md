# Agent Note: Kanonische V3-Session-Event-Envelopes
[English](2026-09-06-v3-canonical-session-envelopes.md) | [中文](2026-09-06-v3-canonical-session-envelopes.zh.md) | Deutsch

Status: implemented


## Problem

Ein Session-Event kann In-memory-, Durable- und Browser-Wire-Reader durchqueren. Erlaubt sein Typ fehlende Platzierung oder unzugehörige Surface-Metadaten, kann ein Reader still eine Nachricht auslassen oder darüber uneinig sein, welche Felder die Rekonstruktion beeinflussen. Mehrere Schreibweisen für Ersetzungsendpunkte und leere Request-Header-Optionals erlauben zudem, dass verschiedene gespeicherte Records denselben Request beschreiben. Widersprüchliche Tool-Fehler-Metadaten können dazu führen, dass Modellverlauf und Diagnostik unterschiedliche Ergebnisse melden.

## Entscheidung

Session-Format V3 nutzt einen kanonischen Event-Envelope. Jedes `system/message`, `user/message`, `assistant/message` und `tool/result` erfordert `surfaceOp`. Bekannte Log-only-Events erlauben nur `type`, `seq`, `time`, `data` und optional `ignorable: true`; ihre TypeScript-Varianten deklarieren beide Surface-Metadatenfelder als optionales `never`. Native unbekannte oder obsolete ignorable Envelopes bleiben opak, einschließlich ihrer Metadaten. Assistant-Nachrichten betten ihren exakten Provider-Stream ein und verbieten als einzige `sourceEventSeqs`. System-, User- und Tool-Nachrichten dürfen eine nicht-leere, eindeutige Menge früherer Quellsequenzen zitieren.

`SurfaceOp` ist exakt `'append'` oder `{ op: 'replace', startSeq, endSeq }`, mit `SessionSeq`-Endpunkten und ohne Aliase oder Extrafelder. Beide Endpunkte gehen dem ersetzenden Event voraus und benennen eine inklusive Spanne in aktueller Surface-Reihenfolge, nicht in numerischer Sequenzreihenfolge. Die Session-Annahme verifiziert zusätzlich aktuelle Mitgliedschaft, geordnete Endpunkte, vollständige zitierte Abdeckung und Nur-Inhalt-Einzelknoten-Tool-Result-Ersetzung. Compaction-Payload-Felder wie `shadowedRange.start/end` und Fold-Result-Felder behalten ihre eigenen Namen; dies ist keine rekursive Payload-Umbenennung.

Die aktuelle Annahme lehnt jedes `request/header.header.system` und exakt leere `tools: []` oder `adapterDefaults: {}` ab. System-Prompts gehören zu `system/message`; `request/header` bleibt der Nicht-Verlaufs-Request-Snapshot. Writer lassen die beiden leeren Optionals weg. Nur-Whitespace-Systeminhalt, `config.stop: []`, verschachtelte Header/Source/Data-Extras und verschachtelte Tool-Schema-Werte bleiben intakt. Ein `tool/result` mit `data.error` erfordert `message.content[0].isError === true`; ein fehlgeschlagenes Ergebnis muss keine Fehleridentität tragen. Weder aktuelle Reads noch Migration leiten ein Fehlerergebnis aus widersprüchlichen Metadaten ab.

### Validierungs-Ownership

[Core Session](../../../../packages/core/session/src/surface.ts) besitzt event-lokale Platzierungs-, Header-Leerfeld- und Tool-Fehler-Regeln, während sein Surface-Manager Beziehungen besitzt, die das Event-Log brauchen. Seed, Append und Wiederherstellung wenden diese Regeln vor dem Akzeptieren von Events an. Sie schaffen kein allgemeines Schema für plugin-eigene Payloads und expandieren eingebettete Provider-Streams nicht eifrig.

Der generische Gateway-Client gibt rohe Outputs ohne Validierung zurück. Der bestehende [SessionEventStream](../../../../packages/api/session-controller/src/client/transport.ts) prüft daher Follow-Snapshots, Live-Durable-Einträge und Verlaufsseiten vor ihrer Veröffentlichung. Sein privater [Wire-Event-Checker](../../../../packages/api/session-controller/src/client/session-wire-event.ts) validiert den exakten Envelope und delegiert event-lokale Regeln an die browser-sicheren Core-Validatoren. Er fügt kein generisches Gateway-Schema hinzu und validiert keine unverwandten Plugin-Payloads. Surface-Mitgliedschaft und Quellexistenz bleiben Host-seitig, weil ein Browserfenster frühere Events auslassen kann.

### Released-V2-zu-V3-Konversion

Die [V2-zu-V3-Spezifikation](../../../../packages/session/session-format-v2-to-v3/README.de.md#v2-to-v3-specification) besitzt die vollständige historische Konversion, ihre [Kanonisierungsregeln](../../../../packages/session/session-format-v2-to-v3/README.de.md#canonical-envelopes) und [native Zulassung und Wiederherstellung](../../../../packages/session/session-format-v2-to-v3/README.de.md#native-v3-admission). Diese Regeln zusammenzuhalten verhindert, dass ein kardinalitätserhaltender Kanonisierungsschritt mit einer Identitätsmigration verwechselt wird. Eingefrorene Beziehungsvalidierung nutzt private Views statt Laufzeit-Aliase; das ursprüngliche V3-Artefakt bleibt maßgeblich.

## Erwogene Alternativen

**Fehlende Platzierung auf Append defaulten.** Das erfindet eine Modellverlaufsentscheidung, die im gespeicherten Record fehlt, und lässt ungültige V2-Artefakte zu. Erforderliche Platzierung hält alle Reader denselben Belegen gegenüber rechenschaftspflichtig.

**Beide Ersetzungsschreibweisen in aktuellen Readern akzeptieren.** Das bewahrt zwei dauerhafte Repräsentationen und macht die Validierung davon abhängig, welcher Reader sie empfängt. Nur die angrenzende Kante interpretiert released Keys; aktuelle Reader akzeptieren ausschließlich V3-Keys.

**Alle leeren Werte normalisieren oder Tool-Ergebnisse reparieren.** Leere Stop-Listen, Whitespace und Plugin-Payloads können bedeutsam sein. Sie zu entfernen oder `isError` aus Diagnostik zu setzen, verändert aufgezeichnete Tatsachen. Die Kante führt nur benannte, semantikerhaltende Konversionen durch und lehnt Widersprüche ab.

**Historische Validatoren kopieren oder V3-Events direkt an sie übergeben.** Kopieren dupliziert Beziehungssemantik; direkte Wiederverwendung würde obsolete Envelope-Schreibweisen akzeptieren und System-Knoten und Reparaturidentitäten fehlinterpretieren. Strikte V3-Validierung gefolgt von komponierten privaten Views nutzt eingefrorene Beziehungen wieder, ohne die aktuelle Annahme zu erweitern.

## Konsequenzen

Typisierte Events, Persistenz und Browser-Verlauf einigen sich auf erforderliche Platzierung und event-lokale Fehlersemantik. Fehlgeformte Records scheitern vor der Projektion, statt aus dem Modellverlauf zu verschwinden. Die Migration gibt die Best-Effort-Rettung widersprüchlicher Records auf; erhaltene Quellgenerationen bleiben unter der [Released-Format-Veröffentlichungspolicy](2026-08-31-released-session-format-migrations.de.md) unberührt.

Diese Entscheidung ersetzt teilweise Envelope-Repräsentationsdetails in den Notes [Session Surface](2026-06-18-session-surface.de.md) und [Rekonstruierbare Requests](2026-07-05-reconstructable-requests.de.md). Sie bleiben für geordnete Projektion und Logged-Request-Ownership aktiv. Die [System-Prompt-Surface-Node-Entscheidung](2026-09-02-system-prompt-as-surface-node.de.md) behält Prompt-Ownership, Protected-Head-Semantik und Migrationsbegründung. Die [V2-Embedded-Stream-Entscheidung](2026-09-01-v2-embedded-assistant-streams.de.md) bleibt für Attempt-Settlement, exakte Stream-Belege und kardinalitätsverändernde Migration aktiv; V3 bewahrt diese Entscheidungen.

## Verifikation

[Core-Annahmetests](../../../../packages/core/session/tests/canonical-envelopes.spec.ts) fixieren ungültige Seed-/Append-/Restore-Records, typisierte Surface-Varianten, optionale Fehleridentität und unveränderten abgeleiteten Zustand nach Ablehnung. [Browser-Transport-Tests](../../../../packages/api/session-controller/tests/transport.client.spec.ts) prüfen strikte Follow-/Page-Zulassung vor Veröffentlichung. [Migrationstests](../../../../packages/session/session-format-v2-to-v3/tests/canonical-envelopes.spec.ts) decken Konversion und Wiederherstellung ab; eingefrorene Adjacent-Edge-Suites bewahren historische Semantik. Erforderliche Abdeckung umfasst außerdem Codec-Zulassung, Whitespace- und Leere-Stop-Listen-Erhaltung, opake Payload-Bewahrung und numerisch absteigende Ersetzungsendpunkte in gültiger Surface-Reihenfolge.
