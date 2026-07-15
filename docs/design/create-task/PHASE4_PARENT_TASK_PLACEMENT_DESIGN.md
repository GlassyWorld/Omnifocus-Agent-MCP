# `create_task` Phase 4：ordinary parent Task placement 架构设计

> 状态：P4-A 至 P4-E 全部通过；ordinary Parent placement 已正式启用（2026-07-15）<br>
> 当前生产基线：`create_task` V4；global/Project/Tag/Parent=`true/true/true/true`；精确六 Tool、Resources absent<br>
> 本文件授权：代码/读侧能力审计、风险评审、只读 capability probe 方案、单阶段 vs prepare/commit 决策矩阵、未来实现验收门禁<br>
> 本文件本身不授权：边界外 OmniFocus 对象创建/修改/删除、额外 Canary、commit 或 push
> 评审状态：P4-A3、P4-B、P4-C、P4-D 与 P4-E PASS。Parent 在本文冻结边界内正式启用。

## 1. 目标

Phase 4 只考虑为 `create_task` 新增一个独立 destination：在一个 freshly-read exact canonical ordinary parent Task 下创建一个全新 child Task。

目标能力：

- 用户明确要求创建一个新 Task，并明确选择一个已读到的 existing parent Task；
- mutation payload 只接受 canonical parent Task ID，不接受 parent name、path、模糊匹配、猜测 ID 或 fallback；
- parent destination 与 Inbox、Project destination 互斥；
- 写入前重新验证 parent identity、kind、direct/effective completion/drop 状态、parent-chain integrity、containing Project / Folder eligibility；
- 写入后 exact readback 验证新 Task 的 parent、Project context、字段、Tag set（若带 Tag）与请求一致；
- 继续复用已验收的 explicit destination、idempotency Ledger、global mutation lock、audit allowlist、fail-closed gates、strict schema 和 no-shell JXA 约束；
- 在实现前用真实只读 probes 证明 OmniFocus read-side 可以稳定提供 parent 所需事实。

## 2. 非目标

Phase 4 不包含：

- 对 existing Task 的 edit、move、reparent、complete、delete；
- batch create；
- repeat、notification；
- Project、Folder、Tag 创建或编辑；
- existing Task Tag edit；
- generic mutation executor、generic placement resolver、generic prepare token；
- parent-capable edit/move primitive；
- parent name resolver、path resolver、natural-language resolver；
- Inbox 或 Project fallback；
- hierarchy cycle/reparent validation。创建一个全新 child 本身不形成 cycle；cycle validation 属于未来 move/reparent existing Task。

如果用户请求“把已有任务移到某 parent 下”“重新整理层级”“完成/删除/移动”等，本 Phase 4 仍必须拒绝或要求未来独立授权，不能把请求改写成创建 duplicate child。

## 3. 当前权威边界审计

### 3.1 ADR 和状态页

ADR-006 已接受 Phase 4 amendment：

- ordinary parent Task placement 继续暂缓；
- 仅在 T2 稳定运行后进入独立设计、风险评审与授权；
- Parent 是独立 destination，和 Project destination 互斥；
- 只接受 freshly-read exact canonical parent Task ID；
- 写前必须重新验证 parent identity、kind、direct/effective completion/drop、parent-chain integrity、containing Project / Folder eligibility；
- prepare/commit 只是优先评估方案，不是已决定实现；
- 不扩展为 CRUD 或 generic mutation executor；
- T2 不得预建 parent-capable runtime。

`docs/PROJECT_STATUS.md` 和 `docs/design/create-task/README.md` 记录当前生产事实：

- `personal-production` 精确六个 Tool，Resources absent；
- 唯一 mutation 仍为 `create_task`；
- 当前公开写入只限 Inbox 或一个 exact Active Project，可选 1-5 个 freshly discovered Active Tag IDs；
- parent、existing Task Tag edit、Tag CRUD、batch、repeat、notification、update/delete 仍未授权。

### 3.2 当前代码表面

Phase 4 初始审计时，`create_task` runtime 是 V3 public contract，但 no-tag canonical payload 仍使用 V2 destination model：

```ts
destination:
  | { kind: "inbox" }
  | { kind: "project"; projectId: string }
```

当前 `CREATE_TASK_FINGERPRINT_NAMESPACE` 为 `create_task:v2`。Tagged intent 通过 Tag-specific schema/canonicalizer 使用独立 tagged fingerprint，不改变 no-tag V2 hash。Phase 4 不能把 parent 混入 V2 fingerprint；必须版本化为新的 parent-aware semantic namespace。

当前 `verifyCreatedTask` 只识别：

- Inbox：`actual.project === null` 且 `actual.hierarchy.parentId === null`；
- Project 顶层：`actual.project.id === requestedProjectId` 且 `actual.hierarchy.parentId === requestedProjectId`。

`taskPlacementSemantics.ts` 明确 Project root Task ID 作为 Project 顶层 child 的 `parentId`，这不是 ordinary parent placement。Phase 4 必须新增独立语义 helper，不能复用 `isTopLevelTaskInProject` 表示普通 parent。

### 3.3 当前 read-side 能力

`get_task` 当前从 `queryOmnifocus` 读取：

- canonical Task ID；
- `taskStatus`；
- direct/effective completion；
- direct/effective drop；
- project name/id；
- Inbox flag；
- `isProjectRoot`；
- `parentId`；
- `childIds`；
- `hasChildren`；
- sequencing；
- repeat、estimate、timestamps 等。

Task Domain 已映射：

- `kind: "action" | "action_group" | "project_root"`；
- `status.completion.direct/effectiveDate/source`；
- `status.drop.direct/effectiveDate/source`；
- `project.id/name | null`；
- `hierarchy.parentId/childIds/hasChildren/sequential/completedByChildren`。

这足以作为 Phase 4 设计起点，但还不足以直接实现 parent placement，因为缺少专用模型和真实探针：

