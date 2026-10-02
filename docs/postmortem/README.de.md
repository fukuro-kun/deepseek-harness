# Postmortems

[English](README.md) | [中文](README.zh.md) | Deutsch

Vorfallaufzeichnungen: Ein Bug erreichte einen Ort, an dem er nicht hingehört (ein echter Nutzer, ein gemergter PR, ein Release), und das Interessante ist *warum unser Prozess ihn durchgelassen hat*, nicht nur der Einzeilen-Fix.

Ein Postmortem ist KEINE [Agent Note](../../.agents/notes/README.de.md) (die eine bewusste Designentscheidung und ihre abgelehnten Alternativen festhält oder zukünftige Arbeit vorschlägt). Es ist eine rückblickende Aufzeichnung eines Fehlers: was kaputtging, der Mechanismus, warum jedes Sicherheitsnetz ihn verpasst hat, und die konkreten Guardrails, die hinzugefügt wurden, damit dieselbe Bugklasse beim nächsten Mal laut fehlschlägt.

Schreibe eines, wenn ein Bug **subtil** (der Mechanismus ist nicht offensichtlich und ein sorgfältiger Engineer würde ihn auf die harte Tour neu herleiten), **systemisch** (der Grund für das Entkommen ist eine Lücke in Tests/Tooling/Konventionen, kein einmaliger Tippfehler) und **teuer wiederzufinden** (er hat echte Debug-Zeit gekostet und würde es wieder tun) ist. Verlinke die Guardrails (Tests, AGENTS.md-Regeln, ADRs), die das Postmortem motiviert hat.

Jedes Postmortem beginnt mit einer **Executive Summary**: ein kurzer Absatz, den ein beschäftigter Leser in dreißig Sekunden aufnehmen kann — was kaputtging, die Root Cause in klaren Worten, warum er entwischt ist und die dauerhafte Lektion — vor den darauffolgenden detaillierten Abschnitten Summary / Timeline / Root Cause / Guardrails.

| # | Titel |
|---|---|
| [0001](0001-acp-default-export-drops-inject.de.md) | ACP-Server stürzte beim Verbinden ab: `export default` ließ das `inject` des Plugins fallen |
| [0002](0002-js-expression-disabled-filesystem-tools.de.md) | Filesystem-Snapshot-Tools wurden durch ein literales `!!js`-Objekt dauerhaft deaktiviert |
| [0003](0003-web-agent-gui-feedback-loop.de.md) | Web-Agent validierte einen Ersatz-Server statt der GUI, die seine Session hostete |
| [0004](0004-landlock-partial-notice-misclassified-child-failures.de.md) | Landlock-Hinweis zur teilweisen Durchsetzung klassifizierte Child-Fehlschläge falsch |
