# Agent Note: 反馈、身份与遥测的外发通过 bundle 替换包移除

Status: implemented

[English](2026-08-19-no-telemetry-swap-in-providers.md) | 中文

## 问题

三个已交付的包组合在一起，即使 base bundle 的默认配置什么也不发送，默认部署仍然拥有一个跨会话身份和一条可达的远程导出路径。

`@deepseek-ai/dsh-anonymous-user-id` 在 `$DSH_HOME` 下的 `.anonymous-user-id` 持久化一个随机 UUID，由该 home 下的每个会话和每个进程共享，且永久有效。`@deepseek-ai/dsh-llm-deepseek` 在每次 DeepSeek API 调用中都会将该 id 作为 `x-deepseek-harness-user-id` 请求头发送，与遥测共享模式无关；`@deepseek-ai/dsh-command-feedback` 的 `/feedback` 确认文本也披露同一个 id——因此同一 home 下互不相关的会话可以通过这两条通道被关联起来。

base bundle 的 `cordis.patch.yml` 挂载 `@deepseek-ai/dsh-session-telemetry-otel` 时设置 `mode: !!js process.env.DSH_TELEMETRY_MODE || 'DISABLED'`，指向一个写死的生产采集端点（`https://harness-telemetry.deepseeksvc.com/v1/logs`），并可通过 `DSH_TELEMETRY_OTLP_URL` 覆盖。默认模式不发送任何内容，但 `FULL`/`FEEDBACK_ONLY` 只需一个环境变量即可触达；在这两种模式下，该 seam 本身不提供任何脱敏规则——一次已启用的导出会携带原始采集到的会话内容（消息文本、工具参数与结果、系统提示词、反馈文本）。

## 决策

新增可替换的、附加式的 Cordis 插件包，在 `packages/bundle/base/cordis.patch.yml` 中替换被选中的提供方，而不是就地修改原始包。唯一被直接修改的是 `packages/llm/llm-deepseek`，原因是没有任何新包能单独提供的那一项行为：在调用点按会话解析身份。`packages/feedback/command-feedback`、`packages/session/session-telemetry-otel` 与 `packages/identity/anonymous-user-id` 未被修改，也未被选中——保留在代码树中作为参考与回退选项；此外 `command-feedback` 仍然拥有 `feedback/record` 事件的声明权（见下文）。

### `command-feedback-local`（`packages/feedback/command-feedback-local`）

`command-feedback` 的替换实现：Cordis 插件名相同（`command-feedback`），`/feedback` 命令行为相同，同样是仅写入日志的 `feedback/record` 追加，确认文本的形状相同，包括 `Anonymous user: {id}` 一行以及从可选的 `sessionTelemetry` 服务（`ctx.get('sessionTelemetry')`）读取的会话共享披露。保留本地记录是刻意决定，不是疏漏：`session.append('feedback/record', …)` 从不离开进程，因此不携带任何外发行为；此前一个探索性分支曾完全移除本地记录，这里重新评估后予以否决。`Anonymous user: {id}` 一行同样是刻意保留的——它是本地文本，不是外发内容，并且与同一会话在其 LLM 请求头中发送的 id 保持一致。相对原始实现，唯一的行为变化是身份来源：改为新身份包提供的 `getOrCreateSessionAnonymousUserId(session.id)`，而不是按 home 持久化的 UUID。

### `session-anonymous-user-id`（`packages/identity/session-anonymous-user-id`）

一个普通库，不是 Cordis 插件：`getOrCreateSessionAnonymousUserId(sessionId): AnonymousUserId`。一个模块级的 `Map<SessionId, AnonymousUserId>` 在某个会话 id 首次出现时铸造一个 `randomUUID()`，同一进程内对该 id 的后续调用返回相同的值。不写任何磁盘文件，也不读取任何环境变量，这将身份的生命周期从"每个 Harness home 一个 UUID，永久有效"收紧为"每个会话 id 一个 UUID，存活至该进程结束"。该 Map 没有释放或淘汰路径；这是一个记录在案的已知限制，而不是补上的生命周期管理——之所以接受，是因为单个进程内预期的并发会话数量很小。

### `llm-deepseek` 的按会话身份解析（就地修改）

`DeepSeekAdapterOptions.resolveUserId` 从一个零参数闭包（在一个 adapter 实例内解析并缓存一次 id，`let userId; resolveUserId = () => userId ??= getOrCreateAnonymousUserId()`，实际效果是每个进程一次）改为 `resolveUserId: (sessionId: GenerateOptions['sessionId']) => AnonymousUserId`。`src/index.ts` 中的 `apply()` 现在在存在会话 id 时委托给 `getOrCreateSessionAnonymousUserId(sessionId)`，在不存在时铸造一个不缓存的 `randomUUID()`——会话之外的直接调用每次都会得到一个全新的 id，而不是占位符、缺失的请求头或进程级回退，因此一个无会话的调用方不会产生任何跨其自身多次调用可关联的身份。`sessionId` 在调用点（`DeepSeekAdapter.execute`，`packages/llm/llm-deepseek/src/adapter.ts`）已经作为 `GenerateOptions.sessionId` 存在于作用域中，下一行就用它设置 `x-deepseek-harness-session-id` 请求头。

### `session-telemetry-disabled`（`packages/session/session-telemetry-disabled`）

