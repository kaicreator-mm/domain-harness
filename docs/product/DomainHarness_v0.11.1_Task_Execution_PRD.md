<!-- DH_V0111_R11_MERGED_V0110_BASE_20261121 -->
## 【LATEST · R11】0.11.0 已按新版 Init/Exit 规范实现；0.11.1 可转为增量设计

```ini
OUTPUT_LABEL=DH_V0111_R11_ACTUAL_V0110_BASELINE
TRAIN=version/v0.11.x@da616929d6f794db0cd30183132231ba31d4eb05
V0110_SPEC=#1621_MERGED
V0110_IMPL=#1622_MERGED
V0110_REVIEW=R21_ACCEPT_SCOPED_P0_0_P1_0_P2_0
V0110_CI=WOODPECKER_2827_SUCCESS
V0111_DESIGN_DELTA=R11_SOURCE_ALIGNED
L1_L2_FREEZE=NO
V0111_IMPL=NOT_STARTED
DOC_PR_BRANCH_BEHIND=62
```

已验证 [0.11.0 新规范 PR #1621](https://github.com/kaicreator-mm/domain-harness/pull/1621) 和 [实现 PR #1622](https://github.com/kaicreator-mm/domain-harness/pull/1622) 已合入版本列车，原文中“#1621 仍是 Draft/未实施”的状态**现已过期**。最新 [R11 源码对照审计](https://github.com/kaicreator-mm/domain-harness/blob/design/v0.11.1-xstate-legacy-study/docs/architecture/DomainHarness_v0.11.1_R11_V0110_INTEGRATION_AUDIT.md) 中 A1–A8 为当前实施优先参考。

**不重开功能范围**：保留 Init→Workflow→Function，单节点/子 Workflow、显式 Switch、JSON/YAML Reader、start/end、根业务调用预算与各 Workflow 局部深度。需要增量补齐的主要是：(1) 在 Package.Init **之前**装配 KDP 受限 Workflow 执行句柄，因为当前 Init 的 `context.functions` 只连到尚未 READY 的 `DomainApp.invoke`，无法在 Init 内执行 Function；(2) Package `init:EntryRef` 到需要的 Element/Workflow 已选身份/绑定的最小合同；(3) Workflow 专用 content Schema + BUILD 全闭包选择/导出/依赖权限/解析器和 XState 的安装信任；(4) Business Core.Init 返回 AppStatus 与业务 Workflow 终态明确分离，不猜测结果映射。

**已经实现无需重做**：Core.Order KDP=0、直接 Extension、完整确定性组合 BUILD、Exit/InitFrom 各自可选、实际 Init 记录逆序退出、可信 Boot/Pin/已封存资源。0.11.1 只消费这些能力，XState 不参与 Core 初始化。
<!-- /DH_V0111_R11_MERGED_V0110_BASE_20261121 -->

<!-- DH_V0111_L1_R10_INIT_OWNED_WORKFLOW_PRD -->
# DomainHarness v0.11.1 — Task Execution · Product/L1 R10（WHAT）

```ini
OUTPUT_LABEL=DH_V0111_PRODUCT_L1_R10_INIT_OWNED_WORKFLOW
MASTER=#1563
VERSION=#1605
L1_PR=#1607
L2=#1608
L2_PR=#1611
V0110_NEW_SPEC=#1621
V0110_NEW_SPEC_STATUS=DRAFT_NOT_IMPLEMENTED
INIT=PACKAGE_INIT_STARTS_ITS_WORKFLOW
TECHNICAL_INIT=REMOVED_BY_NEW_V0110_SPEC
SECOND_BUSINESS_APP_INIT=NO
CORE_ORDER=OWNED_BY_V0110
EXIT=PACKAGE_OPTIONAL
INIT_FROM=PACKAGE_OPTIONAL
NORMAL_EXECUTION=INIT_TO_WORKFLOW_TO_FUNCTION
NESTING=WORKFLOW_ONLY_DEFAULT_SINGLE_NODE_ALLOWED
READER=JSON_YAML
SWITCH=NAMED_EXITS_NO_PRIORITY
BUSINESS_HOOKS=START_END
BUDGET=SHARED_ROOT_INVOCATIONS_PER_WORKFLOW_LOCAL_DEPTH
SCHEMA=V0110_CONTENT_SCHEMA_EXTENSION
ERRORS=ELEMENT_SELF_HANDLES_KDP_FINAL_EXIT
STATUS=PRODUCT_CANDIDATE_NOT_FROZEN
TASK_DAG=NOT_CREATED
CODE=NOT_STARTED
```

## 产品目标与版本前提

0.11.x 完全重写、不要求旧 v0.10.x 兼容。0.11.1 的**正常启动和执行链为 `Package.Init → Workflow → Element.Function`**：Package 自己已存在的 Init Element 可在初始化期间按其选定业务定义**启动相应 Workflow**；不能再出现 READY 后的第二次 BusinessAppInit、重复的 `technicalInit` 或所谓 Init Router。某 Package 无业务 Workflow 时，其 Init 仍可只处理 Package 自身初始化。0.11.0 的 Core.Order/KDP 0 与 Extension 直接依赖及 Init/Exit 由 [新版 0.11.0 规范 #1621](https://github.com/kaicreator-mm/domain-harness/pull/1621) 负责，0.11.1 不另外规定 Core 调度或 Init 的顺序；#1621 当前未冻结/未实施，不以旧 Stage0 Scoped CI 证明此项已完成。

`Package.Exit` 和 `InitFrom` **分别可选**，由 Package 自己决定；`InitFrom` 未启用不要求创建数组，启用时须保留每次直接 Init 调用者及重复/失败、激活隔离。业务 Workflow 的一次结束不等于整个 Package.Exit。业务异常由 Element/Package 自行处理，Kernel 只在未处理/不可继续的错误时做最小日志和退出，不负责通用重试、异常映射或跨包业务回滚。

## F01–F10 产品能力与可观察结果

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

## 内容 Schema 与 BUILD 的范围

0.11.0 已有 `ContentBlock.contentKind='workflow-definition'`、`schemaRef`、`ElementDefinition.content[]/functions[]/dependencies[]`。0.11.1 **为该内容块增加实际 Workflow 内容格式/机器 Schema**，而非改造 Element 根对象、增加一个 `ElementDefinition.nesting` 顶层字段。JSON/YAML Reader 只涉及业务文件数据格式，不要求 ElementDefinition 文件本身采用 YAML。

**构建保证**：Workflow、Reader、Guard、Switch/Hook 引用与真实生成调用边必须纳入 0.11.0 的**完整组合 Package BUILD** 和每个 Package **直接声明 Extension** 的访问规则；不能用第二套 Lock/动态加载绕开。Runtime 保留必要可信安装 Pin/产物完整性，正常业务 Schema/异常逻辑由 Element/已选编译入口拥有；Kernel 不新增业务校验体系。

## 严格版本边界与状态

0.11.1 不做 0.11.4 Host 授权/任意文件系统写读、0.11.5 LLM、0.11.6 Durable Resume、后续经验与进化机制；不做 0.10 兼容。L2 R10 详见 [#1608](https://github.com/kaicreator-mm/domain-harness/issues/1608) / [架构 PR #1611](https://github.com/kaicreator-mm/domain-harness/pull/1611)；0.11.0 依赖 [#1564](https://github.com/kaicreator-mm/domain-harness/issues/1564)、[#1621](https://github.com/kaicreator-mm/domain-harness/pull/1621)。

**当前状态（R11 更新）**：0.11.0 新 Init/Exit 规范 #1621 与实现 #1622 已合并版本列车且通过限定源码/CI 验收；0.11.1 L1/L2 仍设计候选，未独立审核/冻结，Native Task DAG、Workflow 功能源码、CI 和 clean-packed E2E 未完成。Draft PR 分支相对最新版本列车落后 62 commits，正式审核前须对齐。
<!-- /DH_V0111_L1_R10_INIT_OWNED_WORKFLOW_20261121 -->