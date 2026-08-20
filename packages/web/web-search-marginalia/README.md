# @deepseek-ai/dsh-web-search-marginalia

English | [中文](README.zh.md)

A [Marginalia Search](https://about.marginalia-search.com/article/api/)-backed `WebSearchProvider` for the harness [web capability seam](../web/README.md) (`ctx.web`). It sends `GET {baseURL}/search` with a query string and an `API-Key` header, then maps Marginalia's JSON `results[]` into the seam's normalized `WebSearchResult`.

This implementation package registers the `marginalia` search provider into `ctx.web`, resolves its credential for each search through the optional `ctx.credentials` service, and records the secret-free request in the initiating Agent session when one exists. It does not register a model-facing tool or depend on `ctx.llm`.

## Installation

This package is opt-in. It is not mounted by the shipped base bundle, and installing it does not change the shipped `deepseek-official` selection. From a source checkout, run `pnpm install` at the repository root; the workspace already contains this package. For a profile or another package, add the published package to that resolver manifest with `pnpm add @deepseek-ai/dsh-web-search-marginalia`.

Add the provider row and select it in the profile's `cordis.yml` or `cordis.patch.yml`:

```yaml
- id: web
  config:
    searchProvider: marginalia

- id: web-search-marginalia
  name: '@deepseek-ai/dsh-web-search-marginalia'
  config:
    apiKeyEnv: MARGINALIA_API_KEY
```

The provider row registers into the existing `web` service. `searchProvider` selects one active provider by id; it does not merge providers. Set it explicitly to `marginalia` to route `web_search` calls here. Without that change, installing this package alone leaves the shipped `deepseek-official` provider active.

## Config

| Key | Default | Meaning |
|---|---|---|
| `apiKey` | omitted | Literal Marginalia API key. Prefer `apiKeyEnv` so no secret enters configuration; a non-empty literal wins. |
| `apiKeyEnv` | `MARGINALIA_API_KEY` | Credential reference resolved for each search through `ctx.credentials`, or from the launching environment when that service is absent. A missing value fails the call as `WEB_PROVIDER_CREDENTIAL_MISSING`. |
| `baseURL` | `https://api2.marginalia-search.com` | API base; `/search` is appended. Falls back to `$MARGINALIA_SEARCH_BASE_URL` from an environment layer. An unparseable value makes the provider unavailable. |
| `resultsPerDomain` | omitted | Positive integer from 1 through 100, sent as Marginalia's `dc` parameter when set. |

The settings section is projected for each search, so a stored credential or endpoint change reaches the next call without re-registering the provider. `apiKey` carries `role('secret')`, so it does not appear in described settings layers.

### Shared `public` development key

Marginalia documents the literal [`public` key for integration development](https://about.marginalia-search.com/article/api/). Opt in deliberately with `apiKey: public` in the provider configuration. The harness never selects this key automatically: a missing configured credential fails with `WEB_PROVIDER_CREDENTIAL_MISSING`. Its rate limit is shared across all consumers, exhaustion returns HTTP 503, and it cannot use custom search filters.

## Mapping

Marginalia's `results[]` items map `url` to `url`, a non-empty `title` to `title`, and a non-empty `description` to `snippet`. Items without a non-empty URL are skipped. The API supplies neither dates nor provider answer text, so `publishedAt` and `content` are absent. An empty `results[]` is a valid empty search result.

`count` derives from `WebSearchRequest.maxResults`, clamped from 1 through 100 when supplied. `resultsPerDomain` maps to `dc`. The web service still enforces `maxResults` by truncating returned `sources[]` and setting `truncated`; the provider returns `truncated: false` before that seam-level cap. Provider failures become `WEB_PROVIDER_ERROR`; caller cancellation becomes `WEB_ABORTED`. HTTP redirects fail before their `Location` target is contacted.

## Request logging

Immediately before dispatch, a search running under an initiating Agent appends the log-only `web/marginalia-search-request` session event. It records the endpoint without a query string, the unencoded query, and optional `count` and `resultsPerDomain`; headers and credentials are excluded. Credential failures and cancellations before dispatch create no event, while later HTTP or response failures retain the attempted request. Direct programmatic calls outside an Agent have no initiating session to log.

## Model Experience

### Marginalia provider request

#### What the model sees

Nothing. A Marginalia search is an HTTP retrieval request, not an auxiliary model turn.

#### Token effect

Zero direct model tokens for the provider request.

#### KV Cache effect

No model request is made, so this provider request has no direct KV-cache effect.

### Conversation tool result, indirectly

#### What the model sees

Through [`dsh-tool-web`](../tool-web/README.md), the conversation model sees returned URLs, titles, and snippets. The provider supplies no answer text or dates. The consumer owns its error wrapper.

#### Token effect

Zero direct conversation tokens from registration. Result tokens scale with returned sources and snippets, then the web service enforces the requested source bound.

#### KV Cache effect

Append-only. Newly visible tool results follow the reusable request prefix and do not invalidate existing KV-cache entries.

## Known Limitations and Deferred Work

- **Explicit installation and selection are required** — this package is not the shipped default; add its provider row and set `searchProvider: marginalia` before it serves searches.
- **No source date or answer field** — Marginalia supplies neither, so `publishedAt` and `content` remain absent.
- **`maxResults` has two caps** — the provider sends a clamped `count`, then the web service applies its own result truncation.
- **Free and non-commercial keys carry an attribution obligation** — Marginalia's CC-BY-NC-SA terms are not surfaced by the harness.
- **The shared `public` key can be rate-limited** — exhaustion appears as HTTP 503.
- **Error bodies are undocumented** — non-OK responses report only the HTTP status line.
