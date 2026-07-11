# ADR-001：采用 Domain-First 架构

## 状态

已接受

## 背景

Upstream OmniFocus MCP 通过通用查询、数据库报告、Resource 和对象操作提供了广泛的 OmniFocus 访问能力。这些接口暴露了面向 OmniFocus 的字段和结构，其含义依赖以下内部概念：

- Task 与 Project 通过 Project root Task 关联。
- Project ID 存在多个 namespace。
- direct date 与 effective、inherited date 不同。
- 仅依赖 native Task status 无法判断管理信号的实际 owner。
- 通用查询输出不构成面向 AI 客户端的稳定 Domain Contract。

如果要求 AI 客户端在每次请求中重新解释这些细节，会产生重复推理和不一致结果。Lean Snapshot 等更高层 read model 也难以可靠构建，因为每个消费者都需要重新解释相同的 Raw facts。

个人化架构需要在 OmniFocus 存储概念与面向 AI 的分析接口之间建立稳定的语义边界。

## 决策

个人化 MCP 能力采用 Domain-first 处理路径：

```text
OmniFocus Raw Data
    -> Primitive Query
    -> Strict Adapter
    -> Domain Semantics
    -> Mapper 或 Composer
    -> MCP Tool
```

各层职责如下：

- Primitive Layer 读取 OmniFocus，并映射明确、固定的 Raw field set。
- Adapter 校验必需字段和类型，不静默修复 malformed value。
- Domain Layer 对 identity、provenance、status、date 和 relationship 进行分类。
- Mapper 生成稳定的单实体 View。
- Composer 在需要系统级 read model 时组合多个 Domain 输入。
- MCP Tool 负责参数校验，并返回稳定的 Domain 结果或稳定错误。

首批接受的 Domain View 包括：

- `TaskView`
- `ProjectView`
- `CompletedTaskView`
- `LeanSnapshotView`

MCP handler 不负责核心语义规则。Upstream 的通用 query 和 Resource 接口可以继续存在，但不能替代个人化 Domain Contract。

## 备选方案

### 将 Raw 或通用查询结果直接暴露给 AI

已拒绝。这样做要求每个 AI 调用方理解 OmniFocus 内部关系、ID namespace、继承事实和 native status。同一个 Raw payload 可能在不同会话或客户端中产生不同解释。

### 在每个 MCP handler 中直接实现语义规则

已拒绝。Tool handler 会重复分类逻辑，并同时耦合 transport concern 与业务语义，Snapshot 或未来 read model 也难以复用这些规则。

### 直接基于 OmniFocus database dump 构建 Snapshot

已拒绝。Dump 暴露了超出当前需求的数据，混合历史与内部细节，并且本身没有定义稳定的 semantic projection。

## 影响

正面影响：

- AI 客户端不需要在每次分析时理解 OmniFocus 内部对象结构。
- 即使 Raw 获取细节变化，Domain 输出仍可保持稳定。
- direct 与 inherited facts 得到一致表达。
- Task 和 Project 语义规则为 Snapshot composition 提供统一基础。
- 无效 Raw Contract 会显式失败，而不是产生部分可信的输出。
- 未来 read model 可以复用共享语义规则。

代价与权衡：

- 架构增加了映射和校验层。
- 每个公开 Domain View 都需要明确 Contract 和测试。
- Raw field 变化需要同步反映到 Primitive、Adapter 和 View pipeline。
- 相互独立保护的 Domain Contract 之间可能存在相似校验代码。
- 维护者必须区分 upstream 通用接口和个人化 Domain 接口。

## 未来复审条件

出现以下情况之一时重新评估：

- OmniFocus 提供了原生、稳定且已经表达所需 provenance 与 identity 规则的语义 API。
- 个人化系统不再需要稳定的 AI-facing Contract，只作为轻量 transport bridge。
- Domain 重复增长到当前严格分层带来的 semantic drift 大于其防护价值。
- 新 read model 无法通过当前 Adapter/Domain/Mapper 或 Composer 模式表达，且必须绕过核心 invariant。

即使内部层次发生变化，任何复审仍应保留“面向 AI 的语义必须明确且可测试”这一要求。
