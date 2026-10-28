# v0.10.3 可选 LLM 集成

[English](INTEGRATION.en.md) · [L2 冻结](L2_FREEZE.zh-CN.md)

本文描述版本分支集成，不表示 v0.10.3 已发布。中立 `dh.llm.generate/1` 类型、常量和 guard 由 `@kaicreator/domain-harness-contracts` 导出。Node Host 分别提供 `@kaicreator/domain-harness-host-node/llm/openai` 和 `/llm/anthropic` 子路径。只导入选中的 Host 绑定；导入 Host 根入口不会加载两个 Provider client。两个 client 接受可信 Host 提供的 SDK 构造器。凭证、端点和模型策略保留在 Host，不能由提示词或封存的 Business 包提供。

BUILD 可选择零个、一个或两个 Capability 模块。Business 显式声明 `llmViaOpenAI` 路由到 `llm.openai.generate`，或声明 `llmViaAnthropic` 路由到 `llm.anthropic.generate`，handler 均为 `generate`；同时选择时必须有两条独立路由。这两个 Capability 声明 `externalEffect: true`。路由是组合决策，不是 effect permit：实际调用仍须经过现有 K 签发的 Permit 和所选 Host 的可信绑定。OpenAI C 导入部署提供的 `domain-harness-openai-host` 绑定；Anthropic C 读取不可变的 `__dhV0103AnthropicHostGenerate` Host 绑定。只配置 App 选中的绑定，不能跨 Provider 回退凭证。

使用中立 Contracts DTO 构造请求，并在 Host 边界验证。Provider 报告的用量和请求 ID 是观察值，不是臆造计数或幂等保证。工具提议是有界数据，不授予 Tool 或 K 权限。发送前的截止时间或取消会拒绝且不产生外部 I/O；发送后的超时、取消、HTTP 408 或 504 可能导致结果未知，不得盲目重试。现有 K 将分发异常记录为 `failed`，但不附 `zeroExternalEffect` 证明，并保留 admission fence；该组合使不确定结果保持待对账状态。仅凭 Journal 的 `failed` 不能断言远端 effect 没有发生。

普通可信部署路径仍可使用。`VERIFIED_PROVIDER_BUNDLE_V1` 是可选配置，在执行前验证独立批准的 subject/closure 和已安装的自包含静态 ESM Provider 制品。它的闭包范围有限，并非任意 npm 依赖图的通用验证器；不支持的图会失败关闭。应将受保护的批准与可变部署文件分开保存。离线 Guided Journey 和现有已选 Meta workflow 不依赖可选 LLM 路由。
