# ADR-005：AI Analysis 与 OmniFocus Mutation 保持分离

## 状态

已接受

## 背景

个人化项目用于帮助 GPT-compatible client 理解和分析个人执行系统。Domain Layer 通过稳定的 identity、provenance 和 ownership semantics 暴露事实，使 AI 能够基于一致输入进行推理。

个人任务管理包含主观 priority、变化中的 context 和无法仅从 OmniFocus fields 判断的后果。若自动把 AI interpretation 转为 Task/Project mutation，会混合三种独立职责：

- OmniFocus 是 operational facts 的来源。
- AI 是 analysis 和 explanation layer。
- 用户是最终 decision maker。

Upstream OmniFocus MCP 仍包含 mutation tools，并在显式选择 `upstream-full` 时由
`src/serverRegistration.ts` 注册。因此，本 ADR 定义的是个人化 operating boundary，并不
声称 upstream-compatible Server 已移除全部写入能力。

## 决策

AI 用于：

- 分析 Domain View
- 总结 current state 或 completion facts
- 比较 Task、Project、section 或 time period
- 识别 pattern、inconsistency 或 Review 问题
- 为用户决策提供证据

AI 不自动：

- 修改 Task
- 创建 Project
- 完成 Task
- 移动、删除或重新安排 OmniFocus object
- 将 Snapshot Attention 自动转换为 mutation command

用户保留对确认、排序和执行的最终控制权。

本 ADR 不禁止未来在用户明确提出具体写入请求时执行 request-scoped assisted mutation。

这种 workflow 必须与 analysis-triggered automatic mutation 保持分离，并满足下文定义的授权与确认条件。

接受的职责流为：

```text
OmniFocus facts
    -> Domain Semantic Model
    -> MCP read tools
    -> AI analysis
    -> 用户决策与执行
```

默认个人化 MCP surface 由以下 Domain read tools 构成：

- `get_task`
- `get_project`
- `get_completed_since`
- `get_lean_snapshot`

由于仓库为 upstream compatibility 保留 mutation tools，默认部署使用 Server-side
`personal-production` Profile 强制当前四工具边界；Agent instructions 和客户端 allowlist
只能提供行为指导或附加收窄，不能替代 Server registration。

## 备选方案

### 允许 AI 在分析后自动修改 OmniFocus

已拒绝。分析可能不完整、主观，或缺少 OmniFocus 未表达的 context；自动 mutation 会移除用户最终确认边界。

### 根据识别出的需求自动创建 Project 或 Task

已拒绝。识别潜在 Action 不等于用户接受它进入可信个人系统。

### 自动完成被推断为已经结束的 Task

已拒绝。Completion 是 operational fact，不能只从对话或分析输出推断。

### 在 `v1.0-personalized` 中移除所有 upstream mutation code

当前版本未选择。个人化 safety boundary 通过默认使用方式和 exposed capability 定义，同时保留 upstream compatibility。这意味着 read-only behavior 目前不是 Server-wide technical guarantee。

### 让 AI 在 Domain Layer 内生成 recommendation

已拒绝。Recommendation 属于 interpretation，应位于 factual MCP read model 之后，而不是进入 Task、Project、Completion 或 Lean Snapshot Contract。

## 影响

正面影响：

- 用户保持个人执行系统的最终 authority。
- Domain facts 可以独立于 AI conclusion 进行审计。
- 错误分析不会自动破坏 OmniFocus state。
- Snapshot 和 Completion 可以被不同 analysis workflow 复用。
- 架构保持 fact、interpretation、action 三者分离。

代价与权衡：

- 用户需要手动确认或执行修改。
- End-to-end Review workflow 可能需要额外的显式确认步骤。
- Server 保留 upstream mutation tools，因此 safety 部分依赖 client configuration。
- 系统不提供 autonomous task-management behavior。
- 文档和 Agent instructions 必须准确区分 default read-only use 与 code-level write removal。

## 未来复审条件

只有未来 workflow 同时定义以下内容时，才重新评估该边界：

- 显式 user authorization model
- 清晰的 preview 和 confirmation step
- 有限且明确的 permitted mutation set
- proposed/applied change 的 auditability
- failure 和 rollback behavior
- 防止 duplicate 或 unintended operation 的机制
- 无法通过 analysis-only output 满足的真实需求

即使未来接受 assisted write workflow，没有用户控制的 autonomous mutation 仍不在本 ADR 范围内，除非由新的显式 Architecture Decision 替代。
