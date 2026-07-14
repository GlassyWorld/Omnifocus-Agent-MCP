# Project Status

> 状态日期：2026-07-15
> `create_task` V3 的 T2-A/B/C/D/E 已通过；当前 global=true、Project=true、Tag=true

本页只记录当前可由代码、测试、Accepted ADR 或已冻结文档支持的状态，不把后续方向写成已实现能力。

## 已完成

- Task、Project、Completion、Lean Snapshot 和 Tag Discovery 五个 Domain Layer。
- `get_task`、`get_project`、`get_completed_since`、`get_lean_snapshot`、`search_tags` 五个 Domain read tools。
- 五个 Domain Tool 的成功输出 `outputSchema`、运行时验证 `structuredContent` 和兼容 JSON 文本输出。
- Planned/Due direct-owner 语义；inherited facts 保留但不生成重复 attention。
- Lean Snapshot 的独立 section、完整 total、确定性排序和独立截断。
- `personal-production` server-side curated capability boundary：注册五个 Domain read tools（含 `search_tags`）和一个受严格 runtime flags 保护的 `create_task` V3，不注册 Resources；未设置环境变量时默认使用该 Profile。
- `upstream-full` 兼容 Profile：保留 16 个 tools、6 个 Resources，其中包括 7 个 mutation tools。
- 当前 GPT Tool routing、ChatGPT App Instructions 和 Tunnel/LaunchAgent 运维文档。
- `personal-production` 重构已部署；`create_task` Checkpoint 6A/6B/6C 已通过。Checkpoint 7 corrected Schema 的 Refresh/禁写门禁通过后，LaunchAgent 当时已 fail-closed 正式恢复并加载 `OMNIFOCUS_CREATE_TASK_ENABLED=true`，health/ready 与 watchdog 正常。
- `create_task` Checkpoint 7 已完整通过：公开 Web 单次创建/ID 回读、服务器 ID/name 同对象、audit、Ledger、无锁、人工删除、双 `not_found` 与最终生产健康全部验收通过。
- `create_task` Phase 2B 已通过设计、实现、禁写客户端门禁和隔离生产 Canary：Project 顶层 Task 的 `project.id` 与 `parentId` 均精确等于 requested Project root ID；人工删除后的 ID/name 双 `not_found`、Ledger、audit、权限和无锁终检通过。
- 用户独立批准 Phase 2B 正式启用；fail-closed reload 后 plist/loaded global 与 Project flags 均为 `true`，Tunnel status healthy、health/ready 与 watchdog 通过，启用过程未创建 Task。
- Phase T1 既有 Tag 结构化发现的设计、实现、MCP protocol、canonical ID capability probe、真实只读和 T1-D 生产注册验收全部通过；`search_tags` 已进入 `personal-production`，生产为精确六 Tool、Resources absent，唯一 mutation 仍为 `create_task`。
- T1-D App Refresh 与“创建任务并添加一个现有 Active Tag”负向路由在 global fail-closed 下通过；模型明确拒绝静默丢弃 Tag 要求，真实 exact-name readback 为 `not_found`。随后 global/Project flags 已恢复为 `true/true`，health/ready 正常。
- Phase T2-C 仓库实现已完成：公开 V3 `tagIds` input/output Schema、global→Project→Tag fail-closed handler、双分支 success parser、Tool/Server/App Instructions 和 MCP protocol tests 全部通过；真实 Base64 transport 零写入探针 exact roundtrip 且未触发 mutation。
- Phase T2-C 禁写部署已完成：loaded flags 精确为 global=false、Project=true、Tag=false；Tunnel status healthy、healthz=live、readyz=ready、watchdog loaded，本机 STDIO 验收确认六 Tool、Resources absent、V3 Schema/Instructions 与 global/Tag fail-closed 响应。
- Phase T2-C App Refresh 与客户端负向路由已通过：客户端实时使用 `search_tags` 确认唯一 Active Tag，保留 Tag 要求调用 V3 后得到 `write_disabled` / `mayHaveWritten=false`；未静默创建无 Tag Task，exact-name pre/post 均为 `not_found`，Ledger 未变、audit allowlist 正确、无残留 lock。
- 既有 Inbox/Project 写入已恢复：loaded global/Project/Tag=`true/true/false`，Tunnel healthy、healthz=live、readyz=ready、watchdog loaded；恢复过程未创建 Task。
- Phase T2-D 两条 Canary 均已闭环：tagged Inbox 与 tagged Project 各自仅单次创建，exact Tag/placement/readback、Ledger/audit/lock、Tag projection、用户人工确认/删除与 ID/name 双 `not_found` 全部通过；Project 计数恢复到创建前值。
- Phase T2-E 已按独立授权正式启用：fail-closed 阶段加载 global/Project/Tag=`false/true/true`，最终 plist/loaded environment 均为 `true/true/true`；Tunnel、六 Tool/零 Resources/唯一 mutation、Schema/annotations 与零写入证据全部通过。

