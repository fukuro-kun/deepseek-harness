# Agent Note: Familienübergreifende Datei-Sandbox — ein Policy-Zuhause, ein sandboxed-fs-Provider und fs-Eskalationsparität
[English](2026-07-14-cross-family-fs-sandbox.md) | [中文](2026-07-14-cross-family-fs-sandbox.zh.md) | Deutsch

Status: implemented


## Problem

`SandboxMode` beansprucht Dateieffekte, doch ursprünglich erzwang nur `ctx.shell` ihn. Die fs-Tools (`write`/`edit`) mutieren das Host-Dateisystem prozessintern über `ctx.fs`, wo ein OS-argv-Wrapper mechanisch bedeutungslos ist — [das Sandbox-Agent-Note](2026-07-06-sandbox.de.md) § In-process tools zeichnet das auf und ließ familienübergreifende Durchsetzung als aufgeschobene Phase mit einer offenen Frage: ob prozessinterne Durchsetzung pro-seam bleibt oder eine einheitliche Harness-Fähigkeit wird. Dieses Agent-Note ist diese Phase und beantwortet sie: ein geteiltes Policy-Zuhause, pro-seam-Durchsetzung auf der korrekten Höhe jeder Familie.

Die Lücke war nicht nur-read-förmig. Der Produktmodus eines eingeschränkten coding agent ist `workspace-write`: bash darf bereits unter dem Workspace-Root schreiben, während alles außerhalb verweigert wird, sodass eine fs-Durchsetzung, die nur alles-verweigern könnte, strikt schlechter wäre als das Deaktivieren der fs-Tools — das Modell würde ein in-Workspace-`write` versuchen, verweigert werden und lernen, über `bash`-Heredocs auszuweichen. Familienübergreifende Durchsetzung spricht daher die volle Modusleiter, einschließlich des Pfad-Containment-Urteils, das `workspace-write` erfordert (kanonische Ziele; `..`/symlink/Absolutpfad-Ausbrüche) und desselben Eskalationshebels, den bash trägt.

Eine zweite durchsetzende Familie legte außerdem ein Ownership-Problem im ursprünglichen Layout offen. Der Deployment-Default (`mode` + `workspaceRoot`) war auf `dsh-bash-sandbox` konfiguriert, und das Pro-Session-Override-Event war `shell/sandbox-mode`, gefaltet und geschrieben vom Session-mode-Kit von `dsh-shell`. Da fs dieselbe Policy durchsetzt, liest entweder fs bashs Config und Events (eine Fähigkeitsfamilie, die von der Plugin-Config eines Geschwisters abhängt) oder jede Familie trägt ihre eigene Kopie — und zwei Kopien von `workspaceRoot` driften in genau die gespaltene Welt, vor der das Sandbox-RFC warnt: bash auf einen Root eingeschränkt, während fs einen anderen einzäunt.

## Decision

Drei koordinierte Teile, alle aus der Leaf-`cordis.yml` komponiert, keines berührt `agent-loop`.

### `ctx.sandboxPolicy` — ein Zuhause für Modus und Workspace-Root

`packages/sandbox/sandbox-policy/` (`@deepseek-ai/dsh-sandbox-policy`) registriert `ctx.sandboxPolicy`, den einzigen Owner der Sandbox-Policy des Deployments:

