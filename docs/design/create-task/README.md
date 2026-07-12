# create_task V1 Status

## 当前事实

- 当前仓库没有名为 `create_task` 的 Tool、Domain contract 或测试。
- `upstream-full` 已有 `add_omnifocus_task` mutation tool，但它不是自动成立的未来 V1 契约。
- `list_tags` 和 `create_tag` 只在 `upstream-full` 注册；个人 Profile 中没有 Tag Tool。
- ADR-005 要求分析与写入分离，并把授权、确认、审计、失败/回滚和重复保护作为 mutation gateway 的复审条件。

## 当前判断

V1 仅处于待设计状态，尚未实施。既有 Tag 选择可能复用 `list_tags` 的读取 primitive，但层级、重名、不可用 Tag、查重与授权行为仍需要明确契约。

## 后续设计至少需要回答

- input/output schema、成功/错误 envelope 和 Domain ownership；
- 任务查重、幂等 key 与重复保护；
- preview、显式确认和实际 mutation 的分段协议；
- Project/Inbox 放置、日期语义和既有 Tag 选择；
- 权限、审计、部分失败与重试；
- Profile 注册、Server Instructions 和验收矩阵。

本页是状态/范围入口，不是实现方案。当前来源见 [`create_task` 与 Tag 方向](../../history/evolution-summaries/create-task-and-tag-direction.md)。
