/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-session-telemetry-disabled`.
 * @module @deepseek-ai/dsh-session-telemetry-disabled/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-session-telemetry-disabled'

/** Cordis companion plugin name. */
export const name = 'session-telemetry-disabled-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: this inert provider captures no data, emits no events, and owns no mutable relation. */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
