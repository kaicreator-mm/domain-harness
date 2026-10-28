# DomainHarness v0.10.3 · SDK 使用指南（候选版本）

[English / Agent guide](SDK_GUIDE.en.md) · [Agent Skill（英文）](agent-skill/SKILL.md) · [Product Freeze](../../product/v0.10.3/PRODUCT_FREEZE.md) · [L2 Freeze](../../architecture/v0.10.3/L2_FREEZE.zh-CN.md)

> **版本状态：尚未发布。** 本文针对 `version/v0.10.3` 候选源码，不代表 `main`、Git Tag 或 npm Registry 已发布。本文编写基线 `d3a4cdf5fc4fc1080ce885cabb6efa5020f5e6f3`；后续以最终 RQ 的精确 SHA 为准。当前公开文档/Skill 仍使用已发布的 v0.10.2，不能提前替换。包清单版本仍为 `0.10.2-rc.0`，不要把它当成已发布的 npm v0.10.3。

## 1. 选择并固定 SDK

- Node.js **>=24.0.0**。仅从合法公共导出导入四个包：`@kaicreator/domain-harness-contracts`（契约、LLM DTO/guards）、`@kaicreator/domain-harness-build`（独立 BUILD 生产者）、`@kaicreator/domain-harness-microkernel`（`load/send/query/subscribe/stop`）、`@kaicreator/domain-harness-host-node`（可信 Host/CAS）。
- BUILD 的源包和运行时隔离；选定的 Kernel (K) 是唯一权限、Effect Permit、Journal、Replay/UNKNOWN 权威。S 管语义，B 管业务 Intent/编排，C 管具体 Operation。Host 注入依赖，但不能伪造 K 授权。
- 记录消费者仓库 SHA、**SDK 精确源码/包字节 SHA**、选中的 K/S/B/C ID/Hash、Host 存储类型及一条真正的业务旅程。Tag / npm 发布 / 多平台验证不可由文件名推断。

## 2. 可选 LLM（0/1/2 个独立 Provider）

- 统一数据契约 `dh.llm.generate/1`：`LlmGenerateRequestV1` / `LlmGenerateResultV1`。从 `@kaicreator/domain-harness-contracts` 使用类型及校验器。
- 可分别选用 `llm.openai.generate` 与 `llm.anthropic.generate` C：BUILD 为每个 B Intent 显式绑定 **不同的** operation、capability、handler；不得按模型名自动路由/降级，不选 Provider 时无需模型调用。两 C 均属 external Effect，必须先由 K 授予 Permit。
- 可信 Host 的公共入口：`@kaicreator/domain-harness-host-node/llm/openai` 和 `@kaicreator/domain-harness-host-node/llm/anthropic`。SDK 构造器、密钥、模型与 endpoint 只能来自 Host 可信配置；不得把用户消息当配置。引入 Host 根包不会自动加载两个 Provider。
- 允许的 Tool 提议只是受限数据，不能自行执行；结果区分 Provider 实报/不可用 Usage，不能伪造 token 数量。请求发出后超时、408/504、取消等可产生 UNKNOWN，不能自动重试。
- Anthropic-compatible Host 保留合法 `thinking`，只返回最终文本；思考/签名不应进入 DTO/Journal。相关修复在 [#1442](https://github.com/kaicreator-mm/domain-harness/pull/1442) 合入版本分支并通过离线测试。**真实 DeepSeek：OpenAI 路径先前 PASS，Anthropic 路径先前 FAIL（原因未记录），修复后尚未重新实测**；不能宣称双协议云端 PASS。参见 [#1438](https://github.com/kaicreator-mm/domain-harness/issues/1438)。

## 3. 表单、Meta 与部署完整性

- [离线 Guided Journey](../../../examples/v0103-guided-journey/README.md) 使用预批准 StepTemplate / FormSchema / ChoiceCatalog、Host 观察选择 **一个** Next Step，验证 StepOutcome；可接收无权威的静态 LLMAdvisory。**不是**完整 UI 引擎，尚未证明模型在多候选歧义情境中真实选择表单。
- [Meta 复用](../../../examples/v0103-meta-reuse/README.md) 使用现有 S + 公共 Host `runMetaFeedbackWorkflow` 形成 Candidate、验证、Shadow、合成 Operator 批准后生成新的 BUILD；**不**证明生产中真实人工批准、跨任务端到端晋升、SQLite 持久流程。
- `VERIFIED_PROVIDER_BUNDLE_V1` 可选：可信独立批准根、安装前字节检查、受限自包含静态 ESM Provider。不是任意 npm 传递依赖完整性平台；不支持的图必须拒绝，不能回退为不验证执行。
- CAS 适配参考 [Host CAS 双语说明](HOST_CAS_ADAPTER_R0.zh-CN.md)；Host 授权、Store/版本一致性由应用负责，不能让外来 payload 伪造。

## 4. 证据、反馈与发布

先用 Node24 跑针对性正/负例，再按任务要求做 clean packed consumer；分别记录源码 SHA、实际退出码、NOT_RUN。真实 LLM 调用需独立批准预算、严格次数/不重试、环境变量仅在本地可信 Host 使用；Issue 不得上传 Key、原始请求、推理内容或私有 Hidden 细节。

SDK 问题先归类：`SDK_PRODUCT | BUILD_OR_PACKAGE | HOST_INTEGRATION | CONSUMER_MISUSE | DOCS | TEST_RUNNER_OR_OS | UNKNOWN`。最小脱敏复现、查重后，在用户同意时反馈至 [domain-harness Issues](https://github.com/kaicreator-mm/domain-harness/issues)，不要自动发送遥测。最终范围/未证明项按 [#1440 G00–G07](https://github.com/kaicreator-mm/domain-harness/issues/1440) 和 [#1419 RQ](https://github.com/kaicreator-mm/domain-harness/issues/1419) 裁定。**只有独立 Release Qualification、main 合并、Tag 才能将候选升级为发行说明。**
