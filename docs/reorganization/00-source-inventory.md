# Source Inventory

> 盘点日期：2026-07-12
> Git 基线：`c7bda4efb87f5062ef2ace443c4cac90f150985b`
> 范围：仓库内当前可读取的 Markdown、文本和配置型记录；排除 `.git/`、`node_modules/`、生成的 `dist/`。
>
> 后续调整：原根目录 `PERSONALIZATION.md` 已在 Profile 重构后迁至
> `docs/history/personalization-v1-implementation-and-acceptance.md`；当前工程规则提炼至
> `docs/DEVELOPMENT.md`。2026-07-13 仓库卫生清理又将 Tunnel 手册从 `docs/` 迁至
> `tunnel/docs/`；下表中的原始计数仍代表本次盘点时点，路径列反映当前正式位置。

## 盘点口径

事实：目标格式文件共 23 个，其中 20 个 Markdown 是项目叙事、设计、使用或工程记录，另外 3 个是 `package.json`、`package-lock.json` 和 `tsconfig.json`，仅作为代码/构建证据，不属于对话或工程叙事记录。仓库内未发现 `.txt`、`.yaml` 或 `.yml` 记录。

判断：项目内主要是工程记录、冻结决策和整理后的说明文档，而不是完整原始 ChatGPT/Codex 对话。

建议：本轮对 20 个 Markdown 建立来源映射；配置文件继续原位作为代码事实，不纳入“对话文件”计数。

## 分类统计

| 分类 | 数量 | 说明 |
|---|---:|---|
| A. 原始对话或对话导出 | 0 | 未发现 User/Assistant 序列式原始聊天导出 |
| B. 对话整理稿 | 0 | 未发现明确由对话原文整理而成且保留逐轮来源的文件 |
| C. 工程执行日志 | 6 | `engineer_log/` 下的 Domain Tool 设计、实现与验收记录 |
| D. 设计与验收记录 | 2 | `README.md` 承担当前入口；原 `PERSONALIZATION.md` 已归档为 v1 实现与验收历史 |
| E. 架构决策 ADR | 5 | ADR-001 至 ADR-005，状态均为 Accepted |
| F. 用户使用文档 | 5 | Query 参考/示例、两份架构审计、Tunnel 运维手册 |
| G. Codex 一次性指令 | 0 | 仓库内未发现；`CHATGPT_APP_INSTRUCTIONS.md` 是运行时 App/Server 指令，不是一次性 Codex 工单 |
| H. 临时或来源不明文件 | 0 | 未发现“粘贴的 markdown”、未命名文档或重复导出 |
| 运行时指令/集成指南（单列） | 2 | ChatGPT App Instructions 与 GPT Tool Usage Guide |

> 同一文档可能同时具有“冻结设计”和“用户说明”属性。上表按主要用途互斥计数，总数为 20。

## 候选文件清单

