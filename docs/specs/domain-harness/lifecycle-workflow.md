# DomainHarness · 生命周期、Workflow 和结果/预算合同

> **权威**：本文件是 [DomainHarness 规范集](./README.md) 的组成模块；所有模块共同构成**一套**规范，不是独立规范版本。
> **状态**：`CONFIRMED`=已确定原则；`MIGRATION_REQUIRED`=目标明确但机器合同/源码未迁移；`CANDIDATE`=待决策。不得从规范条款推导源码或 CI 已 PASS。
> **条款编号**：保留原 R90 单文件规范的编号以便 GitHub Issue、Review 和旧链接溯源；跨文件引用以目录索引为准。

本模块区分 Package/App 状态、FunctionOutcome、WorkflowOutcome 与 Exit；0.11.1 已审 Profile 不等于未来持久恢复能力。

## 4. 生命周期和初始化顺序 — CONFIRMED

1. 一个 App 有一个唯一 KDP，其 `Core.Order=0`；每个 Core 必须有不同的非负整数 `Order`，不要求连续。重复、缺 0、KDP Order 错或无唯一 KDP 必须在 App 组合与封存前拒绝。
2. Boot 验证后**只启动一次 KDP 本身的 Init Element**。Core Init 先按自己直接声明的同层 Extension 依赖递归调用其 Init，等待本层必要工作，然后调用 App 组合与封存阶段已确定的下一个 Core.Init；Extension.Init 只能递归自己直接声明的 Extension，不驱动其它 Core。
3. **仅有一轮从上到下的 Init 链**。不得再有独立 technicalInit、Business App Init、READY 后的默认 ingress、第二轮反向 Init、重复全局 Initialize 循环。Package 想启动业务 Workflow，必须在自己的 Init Element 中按声明和选择执行。
4. 同一 Extension 可能被多个直接调用者多次 Init；**是否去重、幂等、恢复是 Package 自己的策略**，KDP 不维护一套强制全局 once 集合。
5. `Exit` 与 `InitFrom` **分别可选**。`InitFrom` 若启用，只记录实际直接调用者（包括重复、失败、激活隔离），不充当权限/去重/Exit 依据。KDP 独立记录真实 Init 进入顺序以在退出时逆序尝试已有的 Exit。
6. Exit 只于应用关闭或可捕获的全局未处理致命错误后执行，不在每一层 Init 递归返回时执行；只退出实际进入过的 Package，单个 Exit 失败不阻断其余尝试，断电/强杀不承诺执行退出。
7. 业务/功能错误由所属 Element/Package 自治处理，KDP 仅针对未处理故障提供最小但可诊断且脱敏的日志、退出和状态兜底。不额外增加一个业务逻辑重复验证 Runtime。

**KDP Host 特例**：只有 Core.Order=0 的 KDP.Init 采用 `kdp-host-init/1`，由最小 Boot 在可信安装验证后调用一次；其返回是进程内 `KdpBootstrapResult`（内含 `DomainApp`），不能冒充普通 `FunctionOutcome`。Host 已进入后由 KDP 的真实进入记录负责逆序 Exit；若 Host 实现在正常委托前抛错、委托后抛错或返回畸形对象，Boot 仅持有 KDP 提供的一次性清理交接句柄，不能另建第二运行时或重跑 Init。未验证的 Exit 一律不执行并报告不安全清理状态。

### 13.3 结果、状态与失败语义不能混淆 — CONFIRMED

| 层面 | 当前已经存在的状态/结果族 | 不变量 |
|---|---|---|
| **AppStatus / Package Init** | `READY/DEGRADED/BLOCKED/FAILED` | 只描述应用/Init 结果，不等于某个 Workflow 已完成 |
| **FunctionOutcome** | `SUCCEEDED/UNKNOWN/FAILED` | `UNKNOWN` 不冒充成功；错误不可静默归一为 `SUCCEEDED` |
| **WorkflowOutcome** | `COMPLETE/REJECT/ASK/WAIT/UNKNOWN/FAILED` | `ASK/WAIT` 仅本次有界结果，不承诺 durable Resume；与 AppStatus 相互独立 |
| **生成/封存期与 Boot** | 生成期拒绝静态不合法产物，Boot 拒绝受信安装不一致 | 各自阶段 fail-closed，不转换成业务完成或伪 READY |
| **Exit/Dispose** | 真实 Init 进入记录的逆序退出尝试 | 首个失败原因应可定位，清理失败不阻断剩余退出，不掩盖启动根因 |

- 公开状态族、错误结果与详细内部日志应分开；给出稳定可排查的 **阶段、Package/Element/FunctionRef（在适用且安全时）、错误类别和脱敏说明**。不把用户业务数据、Token、环境秘密或未经授权的 Content 直接写入日志。
- Package Function 负责自己的预期业务错误与降级策略；KDP 只做不可恢复技术失败的最小兜底和 Exit。不得在 Kernel 新建一个泛用业务补偿/重试/Outcome 重写器。

### 13.5 运行有界性与可观察性 — CONFIRMED 的当前 Workflow Profile

- 根 WorkflowRun 使用**同一份**调用预算，子 Workflow/业务 Function/start-end Hook/Reader 等真实调用须遵守已受审的预留/消费语义；每条活动祖先的深度约束都要成立。不能绕过已选 FunctionRef/Target，不能因为子 Workflow 又产生新的无限预算。
- Hook `start` 成功进入尝试后，`end` 最多一次并按最终清理规则 await；预算不足时不能先执行业务/Hook 再宣称“超过限制”。本合同来自 v0.11.1 受审 Node ESM Profile，不表示当前 SDK 已提供通用跨进程取消、持久恢复或执行环境强沙箱。
- 可靠性检查至少观察合法完成、UNKNOWN/ASK/WAIT 或其他不完成状态、未声明/未选/错误 Digest、Init 中途故障/Exit 和可复现资源边界。**可观察结果与实际拒绝不能仅靠 Mock 冒充**。
