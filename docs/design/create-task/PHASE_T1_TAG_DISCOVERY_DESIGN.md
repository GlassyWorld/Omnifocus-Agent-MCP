# `create_task` Phase T1：既有 Tag 的结构化只读发现设计

> 状态：设计已接受；Phase T1-A/B/C/D 全部通过（2026-07-14）<br>
> 授权范围：Phase T1 已完成；不授权 Phase T2 写入实现<br>
> 候选 Tool：`search_tags`<br>
> 目标 Profile：`personal-production`<br>
> 权威边界：[ADR-006](../../architecture/decisions/ADR-006-controlled-create-task-v1.md)、[ADR-005](../../architecture/decisions/ADR-005-ai-boundary.md)

## 1. 决策摘要

Phase T1 聚焦于一件事：

```text
为未来 Phase T2 的 create_task 既有 Tag ID 写入，
提供可靠、只读、可消歧的 discovery 基础。
```

`search_tags` 是面向用户的只读发现 Tool，也是未来 Phase T2 唯一受支持的用户侧 Tag
discovery source。它不是通用 Tag 管理系统，也不是写入 proof。

边界保持不变：

- T1 只读，不创建、修改、drop、恢复或删除 Tag；
- T1 不修改 `create_task` Schema、fingerprint、Ledger、verifier 或 JXA；
- T1 不构成 T2 写入授权，不产生长期有效 proof、cache token 或 prepare token；
- T2 写入前仍须按 canonical Tag ID 实时重新读取和验证；
- name/path 只用于展示与消歧，永不作为 mutation identity；
- `personal-production` 永久不暴露 `create_tag`，也不自动创建缺失 Tag；
- parent、batch、repeat、notification、update、complete、delete 与 Phase 4 继续不在范围。

本轮对原设计的精简修订已评估并接受。当前代码与真实 API 没有要求修改 ADR-006 的冲突，
因此不提出 ADR amendment。

## 2. 修订评估与接受记录

| 修订 | 结论 | 接受后的边界 |
|---|---|---|
| T1 聚焦为 T2 read-side prerequisite | 接受 | `search_tags` 仍是用户可用的只读 Tool，但不扩展为 Tag 管理系统 |
| 删除 Task count | 接受 | input/output/JXA 不含 `includeTaskCount`、`remainingTaskCount` 或 cleanup freshness |
| raw snapshot 只读 `parentId` | 接受 | `childIds`、path、互斥 group membership 全部在 Node 由全集推导 |
| AppleScript parity 降为研究证据 | 接受 | canonical runtime identity 只使用 OmniJS `id.primaryKey`；`Tag.byIdentifier` roundtrip 由 capability probe 与真实验收验证 |
| 不预设 executor 重构 | 有条件接受 | 优先复用现有结构，但必须满足 no-shell、strict JSON、timeout、bounded output 与脱敏错误；当前 executor 不能在不修正这些缺口时原样复用 |
| 缺失真实样本由 synthetic fixtures 覆盖 | 接受 | 真实验收覆盖当前库已有事实；Dropped、多层、同名、互斥 true 和异常图由 deterministic fixtures 验证 |
| 部署时不要求关闭 `create_task` | 接受 | T1 不触及 mutation runtime；实际 T1-D 按用户要求采用更保守的临时 global fail-closed 门禁，验收后恢复原值 |
| 简化排序规则 | 接受 | 只冻结 deterministic、parent-before-descendant、same-name ID tie-break |
| 压缩 T2 实现预设计 | 接受 | T1 只冻结输出保证与 T2 最低验证边界；具体实现留给独立 T2 设计 |
| annotations 对齐现有 Domain read Tools | 接受 | 实现前检查四个 read Tool 的实际 metadata；`openWorldHint` presence/value 与其保持一致，不由 T1 单独硬编码 |
| 正常 runtime 单次 snapshot | 接受 | 每次 `search_tags` 只读取一次完整 `flattenedTags` snapshot；roundtrip 不进入普通请求的 N+1 路径 |

“有条件接受 executor”不是新增架构预设。它只承认当前
`src/utils/scriptExecution.ts` 使用 shell `exec`、没有显式 timeout、错误可能携带 raw process
内容的事实；未来实现可选择最小局部修正或复用满足同等门禁的既有 helper，但不能降低安全
要求。

