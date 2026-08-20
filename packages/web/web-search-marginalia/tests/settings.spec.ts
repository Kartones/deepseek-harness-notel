import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Fiber } from '@deepseek-ai/cordis'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import WebRuntime from '@deepseek-ai/dsh-web'
import * as marginaliaPlugin from '@deepseek-ai/dsh-web-search-marginalia'
import { WEB_SEARCH_MARGINALIA_SETTINGS_NAMESPACE } from '@deepseek-ai/dsh-web-search-marginalia'

class MemorySettings extends SettingsProvider {
  doc: Record<string, unknown> = {}
  get writable(): boolean { return true }
  protected load(): Promise<Record<string, unknown>> { return Promise.resolve(structuredClone(this.doc)) }
  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.doc = { ...this.doc, [ns]: structuredClone(section) }
    return Promise.resolve()
  }
}

function jsonResponse(): Response {
  return new Response(JSON.stringify({ results: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
}

async function boot(): Promise<{ ctx: Context; settingsFiber: Fiber; pluginFiber: Fiber }> {
  const ctx = new Context()
  await ctx.plugin(WebRuntime, {})
  const settingsFiber = ctx.plugin(MemorySettings)
  await settingsFiber.await()
  const pluginFiber = ctx.plugin(marginaliaPlugin, { apiKey: 'entry-key', baseURL: 'https://entry.test' })
  await pluginFiber.await()
  return { ctx, settingsFiber, pluginFiber }
}

afterEach(() => { vi.restoreAllMocks() })

async function searchOnce(ctx: Context): Promise<string> {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(jsonResponse()))
  fetchSpy.mockClear()
  await ctx.web.search({ query: 'q' })
  return ((fetchSpy.mock.calls.at(-1)?.[0] ?? '') as URL).toString()
}

describe('web-search-marginalia settings section', () => {
  it('uses a stored endpoint on the next search without re-registering', async () => {
    const bench = await boot()
    expect(await searchOnce(bench.ctx)).toContain('https://entry.test')
    await bench.ctx.settings.update(WEB_SEARCH_MARGINALIA_SETTINGS_NAMESPACE, { baseURL: 'https://stored.test' })
    expect(await searchOnce(bench.ctx)).toContain('https://stored.test')
    await bench.ctx.fiber.dispose()
  })

  it('redacts literal keys and releases the namespace on unload', async () => {
    const bench = await boot()
    await bench.ctx.settings.update(WEB_SEARCH_MARGINALIA_SETTINGS_NAMESPACE, { apiKey: 'stored-secret' })
    const [descriptor] = bench.ctx.settings.describe({ redactSecrets: true }).filter(row => String(row.ns) === 'web-search-marginalia')
    expect(JSON.stringify(descriptor)).not.toContain('stored-secret')
    await bench.pluginFiber.dispose()
    expect(bench.ctx.settings.describe().map(row => String(row.ns))).not.toContain('web-search-marginalia')
    await bench.ctx.fiber.dispose()
  })

  it('falls back to the entry when settings detach', async () => {
    const bench = await boot()
    await bench.ctx.settings.update(WEB_SEARCH_MARGINALIA_SETTINGS_NAMESPACE, { baseURL: 'https://stored.test' })
    await bench.settingsFiber.dispose()
    expect(await searchOnce(bench.ctx)).toContain('https://entry.test')
    await bench.ctx.fiber.dispose()
  })
})
