# get_project 工程日志

## 基本信息

- 功能：`get_project`
- 实现基准：`57ad48ffaf77f12f63834f452f157cf0daaebeda`
- 实现提交：`20fb83992175384aaab654b1025399787f9ec15d`
- 性质：只读、单 Project、稳定 Domain JSON

## 修改原因

通用 Project query 不能直接作为稳定 Domain API。OmniJS Project ID 与现有
AppleScript-compatible Project root Task ID 属于不同 namespace，而本仓库对外需要一个
稳定 canonical Project ID。同时，Folder context、Task hierarchy、single-actions kind、
Project status 和 direct/effective 日期需要明确结构，不能留给调用方解释 Raw 字段。

## 修改目标

提供只读 Tool：

```text
get_project
```

用于按 canonical ID 或精确名称读取一个 Project，并输出稳定 `ProjectView`：

- canonical ID 固定为 `project.task.id.primaryKey`。
- Project kind 区分 `standard` 和 `single_actions`。
- status 同时保留 Raw 值和稳定 booleans。
- Folder、Task summary 和日期语义结构化输出。
- 不公开 `RawProject`，不提供 mutation capability。

## 设计方案

保持分层：

```text
queryOmnifocus Raw Layer
    -> projectAdapter
    -> Project Domain Semantics
    -> get_project Tool
```

主要决策：

1. 复用 `queryOmnifocus` primitive，不复用通用 Tool handler。
2. 增加区分大小写的 `projectNameExact`，保留原 `projectName` partial 行为。
3. 现有 `projectId` filter 继续兼容两个 ID namespace；get_project 在 Adapter 后只保留
   canonical ID exact match。
4. 使用固定 `GET_PROJECT_RAW_FIELDS` 和显式 mappings，不依赖 generic fallback。
5. `item.tasks` 提供 direct Task IDs，`item.flattenedTasks` 提供全部后代 Task IDs。
6. Adapter 严格验证 Folder pair、唯一 Task IDs、status 和非负整数 status counts。
7. `containsSingletonActions` 决定 Project kind。
8. Due 和 Defer 保留 direct/effective/source；不在该 Tool 中增加健康、风险或建议。

## 实现方式

Domain 模块：

- `projectTypes.ts`：定义 `RawProject`、`ProjectView`、kind、status 和 task counts。
- `projectAdapter.ts`：严格验证 Project Raw contract。
- `projectClassifier.ts`：分类 standard/single-actions。
- `projectDateSemantics.ts`：解释 direct/effective Project dates。
- `projectStatusSemantics.ts`：映射 Active、OnHold、Done、Dropped。
- `projectMapper.ts`：组合 Folder、dates、tasks 和 timestamps。

Tool 模块：

- primitive 固定查询 `projects`、`includeCompleted: true`、`limit: 2`。
- definition 仅接受 ID/name XOR，不支持 contains 或 caller-selected fields。
- 0、1、2 个 canonical matches 映射为 `not_found`、success、`ambiguous_match`。
- Adapter/query failures 映射为 `query_failed`。

未修改：

- `get_task` Contract
- Bridge 和 dependencies
- mutation capability
- 真实 OmniFocus 数据

## 测试与检查结果

### Unit / Fixture Regression

- Test files：17 passed
- Tests：343 passed
- TypeScript build：PASS
- `git diff --check`：PASS

重点覆盖：

- canonical Project ID 与双 namespace filter compatibility
- projectNameExact 与原 partial filter regression
- 全部固定 Raw fields 的显式 mappings
- Folder pair、Task ID uniqueness 和 status counts Adapter invariants
- standard 与 single-actions kind
- Active/OnHold/Done/Dropped status semantics
- direct/inherited Due 和 Defer
- direct Tasks、flattened Tasks 和 Project task summary
- Tool XOR、not_found、ambiguous_match 和 query_failed

### Server-side Acceptance

验收模式：

```text
queryOmnifocus primitive Raw Oracle
    vs
STDIO MCP get_project
```

结果：

- MCP initialize：PASS
- `get_project` registration：PASS
- Raw Oracle：PASS
- Raw projects：135
- Raw fields：19
- Observed cases：6
- Observed case result：6/6 PASS
- Field mismatch、Raw Contract error、Adapter error：均为 0
- Mutation calls：0
- Server-side acceptance：PASS

真实观察并通过 active、sequential、single-actions、Folder、completed Project 和 direct
Due。Dropped、inherited Due、direct/inherited Defer 未自然出现，记录为
`NOT OBSERVED`。

### Codex Client Acceptance

当前 `omnifocus-local` 已验证：

- canonical ID exact lookup 与 name exact lookup。
- standard 和 single-actions Project。
- Folder context 与 Task summary。
- direct Due semantics。
- 返回无 raw 字段的稳定 JSON。
- Mutation calls 和 OmniFocus writes 均为 0。

Client acceptance：PASS。

## 结果

`get_project` 将 canonical Project identity、Project metadata、Folder context 和 Task
summary 收敛为稳定只读 Domain API，并延续 `get_task` 建立的严格 Adapter 与
Raw Primitive Oracle acceptance 模式。
