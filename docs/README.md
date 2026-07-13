# Project Documentation

本页是当前文档导航。若内容出现冲突，按“当前代码与测试 > Accepted ADR/冻结契约 > 最新验收 > 工程日志 > 旧草案/讨论”判断。

## 当前状态与来源

- [PROJECT_STATUS.md](./PROJECT_STATUS.md)：当前已完成、待设计和明确不在范围的能力。
- [SOURCE_MAP.md](./SOURCE_MAP.md)：关键结论到代码、测试、ADR 和历史来源的映射。
- [DEVELOPMENT.md](./DEVELOPMENT.md)：Domain Tool 分层、Raw Contract、测试验收和发布纪律。
- [reorganization/](./reorganization/)：本次文件盘点、主题矩阵、冲突清单和实际整理方案。

## 当前架构

- [Architecture_Audit.md](./Architecture_Audit.md)：当前详细架构审计，主入口。
- [OmniFocus-Agent-MCP_Architecture_Audit_v1.md](./OmniFocus-Agent-MCP_Architecture_Audit_v1.md)：`v1.0-personalized` 精简审计快照。
- [ADR-001：Domain-First](./architecture/decisions/ADR-001-domain-first-architecture.md)
- [ADR-002：Direct Owner Semantics](./architecture/decisions/ADR-002-direct-owner-semantics.md)
- [ADR-003：Task/Action Boundary](./architecture/decisions/ADR-003-task-action-boundary.md)
- [ADR-004：Lean Snapshot Scope](./architecture/decisions/ADR-004-lean-snapshot-scope.md)
- [ADR-005：AI/Mutation Boundary](./architecture/decisions/ADR-005-ai-boundary.md)
- [ADR-006：Controlled create_task V1](./architecture/decisions/ADR-006-controlled-create-task-v1.md)

## 四个 Domain Tool

| Tool | 当前契约/概览 | 工程历史 |
|---|---|---|
| `get_task` | [项目 README](../README.md#get_task) | [GET_TASK_ENGINEERING_LOG](../engineer_log/GET_TASK_ENGINEERING_LOG.md) |
| `get_project` | [项目 README](../README.md#get_project) | [GET_PROJECT_ENGINEERING_LOG](../engineer_log/GET_PROJECT_ENGINEERING_LOG.md) |
| `get_completed_since` | [项目 README](../README.md#get_completed_since) | [GET_COMPLETED_SINCE_ENGINEERING_LOG](../engineer_log/GET_COMPLETED_SINCE_ENGINEERING_LOG.md) |
| `get_lean_snapshot` | [项目 README](../README.md#get_lean_snapshot) | [engineer_log 阅读顺序](../engineer_log/README.md) |

共享 Planned/Due/Defer、direct ownership 和截断语义以 [ADR-002](./architecture/decisions/ADR-002-direct-owner-semantics.md)、[ADR-004](./architecture/decisions/ADR-004-lean-snapshot-scope.md) 和 [日期语义演进](./history/evolution-summaries/date-semantics-evolution.md) 为入口。

## Profile 与后续设计

- 当前 Profile：`personal-production` 与 `upstream-full`，见 [PROJECT_STATUS](./PROJECT_STATUS.md#当前节点)。
- [`personal-production` 状态页](./design/personal-production/README.md)：当前精选生产能力与后续扩展边界。
- [`create_task` V1 状态页](./design/create-task/README.md)：已完成 Checkpoint 6A/6B/6C/7，当前在 `personal-production` 正式启用。
- [设计区说明](./design/README.md)：进入设计阶段前必须保持的事实/授权边界。

## Query、App 与运维

- [`query_omnifocus` Reference](../QUERY_TOOL_REFERENCE.md) 与 [Examples](../QUERY_TOOL_EXAMPLES.md)：`upstream-full` generic read 能力。
- [GPT Tool Usage Guide](./integration/GPT_TOOL_USAGE_GUIDE.md)：完整 Tool routing 规范。
- [ChatGPT App Instructions](./integration/CHATGPT_APP_INSTRUCTIONS.md)：当前 `personal-production` 的压缩运行时指令。
- [Tunnel 日常维护与 Tool 发布手册](../tunnel/docs/OmniFocus-MCP-Tunnel日常维护与新增Tool操作手册.md)：当前唯一正式 Tunnel 运维入口。

## 历史和演进

- [工程日志索引](../engineer_log/README.md)
- [Domain Tool 演进](./history/evolution-summaries/domain-tool-evolution.md)
- [日期语义演进](./history/evolution-summaries/date-semantics-evolution.md)
- [Profile 与 AI 边界演进](./history/evolution-summaries/profile-and-ai-boundary-evolution.md)
- [`create_task` 与 Tag 方向](./history/evolution-summaries/create-task-and-tag-direction.md)
- [v1 个性化实现与验收历史](./history/personalization-v1-implementation-and-acceptance.md)

仓库内没有独立的外部仓库调研记录，也没有原始聊天导出；不要从本导航推断这些材料已被归档。

## 当前下一步

`personal-production` Profile semantic refactor 已在提交 `4850367` 实现并推送；`create_task` V1 基础实现与 corrected Schema 分别记录于 `c71fae4`、`c534027`，正式生产部署已通过完整门禁。写能力仍只限明确授权的单个 Inbox Task，不得从 Profile 名称推断其他 mutation。
