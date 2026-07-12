# OmniFocus MCP v1 个性化实现与验收记录

> 文档角色：历史工程汇总，不是当前架构或部署事实的权威入口。
> 当前状态请从 [`docs/README.md`](../README.md)、[`PROJECT_STATUS.md`](../PROJECT_STATUS.md)、
> Accepted ADR 和当前代码/测试进入。本文保留 v1 实施顺序、Raw Contract、测试方法与
> 真实数据库验收快照；其中数量、工具顺序和阶段性安全描述只代表对应里程碑。

## 1. 项目目的

本仓库基于 `themotionmachine/OmniFocus-MCP`。

当前个性化改造的目标，是将通用 OmniFocus MCP 演进为面向个人
OmniFocus 系统的 read-first、domain-aware MCP。其预期用途包括：

- 让 AI 读取 OmniFocus 数据。
- 理解 Task 和 Project 层级。
- 区分 direct 状态与 inherited 或 effective 状态。
- 为任务分析、项目分析和 Lean Snapshot 提供稳定的 Domain Semantics。
- 对低频 Full Snapshot 需求采用手动/plugin/file 导出后交由 AI 分析的方式；当前不开发
  Full Snapshot MCP。

OmniFocus 仍然是执行与项目推进系统。AI 负责读取、解释、分析和建议；它不取代
OmniFocus 成为执行状态的事实来源。

## 2. 权限边界

当前默认能力集合只读。

分析结果不得自动触发写入。只有当用户明确提出具体创建、编辑或其他修改请求时，才可
将其识别为新的 request-scoped mutation request，并进入独立的授权、预览和确认流程。

当前个性化业务 Tools `get_task`、`get_project`、`get_completed_since` 和
`get_lean_snapshot` 都是只读 Tool。Server 现提供两个 capability Profile：

- `OMNIFOCUS_MCP_PROFILE=personal-production` 在注册层当前只公开这四个 Domain read tools，
  不注册 generic read tools、mutation tools 或 MCP Resources。
- `OMNIFOCUS_MCP_PROFILE=upstream-full` 保留全部 upstream-compatible Tool 和 Resources；
  只能通过环境变量显式启用。

环境变量未设置或为空时安全默认进入 `personal-production`。该名称表达长期精选生产能力
集合，不承诺永久只读；任何未来写入都必须通过专门受控 Tool 显式加入。非法 Profile 会在
connect 前启动失败，不会静默回退。完整模式中的 mutation 仍只允许在用户明确提出具体
写入操作时使用；分析或建议不构成写入授权。

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

当前已经实现的 `get_project` 链路：

```text
queryOmnifocus
    |
    v
projectAdapter
    |
    v
projectClassifier + projectDateSemantics
    |
    v
projectMapper
    |
    v
ProjectView
    |
    v
get_project
```

当前已经实现的 `get_completed_since` 链路：

```text
queryOmnifocus
    |
    v
completionAdapter
    |
    v
completionClassifier + completionMapper
    |
    v
CompletedTaskView[]
    |
    v
get_completed_since
```

当前已经实现的 `get_lean_snapshot` 链路：

```text
queryOmnifocus tasks + projects
    |
    v
Snapshot strict adapters
    |
    v
shared Task / Project semantics
    |
    v
Lean Snapshot composition
    |
    v
LeanSnapshotView
    |
    v
get_lean_snapshot
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
RawTask / RawProject / RawCompletedTask / RawLeanTask / RawLeanProject
```

核心原则：规范化有效数据，不修复损坏的 contract。字段类型错误或必需 Raw 字段缺失
时必须明确失败，而不是静默转换。

当前核心实现：

- `src/domain/task/taskAdapter.ts`
- `src/domain/project/projectAdapter.ts`
- `src/domain/completion/completionAdapter.ts`
- `src/domain/snapshot/snapshotTaskAdapter.ts`
- `src/domain/snapshot/snapshotProjectAdapter.ts`

### Domain Layer

职责：

- 对 Task kind 进行分类。
- 解释 direct 和 effective date facts。
- 解释 completion semantics。
- 解释 drop semantics。
- 解释 flag semantics。
- 将 `RawTask` 映射为 `TaskView`。
- 对 Project kind 和 Project status 进行解释。
- 解释 Project Due 和 Defer 的 direct/effective semantics。
- 将 `RawProject` 映射为 `ProjectView`。
- 对完成事件中的 action 和 action group 进行分类。
- 将 `RawCompletedTask` 映射为稳定的 `CompletedTaskView`。
- 组合 Active Project、Attention 和 Inbox 当前事实。
- 对 Snapshot 结果进行去重、完整计数、稳定排序和截断。

