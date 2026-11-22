<!-- DH_V0111_R60_CURRENT_REMAINING_OPTIMIZATIONS_OWNER -->
> **【CURRENT · 2026-11-22 · R60，覆盖以下旧 R29/R4 状态】**：0.11.1 原 T11–T14/Function/Workflow Product/L1/L2 的限定资格及 R53/R58 单 SDK 架构修正确已受审合入版本列车 `054a2b2f6f67c518f205936befd3b30fbc24990b`。但 Owner 新增 [0.11.1 单一 Task #1656](https://github.com/kaicreator-mm/domain-harness/issues/1656) W01–W08、AC60-01..10 **尚待执行/审查**，不得因为原资格已通过就宣称 R60 完成。原 [#1644](https://github.com/kaicreator-mm/domain-harness/issues/1644) 0.11.2 Standard Reader 任务已关闭为历史重复入口，**JSON/YAML Standard Reader 的实际抽取、跨域消费、跨语言规范收口、公共类型去重、真实 SDK 一项安装、业务第三方依赖、跨代验证、文档清理，都归 0.11.1 #1656**。0.11.2 #1612 只新增 Domain Intelligence 能力，待 0.11.1 R60 通过后**复用**已实现 Standard Reader，不再承担其生产。内部四个 Workspace ≠ Consumer 要安装四个产品；公开唯一 SDK 为 `@kaicreator/domain-harness`，BUILD workspace 已私有化。R49 DIS/DH PR #156/#1653 尚待独立审核，不能称正式合并。

<!-- DH_V0110_SOURCE_QUALITY_R15_CLOSED_20261121 -->

> **Foundation B0 增量覆盖历史资格（#1624 / Draft #1625，2026-11-21）**：此前 0.11.0 Scoped 证据只针对旧入口合同。当前 Element-First 修订要求 Package.Init → 已选 Function 真调用；旧 READY 后直接 Function ingress、技术/业务双初始化、裸 EntryRef 全部退出公共模型。0.11.1 仅负责 Workflow 编排，不得为 0.11.0 的身份或执行漏洞建立兼容层。本增量须按最终 Exact HEAD 独审并合入 `version/v0.11.x` 才能晋升已修复，不得提前标注通过。
> **0.11.0 源码质量最新状态（覆盖历史 REWORK）：** 先前的 REWORK 为真实历史，但已在 [Issue #1602](https://github.com/kaicreator-mm/domain-harness/issues/1602) / [PR #1603](https://github.com/kaicreator-mm/domain-harness/pull/1603) 通过 R12→R15 复审完成四模块重构，R15 `ACCEPT_SCOPED`（P0=0/P1=0、保留五项非阻断 P2），Woodpecker #2787 同 SHA SUCCESS，已合入 `version/v0.11.x`；后续 [PR #1606](https://github.com/kaicreator-mm/domain-harness/pull/1606) 补齐中文注释和调用流程文档并经 #2788 成功合入。**仅 0.11.0 Foundation/Stage-0 工程资格合格；main、统一 Release、0.11.1+ 和 Full Conformance 均不能据此晋升。**
>
> 后续开发默认遵循 [0.11.x 防回归工程手册](../engineering/DOMAIN_HARNESS_V011X_DELIVERY_QUALITY_PLAYBOOK.md)：先分析新增信任/权限/生命周期边界，再做必要正反例，提交前检验类型和测试，按 Exact SHA 独立增量审核，禁止重复无效 CI 和往返拆分本地 Agent 任务。
<!-- /DH_V0110_SOURCE_QUALITY_R15_CLOSED_20261121 -->

# DomainHarness 0.11.x — 完整重写与 Domain-Bounded Harness 版本路线图（R4 Owner 基线 + R29 当前状态）

> **【R29 当前进度，覆盖下文 R4/R1 当时的阶段状态】**：0.11.0 #1564 与 0.11.1 #1605/#1608 已完成限定资格，0.11.1 T11–T14 功能与最终 Product/L1/L2 R27 已受审、实现及两份文档均合入 `version/v0.11.x@3145104258a4da5f8cc940482ff77322b97d6cf6`。0.11.2 #1612 只开始领域语义设计；标准 Element 提取归属 0.11.1 R60 #1656，0.11.2–0.11.9 尚未交付。下方早期 R4/R1 的状态快照仅用来说明路线图决策的历史来源，不可覆盖本段当前状态；完整源真相见 #1563 R28 记录。

<!-- DH_V011X_R33_SDK_FORGE_OWNER_CORRECTION_20261122 -->
## 【最新 Owner R36】0.11.x 独立完成 DomainHarness SDK，Package 由真实文件直接构成

**Domain** = 有界领域事实/知识/业务规则；**Harness** = Domain 内的任务/Workflow/授权/受限执行/反馈；**SDK** = 公开可复用的 Boot + Domain Packages + 实际验证/执行 API。0.11.0–0.11.9 的统一完整目标只有 **DomainHarness SDK**。

**R36 的关键修正：Domain Package 是符合 DIS 适用 Package 规范和 0.11.x 当前 Element-First/Package Contract 的真实多文件集合**。由 ChatGPT/开发者直接编写 Manifest、Element、内容/资源、Function 实现与对应 Target 即可；使用自动生成器不是准入条件，也不改变 Package 身份。**不开发 Seed Builder；#1647 仅直接编写 DH 基础 Package 文件**。此前 R34/R35 “必须先生产 Seed Package 再另行 Assembly”的工具化流程已撤销。

**应用的选择/运行 ≠ Package 的生产**：已有 Packages 根据声明确定真正使用的依赖、接口和 Target，必要时校验直接 Extension、Core.Order、资源摘要、Function 导出、可信 Boot/Pin，即可形成 SDK App 或普通 Domain App。无需独立 Assembly 产品/服务/生产阶段；现有 `buildApp` 属于历史代码实现，按实际安全目标复用，**不把它视为创建 Domain Package 的必要工具**，也不能因为取消工具就放弃已有安全拒绝。

**Forge 当前暂停，不阻塞 DH**：唯一状态 [Forge #218](https://github.com/kaicreator-mm/domain-forge/issues/218)；未合并 [Forge PR #217](https://github.com/kaicreator-mm/domain-forge/pull/217) 已关闭。不为 Forge 创建 SDK Release 依赖/测试/CI，未来 Forge 即使生产 Package，也遵循相同规范，不享有特殊资格。

**DH 自身基于 Domain Package 构成**：直接编写当前基础 Packages → 按实际合同验证与 Boot → 交付可安装/可复用 SDK；后续直接编写更新 Package 文件，以同一 SDK 能力构成新版 SDK 和真实 Consumer。不需要“编译器生成编译器”的工具自举，也不要求 Forge 或生成平台参与。真实 SDK/Consumer/权限/版本/资源与必要独审仍必须验证。

**【R37 实践驱动的规范完善】**：当前 DIS/Domain Package 与 DomainHarness SDK 的细节**尚未完全明确**，不强求 0.11.x 启动前先冻结全部规范。每个版本以**实际 Package 多文件实例 + 真实 SDK Consumer + 正/反例**推进，识别规范 `CONFIRMED / PROPOSED / UNKNOWN / NOT_APPLICABLE` 范围，把必要、可复用的合同写回版本 Product/L2/Contracts/测试，再按实际改动进行独立增量审核。已明确且当前适用的安全/身份/权限/Target/Boot 义务保持执行；不把缺失的全域 DIS 形式资格当作本版已通过，也不因不影响当前任务的未知项停工。

**【R37 验证工具与生成方式正交】**：Package 可以由我/人/Agent 直接编写，**允许额外按需实现轻量验证工具**，检查 Manifest/Element/Function/依赖/Target/资源摘要及实际安全负例。验证器检查文件是否满足**当前明确适用**的规范，不创造 Package、不决定谁可写 Package。可以将来复用于 Forge，但 Forge 仍 DEFERRED，**不要求现在写 Forge 或新增独立 Build/Assembly 平台，也不以验证工具存在为 Package 创建前置**。该工具的静态 PASS 不能替代真实 SDK Consumer、DIS Full Conformance 或新增独立权限证明。主要实施准则：[R37 活规范与直接 Package 文件](../specs/DomainHarness_v0.11.x_DOMAIN_HARNESS_SDK_PACKAGE_FILES.md)。

**最新权威候选**：[R36 Package 文件/SDK 规范](../specs/DomainHarness_v0.11.x_SDK_FORGE_ECOSYSTEM_BOOTSTRAP.md) / [R36 三名称与直接文件](../specs/DomainHarness_v0.11.x_DOMAIN_HARNESS_SDK_PACKAGE_FILES.md) / [历史 BUILD 源码职责审计](../architecture/DomainHarness_v0.11.x_LEGACY_BUILD_OWNERSHIP_AUDIT.md)。以下 R4/R29 中“完整 BUILD 必须生成 Package”“自举只可选”等为历史讨论，不得覆盖 R36。0.11.0/0.11.1 原已受审且未变的安全源码结论继续限定复用，0.11.2–0.11.9 的 Product/L1/L2/Task/PR 均必须遵循新边界。
<!-- /DH_V011X_R33_SDK_FORGE_OWNER_CORRECTION_20261122 -->

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
CURRENT_STAGE=R4_HISTORICAL_SNAPSHOT_0.11.0_INTERNAL_ACCEPTED
FUTURE_STAGES=R4_HISTORICAL_SNAPSHOT_0.11.1_TO_0.11.9_PLANNED_NOT_IMPLEMENTED
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
- **【R4 当时的计划性约束，非当前进度】** 此段最初只固定版本阶段和目标，不因规划确认就自动启动实施；现在 0.11.1 已完成限定交付，后续阶段继续在实际开工时明确具体 PRD/AC 和验收责任，避免无限扩张。

## 2.1 标准 Element 体系：所有阶段复用优先，逐步积累（R29 新增规范）

**强制设计原则：** `0.11.1–0.11.9` 期间发现跨领域、语义稳定、可通过普通 Element/Function/Content 合同封装的公共能力时，优先提取为 **Standard Element**，后续版本以 BUILD 显式选定、直接 Extension/Import 复用为默认路径；不能每次编写新的通用 Reader、状态机规则、Guard/Validator/Selector。不是“所有功能都 Element 化”：Node 标准库/纯基础安全机制和 KDP/BUILD/Lock/Boot 权限与执行引擎继续留在 Engine 层。

- **三层架构**：Contracts/BUILD/Lock/KDP primitives → **Standard Elements（可选普通 Package）** → **Domain Elements**。Standard 是资产资格，不是新 `ElementDefinition.kind`、额外 Runtime、全局注册中心或对 BUILD 权限的例外。
- **从已接受的 0.11.1 开始提取**：demo `jsonReader/yamlReader` 目前并非独立标准包；真实 JSON/YAML 解析还在 `workflow-execution.ts`。优先归一到同一套真正可重复使用的 Reader Element，并把可信资源/UTF-8/大小/摘要授权保留在现有 BUILD/KDP；**不能保留两套有不同安全语义的解析器**。XState Actor 引擎继续在 KDP，只提取跨领域的声明式状态模型、具名 Transition/Guard 模板为标准 Element/Content，不创造第二 Workflow Runtime。
- **实施责任**：v0.11.1 [#1656](https://github.com/kaicreator-mm/domain-harness/issues/1656) 在收尾时负责真实提取并跨域验证首批 JSON/YAML Readers，v0.11.2 #1612 仅在新领域语义代码中消费，按真实需要提取状态转换模板；后续各版每次先做最小 Catalog/复用检查。保留各版本唯一主 Issue 和原范围，不重开 0.11.1 已接受任务来要求重新全量测试。
- **标准资格**：`CANDIDATE → STANDARD_ACCEPTED → DEPRECATED/REPLACED`，仅在具体版本、Function/Schema/权限、真实跨场景 clean-packed 调用、必要正反例及独立 Exact-SHA 审核后提升。只更新 Catalog 与本阶段必要代码，无人为数量目标、永久任务和行政 Gate。
- **完整且优先适用的技术规范**：[Standard Element 体系与递增复用规范](../architecture/DomainHarness_v0.11.x_STANDARD_ELEMENT_SYSTEM.md)。所有后续版本 L1/L2、Task/PR 必须先复用已存在、语义适用的 Standard Element；若不使用，留下具体技术理由，不自动复制业务无关的解析器和流程组件。

**当前真实状态**：v0.11.1 已按 R27 Product/L1/L2 `ACCEPT_SCOPED`、T11–T14 全部完成并合入；版本列车 `3145104258a4da5f8cc940482ff77322b97d6cf6`。本 R29 只是新增跨版本复用规范，**首批 Standard Element 源码提取仍为 CANDIDATE/NOT_IMPLEMENTED**；不将已接受的 T14 示例 Reader 谎称已发布的标准库。不单独对外发行 v0.11.1，整个 0.11.x 完成后统一 main/Release。

## 3. 版本正式划分：按照 Harness/Agent 纵向闭环逐步完善

| 阶段 | 版本定位 | 本阶段主要交付 | 独立验收结果 |
|---|---|---|---|
| **0.11.0 — Foundation** | 新架构能定义、装配、运行一个 Domain App（**已通过 Scoped 验收**） | Element/Content/Function；K/S/B Package；BUILD/AOT/Lock；Boot→唯一 KDP→App Init；clean public SDK；Selected no-effect Function | 历史四工作区 clean-packed SDK Consumer 能构建、启动（R53/R58 后公开产品仅一个 SDK）、执行实际已选 Knowledge/Rule 改变结果的 Function；AC01–AC10 Scoped PASS |
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
- **【R29 当前状态】0.11.1 已完成限定交付；0.11.2–0.11.9 仍处于规划/实施待验收阶段**：后续每阶段明确最小 Product/L1 delta、必要 L2、任务 DAG、真实 Consumer/负例，且只验证实际改动；不得因分配版本号自动获得 L1/L2 资格。
- **【R29 下一步】** 继承已接受的 0.11.0/0.11.1 基线，在 0.11.1 #1656 下完成真正可复用的标准 Reader Element；#1644 已标历史，0.11.2 仅消费；不得由文档更新触发长期本地 Agent 任务。
- **不纳入本轮默认完成门**：跨平台所有 Target、通用多 Agent 协作、全平台知识图数据库、全面 DIS Full Conformance、Server 专用学习基础设施、所有下游旧业务迁移。实际需要时单独明确为 0.11.x 后续范围，不预设新的必须版本。

<!-- /DH_V011X_OWNER_CONFIRMED_FULL_REWRITE_STAGE_ROADMAP_20261121 -->

<!-- DH_V011X_ONE_ISSUE_PER_VERSION_HISTORICAL_MAPPING_R1_20261121 -->
## 6. 每个阶段一个版本主 Issue（完整索引）

**结构决定：** [总控 #1563](https://github.com/kaicreator-mm/domain-harness/issues/1563) 只负责任务索引和跨阶段进度；每个内部版本**只保留一个版本级入口**，其内部可链接 L1/L2/Task/PR，但不能再建第二版本总控。已存在的 0.11.0 #1564 和 0.11.1 #1605 继续使用；后者的 [L2 #1608](https://github.com/kaicreator-mm/domain-harness/issues/1608) 是附属技术设计，不是独立版本主 Issue。

| 内部版本 | 唯一版本级 Issue | 交付主题 | 当前状态 |
|---|---|---|---|
| **0.11.0** | [#1564](https://github.com/kaicreator-mm/domain-harness/issues/1564) | Foundation | Stage-0 accepted; internal only |
| **0.11.1** | [#1605](https://github.com/kaicreator-mm/domain-harness/issues/1605) | Task Execution | R27 Product/L1/L2 ACCEPT_SCOPED，T11–T14 合入，#1605/#1608 已关闭；内部阶段完成 |
| **0.11.2** | [#1612](https://github.com/kaicreator-mm/domain-harness/issues/1612) | Domain Intelligence | Scope assigned, Product/L2/implementation pending |
| **0.11.3** | [#1613](https://github.com/kaicreator-mm/domain-harness/issues/1613) | Semantic Interaction | Scope assigned, Product/L2/implementation pending |
| **0.11.4** | [#1614](https://github.com/kaicreator-mm/domain-harness/issues/1614) | Authorized Action | Scope assigned, Product/L2/implementation pending |
| **0.11.5** | [#1615](https://github.com/kaicreator-mm/domain-harness/issues/1615) | Bounded Reasoning | Scope assigned, Product/L2/implementation pending |
| **0.11.6** | [#1616](https://github.com/kaicreator-mm/domain-harness/issues/1616) | Durable Execution | Scope assigned, Product/L2/implementation pending |
| **0.11.7** | [#1617](https://github.com/kaicreator-mm/domain-harness/issues/1617) | Execution Evidence | Scope assigned, Product/L2/implementation pending |
| **0.11.8** | [#1618](https://github.com/kaicreator-mm/domain-harness/issues/1618) | Client Experience | Scope assigned, Product/L2/implementation pending |
| **0.11.9** | [#1619](https://github.com/kaicreator-mm/domain-harness/issues/1619) | Server Meta Evolution | Scope assigned, Product/L2/implementation pending |

**执行规则**：各版本 Issue 包含目标/需求/独立可证伪 AC/非目标/历史参考、阶段 L1/L2/Native DAG/实现 PR/审核与实际 CI 的增量状态；阶段推进与正式 Release 是不同的资格。0.11.x 是**彻底重写**，不得用历史源码、旧 ABI、旧业务功能全等或旧版 CI 冒充新版能力已实现。0.11.0 成果仅在其已验收范围内复用。

### F01–F19 全局功能盘点的主归属

以下 **Fxx** 特指全局 [#1567](https://github.com/kaicreator-mm/domain-harness/issues/1567) 的历史功能 ID，**不是 0.11.1 #1605 的局部 F01–F10 产品编号**。一项功能可以跨阶段增强；表中仅列首要推进入口，后续必须去当前版本 Issue 检查其实际范围。

| 全局历史功能 | 主要版本入口 | 说明 |
|---|---|---|
| F01–F06 | [0.11.0 #1564](https://github.com/kaicreator-mm/domain-harness/issues/1564) | Element/Package/BUILD/Boot/Function/Consumer 结构子项已纳入 Stage-0；领域语义、真实 Effect、复杂任务等不倒填为已完成 |
| F07 | [0.11.5 #1615](https://github.com/kaicreator-mm/domain-harness/issues/1615) | 全面 Domain Harness/LLM；Task Loop 在 #1605、语义在 #1612，恢复/证据/经验跨 #1616–#1618 |
| F08 | [0.11.2 #1612](https://github.com/kaicreator-mm/domain-harness/issues/1612) | Knowledge Reader/Query 和适用性；不强制 SQLite |
| F09–F10 | [0.11.3 #1613](https://github.com/kaicreator-mm/domain-harness/issues/1613) | 交互意图和选路；真实 Tool/Effect 在 #1614 |
| F11 | [0.11.5 #1615](https://github.com/kaicreator-mm/domain-harness/issues/1615) | Provider/Harness；旧 Provider HTTP 通过不等于新 Provider/LLM E2E 完成 |
| F12 | [0.11.9 #1619](https://github.com/kaicreator-mm/domain-harness/issues/1619) | 双层多级反馈总体闭环；确定性解析、精确经验、执行采集分别归 #1612/#1618/#1617 |
| F13 | [0.11.2 #1612](https://github.com/kaicreator-mm/domain-harness/issues/1612) | Forge 产物的消费边界；Forge/KG 生产和符号化验证不属本仓库重写 |
| F14 | [0.11.4 #1614](https://github.com/kaicreator-mm/domain-harness/issues/1614) | Tool/Host/Effect 基础；高级传输按用例 |
| F15 | [0.11.6 #1616](https://github.com/kaicreator-mm/domain-harness/issues/1616) | 真实必要的 Event、Callback、互操作；通用 Event Bus 非默认必做 |
| F16–F17 | [0.11.0 #1564](https://github.com/kaicreator-mm/domain-harness/issues/1564) | 新 SDK/命名/一个真实消费者完成 Stage-0；后续复用场景，不强制重建旧多业务 App |
| F18 | [0.11.9 #1619](https://github.com/kaicreator-mm/domain-harness/issues/1619) | DomainHarness 自举的小型 Consumer 仅可选；完整自举不能凭本规划自动成为发布门 |
| F19 | [DIS Conformance #1499](https://github.com/kaicreator-mm/domain-harness/issues/1499) | **独立标准/资格线，不属于任一 0.11.n 的默认完整实现承诺**；新 SDK 仅执行其适用必要合同 |

### v0.10 历史 44 项的归属对照（全部已映射，非迁移任务）

来源：[历史 44 项 Crosswalk](https://github.com/kaicreator-mm/domain-harness/blob/main/docs/roadmap/DomainHarness_v0.10_HISTORICAL_CAPABILITY_CROSSWALK.md)。每项**只分配一个用于分析的主 Issue**；同一业务机制可能在新版本多个阶段渐进增强。将它们称作历史设计/反例参考，而不是“新版 44 项必须重做”。历史 ID 映射核对：44/44，重复 0，缺失 0。

| 版本级 Issue | 历史能力 ID（参考索引，绝非完成证明） |
|---|---|
| 0.11.0 / [#1564](https://github.com/kaicreator-mm/domain-harness/issues/1564) | FR06, FR13, HF22, HF25, HF28, HF30, HF31, HF33, HF34, NEW-FUNCTION-01, NEW-FUNCTION-02, NEW-FUNCTION-03, NEW-FUNCTION-04 |
| 0.11.1 / [#1605](https://github.com/kaicreator-mm/domain-harness/issues/1605) | FR01 |
| 0.11.2 / [#1612](https://github.com/kaicreator-mm/domain-harness/issues/1612) | FR02, FR05, FR11, HF24, FR08-P-SD1, NEW-FUNCTION-05 |
| 0.11.3 / [#1613](https://github.com/kaicreator-mm/domain-harness/issues/1613) | FR10, FR15 |
| 0.11.4 / [#1614](https://github.com/kaicreator-mm/domain-harness/issues/1614) | FR03, FR04, FR14, HF19, HF23, HF29, FR08-P-SD2, FR08-N-SD2 |
| 0.11.5 / [#1615](https://github.com/kaicreator-mm/domain-harness/issues/1615) | FR07, FR08-N-SD1 |
| 0.11.6 / [#1616](https://github.com/kaicreator-mm/domain-harness/issues/1616) | HF16, HF17, HF18, HF20, HF27, HF32 |
| 0.11.7 / [#1617](https://github.com/kaicreator-mm/domain-harness/issues/1617) | HF26, NEW-FUNCTION-06 |
| 0.11.8 / [#1618](https://github.com/kaicreator-mm/domain-harness/issues/1618) | FR08, FR12 |
| 0.11.9 / [#1619](https://github.com/kaicreator-mm/domain-harness/issues/1619) | FR09, HF21 |

**历史对照的约束**：对某历史条目若新架构没有真实消费价值，版本 Issue 可以明确 OUT / OPTIONAL / REPLACED，不必实施；必须保存不采纳的原因。v0.10 原来提供的 Kernel/Workflow/Model/Provider 的具体 API、存储/Actor 格式、测试与可执行源码不自动成为 0.11.x 公共接口。跨版本进展在主 Issue #1563 统一追踪，阶段内仅维护其版本 Issue。

<!-- /DH_V011X_ONE_ISSUE_PER_VERSION_HISTORICAL_MAPPING_R1_20261121 -->
