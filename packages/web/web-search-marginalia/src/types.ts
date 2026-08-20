/**
 * Provider-private wire types for Marginalia's search API. They do not create
 * a dependency on `ctx.llm`.
 * @module @deepseek-ai/dsh-web-search-marginalia/types
 */

/** One result item in Marginalia's search response. */
export interface MarginaliaSearchResultItem {
  /** Result URL. */
  url?: string | null
  /** Result title. */
  title?: string | null
  /** Result description. */
  description?: string | null
}

/** Marginalia's search response envelope. */
export interface MarginaliaSearchResponse {
  /** Search results when the response is well formed. */
  results?: MarginaliaSearchResultItem[]
}