## 3. 当前代码与真实读侧事实

### 3.1 现有 `list_tags` 不可直接复用

当前 upstream-full 路径：

```text
list_tags definition
  -> listTags primitive
  -> executeOmniFocusScript("@listTags.js")
  -> OmniJS flattenedTags
  -> human-readable text
```

它不满足 T1：

- input 只有 `includeDropped?: boolean`，没有 strict query/status/limit contract；
- 没有 `outputSchema` 或 `structuredContent`；
- 用 `active:boolean` 过滤，不能区分 Active 与 On Hold；
- 只返回 immediate parent，definition 只可靠渲染一层 child；
- `allowsNextAction` 不是 mutually-exclusive children；
- 单个 Tag property 失败时静默 skip；
- 没有 duplicate ID、orphan、cycle、unknown status 或 schema-drift 防御；
- 没有 exact `matched/returned/truncated`。

因此 T1 新建 Tag Domain contract，不复用 legacy 人类文本。`upstream-full` 的 `list_tags` 与
`create_tag` 行为保持不变。

### 3.2 `query_omnifocus` 不是 Tag discovery source

`query_omnifocus` 只有 `tasks/projects/folders` entity。它能按 Tag name 过滤 Task 或返回
Task 上的 Tag IDs，但不能提供 Tag 三态、完整 path、互斥事实和 graph integrity，也不能作为
未来 mutation 的 name resolver。

### 3.3 当前 Domain read Tool annotations 约定

本设计审查时，`get_task`、`get_project`、`get_completed_since` 和 `get_lean_snapshot` 四个
definition 均未导出 `annotations`；registration 因而发布 `annotations=undefined`。只有
`create_task` 显式设置 mutation annotations。

因此 T1 不单独发明 `openWorldHint` 值。实现与注册前必须重新检查四个 Domain read Tool 的
实际 annotations，并让 `search_tags` 的完整 annotations presence/value 与当时共同约定一致。
以当前基线为准，若四个 read Tool 仍全部省略 annotations，`search_tags` 也省略；若未来四者
已被统一更新，则 `search_tags` 跟随同一约定。任何单独偏离都会阻断注册。

### 3.4 真实只读 feasibility probe

2026-07-14 的脱敏探针读取本机 OmniFocus 4.8.12，只输出计数和布尔能力，没有输出 Tag
name、原始 ID、Task 或 Project 内容，也没有 mutation。

| 探针 | 结果 | 设计含义 |
|---|---:|---|
| Tag 总数 / 顶层数 | 26 / 13 | 当前库可完整枚举 |
| 非字符串 / 空 / 重复 ID | 0 / 0 / 0 | 当前 ID 形状正常 |
| `Tag.byIdentifier` mismatch | 0 | canonical ID exact roundtrip 可行 |
| Active / On Hold / Dropped / unknown | 25 / 1 / 0 / 0 | native 三态可读；当前无 Dropped 样本 |
| On Hold 且 `active=true` | 1 | legacy boolean filter 确认不可用 |
| parent max depth | 1 | 当前真实库只覆盖现有 hierarchy |
| orphan / cycle | 0 / 0 | 异常防御交由 synthetic fixtures |
| duplicate-name groups | 0 | 同名消歧交由 synthetic fixtures |
| mutual-exclusion property readable | 26/26 | runtime 能读取该事实 |
| mutual-exclusion groups | 0 | true case 交由 synthetic fixtures |
| property errors | 0 | 当前库没有观察到 schema drift |

AppleScript/OmniJS ID parity 已作为研究证据通过，但不是 runtime dependency、注册门槛或 T1
完成条件。

官方 Omni Automation 参考：

