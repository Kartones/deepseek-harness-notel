# @deepseek-ai/dsh-session-telemetry-disabled

[English](README.md) | 中文

此 Service Provider 以固定的 `disabled` `sharing` 值实现 `@deepseek-ai/dsh-session-telemetry`。`emit()` 丢弃每条记录，`shutdown()` 立即完成。它不构造 `SessionTelemetryCoordinator`，不发起网络调用，也不会向任何位置发送数据。

## 模型体验

无。此后端丢弃遥测记录，绝不注册模型可见内容，不发送 token，对 KV-cache 没有影响。

#### KV Cache 影响

无；此包既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- **固定禁用共享** - 此 provider 没有配置开关。需要导出遥测时请选择其他 `sessionTelemetry` provider。
