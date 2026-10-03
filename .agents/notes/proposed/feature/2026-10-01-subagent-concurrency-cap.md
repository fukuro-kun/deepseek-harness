# Agent Note: Breadth cap on concurrent continuable subagents
English | [中文](2026-10-01-subagent-concurrency-cap.zh.md) | [Deutsch](2026-10-01-subagent-concurrency-cap.de.md)

Status: proposed


## Problem

A deployment on a small self-hosted inference fleet cannot express how many subagents may run at once. The shipped agent preset mounts `tool-subagent` with `backgroundMode: continuable`, so each delegated child becomes a persistent agent owning its own turn loop — every running child is a concurrent LLM request stream. None of the existing caps bound that breadth: `agent-loop.maxParallelToolCalls` only covers calls in flight inside the spawning step and a continuable delegation returns its durable id immediately; `jobs-local.maxConcurrentJobsPerOwner` covers only the one-shot `jobId` background path; `tool-subagent.maxDepth` limits nesting depth, not sibling count. A fleet with N strong endpoints cannot keep a session under N concurrent requests, and instruction-file rules are soft enforcement a model may ignore.

## Proposal

Add a per-parent breadth cap to subagent delegation:

- New optional `tool-subagent` config field `maxConcurrentChildren` (unset preserves today's behavior).
- Enforcement at the continuable-admission boundary: when the calling parent already has that many live children, the `subagent`/`subagent_fork` call fails with a model-facing tool error naming the cap and the occupying children, so the model can wait for a completion notice or steer an existing child instead of retrying blindly.
- The count covers all live children of the parent regardless of how they were started; foreground delegations additionally keep their existing per-step `maxParallelToolCalls` accounting.
- `maxDepth` stays orthogonal: depth limits nesting, breadth limits siblings.

## Alternatives considered

- **`agent-loop.maxParallelToolCalls`**: bounds parallel-safe calls in flight per step; a continuable call returns immediately, so it cannot bound running children, and lowering it serializes ordinary parallel file reads.
- **`jobs-local.maxConcurrentJobsPerOwner`**: applies only to the one-shot background `jobId` path; continuable children are persistent agents, not jobs.
- **`tool-subagent.maxDepth`**: orthogonal — depth does not bound breadth.
- **Instruction-file rules** (`~/.dsh/AGENTS.md`): free and already in place as the interim measure, but soft enforcement dependent on model compliance.
- **A semaphore inside the `llm` service**: would cap all in-flight requests including unrelated concurrent sessions and hides the delegation semantics from the model; refusing at the delegation boundary produces a model-readable error instead of silent queuing.

## Acceptance criteria

- With `maxConcurrentChildren: 2`, a third live delegation from the same parent returns a tool error naming the cap and the running children; it succeeds after one child settles.
- With the field unset, behavior is identical to today.
- The cap applies to both `spawn` and `fork` providers; `maxDepth` semantics unchanged.
- Specs cover: the refusal error text, a settling child freeing a slot, children of different parents counted independently, and interaction with the depth limit.

## Risks

- A model that retries the refusal in a loop burns requests; the error message should name the occupying children so the model can `send_message` or wait for the completion notice instead.
- "Live" must agree with activation teardown: a suspended or resuming child session must not wedge the count, and a failed start must release its slot.
- If upstream later ships a different breadth mechanism, this configuration must reconcile with it.
