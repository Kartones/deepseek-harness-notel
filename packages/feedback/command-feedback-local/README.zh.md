# @deepseek-ai/dsh-command-feedback-local

[English](README.md) | 中文

本包提供本地、仅写入日志的会话反馈及面向用户的 `/feedback` 命令。它是 `@deepseek-ai/dsh-command-feedback` 的可替换实现：Cordis 插件名仍为 `command-feedback`，记录相同的 `feedback/record` 事件，并提供相同的确认和会话共享披露。

## 命令约定

`/feedback <text>` 会去除前后空白、追加 `feedback/record`，并返回 `Feedback recorded for session {sessionId}`、匿名用户 id 以及会话共享披露。空输入或仅含空白的输入返回 `Feedback text is required. Usage: /feedback <text>`，且不追加反馈事件。文本仅写入日志，不进入有序 surface、派生历史或模型请求。

## 身份来源

本包与原实现唯一的差异是身份来源。它通过 `@deepseek-ai/dsh-session-anonymous-user-id` 从接收反馈的会话 id 派生确认文本中的匿名用户 id，而不是读取或创建按 home 持久化的匿名用户 id。同一会话在进程生命周期内得到同一 id；不同会话 id 得到不同 id。

## 组合

插件只注入 `commands`；`sessionTelemetry` 仍是可选服务，并通过 `ctx.get` 读取。bundle 通过加载本 npm 包选择此实现，同时保留稳定的 Cordis 行 id 和插件名。

## 模型体验

### 用户 `/feedback` 采集

#### 模型看到的内容

无。斜杠输入、`feedback/record` 和确认文本仅写入日志，绝不进入模型上下文或派生历史。

#### Token 影响

无直接 token 影响。

#### KV Cache 影响

与模型请求无关。日志追加不会改变已可复用的请求前缀。

## 已知限制与暂缓工作

- **没有反馈检索或管理 surface** — 本包记录一个自由文本、仅追加的事件，不提供检索、聚合、修改或撤回操作。
- **会话范围身份仅在进程内有效** — 匿名 id 不按 home 持久化，因此进程重启后不保持稳定。
