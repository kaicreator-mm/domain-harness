# DIS v0.2.0 — LLM / Harness / 两层进化契约 R1

**状态：Product/L1 专题细化，非已发布 API、非完整 Harness 实现证明。** 父议题 #1496。历史证据 #1398、#1395、#1478、DomainHarness v0.10.3 SDK LLM/Meta 示例；将历史意图与真实消费者/ABI 区分。

## A. 设计原则

1. **编译智能优先**：已验证的确定性规则、知识查询和经验先解决已知问题；未知、冲突或不充分时才选择有限制的 LLM/Harness。
2. **LLM != Harness != Evolution**：LLM 是模型调用能力；Harness 是有边界的 Domain 推理和 Function 调用过程；Evolution 是使用运行证据形成未来智能版本的过程。
3. 三者是可选 SDK/Business Element 的能力；Domain App 可以完全离线、无模型和无 Meta Server 运行。
4. **禁止隐性权限提升**：模型生成 Tool/Function 提议不是可执行授权；效果/事实/用户审批等遵守现有唯一 KDP 与业务治理边界，不能复制第二个调度器、Journal 或运行权威。
5. 工程实现在各自 Target 的 Package 中固定，不引入跨 Host 文件、网络、进程、设备物理操作抽象。
6. Runtime 的自适应不等于当前 Package 自修改；Candidate、Qualified、Promoted、Selected、Activated 的身份/阶段不能混淆。

## B. LLM Profile：最小标准模型调用

**逻辑 SDK Element**：`sdk.llm`（候选），可以将现有 `dh.llm.generate/1` 作兼容性映射，不声称新标准 SDK 包已发布。公共 Function 至少应有 `generate(request) -> result`；`generateStructured`、流式输出、模型级 Tool Calling 均为可选扩展，不强行加入 Core。

### B.1 Request 合约

- `requestId` 与 caller/activation correlation，不作为授权凭证。
- `messages` 或结构化 Prompt 输入；`contextRefs` 只能引用准入上下文/知识。
- `responseSchema` 可选；必须区分受模型生成后经验证的结构化结果与任意原始文本。
- `limits`：deadline、max tokens/steps/cost、预算来源与拒绝规则。
- `modelPolicyRef` 指向已选模型/Provider 配置，不接受模型输出自行修改 endpoint、secret 或启用未选 Provider。
- `privacyClass`、`disclosureScope`、`evidenceRequirement` 可配置；日志默认最小化/脱敏。

### B.2 Result 合约

候选终态：`COMPLETED`、`REFUSED`、`FAILED`、`UNKNOWN`、`BUDGET_EXHAUSTED`；可区分生成文本、validated structured output、Usage Evidence、Provider Receipt、错误来源和发送不确定性。Usage 缺失是 UNKNOWN/UNAVAILABLE，而非 0。模型 Tool Proposal 是数据，不是实际 Tool Invocation。

发送后超时/取消/不明确的 Provider 返回不得推断未发生消费或外部副作用；自动重试必须服从已选政策、预算和可确认幂等条件。不可在 App 内从用户自然语言重写 Host 配置或冒充用户批准。

### B.3 模型选取

可在 AOT 预选多个 Provider/Function 绑定，但运行时只允许在锁定候选及已声明决策范围内选择，不能按模型名称隐式寻找新实现。Provider fallback 需要显式 Policy + 可靠状态/预算评估；未定义时不可默认发生。

## C. Harness Profile：Domain-bounded reasoning episode

**逻辑 SDK Element**：`sdk.harness`（可选）。不新增 Main Workflow 或 Harness Kernel。允许 Business Element 自己实现同等契约，不强制引用此 SDK Element。

### C.1 启动输入（候选）

- `goal` / `structuredIntent`：当前 Domain 范围内的目标/未决问题；
- `context` / `stateRef`：真实业务事实、知识查询结果、版本与有效性；
- `allowedFunctions`：仅从 AOT 绑定且当前调用方被允许访问的 Function Catalog 中授权可见集合；
- `reasoningPolicy`：策略、可接受的决策来源、最大步数/模型次数/Token/时间/成本、用户交互和终止条件；
- `verification`：业务后置条件、Evidence 充分性、失败/UNKNOWN/澄清门禁。

### C.2 推荐闭环

