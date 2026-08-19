---
description: "The fixed-disabled session-telemetry backend for deployments that mount the session-telemetry seam but export nothing."
kind: "package-reference"
---

# @deepseek-ai/dsh-session-telemetry-disabled

English | [中文](README.zh.md)

## Summary

`dsh-session-telemetry-disabled` implements the [session-telemetry seam](../session-telemetry/README.md) with a fixed `sharing` value of `disabled`. `emit()` drops every record and `shutdown()` resolves immediately; it constructs no `SessionTelemetryCoordinator`, makes no network calls, and sends no data anywhere. Mount it when a deployment wants the seam present — so consumers that read `ctx.sessionTelemetry` behave the same whether or not telemetry is configured — without exporting session records anywhere.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="model-experience"></a>
## Model Experience

None, as this backend drops telemetry records, never registers model-visible content, sends no tokens, and has no KV-cache effect.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Fixed disabled sharing** — this provider has no configuration knob. Select a different `sessionTelemetry` provider to export telemetry.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