- 当前 `TaskView` 没有 parent chain 列表；
- 当前 `TaskView` 没有 containing Folder ID/path/status；
- 当前 `TaskView` 不区分 “ordinary parent Task” 与 “Project root parent” 的 eligible parent domain；
- 当前 `queryOmnifocus` 的显式 `taskStatus` field mapping 直接返回 `taskStatusMap[item.taskStatus]`，不是 `"Unknown"` fallback；若值不是 string，Task Adapter 会失败；
- 公开 `get_task` 可用于 Agent discovery，但不能承担 Phase 4 mutation authorization resolver；
- `parentId` 使用 optional string，可接受空字符串，Phase 4 parent validator 必须对 canonical ID 更严格；
- `projectId`、`parentId`、`childIds` 的 real API parity、orphan 行为和 schema drift 仍需只读 probes 证明；
- folder ancestry 在 Project resolver 和 JXA primitive 中已有实现经验，但 parent validator 尚未有只读 projection。

Phase 4 prevalidation 必须新增 dedicated fixed-script facts boundary：`readParentTaskFactsById(parentTaskId)`。该 read-only primitive 使用固定 Omni Automation script、`Task.byIdentifier(parentTaskId)`、exact canonical ID roundtrip、parent-chain walk、containing Project、Folder chain、status/completion/drop facts 和 bounded result Schema。它不按名称搜索、不动态生成可执行源码、不复用 discovery cache、不写 Ledger/audit、不把 native objects 返回到 Node；unknown、malformed、cycle、orphan 全部 fail closed。Eligibility 由随后独立的 `validateParentDestination` 决定。

## 4. 威胁模型

### 4.1 错放置

主要风险是用户想创建到 Parent A，但模型或 stale state 将 child 创建到 Parent B、Project root、Inbox，或 parent 已移动/完成/删除后仍写入。

防御：

- parent destination 只接收 exact canonical parent Task ID；
- Tool 调用前必须紧邻复述 parent 名称、kind、Project/Folder context 和必要层级区分；
- server 写前重新读取并验证 parent；
- JXA primitive 在创建前 adjacent revalidation；
- 写后 exact readback 验证 `actual.hierarchy.parentId === requestedParentTaskId`；
- 任何 mismatch 都是 `partial_success`，`mayHaveWritten=true`，禁止自动重试。

### 4.2 TOCTOU

读侧 discovery、客户端确认、server resolver、JXA 创建之间，parent 可能被删除、完成、drop、移动到其他 Project/Folder，或 Project/Folder 状态改变。

防御：

- server-side facts read + eligibility validation 与 JXA 内 revalidation 都必须运行；
- 若状态不可判定，fail closed；
- post-write 可附加 current eligibility warning，但不能用 warning 掩盖 placement mismatch；
- 单阶段方案必须证明客户端 UI 能可靠绑定用户确认和 exact parent ID；否则升级 prepare/commit。

### 4.3 隐私泄漏

parent 名称、Project/Folder path、Task payload、Tag path、raw ID 均可能暴露私密信息。

防御：

- Ledger 只存 key hash、payload hash、状态、task ID、result code、时间，不单独保存 parent ID/name；
- audit 保持脱敏 allowlist，不记录 Task name、parent name/path、Project name/path、raw IDs、payload hash；
- public success response 可返回用户刚授权并需要确认的 compact placement；生产日志不得原样记录；
- acceptance 文档只记录结构化证据，不记录真实个人任务内容。

### 4.4 Capability creep

parent placement 容易被误扩展成 edit/move/reparent 或 hierarchy manager。

防御：

- 不新增 Tool 数量；
- 不建立 generic mutation executor；
- 不接受 existing child/source task ID；
- 只创建一个全新 Task；
- cycle validation 明确不进入 Phase 4；
- unsupported request 不得被降级为 Inbox/Project create。

## 5. Strict wire Schema 与 destination union

若 Phase 4 被批准实现，公开 contract 应版本化为 parent-aware V4：

```ts
destination:
  | { kind: "inbox" }
  | { kind: "project"; projectId: string }
  | { kind: "parentTask"; parentTaskId: string }
```

Schema 约束：

- `destination` 仍 required；
- 每个 variant `.strict()`；
- `parentTaskId` 使用 canonical non-empty OmniFocus ID schema；
- `projectId` 和 `parentTaskId` 不得同时出现；
- 不新增 `parentTaskName`、`parentName`、`path`、`parent`、`projectName`、`folderName`、`confirmed`；
- `tagIds` 仍是独立 optional field，1-5 个 existing Active Tag canonical IDs；
- extra fields 继续拒绝；
- public Tool schema 必须通过 MCP `tools/list` 验证，确认 wire schema 真的包含 three-way union、required list、additionalProperties=false 等约束。

Fingerprint：

- no-parent no-tag Inbox/Project payload 继续保持现有 V2 hash，不能破坏 tombstone replay；
- tagged Inbox/Project 继续保持现有 tagged V3 hash；
- parent no-tag 使用新的 namespace，例如 `create_task:v4:parent`；
- parent tagged 使用新的 namespace，例如 `create_task:v4:parent_tagged`；
- parent ID、destination kind、canonical task fields、sorted unique tag IDs（如有）全部进入 semantic hash；
- warnings、display name/path、fresh read snapshot 不进入 hash。

输出：

```ts
location:
  | { kind: "inbox" }
  | { kind: "project"; projectId: string; projectName: string }
  | {
      kind: "parentTask";
      parentTaskId: string;
      parentTaskName: string;
      projectId: string | null;
      projectName: string | null;
    }
```

若 parent 位于 Inbox，`projectId/projectName` 为 `null`。若 parent 位于 Project，readback 必须同时返回 child 的 `project.id`，用于证明 containing Project 没有漂移。

Phase 4 选择 compact public output：success/replay 中的 current context 仅指 parent name/ID 与 containing Project name/ID。Folder path 和 parent-chain distinction 只用于调用前的 Agent/UI confirmation、server validation 和 privacy-safe diagnostics，不进入 public success output。若 P4-C 前发现仅凭这组字段无法让客户端可靠表达当前 location，必须先修订 Schema；不得在实现中悄悄增加 Folder 或 parent-chain 字段。

## 6. Parent domain model

新增内部只读 facts 模型，不替代公开 `TaskView`。Facts read 与 mutation eligibility 必须是两个独立边界：read 成功只表示当前状态可被可信表达，不表示 parent 当前允许写入。

