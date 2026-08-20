import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import WebRuntime from '@deepseek-ai/dsh-web'
import {
  MarginaliaSearchProvider,
  MARGINALIA_PROVIDER_ID,
} from '@deepseek-ai/dsh-web-search-marginalia'
import * as marginaliaPlugin from '@deepseek-ai/dsh-web-search-marginalia'
import { mapMarginaliaResponse } from '../src/provider.ts'
import type { MarginaliaSearchProviderOptions } from '@deepseek-ai/dsh-web-search-marginalia'

const provider = (options: MarginaliaSearchProviderOptions): MarginaliaSearchProvider =>
  new MarginaliaSearchProvider(() => options)

const options: MarginaliaSearchProviderOptions = {
  apiKey: 'marginalia-key',
  baseURL: 'https://api.marginalia.test',
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })
}

const response = { results: [{ url: 'https://a.test', title: 'A', description: 'excerpt' }] }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('mapMarginaliaResponse', () => {
  it('maps populated response items', () => {
    expect(mapMarginaliaResponse({
      results: [
        { url: 'https://a.test', title: 'A', description: 'excerpt' },
        { url: 'https://b.test', description: '' },
        { url: '' },
        {},
      ],
    })).toEqual({
      sources: [{ url: 'https://a.test', title: 'A', snippet: 'excerpt' }, { url: 'https://b.test' }],
      truncated: false,
    })
  })

  it('accepts an empty result list and ignores unknown fields', () => {
    expect(mapMarginaliaResponse({ results: [] })).toEqual({ sources: [], truncated: false })
    expect(mapMarginaliaResponse({ results: [{ url: 'https://a.test', ignored: true } as never] })).toEqual({
      sources: [{ url: 'https://a.test' }], truncated: false,
    })
  })

  it('rejects a missing or non-array result list', () => {
    expect(() => mapMarginaliaResponse({})).toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
    expect(() => mapMarginaliaResponse({ results: {} as never })).toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })
})

describe('MarginaliaSearchProvider availability', () => {
  it('requires a key source and parseable endpoint', () => {
    expect(provider({ ...options, apiKey: '' }).available()).toBe(false)
    expect(provider(options).available()).toBe(true)
    expect(provider({ ...options, apiKey: '', resolveApiKey: async () => 'key' }).available()).toBe(true)
    expect(provider({ ...options, baseURL: 'not a URL' }).available()).toBe(false)
  })
})

describe('MarginaliaSearchProvider requests', () => {
  it('records a secret-free GET request before dispatch', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(response))
    const recordRequest = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await provider({ ...options, apiKey: '', resolveApiKey: async () => 'resolved-key', recordRequest }).search({ query: 'hello world', maxResults: 8 })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
    expect(String(url)).toBe('https://api.marginalia.test/search?query=hello+world&count=8')
    expect(init).toMatchObject({ method: 'GET', redirect: 'error' })
    expect((init.headers as Record<string, string>)['API-Key']).toBe('resolved-key')
    expect(recordRequest).toHaveBeenCalledWith({ endpoint: 'https://api.marginalia.test/search', query: 'hello world', count: 8 })
    expect(JSON.stringify(recordRequest.mock.calls[0]?.[0])).not.toContain('resolved-key')
    expect(recordRequest.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0] ?? 0)
  })

  it('forwards signal, domain count, and clamps request count', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(response))
    const recordRequest = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const signal = new AbortController().signal
    await provider({ ...options, resultsPerDomain: 2, recordRequest }).search({ query: 'q', maxResults: 101 }, signal)
    await provider(options).search({ query: 'q', maxResults: 0 })
    await provider(options).search({ query: 'q' })
    expect(String(fetchMock.mock.calls[0]?.[0] as URL)).toContain('count=100&dc=2')
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).signal).toBe(signal)
    expect(recordRequest).toHaveBeenCalledWith({ endpoint: 'https://api.marginalia.test/search', query: 'q', count: 100, resultsPerDomain: 2 })
    expect(String(fetchMock.mock.calls[1]?.[0] as URL)).toContain('count=1')
    expect(String(fetchMock.mock.calls[2]?.[0] as URL)).not.toContain('count=')
  })

  it('uses public only when explicitly configured', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(response))
    vi.stubGlobal('fetch', fetchMock)
    await provider({ ...options, apiKey: 'public' }).search({ query: 'q' })
    expect(((fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>)['API-Key']).toBe('public')
    await expect(provider({ ...options, apiKey: '' }).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CREDENTIAL_MISSING' }))
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('snapshots settings before credential resolution', async () => {
    const before = { ...options, apiKey: '', baseURL: 'https://before.test' }
    const after = { ...options, apiKey: '', baseURL: 'https://after.test' }
    let current = before
    let commit = () => {}
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(response))
    vi.stubGlobal('fetch', fetchMock)
    const search = new MarginaliaSearchProvider(() => ({ ...current, resolveApiKey: () => new Promise<string>((resolve) => {
      commit = () => { current = after; resolve('before-key') }
    }) })).search({ query: 'q' })
    await vi.waitFor(() => { expect(typeof commit).toBe('function') })
    commit()
    await search
    expect(String(fetchMock.mock.calls[0]?.[0] as URL)).toContain('https://before.test/search')
    expect(((fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>)['API-Key']).toBe('before-key')
  })
})

