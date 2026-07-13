# Profile and AI Boundary Evolution

> 类型：主题综合文档。它从当前代码和历史文档重建边界演进，不是原始对话记录。

## 当前结论

`personal-production` 在 Server registration 层当前公开四个 Domain read tools、唯一受控 mutation `create_task`，且不注册 Resources；`upstream-full` 保留完整兼容 surface 并只能显式启用。App/Server Instructions 负责路由和行为指导，但真正的 capability boundary 是注册表。AI 可以分析和建议；只有用户新的、明确的 Inbox 创建请求才能授权调用 `create_task`，分析结果本身不会自动触发写入。

## 演进过程

1. 个性化架构先以“默认只读、事实优先、用户最终决策”限定行为。
2. ADR-005 明确 AI analysis 与 mutation 分离，拒绝自动创建、编辑、完成和删除。
3. `personal-readonly` Profile 把只读原则落实为可测试的 server-side registration boundary。
4. App Instructions 与 GPT Guide 对齐四工具路由，并明确提示词不替代能力边界。
5. Tunnel/LaunchAgent 运维手册要求生产部署显式设置 `OMNIFOCUS_MCP_PROFILE=personal-readonly`。
6. 2026-07-12 将长期 Profile 语义重构为 `personal-production`，改用 profiles allowlist，并将空值默认改为该精选生产 Profile；旧值不保留 alias。

## 关键转折

- 从客户端“只暴露读工具”的部署建议，演进为 server 精确注册集合。
- `upstream-full` mutation code 仍保留，以兼容性存在；不能由此推导当前个人生产 Profile 可写。
- 新增结构化输出增强机器契约，不改变 AI/写入边界。

## 已废弃方案

- 只依赖 App Instructions 或客户端 allowlist 强制安全。
- AI 识别到需求后自动创建 Project/Task。
- 在 Domain Layer 混入 recommendation 或 mutation。

## 后续状态

- `personal-production` Profile 迁移与 `create_task` V1 的 Checkpoint 6A/6B/6C/7 已完成；当前精确 surface 为五个 Tool、零 Resources。
- 任何超出单个 Inbox Task 创建的新 mutation 仍需独立设计、授权和验收，不能从 `create_task` V1 推导。

## 来源文件

- `docs/architecture/decisions/ADR-005-ai-boundary.md`
- `src/config/serverProfile.ts` 及 tests
- `src/serverRegistration.ts` 及 tests
- `src/serverInstructions.ts` 及 tests
- `docs/integration/CHATGPT_APP_INSTRUCTIONS.md`
- `docs/integration/GPT_TOOL_USAGE_GUIDE.md`
- `tunnel/docs/OmniFocus-MCP-Tunnel日常维护与新增Tool操作手册.md`
