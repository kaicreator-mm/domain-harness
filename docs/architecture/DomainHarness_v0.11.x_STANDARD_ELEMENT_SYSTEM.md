# DomainHarness 0.11.x — Standard Element 体系与递增复用规范（R29）

> **【R36 当前 Standard Element Package 生成方式】**：Standard Element 也是普通多文件 Domain Package 的内容；可以由 ChatGPT/开发者直接编写 ElementDefinition、Manifest、Function ESM、资源并按 DIS 适用 + v0.11.x 实际合同验证。**不需要 Seed Builder、生成器或额外 Package Assembly 生产阶段**；组合 App 只选择/校验使用的文件、依赖、Target 和 Boot。参见 [R36](../specs/DomainHarness_v0.11.x_SDK_FORGE_ECOSYSTEM_BOOTSTRAP.md)。


> **【R34 SDK 内 Standard Element 归属】** Standard Element 是扩展 DomainHarness **SDK 的普通可选 Domain Package**；它不承担 Forge 对新业务 Domain Packages 的生成/编译，不自动提供不受信 BUILD。Domain/Harness/SDK 的全名定义及 DH-only 临时 Seed Builder 仅服务自身初始基础 Package，见 [R34](../specs/DomainHarness_v0.11.x_DOMAIN_HARNESS_SDK_AND_BOOTSTRAP_SEED.md)。


> **【R33 产品边界优先级】** 本 R29 的 Standard Element 复用原则有效，但其 “Contracts/BUILD/Lock/KDP primitives” 中的 BUILD 仅指 **DomainHarness SDK 对已有 Package 的装配/链接及必要验证**；不包含 Forge 的 Domain Package 生产。现有 `tooling/build` 的名称不是“BUILD 平台”的产品授权，R31/R32 把生成全部归 Harness 的说法已被纠正。权威产品定义：[DomainHarness SDK / DomainForge App / 自举规范](../specs/DomainHarness_v0.11.x_SDK_FORGE_ECOSYSTEM_BOOTSTRAP.md)。


> **规范候选，非已实施声明。** 本规范是在 0.11.0 Element-First、0.11.1 Task + Execution Loop 已合入 `version/v0.11.x` 的基础上提出的跨内部阶段复用原则。所有新增源码、BUILD/Lock 合同变化仍需对应版本的有限 Task、真实 Consumer 和独立 Exact-SHA 审核；不因本文件落地而自动提升源码资格。

```ini
OUTPUT_LABEL=DH_V011X_R29_STANDARD_ELEMENT_REUSE_CONTRACT
MASTER_ISSUE=#1563
FOUNDATION=#1564
TASK_EXECUTION=#1605
NEXT_DOMAIN_INTELLIGENCE=#1612
SOURCE_TRAIN=version/v0.11.x@3145104258a4da5f8cc940482ff77322b97d6cf6
STRUCTURE=ENGINE_PRIMITIVES_PLUS_STANDARD_ELEMENTS_PLUS_DOMAIN_ELEMENTS
STANDARD_ELEMENT_IS_EXISTING_ELEMENT_DEFINITION=TRUE
SECOND_KERNEL_BUILD_LOCK_RUNTIME=FORBIDDEN
NEW_ROOT_ELEMENT_KIND_OR_MANDATORY_GLOBAL_REGISTRY=NO
V010_COMPATIBILITY=NO
SCOPE=DESIGN_AND_INCREMENTAL_EXTRACTION_NOT_IMPLEMENTED
```

## 1. 目标与严格分层

**总体原则：可跨领域复用、边界清晰的 Element，应优先提取为 Standard Element；后续版本默认先组合已有 Standard Element，只有不适用或确有差异时才编写新的同类实现。** 标准 Element 是构建期可选择的、版本化的普通 Element，而不是另一种 Kernel、Engine 或 privileged capability。

