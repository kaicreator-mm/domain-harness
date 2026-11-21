<!-- DH_V0110_SOURCE_QUALITY_R15_CLOSED_20261121 -->
> **0.11.0 源码质量最新状态（覆盖历史 REWORK）：** 先前的 REWORK 为真实历史，但已在 [Issue #1602](https://github.com/kaicreator-mm/domain-harness/issues/1602) / [PR #1603](https://github.com/kaicreator-mm/domain-harness/pull/1603) 通过 R12→R15 复审完成四模块重构，R15 `ACCEPT_SCOPED`（P0=0/P1=0、保留五项非阻断 P2），Woodpecker #2787 同 SHA SUCCESS，已合入 `version/v0.11.x`；后续 [PR #1606](https://github.com/kaicreator-mm/domain-harness/pull/1606) 补齐中文注释和调用流程文档并经 #2788 成功合入。**仅 0.11.0 Foundation/Stage-0 工程资格合格；main、统一 Release、0.11.1+ 和 Full Conformance 均不能据此晋升。**
>
> 后续开发默认遵循 [0.11.x 防回归工程手册](../engineering/DOMAIN_HARNESS_V011X_DELIVERY_QUALITY_PLAYBOOK.md)：先分析新增信任/权限/生命周期边界，再做必要正反例，提交前检验类型和测试，按 Exact SHA 独立增量审核，禁止重复无效 CI 和往返拆分本地 Agent 任务。
<!-- /DH_V0110_SOURCE_QUALITY_R15_CLOSED_20261121 -->

# DomainHarness 0.11.x — 完整重写与 Domain-Bounded Harness 版本路线图（R4 · Owner Confirmed）

<!-- DH_V011X_OWNER_CONFIRMED_FULL_REWRITE_STAGE_ROADMAP_20261121 -->

```ini
OUTPUT_LABEL=DH_V011X_OWNER_FULL_REWRITE_ROADMAP_R4
REPO=kaicreator-mm/domain-harness
MASTER=kaicreator-mm/domain-harness#1563
SOURCE_BRANCH=version/v0.11.x
VERSION_RANGE=0.11.0_TO_0.11.9
VERSION_PLAN=OWNER_CONFIRMED
REWRITE_MODE=FULL_011X_REDESIGN_AND_REIMPLEMENTATION
V010_COMPATIBILITY=NONE
V010_FEATURE_PARITY=NOT_REQUIRED
V010_SOURCE_MIGRATION=NOT_REQUIRED
LEGACY_PUBLIC_ABI=NOT_EXPORTED_BY_NEW_011X
CURRENT_STAGE=0.11.0_INTERNAL_ACCEPTED
FUTURE_STAGES=0.11.1_TO_0.11.9_PLANNED_NOT_IMPLEMENTED_NOT_L1_L2_FROZEN
DEVELOPMENT_TRAIN=version/v0.11.x
MAIN_MERGE=ONLY_AFTER_WHOLE_011X_ACCEPTANCE
RELEASE=ONLY_ONCE_AFTER_WHOLE_011X_ACCEPTANCE
NODE_MINIMUM=22.12.0
```

## 1. 首要决议：0.11.x 是完全重写，不是旧版迁移

**DomainHarness 0.11.x 是以领域有界 Harness/Agent 为中心、基于统一 Element-First / Function / Package / KDP 架构的全新产品实现。**

- **重写范围**：Domain App 描述与运行入口、领域模型语义、SDK 对外 API/ABI、Package/K-S-B 组合、BUILD/AOT/Lock、Boot/KDP 装载与执行，以及后续所有 Harness/Agent/Experience/Meta 能力，都只以新 0.11.x 合同为权威设计与实施。
- **绝不强制兼容**：不承诺 v0.10.x App/SDK ABI、旧版本 Package Manifest、旧 Runtime 层、旧业务功能或新旧行为一对一映射；不建立兼容适配层、迁移桥、历史功能 parity gate 或旧版依赖作为新版完成前置。
- **不依赖旧实现**：旧代码/原型/历史文档可作为原始思想与参考证据，**但不能直接等同新版代码或合格实现**。是否借鉴一个算法/依赖由新版架构和实际需求决定，不为了“复用旧代码”污染统一新模型。
- **不要重复造轮子**：完整重写指新版产品架构/功能实现的权威替换，不要求删除无关历史 Git 记录、文档或所有通用第三方工具；Node、测试框架、成熟 UI 组件等可按新版本需求正常使用。旧实现不得作为新版 public package 的隐含可执行 ABI。
- **同一个 Git monorepo**：统一 DomainHarness 公共 SDK、同一 BUILD/Lock/Boot/KDP 主路径；Workflow、State Machine、Rule、Tool、LLM、Meta/Feedback 是选择性 Domain Element/Function/Package 能力，不创建第二 Kernel、Workflow Runtime 或 Agent Runtime。
- **领域优先、编译优先**：DomainForge 负责领域知识生产及编译；DomainHarness 负责选择、激活、执行、观察、反馈。真正未解决的领域任务才进入选定的有界 LLM；LLM proposal 不拥有 State/Effect/Host 操作授权。
- **当前阶段语义**：0.11.0 是已内部验收的架构基线，其当前真实源码不因“完全重写”字样而被重做。0.11.1…0.11.9 是已确定的**版本规划/范围边界**，并非已实施或已逐项 Product/L2 冻结。

**本 R4 取代旧 R1/R2 的按功能横向分类、旧 R3“后续不分配版本号”以及未合并 Draft PR #1599 中过度细分 R6 的未来阶段安排。** 保留历史证据，不修改已合格 0.11.0 Product/L2/Task DAG。

## 2. 单一 0.11.x 开发列车与验收

- ``version/v0.11.0`：已验收的 Stage-0 历史基线。
- **`version/v0.11.x`：唯一后续阶段集成分支**；每个阶段沿最新已验收 HEAD 开发、做最小 Product/L2 增量与必要 Task DAG、实际源码和 scoped validation，受控合入并记录阶段快照。
- **`0.11.0…0.11.9` 是内部渐进阶段，不分别对外发行。** 每阶段验收可独立复现，前阶段已合格且未变化的证明只复用，不重复跑全套 CI 或做完整 Release Qualification。
- **只有 0.11.0–0.11.9 全部必需能力通过一次最终组合验收**，才创建唯一正式 `main` PR、受控合并并形成正式 Tag/GitHub Release；不预先把版本阶段号等同正式 SemVer Tag。npm Publish 不是默认必需动作。
- 本轮只固定版本阶段和目标，不因规划确认就自动启动 0.11.1 实施、创建 Task Issue 或宣称未来功能合格。各版本按实际开工时明确具体 PRD/AC 和验收责任，避免无限扩张。

## 3. 版本正式划分：按照 Harness/Agent 纵向闭环逐步完善

| 阶段 | 版本定位 | 本阶段主要交付 | 独立验收结果 |
|---|---|---|---|
| **0.11.0 — Foundation** | 新架构能定义、装配、运行一个 Domain App（**已通过 Scoped 验收**） | Element/Content/Function；K/S/B Package；BUILD/AOT/Lock；Boot→唯一 KDP→App Init；clean public SDK；Selected no-effect Function | 四包安装的新 SDK Consumer 能构建、启动、执行实际已选 Knowledge/Rule 改变结果的 Function；AC01–AC10 Scoped PASS |
| **0.11.1 — Task Execution** | 使用 Workflow + State Machine 实现**确定性 Task Execution Loop** | Goal/TaskRun、Workflow Step/Branch、Task/Domain 状态机合同、Guard、Bounded Coordinator/Observation/Outcome；选定 Function 的步骤执行 | 无 LLM/外部 Effect 的多步真实任务，能 COMPLETE、ASK/WAIT、REJECT/UNKNOWN，不能非法转移或无限循环；简单 Function 仍可直接调用 |
| **0.11.2 — Domain Intelligence** | 把 0.11.1 的结构性流程**领域语义化** | Domain concepts/objects、Knowledge/Rule/Recognizer/Validator/Decision、Intent/Applicability、必要最小 Reader/Query、领域策略选择和 UNKNOWN | 同一 Goal 在不同领域事实、版本、适用性条件下可选择正确的规则、流程与结果；知识不足或冲突时不编造结论 |
| **0.11.3 — Semantic Interaction** | 领域语义驱动的**自适应交互**，而不是“动态表单引擎” | typed Intent/Requirement/Interaction model、基于任务现有事实连续澄清、交互类型与成熟 UI 组件适配（Form、Selector、Table、Wizard、Chat 等）、确认后继续 Workflow | 用户表达不完整需求时，系统根据理解选择合适确定性 UI 交互；反复补齐事实后得到有类型/可校验的意图，未经确认不得执行敏感操作 |
| **0.11.4 — Authorized Action** | 从“理解并决策”升级为**可信真实行动** | Business State/CAS、声明式 Capability/Tool/Operation、KDP Permit/Host/Effect、Journal/Outcome、必要读回与失败分类 | 已授权真实操作后业务状态与 Host 结果一致；越权、错误权限或 UNKNOWN 不得虚报成功；不建立第二 Effect Authority |
| **0.11.5 — Bounded Reasoning** | 已编译知识、规则、复用流程不足时，使用**可选受限 LLM** | Provider-neutral LLM/Context、选定模型能力、步数/时间/费用预算、model→selected tool→observation→verify 的有界循环、结构化模型提案校验 | 已知情形不必调用模型；未知情形完成一次真实有界推理与受控工具调用；非法 Tool、预算耗尽与无效输出必须停下 |
| **0.11.6 — Durable Execution** | 可暂停、恢复、取消并保持执行结果正确的 Agent Task | durable TaskRun/checkpoint、已授权异步/延迟执行、pause/resume/cancel/timeout、必要幂等和恢复/观察、按需事件互操作 | 中断后恢复不重复提交历史 Effect；取消、未知完成状态与失败有明确结果；不复制 KDP 既有 Journal |
| **0.11.7 — Execution Evidence** | 收集任务执行信息，为两层反馈提供事实 | Task/Workflow/Step/Tool/LLM selected path、Package/Strategy pins、Goal/Outcome/失败原因/耗时/用户反馈，最小授权脱敏记录及 Client/Server 可交换摘要 | 对一次实际任务能确定“做过什么、走了哪条策略、为何调用 LLM、结果是什么”；未经授权数据不上传 |
| **0.11.8 — Client Experience** | **Client 端轻量学习/经验复用**，独立离线任务亦可受益 | 本地已验证纯语义计算结果精确复用、轻量任务经验、LLM 解题结果留作候选、按当前 Package/域/版本/权限判断适用性；Client 在已授权任务内优化选择 | 同等条件下纯决策无需重复 LLM；不同版本/租户/失效条件拒绝命中，不能重放 Effect；未经验证的 LLM 解法不能自动写成 Rule/Workflow |
| **0.11.9 — Server Meta Evolution** | **Server 端定时跨任务汇总与流程优化**，可接收授权 Client 摘要 | 可配置周期/手动触发汇总、跨任务失败与 LLM fallback/成本分析、发现共性问题、Workflow/Rule/Interaction 改进候选；与既有 Forge/Validator/批准/未来 BUILD 适配 | 对多次任务生成可复核分析与一个明确流程优化候选；有真实外部验证和授权时由新 Package/BUILD 生效，旧 Client Pin 不变；无权威时只保持候选/NOT_RUN |

**结构机制与产品价值的关系**：0.11.1 的 Workflow/StateMachine 是 Task Loop 基础，0.11.2 将其语义化，0.11.3 负责用户持续表达和澄清，0.11.4–0.11.6 使 Task 能执行、推理和恢复，0.11.7–0.11.9 用真实反馈改进未来能力。它们都是同一 DomainHarness 的扩展，不是并列工具产品。

## 4. Experience & Evolution：保留原始双层多级反馈，拒绝过度设计

原始依据：
- [冻结 v0.3 PRD ``8,11–13](https://github.com/kaicreator-mm/domain-harness/blob/main/docs/product/DomainHarness_v0.3_PRD_FROZEN.md) — 确定性结果 → 精确语义复用 → 已晋升 Workflow → 有界 LLM，区分 Journal 与 Cache；LLM 求解可发展为经验/Workflow/Rule，但不能自动晋升。
- [#1398](https://github.com/kaicreator-mm/domain-harness/issues/1398)、[#1395](https://github.com/kaicreator-mm/domain-harness/issues/1395)、[#1496](https://github.com/kaicreator-mm/domain-harness/issues/1496) — 当前 Task 轻量反馈、Client 本地经验、Server Meta 汇总与后续经批准的版本更新。
- [#1477](https://github.com/kaicreator-mm/domain-harness/issues/1477)、[#1478](https://github.com/kaicreator-mm/domain-harness/issues/1478) — Domain-bounded Harness 是领域智能消费者，而非通用 Agent 和 Forge 替身。

**只保留用户提出的四个 Concern，并将其落在三个阶段：**

1. **收集任务执行信息（0.11.7）**：采集必要真实事实，不额外建第二日志平台、Memory DB、Meta Runtime；Step/Outcome 等早期版本已有基础日志直接复用。
2. **周期性汇总与流程优化（0.11.9）**：Server 定期或按需分析已授权的执行摘要，提出最小优化建议；如果没有真实外部验证与批准，不冒称已正式发布的领域智能。
3. **Client/Server 各自进化（0.11.8 + 0.11.9）**：Client 在离线/本地优先做确切结果与选定流程的轻量复用；Server 横向聚合任务证据并生成更通用的新版本改进，两端通过有限可检查的摘要/版本接口对接。**不是双 Kernel，也不是两个 Agent 引擎。**
4. **LLM 经验化（0.11.8 + 0.11.9）**：一次未知问题由选定 LLM 解决后，仅记录“是否真正解决、适用范围、验证证据”，相同语义下合格纯决策可精确复用；重复模式可形成 Workflow/Rule 候选。只有独立验证与明确授权的新资产才进入未来 Package，不能热替换现有实例。

**只要能实现这四项并独立验收，就不需要再拆单独的 Shadow/Qualification/Promotion/Memory 平台版本。** 这些是流程中必要的判断和适配，不是 DomainHarness 必须自研的一套平台。Client 本地记录是否同步给 Server 受用户和应用权限控制；Server 的定时任务由用户部署的 Host/调度器配置，不能假定 ChatGPT 或外部 Agent 后台自动运行。

## 5. 分阶段交付与源真相

- **0.11.0 的事实不变**：已完成 Element-First 基线和唯一 Demo `examples/v011-basic-app`，#1597 / PR #1601，Woodpecker #2759；AC01–AC10 是 Scoped PASS，不能凭旧版测试或本规划提升任何 Full Conformance。
- **0.11.1–0.11.9 规划已确定，源码尚未实现**：每阶段开工前明确本阶段最小 Product/L1 delta、必须 L2 合同、任务 DAG、真实 Consumer 场景、验收负例，并只验证实际改动；它们不是因为分配版本号就自动获得 L1/L2 Freeze 或开发许可。
- **下一步**：维护 0.11.0 已接受基线；按 Owner 后续推进指令再启动 0.11.1。不要将文档更新触发为长期持续本地 Agent 任务。
- **不纳入本轮默认完成门**：跨平台所有 Target、通用多 Agent 协作、全平台知识图数据库、全面 DIS Full Conformance、Server 专用学习基础设施、所有下游旧业务迁移。实际需要时单独明确为 0.11.x 后续范围，不预设新的必须版本。

<!-- /DH_V011X_OWNER_CONFIRMED_FULL_REWRITE_STAGE_ROADMAP_20261121 -->
