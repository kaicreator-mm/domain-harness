# DomainHarness v0.11.x — 单次完整重构的版本归属与澄清优先原则（R13）

> **适用范围**：v0.11.0–v0.11.9 全系列，单一集成列车 `version/v0.11.x`，最终统一 main / Release。此文件记录最新 Owner 原则的候选规范；提交文档不表示新增源码已经实现，也不撤销原 v0.11.0 Scope 验收。

```ini
OUTPUT_LABEL=DH_V011X_R13_SINGLE_REWRITE_VERSION_OWNERSHIP_CLARIFICATION
MASTER_ISSUE=#1563
TRAIN=version/v0.11.x
BASE_HEAD=da616929d6f794db0cd30183132231ba31d4eb05
SCOPE=0.11.0_TO_0.11.9
STAGING=IMPLEMENTATION_PHASES_NOT_RELEASED_COMPAT_VERSIONS
BUG_FIX_HOME=ORIGINAL_OWNER_STAGE
CLARIFIED_DOMAIN_SEMANTICS=PRIORITIZED_OVER_UNCLARIFIED_IMPLEMENTATION
NO_LATER_STAGE_COMPATIBILITY_WORKAROUND=TRUE
REVIEW=DESIGN_CANDIDATE_PENDING
```

## 1. 一次重构、分期实现（不可违背）

- **0.11.x 是一个整体重构产品**，0.11.0–0.11.9 是单一架构下的分期实现任务，不是十个互相兼容的已正式发行产品。阶段完成/Scoped Review 不等于整个 0.11.x 已发布；只有完整最终集成后统一对外发布。
- **每项基础能力只有一个“首要所有权版本”**：其数据类型、公开语义、构建校验和基础实现都应在这个版本完成。后续版本只能增加属于自己的能力，不能把先前能力的设计缺陷伪装成兼容层、旁路接口、shim、第二套 Runtime 或备用 Contract。
- **发现问题的时间 ≠ 问题的归属版本**。如果在 0.11.5 发现 `ElementRef` 身份错误，修正仍归属于 0.11.0；0.11.5 只更新被它使用的功能。必要时按单一版本列车依赖顺序受控提交。
- **不用保留 0.10.x API/ABI、Entry / Callback / Loader 等旧技术抽象，仅为了历史迁移或功能 parity**。保留第三方或内部工具仅以新版架构中有真实职责为准。
- **受影响范围最小**：改动只要求受影响的测试、真实安装包 Consumer 与必要独立增量审核。通过且未变化的 Stage 不重复 CI 或重新设计。

## 2. 澄清优先：按语义权威而非代码先后

优先顺序（同一语义和同一范围确实冲突时）：

1. 最新明确的 Owner 0.11.x 原则、相互一致的具体裁决；
2. 对所属概念已**澄清、具体可验证**的架构语义，即使澄清发生在研究更晚的阶段；
3. 该能力所属版本当前有效的经审查 L1/L2/机器合同（对于已被新裁决覆盖的部分应定向修订）；
4. 未明确澄清、只因实现方便或引用历史代码而采用的源码/接口形态；
5. v0.10.x 历史材料，仅作思想/反例输入，不得自动带入新设计。

**解释约束**：并非所有“后发表述”都自动推翻已审核合同。只有确实涉及相同概念的更明确语义、且由 Owner 说明或设计证据能建立适用范围时，才触发合同更新；需要记录旧/新定义差别、对应 Owner 版本、受影响文件/测试、最新 Source Head。发生表面冲突时**不靠命名相似直接推断**，应先确认“逻辑身份、能力、实现载体、构建结果”分别所指。

**实例：Element 澄清 > Entry 未澄清**。0.11.1 讨论中已明确“所有 Package 的 Init/Exit 是 Element-First 模型中的 Element 身份，普通业务链 Init → Workflow → Function”。现有 0.11.0 `PackageManifest.init:EntryRef` 仅表达 ESM 导出模块地址，没有证明选定真实 Element。这是 **0.11.0 Foundation 身份合同问题**，必须在 0.11.0 修正，不允许 0.11.1 增设所谓 `EntryRef→ElementRef` 兼容接头。

