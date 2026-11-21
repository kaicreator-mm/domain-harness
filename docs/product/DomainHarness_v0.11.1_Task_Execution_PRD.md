<!-- DH_V0111_PRODUCT_GENERIC_ELEMENT_NESTING_AND_FILE_DATA_L1_R4_20261121 -->
> **本轮新增的 L1 WHAT（不增加 F/AC 编号）：** Element 除 Workflow 调用外还支持多层嵌套组合和显式能力依赖；同一个 Element 定义可被多个父 Element 复用且不复制定义。数据 Element 可以直接引用已选固定格式文件数据，不必为每份文件定制执行代码；通过一个可复用的通用文件读取 Element，多个数据 Element 能向调用者提供可观察的只读数据结果。最小验收采用一种固定格式（例如 JSON）和真实 Package 封存资源。具体 ElementRef/ResourceRef、Reader 选型、BUILD/Lock、解析和调用方式都留给 [L2 #1608](https://github.com/kaicreator-mm/domain-harness/issues/1608)。不打开运行时任意磁盘路径/Host 文件系统权限，本版依旧不实现 0.11.4 外部授权 Effect。
<!-- /DH_V0111_PRODUCT_GENERIC_ELEMENT_NESTING_AND_FILE_DATA_L1_R4_20261121 -->

<!-- DH_V0111_PRODUCT_ELEMENT_REUSE_NESTED_WORKFLOW_L1_R3_20261121 -->
> **0.11.1 L1 增量功能范围（Owner 讨论）**：一份 Element 定义可以在同一或不同 Workflow 节点中反复引用；Workflow 支持包含子 Workflow 的多层组合；相同 Element 的不同执行实例有独立输入、状态和结果；一个只包含单个 Element 的 Workflow 也能被执行。这属于**用户能观察到的 WHAT**。具体 Node/ElementRef/TaskRun/Actor、XState 以及统一 Function 式实现细节由 [L2 #1608](https://github.com/kaicreator-mm/domain-harness/issues/1608) 处理。F01–F10/AC11–AC20 编号不增加，只更新相关定义。本 PR 仍待独立 L1 审核/冻结。
<!-- /DH_V0111_PRODUCT_ELEMENT_REUSE_NESTED_WORKFLOW_L1_R3_20261121 -->

<!-- DH_V0111_PRODUCT_L1_OWNER_XSTATE_RESEARCH_BOUNDARY_20261121 -->
> **Owner 最新决定：** 本版本必须先读清 0.10 Workflow/StateMachine 的源码逻辑并文档化；采用最新稳定 XState 与 Element-First 的具体实现属于 [L2 #1608](https://github.com/kaicreator-mm/domain-harness/issues/1608)，不写成 L1 功能细节。[源码研究和责任边界文档 PR #1611](https://github.com/kaicreator-mm/domain-harness/pull/1611)。Package 业务异常由其自身处理；SDK/KDP 仅作最小退出/日志，不承诺绝对无异常/安全。**本轮新增 Product WHAT：Workflow 能多层组合/引用子 Workflow，同一 Element 能在不同节点和层级多次复用，并使每次执行结果独立；对应修改 F01/F02/F04、AC11/AC20，编号保持不变，仍属待审核候选。**
<!-- /DH_V0111_PRODUCT_L1_OWNER_XSTATE_RESEARCH_BOUNDARY_20261121 -->

# DomainHarness 0.11.1 — Task Execution（Product/L1 · WHAT）

> Master [#1563](https://github.com/kaicreator-mm/domain-harness/issues/1563) · Product [#1605](https://github.com/kaicreator-mm/domain-harness/issues/1605) · L2 [#1608](https://github.com/kaicreator-mm/domain-harness/issues/1608)。本文件只说明 **0.11.1 重写应交付的能力、边界和验收结果**；具体实现方式全部在 L2 定义。本 PR 仍是 Product/L1 候选，不代表冻结或功能已完成。

```ini
OUTPUT_LABEL=DH_V0111_PRODUCT_L1_WHAT_ONLY_R2
STAGE=0.11.1_TASK_EXECUTION_REWRITE
SOURCE_BRANCH=version/v0.11.x
SOURCE_AUTHORING_BASE=cc44f03ef87528ed6e27edee2dd311752bc6a2f9
LATEST_VERIFIED_TRAIN_HEAD=6fb636163d1ba65fe39ccffae1e1abaafbae7045
SOURCE_STAGE=0.11.0_REFACTORED_ACCEPTED_SCOPED
PRODUCT_L1_STATUS=AUTHORING_NOT_FROZEN
IMPLEMENTATION_PLAN=SEE_L2_ISSUE_1608
MAIN_MERGE=NO
STANDALONE_RELEASE=NO
```

## 1. 版本定位

0.11.x 是整个 DomainHarness 产品的**新架构重新设计与重写**。0.11.0 已建立新版 Foundation（发起本 PR 时 HEAD 为 cc44f03…；随后 #1606 仅新增中文源码注释与维护文档，版本列车 HEAD 变为 6fb6361…，未改变程序执行逻辑）；0.11.1 继续在该新版基础上，**重新实现 Task Execution 相关产品能力**，不是修补/移植旧 Task Runtime，不以旧代码、旧接口或所有历史功能等价为验收门槛。

**0.11.1 的成果**：一个已启动的 Domain App 可以组合与依赖多种 Element（包括从文件读取的只读数据 Element），依据预先定义的 Workflow 与 State Machine 连续执行多步骤确定性任务或嵌套子 Workflow；同一 Element 可在不同组合位置多次引用、各次执行相互独立；系统能说明任务完成、缺信息、等待、拒绝、未知或失败。单独调用一个 Element/Function 及单节点 Workflow 仍可使用。

本阶段只涉及确定性任务执行；不引入模型自主决策、真实外部副作用、跨会话任务恢复或经验学习。这些按 #1563 规划在后续阶段解决。

## 2. 本版本必须实现的产品功能（WHAT）

| 编号 | 本版本应具备的能力 | 用户/上层应用应看到的结果 |
|---|---|---|
| F01 | **Goal / Task**：定义一次任务目标和输入，并发起执行，区别可复用定义与每次执行实例 | 能创建/执行明确任务；同一任务定义可重复运行且各次结果独立 |
| F02 | **Element 嵌套与 Workflow**：Element 可按定义多层组合、引用子 Element；Workflow 可组合多个步骤、条件分支和子 Workflow，同一子定义可复用 | 父子 Element/Workflow 的组合执行和多处引用均可工作，结果独立、路径可解释 |
| F03 | **State Machine**：任务具备可观测状态和合法变化 | 可以确定当前步骤、任务状态和最终结果，非法状态变化不会被接受 |
| F04 | **Element 复用、依赖与文件数据**：一个 Element 可以依赖其他 Element 的能力；数据 Element 可使用固定格式文件作为数据来源并复用通用读取 Element，不要求每份数据单独编写 Function 实现 | 多个数据 Element 复用读取能力，能返回真实文件数据并被其他 Element 依赖；同一定义的各次调用独立 |
| F05 | **交互需求表达**：流程可确定需要用户补充的信息或暂时等待外部条件 | 返回 ASK 或 WAIT，并说明缺少什么 / 等待什么；本版不承诺后续自动恢复 |
| F06 | **结束与拒绝**：流程可正常完成或明确拒绝 | 能区分 COMPLETE 与 REJECT，并解释结果 |
| F07 | **未知与失败**：知识/条件不足、执行出错可明确表达 | UNKNOWN / FAILED 不会被误当成成功，也不会执行错误的后续步骤 |
| F08 | **有界执行**：循环和分支不会让任务无限运行 | 反复执行的任务在预定有限界内终止或报告未完成，不出现无界重试 |
| F09 | **可观察结果**：输出任务路径、步骤结果与停止原因 | 调用方能判断执行过什么、执行到哪里、为什么停止；不泄露秘密 |
| F10 | **新版基础能力保持**：任务执行与 0.11.0 的直接 Function 执行并存 | 新功能不会破坏已验证的 Domain App 装配、初始化、调用和释放 |

以上是**功能与行为要求**，不规定采用何种数据结构、运行时对象、API 命名、算法、包路径、校验器、状态存储介质或测试框架。上述设计由 L2 #1608 负责。尤其不能在 L1 强制选定 `runTask` 方法名、`maxSteps` 字段名、特定 JSON Guard 操作符、Lock 的增量格式或 Task Coordinator 的源码归属。

## 3. 本阶段明确不交付

- **0.11.2 Domain Intelligence**：完整领域知识/规则/识别/判断系统与实际语义选择。
- **0.11.3 Semantic Interaction**：多轮需求对话、自适应 UI、完整交互会话。
- **0.11.4 Authorized Action**：真实状态修改、外部 Host/Effect/授权执行。
- **0.11.5 Bounded Reasoning**：LLM 模型选择、模型推理和 Tool Loop。
- **0.11.6 Durable Execution**：持久化 checkpoint、任务中断恢复、取消/超时语义。
- **0.11.7–0.11.9 Feedback**：长期执行证据、Client 经验复用与 Server Meta 优化。

既有 0.10.x 体系可作为参考材料，但不是本版必须迁移的代码或 ABI。0.11.1 不单独发行；最终集成到 `version/v0.11.x`，待整列车具备资格后才进入 main/Release。

## 4. 功能验收 AC11–AC20（只看可观察效果）

| AC | 判定标准 |
|---|---|
| AC11 | 一个真实多层 Element/Workflow 组合（含至少两步及一个子 Workflow）完成；非 Workflow Element 也能组合子 Element；单节点 Workflow 可正常完成 |
| AC12 | 相同流程在两种有效输入下选择不同分支，未选分支不执行 |
| AC13 | 缺必要信息时返回 ASK；条件暂不可满足时返回 WAIT；不会误报完成 |
| AC14 | 明确拒绝、未知、执行失败能够分别返回 REJECT、UNKNOWN、FAILED |
| AC15 | 无效流程、未选定/未授权的执行目标被拒绝，危险步骤零执行 |
| AC16 | 存在循环的任务受到执行界限约束，不会无限继续或偷偷重试 |
| AC17 | 应用尚不可运行、已释放或某入口受限时，任务不能绕过现有调用约束 |
| AC18 | 原有新版的直接 Function 执行、启动和释放行为没有退化 |
| AC19 | 固定流程、输入及确定性业务结果时，步骤选择和最终业务结果可复现 |
| AC20 | 真实安装 Domain App 展示：多份数据 Element 从选定固定格式文件读取数据并复用同一通用 Reader Element，其他 Element 依赖数据 Element；多处引用、子 Workflow、结果独立及真实正反例，不是纯 Mock |

所有 AC 必须以 0.11.1 新实现的真实证据为基础；0.11.0 已通过的限定测试可以复用，但**不能证明新增功能已合格**。每项 AC 的测试组织、源码变更范围和 CI 策略由 L2 与 Task 具体安排。

## 5. L1 / L2 的责任分界与交付状态

- **L1（本文件）**：确认版本价值、必须实现的 F01–F10、明确不做的范围、AC11–AC20。独立审核仅围绕“做什么、边界是否正确、如何判定完成”，不在此冻结实现细节。
- **L2（#1608）**：选择 Task/Workflow/State 的机器契约、执行与校验算法、BUILD/Lock/Boot/KDP/SDK 的接入设计、错误/日志、写集/Task DAG、实现顺序和验证方案。L2 设计需满足本文件，不得因实现偏好扩大 L1。
- **Task/Implementation**：基于 L2 冻结内容开发；修复和验证采用有限任务交付与必要的独立审核，不为每次小修复重新审批整个版本。
- **阶段发布**：只按 #1563 的单一 0.11.x 版本列车集成，不单独 main/Tag/Release。

**当前状态**：Product/L1 候选修订中；L1 独立审核、L2 冻结、Native DAG、0.11.1 代码、CI/演示均未运行/完成。
