# Project Status

> 状态日期：2026-07-14
> `create_task` V2（Phase 1 Inbox + Phase 2B Project placement）生产验收与正式启用均已完成

本页只记录当前可由代码、测试、Accepted ADR 或已冻结文档支持的状态，不把后续方向写成已实现能力。

## 已完成

- Task、Project、Completion、Lean Snapshot 和 Tag Discovery 五个 Domain Layer。
- `get_task`、`get_project`、`get_completed_since`、`get_lean_snapshot`、`search_tags` 五个 Domain read tools。
- 五个 Domain Tool 的成功输出 `outputSchema`、运行时验证 `structuredContent` 和兼容 JSON 文本输出。
- Planned/Due direct-owner 语义；inherited facts 保留但不生成重复 attention。
- Lean Snapshot 的独立 section、完整 total、确定性排序和独立截断。
- `personal-production` server-side curated capability boundary：注册五个 Domain read tools（含 `search_tags`）和一个受严格 runtime flag 保护的 `create_task` V2，不注册 Resources；未设置环境变量时默认使用该 Profile。
- `upstream-full` 兼容 Profile：保留 16 个 tools、6 个 Resources，其中包括 7 个 mutation tools。
- 当前 GPT Tool routing、ChatGPT App Instructions 和 Tunnel/LaunchAgent 运维文档。
- `personal-production` 重构已部署；`create_task` Checkpoint 6A/6B/6C 已通过。Checkpoint 7 corrected Schema 的 Refresh/禁写门禁通过后，LaunchAgent 已 fail-closed 正式恢复并加载 `OMNIFOCUS_CREATE_TASK_ENABLED=true`，health/ready 与 watchdog 正常。
- `create_task` Checkpoint 7 已完整通过：公开 Web 单次创建/ID 回读、服务器 ID/name 同对象、audit、Ledger、无锁、人工删除、双 `not_found` 与最终生产健康全部验收通过。
- `create_task` Phase 2B 已通过设计、实现、禁写客户端门禁和隔离生产 Canary：Project 顶层 Task 的 `project.id` 与 `parentId` 均精确等于 requested Project root ID；人工删除后的 ID/name 双 `not_found`、Ledger、audit、权限和无锁终检通过。
- 用户独立批准 Phase 2B 正式启用；fail-closed reload 后 plist/loaded global 与 Project flags 均为 `true`，Tunnel status healthy、health/ready 与 watchdog 通过，启用过程未创建 Task。
- Phase T1 既有 Tag 结构化发现的设计、实现、MCP protocol、canonical ID capability probe、真实只读和 T1-D 生产注册验收全部通过；`search_tags` 已进入 `personal-production`，生产为精确六 Tool、Resources absent，唯一 mutation 仍为 `create_task`。
- T1-D App Refresh 与“创建任务并添加一个现有 Active Tag”负向路由在 global fail-closed 下通过；模型明确拒绝静默丢弃 Tag 要求，真实 exact-name readback 为 `not_found`。随后 global/Project flags 已恢复为 `true/true`，health/ready 正常。

## 进行中

- 无；Phase T1 已完成，下一阶段须独立设计和批准。

## 已决定但未实施

- Full Snapshot MCP 当前暂缓；低频完整分析走手动/plugin/file 导出，只有真实重复需求出现才复审。
- Action 暂时留在 Task Domain；没有独立 `ActionView` 或 `get_action`。
- 任何未来显式 mutation gateway 必须先定义用户授权、preview/confirmation、有限 mutation set、审计、失败/回滚和重复保护。
- Phase T2 Tag 写入必须独立设计和批准，不因 T1 完成自动获得授权。

## 待设计

- Phase T2 Tag 写入：canonical ID 实时重验、Active-only、最多 5 个、去重/互斥与 ID readback 仍待独立设计。

## 明确不在当前范围

- 当前公开生产写入仅限显式调用 `create_task` 创建一个 Task，destination 必须为 Inbox 或单个 exact Active Project；不得名称解析、猜测 ID 或回落 Inbox。
- parent、Tag 写入、batch、repeat、notifications、update/delete 仍未授权；`search_tags` 仅是只读发现。
- 当前没有承诺 AI 自动决策、自动编辑/完成/删除或把分析结果自动写回 OmniFocus。

## 当前节点

| 工作项 | 当前状态 | 证据 |
|---|---|---|
| `personal-production` | 已部署；默认 Profile；当前生产为五个 Domain read tools + 正式启用的 `create_task` V2，精确六 Tool、Resources absent | profile/registration 代码与测试、部署 status、精确 Tool 协议与生产验收 |
| 旧 `personal-readonly` 值 | 已移除且不提供 alias | resolver invalid-value tests、部署配置 |
| `create_task` V2 | Phase 1 Inbox 与 Phase 2B Project placement 均正式启用；global/Project flags 正常生产值为 `true`，health/ready/watchdog 正常 | ADR-006、Checkpoint 6A/6B/6C/7、Phase 2A design、Phase 2B acceptance 与正式 enablement 记录 |
| Tag Phase T1 | T1-A/B/C/D 全部通过；`search_tags` 已注册和部署，负向路由未创建无 Tag Task | Phase T1 design、748 tests、26/26 ID roundtrip、Phase T1 acceptance、exact-name `not_found` |
| Legacy Tag | full-only `list_tags`/`create_tag` 保持不变；`create_tag` 永久不进入个人 Profile | registration 代码与测试 |

详细证据见 [SOURCE_MAP.md](./SOURCE_MAP.md)。
