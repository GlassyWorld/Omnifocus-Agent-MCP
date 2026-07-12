# OmniFocus MCP Tunnel 日常维护与新增 Tool 操作手册

> 更新时间：2026-07-12  
> 适用环境：macOS + `launchd` + OpenAI Secure MCP Tunnel + `personal-production` Profile

---

## 1. 当前运行基线

### 本地项目

```text
/Users/shixuerui/Documents/Omnifocus-MCP-Test
```

### Tunnel Profile

```text
omnifocus-readonly
```

### MCP Profile

```text
OMNIFOCUS_MCP_PROFILE=personal-production
```

旧值 `personal-readonly` 已不再合法。现有部署迁移时必须人工修改 LaunchAgent 环境变量，
重新 build，并完整执行 bootout/bootstrap、`/readyz`、ChatGPT App Refresh 和四工具集合验收；
不要只重启子进程，也不要在本仓库修改过程中直接改动实际 LaunchAgent。

### LaunchAgent

主服务：

```text
com.shixuerui.omnifocus-tunnel
```

Watchdog：

```text
com.shixuerui.omnifocus-tunnel-watchdog
```

### 健康检查地址

```text
http://127.0.0.1:18080/healthz
http://127.0.0.1:18080/readyz
http://127.0.0.1:18080/ui
```

### 当前只读 Tool

```text
get_lean_snapshot
get_project
get_task
get_completed_since
```

---

# 2. 日常维护命令

## 2.1 检查 Tunnel 是否 Ready

```bash
curl -fsS \
  --max-time 5 \
  http://127.0.0.1:18080/readyz
echo
```

正常情况下应返回成功内容，且命令退出码为 `0`。

同时检查基本健康：

```bash
curl -fsS \
  --max-time 5 \
  http://127.0.0.1:18080/healthz
echo
```

区别：

- `healthz`：进程是否存活。
- `readyz`：Tunnel、Control Plane 和 MCP 是否具备可用状态。

## 2.2 打开本地管理界面

```bash
open http://127.0.0.1:18080/ui
```

## 2.3 查看主服务状态

```bash
launchctl print \
  "gui/$(id -u)/com.shixuerui.omnifocus-tunnel"
```

查看关键信息：

```bash
launchctl print \
  "gui/$(id -u)/com.shixuerui.omnifocus-tunnel" |
  grep -E 'state =|pid =|last exit code|runs ='
```

## 2.4 查看 Watchdog 状态

```bash
launchctl print \
  "gui/$(id -u)/com.shixuerui.omnifocus-tunnel-watchdog"
```

查看关键信息：

```bash
launchctl print \
  "gui/$(id -u)/com.shixuerui.omnifocus-tunnel-watchdog" |
  grep -E 'state =|last exit code|runs ='
```

Watchdog 是周期性短时任务，大部分时间不处于持续运行状态是正常的。

## 2.5 查看 Tunnel 进程

```bash
pgrep -fl tunnel-client
```

## 2.6 重启主 Tunnel

```bash
launchctl kickstart -k \
  "gui/$(id -u)/com.shixuerui.omnifocus-tunnel"
```

重启后验证：

```bash
sleep 8

curl -fsS \
  --max-time 5 \
  http://127.0.0.1:18080/readyz
echo
```

## 2.7 手动触发 Watchdog

```bash
launchctl kickstart -k \
  "gui/$(id -u)/com.shixuerui.omnifocus-tunnel-watchdog"
```

## 2.8 查看主服务日志

最近 100 行：

```bash
tail -n 100 \
  "$HOME/Library/Logs/OmniFocusTunnel/tunnel.stderr.log"
```

持续观察：

```bash
tail -f \
  "$HOME/Library/Logs/OmniFocusTunnel/tunnel.stderr.log"
```

标准输出日志：

```bash
tail -n 100 \
  "$HOME/Library/Logs/OmniFocusTunnel/tunnel.stdout.log"
```

