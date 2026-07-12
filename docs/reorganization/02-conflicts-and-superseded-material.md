# Conflicts and Superseded Material

## 权威优先级

本轮未发现项目自定义的相反规则，因此采用：

```text
当前代码与测试
>
Accepted ADR / 冻结契约
>
最新验收记录
>
最新工程日志
>
旧设计草案
>
原始讨论
```

以下每项分别给出事实、判断和建议。

## 1. Lean Snapshot 初始语义与 Planned/Due 修订

事实：`GET_LEAN_SNAPSHOT_ENGINEERING_LOG.md` 记录初始实现；后续 `GET_LEAN_SNAPSHOT_PLANNED_CORRECTION_ENGINEERING_LOG.md` 和 `GET_LEAN_SNAPSHOT_DUE_ATTENTION_GRANULARITY_ENGINEERING_LOG.md` 分别修正 inherited Planned/Due child fan-out。ADR-002 和当前测试固化 direct-owner 规则。

判断：初始日志仍是有效工程历史，但其中被修订的 attention 行为不是当前权威语义。

建议：不改写、不移动初始日志；在 `engineer_log/README.md` 和来源映射中明确阅读顺序及 superseded 范围。

## 2. 两份 Architecture Audit 的重叠和命名歧义

事实：`docs/Architecture_Audit.md` 是 1065 行详细审计，并在 2026-07-12 加入结构化输出等最新事实；`docs/OmniFocus-Agent-MCP_Architecture_Audit_v1.md` 是 369 行 v1 精简审计，提交时间同为 2026-07-12。

判断：两者没有已确认的事实冲突，但 `_v1` 文件名不能表达它是精简快照，可能引发“哪个更权威”的歧义。

建议：当前不重命名，避免破坏外部链接；在导航中指定详细审计为当前主入口，`_v1` 为精简快照。

## 3. `personal-readonly` 到 `personal-production` 的迁移

历史事实：本轮 Profile refactor 之前，代码只接受 `personal-readonly` 和 `upstream-full`，生产部署文档要求显式设置旧值。当前代码已改为 `personal-production` 和 `upstream-full`，空值安全默认前者，旧值无 alias。

判断：这不是当前文件之间的实现冲突，而是“当前事实”与“尚未设计的未来方向”的时间线差异。

建议：状态页把它标为“待设计/待实施”，不得提前修改现有 Profile、Tunnel 或 App 文档；完成未来重构后再统一迁移。

## 4. `create_task` 从实现意向回到先设计

事实：仓库中没有 `create_task` 标识符或设计文件；只有 upstream `add_omnifocus_task`。ADR-005 要求 AI analysis 与 mutation 分离，并为未来 mutation gateway 提出授权、确认、审计等复审条件。本轮指令明确 `create_task V1` 后续仅先做方案设计。

判断：任何“create_task 已进入实现”或“复用 add_omnifocus_task 即可完成 V1”的说法都没有当前证据。

建议：后续先建立设计区，处理去重、preview/confirmation、幂等、错误恢复和 Domain semantics，再决定是否实现。

## 5. Tag 从“不支持”到已有 primitive、未来个人选择能力

事实：当前 `upstream-full` 注册 `list_tags` 和 `create_tag`；`personal-production` 当前都不注册。当前没有个人化 Tag Domain Tool，也没有 `create_task` 的既有 Tag 选择契约。

判断：笼统说“项目不支持 Tag”已过时；说“个人生产 Tag 能力已完成”同样不准确。

建议：明确分层措辞：已有 upstream `list_tags` primitive；个人生产场景的只读 Tag 发现、层级/重名解析和既有 Tag 选择仍待设计。

## 6. Server 安全边界与客户端行为指导

事实：早期个性化说明强调默认只读和客户端只暴露读工具；2026-07-12 先通过 `personal-readonly`、随后通过重命名后的 `personal-production` 注册表和测试形成 server-side capability boundary。App Instructions 仍提供行为路由，但明确不是能力边界。

判断：只依赖客户端 allowlist 或提示词的安全模型已被当前实现加强/取代。

建议：以 registration code/tests 为权威；保留旧语境作为演进历史，不把 App Instructions 描述成安全强制层。

## 7. Full Snapshot 的早期方向与 ADR-004

事实：当前只有 Lean Snapshot；`dump_database` 是 upstream raw/full report，不是稳定 Full Snapshot Domain MCP。ADR-004 接受“Lean 与 Full 独立”，低频完整分析采用手动/plugin/file 导出。

判断：任何把 `dump_database` 等同 Full Snapshot Domain Tool，或声称 Full Snapshot 已排期实现的材料都已被 ADR-004 取代。当前文件已基本同步该结论。

建议：保持 ADR-004 为权威；仅在真实、重复需求出现时复审。

## 8. 历史验收数量与当前实时状态

事实：工程日志和 PERSONALIZATION 含特定里程碑的测试数量、Raw Oracle 数量和 OmniFocus 数据采样。

判断：这些是历史证据，不是 2026-07-12 的实时 OmniFocus 状态。

建议：综合文档引用时标注“验收快照”；需要当前数据时必须重新读取，本轮不执行 OmniFocus 调用。

## 9. 文件名与内容不完全匹配

事实：`CHATGPT_APP_INSTRUCTIONS.md` 同时作为 ChatGPT App paste-ready 内容和 `personal-production` Server Instructions 的规范来源；`OmniFocus-Agent-MCP_Architecture_Audit_v1.md` 实际是精简架构快照。

判断：名称不能完整表达复合用途，但当前已有多处引用。

建议：本轮通过导航解释，不重命名；未来若改名，需单独做链接迁移并保留兼容说明。

## 未发现的冲突类型

- 未发现原始对话之间的冲突，因为没有原始对话导出。
- 未发现临时/未命名文档与正式文档的重复，因为没有此类文件。
- 未发现当前文档宣称 `personal-production` 或 `create_task` 已实施。