## 进行中

- 无。Phase T2 已完成，Phase 4 ordinary parent placement 继续暂缓。

## 已决定但未实施

- Full Snapshot MCP 当前暂缓；低频完整分析走手动/plugin/file 导出，只有真实重复需求出现才复审。
- Action 暂时留在 Task Domain；没有独立 `ActionView` 或 `get_action`。
- 任何未来显式 mutation gateway 必须先定义用户授权、preview/confirmation、有限 mutation set、审计、失败/回滚和重复保护。
- Phase T2 第二版设计与 ADR-006 amendment 已接受；T2-B/C/D/E 均已闭合。

## 待实施

- Phase 4：只有在 T2 稳定运行后，才可另行设计、风险评审和授权 ordinary parent Task placement；当前不进入实现。

## 明确不在当前范围

- 当前公开生产写入仅限显式调用 `create_task` 创建一个 Task，destination 必须为 Inbox 或单个 exact Active Project；可选 1–5 个 freshly-discovered、ancestor-active、非互斥的既有 Tag canonical IDs。不得名称解析、猜测 ID、自动创建 Tag、静默省略 Tag 或回落 Inbox。
- parent、已存在 Task 的 Tag 编辑、Tag CRUD、batch、repeat、notifications、update/delete 仍未授权。
- 当前没有承诺 AI 自动决策、自动编辑/完成/删除或把分析结果自动写回 OmniFocus。

## 当前节点

| 工作项 | 当前状态 | 证据 |
|---|---|---|
| `personal-production` | 已部署；默认 Profile；五个 Domain read tools + `create_task` V3，精确六 Tool、Resources absent；global/Project/Tag=`true/true/true` | profile/registration 代码与测试、loaded flags、Tunnel status、本机 MCP 协议验收 |
| 旧 `personal-readonly` 值 | 已移除且不提供 alias | resolver invalid-value tests、部署配置 |
| `create_task` V2 baseline | Phase 1 Inbox 与 Phase 2B Project placement 均已正式验收；T2-C 后已恢复 global/Project=`true/true` | ADR-006、Checkpoint 6A/6B/6C/7、Phase 2A design、Phase 2B acceptance 与正式 enablement 记录 |
| Tag Phase T1 | T1-A/B/C/D 全部通过；`search_tags` 已注册和部署，负向路由未创建无 Tag Task | Phase T1 design、748 tests、26/26 ID roundtrip、Phase T1 acceptance、exact-name `not_found` |
| Tag Phase T2 | T2-A/B/C/D/E 已通过；Inbox/Project Canary 均完成验证和清理，Tag assignment 已正式启用 | Phase T2 design、[T2-C acceptance](./design/create-task/PHASE_T2C_TAG_ASSIGNMENT_CLIENT_GATE_ACCEPTANCE.md)、[T2-D Canary acceptance](./design/create-task/PHASE_T2_TAG_ASSIGNMENT_CANARY_ACCEPTANCE.md)、[T2-E acceptance](./design/create-task/PHASE_T2_TAG_ASSIGNMENT_FORMAL_ENABLEMENT_ACCEPTANCE.md)、58 files / 828 tests、build/JXA/diff、loaded flags、Tunnel/MCP checks |
| Legacy Tag | full-only `list_tags`/`create_tag` 保持不变；`create_tag` 永久不进入个人 Profile | registration 代码与测试 |

详细证据见 [SOURCE_MAP.md](./SOURCE_MAP.md)。
