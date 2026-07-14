# `create_task` Phase T2：既有 Active Tag ID 写入设计

> 状态：第二版设计已通过评审；T2-B 未发布内部实现已获准但尚未开始（2026-07-14）<br>
> 当前生产：`create_task` V2（Phase 1 Inbox + Phase 2B Project placement）<br>
> 当前 Tag 能力：Phase T1-A/B/C/D 已通过，`search_tags` 已注册到 `personal-production`<br>
> 当前生产边界：精确六个 Tool、Resources absent，唯一 mutation 为 `create_task`<br>
> 本文件授权：T2-B 内部 Schema/canonicalizer/fingerprint、Tag flag helper、request-closure validator、tagged primitive、mutation-only readback、tagged verifier/error mapping、确定性与零写入测试<br>
> 本文件不授权：公开 Schema 发布、生产 handler 路由、LaunchAgent/loaded flag 变更、App Refresh、真实 mutation、Canary、正式启用或 Phase 4<br>
> 权威边界：[ADR-006](../../architecture/decisions/ADR-006-controlled-create-task-v1.md)、[ADR-005](../../architecture/decisions/ADR-005-ai-boundary.md)、[Phase T1 Design](./PHASE_T1_TAG_DISCOVERY_DESIGN.md)、[Phase T1 Acceptance](./PHASE_T1_TAG_DISCOVERY_ACCEPTANCE.md)

## 1. 结论与本版修订

Phase T2 只扩展现有 `create_task`：允许用户在明确要求时，为一个新建 Inbox 或 exact Active
Project Task 指定 1–5 个**既有 Active Tag 的 canonical ID**。它不新增 mutation Tool，不提供
Tag CRUD，也不扩大 ordinary parent、batch、repeat、notification、edit、move、complete 或 delete
能力。

目标流程：

```text
用户明确要求创建 Task 并使用既有 Tag
  -> search_tags 只读发现，以完整 path 消歧
  -> 用户原始指令或后续确认明确选择 Tag
  -> create_task(tagIds)
  -> global / Project / Tag flags 按固定顺序 fail closed
  -> tagged primitive 按 canonical ID 实时解析 requested closure
  -> self 与全部 ancestors Active，direct-parent mutual exclusion 安全
  -> 全部可判定验证成功后才 new Task + addTags
  -> 按 taskId 走专用 internal readback
  -> actual/requested Tag ID exact set 相等才成功
```

本版结合修订稿与当前实现，替换第一版中的四项决定：

| 设计点 | 第一版 | 本版决定 |
|---|---|---|
| 写前 Tag 验证范围 | 读取并验证整个 `flattenedTags` 图 | 只验证 requested Tags、各自 ancestor chain 和 direct parent exclusivity |
| no-tag fingerprint | 全量切到 V3，并为旧记录加 V2 bridge | no-tag 原样使用 `create_task:v2`；tagged 独立使用 `create_task:v3:tagged` |
| success output | 所有请求都返回 `created.tagIds` | 只有 tagged intent 必须返回；no-tag output 原样 |
| Task readback | 扩大共享 `RawTask`/`GET_TASK_RAW_FIELDS` | 新增 mutation-only internal readback；公开 `get_task` 与共享 Task Domain 不变 |

这些修订减少了与已验收 V2 路径的耦合，也避免一个与本次请求无关的异常 Tag 阻断所有 Tag
写入。T1 仍负责完整 snapshot 的 discovery graph 校验；T2 负责本次 mutation closure 的资格校验。

### 1.1 ADR-006 对齐与已接受 amendment

本版与 ADR-006 的能力边界、ID-only、Active-only、最多 5 个、实时重验、exact readback 和
Phase 4 隔离一致。评审确认 ADR-006 §17.3 原有 `ambiguous_tag` 要求与 ID-only mutation
runtime 冲突，并接受窄幅 amendment。

原因：T1 已负责名称/完整 path 的多候选发现，T2 只接受 canonical ID；runtime
`Tag.byIdentifier(id)` 的可信结果只能是 exact object 或 null。为 mutation runtime 增加
`ambiguous_tag` 没有可达的 ID-only 语义，还可能诱导未来加入 name/path resolver。

接受后的稳定边界：

```text
名称或 path 歧义由 search_tags 与客户端确认层处理，不进入 T2 mutation resolver。
T2 runtime 新增 tag_not_found、tag_not_allowed、mutually_exclusive_tags、
tag_validation_failed 和 partial_success；不可信 canonical identity 归入
tag_validation_failed。
```

ADR-006 已同步正式 amendment：名称/path 歧义只属于 `search_tags`、自然语言和确认 UI，
不得进入 `CreateTaskErrorCode`、tagged primitive result、service/Ledger result code 或 mutation
protocol contract。该项不再阻塞 T2-B。

## 2. 当前仓库与真实 API 基线

### 2.1 当前 `personal-production` surface

当前精确注册：

```text
get_task
get_project
get_completed_since
get_lean_snapshot
search_tags
create_task
```

- 五个 read Tool，一个 mutation Tool；
- Resources absent；
- `create_tag`、legacy `list_tags`、`query_omnifocus`、edit/update/delete/batch 均不进入该 Profile；
- `upstream-full` 保持兼容 surface，不注册受控 `create_task`；
- Phase T2 不改变 Tool 数量，不新增 Resources，不改变唯一 mutation 名称。

