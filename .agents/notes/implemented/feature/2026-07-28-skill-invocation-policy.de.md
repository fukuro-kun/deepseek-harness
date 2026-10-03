# Agent Note: Unabhängige Modell- und Nutzer-Skill-Invocation-Policy

Status: implemented

[English](2026-07-28-skill-invocation-policy.md) | [中文](2026-07-28-skill-invocation-policy.zh.md) | Deutsch

## Problem

Die Skill-Registry behandelte Discovery ursprünglich als Modellkatalog: `ctx.skills.list()` entfernte modelldeaktivierte Skills, während `ctx.skills.get()` ein ungefilterter vertrauenswürdiger Loader blieb. Das genügte für modellinitiiertes Laden, konnte aber Claude-kompatible Skills nicht abbilden, die nur einer Person, nur einem Modell, beiden oder keinem beworben werden. Die TUI verschärfte die Inkonsistenz, indem sie Nutzer-Autocomplete aus der modellgefilterten Liste ableitete und jeden exakten Namen durch `get()` ließ.

Der lokale Parser exponierte außerdem eine interne Camel-Case-Schreibweise als Frontmatter. Die etablierten negativen `disable-model-invocation`- und positiven `user-invocable`-Felder zu unterstützen erfordert eine durable, symmetrische Domain-Repräsentation, ohne jeden möglichen YAML-Key zu einem untypisierten Cross-Package-Contract zu machen.

## Entscheidung

`SkillSummary` trägt ein erforderliches typisiertes `invocation: SkillInvocationPolicy`-Objekt, dessen `modelInvocable: boolean`- und `userInvocable: boolean`-Felder positiv und symmetrisch sind. Weglassen existiert nur an expliziten Eingabegrenzen: Eine Runtime-`SkillRegistration` ohne Policy und lokales Frontmatter ohne einen der beiden Invocation-Keys werden zu `{ modelInvocable: true, userInvocable: true }` aufgelöst, bevor Kandidaten oder Definitionen erzeugt werden. Künftige Frontmatter-Keys bleiben außerhalb des Domain-Modells, bis ein Consumer und ein Durchsetzungs-Contract existieren; der lokale Provider parst Frontmatter weiterhin als offenes `Record<string, unknown>` und projiziert dann nur erkannte Felder und ihre Defaults in die normalisierte typisierte Policy.

`ctx.skills.list()` gibt jede gewinnende Summary zurück und wählt keine Invocation-Fläche mehr. `isModelInvocable(skill)` und `isUserInvocable(skill)` lesen das passende positive Feld direkt. `ctx.skills.get()` bleibt policy-neutral, weil vertrauenswürdige interne Caller jede Definition brauchen können, während ein öffentlicher Consumer sein eigenes Prädikat durchsetzen muss, bevor er einen Skill bewirbt oder lädt. Das Modell-Tool und die TUI prüfen die invocation-neutrale Summary vor dem `get()`-Aufruf und prüfen die geladene Definition erneut, sodass ein verweigerter Name nie das Definitionsladen erreicht und ein Policy-Wechsel zwischen Discovery und Load seinen Body nicht exponieren kann.

Der lokale Provider akzeptiert die exakten Kebab-Case-Frontmatter-Keys `disable-model-invocation` und `user-invocable`. Er akzeptiert YAML-Booleans plus case-insensitive `true`/`false`, `yes`/`no`, `on`/`off` und `1`/`0`, passend zu den praktischen Boolean-Formen, die Claude-Skills akzeptieren. Er bildet `disable-model-invocation` auf das inverse positive Feld ab und füllt beide positiven Felder aus ihren Defaults, selbst wenn keiner der Keys vorhanden ist. Eine Camel-Case-externe Schreibweise oder ein nicht-boolescher Invocation-Wert lässt den gesamten Skill mit einer gezielten Warnung aus der Discovery fallen; dieses Pre-Release-Repository hält keinen On-Disk-Kompatibilitätsalias. Invocation-Daten schlagen closed fehl, weil sie zu ignorieren standardmäßig Erlaubnis bedeuten und den Skill auf einer deaktivierten Fläche exponieren könnte, während falsch typisierte optionale `whenToUse`- und `metadata`-Werte weggelassen werden, weil sie nicht über Invocation entscheiden.