- `Config`: `mode` (die geschlossene `SandboxMode`-Union, Default `read-only`) und `workspaceRoot` (Default das Prozess-cwd, absolut aufgelöst). Fehlkonfiguration schlägt beim Laden laut fehl.
- Das Pro-Session-Override-Event `sandbox/mode`, gefaltet von der `sandboxMode`-Projektionseinheit, die dieses Paket auf der erforderlichen `ctx.sessionProjections`-Registry registriert (`stateVersion` 1, nur-Host; `stateOf(session, 'sandboxMode')` ist der Host-Lesezugriff), sein Schreibpfad (`setSandboxMode(session, mode)`) und `SANDBOX_MODES`. Das Event ist Policy-Zustand — von zwei Familien konsumiert — also lebt es hier, nicht im seam einer der beiden Fähigkeiten. Seine Form und nur-Log-Semantik folgen dem `approval/*`-Präzedenzfall, und Mitwirkende wie Leser erfordern beide `sessionProjections` ([der obligatorische Projektions-seam](../architecture/2026-08-19-session-projection-mandatory-seam.de.md)).
- `resolve({ session?, mode? })`, das eine vollständige Pro-Aufruf-`SandboxExecutionPolicy` zurückgibt: explizit genehmigter Modus > das projizierte Override der Session > `defaultMode`, und das immutable cwd der Session > konfigurierter `workspaceRoot`-Fallback.
- `defaultMode`-/`workspaceRoot`-Accessoren, als Deployment-Fallbacks und als Fähigkeits-Ankündigungsfaktum beibehalten.

`dsh-bash-sandbox` trägt keine eigene Sandbox-Config — es injiziert `sandboxPolicy` und nutzt dessen Deployment-Fallback nur für direkte Aufrufe. `dsh-tool-bash` und `dsh-tool-fs` übergeben die aktive Session an `ctx.sandboxPolicy.resolve()`, sodass beide bei jedem Aufruf denselben effektiven Modus und cwd-Root erhalten; `dsh-permission-presets`-Presets und die ACP-Bridge schreiben über den verlagerten Setter. Die seams, die bash- und fs-Ausführung besitzen, bleiben session-frei — die Session-Abhängigkeit lebt im Policy-Paket und den Tool-Consumern.

### `dsh-fs-sandbox` — Durchsetzung innerhalb des Providers

`packages/fs/fs-sandbox/` (`@deepseek-ai/dsh-fs-sandbox`) spiegelt die `bash-local`/`bash-sandbox`-Aufspaltung: `SandboxedFileSystem extends LocalFileSystem`, registriert als `ctx.fs`, injiziert `sandboxPolicy`. Lesungen (`resolve`/`stat`/`readText`/`streamText`/`listDir`) gehen unangetastet durch — jeder Modus erlaubt Lesen. Die beiden Mutationen erzwingen nach Modus, bevor sie an das geerbte atomare Schreiben delegieren:

- `read-only` verweigert `writeText`/`editText` rundweg.
- `workspace-write` zäunt das kanonisierte Ziel gegen die schreibbare-Root-Menge ein — `writableRoots(policy)` in `dsh-sandbox`: der Workspace-Root plus die Plattform-Temp-Bereiche (`/tmp`, `os.tmpdir()`), jeweils realpathed — DIESELBE Menge, die das Seatbelt-Profil gewährt, sodass der fs-Zaun die vierte Dialektform einer Modusbedeutung neben den bwrap/Landlock/Seatbelt-Profilen ist und "das write-Tool kann `/tmp` nicht schreiben, bash aber schon"-Asymmetrien nicht entstehen können. Kanonische Schreibweisen nehmen einen lexikalischen Containment-Schnellpfad; wenn Windows ein Verzeichnis über verschiedene Schreibweisen oder Langname/8.3-Schreibweisen offenlegt, vergleicht ein Vorfahren-Walk die Dateisystem-Identität, statt die Grenze auf textuelle Präfix-Schätzungen abzuschwächen. Das Ziel wird unmittelbar vor der Delegation rekanonisiert (`resolve` realpathed den tiefsten existierenden Vorfahren), sodass ein seit der Auflösung durch das Tool getauschter Vorfahren-symlink erkannt wird.
- `danger-full-access` delegiert un-eingezäunt.