继承自 `@deepseek-ai/dsh-session-telemetry` 中未被修改的 `SessionTelemetryBackend` 抽象类；该 seam 包无需任何改动——为确认这一点，需要核实代码树中除 OTel 提供方之外没有其他生产代码构造 `SessionTelemetryCoordinator`。`sharing` 被固定为 `'disabled'`——不可配置，因为在该提供方上提供可配置模式会削弱选择它而非 `session-telemetry-otel` 的意义。`emit()` 是空操作，`shutdown()` 立即 resolve，该包不依赖任何 OpenTelemetry SDK，因此选中它移除的是导出能力本身，而不是让它处于休眠状态。

### Bundle 装配

`cordis.patch.yml` 中 `id: command-feedback` 与 `id: session-telemetry-otel` 两行保留原有行 id（patch 寻址不受影响），`name:` 改为指向两个新包；`DSH_TELEMETRY_MODE`/`DSH_TELEMETRY_OTLP_URL` 配置块及其注释随该行一起被移除，而不是留在原地休眠。`packages/bundle/base/package.json`、`packages/bundle/base/tests/base.spec.ts` 与 `tsconfig.host.json` 相应更新。`docs/config-catalog.md` 与 `apps/cli/composition.md` 根据新的选择重新生成。

### 对原始事件声明的仅类型依赖

`command-feedback-local` 的第一版草稿在自己的源码中重新声明了 `feedback/record` 的 `SessionEventMap` 扩展，理由是"被选中的生产方应当拥有该声明"。`gen-persistence-catalog.ts --check` 拒绝了这一版本：该 gate 在整个代码库范围内强制每个日志事件名恰好只有一个声明点，与某个 bundle 当前选中哪个提供方无关。修复方式是改为仅类型导入，`import type {} from '@deepseek-ai/dsh-command-feedback'`，与 `session-telemetry-otel` 中已经存在的同一模式保持一致。一个只替换现有事件背后运行时行为的替换包——事件表面相同，生产方不同——即便其原始运行时代码完全未被选中，仍然需要原始包作为仅类型依赖以支持声明合并。

## 考虑过的替代方案

- **就地修改三个原始包。** 否决：这会使 `command-feedback`、`anonymous-user-id` 与 `session-telemetry-otel` 失去作为参考与回退选项的作用，而三者中有两个本身没有其他需要修改的理由（`anonymous-user-id` 唯一的缺陷是作用域过大，`session-telemetry-otel` 唯一的缺陷是 bundle 的默认配置，而非其代码本身）。
- **完全移除本地反馈记录**，这是此前一个探索性分支曾采用的做法。否决：`session.append('feedback/record', …)` 从不离开进程，因此不携带任何外发行为，移除它只会放弃一份可正常工作的本地反馈日志，却换不来任何隐私收益。
- **`command-feedback-local` 声明自己的 `feedback/record` 事件。** 被 `gen-persistence-catalog.ts --check` 拒绝；由上文所述的、从原始包做仅类型导入的方案替代。
- **对无会话的 DeepSeek 调用省略 `x-deepseek-harness-user-id` 请求头，或发送一个固定占位符。** 否决，改为对每次调用铸造一个不缓存的 `randomUUID()`：固定占位符或缺失请求头都更简单，但所选的"每次调用生成新 id"的行为可以保证一个无会话的调用方永远不会因自身多次请求而被关联，而共享占位符做不到这一点。
- **在 `session-telemetry-disabled` 上提供可配置的 `sharing` 值。** 否决：一个专门为保证不发生导出而被选中的提供方，不应该携带一个可能重新引入导出的开关。
- **为 `session-anonymous-user-id` 的进程本地 Map 添加释放或淘汰逻辑。** 目前否决：当前没有任何调用方需要它，且单个进程内预期的不同会话数量很小；因此将其记录为已知限制，而不是在没有实际需求前先行构建。

## 后果

默认部署不会向任何外部采集端发送会话内容，也不会发送任何可跨会话关联的身份：base bundle 不再引用 `DSH_TELEMETRY_MODE`、`DSH_TELEMETRY_OTLP_URL` 或生产 OTLP 端点，`session-telemetry-otel` 的 OpenTelemetry SDK 依赖在当前选择下不可达。重新启用上报需要在 `cordis.patch.yml` 中把提供方换回 `session-telemetry-otel`，并自行配置 `mode`/`exporter`，而不是在交付的默认配置上设置一个环境变量。

`/feedback` 确认文本与 DeepSeek 请求头都使用按会话限定的 id，而不是按 home 持久化的 id：同一个 `$DSH_HOME` 下互不相关的会话不再共享身份，而且同一会话的 id 在进程重启后也不会存活——这是相对之前持久化 id 的一项能力损失，是有意为之的取舍。

`command-feedback`、`anonymous-user-id` 与 `session-telemetry-otel` 仍保留在代码树中，未被修改，既是回退路径，对 `command-feedback` 而言也是 `feedback/record` 的唯一声明点；只有 `llm-deepseek` 携带一处直接行为修改，范围限定在 `resolveUserId` 的签名及其唯一调用点。

针对所有被改动和新增包的完整测试套件、`typecheck` 与 `doc-sync`（持久化目录、配置目录、文档关系图）在此状态下均通过。
