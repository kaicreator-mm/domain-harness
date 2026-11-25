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

**等待与退出。** 先登记 resolver/pending 后同步通知；通知必须返回 undefined，捕获响应在成功通知返回后才交付。应用的通知包装须原样返回被包装回调的返回值，不得吞掉意外 Promise；同步异常或意外返回值/thenable 失败并撤销，观察异步拒绝但不 await 通知自身的任务。cancel 撤销当前等待、发出 signal，拒绝新的 scope.step/resolve；已进入 step 等实际结果及清理完成，不覆盖 COMPLETE/UNKNOWN。resolve 是无业务 Effect 的领域分析，取消时可拒绝后续分析；实际 Effect 及恢复由业务在最新状态下协作检查。调用者必须等待全部业务调用，禁止泄漏 root/scope；如果 work 返回时仍有未汇合的 scope 操作，撤销等待并等收敛，返回 UNKNOWN/INTERACTION_UNJOINED_WORK，不能据此判定未执行。宿主停止接入、取消其活跃实例，再 await KDP dispose；原 KDP 不感知交互状态。意图确认与真实 Owner/Host 批准、grant 时效、attempt/receipt/readback 独立。已提交或不确定效果的身份及结果由领域保留，不自动重试或重开预算。

**验收。** 实际 API 与使用方式见 SDK README；原 R14 与 T31A #1733/R22 已验收，修订 L2 R25 补 B–F，受影响媒体/维修/库存、CLI+视觉、真实 SDK 新工件及独立消费者验证分别在 T32–35 完成。本条不证明产品验收或跨重启资格。

## LIFE-15 · Standard Evidence（0.11.3 T31B 已接受）

`resolveEvidence<K,V>` 与 `invalidateEvidence<K>` 是可选、无状态的局部意图组织函数，不是知识库、授权判定或新 Runtime。域保有自己的 K/V、真实来源和专业规则；必须从当前实际事实/用户表达/域推导提供 observations 与 required keys、各 key 显式 accepts、当前 scope/每来源 id 的可信 revision、可选 asOf、值等价规则 equal 和可选 rank。域的其它专业适用条件须在供给证据前验证；来源类别由可信域确定，不能由外部客户端自签。仅 known 且有非 undefined 值作为值证据；false/0 合法。时间区间 [from,until)，缺 asOf 时有时效的证据不可用。来源 scope 和 revision 必须精确匹配，不跨 scope 合并，不以更新时间自动选权威。推荐仅提案，默认仅在显式 accepts 包含 default 时可确定且保留来源；authority/user 的限定不能被推荐或默认替代。

未提供 rank 时全部同级；有明确域政策才选最高有限 rank。同级已知值不等或与明确不适用冲突，不静默 last-write-wins；同级 unknown 不能得出 resolved。等价规则必须为可信域的同步等价比较（等价已知值以首项作为表示，保留同级证据）；策略异常/非法返回 POLICY_FAILED，不输出部分结果。equal/rank 必须同步；声明为 async 的策略不启动，普通函数意外返回真实 Promise 时观察其拒绝、不等待或采用结果（#1759 两项实质整改已按 R70 限定接受）。resolved/missing/unknown/conflict/not-applicable 和非确定原因可区分；只有适用的已知默认/推荐作为 proposals，complete 表示输入集合处理完毕，不表示所有事项已确定。SDK 无法证明输入事实集合的外部完整性；域不得把截断或未验证的来源标成已知。返回数组、记录和来源元数据冻结，V 仍由域提供不可变值，不复制任意业务对象/资源；不要把私有证据对象直接发给客户端。输入为可信 TS 结构，域不得在同步计算中突变输入/Map/业务值或使用不协作策略。