```ts
type ParentKnownTaskStatus =
  | "Available"
  | "Blocked"
  | "Completed"
  | "Dropped"
  | "DueSoon"
  | "Next"
  | "Overdue";

type ParentStateFacts = {
  taskStatus: ParentKnownTaskStatus;
  completion: { direct: boolean; effectiveDate: string | null };
  drop: { direct: boolean; effectiveDate: string | null };
};

type ParentProjectFacts = {
  id: string;
  name: string;
  status: "Active" | "OnHold" | "Done" | "Dropped";
};

type ParentFolderFacts = {
  id: string;
  name: string;
  status: "Active" | "Dropped";
};

type ParentChainFacts = ParentStateFacts & {
  id: string;
  kind: "action" | "action_group" | "project_root";
};

type ParentTaskFacts = ParentStateFacts & {
  id: string;
  name: string;
  kind: "action" | "action_group" | "project_root";
  project: ParentProjectFacts | null;
  folderChain: ParentFolderFacts[];
  parentChain: ParentChainFacts[];
};

type ParentReadFailureReason =
  | "not_found"
  | "query_failed"
  | "schema_drift"
  | "adapter_failed"
  | "unknown_status"
  | "malformed_id"
  | "canonical_id_mismatch"
  | "parent_chain_unreadable"
  | "ancestor_state_unknown"
  | "parent_chain_cycle"
  | "orphan_parent";

type ParentEligibilityReason =
  | "project_root_not_allowed"
  | "unsupported_parent_kind"
  | "self_completed"
  | "self_dropped"
  | "ancestor_completed"
  | "ancestor_dropped"
  | "project_not_active"
  | "dropped_folder_ancestor";

type ParentValidationReason =
  | ParentReadFailureReason
  | ParentEligibilityReason;

type ParentTaskFactsRead =
  | { success: true; facts: ParentTaskFacts }
  | { success: false; reason: ParentReadFailureReason };

type ParentDestinationValidation =
  | { allowed: true; facts: ParentTaskFacts }
  | {
      allowed: false;
      code:
        | "parent_not_found"
        | "parent_not_allowed"
        | "parent_not_active"
        | "parent_validation_failed";
      reason: ParentValidationReason;
      retrySafe: boolean;
    };
```

Required flow:

```text
prewrite
  -> readParentTaskFactsById(requestedId)
  -> validateParentDestination(requestedId, factsRead)
  -> write only when allowed=true

postwrite / verified replay
  -> read current child
  -> readParentTaskFactsById(currentParentId), when an ordinary parent exists
  -> represent current facts even when parent/Project/Folder is now ineligible
```

`readParentTaskFactsById` must therefore return successfully for a readable completed/dropped parent, a readable parent in an On Hold/Done/Dropped Project, and other known but ineligible states. `validateParentDestination` alone converts those facts into a prewrite rejection. Read failures are reserved for facts that cannot be represented trustworthily, such as lookup failure, malformed/canonical mismatch, unknown enum, schema drift, unreadable ancestry, cycle, or orphan inconsistency.

### 6.1 Eligible parent kinds

Phase 4 首版冻结为只允许 existing `action_group` 作为 parent：

```text
parent.kind === "action_group"
```

普通 `action` 下创建第一个 child 已由官方 API 证明可行，但它会把 existing parent 从 leaf action 隐式变成 action group。这个结构类型变化不进入 Phase 4 首版，留给后续 Phase 4.1 独立授权。

首版错误语义：

```text
action -> parent_not_allowed.unsupported_parent_kind
```

`project_root` 不作为 Phase 4 ordinary parent。Project root placement 已由 `{ kind: "project"; projectId }` 表达，不能通过 `parentTaskId` 变相绕过 Project eligibility 语义。

### 6.2 Status eligibility

Parent 必须满足：

- direct completion false；
- effective completion absent；
- direct drop false；
- effective drop absent；
- `taskStatus` 是已知 active-like status：`Available`、`Blocked`、`DueSoon`、`Next` 或 `Overdue`；
- parent chain 中每一层都不 completed/dropped；
- containing Project 若存在，必须 Active；
- containing Folder chain 若存在，不得 Dropped，unknown 状态 fail closed。

`Blocked` 可以来自 future defer date、sequential 前置任务或 On Hold Tag；它不等同于 completed 或 dropped，因此只要 direct/effective completion/drop 和 ancestry/project/folder checks 都通过，可以作为 eligible parent status。

Unknown / schema drift 策略属于 facts read failure，不属于 ordinary eligibility：

- unknown `taskStatus`：`parent_validation_failed.unknown_status`；
- missing/empty canonical ID：`parent_validation_failed.malformed_id`；
- parent chain read fails：`parent_validation_failed.parent_chain_unreadable`；
- Project / Folder state unreadable：`parent_validation_failed.ancestor_state_unknown`；
- orphan parent facts inconsistent：`parent_validation_failed.orphan_parent`；
- canonical ID mismatch：`parent_validation_failed.canonical_id_mismatch`。

### 6.3 Parent-chain integrity

Phase 4 does not need cycle prevention for the new child, but it must refuse to write into an already-corrupt or unreadable hierarchy.

Required checks:

- `Task.byIdentifier(parentTaskId)` returns an exact object or null, and the object's canonical ID equals requested ID;
- walking `parent` eventually terminates at `null` or a Project root without repeated IDs;
- every parent-chain ID is non-empty and stable during the same read;
- if a Project root appears, its ID equals the containing Project root task ID;
- if `parent.project` / `containingProject` exists, it is consistent with the chain's Project root;
- Inbox parent has no containing Project and no Project root in chain;
- no chain member is completed/dropped/effectively completed/effectively dropped.

If the fixed script cannot expose all facts reliably, Phase 4 stops before runtime implementation.

## 7. Fresh target confirmation 与 TOCTOU

Fresh means all three conditions hold:

1. The parent ID came from a current read-side Tool result in this user intent, not memory or a name guess.
2. Immediately before calling `create_task`, the model restates:
   - parent Task name;
   - parent kind;
   - containing Project name/kind and Folder path when present;
   - relevant parent-chain distinction when same-name parents exist;
   - full Tag paths if `tagIds` are also used.
3. The server revalidates the parent by ID after schema parse and feature gates, before Ledger `write_started`.

A previous `get_task` call alone is insufficient. Hidden model state is not authorization. If the confirmation UI cannot show enough context for the user to catch a wrong parent, single-stage Phase 4 must stop.

TOCTOU handling:

