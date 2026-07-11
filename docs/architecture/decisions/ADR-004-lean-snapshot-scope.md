# ADR-004：Lean Snapshot 与 Full Snapshot 保持独立

## 状态

已接受

## 背景

单对象 Domain Tool 提供详细 Task/Project View，Completion Domain 提供历史事件；AI 分析还需要一个紧凑入口来观察整个系统的当前管理状态。

完整 OmniFocus database export 不适合直接承担这一职责：

- 包含超出 current-state analysis 所需的对象和字段。
- 混合历史、内部和操作细节。
- 消耗更多 AI context。
- 不建立 Attention ownership 或稳定 section semantics。
- 迫使 AI 客户端从 Raw data 重新构建 Domain rule。

同时，如果把所有可能解释加入 Snapshot，会把 factual projection 与尚未接受为 Domain rule 的 health、risk、priority、recommendation 混合。

Full Snapshot 的当前实际使用频率较低，尚不足以证明需要持续维护一个实时 MCP read model。

## 决策

将 `LeanSnapshotView` 定义为紧凑、all-system、current-state read model。

其用途是观察当前系统状态，而不是复制完整数据库，也不是自动评估管理状态。

接受的 sections 为：

```text
LeanSnapshotView
├── projects.active
├── projects.planned
├── projects.deadline
├── attention
└── inbox
```

各 section 含义：

- `projects.active`：Active Project 的 compact summary。
- `projects.planned`：root Task 直接拥有已到达 Planned date 的 Active Project。
- `projects.deadline`：root Task 直接拥有 Due，且 native status 为 `DueSoon` 或 `Overdue` 的 Active Project。
- `attention`：具有已接受 factual Attention reason 的非 root Action/Action Group。
- `inbox`：当前非 root Inbox Task。

Lean Snapshot 提供 deterministic sorting、pre-truncation total 和相互独立的 per-section limit。

Lean Snapshot 有意不包含：

- health
- risk
- priority
- recommendation
- Waiting inference
- completion history
- note body
- 每个 Project Task 的完整展开
- Raw OmniFocus object

Completion history 由 `get_completed_since` 提供；详细 Task/Project facts 由 `get_task` 和 `get_project` 提供。

当前暂缓开发 Full Snapshot MCP。由于使用频率较低，Full Snapshot 需求采用以下模式满足：

```text
OmniFocus 手动导出
    -> 导出文件
    -> AI 按需分析
```

手动导出可以由现有导出方式、plugin-generated artifact 或 file-exported artifact 完成。该低频 workflow 不要求 real-time access，也不要求将 Full Snapshot 暴露为 MCP Tool。

只有未来出现明确、重复且真实的个人需求时，才重新评估 Full Snapshot 的开发。若届时接受开发，Full Snapshot 必须作为独立 read model，拥有自己的用途、Contract、size boundary 和 semantics，不直接扩张 Lean Snapshot。

## 备选方案

### 使用 `dump_database` 作为系统 Snapshot

已拒绝作为 Domain Snapshot。Raw/full report 不提供个人化模型所需的稳定 Domain section、ownership rule 或 context boundary。它仍可作为手动导出 workflow 的数据来源之一。

### 立即开发 Full Snapshot MCP

当前暂缓。实际使用频率较低，开发和维护实时 Full Snapshot Contract 的成本缺少足够个人需求支撑；手动导出 + AI 分析已能覆盖当前低频场景。

### 将所有当前和历史对象加入 Lean Snapshot

已拒绝。结果将不再 lean，会重复 Completion 和 detail tools，并消耗不必要的 AI context。

### 将 health、risk、priority 和 recommendation 加入 Lean Snapshot

已拒绝。这些属于 interpretation，而不是冻结的 OmniFocus fact；混入 factual section 会模糊 Domain projection 与 AI analysis 的边界。

### 从已截断的 Active Project items 派生 Planned/Deadline section

已拒绝。Direct owner 可能因 `projects.active` cap 而消失。每个 semantic section 必须基于完整 candidate set 分类和计数，再独立截断。

## 影响

正面影响：

- AI 获得紧凑的当前个人管理状态视图。
- Current-state context 与 completion history、object detail 保持分离。
- Attention 和 Project sections 使用冻结的 direct-owner semantics。
- 即使返回 items 被限制，各 section 仍保留完整 total。
- Snapshot 输出保持 factual，不预先替代 AI 或用户解释。
- 详细后续分析可以选择性调用 Domain tools。
- 当前低频 Full Snapshot 需求无需引入新的长期 MCP Contract 和维护成本。
- 手动导出文件可以按实际问题交给 AI 进行一次性分析。

代价与权衡：

- Lean Snapshot 不能独立回答所有 review 或 audit 问题。
- 消费者可能需要追加 `get_task`、`get_project` 或 `get_completed_since` 调用。
- Snapshot composition 依赖完整 Task/Project query 和有效 Project/root join。
- Project 可以同时出现在多个 section，因为每个 section 表达不同管理事实。
- Full Snapshot 的手动导出模式不是实时接口，需要用户主动生成和提供文件。
- 手动导出 artifact 的格式与时间点需要在每次分析中明确。

## 未来复审条件

只有出现明确的个人需求时才重新评估 Full Snapshot 开发，例如：

- Full Snapshot 分析从偶发需求变为稳定、重复 workflow。
- 手动导出 + AI 分析造成可观察的操作负担或无法满足时效要求。
- 需要由稳定 Contract 支持跨时间比较或自动化 Review 输入。
- 某个已定义 workflow 需要完整 Domain representation，且 selective follow-up calls 无法满足。
- Completion history 必须与 current state 进行原子关联。

Health、risk 或 recommendation 若获得明确且已接受的定义，也应优先考虑独立 read model，而不是静默扩张 Lean Snapshot。

在上述个人需求出现之前，保持“手动导出 + AI 分析”，不安排 Full Snapshot MCP 开发。
