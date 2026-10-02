---

English | [中文](README.zh.md) | [Deutsch](README.de.md)
description: "The SQLite FTS5 full-text search backend for session history, for deployments and maintainers choosing, configuring, or debugging full-text search over the query service."

English | [中文](README.zh.md) | [Deutsch](README.de.md)
kind: "package-reference"

English | [中文](README.zh.md) | [Deutsch](README.de.md)
---

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
# @deepseek-ai/dsh-session-query-sqlite

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
English | [中文](README.zh.md)

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
## Summary

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
Use this package to add ranked SQLite FTS5 search across session history, either across sessions or within one session, with cursor pagination. It indexes live and persisted history in a separate derived database, so searches reflect current state without modifying the session-persistence store. Exact reads, filters, and traces remain available through the same query API. Search is opt-in in shipped compositions; configure `openAt` to open the index at startup, on first search, or never. Results match tokens and phrases rather than arbitrary substrings, and each index path has a single process owner.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
## Table of Contents

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
- [Use this package](#use-this-package)

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- [Understand the implementation](#understand-the-implementation)

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- [Further Exploration](#further-exploration)

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- [Model Experience](#model-experience)

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- [Dev Note](#dev-note)

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
-----

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
<a id="use-this-package"></a>

English | [中文](README.zh.md) | [Deutsch](README.de.md)
## Use this package

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
Mount this package when a composition needs ranked full-text search over session history — for example the Web content search or `/resume` prior-work retrieval. The common path is explicit: mount the plugin, give it a dedicated database path, and call `ctx.sessionQuery.searchSessions` or `searchEvents` from code.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
### When to choose it

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
Choose it when you want full-text recall over prior sessions with ranking and paging. Choose it together with `dsh-session-query` and the session service; a persistence backend is optional but recommended so persisted history is searchable after restarts. Avoid pointing `path` at the session-persistence database — this package owns a separate derived index.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
### Minimal configuration

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
```yaml

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- name: '@deepseek-ai/dsh-session'

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- name: '@deepseek-ai/dsh-session-query-sqlite'

English | [中文](README.zh.md) | [Deutsch](README.de.md)
  config:

English | [中文](README.zh.md) | [Deutsch](README.de.md)
    path: /absolute/path/to/session-search.db

English | [中文](README.zh.md) | [Deutsch](README.de.md)
```

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
| Field | Default | Meaning |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
|---|---|---|

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `path` | required | Dedicated derived-index SQLite path, or `:memory:`; missing paths are created owner-only on POSIX |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `openAt` | `startup` | `startup` opens at activation; `first-search` defers the SQLite module until the first search; `never` disables full-text search while inherited reads stay available |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `journalMode` | `wal` | `wal`, `delete`, `truncate`, or `persist` |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `defaultLimit` | `20` | Page size when a request omits `limit` |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `maxLimit` | `100` | Largest accepted request page size |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `snippetChars` | `240` | Maximum snippet length in Unicode code points |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `readWindowMax` | `50` | Maximum `before`/`after` raw events for the inherited `readEvent()` |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `persistedReadConcurrency` | `4` | Concurrent persisted-log reads for inherited batch reads |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `preparedSessionCacheSize` | `5` | Cold prepared-Session observations the inherited `observeSession` reader retains for reuse |

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-session-query-sqlite) is the exhaustive source for every accepted field and its JSDoc.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
### Search behavior

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
`searchSessions` searches the whole corpus and groups results by each session's strongest matching event; `searchEvents` searches one logical session. Queries are literal phrases: they are trimmed and whitespace-normalized, and FTS5 syntax such as quotes, `OR`, `NEAR`, and `*` is treated as data, never as executable query syntax. Metadata filters (session id, cwd, created-at, parent, availability, event seq/time/type/surface) narrow results before ranking. All `current`, `shadowed`, and `log-only` events are searchable by default; pass a surface filter to narrow.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
Ranking is deterministic: more actual FTS5 highlighted-match spans first, then shorter documents, with event time, session id, and seq breaking ties. Results carry plain-text snippets bounded by `snippetChars` Unicode code points, with no provider-specific numeric score. Pages continue through an opaque `SessionSearchCursor` bound to the exact normalized request; a cursor becomes stale when its relevant corpus changes (`SESSION_QUERY_STALE_CURSOR`), and a within-session cursor survives changes to unrelated sessions while a cross-session cursor does not.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
The `unicode61` tokenizer matches tokens and phrases, not arbitrary substrings: `AI` does not match the token `BRAID`. Use `ctx.sessionQuery.filterEvents()` with a `text` clause when a literal whitespace-flexible substring scan is required.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
### When to defer or disable search

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
With `openAt: first-search`, the service activates without importing `node:sqlite` or opening the index, deferring SQLite's experimental warning until the first actual search; an invalid database fails that first search instead of service activation. With `openAt: never`, full-text search is off for the deployment: `searchSessions` and `searchEvents` fail with `SESSION_QUERY_SEARCH_DISABLED` before any request normalization, while every inherited exact read, filter, and trace keeps working. Requests that exceed the compiled-predicate budget (14 combined predicates across sessions, 13 within a session) or SQLite's portable 32,766-binding limit fail with `SESSION_QUERY_INVALID_FILTER` before statement preparation.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
### Failures and recovery

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
Typed `SessionQueryError` failures carry stable codes: `SESSION_QUERY_SEARCH_DISABLED` when search is configured off; `SESSION_QUERY_INDEX_FAILED` when the index cannot open or reconcile; `SESSION_QUERY_SESSION_NOT_FOUND` when a search target is absent; `SESSION_QUERY_STALE_CURSOR` when the corpus changed between pages — retry the complete search call; and `SESSION_QUERY_INVALID_CURSOR` for a cursor that does not belong to this request. Cancellation is honored between synchronous SQLite calls; a statement already executing on the JavaScript thread cannot be interrupted.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
-----

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
<a id="understand-the-implementation"></a>

English | [中文](README.zh.md) | [Deutsch](README.de.md)
## Understand the implementation

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
<details>

English | [中文](README.zh.md) | [Deutsch](README.de.md)
<summary>Implementation internals — click to expand</summary>

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
This section explains the design decisions behind the backend and points at the code that realizes them; the observable behavior is fully covered in [Use this package](#use-this-package).

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
### Design philosophy

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
The backend is built on one separation and three commitments:

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
- **Derived index, never the source store.** The FTS rows live in a dedicated disposable database; the session-persistence database is never opened here.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- **Live-preferred observation.** One serialized state machine compares persistence snapshot revisions, reads only new or changed logs through short-lived read handles, and reconciles in one transaction, so a search reflects the newest stable state.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- **Generation-bound cursors.** Every corpus change bumps a generation; cursors carry the generation they were created under and fail stale rather than returning a shifted page.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- **Literal phrases as data.** Caller query text is quoted into one FTS5 phrase so query syntax stays inert, and reserved highlight markers are stripped from documents before indexing.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
The design history lives in the [SQLite FTS5 session search note](../../../.agents/notes/archived/feature/2026-07-10-sqlite-session-query-provider.md) and the [unified service decision](../../../.agents/notes/archived/architecture/2026-07-23-unified-session-query-service.md).

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
### Source map

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
| File | Role |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
|---|---|

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| [`src/index.ts`](src/index.ts) | Service: config, openAt lifecycle, serialized reconciliation, query execution, cursors |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| [`src/query.ts`](src/query.ts) | Request normalization, parameterized predicates, snippets, predicate and binding budgets |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| [`src/schema.ts`](src/schema.ts) | Database schema, application-id ownership, in-place reset, owner-only file creation |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| — | No runtime invariant companion is published; reconciliation, cursor generations, and derived-index ownership are validated at each serialized query boundary. |

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
### Index lifecycle

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
Persisted FTS rows live in a dedicated derived database and survive restarts; live sessions use connection-local TEMP tables that shadow the durable base for the same session and reveal it again when the live owner detaches. Both tables retain the exact inherited cut in numeric `seed_length`; reconstructed headers expose only `isSeeded`, while the cut participates in live fingerprints and persisted source revisions. Each search runs one serialized observation: list persistence snapshots, compare per-session revisions with the indexed rows, read only new or changed logs through a read handle (balancing an interrupted final turn in memory, never writing back), extract semantic documents, and commit the reconciliation in one transaction before running the query. Repeated queries and unchanged reopens read nothing; switching stores or observing new, changed, deleted, or externally repaired sources reconciles on the next stable observation. Source or transaction failure commits nothing and the next search retries.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
### Schema ownership

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
The database carries an application id and schema version 8. Opening refuses a file owned by another application or a canonical database, rejects unknown user tables, and only a recognized incompatible derived schema resets in place — so an unrelated or session-persistence database is never touched. On POSIX filesystems, missing directories and database files are created owner-only (`0700` and `0600` before the process umask). Exactly one service in one process owns a derived-index path; generations and TEMP shadow state are connection-owned.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
</details>

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
-----

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
<a id="further-exploration"></a>

English | [中文](README.zh.md) | [Deutsch](README.de.md)
## Further Exploration

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
Read these pages when the package-level contract is not enough. They move from the shared query service to the type-level contract and the design evidence.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
- [Session Query subsystem reference](../../../docs/subsystems/session-query.md) — the full type-level contract this backend implements.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- [dsh-session-query](../session-query/README.md) — the service definition: exact reads, filters, and traces this backend inherits.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- [dsh-tool-session-query](../tool-session-query/README.md) — the model-facing consumer that calls these search methods.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- [SQLite FTS5 session search](../../../.agents/notes/archived/feature/2026-07-10-sqlite-session-query-provider.md) — search semantics, reconciliation, and the tokenizer decision.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- [JSONL session persistence](../../session/session-persistence-jsonl/README.md) — the authoritative Session store this disposable index observes; keep its root separate from this package's database path.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
-----

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
<a id="model-experience"></a>

English | [中文](README.zh.md) | [Deutsch](README.de.md)
## Model Experience

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
None, as the search backend returns hits only to callers and registers nothing model-facing.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
#### KV Cache effect

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
None; this package neither assembles nor sends a provider request.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
## Known Limitations and Deferred Work

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
<a id="known-limitations-and-deferred-work"></a>

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
These limits define when this package is a poor fit or needs special operational care. They are current package constraints, not a general SQLite comparison or a task backlog.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
- **No caller authorization** — this is a trusted context-wide service; a model tool or UI must enforce its own access policy.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- **Synchronous query execution** — `DatabaseSync` blocks the JavaScript thread during MATCH execution and cannot interrupt a statement already running.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- **Token recall, not arbitrary substrings** — the `unicode61` tokenizer does not match substrings inside a larger token; use `filterEvents()` for literal scans.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- **Single-owner derived index** — one service in one process must own each index path; external writers and multi-process sharing are unsupported.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
<a id="dev-note"></a>

English | [中文](README.zh.md) | [Deutsch](README.de.md)
### Dev Note

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
<details>

English | [中文](README.zh.md) | [Deutsch](README.de.md)
<summary>Working context for maintainers — click to expand</summary>

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
This Dev Note is working context for maintainers: open design questions and directions that are not decided. It is explicitly non-authoritative — shipped behavior, limits, and accepted rationale live in the sections above, the package code, and the linked Agent Notes.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
#### Future: alternate tokenizers and search providers

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
The `unicode61` tokenizer choice trades substring recall for index size and two-character token support; the trigram alternative was measured and rejected. Switching tokenizers or adding another search backend would change indexed recall and require its own reconciliation and generation story.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
</details>

English | [中文](README.zh.md) | [Deutsch](README.de.md)