`invalidateEvidence` 使用当前意图全部 key、明确 changed keys 和依赖声明，按有限拓扑传播 stale；任意变更时无声明的 key 保守失效，显式空依赖表示域已经证明无依赖。循环/未知 key/重复声明或边拒绝。域负责在事实、scope/revision 或相关选择变化后先标出全部 changed、移除 stale 证据、重新取证/推导，再调用 resolveEvidence；不自动修改外部状态、不复活 A 的失效用户记录；保留项仍需当前适用性检查。maxItems 每输入数组/来源版本 Map 上限 0..4096，maxDependencies 边总数上限 0..16384，要求调用者显式指定；超限/非法声明/策略异常 complete:false 与稳定原因 LIMIT/INVALID_EVIDENCE/INVALID_DEPENDENCY/POLICY_FAILED，无部分可用结果。B 不建立 Session、不读 I/O；在已计费分析内执行纯计算，实际取证/专业计算由业务按原 root 计费。两域薄接线和独立负例见 #1736；不构成真实专业路径、权限或最终产品资格。

## LIFE-16 · Standard Decision（0.11.3 T31C 已接受）

`selectNextDecision<K>` 是有限无状态的下一决策选择函数；领域根据当前真实证据、专业规则和意图给出每个稳定 key 的 applicable/required/satisfied（yes/no/unknown/conflict）、dependsOn 与有限 priority，不强制统一 Fact/Intent 类型。每轮重评估，不自行运行领域规则、查询、工作流或 UI；必须按当前有效 B 证据及实际业务重新判断，不将默认/推荐当作必须的明确用户表达或权威事实。

只有适用且必要、依赖全部实际满足、自身明确未满足（no）的项可进入 eligible；优先选择最高 priority，同级按领域声明数组顺序。已满足项必须有已满足依赖才可供下游使用。明确不适用或非必要可跳过；跳过不等于满足，非必要项仅在适用、自身及依赖实际满足时可供下游使用。不适用时不需要求值无关必要性/满足性；适用性未知、必要性未知或必要项满足性未知/冲突不能当 no 或 ready。领域可明确将可由用户确定的问题表示为 satisfied=no，无法通过询问解决的权威未知仍保留 unknown。独立的 eligible 可先推进；没有 eligible 时按 conflict、unresolved、blocked 选择非成功状态，仅剩满足或明确跳过项时为 ready。rows 保留每项 disposition/reason、尚不可用的直接依赖 blockedBy，按领域声明顺序返回；即使跳过也可能列出不可用依赖，不表示该项仍需询问。ready 只说明本次有限声明的必要决策已满足或无需处理，不代表领域 READY、授权或未声明事项已完整。领域需提供完整当前决策集，并在选择/修订后重建适用性和证据、验证最终业务条件。

显式 maxItems 0..4096、maxDependencies 0..16384；先长度/累计边限界，再检查自有索引（拒绝稀疏/继承索引）、重复 key/边、未知依赖、非有限 priority、非法状态及全图循环（包含不适用节点）。失败 complete:false 与 LIMIT/INVALID_DECISION/INVALID_DEPENDENCY，不输出部分 rows/next。结果集合及元数据冻结；调用期间使用可信不可变 TS 数据，不承诺任意 JS 沙箱。有限迭代拓扑不是第二 DAG 执行器；纯计算可在原 root 已计费分析中执行，不建立 Session、不启动 Effect。T31C #1738 与 R25 修订 L2、两域薄接线为实施依据，T32–T34 真实领域消费已限定验收；专业 Oracle 的最终产品裁决仍待 T35。

## LIFE-17 · Standard Candidates（0.11.3 T31D 已接受）

`prepareCandidates<T>` 是同步、无状态的候选组织函数，直接复用 BoundedQueryElement 的 visit/return 限界及完整性，不生成专业候选或求解、不读数据或创建 Session。域给出当前 scope/revision、同范围同版本候选集合及来源 complete/incomplete/failed，候选使用 A 兼容 opaque ID 并关联域内不可变值。域提供可信同步 assess（eligible/excluded/unknown/failed）与 project（显示文本、有限 priority、可选推荐依据及比较单元），先判断真实硬约束，再只投影已证明合法的候选。旧源或已访问的旧候选范围/版本不匹配、重复/非法ID、访问到的稀疏或继承索引拒绝；未访问内容不宣称已验证或唯一。域需在内容/政策/范围变化时更新版本、重新生成候选及重新核验提交的当前适用性、授权和专业规则；A 的关联门禁仍有效。

