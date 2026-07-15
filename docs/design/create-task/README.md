# create_task V4 Development Status

## 当前事实

- [ADR-006](../../architecture/decisions/ADR-006-controlled-create-task-v1.md) 已接受 Inbox-only `create_task` V1 架构和 Phase 2/4 演进边界。
- Phase 1 已实现 strict contract、semantic canonicalization、永久 tombstone Ledger、global mutation lock、safe no-shell JXA executor、Inbox-only primitive、exact Task readback verifier、compact handler 及 deterministic tests。
- `create_task` 已加入 `personal-production`；当前 Profile 表面为五个 read Tool 加一个受 global/Project/Tag/Parent flags 保护的 V4 创建 Tool。P4-E 已正式启用，当前加载 global/Project/Tag/Parent=`true/true/true/true`。
- `upstream-full` 已有 `add_omnifocus_task` mutation tool，但它不是自动成立的未来 V1 契约。
- legacy `list_tags` 和 `create_tag` 只在 `upstream-full` 注册；个人 Profile 只增加只读 `search_tags`，没有 Tag mutation Tool。
- ADR-005 要求分析与写入分离，并把授权、确认、审计、失败/回滚和重复保护作为 mutation gateway 的复审条件。
- Phase 2A Project placement 设计已通过评审；Phase 2B 实现、禁写客户端门禁、隔离生产 Canary、人工清理和 fail-closed 正式启用均已通过。公开 Project-specific flag 已加载为 `true`。
- Phase T1 既有 Tag 结构化发现设计、实现、protocol/capability、真实只读和 T1-D 生产注册验收已全部通过；`search_tags` 已进入个人 Profile，生产为精确六 Tool、Resources absent。
- Phase T2-A 第二版设计与能力审计、T2-B 内部实现、T2-C 公开契约/客户端门禁、T2-D 两条 Canary 及 T2-E 正式启用均已通过。
- Phase T2-D tagged Inbox 与 tagged Project Canary 均已完成单次创建、exact Tag/placement/readback、Ledger/audit/lock、Tag projection、用户人工确认/删除与 ID/name 双 `not_found` 闭环；T2-E 配置启用过程零 mutation。
- Phase 4 P4-A1/A2/A3、P4-B、P4-C、P4-D one-Canary 与 P4-E 正式启用全部通过；ordinary Parent placement 已在冻结边界内正式启用，配置过程零 mutation。

## 当前判断

Phase 1 已完成 corrected Schema 的正式生产部署与 Checkpoint 7 全部验收；Phase 2B Project placement 随后形成已验收 V2 baseline。T2-C 已部署并验收 V3 contract，T2-D 两条 Canary 已完整闭环，T2-E 已按 fail-closed 流程正式启用。P4-C 已发布并验收 V4 disabled Parent contract，P4-D one-Canary 已完成单次创建、exact readback、人工清理与终检，P4-E 已按 fail-closed 两阶段流程正式启用。当前 global/Project/Tag/Parent=`true/true/true/true`。

Checkpoint 6A 已部署并通过本地 MCP 协议验收：精确五 Tool、零 Resources、固定 `write_disabled`、禁写对象 `not_found`、Ledger 目录未创建、health/ready 正常。用户已确认 ChatGPT App Refresh 和禁写 UI 测试完成。

2026-07-13 补充：已从 current-year completed stream 找到一个脱敏 Inbox Task，Inbox read contract 已覆盖；flagged、estimate、repeat 仍无可用真实样本。隐私安全 retry audit 已在严格禁写状态部署，loaded flag 为 `false`、Ledger 目录不存在、服务 live/ready。

客户端七项 routing/UI/禁写测试已由用户确认通过。audit 已改为 Ledger 外的 `0700/0600` 专用 JSONL 并在禁写状态重新部署。最终 Web Retry 只产生一次 `create_task` 调用，因此不存在客户端 Tool-level duplicate retry；本地协议控制证明相同显式 key 的 args/effective hashes 稳定。用户将 iPhone 从验收范围移除，并以 SDK/protocol strict Schema 测试替代无法控制 raw Tool JSON 的 Web 自然语言边界测试。Checkpoint 6B 已通过，并已继续完成 6C 与 7。

Checkpoint 6C 已完整通过：单次最小字段真实生产 Canary 使用一次性 `personal-production` 进程写入真实 Inbox，public Tunnel flag 始终保持 `false`；ID/name 精确回读、默认字段、单对象语义、Ledger `verified`/checksum/权限、audit allowlist/权限和无残留锁全部通过。用户已人工确认并删除，随后按 Ledger 原始 ID 和 exact name 均验证 `not_found`。

Checkpoint 7 已由用户独立授权并完整通过：生产 LaunchAgent 落盘值和已加载进程环境均为 `true`，主服务及 watchdog 正常，协议表面仍为精确五 Tool、零 Resources、唯一 mutation Tool 为 `create_task`。公开 ChatGPT Web/Tunnel 的最小创建、ID 回读、审计、无重复、无残留锁、人工删除及 ID/name 双 `not_found` 已闭环。详见 [Checkpoint 7 Formal Production Enablement](./CHECKPOINT7_FORMAL_ENABLEMENT_ACCEPTANCE.md)。

