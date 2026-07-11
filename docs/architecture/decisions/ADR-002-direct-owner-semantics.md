# ADR-002：Planned 与 Due 信号采用 Direct Ownership

## 状态

已接受

## 背景

OmniFocus 同时暴露 direct date 和 effective date。Action Group 或 Project root 上的 Planned/Due 可以被每个 descendant Task 继承为 effective value。

如果每个 effective value 都转化为 Attention signal，一个管理层级的意图或截止期限会展开为多个 child signal。例如，一个 Project 只有一个 direct Due，但可能同时表现为 Project root 以及多个 inherited `DueSoon` 或 `Overdue` child；child Action 继承 Project-level Planned 时也会产生相同 fan-out。

这种方式保留了 effective facts，却丢失了管理粒度：一个 workflow owner 看起来像多个独立 owner，Attention count 被放大，日期实际设置位置也变得不清晰。

因此，系统需要同时表达 effective fact 和 signal ownership。

## 决策

只有 Planned 或 Due 的 direct owner 才产生相应的管理信号。

本 ADR 中的 `Owner` 是从 direct provenance 推导出的语义角色，不是新的 Domain entity、持久化对象、aggregate 或公开的 `OwnerView`。

接受以下事实表达：

```ts
{
  direct: string | null;
  effective: string | null;
  source: "direct" | "inherited" | "none";
}
```

其含义为：

- `direct`：直接设置在当前对象上的值。
- `effective`：当前对象实际生效的值，包括继承值。
- `source = direct`：值直接设置在当前对象上，因此当前对象是该规则下的 signal owner。
- `source = inherited`：当前对象从 container 接收该值。
- `source = none`：不存在相应事实。

Planned visibility 遵循：

```text
Direct Planned owner
    -> 产生 Planned visibility

Inherited Planned value
    -> 继续作为事实保留
    -> 不产生独立 Planned signal
```

对于 Action 或 Action Group，direct Planned 还必须已经到达，且 native Task status 不能为 `Blocked`。对于 Active Project，canonical root Task 是 Planned owner，Project 进入 `projects.planned`。

Due visibility 遵循：

```text
Direct Due owner + native DueSoon/Overdue status
    -> 产生 deadline signal

Inherited Due value
    -> 继续作为事实保留
    -> 不产生独立 deadline signal
```

Action 和 Action Group owner 进入 Task Attention；Active Project root owner 进入 `projects.deadline`。

Ownership 按 inheritance 去重，而不是按 timestamp 去重。即使日期相同，不同的 direct owner 仍然是不同信号。

本决策只适用于 Planned 和 Due 管理信号。Flagged Attention 继续使用 effective flagged fact，不由本 ADR 重新定义。

## 备选方案

### 将每个 effective Due 或 Planned 展开为 Attention

已拒绝。Inherited value 会造成 child fan-out，重复一个管理意图，放大计数并隐藏实际 owner。

### 从 Domain 输出中移除 inherited value

已拒绝。Inherited date 是理解 Task effective state 所必需的真实 OmniFocus fact。问题在于重复信号生成，而不是继承事实本身。

### 将 timestamp 相同的所有信号去重

已拒绝。不同 direct owner 可以有意使用相同 Planned 或 Due 日期；timestamp 相等不能证明 ownership 相同。

### 使用自定义时间窗口推导 DueSoon 和 Overdue

当前版本拒绝。系统使用 OmniFocus native `taskStatus` 作为状态边界，不引入竞争性的 deadline calculation。

## 影响

正面影响：

- Inherited Planned/Due 不再生成重复 Attention。
- Attention count 表达 management-signal owner，而不是所有受影响 descendant。
- Project-level intention 和 deadline 具有明确的 Project section。
- Action Group 和 leaf Action 的 direct owner 仍可独立显示。
- AI 可以区分“谁拥有信号”和“谁受到信号影响”。
- direct、effective、source facts 继续可用于详细分析。

代价与权衡：

- Snapshot composition 必须将每个 Active Project 与其 canonical root Task 连接。
- Project 和 root Task 的 Due semantics 必须保持一致。
- `Blocked` Project root 当前不会生成 deadline item，因为实现使用 native status 作为边界。
- 消费者必须理解 inherited date 可以存在，但不一定产生 Attention。
- Planned/Due 的 ownership gate 与 effective Flagged 行为不同。

## 未来复审条件

出现以下情况时重新评估：

- OmniFocus 引入与 direct/effective provenance 不同的显式 ownership metadata。
- 未来 Review workflow 除 owner-level signal 外，还需要单独显示受影响 descendants。
- Blocked direct Due owner 需要在 native status boundary 之外获得明确 deadline 表达。
- 新管理信号无法分配有意义的 direct owner。
- 真实个人使用表明 descendant fan-out 对某个独立 read model 有明确价值。

任何 descendant-oriented View 都应独立建模，不应静默替换 owner-level Attention。
