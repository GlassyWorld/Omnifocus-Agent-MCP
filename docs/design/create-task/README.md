# create_task V1/V2 Status

## 当前事实

- [ADR-006](../../architecture/decisions/ADR-006-controlled-create-task-v1.md) 已接受 Inbox-only `create_task` V1 架构和 Phase 2/4 演进边界。
- Phase 1 已实现 strict contract、semantic canonicalization、永久 tombstone Ledger、global mutation lock、safe no-shell JXA executor、Inbox-only primitive、exact Task readback verifier、compact handler 及 deterministic tests。
- `create_task` 已加入 `personal-production`；Profile 代码表面为四个 read Tool 加一个受 feature flag 保护的创建 Tool。corrected Schema Refresh/禁写门禁通过后，Checkpoint 7 已正式恢复生产 LaunchAgent flag=`true`。
- `upstream-full` 已有 `add_omnifocus_task` mutation tool，但它不是自动成立的未来 V1 契约。
- `list_tags` 和 `create_tag` 只在 `upstream-full` 注册；个人 Profile 中没有 Tag Tool。
- ADR-005 要求分析与写入分离，并把授权、确认、审计、失败/回滚和重复保护作为 mutation gateway 的复审条件。
- Phase 2A Project placement 设计已通过评审；Phase 2B 实现、禁写客户端门禁、隔离生产 Canary、人工清理和 fail-closed 正式启用均已通过。公开 Project-specific flag 已加载为 `true`。

## 当前判断

V1 已完成 corrected Schema 的正式生产部署与 Checkpoint 7 全部验收。只有 `OMNIFOCUS_CREATE_TASK_ENABLED=true` 才能进入 Ledger/mutation service；当前生产值为 `true`，缺失、空值或其他值仍会在 Ledger/lock/JXA 前返回 `write_disabled`。

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

## 当前生产边界

- 正式公开路径仅在用户明确要求时创建一个 Task，destination 必须显式为 Inbox 或一个 exact Active Project；
- 每个新创建意图必须使用新的 UUID `idempotencyKey`，透明 retry 复用同一 key；
- Project placement 仅接受真实只读发现的 canonical Project ID，写前实时验证且不得回落 Inbox；parent、Tag、repeat、notification、batch、update、complete 和 delete 仍不在范围；
- 新增任何 mutation 或放宽字段前必须重新走 ADR、测试、禁写 Canary 和独立生产门禁。

验收模板见 [Phase 1 Probes and Acceptance](./PHASE1_PROBES_AND_ACCEPTANCE.md)。历史方向见 [`create_task` 与 Tag 方向](../../history/evolution-summaries/create-task-and-tag-direction.md)。
