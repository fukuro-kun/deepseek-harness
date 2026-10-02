# Todo

[English](todo.md) | [中文](todo.zh.md) | Deutsch

Das durable todo-Vokabular im Besitz von [`@deepseek-ai/dsh-tool-todo`](../../packages/todo/tool-todo/README.de.md). Das dem Modell zugewandte Tool ersetzt die gesamte Liste einer agent-Session; das Paket besitzt außerdem die Event-Deklaration, die Replay-Projektion und das Invarianten-Begleitplugin. Tool-Verhalten und -Konfiguration stehen im [Package-README](../../packages/todo/tool-todo/README.de.md).

Quelle: [`packages/todo/tool-todo/src/types.ts`](../../packages/todo/tool-todo/src/types.ts)

## `TodoItem` — ein Listeneintrag

```ts type-equiv
/**
 * One entry in an agent's todo list — the unit of the `todo/write`
 * whole-list snapshot declared by this package.
 *
 * Deliberately minimal: a human-readable `content` line and a three-state
 * `status`. No id, priority, or `activeForm` — the list is replaced wholesale
 * on every write (last-write-wins), so entries need no stable identity. The
 * three statuses describe the complete portable lifecycle needed by model and
 * UI consumers.
 */
interface TodoItem {
  /** What this task is — a short imperative line shown in the UI. */
  content: string
  /** Lifecycle state. `in_progress` marks a task being worked now; parallel work may mark several. */
  status: 'pending' | 'in_progress' | 'completed'
}
```

## Durable Event und Invariante

Das Paket mergt per Declaration Merging `todo/write: { todos: TodoItem[] }` in `SessionEventMap`. Das Event ist rein logbasiert und trägt die vollständige Ersatzliste; der generierte [Persistence-Katalog](../persistence-catalog.de.md#todowrite--log-only) verzeichnet seine Deklarationsstelle. Das Invarianten-Begleitplugin des Pakets validiert bestehende und neu angekündigte Sessions in einem Durchlauf und verfolgt anschließend committete Turn-Grenzen inkrementell, sodass jedes live `todo/write` vor dem Append geprüft wird, ohne das Log erneut zu scannen.
