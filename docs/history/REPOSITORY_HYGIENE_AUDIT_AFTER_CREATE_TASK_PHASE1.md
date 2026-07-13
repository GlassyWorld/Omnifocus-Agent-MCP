# Repository Hygiene Audit After `create_task` Phase 1

> 审计日期：2026-07-13
> 仓库：`/Users/shixuerui/Documents/Omnifocus-MCP-Test`
> 性质：`create_task` Phase 1 三个原子提交之后的独立仓库卫生审计；本报告不修改其提交历史。

## 1. 基线

- 起始 HEAD：`909839218b79e0fdf98608aec72a9dea95747e01`（`9098392`）。
- 三个 `create_task` 原子提交：
  - `c71fae4` — `feat: add controlled inbox task creation for personal-production`
  - `c534027` — `fix: harden create_task deployment and schema publication`
  - `9098392` — `docs: record create_task phase 1 production acceptance`
- 起始 staged 区为空；没有 untracked 文件。
- 起始 tracked 变化为一项 Tunnel 手册删除和三项路径调整：
  - `D docs/OmniFocus-MCP-Tunnel日常维护与新增Tool操作手册.md`
  - `M docs/history/evolution-summaries/profile-and-ai-boundary-evolution.md`
  - `M docs/reorganization/00-source-inventory.md`
  - `M docs/reorganization/03-actual-reorganization-plan.md`
- 起始 ignored 项只有 `.DS_Store`、`dist/`、`node_modules/` 等已被精确规则覆盖的本机或生成产物。

## 2. 分类结果

| 路径或资产 | 起始/当前状态 | 内容摘要 | 分类 | 处理 | 风险判断 |
|---|---|---|---|---|---|
| `docs/OmniFocus-MCP-Tunnel日常维护与新增Tool操作手册.md` | 起始 deleted | 897 行 Tunnel、LaunchAgent、故障排查与 Tool 发布知识 | C（旧路径），内容为 A | 保留删除，但把完整内容迁至 `tunnel/docs/`，形成提交候选中的 rename | 若只保留删除会丢失唯一运维知识 |
| `tunnel/docs/OmniFocus-MCP-Tunnel日常维护与新增Tool操作手册.md` | 新增 | 正式 Tunnel 运维手册 | A | 保留；校准为当前五 Tool、零 Resources、唯一 mutation=`create_task` | 只记录配置职责，不写入任何动态值或密钥 |
| `docs/history/evolution-summaries/profile-and-ai-boundary-evolution.md` | modified | Profile/AI 边界演进与来源路径 | B + 当前摘要 | 保留历史演进，修复当前结论和手册路径 | 避免把实施前状态冒充当前状态 |
| `docs/reorganization/00-source-inventory.md` | modified | 2026-07-12 来源盘点 | B | 保留原始计数，新增 2026-07-13 后续迁移说明 | 不反写盘点时点的数量事实 |
| `docs/reorganization/03-actual-reorganization-plan.md` | modified | 阶段 A 整理方案 | B | 明确 Tunnel move 是后续卫生调整；不写成阶段 A 已发生 | 防止机械改写历史计划 |
| 当前 README、Source Map、Architecture Audit、Development、Design 导航 | modified | 当前权威和导航 | A | 校准五 Tool/零 Resources/唯一 mutation，并增加唯一 Tunnel 手册入口 | 只改文档，不改 capability 实现 |
| 两份 evolution summary 与 v1 architecture audit | modified | 实施前历史快照 | B | 增加明确基线/时点标记和当前状态链接，不篡改当时事实 | 消除“当前”措辞误导 |
| `docs/history/REPOSITORY_HYGIENE_AUDIT_AFTER_CREATE_TASK_PHASE1.md` | 新增 | 本报告 | A | 纳入独立卫生提交候选 | 无运行态内容 |
| `/private/tmp/checkpoint7-disable-for-schema-redeploy.zsh` | 仓库外临时文件 | Checkpoint 7 一次性禁写/reload 控制器 | E | 保持仓库外；未执行、未复制、未加入 Git | 会修改本机 plist，不是通用正式资产 |
| `.DS_Store`、`dist/`、`node_modules/` | ignored | 本机元数据、build 和依赖产物 | D | 继续 ignore | 已有精确规则 |
| plist、真实 logs、Ledger、audit、lock、payload、Runtime API Key | 未发现为工作树运行态产物 | 高风险运行态类别 | D/F 审计对象 | 未纳入 | 没有 F 类真实敏感文件命中 |

分类 A-F 总结：A 为正式文档/导航/报告；B 为带时点语义的历史证据；C 只有已被完整迁移的旧手册路径；D 为已忽略或仓库外运行态；E 为 `/private/tmp` 一次性控制器；F 为零。

## 3. Tunnel 手册

