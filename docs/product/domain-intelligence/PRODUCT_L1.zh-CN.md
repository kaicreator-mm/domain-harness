# DomainHarness — Domain Intelligence 产品模型（Product/L1）

**状态：PRODUCT_L1_FREEZE_CANDIDATE / NOT_FROZEN**  
**分析入口：** [Issue #1477](https://github.com/kaicreator-mm/domain-harness/issues/1477)  
**R2 产品分析：** [#6640902641](https://github.com/kaicreator-mm/domain-harness/issues/1477#issuecomment-6640902641)  
**独立 Product/L1 审核：** [#6641500336 — PASS](https://github.com/kaicreator-mm/domain-harness/issues/1477#issuecomment-6641500336)  
**候选基线：** main `896efbcec64132377e05fca7b3f7f6ff6b3c900b`

> 本文将 Domain Intelligence 定义为跨版本的 Product/L1 目标与质量模型。它不是 v0.10.4 或其它新 SDK 版本的 PRD，也不授权 L2、Task DAG、ABI、源码实施、发布或部署。本文自身仍须经过 Exact-SHA 文档审核和正式 Freeze Checkpoint。

## 1. 产品定义

**Domain Intelligence（领域智能）** 是面向一个明确领域范围、以证据为基础、经过适当验证、具有明确适用边界，并能持续改进的领域理解、判断、问题求解与结果评价能力。

它使系统能够：

1. 理解领域中的对象、事实、状态、关系、问题和上下文；
2. 判断某个解释、规则、决策或行动在当前范围内是否适用；
3. 选择合适的方法、流程或已声明能力解决问题；
4. 根据领域规则、证据和预期结果评价解决效果；
5. 明确表达未知、冲突、不确定性、越界和需要人工判断的情形。

Domain Intelligence 不是知识文件的简单集合，不等于知识图谱、Domain Package、Prompt 集合或 LLM 输出。它的质量取决于是否能在声明的领域范围内产生正确、可解释、可验证且有实际价值的结果。

## 2. 与 Domain App / Component 模型的关系

本模型继承并遵守 v0.7 冻结的 Product/L1 与 L2 权威，不创建竞争性本体：

```
Domain App
= DomainHarness + Domain Definition + UX

Domain Definition
= Domain Component Graph

Domain Component
├── Semantic Component
└── Tool Component
```

- **DomainHarness**：嵌入式 SDK/runtime，负责解释和执行已准入的 Domain Definition。
- **Domain Definition**：Domain App 的抽象领域行为与功能组合定义，不等同于 JSON/YAML、Package、Manifest 或编译产物。
- **Semantic Component**：定义领域意义、约束、规则、决策或行为。
- **Tool Component**：具有明确调用与效果契约的有界可执行功能模块；不是 Agent 专属概念。
- **UX**：独立的用户交互组成部分，不拥有 Runtime 转移或 Effect 权威。
- **Domain Package**：Domain Definition 及其选定智能、依赖和交付资产的工程化表示、物化、版本化与分发载体；不是 Domain Definition 的本体父级。

**Domain Intelligence 是产品目标与质量评价对象，不是第三种 Component family。** 领域智能可以由多个 Semantic Component、Tool Component 契约、知识/规则/模式/案例/证据共同表达；不要求每条知识资产都成为 Component，也不要求将完整知识库塞入一个 Package。

## 3. 核心概念边界

| 概念 | 产品含义 |
|---|---|
| Domain Scope / Problem Space | 有界问题空间：目标用户、目标、常见问题类别、对象、上下文、约束、预期结果和明确排除范围 |
| Domain Facts | 关于领域的事实、权威事实或相关业务事实；事实是输入/证据，不自动构成智能 |
| Runtime Observations / Task Facts | 某次运行、用户请求、Tool 结果或外部系统状态产生的任务事实；默认不自动成为可复用领域知识 |
| Domain Knowledge Corpus | 广泛、可审查的设计时研究与知识集合，包括来源、主张、事实、关系、证据、案例、冲突、不确定性、缺口和未定级候选 |
| Domain Intelligence | 针对声明范围形成的、经过适当定级的理解、判断、求解与评价能力 |
| Compiled / Selected Domain Intelligence | 为特定消费者和运行配置选出的、经过资格检查的智能子集及其运行时表示 |
| Domain Definition | 消费者特定的抽象 Semantic/Tool Component Graph，声明该 Domain App 的领域行为与功能组合 |
| Domain Package | 对 Definition、选定智能、契约、依赖和交付资产的版本化物化与分发 |
| Domain App | 由 DomainHarness、Domain Definition 和 UX 组成的可运行领域应用 |

上述概念是产品语义边界，不是五层强制存储架构。消费者只选择所需的合格智能和能力，不必携带整个 Corpus。

## 4. Domain Data 与 Domain Intelligence

现有 Domain Data 六类逻辑资产组织保持不变：

1. Authority；
2. Executable Harness；
3. Knowledge / Reference；
4. Pattern / Recipe；
5. Example / Counterexample；
6. Validation / Evidence。

理解、判断、求解（含验证/评价）是衡量领域智能功能的三个维度，不是替换六类资产的新分类。一个资产可以服务多个维度，一个智能能力也可能依赖多个资产类别。

保持 files-first 和领域资产所有权。SQLite、图数据库、向量数据库或其它存储方式均不是本 Product/L1 的强制要求。知识文件存在、被索引或被放进 Package，不代表当前 Runtime 已理解或实际使用它。

Tool 的实现代码本身不是 Domain Intelligence。领域智能负责表达何时、为何、在什么条件下选择 Tool，以及输入/输出预期、效果限制、失败处理和验证方法；Tool 实现及其 Host binding 仍属于相应的执行边界。

## 5. 领域智能的三个功能维度

### 5.1 Understanding — 理解领域与当前问题

- 领域概念、实体、分类、关系与词汇；
- 领域事实、结构、假设、上下文和约束；
- 用户意图、目标和预期结果；
- 常见问题类别、变体、正常/边界/失败/歧义/越界场景；
- 所需输入、前置条件、相关参与者、对象和状态；
- 事实来源、时效性、适用范围和未知项。

### 5.2 Decision — 解释与判断

- 规则、政策、不变量、决策模型和适用条件；
- 前置条件、决策标准、优先级、权衡和例外处理；
- 多个规则或主张冲突时的分类与处理；
- 证据强度、不确定性、适用限制和人工裁定边界。

### 5.3 Solving — 求解与验证

- 方法、技能、模式、流程、配方和工作流；
- Tool/Capability 的用途、选择条件、输入输出预期和限制；
- 预期结果、成功/失败定义、验证标准和证据要求；
- 反例、失败恢复、回滚或升级处理知识；
- 可复用方案的适用范围和失效条件。

三维模型是功能评价视角，不是 Kind/Profile/Facet 的最终目录。

## 6. 生态系统职责

### Domain-Forge — 设计时领域智能工程

- 发现并定义 Domain Scope / Problem Space；
- 研究来源、收集领域知识并保留 Provenance；
- 提取主张、事实、概念、关系、方法和案例；
- 综合知识，同时保留冲突、不确定性和缺口；
- 生产可审查的 Knowledge Corpus 与 Domain Definition 候选；
- 执行作者侧一致性和闭合检查；
- 在消费者 Profile 与契约已知时物化相应 Package。

Forge 的作者侧一致性检查不等于行为验证、Simulation、Promotion 或 Runtime Activation。

### Domain-Simulator — 行为模拟与验证

- 对 Domain Definition 进行行为模拟、验证和反例分析；
- 产生结果、缺陷、证据和演进建议；
- 将验证发现反馈给 Forge，供其修改候选 Definition。

### DomainHarness — 领域智能运行时消费与执行

- 准入精确且兼容的 Domain Definition 与所需组件；
- 在 Definition 和当前契约范围内理解请求/目标；
- 选择和组合适用的 Semantic Component、Tool、Context 与合格结果；
- 按冻结的决策来源优先级解析已知问题；
- 仅在选定智能无法充分解决问题时进行有界推理；
- 通过既有 Runtime/Kernel/Host 权威边界调用已声明 Tool；
- 按规则、Schema、Guard 和证据要求验证结构化结果；
- 保留权威状态、Effect、Replay/Recovery 与可检查的执行证据。

#1478 负责进一步定义 Harness 的 Context、Reasoning、Orchestration、Evaluation 和 Recovery 能力，不在本文重复冻结其技术方案。

### Kernel / Microkernel — 可信执行基础

仅负责不可再下沉的身份/完整性、准入、分发基础、运行实例、转移与 Effect 权威、持久结果、Replay/Recovery 和观察/证据边界。不成为每个 Domain 的语义所有者，也不引入第二个 Runtime。

### Domain AI Creator / UX — 用户侧组合

Creator 负责用户侧创建和跨产品编排；UX 负责交互与意图表达。UX、Agent、LLM 或 Tool 的请求/提议不能绕过 Runtime 权威。

### Domain Application Contract — 跨项目协调

仅协调独立项目之间确有必要共享的身份/引用、权威边界、生命周期交接、兼容性/当前性、交换与一致性要求；不重新定义 Harness 内部 Component/Kind/Runtime 本体。

## 7. 三条受治理的反馈关系

1. **Definition / Package → Harness**：选定且固定版本的 Definition 决定当前 Domain App 可使用的智能和 Tool。未理解或不兼容的必需行为语义必须 fail-closed。
2. **Harness → Simulator / Forge**：经授权且符合隐私边界的结构化结果、证据引用、失败、纠正、重复未解决案例和验证发现，可以揭示智能缺口。它们只能产生候选或改进请求，不能直接修改生产 Definition。
3. **多个 Domain → 通用 Harness**：多个独立 Domain 中反复出现且有证据支持的共同需求，可以成为通用 Runtime 能力候选；某一个 Domain 的业务特例不能自动上升为 Kernel/SDK 规则。

统一演进路径：

```
Observation / Evidence
  → Candidate
  → Validation / Adjudication
  → Explicit Promotion
  → Selection / Exact Pin
  → Eligible Future Activation
  → Measured Outcome / Feedback
```

禁止自动 Promotion、自选、自激活、无审查的生产修改或静默替换活动实例的 Definition/Assembly pins。现有实例保持精确版本绑定，除非存在明确支持且经过授权的迁移边界。执行记录、重放日志和用户/任务事实不会因为一次成功就自动成为通用智能。不得要求持久化私有 Chain-of-Thought；只收集授权、必要且可检查的结构化证据。

## 8. 三种不同的 Self-bootstrap

**A. SDK / Architectural Self-bootstrap — v0.7 已冻结并通过参考门禁**

Standard DomainHarness 功能逐步通过与应用 Definition 相同的公共 Component 抽象实现，同时保留不可约的 Microkernel 和唯一 Runtime。它不意味着 SDK 自己运行成一个独立 App/Service。

**B. DomainHarness Domain Intelligence Self-bootstrap — 本 Product/L1 的目标**

DomainHarness 可以声明自己的 Domain Scope，并选择包含产品意图、领域词汇、Component/Runtime 边界、不变量、决策依据、流程、Tool 使用策略、验证标准、反例和演进规则的 Domain Definition。嵌入式 Harness 可以使用这些智能分析有界的 DomainHarness 产品/架构问题，例如分类变更请求、识别受影响契约、对照冻结不变量评估提案、提出有边界的实施/验证计划并说明证据。

这不是自运行 SDK、通用 Coding Agent 或自授权开发系统。源码修改、权限授予、自我 Promotion、合并、发布和部署仍由项目外部开发治理、Kernel/Host 权威与明确授权控制。

**C. DomainForge Seed bootstrap — 独立的 Forge 目标**

Forge Seed Domain Data + DomainHarness + 确定性 Forge Kernel/Tools → 可运行 DomainForge。Forge 生成的后继 Seed 仍然是 Candidate，不得自行验证、自我 Promotion、自选或自激活。这不是 DomainHarness Domain Intelligence 自举。

## 9. 决策来源优先级与独立成熟度轴

保持 v0.3 冻结的精确决策来源优先级：

1. Deterministic Compiled Domain Intelligence；
2. Exact Semantic Result Reuse；
3. Applicable Promoted Reusable Subworkflow；
4. Bounded HarnessMachine / LLM Fallback。

不得交换第 2、3 项的顺序。LLM 可广泛参与设计时研究和候选综合；运行时仅在已选智能不足以解决新颖、歧义、冲突或未解决问题时作为有界后备。LLM 输出自身永远不是权威证据或自动晋升依据。

以下三条轴独立：

- **Asset Authority**：FROZEN / CONTROLLED / REFERENCE / EXAMPLE / DERIVED；
- **Intelligence Evidence / Maturity**：OBSERVED → CANDIDATE → VALIDATED → PROMOTED → SELECTED → EXECUTED，并允许 REJECTED、WITHDRAWN、EXPIRED、SUPERSEDED；
- **Runtime Resolver Precedence**：上述四项固定顺序。

被选中不代表具有最高权威；已 Promotion 不代表适用于所有 Domain；缓存命中不代表 Promotion；Package 构建成功不代表智能质量合格。

## 10. Domain Intelligence 质量与产品成功标准

采用风险与智能类型驱动的资格审查，而不是所有资产使用同一强度的检查表。每个重要智能项应足以说明：主张/规则/方法是什么、来源和责任人是谁、适用范围/假设/前置条件、支持与反对证据、检查方式、不确定性/限制/时效性，以及审查结论和生命周期状态。

来源权威必须按所主张的事实类型判断。政策/所有者决定、适用法律标准、经验研究、当前官方工具文档和现场实践各自只在其适用范围内提供证据。冲突主张应保留来源、上下文、版本与适用性；高影响冲突未解决时必须显式保留，不得由模型静默裁定。LLM 生成文本只能作为候选贡献。

Product/L1 的成功标准：

1. Domain Scope / Consumer Profile 明确问题空间、用户、目标、边界和排除项。
2. Knowledge Corpus 保留来源、主张、证据、案例、冲突、未知和缺口，不把所有记录伪装成合格生产智能。
3. Domain Intelligence 在 Understanding、Decision、Solving/Evaluation 上有可观察且可验证的价值。
4. 消费者 Definition 只选择所需 Semantic/Tool Components，不要求携带完整 Corpus 或定制一套 Harness。
5. Package 构建有效性与 Domain Intelligence 质量分开评价。
6. 同一嵌入式 Harness 能消费不同有界 Definition，仍保持唯一 Runtime、必需语义 fail-closed 和 Effect 权威。
7. 已知问题优先使用适用的已选智能与可复用结果；未知、歧义、越界或缺证据时可澄清、拒绝、等待、升级或使用有界推理。
8. Runtime 证据可以揭示真实智能缺口，但不依赖隐藏 Chain-of-Thought 或未经授权的原始遥测。
9. Forge/Simulator 反馈形成经过验证的后续 Definition/Package 候选，活动实例保留原有精确 pins。
10. DomainHarness 自身的 Domain Intelligence 至少通过代表性产品/架构问题验证，并与基线比较；仅证明 SDK 能加载自己的 Package 不算自举成功。
11. SDK 自举、Domain Intelligence 自举和 Forge Seed 自举分别报告。
12. LLM 调用数、延迟和成本是效率指标；确定性错误答案不能被计为智能改善。

## 11. 明确不在本 Product/L1 冻结的内容

本文不冻结：

- 最终 Kind/Profile/Facet 目录、Schema、Graph 技术或序列化格式；
- Domain Package 的目录、数据库、索引或存储布局；
- 必须使用 SQLite、图数据库、向量数据库或特定 LLM；
- 最终 SDK ABI、SPI、Registry、Handler 或插件机制；
- Harness 的具体 Context/Reasoning/Orchestration 实现（见 #1478）；
- Package Semantic Knowledge 的具体访问 API 和可选数据资源实现（见 #1476）；
- Forge/Simulator 的具体实现 DAG、版本或公共 ABI；
- 自动执行开发、自动授权、自动 Promotion、自动合并/发布/部署；
- 第二 Runtime、通用 Agent 平台或独立 Harness 服务。

## 12. 当前权威、证据与后续入口

- **v0.3**：历史 Product/L2 对 Compiled Domain Intelligence、决策优先级、语义结果复用、Promoted Subworkflow 和有界 LLM 的定义，保持不变。
- **v0.7**：#517 Product Freeze、#526 L2 Architecture Freeze、#527 Task DAG、#537 程序记录。#537 记录 E1–E11/T011、T012 Node、T013 Expo/Hermes、T014/T015/T016 与 main 集成；main 集成提交为 `3c71b9138056babfafbc7de1349b5924483f2203`，合格树一致。该事实不把 v0.7 的历史 Tag/Release 约定改写为 npm 发布声明。
- **v0.10.3**：Product Freeze `d5c524588accd2a79a6781b28fce310fa91ab389` 是 Product/L1 冻结，不自动授予后续 L2/实施/Release。原始 v0.10.3 Tag 保持不可变；main 后续 source-first SDK distribution repair 已合入 `896efbcec64132377e05fca7b3f7f6ff6b3c900b`，将四个公共 SDK 包版本和内部依赖边修正为 0.10.3，同时保持根 Monorepo/消费 Package 产品版本 0.2.0。该源码修复不等于 npm Registry 已发布或新的修复 Tag 已创建。
- **#1476**：较窄的 Package Semantic Knowledge 身份/查询/访问及可选数据资源入口；不是 Domain Intelligence 全模型。
- **#1478**：独立的 Domain-Bounded Harness 能力模型与缺口分析；负责具体 Harness 能力，不重开本 Product/L1。
- **DomainForge**：#196/#197 是产品缺口与 v0.0.6 方向；#203 是当前性复核；#204 仅为参考实践依据，不能视为已采纳架构。
- **DAC**：#156 / PR #157 / #158 的范围收敛与 Fresh Review 仍需按其实时状态管理；DAC 只做跨项目协调，不恢复为 Harness 内部 DomainDataComponent 所有者。
- **#1398 / #1395**：分别保留历史决策来源优先级和 pre-generated-first Guided Journey 经验。

## 13. Product/L1 Freeze Gate

本候选已获得 R2 Fresh Independent Product/L1 Review PASS：

```ini
ISSUE=1477
R2_COMMENT=6640902641
FRESH_REVIEW=#6641500336
LIVE_CURRENTNESS=PASS
P0=0
P1=0
P2=0
P3=0
VERDICT=PASS
PRODUCT_FREEZE_ELIGIBLE=YES
```

当前文件仍是 Freeze Candidate。正式 Freeze 还需对本文件的 Exact HEAD/Tree 执行独立只读 Product Review，并由 Controller 记录精确冻结身份。

```ini
PRODUCT_L1=FREEZE_CANDIDATE
R2_ANALYSIS_REVIEW=PASS
FREEZE_ARTIFACT_REVIEW=PENDING
PRODUCT_FREEZE=NO
L2=NOT_STARTED
TASK_DAG=NOT_AUTHORIZED
IMPLEMENTATION_AUTHORIZED=NO
VERSION_TARGET=UNASSIGNED
```
