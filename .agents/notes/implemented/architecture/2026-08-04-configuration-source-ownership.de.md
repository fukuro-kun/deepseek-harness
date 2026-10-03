# Agent Note: Eine Reihenfolge für Konfigurationsquellen — und was eine entdeckte Datei nicht entscheiden darf
[English](2026-08-04-configuration-source-ownership.md) | [中文](2026-08-04-configuration-source-ownership.zh.md) | Deutsch

Status: implemented


## Problem

`$DSH_HOME/.env` war gerade [zu einer gewöhnlichen Umgebungsschicht geworden](../../archived/architecture/2026-08-04-credentials-yaml-and-user-environment-layer.md), womit der Harness nutzerseitige Werte aus einem plattgebügelten `process.env` auflöste, das nicht mehr sagen konnte, woher ein Wert kam. Drei Konsequenzen folgten.

Ein über die Webseite gespeicherter Schlüssel blieb von einem älteren Schlüssel in der eigenen `.env` des Nutzers verdeckt, weil der Credential-Provider „die Umgebung" mit seiner Datei verglich und die Umgebung diese Datei nun enthielt. Die Migrations-Sackgasse, die die Trennung beseitigen sollte, war einfach umgezogen.

Ein Endpoint ließ sich vom Projekt umleiten. Die `.env` des aufrufenden Verzeichnisses wird wie jede andere Schicht materialisiert, und eine Base-URL entscheidet, wohin ein aufgelöster API-Key gesendet wird — ein `DEEPSEEK_BASE_URL` in einem Workspace, den das Modell bearbeiten kann, würde also das eigene Credential des Nutzers samt der Prompts mit dessen Code an jeden Host schicken, den diese Datei nennt. Nichts an der plattgebügelten Sicht konnte das vom Export derselben Variable durch den Operator unterscheiden.

Und `!!js process.env.X` in der ausgelieferten Komposition machte denselben Wert zweimal erreichbar: einmal über die Entry-Config und einmal über die jeweilige Leiter seines Konsumenten — der Gewinner entschied sich über die Schichtenreihenfolge statt über die Bedeutung des Werts.

## Entscheidung

**Eine Reihenfolge für nicht-geheime Werte.** Jeder konfigurierbare Wert, der nicht selbst ein Credential ist, löst in derselben Reihenfolge auf; die Domänen unterscheiden sich nur darin, welche Stufen existieren.

```text
explicit for this run     per-operation override, CLI argument
> user settings           settings.yaml
> composition             profile bundles, user patch layers, --patch overlays
> this launch's shell     inherited process environment
> discovered file         <invocation cwd>/.env, then $DSH_HOME/.env
> defaults                schema default, provider public default
```

Settings sitzen über der Komposition, weil das genau das ist, was der [settings seam](../../archived/architecture/2026-07-28-user-settings-seam.md) tut: Ein Plugin registriert seine Cordis-Entry-Config als `base`-Schicht und die Nutzersektion legt sich darüber, und der seam kann einen Wert, den die Bundles eines Profils setzten, nicht von einem unterscheiden, den die User-Patch-Schicht oder ein `--patch`-Overlay setzte — alle kommen als Entry-Config an. Die Produkt-CLI hat keinen Hebel über gespeicherten Settings; ein Deployment, das ein Feld gegen die Settings eines Nutzers festschreiben muss, liefert also einen eigenen Bin- oder Loader-Baum oder mountet gar keinen Settings-Provider. Die Komposition übersteuert weiterhin die Umgebung; ein abgestandenes `DEEPSEEK_BASE_URL` in einer Shell kann also keinen konfigurierten Endpoint umschreiben.

**Credentials behalten eine engere, eigene Reihenfolge**, und diese Note vereinheitlicht sie nicht:

```text
inherited process environment      (read-only, wins)
> $DSH_HOME/.credentials.yaml      (provider-managed, writable)
> <invocation cwd>/.env
> $DSH_HOME/.env
```

Die startende Umgebung gewinnt, weil `DEEPSEEK_API_KEY=… dsh`, ein CI-Secret und ein Container-`-e` das eine Override sind, das ein Operator pro Lauf anwenden können muss, ohne Maschinen-State zu bearbeiten — und weil es von innen nicht editierbar ist, muss es *sichtbar* read-only sein. Konfiguration soll nur die *Referenz* tragen — welcher Name aufzulösen ist — und dieser Name folgt der obigen Reihenfolge für Nicht-Geheimnisse.

