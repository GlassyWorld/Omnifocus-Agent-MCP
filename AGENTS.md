# AGENTS.md

本文件用于指导 Codex / AI coding agent 在本仓库中工作。

本仓库是一个 safety-controlled OmniFocus MCP Server。任何修改都必须优先保持：

- 受控 mutation
- 显式用户授权
- Domain correctness
- 可验证行为
- fail-closed 安全边界

## 先读文件

开始修改前，先阅读：

- `docs/PROJECT_STATUS.md`
- `docs/SOURCE_MAP.md`

如果涉及具体功能，再阅读对应 ADR、设计文档和测试。

## 语言与沟通

默认使用中文进行对话、工作更新、审计结论和面向维护者的说明。代码标识符、命令、错误码、外部英文原文或已有英文规范可保持原文；用户明确要求英文时再切换。

## 真实状态判断

遵循 `docs/SOURCE_MAP.md` 中定义的真实状态判断顺序。

不要把旧 Phase 文档中的限制直接理解为当前能力。旧文档可能描述的是当时阶段边界，而不是当前生产状态。

## 当前生产边界

`personal-production` 是当前生产 Profile。当前生产 MCP surface 以 `docs/PROJECT_STATUS.md` 和注册测试为准。

稳定约束：

- `personal-production` 不暴露 Resources。
- `create_task` 是当前唯一允许进入 `personal-production` 的 mutation capability。
- `upstream-full` 是更宽的兼容 surface，不代表生产默认能力。
- 不得从已有 primitive、legacy Tool 或 `upstream-full` 能力推断可以进入 `personal-production`。

涉及 Tool / Resource / Profile 变化时，必须检查：

- `src/serverRegistration.ts`
- `src/serverRegistration.test.ts`

## 架构边界

保持 Domain-first 架构：

```text
Raw Query
-> Strict Adapter
-> Domain Semantics
-> Mapper / Composer
-> MCP Tool
```

规则：

- MCP handler 不承载核心业务语义。
- 不绕过 Adapter、Domain schema、Mapper、Composer 或 verifier。
- 不因为 Tool 输出缺字段而直接暴露 generic raw query。
- direct / effective / source 语义必须保持可测试。
- Domain 层表达事实，不写入 AI recommendation、priority、risk 或 health 判断。

## Change Scope

默认保持小范围修改，优先解决当前目标问题，并沿用现有架构边界。

未经明确要求，不进行：

- 大规模重构
- 目录重组
- API 统一
- 抽象层合并
- 将相邻但未授权的能力顺手纳入本次改动

如果发现更大的结构问题，先记录和说明，不要把它混入当前任务。

## Mutation 安全边界

不要把分析、建议、计划、推断或未来意图转换为 mutation。

任何新增或扩展 mutation 能力，必须先有明确设计评审，并满足：

- 显式用户授权
- 有限 mutation set
- preview / confirmation 或等价的目标绑定证据
- auditability
- fail-closed 行为
- 幂等 / replay / duplicate protection
- 写后 verification
- 清晰的 `mayHaveWritten` / `retrySafe` 语义

未经明确设计批准，禁止：

- generic CRUD framework
- generic mutation executor
- name/path mutation resolver
- fuzzy matching
- fallback 到 Inbox / Project
- 自动创建 Tag
- 静默省略用户要求的 Tag
- edit / move / reparent / complete / delete existing task
- batch CRUD
- repeat / notifications

## `create_task` 修改规则

修改 `create_task` 前，必须阅读：

- `docs/PROJECT_STATUS.md`
- `docs/SOURCE_MAP.md`
- `docs/architecture/decisions/ADR-006-controlled-create-task-v1.md` + accepted amendments
- `docs/design/create-task/README.md`
- `src/tools/definitions/createTask.ts`
- `src/domain/taskCreation/`
- Ledger / idempotency 相关测试
- verifier / readback verification 相关测试
- protocol / registration schema tests

必须保持：

- strict public schema
- explicit destination
- feature gates
- Ledger / replay semantics
- mutation lock
- exact readback verification
- fail-closed disabled response
- `mayHaveWritten` / `retrySafe` error semantics

`create_task` 当前支持在创建阶段写入 task note；不要在 schema 或文档同步中遗漏。

Parent placement 当前仅允许 parent kind 为 Action Group 的 ordinary parent placement。Leaf Action parent placement is intentionally deferred and requires separate design review.

## 修改 MCP Tool Surface

新增、删除或修改 MCP Tool 前，必须阅读：

- `docs/PROJECT_STATUS.md`
- `docs/SOURCE_MAP.md`
- `src/serverRegistration.ts`
- `src/serverRegistration.test.ts`
- 相关 Tool definition
- 相关 Domain / primitive / schema tests

Tool surface 变化必须同步更新精确注册测试。不要只更新说明文档。

## 修改运行时部署或运维

涉及真实 OmniFocus canary、生产 flag、LaunchAgent、Tunnel 或部署流程时，必须单独获得明确授权。

运行时状态可能不同于仓库代码；涉及生产事实时必须实时验证，不能只靠仓库文档断言。

## 修改本文件

修改 `AGENTS.md` 本身前：

- 先确认 `docs/PROJECT_STATUS.md` 和 `docs/SOURCE_MAP.md` 没有更合适的承载位置。
- 不要将临时任务要求写入本文件。
- 不要写入短期 Phase 状态。
- 不要复制长篇 ADR、设计文档或当前状态表。

本文件只保存长期稳定的 Codex 工作护栏。

## 默认验证

普通代码或文档同步完成后，默认验证：

```bash
npm run build
npm test
git diff --check
```

如果只是文档导航或纯说明文字，可至少运行：

```bash
git diff --check
```

真实 OmniFocus integration、生产 canary 或实际 mutation 验收不属于默认验证，必须单独授权。

## Git 纪律

- 不要回滚用户已有改动。
- 不要把无关文件混入提交。
- 不要提交 runtime logs、local plist、Ledger state、临时 canary 产物或本地敏感配置。
- 如果要提交，优先保持小而原子的 commit。
