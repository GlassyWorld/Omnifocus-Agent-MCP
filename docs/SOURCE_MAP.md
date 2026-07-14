# Source Map

> 用途：让关键结论可以追溯到当前权威、历史来源、被替代范围和代码/测试证据。历史来源不是当前事实的替代品。

| 结论 | 当前权威文件 | 历史/支持来源 | 被替代来源或范围 | 代码/测试证据 |
|---|---|---|---|---|
| 个性化架构采用 Domain-first | [ADR-001](./architecture/decisions/ADR-001-domain-first-architecture.md) | `README.md`、[v1 实现与验收历史](./history/personalization-v1-implementation-and-acceptance.md)、两份 Audit | handler 直接承载业务语义、Raw/query 直接作为个性化契约的方向 | `src/domain/**`、Domain tests、Tool definitions |
| 四个当前 Domain read tools 已完成 | 当前代码与 tests、[PROJECT_STATUS](./PROJECT_STATUS.md) | 四类工程日志、README | 无 | `src/tools/definitions/get{Task,Project,CompletedSince,LeanSnapshot}*`、`src/serverRegistration.test.ts` |
| Planned/Due 只由 direct owner 生成 visibility | [ADR-002](./architecture/decisions/ADR-002-direct-owner-semantics.md) | Planned/Due 修订日志、[v1 实现与验收历史](./history/personalization-v1-implementation-and-acceptance.md) | Snapshot 初始实现中的 inherited child fan-out | `src/domain/snapshot/**` 及 tests |
| Defer/Planned/Due 保存 direct/effective/source | Domain types/tests、ADR-002 | Task/Project 工程日志 | 只返回单一 effective 日期而不保留来源的简化表达 | `src/domain/task/dateSemantics.ts`、Project/Snapshot resolvers |
| Lean Snapshot 与 Full Snapshot 独立 | [ADR-004](./architecture/decisions/ADR-004-lean-snapshot-scope.md) | Snapshot 工程日志、README | `dump_database` 等同稳定 Full Snapshot MCP、立即开发 Full Snapshot 的方向 | Snapshot composer/schema/tests；`dump_database` 独立 upstream tool |
| section total 在截断前计算，sections 独立截断 | ADR-004、Snapshot tests | Due 修订日志 | 从截断后的 active items 派生 planned/deadline | Snapshot composer/tests |
| Action 当前属于 Task Domain | [ADR-003](./architecture/decisions/ADR-003-task-action-boundary.md) | Task 工程日志、两份 Audit | 立即增加 `ActionView`/`get_action` | Task types/classifier/tests |
| AI analysis 与 mutation 分离 | [ADR-005](./architecture/decisions/ADR-005-ai-boundary.md) | GPT Guide、App Instructions、README | AI 根据分析自动写入、Domain 输出 recommendation | Server Instructions tests、Profile registration tests |
| `personal-production` 是 server-side curated capability boundary，当前为五读一写 | profile/registration 代码与测试、[PROJECT_STATUS](./PROJECT_STATUS.md) | README、Audit、Tunnel 手册 | 旧 `personal-readonly` 名称；仅依赖客户端 allowlist/提示词形成安全边界 | `src/config/serverProfile.ts`、`src/serverRegistration.ts` 及 tests |
| `upstream-full` 保留 16 tools/6 Resources/7 mutation tools | registration 代码与测试 | Architecture Audit、GPT Guide | “仓库已完全删除写入能力” | `TOOL_REGISTRY` 和 full-profile tests |
| 五个 Domain read Tool 有结构化成功输出 | Tool definitions/schemas/tests | Architecture Audit、GPT Guide、App Instructions | 只有 JSON 文本、没有 descriptor outputSchema 的旧状态 | `outputSchema`、`structuredContent` tests、registration descriptor tests |
| `query_omnifocus` 是 generic full-profile read tool | registration code、[Query Reference](../QUERY_TOOL_REFERENCE.md) | Examples、GPT Guide | 把它列为 `personal-production` 当前 surface | `src/serverRegistration.ts` 及 tests |
| 当前只有 `personal-production` 和 `upstream-full` Profiles | profile code/tests | README、Tunnel 手册 | 旧 `personal-readonly` Profile；空值默认 full | `src/config/serverProfile.ts` 及 tests |
| `personal-production` 当前精确注册五个 Domain read tools（含 `search_tags`）、`create_task` 且无 Resources | 当前代码/测试、[状态页](./design/personal-production/README.md) | Profile refactor、T1 与 create_task 验收记录 | 从 `create_task` 推断其他 mutation 能力 | registration allowlist、精确六 Tool 集合和 Resource tests |
| `create_task` V1 已完成 Checkpoint 6A/6B/6C/7 并正式启用 | [ADR-006](./architecture/decisions/ADR-006-controlled-create-task-v1.md)、[状态页](./design/create-task/README.md)、[Checkpoint 7 验收](./design/create-task/CHECKPOINT7_FORMAL_ENABLEMENT_ACCEPTANCE.md) | ADR-005 mutation 复审条件、探针/Canary/Retry 验收记录 | 把 `add_omnifocus_task` 等同新契约、从 `create_task` 推断其他 mutation | `src/domain/taskCreation/**`、`createInboxTask`、safe JXA executor、required UUID wire Schema、feature flag 及 tests；`personal-production` 精确五 Tool、零 Resources、唯一 mutation 为 `create_task` |
| `create_task` V3 T2-C 已通过 App Refresh 与禁写客户端门禁 | [T2-C 验收](./design/create-task/PHASE_T2C_TAG_ASSIGNMENT_CLIENT_GATE_ACCEPTANCE.md)、[Phase T2 设计](./design/create-task/PHASE_T2_TAG_ASSIGNMENT_DESIGN.md) | T1 discovery 验收、Phase 2B acceptance | 把已发布 `tagIds` Schema 等同当时已授权 Tag mutation、静默丢弃 Tag 要求 | V3 Schema/protocol tests、global→Project→Tag gates、当时 loaded global/Project/Tag=`true/true/false`、客户端 `write_disabled` 与 exact-name `not_found` |
| `create_task` V3 T2-D tagged Inbox 与 tagged Project Canary 均已完成创建、验证、人工删除与双 `not_found` | [T2-D Canary 验收](./design/create-task/PHASE_T2_TAG_ASSIGNMENT_CANARY_ACCEPTANCE.md)、[Phase T2 设计](./design/create-task/PHASE_T2_TAG_ASSIGNMENT_DESIGN.md) | T2-C client gate | 从两条 Canary 通过自动推断 T2-E 授权 | exact Tag ID-set、Inbox/Project/parent/ID/name readback、Project direct/all count 恢复、Ledger verified/success、audit allowlist、无锁、Tag projection unchanged、删除后双 `not_found`；T2-D 期间公开 Tag flag=false |
| `create_task` V3 T2-E Tag assignment 已正式启用 | [T2-E 正式启用验收](./design/create-task/PHASE_T2_TAG_ASSIGNMENT_FORMAL_ENABLEMENT_ACCEPTANCE.md)、[Phase T2 设计](./design/create-task/PHASE_T2_TAG_ASSIGNMENT_DESIGN.md)、[PROJECT_STATUS](./PROJECT_STATUS.md) | T2-C/T2-D acceptance | 从 Tag assignment 推断 Tag CRUD、parent 或其他 mutation | fail-closed `false/true/true` 后最终 plist/loaded `true/true/true`、六 Tool、Resources absent、唯一 mutation、58 files/828 tests、build/JXA/diff、Ledger/audit unchanged、无锁、Tunnel healthy |
| Tag primitive 已存在但不在个人 Profile | registration code/tests | Architecture Audit、GPT Guide | “仓库完全不支持 Tag” | `list_tags`、`create_tag` definitions/primitives；full-only registry |
| 工程日志是稳定历史，不应删除 | [engineer_log 索引](../engineer_log/README.md) | README Maintenance Reference、Architecture Audit | 无 | Git 历史保留各里程碑提交 |

## 原始材料边界

项目内没有原始 ChatGPT/Codex 对话导出。本页映射的是代码、测试、ADR、工程日志和整理后的文档，不应被描述成对全部云端聊天历史的来源映射。
