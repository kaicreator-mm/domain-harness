# DomainHarness — Domain-Bounded Harness Capability Model（Product/L1）

**状态：PRODUCT_L1_ANALYSIS_CANDIDATE / NOT_FROZEN**\
**分析入口：** [Issue #1478](https://github.com/kaicreator-mm/domain-harness/issues/1478)\
**父级产品基线：** [#1477 Product/L1 Freeze](https://github.com/kaicreator-mm/domain-harness/issues/1477)\
**当前 Product/L1 冻结身份：** main@b8135aa801eb38fcae2fa1fce3bada541178d5b9 / tree 4363139334ba5b7e83f888e2dc6ffa7e93445da7\
**在研后继 Product/L1 权威：** #1484 Boot → KDP Primary Checkpoint @ commit `0a5f7ba0eb8361ff4c8e2ff17abc25de04f2e8bc`（仅适用于后继架构；不代表 v0.10.3 Runtime 已采用）
**v0.10.3 对外源码基线：** [v0.10.3+source-repair.1](https://github.com/kaicreator-mm/domain-harness/releases/tag/v0.10.3%2Bsource-repair.1) — commit 896efbcec64132377e05fca7b3f7f6ff6b3c900b / tree 533f46fa07c809c827e2b0c3d902a4e1beaf47df

> 本文是 Harness 产品能力模型与现状差距分析，不是 SDK 实施设计。它不改变 v0.10.3 公开源码基线所遵循的 v0.7 冻结权威，不引入第二 Runtime、第二 Scheduler 或通用 Agent 平台，不授权 ABI、源码、L2、Task DAG、版本、发布或部署。在研后继架构遵循独立的 Boot → KDP Primary Product/L1 Checkpoint #1484；本文不声称 v0.10.3 Runtime 已采用该后继架构。

## 1. 产品结论

**Domain-bounded Harness 是嵌入 Domain App 的有界领域执行与求解能力。** 它消费当前 App 精确选定的 Domain Definition、Domain Intelligence、Semantic/Tool Component 契约与运行上下文，在单一 Domain 范围内完成请求理解、智能选择、上下文组织、必要时的有界推理、已声明能力调用、结果验证和执行连续性。

Harness 不是独立 Agent Runtime。一个业务控制流仍由选定的 Business / Domain Machine 驱动；Harness 的 Reasoning Episode 是该控制流中的有界子过程。Kernel/Microkernel 仍是唯一 Admission、State、Transition、Effect、Journal、Replay/Recovery 权威。Host 负责真实存储、Provider、外部 I/O、授权和物理恢复。Domain Package 提供领域智能和已声明能力，不拥有通用 Runtime。

v0.10.3 已有相当多的基础构件，但**尚未形成完整、公开、端到端的 Harness 产品能力**。尤其是 Context Retrieval/Refresh、公共多轮 Reasoning、LLM Tool Proposal → Admission → Execution → Observation → Model Re-entry 的闭环，以及通用 Outcome Evaluation，仍有明显的集成缺口。

## 2. 精确源码与发布基线

本分析绑定实际对外的四包 GitHub SDK Tarball 发布，而不是仅凭仓库内模块名称推断能力：

- 原始 v0.10.3 Tag 当前解析到 commit 061376f4a023070f215f9feffad5c24d96d503cb；该 commit 的签名已验证，但本文未证明 Tag 受到保护或不可变。
- 修复分发的 Tag v0.10.3+source-repair.1：commit 896efbcec64132377e05fca7b3f7f6ff6b3c900b，tree 533f46fa07c809c827e2b0c3d902a4e1beaf47df。
- Source Repair Release 仅分发 GitHub Release 附件，不是 npm Registry 发布；包版本仍为 0.10.3。
- 四个公开包：Contracts、Microkernel、BUILD、Host-Node。要求 Node.js >=24。
- 从原始 Tag 到 Source Repair 的 12 个差异路径属于 package manifest、lockfile、分发脚本、文档和分发测试；没有修改 Runtime 源码。因此可使用 Source Repair Tag 作为公开消费身份，同时将原始 Tag 保留为历史身份；本文未证明 Tag 保护或不可变性。
- Monorepo 内部的 @kaicreator/domain-harness 包仍为 private、版本 0.2.0，不属于上述四个公开 Tarball。其内部 HarnessMachine 源码不能被当作公开 SDK 已交付能力。
- Release 明确记录 Windows 全量 npm test 曾 EXIT=1（#1471）；Release 只声明 lint、typecheck、build 和 tarball inventory gate 通过。本文引用测试文件作为可追溯验证证据，不把测试文件存在等同于所有测试已通过。

公开消费入口：

| 包 | 对外职责 |
|---|---|
| @kaicreator/domain-harness-contracts | ABI、类型、错误、LLM DTO 与运行时 Guards |
| @kaicreator/domain-harness-microkernel | load；/host-seam 激活和受限 Host seam |
| @kaicreator/domain-harness-build | buildV10App 与 Component 投影 |
| @kaicreator/domain-harness-host-node | CAS/Memory、Durable Controls、Deployment、Decision Evidence、Meta Feedback、Node Provider Host |

LLM Provider 子路径由 Host-Node 暴露为 /llm/openai 与 /llm/anthropic。Standard Feature 和 Capability 模块是被 BUILD 选择的 Domain Package 资产，不是独立 npm SDK 包。

## 3. Harness 产品能力模型

以下是产品职责分组，不是新增 Component family、Package layer、ABI 或运行时层级。

### 3.1 Domain / Goal Framing — 领域与目标边界

Harness 必须在选定 Domain Scope 和 Consumer Profile 内处理请求，明确：
- 当前目标、相关对象、输入和预期结果；
- 必需事实、前置条件、约束和排除范围；
- 已知、缺失、歧义、冲突、未知和越界状态；
- 哪些问题可以由已选 Domain Intelligence 解决，哪些必须澄清、等待、拒绝或升级。

领域语义、业务意图和最终业务资格仍由 Domain Definition / Business Policy 声明。Harness 提供通用消费能力，不自行发明某个 Domain 的业务规则。Domain-Forge 的设计时领域发现也不等同于 Runtime Goal Understanding。

### 3.2 Intelligence Resolver — 智能选择与解析

严格保留冻结 v0.3 的决策来源优先级：

1. Deterministic Compiled Domain Intelligence；
2. Exact Semantic Result Reuse；
3. Applicable Promoted Reusable Subworkflow；
4. Bounded HarnessMachine / LLM Fallback。

Exact Reuse 不得被 Promoted Subworkflow 交换到后面或前面。适用性、Schema/Revision/Provenance 和精确版本不匹配时不得模糊命中。现有 Semantic Decision 对 Procedure 做 exact id/revision pin，但该 Pin 本身不证明 Procedure 已 Promotion；被选 Registry / Consumer 必须保证它确实是适用且已晋升的资产。没有合格智能时可以返回 unavailable、clarification、refusal 或 bounded fallback；不能为“有回答”而强制调用 LLM。

### 3.3 Context Engine — 上下文计划、获取与组装

Context Engine 将已授权的来源观察组织为当前决策所需的最小、可检查上下文。至少需要：
- 明确 Context Scope、来源身份、版本、Provenance、适用范围和时效；
- 由 Host / 已声明 Tool 获取当前权威事实、Memory、外部观察；
- 由 Harness 进行确定性筛选、排序、预算控制和结构化组装；
- 识别冲突、重复、过期、缺失和未验证材料；
- 在新观察到达后有界刷新上下文，而不是无界累积历史；
- 对敏感内容执行最小化，不把完整私有历史或隐藏 Chain-of-Thought 作为必要输入。

检索和物理读取由 Host / 已声明 Tool 执行；Context Feature 不得伪装成 Host 授权或实际 Memory 读取。现有 Feature 按 observation id 排序而非语义相关性排序；Host Memory 的 search 是授权的 key-prefix 搜索，不是语义检索。存储技术不在本 Product/L1 指定。

### 3.4 Bounded Reasoning Episode — 有界推理过程

当确定性智能、精确复用和已晋升子流程不足以解决当前问题时，Harness 才启动有界推理过程：

~~~text
prepare context
  → model request
  → structured result / tool proposal
  → schema + identity + policy validation
  → selected capability admission
  → authorized Tool execution
  → observed result
  → bounded context refresh
  → next model request when needed
  → validated final result / clarification / wait / refusal / failure
~~~

必须定义最大步骤、模型/工具调用预算、deadline、取消、重复调用防护、未知外部结果、失败恢复和终止条件。模型只能提出结构化结果或 Tool Proposal；不得决定 K State、Transition、Effect Permit、Journal 或 Promotion。该 Episode 不拥有独立持久化状态机或调度器。

### 3.5 Capability / Tool / Workflow Orchestration — 能力编排

Harness 使用 Domain Definition 已声明的 Semantic / Tool Component 和 requires/provides 契约：
- 在当前 Domain 与 Consumer Profile 中选择适用能力；
- 校验能力身份、Revision、输入 Schema、权限和效果分类；
- 将请求送入现有 BUILD 选定路由和 K Admission；
- 由 Host 执行真实外部操作；
- 将实际结果、失败或 UNKNOWN 作为观察反馈给当前 Episode；
- 仅通过现有 Business / Domain Machine 决定下一业务转移。

Tool Proposal、Tool Operation、Tool Implementation 和 Tool Result 是不同对象。模型返回 Tool Proposal 不代表 Tool 已被选中、授权、执行或验证。禁止动态加载模型命名的 Tool，禁止让 LLM 绕过 K/Host。

### 3.6 Evaluation — 中间结果与最终结果评价

Harness 提供通用结构验证和证据协调能力，但 Domain-specific 正确性仍由消费者定义：
- 结构 / Schema / ABI / 输入输出契约；
- Domain Rules、Invariants、适用条件和排除范围；
- 证据来源、完整性、时效、Provenance 和冲突；
- Tool 执行是否产生真实、可验证的结果；
- 当前状态是否仍允许该决策；
- 最终结果应 ACCEPT、REVIEW、CLARIFY、WAIT、REFUSE、RETRY（有界）、ESCALATE 或 FAIL。

Evaluation 不等于“JSON 可解析”或“LLM 返回 completed”。Harness 不得静默裁定高影响冲突，也不得将模型自评当作权威验证。

### 3.7 Continuity / Memory / Recovery — 连续性与恢复

- Harness 管理当前 Episode 的逻辑预算、调用关联、上下文引用和终止语义。
- Kernel 管理唯一权威实例状态、转移、Effect、Journal、UNKNOWN、Replay/Dedup。
- Host 管理物理 CAS、Memory、外部工作、Callback/Deadline、Child Invocation、Poison Recovery 和实际 Provider 取消。
- Task-scoped Working Memory 与跨任务候选知识必须分离；运行观察不会自动成为已晋升 Domain Intelligence。
- WAIT/RESUME 是受治理的业务工作流连续性，不等同于无限期暂停一个私有模型 Chain-of-Thought。
- Host 没有自动 Scheduler 的能力不得被描述为后台自动恢复；调用方负责触发投递/恢复，Kernel/Host 负责幂等和持久真相。

### 3.8 Model / Provider Utilization — 模型使用

模型是可选的有界后备，不是 Harness 的控制权威。Provider Host 负责凭据、Endpoint、Model Allowlist、Deadline、协议适配、错误分类以及远端结果不确定性的分类/报告；Kernel 才拥有权威 UNKNOWN 状态、Journal/Fence 和恢复/对账语义。Domain Intelligence 与 Business Policy 不应依赖某个 Provider 私有字段。

Provider Connectivity、Structured Output、Tool Proposal、Streaming、Provider Fallback、Token/Cost Budget 是不同能力，必须逐项核验。当前 Provider 为非流式单次请求；OpenAI 只支持 JSON object 而拒绝 outputSchemaRef，Anthropic 当前拒绝 JSON、temperature 和 outputSchemaRef；两者均不提供隐式 Provider Fallback。Semantic Decision 虽允许声明 maxModelCalls 0..4，但一次 resolve 调用当前最多执行一次 fallback，不能据此推断多轮模型循环。不能因为存在 LLM Adapter 就宣称 Harness Reasoning 完整。

### 3.9 Evidence / Meta Feedback — 执行证据与改进候选

Harness 应产生可检查的结构化事实：选中的智能来源及版本、输入/上下文来源引用、调用计数、Tool 观察、验证结论、实际 K Receipt 摘要和最终业务结果。不得要求持久化私有 Chain-of-Thought。

经授权的 Decision Evidence 可供 Meta Feedback 形成有限 Candidate / Proposal。Candidate、Shadow 或一次成功执行都不是 Promotion、BUILD、Activation 或生产事实修改的授权。

## 4. v0.10.3 现状与证据矩阵

分类沿用 #1478：SUPPORTED / PARTIAL / MISSING / CONSUMER_OWNED / KERNEL_OWNED / FORGE_OWNED / NOT_REQUIRED。

| 能力 | 当前分类 | v0.10.3 事实与边界 |
|---|---|---|
| Domain / Goal Understanding | MISSING（通用公共 Harness 能力）；CONSUMER_OWNED（业务意图） | 公开 SDK 没有通用自然语言 Goal/Domain Recognizer 产品接口；Business Intent、Domain Scope 和领域语义由消费者提供。 |
| Context Assembly | PARTIAL | selected Context Assembly 只处理调用方传入的 observations；做 Scope 校验、Provenance 结构、按 ID 排序和预算，不做语义相关性检索。它不读取 Memory/Tool/Model，不证明 Host 授权，verification 标为 caller-reported。 |
| Scoped Memory | SUPPORTED（Host-owned） | Host-Node 提供按 deployment/tenant/app/B/agent/thread 隔离的 put/get/search/delete、Host authorize、Provenance、TTL 和 CAS；search 是 key-prefix 搜索，没有自动接入 Context Assembly 的语义检索/刷新闭环。 |
| Semantic Decision | PARTIAL | selected Feature 支持 Rule → Exact Reuse → exact-pinned Procedure → 单次 Model/Tool fallback；具有步数/调用/deadline 限制和 authority-field 拒绝。Procedure 的 exact pin 不自行证明 Promotion，且一次调用最多一个 fallback；它不是通用多轮 Reasoning Runtime。 |
| Public multi-round HarnessMachine | MISSING（公开消费路径） | Monorepo private package 有 HarnessMachine 源码，可在有限步数内循环 Model + 预绑定 read-only Query Capability；Mutation Capability 被拒绝。该包 private 且不在四个公开 Tarball 中，不能计为已发布公共能力。 |
| Tool Proposal | SUPPORTED（数据契约） | OpenAI / Anthropic Host 可以返回受限 Tool Proposal 数据；Proposal 本身没有 Permit 或执行权。 |
| Proposal → Tool → Observation → Model loop | MISSING（通用公共闭环） | Provider C 仅将单次 Host 结果包装为 K External Effect Terminal；不自动执行模型提出的 Tool，不把 Tool 结果重新送入模型。 |
| Declared Tool / Capability Route | SUPPORTED | BUILD 选定 C / Capability，K Admission/Effect Permit 决定能否调用，Host 负责真实 I/O；路由静态、显式、受治理。 |
| Workflow / WAIT / RESUME / Child | PARTIAL | Workflow Control 是纯 Proposal Planner；Host Durable Controls + K 提供 CAS、Callback/Deadline、Child、Replay/Recovery。它是业务流程连续性，不是通用 Reasoning Loop Scheduler。 |
| Outcome Evaluation | PARTIAL / CONSUMER_OWNED | Schema、Feature Guards、B Policy、K Invariants 能验证结构与业务转移；证据充分性、领域正确性和最终接受标准仍由 Domain Consumer 声明。 |
| State / Effect / Journal / Replay | KERNEL_OWNED | 单一 K/Microkernel 权威；不得在 Harness、Feature、Host 或 LLM 中复制。 |
| Provider Transport | SUPPORTED（Node Host） | OpenAI-compatible 与 Anthropic Messages Host 子路径、neutral LLM DTO、selected C route 和 K Effect 路径存在；Node >=24，非流式单次请求。OpenAI/Anthropic 的结构化输出能力不同，Schema Ref 当前不支持；无隐式 Provider Fallback。 |
| Context/Provider Cost Policy | PARTIAL | DTO/Host 有 deadline、token usage 和错误类别；通用成本策略、动态模型选择、跨 Provider 自动降级和 streaming 未构成统一 Harness 产品能力。 |
| Decision Evidence | SUPPORTED（Host bridge） | DecisionEvidenceObserver 可调用 selected Semantic Feature、读取真实 K Receipt、Host 计数 Model/Tool 调用并输出不可变 Trace；不是通用领域结果评估器。 |
| Meta Feedback | SUPPORTED（proposal-only） | Host Workflow 读取有界 Evidence/Candidate/Shadow，调用 selected Feature 生成有限 Proposal，并以 CAS/稳定消息身份写入 Ledger；没有自动批准、Promotion、Activation 或 Effect。 |
| Domain Intelligence Production | FORGE_OWNED | 来源研究、知识综合、候选生产、资格审查和晋升属于 Forge/治理流程，不是 Runtime Harness 自动学习。 |

## 5. 关键源码与测试证据

### 5.1 Context / Memory

- Context Feature：domain-packages/standard/features/context-assembly/modules/sfeature-context-assembly-v1.mjs。
- Context P/N：tests/assembly/v010-t05-context-feature.test.ts。
- Host Memory：packages/host-node/src/scoped-memory.ts。
- 组合示例：tests/assembly/v0103-prompt-context-composition.test.ts。该示例证明特定 Prompt + Context + selected K/Host 组合，不证明通用 Retrieval/Refresh Engine。

### 5.2 Semantic Decision / HarnessMachine

- Semantic Decision：domain-packages/standard/features/semantic-decision/modules/sfeature-semantic-decision-v1.mjs。
- Semantic Decision P/N：tests/assembly/v010-semantic-decision-feature.test.ts。
- Private HarnessMachine：packages/domain-harness/src/harness/harness-machine.ts。
- Standard SDK 中 FR07-S1 单步 query/final surface 在 domain-packages/standard/basic/standard-sdk-v1.mjs 中明确标为 UNSELECTED；它不能证明公共多轮循环已经启用。

### 5.3 Workflow / K / Host Continuity

- Workflow Planner：domain-packages/standard/features/workflow-control/modules/sfeature-workflow-control-v1.mjs。
- Workflow P/N：tests/assembly/v010-t03-workflow-control-feature.test.ts。
- Host Durable Controls：packages/host-node/src/durable-controls.ts。
- 物理 SQLite restart / Callback / RESUME / Child / replay 参考：tests/hosts/node/v010-t03-workflow-control-physical.test.ts。该文件是源码级物理集成证据，不应误称为独立 clean packed consumer 验证。

### 5.4 Provider / Tool Proposal

- Neutral DTO/Guards：packages/contracts/src/llm-generate-v1.ts 与 llm-generate-v1-guards.ts。
- Provider Host：packages/host-node/src/llm/providers/openai/client.ts、anthropic/client.ts。
- Selected Capability：domain-packages/capabilities/llm-openai-compatible/module.mjs、domain-packages/capabilities/llm-anthropic-messages/modules/capability-llm-anthropic-messages.mjs。
- Provider 测试：tests/assembly/v0103-llm-openai-only.test.ts、v0103-llm-anthropic-only.test.ts。
- Clean packed consumer：tests/hosts/node/v0103-llm-selected-packed-consumer.test.ts，验证四个公开 Tarball 的外部安装/导入及 0/1/2 Provider 选择。其 Tool 测试证明 Proposal 数据返回，不证明 Proposal 自动执行。

### 5.5 Evidence / Meta Feedback

- Selected Evidence Feature：domain-packages/standard/features/decision-evidence/modules/sfeature-decision-evidence-v1.mjs。
- Host Observer：packages/host-node/src/decision-evidence-observer.ts。
- Evidence P/N：tests/assembly/v010-t06-decision-evidence.test.ts。
- Meta Feature：domain-packages/standard/features/meta-feedback/modules/sfeature-meta-feedback-v1.mjs。
- Host Meta Workflow：packages/host-node/src/meta-feedback-workflow.ts。
- Node24 + SQLite 物理 Meta 测试：tests/hosts/node/v010-t09-meta-feedback-workflow.test.ts。

## 6. 目标消费路径与权威分工

~~~text
UX / Caller
  → selected Domain App + Business Intent
  → Domain Scope / Goal framing (Definition + Consumer Policy)
  → Context Plan / Host-authorized reads
  → Context Assembly
  → Intelligence Resolver
      deterministic compiled
      → exact semantic reuse
      → applicable promoted subworkflow
      → bounded Reasoning Episode (only if needed)
  → structured result / Tool Proposal
  → validate identity + schema + policy
  → selected Capability route
  → K Admission / Effect / Journal
  → Host physical Tool / Provider I/O
  → observed result
  → bounded Context refresh / next reasoning step
  → Domain-specific Evaluation
  → one Business / Domain Machine transition through K
  → Decision Evidence Observer
  → Meta Feedback Candidate (proposal-only)
~~~

权威分工：

- **Domain Definition：** Domain App 的抽象 Semantic/Tool Component Graph 及精确 Component 关系；它不等同于已选智能或 Package 物化。\n- **已选 Domain Intelligence：** 带有来源/当前性和资格证据、范围明确且已资格确认的领域概念、事实、规则、决策标准、Recognizer、Procedure/Workflow、Tool 选择知识和结果评价语义。\n- **Domain Package：** 面向特定 Consumer、对 Definition、已选 Intelligence、契约、依赖、实现制品和精确 Pin 进行版本化物化/分发的载体；它不是 Domain Definition 的本体父级。
- **Harness：** 通用消费与协调能力；选择智能、组装上下文、运行有界推理、提出并校验能力调用、协调观察和结果评价。
- **Business / Domain Machine：** 业务控制流、业务意图和业务策略；仍是唯一业务控制流所有者。
- **Kernel / Microkernel：** 对 v0.10.3 公开源码基线，现有 Kernel/Microkernel 仍是 Admission、State、Transition、Effect、Journal、UNKNOWN、Replay/Recovery 的唯一权威。对于在研后继架构，#1484 正式 Checkpoint 的 Boot → KDP Primary 模型将相同的单一权威职责分配给 KDP Kernel Core。原 Microkernel 不再是后继架构必须独立存在的层；历史 v0.7 制品保持不变。该后继方向不代表当前 v0.10.3 Runtime 已实现 KDP。
- **Host：** 真实 Provider、Credential、Memory/Data Store、外部 Tool、CAS、Durable Control、Evidence Sink 和环境授权。
- **Domain-Forge / Simulator：** 设计时知识生产、模拟、资格验证和候选改进；不在 Runtime 自动修改活动实例。
- **DIS：** 定义可交换的 Intelligence Unit、Recognizer、Decision、Procedure、Workflow、Graph、资源闭包和 Conformance；Harness 消费其已选结果，不重复定义 DIS 本体。
- **UX：** 交互、澄清和展示，不拥有 Runtime/Effect 权威。

## 7. 主要产品缺口与优先级

| 优先级 | 缺口 | 产品影响 |
|---|---|---|
| P0 | 公共 Harness 端到端消费闭环尚未形成 | Context、Reasoning、Tool、Evaluation 的现有构件不能仅凭存在就被视为完整 Harness。 |
| P1 | Domain/Goal Framing 与 DIS Recognizer 消费契约 | 无通用公共接口时，不同 Domain 容易各自实现理解和歧义处理。 |
| P1 | Context Retrieval / Refresh 与 Host Memory 的组合边界 | 当前 Context Feature 仅组装调用方观察，不能独立构造可信任务上下文。 |
| P1 | 公共 Bounded multi-round Reasoning Episode | 当前 Semantic Decision 单次 fallback 和 private HarnessMachine 不等于公开多轮能力。 |
| P1 | Tool Proposal 到 selected Tool route 的安全闭环 | 目前 Proposal 不自动执行，通用工具观察回灌缺失。 |
| P1 | 通用 Outcome Evaluation 与证据充分性边界 | 当前结构验证与领域正确性分散在 Consumer，需定义通用 Harness 协调职责。 |
| P2 | Reasoning Episode 的暂停、恢复和中断恢复契约 | K/Host 已有外部工作恢复，但模型/工具多轮 Episode 的连续性尚未形成统一消费模型。 |
| P2 | Provider Streaming、Cost/Latency 策略和可选降级 | 仅在真实消费者证明价值后纳入；不应先把 Provider 功能清单变成 Harness 必需项。 |
| P2 | Context 与 Decision Evidence 的端到端来源关联 | 当前各模块有局部证据，尚未统一表达完整消费路径。 |

P0/P1 是 Product/L1 能力模型必须定义的缺口，不表示应立刻改 SDK。P2 是有真实消费者证明 ROI 后才考虑的扩展。

## 8. Product/L1 成功标准

1. 同一嵌入式 Harness 能消费不同 Domain 的精确选定 Definition 和 Intelligence，而不为每个 Domain 建一套 Runtime。
2. 已知问题优先走确定性智能、Exact Reuse、适用的 Promoted Subworkflow；常见路径无需 LLM。
3. 不支持、歧义、冲突、缺证据和越界请求可被明确识别，并可澄清、等待、拒绝或升级。
4. Context 的来源、范围、版本、Provenance、时效和预算可检查；Host 未授权数据不得进入可信 Context。
5. 需要推理时可以完成有界 Model → Tool Proposal → Admission → Tool → Observation → Model 的循环，并明确步数、调用数、deadline、cancel 和终止条件。
6. Tool Proposal 不能直接执行；每个外部操作都通过已选 Capability、K Admission/Effect 和 Host。
7. 中间和最终结果由 Schema、Domain Policy、Evidence 与当前状态共同评价；模型自评不构成权威。
8. WAIT/RESUME、取消、Replay 和 UNKNOWN 不产生重复 Effect；不引入第二 Journal、Scheduler 或 Runtime。
9. 运行证据可追溯到选定智能、Context 来源、真实调用计数和 K Receipt；不依赖隐藏 Chain-of-Thought。
10. Meta Feedback 只能生成 Candidate/Proposal，经过独立验证和显式 Promotion 后才能供未来版本选择；活动实例保留精确 Pin。
11. Provider 可选、可替换；无模型模式可用，不隐式切换 Provider 或放宽权限。
12. SDK self-bootstrap、Domain Intelligence self-bootstrap 和 Forge Seed bootstrap 分开评价，不把能加载自身 Package 当成完整自举。

## 9. 与相邻产品工作边界

- **#1477：** 已冻结的总体 Domain Intelligence Product/L1、Domain App、Component、Kernel 和自举边界；本文不得重开。
- **#1476：** Domain Package Semantic Knowledge 身份、查询/访问和可选数据资源合同；本文只定义 Harness 如何消费 Host/Package 提供的上下文。
- **#1480 / #1484：** #1480 记录最初的 Boot/KDP 后继方向。双语后继 Product/L1 修订现已通过 #1484 正式 Checkpoint，commit 为 `0a5f7ba0eb8361ff4c8e2ff17abc25de04f2e8bc`；它仅适用于在研后继架构，不改变 v0.10.3 公开源码基线。本文不重定义 Package 本体。
- **#1481 DIS 0.1.0：** 当前 L2 候选定义 Intelligence Unit、Recognizer、Decision、Procedure、Workflow、Composition Graph、资源闭包、资格和 Conformance。只有在精确 HEAD 验证、独立 Exact-SHA 审核和正式 L2 Freeze Checkpoint 完成后，这些契约才成为规范。本文定义 Harness 的消费能力，不复制 DIS Schema 或 Graph 规范。
- **#1398：** 保留原始 v0.3 四来源决策顺序和 Task/Meta 演进分离。
- **#1395：** 作为预生成优先、按需 LLM、动态步骤与恢复的具体 Consumer 场景，不等于通用 Harness 产品模型。

## 10. 明确不在本 Product/L1 冻结的内容

本文不冻结：
- HarnessMachine 的具体状态机、Actor 模型、API、ABI 或目录；
- 新 SDK Package、Component family、Package layer 或第二 Runtime；
- LLM Provider、模型、向量数据库、SQLite、Graph DB、RAG 技术或 Memory Vendor；
- Streaming、自动 Provider Fallback、自动重试或自动 Tool 执行；
- 通用 Agent、多 Agent、自由规划、无界循环或自主调度器；
- Domain-specific Rules、最终业务决策和领域知识库；
- 自动学习、自动 Promotion、自动 Activation 或活动实例静默换 Pin；
- v0.10.4 或其它 SDK successor version、L2、Task DAG、源码实施、Release 或 Deployment。

## 11. 当前状态与下一门禁

~~~ini
PARENT_PRODUCT_L1=#1477
PARENT_PRODUCT_FREEZE=YES
HARNESS_CAPABILITY_MODEL=ANALYSIS_CANDIDATE
V0103_SOURCE_BASE=v0.10.3+source-repair.1
V0103_SOURCE_COMMIT=896efbcec64132377e05fca7b3f7f6ff6b3c900b
V0103_SOURCE_TREE=533f46fa07c809c827e2b0c3d902a4e1beaf47df
CURRENT_PUBLIC_HARNESS=PARTIAL
PUBLIC_MULTI_ROUND_REASONING=MISSING
GENERIC_TOOL_PROPOSAL_LOOP=MISSING
PRODUCT_FREEZE=NO
L2=NOT_STARTED
TASK_DAG=NOT_AUTHORIZED
IMPLEMENTATION_AUTHORIZED=NO
VERSION_TARGET=UNASSIGNED
RELEASE_AUTHORITY=NONE
~~~

本候选需要 Fresh Independent Exact-SHA Product/L1 Review。审核通过后，Controller 才能记录 #1478 的 Product/L1 Freeze Checkpoint。之后是否启动 L2、如何划分与 DIS/#1480 的边界，仍需单独决定；本分析本身不自动授权实施。
