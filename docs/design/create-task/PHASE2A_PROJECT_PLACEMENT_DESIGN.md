# `create_task` Phase 2A：Project Placement 设计与评审门禁

> 状态：**待评审；仅设计，不构成 Phase 2B 实施或部署授权**<br>
> 设计日期：2026-07-14<br>
> 修订：根据 2026-07-14 Phase 2A 评审意见，冻结 retryable validation、UI target clarity、共享 ID Schema 与 post-write warning 语义<br>
> 审计基线：`7b408f7`（`main` / `origin/main`）<br>
> 上游决策：[ADR-006](../../architecture/decisions/ADR-006-controlled-create-task-v1.md)、[ADR-005](../../architecture/decisions/ADR-005-ai-boundary.md)

## 1. 结论摘要

Phase 2A 建议把 `create_task` 演进为版本化 V2，但仍保持一个 Tool、一次调用、一次只允许创建一个 Task：

```ts
type CreateTaskDestination =
  | { kind: "inbox" }
  | { kind: "project"; projectId: string };
```

Project placement 只有同时满足以下条件时才允许继续使用单阶段调用：

1. Project 目标来自本次对话中的真实只读查询结果；
2. mutation 只接收该查询返回的 canonical Project root-task ID；
3. 服务端在写入前按 ID 实时重新读取并验证目标；
4. Project 自身状态是 `Active`，且没有 Dropped ancestor Folder；
5. JXA 在创建前再次按 canonical ID 定位并验证同一 Project；
6. 客户端确认 UI 能向用户展示清楚的 Project 目标；
7. 仅有单 Task、单目标、无名称解析、无 fallback、无其他转换。

失败语义进一步冻结为：确定性 not-found/inactive 目标错误写 terminal tombstone；尚未取得可信目标结论的 validation failure 记录非 terminal retryable state，同 key + 同 payload 可安全重试；exact Task placement 已成功后，Project 随后状态变化只产生 success warning，不伪装为落位失败。

任一条件不成立时不得弱化校验，也不得回落 Inbox；应停止 Phase 2B，改为设计：

```text
prepare_task_creation -> commit_task_creation
```

本设计不修改 runtime，不调用 `create_task`，不变更生产 flag，不部署，不重启 Tunnel，也不扩大当前五 Tool 表面。

## 2. 权威事实审计

### 2.1 Phase 1 生产事实

当前代码、测试和验收记录一致支持以下事实：

- `personal-production` 精确注册 `get_task`、`get_project`、`get_completed_since`、`get_lean_snapshot`、`create_task`；
- Resources capability absent；
- `create_task` 是该 Profile 唯一 mutation；
- V1 public Schema 要求 `name` 与 UUID `idempotencyKey`，并拒绝 Project、parent、Tag、repeat、notification、batch 等字段；
- V1 canonical fingerprint namespace 是 `create_task:v1`；
- V1 通过永久 tombstone Ledger、全局 mutation lock、no-shell JXA、Inbox-only primitive 和 exact Task readback 防止重复与错误成功；
- `OMNIFOCUS_CREATE_TASK_ENABLED` 只有精确小写 `true` 才允许进入 mutation service；
- Checkpoint 6A、6B、6C、7 的禁写、真实 Canary、公开 Web 创建/回读、人工删除及双 `not_found` 已有冻结记录；
- 最后一次代码门禁记录为 40 个 test files、646 tests、build 与 diff check 通过。

### 2.2 当前 Project canonical identity

仓库已经统一 Project 对外 ID：

```text
canonical Project ID = project.task.id.primaryKey
```

该 ID 是 Project root Task ID，与 OmniJS `project.id.primaryKey` 属于不同 namespace。

当前读侧的行为是：

```text
get_project({ id })
  -> queryOmnifocus(entity="projects", projectId=id, includeCompleted=true)
  -> 过滤层兼容 root-task ID 或 OmniJS Project ID
  -> 输出 id 固定映射为 root-task ID
  -> Adapter 后再次要求 output.id === input.id
```

因此：

- canonical root-task ID 可以得到一个 exact result；
- 只提交 OmniJS Project ID 即使能在底层定位，也会被 canonical exact filter 排除；
- 零结果是 `not_found`，多结果是 `ambiguous_match`，query/Adapter/Schema 漂移是 `query_failed`；
- `TaskView.project.id`、Snapshot Project ID 和 `ProjectView.id` 使用同一 canonical namespace。

当前 `ProjectView.folder` 只提供 immediate Folder `id/name`，没有完整 ancestor path。若 Project name + immediate Folder + kind 仍不能让用户区分同名目标，当前 read contract 不足以满足单阶段 UI gate；不得由模型自行拼出 Folder path。需要另行增强只读区分信息，或直接升级 prepare/commit。

这为 Phase 2B 的 ID-only mutation 提供了身份基础，但 public `get_project` handler 不能直接当作 mutation validator，因为它还支持 name locator，并且输出包含 mutation 不需要的大量 aggregate。

### 2.3 当前 Project 状态契约

Project Adapter 只接受以下 raw status：

```text
Active | OnHold | Done | Dropped
```

`ProjectView.status` 映射为：

```ts
{
  raw: string;
  active: boolean;
  onHold: boolean;
  completed: boolean;
  dropped: boolean;
}
```

当前缺口：`get_project` 使用 `includeCompleted=true`，而 `status.active` 只检查 Project 自身 raw status。通用 query 代码知道 OmniJS 没有直接的 `effectivelyDropped` Project 字段，并只在 `includeCompleted=false` 路径中显式遍历 ancestor Folder。因此，一个自身为 `Active`、但位于 Dropped ancestor Folder 下的 Project，不能仅靠当前 `ProjectView.status.active` 判定为可写目标。

Phase 2B 必须使用独立 destination validator，把以下条件同时视为允许：

```text
raw Project status === Active
AND no ancestor Folder is Dropped
AND canonical ID exact match
AND exactly one readable Project
```

`standard` 与 `single_actions` 都可作为 Active Project 目标；两者不需要名称猜测或不同写入语义。

### 2.4 当前 primitive 可复用边界

可复用：

- `queryOmnifocus` 的 Project fixed-field query 思路；
- Project Adapter、status enum 与 canonical ID mapping；
- `SafeJxaExecutor` 的 `execFile`、0600 payload、timeout、buffer limit、strict JSON 和清理策略；
- V1 Task property serialization、epoch-milliseconds 日期路径；
- `getTask({id}) -> Task Adapter -> Task Mapper -> TaskView` exact readback；
- V1 Ledger、全局 mutation lock、replay 与 outcome-unknown 语义。

