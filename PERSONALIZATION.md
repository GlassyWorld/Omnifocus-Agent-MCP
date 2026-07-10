# OmniFocus MCP 个性化改造

## 1. 项目目的

本仓库基于 `themotionmachine/OmniFocus-MCP`。

当前个性化改造的目标，是将通用 OmniFocus MCP 演进为面向个人
OmniFocus 系统的 read-first、domain-aware MCP。其预期用途包括：

- 让 AI 读取 OmniFocus 数据。
- 理解 Task 和 Project 层级。
- 区分 direct 状态与 inherited 或 effective 状态。
- 为任务分析、项目分析、Lean Snapshot 和 Full Snapshot 工作流提供稳定的
  Domain Semantics。

OmniFocus 仍然是执行与项目推进系统。AI 负责读取、解释、分析和建议；它不取代
OmniFocus 成为执行状态的事实来源。

## 2. 权限边界

默认只读。

只有当用户明确要求创建任务、编辑任务或以其他方式修改 OmniFocus 数据库时，未来
才允许进入写入路径。任何此类能力都必须使用经过明确设计的写入路径。

当前个性化业务 Tool `get_task` 是只读 Tool。在开发期间，原始 upstream mutation
Tools 可能仍然注册在 Server 源码中。Codex MCP 使用 `enabled_tools` 作为客户端
allow list，限制当前客户端配置中实际暴露的 Tools。

客户端 allow list 并不等同于最终的 server-side read-only architecture。正式只读
版本最终必须在 Server Tool Surface 层完成收口。

## 3. Upstream 基线

- Branch：`main`
- Commit：`fcbd1524f7027ff38dc0d49fa501ee2be2c2dc46`
- 本地 Node.js：`v26.3.0`
- npm：`11.16.0`

原始基线验证结果：

- `npm ci`：PASS
- `npm run build`：PASS
- `npm test`：PASS
- Tests：221 passed，0 failed
- Test files：11 passed
- `dist/server.js`：存在
- OmniJS assets：已复制到构建输出
- STDIO MCP initialize：PASS

该 commit 是当前个性化改造所使用的 upstream baseline。本文档不假定或声称存在任何
Git tag。

## 4. 架构

目标架构：

```text
OmniFocus
    |
    v
Raw Access
    |
    v
Adapter
    |
    v
Domain Semantics
    |
    v
Business MCP Tool
    |
    v
Codex / AI
```

当前已经实现的 `get_task` 链路：

```text
queryOmnifocus
    |
    v
taskAdapter
    |
    v
taskClassifier + dateSemantics + statusSemantics
    |
    v
taskMapper
    |
    v
TaskView
    |
    v
get_task
```

### Raw Layer

职责：

- 读取 OmniFocus。
- 应用 filters。
- 投影请求的字段。
- 序列化原始字段值。

当前核心实现：`src/tools/primitives/queryOmnifocus.ts`。

### Adapter Layer

Adapter 执行以下转换：

```text
Query item
    |
    v
validate
    |
    v
normalize valid raw values
    |
    v
RawTask
```

核心原则：规范化有效数据，不修复损坏的 contract。字段类型错误或必需 Raw 字段缺失
时必须明确失败，而不是静默转换。

当前核心实现：`src/domain/task/taskAdapter.ts`。

### Domain Layer

职责：

- 对 Task kind 进行分类。
- 解释 direct 和 effective date facts。
- 解释 completion semantics。
- 解释 drop semantics。
- 解释 flag semantics。
- 将 `RawTask` 映射为 `TaskView`。

当前目录：`src/domain/task/`。

### Tool Layer

职责：

- 定义 MCP input schema。
- 执行 Tool 参数规则。
- 对 Tool errors 进行分类。
- 执行单任务结果约束。
- 生成 MCP response。

当前实现：

- `src/tools/definitions/getTask.ts`
- `src/tools/primitives/getTask.ts`

## 5. Task 领域语义

以下语义已经实现，并已使用本地真实 OmniFocus 数据库进行验证。

### Task Kind

```text
isProjectRoot = true
    -> project_root

isProjectRoot = false AND hasChildren = true
    -> action_group

otherwise
    -> action
```

Project root 分类使用由 OmniJS `Task.project` 语义生成的 `isProjectRoot` Raw fact，
不通过比较 ID 进行猜测。

### Date Semantics

Due、Planned 和 Defer 日期使用以下稳定结构：

```text
direct
effective
source: direct | inherited | none
```

规则：

```text
direct exists
    -> source = direct

direct missing AND effective exists
    -> source = inherited

both missing
    -> source = none
```

direct 和 effective 值都会保留在 `TaskView` 中。

### Completion Semantics

Completion 区分 direct completion、inherited/effective completion 和无 completion。
它基于以下字段：

- `completed`
- `completionDate`
- `effectiveCompletedDate`

`taskStatus` 会作为 OmniFocus 计算出的事实保留，但不会用于推导 direct completion。

### Drop Semantics

Drop semantics 基于：

- `dropDate`
- `effectiveDropDate`

它们区分 direct、inherited 和 none。

### Flag Semantics

Flag semantics 基于：

- `flagged`
- `effectiveFlagged`

它们区分 direct、inherited 和 none。

### Inbox 与 Project

Inbox 不是 Project。

- `TaskView.project` 表示 Project context。
- `TaskView.location.inInbox` 表示 Inbox location。

兼容性展示字符串 `"Inbox"` 永远不会被映射为 Project 对象。

## 6. get_task