来源 incomplete、查询截断（VISIT_LIMIT/RESULT_LIMIT）及任一已访问 unknown 都必须传播 incompleteReasons，只有来源与查询均完整且无 unknown 才 complete。已知合法候选存在返回 available（可不完整）；完整零合法候选为 empty，非完整零候选为 unknown；失败返回 failed/complete:false 和稳定 reason，无可用部分。excluded 及 unknown 记录已访问 ID/域给定非敏感原因，不进入 options；评估 failed/异常或无效返回整体 ASSESSMENT_FAILED，不当排除。投影失败/非法比较/异常整体 PROJECTION_FAILED。已声明 async 策略不启动，实际返回真实 Promise 观察拒绝、不等待或接受结果；可信同步回调不得修改输入或隐式执行专业操作，不承诺撤销任意 JS 副作用。

合法候选按有限 priority 降序、平手按来源顺序稳定排序；推荐标记只能由领域提供，recommended=true 必须同时提供非空 reason 依据，且完整集合才保留，不推断全局最优/唯一；不完整局部排序不等于全局结论。comparisonLabels 唯一、每个合法候选提供同数目的字符串 cells，按实际 opaque ID 生成 A comparison，支持不同约束场景的依据展示而非把不同政策视作同一最优化问题。输出 options/comparison 与内部 entries（ID 对应原域值、scope/revision）分离；不得把整个结果或域私有值直接序列化给客户端，域必须提供非敏感显示投影与原因。返回记录/数组/元数据冻结，value 由域保持不可变。maxVisited 0..4096、maxReturned 0..256，源长度≤4096，比较行≤32；显示及 scope/revision 非空文本（比较单元可空）每项≤1024 UTF8 bytes，options+comparison JSON≤64KiB，完整 A prompt 仍须遵守 LIFE-14 限制。超限 LIMIT；非法结构 INVALID_CANDIDATE；过期 STALE_SOURCE/STALE_CANDIDATE；来源 failed 为 SOURCE_FAILED。已访问候选筛选与纯组织在原分析预算内，真实候选生成/查询/解码/求解另在同根计费。T31D #1740 与 R25 修订 L2 为依据，R36 已限定验收 D；T32/33 两域已限定验收，最终产品资格仍待 T35；E 的候选表单组合见 LIFE-18。

## LIFE-18 · Standard Clarification（T31E 行为已接受；R75/I05 封装候选）

`ClarificationElement.prepare<K,E,V>` 消费当前 B EvidenceResolution、C DecisionSelection、当前决策的 A InteractionPromptSpec 去 fields 模板及显式 ClarificationField 绑定（原 A 字段、域 evidenceKey、四态 applicable、confirmation、可选安全 prefill 投影与 D 候选）。只组织当前决策，不替领域计算适用性、事实、必要性或最终意图；域从当前事实、确认要求和 B 失效重算 C，不能把待用户确认的默认值标成 C 已满足。B/C 失败返回 failed；C ready 只表示当前声明必要事项已满足/跳过，无 prompt，不是业务 READY/授权；非 next 的 unresolved/blocked/conflict 保留，不自行询问未知权威事实。next 必须匹配模板 decisionKey 与 eligible 行。每个模板绑定显式唯一字段 ID 与证据 key（包括可跳过项），当前 B 需有对应项。明确不适用字段删除，适用性未知/冲突阻断本组，B 明确不适用与当前适用字段矛盾返回 unresolved。

confirmation=accepted 时 B resolved 非选择字段可跳过；confirmation=user 时还须 B 实际选中的已知 user 证据；默认、推导、推荐不代替必须用户表达。字段 required 仍由领域 A 模板明确决定；域只绑定用户可表达的信息，不把用户回答升级为权威。选择字段模板使用空 options 且不预置 comparison，必须提供当前 D preparation 及当前 scope/revision；失败或过期拒绝，直接用 D 的 options/comparison/completeness，不复制内部 entries。已确定选择只有显式投影值仍是当前合法 ID（多选全部合法且不重复、必填非空）才可跳过，失效选项不预填。只有已确定真实证据或 NO_ACCEPTED_ORIGIN 的唯一已知提案可由可信同步 projectPrefill 显式投影，来源前缀为实际 origin，域提供非敏感显示值和来源文字；无投影不复制业务对象，不自动提交、不把预填当确认。冲突不随意选值，拒绝模板预置 prefill。必填空选择且仅 submit 返回 unresolved/NO_SUBMISSION；保留域允许的合法替代动作及 D 完整性，不能把 unknown 当 empty；C next 而无剩余字段返回 unresolved/NO_FIELDS，要求域重新评估，不制造空表单或 ready。