当前目录：

- `src/domain/task/`
- `src/domain/project/`
- `src/domain/completion/`
- `src/domain/snapshot/`

### Tool Layer

职责：

- 定义 MCP input schema。
- 执行 Tool 参数规则。
- 对 Tool errors 进行分类。
- 执行各业务 Tool 的单对象或事件集合结果约束。
- 生成 MCP response。

当前实现：

- `src/tools/definitions/getTask.ts`
- `src/tools/primitives/getTask.ts`
- `src/tools/definitions/getProject.ts`
- `src/tools/primitives/getProject.ts`
- `src/tools/definitions/getCompletedSince.ts`
- `src/tools/primitives/getCompletedSince.ts`
- `src/tools/definitions/getLeanSnapshot.ts`
- `src/tools/primitives/getLeanSnapshot.ts`

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

## 6. Project 领域语义

Project Domain 使用 `project.task.id.primaryKey` 作为 canonical Project ID。现有
`projectId` query filter 继续兼容 root task ID 和 OmniJS Project ID，但
`get_project` 会在 Adapter 之后执行 canonical ID 精确比较。

Project kind 分为：

```text
containsSingletonActions = true
    -> single_actions

otherwise
    -> standard
```

Project status 保留 OmniFocus 原始状态，并提供稳定 boolean 语义：

- `Active` -> `active`
- `OnHold` -> `onHold`
- `Done` -> `completed`
- `Dropped` -> `dropped`

Project Due 和 Defer 日期与 Task 日期使用相同的 `direct/effective/source` 结构。
Folder context 与 Project identity 分离；Project 的直接任务来自 `item.tasks`，全部后代
任务来自 `item.flattenedTasks`。任务汇总保留直接 ID、全部 ID、总数和按 OmniFocus
`Task.Status` 计算的计数。

## 7. get_task

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

## 8. get_project

`get_project` 是第二个已经实现的 Domain Tool。

定位：

- Read-only。
- 单 Project 详情查询。
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

- ID 只接受 canonical Project root task ID。
- Name 使用区分大小写的精确匹配。
- 不支持 `contains`。
- 不支持由调用方选择 `fields`。
- 始终允许读取 completed 和 dropped projects。
- 不公开内部 `RawProject`。
- 不提供 mutation capability。

错误码与 `get_task` 保持一致：`not_found`、`ambiguous_match`、
`invalid_arguments`、`query_failed`。

## 9. get_completed_since

`get_completed_since` 是第三个已经实现的 Domain Tool。

定位：

- Read-only。
- 读取明确时间区间内的直接完成事实。
- 为历史回顾与后续 Snapshot 工作流提供稳定的完成事件 JSON。

输入：

```ts
{
  since: string;
  until?: string;
}
```

规则：

- `since` 必填，`until` 可选。
- 时间必须是带 `Z` 或明确 UTC offset 的 ISO 8601 datetime。
- 输入会规范化为 UTC；省略 `until` 时只读取一次当前时间作为上界。
- 查询区间包含上下边界。
- 只根据 direct `completionDate` 判断完成时间，不使用 `modificationDate`、
  `taskStatus` 或 `effectiveCompletedDate` 推导完成事实。
- 结果固定按 `completionDate` 降序排列。
- Project root completion 会被排除，action group completion 会被保留。
- 空区间结果是成功响应，不返回 `not_found`。
- 不公开内部 `RawCompletedTask`，不提供 mutation capability。

输出事件包含 identity、note、`action | action_group` kind、`completedDate`、Project
context、Inbox location、tags 和 creation/modification timestamps。它不包含 `raw`、
`status` 或 `taskStatus`。

稳定错误码：

- `invalid_arguments`
- `query_failed`

## 10. get_lean_snapshot

`get_lean_snapshot` 是第四个已经实现的 Domain Tool。

定位：

- Read-only。
- 返回体积受控、面向当前管理状态的 all-system Snapshot。
- 输出 Active、Planned、Deadline Project sections、事实型 Attention signals 和
  Inbox summaries。

输入仅包含：

```ts
{
  limitPerSection?: number;
}
```

`limitPerSection` 默认为 25，必须是 `1..100` 的整数，分别限制 Active Projects、
Planned Projects、Project Deadlines、Attention 和 Inbox。每个 section 都从完整候选集
独立分类和计数，再稳定排序和截断，并返回 `total`、`returned`、`truncated` 和
`items`。

