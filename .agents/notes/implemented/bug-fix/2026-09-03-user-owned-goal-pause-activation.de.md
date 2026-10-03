# Agent Note: User-owned goal pause exposes live activation
[English](2026-09-03-user-owned-goal-pause-activation.md) | [中文](2026-09-03-user-owned-goal-pause-activation.zh.md) | Deutsch

Status: implemented


## Problem

Der Host-Pause-Fix in [Host-initiated goal pause aborts the live turn](../../archived/bug-fix/2026-09-01-host-goal-pause-aborts-turn.md) stoppte den aktuellen Modell-Turn, aber ein späterer Human-Turn konnte weiterhin `update_goal resume` nutzen, um ein durable `paused` Goal aufzuheben. Der Web-Strip las außerdem nur die durable `goal`-Projektion, sodass ein active-but-disarmed Goal und ein armed Goal identisch renderten und dieselbe Pause-Aktion anboten.

## Decision

`ctx.goals.get` ist eine Read-only-Remote-Methode. `GoalService` emittiert `goal/activation-changed`, wann immer sich seine prozesslokale Activation ändert, mit `{ sessionId, goal: { id, revision, activation } }` oder ohne Goal nach einem Clear. Die API-Remote-Allowlist leitet dieses JSON-Payload an Web-Clients weiter.

Die GoalBar konsumiert eine registrant-private Activation-Hook-Source, die von ihrem Slot-Inject erzeugt wird. Die Source startet, während der Framework-Hook sie beobachtet, liest `ctx.remote.goals.get`, abonniert `goal/activation-changed` und refreshed bei Running-State- oder Connection-Resets. Activation-Edges avancieren eine Epoch, die in-flight Reads invalidiert, sodass eine veraltete HTTP-Antwort keinen neueren Edge überschreiben kann; Running-Refreshes behalten die letzte Activation, bis der Read auflöst. Aktive Goals rendern `Ongoing Goal` nur wenn armed; active-but-disarmed Goals rendern `Inactive Goal`, exponieren Resume statt Pause, und durable paused Goals exponieren weiterhin Resume. Die Pause-Autorität bleibt in der Goal-Domäne und beim menschlichen `/goal resume`-Kommando, das weiterhin jede resumable Phase fortsetzen kann.

Die `update_goal resume`-Aktion lehnt ein durable paused Goal mit `GOAL_TOOL_RESUME_PAUSED` ab, bevor sie den Goal-Service aufruft. Sie resumt weiterhin ein active-but-disarmed Goal nach Session-Restore oder Fork und ein blocked Goal nach menschlicher Fortsetzung. Der Modell-Prompt und die Tool-Beschreibung stellen klar, dass das Resume eines durable paused Goals dem Benutzer gehört.

## Alternatives considered

**Activation im durable `GoalSnapshot` speichern.** Verworfen: Activation ist per Goal-Domänenvertrag prozesslokal und darf Restore oder Fork nicht überleben.

**Activation in die persistierte Session-Projektion aufnehmen.** Verworfen: Projektionsstate wird checkpointed; ein gecachter `armed`-Wert würde den Prozess, der ihn armte, fälschlich überleben.

**Das vollständige gescopte `goal/changed`-Event an Clients weiterleiten.** Verworfen: Sein `Agent`-Payload ist kein JSON-Wire-Datum. Das dedizierte Activation-Event trägt nur Session-Id, Goal-Ref und Activation, die Clients brauchen.

**Dem Modell erlauben, durable paused Goals aus Natural-Language-Turns zu resumen.** Verworfen: Eine manuelle Pause ist ein Benutzer-Control, und Prompt-only-Zurückhaltung lässt dem Modell dasselbe Turn-Level-Undo verfügbar.

## Consequences

Das Web kann Running-, Disarmed- und Paused-Goals unterscheiden, ohne Activation zu persistieren. Ein durable paused Goal ist nur über das Web-Control, `/goal resume` oder einen anderen direkten Goal-Service-Caller resumable; das modellseitige `update_goal resume` ist auf disarmed-active und blocked Goals begrenzt. Die API-Oberfläche gewinnt einen Read und ein weitergeleitetes Live-Event; durable Goal-Change-Payloads und Projektions-State-Versionen sind unverändert. Komponenten besitzen keine Remote-Subscriptions; die Activation-Source folgt dem etablierten Inject-Hooks-Live-Data-Kanal.

## Testing

Goal-Unit-Tests pinnen die Activation-Event-Id und Revision über Create, Session-Start und Resume hinweg. Tool-Tests pinnen die Ablehnung eines durable paused Goals in einem späteren Human-Turn, während restaurierte disarmed-active Goals weiterhin resumen. API-Remote-Tests pinnen die JSON-Weiterleitung. Activation-Source-Tests pinnen Stale-Read-Ablehnung und Running-Refresh-Retention. Web-Unit-Tests pinnen Armed-Pause- vs. Disarmed-Resume-Rendering. Das assemblierte Goal-Bar-Browser-Szenario nutzt den Fixture-Timing-Hook, um sowohl Armed- als auch Active-Disarmed-Goldens zu pinnen.
