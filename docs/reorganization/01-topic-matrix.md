# Topic Matrix

> 本矩阵区分事实、判断和建议。代码/测试证据优先于 ADR、验收记录、工程日志和讨论性说明。

| 主题 | 当前事实 | 当前权威文件 | 支持文件 | 已废弃/被取代材料 | 尚未解决的问题 | 下一步依赖 |
|---|---|---|---|---|---|---|
| 项目选型与上游仓库调研 | 当前个性化层基于 upstream `v1.9.2`；仓库内没有独立外部仓库调研记录 | `README.md`、`package.json`、Git 历史 | v1 实现与验收历史 | 未发现当前文件 | 若需重新选型，缺少可追溯研究档案 | 先新增研究任务和来源记录 |
| 工程架构与 Domain-first 原则 | Raw→Adapter→Domain→Tool；handler 不承载核心语义 | ADR-001、`src/domain/`、Domain tests | README、两份架构审计 | 直接把 Raw/query 结果当个性化契约的方向已拒绝 | 新写能力如何复用 Domain-first | 先设计 mutation Domain 与授权边界 |
| `get_task` | 已实现、测试并属于 `personal-production` 当前四工具之一 | `src/domain/task/`、相关 tests、Tool definition | `GET_TASK_ENGINEERING_LOG.md`、README | 独立 `ActionView`/`get_action` 当前拒绝 | 无当前缺口被承诺 | 维护结构化输出与冻结语义 |
| `get_project` | 已实现、测试并使用 canonical Project ID | `src/domain/project/`、相关 tests、Tool definition | `GET_PROJECT_ENGINEERING_LOG.md`、README | 无 | 无当前缺口被承诺 | 维护 aggregate 与 direct owner 语义 |
| `get_completed_since` | 已实现 direct completion event 流；排除 Project root completion | `src/domain/completion/`、相关 tests、Tool definition | 工程日志、README | 用状态或 modification date 推导完成事件的做法被排除 | 趋势分析仍属于 AI/后续流程 | 由真实 review 需求驱动 |
| `get_lean_snapshot` | 已实现 active/planned/deadline/attention/inbox；各 section 独立截断 | `src/domain/snapshot/`、tests、ADR-004 | 三份 Snapshot 工程日志、README | 初始 Planned/Due inherited child fan-out 被后续两份修订日志取代 | Full Snapshot 未承诺 | 保持 Lean/Full 边界；按真实需求复审 |
| Due / Planned / Defer 日期语义 | 保存 direct/effective/source；只有 direct owner 生成 Planned/Due visibility | ADR-002、Domain tests | v1 实现与验收历史、Snapshot 修订日志 | inherited child 重复 attention 已被取代 | 未来写入时如何校验日期来源尚未设计 | mutation 方案必须复用既有 date semantics |
| 截断与完整性 | section 先计算完整 total，再独立截断；deadline/planned 不从截断后的 active items 派生 | ADR-004、Snapshot tests | README、工程日志 | 从已截断 active 列表派生其他 section 的方案已拒绝 | Full Snapshot 的体积与完整性策略未设计 | 明确 Contract 后再评审 Full Snapshot |
| 事实 / 判断 / 建议边界 | Domain 输出事实；AI 可分析但不得把推断写成事实 | ADR-001、ADR-005、Server Instructions tests | GPT Guide、App Instructions | 在 Domain 内生成 health/risk/priority/recommendation 已拒绝 | 未来生产写入的 preview 如何表达建议与意图 | 设计显式 preview/confirmation envelope |
| AI mutation 边界 | `personal-production` 当前不注册 mutation；`upstream-full` 仍有 7 个 mutation tools | `src/serverRegistration.ts` 及 tests、ADR-005 | README、审计、GPT Guide | “仓库已完全移除写入”是错误表述 | 受控个人生产写入尚未设计 | 定义授权、审计、幂等、失败/回滚 |
| Profile 架构 | 仅有 `personal-production` 与 `upstream-full`；空值默认 production | `src/config/serverProfile.ts`、`src/serverRegistration.ts` 及 tests | README、运维手册 | 旧 `personal-readonly` 名称与空值默认 full | 未来受控写入如何进入精选集合 | 维护显式 profiles allowlist 和精确集合测试 |
| `personal-production` 重构 | 当前代码和仓库文档均不存在该 Profile | Profile/registration 代码、全文搜索 | 本轮外部指令提出它是后续工作 | 无可归档实现材料 | 能力集合、授权模型、命名迁移、部署切换均未设计 | 单独开启重构设计/实现任务；本轮不实施 |
| `create_task` V1 | 当前不存在名为 `create_task` 的 Tool 或设计文档；upstream 有 `add_omnifocus_task` | `src/serverRegistration.ts`、Tool definitions、全文搜索 | ADR-005 | “立即实现”不构成当前仓库承诺；本轮要求先设计 | 输入契约、查重、Tag 选择、preview/confirm、幂等与审计 | 先建立 `docs/design/create-task/` 设计，不写代码 |
| Tag 读取与既有 Tag 选择 | `list_tags` primitive/tool 已存在，但仅在 `upstream-full` 注册；`create_tag` 也是 full-only mutation | registration 代码/tests、listTags implementation | Architecture Audit、GPT Guide | “Tag V1 完全不支持”若指仓库 primitive 已过时；若指个人 Domain surface 则仍为事实 | personal-production 是否只允许选择既有 Tag，如何解析层级/重名 | 与 create_task V1 一并设计，不能夸大为已实现 |
| 测试与验收 | 四个 Domain Tool 有 unit/fixture、server-side 和历史 client acceptance；当前描述符有 outputSchema 测试 | 当前 tests、CI config | 工程日志、Architecture Audit | 历史实时数量不是当前数据库事实 | 新 Profile/写 Tool 需新的安全与集成验收 | 设计验收矩阵后再实施 |
| ChatGPT App / Tunnel / LaunchAgent 部署 | 当前生产说明使用 `personal-production`；代码空值也安全默认该值 | Tunnel 手册、App Instructions、registration 代码 | GPT Guide、README | 仅靠 App Instructions 约束能力已被 server-side boundary 取代 | 实际 LaunchAgent/App 迁移和回滚需人工执行 | build 后 bootout/bootstrap、readyz、Refresh 和四工具验收 |
| 后续路线图 | 当前仓库承诺的是维护冻结契约；Profile 重构已完成，create_task 仍待设计 | README Future Roadmap、PROJECT_STATUS、v1 历史末尾 | ADR 复审条件 | 讨论方向不等于已决定能力 | create_task 的验收和迁移窗口 | 先设计并验收 create_task V1，除非另有决策 |

## 判断

现有文档体系的核心问题不是“原始对话太多”，而是同一事实曾分散在 README、原 `PERSONALIZATION.md`、两份架构审计、集成指南和工程日志中。当前已将工程规则提炼至 `docs/DEVELOPMENT.md`，并把完整 v1 汇总归档到 history，降低历史阶段被误当成当前语义的风险。

## 建议

保留所有原文路径；用 `docs/README.md`、`docs/PROJECT_STATUS.md` 和 `docs/SOURCE_MAP.md` 建立单一导航层。对 Snapshot 演进和 Profile/写入边界生成主题总结，不移动工程日志。
