# Agent Note: 可选启用的 Marginalia 网页搜索提供方

Status: implemented

[English](2026-08-20-web-search-marginalia-provider.md) | 中文

## 问题

`ctx.web` 搜索 seam 已提供 DeepSeek 原生搜索、Exa 与 Perplexity 的提供方选项，但没有基于 [Marginalia Search](https://about.marginalia-search.com/article/api/) 的提供方——这是一个拥有独立小型索引、文档完善的 HTTP API，并为集成开发提供共享 `public` key 的搜索引擎。

最初的调研将此定位为一次**默认替换**：在 `packages/bundle/base/cordis.patch.yml` 中挂载新提供方，并将 `web-search-deepseek` 从已交付的 `searchProvider` 中退役。该范围在实现前被收窄。Marginalia 不提供与 DeepSeek 相当的 key——DeepSeek 的提供方复用了 LLM 调用本身就需要的凭据；而替换默认提供方会导致 `web_search` 在默认情况下就以 `WEB_PROVIDER_CREDENTIAL_MISSING` 失败，直到运维者配置 `MARGINALIA_API_KEY` 为止，这是对默认部署可用搜索能力的一次倒退。用户指示改为新增一个可选启用的附加包，保持已交付的默认提供方选择不变。

## 决策

`@deepseek-ai/dsh-web-search-marginalia`（`packages/web/web-search-marginalia`）在 `ctx.web` 中以 id `marginalia` 注册一个 `WebSearchProvider`，与现有提供方并存。它不修改 `packages/bundle/base/cordis.patch.yml`；已交付的默认 `searchProvider` 保持不变。启用它需要对某个 profile 的 `cordis.yml`/`cordis.patch.yml` 做两处修改：添加该提供方的插件行，然后设置 `searchProvider: marginalia`。这记录在该包 README 的 `## Installation` 一节中。

### 凭据处理方式与 `web-search-deepseek` 一致

`src/index.ts` 中的 `resolveOptions()` 为提供方提供一个 `resolveApiKey` 闭包，在每次搜索时通过 `ctx.credentials` 解析（`credentialRef(config.apiKeyEnv ?? 'MARGINALIA_API_KEY')`），当未挂载凭据服务时回退到 `launchEnvironmentOf(ctx)`；一个非空的字面量 `config.apiKey` 优先于以上两者。`apiKey` 携带 `role('secret')`，`apiKeyEnv` 携带 `role('credential-ref')`，因此字面量 key 永远不会出现在任何已描述的 settings 层中。缺失凭据会明确失败，抛出 `WEB_PROVIDER_CREDENTIAL_MISSING`，并指明该凭据引用以及提供值的三种方式。`API-Key` HTTP 请求头是该凭据唯一存在的位置：它不出现在请求 URL 中（Marginalia 的新版 API 不支持查询参数鉴权），也不会进入会话事件、`WebError` 消息或渲染后的工具输出。HTTP 重定向会以 `WEB_PROVIDER_ERROR` 失败（`redirect: 'error'`），而不是被跟随，并由一个真实的回环服务器回归测试套件（`tests/redirect.spec.ts`）覆盖，符合 `packages/web/AGENTS.md` 的要求。

### 共享的 `public` 开发 key 仅可显式选用，绝非回退项

Marginalia 文档记录了一个用于集成开发的字面量 `public` key，由所有使用者共享限流，触及限流后返回 HTTP 503，且不能使用自定义搜索过滤器。该提供方绝不会自动选用它；调用方必须显式设置 `apiKey: public`。`tests/marginalia.spec.ts` 将这一点固定下来以防意外默认漂移：在没有字面量 key 且无法解析出凭据的情况下会抛出 `WEB_PROVIDER_CREDENTIAL_MISSING`，而不会回退到 `public`。

### 会话事件 `web/marginalia-search-request`

一个 `SessionEventMap` 成员记录端点（不含查询字符串）、未编码的查询内容，以及可选的 `count`/`resultsPerDomain`，在存在发起该操作的 Agent 会话时，于请求发出前立即追加（`ctx.get('agents')?.currentInitiator()?.session.append(...)`）。该类型上没有请求头或凭据字段，因此不存在泄漏进日志的可能。`tests/marginalia.spec.ts` 通过精确的深度相等断言记录下来的事件，因此任何新增字段都会导致测试失败。`SESSION_FORMAT_VERSION` 保持为 `0`：这只是新增一个仅写日志的事件，不涉及结构或信封格式的变化。`docs/persistence-catalog.md`/`.zh.md` 与 `packages/core/session/src/known-event-types.ts` 通过 `pnpm run gen-persistence-catalog` 重新生成。

### 响应映射

Marginalia 的 `results[].url/title/description` 映射到 `WebSearchSource.url/title/snippet`；缺失或为空的 `url` 会被跳过，空的 `title`/`description` 会被省略而不是以空字符串发送。Marginalia 文档记录的响应中不含日期或回答文本字段，因此 `publishedAt` 与 `content` 始终保持缺省。空的 `results[]` 会返回 `{ sources: [], truncated: false }` 而不是错误——这与 `web-search-deepseek` 严格模式下的错误处理刻意不同，后者的错误含义（"原生搜索从未被触发"）在这里并不适用。当响应体的 `results` 缺失或不是数组时，返回 `WEB_PROVIDER_ERROR`。不做任何去重处理：Marginalia 文档记录的响应中没有任何迹象表明会出现重复 URL，因此去重处理只是一种推测性行为。`count` 按每次调用从 `WebSearchRequest.maxResults` 派生，并被裁剪到 Marginalia 文档记录的 1–100 范围内，而不是作为一个独立的配置字段存在。

### 没有 UI 设置卡片，也没有应用层 e2e 测试

Web UI 的设置卡片与 `apps/web` 的浏览器 e2e 覆盖在最初的调研中被规划为任务 T6/T7，但在实现前被放弃——原因是发现本仓库现有的、同样仅可选启用的提供方 `web-search-perplexity` 两者都没有。包级别测试是本仓库对"非已交付默认提供方"已经确立的覆盖模式：`packages/web/web-search-marginalia/tests/` 下有 25 个测试（响应映射、可用性、请求与凭据安全、重定向安全、settings 投影、插件注册/卸载），外加一个在缺少 `MARGINALIA_API_KEY` 时自动跳过的真实 API 探测测试 `tests/marginalia.e2e.ts`。

## 考虑过的替代方案

- **将 `web-search-deepseek` 替换为已交付的默认提供方。** 否决：已交付的默认提供方同样离不开 API key。将新搜索提供方作为可选启用的插件发布，符合本项目"一切皆插件"的架构理念。
- **将 `public` Marginalia key 作为 harness 的默认值或回退项发布。** 否决：这是 Marginalia 自己为集成开发提供的共享社区 key，明确不是生产凭据；harness 只在显式选用 `apiKey: public` 时才会使用它。
- **在本次改动中添加 Web UI 设置卡片与 `apps/web` e2e 覆盖**（最初调研中的 T6/T7）。推迟：本仓库现有的、同样仅可选启用的提供方 `web-search-perplexity` 两者都不具备，因此包级别测试是这里已经确立的、完整的覆盖模式；如果将来把某个提供方设为已交付的默认值，才会新增需要两者的场景。
- **可配置的 `count`/`timeout`/`page`/`nsfw`/`filter` 查询参数。** 依据"要求有当前的所有者与需求"原则否决：`count` 由 `WebSearchRequest.maxResults` 派生而非作为开关存在，其余参数当前没有任何使用方；日后添加只需改动配置。
- **按 URL 对 `results[]` 去重。** 否决：Marginalia 文档记录的响应中没有任何迹象表明会出现重复 URL，去重处理只是一种推测性行为。

## 后果

一个从未添加 `web-search-marginalia` 提供方行、也从未设置 `searchProvider: marginalia` 的部署不会有任何行为变化；已交付的默认搜索提供方不受影响。选择启用需要运维者配置 `MARGINALIA_API_KEY`（或刻意选用共享且限流的 `public` key）——这与已交付的默认提供方不同，后者复用了 LLM 调用本身就需要的凭据。

该提供方没有 Web UI 设置卡片，也没有应用层浏览器 e2e 测试。未来若决定将 Marginalia 设为已交付的默认提供方，需要按照该包在其他方面所遵循的 `web-search-deepseek` 模式，补齐这两者。

`MarginaliaSearchRequest` 的线上数据形状仅依据 Marginalia 已发布的 API 文档验证：`tests/marginalia.e2e.ts` 在缺少 `MARGINALIA_API_KEY` 时会自动跳过，本次改动未针对真实端点执行过该测试。错误响应体未有文档记录，因此非 OK 响应只能报告其 HTTP 状态行。

`web/marginalia-search-request` 是一个新增的仅写日志 `SessionEventMap` 成员，`SESSION_FORMAT_VERSION` 保持为 `0` 不变；由于两个 SDK 都不枚举该事件，两者的预期输出均无需变更。
