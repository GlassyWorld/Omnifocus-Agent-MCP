# `query_omnifocus` 当前用法示例

`query_omnifocus` 用于四个个性化 Domain Tool 无法表达的特定筛选。它返回格式化文本，
不是稳定 Domain JSON。全局状态优先使用 `get_lean_snapshot`；单对象优先使用
`get_task`/`get_project`；完成历史优先使用 `get_completed_since`。

## 1. Basic queries

### Flagged Tasks

```json
{
  "entity": "tasks",
  "filters": { "flagged": true },
  "fields": ["id", "name", "taskStatus", "projectName"],
  "limit": 25
}
```

### Next Actions

```json
{
  "entity": "tasks",
  "filters": { "status": ["Next"] },
  "fields": ["id", "name", "projectName", "tagNames"]
}
```

### Inbox Tasks

```json
{
  "entity": "tasks",
  "filters": { "projectName": "inbox" },
  "fields": ["id", "name", "note", "dueDate", "tagNames"]
}
```

## 2. Date queries

### Due no later than 7 days from now

```json
{
  "entity": "tasks",
  "filters": { "dueWithin": 7 },
  "fields": ["id", "name", "dueDate", "taskStatus", "projectName"],
  "sortBy": "dueDate",
  "sortOrder": "asc"
}
```

注意：当前 `dueWithin` 只有 upper bound，因此也会包含 overdue dates。它不是严格的
“从今天到未来 7 天”范围。

### Planned exactly today

```json
{
  "entity": "tasks",
  "filters": { "plannedOn": "today" },
  "fields": ["id", "name", "plannedDate", "taskStatus", "projectName"],
  "sortBy": "plannedDate"
}
```

需要“今天”时使用 `plannedOn`。`plannedWithin: 0` 的当前实现会匹配所有不晚于当前边界
的 Planned dates，包括过去日期。

### Defer date no later than 3 days from now

```json
{
  "entity": "tasks",
  "filters": { "deferredUntil": 3 },
  "fields": ["id", "name", "deferDate", "taskStatus", "projectName"],
  "sortBy": "deferDate"
}
```

`deferredUntil` 已实现，不会被静默忽略。当前实现检查 `deferDate <= now + 3 days`，但没有
lower bound，也不额外验证 Task 是否仍处于 deferred 状态。

### Exact Due day

```json
{
  "entity": "tasks",
  "filters": { "dueOn": "tomorrow" },
  "fields": ["id", "name", "dueDate", "projectName"]
}
```

## 3. Tag and Folder queries

### Tasks with an exact Tag

```json
{
  "entity": "tasks",
  "filters": {
    "tags": ["Work"],
    "status": ["Next", "Available"]
  },
  "fields": ["id", "name", "taskStatus", "projectName", "tagNames"],
  "limit": 30,
  "sortBy": "name"
}
```

Tag names exact 且区分大小写。

### Projects in a Folder tree

```json
{
  "entity": "projects",
  "filters": { "folderId": "FOLDER_ID" },
  "fields": ["id", "name", "status", "folderId", "folderName"]
}
```

`folderId` 会匹配目标 Folder 及其 descendant Folders。

### Folder structure

```json
{
  "entity": "folders",
  "fields": ["id", "name", "path", "parentFolderID", "projectCount", "subfolders"]
}
```

## 4. Project queries

### Active Projects

```json
{
  "entity": "projects",
  "filters": { "status": ["Active"] },
  "fields": ["id", "name", "status", "folderName", "taskStatusCounts"],
  "sortBy": "name"
}
```

若问题是单个 Project 的 Domain 状态，应改用 `get_project`。

### Project name candidate discovery

```json
{
  "entity": "projects",
  "filters": { "projectName": "review" },
  "fields": ["id", "name", "status", "folderName"],
  "limit": 20,
  "sortBy": "name"
}
```

`projectName` 是不区分大小写的 partial match。候选确认后，使用 canonical ID 调用
`get_project` 获取稳定 Domain View。

### Projects due for review

```json
{
  "entity": "projects",
  "filters": { "reviewDue": true },
  "fields": ["id", "name", "nextReviewDate", "reviewInterval", "folderName"],
  "sortBy": "name"
}
```

## 5. Completed and dropped queries

### Completed Tasks in the past 7 days

```json
{
  "entity": "tasks",
  "filters": { "completedWithin": 7 },
  "fields": ["id", "name", "completionDate", "projectName"],
  "includeCompleted": true,
  "sortBy": "completionDate",
  "sortOrder": "desc"
}
```

如果用户要进行完成回顾，应优先使用 `get_completed_since`。上例只是 generic query，
不提供 `CompletedTaskView` Contract，也不会自动排除 Project root completion。

### Dropped Tasks in the past 14 days

```json
{
  "entity": "tasks",
  "filters": {
    "status": ["Dropped"],
    "droppedWithin": 14
  },
  "fields": ["id", "name", "dropDate", "projectName"],
  "includeCompleted": true,
  "sortBy": "dropDate",
  "sortOrder": "desc"
}
```

## 6. Counts and bounded output

### Count matching Tasks

```json
{
  "entity": "tasks",
  "filters": {
    "projectName": "Weekly Review",
    "status": ["Next", "Available", "Blocked"]
  },
  "summary": true
}
```

### Bounded candidate query

```json
{
  "entity": "tasks",
  "filters": { "taskName": "structure" },
  "fields": ["id", "name", "taskStatus", "projectName", "parentId"],
  "limit": 20,
  "sortBy": "name"
}
```

可用于 `get_task` 返回 `not_found`/`ambiguous_match` 后的只读候选发现。不要自动选择候选。

## 7. Sorting limitation

推荐使用与 OmniFocus Raw property 同名的 sort fields，如：

- `name`
- `dueDate`
- `deferDate`
- `plannedDate`
- `completionDate`
- `dropDate`
- `estimatedMinutes`
- `taskStatus`

当前 `sortBy` 直接访问 Raw item property。输出字段 `modificationDate` 和
`creationDate` 分别映射自 Raw `modified` 和 `added`，但 sort 不会转换该 alias；因此
示例不使用 `sortBy: "modificationDate"` 或 `sortBy: "creationDate"`。

## 8. Tool selection examples

| 用户需求 | 首选 |
|---|---|
| 当前全局状态 | `get_lean_snapshot` |
| 单个 Project | `get_project` |
| 单个 Action/Action Group/Project root | `get_task` |
| 一段时间完成了什么 | `get_completed_since` |
| 特定 Tag/Folder/status 通用筛选 | `query_omnifocus` |
| 低频全量深度审计 | 手动/plugin/file 导出的 Full Snapshot + AI 分析 |

不要为了回答日常问题而默认调用 `dump_database`。