describe('MarginaliaSearchProvider errors', () => {
  it('does not resolve or dispatch an already aborted call', async () => {
    const resolveApiKey = vi.fn(async () => 'key')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    controller.abort()
    await expect(provider({ ...options, apiKey: '', resolveApiKey }).search({ query: 'q' }, controller.signal))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_ABORTED' }))
    expect(resolveApiKey).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('aborts an uncooperative credential resolver', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const search = provider({ ...options, apiKey: '', resolveApiKey: () => new Promise<string>(() => {}) }).search({ query: 'q' }, controller.signal)
    controller.abort()
    await expect(search).rejects.toThrow(expect.objectContaining({ code: 'WEB_ABORTED' }))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps resolver, fetch, response, and parse errors', async () => {
    const controller = new AbortController()
    await expect(provider({ ...options, apiKey: '', resolveApiKey: () => Promise.reject(new Error('bad credential')) }).search({ query: 'q' }, controller.signal))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))))
    await expect(provider(options).search({ query: 'q' })).rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, { status: 503 })))
    await expect(provider(options).search({ query: 'q' })).rejects.toThrow(/shared public development key/)
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, { status: 500 })))
    await expect(provider(options).search({ query: 'q' })).rejects.toThrow('Marginalia search API error (HTTP 500)')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad json', { status: 200 })))
    await expect(provider(options).search({ query: 'q' })).rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})))
    await expect(provider(options).search({ query: 'q' })).rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })

  it('maps fetch and body parse aborts', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new DOMException('aborted', 'AbortError'))))
    await expect(provider(options).search({ query: 'q' })).rejects.toThrow(expect.objectContaining({ code: 'WEB_ABORTED' }))
    const body = { ok: true, status: 200, json: () => Promise.reject(new DOMException('aborted', 'AbortError')) }
    vi.stubGlobal('fetch', vi.fn(async () => body as unknown as Response))
    await expect(provider(options).search({ query: 'q' })).rejects.toThrow(expect.objectContaining({ code: 'WEB_ABORTED' }))
  })

  it('handles resolver settlement and synchronous cancellation', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(response))
    vi.stubGlobal('fetch', fetchMock)
    const active = new AbortController()
    await provider({ ...options, apiKey: '', resolveApiKey: async () => 'resolved-key' }).search({ query: 'q' }, active.signal)
    const cancelled = new AbortController()
    await expect(provider({
      ...options,
      apiKey: '',
      resolveApiKey: () => {
        cancelled.abort()
        return Promise.resolve('unused-key')
      },
    }).search({ query: 'q' }, cancelled.signal)).rejects.toThrow(expect.objectContaining({ code: 'WEB_ABORTED' }))
  })
})