请求内只读取一次 UTC 当前时间并输出为 `generatedAt`。v1 不公开任意 `at`，因为
`DueSoon`、`Overdue` 和 `Blocked` 是 OmniFocus 在真实查询时计算的 native status，
不能被准确历史重放。

Project sections：

- `projects.active`：全部 Active Project compact summaries。
- `projects.planned`：canonical root Task 直接拥有已到达 Planned date 的 Active Project。
- `projects.deadline`：canonical root Task 直接拥有 Due，且 native status 为 `DueSoon` 或
  `Overdue` 的 Active Project。

Task Attention 固定只包含：

- `overdue`：Due source 为 direct，且 native `taskStatus === "Overdue"`。
- `dueSoon`：Due source 为 direct，且 native `taskStatus === "DueSoon"`。
- `planned`：direct Planned 已到达 `generatedAt`，且 Task 当前不是 Blocked。
- `flagged`：`effectiveFlagged === true`。

同一 Task 在 Attention 中只出现一次，可以携带多个按固定顺序排列的 reasons。
`byReason` 基于截断前的完整匹配统计。Inbox 与 Attention 是不同 section，允许同一
Task 同时出现。Project 可以同时进入 active、planned 和 deadline，因为这些 sections
表达不同管理事实。

Project root 保留在内部 Raw Task 集合，用于通过 canonical ID 解析 Project Planned/Due
semantics，但不作为 Task Attention 或 Inbox item 输出。Project/root Due 的 direct、
effective、source 必须一致，否则 Snapshot 作为 Domain Contract failure 返回失败。

Planned/Due 使用 direct-owner semantics：inherited values 继续保留为 Task date facts，
但不产生独立 Planned/Due Attention。Distinct direct owners 即使 timestamp 相同也不会
被合并；去重依据是 inheritance，而不是 timestamp。

`Blocked` 保留为 Task status 和 Project task count，但不是独立 Attention reason，
也不会被解释成 Waiting。Lean Snapshot 不包含 Waiting、recent completions、note 全文、
health、risk、priority、recommendation 或内部 Raw objects。

## 11. Raw 契约

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

`get_project` 使用固定的 `GET_PROJECT_RAW_FIELDS` 字段集合，所有字段都具有显式
Project mapping，不依赖 generic fallback。`RawProject` 覆盖：

- Canonical Project identity、name、note 和 status。
- Sequential、flagged、single-actions 和 `completedByChildren` facts。
- Folder context。
- Direct task IDs 和 flattened task IDs。
- 按 `Task.Status` 分类的任务计数。
- Direct/effective Due 和 Defer facts。
- Creation 和 modification timestamps。

`src/domain/project/projectTypes.ts` 是 `RawProject` 和 `ProjectView` 的代码级事实来源。

`get_completed_since` 使用固定的 `GET_COMPLETED_TASK_RAW_FIELDS` 字段集合。所有字段
都具有显式 task mapping，不依赖 generic fallback。`RawCompletedTask` 覆盖：

- Identity、name 和 note。
- Direct `completionDate`。
- Project context 和 Inbox location。
- Tags。
- `isProjectRoot` 与 `hasChildren` 分类 facts。
- Creation 和 modification timestamps。

`src/domain/completion/completionTypes.ts` 是 `RawCompletedTask` 和
`CompletedTaskView` 的代码级事实来源。

`get_lean_snapshot` 使用独立的 `GET_LEAN_TASK_RAW_FIELDS` 和
`GET_LEAN_PROJECT_RAW_FIELDS` 最小字段集合。所有字段都具有显式 mapping，不依赖
generic fallback。Snapshot Raw Contract 使用 derived boolean `hasNote`，不读取 note
全文；Project 使用 `totalTaskCount`，不读取全部 Task IDs。

`src/domain/snapshot/snapshotTypes.ts` 是 `RawLeanTask`、`RawLeanProject`、Lean
summaries 和 `LeanSnapshotView` 的代码级事实来源。

## 12. 测试策略

### Unit / Fixture Tests

基于 fixture 的测试覆盖：

- Adapter Contract。
- Task Classifier。
- Date Semantics。
- Completion Semantics。
- Drop Semantics。
- Flag Semantics。
- Task Mapper。
- Project Adapter Contract。
- Project kind、status 和 date semantics。
- Project Mapper 和 task summary。
- Completion Adapter Contract。
- Completion event kind 和 Mapper。
- 带时区时间参数规范化、区间校验和错误分类。
- Snapshot Task / Project Adapter Contract。
- 四类 Attention reasons、Blocked 排除和 multi-reason aggregation。
- Direct/inherited date-source sorting、稳定 tie-breaker 和 section truncation。
- Active Projects、Inbox、Project root exclusion 和跨 section duplication。
- Tool 参数和错误行为。

