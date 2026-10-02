---

English | [中文](README.zh.md) | [Deutsch](README.de.md)
description: "The stdio language-server provider for ctx.lsp: configured server commands, extension mappings, and bounded transient-open queries, for users and maintainers composing local code navigation."

English | [中文](README.zh.md) | [Deutsch](README.de.md)
kind: "package-reference"

English | [中文](README.zh.md) | [Deutsch](README.de.md)
---

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
# @deepseek-ai/dsh-lsp-stdio

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
English | [中文](README.zh.md)

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
## Summary

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
Use `dsh-lsp-stdio` to give agents definitions, references, implementations, and hover from explicitly configured local language servers. It maps file extensions to language identifiers, starts one server per workspace on demand, and reads each queried file afresh without retaining document state between queries. Language-server processes and source reads share the mounted filesystem and subprocess environment. The package does not install servers or provide a sandbox: deployments supply commands, mappings, and any required confinement. Queries are serialized per server and workspace, while different workspaces can run in parallel.

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
Mount this provider when a deployment has local language servers — for example `typescript-language-server` — and wants the harness to navigate code through them. It needs filesystem and subprocess providers for the same execution world, plus the `dsh-lsp` seam and, for model access, `dsh-tool-lsp`.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
### Minimal configuration

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
The `servers` record maps each stable provider id to one server command. The provider resolves every executable at load after credential scrubbing, so a bad entry prevents every provider from registering; processes launch lazily on the first matching query.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
```yaml

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- name: '@deepseek-ai/dsh-fs-local'

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- name: '@deepseek-ai/dsh-subprocess-local'

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- name: '@deepseek-ai/dsh-lsp'

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- name: '@deepseek-ai/dsh-lsp-stdio'

English | [中文](README.zh.md) | [Deutsch](README.de.md)
  config:

English | [中文](README.zh.md) | [Deutsch](README.de.md)
    servers:

English | [中文](README.zh.md) | [Deutsch](README.de.md)
      typescript:

English | [中文](README.zh.md) | [Deutsch](README.de.md)
        command: typescript-language-server

English | [中文](README.zh.md) | [Deutsch](README.de.md)
        args: ['--stdio']

English | [中文](README.zh.md) | [Deutsch](README.de.md)
        extensionToLanguage:

English | [中文](README.zh.md) | [Deutsch](README.de.md)
          '.ts': typescript

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- name: '@deepseek-ai/dsh-tool-lsp'

English | [中文](README.zh.md) | [Deutsch](README.de.md)
```

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
| Field | Default | Meaning |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
|---|---|---|

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `command` | required | Executable to spawn — absolute, or resolved on the child PATH at load; launched without a shell |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `extensionToLanguage` | required | Lowercase leading-dot extension → LSP language id (e.g. `{ '.ts': 'typescript' }`) |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `args` | `[]` | Arguments passed to the executable |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `env` | `{}` | Extra env merged over the credential-scrubbed ambient env; variables matching `KEY`/`PASSWORD`/`SECRET`/`TOKEN` and all `DSH_*` names are not forwarded |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `initializationOptions` | `null` | Static `initialize` options forwarded to the server |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `configuration` | `null` | Static answer to every `workspace/configuration` item |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `maxMessageBytes` | `16000000` | Largest single framed message accepted from the server |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `maxStderrBytes` | `1000000` | Largest stderr tail retained for diagnostics |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `maxDocumentBytes` | `4000000` | Largest source file this host opens |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `shutdownTimeoutMs` | `5000` | Graceful `shutdown`/`exit` budget before escalation |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `killGraceMs` | `2000` | Request-cancel and SIGTERM→SIGKILL escalation grace |

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
`servers` must contain at least one entry with non-empty ids; timer budgets must be positive integers within Node's timer range, and byte caps must be positive. The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-lsp-stdio) is the exhaustive source for every accepted field.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
### What a query does

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
On the first query for a workspace, the provider launches one server process for that workspace and keeps it pooled. Each query reads the current source through `ctx.fs`, opens it in the server (`textDocument/didOpen`), runs the requested operation, and closes it — so the server always sees current text and no document state persists between calls. Queries to one server and workspace run one at a time; different workspaces run in parallel. If the pooled process fails before or during a read-only query, the provider retries that query once on a fresh process.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
### Observable success and failures

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
A successful navigation returns normalized locations, and hover returns normalized text or a no-hover notice; empty results are successful no-result responses. The query fails when the server does not support the operation or the transient open/close synchronization (`LSP_UNSUPPORTED_OPERATION`), when the source is missing, non-regular, non-UTF-8, oversized, or outside the canonical workspace (rejected before the server starts), or when the server returns a malformed payload (`LSP_MALFORMED_RESPONSE`). A hard-killed harness leaves servers running until they exit on their own — graceful shutdown happens only through service disposal.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
### Security boundary

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
This provider trusts its configured server and adds no sandbox confinement; the server receives the filesystem and process authority of the mounted execution world. It rejects query sources that are missing, non-regular, non-UTF-8, oversized, or canonically outside the workspace before server startup. Result locations may point outside the workspace, but an external path can never become a query source. Mount filesystem and subprocess providers for the same execution world — a split-world composition is invalid.

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
This section explains the design decisions behind the provider and where the code realizes them; observable behavior is covered in [Use this package](#use-this-package).

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
### Design philosophy

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
- **Generic host, not a catalog.** Deployments configure commands and mappings explicitly; presets belong in `cordis.yml` overlays, not in this package.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- **Compatibility-first transient open.** Every query runs `didOpen` (version 1, full text) → request → `didClose`, so the server always sees current bytes and the first version needs no `didChange`, content cache, or document LRU.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- **Read before spawn.** The source is resolved, contained, and byte-bounded inside the workspace queue before any process is created, so a queued query sees current bytes when its turn starts and an invalid source cannot leave an idle process pooled.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- **One pooled process per canonical workspace.** Instances are single-flighted per `(server id, canonical workspace target)`; a transport failure retries the read-only query once on a fresh process after awaiting disposal.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- **Per-workspace serialization.** One abortable queue per workspace serializes source-read/open/query/close lifecycles; distinct workspaces run in parallel, and a cancellation that fails to stop a server terminates only that instance.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- **Bounded teardown.** Graceful `shutdown`/`exit` escalates through the subprocess provider's managed-range termination procedure; quiescence is confirmed by awaiting that whole range, not by the termination request's outcome.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- **Execution-world pairing.** Servers launch through `ctx.subprocess` with `processId: null` (another machine or PID namespace must not monitor the harness), sources read through `ctx.fs`, and no `fs/observed` event is emitted — only the LSP result is model-visible.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
### Source map

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
| File | Role |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
|---|---|

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| [`src/index.ts`](src/index.ts) | Plugin entry: config schema, executable resolution, provider registration, process pooling |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| [`src/host.ts`](src/host.ts) | Workspace canonicalization and bounded source reads through `ctx.fs` |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| [`src/instance.ts`](src/instance.ts) | One server process: initialize handshake, serialized transient-open queries, bounded teardown |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| [`src/connection.ts`](src/connection.ts) | JSON-RPC endpoint: id correlation, outbound requests, inbound server requests, stderr cap |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| [`src/framing.ts`](src/framing.ts) | `Content-Length` framing and a bounded decoder |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| [`src/protocol.ts`](src/protocol.ts) | Wire-type subset: capabilities, locations, hover, text-document synchronization |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| [`src/translate.ts`](src/translate.ts) | Capability checks, UTF-16 negotiation, `Location`/`LocationLink`/hover normalization |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| [`src/abort.ts`](src/abort.ts) | Cancellation helpers fusing caller and disposal signals |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| — | No runtime invariant companion is published; process pools and per-workspace queues are private implementation state, and this provider publishes no independent lifecycle event stream or enumerable snapshot. |

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
### Protocol behavior

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
Initialization advertises UTF-16 positions, workspace folders and configuration, markdown/plaintext hover, and link support for definition and implementation, with no dynamic registration; the server's returned capabilities are authoritative. An omitted server `positionEncoding` defaults to `utf-16`; any other value fails the query. The client answers `workspace/configuration` from static config, accepts lifecycle bookkeeping requests, and rejects `workspace/applyEdit` — it never applies edits or runs commands. Navigation maps `Location` directly and `LocationLink` from `targetUri` plus `targetSelectionRange`; hover normalization accepts `MarkupContent` and `MarkedString` shapes, preserves string values, renders language-tagged values as fenced code, and joins arrays with one blank line. Missing results, malformed ranges or positions, and malformed hover encodings fail as structured `LSP_MALFORMED_RESPONSE` errors.

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
Read these pages when the package-level contract is not enough. They move from the shared navigation model to the seam and the tool.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
- [LSP navigation subsystem](../../../docs/subsystems/lsp.md) — operations, coordinates, requests and results, and `LspError` codes.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- [dsh-lsp](../lsp/README.md) — the seam this provider registers against.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- [dsh-tool-lsp](../tool-lsp/README.md) — the model-facing tool over the seam.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- [lsp group map](../README.md) — the three-package family and its related documentation.

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
Indirectly, through `dsh-tool-lsp`, which surfaces this provider's normalized results while this host contributes no prompt or schema itself.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
#### KV Cache effect

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
No direct invalidation; `dsh-tool-lsp` owns request-prefix changes.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
## Known Limitations and Deferred Work

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
<a id="known-limitations-and-deferred-work"></a>

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
These limits define when the provider is a poor fit or needs special operational care. They are current package constraints, not a task backlog.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
- **No confinement policy** — this package trusts the configured server and does not sandbox its process; a restricted deployment must supply appropriate process and filesystem providers or a same-world sandbox wrapper.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- **Transient-open compatibility floor** — servers whose synchronization omits open/close (or advertises `None`) are unsupported even if closed-document queries would work; the pinned TypeScript e2e establishes one compatibility floor, not a cross-language claim.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- **Per-server and per-workspace serialization latency** — parallel agents sharing one server and workspace queue behind one process; long-lived workspace processes consume memory until disposal.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- **A hard-killed harness orphans language servers** — `initialize.processId: null` removes server-side client-PID monitoring, so servers are cleaned only by graceful service disposal; a SIGKILL'd harness leaves them running until they exit on their own.

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
None.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
</details>

English | [中文](README.zh.md) | [Deutsch](README.de.md)
