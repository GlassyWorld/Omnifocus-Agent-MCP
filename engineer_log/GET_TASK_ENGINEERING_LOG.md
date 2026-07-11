# get_task 工程日志

## 基本信息

- 功能：`get_task`
- 实现基准：`fcbd1524f7027ff38dc0d49fa501ee2be2c2dc46`
- 实现提交：`57ad48ffaf77f12f63834f452f157cf0daaebeda`
- 性质：只读、单 Task、稳定 Domain JSON

## 修改原因

原始 `query_omnifocus` 面向通用查询和人类阅读，会将结果格式化为 text/Markdown，
不适合作为稳定的单对象 Domain API。AI 需要可靠区分 Task 自身事实和容器继承事实，
尤其是 direct/effective 日期、完成、丢弃和 flag 状态。

同时，Project root Task、Action Group、普通 Action、Inbox location 和 Project context
必须有明确语义，不能依赖名称、ID 比较或 `taskStatus` 猜测。

## 修改目标

提供只读 Tool：

```text
get_task
```

输入只允许精确 ID 或精确 name 二选一，输出稳定 `TaskView`，并满足：

- 保留 direct 与 effective/inherited facts。
- 稳定区分 `action`、`action_group`、`project_root`。
- Inbox location 与 Project context 分离。
- 不公开内部 Raw contract。
- 不提供任何 mutation capability。

## 设计方案

保持纵向分层：

```text
queryOmnifocus Raw Layer
    -> taskAdapter
    -> Task Domain Semantics
    -> get_task Tool
```

主要决策：

1. 复用 `queryOmnifocus` primitive，不复用 `query_omnifocus` Tool handler。
2. 增加 `taskId` 和区分大小写的 `taskNameExact` filter，不改变原有 partial search。
3. 使用固定 `GET_TASK_RAW_FIELDS`，所有字段要求显式 mapping，不依赖 generic fallback。
4. Adapter 严格校验类型和必需字段，不使用 `Boolean`、`Number` 或 `String` 修复错误
   Raw values。
5. Project root 使用显式 `isProjectRoot`；Action Group 使用 `hasChildren`。
6. Due、Planned、Defer 保留 `direct`、`effective`、`source`。
7. Completion、Drop、Flag 分别区分 direct、inherited 和 none，不通过 `taskStatus`
   推导 direct completion 或 drop。
8. Tool 层负责 XOR 参数校验、单对象约束和稳定错误分类。

## 实现方式

Domain 模块：

- `taskTypes.ts`：定义 `RawTask`、`TaskView` 和共享语义类型。
- `taskAdapter.ts`：严格验证 query item，并规范化合法 nullable values。
- `taskClassifier.ts`：通过 `isProjectRoot` 和 `hasChildren` 分类 Task kind。
- `dateSemantics.ts`：解释 direct/effective 日期。
- `statusSemantics.ts`：解释 completion、drop 和 flag。
- `taskMapper.ts`：将 `RawTask` 映射为 `TaskView`。

Tool 模块：

- `getTask.ts` primitive 固定查询 `tasks`、`includeCompleted: true`、`limit: 2`。
- definition 只接受 `{ id?: string; name?: string }`，要求严格 XOR。
- 0、1、2 个结果分别映射为 `not_found`、success、`ambiguous_match`。
- query 或 Adapter failure 统一映射为 `query_failed`。
- Tool error type 位于 Tool Layer，Domain 不依赖 MCP error contract。

未修改：

- Bridge 和临时脚本执行机制
- dependencies 和 `package.json`
- OmniFocus mutation surface
- 真实 OmniFocus 数据

## 测试与检查结果

### Unit / Fixture Regression

里程碑 gate 中 `npm test`、`npm run build` 和 `git diff --check` 均通过。

重点覆盖：

- taskId exact、taskNameExact 和原 partial taskName regression
- 固定 Raw fields 的显式 mappings
- Adapter 必需字段、错误 boolean/array/number 类型及 Project/Inbox invariants
- Task kind 三种分类
- Due、Planned、Defer direct/inherited/none
- Completion、Drop、Flag direct/inherited/none
- Mapper 的 Project、Inbox、hierarchy、tags 和 no-raw output
- Tool XOR、空值、精确保留带前后空格名称
- `not_found`、success、`ambiguous_match` 和 `query_failed`

### Server-side Acceptance

验收模式：

```text
queryOmnifocus primitive Raw Oracle
    vs
STDIO MCP get_task
```

结果：

- MCP initialize：PASS
- `get_task` registration：PASS
- Raw Oracle：PASS
- Raw tasks：967
- Observed cases：10
- Observed case result：10/10 PASS
- Field mismatch、Raw Contract error、Adapter error：均为 0
- Mutation calls：0
- Server-side acceptance：PASS

真实观察并通过 ordinary action、action group、project root、Inbox、direct/inherited
completion、direct/inherited Due 和 direct/inherited Planned。Dropped、Defer 和 Flag 的部分
真实 Case 未自然出现，记录为 `NOT OBSERVED`，没有创建数据补齐。

### Codex Client Acceptance

当前 `omnifocus-local` 已验证：

- ID exact 与 name exact 返回同一 Task。
- inherited Due 与 inherited Completion semantics。
- Project root 和 Action Group kind。
- 返回稳定 JSON，包含 status、dates、project、location、hierarchy 和 tags，不包含 raw。
- mutation Tools 对该客户端保持隐藏，Mutation calls 和 OmniFocus writes 均为 0。

Client acceptance：PASS。

## 结果

`get_task` 建立了首条完整的 Raw、Adapter、Domain、Tool 纵向实现，为后续 Project、
Completion 和 Snapshot Tools 提供了严格 Adapter、稳定 Domain JSON 和 Raw Oracle
acceptance 的基础模式。
