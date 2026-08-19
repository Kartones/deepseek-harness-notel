import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import SessionStore from '@deepseek-ai/dsh-session'
import { SessionTelemetryBackend } from '@deepseek-ai/dsh-session-telemetry'
import DisabledSessionTelemetryBackend from '../src/index.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

async function loadComposition(): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'dsh-session-telemetry-disabled-loader-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@deepseek-ai/dsh-session'",
    "- name: '@deepseek-ai/dsh-session-telemetry-disabled'",
    '',
  ].join('\n'))

  context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-session', SessionStore],
    ['@deepseek-ai/dsh-session-telemetry-disabled', DisabledSessionTelemetryBackend],
  ])
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  await context.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await context.loader.await()
  return context
}

describe('disabled telemetry through a real Loader composition', () => {
  it('mounts the session telemetry provider and retracts it when its fiber disposes', async () => {
    const ctx = await loadComposition()
    const unloaded = [...ctx.loader.entries()]
      .filter(entry => entry.fiber === undefined && !entry.disabled)
      .map(entry => entry.options.name)
    expect(unloaded).toEqual([])
    expect(ctx.sessionTelemetry).toBeInstanceOf(SessionTelemetryBackend)
    expect(ctx.sessionTelemetry.sharing).toBe('disabled')

    ctx.sessionTelemetry.emit({
      channel: 'ledger',
      time: 0,
      severity: 'info',
      attributes: { 'session.id': 'composed', 'event.seq': 0 },
      body: { local: true },
    })
    await expect(ctx.sessionTelemetry.shutdown()).resolves.toBeUndefined()

    const provider = [...ctx.loader.entries()]
      .find(entry => entry.options.name === '@deepseek-ai/dsh-session-telemetry-disabled')
    await provider?.fiber?.dispose()
    expect(ctx.get('sessionTelemetry')).toBeUndefined()
  })
})
