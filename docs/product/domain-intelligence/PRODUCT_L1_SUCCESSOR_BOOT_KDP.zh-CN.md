# DomainHarness 后继 Product/L1 修订 — Boot / KDP Primary 权威模型

状态：SUCCESSOR_PRODUCT_L1_CANDIDATE / NOT_FROZEN
范围：v0.10.3 之后的在研后继架构
父级冻结 Product/L1：#1477 @ b8135aa801eb38fcae2fa1fce3bada541178d5b9
相关候选：#1480
阻断修订：#1484

## 1. 目的与权威

本文是后继 Product/L1 修订候选，用于明确最小应用引导程序（Boot）与引导后 Kernel/Package 权威（KDP Primary）的职责边界。

本文**不重写、不废止，也不追溯性重新解释**位于 `b8135aa801eb38fcae2fa1fce3bada541178d5b9` 的 v0.7 冻结 Product/L1 制品。历史 v0.7 发布制品保持不可变。

在正式的后继 Product/L1 Checkpoint 接受本修订前，冻结的 #1477 基线仍是唯一已冻结的 Product/L1 权威。#1480 是已记录的后继架构方向和本修订的输入，但其自身尚未成为冻结权威。下游标准不得静默地用本候选覆盖冻结基线。

如果本修订被正式接受，它只约束在研后继架构。不分配后继 SDK 版本，不定义 SDK ABI，不授权源码实施，也不授权发布或部署。

## 2. 保留的产品不变量

后继架构保留以下产品意图和外部可观察不变量：

1. Domain Intelligence 是产品目标和质量评价对象；Domain Package 是选定智能的版本化承载/物化形式，不等于智能本身。
2. Domain App 仍由 DomainHarness、Domain Definition 和 UX 组成。
3. Domain Definition 仍是抽象领域行为/Component Graph。现有 Semantic 和 Tool Component family 以及稳定 Capability 契约不被第三种 family 替代。
4. 六类 Domain Data 资产保持不变：Authority；Executable Harness；Knowledge/Reference；Pattern/Recipe；Example/Counterexample；Validation/Evidence。
5. 领域专属知识、规则、状态模型、Guard、Workflow 和解决语义归 Business Domain Package 所有，而不是归通用 Kernel 所有。
6. 保留 v0.3 Resolver 的精确优先级：确定性编译 Domain Intelligence → 精确 Semantic Result 复用 → 适用的已 Promotion 可复用子 Workflow → 有界 HarnessMachine/LLM Fallback。
7. 保留唯一的、权威的引导后 Domain Runtime/Kernel，负责状态转移、持久结果和 Effect。Agent/LLM/UX/Tool 提议不因此获得权威。
8. 保留必需未知/不兼容语义的 fail-closed 行为、明确的 Effect 准入、持久结果、Journal、Replay/Recovery 正确性，以及由 Host 控制的物理操作。

这些是行为/产品不变量，并不要求保留原 Microkernel 的源码布局或内部模块边界。

## 3. 后继入口与权威模型

后继 Domain App 的入口为 **Boot + `domain-app.yaml`**。

### 3.1 Boot — 仅负责最小 KDP 前引导

Boot 是位于 Domain Package Tree 之外的小型引导程序。其职责仅限于：

- 初始化加载 KDP Primary 所需的最小目标环境/运行环境；
- 从 `domain-app.yaml` 或生成的 Bootstrap Record 中读取引导定位信息及 KDP Primary 的精确身份/Pin；
- 在执行 KDP Primary 前验证必要的最小完整性和 Pin 信息；
- 加载 KDP Primary 并调用其唯一固定的启动入口；
- 将控制权及完整应用描述移交给 KDP Primary。

Boot **不得**解析完整 Package DAG，不得加载 SDK/Business/Extension Package，不得绑定 Package Hook，不得执行领域 Workflow，不得拥有 Domain State 或 Effect，也不得协调 Package 初始化/销毁。

### 3.2 KDP Primary — 唯一的引导后 Kernel 与 Package 权威

KDP Primary 是 Domain App 的 Kernel 层根 Package。它包含两个内部职责组，但二者不是并列 Runtime，也不是相互独立的权威。

