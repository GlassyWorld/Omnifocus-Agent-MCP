# Domain Tool Evolution

> 类型：主题综合文档。仓库内没有对应的原始聊天导出；本文件综合代码、ADR 和工程日志，不替代原件。

## 当前结论

项目已经完成四个只读 Domain Tool：`get_task`、`get_project`、`get_completed_since` 和 `get_lean_snapshot`。它们遵循 Raw→Adapter→Domain→Tool 的分层，返回稳定 Domain View，并通过 `personal-readonly` 形成独立 server capability surface。

## 演进过程

1. `get_task` 建立首条完整纵向链路，固定 TaskKind、日期与状态 provenance。
2. `get_project` 增加 Project aggregate、canonical Project ID 和 root Task 连接。
3. `get_completed_since` 建立 direct completion event 流，避免从状态或 modification date 推导历史事件。
4. `get_lean_snapshot` 组合全系统当前状态，随后通过 Planned 和 Due 两轮修订冻结 direct-owner visibility。
5. 2026-07-12 增加 `personal-readonly` 精确注册边界、Server Instructions 及四工具结构化成功输出契约。

## 关键转折

- 通用 `query_omnifocus` 继续作为 upstream generic read，而不是个性化 Domain Contract。
- Snapshot 不从被截断的 active items 派生 planned/deadline sections。
- Tool 成功结果从仅有 JSON 文本扩展为运行时验证的 `structuredContent`，同时保持兼容文本。

## 已废弃方案

- 在 handler 中直接解释 Raw facts。
- 把通用 query 输出当作稳定个性化语义层。
- 立即增加独立 Action Domain 或 `get_action`。
- 把 raw `dump_database` 称为稳定 Full Snapshot Domain MCP。

## 仍未解决

- `personal-production` 的 capability surface 尚未设计。
- `create_task` V1 尚未设计。
- Full Snapshot、独立 Action Domain 仅保留复审条件，没有当前实施承诺。

## 来源文件

- `README.md`
- `PERSONALIZATION.md`
- `docs/architecture/decisions/ADR-001-domain-first-architecture.md`
- `docs/architecture/decisions/ADR-003-task-action-boundary.md`
- `docs/architecture/decisions/ADR-004-lean-snapshot-scope.md`
- `engineer_log/GET_TASK_ENGINEERING_LOG.md`
- `engineer_log/GET_PROJECT_ENGINEERING_LOG.md`
- `engineer_log/GET_COMPLETED_SINCE_ENGINEERING_LOG.md`
- `engineer_log/GET_LEAN_SNAPSHOT_ENGINEERING_LOG.md`
- `src/domain/**`、`src/tools/definitions/get*.ts` 及相关 tests