第一次公开 Web 终验以 `invalid_arguments`、`mayHaveWritten=false` 安全失败：Web 只传了 `name`，而未验证稳定的 MCP request ID 门控仍关闭。该结果暴露公开 Schema 把 `idempotencyKey` 标为 optional 与实际生产前置条件不一致；当前修订将其设为 required，并要求模型自动生成及在透明 retry 中复用 UUID，用户无需提供。

修订时进一步发现 MCP SDK 1.29 会把 refined/effects input schema 发布为空 properties。最终注册改用 strict ZodObject，handler 保留完整 relation-aware parse；真实 MCP wire test 已确认 8 个属性、`required=[name,idempotencyKey]`、UUID format 与 `additionalProperties=false`。646 项测试、构建和 diff 检查通过。

Refresh 后 Web 自动 UUID 禁写门禁已通过：单次调用返回 `write_disabled`，audit 中 args/effective key hashes 一致，未重试、未读取、未删除且无残留锁。随后 fail-closed controller 已成功恢复 `flag=true`、health/ready 与 watchdog。新的最终验收名称已预检为 `not_found`。

最终公开 Web/Tunnel create/read 已通过：`create_task` 一次成功，Web 按返回 ID 调用 `get_task` 一次成功且未重试；服务器按 ID/name 回读到同一 Inbox Task，默认字段正确、名称单对象、audit `success`、Ledger checksum/`verified`/权限正确且实际 `mutation.lock` 不存在。用户确认并人工删除后，ID/name 双 `not_found`、永久 tombstone、flag=`true` 与服务健康均通过终检。

2026-07-14 Phase 2B：V2 要求显式 `destination`，并以 exact canonical Project ID 支持受独立 flag 保护的 Active Project 顶层 placement。首次隔离 Canary 因真实读侧 `parentId` 等于 Project root Task ID 而安全返回 `partial_success`，未重试；修订 ADR/verifier 后，第二次单调用 Canary 成功，`project.id` 与 `parentId` 均精确等于 requested Project root ID。用户人工删除后，ID/name 双 `not_found`、Ledger `verified/success`、audit/权限/无锁均通过。详见 [Phase 2B Project Placement Acceptance](./PHASE2B_PROJECT_PLACEMENT_ACCEPTANCE.md)。

用户随后独立批准正式启用。fail-closed reload 后，plist 与 loaded LaunchAgent 的 global/Project flags 均为 `true`；Tunnel 状态健康、health/ready 与 watchdog 通过，协议表面仍为精确五 Tool、Resources capability absent。配置启用与终检未创建任何 Task。

2026-07-14 Phase T1：`search_tags` 已完成 strict structured contract、单次完整 snapshot、三态/path/exclusivity Adapter、privacy-safe no-shell executor、deterministic tests、真实只读和 T1-D 注册部署。当前 26 个 Tag 均完成 canonical ID roundtrip；生产精确六 Tool、Resources absent。App Refresh 与 Tag-create 负向路由在 global fail-closed 下通过，模型未丢弃 Tag 要求，真实库 exact-name 为 `not_found`；global/Project flags 已恢复为 `true/true`。详见 [Phase T1 Tag Discovery Acceptance](./PHASE_T1_TAG_DISCOVERY_ACCEPTANCE.md)。

Phase T2-A 审计确认官方/真实 API 提供 `Tag.byIdentifier`、`Task.addTags` 和 Task Tag ID readback。[Phase T2 Tag Assignment Design](./PHASE_T2_TAG_ASSIGNMENT_DESIGN.md) 第二版及 ADR-006 amendment 已通过独立评审，冻结 V3 ID-only contract、独立 flag、request-closure validation、ancestor-active/互斥、no-tag V2/tagged V3 split fingerprint、mutation-only ID readback、actual 6+ 与 tagged replay 语义。T2-B 隐藏内部实现和独立代码评审已通过；T2-C public Schema、handler gate、Instructions、protocol、App Refresh 和禁写客户端路由全部通过，详见 [T2-C Client Gate Acceptance](./PHASE_T2C_TAG_ASSIGNMENT_CLIENT_GATE_ACCEPTANCE.md)。T2-D 两条 Canary 均完成创建、验证、人工删除与双 `not_found`，详见 [T2-D Canary Acceptance](./PHASE_T2_TAG_ASSIGNMENT_CANARY_ACCEPTANCE.md)。T2-E 正式启用详见 [T2-E Formal Enablement Acceptance](./PHASE_T2_TAG_ASSIGNMENT_FORMAL_ENABLEMENT_ACCEPTANCE.md)。