- `readParentTaskFactsById` and `validateParentDestination` run before `write_started`;
- JXA primitive repeats identity/status/chain/project/folder validation immediately before constructing the new Task;
- if the JXA primitive reports deterministic prewrite failure, no child was created;
- if execution reaches `write_started` and result is unknown, Ledger records `outcome_unknown`;
- after success, exact readback validates the child under requested parent;
- if parent moved after creation but child readback remains under requested parent, success may include `parent_state_changed_after_creation` or `parent_state_unverified_after_creation` warning;
- if child is not under requested parent, return `partial_success`, never retry.

Parent semantic identity is the exact parent Task object ID, not the parent name, Project path, Folder path, or discovery snapshot. If the parent moves between server facts read/validation and JXA:

- moved and no longer eligible：primitive prewrite rejects；
- moved but remains eligible and exact ID is unchanged：single-stage ID-only semantics may still create under that parent；
- write succeeds but context changed：return current context plus warning；
- context mismatch is not `partial_success` unless a future prepare/commit token explicitly binds context into authorization.

## 8. 单阶段 vs prepare/commit 决策矩阵

| 维度 | 单阶段 exact-ID `create_task` | `prepare_task_creation` -> `commit_task_creation` |
| --- | --- | --- |
| Tool surface | 仍一个 mutation Tool | 至少新增 prepare/commit 或扩展 protocol，需独立 ADR |
| 客户端 UI | 必须证明能把紧邻复述和 opaque parent ID 绑定到确认 | prepare response 可展示 server-resolved parent facts 和 payload hash |
| Target binding | 模型负责从 fresh read 传 exact ID，server 重新验证 | server 签发短期 token，绑定 parent ID、payload hash、expiry |
| TOCTOU | server/JXA revalidation 缩小窗口，但用户确认与 write 之间仍有漂移 | prepare 后 commit 仍需 revalidation，但 token 防止模型换目标 |
| Idempotency | 继续使用 explicit UUID + V4 fingerprint | commit token 与 idempotencyKey 需双绑定，复杂度更高 |
| Privacy | 不额外持久化 target facts | prepare token store 可能需要保存或签名 target facts，需隐私设计 |
| Replay | verified replay 读原 task ID，不重新 resolve parent | commit replay 需定义 token used/expired 与 task tombstone 的关系 |
| Failure semantics | 复用 Project/Tag 类似 error path | 新增 token expired/mismatch/already used 等错误 |
| Implementation blast radius | 较小，但 UI 证据是硬门 | 较大，且不能做 generic token/executor |
| 适用条件 | single exact parent ID、UI 可辨识、无同名歧义或可由上下文区分 | UI 不能可靠展示/绑定、同名层级复杂、需要 server-generated preview、retry/key 证据不足 |

评审结论：本设计不预设采用哪一种。只有在真实禁写客户端验收证明以下全部成立时，单阶段才可继续：

- Tool UI 或模型紧邻复述能让用户看懂 parent target；
- parent ID 与复述内容可可靠关联；
- retry 保持同一 idempotencyKey 和 same destination；
- unsupported parent request 不会被降级为 Inbox/Project；
- schema 显示 parent destination 且 extra fields 被拒绝。

若任一项失败，停止单阶段，并提交独立 prepare/commit ADR amendment。prepare/commit 也不得设计成 generic mutation token；只能绑定 Phase 4 parent create payload。

Decision timing is staged, not circular:

```text
P4-A1: design revision + source audit
  -> P4-A2: unreachable fixed-script real read-only probe
  -> P4-A3: record privacy-safe read-only acceptance
  -> P4-B: unpublished, unreachable internal implementation
  -> P4-C: publish V4 Schema with Parent flag=false
  -> P4-C Acceptance: disabled App/UI/protocol gate
       UI passes: keep single-stage
       UI fails: stop and design prepare/commit ADR
  -> P4-D: separately approved Canary
  -> P4-E: separately approved formal enablement
```

Therefore single-stage vs prepare/commit is not a prerequisite for P4-B. It is the gate between P4-C and any Canary/enablement.

## 9. Primitive / JXA / service / verifier 语义

### 9.1 最小扩展面

允许新增的最小单元：

- `src/domain/taskCreation/parentDestination.ts`
  - `validateParentDestination`
  - separate facts/read-failure and eligibility result types
  - fixed reason enum
- `src/tools/primitives/readParentTaskFacts.ts` plus fixed read-only JXA
  - `readParentTaskFactsById`
- `src/domain/taskCreation/parentTaskPlacementSemantics.ts`
  - `isTaskUnderOrdinaryParent(task, parentTaskId, containingProjectId)`
  - Project root exclusion helper
- parent-aware canonical payload / fingerprint functions
- parent-specific primitive, e.g. `createTaskUnderParent`
- parent-aware verifier branch inside a dedicated parent service
- parent-specific feature flag helper, disabled by default (P4-C only)
- tests and docs.

不得复用或引入：

- upstream `add_omnifocus_task`；
- `query_omnifocus` name filter as mutation resolver；
- generic placement resolver；
- generic mutation executor；
- edit/move/reparent primitive；
- Project root parent as `{ kind: "parentTask" }` fallback。

Handler routing should avoid polluting the already accepted no-tag and tagged services:

```text
destination.kind === "parentTask"
  -> CreateParentTaskService
     - handles optional tagIds internally

otherwise tagIds present
  -> existing CreateTaggedTaskService

otherwise
  -> existing CreateTaskService
```

This keeps existing Inbox/Project V2/V3 service, primitive, replay, and verifier paths unchanged.

### 9.2 JXA primitive

Parent primitive receives optional `tagIds` and freezes this exact order:

1. receive JSON/Base64 data, not user text interpolated into executable source;
2. strict payload parse and exact-key validation;
3. exact `Task.byIdentifier(parentTaskId)` lookup and canonical ID equality;
4. read and validate parent facts, chain, containing Project and Folder chain;
5. resolve every requested Tag ID when `tagIds` is present;
6. validate each Tag canonical identity;
7. validate each Tag and complete ancestor chain are Active;
8. validate direct-parent mutual exclusion across the requested Tag set;
9. only after all Parent and Tag validations succeed, set `writeStarted=true`;
10. create the child with `const task = new Task(payload.name, resolvedParent);`;
11. set remaining canonical fields;
12. call `task.addTags(resolvedTags)` only when `tagIds` is present;
13. read canonical `taskId` and immediate actual Tag IDs;
14. return `{ success: true, taskId, parentTaskId, projectId: string | null, tagIds?: string[] }`.

