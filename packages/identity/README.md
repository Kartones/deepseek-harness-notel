# identity/ — shared identity

English | [中文](README.zh.md)

Identity values shared across product domains. These values do not represent an authenticated account.

| Package | Role | ctx key |
|---|---|---|
| [`anonymous-user-id/`](anonymous-user-id/README.md) | Persists one anonymous Harness-home correlation id for telemetry, feedback, and DeepSeek requests | — |
| [`session-anonymous-user-id/`](session-anonymous-user-id/README.md) | Mints one process-local anonymous id for each session | — |