这些测试不会访问真实 OmniFocus 数据库。

### Architecture Consistency Check

架构一致性检查验证 Raw、Adapter、Domain 和 Tool 的边界，重点检查：

- Domain 不依赖 MCP Tool error types。
- Adapter 不静默修复无效 Raw types。
- Tool 代码不包含 Domain semantics。
- `get_task`、`get_project`、`get_completed_since` 和 `get_lean_snapshot` 都不依赖
  通用 Raw field fallback。

### Server-side Acceptance

固定验收模式：

```text
Raw Primitive Oracle
    vs
Domain MCP Tool
```

Raw Oracle 直接调用 `queryOmnifocus` primitive。System Under Test 使用 STDIO MCP
client 调用本地构建 Server 上对应的 Domain Tool。

临时 acceptance harness 独立计算 expected semantics。它不得将以下生产模块作为
expected logic 导入：

- `taskClassifier`
- `dateSemantics`
- `statusSemantics`
- `taskMapper`
- `projectClassifier`
- `projectDateSemantics`
- `projectMapper`
- `completionAdapter`
- `completionClassifier`
- `completionMapper`

## 13. get_task 验收结果

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

## 14. get_project 验收结果

当前 regression 结果：

- Test files：17 passed
- Tests：343 passed
- TypeScript build：PASS
- `git diff --check`：PASS

真实数据库 server-side acceptance 结果：

- MCP initialize：PASS
- `get_project` registration：PASS
- Raw Oracle：PASS
- Raw projects：135
- Raw fields：19
- OBSERVED cases：6
- OBSERVED case result：6 / 6 PASS
- Field mismatch：0
- Raw Contract error：0
- Adapter error：0
- Mutation Tool calls：0
- Server-side acceptance：PASS

已观察并通过：

- active project
- sequential project
- single actions
- folder project
- completed project
- direct due

未观察到：

- dropped project
- inherited due
- direct defer
- inherited defer

Codex client acceptance 结果：PASS。已通过当前 `omnifocus-local` 验证 canonical ID
精确查询、name 精确查询、standard project、single actions、Folder context、task
summary 和 direct due。Mutation calls 和 OmniFocus writes 均为 0。

`NOT OBSERVED` 不等于 `FAIL`。没有为了补齐缺失 Case 而创建或修改真实 OmniFocus
数据。

## 15. get_completed_since 验收结果

当前 regression 结果：

- Test files：20 passed
- Tests：410 passed
- Failures：0
- TypeScript build：PASS，0 errors
- `git diff --check`：PASS

真实数据库 server-side acceptance 使用固定 UTC 区间
`2026-01-01T00:00:00.000Z` 至 `2026-07-10T23:59:59.999Z`，结果：

- MCP initialize：PASS
- `get_completed_since` registration：PASS
- Raw Oracle：PASS
- Raw completion records：149
- Project root records excluded：113
- Expected completion events：36
- MCP completion events：36
- Field mismatch：0
- Raw Contract error：0
- Adapter error：0
- Mutation Tool calls：0
- Server-side acceptance：PASS

已观察并通过：ordinary action completion、action group completion、
project-contained completion、Inbox completion、带 tags、无 tags 和多个完成事件。
区间边界上没有自然存在的完成事件，因此 same boundary timestamp 为
`NOT OBSERVED`。

Codex client acceptance 使用当前 `omnifocus-local` 和固定 UTC 区间
`2026-07-01T00:00:00.000Z` 至 `2026-07-10T23:59:59.999Z`，返回 9 个事件。已验证：

- 显式区间查询和稳定事件结构。
- ordinary action 与 action group kind。
- Project context。
- 带 tags 与无 tags 事件。
- `completionDate` 降序。
- Project root 排除。
- 等价时区 offset 归一化。
- 空区间成功返回空数组。
- date-only、无时区 datetime 和反向区间均返回 `invalid_arguments`。
- `raw`、`status` 和 `taskStatus` 均未公开。

该 client acceptance 区间未观察到 Inbox completion，因此该 Case 为
`NOT OBSERVED`；server-side acceptance 的更宽区间已经观察并验证该 Case。Mutation
calls 和 OmniFocus writes 均为 0，Codex client acceptance 总结论为 PASS。

