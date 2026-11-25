# DomainHarness · Order、Init/Exit、Workflow、最终兜底

> [权威目录](./README.md) · 新设计 **CONFIRMED**；旧 Boot Host 与动态 PackageSystem **SOURCE_REPLACED / MERGED**（PR #1694）；旧业务功能场景由 #1696 做有限等价性回归。

## LIFE-01 · Order

唯一 KDP Core.Order=0。其它 Core Order 为互不重复、非负、可不连续整数；非 Core 没有 Order。**Order 元数据是可执行代码，框架读取并排序启动**。重复、缺 KDP、非法 Order 在**生成期**拒绝，运行期不再扫描代码或静态证明结构。

## LIFE-02 · 静态选择

应用显式 `import` Core/Standard/Business 插件并定义 Core 集合；不运行时扫描插件、重建 Extension DAG 或通过 Lock/Pin 再选 Target。ESM 模块求值会运行顶层代码，**import 不等于 Init**，生成期检查意外顶层副作用。

## LIFE-03 · Init 可选

没有 Init 的 Package **空操作跳过**，不必创建空 Class 或注册占位。需要启动的 Package 提供一个约定 `Init` Class，显式调用 `start(context)` 才认为 Init 实际进入。KDP 必须拥有真正应用生命周期入口，但无需其它业务初始化。

## LIFE-04 · 顺序与直接依赖

按 Core.Order 从 KDP 开始执行各 Core；Core 在自身 start 中通过普通 TS import/引用按需要初始化自己的直接依赖，完成后进入下一 Core。Extension/Standard 不另有 Kernel 动态 Init 调用注册表；Package 自己决定重复 Init 的去重/共享。实际进入历史可以重复，退出按该历史与对象所有权处理。

## LIFE-05 · Exit

可选 `async [Symbol.asyncDispose]()` 是退出 Hook。实际进入且有 Exit 的生命周期组件在应用结束/可捕获最终异常时逆序退出，KDP 最后。单个 Exit 失败不会阻断其它清理、不会覆盖原始错误；每个受拥有的资源实例只清理一次。`await using` 不得提前释放长生命周期实例。SIGKILL/断电/不可恢复崩溃不承诺执行 Exit。

## LIFE-06 · 错误边界

业务 Element 自治处理输入、业务拒绝、预期错误、重试或降级；生成期排除已知类型/结构/依赖错误。未捕获异常由 KDP 最终兜底：可诊断、脱敏日志 → 尝试已进入组件 Exit → 向宿主报告失败或进程退出。框架不重试业务、不自动修复 Package、不在运行期做 Pin、权限与源码正确性校验。

## LIFE-07 · Standard Workflow

SDK 提供抽象 `WorkflowElement` Class 定义接口，`XStateWorkflowElement` 标准 Class 封装 XState。Workflow **定义**可为业务数据/TS 对象，Workflow **执行**由标准 Class 负责，二者分离；KDP/SDK Business/Domain App 都可直接使用该标准 Element。Workflow 不再是 KDP 独占引擎，不把所有普通函数派发到 KDP；不要求 XState 各状态单独 Element 化。

## LIFE-08 · 状态语义

AppStatus (READY/DEGRADED/BLOCKED/FAILED)、业务 FunctionOutcome (SUCCEEDED/UNKNOWN/FAILED，如确有业务合同) 与 WorkflowOutcome (COMPLETE/REJECT/ASK/WAIT/UNKNOWN/FAILED) 不互相冒充。普通 TS 函数**不强制**包装 Outcome 类型；UNKNOWN 不变成功，ASK/WAIT 不暗示持久恢复能力。

## LIFE-09 · Workflow 可靠性

作为标准组件自身功能，根 WorkflowRun 的调用预算由子运行共享、祖先深度遵守界限；Hook start/end 的进入和最终清理符合业务约定，不能先产生副作用再宣称额度不足。这些是**组件业务可靠性规则**而非 SDK 所有代码的安全沙箱或动态 Target 验证机制。

## LIFE-10 · 关闭屏障与并发 Init（R139 P1-1）

