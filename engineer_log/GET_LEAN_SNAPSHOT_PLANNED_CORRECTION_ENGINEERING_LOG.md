# get_lean_snapshot Planned Correction 工程日志

## 基本信息

- 功能：`get_lean_snapshot` Planned Project Visibility correction
- 实现基准：`1593e5b0bbef4ab899d75fd295fcc0fe3d10ae44`
- 实现提交：`ca26186eeff36447d66afe1758ae71f01009cb93`
- 性质：只读 Domain 语义修正

## 修改原因

旧实现使用已经到达的 `effectivePlannedDate` 触发 Task Attention。Project root 直接设置
Planned 后，其 child Actions 会继承相同的 effective Planned，因此一个 workflow owner
可能展开为多个 child Attention items。

同时，Project root owner 只出现在 `projects.active`。该 section 会按
`limitPerSection` 截断，Planned 已到达的 Project 可能无法稳定进入 AI 当前上下文。

## 修改目标

冻结以下语义：

> Direct Planned owner is the Planned-triggered visibility unit.

对应表示方式：

```text
Task / Action Group direct Planned owner
    -> attention

Active Project root direct Planned owner
    -> projects.planned

Inherited descendants
    -> retain Planned facts
    -> no independent Planned trigger
```

本次修正不改变 Due、DueSoon、Overdue、Waiting 或 mutation 语义。

## 设计方案

保持现有分层：

```text
Raw Layer
    -> Adapter Layer
    -> Domain Layer
    -> Tool Layer
```

主要决策：

1. 保持 Task 和 Project 两次并行 Raw query，不增加第三次查询或 N+1 lookup。
2. 不增加 Project Raw Planned 字段，不修改 query mappings。
3. 复用 Task Raw query 中的 Project root facts，通过 canonical ID 精确 join：
   `RawLeanProject.id === RawLeanTask.id && isProjectRoot === true`。
4. Task/Action Group 只有 direct Planned 已到达且当前不是 Blocked 时，才产生
   `planned` Attention reason。
5. Active Project root direct Planned 已到达时，Project 进入独立的
   `projects.planned` section；Project classification 不检查 root Task Blocked。
6. `projects.planned` 从完整 Active Project summaries 独立分类、排序、计数和截断，
   不从已经截断的 `projects.active.items` 派生。
7. Project Planned 按 `planned.direct`、name、ID 稳定排序。

## 实现方式

新增 Domain helpers：

- `snapshotProjectPlannedResolver.ts`：建立 root Task 索引、执行 canonical join、生成
  Project Planned `DateSemantics`，并检查 missing/duplicate root invariants。
- `projectPlannedClassifier.ts`：判断 Active Project 的 direct Planned 是否已到达，包含
  `planned.direct === generatedAt` 的边界。

主要调整：

- `attentionClassifier.ts` 改为使用共享 `DateSemantics` 和 direct-only Planned trigger。
- `LeanProjectSummary.dates` 增加 `planned`。
- `LeanSnapshotView.projects` 增加独立的 `planned` section。
- `leanProjectMapper.ts` 接收 resolver 已解析的 Planned semantics。
- `leanSnapshotComposer.ts` 在过滤 Project roots 前完成 join，并从完整 Project summary
  集合分别生成 `projects.active` 和 `projects.planned`。
- `snapshotSorting.ts` 增加 Planned Project comparator，并让 Planned Task Attention 使用
  direct Planned 排序。
- Tool 参数说明明确 `limitPerSection` 同时作用于 active projects、planned projects、
  attention 和 Inbox。

未修改：

- `queryOmnifocus` Raw query 和 field mappings
- Snapshot Task / Project Adapters
- `get_project` Contract
- Bridge 和临时脚本执行机制
- MCP mutation surface
- dependencies 和 `config.toml`

## 测试与检查结果

### Unit / Fixture Regression

- Test files：23 passed
- Tests：510 passed
- 本轮新增测试：15
- Failures：0
- TypeScript build：PASS，0 errors
- `git diff --check`：PASS

重点覆盖：

- direct/inherited/future/exact-boundary Planned classification
- Action Group 和 Blocked Task 行为
- Weekly Review 与 Daily Reset inherited child fan-out regression
- Project root canonical join 及 missing/duplicate/wrong-kind failures
- Planned Project 排序、独立截断和 section invariants
- 30 Active Projects 下 planned owner 不受 active section 截断影响
- 35 Planned Projects 下 total、returned 和 truncated 正确

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
- Raw tasks：155
- Raw Active Projects：12
- Planned-ready Projects：1（该次采样时间）
- Field、Raw Contract、Adapter、root join、section count、sorting 和 reason mismatch：均为 0
- Weekly Review 在 `projects.planned` 中恰好出现一次
- Weekly Review 8 个 inherited Planned children 的 Planned reason 数量：0
- Mutation calls：0
- OmniFocus writes：0
- Server-side acceptance：PASS

### Codex Client Acceptance 补充证据

后续单次 `omnifocus-local.get_lean_snapshot(limitPerSection: 100)` 采样确认：

- Active Projects：12
- Planned-ready Projects：2
- Planned Project IDs：`iS0-YjYC11Y`、`d7PMNpwviRk.0`
- Weekly Review 和 Daily Reset 均在 `projects.planned` 中恰好出现一次
- Attention：8，`byReason = { overdue: 0, dueSoon: 8, planned: 0, flagged: 0 }`
- Weekly Review 和 Daily Reset inherited children 的 Planned reason 数量均为 0
- 所有 section 均未截断且满足 `SnapshotList` invariants
- Planned Correction Client Acceptance：PASS

该次检查同时复现了 8 个 Weekly Review children 的
`dueSoon reason + inherited due` 展开。Due semantics 不属于本次修改范围，该事实未被
解释为 Planned correction failure，也没有在本任务中设计或实施 Due correction。

## 结果

本次修改消除了 inherited Planned child fan-out，并让 Active Project root Planned
owners 通过独立的 `projects.planned` section 稳定进入 Snapshot。实现保持只读，没有
增加查询、写入能力或 Bridge 复杂度。
