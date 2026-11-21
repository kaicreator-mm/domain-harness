# DomainHarness 0.11.1 — Task Execution PRD（L1 候选）

> 关联：主 Issue [#1563](https://github.com/kaicreator-mm/domain-harness/issues/1563)、Product/L1 [#1605](https://github.com/kaicreator-mm/domain-harness/issues/1605)。此文档属于待独立审核的 Product/L1 **候选**，不等于 L1 Freeze、L2 Freeze、Task Admission 或 Release。

```ini
OUTPUT_LABEL=DH_V0111_TASK_EXECUTION_PRODUCT_L1_R1
SOURCE_BRANCH=version/v0.11.x
SOURCE_EXACT_HEAD=cc44f03ef87528ed6e27edee2dd311752bc6a2f9
SOURCE_STAGE=0.11.0_REFACTORED_ACCEPTED_SCOPED
SOURCE_STAGED_TREE=e21069d72cc7d47c35b9cdfe1cc942314064535a
PRODUCT_STAGE=0.11.1_TASK_EXECUTION
STATUS=AUTHORING_CANDIDATE_NOT_FROZEN
TARGET_BRANCH=version/v0.11.x
MAIN_AND_RELEASE=NO
NODE_MINIMUM=22.12.0
```

## 1. 产品目标与严谨边界

本阶段在 **version/v0.11.x 当前已集成 0.11.0** 上新增“确定性多步骤任务”，不从旧 version/v0.11.0 / main / DIS dev 分支派生；0.11.0 原有四 Workspace、BUILD/Lock、Boot/唯一 KDP、DomainApp.invoke 和真实四包 Consumer 是唯一新能力基础。

用户可将声明式 Workflow/State Model 作为选定的 Element Content，经 BUILD 固化选定函数与流程，再由已启动 DomainApp 执行一个有限、可解释的 Task。输出能明确区分 COMPLETE、ASK、WAIT、REJECT、UNKNOWN、FAILED，保留原因和步骤顺序。仅针对**选定 no-effect Function**；不得接入外部 Effect、Host Permit、LLM、无来源的领域判断、UI 组件、恢复/重放。

0.11.2 负责 Knowledge/Rule/Recognizer/Intent 的领域语义扩展；0.11.3 负责跨多轮的正式交互；0.11.4 真实 Effect；0.11.5 模型；0.11.6 可恢复和终止运行中的耗时操作；0.11.7–0.11.9 经验反馈。ASK/WAIT 在 0.11.1 是**本次执行的最终答复**，而非已持久化等待或未来自动恢复。

## 2. 当前真实架构基线（准确位置）

- Contracts：`packages/contracts/src/element-contracts.ts` 已定义 `workflow-definition` / `state-model` ContentKind，但尚未提供 Task/Workflow 结构化机器合同；`app-contracts.ts` 只定义 FunctionOutcome 与 DomainApp.invoke。
- BUILD：`tooling/build/src/**` 生产选定函数、依赖和精确 Lock；`packages/contracts/src/app-lock.ts` 目前只有 selectedElements / selectedFunctions / ingress，不带已验证执行图。
- KDP：`packages/microkernel/src/kdp.ts` 按 Lock 启动 DomainApp；`domain-app.ts` 只通过校验后的 ingress 执行 Function，拒绝无权限或 effects != none。
- SDK：`packages/domain-harness/src/index.ts` 仅组合上述四包 public API，没有 TaskRunner。
- Demo：`examples/basic-domain-app/`，完整四包 pack→外部 fresh install→Consumer 复用，避免另起平行 Demo。

原 #1602 与 PR #1603 R15 已通过限定独立审核，Woodpecker #2787 SUCCESS；0.11.0 的这份证据只为**未变部分**提供参考，绝不作为新增 Task Execution 的验收收据。

## 3. 关键合同（产品语义，L2 冻结最终字段名）

### 3.1 Goal / TaskRun

- TaskDefinition：由 BUILD 已选定 Workflow 和 State Model 形成，不允许运行时将外来 JSON 当成新增可执行流程。标识含 app/lock 绑定、taskId、版本和 workflow digest。
- Goal：已选定 taskId 和结构化 JSON input；引用当前已启动 DomainApp，输入不得在执行中被外部修改/Getter 或 Proxy 篡改而改变判定。
- TaskRun：临时 in-memory 唯一 ID、只读状态快照、当前 Step、消耗步数、有限 Observation、最终 Result。运行 ID 用于本次观测；相同输入确定性仅指**决策、调用顺序和终态**，不要求随机 ID 相同。
- 一个 TaskRun 从 CREATED→RUNNING，最后精确进入 COMPLETE / ASK / WAIT / REJECT / UNKNOWN / FAILED 之一；终态不可再执行、不可在失败后变成 COMPLETE。0.11.1 无 resume/cancel/checkpoint/retry。
- 直接 `DomainApp.invoke(ingressId,input)` 保留，不强制所有简单 Function 改走 Task。

### 3.2 Workflow

声明式有向图：唯一 startStepId、有限 steps、每一步唯一 ID、显式 next/branch/terminal。MVP 支持两种核心节点：

1. **invoke**：引用 BUILD 已确认、Lock 中暴露且合法的 no-effect ingress；输入仅来自 Goal 的 JSON 投影或**已经完成且 SUCCEEDED 的前序 Step 输出**。不允许代码字符串、动态 import、任意 JS 函数、脚本 eval 或环境访问。
2. **terminal**：COMPLETE / ASK / WAIT / REJECT 之一；携带固定 code/可解释 reason 和有限 JSON 输出映射或缺失需求描述。UNKNOWN / FAILED 由 Coordinator 依据无依据/不可执行结果产生，不得用 terminal COMPLETE 掩盖。

条件路由 MVP 只读 **已校验的 FunctionOutcome** 与 JSON 定位字段，可支持 eq/ne/present 等有限比较，使用显式有序 branch 和**唯一 fallback**。不支持未经约束的表达式语言；不匹配/不可判断时 UNKNOWN。函数 UNKNOWN/FAILED 首先原样映射 Task UNKNOWN/FAILED，不允许普通 success branch 继续执行。

### 3.3 State Model

明确状态集合、初态、每条可允许转移和终态；TaskRun 由运行时控制转移，不是普通 Domain 内容可随意赋值。非法/遗漏转移在 BUILD 或执行前拒绝，执行中非法转移记录 FAILED，不允许静默修复状态。

### 3.4 Lock 绑定

- BUILD 验证 selected Element 的 `workflow-definition` 和 `state-model` 内容。有效绑定应产生规范化**不可变**的选定 Task graph / Content digest，并与 Lock closureDigest 绑定；内容 ref 应在 BUILD 验证真实字节与声明 digest，绝不从未封存路径在运行时补读。
- 检查唯一 ID、图边目标存在、start 可达、所有可执行路径有明确处理、任务只引用**已选 ingress 且 effects=none** 的 Function。依赖 0.11.0 已有 FunctionRef、Target、Schema、Package；无需第二 Package Loader。
- 有环 Workflow 不一定非法；但**必须有配置内强制有限的 maxSteps**，且 Coordinator 对每次 invoke/transition 严格计数，超限立即终止 UNKNOWN/FAILED。目标永不误入无限任务。静态无法确认可终止的图只在有确定硬预算时可执行。
- 尚未支持的新必需语义/机器类型必须 fail-closed，不能以 optional 类型自动执行；无选定/损坏来源不得在 Boot 或 Runtime 自动推断替代图。

## 4. 运行入口与 Coordinator

推荐只在现有 DomainApp 中增加 `runTask(taskId, input)`（最终以 L2 合同决定）；不暴露 `new AgentRuntime()` 或外部可注入 `invoke` callback。Coordinator 在同一个 Microkernel 中复用同一 app 的调用 Gate：

```text
Boot(pin) → verify trusted Lock → KDP package init → Business App Init
                                          ↓
                               DomainApp READY/DEGRADED
                                          ↓
                        runTask(taskId, typed Goal input)
                                          ↓
                 selected sealed graph + step count + state
                                          ↓
                   step input projection + app.invoke(...)
                                          ↓
                  FunctionOutcome → Observation/Guard/Transition
                                          ↓
                      COMPLETE | ASK | WAIT | REJECT
                      UNKNOWN | FAILED（有限终态）
```

执行中的状态必须能区分 App 不可调用、受抑制 ingress、输入/schema 错、Function UNKNOWN/FAILED、Guard 证据不足、预算耗尽与合法拒绝。Observation 至少提供 stepId、所选 ingress、结果 kind、转移结果和安全错误 code；错误日志禁止输出密码、Token、原始高敏业务输入。只把必要且已验证的 JSON 结果返回给调用方，内部 Lock/Host 不可变且不泄漏。

严格澄清：**maxSteps 限制的是已获得控制权的步骤循环，不会中断永不 settle 的 Promise。** 0.11.1 不以“支持 timeout / cancel / durable recovery”宣传；这些进入 0.11.6。

## 5. 产品验收（均需真实 POS/NEG）

| AC | 真实可观察行为 |
|---|---|
| AC11 | 四包外部 Consumer 的 2+ invoke 多步骤任务完成 COMPLETE，明确步骤顺序和结果 |
| AC12 | 同一 Workflow 使用结构化 Guard 走两条不同 Branch，非选中分支零调用 |
| AC13 | 缺用户输入为 ASK、需外部条件为 WAIT；都不执行后续 Function，不冒称可恢复 |
| AC14 | 正式拒绝 REJECT；Function UNKNOWN→Task UNKNOWN、FAILED→Task FAILED，没有洗白 |
| AC15 | 无效 Task/Step、丢失 Guard、未选入口、effects != none 必须拒绝且目标零调用 |
| AC16 | 一个自环和一个多节点环必在 maxSteps 预算内停止；不静默重试 |
| AC17 | App 未 READY、已 dispose、DEGRADED suppressed ingress 都不得绕过 gate |
| AC18 | 0.11.0 直接 `invoke` 仍然可用，未改变已选 Package/Lock/Boot 语义 |
| AC19 | 固定 Pin 与输入、确定性函数输出下步骤选择与最终结果相同；执行 ID 可不同 |
| AC20 | 单一真实四包 pack/install 外部 Consumer 通过完整路径，包含必要拒绝反例 |

不可用旧 #2787 充当 AC11–AC20 的 PASS。验证采用一次等价本地检查 + 必要的 Woodpecker 同 HEAD CI + 跨对话独立 Review；源代码、测试代码 Typecheck、ESLint、真实 Demo 均纳入。

## 6. 接口/职责建议（L2 才能冻结）

| 责任层 | 预计最小修改 |
|---|---|
| Contracts | Task/Goal/Workflow/State/RunResult 的独立 TypeScript 类型和机器验证；只输出可审的契约 |
| BUILD | 选定 `workflow-definition`/ `state-model`、闭包绑定/Lock、非法图与 Effect 前置拒绝 |
| KDP/Microkernel | 在当前 createDomainApp 中建立 Task Coordinator，并复用 `invoke` 权威入口 |
| SDK | 只对已有 DomainApp 新增选定 Task 入口；不添加独立 Runtime |
| Demo & Docs | 扩展现有 `examples/basic-domain-app/` 证明 AC11–AC20，中文业务路径和错误语义文档 |

单一版本分支 `version/v0.11.x`。0.11.1 是**内部阶段**，本轮不创建 main PR、Tag、npm 发布或独立 GitHub Release。

## 7. ADS v4.19 实施与冻结

1. 本 PR Product/L1 候选经另一 ChatGPT 对话**独立审核**后写回 #1605，明确 Exact HEAD、P0/P1/P2、AC/边界与是否 `ACCEPT_SCOPED_PRODUCT_L1`；待 Owner/Integrating checkpoint 才称 Frozen。
2. 独立 L2 Issue 把选定 Task graph/数据合同、Lock 字段、Guard 真值表、状态转移、错误码、绑定的 public SDK 和 test fixtures 细化并经同样的最小必要复审。
3. 物化与读回 GitHub Native Task DAG；建议 Contracts → BUILD 与 Coordinator 可在冻结后不冲突写集并行 → SDK/Demo Integrator。遵守单 Writer/Exact SHA，且不对每个小编译错误循环审批。
4. 单批次修复+本地等价验证+必要 CI；独立 Reviewer 只审真实变化；一次受控合并到 `version/v0.11.x`，#1563 按 Source/Tree/CI/Review 记录限定 Stage-1 Closeout。
5. 不重新运行未变化 0.11.0 全量验证；所有关键错误有可行动原因；源码和关键逻辑的注释、调用流程写中文。

## 8. 明确不属于本次承诺

不加入 0.10.x 兼容、外部 Effect、Hosted Tool、独立权限系统、LLM Provider、用户跨轮 UI、持久化/恢复/取消、多 Agent 协作、Client Experience Cache、Server Meta 学习或 DomainForge 建模。之后版本以 #1563 R4 Roadmap 为准。