| 当前路径 | 文件类型 | 主要主题 | 时间线位置 | 当前有效性 | 权威级别 | 重复关系 | 冲突关系 | 建议处理 | 证据 |
|---|---|---|---|---|---|---|---|---|---|
| `README.md` | 冻结设计与项目入口 | 四个 Domain Tool、日期语义、Profile、安全边界 | 2025-03 起；2026-07-12 当前基线 | 当前 | 冻结契约/项目入口 | 与 v1 历史、两份架构审计重叠 | Roadmap 未包含用户后续提出的 `create_task`，但不构成代码冲突 | KEEP；由 `docs/README.md` 导航 | 标题标记 `v1.0-personalized`；列出四个工具、Profile 与维护来源 |
| `docs/history/personalization-v1-implementation-and-acceptance.md` | 历史设计与验收记录 | Domain 模型、四工具、验收快照、未来复审边界 | 2026-07-10 至 2026-07-12 | 历史；数量是里程碑快照 | 工程汇总 | 与 README、工程日志和 ADR 大量重叠 | 早期 Snapshot 过程已由文内后续修订收束 | ARCHIVE；当前规则提炼至 `docs/DEVELOPMENT.md` | 保留完整 v1 实施顺序和验收上下文，不再作为当前入口 |
| `QUERY_TOOL_REFERENCE.md` | 用户使用文档 | `query_omnifocus` 参数、字段、过滤和输出 | 2025-08 起；2026-07-11 校准 | 当前 | 实现参考 | 与 Examples、GPT Guide 的 generic read 章节重叠 | `query_omnifocus` 不在 `personal-production` 当前集合；文档自身未声称属于该 Profile | KEEP | 2026-07-11 提交按当前代码更新日期过滤与输出说明 |
| `QUERY_TOOL_EXAMPLES.md` | 用户使用文档 | `query_omnifocus` 示例 | 2025-08 起；2026-07-11 校准 | 当前 | 使用示例 | 与 Reference 配套 | 同上；示例不是 Domain Tool 契约 | KEEP | 标题明确“当前用法示例” |
| `docs/Architecture_Audit.md` | 用户/架构文档 | 当前仓库结构、数据流、Domain、工具、风险、演进 | 2026-07-11；2026-07-12 更新 | 当前 | 最新综合架构审计 | 与 `_v1`、README、v1 历史重叠 | 第 8.10 节“Owner entity”是审计判断，不是已接受独立 Domain | KEEP；设为详细审计权威入口 | 含 16/4 Tool surface、结构化输出和最新 Profile 事实 |
| `docs/OmniFocus-Agent-MCP_Architecture_Audit_v1.md` | 用户/架构文档 | `v1.0-personalized` 精简审计快照 | 2026-07-12 | 当前快照 | 支持性审计 | 与 `Architecture_Audit.md` 高度重叠 | 文件名 `_v1` 不直观，易被误认为更权威或更旧 | KEEP；在导航中标注“精简快照” | 标题和结论聚焦 v1，未包含详细结构化输出审计 |
| `tunnel/docs/OmniFocus-MCP-Tunnel日常维护与新增Tool操作手册.md` | 用户/运维文档 | Tunnel、LaunchAgent、Profile、Tool 发布流程 | 2026-07-12 | 当前；机器环境细节需部署时复核 | 运维说明 | 与 GPT Guide/Profile 文档重叠 | 已同步 `personal-production`；实际运行时资产仍在仓库外 | MOVE；集中到可独立分离的根目录 `tunnel/` | 开头声明 macOS + launchd + Tunnel + personal-production 基线 |
| `docs/architecture/decisions/ADR-001-domain-first-architecture.md` | ADR | Domain-first 分层 | 2026-07-11 | 当前 | Accepted ADR | 与 README、审计重叠 | 无 | KEEP | 状态 Accepted；决策要求 Raw→Adapter→Domain→Tool |
| `docs/architecture/decisions/ADR-002-direct-owner-semantics.md` | ADR | Planned/Due direct ownership | 2026-07-11 | 当前 | Accepted ADR | 与 Snapshot 两份修订日志重叠 | 取代早期 inherited child fan-out 行为 | KEEP | 状态 Accepted；明确 inherited facts 保留但不重复生成 attention |
| `docs/architecture/decisions/ADR-003-task-action-boundary.md` | ADR | Action 留在 Task Domain | 2026-07-11 | 当前 | Accepted ADR | 与审计、v1 历史重叠 | 取代立即新增 `ActionView`/`get_action` 的讨论方向 | KEEP | 状态 Accepted；列出未来复审条件 |
| `docs/architecture/decisions/ADR-004-lean-snapshot-scope.md` | ADR | Lean/Full Snapshot 边界、独立截断 | 2026-07-11 | 当前 | Accepted ADR | 与 Snapshot 工程日志、v1 历史重叠 | 取代立即开发 Full Snapshot MCP 的旧倾向 | KEEP | 状态 Accepted；明确低频需求采用手动/plugin/file 导出 |
| `docs/architecture/decisions/ADR-005-ai-boundary.md` | ADR | AI analysis 与 mutation 分离 | 2026-07-11 | 当前 | Accepted ADR | 与 README、GPT Guide、App Instructions 重叠 | 与未来受控 `create_task` 方向存在待设计张力，但当前无已接受冲突 | KEEP | 状态 Accepted；写入须显式授权，不由分析自动触发 |
| `docs/integration/CHATGPT_APP_INSTRUCTIONS.md` | 运行时指令 | 四工具路由、事实/推断边界、写入拒绝 | 2026-07-12 | 当前 | 生产运行指令；低于代码/ADR | GPT Guide 的压缩版本 | 当前适用于 `personal-production` 的四工具只读集合 | KEEP | Design Notes 明确它也是 Server Instructions 规范内容且能力边界由注册表实现 |
| `docs/integration/GPT_TOOL_USAGE_GUIDE.md` | 集成指南 | Tool surface、路由、工作流、事实层级 | 2026-07-11；2026-07-12 更新 | 当前 | 完整使用规范 | 与 App Instructions、Query 文档和审计重叠 | 同时描述 full surface 与 readonly surface，读者需保留 Profile 上下文 | KEEP | 文内明确 Guide 与压缩 Instructions 的职责和冲突优先级 |
| `engineer_log/GET_TASK_ENGINEERING_LOG.md` | 工程执行日志 | `get_task` 设计、实现、验收 | 2026-07-10/11 | 当前历史 | 冻结工程记录 | 与 v1 历史 Task 章节、ADR-003 重叠 | 无 | KEEP；加入 engineer_log 索引 | 记录 Unit、server-side、Codex client acceptance |
| `engineer_log/GET_PROJECT_ENGINEERING_LOG.md` | 工程执行日志 | `get_project` 设计、实现、验收 | 2026-07-10/11 | 当前历史 | 冻结工程记录 | 与 v1 历史 Project 章节、ADR-002 重叠 | 无 | KEEP；加入索引 | 记录 canonical Project ID 和验收结果 |
| `engineer_log/GET_COMPLETED_SINCE_ENGINEERING_LOG.md` | 工程执行日志 | completion event 流、实现、验收 | 2026-07-10/11 | 当前历史 | 冻结工程记录 | 与 v1 历史 Completion 章节重叠 | 无 | KEEP；加入索引 | 明确 direct `completionDate` 和排除 project root event |
| `engineer_log/GET_LEAN_SNAPSHOT_ENGINEERING_LOG.md` | 工程执行日志 | Lean Snapshot 初始设计与验收 | 2026-07-10/11 | 部分被后续修订补充 | 历史工程基线 | 与两份 correction/granularity 日志、ADR-002/004 重叠 | 初始 child attention 行为被 Planned 与 Due 修订日志取代 | KEEP；在索引标注演进顺序 | 文内已指向后续 inherited Planned child fan-out 修订 |
| `engineer_log/GET_LEAN_SNAPSHOT_PLANNED_CORRECTION_ENGINEERING_LOG.md` | 工程执行日志 | Planned direct-owner 修订 | 2026-07-11 | 当前历史/冻结修订 | 最新相关验收记录 | 与 Snapshot 初始日志、ADR-002 重叠 | 取代初始 Planned fan-out 语义 | KEEP；在索引标注 supersedes 范围 | 记录 direct/inherited/future/boundary 分类和验收 |
| `engineer_log/GET_LEAN_SNAPSHOT_DUE_ATTENTION_GRANULARITY_ENGINEERING_LOG.md` | 工程执行日志 | Due direct-owner 修订 | 2026-07-11 | 当前历史/冻结修订 | 最新相关验收记录 | 与 Snapshot 初始日志、ADR-002 重叠 | 取代初始 inherited Due child attention 语义 | KEEP；在索引标注 supersedes 范围 | 里程碑提交 `1af4a33`；记录 project deadline 独立投影 |

## 外部提供但不在仓库内的材料

用户本轮提供了 `/Users/shixuerui/Desktop/03_codex_reorganize_omnifocus_mcp_project_conversations.md`。它是本轮一次性 Codex 工作指令，不是仓库当前历史材料；本清单将它作为盘点方法和任务证据引用，但不擅自复制、移动或改写桌面原件。

未发现、也无法访问未导出到工作区的 ChatGPT 云端历史对话、其他 ChatGPT Project 内的聊天或未挂载外部笔记。
