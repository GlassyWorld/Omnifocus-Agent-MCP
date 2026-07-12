# Future Design Area

本目录只为已经明确的后续设计工作提供边界和入口；状态页不是已接受设计，也不授权代码实现。

- [`personal-production`](./personal-production/README.md)：已实现当前只读精选能力集合；未来写入扩展仍需单独设计。
- [`create_task` V1](./create-task/README.md)：待定义受控创建契约；当前只允许设计，不实施。

未来设计必须继续区分：

```text
OmniFocus / Domain facts
AI inference or recommendation
user-authorized mutation intent
confirmed mutation result and audit evidence
```

任何未来写入设计被接受前，不得把待讨论 mutation 能力写入 [PROJECT_STATUS](../PROJECT_STATUS.md) 的“已完成”，也不得扩张当前 `personal-production` 注册集合。
