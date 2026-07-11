# ADR-003：Action 暂时保留在 Task Domain 内

## 状态

已接受

## 背景

OmniFocus 使用 Task-shaped object 表达可执行 Action、Action Group 和 Project root。当前 Task Domain 使用一个明确的 union 对其分类：

```ts
type TaskKind = "action" | "action_group" | "project_root";
```

分类依据 OmniFocus facts：

```text
isProjectRoot = true  -> project_root
否则 hasChildren      -> action_group
否则                  -> action
```

`TaskView` 已经表达当前个人化分析所需事实：

- identity 和 note
- Task kind
- native status
- completion、drop、flag provenance
- direct/effective date
- Project 与 Inbox context
- hierarchy
- tag、repetition、estimate 和 timestamp

“Action”这一名称本身并不能证明它具有独立 lifecycle、aggregate boundary 或公开 Contract。

## 决策

在 `v1.0-personalized` 中，Action 和 Action Group 继续属于 Task Domain。

接受的模型为：

```text
Task Domain
├── action
├── action_group
└── project_root
```

当前版本不引入独立 `ActionView`、Action Adapter、Action Mapper 或 `get_action` MCP Tool。

使用 `get_task` 精确读取三种 Task kind。调用方通过 `TaskView.kind` 判断结果是 Action、Action Group 还是 Project root。

Action 可以作为语义 subtype 使用，但不是独立 Domain aggregate。

## 备选方案

### 立即增加 `ActionView`

已拒绝。在没有独立 lifecycle 或 invariant 的情况下，该 View 会复制 `TaskView` 的大部分或全部内容。

### 增加 `get_action` 作为 `get_task` 的过滤别名

已拒绝。仅排除 `project_root` 的 Tool 不会增加新的语义价值，却会扩大公开 surface，并重复 locator、error 和 output Contract。

### 将 Task Domain 重命名为 Action Domain

已拒绝。Project root 是 Task-shaped，并且有意通过 `get_task` 暴露；重命名会降低当前模型的准确性。

### 将 Action Group 视为独立 Domain

已拒绝。当前区别已经由 `hasChildren`、hierarchy 和 `TaskKind` 完整表达，尚未建立独立 aggregate behavior。

## 影响

正面影响：

- 公开 Domain surface 保持紧凑。
- `TaskView` 继续作为 Task-shaped OmniFocus entity 的唯一精确对象 Contract。
- Action、Action Group 和 Project root 的分类明确且可测试。
- Snapshot 可以复用相同 Task classifier。
- 避免 Tool proliferation 和重复 Contract。

代价与权衡：

- 只需要 Action 的调用方必须检查 `TaskView.kind`。
- `get_task` 可以返回 Project root，因此不能描述为 Action-only。
- 未来 Action-specific semantics 不能分散并不一致地加入多个消费者。
- “Task”同时是 OmniFocus object category 和 Domain boundary。

## 未来复审条件

只有当 Action 获得无法通过 `TaskView.kind` 清晰表达的语义时，才考虑独立 Action Domain，例如：

- 与 Task 或 Project root behavior 不同的独立 lifecycle
- 具有已接受规则的 Action-specific health 或 execution state
- 需要稳定 Action aggregate、而非 Task subtype 的独立分析价值
- 不同的 identity 或 relationship model
- 继续使用 `TaskView` 会导致其内部 Contract 不一致的公开 workflow

如果出现这些条件，应先定义 Action Domain Contract，再决定是否增加 `get_action` Tool；Tool 不应先于 Domain 决策出现。
