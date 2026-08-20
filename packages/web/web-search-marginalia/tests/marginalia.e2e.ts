/** Real Marginalia API probe; it could not be exercised in this change because no key is available. */

import { describe, expect, it } from 'vitest'
import { MarginaliaSearchProvider, MARGINALIA_DEFAULT_BASE_URL } from '@deepseek-ai/dsh-web-search-marginalia'

const apiKey = process.env.MARGINALIA_API_KEY
const maybe = apiKey !== undefined && apiKey.length > 0 ? describe : describe.skip

maybe('MarginaliaSearchProvider real API', () => {
  it('returns URLs for a live query', async () => {
    const provider = new MarginaliaSearchProvider(() => ({
      apiKey: apiKey!,
      baseURL: process.env.MARGINALIA_SEARCH_BASE_URL ?? MARGINALIA_DEFAULT_BASE_URL,
    }))
    const result = await provider.search({ query: 'DeepSeek Harness', maxResults: 5 })
    for (const source of result.sources) expect(source.url).toMatch(/^https?:\/\//)
  }, 60_000)
})