**A. Kernel Core**

Kernel Core 拥有不可再下沉的通用引导后 Runtime 权威，包括：

- 准入所需的 Package/Runtime 身份与完整性检查；
- 执行准入和分发；
- 唯一权威 Domain Runtime 与通用状态转移机制；
- Effect 授权/准入及持久结果记录；
- Journal、Replay、中断处理和 Recovery 语义；
- Host Adapter 执行物理操作所经过的可信边界。

Kernel Core 拥有通用执行机制，但不拥有 Business 专属状态模型、事件、Guard、规则、Workflow 语义或领域决策。

**B. Package System**

KDP 所有的 Package System 负责：

- 读取完整的 `domain-app.yaml` 和生成的精确 Package Lock；
- 选择并解析声明的 Package Roots 与类型化依赖 DAG；
- 验证 Package 身份、版本、Target 和 Artifact Pin；
- 加载选定的 KDP Extension、SDK Package 和 Business Package；
- 解析并绑定声明的 Package Hook；
- 协调 Package 生命周期的初始化与销毁；
- 形成确定性的已选 Package 组合，供唯一 Domain Runtime 消费。

Package System 是 KDP Primary 的内部子系统。它**不得**创建第二个 Runtime、Scheduler、Journal、状态转移权威或 Effect 权威。Package 选择/组合不等于业务 Workflow 执行。

### 3.3 KDP Primary 独立引导

KDP Primary 必须能够独立完成引导。其初始 Kernel Core 和 Package System 启动不得依赖 SDK Primary、Business Primary、KDP Extension Package 或任何尚未加载的 Package。可选 KDP Extension 只能在 KDP Primary 建立核心权威后增加能力。

## 4. Package、Component、Hook 与 Host 边界

- **SDK Package** 提供可复用的标准 Semantic/Tool Component 和 Capability。由 KDP 加载，但不是 KDP Primary 引导的前置依赖。
- **Business Package** 拥有领域专属概念、事实、规则、状态模型、Guard、事件、Procedure、Workflow、Pipeline 和结果语义。
- **Component 与 Capability Contract** 保留既有 Product 含义。Package 可以提供或绑定实现，但 Package 成员身份本身不授予调用权限或 Effect 权限。
- **Package Hook** 仍是可选扩展契约。KDP 负责解析兼容性并绑定选定实现；Hook Owner 定义调用、顺序/并行、聚合、验证和结果选择。不引入全局 Hook Dispatcher。
- **Host Adapter** 执行物理文件系统、网络、数据库、进程和设备操作。KDP/Kernel Core 保留准入、授权和持久记录；Host Adapter 不自行授予权限，也不成为第二个 Runtime。
- **LLM/Agent/UX** 可以在有界契约内解释、提议或请求工作，但不得绕过 KDP/Kernel 准入，不得修改权威状态、授权 Effect、Promotion Intelligence 或静默替换活动 Package Pin。

## 5. 原 Microkernel 职责迁移与兼容性

对于在研后继架构，原 Microkernel **不再作为独立架构层、Package、进程、Runtime 或独立管理的子系统保留**。其通用职责按 §3 的边界重新组织到 KDP Primary 的 Kernel Core 与 Package System 内部。

后继架构**不要求兼容**原 Microkernel 的内部模块、源码布局、Package 布局、启动顺序、内部 ABI 或 Runtime 组合。这是架构开发决策，不代表可以修改历史 v0.7 发布制品。

本修订不改变公共 SDK ABI，也不授权 ABI 迁移。任何公共 ABI、Manifest/BUILD、Host、Hook、Runtime 或 SDK 源码变化都需要独立的 Product/L2 权威、精确写集、实施授权和验证。后继 SDK 版本在单独裁定前保持 UNASSIGNED。

## 6. 生命周期与权威流转

```text
Domain App Descriptor + Bootstrap Pin
  -> Boot 初始化最小环境
  -> Boot 验证并加载 KDP Primary
  -> Boot 调用固定 KDP 入口并移交 Descriptor
  -> KDP Kernel Core 建立唯一 Runtime/Kernel 权威
  -> KDP Package System 解析精确 Package DAG 并绑定 Hook
  -> 选定的 SDK 与 Business Package 对 Runtime 可用
  -> Business Workflow/Graph 经由唯一 Runtime 执行
  -> Kernel Core 准入/记录 Effect；Host Adapter 执行物理操作
  -> Terminal Outcome、Journal 和 Evidence 保持可检查/可恢复
```