## 2.9 查看 Watchdog 日志

```bash
tail -n 100 \
  "$HOME/Library/Logs/OmniFocusTunnel/watchdog.stderr.log"
```

## 2.10 检查代理端口

将下方端口替换为当前实际端口：

```bash
nc -vz 127.0.0.1 7890
```

检查两个脚本中的端口是否一致：

```bash
grep -n 'PROXY_PORT' \
  "$HOME/Library/Application Support/OmniFocusTunnel/run-tunnel.sh" \
  "$HOME/Library/Application Support/OmniFocusTunnel/watchdog.sh"
```

## 2.11 检查脚本语法

```bash
zsh -n \
  "$HOME/Library/Application Support/OmniFocusTunnel/run-tunnel.sh"

zsh -n \
  "$HOME/Library/Application Support/OmniFocusTunnel/watchdog.sh"
```

无输出表示语法检查通过。

## 2.12 检查 LaunchAgent 配置

```bash
plutil -lint \
  "$HOME/Library/LaunchAgents/com.shixuerui.omnifocus-tunnel.plist"

plutil -lint \
  "$HOME/Library/LaunchAgents/com.shixuerui.omnifocus-tunnel-watchdog.plist"
```

## 2.13 停止主服务

```bash
launchctl bootout \
  "gui/$(id -u)" \
  "$HOME/Library/LaunchAgents/com.shixuerui.omnifocus-tunnel.plist"
```

## 2.14 重新加载主服务

```bash
launchctl bootstrap \
  "gui/$(id -u)" \
  "$HOME/Library/LaunchAgents/com.shixuerui.omnifocus-tunnel.plist"
```

随后启动：

```bash
launchctl kickstart -k \
  "gui/$(id -u)/com.shixuerui.omnifocus-tunnel"
```

## 2.15 停止 Watchdog

```bash
launchctl bootout \
  "gui/$(id -u)" \
  "$HOME/Library/LaunchAgents/com.shixuerui.omnifocus-tunnel-watchdog.plist"
```

## 2.16 重新加载 Watchdog

```bash
launchctl bootstrap \
  "gui/$(id -u)" \
  "$HOME/Library/LaunchAgents/com.shixuerui.omnifocus-tunnel-watchdog.plist"
```

---

# 3. 常见故障排查顺序

## 3.1 `readyz` 访问失败

按顺序执行：

```bash
pgrep -fl tunnel-client
```

```bash
launchctl print \
  "gui/$(id -u)/com.shixuerui.omnifocus-tunnel"
```

```bash
tail -n 100 \
  "$HOME/Library/Logs/OmniFocusTunnel/tunnel.stderr.log"
```

```bash
nc -vz 127.0.0.1 7890
```

```bash
lsof -nP -iTCP:18080 -sTCP:LISTEN
```

重点检查：

- 代理是否启动。
- 代理端口是否变化。
- Runtime API Key 是否能从 Keychain 读取。
- Tunnel Profile 是否仍使用正确的环境变量。
- `dist/server.js` 是否存在。
- OmniFocus 是否可被 JXA 自动化访问。

## 3.2 进程存在，但长期不 Ready

手动触发 Watchdog：

```bash
launchctl kickstart -k \
  "gui/$(id -u)/com.shixuerui.omnifocus-tunnel-watchdog"
```

或直接重启主服务：

```bash
launchctl kickstart -k \
  "gui/$(id -u)/com.shixuerui.omnifocus-tunnel"
```

然后：

```bash
sleep 8
curl -fsS http://127.0.0.1:18080/readyz
echo
```

## 3.3 代理端口变更

同步修改：

```text
~/Library/Application Support/OmniFocusTunnel/run-tunnel.sh
~/Library/Application Support/OmniFocusTunnel/watchdog.sh
```

检查：

```bash
grep -n 'PROXY_PORT' \
  "$HOME/Library/Application Support/OmniFocusTunnel/run-tunnel.sh" \
  "$HOME/Library/Application Support/OmniFocusTunnel/watchdog.sh"
```

