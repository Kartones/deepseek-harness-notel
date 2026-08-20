# @deepseek-ai/dsh-web-search-marginalia

[English](README.md) | 中文

由 [Marginalia Search](https://about.marginalia-search.com/article/api/) 支持的 `WebSearchProvider`，用于 harness [web 能力 seam](../web/README.md)（`ctx.web`）。它发送带有查询字符串和 `API-Key` 标头的 `GET {baseURL}/search`，再将 Marginalia 的 JSON `results[]` 映射为 seam 规范化的 `WebSearchResult`。

此实现包将 `marginalia` 搜索提供方注册到 `ctx.web`，通过可选的 `ctx.credentials` 服务为每次搜索解析凭据，并在存在发起请求的 Agent 会话时记录不含密钥的请求。它不注册面向模型的工具，也不依赖 `ctx.llm`。

## 安装

此包需要显式启用。它未挂载到随附的 base bundle，安装它也不会改变随附的 `deepseek-official` 选择。使用源码检出时，在仓库根目录运行 `pnpm install`；该工作区已包含此包。对于 profile 或其他包，请通过 `pnpm add @deepseek-ai/dsh-web-search-marginalia` 将已发布的包加入该解析器清单。

在 profile 的 `cordis.yml` 或 `cordis.patch.yml` 中添加提供方条目并选中它：

```yaml
- id: web
  config:
    searchProvider: marginalia

- id: web-search-marginalia
  name: '@deepseek-ai/dsh-web-search-marginalia'
  config:
    apiKeyEnv: MARGINALIA_API_KEY
```

提供方条目注册到现有的 `web` 服务。`searchProvider` 按 id 选择一个活动提供方，不会合并提供方。将其显式设为 `marginalia`，才能把 `web_search` 调用路由到这里。仅安装此包不会改变随附的 `deepseek-official` 提供方。

## 配置

| 配置键 | 默认值 | 含义 |
|---|---|---|
| `apiKey` | 未设置 | Marginalia API 密钥字面值。优先使用 `apiKeyEnv`，避免密钥进入配置；非空字面值优先。 |
| `apiKeyEnv` | `MARGINALIA_API_KEY` | 每次搜索都会通过 `ctx.credentials` 服务解析该凭据引用；没有该服务时则从启动环境解析。值缺失时，调用以 `WEB_PROVIDER_CREDENTIAL_MISSING` 失败。 |
| `baseURL` | `https://api2.marginalia-search.com` | API 基址；追加 `/search`。缺省时回退到环境层中的 `$MARGINALIA_SEARCH_BASE_URL`。无法解析时提供方不可用。 |
| `resultsPerDomain` | 未设置 | 设置后作为 Marginalia 的 `dc` 参数发送，取值为 1 到 100 的正整数。 |

设置段会为每次搜索重新投影，因此存储的凭据或端点变更会在下一次调用生效，无需重新注册提供方。`apiKey` 带有 `role('secret')`，不会出现在描述的设置层中。

### 共享的 `public` 开发密钥

Marginalia 在其 [API 文档](https://about.marginalia-search.com/article/api/)中说明了用于集成开发的字面量 `public` 密钥。请在提供方配置中用 `apiKey: public` 明确选择它。harness 从不自动选择该密钥：缺少已配置凭据时会以 `WEB_PROVIDER_CREDENTIAL_MISSING` 失败。它的速率限制由所有使用者共享，耗尽时返回 HTTP 503，且不能使用自定义搜索过滤器。

## 映射

Marginalia 的 `results[]` 条目将 `url` 映射为 `url`，将非空 `title` 映射为 `title`，将非空 `description` 映射为 `snippet`。没有非空 URL 的条目会被跳过。该 API 不提供日期或提供方答案文本，因此省略 `publishedAt` 和 `content`。空 `results[]` 是有效的空搜索结果。

提供 `WebSearchRequest.maxResults` 时，`count` 由它派生并限制在 1 到 100；`resultsPerDomain` 映射为 `dc`。web 服务仍会截断返回的 `sources[]` 并设置 `truncated`，以强制执行 `maxResults`；在该 seam 级别限制之前，提供方返回 `truncated: false`。提供方失败变为 `WEB_PROVIDER_ERROR`；调用方取消变为 `WEB_ABORTED`。HTTP 重定向会在接触 `Location` 目标前失败。

## 请求日志

由发起请求的 Agent 执行的搜索会在发出请求前一刻追加仅用于日志的 `web/marginalia-search-request` 会话事件。它记录不含查询字符串的端点、未编码查询，以及可选的 `count` 和 `resultsPerDomain`；不记录标头和凭据。发出请求前发生凭据失败或取消时不会创建事件；后续 HTTP 或响应失败仍会保留这次请求。Agent 之外的直接程序调用没有可记录的发起会话。

## 模型体验

### Marginalia 提供方请求

#### 模型看到的内容

无。Marginalia 搜索是 HTTP 检索请求，不是辅助模型轮次。

#### Token 影响

提供方请求直接产生的模型 token 为零。

#### KV Cache 影响

不会发起模型请求，因此此提供方请求不直接影响 KV Cache。

### 间接的会话工具结果

#### 模型看到的内容

通过 [`dsh-tool-web`](../tool-web/README.md)，会话模型会看到返回的 URL、标题和 snippet。提供方不提供答案文本或日期。错误包装由消费方负责。

#### Token 影响

注册不会直接产生会话 token。结果 token 随返回源和 snippet 增长，随后 web 服务强制执行请求的源数量上限。

#### KV Cache 影响

仅追加。新可见的工具结果位于可复用请求前缀之后，不会使现有 KV Cache 条目失效。

## 已知限制与暂缓事项

- **需要显式安装和选择** — 此包不是随附的默认提供方；添加其提供方条目并设置 `searchProvider: marginalia` 后才会提供搜索。
- **没有来源日期或答案字段** — Marginalia 不提供这两者，因此始终省略 `publishedAt` 和 `content`。
- **`maxResults` 有两层限制** — 提供方发送经过限制的 `count`，然后 web 服务再次截断结果。
- **免费和非商业密钥带有署名义务** — harness 不会展示 Marginalia 的 CC-BY-NC-SA 条款。
- **共享的 `public` 密钥可能被限流** — 耗尽时表现为 HTTP 503。
- **错误响应体未公开文档** — 非成功响应只报告 HTTP 状态行。