| 层 | 责任 | 必须保留的约束 |
|---|---|---|
| **Engine primitives**（Contracts / BUILD / Lock / KDP） | Element/FunctionRef 身份、直接 Extension 权限、Pin、ResourceRef 安全读取、确定性 BUILD/Lock、Workflow Actor 的启动/预算/Hook/受控 Switch 调度、Schema/Outcome 合同兜底 | 不被公共 Element 绕过；不创建第二 Runtime/Lock/权限系统 |
| **Standard Elements**（可选通用 Package） | JSON/YAML Reader、确定性 Guard/Validator/Selector、通用 State Transition Rule/Workflow Template、后续通用语义/交互/Action adapter 等业务级可复用 Function/Content | 普通 ElementDefinition/FunctionContract；静态选定、显式声明依赖/Exports/Imports、受控资源、不可获得隐式 Host/Effect 权限 |
| **Domain Elements** | 领域名词、事实、证据、业务 Rule/Decision、领域 Workflow、业务状态/终态策略等 | 组合/配置 Standard Elements；领域差异不得反向污染 Standard 的语义 |

**严禁用继承树或新增 `kind:'StandardElement'` 取代当前 `kind:'Element'`。** `standard` 是资产级分类/所有权/准入资格，记录在标准目录/文档及构建期 Package 清单中，绝不是运行时新的根类型、全局动态 Service Locator、自动放权或强制安装所有标准库。组合 App 只包含 BUILD 显式选中的内容。

## 2. 从 0.11.1 提取的首批候选：分清“已证明复用”与“已经标准化”

| 候选公共资产 | v0.11.1 实际来源 | 目标 Standard Element | 执行边界 |
|---|---|---|---|
| **JsonReader** | `workflow-fixture.mjs` 中的 demo `jsonReader`；实际 `JSON.parse` 在 `workflow-execution.ts::prepareDataInput` | `dh.std.reader.json`：声明纯输入/输出/失败语义的通用已选 Reader Function | BUILD/KDP 仍负责固定资源授权、摘要、大小与严格 UTF-8；可复用解析必须有**单一**实现归属，不能 KDP 与 Element 各自解释不同的 JSON |
| **YamlReader** | demo `yamlReader`；实际 `yaml.parseDocument`、JSON-compatible 检查在 `workflow-execution.ts` | `dh.std.reader.yaml`：安全、版本化 YAML→JsonValue Reader | 保留 YAML 1.2 core/uniqueKeys、别名/Tag/节点成本边界及清晰 UNKNOWN/FAILED；不能向业务暴露任意 fs/network |
| **通用状态模型与转换策略** | `workflow-contracts.ts` 中 `WorkflowDefinition` / `state-model` ContentKind；`workflow-run.ts` 中 XState Actor、`workflow-execution.ts` 中路由和预算 | `dh.std.workflow.transition`（候选）：声明式状态模型/纯 Guard/具名 Transition/合法终态模板，可以被不同领域 Workflow 选用 | **XState Actor、子 Workflow 调度、Hook、计数/深度、授权/预算继续由唯一 KDP 执行；不能把 XState 引擎包装为第二个可调用 Workflow Runtime Element** |
| **具名 Switch、Outcome 公共合同** | T11 合同 + T13 KDP 语义 | 优先复用已有 Contracts；有跨领域业务规则时才提取 `dh.std.decision.selector` 等 Function Element | 通用路由/拒绝语义属于 Engine，不因为提取公共 Element 而复制一个自由选路框架 |

**重要现状判断：** T14 已证实“多个 JSON/YAML Data Elements 复用同一 Reader FunctionRef”，但这些 Reader 目前仍由 demo 中的 `basic.rules` 提供；这**不等于**仓库已有可独立依赖、独立版本化的标准 `JsonReader/YamlReader` Package。状态机同理：复用底层 XState 并不等于已有独立的 Standard StateMachine Element。必须通过后续有限提取、实际消费和独立验收才能将候选标为 `STANDARD_ACCEPTED`。

## 3. Element 标准化条件：最小、可证伪、不搞行政审批

只有同时满足以下条件，才列入正式 Standard Element Catalog：