不得复用：

- public `get_project` 的 name locator 作为 mutation resolver；
- upstream `add_omnifocus_task`；
- upstream 的 Project name lookup、parent lookup、Tag name lookup/auto-create；
- 任何 Project 失败后创建 Inbox Task 的 fallback；
- 通用 `queryOmnifocus` 的动态 input 或 public handler error envelope 直接作为写入授权。

## 3. 与 Accepted ADR 的一致性

本次审计没有发现必须先修改 ADR-006 才能继续 Phase 2A 的冲突。以下设计均是 ADR-006 已接受边界的具体化：

- Phase 2A 只做 Project placement 设计；
- Phase 2B 只允许 canonical Project ID、Active-only、实时重新验证；
- Project placement 失败绝不回落 Inbox；
- V2 canonical payload 与 `create_task:v2` namespace；
- parent 固定留在 Phase 4；
- Tag 固定留在 T1/T2；
- 客户端不能清楚展示目标时升级 prepare/commit。

本设计新增的“Dropped ancestor Folder 也不可写”是对 `Active-only` / `Dropped fail closed` 的实现性收紧，不改变 Accepted 决策。

本轮评审已经明确批准并冻结以下决定：

1. V2 public input 强制要求显式 `destination`，Inbox 不再使用 omitted default；
2. V2 使用 `create_task:v2` fingerprint namespace，并继续使用现有 Ledger key index/state directory；
3. Project ID exact only，Project name 永不进入 mutation resolver；
4. Active eligibility 包含“无 Dropped ancestor Folder”；
5. Project placement 使用独立 fail-closed feature flag；
6. 使用独立 `createTaskInProject` primitive，Project 分支永不 fallback Inbox；
7. parent 保留 Phase 4，Tag 保留 T1/T2。

本轮进一步冻结以下实现前语义，不留给 Phase 2B 自行决定：

1. `project_validation_failed` 表示尚未取得可信目标结论且已确定没有写入；server resolver 与可信 JXA prewrite failure 都写入非 terminal retryable validation state，不进入或不保留 `write_started`；同一 key + 同一 payload 可安全重试，不同 payload 仍冲突；
2. `project_not_found` 与 `project_not_active` 是确定性目标结论，写入 terminal prewrite tombstone；
3. canonical ID input 复用读侧 ID Schema；如果需要抽取统一 Schema，不得添加未经真实 ID 与读侧契约支持的任意长度/格式限制；
4. exact Task placement 成功后，Project 随后变为 inactive 不再伪装成 placement failure，而返回 success warning；
5. 单阶段 UI 不只要求“此前调用过 `get_project`”，还要求 Tool 调用前明确复述可辨识目标，并由确认界面可靠关联；失败立即升级 prepare/commit。

若实现需要改变上述任一冻结决定，应先提交 ADR amendment，而不是在 Phase 2B 中自行选择。

## 4. 目标与非目标

### 4.1 目标

- 在用户明确要求后创建一个 Task 到一个明确 Active Project；
- 只使用真实只读查询返回的单个 canonical Project ID；
- 把 Inbox 与 Project destination 作为同一个 V2 strict contract 的显式 union；
- 在 Node validation 与 JXA create 边界各做一次 ID/status 验证；
- 保持 V1 的幂等、锁、隐私、日期、readback 和 fail-closed 语义；
- 让输出明确报告实际 Inbox/Project placement；
- 为禁写 Refresh、生产 Canary、停止与回滚提供可验证门禁。

### 4.2 非目标

Phase 2 不包含：

```text
projectName / name lookup inside mutation
partial/fuzzy/case-insensitive Project matching
multiple candidate selection inside mutation
multiple destinations
parent task placement
Tag discovery or assignment
Tag creation or modification
repeat rules
notifications
batch creation
move/update/complete/delete
Project creation or mutation
generic executor
automatic Inbox fallback
```

V2 `.strict()` 必须拒绝这些字段，不能静默 strip。

## 5. V2 输入契约

### 5.1 建议 Schema

```ts
// Reuse the current read-side non-empty canonical entity ID contract.
// If extracted, every read/write consumer must import the same schema.
const canonicalOmniFocusIdSchema = nonEmptyStringSchema;

const inboxDestinationSchema = z.object({
  kind: z.literal("inbox"),
}).strict();

const projectDestinationSchema = z.object({
  kind: z.literal("project"),
  projectId: canonicalOmniFocusIdSchema,
}).strict();

const createTaskDestinationSchema = z.discriminatedUnion("kind", [
  inboxDestinationSchema,
  projectDestinationSchema,
]);

const createTaskV2InputShape = {
  name: createTaskNameSchema,
  note: createTaskNoteSchema.optional(),
  plannedDate: createTaskAbsoluteDateTimeSchema.optional(),
  dueDate: createTaskAbsoluteDateTimeSchema.optional(),
  deferDate: createTaskAbsoluteDateTimeSchema.optional(),
  flagged: z.boolean().optional(),
  estimatedMinutes: createTaskEstimateSchema.optional(),
  destination: createTaskDestinationSchema,
  idempotencyKey: z.string().uuid().optional(),
} as const;

export const createTaskV2PublicInputSchema = z
  .object({
    ...createTaskV2InputShape,
    idempotencyKey: z.string().uuid(),
  })
  .strict();

export const createTaskV2InputSchema = z
  .object(createTaskV2InputShape)
  .strict()
  .superRefine(validateDateRelationships);
```

与 V1 一样，MCP registration 必须发布 strict `ZodObject`，handler 再执行完整 relation-aware parse。Phase 2B 必须用真实 `InMemoryTransport + Client.listTools()` 证明 nested destination union 没有被 MCP SDK 1.29 丢失或展平错误。

### 5.2 `destination` 必须显式提供

V2 不建议把 omitted destination 默认为 Inbox。原因：

- 模型在 Project 请求中漏传 destination 时，默认 Inbox 会成为隐性 fallback；
- 显式 `{kind:"inbox"}` 让确认 UI、fingerprint、测试和日志边界更清楚；
- Phase 2 本来就要求 Schema Refresh，兼容旧的隐式 Inbox args 不应优先于 placement safety。

因此 Phase 2B 切换后：

```text
Inbox create   -> destination={kind:"inbox"}
Project create -> destination={kind:"project", projectId:"<canonical-id>"}
omitted        -> SDK/handler invalid_arguments; no write
```

