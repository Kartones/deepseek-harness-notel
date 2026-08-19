# Agent Note: Feedback, identity, and telemetry egress removed via swap-in bundle packages

Status: implemented

English | [中文](2026-08-19-no-telemetry-swap-in-providers.zh.md)

## Problem

Three shipped packages combined to give a default deployment a cross-session identity and a reachable path to remote export, even though the base bundle's default configuration sent nothing.

`@deepseek-ai/dsh-anonymous-user-id` persisted one random UUID per `$DSH_HOME` at `.anonymous-user-id`, shared by every session and process against that home indefinitely. `@deepseek-ai/dsh-llm-deepseek` sent that id as the `x-deepseek-harness-user-id` header on every DeepSeek API call regardless of telemetry sharing mode, and `@deepseek-ai/dsh-command-feedback`'s `/feedback` acknowledgement disclosed the same id — so unrelated sessions in the same home were correlatable through both channels.

The base bundle's `cordis.patch.yml` mounted `@deepseek-ai/dsh-session-telemetry-otel` with `mode: !!js process.env.DSH_TELEMETRY_MODE || 'DISABLED'` against a hardcoded production collector (`https://harness-telemetry.deepseeksvc.com/v1/logs`), with `DSH_TELEMETRY_OTLP_URL` as an override. The default mode sent nothing, but `FULL`/`FEEDBACK_ONLY` were one environment variable away, and in either mode the seam ships no redaction rule of its own — an uploading export carries the raw captured session content (message text, tool arguments and results, system prompt, feedback text).

## Decision

Additive, swappable Cordis plugin packages replace the selected providers in `packages/bundle/base/cordis.patch.yml`, rather than editing the original packages in place. Only `packages/llm/llm-deepseek` is edited directly, for the one behavior no new package could supply on its own: per-session identity resolution at the call site. `packages/feedback/command-feedback`, `packages/session/session-telemetry-otel`, and `packages/identity/anonymous-user-id` are unedited and unselected — kept in the tree as reference and rollback options, and because `command-feedback` still owns the `feedback/record` event declaration (below).

### `command-feedback-local` (`packages/feedback/command-feedback-local`)

Swap-in for `command-feedback`: same Cordis plugin name (`command-feedback`), same `/feedback` command surface, same `feedback/record` log-only append, same acknowledgement shape including the `Anonymous user: {id}` line and the session-sharing disclosure read from the optional `sessionTelemetry` service (`ctx.get('sessionTelemetry')`). Local recording is a deliberate keep, not an oversight: `session.append('feedback/record', …)` never leaves the process, so it carries no egress, and an earlier exploratory branch that dropped local recording entirely was reconsidered and rejected here. The `Anonymous user: {id}` line is also kept deliberately — it is local text, not egress, and stays consistent with the id the same session sends in its LLM request header. The only behavior change from the original is the identity source: `getOrCreateSessionAnonymousUserId(session.id)` from the new identity package, instead of the home-persisted UUID.

### `session-anonymous-user-id` (`packages/identity/session-anonymous-user-id`)

A plain library, not a Cordis plugin: `getOrCreateSessionAnonymousUserId(sessionId): AnonymousUserId`. A module-local `Map<SessionId, AnonymousUserId>` mints a `randomUUID()` the first time a session id is seen and returns the same value for repeat calls against that id in-process. Nothing is written to disk and no environment variable is read, which narrows identity lifetime from "one UUID per harness home, forever" to "one UUID per session id, for the life of the process." The map has no disposal or eviction path; this is a documented limitation rather than added lifecycle plumbing, accepted because expected concurrent-session counts per process are small.

### `llm-deepseek` per-session identity (edited in place)

`DeepSeekAdapterOptions.resolveUserId` changed from a zero-argument closure that resolved and cached one id per adapter instance (`let userId; resolveUserId = () => userId ??= getOrCreateAnonymousUserId()`, effectively once per process) to `resolveUserId: (sessionId: GenerateOptions['sessionId']) => AnonymousUserId`. `apply()` in `src/index.ts` now delegates to `getOrCreateSessionAnonymousUserId(sessionId)` when a session id is present, and mints an uncached `randomUUID()` per call when it is not — a direct call outside a session gets a fresh id every time rather than a placeholder, an omitted header, or a process-wide fallback, so a session-less caller creates no identity that correlates across its own calls. `sessionId` was already in scope at the call site (`DeepSeekAdapter.execute`, `packages/llm/llm-deepseek/src/adapter.ts`) as `GenerateOptions.sessionId`, used one line below to set the `x-deepseek-harness-session-id` header.

