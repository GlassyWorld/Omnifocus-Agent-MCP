# `query_omnifocus` 当前实现参考

本文档以当前 `src/tools/definitions/queryOmnifocus.ts` 和
`src/tools/primitives/queryOmnifocus.ts` 为准。

`query_omnifocus` 是 upstream-compatible generic read Tool，适合特定筛选、候选发现和
Tag/Folder 等通用查询。它返回格式化文本，不是稳定的个性化 Domain JSON Contract。
全局当前状态、单 Task、单 Project 和完成历史应优先使用：

- `get_lean_snapshot`
- `get_task`
- `get_project`
- `get_completed_since`

## 1. 顶层参数

| 参数 | 类型 | 当前行为 |
|---|---|---|
| `entity` | `tasks \| projects \| folders` | 必填，选择查询实体 |
| `filters` | object | 可选；不同 filter 之间使用 AND |
| `fields` | `string[]` | 可选；投影指定字段 |
| `limit` | number | 可选；在字段映射前截断结果 |
| `sortBy` | string | 可选；直接读取 Raw item 上的同名属性排序 |
| `sortOrder` | `asc \| desc` | 可选，默认 `asc` |
| `includeCompleted` | boolean | 默认 `false`；排除 completed/dropped Task，以及 Done/Dropped Project 或位于 Dropped ancestor Folder 下的 Project |
| `summary` | boolean | 默认 `false`；为 `true` 时只返回格式化 count 文本 |

`filters` 之间使用 AND；`tags` 和 `status` 数组内部使用 OR。

## 2. 可请求字段

日期字段通常返回 ISO datetime string 或 `null`。如果请求一个没有显式 mapping、且 Raw
item 上也不存在的字段，当前 fallback 返回 `null`，不会返回 `undefined`，也不会报错。

### Task fields

| 类别 | 字段 |
|---|---|
| Identity/content | `id`, `name`, `note`, `hasNote` |
| Status | `taskStatus`, `completed`, `flagged`, `effectiveFlagged` |
| Completion/drop | `completionDate`, `effectiveCompletedDate`, `dropDate`, `effectiveDropDate` |
| Dates | `dueDate`, `effectiveDueDate`, `deferDate`, `effectiveDeferDate`, `plannedDate`, `effectivePlannedDate` |
| Organization | `tagNames`, `tags`, `projectName`, `projectId`, `inInbox` |
| Kind/hierarchy facts | `isProjectRoot`, `parentId`, `childIds`, `hasChildren`, `sequential`, `completedByChildren` |
| Repeat/estimate | `isRepeating`, `repetitionRule`, `estimatedMinutes` |
| Timestamps | `creationDate`（或 `added`）, `modificationDate`（或 `modified`） |

说明：

- Task `projectId` 映射为 containing Project 的 canonical root Task ID。
- `projectName` 对 Inbox Task 返回兼容展示值 `"Inbox"`。
- 这些字段是 generic projection，不等同于 `TaskView`；例如不会自动生成完整
  direct/effective/source Domain semantics。

### Project fields

| 类别 | 字段 |
|---|---|
| Identity/content | `id`, `name`, `note`, `status` |
| Folder | `folderId`, `folderName`, `folderID` |
| Behavior | `sequential`, `flagged`, `completedByChildren`, `containsSingletonActions` |
| Dates/events | `dueDate`, `effectiveDueDate`, `deferDate`, `effectiveDeferDate`, `completionDate`, `dropDate`, `effectiveDropDate` |
| Task aggregate | `directTaskIds`, `taskIds`, `taskStatusCounts`, `taskCount`, `tasks`, `totalTaskCount` |
| Review | `nextReviewDate`, `reviewInterval` |
| Timestamps | `creationDate`, `modificationDate` |

说明：

- Project `id` 映射为 `item.task.id.primaryKey`，即 canonical Project root Task ID。
- `directTaskIds` 来自 `item.tasks`；`taskIds` 和 `totalTaskCount` 来自
  `item.flattenedTasks`。
- `taskStatusCounts` 包含 `available`, `next`, `blocked`, `dueSoon`, `overdue`,
  `completed`, `dropped`。
- `taskCount`/`tasks` 只表示 direct Tasks；它们不等于完整 `ProjectView.tasks` Contract。

### Folder fields

- `id`
- `name`
- `path`
- `parentFolderID`
- `status`
- `projectCount`
- `projects`
- `subfolders`

## 3. Filters

### Identity 与名称

| Filter | 适用实体 | 当前行为 |
|---|---|---|
| `taskId` | tasks | exact Task ID |
| `taskNameExact` | tasks | 区分大小写 exact match |
| `taskName` | tasks | 不区分大小写 substring match |
| `projectId` | tasks/projects | 兼容 canonical root Task ID 与 OmniJS Project ID |
| `projectNameExact` | projects | 区分大小写 exact match |
| `projectName` | tasks/projects | 不区分大小写 substring match；tasks 中 `"inbox"` 为特殊值 |
| `folderId` | tasks/projects | 匹配目标 Folder 及其 descendant Folders |

### Tag、状态与布尔条件