**Das Projekt, in dem der Harness gestartet wird, ist vertrauenswürdig — standardmäßig und ohne Prompt.** Ein Checkout darf einen eigenen Endpoint, eigene gewöhnliche Variablen und einen eigenen Schlüssel tragen; der Schlüssel rangiert unter dem verwalteten store, sodass ein über die Models-Seite gespeicherter Schlüssel nie von einem verdrängt wird, den ein Checkout zufällig enthält. `LaunchEnvironmentSnapshot.getFrom(name, sources)` durchsucht weiterhin nur die Schichten, die ein Aufrufer benennt, und das Weglassen einer Schicht ist eine Verweigerung, keine Herabstufung — der Mechanismus existiert für Entscheidungen, bei denen eine Schicht unerreichbar sein muss; diese Entscheidung schließt die Projekt-Schicht ein.

**Vertrauen erstreckt sich nicht auf Änderungen am Harness selbst.** `loadLayeredEnv` lehnt beim Laden, bevor irgendetwas materialisiert wird, jede `.env` ab, die eine Variable setzt, die bestimmt: wie ein Prozess startet (`PATH`, `SHELL`, `NODE_OPTIONS`, `LD_PRELOAD`), welches ambient-Programm eine Operation übernimmt (`EDITOR`, `PAGER`, `BROWSER`), welchen Code eine Laufzeit vor dem angeforderten Programm ausführt (`BASH_ENV`, `PERL5OPT`, `PYTHONSTARTUP`, `RUBYOPT`, `JAVA_TOOL_OPTIONS`, die Git-Hook-Kommandos), woher modellsichtbare Anweisungen geladen werden (der ganze `DSH_*`-Namensraum, `HOME`, `XDG_*`) oder wie das Netzwerk erreicht und ihm vertraut wird (Proxy- und CA-Variablen). Der Abgleich ist case-insensitiv; `https_proxy` ist also kein Umgehungsweg. Eine Ausnahme, festgehalten in [der Proxy-Policy-Note](2026-08-27-outbound-proxy-policy.de.md): Die vier Proxy-Namen werden aus `$DSH_HOME/.env` akzeptiert, die keine `.env` verlagern kann, und weiterhin aus der Datei des aufrufenden Verzeichnisses abgelehnt.

Die Linie ist, dass diese ohne Nutzerhandlung wirksam werden, vor jedem turn, außerhalb der Permission-Policy und der Sandbox. `DSH_PERMISSION_MODE` würde die approvals abschalten, die das Vertrauen in ein Projekt überhaupt sinnvoll machen, und `BASH_ENV` führt eine vom Projekt gewählte Datei bei jedem einzelnen `bash -c` aus, das das Bash-Tool absetzt — dass der Code des Projekts unter der Policy des agents läuft, ist der Deal; dass das Projekt diese Policy umschreibt, nicht. Diese aufzuzählen ist ein Verliererspiel, Variable für Variable — deshalb wird der ganze `DSH_*`-Namensraum verweigert statt einer auditierten Teilmenge, und deshalb ist die Liste danach organisiert, was eine Variable *tut*, statt danach, welche Laufzeit sie besitzt. Es gibt kein opt-out: Ein Fluchtweg müsste von irgendwo lesbar sein, und alles, was eine entdeckte Datei setzen könnte, ist das Loch selbst.

**`packages/util/launch-environment` besitzt den Snapshot**, bewusst als Utility statt als Drei-Package-capability-seam. Der Snapshot wird eingefroren, bevor Cordis startet, und einmal vom Launcher injiziert; es gibt also keine austauschbare Laufzeitimplementierung. Konsumenten brauchen Typen und reine Funktionen, die ein `util/`-Package liefert, ohne von einem UI-Package abzuhängen. `launchEnvironmentOf(ctx)` gibt den Snapshot des Launchers zurück oder die geerbte Umgebung als einzige Schicht — ein SDK-Host oder ein nacktes `cordis.yml` hat keine Dateien entdeckt, seine einzige Schicht ist also tatsächlich das, womit es gestartet wurde, und dieselben vertrauenswürdigen Lookups funktionieren dort unverändert weiter.

**`verify-config-source-ownership`** ist ein schmaler Tripwire für die gewöhnliche einzeilige Form eines `apiKey`/`baseURL`/`headers`-Umgebungs-Inline in ausgelieferter Cordis-Konfiguration. Diese Inlines zu entfernen ist das, was die Deployment-Stufe bedeutsam macht — wenn der ausgelieferte Baum zu `baseURL` schweigt, bedeutet ein vorhandener Wert, dass ein Mensch oder Deployment ihn gesetzt hat. Adapter besitzen die eigentliche Auflösung; das Gate erhebt keinen repository-weiten Anspruch über `process.env`-Zugriffe.