### 5.3 Project ID 是 opaque canonical identifier

- 读侧当前已有 `nonEmptyStringSchema = z.string().min(1)`，Project output 已使用该契约；Phase 2B 应复用它，或从同一来源抽取语义更明确的 `canonicalOmniFocusIdSchema`；
- `get_project` output、`TaskView.project.id`、Snapshot Project ID 与 `create_task` Project input 必须共享同一 canonical ID Schema；
- 不在写侧单独猜测 UUID/base64/字符集或最大长度；
- 若要增加长度上限，必须先用现有真实 ID 数据、读侧契约和 protocol payload limit 证明该边界，并同步所有 canonical entity ID consumer；
- 不 trim、不改大小写、不做 Unicode normalization；
- 空字符串和错误类型拒绝；
- 不接受 `projectName`、`name`、`folderPath`、OmniJS Project ID 或显示 label 替代；
- server resolver 必须以 exact equality 重新确认返回 ID 与 input 相同。

## 6. V2 输出契约

### 6.1 Compact created view

```ts
const createdTaskLocationV2Schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("inbox"),
  }).strict(),
  z.object({
    kind: z.literal("project"),
    projectId: canonicalOmniFocusIdSchema,
    projectName: z.string(),
  }).strict(),
]);

const createdTaskViewV2Schema = z.object({
  id: z.string().min(1),
  name: z.string(),
  note: z.string(),
  location: createdTaskLocationV2Schema,
  plannedDate: createTaskAbsoluteDateTimeSchema.nullable(),
  dueDate: createTaskAbsoluteDateTimeSchema.nullable(),
  deferDate: createTaskAbsoluteDateTimeSchema.nullable(),
  flagged: z.boolean(),
  estimatedMinutes: z.number().int().nullable(),
}).strict();
```

`projectName` 只来自 exact post-write `TaskView.project.name`，用于确认实际位置；它不进入 destination 输入，也不参与目标解析。Project 在写入期间更名但 canonical ID 不变时，readback 返回当前实际名称。

成功 envelope、`structuredContent` 与 JSON text 的一致性、24 小时 replay window 均延续 V1。V2 warning enum 增加：

```text
project_state_changed_after_creation
project_state_unverified_after_creation
```

- `project_state_changed_after_creation`：exact Task readback 已证明落位和字段正确，但 post-write Project read 发现它随后变为 OnHold/Done/Dropped 或进入 Dropped ancestor Folder；
- `project_state_unverified_after_creation`：exact Task readback 已证明落位和字段正确，但 post-write Project current-state read 暂时失败；
- 两者都不得暗示 Task 未创建，也不得触发再次 create。

### 6.2 新增稳定错误与 no-write 分类

Phase 2B 必须区分“可信的确定性目标结论”和“尚未取得可信结论的验证故障”：

| code | stable reason | 条件 | mayHaveWritten | retrySafe | Ledger |
|---|---|---|---:|---:|---|
| `project_not_found` | `not_found` | 可信 exact canonical query 确认零结果，或 JXA 在构造 Task 前确认目标消失 | false | false | terminal prewrite tombstone |
| `project_not_active` | `on_hold` / `done` / `dropped` / `dropped_ancestor` | 已可信读取到不允许的目标状态 | false | false | terminal prewrite tombstone |
| `project_validation_failed` | `ambiguous_canonical_id` / `query_failed` / `adapter_failed` / `schema_drift` / `ancestor_state_unknown` / `canonical_id_mismatch` | 无法取得可信、唯一、可验证的目标结论，但有结构化证据证明未创建 Task | false | true | 非 terminal `retryable_validation_error`；同 key + 同 payload 可重试 |

`project_validation_failed` 的 Ledger 语义在此固定为：**永不永久消耗 key**。

- server resolver 的 query/Adapter/Schema/ancestor failure 发生在 `write_started` 前：保留 keyHash/payloadHash 并转为非 terminal `retryable_validation_error`；
- JXA 若返回可信的 structured `phase=prewrite` 且证明 Task constructor/push 未发生：从 `write_started` 转为同一非 terminal state；
- 同 key + 同 payload 可重新验证；同 key + 不同 payload 仍是 `idempotency_conflict`；
- 无法证明 structured prewrite 时不得返回 `project_validation_failed`，而进入 `outcome_unknown`。

两类 no-write failure 都在 Ledger compact resultCode 与 privacy-safe audit 中记录稳定 `resultCode=<code>.<reason>`；不得把 Project ID/name 写入任何诊断记录。

当前 V1 service error helper 把 `retrySafe` 固定为 `false`。Phase 2B 必须显式重构该内部 helper，使 `project_validation_failed` 能返回 `retrySafe=true`；只改文档或 result code 而保留 hard-coded false 不算通过。

只有 JXA 已被调用且无法证明是否创建时才进入既有 `outcome_unknown`，`mayHaveWritten=true`、`retrySafe=false`、永久 tombstone。server resolver 的 query/Adapter/Schema/ancestor read failure 发生在 write primitive 前；可信 JXA validation prewrite failure 也能证明未创建。两者都不能冒充 outcome unknown，也不能永久消耗 key。

其余沿用 V1：

- malformed/extra/name-based destination -> `invalid_arguments`；
- 已进入写入但 task ID 不可信 -> `verification_failed`；
- Task 已创建但实际 Project ID、Inbox 状态、parent 或属性不一致 -> `partial_success`；
- 同 key 改 destination -> `idempotency_conflict`；
- replay target 不可读 -> `replay_target_unavailable`。

“ambiguous”在 V2 mutation 中不是合法的名称选择分支。按 ID 出现多个结果属于 Domain invariant failure，映射 `project_validation_failed`，reason=`ambiguous_canonical_id`，不得任选一个；修复读侧/数据状态后可用同 key + 同 payload 安全重试，因为此前没有写入。

## 7. V2 canonicalization 与 fingerprint

### 7.1 Canonical payload

```ts
interface CanonicalCreateTaskPayloadV2 {
  name: string;
  note: string;
  plannedDate: string | null;
  dueDate: string | null;
  deferDate: string | null;
  flagged: boolean;
  estimatedMinutes: number | null;
  destination:
    | { kind: "inbox" }
    | { kind: "project"; projectId: string };
}
```

文本、日期、boolean、estimate 的 canonicalization 与 V1 完全相同。destination 规则：

```text
inbox   -> exact {kind:"inbox"}
project -> exact {kind:"project",projectId:<opaque exact ID>}
```

