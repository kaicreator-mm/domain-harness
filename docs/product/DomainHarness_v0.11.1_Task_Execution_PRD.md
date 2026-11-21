> **R9.1 深度规则变更：** 用户将此前「所有父子 Workflow 共用同一个最大嵌套深度」修改为「每个 Workflow 对自己的子树声明最大下级嵌套深度」。**根 Run 总 Element 调用次数仍共享**。子 Workflow 的深度声明可以比父更宽/更严，但不能越过任一活动祖先约束；具体相对计数及 BUILD 封存在 [L2 #1608](https://github.com/kaicreator-mm/domain-harness/issues/1608)。此为 L1 行为收口，不新增 F/AC 编号。

# DomainHarness v0.11.1 — Task Execution Product PRD · L1 R9.1（WHAT）

> **审阅说明：** 本文件与 [Version/Product #1605](https://github.com/kaicreator-mm/domain-harness/issues/1605) 的 R9 产品合同对齐。旧 R3/R4 中“非 Workflow 嵌套可执行”“JSON-only”“三个生命周期 Hook”“优先级路由”均被用户后续的 R9 决议覆盖。源代码与 HOW 按 [L2 R9 #1608](https://github.com/kaicreator-mm/domain-harness/issues/1608) 处理；这是 Draft 未冻结，不是新功能已实现。

# DomainHarness v0.11.1 — Task Execution（Version/Product L1 WHAT · R9.1）

```ini
OUTPUT_LABEL=DH_V0111_PRODUCT_R9_1_LOCAL_NESTING_DEPTH
MASTER=#1563
VERSION_ISSUE=#1605
PRODUCT_DRAFT_PR=#1607
L2=#1608
ARCH_DRAFT_PR=#1611
VERSION_TRAIN=version/v0.11.x
MODEL=ELEMENT_FIRST_UNIQUE_DEFINITION_REUSED
NESTING=WORKFLOW_ONLY_DEFAULT_WORKFLOW_SINGLE_NODE_ALLOWED
ENTRY=INIT_ELEMENT_PER_SELECTED_PACKAGE
FILE_READER=JSON_YAML
ROUTING=EXPLICIT_SWITCH_EXITS_NO_PRIORITY
HOOK=START_END
BUDGET=SHARED_ROOT_CALL_COUNT_AND_PER_WORKFLOW_RELATIVE_DEPTH
STATUS=L1_CANDIDATE_NOT_FROZEN
NATIVE_DAG=NOT_CREATED
CODE=NOT_STARTED
RELEASE=NO
```

## 产品目标与范围

0.11.x 为彻底重写版本，v0.11.1 在已通过限定验收的 v0.11.0 Foundation 上新增确定性 Task/Workflow 执行，不兼容或移植旧 0.10 ABI。一个唯一 Element 定义可被多处引用，引用位置和每次运行独立。Element 可声明依赖；**有嵌套执行需求时只用 Workflow 嵌套类型**，该类型为默认值，**一个节点也合法**，支持子 Workflow。单独的 0.11.0 Function 调用不受影响。

各选定 Package 以自己唯一的 **Init Element** 作为新版 Workflow 调用入口，经其已选能力启动 Workflow；与 Package technicalInit/technicalDispose 和 App businessAppInit 的技术启动、App 就绪阶段互不混淆。选定 Package 内的业务 Workflow 不应该因为 Boot 就无条件运行。Package Init 与对外 ingress 的具体绑定规则由 [L2 #1608](https://github.com/kaicreator-mm/domain-harness/issues/1608) 解决。

## F01–F10 · 产品能力（WHAT）

| 项 | 本版能力与用户可见效果 |
|---|---|
| F01 | 每个选定 Package 的新版业务调用经 Init Element 入口发起 Workflow；同一入口可有独立执行实例 |
| F02 | Element 嵌套类型显式、默认 workflow；v0.11.1 仅支持此类型，允许单节点、多节点、多层子 Workflow 和同一子 Element 多次引用 |
| F03 | Guard/Outcome 经 **Switch 式具名出口**确定下一个 Element 引用位点或终态，不依赖竞争优先级 |
| F04 | 数据 Element 可引用随 Package 封存的 **JSON/YAML** 固定格式文件；多个数据 Element 复用对应的通用 Reader Element，并可被其他 Element 依赖使用 |
| F05 | ASK/WAIT 明确表达需要用户信息/等待条件，本版返回当次结果、不承诺持久化恢复 |
| F06 | COMPLETE/REJECT 明确区别业务完成和拒绝 |
| F07 | UNKNOWN/FAILED 明确区别未知与失败，不自动洗成成功或 false |
| F08 | 根/子 Workflow 共享**总 Element 调用次数预算**；**每个 Workflow 单独决定其子树允许的最大嵌套深度**，所有活动祖先的约束共同生效；循环和子流程不能绕过 |
| F09 | 每次 Element 调用的业务 Hook 只有 **start/end** 两个可选时机；最终结果包含路径和停止原因，业务收尾后才返回 |
| F10 | 0.11.0 的 Boot/Pin/Lock、Init、Ingress/READY、直接 Function 调用和 Dispose 行为不得退化 |

## AC11–AC20 · 真实可观察验收

| AC | 合格要求 |
|---|---|
| AC11 | 通过 Package Init Element 启动真实根 Workflow，2+ 节点及一个子 Workflow 可完成；仅一个节点的 Workflow 也合格 |
| AC12 | 两种业务结果命中两个不同的显式 Switch 出口，未选 Element 不执行；UNKNOWN/FAILED 也有明确出口，无优先级选路 |
| AC13 | ASK、WAIT 各给出明确停止原因，本版结束当前 Run，不伪造恢复 |
| AC14 | REJECT、UNKNOWN、FAILED 各有真实执行结果，不报告 COMPLETE |
| AC15 | BUILD 拒绝未知嵌套类型、失效依赖、非法出口目标及未选入口，危险执行零发生 |
| AC16 | 同一根 Run 下子 Workflow、Reader/Guard 的实际 Element 调用共用总预算；不同 Workflow 可声明不同本地最大下级嵌套深度，进入子 Workflow 前逐祖先检查，不能通过下层更宽松的设置突破父限制；循环正确终止 |
| AC17 | App 未就绪、已 Dispose、Ingress 被禁用时 Package Init 不能绕过既有约束 |
| AC18 | Stage0 的直接 Function、App businessAppInit 与 Package technicalInit/Dispose 回归无退化 |
| AC19 | 相同被选定义、输入及确定性业务结果的执行路径可复现；重复引用同一 Element 的运行结果各自独立 |
| AC20 | 真实 clean-packed Domain App 展示：**两份 JSON/同一 JsonReader + 两份 YAML/同一 YamlReader**；一个其他 Element 依赖所读数据；start/end Hook 正反路径；子 Workflow/显式出口/失败传播均非纯 Mock |

L1 只定义 WHAT。TypeScript 接口/Lock IR、XState/Actor、Switch label schema、Reader 解析器、业务 Hook 异常规则和预算计数规则在 [L2 #1608](https://github.com/kaicreator-mm/domain-harness/issues/1608) 的 R9 候选统一说明。

## 严格边界

- 保留 0.11.0 已有 Runtime Schema/Outcome/Ingress/Boot Trust/READY/Dispose 等校验，不新增 KDP/SDK 运行时业务校验；新图/引用/文件格式合法性由 BUILD/Package 生产者负责，业务异常由 Package 自己处理。
- 不引入 0.11.2 Domain Intelligence、0.11.3 Semantic Interaction、0.11.4 外部授权 Host/Effect/任意文件读取、0.11.5 LLM、0.11.6 Durable Resume、0.11.7–0.11.9 反馈进化。
- 不要求 0.10 接口兼容，不立刻合入 main 或发布。只在 `version/v0.11.x` 版本列车按 ADS 限定集成。

## 当前证据与状态

- [Draft L1 PR #1607](https://github.com/kaicreator-mm/domain-harness/pull/1607)；
- [L2 #1608](https://github.com/kaicreator-mm/domain-harness/issues/1608) / [Draft R9 PR #1611](https://github.com/kaicreator-mm/domain-harness/pull/1611)；[R9 详细合同](https://github.com/kaicreator-mm/domain-harness/blob/design/v0.11.1-xstate-legacy-study/docs/architecture/DomainHarness_v0.11.1_L2_ELEMENT_WORKFLOW_EXECUTION_CONTRACT_R9.md)；
- [总控 #1563](https://github.com/kaicreator-mm/domain-harness/issues/1563)。目前 L1/L2 **未完成异对话独立审核/Freeze，未创建 Native Task DAG，未实施 0.11.1 源码/CI/packed E2E**。


## 设计审查边界

- L1 审查：逐项确认 F01–F10 / AC11–AC20 是否准确表达用户需要的可观察行为、是否不提前引入后续版本功能。
- L2 审查：Init Element、Workflow nesting、Switch case 完备性、Reader JSON/YAML、start/end Hook、Budget/Actor 等实现细节在 [L2 R9 实施合同](https://github.com/kaicreator-mm/domain-harness/blob/design/v0.11.1-xstate-legacy-study/docs/architecture/DomainHarness_v0.11.1_L2_ELEMENT_WORKFLOW_EXECUTION_CONTRACT_R9.md) 提交独立审核。
- 不重复 0.11.0 通过的基础实现验证；只有新功能与受影响边界需要增量新证据。L1/L2 的审核结论不得自行伪造。