1. **与特定 Domain 解耦。** 标准语义不硬编码业务术语、租户、工作流 ID、知识来源或特定版本的业务状态机。至少能展示两个不同用途的真实选定调用；数据包不同但代码复用是最低证据，最好再由一个后续领域 Consumer 实际消费。
2. **有稳定、明确的边界。** 必须有 `ElementDefinition`、`FunctionContract`（input/output Schema、Outcome、Effect Intent）、必要 `ContentBlock`、版本、依赖、导出与目标实现，标明 Applicability/UNKNOWN/FAILED。只暴露实际需要的 Function，0-Function 的标准 Content 也合法。
3. **严格静态装配。** 每个 Consumer 仍须直接声明 Package Extension/Function Import，且只被唯一 BUILD 选中并封入 Lock。标准身份/版本/内容摘要绑定精确；不提供全局 `getStandardElement(name)` 动态装载、未经声明的 Service Locator 或新运行时权限。
4. **安全/数据语义单一来源。** 解析器/Schema/业务转换不得出现两套互相竞争的规范。KDP/BUILD 保留资源、授权和通用 Outcome 边界；业务专属解析/匹配优先迁到可选 Standard Element。任何涉及旧 KDP `{format,source,value}` 合同的调整均属增量设计变更，需要比较与真实 E2E，不能暗改既有已接受行为。
5. **证明可复用且可维护。** 类型/构建/目标平台正例、错误/UNKNOWN/拒绝负例，至少一个 clean-packed Consumer 的实际选择和独立安装，复用未变化的既有证明；有最小使用说明、版本变化规则、来源/license、安全限制及独立 Exact-SHA scoped Review。
6. **没有不必要的抽象。** 只被一个领域使用、差异完全业务化或还在探索的 Element 留在 Domain/候选区；纯 Node 标准库函数不必为“标准化率”硬包一层 Element；标准资产可组合多个小 Element，但避免逐个 helper 都变成 Package。

### 准入状态与可变更性

- `CANDIDATE`：发现跨领域潜力，可由某个版本实现，但**不宣称**正式标准库可直接使用。
- `STANDARD_ACCEPTED`：实码跨场景复用、Scope 证据 + 独立审核合格，纳入 Catalog，成为下游默认复用候选。
- `DEPRECATED` / `REPLACED`：有明确版本、替代资产和受影响消费者清单；已 BUILD 封存的旧应用不在运行时被热替换。
- Element 定义版本和 Git/内容摘要固定；行为不兼容时新版本/新 FunctionContract，迁移通过 BUILD 重选与实际回归，不引入 v0.10 兼容负担。

Catalog 初期采用仓库版本化 Markdown/清单即可（状态、ElementRef/Package、版本、消费范围、适用边界、证明链接），不建设标准 Element 注册服务、在线 Marketplace、新数据库或运行时发现协议。

**初始资产清单与状态**：[0.11.x Standard Element Catalog](./DomainHarness_v0.11.x_STANDARD_ELEMENT_CATALOG.md)。每个候选如尚无独立标准 Package/Consumer 验证，就只能标 `CANDIDATE`；不能把 demo Reader、已存在 KDP/XState 引擎当作已发布的 Standard Element。

## 4. 单仓代码组织与下一轮有限提取

建议在现有 Git monorepo 中渐进建立 `packages/standard-elements/`（或同等单一标准 Package 工作区），其中按 `readers/`、`workflow/`、`decision/`、`validation/` 整理。**目录只是源码管理，并不自动产生跨 Package 的调用权限。** 每个可选标准资产须明确 Package Manifest、ElementDefinition、FunctionRef、Target 实现及 BUILD 所选资源；必要时标准包可以拆为多个更小的普通 Package 供按需组合。新 workspaces/lockfile 变化与实际 Package 生成必须经过受影响构建测试，不因设计文件存在而宣称模块已可安装。

**优先顺序（先消除重复，再扩张）：**