如果只改 Watchdog：

- 不需要重新加载主 Tunnel。
- Watchdog 下次运行时自动使用新端口。

如果同时修改 `run-tunnel.sh`：

```bash
launchctl kickstart -k \
  "gui/$(id -u)/com.shixuerui.omnifocus-tunnel"
```

## 3.4 前台诊断

后台问题无法定位时，先停止主 LaunchAgent：

```bash
launchctl bootout \
  "gui/$(id -u)" \
  "$HOME/Library/LaunchAgents/com.shixuerui.omnifocus-tunnel.plist"
```

设置环境变量后前台运行：

```bash
export CONTROL_PLANE_API_KEY="你的 Runtime API Key"
export CONTROL_PLANE_HTTP_PROXY="http://127.0.0.1:实际代理端口"

tunnel-client doctor \
  --profile omnifocus-readonly \
  --explain
```

```bash
tunnel-client run \
  --profile omnifocus-readonly \
  --log.level=info \
  --log.format=struct-text
```

前台验证完成后按 `Control + C` 停止，再重新加载 LaunchAgent。

---

# 4. 新增 Tool 的标准流程

## 4.1 先确认 Tool 是否应该进入 `personal-production`

进入 `personal-production` 的 Tool 必须属于明确审计过的精选生产能力。当前标准流程只接受满足以下条件的读取 Tool：

- 只读取 OmniFocus。
- 不创建、修改、移动、完成或删除任何对象。
- 不通过通用执行器间接暴露写入能力。
- 输入范围明确。
- 输出具有稳定 Domain Contract。
- 错误语义明确。
- 有独立测试。
- 有清晰的 GPT 路由场景。

以下能力不得通过当前标准流程直接加入 `personal-production`：

- mutation Tool。
- 任意脚本执行。
- 任意 JXA 执行。
- 通用数据库写入接口。
- 未经约束的 generic query executor。
- 会改变 OmniFocus 状态的辅助操作。

未来写入 Tool 必须先有独立的授权、preview/confirmation、审计、失败恢复和重复保护设计，
再通过 Accepted ADR、显式 profiles allowlist 和专项测试加入；不得从 Profile 名称推断写入授权。

## 4.2 修改代码时应同步完成

新增 Tool 时至少需要更新：

```text
Tool handler
Input schema
Output schema / Domain Contract
Adapter / Mapper / Composer（如需要）
Server registration
personal-production 精确 profiles allowlist
Unit tests
Registration tests
Tool Guide
ChatGPT App Instructions
README 或 Architecture Audit（仅在结构变化时）
ADR（仅在确有新架构决策时）
```

不要仅新增 handler，而遗漏：

```text
Profile 注册边界
文档
错误语义
精确 Tool 集合测试
```

## 4.3 构建与测试

进入项目：

```bash
cd /Users/shixuerui/Documents/Omnifocus-MCP-Test
```

执行：

```bash
npm run build
npm test
git diff --check
git status --short
```

## 4.4 检查 `personal-production` 精确 Tool 集合

不要只检查 Tool 数量。

必须验证：

```text
实际 Tool 名称集合
=
原有允许列表
+
本次明确新增的只读 Tool
```

同时确认没有意外出现：

```text
query_omnifocus
dump_database
add_omnifocus_task
add_project
edit_item
remove_item
batch_add_items
batch_remove_items
create_tag
Resources
```

除非未来通过新的正式设计决策明确改变边界。

## 4.5 更新文档

至少更新：

```text
docs/integration/GPT_TOOL_USAGE_GUIDE.md
docs/integration/CHATGPT_APP_INSTRUCTIONS.md
```

新增内容应包括：

- Tool 的适用问题。
- 不适用问题。
- 与现有 Tool 的路由顺序。
- 是否允许继续下钻。
- 输入边界。
- 输出语义。
- 错误处理。
- 截断处理。
- 事实、推断与建议的区分规则。