Eine Verweigerung ist das strukturierte `FS_SANDBOX_DENIED` mit dem effektiven Modus — verschieden von `FS_PERMISSION_DENIED` (ein Host-EACCES ist die Welt, die verweigert; dies ist Policy, die verweigert). Keine Textinferenz: Ein prozessinterner Zaun weiß exakt, was er verweigerte. Der Pro-Aufruf-Träger ist ein nachgestelltes optionales `SandboxExecutionPolicy` auf `writeText`/`editText` (das Dateisystem-Zwilling von `ShellExecRequest.sandboxPolicy`); der seam bleibt session-frei, und das nackte lokale Backend ignoriert ihn. `FileSystem.sandboxMode` ist das Fähigkeitsfaktum (`undefined` auf der Basis und `fs-local`, der Default auf `SandboxedFileSystem`), sodass die Tool-Schicht Eskalation aus Kompositionswahrheit ankündigt.

Das Bedrohungsmodell steht im Paket-README: ein Policy-Zaun in vertrauenswürdigem Code über modellkontrollierten Pfaden, keine Kernel-Grenze — die Operationen sind die eigenen des seam, nur der Zielpfad ist unvertrauenswürdig, sodass kanonisieren-dann-enthalten die vollständige Antwort auf diese Fläche ist (der `code-runtime`-Präzedenzfall "containment, not a security boundary"). Kernelgradige Isolation unvertrauenswürdigen CODES bleibt `ctx.shell`s Aufgabe. Die verbleibende resolve-zu-syscall-Race wird durch die In-place-Rekanonisierung verengt und nur durch Plattform-Primitive (`openat2` `RESOLVE_BENEATH`) beseitigt, die ihren Portabilitätspreis hier nicht wert sind.

### Tool-Parität — ein Verweigerungsmarker, ein Eskalationsfluss

`dsh-tool-fs` löst die vollständige Policy der aktiven Session auf jede Mutation und bildet `FS_SANDBOX_DENIED` auf den Marker ab, den das Modell bereits von bash kennt: `[sandbox: file access denied under <mode> mode]`. Wenn `ctx.fs.sandboxMode` bei der Registrierung einen einengenden Modus meldet, kündigen `write` und `edit` dieselben `sandbox_permissions`- + `justification`-Felder an, lehren denselben Same-turn-Retry und lösen denselben `ctx.approval`-Request vor der Ausführung — die vier Ergebnisse und ihre wörtlichen fail-closed-Texte, übernommen aus [dem Sandbox-Agent-Note](2026-07-06-sandbox.de.md) § Eskalation (strikte Erweiterung, bei Ausführung gegen den effektiven Modus des Aufrufs geprüft; eine Erteilung ändert nur den Modus dieses Aufrufs und behält seinen Session-Root; keine neuen Session-Events).

Die geteilten Teile leben in `dsh-sandbox`, das die Modustypen besitzt: `WIDER_MODES`, das Eskalationsziel-Enum, die Argument-Paarungs-Validierung, die Verweigerungs-/Hinweis-Marker-Builder und `approveEscalation` — die geordnete fail-closed-Choreografie. `approveEscalation` nimmt einen minimalen STRUKTURELLEN Approver (`EscalationApprover`, generisch über die agent- und call-id-Typen), nicht den Approval-Service-Typ, sodass `dsh-sandbox` keine Abhängigkeit auf die Approval- oder Agent-Pakete gewinnt: Jedes Tool übergibt sein eigenes `ctx.approval`, agent, call id und Tool-Namen als Zutaten. `dsh-tool-bash` und `dsh-tool-fs` nutzen beide diese; das dateiübergreifende Duplikationsgate hält die Einzelquelle ehrlich.

Die [Basisprofil-Komposition](../../../../packages/bundle/base/cordis.patch.yml) lädt `dsh-sandbox-policy` und `dsh-fs-sandbox`, behält die `mode`/`workspaceRoot`-Config auf dem Policy-Eintrag und lässt `fs-observation-policy` (read-before-edit) orthogonal darüber komponiert. Der System-prompt nennt weiterhin keinen Sandbox-Modus — der Marker lehrt die Grenze in dem Moment, in dem sie zählt, gemäß der Live-Evidenz des Sandbox-Agent-Notes.

### Der Durchsetzungspunkt: Provider, nicht Intent-Gate