1. **0.11.2 进入领域语义代码前：** 以 0.11.1 的 JsonReader/YamlReader 真正提取为可复用标准 Element 并消费。严格比较旧结果、`{format,source,value}`、Pin/SRI、UTF-8/大小与 YAML 负例。可采用逐步迁移，但**最终纯格式解析只能有一个业务语义所有者**；先做限定设计，再变更 KDP 与 Reader 的职责接线，保持同一 BUILD/Lock。若涉及原已接受 Contract，按受影响范围重审，不借“复用”暗中放权。
2. **同一工作批次或随后：** 把跨领域可复用的声明式状态模型/具名转换策略做成一个普通 `state-model` / `workflow-definition` Content/Function 资产，真实两个不同 Workflow 消费；**不迁移 XState Actor 引擎**、不重复路由与预算。若初始场景无法证明独立公共性，先只保留 `CANDIDATE`。
3. **0.11.2 领域智能：** 将通用 `KnowledgeReader/FactNormalizer/ApplicabilityEvaluator/DeterministicRuleSelector` 作为可选 Standard 候选；领域规则/事实本身仍是 Domain Element，复杂知识生产归 DomainForge。
4. **0.11.3–0.11.6：** 按各版真实需求逐步复用或提取 Intent Validator、纯 Guard、可复用交互选择、受授权 Effect 适配、LLM 结果验证、Durable Task 状态策略；所有授权/Effect/Checkpoint 真正权威仍归所属 KDP/Host，不被所谓标准 Element 绕过。
5. **0.11.7–0.11.9：** 将脱敏证据处理、经验适用性与进化候选验证中已经跨场景验证的纯 Function 规范化；未授权数据上传/提案直升线上实现永远不因“标准”而合法。

本规范不扩张任何阶段已定义的主交付目标，也不设置“标准库必须达到 N 个 Element”之类人造 Gate。每个阶段仅增量交付自己**实际需要且已证实可复用**的 Standard Element。

## 5. 所有 0.11.x 阶段的复用优先开发约束

在 Product/L1、L2、Task/PR 开始时，为真正用到的公共能力做轻量 **Reuse-first check**，回答：
- 当前 Catalog 是否已有匹配的 Standard Element/FunctionRef？版本、适用范围、授权/Effect 边界是否满足？
- 若可以复用，直接声明依赖/构建选择，**不为当前 Domain 再写 JSON/YAML Parser、通用状态机解释器、Guard/Validator 复制品**。
- 若只能部分复用，选择组合/参数化/标准资产的小范围版本演进；拒绝“不同 Domain 就必须复制公共代码”的默认实现。
- 若不能复用，记录具体语义冲突/信任/维护成本，作为 Domain 专属或下一项 Standard 候选；**不能为少量工具函数强制新 Element**。

每个版本收尾记录新增/复用/降级的标准候选与真实受审证据，Catalog 随实现合并更新，未实施的条目仅标 `CANDIDATE`。由各版已有主 Issue 负责实施和资格，#1563 只做跨阶段索引；不创建第二个版本总控和永久驻留 Agent 任务。

## 6. 当前证据与不可冒领

- [v0.11.1 Product #1605](https://github.com/kaicreator-mm/domain-harness/issues/1605)、[L2 #1608](https://github.com/kaicreator-mm/domain-harness/issues/1608)：R27 `ACCEPT_SCOPED`，T11–T14 原始 Source/E2E 合入 `version/v0.11.x@3145104258a4da5f8cc940482ff77322b97d6cf6`。当前标准 Reader 与 StateMachine Asset 的**提取实施 NOT_STARTED**。
- Parser 现状：`packages/microkernel/src/workflow-execution.ts`；Demo Reader 现状：`examples/basic-domain-app/workflow-fixture.mjs` 与 `consumer.mjs`；XState runtime：`packages/microkernel/src/workflow-run.ts`。
- 执行边界：0.11.0 Foundation、0.11.1 Task 既有已接受资格复用；新抽取只对改动的代码/实际 Consumer 做独立 Review/必要 CI；不把文档规划、候选 Catalog、Mock 结果升级为 `STANDARD_ACCEPTED` 或正式 Release。