The primitive rejects ordinary `action` and Project root parents, defends chain cycle/orphan states, and never falls back to Project root or Inbox. Every deterministic Parent or Tag validation failure must occur before step 9 and return `phase=prewrite` with a null task ID. Parent+Tag is supported in Phase 4 because Tag assignment is already a production V3 capability; the Parent service must preserve existing Tag categories `tag_not_found`, `tag_not_allowed`, `mutually_exclusive_tags`, and `tag_validation_failed` rather than wrapping them as `parent_validation_failed`.

Official API shape has been confirmed for `new Task(name, parentTask)`, so Phase 4 design freezes that as the only write API path. An isolated minimum capability probe is still required before production Canary, but the architecture should not keep `parent.tasks.push(task)` or `parent.children.push(task)` as parallel candidates.

### 9.3 Service and Ledger

Handler gate order must stay capability-specific and fail closed before facts reader/Ledger/lock/JXA:

1. strict schema parse;
2. effective idempotency key resolution;
3. pure canonicalization validation, without computing or persisting a fingerprint;
4. global flag;
5. destination capability gate:
   - `inbox` -> no destination sub-gate;
   - `project` -> Project flag;
   - `parentTask` -> Parent flag;
6. `tagIds` present -> Tag flag;
7. dispatch to `CreateParentTaskService` for parent destination, or existing services otherwise.

Parent inside a Project does not additionally require the Project flag. Containing Project eligibility is checked by the parent facts reader/validator and primitive. This keeps disabled parent path zero-touch: it terminates before facts read, Ledger, lock, and JXA.

Parent service order:

1. receive already parsed input after handler gates;
2. canonicalize the authoritative Parent payload;
3. compute the Parent no-tag or Parent-tagged fingerprint exactly once;
4. acquire the existing global mutation lock;
5. Ledger reserve;
6. call `readParentTaskFactsById`, then `validateParentDestination`;
7. transition Ledger to `write_started` immediately before crossing into the mutation primitive, matching the current create service recovery boundary;
8. invoke the Parent primitive, which repeats Parent validation and performs all optional Tag validation before its own local `writeStarted=true` boundary;
9. after primitive success, transition `task_created`;
10. exact child/parent/Tag readback and verifier;
11. `verified` tombstone.

The handler performs no fingerprint computation. `CreateParentTaskService` is the single fingerprint authority, matching the current no-tag/tagged service ownership. A Parent facts validation success followed by a Tag validation failure remains a zero-write prewrite result and is recorded under the existing Tag error category in the Ledger.

Prewrite validation failure categories:

- `parent_not_found` deterministic terminal prewrite;
- `parent_not_active` deterministic terminal prewrite for completed/dropped/effective inactive;
- `parent_validation_failed` retryable only for `reason=query_failed`;
- `parent_not_allowed` for Project root or unsupported parent kind, terminal unless the request changes and user reauthorizes.

`retryable_validation_error` may be reused only for same key + same payload when no write began and `reason=query_failed`. Every other Parent read or eligibility reason is terminal prewrite. Retry behavior must never depend on hidden exception details or an undocumented "transient" interpretation of the same public reason.

### 9.4 Verifier

Parent readback success requires:

- `actual.kind === "action"` for the newly created child;
- `actual.hierarchy.parentId === requestedParentTaskId`;
- `actual.location.inInbox === false` for every ordinary parent child;
- Inbox parent case: `actual.project === null`;
- Project parent case: `actual.project.id === currentParent.project.id`;
- Project root top-level child is not accepted as parent destination success unless requested parent ID equals an eligible ordinary parent;
- name/note/flag/date/estimate match existing canonical rules;
- if tagged, actual/requested Tag ID set exact match using mutation-only ID readback;
- repeat remains absent unless future independent feature changes it.

Any placement mismatch is `partial_success`. No cleanup/delete is attempted by the server.

The `inInbox` rule is deliberate: OmniFocus reports `Task.inInbox === true` only for direct Inbox children. A Task under another Inbox Task is not a direct Inbox child, so ordinary parent placement always expects `actual.location.inInbox === false`.

### 9.5 Verified replay

Verified parent replay follows existing create semantics:

- begin by reading only the original child `taskId`; derive any current parent ID from that read, never from the original request or cached facts;
- never re-create;
- never call the mutation Parent primitive;
- when the current child has an ordinary parent, it may call the read-only `readParentTaskFactsById` to obtain current display context, but it must not require `validateParentDestination(...).allowed === true`;
- never use prewrite facts cache as display truth.

Replay outcomes:

1. child is still under the original parent ID: return current parent name/Project context from current facts, even if that parent, Project, or Folder is now ineligible.
2. parent was only renamed: return current name; same parent ID is not semantic mismatch.
3. child moved to another expressible location: return current location and add `replayed_current_state_changed`.
4. child currently has an ordinary parent but current parent context cannot be read trustworthily: return `replay_target_unavailable` with `reason=current_parent_context_unavailable`, `mayHaveWritten=true`, `retrySafe=false`.
5. child deleted or exact readback fails: keep existing `replay_target_unavailable`.

## 10. Error model

Candidate additions to `CreateTaskErrorCode`:

- `parent_not_found`;
- `parent_not_allowed`;
- `parent_not_active`;
- `parent_validation_failed`.

Candidate stable reasons:

- `not_found`;
- `project_root_not_allowed`;
- `unsupported_parent_kind`;
- `self_completed`;
- `self_dropped`;
- `ancestor_completed`;
- `ancestor_dropped`;
- `project_not_active`;
- `dropped_folder_ancestor`;
- `unknown_status`;
- `ancestor_state_unknown`;
- `parent_chain_cycle`;
- `parent_chain_unreadable`;
- `orphan_parent`;
- `schema_drift`;
- `canonical_id_mismatch`;
- `malformed_id`;
- `query_failed`;
- `adapter_failed`.

Retry semantics are fixed by the public reason, not only by top-level error code and never by hidden context.

Terminal prewrite examples:

- `not_found`;
- `project_root_not_allowed`;
- `unsupported_parent_kind`;
- `self_completed` / `self_dropped`;
- `ancestor_completed` / `ancestor_dropped`;
- `project_not_active`;
- `dropped_folder_ancestor`;
- `malformed_id`;
- `canonical_id_mismatch`;
- `parent_chain_cycle`;
- `orphan_parent`.

The only retryable Parent validation reason:

