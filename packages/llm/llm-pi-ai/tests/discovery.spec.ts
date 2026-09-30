import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { userAgent } from '@deepseek-ai/dsh-llm'
import * as LlmPiAi from '@deepseek-ai/dsh-llm-pi-ai'
import { getBuiltinModels } from '@earendil-works/pi-ai/providers/all'
import { discoverModels } from '../src/discovery.ts'

const servers: Server[] = []
/** Credential variables a test set, cleared so the next one starts unset. */
const touchedEnv: string[] = []

afterEach(async () => {
  // A no-op when the test never stubbed `fetch`; only 'probe key format'
  // below installs one.
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  for (const name of touchedEnv.splice(0)) Reflect.deleteProperty(process.env, name)
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))))
})

interface ListingServer {
  url: string
  paths: string[]
  headers: IncomingMessage['headers'][]
}

/**
 * A stand-in provider that answers one scripted `GET /models`. `chunks` writes
 * without a declared length, which is how a real streamed reply arrives.
 */
async function listingServer(behavior: {
  status?: number
  body?: string
  chunks?: string[]
  holdOpenMs?: number
  holdBeforeHeadersMs?: number
  location?: string
}): Promise<ListingServer> {
  const paths: string[] = []
  const headers: IncomingMessage['headers'][] = []
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    paths.push(request.url ?? '')
    headers.push(request.headers)
    if (behavior.holdBeforeHeadersMs !== undefined) {
      const timer = setTimeout(() => { response.end(behavior.body ?? '{}') }, behavior.holdBeforeHeadersMs)
      timer.unref()
      response.on('close', () => { clearTimeout(timer) })
      return
    }
    if (behavior.chunks !== undefined) {
      // No declared length: the ceiling has to hold on what is read.
      response.writeHead(behavior.status ?? 200, { 'content-type': 'application/json' })
      for (const chunk of behavior.chunks) response.write(chunk)
      if (behavior.holdOpenMs === undefined) { response.end(); return }
      // Left open so a caller's cancellation lands while the body is still
      // being read rather than after it completed.
      const timer = setTimeout(() => { response.end() }, behavior.holdOpenMs)
      timer.unref()
      response.on('close', () => { clearTimeout(timer) })
      return
    }
    const body = behavior.body ?? '{}'
    response.writeHead(behavior.status ?? 200, {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(body)),
      ...behavior.location === undefined ? {} : { location: behavior.location },
    })
    response.end(body)
  })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('no port')
  return { url: `http://127.0.0.1:${address.port}`, paths, headers }
}

/**
 * A stand-in router answering a model listing and a sibling `/endpoints`
 * capability listing independently — the InferenzQuelle shape: thin model
 * ids on one path, per-endpoint metadata on the other. A request to any path
 * ending in `/endpoints` takes the second behavior, defaulting to a 404;
 * everything else answers the model listing.
 */
async function routerServer(behavior: {
  models: string
  endpoints?: { status?: number; body?: string; holdOpenMs?: number; location?: string }
}): Promise<ListingServer> {
  const paths: string[] = []
  const headers: IncomingMessage['headers'][] = []
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    paths.push(request.url ?? '')
    headers.push(request.headers)
    if ((request.url ?? '').endsWith('/endpoints')) {
      const endpoints = behavior.endpoints ?? { status: 404 }
      if (endpoints.holdOpenMs !== undefined) {
        response.writeHead(endpoints.status ?? 200, { 'content-type': 'application/json' })
        // An unref'd hold: a client that aborts closes its socket and the
        // reply dies with it, so nothing outlives the test.
        const timer = setTimeout(() => { response.end(endpoints.body ?? '{}') }, endpoints.holdOpenMs)
        timer.unref()
        response.on('close', () => { clearTimeout(timer) })
        return
      }
      const body = endpoints.body ?? '{}'
      response.writeHead(endpoints.status ?? 200, {
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(body)),
        ...endpoints.location === undefined ? {} : { location: endpoints.location },
      })
      response.end(body)
      return
    }
    const body = behavior.models
    response.writeHead(200, {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(body)),
    })
    response.end(body)
  })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('no port')
  return { url: `http://127.0.0.1:${address.port}`, paths, headers }
}

/** A bare dormant mount: discovery is offered whether or not a route exists. */
async function harness(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(LlmPiAi, {})
  return ctx
}

