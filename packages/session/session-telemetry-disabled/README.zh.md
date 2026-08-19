---
description: "固定禁用的 session-telemetry 后端，供部署挂载 session-telemetry seam 但不导出任何数据。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-telemetry-disabled

[English](README.md) | 中文

## 概述

`dsh-session-telemetry-disabled` 以固定的 `disabled` `sharing` 值实现 [session-telemetry seam](../session-telemetry/README.zh.md)。`emit()` 丢弃每条记录，`shutdown()` 立即完成；它不构造 `SessionTelemetryCoordinator`，不发起网络调用，也不会向任何位置发送数据。当部署希望 seam 始终存在——使读取 `ctx.sessionTelemetry` 的消费方无论是否配置遥测都行为一致——但不导出任何会话记录时，挂载此包。

## 目录

- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="model-experience"></a>
## 模型体验

无。此后端丢弃遥测记录，绝不注册模型可见内容，不发送 token，对 KV-cache 没有影响。

#### KV Cache 影响

无；此包既不组装也不发送提供方请求。

## 已知限制与暂缓事项

<a id="known-limitations-and-deferred-work"></a>

- **固定禁用共享** — 此 provider 没有配置开关。需要导出遥测时请选择其他 `sessionTelemetry` provider。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>面向维护者的工作背景——点击展开</summary>

无。

</details>