模板字段≤256、B/C 行≤4096；先限界再检查自有索引，拒绝重复绑定/缺失证据、异常映射。复用原 makePrompt 对完整语义内容验证、深冻结（预留 UUID/安全整数 revision 长度），不另造 schema；64KiB、字段加选项≤256、节点≤4096、深度≤16及结构不可满足门禁不变。已声明 async 投影不启动，实际 Promise 拒绝被观察、不等待，策略异常 PREFILL_FAILED；可信域数据/同步回调不得突变或执行隐式 Effect，不承诺任意 JS 沙箱。失败无部分 prompt。返回 prompt 状态与不可变 ClarificationElement 实例，内部 prompt spec 和 fieldId→evidenceKey 绑定不作为公共字段；客户端仅接收 A 发布的 prompt。实例只能由 prepare 构造。真实取证/专业计算同根另计，本函数纯组织不创建 Session、不等待。

绑定路径返回 `InteractionDecision<S,I,E>` 的 clarify/clarification，普通路径仍用 clarify/prompt，两者互斥；非法形状或非真实工厂实例在等待计费/发布前拒绝。A 捕获该次真实发布的不可变绑定，独立 occurrence 的 revision/意图/记录仍由 A 独占；不让调用者保存并重配 preparation 与 prompt。通知直接获得 (prompt, interaction)，单参兼容；同步返回检查不变。实际 submit/revise-values 由 A 在下一分析既有 root.invokeOutcome 成功预留后，使用同一绑定、实际 prompt 和最新 valid record/response identity 映射为 `InteractionEvent<E>.clarification` 的 values，保留原 action、显式 user 值；revise-text/text/no-fit 为 other，raw response 保留文本或动作；reject/cancel、通知失败或预算不足不交付映射或进入处理。绑定映射失败在下一分析内 FAILED/INTERACTION_CLARIFICATION_BINDING_FAILED，禁止域 decide；初始及普通 response 无 clarification。域不得从 plain response 重建绑定。修订失效逻辑不变，域负责重算证据、当前事实/候选合法性、专业规则与独立授权。不自动补预填、不授予权限、不重跑已进入 Effect。旧内部纯函数保留行为测试，不再从包根公开。R75 独立接受设计，I05/I06 实施及实际验收待绑定最终工件；T35 尚未收口。

## LIFE-19 · Standard Interactive Recognition / Handling（0.11.3 T31F 已接受；R48 接线修正已按 R49 验收）

`runInteractiveRecognitionHandling<S,I,O,E=string>(interaction, limits, initial, decide, handle)` 提供原生短路径：使用调用者提供的新 InteractionElement 运行一次原 A run，在同 scope 中先 resolve(initial,decide)，仅 COMPLETE 才 step 调用 handle(intent,scope)。不增加 Session、解析器、模型、Intent 基类或第二执行机制；旧 runRecognitionHandling 及低级 resolve/step/root 不变。领域在初次 decide 中解析结构化输入或确定性文本，后续根据实际 event 更新状态；优先使用 B–E 组织当前证据、关键决策、候选、必要表单，只有领域核验完成才 ready。未知/不支持的文本按领域决定明确澄清或非成功结果，不能把 ASK/WAIT/REJECT/UNKNOWN/FAILED 包装成 COMPLETE 或自动重试；非成功识别不进入 Handling，实际 Handling 返回的 Outcome 原样保留。

