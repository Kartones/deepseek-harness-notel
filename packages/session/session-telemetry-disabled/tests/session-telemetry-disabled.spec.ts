import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { SessionTelemetryRecord } from '@deepseek-ai/dsh-session-telemetry'
import DisabledSessionTelemetryBackend from '../src/index.ts'

const record: SessionTelemetryRecord = {
  channel: 'ledger',
  time: 0,
  severity: 'info',
  attributes: { 'session.id': 'local', 'event.seq': 0 },
  body: { local: true },
}

describe('DisabledSessionTelemetryBackend', () => {
  it('keeps records local and shuts down immediately', async () => {
    const ctx = new Context()
    const on = vi.spyOn(ctx, 'on')
    const backend = new DisabledSessionTelemetryBackend(ctx)

    expect(backend.sharing).toBe('disabled')
    expect(() => backend.emit(record)).not.toThrow()
    await expect(backend.shutdown()).resolves.toBeUndefined()
    expect(on).not.toHaveBeenCalled()
  })
})
