# v0.10.3 · 两种 LLM Provider 协议的独立选择契约 R0

[English](LLM_PROVIDER_SELECTION_R0.en.md) · [契约首页](CONTRACT_PREVIEW_R0.zh-CN.md) · [LLM 需求 #1396](https://github.com/kaicreator-mm/domain-harness/issues/1396)

> **候选 Product 契约；Operation 名称为提议，不是已发布的 ABI。**

## 独立交付与可选组合

| 独立 C Package（候选） | 对外 Operation（候选） | 底层协议 |
| --- | --- | --- |
| `capability-llm-openai-compatible` | `llm.openai.generate` | OpenAI-compatible Chat Completions |
| `capability-llm-anthropic-messages` | `llm.anthropic.generate` | Anthropic Messages |

Domain App BUILD 必须允许 **0、1 或 2 个**选定 Provider C（0 表示纯规则/离线）。它们是不同 Module/Package、ABI 身份、配置和凭据，互不导入；选择两个时 B/声明路由必须使用明确 Operation ID 和精确所选 Provider，不能最后写入覆盖前者。按 #1396，公共支持交集必须定义**统一的 `llm.generate` 逻辑 Operation/数据契约**，它不是第三个 C Package 或自动调用网关。业务 B 使用此统一契约时，必须在 B/BUILD **显式绑定**到已选择的一个具体 C Operation（`llm.openai.generate` 或 `llm.anthropic.generate`），并受批准的模型与 Endpoint 策略约束。即使两个 Provider 同时被选中，每条路由仍须显式指定；具体 Operation 保留处理各自特有功能的能力。不选择任何 Provider 时统一操作不可用，但纯规则流程正常；**不得自动推断默认路由或隐式回退**。

## 共同数据投影（候选，字段可变）

- Request：`requestId`（关联/去重标识，不声称上游 Provider 支持幂等）、`messages`、部署绑定 `model`、`maxOutputTokens`、可选 `outputSchemaRef`、`toolCatalogRef`、`deadline`。Host 在受信环境绑定 endpoint/secret；**用户输入不能自行改 baseURL/密钥/模型权限**。
- Response：`providerKind`、`model`、`output`（text + 有界 tool-use proposals）、`finishReason`、可用时 `providerRequestId`、`usage` 与其证据标识 `provider-reported|measured|unavailable`，必要时不可表示的 provider-private 扩展必须显式标记，不可编造。
- Error：`UNAVAILABLE | UNSUPPORTED_FEATURE | RATE_LIMITED | AUTH_DENIED | MALFORMED_RESPONSE | DEADLINE | OUTCOME_UNKNOWN` 等为候选**安全语义类别**，不是冻结异常代码；不能将已发送但未确认的远程调用当作绝对未发生，也不能为了补偿默认盲重试。
- Capabilities：按已选 endpoint 配置/验证 `chat`、`structured_output`、`tool_use`、`streaming`、`vision`、`responses_api`、`cache_tokens` 等，提供明确 unsupported，而不是假设所有兼容服务器完全等价。

## 所有权、Effect、复用

- **S/Feature：** Prompt 渲染、Context 选择、Token 预算策略、Response 验证和模型选择建议，纯语义代码，**不做独立 Tool**。
- **C/Capability：** 真正可独立调用的两个 Provider Operation。远程请求可能产生收费和数据外送，按 v0.10.2 的 **模块级 `externalEffect:true`** 加入已选 C；K Admission/Permit/Journal/Replay/UNKNOWN 不变。
- **Host：** 真实 SDK 客户端（复用成熟库）、模型配置、API 凭据、取消/超时、传输，不放 Microkernel，也不重新写通用 HTTP/SSE。
- **B/Business：** 选择哪个 Provider/模型及何时允许调用；无 Provider 必须有清晰非模型降级业务路径。模型的 Tool Call 仅是待校验提案。
- **BUILD：** 提前封闭已选 Package、权限和路由；运行时不能动态下载、装载未选 Provider；外部 npm 字节完整性独立由 [#1393](https://github.com/kaicreator-mm/domain-harness/issues/1393) 治理，不能由本协议名字替代。

**统一契约的强制验收：** OpenAI-only 和 Anthropic-only App 使用同一份中立 Request/Response 数据结构，通过各自明确的 B/BUILD 绑定返回归一化结果；双选 App 验证两种显式路由不串。此约束不要求新增别名专用 C Package、自动路由器或 Kernel ABI。

## 最小测试与下游对齐

A：只选 OpenAI C，调用/结果归一化正常，Anthropic 未加载。B：只选 Anthropic C，反向成立。C：同时选择两者，显式 B 路由发给正确操作，凭据配置不串。D：不选择 Provider，规则路径仍可完成。E：非法建议、额度/超时、结果 UNKNOWN、缺少可选特性按类型明确返回，不自动授予 Effect、不得隐性切换 Provider。Node24 clean packed consumer；使用本地 fake HTTP endpoint / Provider SDK 适配即可证明协议契约，无真实付费调用时如实写 NOT_RUN。

**状态：** `R0_PREVIEW=YES; ABI_FROZEN=NO; SDK_IMPLEMENTED=NO; PRODUCT_FREEZE=NO`.