## 4.6 重启后台 Tunnel

重新构建后，旧的 MCP 子进程仍然加载旧版 `dist/server.js`。

必须重启：

```bash
launchctl kickstart -k \
  "gui/$(id -u)/com.shixuerui.omnifocus-tunnel"
```

验证：

```bash
sleep 8

curl -fsS \
  --max-time 5 \
  http://127.0.0.1:18080/readyz
echo
```

## 4.7 刷新 ChatGPT App 工具元数据

以下内容变化时，需要刷新应用的工具元数据：

- 新增 Tool。
- 删除 Tool。
- Tool 名称变化。
- Tool description 变化。
- Input schema 变化。
- Tool annotations 变化。
- Authentication metadata 变化。

刷新后立即检查：

```text
可见 Tool 数量
可见 Tool 名称
是否出现未授权 Tool
是否遗漏新增 Tool
```

如果只修改 handler 内部实现，且 Tool 名称、描述和 schema 均未变化，通常只需：

```text
build
→ restart Tunnel
→ 验证
```

## 4.8 更新 ChatGPT App Instructions

将更新后的：

```text
docs/integration/CHATGPT_APP_INSTRUCTIONS.md
```

同步到 ChatGPT App 的 Instructions。

新增 Tool 的 Instructions 至少说明：

- 什么时候调用。
- 什么时候不调用。
- 与其他 Tool 的优先级。
- 一个 Tool 足够时何时停止。
- 是否允许下钻。
- 错误如何处理。
- 输出如何区分事实、推断和建议。

## 4.9 Web 端验收

每个新 Tool 至少测试：

### 精确调用

明确要求只调用新 Tool。

### 路由测试

检查模型是否在合适的问题中选择新 Tool，而不是：

- 一开始调用所有 Tool。
- 用新 Tool 替代原本更合适的 Tool。
- 为了“完整”批量下钻。

### 错误测试

至少覆盖：

- `invalid_arguments`
- `not_found`
- `ambiguous_match`
- `query_failed`
- 空结果
- 截断结果（如适用）

### 安全测试

确认：

- 没有暴露 mutation Tool。
- 没有暴露 Resources。
- 没有意外暴露 upstream generic Tool。
- 分析不会自动触发写入。

## 4.10 iPhone 端验收

网页端验收通过后，在 iPhone 新建对话测试：

- 新 Tool 是否可见。
- 新 Tool 是否能成功调用。
- 输出是否与网页端一致。
- Mac 后台 Tunnel 是否持续 Ready。

## 4.11 变更完成后的标准检查

```bash
curl -fsS http://127.0.0.1:18080/readyz
echo
```

```bash
launchctl print \
  "gui/$(id -u)/com.shixuerui.omnifocus-tunnel" |
  grep -E 'state =|pid =|last exit code'
```

```bash
tail -n 100 \
  "$HOME/Library/Logs/OmniFocusTunnel/tunnel.stderr.log"
```

```bash
cd /Users/shixuerui/Documents/Omnifocus-MCP-Test
git status --short
```

---

# 5. 不同类型变更需要做什么

## 仅修改 Tool handler 内部逻辑

需要：

```text
build
test
重启 Tunnel
Web 验收
```

通常不需要刷新 Tool metadata。

## 修改 Tool description 或 input schema

需要：

```text
build
test
重启 Tunnel
刷新 ChatGPT App metadata
Web 验收
iPhone 验收
更新 Instructions（如路由语义变化）
```

## 新增或删除 Tool

需要：

```text
设计审计
实现与测试
更新 personal-production profiles allowlist
更新精确 Tool 集合测试
更新 Guide
更新 App Instructions
build
test
重启 Tunnel
刷新 App metadata
Web 验收
iPhone 验收
```

## 修改代理端口

需要：

```text
修改 run-tunnel.sh
修改 watchdog.sh
重启主 Tunnel
验证 readyz
```