不把 Project name、folder、status、query timestamp、UI label 或 warning 写入 canonical payload。它们是易变 read facts，不应改变同一 mutation intent 的 fingerprint。

### 7.2 Namespace

```ts
CREATE_TASK_V2_FINGERPRINT_NAMESPACE = "create_task:v2";
```

必须测试：

- 相同业务字段的 V1 与 V2 hash 不同；
- V2 Inbox 与任一 Project hash 不同；
- 两个不同 Project ID hash 不同；
- 同 Project ID、等价 offset datetime、omitted/default canonical values hash 相同；
- JSON field order 由固定对象构造保证，不能 fingerprint 原始 args。

### 7.3 V1/V2 Ledger 连续性

永久 tombstone 不能因协议升级失效。Phase 2B 不得简单切换到新的独立 state directory 或新的 key-hash namespace，否则一个 V1 key 在部署后可能被当作全新 key 再次写入。

建议：

- 继续使用现有 Ledger state directory 与现有 key index hash；
- 新请求的 `payloadHash` 使用 `create_task:v2` canonical fingerprint；
- 遇到同 key 的 V1 record 时，V2 payload hash 不同，返回 `idempotency_conflict`，绝不创建；
- 跨部署透明 retry 最坏是安全冲突，不是重复写入；
- 不删除、重写或迁移掉现有 verified/outcome-unknown/verification-failed tombstone；
- 如果未来要重命名 `create-task-v1` directory 或 key hash namespace，必须先设计原子迁移与双读，另行评审。

## 8. Project discovery、resolve 与 validation

### 8.1 Agent discovery contract

Project 目标必须来自本次用户意图相关的真实 read Tool 结果。推荐流程：

```text
用户明确要求创建到某 Project
  -> get_project({name:<exact name>}) 或已有真实 read result
  -> 若 not_found/ambiguous/query_failed，停止并澄清
  -> get_project({id:<returned canonical id>}) 做 exact refresh
  -> 向用户展示 Project name + canonical ID/区分上下文
  -> create_task(destination={kind:"project",projectId:<same id>})
```

Snapshot 中返回的 Project ID 可以作为 discovery 候选，但 mutation 前仍应调用 `get_project({id})` 获取 exact current ProjectView。不得从历史聊天、缓存、名称文本或猜测构造 ID。

### 8.2 Internal `resolveProjectById`

Phase 2B 新增 internal resolver，不调用 public Tool handler：

```ts
type ProjectDestinationResolution =
  | {
      success: true;
      project: {
        id: string;
        name: string;
        kind: "standard" | "single_actions";
        rawStatus: "Active" | "OnHold" | "Done" | "Dropped";
        ancestorFolderDropped: boolean;
      };
    }
  | {
      success: false;
      reason:
        | "not_found"
        | "ambiguous_canonical_id"
        | "query_failed"
        | "adapter_failed"
        | "schema_drift"
        | "ancestor_state_unknown"
        | "canonical_id_mismatch";
    };
```

约束：

- input 只有 `projectId`；
- query filter 只按 ID；
- output ID 必须 exact equality；
- limit 至少能识别 0/1/>1；
- fixed fields 至少包含 canonical ID、name、kind、raw status、ancestor Folder dropped fact；
- 无法读取 ancestor 状态时失败，不把 unknown 当作 false；
- 不接受 name locator，不复用 fuzzy query，不缓存为写入事实。

### 8.3 `validateProjectDestination`

```ts
function validateProjectDestination(
  requestedId: string,
  resolution: ProjectDestinationResolution,
): ValidatedProjectDestination;
```

只有以下情况返回成功：

```text
resolution.success === true
project.id === requestedId
project.rawStatus === Active
project.ancestorFolderDropped === false
```

OnHold、Done、Dropped、ancestor Dropped、not_found、ambiguous、query failure、Adapter failure、Schema drift、ancestor unknown 与 canonical mismatch 全部 fail closed。validation 不修改 Project，不唤醒 On Hold Project，不移动目标，也不尝试名称替代。

Fail closed 不等于全部永久消耗 key：

- `not_found` 与明确 inactive 状态返回确定性错误并写 terminal prewrite tombstone；
- `ambiguous_canonical_id`、`query_failed`、`adapter_failed`、`schema_drift`、`ancestor_state_unknown`、`canonical_id_mismatch` 返回 `project_validation_failed`，记录 `retryable_validation_error`，允许同 key + 同 payload 重试；
- stable reason 必须贯穿 resolver result、public error detail、audit result code 与测试断言；不得只保留笼统 `project_validation_failed`。

## 9. `createTaskInProject` primitive 与 JXA 边界

### 9.1 独立 primitive

新增严格 primitive：

```text
src/tools/primitives/createTaskInProject.ts
src/utils/omnifocusScripts/createTaskInProject.js
```

它与 `createInboxTask` 并列，不包装或调用 `addOmniFocusTask`。两者可复用纯数据 property builder 和 `SafeJxaExecutor`，但不能抽象成支持 name/parent/Tag 的万能 placement engine。

输入只包含 canonical business payload 与 canonical `projectId`；不包含 Project name、parent、Tag 或 fallback mode。

### 9.2 JXA 内最后一刻验证

JXA 必须在创建对象前完成：

```text
1. 打开 defaultDocument；
2. 按 Project root-task canonical ID exact 查找；
3. 证明恰好一个匹配；
4. 读取 Project raw status；
5. 逐级检查 ancestor Folder 没有 Dropped；
6. 再次比较 canonical root-task ID；
7. 紧接着创建并 push 到该 Project；
8. 返回 taskId 与实际 canonical projectId。
```

禁止：

```text
lookup by Project name
lookup by partial ID
first match without cardinality check
catch -> Inbox
Project invalid -> InboxTask
parent.tasks placement
Tag lookup/create/add
使用 shell
把 payload 插入 JXA source
```

JXA 结构化失败至少区分：

```ts
type CreateTaskInProjectResult =
  | { success: true; taskId: string; projectId: string }
  | {
      success: false;
      phase: "prewrite" | "postcreate" | "unknown";
      taskId?: string;
      errorCategory:
        | "project_not_found"
        | "project_not_active"
        | "project_validation_failed"
        | "postcreate_failure"
        | "unknown";
      reason?:
        | "not_found"
        | "on_hold"
        | "done"
        | "dropped"
        | "dropped_ancestor"
        | "ambiguous_canonical_id"
        | "ancestor_state_unknown"
        | "canonical_id_mismatch";
    };
```