describe('web-search-marginalia plugin registration', () => {
  it('registers and disposes the provider', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(response)))
    const ctx = new Context()
    await ctx.plugin(WebRuntime, { searchProvider: MARGINALIA_PROVIDER_ID })
    const fiber = await ctx.plugin(marginaliaPlugin, { apiKey: 'key', resultsPerDomain: 2 })
    await expect(ctx.web.search({ query: 'q' })).resolves.toMatchObject({ truncated: false })
    await fiber.dispose()
    await expect(ctx.web.search({ query: 'q' })).rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CONFIGURED_MISSING' }))
    await ctx.fiber.dispose()
  })

  it('rejects invalid domain limits and retains namespace plugin exports', async () => {
    const ctx = new Context()
    await ctx.plugin(WebRuntime, { searchProvider: MARGINALIA_PROVIDER_ID })
    await expect(ctx.plugin(marginaliaPlugin, { apiKey: 'key', resultsPerDomain: 0 })).rejects.toThrow(/resultsPerDomain expected number >= 1/)
    await expect(ctx.plugin(marginaliaPlugin, { apiKey: 'key', resultsPerDomain: 101 })).rejects.toThrow(/resultsPerDomain expected number <= 100/)
    expect('default' in marginaliaPlugin).toBe(false)
    const loader = Object.create(Loader.prototype) as Loader
    expect(loader.unwrapExports(marginaliaPlugin)).toBe(marginaliaPlugin)
    await ctx.fiber.dispose()
  })

  it('uses environment and rotated stored credentials', async () => {
    const previous = process.env.MARGINALIA_API_KEY
    process.env.MARGINALIA_API_KEY = 'env-key'
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(response))
    vi.stubGlobal('fetch', fetchMock)
    const ctx = new Context()
    try {
      await ctx.plugin(WebRuntime, { searchProvider: MARGINALIA_PROVIDER_ID })
      marginaliaPlugin.apply(ctx, {})
      await ctx.web.search({ query: 'env' })
      expect(((fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>)['API-Key']).toBe('env-key')
      await ctx.fiber.dispose()
      delete process.env.MARGINALIA_API_KEY
      const dir = await mkdtemp(join(tmpdir(), 'dsh-marginalia-'))
      const stored = new Context()
      try {
        await stored.plugin(WebRuntime, { searchProvider: MARGINALIA_PROVIDER_ID })
        await stored.plugin(LocalCredentialProvider, { path: join(dir, '.credentials.yaml'), watch: false })
        await stored.plugin(marginaliaPlugin, {})
        const ref = credentialRef('MARGINALIA_API_KEY')
        await stored.credentials.set(ref, 'stored-key')
        await stored.web.search({ query: 'stored' })
        await stored.credentials.set(ref, 'rotated-key')
        await stored.web.search({ query: 'rotated' })
        expect(fetchMock.mock.calls.slice(1).map(([, init]) => ((init as RequestInit).headers as Record<string, string>)['API-Key'])).toEqual(['stored-key', 'rotated-key'])
      } finally {
        await stored.fiber.dispose()
        await rm(dir, { recursive: true, force: true })
      }
    } finally {
      if (previous === undefined) delete process.env.MARGINALIA_API_KEY
      else process.env.MARGINALIA_API_KEY = previous
    }
  })

  it('reports an actionable missing credential error', async () => {
    const previous = process.env.MARGINALIA_API_KEY
    delete process.env.MARGINALIA_API_KEY
    const ctx = new Context()
    try {
      await ctx.plugin(WebRuntime, { searchProvider: MARGINALIA_PROVIDER_ID })
      await ctx.plugin(marginaliaPlugin, {})
      await expect(ctx.web.search({ query: 'q' })).rejects.toThrow(/contact@marginalia-search\.com.*apiKey: public/s)
    } finally {
      await ctx.fiber.dispose()
      if (previous !== undefined) process.env.MARGINALIA_API_KEY = previous
    }
  })
})