~~~text
Business Function invokes optional Harness
  -> resolve using pinned deterministic intelligence
  -> exact semantic reuse if applicable
  -> promoted reusable subflow if eligible
  -> if unresolved, construct bounded context
  -> optional LLM generates structured proposal
  -> validate Function ID, args, schema, scope, freshness and policy
  -> route actual invocation through already selected KDP authority
  -> observe real result/evidence
  -> update task-scoped context (not runtime Package/Lock)
  -> verify goal, ask clarification, continue within budget or terminate
~~~

**原始 v0.3 建议的优先级**应是 RULE → EXACT_SEMANTIC_REUSE → PROMOTED_SUBFLOW → BOUNDED_LLM，不是 R0 曾写错的 RULE → SUBFLOW → EXACT。此为决策来源偏好，Domain 可声明受验证的版本化例外；不得强制 KDP 认识具体业务决策树。

### C.3 Harness Outcome

建议 `COMPLETED`、`NEEDS_INPUT`、`WAIT_EXTERNAL`、`BLOCKED`、`REFUSED`、`FAILED`、`UNKNOWN`、`BUDGET_EXHAUSTED`。所有 `COMPLETED` 必须含可检查的业务 Outcome/Evidence，不因 LLM 自评完成而成功。中断/UNKNOWN 时不得盲目重新执行可能发生副作用的 Function。可以按 Domain 规定返回不同交互请求，而不是限定动态 Form。

### C.4 Harness Memory 和恢复

Harness 仅管理任务内推理上下文、已执行 Function 观测与必要 checkpoint；长期业务 State 归 Domain State Element/外部事实来源，唯一 KDP 管执行/Effect/Journaling 权威。存储不是 Harness 自己的第二套自治事实源。Task resume 由 Business Function 提供合法入口，Harness 支持有限恢复语义而非替代业务生命周期。

### C.5 不应标准化

具体 Prompt 模板、RAG/向量 DB、Agent 多角色协作算法、思维链、UI 渲染、供应商 API、业务工具目录和复杂 Workflow 语法；这些可由独立 SDK/Business Elements 实现。

## D. 两层进化：Task 快层 / Server Meta 慢层

### D.1 Task/App 快层

- 消费当前实例已选的规则、知识、Function 实现、精确语义经验和已晋升子流程。
- 允许任务内缓存已验证的中间结果/参数、补充澄清、恢复上下文；App 可以拥有轻量、作用域明确的本地经验，但其结果不能自动升级为新的可执行 Function/Rule/Provider。
- LLM 推理可辅助未知任务；输出必须通过 Domain 实际结果验证，产生 `ExecutionEvidence`、`IntelligenceUsage`、`LearningFeedback`。
- 本地缓存身份必须独立于 KDP Effect/Journal 和权威 Business State。缓存失效时回退到真实业务判断或明确 UNKNOWN，不得用“以前成功”冒充当前事实。
- 是否向 Server 上报、传送什么数据、保留多久由实际 Privacy/Consent/Deployment Policy 决定，不默认上传。

### D.2 Server Meta 慢层

可使用一个普通的 **Meta Domain App**（同一 Element Contract），负责授权数据聚合、模式识别、候选提炼、实验和评估；允许调用更强模型/更多轮 Harness，但不是默认客户端依赖。建议作为可选 Server 工作流，不是 Domain App 同步执行的强制前置。

示例 Meta Elements：`meta.observation`、`meta.experience`、`meta.candidate`、`meta.evaluation`、`meta.feedback`。Domain-Forge 负责原始数据→知识图谱→知识资产生产及合格智能生产输入；Meta 分析可能提供新 Element/Function/Rule/Workflow/Interaction 候选和证据；AOT 进行 Target 绑定和制品锁定。实体权威和流水线责任必须按实际部署明确，而非产生第二个 Kernel。

### D.3 建议的最小交换契约

| Contract | 必要语义 |
| --- | --- |
| `ExecutionEvidence` | task/attempt/version、实际 result、observed status、source/evidence refs、发生时间与当前性、脱敏范围 |
| `IntelligenceUsage` | Element.Function、实现/知识/Package pins、决策来源、上下文适用性 |
| `LearningFeedback` | 新的未知/冲突/重复失败/澄清、性能改善建议，不能自带执行权限 |
| `CandidateReference` | 候选 kind、source digest、parent version、scope、反例、生产者、建议目标 |
| `QualificationReceipt` | 独立结构/行为/安全/Consumer 验证对象、精确 digest、PASS/BLOCK、限制 |
| `PromotionDecision` | 明确授权主体、候选身份、适用范围、拒绝/通过/撤销理由 |
| `ActivationReference` | 经 AOT 生成的 Package/Function/Knowledge Lock，激活实例、Target、有效期/迁移策略 |