## 16. get_lean_snapshot 验收结果

当前冻结的 Due Attention ownership 里程碑 regression 记录：

- Test files：23 passed
- Tests：537 passed
- Failures：0
- TypeScript build：PASS，0 errors
- `git diff --check`：PASS

最新 server-side acceptance 记录：

- MCP initialize：PASS
- Server：OmniFocus MCP 1.9.2
- `get_lean_snapshot` registration：PASS
- Raw tasks：155
- Raw Active Projects：12
- 完整 Lean Snapshot payload comparison：PASS
- Project/root Due consistency checks：12
- Project/root Due mismatches：0
- Field、Raw Contract、Adapter、root join、section count、sorting、reason mismatch：0
- Mutation Tool calls：0
- OmniFocus writes：0
- Server-side acceptance：PASS

真实 Weekly Review Case 验证 direct-owner granularity：

- Project root 直接拥有 Due，native status 为 `DueSoon`。
- Project 分别进入 active、planned、deadline，各一次。
- 8 个继承 Due 的 children 不产生 `dueSoon`、`overdue` 或 `planned` Attention。

最新 Codex client acceptance 记录：

- Active Projects：12
- Planned Projects：2
- Project Deadlines：1
- Attention：0
- Inbox：0
- Weekly Review 在 active、planned、deadline 各一次。
- 已知 inherited Due children 在 Attention 中为 0。
- 所有 sections 满足 total、returned、truncated invariants。
- Mutation calls：0
- OmniFocus writes：0
- Client acceptance：PASS

以上数量是对应里程碑的验收快照，不应视为未来实时数据库数量。后续使用必须重新查询。

## 17. 开发规则

1. 默认只读。
2. 不得为了满足测试 Case 而修改真实 OmniFocus 数据。
3. 每次只为一个 Tool 建立一条完整纵向链路。
4. 不在 `queryOmnifocus` 中加入个人业务语义。
5. Raw facts 与 Domain interpretations 保持分离。
6. Direct facts 必须始终与 effective 或 inherited facts 分离。
7. Adapter 不得修复损坏的 Raw Contract。
8. Domain Layer 不得依赖 MCP Tool Layer。
9. Business Tool 不得公开内部 `RawTask`、`RawProject`、`RawCompletedTask`、
   `RawLeanTask` 或 `RawLeanProject`。
10. 每个新 Domain Tool 都使用 Raw Primitive Oracle 与 Domain MCP Tool 对比进行
    server-side acceptance。
11. 一个 Tool 完成、验收并冻结后，再开始下一个 Tool。
12. 未经明确任务，不修改 Bridge 架构。
13. 未经明确任务，不删除 upstream Tools。
14. 不把具体项目历史、N322 历史或个人判断硬编码进 MCP。

## 18. 当前状态与下一步方向

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
    -> Codex client acceptance PASS
Project Domain Layer
    -> implemented
get_project
    -> implemented
    -> unit tested
    -> architecture checked
    -> server-side acceptance PASS
    -> Codex client acceptance PASS
Completion Domain Layer
    -> implemented
get_completed_since
    -> implemented
    -> unit tested
    -> architecture checked
    -> server-side acceptance PASS
    -> Codex client acceptance PASS
Snapshot Domain Layer
    -> implemented
get_lean_snapshot
    -> implemented
    -> unit tested
    -> architecture checked
    -> server-side acceptance PASS
    -> Codex client acceptance PASS
```

当前边界与未来复审项：

- Full Snapshot MCP 当前暂缓开发。低频需求采用 OmniFocus 手动/plugin/file 导出后交由
  AI 按需分析；只有出现明确、重复且真实的个人需求时才重新评估。
- Action 当前属于 Task Domain 的 `TaskKind`，不计划仅为别名增加 `ActionView`、
  `get_action` 或 `get_work_actions`。只有 Action 获得独立 lifecycle、health/execution
  state 或不可由 `TaskView` 表达的分析价值时才复审。
- Server-side curated Tool Surface 已通过 `personal-production` Profile 实现；当前集合只含
  四个 Domain read tools 且无 Resources。未设置环境变量默认进入该 Profile，
  `upstream-full` 只能显式启用。
- 显式 mutation gateway 只有在定义 user authorization、preview/confirmation、有限
  mutation set、auditability、failure/rollback 和 duplicate protection 后才可复审。

当前没有由本文档承诺的下一个新 Tool。演进应优先维护已冻结 Domain Contract、ADR 和
GPT Tool routing 的一致性。