- `query_failed`;

Fail-closed non-retryable Parent read failures include:

- `parent_chain_unreadable`;
- `ancestor_state_unknown`;
- `schema_drift`;
- `adapter_failed`;
- `unknown_status`;
- `malformed_id`;
- `canonical_id_mismatch`;
- `orphan_parent`;
- `parent_chain_cycle`.

All eligibility failures are also non-retryable. If later evidence justifies retrying a more specific operation, it requires a new unambiguous reason such as `parent_chain_query_failed` or `ancestor_query_failed`; the same reason may not alternate between retryable and terminal Ledger states.

Error details may include stable code/reason, `mayHaveWritten`, `retrySafe`, and created task ID when known. They must not include raw parent name/path or raw read result.

## 11. Orphan、schema drift、unknown-state 防御

Phase 4 must fail closed when:

- `Task.byIdentifier` returns null for the requested parent;
- canonical ID readback differs from requested ID;
- parent is Project root but request used parent destination;
- parent chain repeats an ID;
- parent chain references a parent that cannot expose a canonical ID;
- containing Project relation conflicts with root chain;
- Folder chain status is unreadable or non-Active except known Dropped;
- fixed-script facts reader yields an unknown/non-string status or cannot map status to the bounded enum;
- adapter/schema accepts fields that Phase 4 validator needs as non-empty but receives empty string;
- read-side script cannot distinguish completed vs effectively completed, dropped vs effectively dropped;
- JXA create API can create under parent but readback reports a different parent;
- readback returns multiple rows for exact ID.

No fallback path may create in Inbox or Project. Unknown is a safety state, not a reason to continue.

## 12. Privacy、audit、Agent routing 与 UI 展示

Audit:

- retain canary audit allowlist pattern: correlation ID, metadata hash, args/effective key hash, result code, elapsed milliseconds;
- do not log parent ID/name/path, Project/Folder names, Task payload, Tag IDs/paths, payload hash, raw request metadata, raw idempotency key, JXA payload/source;
- audit transport failure must not alter Tool result.

Ledger:

- do not store parent ID/name/path separately;
- parent identity is indirectly bound through payload hash;
- preserve existing tombstones and checksum behavior.

Agent routing:

- `get_task` remains the read Tool for one exact Action / Action Group / Project Root;
- before parent create, model must restate the exact parent and context immediately before Tool call;
- if parent cannot be distinguished, ask for exact ID or disambiguating context; do not choose;
- unsupported edit/move/reparent requests must not call `create_task`;
- parent destination must be explicit; omitted destination never defaults to Inbox.

UI:

- single-stage UI must show or be paired with immediate text that identifies parent target;
- opaque parent ID alone is insufficient;
- same-name parents require Project/Folder/chain context;
- Tag paths must still be restated if `tagIds` are present.

## 13. 只读 capability probes

All probes in this section are read-only. They must not call `create_task`, JXA constructors, `addTags`, push into collections, edit properties, or invoke Tunnel redeploy/restart.

### 13.1 Source-level probe

Purpose: freeze current code facts.

Commands:

- `rg -n "destination|parent|Project|tagIds|fingerprint|Ledger|write_disabled" src/domain/taskCreation src/tools/definitions/createTask.ts src/serverRegistration.ts`
- `rg -n "parentId|childIds|isProjectRoot|effectiveCompletedDate|effectiveDropDate|projectId|folder" src/domain/task src/tools/primitives/queryOmnifocus.ts`

Expected:

- current public union lacks parent;
- current verifier rejects ordinary parent as Project top-level mismatch;
- read-side fields include direct/effective status and hierarchy fields;
- no parent flag or parent primitive exists.

### 13.2 Real library read-only parent facts probe

Purpose: prove current real read-side can identify candidate parent facts without mutation.

Method:

- choose one user-approved existing Task ID for each case, preferably non-sensitive aliases recorded outside repo:
  - Inbox ordinary action;
  - Project ordinary action;
  - action group with children;
  - Project root Task;
  - completed Task;
  - dropped/effectively dropped Task if safely available;
  - Task in a Project under Folder if available.
- execute an unreachable dedicated fixed read-only script and local harness for `readParentTaskFactsById`; neither artifact is registered by MCP or imported by the server runtime. `get_task` may be used only as Agent discovery comparison, not as mutation authorization evidence.

Record only:

- whether ID roundtrip matched;
- kind enum;
- parentId null/non-null shape;
- childIds count, not IDs;
- projectId present/null shape, not raw ID;
- direct/effective completion/drop booleans;
- status known/unknown;
- folder chain readable yes/no;
- no mutation calls made.

Pass criteria:

- canonical ID roundtrip works for ordinary Tasks and Project roots;
- Project root can be detected and excluded;
- direct/effective completion/drop facts are stable enough for validator;
- parent chain terminates and can be represented without leaking names;
- containing Project and Folder eligibility can be read or unknown states are detectable.

This probe is P4-A2, not P4-B runtime implementation. It may establish the fixed bounded facts shape and deterministic adapters, but it must contain no mutation constructor, no feature flag, no handler/service route, no Ledger/audit integration, and no public Schema. P4-A3 records only privacy-safe booleans/counts/status categories. P4-B may promote or reimplement the reviewed facts reader only after P4-A3 acceptance and separate authorization.

P4-A2/P4-A3 result: passed for every user-approved and safely available real-library case. The
privacy-safe evidence, real `task.children` collection-shape correction, unavailable Dropped-case
treatment, and zero-write proof are recorded in
[Phase 4 Parent Facts Read-Only Acceptance](./PHASE4_PARENT_TASK_FACTS_READONLY_ACCEPTANCE.md).

### 13.3 Schema drift / orphan probe

Purpose: verify fail-closed behavior on unusual states.

Read-only cases:

- exact ID not found;
- Project root ID supplied as candidate parent;
- stale ID from a deleted Task if available;
- Task whose Project is completed/dropped/on hold if available;
- Folder-dropped ancestor if available;
- unknown or unsupported status cannot be manufactured in production, so unit tests must simulate it.

Pass criteria:

- every unavailable or unknown state maps to a stable non-success reason;
- no personal names/IDs are recorded in acceptance docs;
- no write-capable primitive is loaded or invoked.

### 13.4 P4-C Acceptance: client UI dry-run probe

Purpose: decide single-stage vs prepare/commit after fail-closed Schema publication and before any Canary.

