# DomainHarness v0.11.0 — Package / BUILD / Init 架构修订（L1 · Owner 审核候选 R1）

> **状态：REVIEW_ONLY / NOT_FROZEN / NOT_IMPLEMENTED**。这是对旧 0.11.0 PRD 的拟议替换条款，不是已经通过的新 Product Freeze，也不修改现有软件。对照源码 `version/v0.11.x@b8e5c2bc6eee8615bbc9aabcdb3afd4aa2baa6b2`。
>
> Owner 讨论记录：[Package 统一 Init / 完整 BUILD / Core Order](https://github.com/kaicreator-mm/domain-harness/issues/1564#issuecomment-7056222988)、[只调用显式 Extension / Element 自治异常](https://github.com/kaicreator-mm/domain-harness/issues/1564#issuecomment-7056418761)。
>
> 本文为 WHAT；对应的 HOW 在 [L2 评审候选](../architecture/DomainHarness_v0.11.0_PACKAGE_BUILD_INIT_L2_RFC.md)，证据差异在 [Gap Matrix](../engineering/DOMAIN_HARNESS_V0110_PACKAGE_INIT_BUILD_GAP_MATRIX.md)。**批准之前不改生产代码，不撤销旧 R15 按旧合同取得的 Scoped 证据。**

## A. 整体目标与唯一模型

v0.11.x 完全重写。BUILD 负责**生成单 Package → 组合 Package → 输出完整、确定性的可独立安装/运行 Package 产物**，同时封存可执行闭包。Boot 是最小引导器，加载构建确定的 Kernel Core.Init，后续 Core/Extension 的 Init 按**构建确定的入口主链 + Package 声明的调用**运行。

- **Package** 是统一的组合与执行边界；**Element** 是 Package 内的能力/行为单元；**Init Element** 是每个可执行 Package 必须定义的初始化入口（允许无状态、空操作实现）。
- **Core/Primary 与 Extension 的能力对等**。Core 唯一特性是代表所属层的入口标识，**必须定义 Order**；Extension 的 Order 可选，不限制 Extension 调用已声明的其他 Extension，包括跨层调用。
- **Kernel、SDK、Business** 是默认的三层身份；不因 Init/Hook 创建第四层。每层的 Core 按构建封存的 Order 形成默认入口主链；Core **没有**独占 Extensions 初始化权。
- **调用边界**：Package 只能调用自己的 Element，或自己**直接声明**的 Extension Package **明确公开**的内容。A 声明 B、B 声明 C，**不自动授权 A 直接调用 C**。某 Package 恰好包含在构建闭包并不等于可任意访问。
- **初始化次数属于 Package**。规范规定必须进行哪些 Init 调用；实现如何处理重复调用（重复执行、内部幂等、按自身契约拒绝等），由目标 Package 自己决定。Kernel/SDK 不建立全局 exactly-once、visited、dedup 或跨 Package 业务回滚引擎。
- **异常归属 Element**。Element/Package 自行处理其业务错误、异常、资源与恢复。Kernel/SDK 不承诺业务异常和安全保证；对于最终未被处理、已无法继续的故障，仅做最少诊断、关闭当前执行并交给 Host 退出（不自动替 Host 执行任意全局 `process.exit`）。

## B. 0.11.0 新 Product 不变量（拟作为旧 P01/P02/P07/P08/Bxx/Kxx/Axx 的替换）

| ID | 产品规则（WHAT） |
|---|---|
| L1-P01 | 每一个选定的 Package 必须恰有一个已选的 Init Element 入口；这个 Element 与其他 Element 共享同一身份/声明模型，而不是 `technicalInit()` 特殊函数 + 唯一 `businessAppInit` 双机制。纯静态或无状态 Package 仍必须具有无操作 Init Element，不额外建技术生命周期概念。 |
| L1-P02 | 每层一个 Core/Primary 作为层级入口及多个 Extension 的组合模型保留；**Core/Extension 在显式 Extension 调用、跨层调用及 Init 能力上对等**。仅 Core 必填 Order。 |
| L1-P03 | Package 的 Extension 声明明确列出它可以调用的直接依赖 Package，且只对相应已公开的 Element/Function/Init 有效；不能调用未声明 Extension，不能借传递闭包越权。 |
| L1-P04 | 每个 Init Element 的**必需 Init 调用关系**对 BUILD 可见且有可核查的构建表达；BUILD 必须拒绝依赖缺失、实际可达调用目标未声明、不可证明的动态跨包访问及循环依赖。BUILD 产物不能保留可绕过已确定调用绑定的未约束加载通道。 |
| L1-P05 | **Core.Order 必需，Extension.Order 可选**。Core 的 Order 确定默认层级入口顺序，并且 BUILD 预先锁定；Order **不是** Package 调用权限或 Init 去重规则。Extension 可通过显式依赖在主链外递进调用，默认入口顺序不承诺所有嵌套调用的完成时间全局递增。 |
| L1-P06 | BUILD 同时覆盖 Package 的生成、引用与实现选择、闭包/依赖/导出/Hook/Init/Order 验证及组合；输出可独立部署的**完整确定性组合 Package**。Lock、Pin、Manifest 等可以成为产物内部元数据，但**只产出 Lock 不代表 BUILD 已完成**。 |
| L1-P07 | 相同、固定且合格的构建输入应产生确定性的组合产物；不需源仓库参与 RUNNING 的依赖发现、Function 替换、代码生成、重新构建或资格判定。 |
| L1-P08 | **Boot 最小化**：按完整构建产物中已封存的入口启动 Kernel Core.Init。随后沿编译确定的默认 Core 主链及各 Package Init 显式声明关系递进；不重新解算图，也不由 Kernel 集中调用 `technicalInitOrder`。 |
| L1-P09 | **Hook** 由 BUILD 确定 Owner、Provider、接口和调用绑定；Package Init 激活该 Package 的已选 Hook，Owner 在自己明示的状态/事件触发点执行。禁止启动时无条件广播所有 Provider；不把 Hook 变成独立 Runtime 或未声明的跨包访问。 |
| L1-P10 | Element/Package 承担正常业务错误处理、失败表达、清理、重复调用和资源生命周期。不能由 Kernel/SDK 将所有业务抛错自动转换为统一 FAILED、UNKNOWN 或执行全局回滚。业务结果类型如 SUCCEEDED/UNKNOWN/FAILED 仍可由**所属 Element 的合同**表达。 |
| L1-P11 | RUNNING 不做 Package 依赖授权、图/Schema 的第二轮 BUILD 期验证或修复。若实际发生未声明调用、无法装载固定绑定、未处理致命异常：最小化记录、停止当前激活、走 Host 退出流程；不重试、自动选其他 Package 或伪报成功。 |
| L1-P12 | Boot 可保留**已构建产物的必要身份、位置和字节完整性核对**；这是最低限度的装载一致性，不是重新审查业务安全/依赖。运行环境意外仍可能发生，BUILD 准入并非数学上保证永不出现物理故障。 |
| L1-P13 | 保留 Element-First、单一 SDK 公共入口、三层 Package 组织、确定性版本/Target、纯 Function 基础、真实 clean-install Consumer；不恢复 0.10.x ABI，且不把 0.11.1 Workflow/Task/Agent 偷移到本次 Stage0。 |

### Core 主链与“只调用 Extension”的一致解释（供 Owner 审核）

Core 的跨层递进是**BUILD 生成的组合 Package 顶层入口链**（不是 Kernel 自行动态选择）；这是组合机制的边，不等于某个 Core 获得任意其他 Core 的直接调用权。普通 Package 中的直接跨包调用仍只能通过自己声明的 Extension。

示意：`Boot → KernelCore.Init → [编译主链] → SDKCore.Init → [编译主链] → BusinessCore.Init`。同时 Kernel/SDK/Business 中任一 Package 可以调用自己显式声明的 Extension.Init；Extension 也可跨层声明其它 Extension。若希望 **Core A 的源码直接调用 Core B**，就必须进一步定义其合法声明方式；现阶段**不暗中为 Core 加特权例外**。

### Order 的最低可验收语义

- Core 必须声明有效 Order，BUILD 应确定一个无歧义的默认主链。建议 Core Order 在同一组合 Package 中唯一；重复/冲突应 BUILD 拒绝，不由 RUNNING 猜测。这里是**L2 候选决议，非 Owner 已冻结的字段规则**。
- Extension Order 缺省时，**不表示不可调用**，仅表示不增加自己的排序偏好；若一个调用者需要多个 Extension 的确定顺序，应显式声明调用计划而不是让 Runtime 自动发现/排序。
- 显式 Init 依赖与默认主链 Order 发生不可满足冲突时，BUILD 拒绝。无论 Order 如何，都**不得**用它强制 Init exactly-once。

## C. 产品验收（更新原 0.11.0 AC04–AC10 的相关部分）

| AC | 可观察要求 | 必须证伪的反例 |
|---|---|---|
| AC-P01 | 多个可执行 Package 各有唯一 Init Element；Core/Extension 同一入口合同；最小 Boot 真实启动 Kernel Core | 缺 Init、Init 未选、同一 Package 两个 Init → BUILD REFUSED |
| AC-P02 | Core.Order 构建时固定三层默认主链，实际逐层运行；Extension.Order 可省略 | Core 无 Order、主链冲突/循环 → BUILD REFUSED |
| AC-P03 | A 声明 B Extension，A 可调用 B 的公开 Init/Element；B 也可声明并调用 C | A 未声明 C 而直接调用 C、A 调私有 B Function → BUILD REFUSED |
| AC-P04 | 两条合法路径各自调用 C.Init，C 自己决定是否重复执行；Kernel 无通用 dedup | 依赖构成 A→B→A；未声明动态 import/逃逸调用 → BUILD REFUSED |
| AC-P05 | 单 Package 生成、多个 Package 组合，得到完整可独立安装的确定性产物 | 只有 Lock 没有真正可执行组合；构建同输入不确定；需源码树运行 → FAIL |
| AC-P06 | Hook 在已选 Init 中激活，Owner 在声明触发点实际调用已选 Provider | 未声明 Provider/越权调用、启动时无条件广播、未选 Provider 执行 → REFUSED / FAIL |
| AC-P07 | Element 自己处理业务异常，返回自身定义的业务结果/状态；系统不附加业务恢复 | 未处理异常被 Kernel 自动转为伪成功、Kernel 执行跨包统一回滚 → FAIL |
| AC-P08 | 构建合同不可满足或跨包引用缺失在 BUILD 阶段拒绝，运行时不重新解依赖图 | Runtime 发现未声明调用后静默修复/补装、改选另一 Package → FAIL；实际不可恢复故障仅记录并停止 |
| AC-P09 | 已构建的指定入口、资源摘要和最小 Boot 身份/字节核验保持可用 | 引入任意动态加载、绕开构建封存的 Boot 入口或破坏当前可信安装记录 → FAIL |

原 0.11.0 测试、R12–R15 的旧合同合格证据**只作为迁移回归基线**；新规则须有新证据，不能凭历史 CI 晋升。

## D. 明确排除 / 审核停点

- 不强迫 Package.Init 全局只执行一次；不强迫 Core 独占下一层 Init；不建立 Runtime 跨包自动图调度、全局异常恢复或 Provider 动态注册。
- 0.11.1 的 Workflow/State Machine、start/end ElementRun Hook、Task Loop、预算等仍属 0.11.1，不在本轮偷做；但它们引用 Stage0 Init 时必须兼容这个新统一模型。
- **需审核后才能冻结的细节**：完整组合 Package 的物理格式；如何限制任意 JS/TS 跨包动态导入；Core Order 同值规则；Init required calls 的机器表达与静态证明；Package 清理如何表达为自己的 Element 能力；Boot 最小完整性与业务运行校验的具体边界。
- **审批前停止**：Product/L1 本文及 L2/Gap Matrix 保持设计候选；不修改源码/测试/CI/现有旧权威 PRD，不合并此设计 PR。
