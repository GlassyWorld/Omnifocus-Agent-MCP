# personal-production Profile Status

## 当前事实

- 当前代码只支持 `personal-readonly` 和 `upstream-full`。
- 当前 ChatGPT App、Tunnel 和 LaunchAgent 文档使用 `personal-readonly`。
- `personal-production` 尚无 Profile 值、注册集合、测试、部署迁移或回滚方案。

## 当前判断

`personal-production` 是用户指定的后续重构方向，不是已接受架构或已实现能力。它可能改变 server capability surface 和 ADR-005 的具体落地，因此必须单独设计和验收。

## 后续设计至少需要回答

- Profile 是替代、扩展还是并存于 `personal-readonly`？
- 精确公开哪些 read/mutation tools 和 Resources？
- 写入授权、preview/confirmation、审计、幂等和失败恢复如何强制？
- 现有 App/Tunnel/LaunchAgent 如何迁移、验证和回滚？
- 如何保持 `upstream-full` compatibility surface？

本页不回答这些设计问题，也不授权实现。当前来源见 [PROJECT_STATUS](../../PROJECT_STATUS.md) 和 [SOURCE_MAP](../../SOURCE_MAP.md)。