- [`Tag.byIdentifier`、`parent` 与 `status`](https://www.omni-automation.com/omnifocus/OF-API.html#Tag)
- [`Tag.Status` 三态](https://www.omni-automation.com/omnifocus/OF-API.html#Tag.Status)
- [`childrenAreMutuallyExclusive`](https://omni-automation.com/omnifocus/tag.html)

## 4. 目标与非目标

### 4.1 目标

- 返回已有 Tag 的 canonical ID、name、native status 和完整 root-to-self path；
- 默认只返回 Active，允许显式查询 On Hold/Dropped；
- 同名 Tag 用完整 path 消歧，不任意选第一个；
- 报告互斥 child group facts；
- 提供 literal query、deterministic ordering、limit 和 honest `truncated`；
- strict wire Schema、strict structured output、stable privacy-safe errors；
- 对 duplicate ID、orphan、self-parent、cycle、unknown status 和 raw schema drift fail closed；
- 不缓存 discovery result 为未来 mutation 事实。

### 4.2 非目标

T1 不支持：

```text
Tag CRUD
Task/Project Tag assignment
create_task tagIds/tags/tagNames
name/path mutation resolver
fuzzy/regex/semantic matching
Task count or Task facts
cursor pagination
cache/snapshot/prepare token
T2 Ledger/fingerprint/feature-flag/Canary design
```

## 5. Strict wire contract

### 5.1 Input Schema

```ts
const tagStatusSchema = z.enum([
  "active",
  "on_hold",
  "dropped",
]);

export const searchTagsInputSchema = z.object({
  query: z.string().trim().min(1).max(200).optional(),
  status: z.array(tagStatusSchema)
    .min(1)
    .max(3)
    .refine(values => new Set(values).size === values.length)
    .optional(),
  limit: z.number().int().min(1).max(100).optional(),
}).strict();
```

默认值：

```text
query  = null
status = ["active"]
limit  = 25
```

语义：

- `null`、unknown keys、空 query、空/重复 status 和越界 limit 非法；
- query 是对 name 与完整 path name segments 的 case-insensitive literal substring search；
- query 不是 regex、glob、fuzzy、semantic match 或 ID lookup；
- status 针对当前 Tag 的 direct native status；
- handler 必须执行完整 object parse；
- MCP wire Schema 必须发布完整 enum/range 与 `additionalProperties=false`。

### 5.2 Output Schema

```ts
type TagStatus = "active" | "on_hold" | "dropped";

type TagPathSegment = {
  id: string;
  name: string;
  status: TagStatus;
};

type TagDiscoveryView = {
  id: string;
  name: string;
  status: TagStatus;
  hierarchy: {
    parentId: string | null;
    childIds: string[];
    path: TagPathSegment[]; // root -> self
  };
  exclusivity: {
    childrenAreMutuallyExclusive: boolean;
    memberOfMutuallyExclusiveGroupId: string | null;
  };
};

type SearchTagsSuccess = {
  success: true;
  tags: TagDiscoveryView[];
  page: {
    matched: number;
    returned: number;
    truncated: boolean;
  };
};
```

不加入 Task count、Task names/IDs、Project facts、completion history 或 token。

`path` 是唯一机器可依赖的完整层级表示；不能用 `A/B/C` 这类 delimiter string 代替，因为
Tag name 本身可能含 delimiter。Agent/UI 可逐 segment 渲染 path，但 mutation 不能解析展示
字符串。

成功 response 必须：

1. 通过 strict success Schema；
2. 返回相同对象的 `structuredContent`；
3. JSON text 与 `structuredContent` 深相等；
4. 所有 nested object 均 `additionalProperties=false`。

### 5.3 Metadata

`search_tags` 的语义是 read-only、non-destructive、可重复读取，但 wire annotations 必须遵循
`personal-production` 现有 Domain read Tool 约定，特别是 `openWorldHint`：

1. T1-B 实现前检查四个现有 read Tool definition/registration 的 annotations；
2. T1-D 注册前通过真实 `tools/list` 再检查一次客户端可见 metadata；
3. `search_tags` 使用与四者一致的 annotations presence/value；
4. 不因本 Tool 单独硬编码 `openWorldHint`；
5. 若四个 read Tool 彼此已经不一致，先报告并停止注册，不由 T1 擅自统一它们。

description 必须说明：只搜索已有 Tag；默认 Active；同名查看完整 path；结果不是写入授权；
永不创建 Tag。

## 6. Tag Domain 规则

### 6.1 Canonical ID

```text
canonical Tag ID = OmniJS tag.id.primaryKey
```

要求：

- opaque non-empty string；不添加 UUID、长度或字符集假设；
- raw snapshot 内唯一；
- capability probe 与真实验收均验证 `Tag.byIdentifier(id)` exact roundtrip；
- T1 与未来 T2 共用同一 ID Schema；
- 不从 name、path 或 URL 合成；
- 不接受 name/path 作为 mutation identity。

正常 `search_tags` runtime 只验证单次 raw snapshot 内 ID 非空且唯一，不逐 ID 调用
`Tag.byIdentifier`。roundtrip mismatch 会使 capability/真实验收失败并阻断注册，但不是普通
请求中的 N+1 runtime 分支。任何阶段都禁止 name fallback。

### 6.2 Native status

只允许 identity mapping：

```text
Tag.Status.Active  -> active
Tag.Status.OnHold  -> on_hold
Tag.Status.Dropped -> dropped
other              -> raw_schema_drift.unknown_status
```

禁止用 `active:boolean`、`effectiveActive` 或 `allowsNextAction` 推断三态。path 的每个 segment
携带 direct native status，供用户展示和未来 T2 重新验证 ancestors。

### 6.3 Hierarchy

raw snapshot 只读取 immediate `parentId`。Node 在验证完整 ID 集合后推导：

- `childIds`；
- root-to-self `path`；
- `memberOfMutuallyExclusiveGroupId`。

这样避免同时从 JXA 读取 parent/children 两套关系源。成功前必须验证：

- ID 唯一；
- non-null parent 存在；
- 无 self-parent；
- parent walk 无 cycle 且能到 root；
- path 最后 segment 与当前 Tag identity/status 一致。

同名合法；相同 name、不同 ID/path 的结果全部保留。

### 6.4 Mutual exclusion

raw `childrenAreMutuallyExclusive` 描述当前 Tag 的 direct children set。

`memberOfMutuallyExclusiveGroupId` 由 Node 推导：如果 immediate parent 的
`childrenAreMutuallyExclusive=true`，值为 parent canonical ID；否则为 `null`。

T1 只报告事实，不在本文件定义 T2 的具体组合写入算法。

## 7. Raw snapshot、Adapter 与 search

### 7.1 Minimal raw shape

```ts
type RawTag = {
  id: string;
  name: string;
  status: "Active" | "OnHold" | "Dropped";
  parentId: string | null;
  childrenAreMutuallyExclusive: boolean;
};
```

JXA 不读取 `childIds`、Task 或 Project facts。

### 7.2 Minimal modules

```text
src/domain/tag/tagSchemas.ts
src/domain/tag/tagAdapter.ts
src/domain/tag/searchTags.ts
src/tools/primitives/readTags.ts
src/tools/definitions/searchTags.ts
src/utils/omnifocusScripts/readTags.js
```

不预设 Tag repository、service layer、cache、cursor/token 或专用 executor。只有仓库实际结构
要求时才增加模块。

### 7.3 Runtime read boundary

优先复用现有稳定只读执行结构，但最终路径必须满足：

- 每次正常 `search_tags` 调用只执行一次完整 `flattenedTags` snapshot read；
- 不在普通 handler/primitive 中逐 ID 调用 `Tag.byIdentifier`；
- strict parse、构图、filter、query、sort、matched/limit/truncated 全部基于该 snapshot 在 Node 完成；
- static read-only script；query/status 不插入脚本源码；
- no shell；
- strict single-document JSON；
- timeout 与 bounded stdout/stderr；
- temp file cleanup 和必要的最小权限；
- privacy-safe error mapping；
- 任一 Tag property read failure 导致 whole-request failure，不静默 skip；
- JXA 不含 `new Tag`、property mutation、`deleteObject`、Task Tag mutation、`cleanUp()` 或 URL execution。

本设计不指定“新建 executor”或“抽取 generic core”。实现阶段只做满足上述门禁所需的最小
局部修改，且不得触及 create_task write executor/JXA/error semantics。

### 7.4 Search pipeline

顺序固定：

```text
complete raw snapshot
  -> strict parse
  -> duplicate/orphan/self-parent/cycle validation
  -> status mapping and path/exclusivity derivation
  -> status filter
  -> optional literal query
  -> deterministic hierarchical order
  -> matched count
  -> limit
  -> returned/truncated
```

排序只冻结：

- deterministic；
- parent before descendants；
- same-name tie-break by ID；
- raw input order 变化不影响输出。

没有 cursor。`matched` 在 limit 前计算：

```text
returned  = limited result length
truncated = matched > returned
```

不得用 `returned === limit` 猜 truncation。

## 8. Error 与 privacy

错误沿用 Domain read style：

```json
{
  "success": false,
  "error": {
    "code": "invalid_arguments | query_failed",
    "reason": "stable_allowlisted_reason",
    "message": "privacy-safe summary"
  }
}
```

至少覆盖：

```text
process_failure
timeout_or_abort
output_limit
invalid_json_stdout
raw_schema_drift
unknown_status
duplicate_id
orphan_parent
self_parent
cycle_detected
```

`id_roundtrip_mismatch` 是 capability probe/真实验收 reason，不是普通 `search_tags` runtime
error。正常 runtime 不为 roundtrip 发起第二轮读取。

完整性未知时不返回 partial Tag list。所有失败均为 no-write，不触达 create_task Ledger、lock、
audit、resolver、verifier 或 write primitives。

允许返回：Tag ID/name/status、hierarchy/path、exclusivity、matched/returned/truncated。

禁止返回或记录：

- Task/Project facts；
- raw stdout/stderr 或 script；
- user query、完整 args 或 Tag result payload；
- 持久化 Tag snapshot/cache/proof。

日志只允许 correlation、elapsed、returned、truncated 与 stable result/reason，不含
name/path/ID/query。

## 9. Agent routing 与 UI

未来 Instructions 至少要求：

- 用户询问已有 Tag、需要同名消歧，或明确要求为未来 Tag assignment 发现候选时才调用；
- 用户未提 Tag 时不预先搜索、不推荐、不添加；
- 同名展示所有完整 path，不任意选择；
- 默认 Active；用户要求 On Hold/Dropped 时发送显式 status；
- `truncated=true` 必须说明结果不完整；
- search result 不是当前 `create_task` 可接受字段，也不是长期 proof；
- “没有就创建”在个人 Profile 中必须拒绝；
- 包含 unsupported Tag assignment 的 create request 不得静默删掉 Tag 后继续创建 Task。

read-only Tool 不需要 mutation confirmation UI。展示时把 opaque ID 与 exact path/status 可靠
关联，但不要求用户手工输入或记忆 ID。

## 10. `search_tags` 对 Phase T2 的输出保证

T1 向未来 T2 提供以下稳定事实：

```text
Tag canonical ID
Tag display name
Tag direct status
root-to-self path
ancestor direct statuses
immediate parent ID
mutual exclusion group facts
```

T1 不提供：

```text
长期有效 proof
写入授权
缓存保证
Tag assignment eligibility
```

未来 T2 必须：

- 接收 canonical Tag IDs；
- 写入前实时按 ID 重新读取；
- 验证 selected Tag 与全部 ancestors 都是 Active；
- 验证 selected IDs 不违反互斥关系；
- 禁止 name/path fallback；
- 禁止自动创建缺失 Tag；
- 任一失败时不得回落为无 Tag Task；
- 通过 Task Tag ID readback 验证实际结果。

T1 不授权 T2。T2 的字段数量、fingerprint、Ledger、feature flag、primitive、Canary 和部署
流程继续由 ADR-006 与未来独立 T2 设计冻结，本文件不预先实现。

## 11. 测试与验收矩阵

### 11.1 Contract/wire

- strict input；extra/null/空 query/空或重复 status/越界 limit 拒绝；
- defaults 为 Active/25；
- status enum 与 output nested Schema exact；
- `additionalProperties=false`；
- wire Schema 发布 query/status/limit 的完整约束；
- `structuredContent` 与 JSON text 深相等；
- 实现前检查四个现有 Domain read Tool annotations；
- `search_tags` annotations presence/value（含 `openWorldHint`）与四者约定 exact；
- InMemoryTransport 与真实 `tools/list` 均验证客户端可见 metadata。

### 11.2 Adapter fixtures

- Active/OnHold/Dropped native mapping；
- `active=true` 不影响 OnHold mapping；
- duplicate/empty ID；
- orphan、self-parent、two-node/multi-node cycle；
- unknown status、missing/wrong raw fields；
- root、三层 path、同名不同 path；
- childIds 仅从 parentId 推导；
- mutual exclusion parent true/false 与 membership group；
- property failure 不产生 partial success。

### 11.3 Search fixtures

- default Active、显式 On Hold/Dropped；
- literal name/path query 与 no-match；
- deterministic parent-before-descendant；
- same-name ID tie-break；
- shuffled raw input 产生相同输出；
- matched 0/1/limit/limit+1 与 exact truncated。

### 11.4 Runtime/privacy

- static read-only source；
- 正常调用只执行一次完整 snapshot read；
- normal primitive/handler 不调用 `Tag.byIdentifier`，无 N+1 roundtrip；
- no shell、timeout、bounded output、strict JSON、cleanup；
- malformed/empty/oversized output 与 property failure；
- fake sensitive raw error 不进入 response/log；
- source/call spies 证明不调用任何 mutation API；
- create_task runtime modules 未触达。

### 11.5 Protocol/Profile

T1-C 未批准注册时的历史门禁：

- `personal-production` 仍精确五 Tool；
- `upstream-full` 仍为 16 Tool/6 Resources；legacy Tag tools 不变。

T1-D 获批注册后的当前门禁：

- `personal-production` 精确六 Tool：现有五个 + `search_tags`；
- Resources capability absent；
- 唯一 mutation 仍为 `create_task`；
- `create_tag`、legacy `list_tags`、`query_omnifocus` 在个人 Profile absent；
- raw `tools/list` input/output Schema 与本文件一致。

### 11.6 真实只读验收

真实验收覆盖当前库已有事实，不要求人工制造全部异常/状态样本：

- 当前真实 Active 与 On Hold；
- capability probe 对当前完整 snapshot 验证 `Tag.byIdentifier` ID roundtrip；
- built acceptance harness 独立再次验证 roundtrip，然后验证正常 Tool 调用仍只有一次 snapshot；
- 当前真实 hierarchy/path；
- query、limit、matched/returned/truncated；
- 独立进程 repeated read 的 ID/path/status 稳定；
- `childrenAreMutuallyExclusive` property 可读；
- response/log privacy；
- 验收前后没有 Tag/Task/Project mutation；
- create_task Ledger/audit/lock 不因 `search_tags` 读取变化。

以下由 synthetic fixtures 完整覆盖即可：

```text
Dropped
三层 path
同名 Tag
mutual exclusion true
orphan/self-parent/cycle
duplicate ID
unknown status/schema drift
```

这些缺失样本记录为真实覆盖限制，但不阻断 T1 read-only acceptance。它们在未来 T2 是否
需要额外真实 Canary，由 T2 独立风险设计决定。

## 12. 实施阶段与部署门禁

### T1-A：设计

```text
docs: design structured tag discovery for create_task tag integration
```

仅本设计文档。

### T1-B：未注册实现

```text
feat: add structured tag discovery
```

包含 Schema、Adapter、search、primitive、definition 和 unit tests；不注册 Tool。

### T1-C：协议与真实只读验收

```text
test: verify structured tag discovery
```

包含 wire Schema、profile tests、真实只读 acceptance、privacy/no-write。

### T1-D：注册与验收记录

```text
feat: register search_tags for personal-production
docs: record phase t1 acceptance
```

注册和部署必须另行获得用户批准。

每个 code commit 必须通过：

```text
npm test
npm run build
git diff --check
```

部署不要求关闭 `create_task`。实际 T1-D 按用户要求在 Refresh/负向路由期间临时关闭 global
flag，并在验收通过后恢复；代码与持久配置边界仍必须验证：

1. T1 diff 未修改 create_task Schema/handler/Ledger/JXA/flags/mutation routing；
2. create_task unit/protocol/profile 回归全绿；
3. `personal-production` 从五 Tool 精确变为六 Tool；
4. Resources capability absent；
5. 唯一 mutation 仍为 `create_task`；
6. `create_tag` 永久 absent；
7. App Refresh 后 search routing、strict Schema、privacy/no-write 验收通过；
8. health/readiness/watchdog 正常。

任一 gate 失败则回滚 `search_tags` 注册/build，不修改或绕过既有 create_task 安全边界。

## 13. 准入、停止与接受结论

### 13.1 当前已接受的设计条件

- [x] T1 明确为 Phase T2 的 read-side prerequisite；
- [x] canonical ID、三态、完整 path 和互斥事实保留；
- [x] Task count 删除；
- [x] raw snapshot 只读 parentId，childIds 在 Node 推导；
- [x] AppleScript parity 降为非门禁研究证据；
- [x] 缺失真实样本由 synthetic fixtures 覆盖；
- [x] 不预设 executor 重构，但保留最小 runtime safety gates；
- [x] T1 code diff 不改 create_task flags/config；T1-D 临时操作门禁已恢复原值；
- [x] 排序简化为 deterministic contract；
- [x] T2 只保留接口边界摘要；
- [x] `openWorldHint` 与四个现有 Domain read Tool annotations 约定一致；
- [x] capability probe 与真实验收验证 roundtrip，正常 runtime 单次完整 snapshot；
- [x] 本轮不修改 create_task runtime。

### 13.2 T1-B/T1-C 实施与验收结果

用户已于 2026-07-14 明确授权开始实现。T1-B 已按设计完成 Schema、Adapter、search、单次
snapshot primitive/JXA、未注册 definition 与 synthetic unit tests。实现没有顺带注册或部署。

用户随后明确授权继续 T1-C。capability probe、临时 MCP protocol contract、真实只读
acceptance、repeated-read stability 和 no-write gates 均已通过；证据见
[Phase T1 Tag Discovery Acceptance](./PHASE_T1_TAG_DISCOVERY_ACCEPTANCE.md)。进入 T1-D
注册/部署仍须再次单独批准。

### 13.3 停止条件

任一项发生即停止实施/注册/部署：

- runtime 没有 exact `Tag.Status` 或 mutual-exclusion property；
- capability probe 或真实验收的 `Tag.byIdentifier` roundtrip 失败；
- 正常 Tool 调用超过一次 snapshot read 或出现逐 ID roundtrip；
- `search_tags` annotations（含 `openWorldHint`）偏离四个 Domain read Tool 约定；
- 需要 name/path fallback；
- duplicate/orphan/self-parent/cycle/schema drift 被 silent skip 或降级为成功；
- wire Schema 不 strict，或 `truncated` 只能猜测；
- read path 无法满足 no-shell/timeout/bounded/strict JSON/privacy requirements；
- response/log 泄露 Task facts、query、raw output 或 result payload；
- T1 diff 触及 create_task runtime/flags；
- `create_tag`、legacy `list_tags`、Resources 或其他 mutation 进入个人 Profile；
- Tool 数量、health/readiness/watchdog 或 create_task regression 异常。

### 13.4 T1-D 实施与验收结果

用户随后独立授权 T1-D。`search_tags` 已注册到 `personal-production`，生产 build 的独立 MCP
协议门禁验证精确六 Tool、Resources absent、唯一 mutation 为 `create_task`，并保持
`create_tag`/legacy `list_tags` absent。App Refresh 与“创建任务并添加 Tag”负向路由在 global
flag=`false` 下通过；模型明确拒绝丢弃 Tag 约束，真实 exact-name readback 为 `not_found`。
global/Project flags 已恢复为 `true/true`，health/ready 正常。完整证据见
[Phase T1 Tag Discovery Acceptance](./PHASE_T1_TAG_DISCOVERY_ACCEPTANCE.md)。

### 13.5 接受结论

**Phase T1 精简设计、实现、capability/protocol/真实只读验收和 T1-D 生产注册均已通过。**
当前停在 Phase T2 独立设计门；T1 的完成不授权 Tag 写入。

## 14. Phase T1 最终停点

本轮在用户分阶段明确授权后完成 T1-B/T1-C/T1-D：

- 已实现 Tag Schema、Adapter、search、单次 snapshot primitive/JXA 与 `search_tags` definition；
- 已增加 strict contract、hierarchy/status/exclusivity、ordering/truncation、runtime/privacy unit tests；
- `search_tags` 已注册，`personal-production` 精确六个 Tool、Resources absent；
- capability probe 与真实 acceptance 对当前 26 个 Tag 完成 26/26 ID roundtrip；
- 正常 Tool runtime 精确读取一次完整 snapshot，repeated read 与 no-write gates 通过；
- 已仅为 T1-D 修改 registry、Instructions 和客户端文档；
- 未修改 `create_task`、fingerprint、verifier、JXA、Ledger 或 flags；
- 未创建、修改或删除任何 Tag/Task/Project；
- 未调用 mutation；
- 已完成部署、App Refresh、负向路由和 fail-closed flag 恢复；
- 未进入 Phase T2 或 Phase 4；
- 未 commit、未 push。

下一步是 Phase T2 独立设计与评审；未经后续明确批准，不得实现或启用 Tag 写入。
