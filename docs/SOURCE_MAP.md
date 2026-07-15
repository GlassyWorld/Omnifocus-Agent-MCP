# 来源地图

> 本文件用途：说明不同类型问题应优先去哪里验证。
> 本文件是导航表，不是完整项目历史，也不替代代码、测试、ADR 或验收记录。

## 文件职责分层

- `AGENTS.md`：Codex 进入仓库后应如何工作。
- `docs/PROJECT_STATUS.md`：当前项目是什么状态。
- `docs/SOURCE_MAP.md`：遇到问题应去哪里找证据。
- ADR：为什么这样设计。
- Design docs：具体设计和阶段验收。
- Code + Tests：最终事实来源。

## 真实状态判断顺序

当来源之间出现冲突时，按以下顺序判断：

1. 当前代码与测试
2. 已接受 ADR 及其 amendment / 冻结契约
3. 最新验收记录
4. `docs/PROJECT_STATUS.md`
5. 设计文档
6. 历史草案、工程日志和过往讨论

历史文档用于解释决策背景，不自动代表当前能力。

## 问题类型与权威来源

| 问题 | 优先查看 | 辅助来源 | 说明 |
|---|---|---|---|
| 当前 `personal-production` Tool 数量 | `src/serverRegistration.test.ts` | `src/serverRegistration.ts`、`docs/PROJECT_STATUS.md` | 注册测试是最快的精确验证入口。 |
| 当前 Resource 边界 | `src/serverRegistration.test.ts` | `src/serverRegistration.ts` | `personal-production` 当前不暴露 Resources。 |
| 新增、删除或修改 MCP Tool | `src/serverRegistration.ts` | `src/serverRegistration.test.ts`、相关 Tool definition | Tool surface 变化必须从 registration 和精确集合测试开始确认。 |
| 当前 Profile 选择逻辑 | `src/config/serverProfile.ts` | `src/config/serverProfile.test.ts` | 默认行为由 resolver 代码定义。 |
| Domain-first 架构原则 | `docs/architecture/decisions/ADR-001-domain-first-architecture.md` | `docs/DEVELOPMENT.md`、`src/domain/**` | 不绕过 Adapter / Domain / Mapper 边界。 |
| AI 与 mutation 边界 | `docs/architecture/decisions/ADR-005-ai-boundary.md` | `src/serverInstructions.ts`、相关测试 | 分析、建议、计划不等于 mutation 授权。 |
| `create_task` 总体契约 | `docs/architecture/decisions/ADR-006-controlled-create-task-v1.md` + accepted amendments | `docs/design/create-task/README.md`、Phase acceptance docs | ADR-006 包含历史文本，阅读时必须结合 amendment 与当前状态。 |
| `create_task` 当前 public schema | `src/tools/definitions/createTask.ts` | `src/domain/taskCreation/*Schemas.ts`、`src/serverRegistration.test.ts` | wire schema 必须保持 strict 且 client-visible。 |
| `create_task` runtime 行为 | `src/domain/taskCreation/` | Ledger、verifier、service、primitive tests | 保持 feature gates、Ledger、lock、verification、错误语义。 |
| mutation error semantics | `src/domain/taskCreation/createTaskErrors.ts` | Ledger、verifier、service tests | 重点确认 `mayHaveWritten`、`retrySafe`、fail-closed、partial success 和 replay 语义。 |
| Tag discovery | `src/domain/tag/**` | `src/tools/definitions/searchTags.ts`、相关测试 | `search_tags` 是只读发现，不是写入授权。 |
| Parent placement | `src/domain/taskCreation/` 中 parent-related modules | Phase 4 design / acceptance docs | 当前仅允许 parent kind 为 Action Group 的 ordinary parent placement。Leaf Action parent placement is intentionally deferred and requires separate design review. |
| `upstream-full` 兼容能力 | `src/serverRegistration.ts` | `src/serverRegistration.test.ts` | `upstream-full` 更宽，不代表生产默认能力。 |
| 默认开发验证 | `docs/DEVELOPMENT.md` | `package.json`、`vitest.config.ts` | 默认验证是 build、unit tests、diff check。 |
| 真实 OmniFocus 验收 | 相关 Phase acceptance docs | integration tests、Tunnel/LaunchAgent 运维文档 | 真实写入、canary、部署操作必须单独授权。 |
| Tunnel / LaunchAgent 状态 | Tunnel 运维文档与实时检查 | acceptance docs | 运行时状态可能漂移，不能只靠仓库文档断言。 |