| Filter | 适用实体 | 当前行为 |
|---|---|---|
| `tags` | tasks | Tag name exact、区分大小写；数组内部 OR |
| `status` | tasks/projects | status exact、区分大小写；数组内部 OR |
| `flagged` | tasks | 检查 direct `item.flagged` |
| `hasNote` | tasks | trim 后检查 note 是否非空 |
| `inbox` | tasks | 按 `item.inInbox` 过滤 |
| `isRepeating` | tasks | 根据 `repetitionRule !== null` 判断 |
| `reviewDue` | projects | 根据 `nextReviewDate` 与今天 23:59:59.999 比较 |

### Date filters

Tool definition 接受 number、`today`、`tomorrow`、`this week`、`next week` 或
`YYYY-MM-DD` 的 filters：

- `dueWithin`
- `deferredUntil`
- `plannedWithin`
- `dueOn`
- `deferOn`
- `plannedOn`

String 会先转换为 days-from-now number：`today=0`、`tomorrow=1`、
`this week=7`、`next week=14`。

#### `dueWithin` / `plannedWithin` / `deferredUntil` 的真实边界

三者都已经实现。当前 primitive 采用相同的 upper-bound 检查：

```text
item date exists
AND item date <= now + N days
```

当前实现没有 lower-bound 检查。因此：

- `dueWithin: 7` 会包含 7 天边界以前的 Due，包括 overdue dates。
- `plannedWithin: 7` 会包含边界以前的 Planned，包括已过去的 Planned dates。
- `deferredUntil: 7` 会包含边界以前的 Defer，包括已经过去的 Defer dates；当前代码不额外验证 Task 是否“仍处于 deferred 状态”。

这与 schema 中“from TODAY”或“CURRENTLY DEFERRED”的理想化描述不同。需要 exact-day
语义时使用 `dueOn`、`plannedOn` 或 `deferOn`。

#### 其他 date filters

| Filter | 当前行为 |
|---|---|
| `dueOn`, `deferOn`, `plannedOn` | 与目标 calendar day 精确匹配 |
| `addedWithin` | `added >= 当天零点 - N days` |
| `addedOn` | 与 days-from-now 对应 calendar day 精确匹配 |
| `completedWithin` | direct `completionDate` 位于过去 N 天范围 |
| `completedOn` | direct `completionDate` 与目标 calendar day 匹配 |
| `droppedWithin` | direct `dropDate` 位于过去 N 天范围 |
| `droppedOn` | direct `dropDate` 与目标 calendar day 匹配 |

`completedWithin`/`completedOn` 和 dropped filters 通常需要配合
`includeCompleted: true`，否则 completed/dropped items 会在 filter 前被排除。

`completedSince` 和 `completedUntil` 存在于内部 primitive contract，供
`get_completed_since` 使用；它们不是公开 `query_omnifocus` schema 参数。

## 4. Status values

### Task

- `Next`
- `Available`
- `Blocked`
- `DueSoon`
- `Overdue`
- `Completed`
- `Dropped`

### Project

- `Active`
- `OnHold`
- `Done`
- `Dropped`

`DueSoon`/`Overdue` 是 OmniFocus native status。本 generic Tool 不提供 Lean Snapshot 的
direct-owner Attention semantics。

## 5. Sorting

当前 sort 在字段映射之前直接读取 Raw item 的 `item[sortBy]`：

- `name`
- `dueDate`
- `deferDate`
- `plannedDate`
- `estimatedMinutes`
- `taskStatus`

这些与 Raw property 同名的字段可直接排序。Null/undefined 永远排在最后；
`sortOrder` 不改变 null-last 规则。

实现限制：输出字段 `modificationDate`/`creationDate` 分别映射自 OmniFocus Raw
`modified`/`added`，但 sort 当前不会转换这两个 alias。因此传入
`sortBy: "modificationDate"` 或 `sortBy: "creationDate"` 虽能通过 schema，排序可能不会
按预期生效。文档示例不再依赖这两个 sort alias。

## 6. Output contract

- `summary: true` 返回 `Found N <entity> matching your criteria.` 文本。
- 普通查询将 projected items 格式化成人类可读文本。
- 即使指定 `fields`，MCP Tool handler 也不会返回 field-by-field JSON array。
- Primitive 内部返回 `{items, count}`，但这是内部接口，不是公开 MCP Tool Contract。
- `items.length === limit` 时会显示“可能还有更多结果”的提示。

需要稳定 Domain JSON 时，使用个性化 Domain Tool。

## 7. 常见注意事项

1. Tag name exact 且区分大小写：`Work` 与 `work` 不同。
2. `projectName`/`taskName` 是 partial match；exact 版本是独立 filters。
3. `projectName: "inbox"` 是 tasks query 的特殊值。
4. Status values 区分大小写。
5. 未知字段通常返回 `null`，不会因字段名错误而失败。
6. `includeCompleted` 默认 `false`。
7. `Within` date filters 当前只有 upper bound，不是严格的“从今天开始”范围。
8. `query_omnifocus` 不应被用来重新实现 Lean Snapshot 或 direct-owner semantics。

## 8. 最小充分查询

```json
{
  "entity": "tasks",
  "filters": {
    "tags": ["Work"],
    "status": ["Next", "Available"]
  },
  "fields": ["id", "name", "taskStatus", "projectName"],
  "limit": 25,
  "sortBy": "name",
  "sortOrder": "asc"
}
```

只请求回答问题所需的 fields 和数量。不要为了“完整”而默认使用 `dump_database`。
