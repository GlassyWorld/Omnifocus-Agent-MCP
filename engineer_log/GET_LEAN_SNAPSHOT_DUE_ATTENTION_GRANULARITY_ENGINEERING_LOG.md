# get_lean_snapshot Due Attention Granularity 工程日志

## 基本信息

- 功能：`get_lean_snapshot` Due Attention ownership semantics correction
- 实现基准：`060ebb6dd4103a4554cfa370c92cabf7df9a1bd7`
- 实现提交：本次里程碑提交（`freeze lean snapshot due attention ownership semantics`）
- 性质：只读 Domain 语义修正

## 修改原因

旧实现直接使用 OmniFocus native `taskStatus` 生成 `dueSoon` 和 `overdue` Attention
reasons，没有检查 Due 是 Task 自身直接设置，还是从 Action Group 或 Project root 继承。

真实 Weekly Review Project 复现了该粒度缺陷：Project root 只有一个 direct Due，但 8 个
children 都继承相同的 effective Due，并被 OmniFocus 报告为 `DueSoon`。旧 Snapshot 因此把
一个 Project deadline 展开为 8 个 child Attention signals，同时没有独立表达真正的
Project deadline owner。

## 修改目标

冻结以下语义：

> Direct Due owner determines deadline signal granularity.

对应表示方式：

```text
Leaf Action direct Due owner
    -> Task Attention

Action Group direct Due owner
    -> Task Attention once

Active Project root direct Due owner
    -> projects.deadline

Inherited descendants
    -> retain Due facts
    -> no independent dueSoon / overdue reason
```

DueSoon 和 Overdue 使用同一 direct-owner provenance 规则，避免 deadline 跨越后再次出现
相同的 inherited child fan-out。

## 设计方案

保持现有分层和两条并行 Raw query，不新增查询、Raw fields 或 Adapter contract。

主要决策：

1. Task 和 Action Group 只有 `dates.due.source === "direct"`，且 native `taskStatus` 为
   `DueSoon` 或 `Overdue` 时，才产生对应 Attention reason。
2. Project root 不进入 Task Attention。Active Project root direct Due owner 通过独立的
   `projects.deadline` section 表达，item 显式携带 `dueSoon | overdue` state。
3. Project deadline state 只来自 canonical root Task 的 native `taskStatus`，不使用
   `generatedAt`、日期运算或自定义 DueSoon window。
4. Root 为 `Blocked` 时，v1 不产生 Project deadline item。这是 native-status source
   boundary，不表示 blocked deadline 在业务上不重要。
5. 原 Planned resolver 扩展并收敛为 Project root semantics resolver，只输出 Planned、
   Due 和 native root `taskStatus`，不加入 Defer、Flag、Completion 或其他 facts。
6. Project Raw Due 与 root Task Due 必须按 `direct`、`effective`、`source` 完全一致；任何
   mismatch 都是 Domain Contract failure，不静默选择或修复任一来源。
7. Nested Project、Action Group 和 leaf direct Due owners 按 owner identity 分别保留，
   不按相同 timestamp 去重。冻结原则为：deduplicate by inheritance, not by timestamp。
8. `projects.deadline` 从完整 Active Project/root semantics 集合独立分类、排序、计数和
   截断，不从已经截断的 `projects.active.items` 派生。
9. Project 可以同时出现在 `projects.active`、`projects.planned` 和
   `projects.deadline`，因为这些 section 表达不同的管理语义。

`tasks.total` 和 `tasks.byStatus` 只提供 aggregate descendant/native-status context。它们
不表示独立 deadline owners，也不能完整描述 execution-ready workflow structure。需要
工作流细节时，继续使用 `get_project` 和 selective `get_task`，本次不实现
`get_work_actions`。

## 实现方式

新增 Domain helpers：

- `projectDeadlineClassifier.ts`：校验 Project/root Due 三元组一致性，并根据 direct Due
  ownership 和 native root status 分类 Project deadline state。
- `snapshotProjectRootSemanticsResolver.ts`：建立 root Task 索引、执行 canonical ID join，
  并返回 Planned、Due 和 root `taskStatus`。

主要调整：

- `attentionClassifier.ts` 对 DueSoon 和 Overdue reasons 增加 direct Due source gate。
- `LeanSnapshotView.projects` 增加 `deadline: SnapshotList<LeanProjectDeadlineItem>`。
- `leanSnapshotComposer.ts` 从完整 Project candidate 集合独立构建 active、planned 和
  deadline sections，并对每个 Active Project执行 Due consistency check。
- `snapshotSorting.ts` 为 Project deadlines 增加确定性排序：Overdue、DueSoon、direct Due
  date、Project name、Project ID。
