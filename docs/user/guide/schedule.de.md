# Schedule: sitzungslokale Erinnerungen

[English](schedule.md) | [中文](schedule.zh.md) | Deutsch

Dieses Overlay aktiviert Schedule-Erinnerungen für genau einen `dsh web`-Prozess, ohne die ausgelieferte Standard-Web-Komposition zu ändern:

```sh
dsh web --patch apps/cli/config/examples/schedule/cordis.yml
```

Das aktuelle Overlay unterstützt Erinnerungen, die mit einem positiven ganzzahligen `after_seconds`, einem absoluten `at`-Ziel oder einem `every_seconds`-Festintervall von mindestens 300 Sekunden erstellt werden. Das Modell verwaltet sie über `schedule_create`, `schedule_list` und `schedule_delete`; jedes Ergebnis kennzeichnet die Zustellung als `session-local`.

Mit aktiviertem Overlay zeigt eine erfolgreich geöffnete Sitzung mit aktiven Erinnerungen einen schreibgeschützten Katalog im Konversationskopf. Er listet den vollständigen Prompt, geplanten oder überfälligen Status, einmalige oder exakt wiederkehrende Kadenz, die browserlokale Zielzeit und die relative Zeit. Die Seitenleiste setzt außerdem einen nicht-interaktiven Alarm hinter den Titel gruppierter, flacher und Such-Zeilen, wenn ihr aktuell verfügbarer Projektionswert nicht leer ist. Diese Oberflächen erstellen, bearbeiten, löschen oder quittieren niemals Erinnerungen, und der gecachte Alarm einer kalten Sitzung kann kurzzeitig fehlen oder veraltet sein.

Der Browser hängt seine IANA-Zone an jeden Prompt an. Der Zeit-Kontext weist das Modell an, anderweitig nicht qualifizierte Datums- und Zeitangaben in der Browser-Zone dieser Anfrage zu interpretieren. Diese Annahme gehört nur zur natürlichsprachlichen Interpretation: `schedule_create.at` muss entweder ein strenges RFC-3339-Datum-Zeit-Format mit `Z` oder numerischem Offset sein oder `{ date, time, time_zone }` mit einer expliziten `UTC`- oder IANA-Area/Location-Zone. Schedule hält keine Standardzone einer Sitzung vor und leitet keine ab. Sommerzeit-Lücken werden abgelehnt, Überschneidungen wählen den ersten Zeitpunkt, und erfolgreiche Datensätze behalten nur das resultierende UTC-Ziel.

Das ursprüngliche Sitzungsprotokoll besitzt jede Erinnerung. Ein aktiver Root-Agent wartet, bis er vollständig inaktiv ist, und reiht dann eine normale Folge-Runde in dieser Konversation ein. Er steuert niemals laufende Arbeit und fügt keine separate Quittung oder Erinnerungskarte hinzu. Das Schließen des Prozesses oder das Kaltwerden der Sitzung stoppt ihren In-Memory-Timer, ohne den Datensatz zu löschen; das erneute Öffnen derselben Sitzung stellt das Warten wieder her und liefert eine überfällige Erinnerung zu. Das Lesen kalter Historie aktiviert sie nie, und ein Fork erbt die Erinnerungen seines Elternteils nicht.

Alle Erinnerungen bleiben auf ihre Erstellungszeit ausgerichtet. Ist eine überfällig, wird nur ihr jüngstes fälliges Vorkommen präsentiert, und das nächste Ziel bleibt auf der ursprünglichen Festintervall-Folge. Alle verschiedenen Every-Datensätze, die bei derselben Idle-Entscheidung überfällig sind, werden zu einer einzigen Folge-Runde mit je einem Vorkommen zusammengefasst; verpasste Intervalle erzeugen keinen Rückstau. Fällige Einmal-Erinnerungen laufen vor diesem Batch. Kalender- und Cron-Ausdrücke werden nicht unterstützt.

Erstellungs- und tatsächliche Löschoperationen quittieren Erfolg erst, nachdem die Sitzungspersistenz ihr Ereignis-Präfix bestätigt hat. Schedule bietet keine Browser-, Betriebssystem-, E-Mail-, SMS- oder andere externe Benachrichtigung. Ein persistenter Versand-Datensatz vermerkt, dass die Folge-Runde eingereiht wurde; er quittiert weder Modellerfolg noch Benutzerempfang.
