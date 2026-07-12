# Actual Reorganization Plan

> 状态：阶段 A 完成后形成，并在 Profile 重构后补充文档职责拆分
> 基线：`c7bda4efb87f5062ef2ace443c4cac90f150985b`
> 原则：保留原文、增加导航、建立来源映射，不为了目录整齐而移动稳定路径。

## 1. 当前状态结论

### 事实

- 扫描到 23 个目标格式文件：20 个 Markdown 项目记录，3 个配置/构建 JSON。
- 20 个 Markdown 中，原始对话 0、对话整理稿 0、工程日志 6、冻结设计/验收 2、ADR 5、用户文档 5、运行时指令/集成指南 2。
- 一次性 Codex 指令在仓库内为 0；本轮指令由用户从 Desktop 外部提供。
- 临时、未命名或来源不明文件为 0。
- 起始工作树干净，没有未提交改动。
- 当前最重要的权威来源是当前代码与测试、5 份 Accepted ADR、README、PROJECT_STATUS、
  `docs/DEVELOPMENT.md`，以及最新 Snapshot 修订日志；v1 完整汇总已转为历史来源。

### 判断

主要问题是权威入口分散，而不是原始对话文件混乱。`Architecture_Audit.md` 与 `_v1` 审计重叠；Lean Snapshot 初始日志与后续 Planned/Due 修订形成时间线；Profile、App、Tunnel 说明分散在多个文档。现有路径已被 README、审计、集成指南和运维手册互相引用，移动会增加死链和外部链接风险。

### 建议

当前入口和工程规则从历史汇总中提炼；完整 v1 原文保持内容连续性并移入 history。导航、
状态、来源层和演进总结继续负责解释权威顺序。

## 2. 最终目录方案

根据实际只有 20 份 Markdown，采用精简结构：

```text
docs/
├── README.md                         # 新增统一导航
├── PROJECT_STATUS.md                 # 新增当前事实状态
├── SOURCE_MAP.md                     # 新增结论到来源映射
├── DEVELOPMENT.md                    # 当前 Domain Tool 工程规范
├── Architecture_Audit.md             # 原位保留，详细主审计
├── OmniFocus-Agent-MCP_Architecture_Audit_v1.md
├── OmniFocus-MCP-Tunnel日常维护与新增Tool操作手册.md
├── architecture/
│   └── decisions/                    # 5 份 Accepted ADR 原位保留
├── design/
│   ├── README.md                     # 新增后续设计边界入口
│   ├── personal-production/README.md # 仅状态/范围，不提前设计实现
│   └── create-task/README.md          # 仅状态/范围，不提前设计实现
├── history/
│   ├── personalization-v1-implementation-and-acceptance.md
│   └── evolution-summaries/          # 新增演进总结；不冒充原始对话
├── integration/                      # App Instructions 与完整 Guide 原位保留
└── reorganization/                   # 本次盘点、矩阵、冲突和方案

engineer_log/
├── README.md                         # 新增阅读顺序与 Domain 映射
└── GET_*_ENGINEERING_LOG.md          # 6 份原文原位保留
```

不创建 `research/`、`instructions/`、`history/raw/`、`history/unclassified/` 或拆分的 `engineering/` 树，因为当前没有对应原始材料，创建空目录会暗示不存在的内容。

## 3. 文件处理映射

