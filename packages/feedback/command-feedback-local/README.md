# @deepseek-ai/dsh-command-feedback-local

English | [中文](README.zh.md)

Local log-only session feedback plus the human-facing `/feedback` command. It is a swap-in replacement for `@deepseek-ai/dsh-command-feedback`: its Cordis plugin name remains `command-feedback`, it records the same `feedback/record` event, and it exposes the same acknowledgement and sharing disclosure.

## Command contract

`/feedback <text>` trims surrounding whitespace, appends `feedback/record`, and returns `Feedback recorded for session {sessionId}` followed by an anonymous-user id and the session-sharing disclosure. Empty or whitespace-only input returns `Feedback text is required. Usage: /feedback <text>` and appends no feedback event. The text is log-only: it does not enter the ordered surface, derived history, or a model request.

## Identity source

This package differs from the original only in its identity source. It derives the acknowledgement's anonymous-user id from the receiving session id through `@deepseek-ai/dsh-session-anonymous-user-id`, rather than reading or creating the home-persisted anonymous-user id. The same session receives the same id during the process lifetime, and distinct session ids receive distinct ids.

## Composition

The plugin injects only `commands`; `sessionTelemetry` remains optional and is read with `ctx.get`. A bundle selects this implementation by loading its npm package while retaining the stable Cordis row id and plugin name.

## Model Experience

### Human `/feedback` capture

#### What the model sees

Nothing. The slash input, `feedback/record`, and acknowledgement are log-only and never enter model context or derived history.

#### Token effect

Zero direct token effect.

#### KV Cache effect

Independent of model requests. The log append does not change an already-reusable request prefix.

## Known Limitations and Deferred Work

- **No feedback retrieval or management surface** — this package records one free-text append-only event and provides no retrieval, aggregation, amendment, or withdrawal operation.
- **Session-scoped identity is process-local** — the anonymous id is not home-persisted, so it is not stable across process restarts.