## Konsequenzen

- Das Web-Credential-Formular wirkt nun gegen einen älteren Schlüssel in der `.env` des Nutzers; nur ein in der startenden Shell exportierter Schlüssel macht es weiterhin read-only, und die Diagnose sagt das.
- Eine `.env` mit `DSH_*`, `PATH`, `BROWSER` oder — im aufrufenden Verzeichnis — einer Proxy-Variable lässt den Start fehlschlagen statt angewendet zu werden. Entwickler, die Schalter in einer Repository-`.env` halten, ziehen sie in ihre Shell um — ein absichtlicher, lauter Bruch.
- Die Komposition ist nicht mehr durch einen abgestandenen Shell-Endpoint übersteuerbar. Sie bleibt durch die gespeicherte `settings.yaml` eines Nutzers übersteuerbar — das ist das Layering des settings seam und nichts, was diese Note ändert; die Produkt-CLI bietet kein Flag darüber, also besitzt ein Deployment, das gegen gespeicherte Settings gewinnen muss, seinen eigenen Bin- oder Loader-Baum.
- Nicht gelöst: Die Schichten werden weiterhin in `process.env` materialisiert; gewöhnliche Projektvariablen erreichen daher weiterhin Kindprozesse unter dem Subprocess-Scrub. Bootstrap-Variablen können gar nicht aus einer Datei kommen; das Environment-Package hält die verbleibende Subprocess-Reichweite als Limitation fest.
- Exa und Perplexity erfassen ihren Schlüssel weiterhin zur Ladezeit statt über den credential seam. Sie lesen nicht mehr rohes `process.env` — sie lösen über die vertrauenswürdigen Schichten auf — aber ihre Umstellung auf Credential-Auflösung pro Request ist eigene Arbeit.

## Erwogene Alternativen

**Credentials in die Nicht-Geheimnis-Reihenfolge vereinheitlichen, nach dem Verfasser jeder Quelle.** Versucht und aufgegeben: Es liest sich gut, aber der settings seam fixiert Komposition bereits *unter* der Nutzersektion — „vom Deployment verfasst" ist also keine Stufe, die der seam ausdrücken kann — und `.credentials.yaml` über die startende Umgebung zu heben würde das eine Override wegnehmen, auf das CI, Container und ein pro-Lauf-`DEEPSEEK_API_KEY=…` angewiesen sind. Zwei Reihenfolgen, die jede ihre Vorrangstellung erklären, schlagen eine, die keine der beiden korrekt beschreibt.

**Routing und Credentials dem aufrufenden Projekt vorenthalten, bis es explizit vertraut wird.** Als Produkt-Haltung abgelehnt: Ein Checkout ist standardmäßig vertrauenswürdig, ohne Prompt und ohne gespeicherten Vertrauensdatensatz. Das Restrisiko ist real und benennenswert — ein Repository zu klonen, das eine `.env` mit einem anderen Endpoint oder Schlüssel trägt, routet diese Session darüber — und ein späteres Projekt-Vertrauens-Gate ist der Ort, an dem das adressiert wird, nicht eine Regel, die den Normalfall zeremoniell macht.

**Eine Allowlist von `DSH_*`-Variablen auditieren, die eine `.env` setzen darf.** Abgelehnt: Die Liste müsste bei jedem neuen Schalter neu auditiert werden, und der Fehlermodus des Vergessens ist still. Den Namensraum zu verweigern versagt sicher.

**Eine Bootstrap-Variable unter die Prozess-Schicht stufen statt sie abzulehnen.** Abgelehnt: `PATH` und `NODE_OPTIONS` haben kein sinnvolles „Verlierer"-Verhalten — ein Nutzer, der eine in eine `.env` schrieb, glaubt, sie gilt, und sie still zu ignorieren ist genau der „meine Einstellung hat keine Wirkung"-Fehler, den diese Entscheidung beseitigt.

**Den Snapshot als Drei-Package-capability-seam bauen (`environment` / `environment-local` / Konsumenten).** Als verfrüht abgelehnt: Der Produzent läuft, bevor Cordis existiert, und es gibt keine zweite auszuwählende Implementierung. Die Repository-Regel ist, nicht präventiv aufzuspalten.

**Aufhören, die Schichten in `process.env` zu materialisieren.** Vertagt, nicht abgelehnt: Es würde Projektvariablen vollständig aus Kindprozessen heraushalten, bricht aber still jede User-Patch-Schicht, die `!!js process.env.X` liest. Der Snapshot ist bereits die Autorität für alles, was der Harness auflöst; dies kann also später landen, ohne eine Leiter zu ändern.