只有 JXA 明确证明 Task 尚未创建的 Project failure 才能作为 prewrite。errorCategory 与 reason 的组合必须是固定 allowlist，未知组合拒绝。timeout、abort、empty/mixed stdout、malformed JSON 或 task ID 缺失继续按 outcome unknown 处理。

### 9.3 必须先完成的 capability probes

Phase 2B 写代码前或最早实现提交中必须用只读/静态探针确认：

| Probe | 必须证明 | 失败处理 |
|---|---|---|
| canonical ID parity | Scripting Bridge/JXA 能取得与 `get_project.project.id` 完全相同的 root-task ID | 停止 Phase 2B |
| exact cardinality | ID lookup 能可靠区分 0/1/>1 | 停止或 prepare/commit |
| status mapping | Active/OnHold/Done/Dropped 在写 primitive 环境中可稳定识别 | 停止 Phase 2B |
| ancestor Folder | 能逐级识别 Dropped ancestor；unknown 不被当作 active | 停止 Phase 2B |
| Project insertion | Task 能直接加入指定 Project 且返回 task ID/project ID | 只在批准的隔离/生产 Canary 中验证 |
| no fallback | 所有 invalid Project 分支均在构造 Task 前返回 | 静态 source + mock executor + Canary 证明 |
| direct parent | Project 顶层 Task readback 的 `hierarchy.parentId === null` | 不满足则重新评审 Task hierarchy contract |

不能用 `get_project` 的成功来推定 Scripting Bridge 写入 API 一定使用同一 ID/status namespace；两条执行路径必须实测对齐。

## 10. Service 执行顺序

### 10.1 总体流程

```text
strict public parse
  -> full V2 parse / canonicalize / fingerprint
  -> resolve effective idempotency key
  -> global create_task flag gate
  -> project-specific flag gate when destination.kind=project
  -> global mutation lock
  -> read existing Ledger record
  -> replay/conflict handling；retryable_validation_error 仅允许同 payload revalidation
  -> new key: reserve keyHash + payloadHash（尚未 write_started）
  -> resolveProjectById + validateProjectDestination (Project only)
  -> retryable validation failure: retryable_validation_error + audit
  -> deterministic not_found/inactive: terminal prewrite tombstone
  -> valid destination
  -> Ledger write_started
  -> createInboxTask OR createTaskInProject (never fallback)
  -> trusted JXA project validation prewrite failure: retryable_validation_error
  -> untrusted executor outcome: outcome_unknown
  -> persist task_created(taskId)
  -> exact Task readback
  -> optional current Project state read for Project destination
  -> verify properties + placement; report later Project state separately
  -> verified or verification_failed/partial_success
  -> compact V2 response
```

新 key 必须在 resolver 前 reserve keyHash + payloadHash，但不得进入 `write_started`。这样：

- 临时 read validation failure 能保留稳定 reason 和 payload binding，却不永久消耗 key；
- 同 key + 不同 payload 在 validation retry 时仍冲突；
- 同 key 并发仍由 global lock 串行；
- 可信 not_found/inactive 结论转为 terminal tombstone；
- valid destination 在进入 executor 前完成 `reserved -> write_started`；
- 进程若在 `reserved` validation window 崩溃，恢复后按“确定无写入”的 retryable validation 处理，而不是 outcome unknown。

### 10.2 Feature flags

保留：

```text
OMNIFOCUS_CREATE_TASK_ENABLED=true
```

冻结新增：

```text
OMNIFOCUS_CREATE_TASK_PROJECT_ENABLED=true
```

规则：

- 全局 flag 不是精确 `true`：所有 destination 在 Ledger/lock/read/JXA 前 `write_disabled`；
- Project flag 不是精确 `true`：Project destination 在 Ledger/lock/read/JXA 前 `write_disabled`；
- Inbox destination 不受 Project-specific flag 影响；
- Project flag 不得隐式默认 true；
- 关闭 Project flag 不改变 Tool 数量，也不启用其他 mutation。

这样 Project placement 可以独立停止，而不必永久关闭已经验收的 Inbox V2 创建；Schema 切换/Refresh 期间仍应先关闭全局 flag，确保客户端验收零写入。

必须用依赖 spy/临时 state directory 证明不可达顺序：

```text
Project flag=false
  -> resolver 未调用
  -> Ledger initialize/read/reserve 未调用
  -> global mutation lock 未创建
  -> JXA executor 未调用

global flag=true + Project flag=false + destination=inbox
  -> Inbox V2 继续按原门禁正常可用
```

### 10.3 无 fallback dispatch

```ts
switch (canonical.destination.kind) {
  case "inbox":
    return createInboxTask(canonical);
  case "project":
    return createTaskInProject(canonical);
}
```

Project 分支的任何异常都必须在该分支内结束。不得在 `catch`、not_found、status failure 或 primitive error 后调用 `createInboxTask`。

## 11. Readback 与 verifier

Project success 至少验证：

```text
actual.id === primitive taskId
actual.kind === action
actual.location.inInbox === false
actual.project !== null
actual.project.id === requested projectId
actual.hierarchy.parentId === null
name/note/date/flag/estimate === canonical expected
```

Project name 不参与 expected equality；它从实际 readback 投影到 compact output。Project 在同一 ID 下改名不等于换目标。

placement verification 与 destination current eligibility 必须分开：

- 实际 Inbox placement、不同 Project ID、非 null parent 或 Task 属性差异，表示落位/字段没有满足请求，返回 `partial_success`、`mayHaveWritten=true`、`retrySafe=false`；
- exact Task readback 已满足上述全部 placement 条件时，Task 创建与落位已经成功；
- 此后 exact Project current-state read 若发现 OnHold/Done/Dropped/Dropped ancestor，返回 `success=true` + `project_state_changed_after_creation`；
- 此后 Project current-state read 若暂时失败，返回 `success=true` + `project_state_unverified_after_creation`；
- warning 必须明确 Task 已经创建到请求的 canonical Project，禁止模型再次 create。

post-write Project read 是 race visibility，不是 placement 成功的第二个必要条件。它不能把用户在创建后立即改变 Project 状态误报为“任务未创建”。

Task readback not_found、query failure、Adapter/Schema drift 返回 `verification_failed`。达到 `write_started` 后且无法证明是否创建/落位的任何不确定结果都永久 tombstone。

## 12. 幂等、并发与 replay

### 12.1 同 key 行为