2026-07-15 Phase 4 P4-A/P4-B：架构设计冻结 facts read/eligibility split、existing `action_group`-only 首版、Parent+Tag atomic prewrite、reason-deterministic retry 和 P4-A/B/C/D/E gates。P4-A fixed-script probe 在真实库证明 canonical roundtrip、Task kind、direct/effective completion/drop projection、parent/Project-root chain、Active Project、Folder ancestry 和 exact `not_found` 可被 bounded privacy-safe 表达，并修正 `task.children` 为 collection object。P4-B 按授权完成未发布、不可达 internals；真实库缺少 Dropped 样本的条件门已由 direct/effective/ancestor drop deterministic tests 闭合，但不宣称真实 Dropped 验收。公开 MCP Schema/handler/registration/instructions 均保持 V3，未执行 Parent JXA 或 OmniFocus mutation。详见 [Phase 4 Parent Placement Design](./PHASE4_PARENT_TASK_PLACEMENT_DESIGN.md)、[P4-A3 Read-Only Acceptance](./PHASE4_PARENT_TASK_FACTS_READONLY_ACCEPTANCE.md) 与 [P4-B Internal Implementation Acceptance](./PHASE4_PARENT_TASK_INTERNAL_IMPLEMENTATION_ACCEPTANCE.md)。

P4-C repository publication 随后按独立授权完成：源码 V4 input/output 发布 strict Inbox/Project/Parent union，Parent flag 缺失默认 false，handler 保持 global→destination-specific→Tag gate，Agent instructions/registration/local MCP wire tests 已更新。此阶段未部署、未 Refresh、未调用真实 Tool/JXA、未写 OmniFocus；生产事实仍为 V3。详见 [P4-C Fail-Closed Repository Acceptance](./PHASE4_PARENT_TASK_P4C_REPOSITORY_ACCEPTANCE.md)。

P4-C disabled deployment/App/UI acceptance 随后按独立授权通过：生产发布 V4，Parent flag 在 plist/loaded environment 中保持缺失，客户端 fresh exact read 后保留 Parent/Project/完整任务名并调用 Parent 分支，得到 `write_disabled.parent_placement_disabled` / `mayHaveWritten=false`。audit 单条 allowlisted 增量、Ledger 不变、lock absent、exact-name `not_found` 与 Tunnel health 均通过；零 Parent JXA、零 OmniFocus mutation。详见 [P4-C Disabled Client Acceptance](./PHASE4_PARENT_TASK_P4C_DISABLED_CLIENT_ACCEPTANCE.md)。

P4-D 随后按独立授权完成 exactly-one Parent Canary：one-process flag isolation、fresh Parent eligibility、单次创建、两次 exact readback、Parent/Project count deltas、Ledger/audit/lock、用户人工删除和 ID/name 双 `not_found` 均通过；公开 Tunnel Parent flag 全程 absent。用户在清理窗口另行删除一个无关 Project-root action，验收据此如实记录 aggregate count drift，并以 exact identity、Parent count 与 Project membership 独立证明 Canary 无残留。详见 [P4-D Parent Canary Acceptance](./PHASE4_PARENT_TASK_P4D_CANARY_ACCEPTANCE.md)。

P4-E 最终按独立授权通过：fail-closed 阶段加载 global/Project/Tag/Parent=`false/true/true/true`，最终 plist 与 loaded environment 均为 `true/true/true/true`；Tunnel healthy、health/ready、watchdog、权限和零 mutation 证据通过，Schema/tool surface 未变且无需 App Refresh。详见 [P4-E Parent Formal Enablement Acceptance](./PHASE4_PARENT_TASK_P4E_FORMAL_ENABLEMENT_ACCEPTANCE.md)。

## 当前生产边界

- 当前 global/Project/Tag/Parent=`true/true/true/true`；已启用创建 destination 为 Inbox、一个 exact Active Project，或一个 freshly-read exact eligible ordinary Action Group，可选 1–5 个符合约束的既有 Active Tag canonical IDs；
- 每个新创建意图必须使用新的 UUID `idempotencyKey`，透明 retry 复用同一 key；
- Project placement 仅接受真实只读发现的 canonical Project ID，写前实时验证且不得回落 Inbox；Tag assignment 仅接受 fresh `search_tags` 的 canonical IDs 并实时验证完整 Active ancestor chain、去重和互斥关系；Parent placement 仅接受 freshly-read exact eligible ordinary Action Group canonical ID，且不接受名称、模糊匹配、猜测或 fallback；既有 Task 的 Tag 编辑、repeat、notification、batch、update、move/reparent、complete 和 delete 仍不在范围；
- 新增任何 mutation 或放宽字段前必须重新走 ADR、测试、禁写 Canary 和独立生产门禁。

验收模板见 [Phase 1 Probes and Acceptance](./PHASE1_PROBES_AND_ACCEPTANCE.md)。历史方向见 [`create_task` 与 Tag 方向](../../history/evolution-summaries/create-task-and-tag-direction.md)。
