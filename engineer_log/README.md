# Engineering Log Index

`engineer_log/` 是稳定的工程历史目录，记录 Domain Tool 的设计、实现、冻结语义和验收。原日志保留当时上下文与数值；当前行为仍以代码、测试和 Accepted ADR 为最高权威。

## 按 Domain Tool 阅读

| Domain Tool | 日志 | 当前角色 |
|---|---|---|
| `get_task` | [GET_TASK_ENGINEERING_LOG.md](./GET_TASK_ENGINEERING_LOG.md) | 初始设计、实现和验收记录 |
| `get_project` | [GET_PROJECT_ENGINEERING_LOG.md](./GET_PROJECT_ENGINEERING_LOG.md) | canonical Project、aggregate 和验收记录 |
| `get_completed_since` | [GET_COMPLETED_SINCE_ENGINEERING_LOG.md](./GET_COMPLETED_SINCE_ENGINEERING_LOG.md) | direct completion event 契约和验收记录 |
| `get_lean_snapshot` | [GET_LEAN_SNAPSHOT_ENGINEERING_LOG.md](./GET_LEAN_SNAPSHOT_ENGINEERING_LOG.md) | 初始 Snapshot 基线；部分 attention 语义被后续两份修订日志更新 |
| `get_lean_snapshot` Planned 修订 | [GET_LEAN_SNAPSHOT_PLANNED_CORRECTION_ENGINEERING_LOG.md](./GET_LEAN_SNAPSHOT_PLANNED_CORRECTION_ENGINEERING_LOG.md) | 当前 direct Planned owner 语义的修订证据 |
| `get_lean_snapshot` Due 修订 | [GET_LEAN_SNAPSHOT_DUE_ATTENTION_GRANULARITY_ENGINEERING_LOG.md](./GET_LEAN_SNAPSHOT_DUE_ATTENTION_GRANULARITY_ENGINEERING_LOG.md) | 当前 direct Due owner/project deadline 语义的修订证据 |

## Snapshot 阅读顺序

```text
GET_LEAN_SNAPSHOT_ENGINEERING_LOG.md
    -> GET_LEAN_SNAPSHOT_PLANNED_CORRECTION_ENGINEERING_LOG.md
    -> GET_LEAN_SNAPSHOT_DUE_ATTENTION_GRANULARITY_ENGINEERING_LOG.md
    -> ADR-002 + ADR-004 + 当前代码/tests
```

“被修订”只针对初始日志中的 inherited Planned/Due child attention 行为，不表示初始日志的架构背景、实现过程或验收证据应被删除。

## 相关导航

- [项目文档导航](../docs/README.md)
- [来源映射](../docs/SOURCE_MAP.md)
- [Domain Tool 演进总结](../docs/history/evolution-summaries/domain-tool-evolution.md)
- [日期语义演进总结](../docs/history/evolution-summaries/date-semantics-evolution.md)