describe('catalog-route model discovery', () => {
  it('answers from the installed registry, with capacities and no network call', async () => {
    const server = await listingServer({ body: JSON.stringify({ data: [{ id: 'from-the-endpoint' }] }) })
    const ctx = await harness()

    const models = await ctx.llm.discoverModels('llm-pi-ai', { provider: 'deepseek', baseURL: server.url })

    // pi-ai's own registry is the authority for its own providers, and it
    // carries what a listing endpoint would not disclose.
    expect(models.map(model => model.id).sort())
      .toEqual(getBuiltinModels('deepseek').map(model => model.id).sort())
    expect(models.every(model => (model.contextWindow ?? 0) > 0 && (model.maxTokens ?? 0) > 0)).toBe(true)
    expect(server.paths).toEqual([])
  })

  it('needs no endpoint for a route the catalog describes', async () => {
    const ctx = await harness()
    await expect(ctx.llm.discoverModels('llm-pi-ai', { provider: 'deepseek' })).resolves.not.toHaveLength(0)
  })

  it('says where a route the catalog does not describe must get its models', async () => {
    const ctx = await harness()
    await expect(ctx.llm.discoverModels('llm-pi-ai', { provider: 'acme-gateway' }))
      .rejects.toThrow(/ships no catalog for provider "acme-gateway".*set a baseURL/s)
    // A form that cleared the field says the same thing as one that never had it.
    await expect(ctx.llm.discoverModels('llm-pi-ai', { provider: 'acme-gateway', baseURL: '' }))
      .rejects.toThrow(/set a baseURL/)
    // The seam refuses a request naming neither, so the module's own guard for
    // that shape is only reachable by calling it directly.
    await expect(discoverModels({})).rejects.toThrow(/set a baseURL/)
  })
})