- 删除旧路径是安全的前提已经补齐：HEAD 中 897 行原文全部迁入 `tunnel/docs/`，随后仅做当前事实校准。
- 旧手册中的日常检查、LaunchAgent 操作、故障排查、Tool 发布、回滚和安全原则均被承接，没有删除唯一章节。
- 当前正式入口为 `tunnel/docs/OmniFocus-MCP-Tunnel日常维护与新增Tool操作手册.md`，并由根 README 和 `docs/README.md` 导航。
- 仓库中的旧路径只保留在 reorganization 的历史 MOVE 映射中，不再作为当前入口。
- 手册当前明确：`personal-production` 精确五 Tool、零 Resources；前四个为 Domain reads，`create_task` 是唯一受控 mutation。

## 4. History 路径调整

- `00-source-inventory.md` 保留 2026-07-12 的原始计数，并把 Tunnel move 标为 2026-07-13 后续调整。
- `03-actual-reorganization-plan.md` 明确保留“阶段 A 未执行 MOVE”的历史事实，同时单列后续正式路径。
- 实施前文档中“当前不存在 `create_task`”等句子改为有日期的当时结论，并链接到当前状态；没有把历史快照伪装成事后记录。

## 5. Launchd 控制器

- 发现 `/private/tmp/checkpoint7-disable-for-schema-redeploy.zsh`，`zsh -n` 通过。
- 它硬编码 Checkpoint 7 的 disable/reload 顺序，并会把本机 `OMNIFOCUS_CREATE_TASK_ENABLED` 设为 `false`；因此判定为一次性临时控制器，不是正式通用仓库资产。
- 本次未执行、未复制或删除该文件；仓库内也没有对它或 `/private/tmp` 的依赖/引用。
- 当前仓库不存在 `scripts/redeploy-personal-production.zsh`、独立 reload controller 或 `docs/operations/redeploy-personal-production.md`。因此没有可执行的仓库脚本 `--status`/`--dry-run` 检查，也不把不存在的资产伪装成已验证。

## 6. 本机运行态与敏感文件

- 未纳入本机 LaunchAgent plist、真实日志、真实 Ledger、audit、lock、JXA payload、Runtime API Key 或环境变量快照。
- 高风险文件名扫描只命中正式源码 `createTaskLedger.ts`、其测试和架构文档名称；没有命中真实运行态 Ledger/audit 文件。
- 内容扫描只在 Tunnel 手册中命中通用文字 `Runtime API Key`，人工复核为安全原则/占位说明；没有 Authorization Header、Bearer-like token、私钥头或实际 key 值。
- `.gitignore` 已精确覆盖 `.DS_Store`、`*.log`、环境文件、`dist/`、`node_modules/` 等实际产物，不需要增加宽泛规则。

## 7. Operations / Scripts

| 项目 | 结果 |
|---|---|
| 正式 Tunnel 手册 | 保留并迁入 `tunnel/docs/` |
| `/private/tmp` controller | 保持仓库外；未执行 |
| `scripts/redeploy-personal-production.zsh` | 仓库中不存在，`--help`/`--status`/`--dry-run` 不适用 |
| `docs/operations/redeploy-personal-production.md` | 仓库中不存在 |
| 仓库内脚本对 `/private/tmp` 的依赖 | 未发现 |
| 真实服务修改 | 未执行 |

## 8. 验证

| 检查 | 结果 |
|---|---|
| `npm run build` | PASS |
| `npm test` | PASS：40 files，646 tests |
| `git diff --check` | PASS |
| 源码差异 | PASS：`src/` 无差异 |
| Instructions 差异 | PASS：`docs/integration/CHATGPT_APP_INSTRUCTIONS.md` 与 `src/serverInstructions.ts` 无差异 |
| 主 LaunchAgent 只读状态 | running；flag 观测值为 `true`，未修改 |
| Watchdog 只读状态 | loaded job 当前 not running；last exit code 0，符合周期性任务行为 |
| `/healthz` | PASS：`live` |
| `/readyz` | PASS：`ready` |
| 敏感扫描 | PASS：只有安全文字标签命中，无实际 secret |
| `/private/tmp` 仓库引用 | PASS：零命中 |
| staged 区 | PASS：为空 |
| redeploy script status/dry-run | N/A：仓库中不存在该脚本；未执行真实部署 |

第一次沙箱内 `curl` 受代理/loopback 限制失败；随后仅在获准的沙箱外以 `--noproxy '*'` 只读直连，得到上述 `live`/`ready`。该过程没有重启或修改服务。

## 9. 建议提交

建议创建独立卫生提交：

```text
docs: consolidate tunnel operations documentation
```

该提交不应与三个 `create_task` 原子提交 squash。本任务未 stage、未 commit、未 push。

## 10. 安全确认

```text
未修改 create_task 业务逻辑
未修改 Schema
未修改 Tool 集合
未修改 Instructions
未修改 Profile
未修改 mutation flag
未修改 Runtime API Key
未提交本机 plist、logs、Ledger、audit、lock 或 /private/tmp 副本
未 amend/rebase/squash 已完成提交
未 stage
未 commit
未 push
```