| 场景 | 结果 |
|---|---|
| 同 key、同 V2 payload、verified、窗口内 | 按 task ID readback；不重新 validate destination 后再写 |
| 同 key、Inbox 改 Project | `idempotency_conflict` |
| 同 key、Project A 改 Project B | `idempotency_conflict` |
| 同 key、V1 record 与任一 V2 payload | `idempotency_conflict`；不写 |
| 确定性 Project not_found/inactive | terminal tombstone；修正后需新的用户授权与新 key |
| server resolver 临时失败 | `retryable_validation_error`；同 key + 同 payload 可重试 |
| JXA structured validation prewrite failure | `retryable_validation_error`；同 key + 同 payload 可重试 |
| write_started/outcome_unknown | duplicate/outcome unknown；不写 |
| verified target Task 被删除 | `replay_target_unavailable`；不写 |

`project_validation_failed` 永远不进入永久 tombstone。

### 12.2 Retryable no-write state

V2 Ledger 可新增非 terminal state：

```text
retryable_validation_error
```

用途仅限两类已证明未写入的验证故障：

1. server resolver 在 `write_started` 前返回 stable validation reason；
2. executor 已启动，但受信 JXA result 明确给出 `phase=prewrite`、stable validation reason、无 task ID，且静态/单元测试证明 Task constructor/push 尚未执行。

规则：

- 保留 keyHash + payloadHash + stable resultCode，不保存 Project ID/name；
- 同 key、同 payload 的下一次调用先重新执行 Project validation，成功后才允许 `retryable_validation_error -> write_started`；
- 同 key、不同 payload 仍是 `idempotency_conflict`；
- `reserved` validation window 崩溃恢复为 `retryable_validation_error`，因为 executor 尚未启动；
- 任一 malformed output、timeout、abort、未知 phase 或“可能已调用 constructor/push”的错误不能进入该 state，必须 `outcome_unknown`；
- 它不是永久 tombstone，但也不能通过普通 TTL 删除后把 key 当作无历史新 key；实施时必须明确重试转移与 crash recovery tests。

### 12.3 锁与 TOCTOU

- 继续使用同一全局 mutation lock，Inbox 与 Project 创建互相串行；
- server-side resolver、JXA create 和 readback 都在锁内完成；
- 外部用户仍可能在验证与创建之间修改 Project，无法形成跨 OmniFocus/Ledger 事务；
- JXA 内 adjacent revalidation 缩小窗口；post-write readback 暴露剩余 race；
- 不以重试或 fallback 掩盖 race。

### 12.4 replay 不触发新写入验证

verified replay 只按已存 task ID 读取当前状态，不再次调用 Project primitive，也不因 Project 后来 inactive 而创建替代 Task。若当前 Task location 已变化，返回 current state + `replayed_current_state_changed` warning；若不可读则 `replay_target_unavailable`。

## 13. 隐私与审计

V2 保持现有 Canary audit 六字段 allowlist：

```text
correlationId
requestMetadataHash
argsIdempotencyKeyHash
effectiveKeyHash
resultCode
elapsedMs
```

`resultCode` 使用 privacy-safe 稳定组合值，例如：

```text
project_not_active.on_hold
project_not_active.dropped_ancestor
project_validation_failed.query_failed
project_validation_failed.adapter_failed
project_validation_failed.schema_drift
project_validation_failed.ancestor_state_unknown
project_validation_failed.ambiguous_canonical_id
project_validation_failed.canonical_id_mismatch
```

稳定 reason 必须来自固定 enum，不能包含底层 exception text、Project ID/name 或 query payload。public error detail 可以返回同一 reason；terminal Ledger record 保存同一 compact result code。无 Ledger record 的 retryable validation failure 仍可由 audit 诊断。

不得新增到日志/audit/Ledger：

```text
Task name or note
Project name
raw Project ID
destination object
full Tool args
raw request metadata/key
JXA source or payload
Project read result
verification TaskView
```

Ledger 继续只保存 key hash、V2 payload hash、state、可选 task ID、result code 与时间。Project ID 只通过 payload hash 间接绑定，不单独落盘。

成功 response 可以返回用户刚授权的 Task 内容和 exact readback Project ID/name；这是客户端业务结果，不是 server log。错误 response 的 verification diff 应只包含必要 expected/actual placement 字段，生产日志不得原样记录该 response。

## 14. Agent routing 与客户端确认 UI

### 14.1 Instructions

Phase 2B 必须把当前 Inbox-only guidance 改为：

- 默认仍是读取与分析；
- 只有用户明确要求创建一个 OmniFocus Task 才可调用；
- Inbox 必须显式发送 `{kind:"inbox"}`；
- Project 必须先通过真实 read Tool 获得 canonical ID，再 exact refresh；
- Project request 不得省略 destination 后创建 Inbox；
- not_found、ambiguous、inactive 或 unreadable 必须停止；
- 不支持 parent、Tag、batch、repeat、notification、update/delete；
- 不要求用户提供 idempotency key；模型为新意图生成 UUID，透明 retry 复用。

### 14.2 路由矩阵

| 用户表达 | 期望 |
|---|---|
| “在 Inbox 创建任务 X” | `destination.kind=inbox` |
| “在项目 P 创建任务 X” | 先 read P；单一 Active exact result 后使用 returned ID |
| “在项目 P 创建任务 X”，P 重名 | 展示候选/澄清；不创建 |
| P 为 On Hold/Done/Dropped | 拒绝 Project create；不回落 Inbox |
| P 不可读或 ID 过期 | 报错并停止；不猜测 |
| “创建到 P，找不到就 Inbox” | 不执行 fallback；要求用户选择一个明确目标 |
| “创建到 P 的子任务并加 Tag” | 说明 Phase 2 不支持；不得删掉 unsupported 部分后创建 |
| statement/planning/recommendation | 不调用 mutation |

Agent eval 延续 Phase 1 的零 write false-positive 门槛，并新增：错误 Project 场景 Inbox fallback 次数必须为 0。

### 14.3 单阶段 UI 硬门槛

`destination` 只有 Project ID，服务端不能在 mutation 前生成可信的人类可读 preview。客户端目标展示是 Phase 2B 能否保持单阶段的最大实际阻断项，也是生产 Canary 之前的决定性门槛。

单阶段只有同时满足以下条件才成立：