以下是**可观察的生命周期不变量**，不是指定锁算法或重新建立动态插件验证器：

1. 关闭请求生效后，立即停止接纳新的 Core.Init、嵌套直接依赖 `enter()`、业务启动和资源进入；进入 `closing`，不等于已经 `closed`。
2. 关闭完成前，已进入及在途 Init（包括同一父 Init 并行启动的直接依赖）必须正常完成、失败或**协作取消至不再获取未登记资源**。不可中止的在途 Init 未收敛时不能报告关闭完成；不强制所有场景的墙钟超时。
   同理，已启动且仍在执行的 Domain App 业务闭包必须收敛后才允许释放其使用的 Package 资源。这里等待的是业务体 Promise，不是包含 `finally → Exit` 的外层 `run()` Promise，避免形成关闭自等待；业务体不得 `await` 自己正在触发的同一轮关闭（应把主动关闭移交宿主/外层）。
3. 部分失败须保留首次主因，不启动后续 Core/业务；已进入实例按真实进入顺序和资源所有权逆序尝试 Exit。Package 仍独立决定重复 Init 的共享/去重策略。
4. 并发关闭调用共享同一轮最终结果。**在执行用户 Exit Hook 之前**，关闭状态必须对同步重入和并发请求可见；一个资源实例仅被释放一次。Hook 不得等待它自身正在执行的同一关闭操作形成自等待；组件要采用非自等待清理路径。
5. `closed` 后绝不再启动新的 Core/业务或进入资源。单个 Exit 失败记录日志并继续，不覆盖原始 Init/业务异常。

**负例 Oracle**：用 Promise 屏障暂停 A.Init，外部请求关闭后释放 A；关闭不得先报告完成，B.Init 与业务不得启动。父 Init 并行启动两个子 Init，一支失败后另一支试图进入孙组件必须被阻止；退出按实际进入逆序且一次。同步 Exit 重入及并发 dispose 不得出现 `B.exit → B.exit → A.exit → A.exit`。

## LIFE-11 · Workflow Actor 终态与错误观察（R139 P1-2/3）

Standard Workflow 必须在**执行任何用户 entry/action 和启动 Actor 前**建立同步/异步异常及终止状态的观察路径。一个已经返回 `FAILED` 的技术错误不能再作为未处理异常终止宿主；日志和 stderr 不得泄漏原始敏感异常。真正逃出业务与 Standard 的异常仍由 KDP 最终兜底。

| 真实 Actor 终态 | Standard Workflow 的结果合同 |
|---|---|
| `done`（已到 final） | **唯一允许调用业务输出 mapper** 的终态；合法 `void/undefined` 输出可以完成，但必须依据 done 而非 output 值 |
| `error`（同步或异步） | 一次性返回 `FAILED`，稳定原因 `WORKFLOW_EXECUTION_FAILED`；不得重复向宿主产生未处理异常 |
| `stopped` 或取消，尚未到 final | 一次性返回非成功 `FAILED`，稳定原因 `WORKFLOW_STOPPED`；同步与异步自停都必须结束等待，不得永久挂起或由 mapper 误报 COMPLETE |

业务主动返回的 `REJECT/ASK/WAIT/UNKNOWN` 不因 Actor done 被覆盖，UNKNOWN 不得冒充完成，ASK/WAIT 不自动提供恢复。具体 API 可支持 AbortSignal，但本版不强制所有 Workflow 的全局墙钟超时，也不限定某一种 XState 订阅接口。

**负例 Oracle**：初始 entry 同步抛带敏感标记的异常，子进程须观察受控 FAILED、宿主正常退出且 stderr 无标记；同步 self.stop 和微任务异步 self.stop 都返回 WORKFLOW_STOPPED；真正到 final 的 void 输出可成功；同步和异步 error 都只结算一次。

## LIFE-12 · v0.11.1 业务能力保留合同（R139 P1-4）

