# get_completed_since 工程日志

## 基本信息

- 功能：`get_completed_since`
- 实现基准：`20fb83992175384aaab654b1025399787f9ec15d`
- 实现提交：`0285800442fcb520998a6ff181309efc7f4ba42c`
- 性质：只读、完成事件流、稳定 Domain JSON

## 修改原因

`get_task` 表达单对象当前详情，但历史回顾需要的是明确时间区间内的完成事件流。
使用 `taskStatus`、`modificationDate` 或 effective completion 推导历史完成会混淆自身完成
与容器继承完成，也无法提供稳定的区间边界和排序契约。

## 修改目标

提供只读 Tool：

```text
get_completed_since
```

只读取 direct `completionDate` 落在指定闭区间内的 Action 或 Action Group，用于历史
回顾和后续 Snapshot 工作流。Tool 不执行总结、Case 生成、风险判断或写入。

## 设计方案

保持分层：

```text
queryOmnifocus Raw Layer
    -> completionAdapter
    -> Completion Domain Semantics
    -> get_completed_since Tool
```

主要决策：

1. 输入为 `{ since: string; until?: string }`，仅接受带 `Z` 或明确 UTC offset 的完整
   ISO 8601 datetime。
2. `until` 缺省时只读取一次当前时间；输入统一规范化为 UTC。
3. 查询边界包含 `since` 和 `until`。
4. 只使用 direct `completionDate`，不通过 `taskStatus`、`modificationDate` 或
   `effectiveCompletedDate` 推导事件。
5. query primitive 增加 `completedSince` 和 `completedUntil` filter，结果按
   `completionDate` 降序。
6. 使用固定 `GET_COMPLETED_TASK_RAW_FIELDS` 和显式 mappings。
7. Project root completion 从事件流中排除；Action Group completion 保留。
8. 空结果是正常 success，不返回 `not_found`。

## 实现方式

Domain 模块：

- `completionTypes.ts`：定义 `RawCompletedTask` 和 `CompletedTaskView`。
- `completionAdapter.ts`：严格验证 identity、absolute completion datetime、Project/Inbox
  context、tags 和 timestamps。
- `completionClassifier.ts`：根据 `hasChildren` 分类 action/action_group。
- `completionMapper.ts`：输出完成时间、Project、Inbox、tags 和 timestamps。

Tool 模块：

- primitive 固定查询 completed Tasks，并过滤 `isProjectRoot`。
- definition 负责 datetime validation、UTC normalization 和区间顺序检查。
- 成功响应固定为 `{ success: true, completed: [...] }`。
- 错误仅使用 `invalid_arguments` 和 `query_failed`。
- 输出不包含 raw、status 或 taskStatus。

未修改：

- `get_task` 和 `get_project` Contracts
- Bridge 和 dependencies
- mutation surface
- 真实 OmniFocus 数据

## 测试与检查结果

### Unit / Fixture Regression

- Test files：20 passed
- Tests：410 passed
- Failures：0
- TypeScript build：PASS，0 errors
- `git diff --check`：PASS

重点覆盖：

- completedSince/completedUntil inclusive filters
- completionDate 显式 mapping 和 descending sort
- absolute datetime、offset normalization 和默认 until clock
- 反向区间、date-only、无时区 datetime 等 invalid arguments
- Project/Inbox mapping、tags 和 nullable timestamps
- ordinary Action、Action Group 与 Project root exclusion
- 空区间 success 和 query failure

### Server-side Acceptance

验收模式：

```text
queryOmnifocus primitive Raw Oracle
    vs
STDIO MCP get_completed_since
```

固定区间：

```text
2026-01-01T00:00:00.000Z
    -> 2026-07-10T23:59:59.999Z
```

结果：

- MCP initialize：PASS
- `get_completed_since` registration：PASS
- Raw Oracle：PASS
- Raw completion records：149
- Project root records excluded：113
- Expected completion events：36
- MCP completion events：36
- Field mismatch、Raw Contract error、Adapter error：均为 0
- Mutation calls：0
- Server-side acceptance：PASS

真实观察并通过 ordinary Action completion、Action Group completion、Project-contained、
Inbox、带 tags、无 tags 和多个完成事件。自然数据中未观察到恰好位于区间边界的事件，
记录为 `NOT OBSERVED`。

### Codex Client Acceptance

固定区间 `2026-07-01T00:00:00.000Z` 至
`2026-07-10T23:59:59.999Z` 返回 9 个事件，并验证：

- ordinary Action 与 Action Group kind。
- Project context、tags 和 completionDate 降序。
- Project root 排除和等价 timezone offset normalization。
- 空区间成功。
- date-only、无时区和反向区间返回 `invalid_arguments`。
- 输出不包含 raw、status 或 taskStatus。
- Mutation calls 和 OmniFocus writes 均为 0。

该较窄 client 区间未观察到 Inbox completion；更宽的 server acceptance 已覆盖该 Case。
Client acceptance：PASS。

## 结果

`get_completed_since` 将直接完成事实建模为稳定、可排序、可按绝对时间区间读取的事件
流，为历史回顾提供了只读数据源，并避免把当前 Task detail 或 inherited completion
混入完成历史。
