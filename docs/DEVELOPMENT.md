# Domain Tool Development Guide

本页集中记录当前个性化 Domain Tool 的工程约束。当前行为和公开 Contract 仍以代码、
测试及 Accepted ADR 为最高事实来源；历史验收数量见
[`personalization-v1-implementation-and-acceptance.md`](./history/personalization-v1-implementation-and-acceptance.md)
和 [`engineer_log/`](../engineer_log/README.md)。

## 分层边界

```text
OmniFocus Raw Data
    -> Primitive Query
    -> Strict Adapter
    -> Domain Semantics
    -> Mapper / Composer
    -> MCP Tool Definition
    -> Profile Registration
```

- Raw primitive 只读取、过滤和映射固定字段，不承载个人业务语义。
- Adapter 规范化合法数据，但不得修复缺失字段或错误类型等损坏的 Raw Contract。
- Domain Layer 不依赖 MCP Tool error types；Tool handler 不重新实现 Domain semantics。
- Domain View 不公开内部 `RawTask`、`RawProject`、`RawCompletedTask`、`RawLeanTask` 或
  `RawLeanProject`。
- Direct facts 必须与 effective 或 inherited facts 分离，并保留 provenance。
- 不把具体项目历史、个人判断、健康度、风险、优先级或 recommendation 硬编码进 Domain。

## Raw Contract

每个 Domain Tool 使用独立最小字段集合，所有字段都必须具有显式 query mapping，不依赖
generic Raw field fallback：

| Tool | Raw fields | 代码级事实来源 |
|---|---|---|
| `get_task` | `GET_TASK_RAW_FIELDS` | `src/domain/task/taskTypes.ts` |
| `get_project` | `GET_PROJECT_RAW_FIELDS` | `src/domain/project/projectTypes.ts` |
| `get_completed_since` | `GET_COMPLETED_TASK_RAW_FIELDS` | `src/domain/completion/completionTypes.ts` |
| `get_lean_snapshot` | `GET_LEAN_TASK_RAW_FIELDS`、`GET_LEAN_PROJECT_RAW_FIELDS` | `src/domain/snapshot/snapshotTypes.ts` |

改变字段集合时必须同步 primitive mapping、Raw type、Adapter、fixture、Contract tests 和公开
View 的影响分析。不得因为 Tool 输出缺字段而直接暴露 generic query result。

## 测试与验收

### Fixture tests

至少覆盖：

- Adapter 的缺失字段、错误类型和合法规范化。
- kind、native status、direct/effective/source 和 ownership semantics。
- Mapper/Composer 输出、错误分类、排序、去重、完整计数与截断。
- Tool 参数、success/error envelope、`outputSchema` 和 `structuredContent`。
- Profile 精确 Tool 集合与 Resource 边界。

Fixture tests 不访问真实 OmniFocus 数据库。

### Server-side acceptance

Domain Tool 的真实数据验收使用独立 Oracle：

```text
Raw Primitive Oracle
    vs
fresh-build STDIO MCP Domain Tool
```

- Oracle 独立计算 expected semantics，不导入生产 classifier、resolver、mapper 或 composer
  作为 expected logic。
- 不得为了制造缺失 Case 而创建或修改真实 OmniFocus 数据；自然缺失应记为
  `NOT OBSERVED`，不能记为 `FAIL` 或伪造样本。
- 验收必须记录 build、MCP initialize、Tool registration、字段/Contract mismatch、mutation
  calls 和 OmniFocus writes。
- 验收数量是里程碑快照，不得当作未来实时数据库事实。

## Profile 与发布纪律

- `personal-production` 当前注册四个 Domain read tools、`create_task` 且无 Resources；改变集合必须显式
  修改 `profiles` allowlist 和精确集合测试。
- `upstream-full` 保留兼容 surface，只能显式启用；未经明确任务不删除或改变 upstream Tool
  行为。
- 新增 mutation 能力不能从现有 `create_task` 推导授权；必须先满足 ADR-005/ADR-006 所确立的
  用户授权、有限 mutation set、审计、失败处理和重复保护门槛。
- 修改 Profile、Instructions 或 Tool surface 时同步 README、PROJECT_STATUS、SOURCE_MAP、
  集成指南和运维手册。
- 未经明确任务不修改 Bridge、Transport、Tunnel 或实际 LaunchAgent 配置。

## 标准验证

```bash
npm run build
npm test
git diff --check
npm audit --omit=dev
npm ls @modelcontextprotocol/sdk
```

涉及真实 OmniFocus 的 acceptance 必须单独授权，并遵守只读或明确 mutation 范围；普通单元
测试和文档维护不得把真实数据库写入作为隐含步骤。
