/**
 * Process-local anonymous user identities scoped to explicit session ids.
 * @module @deepseek-ai/dsh-session-anonymous-user-id
 */

import { randomUUID } from 'node:crypto'
import type { Branded } from '@deepseek-ai/dsh-brand'

/** A random UUID v4 that identifies requests from one session in this process. */
export type AnonymousUserId = Branded<'AnonymousUserId'>

const ids = new Map<Branded<'SessionId'>, AnonymousUserId>()

/**
 * Return the session's process-local anonymous user id, minting it on first use.
 * @param sessionId - required id of the session whose requests share the identity.
 * @returns a random UUID v4 stable for this session during the current process.
 */
export function getOrCreateSessionAnonymousUserId(sessionId: Branded<'SessionId'>): AnonymousUserId {
  const existing = ids.get(sessionId)
  if (existing !== undefined) return existing

  const id = randomUUID() as AnonymousUserId
  ids.set(sessionId, id)
  return id
}