Package System 选择并组合 Package；Kernel Core 授权并执行通用 Runtime 转移；Business Package 定义领域语义；Host Adapter 执行物理操作。任何层都不得重复拥有其他层的权威。

## 7. 可审查的后继架构一致性清单与采纳门禁

在本修订被接受为后继 Product/L1 权威之前：

1. 中英文修订文本必须实质等价。
2. 新的独立 Product/L1 Exact-SHA 审核必须绑定精确 commit/tree，并报告 P0=0、P1=0。
3. 正式后继 Product/L1 Checkpoint 必须记录精确源码 commit/tree、与冻结 #1477 的关系及准确的后继适用范围。
4. DIS #1481 必须在替换当前冻结 v0.7 权威表述前，绑定已接受的 Checkpoint。
5. 下表每一项都必须 PASS；审核者还必须拒绝表中列出的禁止解释，不能只确认期望术语出现。
6. Checkpoint 必须继续禁止未经授权的 SDK ABI/源码变更、发布、Tag 和部署。

| 检查项 | 后继架构必须表达 | 禁止的解释 |
|---|---|---|
| 权威继承 | 冻结的 #1477/v0.7 保持不可变；本修订仅在独立后继 Checkpoint 接受后生效 | 静默改写 v0.7，或将 #1480/本文候选视为已冻结 |
| Boot 边界 | Boot 初始化最小环境、验证 KDP Primary 精确 Pin、调用唯一固定入口并移交 Descriptor | Boot 解析 Package DAG、加载 SDK/Business Package、绑定 Hook、执行 Workflow，或拥有 State/Effect |
| Kernel Core | 唯一引导后 Kernel Core 拥有单一 Runtime、准入/分发、通用状态转移、Effect 权威、持久结果、Journal 和 Replay/Recovery | 第二个 Runtime、状态权威、Journal 或 Effect 权威 |
| Package System | KDP 所有的 Package System 解析精确 Package Root/DAG、验证 Pin/Target、加载 Package、绑定 Hook 并协调 Package 生命周期 | Package Manager 充当第二个 Runtime/Scheduler，或执行业务 Workflow 语义 |
| KDP 自举 | KDP Primary 无需 SDK、Business 或 KDP Extension Package 即可初始化 Kernel Core 与 Package System | KDP 引导依赖尚未加载的 Package |
| Host 边界 | 可信 Host Adapter 在 KDP/Kernel 准入与授权后执行物理操作 | Host 自行授权 Effect，或 Business/LLM 路径绕过 KDP |
| Business 边界 | Business Package 拥有领域专属状态模型、规则、Guard、事件、Workflow 和结果 | 将领域专属语义迁入通用 Kernel Core |
| Hook 边界 | KDP 解析并绑定声明的 Hook；Hook Owner 负责调用和结果选择 | 全局 Hook Dispatcher 或环境化 Hook 执行权威 |
| Agent/LLM/UX 边界 | Agent/LLM/UX 仅能在有界范围内解释或提议工作 | 绕过准入、修改权威状态、授权 Effect 或 Promotion/重新 Pin 智能 |
| Microkernel 后继状态 | 原 Microkernel 职责重组到 KDP 内；不要求兼容旧内部实现 | 将原 Microkernel 保留为后继架构独立必需的层、Package、进程或 Runtime |

审核者必须对中英文两个版本执行相同的十项检查。只有术语相同而权威语义不一致，仍判定失败。

在 Checkpoint 建立前，本文保持候选状态，不取代 #1477。

## 8. 明确的非目标

本修订不定义具体 ABI 形状、文件格式、启动 API 签名、Package Manifest/Lock Schema、BUILD 实现、Host Adapter 实现、迁移代码、SDK 版本分配、Runtime Adoption 证明或发布计划。这些内容应在相关权威和写集建立后进入后续 L2/实施工作。