Der modellsichtbare `dsh-tool-skill`-Katalog und -Loader setzen `isModelInvocable` durch. Die TUI-`/skill:`-Autocomplete und der Exact-Loader setzen das Nutzerfeld lokal durch, sodass ein User-only-Skill dort sichtbar und ladbar ist, selbst wenn er in der Modell-Discovery fehlt, ohne die optionale Skill-Peer-Dependency in einen Runtime-Import zu verwandeln. Der vom Launcher ge seedete initiale Skill, den geführte `dsh migrate`- und `dsh upgrade`-Sessions verwenden, folgt demselben TUI-Pfad und muss user-invocable bleiben. Der Browser-`skills/list`-RPC bedient eine nutzergewählte Referenz, die das Modell weiterhin zum Laden des Skills auffordert, sodass er die Schnittmenge aus modell- und nutzerinvokablen Skills exponiert; es wird kein direkter Browser-Skill-Loading-RPC hinzugefügt.

Diese Regeln erlauben alle vier Kombinationen:

| Policy | Modell-Invocation | Nutzer-Invocation |
|---|---|---|
| `{ modelInvocable: true, userInvocable: true }` | enthalten | enthalten |
| `{ modelInvocable: true, userInvocable: false }` | enthalten | ausgeschlossen |
| `{ modelInvocable: false, userInvocable: true }` | ausgeschlossen | enthalten |
| `{ modelInvocable: false, userInvocable: false }` | ausgeschlossen | ausgeschlossen |

Diese Entscheidung erweitert das [Skill-System](../../archived/feature/2026-07-05-skill-system.md) und ersetzt die Invocation-Policy-Einschränkung, die der [archivierte TUI-Skill-Slash-Command](../../archived/feature/2026-07-21-tui-skill-slash-command.md) festhielt.

## Erwogene Alternativen

**Alles Frontmatter in einer generischen `Map` speichern und String-Keys in `isModelInvocable` / `isUserInvocable` lesen.** Abgelehnt, weil falsch geschriebene Keys, nicht-boolesche Werte und consumer-spezifische Koerzion ohne Typecheck Paketgrenzen überschreiten würden. Die Parser-Grenze bleibt offen; das Domain-Modell ist bewusst typisiert und schmal.

**`ctx.skills.list()` modellgefiltert belassen und eine zweite Nutzerliste hinzufügen.** Abgelehnt, weil Discovery, Duplikat-Auflösung, Caching und Ordnung oberflächenneutrale Arbeit sind. Ein vollständiger Katalog plus explizite Prädikate verhindert, dass diese Mechanismen driften, und macht die Policy jedes Consumers an seiner Grenze sichtbar.

**Invocation-Policy innerhalb von `ctx.skills.get()` durchsetzen.** Abgelehnt, weil `get()` nicht wissen kann, ob sein Caller ein Modell-Tool, ein menschliches Command oder vertrauenswürdige Orchestrierung ist. Dort zu filtern würde außerdem den beidseitig deaktivierten Quadranten unprüf- und unverwaltbar machen.

**Camel-Case-Frontmatter als Alias behandeln.** Abgelehnt, weil das externe Format der Kebab-Case-Claude-Skills-Contract ist und das Repository keine veröffentlichte Kompatibilitätsverpflichtung hat. Laut zu scheitern vermeidet, eine nicht standardkonforme Schreibweise still zu bewahren.

**Einen browserseitigen Direct-Skill-Invocation-RPC hinzufügen.** Für diese Änderung abgelehnt, weil der bestehende Browser-Flow eine Modell-Referenz einfügt statt eines geladenen Instruktionsbodys. Seine korrekte Policy ist daher die Schnittmenge; eine direkte Nutzer-Ladefläche braucht eigenes Wire- und Logging-Design.

## Konsequenzen

Provider und Runtime-Registrierungen exponieren einen kleinen typisierten Invocation-Contract, während lokales YAML erweiterbar bleibt. Jeder neue Discovery-Consumer muss bewusst das Modell-Prädikat, das Nutzer-Prädikat, ihre Schnittmenge oder vertrauenswürdigen ungefilterten Zugriff wählen; diese Wahl zu vergessen ist jetzt review-sichtbar statt im Registry-Verhalten verborgen.

Der geänderte Modellkatalog ist durch den schlüssellosen ACP-Snapshot gepinnt, der einen Model-only-Skill enthält und einen User-only-Skill ausschließt. Der assemblierte schlüssellose TUI-Snapshot entdeckt und lädt einen User-only-Skill per exaktem Namen und lehnt dann einen Model-only-Skill ab, bevor dessen Body geladen wird; der echte Loader/PTY-Smoke beweist denselben User-only-Pfad durch den ausgelieferten Terminal-Prozess. Der Real-Host-Chromium-Snapshot pinnt die Browser-Schnittmenge über alle vier Policy-Quadranten. Die TUI-Unit-Coverage prüft diese Quadranten plus Disposal-Races, während Registry-, Local-Parser-, Modell-Tool- und API-Proxy-Tests Defaults, unterstützte Boolean-Formen, malformed Werte, Legacy-Key-Ablehnung, Exact-Load-Durchsetzung und die Browser-Schnittmenge abdecken.
