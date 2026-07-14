# personal-production Profile Status

## 已实现边界

- 当前代码只支持 `personal-production` 和 `upstream-full`；旧 `personal-readonly` 值无 alias。
- 未设置或空的 `OMNIFOCUS_MCP_PROFILE` 默认解析为 `personal-production`，`upstream-full` 只能显式启用。
- `personal-production` 当前精确注册 `get_task`、`get_project`、`get_completed_since`、`get_lean_snapshot`、`search_tags` 和 `create_task`，不注册 Resources。
- `create_task` V3 的 Inbox、exact Active Project 与既有 Active Tag assignment 已通过分阶段门禁；当前 loaded global/Project/Tag=`true/true/true`。

## 当前判断

`personal-production` 是面向个人日常 ChatGPT App 的长期精选生产能力集合。当前唯一 mutation Tool 是受严格 flags、实时验证、Ledger、audit 和 lock 保护的 `create_task`；其余五个 Tool 均只读。Server-side profiles allowlist 是能力边界，Instructions 只负责行为引导。

## 后续扩展仍需回答

- Phase 4 ordinary parent placement 是否在后续独立设计、风险评审和授权后进入？
- 任何新 mutation 如何继续强制授权、preview/confirmation、审计、幂等和失败恢复？
- 已部署 App/Tunnel/LaunchAgent 如何持续验证和回滚？
- 如何保持 `upstream-full` compatibility surface？

当前来源见 [PROJECT_STATUS](../../PROJECT_STATUS.md) 和 [SOURCE_MAP](../../SOURCE_MAP.md)。现有 `create_task` 不授权 parent、Tag CRUD、edit、move、complete、delete 或 batch。
