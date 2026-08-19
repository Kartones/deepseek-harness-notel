import { describe, expect, it } from 'vitest'
import type { Branded } from '@deepseek-ai/dsh-brand'
import { getOrCreateSessionAnonymousUserId } from '../src/index.ts'

const sessionId = (value: string): Branded<'SessionId'> => value as Branded<'SessionId'>

describe('getOrCreateSessionAnonymousUserId', () => {
  it('returns the same id for repeated calls with one session id', () => {
    const id = sessionId('session-repeat')

    expect(getOrCreateSessionAnonymousUserId(id)).toBe(getOrCreateSessionAnonymousUserId(id))
  })

  it('returns distinct ids for distinct session ids', () => {
    expect(getOrCreateSessionAnonymousUserId(sessionId('session-a')))
      .not.toBe(getOrCreateSessionAnonymousUserId(sessionId('session-b')))
  })

  it('is synchronous and does not depend on environment values', () => {
    const environment = { ...process.env }
    const first = getOrCreateSessionAnonymousUserId(sessionId('session-env-a'))
    const second = getOrCreateSessionAnonymousUserId(sessionId('session-env-b'))

    expect(typeof first).toBe('string')
    expect(typeof second).toBe('string')
    expect(process.env).toEqual(environment)
  })
})
