# @deepseek-ai/dsh-session-anonymous-user-id

[English](README.md) | 中文

为显式 DeepSeek Harness 会话提供进程本地匿名用户标识。`getOrCreateSessionAnonymousUserId(sessionId)` 为给定会话 id 返回随机 UUID v4。同一进程中对该会话的重复调用返回相同值；不同会话 id 返回不同值。该库不执行磁盘 I/O，也不读取环境变量。`ANONYMOUS_USER_ID_PATTERN` 匹配返回值的格式；需要断言标识形状的消费者应导入该常量，而不是重复该正则。

## 组合

本包是共享 TypeScript 库，不是 Cordis 插件。消费者直接导入 `getOrCreateSessionAnonymousUserId()`。其 invariant companion 有意为空，因为私有缓存没有可独立观察的事件或数据关系。

## 模型体验

无，因为该库不发起模型调用，也不改变模型可见上下文。

#### KV Cache 影响

无；返回的标识不影响 token 或请求前缀。

## 已知限制与暂缓事项

- **无界进程缓存**：条目会保留到进程退出；预期会话数量很小，而逐出会削弱重复调用稳定性。
