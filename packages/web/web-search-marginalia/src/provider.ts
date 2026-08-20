/**
 * Marginalia search through its JSON HTTP API. The provider sends credentials
 * only in the `API-Key` header and records a secret-free request before dispatch.
 * @module @deepseek-ai/dsh-web-search-marginalia/provider
 */

import { WebError } from '@deepseek-ai/dsh-web'
import type {
  WebSearchProvider,
  WebSearchRequest,
  WebSearchResult,
  WebSearchSource,
} from '@deepseek-ai/dsh-web'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-session'
import type { MarginaliaSearchResponse } from './types.ts'

/** Stable id this provider registers under. */
export const MARGINALIA_PROVIDER_ID = 'marginalia'

/** Marginalia's current search API base URL. */
export const MARGINALIA_DEFAULT_BASE_URL = 'https://api2.marginalia-search.com'

/** Lowest count Marginalia accepts. */
export const MARGINALIA_MIN_COUNT = 1

/** Highest count Marginalia accepts. */
export const MARGINALIA_MAX_COUNT = 100

/** Attribution header sent on every request. Bump with the package version. */
const USER_AGENT = 'deepseek-harness/0.0.1'

/** Exact secret-free Marginalia search request recorded immediately before dispatch. */
export interface MarginaliaSearchRequest {
  /** Fully resolved search endpoint, without the query string. */
  readonly endpoint: string
  /** The query as sent, before URL encoding. */
  readonly query: string
  /** `count` sent to the API, absent when the request carried no `maxResults` bound. */
  readonly count?: number
  /** `dc` sent to the API, absent when the section configures none. */
  readonly resultsPerDomain?: number
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Secret-free Marginalia search request recorded before dispatch. */
    'web/marginalia-search-request': MarginaliaSearchRequest
  }
}

/** Resolved provider options supplied by the plugin for one search operation. */
export interface MarginaliaSearchProviderOptions {
  /** Literal Marginalia API key; when present it wins over {@link resolveApiKey}. */
  apiKey?: string
  /** Resolve the current Marginalia API key for one search operation. */
  resolveApiKey?: () => Promise<string | undefined>
  /** Credential reference named by missing-credential diagnostics. */
  apiKeyEnv?: CredentialRef
  /** Endpoint base; `/search` is appended. */
  baseURL: string
  /** Maximum results per domain, sent as `dc` when set. */
  resultsPerDomain?: number
  /** Record the exact secret-free request immediately before dispatch. */
  recordRequest?: (request: MarginaliaSearchRequest) => void
}

/**
 * Map Marginalia's response to a normalized search result.
 * @param response - parsed JSON response from Marginalia.
 * @returns normalized search results.
 * @throws {@link WebError} when `results` is absent or not an array.
 */
export function mapMarginaliaResponse(response: MarginaliaSearchResponse): WebSearchResult {
  if (!Array.isArray(response.results)) {
    throw new WebError('Marginalia returned an unprocessable response body: results is not an array', 'WEB_PROVIDER_ERROR')
  }
  const sources: WebSearchSource[] = []
  for (const item of response.results) {
    if (typeof item.url !== 'string' || item.url.length === 0) continue
    sources.push({
      url: item.url,
      ...typeof item.title === 'string' && item.title.length > 0 ? { title: item.title } : {},
      ...typeof item.description === 'string' && item.description.length > 0 ? { snippet: item.description } : {},
    })
  }
  return { sources, truncated: false }
}

/** Marginalia-backed search provider; HTTP redirects fail as `WEB_PROVIDER_ERROR`. */
export class MarginaliaSearchProvider implements WebSearchProvider {
  readonly id = MARGINALIA_PROVIDER_ID

  /**
   * @param resolveOptions - options for the next operation, snapshotted once at
   * operation entry so one search cannot combine two settings sections.
   */
  constructor(private readonly resolveOptions: () => MarginaliaSearchProviderOptions) {}

  /**
   * @returns whether a key source and parseable endpoint are configured.
   */
  available(): boolean {
    const options = this.resolveOptions()
    return ((options.apiKey?.length ?? 0) > 0 || options.resolveApiKey !== undefined)
      && URL.canParse(options.baseURL)
  }

