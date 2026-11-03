# Domain Package 领域知识与 Workflow 边界（R0）

[English](DOMAIN_PACKAGE_KNOWLEDGE_AND_WORKFLOW_R0.en.md) · [函数与 Tool 边界](DOMAIN_PACKAGE_FUNCTION_TOOL_BOUNDARIES_R0.zh-CN.md) · [持续跟踪 Issue #1465](https://github.com/kaicreator-mm/domain-harness/issues/1465)

> **先读：文档权威性——非规范性实施参考**
>
> 本文是供下游 Domain App 按需采用的架构分析与实施参考，**不是** DomainHarness SDK/Kernel/Runtime/公开 API/ABI 规范、功能公告、Product/L2 决策、冻结基线、版本发布计划或实施授权。
>
> - **SDK 能力的权威依据：** 使用 DomainHarness v0.10.3 时，以精确发布 Tag/源码、实际公开导出与 ABI，以及该消费者自己的 selected BUILD、Host 和 clean-consumer 验证证据为准。本文不能增加 API、让尚未实现的功能变得可用，也不能覆盖已发布契约。使用其他 SDK 版本时，必须重新核对对应版本。
> - **下游项目的决策权：** 每个项目自行决定 Product/L1/L2 范围、架构、实施计划和验收门槛。本文不是任何下游项目的前置条件、阻塞项、原生依赖、Task 要求或验收门槛。
> - **按需采用：** 下游项目可以采用、调整或忽略具体建议。**不需要等待本 PR 完成评审、转为 Ready 或合并。** GitHub Draft 仅表示本文档 PR 的审核状态，与 SDK 能力是否存在、下游是否可以实施无关。
> - **如何理解 MUST / MUST NOT：** 描述已发布契约的语句，是要求消费者正确使用现有契约；描述目标设计、示例或安全建议的语句，是供采用者参考的实施指导。两者都不会因此产生新的 SDK 义务或能力。
> - **何时才能认定 SDK 缺口：** 必须先在精确发布的 public package/ABI 上，用独立 clean consumer 得到最小、可复现的失败，并排除消费者业务代码、Host 接线和 BUILD 选择问题。之后仍须单独进行 Product/L2/DAG 和版本发布资格决策。
>
> `DOC_KIND=NON_NORMATIVE_DOWNSTREAM_REFERENCE` · `ADOPTION=OPTIONAL` · `DOWNSTREAM_PREREQUISITE=NO` · `SDK_CAPABILITY_DELTA=NONE` · `RELEASE_AUTHORITY=NONE`

> **状态：** Post-v0.10.3 架构参考 / R0 待评审。不是冻结 L2、正式 ABI、Runtime 新能力或源码实施授权。本文以 Tally v2 真实 Domain Package 设计为消费者案例，补齐“领域知识如何进入 Domain Package”与“Workflow 如何表达和执行”的边界。不可追溯修改不可变的 v0.10.3 tag（`061376f4a023070f215f9feffad5c24d96d503cb`）；后续版本归属 UNASSIGNED，须单独 Product/L2 决策。

## 1. 核心结论：Domain Package 不只是代码和 Tool

一个成熟 Domain Package 至少包含四种彼此关联、但不能混淆的内容：

1. **领域知识（Domain Knowledge / Domain Data）**：术语、事实、业务对象、规则、约束、参考资料、Pattern、Recipe、Example、Counterexample。
2. **领域行为（Domain Behavior）**：普通函数、Business Intent、决策逻辑、投影、验证和领域服务。
3. **领域流程（Domain Workflow）**：领域状态、步骤、前置条件、等待点、合法转移、失败恢复与完成条件。
4. **外部能力边界（Capability / Host）**：读取外部事实、调用 Agent/CI/Provider、写 GitHub 或执行其他外部副作用。

**Domain Package 拥有领域语义；DomainHarness 提供闭世界装配、选择、调用和执行治理机制。** DomainHarness 不应成为所有下游领域知识的中央数据库，也不应把每个知识文件强制转换为 Runtime primitive。

### 1.1 Files-first，不要把所有知识都变成 Tool / S Feature

- 大部分知识首先是由领域项目拥有、可版本化、可审查的普通文件。
- 只有需要结构验证、确定性计算、语义判断或流程执行的部分，才选择合适的表达形式。
- 文件存在不代表 Runtime 自动加载；必须有明确的 Package/BUILD 选择或领域代码读取路径。
- S Feature 是被 BUILD 选中的有界语义入口，不是任意知识文件的自动执行器。
- 领域代码中的 JavaScript export 不是 Tool；Tool 身份仍按配套函数/Tool 边界文档判定。

## 2. Domain Knowledge 资产分类

| 资产类别 | 回答的问题 | 推荐表示 | 典型内容 |
|---|---|---|---|
| Domain Authority | 哪些业务语义是权威、不可随意改写的？ | 版本化定义/决策记录 | 业务不变量、状态含义、审批责任、聚合边界 |
| Schema / Contract | 数据结构是否合法？ | JSON Schema / TypeScript 类型（进入边界时用可移植 Schema） | Requirement、WorkUnit、Attempt、Evidence |
| Rule / Constraint | 在什么确定条件下允许/拒绝？ | Schema、Expression、纯 Script、B policy | DAG 无环、来源当前性、Accepted Work 保留 |
| Knowledge / Reference | 已知事实和背景是什么？ | Markdown / JSON / 引用索引 | 领域术语、平台能力、标准摘要、历史事实 |
| Pattern | 哪类问题反复出现，适用结构是什么？ | Markdown / 结构化 Pattern | 证据复用、依赖晚 Join、先复用后构建 |
| Recipe | 如何将 Pattern 用于一类常见任务？ | Markdown / JSON 步骤模板 | 缺陷定位、Replan 准备、版本验收准备 |
| Template | 生成工件时有哪些字段/结构？ | JSON / Markdown 模板 | PRD、Task Contract、Review、Release plan |
| Skill | 哪个有界语义任务需要 Agent/模型判断？ | Skill 文档 + 输入/输出 Schema | 需求歧义分类、根因假设、适用性评估 |
| Workflow | 领域过程有哪些步骤、等待点和合法转移？ | 领域 Workflow 定义；仅在已支持的执行契约中编译/映射 | Product Intake、Task Execution、Review/Repair |
| Example / Counterexample | 哪些正例、边界和反例能解释规则？ | Fixture + rationale | stale source、丢 ACK、错误并行、缺失证据 |
| Validation / Evidence | 如何证明资产和行为正确？ | 测试、Golden Case、Critical Journey、证据引用 | 正/负/边界测试、Host/CI/独立 Review |
| Tool Policy | 某个外部能力能做什么，风险是什么？ | 结构化策略/文档 | 作用对象、权限、Effect、幂等、超时、恢复 |

### 2.1 Authority 与 Evidence 必须分离

重要资产至少区分以下 authority level：

- `FROZEN`：已冻结权威；改变需显式 reopen / 新版本治理。
- `CONTROLLED`：受控规则；需要领域 Owner Review。
- `REFERENCE`：来源事实或解释，不自动成为规则。
- `EXAMPLE`：示例或反例，不自动成为普遍真理。
- `DERIVED`：从上游来源生成，应按来源重新生成而不是手改。

每条关键知识记录 `owner`、`sourceRefs`、`sourceSha`（适用时）、`status`、`observedAt`、`confidence/uncertainty`、`applicability`、`exclusions` 和相关反例。不要把 Agent 自述、示例或推断升级为 FROZEN Authority。

## 3. 选择正确表达方式

| 需求 | 优先表达 | 不应该做 |
|---|---|---|
| 字段、类型、范围、必填、枚举 | JSON Schema | 把结构约束留给 Prompt |
| 简单确定性映射/谓词 | Expression | 每次都调用 LLM |
| 复杂但纯确定性算法 | 私有 Script / 普通 B helper | 为算法建立 Agent Tool |
| Tally 自己的业务决策 | Engineering Business（B） | 下沉到通用 K 或 C |
| 有界语义判断/建议 | 领域 Skill；可用时调用已选择的 S Feature | 让 Skill 直接修改权威状态 |
| 持久业务状态、CAS、Admission、Journal、Effect、Replay、UNKNOWN | 唯一 K Primary | 在 B/Workflow 中再建一套状态引擎 |
| GitHub/ADS/Agent/CI/Provider I/O | 明确的 C Capability Operation | B/UI 直接访问 Provider |
| 凭据、物理存储、Host 进程和资源 | 可信 Host Port | 把 Host API 暴露为 Agent Tool |
| 面向 Agent 的工具协议 | 独立 allowlisted Tool Adapter → Business Intent | 将任意 C/Host 操作直接暴露给模型 |

**判断顺序：** 先问“它是什么知识/规则/流程”，再问“需要怎样执行”，最后才问“是否需要跨信任边界调用 Tool”。不要从已有函数名反推领域模型。

## 4. Workflow 必须分成五层

“Workflow”至少有五种常被混为一谈的含义：

1. **Domain Process（领域流程）**：业务上从什么状态到什么状态、满足哪些条件、何时等待/拒绝/完成。由领域项目定义。
2. **Workflow Definition（流程定义）**：步骤、事件、Guard、Transition、Child Workflow、补偿/恢复条件等可版本化资产。属于 Domain Package。
3. **Workflow Execution（流程执行）**：实例身份、持久状态、CAS、并发、Journal、Effect、Replay、UNKNOWN。由唯一 DomainHarness K / 选定 Host 承担。
4. **UI Journey（界面旅程）**：表单、页面、导航、用户可见提示，是 Domain Process 的交互投影，不是领域流程本身。
5. **Agent Skill / Tool Flow（Agent 调用流程）**：模型如何获得上下文、给出结构化建议、请求业务动作。Skill 不拥有持久状态或副作用授权；Tool Adapter 只能映射到受限 Business Intent。

### 4.1 Workflow 设计规则

- 先用领域语言描述流程，再映射到运行机制；不得从页面按钮或 Controller 顺序倒推出领域流程。
- 每个 Workflow 必须定义稳定 ID、Owner、Version、Trigger、Input/Output Schema、Preconditions、States、Transitions、Wait Conditions、Failure/Recovery、Side Effects、Evidence 和 Completion Criteria。
- 明确区分 Proposal、Approved、Admitted、Executing、Terminal、UNKNOWN 等语义；候选不等于已批准，Accepted 不等于完成。
- 长流程拆为有界子流程；只有真实共享的顺序子流程才抽 Child Workflow。不要创建一个包办所有工程生命周期的巨大 Workflow。
- 领域流程可定义“请求什么”，但外部效果仍需 K Permit，经选中的 C Operation 执行并读回。
- UI 的动态表单由 Business/Host 根据当前 Workflow Step 发布；UI 不得自行发明状态、步骤或转移。
- Agent 可生成候选和建议；不能自行批准、铸造 Permit、改写冻结范围或热替换运行中 Package。

### 4.2 Domain Workflow 与 S Feature / K 的关系

- 领域 Workflow 定义属于 Tally 等下游 Domain Package；其业务语义不能写进通用 DomainHarness Kernel。
- S Workflow Feature 若被当前公开 ABI 支持并由 BUILD 选择，可提供纯、可复用的流程语义/路由能力；它不自动成为 Tool，也不获得持久状态或授权权力。
- v0.10.3 的 S Feature 路径要求 Feature export 被显式选择并绑定；`kind:'workflow'` 不能被理解为任意 YAML 会自动成为可执行 Workflow。
- 当前消费者必须以精确 v0.10.3 public BUILD/Feature contract 证明支持情况。若没有可用的公开 Workflow 执行接口，先把流程作为 Domain Data 保存，由 B 以当前已验证的 Business/K 契约映射；**不得私自引入第二 Workflow Engine 或宣称 Runtime 自动解析。**
- K 是执行状态与 Effect 的唯一权威；S 可解释/路由，B 拥有业务决策，C 执行受控 I/O，Host 提供物理设施。

## 5. 从现有项目提取领域知识的步骤

1. **Pin Authority**：固定 PRD、L2、ADS pin、DomainHarness tag、实际源码、Schema、生产行为和测试的精确来源。
2. **Inventory**：扫描 Type、API、Service、Prompt/Skill、Workflow、配置、Issue、CI/Review、故障记录和 Critical Journey。
3. **建立 Glossary**：统一术语、稳定 ID、定义、相似但不同的概念、Owner 和例子。
4. **分类**：Authority / Executable / Reference / Pattern-Recipe / Example / Validation；标明来源与可信度。
5. **抽取规则**：对每条规则记录 Statement、Source、Inputs、Expected Outcome、Failure Meaning、Deterministic?、正例/反例。
6. **选择表示**：Schema、Expression、Script、B、S Feature、Workflow、C Operation 或 Host；避免重复权威。
7. **建模 Workflow**：列出 Domain Trigger、States、Transitions、Wait/Approval、Failure/Recovery 和 Effect；与 UI Journey 分离。
8. **验证**：为重要资产建立 normal/boundary/invalid/counterexample fixtures；为关键流程建立真实 Critical Journey 与 Effect-count/recovery oracle。
9. **Review / Promotion**：由 Domain Owner 审查 authority 和行为变化；新版本 Package/BUILD 选择单独资格化。
10. **反馈演进**：记录实际使用、拒绝、失败、反例、后续独立结果；不足时保持 UNKNOWN/INSUFFICIENT_EVIDENCE。

## 6. 推荐的 Domain Package 内部组织

这是领域项目自己的组织约定，不是 DomainHarness Runtime 强制目录，也不意味着每个目录都自动被解析：

```text
packages/<domain-business-package>/
├─ domain/
│  ├─ README.md
│  ├─ glossary/
│  ├─ authority/
│  ├─ schemas/
│  ├─ rules/
│  ├─ knowledge/          # facts, references, domain interpretation
│  ├─ patterns/
│  ├─ recipes/
│  ├─ templates/
│  ├─ skills/
│  ├─ workflows/
│  ├─ tool-policies/
│  ├─ examples/
│  │  ├─ positive/
│  │  ├─ negative/
│  │  └─ edge-cases/
│  └─ validation/
├─ src/                   # private helpers + Business ABI implementation
├─ test/
├─ package.json
└─ README.md
```

- Domain Data 可使用 JSON/Markdown/YAML 等项目已支持格式；进入可执行边界的 Schema 必须可移植、显式验证。
- 不要引入新的解析器/DSL，除非真实需求与维护收益已证明。
- 不要把 secrets、私有 Trace、原始 CoT、隐藏测试或凭据写入 Domain Data。
- 对会改变行为的资产做版本化、Review 和 digest；运行中的 occurrence 固定原 Package/BUILD pin。

## 7. Tally v2 作为首个 Engineering Domain Package 案例

Tally 已有一些概念性设计，但此前的函数/Tool 分析没有把它们系统转化为可执行的 Domain Knowledge / Workflow 资产。

### 7.1 已有基础，不应重复设计

- [Tally PR #147](https://github.com/kaicreator-mm/tally/pull/147) 已提出 Engineering B 的逻辑 bounded contexts 与 Domain Package 演进蓝图。
- [Tally PR #152](https://github.com/kaicreator-mm/tally/pull/152) 已定义 Agent-native 完整 ALM 生命周期与产品验收方向。
- [Tally #60](https://github.com/kaicreator-mm/tally/issues/60) 已定义从真实经验到 Rule/Skill/DecisionProcedure/Workflow Candidate，再到新 Package BUILD/选择和后续反馈的生命周期。
- 当前 `packages/tally-engineering-business/src/` 已有 planning、acceptance、journey、guided-intake、diagnosis、lineage、casebook、feedback、maintenance-intake、release-readiness、work-units 等逻辑模块。
- 当前 `getPolicy()` 已携带 Business Intent 与 Workflow Definition / transition 绑定；这是现有 B/K 契约的实现形态，不代表完整领域知识模型已经独立存在。

### 7.2 当前缺口（源码观察，不是 DomainHarness SDK 缺陷）

1. 没有完整、显式的 Tally-owned Domain Data 资产目录和稳定 Glossary/Authority/Schema/Rule/Pattern/Recipe/Workflow/Validation inventory。
2. 多数领域语义仍隐含在 JS 函数、`getPolicy()` 和 UI 模型中；难以独立审查来源、适用条件、反例和版本变化。
3. `apps/tally-web/src/features/forms/schema.ts` 是动态 UI Step/Field 的渲染契约，不应被误认为 Requirement/WorkUnit/Attempt 等领域 Schema。
4. UI Journey、Business Intent、K 持久执行状态、Agent Skill 与 C 外部能力需要有显式映射表，防止把页面步骤当成领域 Workflow。
5. #273 Replan、#274 ADS Feedback、#275 Attempt Read Model 应复用统一的领域术语、Evidence/Currentness/UNKNOWN 规则和 Workflow 约束，不能各自定义冲突模型。


**补充源码结构证据（Tally v2，只读盘点）：** Engineering Business Package 当前有 12 个 MJS 源文件，约 2,654 行。1,646 行的 `index.mjs` 没有 import，`package.json` 仅导出根入口 `./src/index.mjs`；其它 11 个文件不能仅因存在于仓库就视为已进入 sealed B 的 BUILD 闭包。13 个单元测试文件覆盖 Package helpers，但 helper 测试不是 BUILD-selected Runtime 证据。README 中“单个 advisory Intent”的描述也已与源码声明的 10 个 Intent / 10 个 Effect 不一致。重组 Package 前，必须把每个 helper 映射到真实 B/C/Host/UI 调用点、selected BUILD source 和 critical journey。领域资产文件应先作为受版本控制的知识来源，只有存在明确 Producer/Validator/selected-module 映射时才宣称运行时已消费。

### 7.3 建议的 Tally 领域资产

| 领域组 | 核心资产候选 | 权威边界 |
|---|---|---|
| Product & Requirements | Project、Product、Requirement、Acceptance、ProductRevision、Decision | Tally B 拥有业务语义；Owner/ADS Review 与 GitHub 原生工件仍是外部权威 |
| Architecture & Planning | ArchitectureDecision、PlanRevision、TaskPack、Workfront、DependencyCandidate、ReplanCandidate | DAG/依赖候选由 B 解释；原生 Dependency/Claim 以 GitHub/ADS 事实为准 |
| Work & Execution | WorkUnit、TaskIssueContainer、TaskAttempt、Step、AgentRole、HostProfile、CompletionContract | K 拥有执行状态/Effect；GitHub 拥有 Issue/PR；ADS 拥有规范语义 |
| Assurance & Release | VerificationPlan、Check、ReviewFinding、Repair、AcceptanceEvidence、ReleaseCandidate、RQ | B 管业务策略；独立 Reviewer/CI/Host/RQ/Owner 事实不得被 B 自我签发 |
| Maintenance & Learning | Defect、MaintenanceCandidate、ExperienceRef、RuleCandidate、SkillCandidate、DecisionProcedureCandidate、WorkflowCandidate、Qualification | Tally 管候选与使用决策；task-meta 私有 Trace 不可读取；ADS v5 GitHub 发布事实可读取 |
| Package Evolution | DomainAsset、AssetVersion、Applicability、Exclusion、Counterexample、PackageBuildPin | 新 BUILD/Package pin 需独立资格化；运行中实例不热替换 |

### 7.4 建议的 Tally Workflow 集合

不要做一个巨型 ALM Workflow。先建立独立、有界、可组合的领域流程：

1. **Project Intake**：Goal → Requirement Candidate → Clarification → Acceptance Draft → Product Review/Freeze。
2. **Architecture & L2**：Architecture Decision → L2 Candidate → Independent Review → L2 Freeze。
3. **Version Planning**：Version Scope → Task Decomposition → DAG Validation → Native Dependency Readback → Task Pack Freeze。
4. **Task Execution**：Accepted Claim → Attempt Admission → Dispatch → Progress/Terminal Observation → Candidate SHA。
5. **Review & Repair**：Independent Review → Finding Classification → Scoped Repair → Exact-SHA Re-review / Join。
6. **QA & Release**：Verification Plan → CI/Host/Installed Acceptance → Independent RQ → Owner Authorization → permitted delivery/readback。
7. **Maintenance & Replan**：Defect Intake → Root Cause → Replan Candidate → Accepted-work Preservation → Authorized New Revision。
8. **Experience Qualification**：Observe → Extract → Candidate → Validate → Shadow → Review → New BUILD/Package Qualification → next Task use → outcome feedback。

每个流程都应声明它读取哪些权威、发出哪些 Business Intent、等待什么证据、调用哪些 C Operation、哪些状态由 K 持久化、失败如何恢复。缺少证据时明确 UNKNOWN/NOT_RUN，不能以流程走完或 UI 显示完成代替真实业务结果。

## 8. Experience → Knowledge → Package 的治理生命周期

推荐使用两个互不混淆的版本轨：

- **Domain Asset Candidate**：OBSERVED → PROPOSED → REVIEWED → SHADOW_VERIFIED / REJECTED → QUALIFIED_FOR_BUILD → SELECTED / DEPRECATED。
- **Domain App Package / BUILD**：由 Producer 按批准的资产与源码生成新 digest，独立 BUILD/安装/验证后，在新的授权部署检查点选择。

Candidate 不得自动变成 FROZEN Rule、生产 Workflow、Tool 或新 Package。一次采纳不证明普遍有效；必须记录适用范围、排除条件、反例、成本/回归面和后续独立结果。旧 occurrence 保持旧 pin。

## 9. Domain Package Review Gate

- [ ] 每个重要领域术语和聚合有唯一 owner 与稳定 ID。
- [ ] Authority、Reference、Example、Derived、Evidence 已区分。
- [ ] 结构约束优先 Schema，确定性规则优先确定性实现。
- [ ] Semantic Skill 有界、Schema-bounded、provider-neutral、无副作用。
- [ ] Domain Workflow 与 UI Journey、K Execution、Agent Tool Flow 分离。
- [ ] Workflow 有明确状态、转移、等待、恢复和完成语义。
- [ ] 每个外部副作用有 Tool Policy、C Operation、K Permit、幂等/恢复/Readback。
- [ ] 没有重复 K、第二 Scheduler、第二 Journal 或第二业务事实源。
- [ ] 正例、反例、边界和 Critical Journey 覆盖关键规则。
- [ ] 新资产/流程变更有版本、Review、digest 和 active-run 兼容性说明。
- [ ] 通过精确 public package / BUILD / clean-consumer 证明所用机制；未执行项写 NOT_RUN。

## 10. DomainHarness 通用改进的判定门

Tally 领域知识的归属默认是 Tally Engineering Domain Package。只有在多个独立消费者出现同类问题，或精确 public v0.10.3 consumer 复现证明通用 BUILD/Feature/Workflow/Schema/Host 接口缺口时，才建立 DomainHarness SDK 改造候选。单个 Tally 业务规则、术语、Workflow、ADS Schema 或 UI 交互不应下沉为 Kernel/通用 S 硬编码。

---

## 参考

- [Domain Data Spec](../domain-data/DOMAIN_DATA_SPEC.zh-CN.md) 与 [Authoring Guide](../domain-data/DOMAIN_DATA_AUTHORING_GUIDE.zh-CN.md)：领域项目知识提取与治理参考。
- [S Feature Guide](../guides/V0102_S_FEATURE.md)：selected S Feature 是有界非 Tool 入口。
- [Package Authoring Guide](../guides/V0102_PACKAGE_AUTHORING.md)：public Package / BUILD / C module 选择与装配。
- [Tally #147](https://github.com/kaicreator-mm/tally/pull/147) · [#152](https://github.com/kaicreator-mm/tally/pull/152) · [#60](https://github.com/kaicreator-mm/tally/issues/60) · [#273](https://github.com/kaicreator-mm/tally/issues/273) · [#274](https://github.com/kaicreator-mm/tally/issues/274) · [#275](https://github.com/kaicreator-mm/tally/issues/275) · [#276 Domain Knowledge/Workflow refactor](https://github.com/kaicreator-mm/tally/issues/276)
- [DomainHarness #1465](https://github.com/kaicreator-mm/domain-harness/issues/1465) · [#1392](https://github.com/kaicreator-mm/domain-harness/issues/1392)
