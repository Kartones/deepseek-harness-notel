/** Real loopback coverage proves a redirect target receives no `API-Key` header. */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { MarginaliaSearchProvider } from '@deepseek-ai/dsh-web-search-marginalia'

const API_KEY = 'redirect-test-key'
const targetRequests: IncomingMessage['headers'][] = []
let redirectOrigin: string
let targetOrigin: string

const target = createServer((request, response) => {
  targetRequests.push(request.headers)
  request.resume()
  response.writeHead(204).end()
})

const redirect = createServer((request, response) => {
  request.resume()
  const status = Number(new URL(request.url ?? '/', 'http://fixture.test').pathname.split('/')[1])
  response.writeHead(status, { location: `${targetOrigin}/collect` }).end()
})

beforeAll(async () => {
  targetOrigin = await listen(target)
  redirectOrigin = await listen(redirect)
})

afterAll(async () => {
  await Promise.all([close(redirect), close(target)])
})

describe('MarginaliaSearchProvider redirect policy', () => {
  it.each([301, 302, 303, 307, 308])('rejects HTTP %i before contacting Location', async (status) => {
    targetRequests.length = 0
    const provider = new MarginaliaSearchProvider(() => ({ apiKey: API_KEY, baseURL: `${redirectOrigin}/${status}` }))
    await expect(provider.search({ query: 'private query' })).rejects.toMatchObject({ code: 'WEB_PROVIDER_ERROR' })
    expect(targetRequests).toHaveLength(0)
    expect(targetRequests.every(headers => headers['api-key'] !== API_KEY)).toBe(true)
  })
})

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address() as AddressInfo
  return `http://127.0.0.1:${address.port}`
}

async function close(server: Server): Promise<void> {
  if (!server.listening) return
  await new Promise<void>((resolve, reject) => server.close((error) => {
    if (error === undefined) resolve()
    else reject(error)
  }))
}
