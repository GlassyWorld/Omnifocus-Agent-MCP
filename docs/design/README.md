# Future Design Area

本目录保存设计边界、已接受决策和验收入口；状态页本身不替代代码、ADR 或验收证据。

- [`personal-production`](./personal-production/README.md)：当前精选生产集合为四个 Domain read tools、`create_task` 和零 Resources。
- [`create_task` V1](./create-task/README.md)：已完成设计、实现和 Checkpoint 6A/6B/6C/7 生产验收。

未来设计必须继续区分：

```text
OmniFocus / Domain facts
AI inference or recommendation
user-authorized mutation intent
confirmed mutation result and audit evidence
```

除已接受并验收的 `create_task` V1 外，任何未来写入设计被接受前，不得把待讨论 mutation 能力写入 [PROJECT_STATUS](../PROJECT_STATUS.md) 的“已完成”，也不得扩张当前 `personal-production` 注册集合。