同根预算：root 启动 1 step，分析（含初始识别）与每次等待各 1 call/1 step，Handling 回调由 scope.step 收 1 call/1 step。因此无澄清最短 2calls/3steps/depth0，一轮 4/5/0，两轮 6/7/0。纯 B–E 在已计费分析内，独立识别、专业取证、真实业务操作、子 Workflow、Hook 及后续步骤按原 root 的 invokeOutcome/child/leaf 或 scope.step 实际增加预算；不得隐式免费或重建根。remaining 不是预留。固定专业路径的原门禁与预算表仍由领域维护。

再次澄清是领域在 handle 内明确无已提交效果的下一操作或有实际可保留 receipt 的 checkpoint 中 await 同一 scope.resolve；继续下一操作用原 scope/root，已完成处理不自动重跑。每个追加 resolve、等待、step 均照原合同计费。已进入处理返回的实际 COMPLETE/UNKNOWN 等结果不得被取消或后续澄清伪造覆盖；域须保留已进入实际操作的 receipt，处理下一操作是否可以安全继续、授权及恢复。取消阻止新 scope.resolve/step，调用者必须 await 已进入操作并在直接 root 调用前检查 signal 及业务条件；此为可信协作，不是任意 JS 事务、回滚或重放防护。终止后的真实恢复按原 .2 显式授权/只读读回合同，不自动再次 submit。T32/T33 实际专业业务与 T34 已限定验收，最终产品资格仍待 T35；#1744 是 SDK 限定实施，不能把薄意图/内存 checkpoint 测试晋升为实际 Host 或专业求解验收。

### LIFE-19A · 同一取消信号与组件封装（R48 #1750 已按 R49 验收）

`scope.resolve(initial, decide)` 和 `runInteractiveRecognitionHandling(..., decide, handle)` 的 decide 回调均接收第四个参数 `signal: AbortSignal`，它与同一 scope.signal 完全相同，不创建第二 AbortController。已有三参数回调仍合法；分析可在实际异步取证/候选生成前检查 signal，复杂处理继续使用 scope.signal。原 root 预算、等待关联、取消终态、结果所有权不变。该参数不是强制抢占或权限证明。每个跨 await 的下一相关实际业务操作开始前须重新检查；已进入操作正常 await 收敛，必要的结果验证、receipt 及清理仍须执行。未提交的媒体规划取消可丢弃不完整计划并释放 staging；已进入真实求解完成后的专业校验与已提交/可能提交的 Host 结果不得由取消错误覆盖。不要以额外 scope.step 代替信号传播导致重复计费，不把任意直接 root 回调升级成全局取消管理器。

内部 `semantic-data.ts` 只封装已在 B/C/D/E 和 A/D 复用的有界数据检查与 B/C 有限依赖拓扑次序：自有索引完整性、有限整数上限、原 opaque ID 合同、已验证局部图的稳定迭代排序。调用方继续负责输入规模/结构/依赖有效性与领域意义、错误分类、返回冻结；拓扑 helper 不执行 Workflow、无领域事实或决策规则、不保存状态，不修改传入图。原 B/C 两种算法保留各自传播与选择语义。该模块不是 SDK 公共入口；R75/I05 候选公开面为 27 运行时值/61 公开类型、仅包根（历史 R49 为28/61）；实际安装验证及最终接受待对应证据。构建工件可含内部实现文件，但不能通过包子路径导入。R49 已接受 #1750，T32/T33 真实整改与 T34 已收口；T35 最终门禁仍待裁决。

### LIFE-09 · 回调快照与借用边界（#1763）

预算预留与实际 Hook 调用须使用同一组已接纳回调；原调用者对象通过普通别名变化不得增加未计费操作，已进入的 end 清理和主终态保留。NativeWorkflowContext 是本次 Session/回调借用的能力，调用者须等待全部业务调用，不自行构造额外根、不泄漏到回调结束之后；不承诺任意可信 JS 的全局强制取消。KDP 日志失败不得阻断 Exit 或覆盖原异常；同步 sink 的意外真实 Promise 拒绝须被观察，不等待日志任务。上述两项已进入 I04 源码整改候选，正式关闭须绑定实际测试与独立审核。XState mapper 须同步、仅在 done 调用；声明 async 不执行，意外返回真实 Promise 观察拒绝并返回 FAILED，不将异步结果当成功。
