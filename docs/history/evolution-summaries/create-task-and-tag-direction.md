# create_task and Tag Direction

> 类型：当前事实与后续方向综合。仓库内没有 `create_task` 历史对话或设计原件，本文件不虚构这些材料。

## 当前结论

当前不存在 `create_task` Tool 或 V1 设计。`upstream-full` 有 `add_omnifocus_task`、`list_tags` 和 `create_tag`；它们不在 `personal-production` 当前注册集合中。未来 `create_task` 与既有 Tag 选择只被列为待设计方向，尚未实施。

## 演进过程

- upstream 兼容层长期提供通用任务创建和 Tag primitive。
- 个性化 v1 冻结为四个 Domain read tools，写入不进入个人默认路径。
- ADR-005 为未来 mutation gateway 设置授权、确认、有限 mutation、审计、失败/回滚和重复保护门槛。
- 本轮外部指令明确：完成记录整理后，`create_task` V1 先做方案设计，而不是直接实现；Tag 方向应考虑选择既有 Tag。

## 关键转折

- “仓库有创建 primitive”与“个人生产创建契约已设计”必须分开。
- “仓库支持 list_tags”与“个人 Profile 已公开 Tag Domain Tool”必须分开。
- 任何未来创建动作都应从 AI recommendation 分离为显式的用户授权 mutation intent。

## 已废弃或不成立的说法

- “仓库完全不支持 Tag”：不成立，full profile 已有 primitive/tool。
- “个人生产 Tag Tool 已完成”：不成立，个人 Profile 未注册 Tag 工具。
- “直接把 `add_omnifocus_task` 重命名为 `create_task` 即完成 V1”：没有设计或验收证据。
- “本轮应开始实现 create_task”：与本轮范围冲突。

## 仍未解决

- exact schema、Project/Inbox 放置、日期时区和既有 Tag 解析。
- 查重、幂等、preview/confirm、审计、错误恢复。
- `personal-production` 未来受控写入的精确能力、授权与部署方式。
- 是否允许创建新 Tag；当前方向只提到既有 Tag 选择，不应擅自扩展。

## 来源文件

- `src/serverRegistration.ts` 及 tests
- `src/tools/definitions/addOmniFocusTask.ts`
- `src/tools/definitions/listTags.ts`
- `src/tools/definitions/createTag.ts`
- `docs/architecture/decisions/ADR-005-ai-boundary.md`
- `docs/Architecture_Audit.md`
- `docs/integration/GPT_TOOL_USAGE_GUIDE.md`
- `/Users/shixuerui/Desktop/03_codex_reorganize_omnifocus_mcp_project_conversations.md`（本轮外部指令，仅作为后续方向证据，不是仓库原始对话）