Die ursprüngliche familienübergreifende Skizze des Sandbox-Agent-Notes legte fs-Durchsetzung auf die `fs/write-intent`/`fs/edit-intent`-Events. Dieses Agent-Note erzwingt stattdessen im Provider, aus zwei mechanischen Tatsachen: Die Intent-Slots sind Ein-Entscheidung-erster-gewinnt (belegt von `dsh-fs-observation-policy`, dessen Vertrag einen zweiten Entscheider als Fehlkonfiguration benennt), und die Intent-Events werden nur von `dsh-tool-fs` dispatched — ein direkter `ctx.fs`-Aufrufer (ein cordis-gemountetes Plugin, ein eigenes Tool) umgeht sie, während Provider-Level-Durchsetzung von Konstruktion her jeden Aufrufer abdeckt.

### Out of scope

- **Netzwerk-Policy für `ctx.web`** — `SandboxMode` beansprucht nur Dateieffekte; ein nur-Web-Netzregler, während bash `curl` frei läuft, wäre eine falsche Grenze. Erneut prüfen, wenn ein bash-Backend Netzwerk erzwingt (bwrap `--unshare-net`, Landlock ABI v4+).
- **Der `subagent-acp`-Consumer** — unveränderte aufgeschobene Phase des Sandbox-RFC.
- **Zusätzliche schreibbare Roots innerhalb einer Session** — die aufgelöste Policy trägt ein primäres `SessionHeader.cwd`; ACP `additionalDirectories` bleibt ein separates Bridge- und Policy-Design.
- **Eine einheitliche pro-Tool-Sandbox-Laufzeit** — bleibt aus den Gründen im Sandbox-RFC abgelehnt.

## Alternatives considered

- **Auf den `fs/*`-Intent-Events durchsetzen (die ursprüngliche Skizze des Sandbox-Agent-Notes)** — abgelehnt aus den zwei mechanischen Tatsachen in § Der Durchsetzungspunkt: Ein-Slot-erster-gewinnt bereits belegt und ein Umgehungspfad für direkte `ctx.fs`-Aufrufer. Provider-Level-Durchsetzung deckt jeden Aufrufer ab und spiegelt bashs Implementation-austauschen-Form.
- **In `tools/pre-execute` erzwingen** — abgelehnt: Der Listener sieht den rohen Pfad-String des Modells vor `resolve()`, würde also cwd-Defaulting und symlink-Kanonisierung nachimplementieren und trotzdem gegen das echte resolve rasen. Disqualifizierend für `workspace-write`, ein Urteil über kanonische Pfade.
- **Inline-Checks in `dsh-tool-fs`** — abgelehnt: deckt nur den Tool-Pfad ab (dieselbe Umgehung wie die Intent-Events) und dupliziert resolve-Wissen eine Ebene über der Stelle, wo das kanonische Ziel bereits existiert.
- **Ein `mode`-Flag auf `dsh-fs-local` statt eines Geschwister-Backends** — abgelehnt: Das Fähigkeitsfaktum muss Kompositionswahrheit sein, so wie `dsh-bash-local` vs `dsh-bash-sandbox`; ein Config-Flag macht die Ankündigung des Tools von der Konfiguration abhängig, und die bash-Familie etabliert bereits die Geschwister-Paket-Form.
- **Kernel-erzwungene fs-Mutationen über einen eingeschränkten Helper-Subprozess** — abgelehnt: ein Prozess pro Schreibvorgang; `editText`s Lesen-Vergleichen-Schreiben-Kritikalabschnitt müsste ganz in den child ziehen, um atomar zu bleiben; und die Bedrohungsfläche (vertrauenswürdige Operationen, unvertrauenswürdiges Pfad-Argument) braucht keinen Kernel — der Zaun in vertrauenswürdigem Code ist die vollständige Antwort, während Unvertrauenswürdiger-Code-Isolation auf `ctx.shell` bleibt.
- **Pro-Familie-Policy-Config mit einer Ladezeit-Konsistenzprüfung** — abgelehnt: zwei Zuhause für ein Faktum, geflickt durch eine Prüfung, die jede künftige durchsetzende Familie aufzählen müsste; der Policy-Service macht Drift unausdrückbar statt entdeckt.
- **Das Override-Event in `dsh-shell` als `shell/sandbox-mode` behalten** — abgelehnt: Das Event ist von zwei Familien konsumierter Policy-Zustand; es bash-benannt zu lassen zwingt `dsh-fs-sandbox`, vom bash-Vokabular abzuhängen. Vor dem Release ist die Umbenennung ein Gleich-Änderungs-Umzug mit Snapshot-Neuaufzeichnungen, ohne Shims.
- **Eskalations-Choreografie aus den Approval-/Agent-Paketen in `dsh-sandbox` importieren** — abgelehnt: Sie würde die Schichtung umkehren (ein Basis-Vokabular-Paket, das von UI-/Agent-Paketen abhängt). Der strukturelle Approver hält die Logik einzelquellig in `dsh-sandbox`, während die Abhängigkeiten in der Tool-Schicht bleiben, die sie bereits hält.
- **Ein konsolidiertes Mutations-Optionen-Objekt auf dem fs-seam** (die zuerst für den Pro-Aufruf-Träger skizzierte Form) — aus Reibung abgelehnt: Es spaltet `signal` über eine Options-Tasche für Mutationen, während Lesungen es positionell behalten. Ein nachgestelltes optionales `SandboxExecutionPolicy` passt zu bashs tragen-und-ignorieren-Muster und hält `signal` über den seam symmetrisch.
- **Zusätzliche schreibbare-Root-Gewährungen auf `SandboxPolicy`** — unverändert aufgeschoben: `writableRoots()` leitet aus der definierten Modusbedeutung ab; Ad-hoc-Gewährungen sind eine Eskalations-Scope-Frage, die das Sandbox-RFC offen ließ.