### `session-telemetry-disabled` (`packages/session/session-telemetry-disabled`)

Extends the unchanged `SessionTelemetryBackend` abstract class from `@deepseek-ai/dsh-session-telemetry`; that seam package needed no changes, and confirming that required checking that no other production code in the tree constructs a `SessionTelemetryCoordinator` besides the OTel provider. `sharing` is fixed to `'disabled'` — not configurable, because a configurable mode on this provider would undermine the reason to select it over `session-telemetry-otel`. `emit()` is a no-op, `shutdown()` resolves immediately, and the package carries no OpenTelemetry SDK dependency, so selecting it removes the export capability rather than leaving it dormant.

### Bundle wiring

`cordis.patch.yml` rows `id: command-feedback` and `id: session-telemetry-otel` keep their row ids (patch-addressing is unaffected) and now point `name:` at the two new packages; the `DSH_TELEMETRY_MODE`/`DSH_TELEMETRY_OTLP_URL` config block and its comment are removed with the row, not left dormant. `packages/bundle/base/package.json`, `packages/bundle/base/tests/base.spec.ts`, and `tsconfig.host.json` are updated to match. `docs/config-catalog.md` and `apps/cli/composition.md` are regenerated from the new selection.

### Type-only dependency on the original event declaration

The first draft of `command-feedback-local` re-declared the `feedback/record` `SessionEventMap` augmentation in its own source, on the reasoning that the selected producer should own the declaration. `gen-persistence-catalog.ts --check` rejected this: the gate enforces exactly one declaration site per log event name across the repository, independent of which provider a bundle currently selects. The fix is a type-only import, `import type {} from '@deepseek-ai/dsh-command-feedback'`, mirroring the same pattern already present in `session-telemetry-otel`. A swap-in provider that only replaces the runtime behind an existing event — same event surface, different producer — still needs the original package present as a type-only dependency for declaration merging, even with its runtime code fully unselected.

## Alternatives considered

- **Edit the three original packages in place.** Rejected: it would remove `command-feedback`, `anonymous-user-id`, and `session-telemetry-otel` as reference and rollback options, and two of the three have no other reason to change (`anonymous-user-id`'s only defect was scope, and `session-telemetry-otel`'s only defect was the bundle's default configuration, not its code).
- **Drop local feedback recording entirely**, considered in an earlier exploratory branch. Rejected: `session.append('feedback/record', …)` never leaves the process, so it has no egress, and removing it would give up a working local-only feedback log for no privacy benefit.
- **`command-feedback-local` declares its own `feedback/record` event.** Rejected by `gen-persistence-catalog.ts --check`; superseded by the type-only import from the original package (above).
- **Omit the `x-deepseek-harness-user-id` header, or send a fixed placeholder, for session-less DeepSeek calls.** Rejected in favor of an uncached `randomUUID()` per call: a fixed placeholder or a missing header are both simpler, but the chosen fresh-id-per-call behavior guarantees a session-less caller can never be correlated across its own requests, which a shared placeholder would not.
- **A configurable `sharing` value on `session-telemetry-disabled`.** Rejected: a provider selected specifically to guarantee no export should not carry a knob that could reintroduce it.
- **Disposal or eviction wiring for the `session-anonymous-user-id` process-local map.** Rejected for now: no current caller needs it, and the expected number of distinct sessions per process is small; documented as a known limitation instead of built ahead of a need.

## Consequences

A default deployment sends no session content and no cross-session-correlatable identity to any external collector: the base bundle no longer references `DSH_TELEMETRY_MODE`, `DSH_TELEMETRY_OTLP_URL`, or the production OTLP endpoint, and `session-telemetry-otel`'s OpenTelemetry SDK dependency is unreachable from the selected configuration. Re-enabling upload is a `cordis.patch.yml` provider swap back to `session-telemetry-otel` with its own `mode`/`exporter` configuration, not an environment variable on the shipped default.

The `/feedback` acknowledgement and the DeepSeek request header both use a session-scoped id instead of a home-persisted one: unrelated sessions in the same `$DSH_HOME` no longer share an identity, and the id does not survive a process restart for the same session — a capability the previous persisted id had and this design gives up by choice.

`command-feedback`, `anonymous-user-id`, and `session-telemetry-otel` remain in the tree, unedited, as the rollback path and (for `command-feedback`) as the sole declaration site for `feedback/record`; only `llm-deepseek` carries a direct behavior edit, scoped to the `resolveUserId` signature and its one call site.

Full test suites for all touched and new packages, `typecheck`, and `doc-sync` (persistence catalog, config catalog, doc graphs) pass against this state.