`get_task` 是第一个已经实现的 Domain Tool。

定位：

- Read-only。
- 单任务详情查询。
- 稳定的 Domain JSON response。

输入：

```ts
{
  id?: string;
  name?: string;
}
```

必须且只能提供 `id` 或 `name` 中的一个。

规则：

- ID 使用精确匹配。
- Name 使用区分大小写的精确匹配。
- 不支持 `contains`。
- 不支持由调用方选择 `fields`。
- 始终允许读取 completed 和 dropped tasks。
- 不公开内部 `RawTask`。
- 不提供 mutation capability。

稳定错误码：

- `not_found`
- `ambiguous_match`
- `invalid_arguments`
- `query_failed`

## 7. Raw 契约

`get_task` 使用固定的 `GET_TASK_RAW_FIELDS` 字段集合。该集合中的每个字段都必须具有
显式 query field mapping。此 Tool 不依赖通用 `item.${field}` fallback。

`RawTask` contract 覆盖：

- Identity。
- Note。
- Task status。
- Direct 和 effective flag facts。
- Direct 和 effective completion facts。
- Direct 和 effective drop facts。
- Direct 和 effective Due facts。
- Direct 和 effective Defer facts。
- Direct 和 effective Planned facts。
- Tags。
- Project context。
- Inbox location。
- Project root identity。
- Hierarchy。
- Sequential behavior。
- `completedByChildren`。
- Repetition。
- Estimate。
- Creation 和 modification timestamps。

`src/domain/task/taskTypes.ts` 是 `RawTask` 和 `TaskView` 的代码级事实来源。

## 8. 测试策略

### Unit / Fixture Tests

基于 fixture 的测试覆盖：

- Adapter Contract。
- Task Classifier。
- Date Semantics。
- Completion Semantics。
- Drop Semantics。
- Flag Semantics。
- Task Mapper。
- Tool 参数和错误行为。

这些测试不会访问真实 OmniFocus 数据库。

### Architecture Consistency Check

架构一致性检查验证 Raw、Adapter、Domain 和 Tool 的边界，重点检查：

- Domain 不依赖 MCP Tool error types。
- Adapter 不静默修复无效 Raw types。
- Tool 代码不包含 Domain semantics。
- `get_task` 不依赖通用 Raw field fallback。

### Server-side Acceptance

固定验收模式：

```text
Raw Primitive Oracle
    vs
Domain MCP Tool
```

Raw Oracle 直接调用 `queryOmnifocus` primitive。System Under Test 使用 STDIO MCP
client 调用本地构建 Server 上的 `get_task`。

临时 acceptance harness 独立计算 expected semantics。它不得将以下生产模块作为
expected logic 导入：

- `taskClassifier`
- `dateSemantics`
- `statusSemantics`
- `taskMapper`

## 9. get_task 验收结果

真实数据库 server-side acceptance 结果：

- MCP initialize：PASS
- `get_task` registration：PASS
- Raw Oracle：PASS
- Raw tasks：967
- OBSERVED cases：10
- OBSERVED case result：10 / 10 PASS
- Field mismatch：0
- Raw Contract error：0
- Adapter error：0
- Mutation Tool calls：0
- Server-side acceptance：PASS

已观察并通过：

- ordinary action
- action group
- project root task
- Inbox task
- completed direct
- completed inherited
- direct due
- inherited due
- direct planned
- inherited planned

未观察到：

- dropped direct
- dropped inherited
- direct defer
- inherited defer
- directly flagged
- effectively flagged

`NOT OBSERVED` 不等于 `FAIL`。没有为了制造缺失的测试 Case 而创建或修改生产
OmniFocus 数据。

## 10. 开发规则

1. 默认只读。
2. 不得为了满足测试 Case 而修改真实 OmniFocus 数据。
3. 每次只为一个 Tool 建立一条完整纵向链路。
4. 不在 `queryOmnifocus` 中加入个人业务语义。
5. Raw facts 与 Domain interpretations 保持分离。
6. Direct facts 必须始终与 effective 或 inherited facts 分离。
7. Adapter 不得修复损坏的 Raw Contract。
8. Domain Layer 不得依赖 MCP Tool Layer。
9. Business Tool 不得公开内部 `RawTask`。
10. 每个新 Domain Tool 都使用 Raw Primitive Oracle 与 Domain MCP Tool 对比进行
    server-side acceptance。
11. 一个 Tool 完成、验收并冻结后，再开始下一个 Tool。
12. 未经明确任务，不修改 Bridge 架构。
13. 未经明确任务，不删除 upstream Tools。
14. 不把具体项目历史、N322 历史或个人判断硬编码进 MCP。

## 11. 当前状态与下一步方向

已完成：

```text
Upstream baseline
    -> PASS
Local MCP baseline
    -> PASS
Client-side read-only allow list
    -> PASS
Task Domain Layer
    -> implemented
get_task
    -> implemented
    -> unit tested
    -> architecture checked
    -> server-side acceptance PASS
```

计划中或未来工作，尚未实现：

- `get_task` Codex client acceptance。
- `get_project`。
- `get_completed_since`。
- `get_work_actions`。
- `get_lean_snapshot`。
- `get_full_snapshot`。
- 最终 server-side read-only Tool Surface。
- 未来的显式 mutation gateway。

推荐的下一步方向：

```text
Expose get_task through Codex enabled_tools
    |
    v
Codex client acceptance
    |
    v
Freeze get_task milestone
    |
    v
Design get_project using the established pattern
```
