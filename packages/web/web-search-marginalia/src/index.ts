/**
 * Register a Marginalia-backed provider in `ctx.web`. Configuration resolves a
 * credential per search and records a secret-free request before dispatch.
 * @module @deepseek-ai/dsh-web-search-marginalia
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-web'
import {
  MarginaliaSearchProvider,
  MARGINALIA_DEFAULT_BASE_URL,
  MARGINALIA_MAX_COUNT,
  MARGINALIA_MIN_COUNT,
} from './provider.ts'
import type { MarginaliaSearchProviderOptions } from './provider.ts'

export {
  MarginaliaSearchProvider,
  MARGINALIA_DEFAULT_BASE_URL,
  MARGINALIA_MAX_COUNT,
  MARGINALIA_MIN_COUNT,
  MARGINALIA_PROVIDER_ID,
} from './provider.ts'
export type { MarginaliaSearchProviderOptions, MarginaliaSearchRequest } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-marginalia'

/** The web service this provider registers into. */
export const inject = ['web']

const DEFAULT_API_KEY_ENV = 'MARGINALIA_API_KEY'
const SEARCH_BASE_URL_ENV = 'MARGINALIA_SEARCH_BASE_URL'

/** Plugin configuration. */
export interface Config {
  /** Literal Marginalia API key; prefer {@link apiKeyEnv} so no secret enters configuration files. */
  apiKey?: string
  /** Credential reference resolved for each search; defaults to `MARGINALIA_API_KEY`. */
  apiKeyEnv?: string
  /** Marginalia API base; `/search` is appended. */
  baseURL?: string
  /** Maximum results per domain, sent as `dc` when set. */
  resultsPerDomain?: number
}

/** Schema for the plugin configuration. */
export const Config: z<Config> = z.object({
  apiKey: z.string().role('secret'),
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
  baseURL: z.string(),
  resultsPerDomain: z.number().step(1).min(MARGINALIA_MIN_COUNT).max(MARGINALIA_MAX_COUNT),
})

/** Settings namespace carrying this provider's endpoint, key reference, and domain limit. */
export const WEB_SEARCH_MARGINALIA_SETTINGS_NAMESPACE = settingsNamespace('web-search-marginalia')

/**
 * Project the current configuration section into options for one search.
 * @param ctx - plugin context supplying credential and environment values.
 * @param config - current authoritative configuration section.
 * @returns options for one search.
 */
function resolveOptions(ctx: Context, config: Config): MarginaliaSearchProviderOptions {
  const apiKeyEnv = credentialRef(config.apiKeyEnv ?? DEFAULT_API_KEY_ENV)
  const literalApiKey = config.apiKey !== undefined && config.apiKey.length > 0
    ? config.apiKey
    : undefined
  return {
    ...literalApiKey === undefined ? {} : { apiKey: literalApiKey },
    resolveApiKey: async () => {
      const credentials = ctx.get('credentials')
      if (credentials !== undefined) return (await credentials.resolve(apiKeyEnv))?.value
      const ambient = launchEnvironmentOf(ctx).get(apiKeyEnv)
      return ambient !== undefined && ambient.value.length > 0 ? ambient.value : undefined
    },
    apiKeyEnv,
    baseURL: config.baseURL
      ?? launchEnvironmentOf(ctx).get(SEARCH_BASE_URL_ENV)?.value
      ?? MARGINALIA_DEFAULT_BASE_URL,
    ...config.resultsPerDomain === undefined ? {} : { resultsPerDomain: config.resultsPerDomain },
    recordRequest: (request) => {
      ctx.get('agents')?.currentInitiator()?.session.append(
        'web/marginalia-search-request',
        request,
      )
    },
  }
}

/**
 * Register the Marginalia search provider with `ctx.web`.
 * @param ctx - plugin context carrying the web service.
 * @param config - plugin configuration section.
 * @returns nothing.
 */
export function apply(ctx: Context, config: Config): void {
  let current: () => Config = () => config
  installSettingsSection(ctx, WEB_SEARCH_MARGINALIA_SETTINGS_NAMESPACE, Config, config, {
    setSource: (source) => {
      current = source
    },
    onChange: () => {},
  })
  ctx.web.registerSearchProvider(new MarginaliaSearchProvider(() => resolveOptions(ctx, current())))
}
