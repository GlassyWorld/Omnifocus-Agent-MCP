# Date Semantics Evolution

> 类型：主题综合文档。它总结工程演进，不替代 ADR、测试或原始工程日志。

## 当前结论

Task/Project 日期以 direct、effective 和 source 保留 provenance。Planned/Due 的系统级 visibility 只归属 direct owner：inherited child 可以保留 effective fact，但不会因此生成重复 planned、dueSoon 或 overdue attention。Project direct Planned/Due 分别进入 `projects.planned` 和 `projects.deadline`。

## 演进过程

1. Task 和 Project Domain 先建立 direct/effective/source 表达。
2. Lean Snapshot 初版将日期事实组合为 attention 和 project sections。
3. 真实数据验收暴露 inherited Planned child fan-out；Planned Correction 改为 direct-owner visibility。
4. Due Attention Granularity 用相同原则收束 Due：Project/root direct Due 归入 project deadline，继承子任务不重复产生 due attention。
5. ADR-002 接受统一 direct ownership；ADR-004 固定独立 section 与完整性规则。

## 关键转折

- “effective 日期存在”不等于“该对象拥有 attention signal”。
- 同一时间戳不用于全局去重；ownership/provenance 才是分类依据。
- `projects.deadline` 从完整 active Project 集合派生，不从截断后的 `projects.active.items` 派生。

## 已废弃方案

- inherited Planned child fan-out。
- inherited Due child 独立生成 dueSoon/overdue。
- 用 timestamp 相等替代 ownership 判断。
- 从已截断 section 推导另一个 section。

## 仍未解决

- 未来写入契约如何验证用户提交的 Due/Planned/Defer 与时区输入，尚未设计。
- 历史验收中的对象数量和日期边界只是当时快照，需要实时判断时必须重新查询。

## 来源文件

- `docs/architecture/decisions/ADR-002-direct-owner-semantics.md`
- `docs/architecture/decisions/ADR-004-lean-snapshot-scope.md`
- `engineer_log/GET_LEAN_SNAPSHOT_ENGINEERING_LOG.md`
- `engineer_log/GET_LEAN_SNAPSHOT_PLANNED_CORRECTION_ENGINEERING_LOG.md`
- `engineer_log/GET_LEAN_SNAPSHOT_DUE_ATTENTION_GRANULARITY_ENGINEERING_LOG.md`
- `src/domain/task/dateSemantics.ts`
- `src/domain/project/projectDateSemantics.ts`
- `src/domain/snapshot/**` 及相关 tests
