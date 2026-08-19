---
description: "Local log-only session feedback plus the `/feedback` command, for deployments swapping in a home-persisted-identity-free command-feedback implementation."
kind: "package-reference"
---

# @deepseek-ai/dsh-command-feedback-local

English | [中文](README.zh.md)

## Summary

`dsh-command-feedback-local` is a swap-in replacement for `@deepseek-ai/dsh-command-feedback`: same Cordis plugin name (`command-feedback`), same `feedback/record` event, same acknowledgement and sharing disclosure. The only difference is identity — it derives the acknowledgement's anonymous-user id from the receiving session id instead of the home-persisted anonymous-user id, so a deployment that wants session-scoped rather than installation-scoped feedback identity mounts this package instead.

## Table of Contents

- [Command contract](#command-contract)
- [Identity source](#identity-source)
- [Composition](#composition)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="command-contract"></a>
## Command contract

`/feedback <text>` trims surrounding whitespace, appends `feedback/record`, and returns `Feedback recorded for session {sessionId}` followed by an anonymous-user id and the session-sharing disclosure. Empty or whitespace-only input returns `Feedback text is required. Usage: /feedback <text>` and appends no feedback event. The text is log-only: it does not enter the ordered surface, derived history, or a model request.

<a id="identity-source"></a>
## Identity source

This package differs from the original only in its identity source. It derives the acknowledgement's anonymous-user id from the receiving session id through `@deepseek-ai/dsh-session-anonymous-user-id`, rather than reading or creating the home-persisted anonymous-user id. The same session receives the same id during the process lifetime, and distinct session ids receive distinct ids.

<a id="composition"></a>
## Composition

The plugin injects only `commands`; `sessionTelemetry` remains optional and is read with `ctx.get`. A bundle selects this implementation by loading its npm package while retaining the stable Cordis row id and plugin name.

-----

<a id="model-experience"></a>
## Model Experience

### Human `/feedback` capture

#### What the model sees

Nothing. The slash input, `feedback/record`, and acknowledgement are log-only and never enter model context or derived history.

#### Token effect

Zero direct token effect.

#### KV Cache effect

Independent of model requests. The log append does not change an already-reusable request prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No feedback retrieval or management surface** — this package records one free-text append-only event and provides no retrieval, aggregation, amendment, or withdrawal operation.
- **Session-scoped identity is process-local** — the anonymous id is not home-persisted, so it is not stable across process restarts.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