## 3. 严格区分“追溯修正”和“新增能力”

| 分类 | 定义 | 应归属 |
|---|---|---|
| **BASELINE_CORRECTION** | 已属于较早版本的身份、所有权、生命周期、授权、信任边界、契约错误 | **原始所属版本**；连同其 Contract/BUILD/KDP/SDK/tests/Consumer 一次性修复 |
| **NEW_CAPABILITY** | 后续版本首次引入且早期产品无须支持的可执行语义 | **新增能力所属版本**；在已修正的基础合同上增量开发 |
| **CROSS_VERSION_CHANGE** | 新能力暴露出基础约束需增加通用可调用、Source pin 或实现绑定 | 通用且和新能力无关的部分修于基础版本；专属 Workflow/Effect 等行为留在对应新版本；禁止“临时兼容” |
| **HISTORICAL_REFERENCE** | 旧 ABI/工具文件/术语或未澄清建议 | 不自动实现；仅供风险检查和设计灵感 |

**执行流程**：新发现 → 指定 owner version/概念 → 判定是否已明确澄清 → 修订 owner version 文档/源码 → 更新实际依赖方 → 受影响范围测试/独审/Exact-SHA → 更新单列车 checkpoint。未完成基础修复时，下游版本不得固化依赖旧形状的实现或冻结冲突的新合同。

## 4. 版本所有权单源（不因发现时间改变）

