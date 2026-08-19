import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import AgentRegistry, { Inbox } from '@deepseek-ai/dsh-agent'
import type { Agent, AgentStatus } from '@deepseek-ai/dsh-agent'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import SessionStore, { foldSurface, type Session, SessionId } from '@deepseek-ai/dsh-session'
import * as commandFeedback from '@deepseek-ai/dsh-command-feedback-local'

interface Harness {
  readonly ctx: Context
  readonly agent: Agent
  readonly session: Session
  readonly plugin: Awaited<ReturnType<Context['plugin']>>
}

/** Build a live idle agent over a store-owned session. */
function stubAgent(ctx: Context, id: string): { agent: Agent; session: Session } {
  const session = ctx.sessions.create(SessionId(id))
  const inbox = new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} })
  let status: AgentStatus = 'idle'
  const agent: Agent = {
    id: session.id,
    options: {},
    session,
    inbox,
    ctx: new Context(),
    get status() { return status },
    send: () => {},
    followup: () => {},
    steer: () => {},
    inject: () => {},
    cancel() { status = 'idle' },
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
  return { agent, session }
}

/** Mount the command registry and the local feedback producer. */
async function harness(id = `command-feedback-local-${Math.random()}`): Promise<Harness> {
  const ctx = new Context()
  await ctx.plugin(CommandRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SessionStore)
  const plugin = await ctx.plugin(commandFeedback)
  const { agent, session } = stubAgent(ctx, id)
  ctx.agents.register(agent)
  return { ctx, agent, session, plugin }
}

/** Execute `/feedback` through the registry boundary used by command adapters. */
async function run(test: Harness, suffix = ''): Promise<{ kind: string; text?: string }> {
  const settled = await test.ctx.commands.execute(test.agent, `/feedback${suffix}`, new AbortController().signal)
  if (settled === undefined) throw new Error('feedback command was not registered')
  return settled.result
}

/** Return the authoritative feedback payloads in log order. */
function feedbackTexts(session: Session): string[] {
  return session.events
    .filter(event => event.type === 'feedback/record')
    .map(event => event.data.text)
}

describe('@deepseek-ai/dsh-command-feedback-local registration', () => {
  it('registers one global command with Loader-safe exports and disposes it', async () => {
    const test = await harness()
    expect(commandFeedback.name).toBe('command-feedback')
    expect(commandFeedback.inject).toEqual(['commands'])
    expect('default' in commandFeedback).toBe(false)
    const loader = Object.create(Loader.prototype) as Loader
    expect(loader.unwrapExports(commandFeedback)).toBe(commandFeedback)
    expect(test.ctx.commands.list(test.agent)).toContainEqual({
      name: 'feedback',
      description: 'record feedback about this session',
      input: { hint: '<text>' },
    })
    await test.plugin.dispose()
    expect(test.ctx.commands.find(test.agent, 'feedback')).toBeUndefined()
  })
})

describe('/feedback local human command', () => {
  it('records trimmed feedback once and acknowledges the session-scoped anonymous user', async () => {
    const test = await harness('local-feedback-session')
    const feedbackMessage = new RegExp([
      '^Feedback recorded for session local-feedback-session\\n',
      'Anonymous user: .+\\. Session sharing is not configured\\.$',
    ].join(''), 'u')
    await expect(run(test, ' the diff view is unreadable ')).resolves.toMatchObject({
      kind: 'success',
      text: expect.stringMatching(feedbackMessage),
    })
    expect(feedbackTexts(test.session)).toEqual(['the diff view is unreadable'])
    const commandRun = test.session.events.find(event => event.type === 'command/run')
    expect(commandRun?.type === 'command/run' && Object.hasOwn(commandRun.data, 'args')).toBe(false)
    expect(JSON.stringify(test.session.events).match(/the diff view is unreadable/gu)).toHaveLength(1)
  })

  it('keeps feedback log-only and exposes a command-independent producer', async () => {
    const test = await harness()
    commandFeedback.recordFeedback(test.session, '  recorded outside a command  ')
    expect(feedbackTexts(test.session)).toEqual(['recorded outside a command'])
    expect(() => commandFeedback.recordFeedback(test.session, ' \n\t ')).toThrow('feedback text must not be empty')
    for (const event of test.session.events) {
      expect('surfaceOp' in event).toBe(false)
      expect(test.session.deriveEventMessage(event)).toBeNull()
    }
    expect(foldSurface(test.session.events).nodes).toEqual([])
    expect(test.session.deriveMessages()).toEqual([])
  })

  it('returns a usage error without a feedback event for blank input', async () => {
    const test = await harness()
    await expect(run(test)).resolves.toEqual({ kind: 'error', text: 'Feedback text is required. Usage: /feedback <text>' })
    await expect(run(test, '   \n\t ')).resolves.toEqual({ kind: 'error', text: 'Feedback text is required. Usage: /feedback <text>' })
    expect(feedbackTexts(test.session)).toEqual([])
  })

  it('uses a stable anonymous user id for one session and a distinct id for another', async () => {
    const first = await harness('first-local-feedback-session')
    const second = await harness('second-local-feedback-session')
    const firstOne = await run(first, ' first')
    const firstTwo = await run(first, ' second')
    const secondOne = await run(second, ' third')
    const id = (result: { text?: string }): string => result.text?.match(/Anonymous user: ([^.]+)\./u)?.[1] ?? ''
    expect(id(firstOne)).not.toBe('')
    expect(id(firstOne)).toBe(id(firstTwo))
    expect(id(firstOne)).not.toBe(id(secondOne))
  })
})
