# R169 · 0.11.x 跨版本基础抽象压力审核（0.11.1 基线整改）

## 基线、责任与证据范围

- 执行 Issue：[#1700](https://github.com/kaicreator-mm/domain-harness/issues/1700)，继承已受审 #1698 / PR #1699。
- 正式基线：`version/v0.11.x@1daf160f7db0203096951a0fee948781c8036cd8`，R168 对 `d118e6ca5546f9f138c81b563744b36b088d06f7` 独立 `ACCEPT_SCOPED P0/P1/P2=0`，#3154 同 SHA SUCCESS，合并 Tree `5056a74db50f5cd6a9e3869cab49fdcf6ec29440` 与受审一致。
- 审核覆盖的后续版本：0.11.2 [#1612](https://github.com/kaicreator-mm/domain-harness/issues/1612)、0.11.3 #1613、0.11.4 #1614、0.11.5 #1615、0.11.6 #1616、0.11.7 #1617、0.11.8 #1618、0.11.9 #1619 的**当前产品范围**。这些新能力未在本次开发。
- 当前文档是架构发现与整改候选；必须待本轮改动 Exact SHA CI 和非 Writer 独立审核接受后才能标 `FOUNDATION_READY_FOR_0112`。

## 真实基础问题与整改

| ID | 级别 / 分类 | 原代码证据与可复现行为 | 0.11.1 最小修正与 Oracle |
|---|---|---|---|
| A01 | **P1 FOUNDATIONAL_BLOCKER** | `kernel-lifecycle.ts` 的 `DomainAppContext` 只有 `appId`；R167 `onInitResult` 纯 JS 可以工作，但新鲜 TS 字面量报 TS2353、typed `Init.start()` 访问报 TS2339。最小类型探针 Node22.16/TS5.8.3 重现 | `KernelLifecycle<Context>` / `StaticCorePackage<Context>` / `PackageInitElement<Context>` / `LifecycleInitContext<Context>` 同类型闭包，无侵入式全局 Context，旧不写泛型调用仍有效。SDK TS 单测与**仓外已安装 SDK 的 TypeScript 正例及 @ts-expect-error 负例** |
| A02 | **P1 FOUNDATIONAL_BLOCKER** | `KernelLifecycle.run` 是一次性业务并自动 Exit；`start` 没有公共多请求执行/在途登记；单一 `businessFlight` 无法正确表述多个业务同时使用已进入资源 | `start()` + 多个 `execute()`，关闭同步栅栏、`Set<Promise>` 所有在途等待、禁止关闭后启动；原 `run` 保留一次性便利调用。并行 2 请求、外部关闭、失败保留根因、重复关闭及原始 KDP 负例 |
| A03 | **P1 FOUNDATIONAL_SEMANTIC_RISK** | `NativeWorkflowContext.invoke` 用 `{status:'COMPLETE',value:await action()}` 包裹任意对象；如果 action 本身返回 `FAILED/REJECT/UNKNOWN`，外层成功可能被使用方误解释。盲目自动解包会误伤 JSON/YAML Reader 等普通数据 | 保留 `invoke` **只包装普通值**；新增同预算 `invokeOutcome` 显式直接保留业务 Outcome；`leaf` 仍可用于有 Hook 的业务 Function。正反例验证拒绝/UNKNOWN 不洗白、预算副作用前拒绝、普通 Reader 语义不改 |
| A04 | **VERSION_OWNED_SEAM** | 当前 SDK 无通用 wall-clock timeout、AbortSignal 注入给所有 XState action；0.11.5 LLM/Tool 与 0.11.6 Durable 恰有自己效果/暂停/取消所有权 | 现阶段只保留应用自有 AbortSignal/Host Tool 子调用的组合空间，后续用真实 Consumer 决定是否需要 Standard 层特定 cancellable adapter。**不假装 SDK 能撤销任意 JS 副作用** |
| A05 | **NO_PREMATURE_CODE / OWNERSHIP** | 0.11.2 Domain Fact/Rule、0.11.3 UI Context、0.11.4 Authorization+Journal、0.11.5 LLM Tool、0.11.6 checkpoint、0.11.7 Evidence、0.11.8 Client exact reuse、0.11.9 Meta 都需要独立业务职责 | `DomainAppContext` 类型传播与原生 Element/ESM 已足够作为边界；领域来源/效果权限/恢复/经验的**行为实现**在各自版本，生成期负责 Package/Element 正确性，SDK Runtime 不再演化为私有 Package Loader/状态总线 |

## 下游八阶段压力检验（设计 Oracle，不冒充已实现）

| 目标 | 原生可组合路径 | 本轮需要稳定的基础边界 |
|---|---|---|
| 0.11.2 Knowledge/Rule | Business 规则/Knowledge Element + Standard Reader + WorkflowOutcome | typed Context 传来源/版本；业务 UNKNOWN/REJECT 真传播 |
| 0.11.3 Semantic Interaction | 应用自有 UI TaskContext + 持续多次调用 | Context 不硬编码 UI；多次 execute 与安全关闭 |
| 0.11.4 Authorized Action | Host/业务批准 Effect + readback/Journal | 共享资源退出在效果完成之后；Outcome 不洗白，业务权限不挪到 KDP |
| 0.11.5 Bounded LLM/Tool | LLM Proposal → 已批准 Tool Outcome → Workflow Switch | 共享预算，typed Context，Outcome 终态可选择；时间/取消属 Tool Loop 实现 |
| 0.11.6 Durable | app-owned Checkpoint/任务恢复/协作取消 | 业务在途关闭屏障；SDK 不写任务数据库/新调度器 |
| 0.11.7 Evidence | 应用/业务 Element 内显式执行事件观察 | app-owned typed trace 和脱敏责任，不收集全局敏感日志 |
| 0.11.8 Client Experience | pinned Scope/Rule/Guard + 精确复用 | exact identity 和缓存资格由 Client Business Element 实现 |
| 0.11.9 Server Evolution | 经授权 evidence → 优化候选 → Forge/验证 | 不自动发布/热更新，不重新引入 BUILD/Lock/Pin 执行模型 |

## 必须避免的误抽象

`KernelLifecycle.execute` 只是被动登记一个业务 Promise；**不是 Task Scheduler、Actor Host、Tool Runtime、durable journal 或权限检查器**。Outcome-preserving API 只约定调用方已获得真实 WorkflowOutcome，不运行时验证 Package 元数据或业务 Schema。不同的 Domain Package 用原生依赖/组合复用 Standard，无 BaseElement 继承、DI 平台、Service Locator、第二 Workflow Runtime。

### 验收及停机条件

- 本轮实际更改需要 `npm run verify` / Typecheck / Lint / SDK-only clean-packed Consumer / 新原生正反例；受审和最终 merge Git Trees 必须完全一致。
- 非 Writer 审核应检查泛型 variance 及类型稳定性、并发关闭/Init/Exit、异常原始因果与错误日志、Budget/Outcome，尤其 `execute` 自关闭死锁的已记录边界；接受后方可合并当前 Train。
- 精确 Node22.12、Windows 真机 E2E、0.11.2–0.11.9 功能实现、完整 DIS Conformance 仍然 NOT_VERIFIED/NOT_IMPLEMENTED。
- 审核未通过时继续在 #1700 修复，**不得进入 0.11.2**，也不得虚报基础抽象最终冻结。
