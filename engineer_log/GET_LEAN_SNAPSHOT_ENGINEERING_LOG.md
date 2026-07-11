# get_lean_snapshot 工程日志

## 基本信息

- 功能：`get_lean_snapshot`
- 实现基准：`0285800442fcb520998a6ff181309efc7f4ba42c`
- 实现提交：`1593e5b0bbef4ab899d75fd295fcc0fe3d10ae44`
- 性质：只读、all-system current-state Snapshot、稳定 Domain JSON

## 修改原因

`get_task`、`get_project` 和 `get_completed_since` 分别提供单对象详情或历史完成事件，
但 AI 仍缺少一次读取当前全系统管理状态的紧凑入口。直接使用 database dump 会包含
大量历史对象和 Raw 细节，通用 `query_omnifocus` 的 Markdown 输出也不适合作为稳定
Snapshot Contract。

因此需要一个只读、体积受控的 Domain Tool，把当前 Active Projects、需要关注的 Tasks
和 Inbox 汇总成稳定 JSON，同时明确排除尚未设计的业务判断。

## 修改目标

提供只读 Tool：

```text
get_lean_snapshot
```

v1 输出：

```text
generatedAt
scope = all
projects.active
attention
inbox
```

目标包括：

- 使用当前 OmniFocus native status 和 direct/effective facts。
- 对 Project、Attention 和 Inbox 完整分类计数后稳定排序与截断。
- 输出 compact summaries，不读取 note 全文或公开 Raw objects。
- 不推导 Waiting、health、risk、priority、recommendation 或 recent completions。
- 不增加任何 mutation capability。

## 设计方案

保持纵向分层：

```text
queryOmnifocus tasks + projects
    -> Snapshot strict adapters
    -> shared Task / Project semantics
    -> Lean Snapshot composition
    -> get_lean_snapshot Tool
```

主要决策：

1. 使用两次并行 Raw query：remaining Tasks 和 Active Projects，不调用其他 Tool，也不
   使用 N+1 lookup。
2. Task 和 Project 使用独立的固定最小字段集合，全部要求显式 mapping。
3. Snapshot 使用 `hasNote` boolean，不读取 note 全文；Project 使用 task counts，不读取
   完整 Task details。
4. Adapter 只接受有效 Raw contract，不静默修复类型或跳过 malformed items。
5. Project roots 保留在内部 Raw Task 集合中，但不进入 Lean Task、Attention 或 Inbox
   输出。
6. Attention reason 顺序固定为 `overdue`、`dueSoon`、`planned`、`flagged`；同一 Task
   只输出一次，可携带多个 reasons。
7. Inbox 与 Attention 是独立 section，同一 Task 可以同时出现。
8. `limitPerSection` 默认为 25，只接受 `1..100` 整数；total 在截断前计算。
9. 请求内只读取一次当前时间并输出 `generatedAt`，不提供任意历史 `at`。

初始 v1 使用已经到达的 effective Planned 作为 Task `planned` Attention trigger，并排除
Blocked Task。后续真实数据验证发现 inherited Planned child fan-out，该语义已在
`GET_LEAN_SNAPSHOT_PLANNED_CORRECTION_ENGINEERING_LOG.md` 所记录的独立里程碑中修正。

## 实现方式

Snapshot Domain 模块：

- `snapshotTypes.ts`：定义 `RawLeanTask`、`RawLeanProject`、Lean summaries 和
  `LeanSnapshotView`。
- `snapshotTaskAdapter.ts`：严格验证 remaining Task Raw contract。
- `snapshotProjectAdapter.ts`：严格验证 Active Project、Folder 和 task counts。
- `leanTaskMapper.ts`：复用 Task kind、date 和 flag semantics。
- `leanProjectMapper.ts`：复用 Project kind、status 和 date semantics。
- `attentionClassifier.ts`：生成固定 Attention reasons。
- `snapshotSorting.ts`：实现 UTF-16 code-unit 稳定排序和 tie-breakers。
- `leanSnapshotComposer.ts`：负责去重、完整计数、排序、截断和最终 view 组合。

Tool 模块：

- `getLeanSnapshot.ts` primitive 并行执行两次固定 Raw query，逐项调用 strict adapters，
  然后进入 composer。
- definition 只接受可选 `limitPerSection`，负责参数错误和 `query_failed` MCP response。
- Server 注册只读 `get_lean_snapshot`。

未修改：

- Bridge 和临时脚本执行机制
- dependencies 和 `config.toml`
- upstream mutation Tools
- 真实 OmniFocus 数据

## 测试与检查结果

### Unit / Fixture Regression

- Test files：23 passed
- Tests：495 passed
- Failures：0
- TypeScript build：PASS，0 errors
- `git diff --check`：PASS

重点覆盖：

- Snapshot Task / Project Adapter contracts
- Action、Action Group 和 Project root exclusion
- Active Project kind、Folder、dates 和 task counts
- Attention reasons、multi-reason aggregation 和 Blocked exclusion
- Project、Attention 和 Inbox 稳定排序
- total、returned、truncated 和 limit invariants
- Inbox/Attention overlap
- empty Snapshot、invalid limit 和 query/Adapter failures
- no raw、note、Waiting、health、risk、priority 或 recommendation output

### Server-side Acceptance

验收模式：

```text
queryOmnifocus primitive Raw Oracle
    vs
STDIO MCP get_lean_snapshot
```

结果：

- MCP initialize：PASS
- `get_lean_snapshot` registration：PASS
- `generatedAt` call interval：PASS
- Raw remaining Tasks：155
- Raw Active Projects：12
- Unique Attention Tasks：8
- Inbox Tasks：0
- Field mismatch、Raw Contract error、Adapter error：均为 0
- Mutation calls：0
- OmniFocus writes：0
- Server-side acceptance：PASS

真实观察覆盖 Active、single-actions、Folder、sequential Projects，ordinary Action、Action
Group、project-contained Action，以及 direct/inherited date facts。缺少自然数据的 Cases
记录为 `NOT OBSERVED`，没有创建或修改 OmniFocus 数据。

### Codex Client Acceptance

当前 `omnifocus-local` 验证结果：

- `get_lean_snapshot` 已暴露，mutation Tools 保持隐藏。
- 默认调用返回 12 个 Active Projects、8 个 Attention Tasks 和 0 个 Inbox Tasks。
- `limitPerSection: 3` 时 Project 与 Attention 保留完整 total，并正确设置 truncation。
- `limitPerSection: 0` 返回 `invalid_arguments`。
- `scope = all`，且未公开 raw、note 全文或未设计的 Snapshot concepts。
- Mutation calls 和 OmniFocus writes 均为 0。

Client acceptance：PASS。

## 结果

`get_lean_snapshot` 建立了面向当前状态的紧凑 all-system Domain API，并复用了此前 Task、
Project 和 Completion 里程碑形成的严格 Adapter 与 Raw Oracle acceptance 模式。后续
Planned correction 在不改变两次 Raw query 和只读边界的前提下进一步收紧了 Planned
owner 语义。
