# Project Status

> 状态日期：2026-07-13
> `create_task` V1 代码提交：`c71fae4`（基础实现）、`c534027`（Schema publication hardening）；生产部署验收已完成

本页只记录当前可由代码、测试、Accepted ADR 或已冻结文档支持的状态，不把后续方向写成已实现能力。

## 已完成

- Task、Project、Completion 和 Lean Snapshot 四个 Domain Layer。
- `get_task`、`get_project`、`get_completed_since`、`get_lean_snapshot` 四个 Domain read tools。
- 四个 Domain Tool 的成功输出 `outputSchema`、运行时验证 `structuredContent` 和兼容 JSON 文本输出。
- Planned/Due direct-owner 语义；inherited facts 保留但不生成重复 attention。
- Lean Snapshot 的独立 section、完整 total、确定性排序和独立截断。
- `personal-production` server-side curated capability boundary：注册四个 Domain read tools 和一个受严格 runtime flag 保护的 `create_task`，不注册 Resources；未设置环境变量时默认使用该 Profile。
- `upstream-full` 兼容 Profile：保留 16 个 tools、6 个 Resources，其中包括 7 个 mutation tools。
- 当前 GPT Tool routing、ChatGPT App Instructions 和 Tunnel/LaunchAgent 运维文档。
- `personal-production` 重构已部署；`create_task` Checkpoint 6A/6B/6C 已通过。Checkpoint 7 corrected Schema 的 Refresh/禁写门禁通过后，LaunchAgent 已 fail-closed 正式恢复并加载 `OMNIFOCUS_CREATE_TASK_ENABLED=true`，health/ready 与 watchdog 正常。
- `create_task` Checkpoint 7 已完整通过：公开 Web 单次创建/ID 回读、服务器 ID/name 同对象、audit、Ledger、无锁、人工删除、双 `not_found` 与最终生产健康全部验收通过。

## 进行中

- 无；`create_task` V1 当前实施、原子代码提交与部署验收均已完成。

## 已决定但未实施

- Full Snapshot MCP 当前暂缓；低频完整分析走手动/plugin/file 导出，只有真实重复需求出现才复审。
- Action 暂时留在 Task Domain；没有独立 `ActionView` 或 `get_action`。
- 任何未来显式 mutation gateway 必须先定义用户授权、preview/confirmation、有限 mutation set、审计、失败/回滚和重复保护。

## 待设计

- 个人生产 Tag 能力：仓库已有 full-only `list_tags` primitive/tool 可供研究；既有 Tag 选择、层级/重名处理和是否公开为个人生产读能力尚未设计。

## 明确不在当前范围

- Checkpoint 7 的公开生产写入仅限显式调用 `create_task` 创建一个 Inbox Task；不得把授权扩展到其他 mutation。
- `create_task` V1 只允许显式请求创建单个 Inbox Task；Project、parent、Tag、batch、repeat、notifications、update/delete 均不在 V1。
- 当前没有承诺 AI 自动决策、自动编辑/完成/删除或把分析结果自动写回 OmniFocus。

## 当前节点

| 工作项 | 当前状态 | 证据 |
|---|---|---|
| `personal-production` | 已部署；默认 Profile；四个 Domain read tools + 正式启用的 `create_task` V1，无 Resources | profile/registration 代码与测试、部署 status、精确五 Tool 协议与 Checkpoint 7 验收 |
| 旧 `personal-readonly` 值 | 已移除且不提供 alias | resolver invalid-value tests、部署配置 |
| `create_task` V1 | Checkpoint 6A/6B/6C/7 全部通过；公开 flag=`true`；最终 Task 已人工删除并通过 ID/name 双 `not_found` | ADR-006、strict fail-closed feature flag、646 tests、wire Schema、只读/retry/production Canary 与 Checkpoint 7 部署验收记录 |
| Tag | full-only `list_tags`/`create_tag` 已存在；个人生产 Tag Tool 未正式设计/实施 | registration 代码与测试 |

详细证据见 [SOURCE_MAP.md](./SOURCE_MAP.md)。