## Consequences

Was ausgeliefert wurde — die Stufen in § Testing halten jede:

- Unter `read-only` geben `write`/`edit` den `[sandbox: file access denied under read-only mode]`-Marker zurück und die Platte bleibt unberührt; `read`/`listDir` verhalten sich identisch zu `dsh-fs-local`.
- Unter `workspace-write` landen Mutationen unter dem Workspace-Root und den Temp-Bereichen und werden außerhalb verweigert; die Containment-Matrix — `..`-Traversal, absolute Pfade außerhalb, ein vorbestehendes verlinktes Verzeichnis innen, das nach außen zeigt, eine neue Datei unter einem solchen symlink erzeugt und alias-äquivalente Root-Schreibweisen — verweigert jeden Ausbruch und lässt gleichzeitig dieselbe Verzeichnisidentität auf echten Platten zu.
- Eine verweigerte fs-Mutation, einmal mit `sandbox_permissions` + `justification` wiederholt, fragt über die komponierte Approval-Kette an; eine Erteilung läuft genau diesen Aufruf unter dem weiteren Modus und der Schreibvorgang landet; rejected/cancelled/unavailable erzeugen je ihren wörtlichen fail-closed-Text und mutieren nichts.
- Ein `permission`-Preset-Schalter regiert beide Familien: Nach einem Moduswechsel der Session ehren der nächste bash-Aufruf und die nächste fs-Mutation den neuen Modus aus derselben `sandboxMode`-Projektion.
- Nebenläufige Sessions mit verschiedenen cwd-Roots tragen verschiedene Policies durch dieselben Service-Instanzen; keine Familie cached den Root einer Session für den nächsten Aufruf.
- Ein direktes `ctx.fs.writeText` ohne Pro-Aufruf-Stempel wird beim Deployment-Default eingeschränkt.
- Die Eskalationsfelder auf `write`/`edit` existieren genau dann, wenn das gemountete `ctx.fs` einengt, und fehlen unter `dsh-fs-local`.
- `agent-loop` ist unberührt — alles fährt auf `ctx.sandboxPolicy`, dem `ctx.fs`-seam, `SessionEventMap`-Merging und der Tool-Ausführungs-Pipeline.