| 处理 | 旧路径 | 新路径或结果 | 理由 |
|---|---|---|---|
| KEEP | `README.md` | 原位 | 项目入口和冻结基线，已有历史/外部链接 |
| MOVE + ARCHIVE | `PERSONALIZATION.md` | `docs/history/personalization-v1-implementation-and-acceptance.md` | 保留完整历史上下文，但不再与 README 竞争当前权威；当前工程规则提炼至 `docs/DEVELOPMENT.md` |
| KEEP | `QUERY_TOOL_REFERENCE.md` | 原位 | upstream generic read 的稳定参考路径 |
| KEEP | `QUERY_TOOL_EXAMPLES.md` | 原位 | 与 Reference 配套 |
| KEEP | `docs/Architecture_Audit.md` | 原位 | 当前详细架构审计主入口 |
| KEEP | `docs/OmniFocus-Agent-MCP_Architecture_Audit_v1.md` | 原位 | 精简 v1 快照；用导航消除名称歧义 |
| KEEP | `docs/OmniFocus-MCP-Tunnel日常维护与新增Tool操作手册.md` | 原位 | 环境操作手册，路径可能被人工流程引用 |
| KEEP | `docs/architecture/decisions/ADR-001-domain-first-architecture.md` | 原位 | Accepted ADR |
| KEEP | `docs/architecture/decisions/ADR-002-direct-owner-semantics.md` | 原位 | Accepted ADR |
| KEEP | `docs/architecture/decisions/ADR-003-task-action-boundary.md` | 原位 | Accepted ADR |
| KEEP | `docs/architecture/decisions/ADR-004-lean-snapshot-scope.md` | 原位 | Accepted ADR |
| KEEP | `docs/architecture/decisions/ADR-005-ai-boundary.md` | 原位 | Accepted ADR |
| KEEP | `docs/integration/CHATGPT_APP_INSTRUCTIONS.md` | 原位 | 当前运行时 App/Server 指令规范 |
| KEEP | `docs/integration/GPT_TOOL_USAGE_GUIDE.md` | 原位 | 当前完整 Tool routing 规范 |
| KEEP | `engineer_log/GET_TASK_ENGINEERING_LOG.md` | 原位 | 稳定工程历史 |
| KEEP | `engineer_log/GET_PROJECT_ENGINEERING_LOG.md` | 原位 | 稳定工程历史 |
| KEEP | `engineer_log/GET_COMPLETED_SINCE_ENGINEERING_LOG.md` | 原位 | 稳定工程历史 |
| KEEP | `engineer_log/GET_LEAN_SNAPSHOT_ENGINEERING_LOG.md` | 原位 | 初始 Snapshot 工程历史，后续修订需保留上下文 |
| KEEP | `engineer_log/GET_LEAN_SNAPSHOT_PLANNED_CORRECTION_ENGINEERING_LOG.md` | 原位 | Planned 修订冻结证据 |
| KEEP | `engineer_log/GET_LEAN_SNAPSHOT_DUE_ATTENTION_GRANULARITY_ENGINEERING_LOG.md` | 原位 | Due 修订冻结证据 |
| INDEX | 上述全部原文 | `docs/README.md`、`docs/SOURCE_MAP.md`、`engineer_log/README.md` | 提供权威顺序、主题入口和演进顺序 |
| SYNTHESIZE | Domain ADR、工程日志、代码事实 | `docs/history/evolution-summaries/domain-tool-evolution.md` | 总结四工具演进，不替代原件 |
| SYNTHESIZE | Snapshot 日志、ADR-002/004、tests | `docs/history/evolution-summaries/date-semantics-evolution.md` | 标注 direct-owner 转折和被取代行为 |
| SYNTHESIZE | ADR-005、Profile 代码、集成/运维文档 | `docs/history/evolution-summaries/profile-and-ai-boundary-evolution.md` | 区分行为指导与能力边界 |
| SYNTHESIZE | registration、ADR-005、本轮后续方向 | `docs/history/evolution-summaries/create-task-and-tag-direction.md` | 记录现状和待设计问题，不虚构历史对话 |

阶段 A 未执行 MOVE、RENAME 或 ARCHIVE；Profile 重构后的文档职责复审授权了上述单文件归档。

## 4. 内容保真策略

- v1 原文完整归档，不删除历史验收事实；只增加文档角色说明并修正已明确迁移的 Profile 事实。
- 综合文档只做摘要，并在每节列出仓库相对路径来源。
- 代码事实、分析判断和后续建议使用明确小节或句首标签分开。
- 被取代的内容不从原日志删除；在索引、冲突清单和演进总结中标注具体被取代范围。
- 历史验收数量标为“当时快照”，不转换为当前数据库状态。
- 外部 Desktop 指令不复制进仓库，不把它冒充项目历史记录。

## 5. 执行顺序

1. 已建立 `docs/reorganization/` 和阶段 A 文件。
2. 写入本实际方案，冻结本轮的 KEEP/INDEX/SYNTHESIZE 决策。
3. 新增 docs 和 engineer_log 导航及来源映射。
4. 新增四份主题总结和两个后续设计状态页。
5. 校验所有来源路径和 Markdown 相对链接。
6. 搜索 `engineer_log/`、`personal-readonly`、`create_task`/`create-task` 一致性。
7. 执行 `git status --short`、`git diff --stat`、`git diff --name-status`、`git diff --check`。
8. Profile 重构后新增 `docs/DEVELOPMENT.md`，归档 v1 汇总，并更新全部内部引用。

阶段 A 没有 MOVE/RENAME；后续归档必须同时完成链接检查，不能留下根目录旧路径引用。

## 6. 风险与停止条件

| 风险 | 当前判断 | 处理 |
|---|---|---|
| 文件被代码或人工流程硬编码引用 | 代码无引用；Markdown 引用可穷尽，外部引用无法穷尽 | 更新全部仓库引用，并让 Git 历史保留旧路径 |
| 同一文件兼具多个用途 | 原 `PERSONALIZATION.md` 同时包含当前规则与历史验收 | 当前规则提炼至 DEVELOPMENT，完整原文归档并标记非当前权威 |
| 无法判断两份 Audit 谁应删除 | 两者都在当前提交历史中且粒度不同 | 两者保留，指定主入口/精简快照 |
| 未导出云端对话缺失 | 已确认本地无原始导出 | 最终报告明确范围限制 |
| Profile/create_task 未来方向被误写成当前事实 | 当前仓库无实现/设计 | 状态页单列“待设计”，本轮不实施 |
| 新增文档意外造成业务变更 | 本轮只允许 `.md` 新文件 | 最终按 Git name-status 校验，若出现非文档变更立即核对来源 |

停止条件：若后续校验发现原文用途不明、非文档差异、现有用户改动或链接无法可靠判断，则停止任何结构调整，维持本方案的“原文件保留 + 新索引和摘要”。