- Task Due Attention 排序使用 direct Due date；reason order 继续保持 Overdue、DueSoon、
  Planned、Flagged。
- 原 `snapshotProjectPlannedResolver.ts` 被 root semantics resolver 替代。
- Tool 参数说明补充 `limitPerSection` 对 Project deadline section 独立生效。

保持不变：

- `LeanProjectSummary`
- `LeanAttentionItem`
- `AttentionReason`
- Snapshot Raw fields 和 query mappings
- Task / Project Snapshot Adapters
- `get_task`、`get_project`、`get_completed_since` Contracts
- Bridge、dependencies、`config.toml` 和 MCP mutation surface

## 测试与检查结果

### Unit / Fixture Regression

- Test files：23 passed
- Tests：537 passed
- 本轮新增测试：27
- Failures：0
- TypeScript build：PASS，0 errors
- `git diff --check`：PASS

重点覆盖：

- Leaf Action 和 Action Group direct/inherited DueSoon、Overdue
- Due、Planned、Flagged mixed reasons 和固定 reason order
- Project direct DueSoon、Overdue、future、none 和 Blocked native-status boundary
- Project/root Due `direct`、`effective`、`source` mismatch failures
- Nested Project、Action Group、leaf direct owners 和相同 timestamp 不去重
- Weekly Review 1 root + 8 inherited children fan-out regression
- Overdue 1 root + 8 inherited children fixture regression
- Project deadline sorting、counts、truncation 和 section invariants
- 30 Active Projects 下 deadline owner 不受 active section 截断影响
- Planned、Inbox、Flagged 和既有 Domain Tool regressions

### Server-side Acceptance

验收模式：

```text
queryOmnifocus primitive Raw Oracle
    vs
STDIO MCP get_lean_snapshot
```

结果：

- MCP initialize：PASS
- Server：OmniFocus MCP 1.9.2
- `get_lean_snapshot` registration：PASS
- Raw tasks：155
- Raw Active Projects：12
- Full Snapshot comparison：PASS
- Project/root Due consistency checks：12
- Project/root Due mismatches：0
- Field、Raw Contract、Adapter、root join、section count、sorting 和 reason mismatch：均为 0
- Mutation calls：0
- OmniFocus writes：0
- Server-side acceptance：PASS

真实 Weekly Review 验证：

- Project ID：`iS0-YjYC11Y`
- root direct/effective Due：`2026-07-12T09:00:00.000Z`
- root native status：`DueSoon`
- inherited Due children：8
- `projects.active`：1
- `projects.planned`：1
- `projects.deadline`：1，state `dueSoon`
- child `dueSoon`、`overdue`、`planned` reasons：均为 0

真实 Overdue Project/child fan-out 在当前数据库中为 `NOT OBSERVED`，没有修改 OmniFocus
制造 Case；对应语义由 fixture tests 覆盖。

### Codex Client Acceptance

通过当前 `omnifocus-local.get_lean_snapshot(limitPerSection: 100)` 单次采样确认：

- `generatedAt` 位于 capture start/finish interval 内
- Active Projects：12
- Planned Projects：2
- Project deadlines：1
- Attention：0
- Inbox：0
- Weekly Review 在 active、planned、deadline 中各出现一次
- 8 个已知 Weekly Review child IDs 在 Attention 中出现 0 次
- 全局 `dueSoon reason + inherited due`：0
- 全局 `overdue reason + inherited due`：0
- Daily Reset 保持 active + planned，deadline 和 child Attention reasons 均为 0
- 所有 section 均未截断并满足 `SnapshotList` invariants
- Mutation calls：0
- OmniFocus writes：0
- Client acceptance：PASS

完整 Client MCP payload 作为仓库外验收 artifact 保存在 Desktop，没有加入 Git。

### Server Acceptance Supplement

补充验证再次确认：

- Raw Primitive Oracle 与 fresh-build STDIO MCP Snapshot 完全一致
- Project/root Due consistency checks：12，mismatches：0
- Full regression：23 files、537 tests、0 failures
- Build 和 `git diff --check`：PASS
- 30-Project 定向 fixture 中，deadline Project 虽不在截断后的 active items 内，仍独立
  出现在 `projects.deadline`
- 临时 acceptance harness 已删除

## 结果

本次修改将 DueSoon/Overdue visibility 收敛到 direct Due owner 粒度，消除了 inherited
child deadline fan-out，并通过独立 `projects.deadline` section 稳定表达 Project-level
deadline。实现保持只读，没有增加查询、写入能力、Bridge 复杂度或内部 Raw 暴露。
