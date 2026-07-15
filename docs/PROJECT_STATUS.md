# 项目当前状态

> 状态日期：2026-07-15
> 本文件用途：记录当前仓库事实与能力边界，作为 Codex 和维护者的当前状态导航页。
> 本文件不替代代码、测试、ADR、设计文档或验收记录。

## 真实状态判断顺序

当文档之间出现冲突时，按以下顺序判断：

1. 当前代码与测试
2. 已接受 ADR 及其 amendment / 冻结契约
3. 最新验收记录
4. 当前状态文档
5. 设计文档
6. 历史草案、工程日志和过往讨论

不要直接把旧 Phase 文档中的限制理解为当前能力。旧文档可能描述的是当时的阶段边界，而不是当前生产状态。

## 当前 Profile 选择

Profile 选择逻辑由代码定义，修改文档前必须重新确认。

当前代码事实：

- `src/config/serverProfile.ts` 定义 `resolveServerProfile`
- unset、空字符串或纯空白 `OMNIFOCUS_MCP_PROFILE` 当前解析为 `personal-production`
- 当前支持的 Profile 为：
  - `personal-production`
  - `upstream-full`
- `src/serverRegistration.ts` 负责根据选定 Profile 注册对应 Tool 和 Resource

## 当前生产 Profile

当前生产 Profile：

```text
personal-production
```

当前 MCP surface：

Read tools：

- `get_task`
- `get_project`
- `get_completed_since`
- `get_lean_snapshot`
- `search_tags`

Mutation tools：

- `create_task`

`create_task` is the only mutation capability exposed by `personal-production`.

Resources：

- 无

当前注册事实应优先通过以下文件确认：

- `src/serverRegistration.ts`
- `src/serverRegistration.test.ts`

## 已实现能力

Domain read 能力：

- Task reading
- Project reading
- Completed history
- Lean Snapshot
- Tag discovery

受控创建能力：

- Inbox task creation
- exact Active Project placement
- existing Active Tag assignment by canonical ID
- ordinary parent placement where parent kind is Action Group

`create_task` 当前支持的任务字段包括：

- 任务名称
- 备注 / note
- planned / due / defer 时间
- flagged
- estimated minutes
- destination
- optional tag IDs
- idempotency key

安全机制：

- strict public schema
- 显式 destination
- Project / Parent / Tag 均使用 canonical ID
- runtime feature gates
- idempotency key
- Ledger / replay semantics
- mutation lock
- exact readback verification
- `mayHaveWritten` 错误语义
- fail-closed disabled response

## 当前 `create_task` 边界

允许范围，仅限用户明确请求创建一个 OmniFocus Task 时：

- 在 Inbox 创建一个 Task
- 在一个 exact Active Project 中创建一个 Task
- 在一个 freshly-read exact eligible ordinary Action Group 下创建一个 Task
- 可选添加 1-5 个 freshly-discovered existing Active Tag canonical IDs
- 可选写入备注 / note
- 可选写入 plannedDate、dueDate、deferDate、flagged、estimatedMinutes

不允许范围：

- 使用 Project name 或 path 作为 mutation identity
- 使用 Parent name 或 path 作为 mutation identity
- fuzzy matching
- 目标不明确时 fallback 到 Inbox 或 Project
- parent placement under leaf Action
- Project Root 作为 Parent placement 目标
- 自动创建 Tag
- 静默省略用户要求的 Tag
- 编辑已有 Task
- 移动或 reparent 已有 Task
- complete / delete
- repeat / notifications
- batch CRUD
- generic mutation executor

## 当前 Phase 状态

已完成：

- `create_task` Phase 1 Inbox
- Phase 2B Project placement
- Phase T1 Tag discovery
- Phase T2 Tag assignment
- Phase 4 Parent Task placement production enablement

当前进行中：

- 无

可作为后续规划，但未作为当前仓库约束：

- Codex 协作规则固化
- `AGENTS.md`

## 明确暂缓或未授权

以下能力当前不属于 `personal-production` 已授权 mutation surface：

- Full Snapshot MCP
- 独立 `ActionView` / `get_action`
- generic mutation gateway
- edit existing task mutation
- delete existing task mutation
- complete existing task mutation
- move existing task mutation
- parent placement under leaf Action
- batch CRUD
- repeat / notifications
- 自动 Tag 创建或 Tag CRUD
- AI 根据分析结果自动写回 OmniFocus

## 修改代码前必须阅读

修改生产能力前，至少阅读：

- 本文件
- `docs/SOURCE_MAP.md`
- 相关 ADR
- 相关设计文档
- 相关测试

涉及 MCP surface 变化时，必须检查：

- `src/serverRegistration.ts`
- `src/serverRegistration.test.ts`

涉及 `create_task` 变化时，必须检查：

- `src/domain/taskCreation/**`
- Ledger / idempotency 相关测试
- verification 相关测试
- public schema / protocol registration 测试
- 对应设计与验收文档

## 默认验证流程

普通代码或文档同步完成后，默认验证：

```bash
npm run build
npm test
git diff --check
```

真实 OmniFocus integration、生产 canary、LaunchAgent / Tunnel 修改或任何实际 mutation 验收，必须单独获得明确授权。

## 更新规则

以下情况需要更新本文件：

- `personal-production` tool/resource surface 变化
- `create_task` public contract 变化
- 某个 Phase 从设计进入已验收实现
- 生产 enablement 或 rollback 改变当前能力
- 默认 Profile 或 profile selection 逻辑变化

不要在本文件中放入详细 Phase 历史。详细证据应保留在 ADR、设计文档、验收记录和工程日志中。
