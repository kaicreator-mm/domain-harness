# Domain Intelligence Standard（DIS）v0.2.0 — Element-first 架构 R1 · 进化专题 R2

**状态：新 Product/L1 候选，非冻结标准。** 权威 Issue [#1496](https://github.com/kaicreator-mm/domain-harness/issues/1496)。本候选**取代**旧 #1494 / PR #1493 的 Intelligence Unit + Data/Processing/Composite 设计；原候选不应合并或视为规范。保留 DIS 0.1.0 冻结基线不变。

本文的 MUST/SHOULD 属于待审核的规范建议，不暗示 DomainHarness v0.10.3 已实现新 ABI。Element/Function 与 App Init 仍见 R1 候选；**LLM/Harness/进化以 [LLM_HARNESS_EVOLUTION_R2.zh-CN.md](LLM_HARNESS_EVOLUTION_R2.zh-CN.md) 为当前细化建议**，R1 相关建议保留历史。R2 已完成自对抗设计审核，但尚未独立验证、Schema 化或冻结。

## 1. 目标和责任边界

DIS 只标准化 **领域智能如何表达、提供 Function、声明依赖、经 AOT 装配和被 Domain App 消费，以及执行事实怎样用于未来智能进化**。Domain-Forge 或其他合格 Producer 从原始数据生成知识图谱并治理知识资产；DIS 定义消费者需要的知识查询契约，而不规定知识图谱生成、存储、资产治理和自动训练算法。

Domain-Harness 是消费领域智能的运行与编排产品，不是通用 Agent 平台。Package 是目标环境的交付载体，不是 Domain Intelligence 本体。

## 2. 概念和最小模型

- **Domain = Element Dependency DAG**。节点为 Element，边为静态依赖；DAG 不表示业务运行时的数据流、状态机、Workflow 或 Task DAG。
- **Element** 是内聚的领域语义 / 服务职责微型 Library，可包含多个公开 Function、私有实现、知识查询需求和自有状态。颗粒度由内聚职责、可复用性及独立版本/验证边界决定，非“一函数一 Element”或“一文件一 Element”。
- **Function** 是对外可调用的稳定语义契约，其 Description、参数/结果、适用条件、typed outcomes、验证义务与兼容性供人、LLM、构建器和消费者共同理解。
- **Capability** 仅是对外稳定的 Function Contract 视图/兼容性接口，可从 Function 导出或引用，不能维护可漂移的第二份重复定义。
- **Package** 聚合并提供已选 Elements/Functions/Resources/Implementations。KDP Package DAG 与 Domain Element DAG 是两层静态依赖，不等同于运行期流程。
- **App Init Element** 是每个可运行 Domain App 指定的唯一业务初始化 Element；它的标准函数 `init` 在 KDP/SDK/Business Package 技术初始化后执行。
- **Interaction** 是渐进澄清用户 Intent 的一种普通 Element 职责；Form、Chat、Wizard、Tree、CLI 等只是不同界面表达，不强制统一 UI 引擎。

### 2.1 Element Type

不强制 Entity / Relationship / Knowledge / Rule / Operation / Process 互斥或枚举类型。可选 tags/roles 仅供检索、文档和设计工具使用，**不能**凭标签改变运行权限或强制某种执行引擎。关系、约束、协作语义本身也可被封装为 Element；底层的普通数据、Fact 和索引不必强制生成 Element。

## 3. Element / Function Contract

每个 Element 至少定义 `id`、`version`、`description`，标准公开 `functions` 列表（允许 0 项，限静态语义/声明性 Element），可选 `dependencies`、`knowledge`、`state`、`implementation`、`validation`。可调用 Element 必须真正具有至少一个公开 Function。

每个公开 Function 必须提供唯一 ID、用途、I/O/Schema、成功/失败/未知语义及兼容性；证据要求、前置条件、适用性、examples、timeout、effect class、verification 可按 Function 的需要扩展。允许内联或外部引用；规范化解析后等价。未知必需扩展必须拒绝，不能默默忽略。

一个 Element 可以有多个 Function，且**每个 Function 可采用不同 Implementation**（Rule、Code、Query、Workflow、LLM/Harness 等）。Workflow 是实现策略而非全局默认执行模型。具体领域状态由 Domain Element 自己决定；`sdk.sqlite` / `sdk.json` 等 SDK Element 仅提供无业务语义的基础服务，可选通用 CAS primitives 不意味着 `sdk.state` 是所有业务状态权威。

## 4. 静态依赖与动态执行分离

`dependencies` 可在一个 ElementRef 下引用目标 Element 的多个 Function IDs/Contract Versions。AOT 负责解析依赖闭包、检查静态环、锁定精确版本/目标/提供者和实现摘要。

Element 静态依赖 DAG **必须无环**。运行期可以出现重试、事件反馈、递归、循环、多个并行 Task、交互式暂停/恢复；这些属于相应 Function 的运行组织策略，不隐含在 DAG 中，也不自动获得无限次调用权。跨 Element 的消息/事件互动需使用已锁定、声明过的事件或服务引用，避免隐藏静态循环依赖。

## 5. AOT、Package、Target

Package 按目标运行环境构建，例如 Windows、Linux、Android 分别具有自己的 Package/依赖闭包。不定义统一文件/网络/进程/设备的物理 Host Adapter，也不要求一个 Package 兼容多个 Host。Target 专属实现可以直接调用其允许的原生 API。

AOT 产出精确 Function binding、Element/Package/resource digest、所选实现、Target、兼容性/验证身份、公开 ingress 和可选 Provider Catalog。Runtime 不得把候选 Rule/LLM/Function 热插入已激活实例，或任意解析未经锁定的模块路径。

## 6. 双层初始化与入口

1. Boot 最小启动 KDP。
2. KDP 验证、装配和初始化其管理的 SDP（SDK Domain Packages）及所需 Business Packages；Package 级初始化属于技术装配。
3. 所有必需 Package READY 后，KDP 执行 App 描述符指定的唯一 Business **App Init Element.init(context)**；此时初始化应用业务服务、状态/资源协作与健康检查。
4. App Init 返回 READY（或显式降级/失败）后，开放 AOT 固定的一个或多个 ingress。Ingress 可以直接指向普通 Element.Function，**不必须经过 App Init 路由或 Main Workflow**。
5. 业务运行和任务恢复归业务 Element。KDP 负责 Package/运行治理，不能出现并行的第二权威。

App Init 标准签名、重启、失败清理和权限边界见 APP_INIT_CONTRACT_R1.zh-CN.md。仅强制 `init`；可选 `shutdown`，不强制每个业务提供 start/stop/resume。

## 7. Intent Interaction（可选）

Interaction Element 接收当前 Goal/Intent、可信事实和此前回答，产出 UI-neutral 的下一交互请求、缺失信息、限制、版本及已澄清的 Structured Intent。允许表单、对话、文件选择、图示、CLI；需要额外判断时可选择经 AOT 绑定的 Harness/LLM。Intent 完整不等于具备执行许可；需要新证据、UNKNOWN、冲突和取消时必须明确返回。

## 8. Harness 与 LLM（可选 Profile）

LLM Element 标准化受控的**模型调用**；Harness Element 标准化一个**有边界的领域推理过程**：Context → 选定可达 Functions → 建议 → KDP 准入 → 真实观察 → 验证/退出。LLM 可缺席，Harness 可仅使用规则与已固化知识。禁止模型输出直接成为 Effect、Tool 权限、状态事实或新 Function binding。

历史 v0.3 建议的决策来源默认优先级：确定性已编译智能 → 合条件的精确语义复用 → 已晋升子流程 → 受限 Harness/LLM 回退。允许 Domain 声明经过验证的例外，不把这个顺序写进 KDP 通用调度器。详见 LLM_HARNESS_EVOLUTION_R2.zh-CN.md；R1 作为前序设计记录。

## 9. 两层进化与版本治理（可选功能，交换边界必定义）

- **Task/App 快层**：当前任务内复用已验证结果、维护业务状态与轻量局部经验，必要时 LLM 辅助未知；产生真实 Outcome、Provenance、脱敏 Evidence/Feedback。不能改变当前 AOT 的可执行绑定。
- **Server/Meta 慢层**：跨任务收集经过授权的数据，识别模式与反例，产生候选 Rule/Function/Workflow/Interaction/知识查询要求；由服务端 Domain/Forge 评估和治理，经过 Validation、授权 Promotion、AOT 新包及 Activation 才可供未来实例使用。
- **不新增第二个 Kernel/Meta Authority**。知识图谱资产化归 Forge；Meta Domain App 可以是用相同 Element Contract 构建的普通 Domain App。进化算法、Prompt 优化、数据仓库结构不进入 DIS Core。

DIS 定义 `ExecutionEvidence`、`IntelligenceUsage`、`LearningFeedback`、`CandidateReference`、`QualificationReceipt`、`ActivationReference` 的最小交换语义，不能自动上传原始 Prompt、私有数据或模型内部推理过程。Outcome 的真实性与被允许晋升是不同维度。

### 9.1 R2 进化统一约束（当前细化建议）

AOT 为**适用的 Function**预先声明可选 Harness/LLM/Experience/受限 Evolution Slot 的已锁定边界，而非强制所有 App/Function 使用 LLM。Function 按 DETERMINIZABLE、HYBRID、GENERATIVE、NONE 的候选策略分别进化；原创生成应改进 Prompt/Context/验证，不默认固化结果。

Experience 必须由真实 Trace/Evidence 和独立业务验证得到；缓存命中是收益，不是独立样本。程序可按 ProblemSignature + SolutionSignature 召回候选规律，LLM 只提出规则或 Function Candidate；持出来源独立的测试与负例才能决定是否合格。App 若且仅若具备已选有界解释器/Schema/Scope/原子任务 Pin/撤销能力，才可局部激活**规则数据**；新源代码/依赖/权限仍须经过 Server/Forge/AOT。不可把 RESULT_REUSE 用于未经重新核实的当前事实或 Effect，也不因本地合格自动发布新 Element/Package。

**对抗审查结果**见 [ADVERSARIAL_REVIEW_R2.zh-CN.md](ADVERSARIAL_REVIEW_R2.zh-CN.md)（P0=3/P1=7/P2=2，均为设计发现；未完成执行验证）；测试计划见 [EVOLUTION_CONFORMANCE_R2.zh-CN.md](EVOLUTION_CONFORMANCE_R2.zh-CN.md)。

本版本针对自对抗审查 A01–A12 的**限制性设计修复**另见 [EVOLUTION_DESIGN_REPAIRS_R2.zh-CN.md](EVOLUTION_DESIGN_REPAIRS_R2.zh-CN.md)。规则 Slot 未具备生产解释器/原子 Pin/撤销能力之前，局部执行一律降为 Candidate + Shadow；任何模型自述成功、缓存多次命中、跨租户上报或任意代码热加载均不能作为资质。

## 10. 实施边界及符合性

本 R1 先完成 Product/L1 概念替代，**不宣称 Schema、Demo、SDK ABI 或真实 Runtime 已更新**。后续需：中文/英文规范完整一致；机器 Schema/inline+ref 等价性；Tally/xDownload/Shun/ai-rexform 真实消费场景；LLM 禁用及有界多轮 Harness；任务内/跨任务进化、非法晋升、未知 Effect；两层初始化和恢复；独立 Conformance、Exact-SHA review、CI 与 L2 Freeze。

冻结 DIS 0.1.0 不被变更。旧 0.2.0 的 Unit/Profile/统一 Unit Lifecycle 设计仅保留历史证据，不能作为当前版本的并行权威。
