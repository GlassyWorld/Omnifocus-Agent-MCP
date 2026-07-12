# Project Status

> 状态日期：2026-07-12
> 代码基线：`a22b89489410aadd6aad61b69fbfcb60523f66f6` 加当前未提交 Profile refactor

本页只记录当前可由代码、测试、Accepted ADR 或已冻结文档支持的状态，不把后续方向写成已实现能力。

## 已完成

- Task、Project、Completion 和 Lean Snapshot 四个 Domain Layer。
- `get_task`、`get_project`、`get_completed_since`、`get_lean_snapshot` 四个 Domain read tools。
- 四个 Domain Tool 的成功输出 `outputSchema`、运行时验证 `structuredContent` 和兼容 JSON 文本输出。
- Planned/Due direct-owner 语义；inherited facts 保留但不生成重复 attention。
- Lean Snapshot 的独立 section、完整 total、确定性排序和独立截断。
- `personal-production` server-side curated capability boundary：当前只注册四个 Domain read tools 且不注册 Resources；未设置环境变量时默认使用该 Profile。
- `upstream-full` 兼容 Profile：保留 16 个 tools、6 个 Resources，其中包括 7 个 mutation tools。
- 当前 GPT Tool routing、ChatGPT App Instructions 和 Tunnel/LaunchAgent 运维文档。

## 进行中

- `personal-production` 重构已在当前工作树实现并通过 build、完整 tests、diff check 和 production audit；尚未 commit/push，部署配置尚未人工迁移。
- 当前没有其他由仓库证据表明正在实施的业务代码重构。

## 已决定但未实施

- Full Snapshot MCP 当前暂缓；低频完整分析走手动/plugin/file 导出，只有真实重复需求出现才复审。
- Action 暂时留在 Task Domain；没有独立 `ActionView` 或 `get_action`。
- 任何未来显式 mutation gateway 必须先定义用户授权、preview/confirmation、有限 mutation set、审计、失败/回滚和重复保护。

## 待设计

- `create_task` V1：仅处于待设计状态；当前不存在名为 `create_task` 的 Tool。不能把 upstream `add_omnifocus_task` 自动等同于未来 V1 契约。
- 个人生产 Tag 能力：仓库已有 full-only `list_tags` primitive/tool 可供研究；既有 Tag 选择、层级/重名处理和是否公开为个人生产读能力尚未设计。

## 明确不在当前范围

- 本轮只修改 Profile 配置、注册模型、Server Instructions、测试和文档，不修改 Domain Schema、Transport、Tunnel 或 LaunchAgent。
- 本轮不设计或实施 `create_task` 具体契约。
- 本轮不执行任何 OmniFocus 写入。
- 当前没有承诺 AI 自动决策、自动创建/编辑/完成/删除或把分析结果自动写回 OmniFocus。

## 当前节点

| 工作项 | 当前状态 | 证据 |
|---|---|---|
| `personal-production` | 当前工作树已实现；默认 Profile；当前四个 Domain read tools、无 Resources | profile/registration 代码与测试、运维文档 |
| 旧 `personal-readonly` 值 | 已移除且不提供 alias；部署时必须人工迁移 | resolver invalid-value tests、部署提醒 |
| `create_task` V1 | 仅待设计；尚未实施 | 当前仓库无该标识符/设计文件；ADR-005 给出 mutation 复审门槛 |
| Tag | full-only `list_tags`/`create_tag` 已存在；个人生产 Tag Tool 未正式设计/实施 | registration 代码与测试 |

详细证据见 [SOURCE_MAP.md](./SOURCE_MAP.md)。