### 2.2 可保持不变的 V2 能力

当前实现已经具备：

- strict V2 input/output contract；
- `create_task:v2` semantic fingerprint；
- global mutation flag 与 Project-specific flag；
- 永久 tombstone Ledger 与全局 mutation lock；
- Inbox 与 exact Active Project placement，无 Inbox fallback；
- Project 写前 service validation 和 primitive 内即时重验；
- fixed script、mode-0600 payload file、`execFile` no-shell、timeout、bounded output；
- taskId exact readback、Task Adapter/Mapper/Schema verification；
- `partial_success`、`verification_failed`、`outcome_unknown` 和 replay 语义；
- privacy-safe audit allowlist。

T2 的 no-tag 分支必须继续使用这些现有代码路径，不能以重构名义重写已生产验收的 Inbox/Project
primitive、V2 canonicalizer、fingerprint 或输出。

### 2.3 T2 需要新增的内部能力

当前代码尚无：

1. public/runtime `tagIds` contract；
2. tagged canonical payload 与独立 fingerprint namespace；
3. 独立 Tag feature flag；
4. canonical Tag object exact resolver 与 request-closure validator；
5. tagged Inbox/Project primitive；
6. mutation-only canonical Tag ID readback；
7. tagged exact-set verifier；
8. tagged success output 与 Tag-specific error mapping。

### 2.4 Phase T1 可复用与不可复用边界

可复用：

- canonical ID、三态 status 和 complete path 的 Domain 语义；
- status mapping、cycle/repeated-ID、malformed property 等确定性 fixtures；
- direct-parent `childrenAreMutuallyExclusive` 的解释；
- privacy、same-name path disambiguation 和 no-cache 原则。

不可复用：

- `search_tags` response 作为写入授权或长期事实；
- T1 完整 snapshot 作为 T2 mutation resolver；
- legacy `list_tags` 人类文本；
- upstream `addOmniFocusTask` / `editItem` 的 name lookup、first-match、auto-create 或 silent skip；
- `create_tag` 及任何 Tag mutation primitive。

### 2.5 已完成的真实只读 capability probe

2026-07-14 的脱敏、零写入 probe 已确认：

```text
Tag snapshot                         26
Task snapshot                        1014
真实 tagged Task sample              yes
sample Tag IDs                       1
sample Tag IDs all non-empty string  true
Tag.byIdentifier                     true
Task.byIdentifier                    true
Task.addTag / Task.addTags            true
Task.tags length/map                 true
Tag.status / Tag.parent               true
childrenAreMutuallyExclusive         true
Inbox / Project insertion API shape  true
```

`Task.tags` 是 Omni Automation `TagArray`，支持 `length`/`map`，但不是 native Array。runtime 和
probe 不得以 `Array.isArray(task.tags)` 判断 OmniJS collection 是否可读。该 probe 没有调用
`new Task`、`addTag(s)`、setter、cleanup、URL 或其他 mutation，只证明 API shape，不授权 Canary。

官方参考：