## 修改类型快速入口

### 新增或修改 MCP Tool

先阅读：

- `docs/PROJECT_STATUS.md`
- `src/serverRegistration.ts`
- `src/serverRegistration.test.ts`
- 相关 Tool definition
- 相关 Domain / primitive / schema tests

注意：

- 不要从已有 primitive 推断可以进入 `personal-production`。
- 不要把 `upstream-full` 能力当作生产默认能力。
- Tool surface 变化必须更新精确注册测试。

### 修改 `create_task`

先阅读：

- `docs/PROJECT_STATUS.md`
- `docs/architecture/decisions/ADR-006-controlled-create-task-v1.md` + accepted amendments
- `docs/design/create-task/README.md`
- `src/tools/definitions/createTask.ts`
- `src/domain/taskCreation/`
- Ledger / idempotency 相关测试
- verifier / readback verification 相关测试
- protocol / registration schema tests

注意：

- 保持 strict schema。
- 保持 feature gates、Ledger、mutation lock、exact readback verification。
- 保持 `mayHaveWritten`、`retrySafe`、fail-closed 和 replay 语义。
- 不引入 generic mutation executor。

### 修改生产能力边界

先阅读：

- `docs/PROJECT_STATUS.md`
- `docs/SOURCE_MAP.md`
- 相关 ADR
- 相关 design / acceptance docs
- `src/serverRegistration.ts`
- `src/serverRegistration.test.ts`

注意：

- 生产能力变化必须能被代码、测试和当前状态文档共同证明。
- 不要只更新说明文档而不更新 registration tests。
- 不要只依赖客户端指令形成安全边界。

### 修改运行时部署或运维流程

先阅读：

- Tunnel / LaunchAgent 运维文档
- 相关 acceptance docs
- 当前 runtime 检查结果

注意：

- 运行时状态可能与仓库代码不同。
- 涉及真实 OmniFocus canary、生产 flag、LaunchAgent 或 Tunnel 修改时，必须单独获得明确授权。

### 修改 Domain read 语义

先阅读：

- 相关 ADR
- `docs/DEVELOPMENT.md`
- 对应 `src/domain/**`
- 对应 Tool definition
- adapter / mapper / schema / composer tests

注意：

- 不要让 MCP handler 承担核心业务语义。
- 不要因为输出缺字段而直接暴露 generic raw query。
- direct / effective / source 语义必须保持可测试。

## 当前关键事实摘要

截至 `docs/PROJECT_STATUS.md` 记录日期：

- `personal-production` 是当前生产 Profile。
- `personal-production` 当前暴露五个 read tools。
- `personal-production` 当前暴露一个 mutation tool：`create_task`。
- `create_task` is the only mutation capability exposed by `personal-production`.
- `create_task` 支持在创建阶段写入 task note。
- `personal-production` 当前不暴露 Resources。
- `upstream-full` 保留更宽的 upstream-compatible surface，但必须显式选择。
- Phase 4 Parent Task placement production enablement 已记录为完成。
- Parent placement 完成不授权 generic CRUD、名称解析、模糊匹配、fallback、edit、move、complete、delete、batch、repeat 或 notifications。

## 常见漂移风险

- ADR-006 同时包含 V1 历史设计和后续 amendment，不能只读旧段落判断当前能力。
- Phase design 文档可能记录的是当时阶段边界，不一定代表当前生产状态。
- 运行时 flag、Tunnel、LaunchAgent 状态可能不同于仓库代码，涉及生产状态时必须实时验证。
- `upstream-full` 中存在 mutation tools，但不能推断为 `personal-production` 能力。
- `search_tags` 返回的是发现事实，不是长期 mutation token。
- `create_task` 的目标和 Tag 必须在 mutation 前重新验证，不能依赖旧聊天、缓存或历史截图。

## 更新规则

以下情况需要更新本文件：

- 新增或替换某类问题的权威来源
- Tool / Resource / Profile 边界变化
- 某个旧文档被明确 supersede
- `docs/PROJECT_STATUS.md` 的结构或职责变化
- 未来 `AGENTS.md` 引入新的必读顺序

保持本文件短小。详细证据应放在 ADR、设计文档、验收记录和工程日志中。
