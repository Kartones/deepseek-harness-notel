---
description: "Process-local anonymous per-session identity for maintainers correlating DeepSeek requests and feedback acknowledgements by session rather than by harness home."
kind: "package-library"
---

# @deepseek-ai/dsh-session-anonymous-user-id

English | [中文](README.zh.md)

## Summary

`dsh-session-anonymous-user-id` mints process-local anonymous user identities for explicit DeepSeek Harness sessions. `getOrCreateSessionAnonymousUserId(sessionId)` returns a random UUID v4 for the supplied session id; repeated calls for that session in one process return the same value, and distinct session ids return distinct values. The library performs no disk I/O and reads no environment variables. `ANONYMOUS_USER_ID_PATTERN` matches the returned format; consumers asserting on the id's shape import this constant instead of duplicating the pattern.

## Table of Contents

- [Composition](#composition)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="composition"></a>
## Composition

This package is a shared TypeScript library, not a Cordis plugin. Consumers import `getOrCreateSessionAnonymousUserId()` directly. Its invariant companion is intentionally empty because the private cache has no independent observable event or data relation.

-----

<a id="model-experience"></a>
## Model Experience

None, as this library makes no model calls or model-visible context changes.

#### KV Cache effect

None; the returned identifier has no token or request-prefix effect.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Unbounded process cache** — entries remain until process exit; expected session counts are practically small, and eviction would weaken repeat-call stability.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
