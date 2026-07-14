# `create_task` Phase T1 Tag Discovery Acceptance

> 状态：Phase T1-A/B/C/D 全部通过（2026-07-14）<br>
> 注册状态：`search_tags` 已注册并部署到 `personal-production`<br>
> 生产边界：`personal-production` 精确六个 Tool、Resources absent；唯一 mutation 仍为 `create_task`

## 1. 验收范围

本轮在已接受的
[Phase T1 Tag Discovery Design](./PHASE_T1_TAG_DISCOVERY_DESIGN.md) 基础上验收：

- strict input/output wire contract；
- candidate Tool 的 MCP `tools/list` 与 `tools/call` 行为；
- 当前完整 Tag snapshot 的 canonical ID roundtrip；
- exact native status、hierarchy/path 和 mutual-exclusion property 可读性；
- 正常 `search_tags` 路径单次 snapshot；
- repeated independent reads 稳定性；
- privacy/no-write 与既有 `create_task` 状态隔离。

T1-C 本身不注册、不部署、不改 flags。用户随后独立批准 T1-D；T1-D 只注册和部署
`search_tags`，不进入 Phase T2 runtime。

## 2. Protocol contract

临时 `InMemoryTransport` MCP server 只注册候选 definition，不修改生产 registry。验收通过：

- input object `additionalProperties=false`；
- `query` 的 string/min/max、`status` 的 enum/minItems/maxItems、`limit` 的 integer/min/max
  均在客户端可见 Schema 中存在；
- success output 及所有 nested object 均为 strict object；
- candidate definition 与四个现有 Domain read Tool 一样省略 annotations，未单独硬编码
  `openWorldHint`；
- `structuredContent` 与 JSON text 深相等；
- extra input 在协议边界被拒绝，snapshot reader 调用次数为 0；
- 正常调用 snapshot reader 调用次数为 1。

T1-D 注册后，独立 STDIO MCP initialize/`tools/list` 已验证生产 build 精确发布：

```text
create_task
get_completed_since
get_lean_snapshot
get_project
get_task
search_tags
```

Resources capability absent；`search_tags` input/output wire Schema strict；annotations 与四个既有
Domain read Tool 一致为 absent。唯一 mutation 仍为 `create_task`，`create_tag`、legacy
`list_tags` 和 `query_omnifocus` 均未进入个人 Profile。

## 3. Capability probe

独立静态只读 probe 对当前完整 `flattenedTags` snapshot 执行
`Tag.byIdentifier(id)` exact roundtrip。probe 与真实 acceptance harness 各自独立执行，记录的
最终脱敏结果为：

| 事实 | 结果 |
|---|---:|
| snapshot Tag | 26 |
| roundtrip checked | 26 |
| roundtrip mismatch | 0 |
| Active | 25 |
| On Hold | 1 |
| Dropped | 0 |
| root | 13 |
| nested | 13 |
| 最大真实 path depth | 2 |
| `childrenAreMutuallyExclusive=true` parent | 0 |

所有 ID 都是 OmniJS `tag.id.primaryKey`，没有 name/path fallback。正常 runtime script 不含
`Tag.byIdentifier`；roundtrip 只存在于 capability/acceptance probe。

## 4. 真实只读 acceptance

显式 opt-in harness 未导入仓库旧的 mutation integration setup。最终记录运行通过：

```text
result=pass
normalToolSnapshotReads=1
queryMatched=16
limitMatched=25
limitReturned=1
truncated=true
repeatedReadStable=true
tagSnapshotUnchanged=true
ledgerUnchanged=true
auditUnchanged=true
mutationLockUnchanged=true
```

验收前后完整 Tag discovery projection 精确相等。create_task Ledger tree、audit metadata 和
mutation lock 状态精确不变。read/probe source 不引用 Task/Project facts或任何 create、property
mutation、delete、cleanup、URL execution API；没有调用 `create_task` 或其他 mutation。

返回和测试输出只记录允许的聚合数量与布尔结果，没有输出 Tag name、path、ID、query、raw
stdout/stderr、Task 或 Project facts。

## 5. Synthetic coverage 与真实覆盖限制