1. 模型在调用 Tool **紧邻之前** 明确复述目标 Project name；
2. 若存在同名或层级歧义，复述必要的 Folder path、Project kind 或其他**真实只读返回**的区分信息；
3. 复述的 canonical ID 与即将发送的 `destination.projectId` 完全相同；
4. 客户端确认界面能让用户可靠地把该复述与本次 Tool 调用关联，而不是只显示孤立 opaque ID；
5. 用户能在确认前识别“目标 Project 错了”并取消。

仅仅满足“模型之前调用过 `get_project`”不构成 UI gate 通过；早先的 read result、隐藏的 Tool state 或模型内部记忆都不能代替紧邻调用的明确目标复述。

当前 `get_project` 只有 immediate Folder，不保证能形成完整 path。真实 read output 无法提供足够区分信息时，模型不得猜 path 或把 opaque ID 当作人类可辨识上下文；该场景直接判定单阶段失败。

Phase 2B 禁写验收必须实际记录：

- UI 是否显示这是 Project placement，而不是普通 Inbox create；
- UI 是否显示明确 Project name，或能把 name 与 canonical ID 关联；
- Tool 调用前是否紧邻复述 Project name 与必要 Folder/类型区分信息；
- 同名 Project 是否有足够区分上下文；
- 用户是否能在确认前发现错 Project；
- Refresh 后是否展示 V2 destination union。

只要真实禁写验收发现 UI 只显示难以理解的 opaque ID、隐藏 destination、无法区分同名 Project、不能把紧邻复述与本次调用可靠关联，或模型没有紧邻复述目标，单阶段条件立即失败。不得继续生产 Canary，也不得增加不可信 `projectName` 参数冒充授权；必须升级 prepare/commit，由 prepare 返回 server-resolved Project name/ID/status 和 payload hash，再由 commit 消费短期 token。

## 15. 测试矩阵

### 15.1 Schema 与 wire contract

- destination required；
- Inbox object 只有 `kind`；
- Project object 只有 `kind` + `projectId`；
- Project ID 与读侧 canonical entity ID Schema 使用同一 fixture/contract；空值和 wrong type 拒绝；
- 不存在只由写侧维护的任意 max length/format rule；若统一 Schema 增加边界，所有读写 consumer 同步测试；
- `projectName`、`name` locator、parent、Tags、repeat、notification、batch、extra fields 拒绝；
- nested objects `additionalProperties=false`；
- public key required，internal stable metadata path 仍独立门控；
- InMemoryTransport `tools/list` 显示完整九字段、destination union、required list；
- `personal-production` 仍精确五 Tool、零 Resources；`upstream-full` 不新增 `create_task`。

### 15.2 Canonicalization/fingerprint/Ledger

- V1/V2 namespace separation；
- Inbox/Project 与 Project A/B separation；
- defaults/date offset equivalence；
- V1 tombstone 遇 V2 retry 不写；
- 同 key 改 destination conflict；
- trusted not_found/inactive 产生 terminal tombstone；
- query/Adapter/Schema/ancestor unknown 在 `write_started` 前进入 `retryable_validation_error`，同 key + 同 payload retry；
- structured JXA prewrite validation failure 进入 `retryable_validation_error`，同 key + 同 payload retry；
- retryable state 的 different payload conflict、crash recovery、非法 transition；
- `reserved` validation-window crash 恢复为 retryable，不误判 outcome unknown；
- replay/outcome_unknown/concurrent global lock 行为不回归；
- 旧 Ledger checksum/record 可读，不能因升级创建空 state。

### 15.3 Resolver/validator

- canonical root-task ID exact success；
- OmniJS native Project ID rejected as canonical target；
- zero/one/multiple result；
- Active standard/single_actions allowed；
- OnHold/Done/Dropped rejected；
- Active + Dropped ancestor rejected；
- ancestor unreadable -> `project_validation_failed.ancestor_state_unknown`，同 key retry；
- query/Adapter/Schema drift 使用各自 stable reason，同 key retry；
- ambiguous/canonical mismatch 使用 stable reason，不选择目标；
- name resolver 不存在于 mutation path；
- no cache used for final validation。

### 15.4 Primitive/JXA static and unit tests

- payload 使用 epoch milliseconds 和 exact projectId；
- source 不含 Task content；
- source 不含 Project name/parent/Tag/fallback；
- exact canonical ID + cardinality + raw status + ancestor check 在 Task constructor/push 前；
- Active Project success typed result；
- not_found/inactive/validation failure 是 structured prewrite；
- postcreate/unknown/malformed process result 保留 may-have-written；
- SafeJxaExecutor 仍使用 `execFile`、0600、timeout、buffer cap、strict JSON；
- no call path reaches `createInboxTask` from Project failure。
- Project flag=false 时 resolver、Ledger、lock path、executor 全部未触达；
- 同一环境下 Inbox V2 service 仍可正常执行。

### 15.5 Service/verifier

- Inbox V2 回归；
- Active Project create/readback success；
- Task project ID exact，inInbox false，parent null；
- Project changed/disappeared between resolver and JXA；
- Project changed status between JXA and readback；
- wrong Project、Inbox placement、parent placement -> partial_success；
- exact placement + Project 后续 inactive -> success + `project_state_changed_after_creation`；
- exact placement + post-write Project read failure -> success + `project_state_unverified_after_creation`；
- task ID missing/readback not_found/query/schema failure；
- Project name rename with same canonical ID remains correct and returns current name；
- error/response/log privacy spies；
- all may-have-written errors retrySafe false。

### 15.6 Agent/client acceptance

- explicit Inbox create；
- explicit Project create from exact read result；
- no prior read result；
- same-name ambiguity；
- immediate Folder/kind 仍不足以区分目标时直接升级，不猜完整 path；
- On Hold/Done/Dropped target；
- Project request with missing destination；
- unsupported parent/Tag combined request；
- planning/statement false-positive；
- Tool 紧邻调用前复述 Project name 与必要 Folder/kind 区分信息；
- confirmation UI 能把该复述与本次 opaque ID 调用可靠关联；
- 仅有 earlier `get_project`、无紧邻复述时 gate 失败；
- Refresh 后 raw wire Schema 与模型 args；
- Retry 使用同一 key、同一 destination；
- Project failure Inbox fallback count=0。

## 16. 禁写部署、Canary 与回滚

### 16.1 Phase 2B 之前

Phase 2A 评审通过不等于允许实施或部署。进入 2B 前必须由用户单独明确授权。

### 16.2 建议部署顺序

