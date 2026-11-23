# DomainHarness v0.11.1 — Task + Execution Loop（原生重构后功能与验收映射）

> **当前规范优先**：[#1685](https://github.com/kaicreator-mm/domain-harness/issues/1685)、[Canonical Core](../specs/domain-harness/core.md) 与 [TypeScript Profile](../specs/domain-harness/typescript-profile.md)。本文件保留历史产品 F01–F10 / AC11–AC20 的行为目标，不再把旧 Contracts / Microkernel / BUILD / Lock / Pin / FunctionRef 当作新版源码或验收机制。R26 的旧实现矩阵属于 **HISTORICAL / SUPERSEDED**，不再是现行源码路径。

```ini
OUTPUT_LABEL=DH_V011X_R163_NATIVE_STAGE_FUNCTION_CROSSWALK
ISSUE=#1696
VERSION_ISSUES=#1564;#1605
SOURCE_TRAIN_BASE=version/v0.11.x@0dc8c0f888bcfd46beeeb4c93606f74dae78f2eb
SOURCE_REWRITE_PR=#1694_R160_ACCEPT_SCOPED
SOURCE_REWRITE_CI=WOODPECKER_3151_SUCCESS_ON_0477edf9070c05ec3c89c46fb1aaa43cf2f850a3
R163_MISSING_SCENARIO_TESTS=IMPLEMENTED_PENDING_NEW_EXACT_SHA_CI_AND_INDEPENDENT_REVIEW
FORMAL_STAGE_FUNCTIONAL_ACCEPTANCE=NOT_YET_SIGNED
MAIN_TAG_RELEASE=NO
```

## 1. 最新产品解释：保留行为，不恢复废弃的执行层

- 0.11.0：Package 为静态 ESM 插件，Element 为内聚 TS Class，普通 Function 可独立导出；Core.Order、可选 Init/Exit、直接依赖与生成期正确性继续成立。原来的 ElementRef/Target/Lock/Pin/Boot/PackageSystem 不是要求保留的 ABI；结构化领域知识仍应能通过普通 Reader/Class/Function **实际改变业务结果**。
- 0.11.1：Workflow 是 SDK Standard 能力，可在 Package.Init 内发起，也可被业务在其它合法时机直接使用，**不得恢复“唯一 Init Router”**。原产品要求的多节点/单节点、嵌套、具名 Switch、UNKNOWN/ASK/WAIT/REJECT/FAILED、Reader 复用、业务 Hook start/end、预算和 Exit 分离等**行为语义**继续保留。
- Package 和 Element 的正确性由作者/生成期与普通工具负责，SDK Runtime 只运行已安装的可信代码及必要的最终退出兜底。没有额外自建 Package Loader、动态 FunctionRef 或业务 Schema Runtime 验证。
- 非业务的 AppStatus、可选 InitFrom 原始调用者日志由具体 Domain App/Package 所有；不虚构 SDK 全局 AppStatus Registry 或通用 InitFrom 自动记录机制。

## 2. 现行源码位置（替换旧 R26 失效的实施矩阵）

| 功能 | 当前实现位置 | 现行复核证据 |
|---|---|---|
| Package/Element/Function 与代码元数据 | `packages/domain-harness/src/kernel-lifecycle.ts`; `examples/native-domain-app/packages/*.mjs` | `language-native-lifecycle.test.ts`; `scripts/tests/native-generation.test.mjs` |
| 可选 Init、唯一有序 Core、真实逆序 Exit、异常/并发关闭 | `packages/domain-harness/src/kernel-lifecycle.ts` | `language-native-lifecycle.test.ts` |
| 生成期静态 Order 与直接依赖检查 | `scripts/validate-native-generation.mjs`（**作者侧可选工具，不是 SDK Runtime**） | `scripts/tests/native-generation.test.mjs`；部分动态依赖须人工复核 |
| XState Actor 工作流及状态 | `packages/domain-harness/src/standard-workflow.ts` | `language-native-workflow.test.ts` |
| 根共享预算、子 Workflow、Hook、具名路由 | `packages/domain-harness/src/native-workflow-composition.ts` | `language-native-workflow-composition.test.ts` |
| JSON/YAML Reader、Writer | `packages/domain-harness/src/standard-files.ts` | `language-native-standard-files.test.ts` |
| 结构化规则驱动业务 Function、多节点 Switch 与单节点 | `examples/native-domain-app/packages/{business,workflow-init}.mjs`; `data/order-policy*.json` | `scripts/tests/native-stage-regression.test.mjs`; `examples/native-domain-app/main.mjs` |
| 第二领域库存业务、标准 YAML Reader 复用 | `examples/native-domain-app/packages/inventory.mjs`; `data/inventory-policy.yaml` | 同上 |
| 真实独立 npm SDK-only 消费者 | `scripts/verify-native-sdk-clean-install.mjs` | `npm run test:consumer`（真实受控 npm Registry / CI 依赖） |
| 固定 SDK 根入口与 TypeScript 类型 | `packages/domain-harness/src/index.ts`、`packages/domain-harness/package.json` | `facade-surface.test.ts`、`sdk-roles.test.ts`、仓外 TypeScript 消费者 |

旧 R26 矩阵中 `packages/microkernel/src/package-system.ts`、`workflow-execution.ts`、`packages/contracts/src/workflow-contracts.ts`、`basic-domain-app/workflow-fixture.mjs` 等均已在 #1694 **物理删除**。**旧 SHA #2917 的 PASS 不能代表这些路径在新分支可运行。**新源码场景需以新 Exact SHA 的测试与审查独立验收。

## 3. AC11–AC20 旧业务结果与新代码对应

| AC | 必须保留的可观察行为 | 现行验证（R163 补测提交后仍需同 SHA 运行） |
|---|---|---|
| AC11 | Init 内发起至少两节点及子 Workflow；单节点另行成功 | `workflow-init.mjs::Init.start` + `native-stage-regression.test.mjs` |
| AC12 | 具名分支选择下一 Node；拒绝/未选分支不执行 | `runOrderPolicy` 的 COMPLETE→finalize，REJECT 终止；`routeWorkflowOutcome` 路由测试 |
| AC13 | ASK/WAIT 是本轮终态，不冒充持久 Resume | `standard-workflow.ts`、`language-native-workflow.test.ts`、路由测试 |
| AC14 | COMPLETE 与 REJECT/UNKNOWN/FAILED 不混淆 | `language-native-workflow*.test.ts` + 业务 Policy REJECT |
| AC15 | 生成期非法引用/依赖拒绝 | `validate-native-generation.mjs` 对原生静态 Core 的限定检查；**旧自定义 Lock/FunctionRef 正反例 SUPERSEDED**。完整多文件语义正确性仍归作者 |
| AC16 | Guard/Reader/Hook 共享根调用预算、祖先深度生效 | `language-native-workflow-composition.test.ts`、`main.mjs` 的真实预算负例 |
| AC17 | 可选 Exit/InitFrom 与业务 end 分离 | `language-native-lifecycle.test.ts`、`native-stage-regression.test.mjs`；InitFrom 为 Package 可选业务记录 |
| AC18 | Core.Order、Init/Exit 基础可用，无二次 Business App Init | `language-native-lifecycle.test.ts`、`native-generation.test.mjs` |
| AC19 | 同一 Element 多次使用结果独立；最终错误由 KDP 兜底 | `runOrderPolicy` 复用一个 `OrderPolicyElement` 的两独立 Session；KDP 单测 |
| AC20 | 仓外真实 SDK 安装；JSON×2/YAML×2；Workflow/Hook/预算正反例 | `verify-native-sdk-clean-install.mjs` + `main.mjs`；本轮再加入内容选定、Init Workflow、库存领域 |

**判定原则**：源码实现、测试源存在、CI 通过、独立 Reviewer 接受是四个不同事实。本文件不因存在测试就自动宣告所有 AC PASS。状态与完整 0.11.0 / AC60 跨阶段表见 [R163 回归台账](../engineering/DomainHarness_v0.11.0_v0.11.1_NATIVE_REGRESSION_CROSSWALK.md)。

## 4. 历史 F01–F10 / AC11–AC20 产品原文（保留作为需求来源，旧技术名不复活）

> 以下是重构前 R26 Product 文本。旧文中的 BUILD、Lock、FunctionRef、独占 Init 入口、K/S/B 固定装载含义被新 Canonical 裁决取代；表中的**业务行为目标**仍按上面的原生等价性表核对。

### 历史 F01–F10 与 AC11–AC20
| ID | 需求 |
|---|---|
| F01 | Package 的既有 Init Element 作为**启动自己选定 Workflow 的唯一入口**，不单独创建第二个业务 Init/Router；普通业务路径为 Init→Workflow→Function |
| F02 | Element 唯一定义多次引用；Workflow 是唯一支持的嵌套执行类型（缺省 workflow），允许**一个节点**、多节点和多级子 Workflow，运行结果与状态隔离 |
| F03 | Guard/Outcome 使用 Switch 式**唯一具名出口**指向下一个 Workflow Node（Element 引用位置）或终态，不按优先级竞争 |
| F04 | 固定 Package 封存的 JSON/YAML 数据可被多个 Data Element 使用、复用各自格式的通用 Reader Element，其他业务 Element 可消费数据 |
| F05 | ASK/WAIT 是本轮明确结果，0.11.1 不承诺持久运行或 Resume |
| F06 | COMPLETE 与 REJECT 不混淆 |
| F07 | UNKNOWN/FAILED 不自动提升为成功或业务 false |
| F08 | 根业务 WorkflowRun 内的 Element 调用次数共享；每个 Workflow 自己声明最大下级子 Workflow 深度，所有活动祖先约束生效 |
| F09 | 每次业务 ElementRun 只有可选的 `start/end` 两个 Hook；异步 end 收尾完成后才结算结果，业务异常归所属 Package |
| F10 | **继承 0.11.0 最新统一 Init/Exit/直接 Extension/完整组合 BUILD/可信 Boot/唯一 KDP**：Core.Order 的调整只属于 0.11.0；Exit、InitFrom 由 Package 选择，不能以旧技术 Init/直接 ingress 当新规范冻结门槛 |

## AC11–AC20 真正需要验证的结果

| ID | 验收 |
|---|---|
| AC11 | 一个真实 Package.Init 在其启动流程内发起已选 Workflow，完成至少 2 个节点及一个子 Workflow；另一单节点 Workflow 正常完成；不触发第二 Business App Init |
| AC12 | 不同业务结果按明确 Switch label 到达不同 Node/终态；未选节点不执行，UNKNOWN/FAILED 不经优先级选路 |
| AC13 | ASK/WAIT 各有清晰的本次运行结束原因，无虚假 Resume |
| AC14 | REJECT/UNKNOWN/FAILED 与 COMPLETE 明确区分 |
| AC15 | BUILD 对非法 Workflow 嵌套类型、失效 Element/FunctionRef、Switch 出口缺失或非法目标、跨 Package 非直接 Extension 访问拒绝；不运行时重新做授权闭包 |
| AC16 | 各子 Workflow、Guard/Reader 等 Element 调用共享根业务调用预算；不同 Workflow 允许不同子树深度上限，但任何活动祖先限制都不能突破 |
| AC17 | 一个 Package 不定义 Exit、不启用 InitFrom 时仍可正常初始化及运行业务 Workflow；另一个启用 InitFrom 时按定义保留调用者与重复记录；Exit 不被业务 ElementRun.end 误触发 |
| AC18 | **0.11.0 最新合格 Init/Order/Exit/BUILD/Boot 基础真实回归通过**，0.11.1 不重复启用已废弃的 technicalInit/technicalDispose/额外 BusinessAppInit |
| AC19 | 相同构建选定的 Element 定义在多个 Workflow 引用位点复用时，状态、结果与节点路径独立、确定性流程可复现；业务未处理错误由 Kernel 最小兜底退出 |
| AC20 | clean-packed App 中真实 Package.Init→Workflow→Function；至少 2 份 JSON 数据共用 JsonReader、2 份 YAML 共用 YamlReader，Switch 与 start/end、子 Workflow/预算正反例非 Mock |

## 5. 不扩大到后续版本

本版不实现 Host/Effect、LLM、Durable Resume 或 Experience/Evolution；ASK/WAIT 不承诺续跑。新实现不维护 0.10.x 或已废弃旧 0.11.x ABI。所有 R163 功能差异按 #1696 在 v0.11.0/0.11.1 对应阶段处理，不推到 0.11.2。整个 0.11.x 统一正式发布，当前不合并 main、不创建 Tag/Release。
