# @deepseek-ai/dsh-session-anonymous-user-id

English | [中文](README.zh.md)

Process-local anonymous user identities for explicit DeepSeek Harness sessions. `getOrCreateSessionAnonymousUserId(sessionId)` returns a random UUID v4 for the supplied session id. Repeated calls for that session in one process return the same value; distinct session ids return distinct values. The library performs no disk I/O and reads no environment variables. `ANONYMOUS_USER_ID_PATTERN` matches the returned format; consumers asserting on the id's shape import this constant instead of duplicating the pattern.

## Composition

This package is a shared TypeScript library, not a Cordis plugin. Consumers import `getOrCreateSessionAnonymousUserId()` directly. Its invariant companion is intentionally empty because the private cache has no independent observable event or data relation.

## Model Experience

None, as this library makes no model calls or model-visible context changes.

#### KV Cache effect

None; the returned identifier has no token or request-prefix effect.

## Known Limitations and Deferred Work

- **Unbounded process cache** — entries remain until process exit; expected session counts are practically small, and eviction would weaken repeat-call stability.