```text
1. 完成全部 unit/contract/build/diff gates；不部署
2. 用户批准 deployment window
3. fail closed：全局 OMNIFOCUS_CREATE_TASK_ENABLED=false
4. 部署 V2 build，Project-specific flag=false
5. protocol 验证精确五 Tool、零 Resources、完整 strict V2 Schema
6. App Refresh
7. 禁写 UI/routing/Schema/privacy/retry 验收
   - 若模型未紧邻复述可辨识目标，或确认界面无法把复述与本次 opaque ID 调用关联：立即停止单阶段并转入 prepare/commit；不得进入第 8 步
8. 恢复 global=true，但保持 Project-specific=false；验证 Inbox V2 回归
9. 用户独立批准单个 Project production Canary
10. 临时/正式开启 Project-specific=true
11. 创建唯一最小字段 Task 到一个预先选定的 Active Project
12. ID readback + Project ID/name + parent null + Ledger/audit/lock 验证
13. 用户人工确认并删除 Canary Task
14. Task ID/name not_found；Project 本身未被修改
15. 用户决定正式保持 Project-specific=true 或回到 false
```

禁写 Canary 期间任何 Ledger/lock/JXA/Project read after `write_disabled` 都是阻断问题。Project production Canary 不得创建/修改 Project，也不得用 Inbox 作为替代目标。

### 16.3 停止门槛

任一条件立即停止开启 Project placement：

- wire Schema 缺 destination/required/additionalProperties 约束；
- 模型未在 Tool 紧邻调用前复述 Project name 与必要区分信息；
- UI 不能把该复述与本次 opaque ID 调用可靠关联；
- 模型使用 name、猜 ID 或漏传 destination；
- retry 改变 key 或 destination；
- resolver/JXA canonical ID 不一致；
- On Hold/Done/Dropped/ancestor Dropped 被接受；
- Project failure 触发 Inbox write；
- task readback Project ID/parent 不一致；
- duplicate、outcome unknown、privacy leak、Ledger/checksum/permission/lock 异常；
- Tool 数量、Resources 或其他 mutation surface 发生变化；
- health/readiness/watchdog 异常。

### 16.4 回滚

优先级：

1. 立即设 Project-specific flag=`false`，保留 Inbox V2；
2. 若 V2 Schema/handler 本身不可信，设 global flag=`false`；
3. 恢复已验证 build/Schema，并要求 App Refresh；
4. 保留所有 V1/V2 Ledger tombstone，不清空 state；
5. 对 may-have-written Task 按 task ID 人工核查，不自动 delete/move/recreate；
6. 不通过切回 upstream `add_omnifocus_task` 规避问题。

## 17. 建议原子提交序列（未来 Phase 2B）

每个提交都必须保持 build、unit tests、`git diff --check` 绿色，且不得包含 Tunnel、plist、日志、Ledger、audit、lock 或仓库外控制器。

1. `docs: accept create_task phase 2 project placement design`
   - Phase 2A 设计；必要时单独 ADR amendment；不改 runtime。
2. `feat: add create_task v2 contracts and project validation`
   - 新增未发布的 V2 Schema/canonicalizer/fingerprint/resolver/validator/tests；生产注册仍使用 V1。
3. `feat: add guarded project task creation primitive`
   - Project-specific flag、JXA primitive、service/verifier、Ledger compatibility 与 unit tests；仍不发布 V2 Schema。
4. `feat: publish controlled project placement for create_task`
   - 切换 strict V2 wire Schema、description、Instructions、精确五 Tool tests；部署时默认 Project flag false。
5. `docs: record create_task phase 2 production acceptance`
   - 只记录禁写 Refresh、Canary、cleanup、回滚与最终 flag 证据。

如果实现拆分无法让中间提交保持未发布、不可达且测试绿色，应重新调整提交边界，不能留下短暂 fail-open commit。

## 18. Phase 2B 准入门槛

以下设计决定已由本轮评审输入明确冻结：

- [x] explicit required destination union；
- [x] `CanonicalCreateTaskPayloadV2` 与 `create_task:v2`；
- [x] V1/V2 共用 Ledger key index 并保留 tombstone 连续性；
- [x] Active 包含“无 Dropped ancestor Folder”；
- [x] canonical ID Schema 与读侧共享，不建立任意写侧格式/长度规则；
- [x] Project-specific fail-closed flag；
- [x] `resolveProjectById` 与 `validateProjectDestination` 只接受 ID；
- [x] `createTaskInProject` 不复用 upstream primitive、无 name/parent/Tag/fallback；
- [x] placement verification 与 post-write Project current eligibility 分离；
- [x] `project_validation_failed` 不永久消耗 key，并保留 stable reason；
- [x] UI 紧邻目标复述与 prepare/commit 升级条件。

以下仍是另行进入 Phase 2B 前的门禁：

- [ ] canonical ID parity/status/ancestor probes 有可执行验收方案；
- [ ] strict MCP wire Schema 与 SDK 1.29 probe 冻结；
- [ ] 禁写、生产 Canary、停止与回滚门槛冻结；
- [ ] 用户另行明确授权进入 Phase 2B。

## 19. 强制升级 prepare/commit 的条件

出现以下任一项，Phase 2B 单阶段设计失效：

```text
Project name resolution 进入 mutation server
同名/多候选需要 server 选择
多 Project 或 batch
parent placement
Tag 或其他附加实体选择
复杂 recurrence / notification / transformation preview
客户端确认 UI 无法展示明确目标
需要 server-signed proof 证明 ID 确实来自 discovery
目标在 prepare 与 write 间需要用户再次确认
风险或权限范围超过单 Active Project ID
```

prepare 至少应返回 server-resolved Project name、canonical ID、status、canonical payload hash、短期 expiry 和一次性 token；commit 只能消费未过期且 payload/destination 完全匹配的 token。该协议不在本 Phase 2A 文档中展开，也不应在未触发升级条件时预先混入 Phase 2B。

## 20. 本次停点

本文件完成后停在 Phase 2A 评审门：

- 不修改 `src/**`；
- 不修改 Tool registration、Instructions、Profile 或 Schema；
- 不调用任何 mutation Tool；
- 不修改 `OMNIFOCUS_CREATE_TASK_ENABLED`；
- 不新增或启用 Project-specific flag；
- 不部署、不 Refresh、不运行生产 Canary；
- 不重启 Tunnel、LaunchAgent 或 watchdog；
- 不 stage、commit 或 push。

下一步只能是用户评审本设计并明确选择：批准 Phase 2A、要求修订，或触发 ADR amendment。未经明确批准不得开始 Phase 2B。