这些可作为单独文件或消息 DTO，由 DIS 定义最低兼容语义；并不要求把所有数据上传一个服务端平台。禁止用 Prompt 原文/模型推理链替代 Evidence；真实外部系统的事实需可核验。

### D.4 候选与晋升流程

~~~text
Observed / Feedback
  -> Candidate (not executable authority)
  -> Independent Validation / Shadow / Simulation
  -> Explicit Promotion or Reject
  -> AOT Build + Exact Binding + Consumer Conformance
  -> Activation (new instance / explicit governed migration)
  -> Measured Execution and feedback
~~~

旧实例始终保持已选 Function、Knowledge、Rules 和 Package pins；未经明确兼容性判断与迁移，不自动热切换。Server 可长期进化，但 Runtime 应继续具有离线确定性运行能力。

### D.5 与历史“多级”的关系

多级有**两个正交维度**：
- 决策来源层次：确定性 → 精确经验 → 晋升流程 → LLM；
- 知识成熟度：Observed → Candidate → Validated → Promoted → Selected → Executed。

**不创建 L0/L1/L2/L3 的第二套强制调度引擎**。实现可随具体 Domain 优化，但证据等级、候选状态和执行许可不能混淆。

## E. 验证矩阵（建议）

1. 无 `sdk.llm` 的 Domain App 仍能执行普通 Rule/Query/Workflow。
2. 新 Case 已选规则足够 → 0 LLM 调用；未知/冲突 → 有界 LLM 提议；错误 Schema/非法 Tool/过时证据被拒绝。
3. 多轮 Harness 必须在预算内中止；失败与 NEEDS_INPUT 不升级 COMPLETED。
4. Model 提议可以选择已有受限 Function，却无法产生新的 AOT binding 或改变权限。
5. 模型超时/调用失联保持 UNKNOWN、Provider Usage 缺失保持不可用，不伪造成本/完成。
6. Tally Task GitHub Claim 未读回时 Harness 不能宣布 PASS；xDownload 断线时不能盲目重试 Effect。
7. Shun user grant/currentness 缺失时 0 物理副作用；ai-rexform SOURCE_GUIDANCE_ONLY 不成为 DEVICE_MEASURED。
8. 一次未知任务使用 LLM 解决并产生脱敏 Evidence；Server Meta 形成候选，经审查/新 AOT 后新实例无需 LLM，旧实例仍锁旧规则。
9. 未经 Promotion 的 Candidate、失效证据、跨 Target provider pin 或未经授权反馈数据不得进入生产。

## F. 仍需继续细化的 R2 问题（显式 OPEN）

- **Harness 物理恢复与调度**：多轮 checkpoint 到底使用现有 KDP 公共语义中的哪些最小 API；哪些状态只需 Business State Element；必须用真实 SDK 消费路径证明不形成第二调度器。
- **LLM 结构化/流式/工具协议**：对现有 `dh.llm.generate/1` 的兼容性增量，Provider fallback 和预算证据的标准覆盖范围；不承诺没有验证的新 ABI。
- **Exact semantic reuse 适用性**：缓存 identity 如何包含 Domain/Function/知识版本、上下文、有效期，如何识别事实漂移及跨 Case 隐私边界。
- **进化的权限模型**：Meta Candidate 的评估、Promotion、Forge 资产发布及 AOT 激活在不同部署中的 Authority Matrix；哪些可自动验证、哪些必须有明确治理决定。
- **App 端轻量进化上限**：哪些是任务内复用，哪些是跨任务可更新的数据，何时需要新 BUILD；给出两个真实消费者例证后冻结。
- **Meta 证据最小化**：脱敏字段、跨设备共享/本地优先、精确来源、保留期限及无服务端时的退化行为。

这些 OPEN 不妨碍当前 Product/L1 R1 候选书面重建，但未解决前不能把 Harness/Meta Profile 声称为完整生产级规范或通过 L2 Freeze。
