# @deepseek-ai/dsh-session-telemetry-disabled

English | [中文](README.zh.md)

This Service Provider implements `@deepseek-ai/dsh-session-telemetry` with a fixed `sharing` value of `disabled`. `emit()` drops every record and `shutdown()` resolves immediately. It constructs no `SessionTelemetryCoordinator`, makes no network calls, and sends no data anywhere.

## Model Experience

None, as this backend drops telemetry records, never registers model-visible content, sends no tokens, and has no KV-cache effect.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Fixed disabled sharing** - this provider has no configuration knob. Select a different `sessionTelemetry` provider to export telemetry.