如果只修改 Watchdog：

```text
无需重启主 Tunnel
```

## 修改 Tunnel Profile

需要：

```text
doctor --explain
重启 Tunnel
验证 readyz
```

## 修改 Runtime API Key

更新 Keychain 后重启：

```bash
launchctl kickstart -k \
  "gui/$(id -u)/com.shixuerui.omnifocus-tunnel"
```

不要把 Runtime API Key 写入：

```text
plist
shell script
YAML profile
Git repository
日志
```

## 修改 LaunchAgent plist

需要完整重新加载：

```bash
launchctl bootout \
  "gui/$(id -u)" \
  "$HOME/Library/LaunchAgents/com.shixuerui.omnifocus-tunnel.plist" \
  2>/dev/null || true
```

```bash
launchctl bootstrap \
  "gui/$(id -u)" \
  "$HOME/Library/LaunchAgents/com.shixuerui.omnifocus-tunnel.plist"
```

然后：

```bash
launchctl kickstart -k \
  "gui/$(id -u)/com.shixuerui.omnifocus-tunnel"
```

---

# 6. 回滚流程

新增 Tool 后出现问题时：

1. 回退代码到上一个已验证版本。
2. 重新构建。
3. 运行测试。
4. 重启 Tunnel。
5. 刷新 ChatGPT App metadata。
6. 检查 Tool 列表恢复。
7. Web 和 iPhone 各做一次读取测试。

命令：

```bash
cd /Users/shixuerui/Documents/Omnifocus-MCP-Test

npm run build
npm test
git diff --check

launchctl kickstart -k \
  "gui/$(id -u)/com.shixuerui.omnifocus-tunnel"

sleep 8

curl -fsS http://127.0.0.1:18080/readyz
echo
```

---

# 7. 安全与维护原则

## 7.1 Server-side Profile 才是安全边界

ChatGPT App Instructions 只负责：

- Tool 路由。
- 最小充分调用。
- 回答行为。
- 事实、推断与建议分离。

当前运行实例的能力边界来自：

```text
OMNIFOCUS_MCP_PROFILE=personal-production
```

以及 Server 注册层只公开允许的 Tool。

## 7.2 新 Tool 默认不进入 `personal-production`

新增 Tool 必须经过显式审计和显式注册。

不能采用：

```text
新增后自动注册
按目录自动扫描
通配符导出
```

## 7.3 不把“分析建议”视为写入授权

即使未来出现写入 Profile：

- 分析完成不等于允许写入。
- 建议不等于允许写入。
- 用户必须提出新的、明确的写入请求。
- 写入应进入独立预览、确认和授权流程。

## 7.4 日常维护只看三个核心信号

```text
1. readyz 是否成功
2. launchd 主服务是否存活
3. ChatGPT 是否只看到允许的 Tool
```

这三个信号正常，系统通常即可视为可用。

---

# 8. 最简日常检查

```bash
curl -fsS http://127.0.0.1:18080/readyz
echo

launchctl print \
  "gui/$(id -u)/com.shixuerui.omnifocus-tunnel" |
  grep -E 'state =|pid =|last exit code'

pgrep -fl tunnel-client
```

---

# 9. 新增 Tool 的最简发布清单

```text
[ ] Tool 确认属于只读能力
[ ] Handler 与 Domain Contract 完成
[ ] Schema 和错误语义明确
[ ] 单元测试通过
[ ] personal-production 精确注册列表更新
[ ] 精确 Tool 集合测试通过
[ ] GPT Tool Usage Guide 更新
[ ] ChatGPT App Instructions 更新
[ ] npm run build 通过
[ ] npm test 通过
[ ] git diff --check 通过
[ ] 重启 Tunnel
[ ] readyz 成功
[ ] 刷新 ChatGPT App metadata
[ ] 检查 Tool 名称集合
[ ] Web 端验收
[ ] iPhone 端验收
[ ] 确认没有 mutation Tool 或 Resource 暴露
```