Only after parent wire schema is implemented but Parent flag remains false:

- App Refresh;
- ask model to create under an exact parent selected from `get_task`;
- verify it restates parent target immediately before Tool call;
- Tool returns `write_disabled.parent_placement_disabled`;
- verify zero Ledger/lock/JXA after disabled path;
- inspect whether UI lets user associate parent name/context with opaque ID.

If UI target binding fails, stop and design prepare/commit. Do not run Canary.

## 14. 验收矩阵

P4-B 已完成以下 domain/facts/primitive/service/verifier 与当时的 public-unreachability 条目。
14.1 中的 public three-way union/disabled gate 和 14.5 的 MCP publication 条目已在后续独立授权的
P4-C repository implementation 中完成。部署、App Refresh、disabled client/UI acceptance 及 14.6
之后的真实写入条目仍属于更晚的独立阶段，不能因仓库侧 P4-C PASS 推断完成。

### 14.1 Unit / schema / canonicalization

- strict three-way destination union;
- `parentTaskId` required only for parent variant;
- parent aliases rejected;
- Project and parent mutually exclusive;
- extra fields rejected;
- V2 no-tag Inbox/Project fingerprint unchanged;
- tagged Inbox/Project fingerprint unchanged;
- parent no-tag/tagged fingerprint uses new namespace and binds parent ID;
- idempotency conflict when same key changes destination;
- parent disabled gate rejects before Ledger/lock/facts reader/JXA;
- Parent facts read and eligibility validation have separate result types;
- Parent-tagged fingerprints bind sorted Tag IDs while existing V3 tagged fingerprints remain unchanged;
- parent validation reason enums and retry semantics are stable.

### 14.2 Domain / facts reader / validator

- readable but ineligible Parent/Project/Folder states return facts successfully;
- replay can represent a currently completed/dropped parent without treating it as a read failure;
- validator rejects those same facts for prewrite;
- exact parent action rejected as `parent_not_allowed.unsupported_parent_kind`;
- action_group allowed;
- Project root rejected as `parent_not_allowed`;
- completed/dropped/effectively completed/effectively dropped rejected;
- ancestor completed/dropped rejected;
- Active Project parent accepted;
- OnHold/Done/Dropped Project rejected;
- dropped Folder ancestor rejected;
- unknown status/schema drift fail closed;
- chain cycle/orphan simulated fail closed;
- only `query_failed` is retryable; every other Parent reason is terminal and deterministic;
- no name lookup in facts reader.

### 14.3 Primitive / JXA static tests

- source contains `Task.byIdentifier(parentTaskId)`;
- source validates exact payload keys;
- source validates parent before `writeStarted = true`;
- source resolves and validates all optional Tags before `writeStarted = true`;
- source checks Tag ancestor-active and direct-parent mutual exclusion before write;
- source preserves existing Tag error categories rather than wrapping them as Parent failures;
- source has no Inbox fallback;
- source has no Project fallback;
- source does not call edit/move/delete/complete APIs;
- source does not use user content in executable source;
- success result includes exact parent ID;
- tagged success result includes immediate actual Tag IDs;
- prewrite failure includes stable category/reason and null task ID;
- postcreate/unknown follows existing `mayHaveWritten=true` semantics.

### 14.4 Service / verifier

- parent create success exact readback;
- parent mismatch yields `partial_success`;
- Project root top-level child is not mistaken for ordinary parent success;
- parent status changed before JXA yields prewrite failure;
- parent moved after pre-facts read but before JXA yields prewrite failure or exact post-write warning;
- readback not_found/schema drift yields `verification_failed`;
- replay reads original task ID and does not re-create;
- replay parent rename returns current parent name/context without semantic mismatch;
- replay moved child returns current location plus `replayed_current_state_changed`;
- replay with unreadable current parent context returns `replay_target_unavailable.current_parent_context_unavailable`;
- outcome_unknown tombstone blocks retry;
- tagged parent create exact Tag ID set verified;
- Parent facts pass followed by Tag failure is zero-write and recorded with the existing Tag error code;
- verified replay reads current parent facts without applying prewrite eligibility.

### 14.5 MCP protocol / registration

- `tools/list` shows exact six Tools, Resources absent, one mutation Tool;
- `create_task` input schema has three destination variants and required `name`, `destination`, `idempotencyKey`;
- output schema has parent location variant;
- annotations remain destructive/idempotency semantics consistent with current create Tool;
- no new mutation Tool appears;
- upstream-full remains unchanged.

### 14.6 Real read-only acceptance

- run P4-A2 probes in Section 13 before P4-B runtime implementation;
- record only non-sensitive booleans/counts/status categories;
- no `create_task` call;
- no JXA constructor or property write;
- no Ledger/audit mutation;
- no Tunnel restart.

### 14.7 Future Canary acceptance

Future Canary is out of scope for this design turn. If later authorized:

- first deploy or run with Parent flag false;
- pass disabled client UI gate;
- user separately approves exactly one parent production Canary;
- preflight exact parent ID/name/context and unique child name;
- create exactly one minimal child under parent;
- exact ID readback verifies parentId, Project context, fields, Tag set if used;
- Ledger/audit/lock permissions pass;
- user manually confirms and deletes Canary child;
- ID/name `not_found` after deletion;
- no parent/Project/Tag changes except the one child creation and user deletion.

## 15. 分阶段 commits 与禁写部署门禁

Suggested future phase and commit split. Every phase and commit requires its own authorization; the labels below do not authorize execution:

P4-A1:

1. `docs: design create_task parent placement`
   - this document and any ADR amendment only.

P4-A2, only after separate read-only probe approval:

2. `test: add read-only parent facts capability probe`
   - fixed read-only Omni Automation script and local harness;
   - no MCP/runtime registration, handler/service route, Ledger/audit, feature flag, public Schema, or mutation API.

P4-A3, only after P4-A2 succeeds:

3. `docs: record parent facts read-only acceptance`
   - privacy-safe results only; no real names, IDs, paths, raw payloads, or raw script output.

P4-B, completed after separate approval:

4. `feat: add unpublished parent placement internals` (implemented; not committed)
   - parent schema/type, fingerprint, production facts reader/validator, primitive, verifier, `CreateParentTaskService`, tests; public MCP remains V3 and parent branch is unreachable.

P4-C repository implementation, completed after separate approval:

5. `feat: publish parent destination schema fail-closed` (implemented; not committed/deployed)
   - V4 handler, default-false Parent flag, server registration, instructions, and protocol tests;
   - deployment remains separate and may occur only with Parent flag absent/false.

P4-C Acceptance, only after P4-C publication and App Refresh:

6. `docs: record parent placement disabled client acceptance`
   - disabled App/UI/protocol evidence and zero-write proof.

Protocol decision gate after P4-C Acceptance:

- UI passes: keep single-stage and proceed only with separate Canary approval;
- UI fails: stop and write independent prepare/commit ADR.

P4-D, only after separate one-Canary approval:

7. `test: run one parent placement Canary`
   - exactly one approved child creation, exact readback, user confirmation and manual deletion; record acceptance separately.

P4-E, only after successful P4-D and separate formal enablement approval:

8. `ops: formally enable parent placement`
   - production flag change and formal acceptance are separate from the Canary commit and authorization.

Every commit must pass build, unit tests, JXA syntax check where relevant, and `git diff --check`. No commit may include Tunnel plist/log/Ledger/audit/runtime state or unrelated docs. If an intermediate commit cannot stay fail-closed and test-green, split differently.

Deployment gates:

- Parent flag absent/false by default;
- global/Project/Tag semantics must not regress;
- gate order must be global -> destination capability gate -> Tag gate;
- parentTask destination requires Parent flag only; parent under Project does not additionally require Project flag;
- disabled parent path returns `write_disabled.parent_placement_disabled` before Ledger/lock/facts reader/JXA;
- public Tool count stays six and Resources absent;
- no Tunnel restart or flag change without independent authorization;
- App Refresh required after schema metadata changes.

## 16. 停止条件

Stop before implementation or enablement if any of the following occurs:

- Accepted ADR conflicts with real read-side evidence;
- read-side cannot reliably identify parent canonical ID/kind/status/chain/project/folder;
- Project root and ordinary parent cannot be reliably distinguished;
- parent chain or Folder state can be unknown without fail-closed reason;
- UI cannot bind user confirmation to parent target;
- retry changes idempotency key or destination;
- schema publication drops strict union or allows aliases;
- disabled path touches facts reader/Ledger/lock/JXA;
- any write occurs during read-only probes;
- implementation requires edit/move/reparent or generic executor;
- privacy acceptance would record real parent names/IDs/paths in logs/docs;
- Tool count, Resources, or mutation surface changes unexpectedly.

If ADR-006 or ADR-005 conflicts with real API evidence, report the conflict and propose an ADR amendment. Do not modify an Accepted ADR without explicit approval.

## 17. Phase 4 准入条件

P4-B unpublished, unreachable internal implementation started only after all were true:

- this design is reviewed and accepted;
- any needed ADR amendment is separately approved;
- T2 remains healthy and no Inbox/Project/Tag regression is open;
- P4-A2 real read-only probes pass and P4-A3 acceptance is recorded;
- parent feature flag design is accepted and defaults fail-closed;
- test matrix and commit split are accepted;
- user explicitly authorized implementation in a later turn.

P4-B is complete and recorded in
[P4-B Internal Implementation Acceptance](./PHASE4_PARENT_TASK_INTERNAL_IMPLEMENTATION_ACCEPTANCE.md).
P4-C repository publication is also complete and recorded in
[P4-C Fail-Closed Repository Acceptance](./PHASE4_PARENT_TASK_P4C_REPOSITORY_ACCEPTANCE.md).
P4-C disabled deployment and client target-binding acceptance is complete and recorded in
[P4-C Disabled Client Acceptance](./PHASE4_PARENT_TASK_P4C_DISABLED_CLIENT_ACCEPTANCE.md). At that
milestone, production published V4 while Parent remained absent/default-false. The client preserved exact Parent and
containing Project context, called the Parent branch, and received the Parent-specific disabled
response with zero mutation.

P4-D exactly-one Canary acceptance is complete and recorded in
[P4-D Parent Canary Acceptance](./PHASE4_PARENT_TASK_P4D_CANARY_ACCEPTANCE.md). The isolated process
created one child under a freshly validated ordinary Action Group, two exact readbacks and all
Ledger/audit/lock checks passed, and user manual deletion closed with exact ID/name `not_found`.
The public Parent flag remained absent throughout P4-D.

P4-E formal runtime enablement is complete and recorded in
[P4-E Parent Formal Enablement Acceptance](./PHASE4_PARENT_TASK_P4E_FORMAL_ENABLEMENT_ACCEPTANCE.md).
The controller verified fail-closed `false/true/true/true` before loading final
global/Project/Tag/Parent=`true/true/true/true`; audit/Ledger/lock and Tunnel health gates passed
with zero MCP Tool call and zero OmniFocus mutation.

Single-stage vs prepare/commit decision is required only after P4-C publishes V4 Schema with Parent flag false and P4-C Acceptance records disabled client UI dry-run evidence. It gates P4-D Canary and P4-E enablement, not P4-B internal implementation.

Formal enablement may start only after:

- implementation is complete and test/build/diff gates pass;
- published schema has passed protocol inspection;
- disabled client gate and App Refresh pass with zero mutation;
- user separately authorizes and completes P4-D one-Canary acceptance;
- cleanup/readback/manual deletion loop is complete;
- user separately authorizes final production flag change.

## 18. 本轮审计结论

P4-A2/P4-A3 now provide real read-only evidence that a fixed exact-ID boundary can distinguish ordinary actions, existing action groups, Project roots, direct Inbox, Project-root ancestry, effective completion, Active Project state, Folder ancestry, and exact not-found without mutation or identity leakage. The real API correction that `task.children` is a collection object rather than a native Array is frozen in deterministic tests and does not conflict with ADR-005 or ADR-006.

P4-B implemented the frozen internal boundary and passed deterministic review. P4-C then published the V4 three-way contract behind a Parent flag that defaults false, deployed it with the Parent flag absent, and passed live protocol plus App/UI target-binding acceptance. P4-D subsequently passed exactly one isolated Parent Canary, exact readback, Ledger/audit/lock, user confirmation, manual deletion, and final ID/name `not_found`. P4-E then formally loaded the Parent flag through a fail-closed two-stage controller with zero mutation. This closes Phase 4 without requiring a prepare/commit amendment. Other CRUD, extra Canary, commit, and push remain unapproved.