| Stage · 唯一版本 Issue | 首要责任 | 不应承接的前置修复 |
|---|---|---|
| **0.11.0 · [#1564](https://github.com/kaicreator-mm/domain-harness/issues/1564)** | Element/Function/Package 逻辑身份与 Schema；公开/私有/Extension 直接访问；单一 BUILD、Target binding、Lock、Boot/KDP、Init/Exit/Core.Order、最小已选 Function 执行/公共 SDK 基础、可信包组合 | 业务 Workflow/Actor/Guard/Switch/Reader 执行器；不把基本身份漏洞丢给 0.11.1 |
| **0.11.1 · [#1605](https://github.com/kaicreator-mm/domain-harness/issues/1605)** | Task/Workflow/节点执行、子 Workflow、显式 Switch、Guard/Outcome、start/end 业务 Hook、JSON/YAML Reader、业务预算/XState；在 Package.Init 内启动已选 Workflow | 重定义 Package.Init/Exit/Core.Order/Element 身份或编造第二套 BUILD |
| **0.11.2 · [#1612](https://github.com/kaicreator-mm/domain-harness/issues/1612)** | Domain Intelligence：领域事实、知识/规则、适用性、Knowledge Query、确定性决策 | 重建 Element 类型/Workflow Kernel |
| **0.11.3 · [#1613](https://github.com/kaicreator-mm/domain-harness/issues/1613)** | 语义交互与可视化 Adapter、意图澄清/确认 | 重新定义 Element/Package 或创建新 Task Engine |
| **0.11.4 · [#1614](https://github.com/kaicreator-mm/domain-harness/issues/1614)** | Capability/Tool/Host 授权、Business State/CAS、真实 Effect/Journal/Readback | 修复 0.11.0 的选定引用/授权闭包问题 |
| **0.11.5 · [#1615](https://github.com/kaicreator-mm/domain-harness/issues/1615)** | 有界 LLM/Context/模型提案→受控工具执行 | 更改早期 Function/Effect 所有权 |
| **0.11.6 · [#1616](https://github.com/kaicreator-mm/domain-harness/issues/1616)** | Durable TaskRun、checkpoint/resume/cancel/timeout、真实异步恢复 | 用新 Run 恢复系统替代早期正确的 Package.Init/Exit |
| **0.11.7 · [#1617](https://github.com/kaicreator-mm/domain-harness/issues/1617)** | 执行证据路径/可观察结果/安全日志摘要 | 重新实现前期已有 KDP 日志 |
| **0.11.8 · [#1618](https://github.com/kaicreator-mm/domain-harness/issues/1618)** | Client 本地经验/确切语义复用/LLM 经验化 | 建第二套业务状态或绕过真实 Effect |
| **0.11.9 · [#1619](https://github.com/kaicreator-mm/domain-harness/issues/1619)** | Server 汇总与流程优化候选、受控晋升 | 回头修复作为后续兼容层的 Foundation 接口 |

## 5. EntryRef 与 ElementRef 的权威区分（0.11.0）

**不存在作为产品概念的 Entry。** 在 Element-First 合同中：

- `ElementRef` 是一个真实定义的**逻辑身份**（namespace/id/version/digest）；Package 的 Init/Exit 必须指向已由本 Package 拥有、BUILD 验证的 Element。
- `FunctionRef` 是执行逻辑的选择标识（ElementRef/functionId/contractVersion），必须由 BUILD 验证存在、目标唯一、所属权限与资源闭包。
- **物理模块路径 + exportName 仍有必要，但仅是已选实现的定位信息**。可以作为 `SelectedImplementation{module:ResourceRef,exportName}` 的内部字段；它不是与 Element 并列的公开业务标识、全局解析器、任意动态入口或独立生命周期概念。
- 因此 **`EntryRef` 作为公共且独立的 v0.11.x domain contract 没有必要**。推荐移除对外可填写的 `EntryRef`，把物理 locator 限于 BUILD Target implementation binding / Lock 私有已选执行数据。不能误删 Boot 在 Package 树之外固定加载 `bootstrap` 所需的受信技术定位；它亦不应称为业务 Entry。
- `ElementRef` **不是一个可执行函数**：对于生命周期 Element，0.11.0 必须定义确切被选可执行 Function 的选择规则（建议 `id=init` / `id=exit` 唯一的函数合同），由 BUILD 生成 FunctionRef→实现 locator；普通 Element `functions[]` 仍可 0..N。决不能只做 `EntryRef→ElementRef` 类型替换却继续调用任意模块导出。

**具体 0.11.0 修改项目与验收反例**见 [0.11.0 Element-First 基础修正清单](DomainHarness_v0.11.0_ELEMENT_IDENTITY_BASELINE_CORRECTION_R13.md)。

## 6. 纠正旧规划的两条不再有效假设

- 早期 0.11.0 PRD 的“一个可运行 KDP/Package 可以拥有 0 个 Element、只用代码导出完成 Init”若与现行“每个运行 Package 必须有 Init Element”冲突，**后者更明确，优先**。0..N 只适用于普通领域 Element 组织；可运行 Package 至少必须拥有被绑定的 Init Element，KDP 技术 `bootstrap` 仍属于 Boot 信任边界。
- 早期路线图“0.11.1 简单 Function 仍可通过外部 ingress 直接作为正常业务入口”若与 Owner 已明确的 `Init→Workflow→Function` 冲突，**以后一条明确业务主链为准**。0.11.0 仍需具备**最小已选 Function 的内部执行能力**，证明内容影响结果；但既有 `DomainApp.invoke/descriptor.ingress/suppressedIngress` 不得被当作 0.11.1 正常业务调用的兼容义务。是否保留测试/内部工具调用也不得让它继续作为第二种正式业务启动模型，删除与替换应在 0.11.0 基础纠正中处理。

## 7. 交付状态与责任

本文属于 R13 Owner 原则固化候选；旧 0.11.0 已 Scoped 验收不自动被撤销，也不代表新 `init:ElementRef` 等重构已经实现。本阶段 **只固化原则与 0.11.0 修复清单，不创建长期 Agent 任务、不提前实现 v0.11.1 Workflow**；需要代码任务时须使用最新版本列车、受影响测试与真实 clean-packed Consumer 的增量验证。
