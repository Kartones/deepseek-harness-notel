# Agent Note: Opt-in Marginalia web search provider

Status: implemented

English | [中文](2026-08-20-web-search-marginalia-provider.zh.md)

## Problem

The `ctx.web` search seam ships provider options for DeepSeek's native search, Exa, and Perplexity, but none backed by [Marginalia Search](https://about.marginalia-search.com/article/api/), an independent small-index search engine with a documented HTTP API and a shared `public` key for integration development.

The initial investigation scoped this as a **default swap**: mount the new provider in `packages/bundle/base/cordis.patch.yml` and retire `web-search-deepseek` as the shipped `searchProvider`. That scope was narrowed before implementation. Marginalia ships no key comparable to DeepSeek's, whose provider reuses the credential the LLM call already requires; a default swap would leave `web_search` failing with `WEB_PROVIDER_CREDENTIAL_MISSING` out of the box until an operator provisions `MARGINALIA_API_KEY`, a regression to the default deployment's working search. The user instructed an additive, opt-in package instead, leaving the shipped default provider selection untouched.

## Decision

`@deepseek-ai/dsh-web-search-marginalia` (`packages/web/web-search-marginalia`) registers a `WebSearchProvider` under id `marginalia` into `ctx.web`, alongside the existing providers. It does not edit `packages/bundle/base/cordis.patch.yml`; the shipped default `searchProvider` is unchanged. Opting in requires two edits to a profile's `cordis.yml`/`cordis.patch.yml`: add the provider's plugin row, then set `searchProvider: marginalia`. This is documented in the package README's `## Installation` section.

### Credential handling mirrors `web-search-deepseek`

`resolveOptions()` in `src/index.ts` hands the provider a `resolveApiKey` thunk resolved per search through `ctx.credentials` (`credentialRef(config.apiKeyEnv ?? 'MARGINALIA_API_KEY')`), falling back to `launchEnvironmentOf(ctx)` when no credentials service is mounted; a non-empty literal `config.apiKey` wins over both. `apiKey` carries `role('secret')` and `apiKeyEnv` carries `role('credential-ref')`, so a literal key never appears in a described settings layer. A missing credential fails loud as `WEB_PROVIDER_CREDENTIAL_MISSING`, naming the reference and the three ways to supply a value. The `API-Key` HTTP header is the only place the credential exists; it is not part of the request URL (Marginalia's new API takes no query-parameter auth) and never enters the session event, a `WebError` message, or rendered tool output. HTTP redirects fail as `WEB_PROVIDER_ERROR` (`redirect: 'error'`) rather than being followed, covered by a real loopback-server regression suite (`tests/redirect.spec.ts`) per `packages/web/AGENTS.md`.

### The shared `public` development key is opt-in only, never a fallback

Marginalia documents a literal `public` key for integration development, shared across all consumers, rate-limited to HTTP 503 on exhaustion, and unable to use custom search filters. The provider never selects it automatically; a caller must set `apiKey: public` explicitly. `tests/marginalia.spec.ts` pins this against accidental default drift: no literal key and no resolvable credential throws `WEB_PROVIDER_CREDENTIAL_MISSING` without falling back to `public`.

### Session event `web/marginalia-search-request`

A `SessionEventMap` member logs the endpoint (without its query string), the unencoded query, and optional `count`/`resultsPerDomain`, appended immediately before dispatch when an initiating Agent session exists (`ctx.get('agents')?.currentInitiator()?.session.append(...)`). No header or credential field exists on the type, so none can leak into the log. `tests/marginalia.spec.ts` asserts the recorded event by exact deep equality, so an added field fails the test. `SESSION_FORMAT_VERSION` stays `0`: this is a new log-only event, not a structural or envelope change. `docs/persistence-catalog.md`/`.zh.md` and `packages/core/session/src/known-event-types.ts` are regenerated via `pnpm run gen-persistence-catalog`.

### Response mapping

Marginalia's `results[].url/title/description` map to `WebSearchSource.url/title/snippet`; items with a missing or empty `url` are skipped, and empty `title`/`description` are omitted rather than sent as empty strings. Marginalia's documented response carries no date or answer-text field, so `publishedAt` and `content` stay permanently absent. An empty `results[]` returns `{ sources: [], truncated: false }` rather than an error — this differs deliberately from `web-search-deepseek`'s strict-mode error, whose meaning ("native search never triggered") does not apply here. A response whose `results` is absent or not an array is `WEB_PROVIDER_ERROR`. No deduplication is applied: nothing in Marginalia's documented response suggests duplicate URLs, so a dedupe pass would be speculative. `count` is derived per call from `WebSearchRequest.maxResults`, clamped to Marginalia's documented 1–100 range, rather than being a separate config field.

### No UI settings card, no app-level e2e test

The Web UI's settings card and `apps/web`'s browser e2e coverage were scoped in the original investigation (as tasks T6/T7) but dropped before implementation, after finding this repository's existing opt-in-only provider, `web-search-perplexity`, has neither. Package-level tests are the coverage pattern this repository already uses for a provider that is not the shipped default: 25 tests in `packages/web/web-search-marginalia/tests/` (response mapping, availability, request/credential-safety, redirect security, settings projection, plugin registration/disposal) plus a guarded `tests/marginalia.e2e.ts` real-API probe that self-skips without `MARGINALIA_API_KEY`.

## Alternatives considered

- **Replace `web-search-deepseek` as the shipped default.** Rejected: the shipped default provider does not work without an API key either. Shipping the new search provider as an opt-in plugin respects the project's "everything is a plugin" architecture.
- **Ship the `public` Marginalia key as a harness default or fallback.** Rejected: it is Marginalia's own shared community key for integration development, explicitly not a production credential; the harness only honors it as a deliberate, explicit `apiKey: public` opt-in.
- **Add a Web UI settings card and `apps/web` e2e coverage in this change** (T6/T7 in the original investigation). Deferred: this repository's existing opt-in-only provider, `web-search-perplexity`, ships with neither, so package-level tests are the established, complete coverage pattern here; adding a shipped-default provider is what would newly require both.
- **Configurable `count`/`timeout`/`page`/`nsfw`/`filter` query parameters.** Rejected per "require a current owner and need": `count` derives from `WebSearchRequest.maxResults` rather than being a knob, and no current consumer needs the rest; adding them later is a config-only change.
- **Deduplicate `results[]` by URL.** Rejected: Marginalia's documented response gives no indication of duplicate URLs, so a dedupe pass would be speculative.

## Consequences

A deployment that never adds the `web-search-marginalia` provider row and never sets `searchProvider: marginalia` sees no behavior change; the shipped default search provider is untouched. Opting in requires the operator to provision `MARGINALIA_API_KEY` (or deliberately opt into the shared, rate-limited `public` key) — unlike the shipped default, which reuses a credential already required for the LLM call.

No Web UI settings card and no app-level browser e2e test exist for this provider. A future decision to make Marginalia the shipped default would need to add both, following the `web-search-deepseek` pattern this package otherwise mirrors.

`MarginaliaSearchRequest`'s wire shape is verified only against Marginalia's published API documentation: `tests/marginalia.e2e.ts` self-skips without `MARGINALIA_API_KEY` and was not exercised against a live endpoint during this change. Error response bodies are undocumented, so a non-OK response surfaces only its HTTP status line.

`web/marginalia-search-request` is a new log-only `SessionEventMap` member with `SESSION_FORMAT_VERSION` unchanged at `0`; neither SDK's expected output changes, since neither enumerates this event.
