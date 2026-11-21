# DomainHarness v0.11.1 — Task + Execution Loop · Product/L1 R26

> **当前实现对齐候选（非自签 Freeze）**。基于 Product #1605 的 F01–F10 与 AC11–AC20 原文、R17 的设计限定接受、T11–T14 已独立审核并合入的真实 0.11.x 源码。此文代替 #1626 仍记载“未实施”的旧候选状态；不重写已经接受的产品语义。

~~~ini
OUTPUT_LABEL=DH_V0111_R26_PRODUCT_L1_SOURCE_ALIGNED
REPO=kaicreator-mm/domain-harness
VERSION_ISSUE=#1605
L2_ISSUE=#1608
MASTER_ISSUE=#1563
TRAIN_EXACT_SHA=639de32c98b8bbb40d34000d8c9b230be3759884
T11=#1627_CLOSED_SCOPED_ACCEPTED
T12=#1628_CLOSED_R13_ACCEPT_SCOPED
T13=#1629_CLOSED_R4_ACCEPT_SCOPED
T14=#1630_CLOSED_R25_ACCEPT_SCOPED
T14_CI=WOODPECKER_2917_SUCCESS_AT_SOURCE_HEAD
QUALITY_PR=#1637_MERGED_R24_ACCEPT_SCOPED
SOURCE_STATUS=MERGED_TO_VERSION_TRAIN
L1_FREEZE=INDEPENDENT_VERSION_REVIEW_PENDING
L2_FREEZE=INDEPENDENT_VERSION_REVIEW_PENDING
MAIN_RELEASE=NO
~~~

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

## v0.11.1 实施完成矩阵（R26 源码与独立验收来源）

| 产品能力 | 本版实现位置 | 原始验收来源 |
|---|---|---|
| F01 Init 唯一业务启动入口 | packages/microkernel/src/package-system.ts; contracts WorkflowStarter | T11 #1631 + T13 #1639 |
| F02 单节点/递归、独立 Actor | packages/microkernel/src/workflow-run.ts 与 workflow-execution.ts | T13 R4; T14 R25 AC11/AC19 |
| F03 严格具名 Switch | packages/contracts/src/workflow-contracts.ts; workflow-validate.ts | T11 独审; T14 R25 AC12 |
| F04 两份 JSON/两份 YAML + Reader 复用 | workflow-execution.ts; basic-domain-app/workflow-fixture.mjs | T14 R25 AC20 |
| F05 ASK/WAIT | WorkflowOutcome，明确本次运行终态 | T14 R25 AC13 |
| F06 REJECT != COMPLETE | workflow-execution.ts fail-closed 转移 | T14 R25 AC14 |
| F07 UNKNOWN/FAILED 保持原 Reason | workflow-execution.ts | T13 R4; T14 R25 AC14 |
| F08 根共享调用预算 + 逐祖先深度 | workflow-contracts.ts; workflow-execution.ts | T13 R4; T14 R25 AC16 |
| F09 await start/end + 致命清理 | workflow-execution.ts; package-system.ts | T13 R4; T14 R25 AC17/AC19 |
| F10 继承 0.11.0 Element-First BUILD/KDP/Init/Exit | 0.11.0 Foundation、T12 单 BUILD/Lock | #1625 Foundation; T12 R13; T14 R25 AC18 |

**AC11–AC20 实证**：#1630 的 R25 独立报告对每一项均列示具体源码与 E2E 或已接受 upstream 测试；#1640 的消费者输出 `consumer-result.json` 与本页正式 AC 编号完全一致，区分 `PASS_E2E` 与 `PASS_E2E_WITH_UPSTREAM`，不重复声明旧测试在当前审核中重跑。T14 最终来源 HEAD `1afa40e6163b83d06fdc2a2e38842a6966bf9ddd`，同 SHA [Woodpecker #2917](https://ci.kaicreator.com/repos/18/pipeline/2917/1) SUCCESS；版本列车 squash HEAD `639de32c98b8bbb40d34000d8c9b230be3759884`。源码级独审与合并事件已经成立，**版本级 L1/L2 Freeze 仍须独立确认集成后内容和文档正确性**。

## 排除范围与风险记录

- 0.11.x **完全重写**；不为 0.10.x 提供旧 ingress/EntryRef/technicalInit 兼容层。
- 不包含 0.11.4 Host/Effects、0.11.5 LLM、0.11.6 Durable Resume、Experience & Evolution Loop。ASK/WAIT **不是**暂停后恢复能力。
- 0.11.0 的可选 Package.Exit/InitFrom、Core.Order=0→KDP、直接 Extension 权限沿用现有已接受基础，不创建第二个 Kernel/BUILD/Lock。
- T12 R13 唯一非阻断 P2：受控本地 HTTP Registry 使用 IPv6 loopback `[::1]` 的 URL.hostname 误拒绝（fail closed，非放权），可后续限定修复；不得因此把已审安全边界改成任意 HTTP。
- 此文只作为 v0.11.1 **最终源代码对齐的版本收尾候选**，不代替另一对话的版本级 Product/L1/L2 独立确认，不自动合并 main 或发布。