Kosten und akzeptierte Grenzen:

- **Der fs-Zaun ist eine Policy-Grenze, keine Kernel-Grenze.** Seine Bedrohungsfläche sind modellgewählte Pfade, nicht gegnerische Host-Prozesse; das verbleibende resolve-zu-syscall-TOCTOU ist verengt, nicht beseitigt, und das README sagt das. Kernel-Grenzen bleiben bashs.
- **`dsh-bash-sandbox` gewinnt eine harte Abhängigkeit auf `ctx.sandboxPolicy`.** Jede gesandboxete Komposition fügt einen `cordis.yml`-Eintrag hinzu oder schlägt beim Laden laut fehl — der beabsichtigte Pre-Release-Fundamentzug; die Beispiele aktualisieren in derselben Änderung.
- **Zaun-vs-Runner-Parität ist abgeleitet, nicht behauptet.** Der fs-Zaun und das Seatbelt-Profil beziehen ihre schreibbare Menge beide aus `writableRoots`, und ein Paritäts-Unit-Test pinnt die Mengen; ein Runner-Profil, das seine schreibbare Menge ohne diese Funktion ändert, würde driften.
- **Der Marker und die Eskalationsbelehrung dienen nun zwei Familien.** Eine Wortlautänderung ist ein koordinierter Edit hinter einem Builder in `dsh-sandbox`; das Duplikationsgate und gepinnte Snapshots halten sie einzelquellig, um den Preis, dass fs und bash in der Formulierung nicht bewusst auseinanderlaufen können, ohne den Builder zu spalten.

## Testing

- Unit: `dsh-sandbox` pinnt die Eskalationsleiter, die Marker-Builder, die Argument-Paarungs-Validierung und `approveEscalation`s geordnete fail-closed-Sequenz (nicht-erweiternd, kein-approval, kein-agent, jedes Ergebnis), plus `writableRoots`/`canonicalPath`. `dsh-sandbox-policy` pinnt Deployment-Fallback, Session-Modus/Root-Auflösung, Explizit-Modus-Vorrang, den Fold der `sandboxMode`-Projektionseinheit und den Setter, Ladezeit-Modus-Zurückweisung und HMR-Sicherheit. `dsh-fs-sandbox` pinnt den pro-Policy-Zaun und die Containment-Matrix (innen, Temp-Bereich, absolut-außerhalb, `..`, nach-außen-verlinktes Verzeichnis, neue Datei darunter, Pfad-gleich-Root, Dateisystem-Root, Root-endet-in-Trenner und alias-äquivalente Schreibweise) auf einem echten Dateisystem, plus Pro-Aufruf-Override und HMR-Sicherheit. `dsh-tool-fs` pinnt Ankündigungs-Gating, vollständige Policy-Auflösung, Verweigerungs-Marker-Abbildung und die volle Eskalationsmatrix (Erteilung, Ablehnung, kein-Service, kein-agent, Paarung, Nicht-einengend-Guard). `dsh-tool-bash`, `dsh-bash-sandbox` und `dsh-permission-presets` konsumieren dasselbe Policy-Kit.
- Schlüsselloses e2e: Ein echter Cordis-Kontext erzeugt zwei agents mit verschiedenen Session-cwd-Roots, führt die ausgelieferten bash- und fs-Tools nebenläufig aus und welt-verifiziert, dass Eigen-Projekt-Schreibvorgänge landen, während beide Kreuz-Projekt-Schreibvorgänge verweigert werden.
- Snapshot: Das acp-agent-Beispiel komponiert `dsh-sandbox-policy` + `dsh-fs-sandbox`; der gepinnte Header trägt die fs-Eskalationsfelder und den `sandbox/mode`-Event-Namen, einmal neu aufgezeichnet.