describe('draft-provider model discovery', () => {
  it('reads an OpenAI-compatible listing and keeps the capacities it discloses', async () => {
    const server = await listingServer({
      body: JSON.stringify({
        data: [
          { id: 'acme-large', display_name: 'Acme Large', context_length: 65_536, max_output_tokens: 4096 },
          { id: 'acme-camel', displayName: 'Acme Camel', contextWindow: 131_072, maxOutputTokens: 8192 },
          { id: 'acme-mixed', name: 'Acme Mixed', context_window: 32_768, maxTokens: 2048 },
          { id: 'acme-legacy', max_tokens: 1024 },
          { id: 'acme-small' },
        ],
      }),
    })
    const ctx = await harness()

    const models = await ctx.llm.discoverModels('llm-pi-ai', { baseURL: `${server.url}/v1`, apiKey: 'probe-key' })

    expect(models).toEqual([
      { id: 'acme-large', name: 'Acme Large', contextWindow: 65_536, maxTokens: 4096 },
      { id: 'acme-camel', name: 'Acme Camel', contextWindow: 131_072, maxTokens: 8192 },
      { id: 'acme-mixed', name: 'Acme Mixed', contextWindow: 32_768, maxTokens: 2048 },
      { id: 'acme-legacy', name: 'acme-legacy', maxTokens: 1024 },
      { id: 'acme-small', name: 'acme-small' },
    ])
    // 'acme-legacy' and 'acme-small' disclose no context window, so the thin
    // rows trigger the sibling-path capability probe — which this stand-in
    // answers with the same model listing, contributing nothing.
    expect(server.paths).toEqual(['/v1/models', '/endpoints'])
    expect(server.headers[0]?.authorization).toBe('Bearer probe-key')
    expect(server.headers[0]?.['user-agent']).toBe(userAgent())
  })

  it('reads an enriched models map using route ids and nested capacities', async () => {
    const server = await listingServer({
      body: JSON.stringify({
        models: {
          'lobechat-deepseek-chat': {
            id: 'deepseek/deepseek-v4-flash',
            name: 'DeepSeek V4 Flash',
            limit: { context: 1_048_576, output: 384_000 },
          },
          'bare-route': {},
          '': { id: 'nested-id', display_name: 'Nested fallback' },
          'malformed-route': null,
          'primitive-route': 'not a model record',
        },
      }),
    })
    const ctx = await harness()

    expect(await ctx.llm.discoverModels('llm-pi-ai', { baseURL: server.url })).toEqual([
      {
        id: 'lobechat-deepseek-chat',
        name: 'DeepSeek V4 Flash',
        contextWindow: 1_048_576,
        maxTokens: 384_000,
      },
      { id: 'bare-route', name: 'bare-route' },
      { id: 'nested-id', name: 'Nested fallback' },
    ])
  })

  it('uses Anthropic model-listing paths, headers, and capacity fields', async () => {
    const server = await listingServer({
      body: JSON.stringify({
        data: [
          {
            id: 'claude-sonnet',
            display_name: 'Claude Sonnet',
            max_input_tokens: 200_000,
            max_tokens: 64_000,
          },
        ],
      }),
    })
    const ctx = await harness()

    const rootModels = await ctx.llm.discoverModels('llm-pi-ai', {
      baseURL: server.url,
      api: 'anthropic-messages',
      apiKey: 'anthropic-key',
    })
    const versionedModels = await ctx.llm.discoverModels('llm-pi-ai', {
      baseURL: `${server.url}/v1`,
      api: 'anthropic-messages',
      apiKey: 'anthropic-key',
    })
    await ctx.llm.discoverModels('llm-pi-ai', {
      baseURL: server.url,
      api: 'anthropic-messages',
    })

    expect(rootModels).toEqual([
      { id: 'claude-sonnet', name: 'Claude Sonnet', contextWindow: 200_000, maxTokens: 64_000 },
    ])
    expect(versionedModels).toEqual(rootModels)
    expect(server.paths).toEqual([
      '/v1/models?limit=1000',
      '/v1/models?limit=1000',
      '/v1/models?limit=1000',
    ])
    expect(server.headers.map(headers => headers['x-api-key']))
      .toEqual(['anthropic-key', 'anthropic-key', undefined])
    expect(server.headers.map(headers => headers['anthropic-version']))
      .toEqual(['2023-06-01', '2023-06-01', '2023-06-01'])
    expect(server.headers.map(headers => headers.authorization)).toEqual([undefined, undefined, undefined])
    expect(server.headers.map(headers => headers['user-agent'])).toEqual([userAgent(), userAgent(), userAgent()])
  })

  it('prefers the standard data array when both supported formats are present', async () => {
    const server = await listingServer({
      body: JSON.stringify({
        data: [{ id: 'standard' }],
        models: { enriched: { name: 'Enriched' } },
      }),
    })
    const ctx = await harness()

    await expect(ctx.llm.discoverModels('llm-pi-ai', { baseURL: server.url }))
      .resolves.toEqual([{ id: 'standard', name: 'standard' }])
  })

  it('keeps a deployment path instead of resolving it away', async () => {
    const server = await listingServer({ body: JSON.stringify({ data: [{ id: 'm' }] }) })
    const ctx = await harness()

    await ctx.llm.discoverModels('llm-pi-ai', { baseURL: `${server.url}/openai/v1/` })

    expect(server.paths).toEqual(['/openai/v1/models', '/openai/endpoints'])
  })

  it('offers no credential when the draft names none', async () => {
    const server = await listingServer({ body: JSON.stringify({ data: [{ id: 'm' }] }) })
    const ctx = await harness()

    await ctx.llm.discoverModels('llm-pi-ai', { baseURL: server.url })

    expect(server.headers[0]?.authorization).toBeUndefined()
  })

  it('authenticates configured routes the draft cannot supply a key for', async () => {
    // What the Models page actually sends after a key is saved: the form holds
    // the redacted descriptor, so the draft names the route and the endpoint
    // and no credential at all. Interrogating unauthenticated would answer 401
    // and read as a wrong key.
    const server = await listingServer({ body: JSON.stringify({ data: [{ id: 'm' }] }) })
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    process.env['ACME_GATEWAY_KEY'] = 'stored-key'
    touchedEnv.push('ACME_GATEWAY_KEY')
    await ctx.plugin(LlmPiAi, {
      providers: {
        'acme-gateway': {
          apiKeyEnv: 'ACME_GATEWAY_KEY',
          api: 'openai-completions',
          baseURL: server.url,
          headers: { 'X-Company-Code': 'private-tenant' },
          models: [{ id: 'acme-large' }],
        },
        'plain-gateway': {
          apiKeyEnv: 'ACME_GATEWAY_KEY',
          api: 'openai-completions',
          baseURL: server.url,
          models: [{ id: 'plain-large' }],
        },
      },
    })

    await ctx.llm.discoverModels('llm-pi-ai', { provider: 'acme-gateway', baseURL: server.url })
    // A key typed into the form is the one being tested — possibly the
    // replacement for the stored one — so it wins without resolving the
    // missing stored credential, while the route's headers still apply.
    Reflect.deleteProperty(process.env, 'ACME_GATEWAY_KEY')
    await ctx.llm.discoverModels('llm-pi-ai', { provider: 'acme-gateway', baseURL: server.url, apiKey: 'typed' })
    // A route no profile declares yet is the create case: nothing is stored.
    await ctx.llm.discoverModels('llm-pi-ai', { provider: 'not-declared-yet', baseURL: server.url })
    // A configured route without deployment headers still contributes its
    // stored credential without inventing a header map.
    await ctx.llm.discoverModels('llm-pi-ai', { provider: 'plain-gateway', baseURL: server.url, apiKey: 'plain-typed' })

    // Each call probes `{root}/endpoints` after the thin listing, so every
    // request arrives twice — once listing models, once asking capabilities.
    expect(server.headers.map(headers => headers.authorization))
      .toEqual([
        'Bearer stored-key', 'Bearer stored-key',
        'Bearer typed', 'Bearer typed',
        undefined, undefined,
        'Bearer plain-typed', 'Bearer plain-typed',
      ])
    expect(server.headers.map(headers => headers['x-company-code']))
      .toEqual([
        'private-tenant', 'private-tenant',
        'private-tenant', 'private-tenant',
        undefined, undefined,
        undefined, undefined,
      ])
  })

  it('leaves a catalog route\'s credential unresolved, having never reached the network', async () => {
    // The catalog answers before any endpoint is asked, so a route whose
    // profile names a credential that is not set must still answer rather than
    // failing over a key the interrogation never needed.
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    Reflect.deleteProperty(process.env, 'ABSENT_FOR_DISCOVERY')
    await ctx.plugin(LlmPiAi, { providers: { deepseek: { apiKeyEnv: 'ABSENT_FOR_DISCOVERY' } } })

    await expect(ctx.llm.discoverModels('llm-pi-ai', { provider: 'deepseek' })).resolves.not.toHaveLength(0)
  })

  it('drops unusable rows rather than failing the whole listing', async () => {
    const server = await listingServer({
      body: JSON.stringify({
        data: [
          { id: 'good' },
          { id: '' },
          { name: 'no id at all' },
          null,
          { id: 'good' },
          { id: 'zero-capacity', context_length: 0, max_tokens: -1 },
        ],
      }),
    })
    const ctx = await harness()

    expect(await ctx.llm.discoverModels('llm-pi-ai', { baseURL: server.url }))
      .toEqual([{ id: 'good', name: 'good' }, { id: 'zero-capacity', name: 'zero-capacity' }])
  })

  it('points at the credential for a rejected one, and only then', async () => {
    const ctx = await harness()

    for (const status of [401, 403]) {
      const refused = await listingServer({ status, body: '{"error":"nope"}' })
      await expect(ctx.llm.discoverModels('llm-pi-ai', { baseURL: refused.url, apiKey: 'wrong' }))
        .rejects.toThrow(new RegExp(`answered ${status}; check the API key`))
    }

    // A server fault is not a credential problem, so it must not send the user
    // off to re-check a key that is fine.
    const broken = await listingServer({ status: 500, body: '{"error":"boom"}' })
    await expect(ctx.llm.discoverModels('llm-pi-ai', { baseURL: broken.url, apiKey: 'fine' }))
      .rejects.toThrow(/answered 500$/)
  })

  it('reports a reply that is not a model listing', async () => {
    const server = await listingServer({ body: '{"models":[]}' })
    const ctx = await harness()

    await expect(ctx.llm.discoverModels('llm-pi-ai', { baseURL: server.url }))
      .rejects.toThrow(/neither a "data" array nor a "models" object/)

    const broken = await listingServer({ body: 'not json at all' })
    await expect(ctx.llm.discoverModels('llm-pi-ai', { baseURL: broken.url }))
      .rejects.toThrow(/did not answer with JSON/)
  })

  it('refuses an oversized reply, whether its length is declared or streamed', async () => {
    const ctx = await harness()
    // Just over the four-megabyte ceiling, as one padded model row.
    const oversized = `{"data":[{"id":"m","pad":"${'x'.repeat(4 * 1024 * 1024)}"}]}`

    const declared = await listingServer({ body: oversized })
    await expect(ctx.llm.discoverModels('llm-pi-ai', { baseURL: declared.url }))
      .rejects.toThrow(/answered with more than 4194304 bytes/)

    // A streamed reply declares no length, so the ceiling has to hold on the
    // body the harness actually read.
    const streamed = await listingServer({ chunks: ['{"data":[{"id":"m","pad":"', 'x'.repeat(4 * 1024 * 1024), '"}]}'] })
    await expect(ctx.llm.discoverModels('llm-pi-ai', { baseURL: streamed.url }))
      .rejects.toThrow(/answered with more than 4194304 bytes/)
  })

  it('reports an unreachable endpoint instead of an empty catalog', async () => {
    const ctx = await harness()
    // Port 9 is the discard service: nothing accepts a connection there.
    await expect(ctx.llm.discoverModels('llm-pi-ai', { baseURL: 'http://127.0.0.1:9/v1' }))
      .rejects.toMatchObject({ code: 'DISCOVERY_FAILED' })
  })

  it('turns a stalled model listing into a bounded discovery failure', async () => {
    const nativeTimeout = AbortSignal.timeout.bind(AbortSignal)
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(timeoutMs => nativeTimeout(Math.min(timeoutMs, 25)))
    try {
      const server = await listingServer({ holdBeforeHeadersMs: 60_000 })
      const ctx = await harness()

      const result = ctx.llm.discoverModels('llm-pi-ai', { baseURL: `${server.url}/v1` })
      await expect(result).rejects.toMatchObject({ code: 'DISCOVERY_FAILED' })
      await expect(result).rejects.toThrow(/timed out after 10000 ms/)
      expect(server.paths).toEqual(['/v1/models'])

      const stalledBody = await listingServer({ chunks: ['{"data":['], holdOpenMs: 60_000 })
      const bodyResult = ctx.llm.discoverModels('llm-pi-ai', { baseURL: `${stalledBody.url}/v1` })
      await expect(bodyResult).rejects.toMatchObject({ code: 'DISCOVERY_FAILED' })
      await expect(bodyResult).rejects.toThrow(/timed out after 10000 ms/)
      expect(stalledBody.paths).toEqual(['/v1/models'])
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('does not follow model-list redirects with provider credentials', async () => {
    const server = await listingServer({
      status: 302,
      body: '',
      location: '/redirect-target',
    })
    const ctx = await harness()

    await expect(ctx.llm.discoverModels('llm-pi-ai', { baseURL: `${server.url}/v1`, apiKey: 'probe-key' }))
      .rejects.toMatchObject({ code: 'DISCOVERY_FAILED' })
    expect(server.paths).toEqual(['/v1/models'])
    expect(server.headers[0]?.authorization).toBe('Bearer probe-key')
  })

  it.each(['azure-openai-responses', 'openai-codex-responses', 'google-generative-ai'])(
    'says it cannot interrogate %s rather than guessing a shape',
    async (api) => {
      // Azure authenticates with an `api-key` header and an `api-version`
      // query despite its OpenAI lineage, and Codex uses OAuth; guessing at
      // either would report an auth failure as a provider with no models.
      const ctx = await harness()
      await expect(ctx.llm.discoverModels('llm-pi-ai', { baseURL: 'https://gateway.example/v1', api }))
        .rejects.toMatchObject({ code: 'DISCOVERY_UNSUPPORTED' })
    },
  )

  it('reports cancellation during the body read as an abort, not a raw reason', async () => {
    const ctx = await harness()
    const controller = new AbortController()
    const bodyRead = Promise.withResolvers<undefined>()
    vi.stubGlobal('fetch', async (_url: string | URL, init?: RequestInit) => {
      const signal = init?.signal
      if (signal === undefined || signal === null) throw new Error('expected a discovery signal')
      return new Response(new ReadableStream<Uint8Array>({
        pull(stream) {
          bodyRead.resolve(undefined)
          return new Promise<void>((resolve) => {
            signal.addEventListener('abort', () => {
              stream.error(signal.reason)
              resolve()
            }, { once: true })
          })
        },
      }))
    })
    const probe = ctx.llm.discoverModels('llm-pi-ai', {
      baseURL: 'https://slow.example/v1',
    }, controller.signal)
    await bodyRead.promise
    controller.abort('test cancellation')

    await expect(probe).rejects.toMatchObject({ code: 'ABORTED' })
  })

  it('honors caller cancellation', async () => {
    const ctx = await harness()
    const aborted = AbortSignal.abort('test cancellation')
    await expect(ctx.llm.discoverModels('llm-pi-ai', {
      baseURL: 'http://127.0.0.1:9/v1',
    }, aborted)).rejects.toMatchObject({ code: 'ABORTED' })
  })

  it('is offered for the namespace, and refuses one it does not serve', async () => {
    const ctx = await harness()

    await expect(ctx.llm.discoverModels('llm-pi-ai', { provider: 'openai' })).resolves.not.toHaveLength(0)
    await expect(ctx.llm.discoverModels('llm-deepseek', { baseURL: 'https://api.deepseek.com' }))
      .rejects.toMatchObject({ code: 'NO_DISCOVERY' })
    await expect(ctx.llm.discoverModels('llm-pi-ai', { baseURL: '' }))
      .rejects.toMatchObject({ code: 'INVALID_DISCOVERY' })
  })

  it('withdraws the offer when the plugin unloads', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    const fiber = await ctx.plugin(LlmPiAi, {})
    await expect(ctx.llm.discoverModels('llm-pi-ai', { provider: 'openai' })).resolves.not.toHaveLength(0)

    await fiber.dispose()

    await expect(ctx.llm.discoverModels('llm-pi-ai', { provider: 'openai' }))
      .rejects.toMatchObject({ code: 'NO_DISCOVERY' })
  })
})

describe('probe key format', () => {
  it('reports an illegal probe key as a credential fault, not an unreachable endpoint', async () => {
    await expect(discoverModels({
      baseURL: 'https://acme.test',
      api: 'openai-completions',
      apiKey: 'sk-\u{1F600}',
    })).rejects.toMatchObject({ code: 'INVALID_CREDENTIAL' })
  })

  it('reports a blank probe key as a credential fault too', async () => {
    // The Models page omits `apiKey` entirely for a cleared field rather than
    // sending '', so this pins the contract for every other caller: a supplied
    // key is judged, and only an absent one probes unauthenticated. '' means
    // "I have a key" and is answered as the empty key it is.
    await expect(discoverModels({
      baseURL: 'https://acme.test',
      api: 'openai-completions',
      apiKey: '',
    })).rejects.toMatchObject({ code: 'INVALID_CREDENTIAL' })
  })

  it('leaves a probe with no key unauthenticated', async () => {
    // The file's other cases capture headers through a real local HTTP server
    // (`listingServer`); this one has no route or stored key to resolve, so
    // the smallest real double is a `fetch` stub, scoped to this test and
    // unstubbed by the shared `afterEach` above.
    const requests: RequestInit[] = []
    vi.stubGlobal('fetch', async (_url: string | URL, init?: RequestInit) => {
      requests.push(init ?? {})
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    await discoverModels({ baseURL: 'https://acme.test', api: 'openai-completions' })

    const headers = new Headers(requests[0]?.headers)
    expect(headers.has('authorization')).toBe(false)
  })
})

/**
 * Replies recorded from live endpoints on 2026-09-02, plus the reply
 * Anthropic's List Models reference documents. Each file keeps the reply's
 * top-level fields and entry objects verbatim; only a recorded entry list is
 * cut down to the named entries so the archive stays small.
 */
const RECORDED_LISTINGS = [
  {
    name: 'OpenRouter GET /api/v1/models',
    file: 'openrouter-2026-09-02.json',
    api: 'openai-completions',
    models: [
      { id: 'anthropic/claude-fable-5.1', name: 'Anthropic: Claude Fable 5.1', contextWindow: 1_000_000, maxTokens: 128_000 },
      // The router's own aggregate route reports no completion cap.
      { id: 'openrouter/auto-beta', name: 'Auto Router (Beta)', contextWindow: 2_000_000 },
      { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek: DeepSeek V4 Flash 0423', contextWindow: 1_048_576, maxTokens: 384_000 },
    ],
  },
  {
    name: 'the models.dev anthropic provider object',
    file: 'models-dev-anthropic-2026-09-02.json',
    api: 'openai-completions',
    models: [
      { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', contextWindow: 1_000_000, maxTokens: 128_000 },
      { id: 'claude-fable-5-1', name: 'Claude Fable 5.1', contextWindow: 1_000_000, maxTokens: 128_000 },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5 (latest)', contextWindow: 200_000, maxTokens: 64_000 },
    ],
  },
  {
    name: 'DeepSeek GET /models',
    file: 'deepseek-2026-09-02.json',
    api: 'openai-completions',
    models: [
      { id: 'deepseek-v4-flash', name: 'deepseek-v4-flash' },
      { id: 'deepseek-v4-pro', name: 'deepseek-v4-pro' },
      { id: 'deepseek-v4-flash-vision-exp', name: 'deepseek-v4-flash-vision-exp' },
    ],
  },
  {
    name: "Anthropic's documented GET /v1/models example",
    file: 'anthropic-reference-example.json',
    api: 'anthropic-messages',
    // The reference example fills both capacities with 0, which is not a
    // usable capacity, so the row carries the name alone.
    models: [{ id: 'claude-opus-5', name: 'Claude Opus 5' }],
  },
]

describe('recorded provider listings', () => {
  it.each(RECORDED_LISTINGS)('reads $name as recorded', async ({ file, api, models }) => {
    const body = await readFile(new URL(`./fixtures/model-listings/${file}`, import.meta.url), 'utf8')
    const server = await listingServer({ body })
    const ctx = await harness()

    await expect(ctx.llm.discoverModels('llm-pi-ai', { baseURL: server.url, api })).resolves.toEqual(models)
  })
})

describe('endpoint capability probe', () => {
  const endpointsBody = (endpoints: readonly unknown[]): string => JSON.stringify({ endpoints })

  it('enriches a thin listing from the sibling endpoints inventory', async () => {
    const server = await routerServer({
      models: JSON.stringify({
        data: [
          { id: 'qwen-27b' },
          { id: 'gemma-26b' },
          { id: 'granite-7b' },
          { id: 'cap-only' },
          { id: 'no-capability' },
        ],
      }),
      endpoints: {
        body: endpointsBody([
          { name: 'uranus', model: 'qwen-27b', healthy: true, n_ctx: 131_072, slots_idle: 1, max_tokens_default: 16_384, max_tokens_cap: 32_768 },
          { name: 'phobos', model: 'gemma-26b', healthy: true, n_ctx: 262_144, slots_idle: 2, supports_vision: true, max_tokens_default: 0, max_tokens_cap: 8192 },
          // max_tokens_default alone is not a generation cap.
          { name: 'venus', model: 'granite-7b', healthy: true, n_ctx: 131_072, slots_idle: 2, max_tokens_default: 8192, max_tokens_cap: 0 },
          { model: 'cap-only', healthy: true, n_ctx: 0, max_tokens_cap: 512 },
          { model: 'no-capability', healthy: true, n_ctx: 0, max_tokens_cap: 0 },
          null,
          [],
          { healthy: true, n_ctx: 999_999 },
        ]),
      },
    })
    const ctx = await harness()

    const models = await ctx.llm.discoverModels('llm-pi-ai', { baseURL: `${server.url}/v1`, apiKey: 'probe-key' })

    expect(models).toEqual([
      { id: 'qwen-27b', name: 'qwen-27b', contextWindow: 131_072, maxTokens: 32_768 },
      { id: 'gemma-26b', name: 'gemma-26b', contextWindow: 262_144, maxTokens: 8192 },
      { id: 'granite-7b', name: 'granite-7b', contextWindow: 131_072 },
      { id: 'cap-only', name: 'cap-only', maxTokens: 512 },
      { id: 'no-capability', name: 'no-capability' },
    ])
    expect(server.paths).toEqual(['/v1/models', '/endpoints'])
    // The probe authenticates exactly like the listing it enriches.
    expect(server.headers[1]?.authorization).toBe('Bearer probe-key')
  })

  it('uses stable aggregate capacities across healthy endpoints', async () => {
    const server = await routerServer({
      models: JSON.stringify({ data: [{ id: 'gemma-26b' }, { id: 'granite-7b' }] }),
      endpoints: {
        body: endpointsBody([
          // Slot load changes per request; the largest healthy context is stable.
          { name: 'eris', model: 'gemma-26b', healthy: true, n_ctx: 131_072, slots_idle: 9, max_tokens_cap: 16_384 },
          { name: 'phobos', model: 'gemma-26b', healthy: true, n_ctx: 262_144, slots_idle: 0, max_tokens_cap: 8192 },
          { name: 'hydra', model: 'gemma-26b', healthy: true, n_ctx: 32_768, slots_idle: 1, max_tokens_cap: 8192 },
          { name: 'styx', model: 'granite-7b', healthy: true, n_ctx: 65_536, slots_idle: 0, max_tokens_cap: 8192 },
          { name: 'venus', model: 'granite-7b', healthy: true, n_ctx: 131_072, slots_idle: 1, max_tokens_cap: 4096 },
        ]),
      },
    })
    const ctx = await harness()

    await expect(ctx.llm.discoverModels('llm-pi-ai', { baseURL: `${server.url}/v1` }))
      .resolves.toEqual([
        { id: 'gemma-26b', name: 'gemma-26b', contextWindow: 262_144, maxTokens: 8192 },
        { id: 'granite-7b', name: 'granite-7b', contextWindow: 131_072, maxTokens: 4096 },
      ])
  })

  it('ignores endpoints the router cannot serve a request through', async () => {
    const server = await routerServer({
      models: JSON.stringify({ data: [{ id: 'qwen-27b' }, { id: 'granite-7b' }, { id: 'orphan' }] }),
      endpoints: {
        body: endpointsBody([
          { name: 'offline', model: 'qwen-27b', healthy: false, n_ctx: 262_144, slots_idle: 9 },
          { name: 'unconfigured', model: 'qwen-27b', healthy: true, n_ctx: 0, slots_idle: 3 },
          { name: 'serving', model: 'qwen-27b', healthy: true, n_ctx: 131_072, slots_idle: 1 },
          // A model the listing never named contributes nothing.
          { name: 'extra', model: 'unlisted-model', healthy: true, n_ctx: 999_999, slots_idle: 4 },
        ]),
      },
    })
    const ctx = await harness()

    await expect(ctx.llm.discoverModels('llm-pi-ai', { baseURL: `${server.url}/v1` }))
      .resolves.toEqual([
        { id: 'qwen-27b', name: 'qwen-27b', contextWindow: 131_072 },
        { id: 'granite-7b', name: 'granite-7b' },
        { id: 'orphan', name: 'orphan' },
      ])
  })

  it('keeps capacities the listing itself disclosed', async () => {
    const server = await routerServer({
      models: JSON.stringify({ data: [{ id: 'm', max_tokens: 1024 }] }),
      endpoints: { body: endpointsBody([{ model: 'm', healthy: true, n_ctx: 49_152, max_tokens_default: 8192, max_tokens_cap: 8192 }]) },
    })
    const ctx = await harness()

    // The endpoint's output default is not an output cap; the listing's own
    // max_tokens field remains authoritative while the probe fills context.
    await expect(ctx.llm.discoverModels('llm-pi-ai', { baseURL: `${server.url}/v1` }))
      .resolves.toEqual([{ id: 'm', name: 'm', contextWindow: 49_152, maxTokens: 1024 }])
  })

  it('answers the thin listing when the capability path is absent or unreadable', async () => {
    const ctx = await harness()

    // No /endpoints route at all — the common gateway case.
    const plain = await listingServer({ body: JSON.stringify({ data: [{ id: 'm' }] }) })
    await expect(ctx.llm.discoverModels('llm-pi-ai', { baseURL: `${plain.url}/v1` }))
      .resolves.toEqual([{ id: 'm', name: 'm' }])
    expect(plain.paths).toEqual(['/v1/models', '/endpoints'])

    const refused = await routerServer({
      models: JSON.stringify({ data: [{ id: 'm' }] }),
      endpoints: { status: 403, body: '{"error":"admin only"}' },
    })
    await expect(ctx.llm.discoverModels('llm-pi-ai', { baseURL: `${refused.url}/v1` }))
      .resolves.toEqual([{ id: 'm', name: 'm' }])

    const garbled = await routerServer({
      models: JSON.stringify({ data: [{ id: 'm' }] }),
      endpoints: { body: 'not json at all' },
    })
    await expect(ctx.llm.discoverModels('llm-pi-ai', { baseURL: `${garbled.url}/v1` }))
      .resolves.toEqual([{ id: 'm', name: 'm' }])

    const noHealthyEndpoints = await routerServer({
      models: JSON.stringify({ data: [{ id: 'm' }] }),
      endpoints: { body: endpointsBody([{ model: 'm', healthy: false, n_ctx: 65_536 }]) },
    })
    await expect(ctx.llm.discoverModels('llm-pi-ai', { baseURL: `${noHealthyEndpoints.url}/v1` }))
      .resolves.toEqual([{ id: 'm', name: 'm' }])
  })

  it('never lets a stalled capability reply stall the fetch', async () => {
    const server = await routerServer({
      models: JSON.stringify({ data: [{ id: 'm' }] }),
      endpoints: { holdOpenMs: 60_000 },
    })
    const ctx = await harness()

    await expect(ctx.llm.discoverModels('llm-pi-ai', { baseURL: `${server.url}/v1` }))
      .resolves.toEqual([{ id: 'm', name: 'm' }])
    expect(server.paths).toEqual(['/v1/models', '/endpoints'])
  })

  it('keeps caller cancellation distinct from an optional-probe failure', async () => {
    const server = await routerServer({
      models: JSON.stringify({ data: [{ id: 'm' }] }),
      endpoints: { holdOpenMs: 60_000 },
    })
    const ctx = await harness()
    const controller = new AbortController()
    const result = ctx.llm.discoverModels('llm-pi-ai', { baseURL: `${server.url}/v1` }, controller.signal)

    await vi.waitFor(() => {
      expect(server.paths).toEqual(['/v1/models', '/endpoints'])
    })
    controller.abort('caller cancelled')
    await expect(result).rejects.toMatchObject({ code: 'ABORTED' })
  })

  it('refuses to follow a redirect off the configured router', async () => {
    const server = await routerServer({
      models: JSON.stringify({ data: [{ id: 'm' }] }),
      endpoints: { status: 302, body: '', location: 'http://127.0.0.1/redirect-target' },
    })
    const ctx = await harness()

    // redirect: 'error' turns the 302 into a fetch rejection the probe treats
    // like any other failure — and no second hop ever happens.
    await expect(ctx.llm.discoverModels('llm-pi-ai', { baseURL: `${server.url}/v1` }))
      .resolves.toEqual([{ id: 'm', name: 'm' }])
    expect(server.paths).toEqual(['/v1/models', '/endpoints'])
  })

  it('fills a missing output cap even when the listing already gives context', async () => {
    const server = await routerServer({
      models: JSON.stringify({ data: [{ id: 'm', context_length: 65_536 }] }),
      endpoints: { body: endpointsBody([{ model: 'm', healthy: true, n_ctx: 131_072, slots_idle: 1, max_tokens_cap: 4096 }]) },
    })
    const ctx = await harness()

    await expect(ctx.llm.discoverModels('llm-pi-ai', { baseURL: `${server.url}/v1` }))
      .resolves.toEqual([{ id: 'm', name: 'm', contextWindow: 65_536, maxTokens: 4096 }])
    expect(server.paths).toEqual(['/v1/models', '/endpoints'])
  })

  it('skips the probe when every listed model discloses both capacities', async () => {
    const server = await routerServer({
      models: JSON.stringify({ data: [{ id: 'm', context_length: 65_536, max_tokens: 2048 }] }),
      endpoints: { body: endpointsBody([{ model: 'm', healthy: true, n_ctx: 1, slots_idle: 1 }]) },
    })
    const ctx = await harness()

    await expect(ctx.llm.discoverModels('llm-pi-ai', { baseURL: `${server.url}/v1` }))
      .resolves.toEqual([{ id: 'm', name: 'm', contextWindow: 65_536, maxTokens: 2048 }])
    expect(server.paths).toEqual(['/v1/models'])
  })
})