旧 [#1605](https://github.com/kaicreator-mm/domain-harness/issues/1605) F09 / AC12–AC20 的**业务行为**要在 Standard Elements/业务代码中保留，旧 FunctionRef/Lock/Pin 装配方案不恢复。

| 能力 | 必须可观察的验收 Oracle |
|---|---|
| 根预算共享 | 父 Reader/Guard、子 Workflow 共用同一根调用预算，子层不能重置；超限要在下一次 start/业务副作用之前拒绝 |
| 祖先深度 | 每个活动祖先的深度限制生效，不能只看最内层 Workflow 的配置 |
| 多资源 Reader | 真实消费者复用一个 JSON Reader 读取两份 JSON、一个 YAML Reader 读取两份 YAML，不能为各资源重复实现 |
| Hook 进入与退出 | 已进入的业务 Hook 按合同执行 `start/end`，交付终态前须等待异步 `end` 完成；`ElementRun.end` 不等于 Package `Exit` |
| Switch 和 Outcome | 具名路由必须显式处理 UNKNOWN/FAILED，不能默认回落成功；保留业务 REJECT/ASK/WAIT 路径 |
| 退出与资源 | 业务 Hook 结束不自动触发 Core/Package Exit，只有真正应用关闭/最终兜底才执行 Exit |

新原生 TypeScript 标准能力及干净安装 Domain App 必须验证上述功能，不以旧 Target/Pin/锁摘要装配细节作为验收。

## LIFE-13 · 跨版本基础扩展缝：类型、在途业务与 Outcome（R169）

以下约束来自 0.11.2–0.11.9 的前瞻性真实 API 压力测试，并且属于 0.11.1 Foundation/Task 基础层；不表示后续版本功能已实现。

1. `DomainAppContext` 只定义不可缺少的 `appId`。TS 应用可给 `KernelLifecycle<OwnContext>`、`StaticCorePackage<OwnContext>` 和 `PackageInitElement<OwnContext>` 传相同的应用自有类型；`Init.start()` 能收到该上下文。普通未显式写泛型的调用沿用简单 `DomainAppContext`。SDK 不拥有 UI 会话、授权身份、领域事实、持久化 Store 等字段，也不做业务 Context Registry。
2. `KernelLifecycle.start(context)` 只启动 Core，后续 `execute(business)` 可在同一激活中运行多个在途业务回调（业务 Task/Workflow 由调用方自己组织）；关闭前必须等待 **全部已进入的业务体** 收敛，关闭生效后拒绝任何新调用。单轮 `run(context,business)` 保持启动、一次业务、自动关闭的便捷语义。KDP 不是任务调度器，不承诺中止不可协作的业务函数。
3. `NativeWorkflowContext.invoke` 面向普通值，像 JSON/YAML Reader 的 `{kind:'SUCCEEDED'|...}` 也属于被包裹的值，不会被 SDK 改写成 Workflow Outcome。已经返回 `WorkflowOutcome` 的业务 Function 应使用 `invokeOutcome` 或 `leaf`；必须保留 REJECT/ASK/WAIT/UNKNOWN/FAILED，不能因为外层 wrapper 是 COMPLETE 就把内部失败当成成功。它们复用同一个根预算，不创建独立 Workflow Executor。
4. 后续 0.11.4 Host/Effect 的批准、确认及 Journal，0.11.5 的选定 Model/Tool Loop，0.11.6 的 durable checkpoint/取消，0.11.7 的 evidence 归各阶段的专用 Element/Package。KDP 只提供基础生命周期与最终兜底，**不内置业务授权与状态持久化**。一个正在执行的业务回调自身不能同步等待由它触发且需要等待该回调结束的同一关闭 Promise。
5. SDK 的基础 Context 传播不负责生成期 Package/Element 的正确性；具体业务/权限/生命周期依赖由 Domain Package 作者/生成者确保，并经真实 TS/SDK Consumer 正反例核验。

### LIFE-13 · R173 类型闭包补充

`PackageInitElement<Context>` 的 `start` 采用 **函数值属性类型**，使 `--strictFunctionTypes` 对所需 Context 进行逆变检查；实现者仍可使用普通 `class Init { start(ctx) {} }` 方法，不引入 Element 包装类。生成期 TypeScript 应拒绝：拥有特定字段的 Init/StaticCorePackage 被错接给 Base Context、Base Kernel 选择仅接受专有 Context 的 Core，以及 Base Extension 进入仅接受专有 Context 的 Init。仓内编译期 `@ts-expect-error` 与仓外真实 npm SDK 的 TypeScript 负例共同验证；JavaScript 仍由 Package 作者按适用类型保证正确性，SDK Runtime 不进行新的 Package 结构正确性验证。

### LIFE-13 · T30 同根剩余预算查询

`NativeWorkflowContext.remaining()` 返回新建并冻结的只读快照 `{ calls, steps, maxDescendantDepth }`。calls/steps 是当下实际共享根剩余额度（根启动、child、invoke/invokeOutcome、leaf 的既有预留已经反映）；maxDescendantDepth 是相对于当前 context 深度的所有活动祖先剩余子层限制的最小值，包括本层。查询不消耗、不预留、不增加或重置额度，不暴露内部 RootBudget。调用者可在独占当前逻辑根的连续固定专业路径前以实际剩余值完成业务前置检查；快照随其他调用消耗而过期，不能当并发 reservation、授权或全业务预算预测器。原子逐次预留与祖先拒绝仍是执行门禁，不改变 Session 单次 run、Outcome、KDP 或调用成本。归属 0.11.1 #1605 / T30 #1731，服务 0.11.3 同根组合；实际产品验收仍在后续任务。

## LIFE-14 · Standard Interaction（0.11.3 T31A 已接受）

**归属与作用域。** InteractionElement 为应用持有的一个运行期逻辑意图；一次 run 创建一个现有 StandardWorkflowSession。resolve 通过领域 decide(state,event,root) 动态给出 ready/clarify 或真实非成功 Outcome；每次分析及发布/等待分别使用同根 invokeOutcome，均为1call/1step，scope.step 仅取消检查加 invokeOutcome。一次澄清再处理的最小路径4calls/5steps；两次6/7，额外业务子层/计算另计。复杂领域仍以同一 root 组合及 remaining 业务前置门禁，不另建 Session。无关意图实例独立，无全局会话表、额外 Runtime 或重启恢复。

**语义与证据。** 结构化字段、合法选项、比较、预填来源及当前候选完整性均由领域提供。标准只校验数据形状/字段约束/选项 ID，不判断事实真实性、合法业务候选或权限。每个 prompt 带唯一意图ID、递增 revision、decisionKey；响应须匹配当前等待且仅捕获一次，错误输入不消费等待/业务预算。快照为深冻结 JSON 数据（普通记录不继承对象原型），单份 UTF-8 JSON 不超过64KiB、字段加选项≤256、节点≤4096、深度≤16；宿主另负责原始网络输入限额、身份/速率及凭据隔离，勿把秘密放入可呈现数据。不是任意 JS/Proxy 沙箱。模板可预生成，实例内容动态给出。 发布前拒绝显然无法合法提交且只声明 submit 的表单（必填空单选/多选、必填 file 且 maxLength=0）；返回 FAILED/INTERACTION_INVALID_PROMPT，不通知、不建立 pending、不扣等待额度。合法可选空字段或明确声明的 no-fit/text/revise/reject/cancel 等替代动作保留。仅检查已知结构性矛盾，不是领域可满足性求解器。记录 valid 表示尚未失效的用户表达，不等于确认/授权；no-fit、text、revise 不是批准。修改保守失效本意图旧记录；同 key 新表达替换旧有效记录；领域决定明确 invalidate 的 key。必要确认、硬政策、当前事实与真实授权由领域重新校验，不要求额外最终确认。

**等待与退出。** 先登记 resolver/pending 后同步通知；通知必须返回 undefined，捕获响应在成功通知返回后才交付。同步异常或意外返回值/thenable 失败并撤销，观察异步拒绝但不 await 通知自身的任务。cancel 撤销当前等待、发出 signal，拒绝新的 scope.step/resolve；已进入 step 等实际结果及清理完成，不覆盖 COMPLETE/UNKNOWN。resolve 是无业务 Effect 的领域分析，取消时可拒绝后续分析；实际 Effect 及恢复由业务在最新状态下协作检查。调用者必须等待全部业务调用，禁止泄漏 root/scope；如果 work 返回时仍有未汇合的 scope 操作，撤销等待并等收敛，返回 UNKNOWN/INTERACTION_UNJOINED_WORK，不能据此判定未执行。宿主停止接入、取消其活跃实例，再 await KDP dispose；原 KDP 不感知交互状态。意图确认与真实 Owner/Host 批准、grant 时效、attempt/receipt/readback 独立。已提交或不确定效果的身份及结果由领域保留，不自动重试或重开预算。

**验收。** 实际 API 与使用方式见 SDK README；原 R14 与 T31A #1733/R22 已验收，修订 L2 R25 补 B–F，受影响媒体/维修/库存、CLI+视觉、真实 SDK 新工件及独立消费者验证分别在 T32–35 完成。本条不证明产品验收或跨重启资格。

## LIFE-15 · Standard Evidence（0.11.3 T31B 候选）

`resolveEvidence<K,V>` 与 `invalidateEvidence<K>` 是可选、无状态的局部意图组织函数，不是知识库、授权判定或新 Runtime。域保有自己的 K/V、真实来源和专业规则；必须从当前实际事实/用户表达/域推导提供 observations 与 required keys、各 key 显式 accepts、当前 scope/每来源 id 的可信 revision、可选 asOf、值等价规则 equal 和可选 rank。域的其它专业适用条件须在供给证据前验证；来源类别由可信域确定，不能由外部客户端自签。仅 known 且有非 undefined 值作为值证据；false/0 合法。时间区间 [from,until)，缺 asOf 时有时效的证据不可用。来源 scope 和 revision 必须精确匹配，不跨 scope 合并，不以更新时间自动选权威。推荐仅提案，默认仅在显式 accepts 包含 default 时可确定且保留来源；authority/user 的限定不能被推荐或默认替代。

未提供 rank 时全部同级；有明确域政策才选最高有限 rank。同级已知值不等或与明确不适用冲突，不静默 last-write-wins；同级 unknown 不能得出 resolved。等价规则必须为可信域的同步等价比较（等价已知值以首项作为表示，保留同级证据）；策略异常/非法返回 POLICY_FAILED，不输出部分结果。resolved/missing/unknown/conflict/not-applicable 和非确定原因可区分；只有适用的已知默认/推荐作为 proposals，complete 表示输入集合处理完毕，不表示所有事项已确定。SDK 无法证明输入事实集合的外部完整性；域不得把截断或未验证的来源标成已知。返回数组、记录和来源元数据冻结，V 仍由域提供不可变值，不复制任意业务对象/资源；不要把私有证据对象直接发给客户端。输入为可信 TS 结构，域不得在同步计算中突变输入/Map/业务值或使用不协作策略。

`invalidateEvidence` 使用当前意图全部 key、明确 changed keys 和依赖声明，按有限拓扑传播 stale；任意变更时无声明的 key 保守失效，显式空依赖表示域已经证明无依赖。循环/未知 key/重复声明或边拒绝。域负责在事实、scope/revision 或相关选择变化后先标出全部 changed、移除 stale 证据、重新取证/推导，再调用 resolveEvidence；不自动修改外部状态、不复活 A 的失效用户记录；保留项仍需当前适用性检查。maxItems 每输入数组/来源版本 Map 上限 0..4096，maxDependencies 边总数上限 0..16384，要求调用者显式指定；超限/非法声明/策略异常 complete:false 与稳定原因 LIMIT/INVALID_EVIDENCE/INVALID_DEPENDENCY/POLICY_FAILED，无部分可用结果。B 不建立 Session、不读 I/O；在已计费分析内执行纯计算，实际取证/专业计算由业务按原 root 计费。两域薄接线和独立负例见 #1736；不构成真实专业路径、权限或最终产品资格。