- [OmniFocus API：Task、Tag 与 addTags](https://www.omni-automation.com/omnifocus/OF-API.html)
- [Finding Items by ID](https://www.omni-automation.com/omnifocus/apply.html)
- [OmniFocus Tags](https://omni-automation.com/omnifocus/tag.html)
- [Task insertion](https://omni-automation.com/omnifocus/tutorial/inbox.html)

## 3. 目标、非目标与永久边界

### 3.1 目标

- 用户明确授权时，为一个新 Task 添加 1–5 个既有 Tag；
- Tag identity 只使用 opaque canonical ID；
- 不信任 discovery cache，在 mutation execution 内实时重新解析；
- requested Tag 自身及全部 ancestors 必须 direct Active；
- input unique，direct-parent mutually-exclusive group 内最多选择一个 child；
- 所有可判定 Tag/Project validation 必须在 `new Task` 前完成；
- 创建后按 taskId 精确读取 actual canonical Tag ID set；
- missing、extra、duplicate、malformed 或超限均不能作为 success；
- partial/unknown 不自动 retry、补 Tag、移除 Tag 或删除 Task；
- no-tag V2 canonicalization、fingerprint、primitive、replay 与 output 原样保持；
- audit、Ledger、日志不记录真实 Tag ID/name/path。

### 3.2 非目标

```text
Tag name/path mutation lookup
Tag create/edit/drop/restore/delete/move
给已有 Task 加减 Tag
Tag ordering control
On Hold/Dropped Tag assignment
超过 5 个 Tag
模型推荐 Tag 后未经用户确认写入
parentTaskId / Parent placement / prepare/commit
batch / repeat / notification
update / move / reparent / complete / delete
generic mutation executor
```

### 3.3 永久禁止

- `personal-production` 永久不注册 `create_tag`；
- 不自动创建缺失 Tag；
- 不把 Tag name/path 用于 mutation resolver；
- Tag 要求不能完整满足时，不得静默创建无 Tag Task；
- T2 不得引入第七个 Tool、Resources 或第二个 mutation Tool。

### 3.4 Phase 4 ordinary parent placement

ADR-006 的 2026-07-14 amendment 已接受以下边界：

- Phase 4 仅在 T2 稳定运行后进入独立设计、风险评审与授权；
- Parent 是独立 destination，与 Project destination 互斥；
- 只接受 freshly-read exact canonical parent Task ID，不接受名称、模糊匹配或 fallback；
- 写前重新验证 identity、kind、direct/effective completion/drop、parent-chain integrity、
  containing Project/Folder eligibility；
- 新建 child 本身不存在 hierarchy cycle 风险；cycle/reparent validation 属于未来 move/edit；
- prepare/commit 只是优先评估方案，不是当前决定；
- Phase 4 不与 CRUD/batch 合并，也不建立 generic mutation executor；
- T2 不增加 parent placeholder、prepare token、generic placement resolver 或 parent-capable primitive。

## 4. `create_task` V3 wire contract

T2 公开发布后，Tool 名称仍为 `create_task`。这里的“V3”表示 wire contract 增加了可选
`tagIds`；它不表示所有请求都使用新的 semantic fingerprint。

### 4.1 Public input

在现有 V2 strict object 上只增加：

```ts
const tagIdsWireSchema = z
  .array(canonicalOmniFocusIdSchema)
  .min(1)
  .max(5)
  .describe(
    "1-5 unique canonical IDs of existing OmniFocus Tags; " +
    "names, paths, and automatic Tag creation are not accepted."
  );

const createTaskPublicInputShapeV3 = {
  ...createTaskPublicInputShapeV2,
  tagIds: tagIdsWireSchema.optional(),
};
```

public wire property 保持普通 `ZodArray`。现有 MCP SDK 1.29 对 refined/effects Schema 的 JSON
Schema publication 有已验证限制，因此 uniqueness 放在完整 runtime parser 的
`superRefine` 中：

```ts
if (
  value.tagIds !== undefined
  && new Set(value.tagIds).size !== value.tagIds.length
) {
  context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["tagIds"],
    message: "tagIds must be unique",
  });
}
```

协议规则：

- omitted 表示没有 Tag assignment intent；
- `[]`、6 个以上、duplicate、empty ID、wrong type 均非法；
- duplicate 不得在 canonicalizer 中静默去重；
- `tags`、`tagNames`、`tagPaths`、`autoCreateTags` 和其他 unknown key 由 strict Schema 拒绝；
- `tagIds` 可与 Inbox 或 Project destination 组合；
- parent 仍不存在于 Schema；
- App-visible JSON Schema 必须出现 `type=array`、`minItems=1`、`maxItems=5` 和完整 description。

### 4.2 Public output 与内部强约束

public wire output 的 `created` 增加 optional：

```ts
tagIds: z.array(canonicalOmniFocusIdSchema)
  .min(1)
  .max(5)
  .optional()
```

wire 上 optional 是为了同一 Tool 同时表达两种成功形状；runtime 不能只依赖 optional Schema，
而必须使用 branch-specific success parser：

```text
no-tag request
  -> 现有 V2 CreatedTaskView
  -> created.tagIds 必须 absent

tagged request
  -> TaggedCreatedTaskView
  -> created.tagIds 必须 present
  -> 1-5、unique、sorted
  -> 来自 actual readback
```

handler 按已解析的 request branch 选择对应 success parser，再生成 `structuredContent` 与 JSON
text；两者必须深相等。Tag names/path 不进入 mutation output，由本次 `search_tags` 结果承担 UI
展示。

## 5. Canonicalization、fingerprint 与 Ledger identity

### 5.1 No-tag branch 保持 V2

当 `tagIds === undefined`：

- 继续调用现有 `canonicalizeCreateTaskInput`；
- 继续生成 `CanonicalCreateTaskPayloadV2`；
- 继续使用 `CREATE_TASK_FINGERPRINT_NAMESPACE = "create_task:v2"`；
- canonical payload 不增加 `tagIds: null`；
- 不迁移或改写旧 Ledger record；
- 不实现 legacy hash bridge；
- 现有 Inbox/Project replay 与 tombstone 语义不变。

### 5.2 Tagged branch 使用独立 namespace

新增内部类型：

```ts
interface CanonicalTaggedCreateTaskPayload
  extends CanonicalCreateTaskPayloadV2 {
  tagIds: string[]; // input 已确认 unique；code-unit deterministic sort
}

const TAGGED_CREATE_TASK_FINGERPRINT_NAMESPACE =
  "create_task:v3:tagged";
```

- runtime parser 先拒绝 duplicate；
- canonicalizer 只排序，不负责修复非法输入；
- Tag order 不属于 semantic intent；
- name/path/status/discovery timestamp 不进入 fingerprint；
- 同一 exact set 的不同输入顺序产生相同 hash；
- tagged request 永不匹配 no-tag V2 hash；
- 同一 idempotency key 从 no-tag 改为 tagged，或反向修改，返回 `idempotency_conflict`。

### 5.3 Ledger flow

```text
parse request
  -> no-tag: canonical V2 + fingerprintV2
  -> tagged: canonical tagged + fingerprintTagged

进入现有 global lock
  -> reserve(keyHash, payloadHash)
  -> existing hash 相同：按现有 state machine
  -> existing hash 不同：idempotency_conflict
```

Ledger 仍只保存 semantic payload hash、状态、taskId 和 replay metadata，不保存 `tagIds` 或其他
Tag facts。

## 6. Tag identity 与 request-closure eligibility

### 6.1 Authoritative identity

唯一 identity：

```text
OmniJS tag.id.primaryKey
```

对每个 requested ID：

1. 执行 `Tag.byIdentifier(id)`；
2. 返回 `null` -> `tag_not_found`；
3. 返回 object 但 `resolved.id.primaryKey !== id` -> `tag_validation_failed`；
4. 禁止 `byName`、`flattenedTags` name search、path parsing、first match 或 ID 猜测。

### 6.2 Request closure 范围

每个 resolved Tag 从 self 沿 `parent` 走到 root，并验证：

- 每级 canonical ID 是 non-empty string；
- 每级 status 可读，且属于 `Active` / `OnHold` / `Dropped`；
- `parent` property 可读；
- chain 中不出现重复 canonical ID；
- requested Tag 的 direct parent（若存在）的 `childrenAreMutuallyExclusive` 是 boolean；
- resolved object 和 requested canonical ID exact roundtrip。

不扫描、缓存或验证与本次 requested Tags 无关的节点。T2 不能诚实声称检测整个 Tag 图的 orphan；
它只对本次 chain 内不可读、malformed 或无法继续解析的 parent fail closed 为
`tag_validation_failed`。完整 snapshot 的 orphan/duplicate/cycle/schema-drift 防御仍属于 T1
discovery contract。

### 6.3 Active-only

每个 requested Tag 必须满足：

```text
self.status == Active
且 root-to-self chain 中每个 ancestor.status == Active
```

self/ancestor 为 On Hold 或 Dropped -> `tag_not_allowed`。有 children 的 Tag 只要同样满足规则，
本设计不额外禁止赋值。

### 6.4 Unique 与 mutual exclusion

- input duplicate 在 runtime Schema 阶段返回 `invalid_arguments`；
- 若 requested Tag 的 direct parent `childrenAreMutuallyExclusive === true`，该 parent canonical
  ID 是这个 Tag 的 exclusive group ID；
- 两个不同 requested Tags 具有相同 non-null group ID -> `mutually_exclusive_tags`；
- parent 与其 child 不因该 property 自动互斥；
- 互斥只约束同一 parent 的 direct children；
- 不猜测 OmniFocus 未公开的传递或跨层互斥语义。

### 6.5 Validation output 的最小内部数据

validator 只把写入所需 object 和事实返回 primitive：

```ts
type ResolvedTagAssignment = {
  requestedIdsSorted: string[];
  tagObjects: unknown[]; // 只存在于 OmniJS execution 内
};
```

不得把 names、paths、完整 closure 或 native object 序列化回 Node、audit、Ledger 或日志。

## 7. Feature gates、service 与 primitive 边界

### 7.1 独立 Tag feature flag

新增：

```text
OMNIFOCUS_CREATE_TASK_TAGS_ENABLED=true
```

- 只有 exact lowercase `true` 启用；
- 缺失、空值、大小写不同或其他值均为 false；
- 只在 `tagIds` present 时检查；
- no-tag V2 请求不受该子开关影响。

handler gate 顺序固定为：

```text
strict parse + effective idempotency key + branch canonicalization/audit hashes
  -> global create_task flag
  -> Project flag（仅 Project destination）
  -> Tag flag（仅 tagged intent）
  -> default service
```

这保持当前 Project gate 的错误优先级。Tag flag=false 必须在 default service、Ledger、global
lock、Project/Tag resolver、JXA 和 readback 前返回：

```json
{
  "code": "write_disabled",
  "reason": "tag_assignment_disabled",
  "mayHaveWritten": false,
  "retrySafe": false
}
```

audit `resultCode` 为 `write_disabled.tag_assignment_disabled`。

### 7.2 Primitive route

```text
tagIds omitted
  -> 现有 createInboxTask / createTaskInProject 原样

tagIds present
  -> 新 createTaggedTask
```

`createTaggedTask` 接受现有 Inbox/Project destination union，使用一个 fixed Omni Automation
script，避免两份 Tag validation 漂移。它不接受 Parent destination，也不抽象为 generic placement
primitive。

### 7.3 Service 与 primitive 的双层 Project validation

tagged Project request 保持 Phase 2B 已接受语义：

1. service 在 Ledger `write_started` 前用现有 Project resolver 验证 exact Active Project；
2. tagged primitive 在 `new Task` 前按 Project root Task ID 立即重验；
3. final readback 要求 `actual.project.id === requestedProjectId` 且
   `actual.hierarchy.parentId === requestedProjectId`；
4. 任一失败不回落 Inbox。

### 7.4 Tagged primitive execution order

在一次 Omni Automation execution 内：

1. strict parse decoded payload 与 destination union；
2. 对 1–5 个 requested IDs 逐个 `Tag.byIdentifier`；
3. 构建并验证 requested closure；
4. 验证 Active-only 与 direct-parent mutual exclusion；
5. Project destination 时立即重验 Phase 2B placement 条件；
6. 全部成功后才设置 primitive-local `writeStarted=true`；
7. 调用 `new Task`；
8. 设置现有 Task fields；
9. 调用 `task.addTags(resolvedTags)`；
10. 尽早读取 task ID；
11. 返回 task ID、immediate placement/tag facts 与 `prewrite/postcreate/unknown` phase。

primitive immediate Tag facts 只用于诊断和决定后续 readback，不是最终 success proof。最终结果必须
来自独立 taskId readback。

## 8. Safe payload transport

外层继续使用 `SafeJxaExecutor`：fixed script、mode-0600 temporary JSON payload、`execFile`
no-shell、timeout、bounded output 与 strict JSON parse。

若 tagged primitive 通过 `Application("OmniFocus").evaluateJavascript(...)` 进入 Omni
Automation，采用固定 Base64 transport：

1. 外层读取完整 JSON payload；
2. 以 UTF-8 编码为 Base64；
3. 只把匹配 `[A-Za-z0-9+/=]+` 且满足 size bound 的值放入唯一固定 placeholder；
4. 确认 placeholder 恰好替换一次；
5. 内层 `Data.fromBase64(value).toString()` 后 `JSON.parse`；
6. name/note/Project ID/Tag IDs 不进入 script source、stderr 或日志。

禁止 raw JSON/string interpolation、动态可执行语句、shell、临时明文脚本和 raw process output
logging。

进入公开 Schema 发布前必须完成真实零写入 transport probe：中文、emoji、quotes、backslash、
newline、tab 均 exact roundtrip；source 不含 plaintext；不调用 `new Task`、`addTag(s)`、setter、
cleanup 或 URL API；不读取/输出真实 Task/Tag facts。

## 9. Internal readback、verification 与 replay

### 9.1 不扩大公开 `get_task`

新增 mutation-only boundary：

```ts
type CreatedTaskVerificationRead = {
  task: TaskView;
  tagIds: string[];
};

readCreatedTaskForVerification(taskId)
  -> query exact taskId, limit 2
  -> fields = existing GET_TASK_RAW_FIELDS + "tags"
  -> existing Task Adapter/Mapper 处理现有 Task facts
  -> independent Tag ID adapter 处理 raw "tags"
  -> 返回 TaskView + canonical tagIds
```

它不得修改公开 `get_task` Schema、共享 `GET_TASK_RAW_FIELDS`、`RawTask` 或 `TaskView`。现有
Task Adapter 只读取显式字段，因此 internal reader 可把 raw `tags` 从同一 query item 分离后，
再复用现有 Task mapping。

### 9.2 Raw Tag ID adapter

- raw value 必须是 array；
- 每项必须是 non-empty string；
- duplicate 或 malformed fail closed；
- 排序使用 deterministic code-unit order；
- 不记录 actual IDs；
- 不设置独立 `maxItems` 或任意 item-count hard bound；资源上限由现有 query/process byte buffer、
  timeout 和 JSON transport 承担。

requested 最大 5，不意味着真实 Task 永远最多 5 个 Tag。若 readback 得到 6 个以上有效、唯一
canonical IDs，这是 exact-set mismatch，初次验证应返回 `partial_success`，而不是 adapter failure；
错误只暴露 bounded count/diff，不回显不受控完整数组。

若 exact task readback 已可信证明 Task 存在，且 actual Tag collection 可读但集合与 requested 不同，
包括 0 个或 6 个以上有效 IDs，返回 `partial_success`。若 raw Tag IDs malformed/duplicate 导致
actual collection 本身无法可信确定，则返回 `verification_failed`；两者都不得自动重写。

### 9.3 Tagged initial verification

```text
sort(actual unique tagIds) === canonical requested tagIds
```

任一 missing、extra、duplicate、malformed、read failure 或 count mismatch 均不能成功。成功时：

- `created.tagIds` 来自 actual readback，不从 request 回显；
- deterministic sorted；
- 必须为 1–5 个；
- Task fields 与 Inbox/Project placement 仍通过现有 verifier。

若 Task 已存在但 Tag exact set 不匹配：

- Ledger 进入现有 `verification_failed`；
- 返回 `partial_success`、`mayHaveWritten=true`、`retrySafe=false`；
- 不自动补 Tag、移除 extra Tag 或删除 Task。

### 9.4 No-tag verification

no-tag request：

- 继续使用现有 V2 exact Task readback；
- 不调用 internal Tag ID reader；
- 不比较或返回 Tag IDs；
- 外部并发增加 Tag 不使 no-tag intent 失败；
- success output 保持现有 V2 shape。

### 9.5 Replay

- `outcome_unknown` 永不再次写入；
- `task_created` / `verification_failed` 的同 key 后续调用只重新 readback 原 taskId；
- 手工修正后允许 `verification_failed -> verified`，但这是只读重验，不是 MCP 补写；
- verified no-tag replay 保持现有 `replayed_current_state_changed` warning；
- verified tagged replay 读取当前 Tag IDs：若有效且为 1–5 个，返回 current IDs，并在与原 intent
  不同时时使用同一 current-state-changed warning；
- 若 tagged replay 当前为 0 个或超过 5 个 Tag，compact tagged success contract 无法诚实表达，
  返回 `replay_target_unavailable`、`reason=current_tag_state_out_of_contract`、
  `mayHaveWritten=true`、`retrySafe=false`，不截断、不重写。

## 10. Ledger phase 与 error semantics

### 10.1 Ledger `write_started` 与 primitive-local `writeStarted`

现有 Ledger `write_started` 表示 service 已进入受控 mutation primitive 阶段，不证明
`new Task` 已调用。primitive phases：

```text
prewrite   已可信确认未调用 new Task
postcreate Task 已存在且有 taskId
unknown    无法可信判断是否已创建
```

transitions：

```text
write_started + retryable prewrite validation
  -> retryable_validation_error

write_started + terminal prewrite validation
  -> terminal_prewrite_error

write_started + postcreate taskId
  -> task_created -> exact readback -> verified | verification_failed

write_started + unknown/no taskId
  -> outcome_unknown
```

`retrySafe=true` 只表示没有写入且相同 key 可由用户明确重试并实时重验，不表示 Agent、service
或 primitive 可以自动 retry。

### 10.2 新增稳定 error code

| code | phase | Ledger target | mayHaveWritten | retrySafe | 语义 |
|---|---|---|---:|---:|---|
| `tag_not_found` | prewrite | `retryable_validation_error` | false | true | requested ID 当前不存在 |
| `tag_not_allowed` | prewrite | `retryable_validation_error` | false | true | self 或 ancestor 非 Active |
| `mutually_exclusive_tags` | prewrite | `terminal_prewrite_error` | false | false | 同一 exclusive group 选择多个 direct children |
| `tag_validation_failed` | prewrite | `retryable_validation_error` | false | true | identity/status/parent/property/schema 无法可信验证 |
| `partial_success` | postwrite | `verification_failed` | true | false | Task 存在但 fields/placement/Tag exact set 不匹配 |

`ambiguous_tag` 不属于 ID-only runtime：名称歧义在 `search_tags` 与 UI path 层处理；canonical ID
lookup 只能 exact object 或 null。不可信 identity 统一 fail closed 为 `tag_validation_failed`。

错误 response、audit 和日志不得包含 Tag name/path、完整 closure、raw process output、script
source 或 plaintext payload。直接返回给用户的 verification diff 固定为
`requestedCount`、`actualCount`、deterministic sorted `missingIds`（最多 5 个）和 `extraIds`
（最多 5 个）；不生成 set hash。生产 audit 不记录该 diff。

## 11. Agent routing 与确认 UI

### 11.1 Routing

- 用户未提 Tag：不调用 `search_tags`，走现有 no-tag V2；
- 用户只问 Tag：只调用 `search_tags`；
- 用户明确指定名称/path：调用 `search_tags`，以完整 root-to-self path 展示真实候选；
- 用户原始指令已唯一指定完整 path，且本次查询唯一匹配：原始指令可构成明确选择，不机械要求
  第二轮确认；
- 同名、多候选、destination/Tag path 不明确：必须澄清；
- 模型提出用户原本未指定的 Tag，或用户要求“自动选合适的 Tag”：必须先展示候选并取得明确
  选择；
- 用户说“没有就创建 Tag”：明确拒绝；若改为无 Tag 创建，必须重新取得明确同意；
- 任一 Tag 要求无法满足：不得静默省略 `tagIds` 后创建。

### 11.2 Candidate eligibility

`search_tags` 默认 Active 只保证返回对象的 direct status filter。Agent 在宣称候选“可用于
T2 写入”前必须检查完整 `hierarchy.path`：leaf 与所有 ancestors 都是 `active`。这只是 UI
eligibility 提示，不替代 mutation runtime 的实时验证。

### 11.3 Confirmation UI

确认体验应让用户看到：

- Task name；
- Inbox 或 Project destination；
- Project name 与必要 Folder/type context；
- 每个 Tag 的完整 path；
- 这是 Task creation，不会创建或修改 Tag。

提交仍只使用 canonical IDs。若客户端无法把 destination 与 Tag paths 绑定到同一次确认，停止
公开启用并重新评估确认方案。

## 12. Privacy、audit 与 cache

- `search_tags` 只在 Tag discovery/creation intent 需要时调用，不预取；
- discovery response 不长期缓存，不作为 mutation token 或写入事实；
- runtime 每次 tagged request 都实时解析 canonical IDs；
- mutation audit 继续只允许 `correlationId`、三个 key/request hashes、`resultCode`、`elapsedMs`；
- audit 禁止 raw `tagIds`、names、paths、Task name/note、payload content/hash 或 script source；
- Ledger 不保存 Tag facts；
- tests 使用 synthetic IDs；真实 probe/acceptance 只输出 count/boolean；
- `created.tagIds` 是直接 user-visible mutation result，不进入 audit/log；
- plaintext payload 只存在于 mode-0600 临时 file 和必要的进程内存，执行后清理。

## 13. 测试与验收矩阵

### 13.1 Unit / wire contract

- `tagIds` omitted、1、5、empty、6、duplicate、empty ID、wrong type；
- strict 拒绝 `tags`/`tagNames`/`tagPaths`/`autoCreateTags`/unknown keys；
- published JSON Schema 的 array/minItems/maxItems/description/additionalProperties；
- runtime duplicate rejection；
- deterministic sort 与 set semantics；
- no-tag V2 canonical JSON/hash byte-for-byte regression；
- tagged namespace/hash；
- no-tag/tagged same key conflict；
- public output optional 与两个 branch-specific runtime success parsers；
- `structuredContent` 与 JSON text 深相等。

### 13.2 Request-closure fixtures

- exact ID roundtrip success/null/mismatch；
- root、三层 chain、repeated ID；
- Active self / OnHold self / Dropped self；
- Active child under Active/OnHold/Dropped ancestors；
- empty/malformed ID、unknown status、unreadable parent/property；
- mutually exclusive siblings、different groups、parent + child；
- shuffled requested order；
- 无关 Tag 图异常不阻断本次 valid closure；
- same-name 只影响 discovery，不影响 ID runtime；
- 与 T1 共享语义 fixtures，但不共享 cache 或 full-graph scope。

### 13.3 Feature gate / service / Ledger

- Tag flag exact true/false matrix；
- gate order global -> Project -> Tag；
- Tag flag=false 时 service/Ledger/lock/resolver/executor/readback 全部 unreachable；
- Inbox/Project x no-tag/tagged cross product；
- Project service validation + primitive revalidation；
- prewrite error state mapping；
- `write_started` 与 primitive phase distinction；
- `outcome_unknown` 永不重写；
- `verification_failed` replay 只 readback；
- 手工修正后只读转 `verified`；
- no-tag replay regression。

### 13.4 Primitive / transport

- fixed script 与唯一 Base64 placeholder；
- alphabet/size/exactly-once replacement；
- Unicode、quotes、backslash、newline、tab exact roundtrip；
- source/log/error 不含 plaintext payload；
- timeout、bounded output、invalid/empty JSON；
- Tag resolve/closure/exclusivity 和 Project validation 全部在 `new Task` 前；
- prewrite failure 时 create/setter/addTags call count 均为 0；
- tagged Inbox/Project success；
- `addTags` throw、partial set、missing taskId、unknown outcome；
- no `new Tag`、no byName、no legacy add/edit/create_tag；
- no Inbox fallback、no parent branch。

### 13.5 Internal readback / verifier

- dedicated exact-ID reader；
- public `get_task`、shared `RawTask`、`TaskView` Schema 不变；
- raw tags array/string/empty/duplicate/malformed；验证不存在独立 item-count 上限；
- actual 0/1/5/6+；
- exact set、missing、extra、different order；
- 6+ valid IDs classified as mismatch，而非 schema drift；
- `created.tagIds` 必须来自 actual；
- no-tag 不读/不比较/不返回 Tag IDs；
- tagged replay changed/0/6+ compact-contract failure，并精确返回
  `current_tag_state_out_of_contract` reason；
- partial success 不触发 retry/补写/cleanup。

### 13.6 MCP / Profile / instructions

- App-visible input 含 `tagIds`；
- output `created.tagIds` optional；
- `personal-production` 仍精确六 Tool、Resources absent、唯一 mutation `create_task`；
- `create_task` annotations 保持 `readOnly=false`、`destructive=false`、`openWorld=false`、
  `idempotent=true`；
- `create_tag`、legacy `list_tags`、edit/update/delete/batch absent；
- `upstream-full` surface 不变；
- Tool description、Server Instructions、App Instructions 同步 ID-only、ancestor-active、no auto-create、
  no silent downgrade、Tag flag 可禁写、Phase 4 absent；
- 负向路由确认模型不会省略 Tag 要求后创建无 Tag Task。

### 13.7 真实只读与零写入

- 重跑 T1 full snapshot/canonical roundtrip；
- 至少一个真实 tagged Task 的 exact Tag ID readback；
- Base64 transport zero-write probe；
- probe 前后 Tag projection、Task count、Ledger、audit、mutation lock 不变；
- 不输出真实 ID/name/path；
- capability probe 与 readback roundtrip 均通过后才可进入公开 Schema gate。

### 13.8 禁写客户端门禁

T2-C 发布 V3 Schema 时 Tag flag=false；App Refresh/负向路由期间临时 global flag=false：

- “创建任务并添加现有 Active Tag”不得静默降级；合法误触也只能 `write_disabled`；
- nonexistent Tag 不创建 Task；
- “没有就创建 Tag”明确拒绝；
- 同名以完整 path 澄清；
- ancestor 非 Active 不展示为可写候选；
- Ledger/lock/JXA untouched；
- exact-name pre/post `not_found`；
- audit allowlist 与 health/ready/watchdog 通过；
- 门禁完成后恢复既有 global/Project flags，Tag flag保持 false。

### 13.9 真实 mutation Canary（未来单独批准）

只有设计、T2-B、T2-C 各自通过后，才逐次申请：

1. tagged Inbox Canary：1–2 个实时验证的 ancestor-active、非互斥 Tag；
2. 人工确认 actual exact ID set、Ledger/audit/lock；
3. 人工删除并以 ID/name 双 `not_found` 验证；
4. tagged Project Canary：一个 Active Tag + exact Active Project root ID；
5. 再次确认、清理与双 `not_found`。

两条 Canary 串行；第一条未清理前不得创建第二条。公开 Tunnel Tag flag 保持 false。删除能力不
注册为 MCP Tool；partial/outcome-unknown 时禁止自动 cleanup。验收文档只记录脱敏 count、hash
和 boolean。

## 14. 分阶段实施与提交

### T2-A：设计与只读证据（已完成并通过评审）

包含：本设计、代码审计、既有 capability probe 结论、验收门禁。独立评审已通过。

```text
docs: revise phase t2 existing tag assignment design
```

本阶段未改 runtime；docs-only commit/push 仍等待用户明确指令。

### T2-B：未发布内部实现（已获准，等待用户开始指令）

新增 tagged parser/canonicalizer/fingerprint、Tag flag helper、request-closure validator、tagged
primitive、dedicated readback、verifier 和 deterministic tests。

生产 registration 仍发布 V2 Schema；Tag flag 不加入 LaunchAgent；新路径不能从已注册 handler
到达。建议原子提交：

```text
feat: add guarded tag assignment internals for create_task
```

### T2-C：禁写 Schema 发布（再次独立批准）

切换 public V3 wire/output Schema、description、Server/App Instructions 和 protocol tests。

部署顺序：

1. global flag=false；
2. 部署且 Tag flag显式 false；
3. App Refresh；
4. protocol 与负向路由验收；
5. 恢复既有 global/Project flags；
6. Tag flag 仍 false。

```text
feat: publish guarded tagIds contract for create_task
```

### T2-D：隔离 Canary（逐条批准）

```text
docs: record phase t2 tag assignment canary acceptance
```

### T2-E：正式启用（再次独立批准）

- fail-closed reload；
- loaded Tag flag=true；
- 复核六 Tool、Resources absent、唯一 mutation、health/ready/watchdog；
- 启用过程不创建 Task；
- 是否追加公开 Canary 另行批准。

每个 code checkpoint：

```text
npm test
npm run build
git diff --check
git status --short
```

未经明确要求，不 commit、不 push、不修改 LaunchAgent、不执行真实 mutation。

## 15. 准入与停止条件

### 15.1 T2-B 准入

- [x] 本版设计被独立接受；
- [x] ADR-006 `ambiguous_tag` 窄幅 amendment 被明确接受并同步；
- [x] T1-A/B/C/D 全部通过；
- [x] 当前生产精确六 Tool、Resources absent；
- [x] 真实只读 probe 证明 exact ID/status/parent/exclusivity/addTags/ID readback API shape；
- [x] no-tag V2 与 Project placement 健康；
- [x] Phase 4 isolation 已由 ADR-006 amendment 接受；
- [x] request-closure scope 被接受；
- [x] split fingerprint strategy 被接受；
- [x] wire/runtime uniqueness boundary 被接受；
- [x] dedicated readback 与 6+ actual Tag 语义被接受并冻结；
- [x] tagged replay compact-output 语义与 reason 被接受；
- [x] Ledger/primitive phase 与 error mapping 被接受。

### 15.2 T2-C 准入

- [ ] T2-B tests/build/diff 全绿；
- [ ] no-tag V2 canonical/hash/replay regression 全绿；
- [ ] zero-write Base64 probe 通过；
- [ ] public `get_task`/shared Task Domain 未扩大；
- [ ] tagged exact-set verifier 全绿；
- [ ] six Tool / zero Resources protocol tests 全绿；
- [ ] Server/App Instructions 同步完成。

### 15.3 T2-D / T2-E 准入

- [ ] T2-C 禁写部署、App Refresh 和负向路由通过；
- [ ] Tag flag=false fail-closed；
- [ ] global/Project flags 已恢复；
- [ ] health/ready/watchdog 正常；
- [ ] 用户单独批准每条 Canary；
- [ ] Inbox/Project Canary 各自通过并清理；
- [ ] 用户再次批准正式启用。

### 15.4 立即停止

- 需要 Tag name/path resolver 或自动创建/恢复/修改 Tag；
- 无法在 `new Task` 前解析全部 requested Tag objects；
- requested closure identity/status/parent/property 无法可信验证；
- 实现必须扫描整个无关 Tag 图才能继续；
- 真实 Tag facts 必须写入 audit/Ledger/log；
- public `get_task` 或共享 Task Domain 被迫扩大且无独立评审；
- no-tag V2 canonical/hash/replay 出现 regression；
- Tag flag=false 仍触达 service/Ledger/lock/resolver/JXA/readback；
- readback 只能得到 names，不能得到 canonical IDs；
- partial Tag assignment 被当作 success；
- partial/outcome-unknown 自动 retry、补写或 cleanup；
- `create_tag`、Resources 或第七个 Tool 进入个人 Profile；
- client 静默丢弃 Tag 要求；
- T2 引入 parentTaskId、prepare/commit、generic placement 或 CRUD；
- health/readiness/watchdog 或 mutation lock 异常。

## 16. 当前停点

Phase T2 第二版设计及 ADR amendment 已通过评审，T2-B 未发布内部实现已获准，但当前代码仍无
T2 runtime 或公开 contract。本次文档闭合完成后等待用户决定是否实际开始 T2-B。

T2-B 批准不包含：

- 修改已导出的/已注册 V2 Schema、默认 handler 路由或 production description；
- 把 Tag flag 加入或加载到 LaunchAgent；
- 修改 LaunchAgent 或重启 Tunnel；
- 调用 `new Task` / `addTag(s)`；
- 创建、修改或删除任何 OmniFocus 对象；
- 执行 Canary、正式启用或进入 Phase 4。

只有用户发出开始指令后才实际进入 T2-B。T2-B 完成后必须运行 tests/build/diff、接受独立代码
评审并停止；T2-C Schema 发布、T2-D Canary、T2-E 正式启用仍需后续独立批准。