  /**
   * Search Marginalia and map its response to the web capability result.
   * @param request - query and optional result limit.
   * @param signal - optional cancellation signal forwarded to the provider.
   * @returns normalized search results.
   */
  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const options = this.resolveOptions()
    const apiKey = await this.apiKey(options, signal)
    throwIfSearchAborted(signal)
    const endpoint = new URL('search', `${options.baseURL}/`).toString()
    const url = new URL(endpoint)
    url.searchParams.set('query', request.query)
    const count = request.maxResults === undefined
      ? undefined
      : Math.min(MARGINALIA_MAX_COUNT, Math.max(MARGINALIA_MIN_COUNT, request.maxResults))
    if (count !== undefined) url.searchParams.set('count', String(count))
    if (options.resultsPerDomain !== undefined) url.searchParams.set('dc', String(options.resultsPerDomain))
    options.recordRequest?.({
      endpoint,
      query: request.query,
      ...count === undefined ? {} : { count },
      ...options.resultsPerDomain === undefined ? {} : { resultsPerDomain: options.resultsPerDomain },
    })
    throwIfSearchAborted(signal)
    let response: Response
    try {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'error',
        headers: {
          'API-Key': apiKey,
          'accept': 'application/json',
          'user-agent': USER_AGENT,
        },
        ...signal !== undefined ? { signal } : {},
      })
    } catch (error: unknown) {
      if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error)
      throw new WebError(`Marginalia search request failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
    if (!response.ok) {
      const hint = response.status === 503
        ? '; the shared public development key may have exhausted its rate limit'
        : ''
      throw new WebError(`Marginalia search API error (HTTP ${response.status})${hint}`, 'WEB_PROVIDER_ERROR')
    }
    try {
      return mapMarginaliaResponse(await response.json() as MarginaliaSearchResponse)
    } catch (error: unknown) {
      if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error)
      if (error instanceof WebError) throw error
      throw new WebError(`Marginalia returned an unprocessable response body: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
  }

  /**
   * Resolve one operation's credential without retaining it on the provider.
   * @param options - the caller's operation snapshot.
   * @param signal - abort signal for the surrounding search.
   * @returns the resolved key.
   */
  private async apiKey(options: MarginaliaSearchProviderOptions, signal?: AbortSignal): Promise<string> {
    throwIfSearchAborted(signal)
    if (options.apiKey !== undefined && options.apiKey.length > 0) return options.apiKey
    // Marginalia documents a shared `public` integration-development key at https://about.marginalia-search.com/article/api/; it requires explicit `apiKey: public`, never a fallback, shares a rate limit across consumers, returns HTTP 503 when exhausted, and cannot use custom search filters.
    let resolved: string | undefined
    try {
      resolved = await abortable(options.resolveApiKey?.() ?? Promise.resolve(undefined), signal)
    } catch (error: unknown) {
      if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error)
      throw new WebError(
        `Marginalia search credential resolution failed: ${String(error)}`,
        'WEB_PROVIDER_ERROR',
        { cause: error },
      )
    }
    if (resolved !== undefined && resolved.length > 0) return resolved
    const ref = options.apiKeyEnv ?? 'MARGINALIA_API_KEY'
    throw new WebError(
      `Marginalia search has no API key for "${ref}"; store it through the credentials service, export it in the launching environment, or set a literal "apiKey" in the web-search-marginalia config. Obtain a key from contact@marginalia-search.com, or set apiKey: public for development.`,
      'WEB_PROVIDER_CREDENTIAL_MISSING',
    )
  }
}

/**
 * Race a same-process asynchronous preflight against caller cancellation. The
 * attached settlement handlers keep observing an uncooperative operation after
 * abort so a later rejection cannot become unhandled.
 */
function abortable<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal === undefined) return operation
  if (signal.aborted) return Promise.reject(searchAborted(signal))
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => { reject(searchAborted(signal)) }
    signal.addEventListener('abort', onAbort, { once: true })
    void operation.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(new Error(String(error).replace(/^Error: /u, ''), { cause: error }))
      },
    )
  })
}

/** Throw the provider's stable cancellation error when the caller already aborted. */
function throwIfSearchAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw searchAborted(signal)
}

/** Build the provider's stable cancellation error while retaining the caller's reason. */
function searchAborted(signal?: AbortSignal, fallback?: unknown): WebError {
  return new WebError('Marginalia search aborted', 'WEB_ABORTED', {
    cause: signal?.aborted === true ? signal.reason : fallback,
  })
}

/** True for a fetch/`AbortSignal` abort, surfaced as `WEB_ABORTED`. */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
