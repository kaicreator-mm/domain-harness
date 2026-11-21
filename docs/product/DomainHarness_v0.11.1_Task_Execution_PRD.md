<!-- DH_V0111_R17_P2_DISPOSITION_20261121 -->
> **【R17 · R16 独审四项 P2 的产品消歧】**：R16 审核 `ACCEPT_SCOPED P0=0/P1=0/P2=4`（[PR Review #6005190842](https://github.com/kaicreator-mm/domain-harness/pull/1626#pullrequestreview-6005190842)），不等于 L1/L2 Freeze。当前统一 L1/L2 PR 为 **#1626**，旧 #1607/#1611 只是历史记录。T11 [#1627](https://github.com/kaicreator-mm/domain-harness/issues/1627) 已选型：`WorkflowRef(ElementRef,contentId)`、现有 Package.Init 的 `ReadonlyWorkflowStarter.start(ref,input)`、结果 `WorkflowOutcome`、Function 节点与已选 Reader ResourceRef。T12 [#1628](https://github.com/kaicreator-mm/domain-harness/issues/1628) 负责同一 BUILD 中封存 Reader 原始 UTF-8 字节，函数节点以 JSON `{format,source}` 调用真实 Reader Element，YAML 严格 JSON-compatible 值；不提供任意 Host filesystem；XState v5 与 YAML parser 采用**构建期验证后捆绑进入 first-party 已选安装字节闭包**，业务包不带未审核 npm 依赖。明确路由缺省拒绝、Unknown/Failed 禁止直接提升 COMPLETE；预留 start/Function/end 预算，失败不得抹去并须清理。此为技术选择与实施中接口约束，**未声称新功能运行通过**。
<!-- /DH_V0111_R17_P2_DISPOSITION_20261121 -->

<!-- DH_V0111_R16_CURRENT_MERGED_B0_20261121 -->
## 【LATEST · R16】唯一列车已完成 B0 Element-First Foundation，可开始 0.11.1 新能力

```ini
OUTPUT_LABEL=DH_V0111_R16_L1_REAL_BASELINE
REPO=kaicreator-mm/domain-harness
SOURCE_TRAIN=version/v0.11.x@3bbeb0edaba3cbac762371e4b2632defa4255308
FOUNDATION_FIX_ISSUE=#1624_CLOSED
FOUNDATION_IMPL_PR=#1625_MERGED
FOUNDATION_REVIEW_HEAD=3da03a47b45d44c54190f63eac482ea79ade00f2
FOUNDATION_REVIEW=R3_ACCEPT_SCOPED_P0_0_P1_0_P2_0
FOUNDATION_CI=WOODPECKER_2857_SUCCESS
V0111_STAGE=PRODUCT_AND_L2_R16_CANDIDATE
V0111_CODE=NOT_IMPLEMENTED
V0111_REVIEW_AND_FREEZE=PENDING
```

**已实现且不再属于 0.11.1 的前置缺陷**：运行 Package 的必需 `init:ElementRef`、可选 `exit?:ElementRef`、BUILD 选定 `FunctionRef`→物理 `ImplementationLocator`、Init 期可用 `context.functions`、Hook Provider 基础身份、直接 Extension/资源权限、唯一 `Core.Order`、逆序 Exit、可选 InitFrom、可信 Boot/Lock、安装包闭包。**旧的公共 EntryRef、DomainApp.invoke/ingress 已移除。**

**本版唯一业务目标**：现有 Package.Init 在同一次调用内启动 BUILD 选定的 Workflow，使用现有受限 Function 调用能力执行节点；Task/Workflow 结果不会自动转化成 AppStatus。不重启 Package.Init，不复活旧 direct ingress。

**0.11.1 新能力边界**：定义版本化 `workflow-definition` 内容 Schema；单节点及仅 Workflow 子级嵌套、XState v5 内部 actor、Switch 具名唯一出口、Guard/Outcome、JSON/YAML 可复用 Reader Element、业务 ElementRun.start/end、根共享实际 Element 调用预算/逐 Workflow 局部深度。YAML 数据的 BUILD 封存与 Reader 只读权限、XState/YAML 的可验证受信依赖，都要由本版新增。0.11.4 Effect、0.11.5 LLM、0.11.6 持久恢复不包含在本版。

**实际实施顺序**：T11 合同/Schema → T12 已选 Workflow/Reader BUILD/Lock → T13 单 KDP WorkflowRun → T14 clean-packed Task E2E。仅独立审核增量新合同/实现；既有 B0 Scoped 验收直接复用。该 PR 为**文档候选**，不冒称 Freeze/源码/CI。
<!-- /DH_V0111_R16_CURRENT_MERGED_B0_20261121 -->

<!-- DH_V0111_L1_R16_MERGED_FOUNDATION_PRD -->
# DomainHarness v0.11.1 — Task Execution · Product/L1 R16（WHAT）

```ini
OUTPUT_LABEL=DH_V0111_PRODUCT_L1_R16_MERGED_FOUNDATION
MASTER=#1563
VERSION=#1605
CURRENT_L1_L2_PR=#1626
L2=#1608
HISTORICAL_L1_PR=#1607_DO_NOT_MERGE
HISTORICAL_L2_PR=#1611_DO_NOT_MERGE
V0110_NEW_SPEC=#1621_MERGED
V0110_B0_FOUNDATION=#1625_MERGED
V0110_TRAIN_HEAD=3bbeb0edaba3cbac762371e4b2632defa4255308
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

0.11.x 完全重写、不要求旧 v0.10.x 兼容。0.11.1 的**正常启动和执行链为 `Package.Init → Workflow → Element.Function`**：Package 自己已存在的 Init Element 可在初始化期间按其选定业务定义**启动相应 Workflow**；不能再出现 READY 后的第二次 BusinessAppInit、重复的 `technicalInit` 或所谓 Init Router。某 Package 无业务 Workflow 时，其 Init 仍可只处理 Package 自身初始化。0.11.0 的 Core.Order/KDP 0 与 Extension 直接依赖及 Init/Exit 由 [新版 0.11.0 规范 #1621](https://github.com/kaicreator-mm/domain-harness/pull/1621) 负责，0.11.1 不另外规定 Core 调度或 Init 的顺序；#1621/#1622/#1625 已合并版本列车并限定验收，后续不会重建该基础。

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

0.11.1 不做 0.11.4 Host 授权/任意文件系统写读、0.11.5 LLM、0.11.6 Durable Resume、后续经验与进化机制；不做 0.10 兼容。L2 R16 详见 [#1608](https://github.com/kaicreator-mm/domain-harness/issues/1608)（原 PR #1611 为历史草案）；0.11.0 依赖 [#1564](https://github.com/kaicreator-mm/domain-harness/issues/1564)、[#1621](https://github.com/kaicreator-mm/domain-harness/pull/1621)。

**当前状态（R16 更新）**：0.11.0 B0 #1625 已合并并通过 R3 独审 `ACCEPT_SCOPED P0=0/P1=0/P2=0`、Woodpecker #2857 SUCCESS；`Package.init/exit:ElementRef`、Init 期间选定 Function、直接 Extension、统一 BUILD/Lock/KDP/Boot 已有源码证据。0.11.1 的 Workflow/TaskRun、Reader、Actor、Switch、业务 Hook/预算仍未实现、未验收。本产品 R16 与同分支的 L2 R16 是新列车基线候选；此前旧 PR #1607/#1611 仅保留历史评审记录，不应从过期源码分支开展实际实施。
<!-- /DH_V0111_L1_R16_MERGED_FOUNDATION_20261121 -->