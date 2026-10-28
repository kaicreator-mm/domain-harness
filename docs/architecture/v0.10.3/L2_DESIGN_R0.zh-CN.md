# DomainHarness v0.10.3 — L2 架构/接口候选 R0（未冻结）

[English](L2_DESIGN_R0.en.md) · [Product Freeze](https://github.com/kaicreator-mm/domain-harness/blob/version/v0.10.3/docs/product/v0.10.3/PRODUCT_FREEZE.md) · [Contract Freeze](https://github.com/kaicreator-mm/domain-harness/blob/version/v0.10.3/docs/product/v0.10.3/CONTRACT_FREEZE.md) · [并行工作概览](L2_R0_PREVIEW.zh-CN.md)

**权威来源：** `version/v0.10.3` 从已合法采用 **ADS v4.18.0** 的 `main@c6972db58b833940fabda25cac22c32f9cb1680e` 建立；Product #1402 和契约 #1397/#1400 已经评审并仅合入版本分支，具有确切冻结记录。**本文件仍是待独立审核的 L2 草案**，不表示 L2 Freeze、正式 npm SDK ABI、Task DAG 准入或 L3 实施授权。CV-01..12 保持不变。

## 一、真实 ABI 与职责

v0.10.2 真实可用的公共选择面是外部 `buildV10App`/`projectSelectedComponents`、一个 `kernel-primary/v08-kernel-abi/1`、一个 `standard-primary/v08-standard-sdk-abi/1`、可选的 `standard-feature/dh.v10.standard-feature/1`、`business/v08-business-abi/1`、`capability/v08-capability-abi/1`。C 提供 `capabilityId`、明确 `handlers[{operationId,handler}]` 和**模块级** `externalEffect`。Microkernel 只提供 `load/send/query/subscribe/stop` 等已公开入口；真实 Node Host 掌管 CAS/凭据/资源。不存在自动 Tool 注册、通用生命周期 Hook、Provider 网关或运行时 Package 发现。参见 [扩展点](../../guides/SUPPORTED_EXTENSION_POINTS.md) 和 [B/C Authoring](../../guides/V0102_BUSINESS_CAPABILITY_TOOL.md)。

| 关注点 | 代码/契约拥有者（待 L2 Freeze） | 最低真实验收 | 历史 R0 待定问题（以本文后续 R1 具体决策为准） |
| --- | --- | --- | --- |
| **公共 `llm.generate`** | **必须有一份**版本化中立 Request/Response/Error 数据语义，B/BUILD **显式静态绑定**到获准的 C；不是第三个真实 C Package | 同一个中立 fixture 分别经 OpenAI-only、Anthropic-only 显式绑定成功，未绑定拒绝 | DTO 字段、requestId 与真实远端幂等语义区分；类型由哪个包导出，不添自动路由器 |
| OpenAI-compatible | 独立可选 C Module + Host OpenAI Chat Completions SDK，候选 `llm.openai.generate`；整模块 `externalEffect:true` | Node24 clean installed OpenAI-only，真实 wire 格式与明确错误分类；Anthropic 包零导入 | endpoint 允许范围、可用功能、用量信息来源 |
| Anthropic Messages | 另一个独立可选 C Module + Host Anthropic Messages SDK，候选 `llm.anthropic.generate`；整模块 `externalEffect:true` | Node24 clean installed Anthropic-only，Messages 内容块/工具提议；OpenAI 包零导入 | 共享结果投影与 provider-specific 功能差异 |
| 0/1/2 组合 | BUILD 精确选择两种 C 任意组合，每条 B 路由明确指定实际 handler | 无模型、单选、双选及未获准路由负例；双方凭据不串 | 现有 B/BUILD C handler 声明在哪里绑定，不新造 Kernel 调度 ABI |
| Prompt/Context/Response | 先复用 `standard/features/context-assembly`、`semantic-decision` 或 S/B 私有纯函数；确有两个消费者复用缺口才新添可选 S | 复用已有 S P/N、非法响应拒绝；字符预算不宣称是 Token 窗口 | Token 精确预算、Streaming、完整 Prompt Registry 不默认纳入 |
| **动态表单三阶段** | 构建前 B/Domain Data 准备版控的模板、表单 Schema、选项、分支与恢复；运行时 B/可选 S 只选**当前一步** StepSpec；模型建议必须使用唯一 #1397 Schema 的 `LLMAdvisory` | ai-rexform 风格离线目标因设备状态产生不同 StepSpec；异常/UNKNOWN 可恢复；未声明模型不调用；未授权建议拒绝 | 是否真的需要一个独立 Guided Journey S Feature，而不是 B 层薄实现 |
| **任务层/元数据进化** | 复用已经存在且被选择的 `standard/features/meta-feedback` + 公开 `@kaicreator/domain-harness-host-node` 根导出 `runMetaFeedbackWorkflow`；`experience-reuse` 仍是源码候选，旧 exact cache/promotion 源码不能直接当现行公开 API | 真实脱敏任务证据 → Candidate → 独立评价/人工晋升 → 下版 BUILD 选择；当前实例版本不漂移 | 是否确实需要 task-meta 到 DomainHarness 的一份 `RunEvidenceRef` 公共薄适配；禁止用户输入的 compatibilityRef 自动视为跨 SHA 证明 |
| #1393 **可信代码闭包 P1** | BUILD→部署→Host 加载前校验的**统一信任链**。默认既有可信部署，另一个可选严格 verified-integrity profile 需要独立受信的期望根摘要 | 正常 Provider、单独替换 Provider、**同时替换 Provider 与 sealed App 内嵌哈希并保留旧 subjectDigest**三组，后两组均在任何代码求值/K Effect 前拒绝 | 必须说清实际覆盖哪些可执行依赖、受信根从哪里来、Node ESM/TOCTOU/文件可信假设；不能只读取可变 seal 自证，也不自造通用 npm 沙箱 |
| #1393 **异常泄漏 P2 诊断** | 优先在受信 Host/C 适配层把原生 Provider Error 改为常量化/类型化 UNKNOWN，不默认修改 K 记账机制 | Tally 的 throw/getter 负例不得让 Token 进入 Journal，也不能把失败变成成功 | 只有其它真实现行公开消费者也需要才考虑 Kernel 级错误投影 |
| #1394 **CAS DX P2** | B/Host 适配器将 K 的 `V10DocStore kind:create/cas` 映射到 Host 的 `CasDocumentStore mustBeAbsent/mustMatchRevision`，双语文档与外部用例 | ai-rexform 真实 CAS 正/冲突例；相同代码复用已有结果 | 多个下游重复遇到才考虑公共 Bridge Factory，不重写 Kernel/Host Store ABI |

## R1 — 具体中立 ABI、真实 BUILD 绑定和写集归属

以下是**v0.10.3 待实现的 Contracts 提议**，不是 v0.10.2 已发布类型。交集只覆盖有界文本／JSON 文本生成；ToolCall、Streaming、Responses 与 Anthropic 特有能力不冒充通用功能。A 独占公共 Contracts 类型和验证；B/C 分别独占 OpenAI、Anthropic Capability+Host 子目录；公共导出、Host 根、Manifest 只由 R 集成单写者。

```ts
export type LlmProviderKindV1 = 'openai-compatible' | 'anthropic-messages';
export type LlmErrorCategoryV1 =
  | 'UNAVAILABLE' | 'UNSUPPORTED_FEATURE' | 'RATE_LIMITED' | 'AUTH_DENIED'
  | 'MALFORMED_RESPONSE' | 'CONTEXT_OVERFLOW' | 'CANCELLED' | 'DEADLINE' | 'OUTCOME_UNKNOWN';
export type LlmFinishReasonV1 =
  | 'stop' | 'length' | 'tool_proposal' | 'content_filtered' | 'other';
export type LlmTokenUsageV1 =
  | { readonly evidenceMode: 'unavailable' }
  | { readonly evidenceMode: 'provider-reported' | 'measured';
      readonly inputTokens: number; readonly outputTokens: number };
export interface LlmGenerateRequestV1 {
  readonly contractVersion: 'dh.llm.generate/1';
  readonly requestId: string; // nonempty <=128; correlation, NOT remote idempotency
  readonly modelId: string; // 1..128; B/BUILD selected, Host allowlist verified
  readonly deadlineUnixMs: number; // safe integer epoch ms; bounded by Host policy
  readonly messages: readonly {
    readonly role: 'system' | 'user' | 'assistant';
    readonly content: string; // 1..32768 characters
  }[]; // 1..32 messages; cumulative content <=65536
  readonly maxOutputTokens: number; // integer 1..8192
  readonly outputFormat: 'text' | 'json'; // JSON text request, no provider guarantee
  readonly temperature?: number; // finite 0..1; refuse if unsupported
  readonly outputSchemaRef?: string; // 1..256, optional, Host-admitted ref only
  readonly toolCatalogRef?: string; // 1..256, optional, Host-admitted ref only
}
export interface LlmToolProposalV1 {
  readonly name: string; // 1..128, from approved catalog
  readonly argumentsJson: string; // <=16384; data only, not Tool invocation
}
export type LlmGenerateResultV1 =
  | { readonly contractVersion: 'dh.llm.generate/1'; readonly requestId: string;
      readonly providerKind: LlmProviderKindV1; readonly modelId: string;
      readonly status: 'completed'; readonly text: string; // <=65536
      readonly finishReason: LlmFinishReasonV1;
      readonly providerRequestId?: string; // 1..256, only if actually observed
      readonly usage: LlmTokenUsageV1;
      readonly toolProposals?: readonly LlmToolProposalV1[]; // <=8, advisory only
      readonly receiptRef?: string } // <=256; opaque, no execution authority
  | { readonly contractVersion: 'dh.llm.generate/1'; readonly requestId: string;
      readonly providerKind: LlmProviderKindV1; readonly modelId: string;
      readonly status: 'refused' | 'failed' | 'unknown';
      readonly errorCategory: LlmErrorCategoryV1; readonly reasonCode: string;
      readonly providerRequestId?: string;
      readonly usage: LlmTokenUsageV1; readonly receiptRef?: string };
```

`modelId`、`deadlineUnixMs` 是**必填请求数据**，但模型身份只能由 B/BUILD 已批准的固定配置选择，并在真实调用前与 Host 受信 endpoint/model 允许表对账；返回的 `providerKind/modelId` 来自核准的路由与模型身份，不能照抄不受信的 Prompt。`deadlineUnixMs` 是安全整数 Epoch 毫秒，需要符合 Host 当前时钟、最长允许窗口政策。真实取消使用 Host 按 `requestId` 维护的 **AbortSignal/AbortController**，**不放进 JSON DTO**，模型不能自定取消权限。调用前截止时间已过期、确定未调用 → `refused/DEADLINE`；Host 授权的调用前取消、确定未调用 → `refused/CANCELLED`；输入上下文超限时归类 `CONTEXT_OVERFLOW`，不得伪造成功；调用已发出、取消/超时后远端结果不明 → `unknown/OUTCOME_UNKNOWN`，**不盲重试、不声称远端 exactly-once 扣费**；已证实远端失败 → `failed`。有界 `errorCategory` 是**语义枚举**，非 SDK 的原始错误代码；`reasonCode` 必须为受信有限允许表中的 1..128 字符常量，不能记录原始错误文本。`providerRequestId` 仅在真实观察到时填入且 <=256。用量 `usage.evidenceMode='unavailable'` **不含 Token 计数**，`provider-reported|measured` 必须包含两个非负安全整数，不能捏造零或跨 Provider 等价性。`finishReason` 映射真实观察的结束原因，`length` 为截断、`tool_proposal` 是提议、未知私有原因映射 `other`，不能杜撰 `stop`。`outputSchemaRef/toolCatalogRef` 只有 Host 明确允许、能力已验证才可使用，否则调用前 `UNSUPPORTED_FEATURE` 拒绝。若支持工具提议，`toolProposals` 也**只是有界纯数据建议**，B/S 需检查批准清单、参数和证据，然后由 K 另行批准真实操作；未申请/不支持却收到 ToolCall 时**不得当文本成功**：已知终态 `failed/UNSUPPORTED_FEATURE`，不明则 `unknown/OUTCOME_UNKNOWN`，绝不自行执行工具。转换为表单建议时另按**已冻结 #1397 的唯一 `LLMAdvisory` Schema**校验。`receiptRef` 是不透明引用，不赋权。

现行 BUILD 真实路由字段是 `{intentId,operationId,capabilityId,handlerId}`，C 有 `handlers[{operationId,handler}]`。公共 `llm.generate` 是**B 逻辑接口**，不是第三个物理 Operation/Provider/Kernel Alias。两个可选 C 的具体 L2 身份：

```ts
// 可选 OpenAI C：整模块 externalEffect:true
{ packageId:'capability-llm-openai-compatible',role:'capability',
  abiVersion:'v08-capability-abi/1',capabilityId:'llm.openai',
  externalEffect:true,handlers:[{operationId:'llm.openai.generate',handler:'generate'}] }
// 可选 Anthropic C：独立整模块 externalEffect:true
{ packageId:'capability-llm-anthropic-messages',role:'capability',
  abiVersion:'v08-capability-abi/1',capabilityId:'llm.anthropic',
  externalEffect:true,handlers:[{operationId:'llm.anthropic.generate',handler:'generate'}] }
// B 已声明两个不同 intent，BUILD 封闭真实路由：
{ intentId:'llmViaOpenAI',operationId:'llm.openai.generate',
  capabilityId:'llm.openai',handlerId:'generate' }
{ intentId:'llmViaAnthropic',operationId:'llm.anthropic.generate',
  capabilityId:'llm.anthropic',handlerId:'generate' }
```

**双选**由具权限 B 在 K Permit 前选一个已批准 intent；**单选**完全不含另一 C/路由/导入；**零选**不含两类 Provider，保留其它合法业务路由（现有 BUILD routes 不得空）。企图绑定未选的 capability 使用已有 `V10_ROUTE_INVALID` 拒绝；不能从 LLM 文字临时选 URL、型号或混用密钥。两种真实服务的 Chat Completions/Messages 差异由对应 C/Host 成熟 SDK 明确转换，不支持的功能调用前拒绝。

## R1 — #1393 有边界的严格部署方案，复用已有 Host 准入

保留原 `TRUSTED_DEPLOYMENT` 默认（Host 受信安装，不谎称 npm 密码学完整性）。仅增加**可选** `VERIFIED_PROVIDER_BUNDLE_V1`：一个**自包含静态 ESM Provider 文件**，所有第三方可执行依赖已打入此文件。严格模式只允许列举的 Node 内建静态 import；外部/动态 import、require、native addon、运行时 eval/下载代码、旁置文件**均在首次求值前拒绝**。Host 自带官方 LLM SDK 仍属独立受信 Host 部署，不冒充外部 Provider 包的验证能力。**不造**通用 npm 依赖扫描/沙箱。

独立可信来源是现存 `V10DeploymentAuthorizationAuthority.verify`／Host 受保护部署政策，必须在**可变 sealed-app.json 之外**取得并核验 `subjectDigest`、`packageClosureDigest` 和每个支持 Provider 的 `artifactPath+artifactSha256`。攻击者可改本地 seal 和已安装未受信代码，但不能同时改 Host 受信锚。已有 `v10BuildPackageClosureDigest` 只哈希**声明描述符**，不是实际 npm 字节。Host 在 `activateV10App`、首次 Provider 求值、任何 K Effect **之前**使用既有 `activateGovernedV10Build` 门禁：(a) 真实 BUILD canonical 算法核验 subject 和封闭模块 `sha256(moduleSource)`；(b) 从 Host 受控只读的内容寻址 staging 路径测量**真正将执行的 Provider 文件**；(c) 比较外部可信哈希，保证加载和校验使用**同一不可变快照**。做不到验证/加载同一份字节就先返回 `VERIFIED_PROVIDER_ARTIFACT_UNSUPPORTED`；验证之后拥有完全 Host 根目录写权限的攻击者超出此模式可证明范围，文档必须明确。保留 `CURRENT|PINNED_ONLY` 和旧实例，绝不引入第二个 Kernel。

有限类型拒绝：`VERIFIED_PROVIDER_TRUST_ANCHOR_MISSING`、`VERIFIED_PROVIDER_DIGEST_MISMATCH`、`VERIFIED_PROVIDER_ARTIFACT_UNSUPPORTED`；消息不能带凭据。**真实 Node24 三例**：①合法 Provider 正例；②只改 Provider 字节负例；③Provider + 本地封闭哈希一起改、但可信 subjectDigest 保持旧值负例。②③都要证明 Provider **零求值/K Effect 零执行**；不支持的动态导入也直接拒绝。另通过 Tally throw/getter P2 负例证明原异常被转成类型化 UNKNOWN，SQLite Journal 不含 Token。不无限升级 K 错误框架。

## 复用与并行边界

ADS G 升级 **已经完成，不建立新 Task**。最小 A 中立契约 → B OpenAI ∥ C Anthropic；I 安全、S 纯语义、J **离线**动态表单、M Meta 现有公开 Host 根 `@kaicreator/domain-harness-host-node` 的 `runMetaFeedbackWorkflow` + 已选 S、D CAS 文档在 L2 评审冻结与各自独占写集后并行；R 负责共享 Manifest/导出/Host 根与整版验证。不得 deep-import 私有 `packages/host-node/src/meta-feedback-workflow.ts`，不得把 source-only experience-reuse 当已发布 SDK；无第二 Meta Kernel。#1397 是**唯一** StepSpec/LLMAdvisory 数据契约。L2 R2 PASS 后先记录版本分支 Freeze，才建立 GitHub Native DAG/Claims；本文仍非实施授权。

## 二、真正并行的 Task DAG 前提（尚未创建可执行 DAG）

- **I 完整性：** 拥有公共 BUILD/Contracts/Host 首次导入前的受信校验边界；P1 独立于 LLM 功能，Product/L2 通过后可并行。
- **A 中立 DTO：** 唯一公共 ABI owner；**B OpenAI** 与 **C Anthropic** 只需等待 A 最小类型面确定，即可分别在独立 C Module/Host 子目录并行；B **不依赖** C，反之亦然。
- **S 纯语义**、**J 离线动态步骤**可以与 Provider 实现并行，J 不要求在线模型；仅模型建议那部分等待绑定的真实 C。
- **M Meta 复用核对**和 **D CAS 文档**独立并行，以 `KEEP_EXISTING|ADAPTER|OPTIONAL_S|DEFER` 做实际价值取舍，不引入新的元数据 Kernel。
- **R 最终集成：** Host composition root、公共 exports/import maps、Node24 npm pack、外部 clean consumer、真实 Effect/UNKNOWN/完整性负例、下游最终契约对齐和整版 RQ 集中一次；共享文件由 R 单写集，I/B/C 不得并行碰同一个根文件。
- Scaffold / Agent 调度：Web 适合 Product/L2/Review/仓库管理，CI 适合 Node24 Pack/运行，必须物理环境时才派发 LOCAL；独立 exact-SHA Reviewer 不能为自身代码放行。实际 DAG 用 GitHub native Issue Dependencies，不以本文表格代替，也不因「阶段」人为把所有 Lane 串起来。

## 三、冻结和验证边界

L2 需要实实在在裁定的是：公共 DTO 与静态绑定、两个 C+Host 的可选 ABI、构建期/运行期动态表单 owner、原 S/Meta 复用、严格完整性模式的可信闭包，以及错误 UNKNOWN 和 CAS 薄适配。成熟 OpenAI/Anthropic 客户端、Node crypto、已有 Ajv 验证器应优先复用，不重写 HTTP/SSE、数据库和表单 UI。真实付费 API 不必成为协议假端点测试前置，若没有凭据明确 `LIVE_SMOKE=NOT_RUN`。大多数验证复用；整版集中合格候选上进行。Product/数据协议冻结后如有语义变更需独立 Amendment，不得以「小修复」暗中修改。

```ini
VERSION=v0.10.3
ADS_EFFECTIVE=4.18.0@2c395c55569fe2edf3f4135f12d3d069e526d0b7
PRODUCT_L1_FREEZE=YES
DATA_CONTRACT_FREEZE=YES
L2_DESIGN_R0=AWAITING_INDEPENDENT_REVIEW
L2_FREEZE=NO
NATIVE_TASK_DAG_ADMITTED=NO
CODE_IMPLEMENTATION_AUTHORIZED=NO
RELEASE_READY=NO
```