当前真实库已覆盖 Active、On Hold、二层 hierarchy/path、parent read 和 mutual-exclusion
property 可读性。以下事实没有在真实库观察到，按接受设计由 deterministic fixtures 覆盖：

- Dropped；
- 三层 path；
- `childrenAreMutuallyExclusive=true`；
- 同名 Tag 消歧；
- duplicate/empty ID；
- orphan/self-parent/two-node/multi-node cycle；
- unknown status、missing/wrong raw fields。

这些缺失不阻断只读 T1-C；是否需要为 T2 人工制造真实样本必须由未来 T2 风险设计决定。

## 6. 验证门禁

```text
npm test
  50 test files / 748 tests passed

npm run build
  passed

OMNIFOCUS_TAG_DISCOVERY_ACCEPTANCE=1 npx vitest run \
  --config vitest.integration.config.ts \
  src/tests/integration/tag-discovery-readonly.test.ts
  1 test file / 1 test passed

git diff --check
  passed
```

## 7. T1-D 注册、部署与客户端验收

### 7.1 注册与本地协议门禁

- `serverRegistration.ts` 只为 `personal-production` 增加 `search_tags`；
- Server Instructions 增加显式 Tag discovery route，并继续禁止 Tag mutation；
- 若用户要求“创建任务并添加 Tag”，模型必须保留 Tag 约束，不得降级创建无 Tag Task；
- 独立 STDIO MCP 验证精确六 Tool、Resources absent、strict Schema 和 annotations absent；
- 临时 HOME、global flag=`false` 的协议控制中，合法 `create_task` 固定返回
  `write_disabled`、`mayHaveWritten=false`，且没有创建 Ledger。

### 7.2 生产 fail-closed Refresh 门禁

用户要求采用比原设计更保守的操作门禁。App Refresh 与负向路由验收期间：

```text
plist global=false
plist Project=true
loaded global=false
loaded Project=true
healthz=live
readyz=ready
```

Chrome 中的 ChatGPT 项目完成页面 Refresh。用户手工发送：

```text
请在 OmniFocus Inbox 创建任务 T1D_NEGATIVE_TAG_ROUTING，
并添加一个现有 Active Tag；如果不能完整满足 Tag 要求，就不要创建任务。
```

Web ChatGPT 明确说明当前写入接口不支持为新任务添加 Tag，因此不能完整满足请求，并明确
没有创建 `T1D_NEGATIVE_TAG_ROUTING`。服务器随后通过既有只读 `get_task` exact-name 路径
独立验证 `not_found`；实际 `mutation.lock` absent。

该手工 UI 场景没有在发送前另存 audit/Ledger filesystem signature，因此本节不把
`auditUnchanged` 或 `ledgerUnchanged` 冒充为客户端证据。写安全由发送期间 global
fail-closed、模型明确拒绝、真实库 exact-name `not_found` 和无残留 lock 共同支持；独立协议
控制另行证明即使误调用也会在 Ledger/lock/JXA 前返回 `write_disabled`。

### 7.3 恢复现有 V2 写入

负向路由通过后，fail-closed controller 重载并恢复原值：

```text
plist global=true
plist Project=true
loaded global=true
loaded Project=true
healthz=live
readyz=ready
```

恢复过程没有调用 `create_task`，没有创建验收 Task，也没有扩大 mutation surface。

## 8. 接受结论与停点

**Phase T1-A/B/C/D 全部通过。** `search_tags` 现在是 `personal-production` 的正式只读能力；
它具备 strict structured contract、canonical ID roundtrip、真实只读、生产注册和客户端负向
路由证据。

当前停点：

- `personal-production` 精确六 Tool、Resources absent；
- `search_tags` 已进入 registry/Instructions；
- `list_tags`/`create_tag` 仍仅属于 `upstream-full`；
- T1 diff 未修改 `create_task` Schema、fingerprint、verifier 或写入 JXA；
- 临时操作门禁已恢复，`create_task` V2 的 Inbox/Project flags 均为正常生产值 `true`；
- 没有给 `create_task` 增加 `tagIds`，没有进入 Phase T2 runtime。

下一步只能进入 Phase T2 的独立设计、能力审计与批准门；T2 写入实现、Canary 和正式启用
仍须分别授权。
