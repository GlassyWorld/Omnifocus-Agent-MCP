# personal-production Profile Status

## 已实现边界

- 当前代码只支持 `personal-production` 和 `upstream-full`；旧 `personal-readonly` 值无 alias。
- 未设置或空的 `OMNIFOCUS_MCP_PROFILE` 默认解析为 `personal-production`，`upstream-full` 只能显式启用。
- `personal-production` 当前精确注册 `get_task`、`get_project`、`get_completed_since`、`get_lean_snapshot`，不注册 Resources。
- 提交 `4850367` 未增加任何写入 Tool；LaunchAgent 和 ChatGPT App 的实际部署迁移需要人工执行。

## 当前判断

`personal-production` 是面向个人日常 ChatGPT App 的长期精选生产能力集合。当前阶段的注册集合仍然只读；名称不承诺永久只读，也不代表写入能力已经存在。Server-side profiles allowlist 是能力边界，Instructions 只负责行为引导。

## 后续扩展仍需回答

- 未来是否需要增加受控 mutation Tool，以及它的精确能力范围？
- 写入授权、preview/confirmation、审计、幂等和失败恢复如何强制？
- 已部署 App/Tunnel/LaunchAgent 如何验证和回滚？
- 如何保持 `upstream-full` compatibility surface？

本次重构不回答未来写入设计问题，也不授权实现任何 mutation。当前来源见 [PROJECT_STATUS](../../PROJECT_STATUS.md) 和 [SOURCE_MAP](../../SOURCE_MAP.md)。
