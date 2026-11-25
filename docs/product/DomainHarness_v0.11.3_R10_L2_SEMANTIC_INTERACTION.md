# DomainHarness 0.11.3 · L2 Semantic Interaction 技术合同候选

> **R23 修订候选**：R14 已冻结原 L2；[R22](https://github.com/kaicreator-mm/domain-harness/issues/1733#issuecomment-7157152801) 原 T31 执行层已验收合入（现映射 T31A），T30 已关闭。依据 Owner 要求，增补 [R23 SDK 标准能力与 Task DAG](./DomainHarness_v0.11.3_R23_L2_STANDARD_CAPABILITY_AMENDMENT.md)，只修订 HOW/任务分解，L1 不变。R23 待独审正式冻结，T31B–F/T32–35 暂未准入，所有最终产品 Oracle NOT_RUN。原 R10/R12 受审身份及历史证据保持；新 §6/7 与 R23 为修订候选，其余交互执行、预算、授权、专业业务合同保持。唯一版本入口 [#1613](https://github.com/kaicreator-mm/domain-harness/issues/1613)。

## 1. 基线与设计判断

- WHAT：[R7 Product/L1](./DomainHarness_v0.11.3_R7_PRODUCT_L1_SEMANTIC_INTERACTION.md)（blob 5c158332a617cc5864fd40188459b45ace2d6b62）；[R9 正式冻结及两个 P2 验收约束](https://github.com/kaicreator-mm/domain-harness/issues/1613#issuecomment-7145891451)。
- HOW 基线：version/v0.11.x @ 3495143db804f40e996dd83dda03ed07afbc0001；[#1724 R20 专项收尾](https://github.com/kaicreator-mm/domain-harness/issues/1724#issuecomment-7155041545)、[R19 独审](https://github.com/kaicreator-mm/domain-harness/issues/1724#issuecomment-7155007294)。实际新 SDK 0.11.2 工件 SHA256 93c1fbcc7cc92258c6dc02e7c4b8cebee9c0d29ec01ef8a9356dafd0d8d14c7d，20 公开值/33 类型；这是前阶段证据，不是本版工件。
- 读取实际 native-workflow-composition.ts（blob aedda234cf8220b384c3ec0a196abd0efe613d97）、EL-02/03/04/08、LIFE-09–13、CORE-13/14、QA-09。StandardWorkflowSession 单次 run、NativeWorkflowContext 共享根额度，invokeOutcome 保留非成功；runRecognitionHandling 是固定双叶子便捷函数，不是多轮入口。#1724 S03 实证可在同一 root async 等待，独立 execute 可继续；不重建执行器、KDP 不持有 Intent/Session Registry。
- 决策：一个逻辑意图一个应用持有的 Standard InteractionElement 实例；实际标准实现负责通用等待、关联、响应/字段校验、决策历史、修订失效、局部取消和关闭；业务提供知识、分析、候选与具体处理。普通完整业务仍可直接使用旧 API。选用原生 Promise/AbortController 和普通类型/回调，不要求每步 Actor、每字段 Element、运行时 TS 生成或 UI 框架。此为 L2 候选选择，待独审，不是 Owner 新 WHAT。

## 2. 最小标准 API 和所有权（候选原生 TS 形状）

新增一个内聚 Standard class InteractionElement，建议文件 packages/domain-harness/src/standard-interaction.ts（纯 helper 私有，可按职责拆文件但不拆包）；从同一 @kaicreator/domain-harness 根导出。下面签名是设计合同，具体泛型/命名经实现与独审细化；不承诺兼容尚未存在的 API。

```ts
// 设计伪签名，复用已有 Outcome、WorkflowLimits、NativeWorkflowContext。
class InteractionElement {
  constructor(options?: { onPrompt?: (prompt: InteractionPrompt) => void });
  run<T>(limits: WorkflowLimits,
    work: (scope: InteractionScope) => Promise<StandardWorkflowOutcome<T>>
      | StandardWorkflowOutcome<T>): Promise<StandardWorkflowOutcome<T>>;
  current(): InteractionPrompt | undefined;
  submit(response: unknown): InteractionSubmitResult;
  cancel(): void;
}
interface InteractionScope {
  readonly root: NativeWorkflowContext;
  readonly signal: AbortSignal;
  resolve<S, I>(initial: S,
    decide: (state: Readonly<S>, event: InteractionEvent,
      root: NativeWorkflowContext) =>
      StandardWorkflowOutcome<InteractionDecision<S, I>>
      | Promise<StandardWorkflowOutcome<InteractionDecision<S, I>>>):
    Promise<StandardWorkflowOutcome<I>>;
  step<T>(action: () => StandardWorkflowOutcome<T> |
    Promise<StandardWorkflowOutcome<T>>): Promise<StandardWorkflowOutcome<T>>;
}
type InteractionDecision<S, I> =
  | { kind: 'ready'; intent: I; invalidate?: readonly string[] }
  | { kind: 'clarify'; state: S; prompt: InteractionPromptSpec;
      invalidate?: readonly string[] };
```

- 一个实例一次 run；唯一 root 由内部一次创建 StandardWorkflowSession 并直接委托现有 run。调用方在 app.execute 内运行，外层以普通参数/闭包传入用户身份和权威业务服务。无 SDK 全局 map、自动调度、隐藏网络入口或强制 Context。实例与 prompt 唯一关联 ID 可使用 Node randomUUID，revision 单调递增，单一 pending；不把 ID 当用户身份/权限。构造/启动前取消后不启动业务；已终结不复用实例。应用显式拥有 handle/连接，负责把外部请求路由到对应实例并认证会话。
- resolve 是可重复调用但同一实例同时仅一个活跃澄清循环；初次可直接 ready；若 Handling 发现新意图不确定，仍在相同 scope/root 再调用 resolve（不是 resume 已结束 ASK/WAIT，也不再创建 Session）。同一作用域非法重入或过期调用拒绝，禁止把 scope/root 泄漏给已终结业务。scope.step 是取消检查加原有 invokeOutcome 的薄组合；不替代 root.child/leaf/Reader；业务实际嵌套调用必须使用传入 root，不能为每轮、每次规划另建 Session。取消与权限有不同语义。
- decide 是领域分析回调，输入 initial 或上一轮 state 与事件；分析阶段通过现有 root.invokeOutcome 计费，允许使用同一 root 调用实际 Query/CLI/专业计算；只返回 ready/clarify 或真实非成功 Outcome，不能把 UNKNOWN 机械改 ASK。READY 的 intent 是领域自己的 TS 类型；所有硬约束及事实时效由领域校验。SDK 不自行推断专业意图、定义业务排序政策、替业务确定事实或创建强制通用 Fact/Goal ABI；R23 增补可选的标准信息组织、依据域提供的必要性/优先级和依赖选择决策、候选处理及动态表单组织。领域 decide 保持原低级原生入口，优先复用已实际交付的共同机制。
- 状态在 resolve 内随成功分析结果保存；业务生成者负责不修改传入 state/旧权威对象并返回新状态。SDK 所有可外部见到的 prompt、response 和内部交互记录使用受支持的 JSON 值快照、防止可变引用污染；不深复制任意领域对象/资源。领域私有状态可保留已知事实、依赖和专业对象，不能把旧版本选择当现行确认。无通用事实图、规则引擎或全量知识容器。
- 不提供强制 SDK 级注册中心或通用 Intent 父类；复杂业务可原生组合现有 SDK 与 InteractionElement，短默认路径由标准实现完成，而非要求生成者重写 Promise Gate/关联/重复校验。

公开入口验收：基线 20 个公开运行时值/33 个独立公开类型保持；T30 仅增加实际需要的只读余额返回形状（优先内联类型，不增加运行时值）。T31 候选新增运行时值 InteractionElement；公共签名需要 InteractionScope、InteractionDecision、InteractionPrompt、InteractionPromptSpec、InteractionEvent、InteractionSubmitResult，及调用方确需直接命名的语义字段/候选/已接受响应/有效记录类型（候选 InteractionField、InteractionCandidate、InteractionResponse、InteractionRecord）。能内联而不妨碍正常消费的类型不强制导出；辅助 resolver、内部状态、校验器、预算对象及私有 helper 不导出。T31 在独立 expected 集合冻结准确公开名称及泛型/负例，T35 仓外真实安装的根运行时值、声明类型和 README/Skill 与该集合一致；不以从被测包自动生成预期名单证明自己。此处为候选公开面，不宣称 0.11.3 API 已存在。

## 3. 语义交互、候选与确认

InteractionPromptSpec 为可序列化的语义数据，不是可执行代码、HTML 或 UI 框架。最小字段：decisionKey（当前领域关键决策的稳定标识）、title、说明、fields、可选候选组及其依据/适用范围/完整性（complete 与 incomplete 明确）、可选比较行与推荐/预填、允许的动作。字段支持 string/text、finite number、boolean、single choice；按真实需求支持 multi-choice 和 file reference（不读取/上传文件、不承诺路径可信；领域重新验证）。字段有稳定 ID、label、required、类型约束（长度、数值范围、可选项）；不提供任意正则/表达式执行、任意 JSON Schema 引擎。候选 value 使用短 opaque option ID，由业务在当前版本映射到领域对象；客户端不上传权威事实、可执行函数、授权或任意替代业务对象。推荐和预填标记来源且不是已确认输入。无候选/截断/不适用/UNKNOWN 的业务语义不可隐藏，no-fit 是有效用户动作而非伪造候选。

InteractionPrompt = SDK 分配的 intentId + revision + decisionKey + spec 的不可变快照。InteractionEvent 为 initial 或已校验的本轮用户动作：submit（字段/选择）、revise（修改目标或先前有效选择，携带允许的结构化值或文本）、text（当前表单无法表达时的文本输入）、no-fit、reject；cancel 也可由应用直接调用。客户端 submit 提交 intentId/revision/decisionKey/action/values，不允许额外字段、无效选项、未知 action、错误类型、非有限数值或超出声明约束；仅当前 prompt 明示支持的 action 合法。拒绝/取消不触发业务处理。允许领域表单模板在代码中预制，运行期根据状态/数据生成实际字段/候选；无需生成或执行 TS 代码。

通用记录：SDK 保存被接受的 decisionKey/revision/action/values 与已失效标记，向 decide 提供当前事件及只读有效决策记录（InteractionEvent 可携带此快照；不暴露原始凭据）。明确提交的有效字段和选择是用户表达证据；只有领域分析返回 READY 并校验必要关键决策后才认定意图确定，不追加无价值最终确认。用户明确输入/已选合法方案可直接继续。推荐/默认/推导/权威事实由业务区分来源、适用范围和版本，未经用户确认的重大推断不能因预填变成选择。revise 接受后保守失效本意图此前有效确认及当前候选，保留历史和可重新验证的事实；领域根据新 state 重新分析，能证明未受影响的信息可重用，但不能把已失效记录直接升级为新确认。普通下一轮接受不自动清除有效记录；领域发现 scope/事实版本变化时通过分析结果 invalidate（decisionKey 列表）明确使受影响的有效记录失效，SDK 在发布下一 prompt/返回 READY 前原子应用，不能用 READY 盖过失效的必要确认；是否已重新满足必要确认仍由领域决定。允许保守失效全部；新 resolve 可读同一意图有效记录但不得复用旧 pending。revise 仅接受当前 prompt 明示的修改目标及受限值或文本，不能直接 patch 领域私有 state。旧版本禁止进入 Handling。先前已生效外部操作不回滚。业务硬约束、用户身份与授权独立于这些记录。

交互数据校验是对外部输入/当前业务参数的校验，不是 SDK Runtime 重新证明 Package/Element 正确性。对 prompt 定义错误、重复字段/option ID、非法约束、不可序列化数据等返回稳定脱敏 FAILED，不允许静默发布坏 prompt。T31 明确可观察有限输入大小（建议 64 KiB JSON、字段/候选总数 256，业务若需要更大数据用有界引用/分页；最终值以两域及客户端实际需要验证）。不添加通用大型数据处理协议。

## 4. 活跃等待、结算、预算和关闭

状态属于每个实例：未运行 → running → waiting（当前唯一 prompt）→ running → terminal；取消请求为同步单调标记，并触发当前 wait 的协作结算。状态转换与响应校验/消耗在同一 JS 同步段，不跨 await；为响应建好 resolver 和 pending 后才发布/通知，支持同步回调提交，不发生丢唤醒。submit 返回 transport ack（accepted 或稳定拒绝码，例如 NO_PENDING/STALE_RESPONSE/WRONG_INTENT/INVALID_RESPONSE/ALREADY_SETTLED），accepted 仅表示合法响应被本轮捕获，非业务 COMPLETE/授权。错误输入不消费 pending、可更正；有效响应只消费一次，清除/失效当前 prompt 后唤醒；重复、迟到、跨意图、错误 decisionKey/revision、终结后响应不能进入业务 callback。“过期”在通用机制中指 pending 已消耗、撤销、替换或终结，不是权威事实或批准的有效期；业务进入实际处理/Host 前仍须独立核对当前事实、scope、版本和 grant expiry/revocation。无全局墙钟期限；确有领域期限时由业务撤销当前 pending 并协作结算，不能仅靠 revision 判定所有时效。onPrompt 是应用内同步通知（不承担业务或认证，不能等待自身 run）；可同时通过 current 获取快照。TS void 回调允许意外 async 函数，因此实现须实际观察返回值：合法返回 undefined；意外 thenable 立即挂接拒绝观察而不等待其完成，标记稳定脱敏 FAILED 并撤销 pending；同步抛错、then getter 异常或非法返回值同样失败。不得因先同步 submit 再抛错/返回 thenable 而进入业务；在通知成功返回前暂不向 resolve 交付已捕获响应，通知失败优先。后续异步通知拒绝不得成为未处理异常，终态后提交仍拒绝；不承诺抢占通知自身的任意副作用。T31 独立测试同步提交成功、提交后抛错、async reject、等待自身 run 的 thenable（不形成死锁）、过期响应及真实授权时效分别处理。

预算明确：root run 固有 1 step；每次 decide 经 root.invokeOutcome 预留 1 call+1 step；每次真正发布/等待经同一 root.invokeOutcome 预留 1 call+1 step，先预留后发布；合法响应只捕获，下一次 decide 预留成功才应用业务状态/结果（revise 可立即使旧证据失效，但不得无预算执行专业操作）。无效输入不调用业务、不产生新 prompt、不消耗业务调用预算；宿主负责传输速率/连接资源。每个后续专业调用/授权/Effect 必须按现有 invokeOutcome/child/leaf 真实计费；不将所有业务操作塞进一个 unmetered callback。无重置、无负余额；例：一次澄清+再次分析+一个处理 step 的最小成功路径为 4 calls/5 steps/depth0（不含领域额外 child/Hook/Reader）。两次澄清对应 6 calls/7 steps；不足时拒绝后续回调，未发生可见 Effect。若业务要求全阶段先验预算（QUAL-05），仍由领域保留真实前置检查，不创建全局预测器。具体媒体/排程的实际 budget 表在 T32/T33 根据真实调用数冻结，单次独立旧入口的预算合同保持。**真实基础缝**：当前 NativeWorkflowContext 只有 invoke/invokeOutcome/child/leaf，没有公开剩余额度。Workshop 原 run 在 Session 前检查 4 calls/8 steps/depth2；拆出同根执行体后，实际完整专业路径需要剩余 4 calls/7 steps/2 层（根 1 step 已消耗）。Archive 完整两件路径为剩余 19 calls/23 steps/2 层（旧独立 root 总 24 steps），不把清理因额度不足而省略。必须基于真实共享余额而非初始 limits 或另写预算镜像。L2 建议在 .1 归属增加最小只读 `NativeWorkflowContext.remaining()` 快照：calls、steps、maxDescendantDepth（所有活动祖先的剩余深度取最小值）；返回新不可变值，不泄露 RootBudget，不预留/增加/复制额度，不新增执行器。该真实复用缝由 T30 独立验证和归属修正；若独审找到已有等价公开机制则不改。固定专业路径在独占当前意图根的连续业务阶段先检查真实快照，再由原子逐次预留执行；不能将 snapshot 当并发 reservation 或越权；有同根并行竞争时依然依靠原有每调用拒绝，不宣称全路径已预留。示例新路径以剩余门禁测试专业求解器/实际 Effect 未进入，独立 B/C 继续。

取消：cancel 同步置位、abort signal、撤销 pending 并唤醒等待返回 REJECT/CANCELLED；run/resolve 在进入/返回每次分析与等待时检查取消及当前有效性，scope.step 在开始下一业务调用前拒绝已取消。不得 Promise.race 后丢弃仍在运行的业务/Hook/资源；已进入的实际动作按 .2 完整 readback/UNKNOWN/receipt 语义收敛并保留真实结果，不能以取消覆盖已提交或不确定结果。调用方对复杂直接 root 调用按显式 signal/checkpoint 在下一业务操作前协作检查、特别是实际 Effect 前；SDK 不强制抢占可信任意回调，不能保证终止不可协作函数。真实动作要在最后一次 scope/版本/授权检查之后进入，取消和校验到开始之间不可插入额外 await 而不再检查。取消后不启动新的相关操作；仅等待/分析未产生效果时返回取消终态，不宣称回滚。
应用关闭：宿主先停止接收/创建意图，逐一 cancel 自己持有的活跃实例，然后调用 KDP asyncDispose 等待全部在途 execute 和既有资源 Hook 收敛，最后清理连接/资源；不能由业务 await 自己的关闭。独立 B/C 不共享 A 的 signal、state、budget；显式依赖用正常 Promise/Outcome，依赖 A 非成功时按业务规则停关联分支。共享资源冲突由实际业务 owner 检查。无自动全局调度器；应用重启本版内存交互丢失，旧响应无有效实例，.6 再处理 durable。

## 5. 两个真实领域的技术接线

已有 archive.ts blob dfd7b1c...、workshop/plan.ts dad50d9...、media client.ts e918a0e...、现有 verify/oracle 均保留。现有 ArchiveElement.plan(inputs, limits) 和 WorkshopElement.run(tasks, limits) 各自创建 Session，直接在新 root 内调用会重置预算；T32/T33 应将真实执行体抽为各自业务方法接受已有 NativeWorkflowContext（例如 planIn(root, inputs)、runIn(root,tasks)），旧入口用原 Session 委托同一执行体，保留旧调用预算与前置条件。不能用新 SDK 的薄 callback 包裹另一个 session 假称同根；真实复用，不复制专业算法。实际 media-archive/client.ts（e918a0e4540c8b5410e1d747a977a2c8ee6a022b）register/readback 共用 private request，而 request 内固定新 Session(1call/2steps/depth0)。T32 同时将其真实 fetch/receipt 校验抽成同一个无 Session 的私有执行体，新增 registerIn(root, tenant, asset) / readbackIn(root, tenant, asset) 或等价原生方法，直接用现有 root.invokeOutcome 计费；旧 register/readback 用旧 1/2/0 Session 委托这些入口，保持独立用法。每次实际 Host 请求增量 1call/1step，不额外套 scope.step 或再开根；同一次有效操作对应一次计费，所有授权和恢复调用亦不得绕过。保留真实 HTTP、receipt 校验、scope/内容检查及错误映射，不复制逻辑、不改 Host 权限体系。进入每个新请求前按同一 signal/当前 revision/业务证据做协作检查，最终 Host 仍独立验证。

Media：原 ArchiveElement 要求恰好两件合法媒体（不强制一图一视频），拒绝重复内容；归档登记按实际单 asset/tenant，不声称批量登记原子性。初始支持明确文件引用和归档目标/范围的结构化请求，及一个有限自然语言输入如“归档选中的照片和视频”（确定文件仍由应用提供；未知路径/目标 ASK，不从文本任意执行）。先用现有真实文件/元数据及 Owner manifest 取证，自动获取尺寸/时长/Hash；候选只来自当前实际可用文件和合法授权前置 scope，不把另一租户或无权范围列为可执行推荐。可用候选不等于已批准；当前 manifest 只声明一个 tenant/asset/token，不能虚构同时可批准的多目标清单。采用当前受信的文件列表/目标事实形成合法输入选择，动态选择仅缺文件/范围的关键字段；完整输入直接计划。根据真实结果给出原件与派生副本提案，必要修改使前计划确认失效、废弃 staging 按真实 dispose 释放；不得用旧资产/Hash/政策版本提交。调用同根 RegistrationElement.registerIn/readbackIn 与原真实 HTTP Host、Owner manifest、实际 SQLite 与文件 readback；明确提交意图不写 approved=true。Owner 独立批准、token/tenant/content/revision 重查，拒绝/歧义/错误或缺批准在可见记录前失败；当前 media host.ts 只校验 token/tenant/hash/revision/derivative 及 approved，不声称支持 grant expiry、PER_CALL/SESSION 或库存 attempt 协议。T32 真实媒体验收见下方表；通过转发至实际 Host 后丢弃 ACK 的有限代理反例（非 mock Host），核对实际目录、SQLite、原 tenant/hash/derivative/revision 的独立 readback；不以目录存在等同登记成功。原 8MiB/10s/320 约束及完整 decode/独立副本 oracle 不变。工具矩阵只承诺实际 FFmpeg7.1.5 Linux、9.0.1 Windows 等已见证范围，5.1.9 原失败另归 #1720，不把 .3 当其修复。

Workshop：真实两订单六工序、机器/日历/precedence、明确 policy revision/horizon/closed；由领域事实源取得已有任务和已知停机，而非询问已知事实或让用户覆盖硬日历。关键未知是当前排程请求适用的工单/政策事实或用户允许的目标选择，优先合法候选及说明；例如选择要评估的**已适用的**日历情形，展示正常与停机是不同约束下的场景，不能把 7 与 10 当同一条件的两种可任选结果，未知实际停机不得默认为正常。缺工序/前置事实 ASK/UNKNOWN，非法/循环/不可行分别保持业务原语义。用户修订引起真实重新求解；CLI 调用原 SciPy solver 和独立 TS 穷举/约束验证；无虚构 dispatch/publish。已有 4calls/8steps/depth2 旧入口 preflight 按实际子组合保留；新入口必须证明已消耗交互预算后专业路径完整/不足的真实门禁，不另开 root。两领域分别安装依赖，复用同一实际 Standard Interaction 实现；不用共享领域专用代码伪造复用。

可观察分支示例（具体 fixture 由 T32/T33 冻结，不能把以下当已运行结果）：媒体当前选择集含三个合法可选文件、已选一件且 owner scope 已知，则仅补第二件，不问可由文件取得的尺寸/时长，不要求重新选择已知 scope；改为另一可用文件会使旧配对/Hash/派生计划失效，并重新生成提案。选择已确定完整的两件时直接计划；未知或不合法 scope 先阻断或澄清，不推荐越权目标；需要独立批准时由真实 Host 验证，不生成用户无权选择的批准按钮。维修部分请求先选择当前日历求解或业务允许的明确 what-if 场景（不是更改权威停机事实）；当前日历已知且请求明确时跳过场景选择；what-if 需要指定适用日历条件时动态出现限定候选/比较字段；如果用户改选当前日历则删除该字段/失效旧方案。实际展示 policy revision、专业可行性与 makespan；当前真实政策不可得时 UNKNOWN 或明确补事实，不能用推测填充。保留规划-only，必要时允许 no-fit/text/取消。用固定逐项确认基线与同一业务 oracle 比较问题数，而非强制两个域表现完全相同。

客户端：CLI 使用实际 readline/输入输出，结构化视觉采用最小真实 HTML Form/Selector/Comparison 客户端实例（原生 DOM、必要本地 loopback adapter；不作为 SDK UI runtime），在同一语义 prompt 下渲染字段/候选、发送响应并显示实际结果。适配只呈现与传输，不决定业务事实、授权或 KDP；明确不支持的能力可等价文本输入或声明不支持，不把隐藏字段当批准。T34 必须实际操作视觉实例验证用户交互（非仅 JSON、截图/静态 HTML 或 mock）；若当前环境无法执行浏览器，诚实记录并有限真实验收。仅验收一种视觉适配+CLI，不要求生产 Web/移动 UI 或新增 SDK 外部依赖。

### 5.1 T32 完整预算与真实登记/恢复

以下是同根明确计费的最小代表路径账本，不是固定全域额度或事先冻结所有输入分支；T32 以实际新增代码及调用表确认每一阶段，包括额外事实读取、提案重算、必要 Hook 与读回。无免费专业调用，异步资源释放必须收敛。

| 阶段 | calls | steps | 说明 |
|---|---:|---:|---|
| 根一次启动 | 0 | 1 | 一个 logical root |
| 一次澄清：初次 decide / wait / 回复后 decide | 3 | 3 | 两次分析加一次真实等待 |
| 两件媒体完整规划 | 19 | 23 | 复用 planIn，depth2；不是登记或读回 |
| 每件实际授权登记 | 1 | 1 | registerIn；Owner 独立批准，不由用户表达写入 |
| 每件相关独立读回 | 1 | 1 | readbackIn；实际请求，仅同一授权身份/资产 |
| 两件各登记并读回的上述路径合计 | 26 | 31 | 3+19+2+2 calls，1+3+23+2+2 steps；depth2，额外业务调用另计 |

完整一件登记+读回的代表路径为 24 calls/29 steps/depth2（仍规划两件，不代表批量登记）。实际媒体在第二件登记前需独立 Owner 对该 asset 的批准；若未获批准则不执行该 Effect。T32 以真实请求计数和 DB/文件观察验证：规划/交互后恰好剩余可执行一次登记时可完成该请求；剩余 calls=0 或 steps=0 时不得调用 Host、不得出现新增可见记录；分别对相关 readback exact/差一检查请求次数。在实际登记前对要求的完整固定操作组用 remaining 快照做业务前置检查，不保证快照并发预留。允许仅单件流程；不要为展示数字强制登记两件。若需额外确认/Host 检查，增加实际预算并给出精确边界。无关 B/C 仍正常推进。候选歧义、过期 revision、跨 tenant 或篡改资产须在可见动作前实际拒绝，错误意图不能变成已批准。
 
已进入 register 请求必须等真实返回/收敛；取消或随后额度不足不能擦除 COMPLETE receipt 或 UNKNOWN（也不能把已知成功的 effect 改成 FAILED/CANCELLED）。领域调用方在每件实际动作后保留独立绑定的结果及必要恢复身份，若后续未开始则另记未执行/额度不足/取消；不得用一个批次成功或失败掩盖先前部分效果，不承诺批量原子性。登记 UNKNOWN 或已知成功但无法立即读回时保留已观察事实、读回未执行及原因；不以不足的预算伪造 readback 或重建 Session。若当前根仍允许且未取消，可按原身份同根只读恢复；若根已终结或无额度/取消，只能由宿主后来显式发起独立、经过认证及授权的恢复业务请求，以原 tenant/asset 内容绑定进行 readback，分离新恢复的预算与旧尝试证据；禁止在原意图内部自动重开预算或重发登记。原域已有受权匹配重提交能力不意味着本路径自动重试。staging 的所有权/释放遵既有 dispose 与在途业务收敛，不因预算耗尽跳过清理。

### 5.2 T34 有限真实库存授权见证（SI-L1-10 第二部分）

复用现有 native-domain-app/action 的真实 InventoryAuthority、ReservationElement、HTTP Host、SQLite 客户端 attempt 账本、verify.ts 的 fixture/proxy（authority.ts 45429bd5d490ddde0b9397ffbeeeb335dd817771；client.ts ac5a9acd97b94515271270672e9fa67e4b9fc661；verify.ts e768d228cea06555f0614176523b0cc87a4e9e2e）。T34 唯一负责此限定增量见证，作为 Reference 累计受影响路径，T35 复用并在新 packed SDK 上执行；不新增第三完整领域应用、权限模型或 DAG 节点。媒体的布尔批准与库存真实 PREAUTHORIZED/PER_CALL/SESSION 明确分开。
 
现有 ReservationElement.run 通过 runRecognitionHandling 自建 root。T34 将同一 mode 校验/commandOf 识别和 #dispatch（独立 attempt、实际 submit/readback、receipt 保存）抽成共用业务执行体：旧 run 仍使用原固定组合；新增 runIn(root,input,mode) 或等价原生同根入口，用既有 root.child(0)/invokeOutcome 分别识别及处理，复用相同两个业务回调，完整路径增量 2calls/4steps/depth1（不另计已运行 root 的 1step，不双层 wrapper）。若从已完成识别的 intent 直接处理，明确共用处理回调及真实增量，不省略命令/mode 校验或重复识别冒充必要确认。每次新 submit/recover 在实际处理开始前核对 signal/current revision，进入 dispatch 后保留完整 attempt → request → receipt 收敛；后续取消不允许再 submit。保留 FIRST_SUBMIT/RECOVER 显式模式、原 id/digest/grant/version、账本丢失也只读恢复；同一命令不能因换表单/预算重置变成新的提交。
 
具体真实交互见证（使用现有 owner 控制 fixture 创建/撤销 grant，不让交互客户端改权限）：
- PER_CALL：在真实 pending 发布前由 Owner 提供匹配 payload 的 grant，等待期间独立撤销（确定性 gate，另可用实际过期 fixture），用户提交合法意图后尝试原命令，实际 Host 返回 APPROVAL_DENIED，owner.inspect 的 stock/version/effects 不变、grant 未绑定。另一独立 fixture 在等待中修改 quantity 或版本/目标导致旧批准 digest/scope 不适用，原确认失效；若业务先拒绝，代理 submit=0；若向 Host 验证旧 grant，真实拒绝且零 Effect。禁止修改 Owner grant 或自动换新命令掩盖结果。既有 expiry（expires<=Date.now()）和 scope/version 反例仍执行受影响回归。
- SESSION：在实际等待中撤销 SESSION grant 或缩小授权的独立场景，回复后原 grant 不再有效，实际 Host 拒绝；同 session 合法范围/额度、跨 scope、版本 CAS 等既有真实回归保留。用户确认不是授予 SESSION。
- PREAUTHORIZED：真实等待后明确选择，按已授权资源执行，不额外要求批准、grant=null；实际 receipt 绑定原 id/digest/version/remaining，owner.inspect 确认恰好一次扣减、effects=1，客户端账本保存 receipt。完整有效输入零 prompt；合法意图确认不改变授权策略。
- 丢 ACK/取消：复用 verify.ts proxy dropSubmit:'after'，在真正 Host 提交返回后、代理丢 ACK 前的 gate 请求取消；客户端必须等 #dispatch 返回 UNKNOWN 并保留 attempt，owner.inspect 已实际扣减一次，不能返回 CANCELLED/未执行。代理实际 submit=1。若原根不足或已取消，不启动同根后续读回；后续显式授权恢复业务用同 id/digest 和 RECOVER，只走 readback、返回原 receipt；无第二 submit，stock/version/effects 不再变化。另测在提交前取消/额度不足、或旧响应错配，submit/readback 计数为0且 owner.inspect 无变化。不可假定初次请求超时即未执行。
 
T34 保留同根预算的 exact/差一及在途处理清理 gate；必要的完整处理前置按真实 remaining，旧两角色 standalone 预算不变。T35 验收需实际读取 Host 请求计数、owner.inspect、grant bound、客户端 attempt/receipt 和原命令读回；保留原 T06 全部适用正反例，不以表单状态/模拟批准/独立旧回归替代上述跨等待实证。

## 6. L1 全量追踪与可判别 Oracle（R23 更新 SDK 实施归属）

原验收行为不变；新增 B–F 的具体 Standard 交付及功能覆盖门禁见 [R23 §2–6](./DomainHarness_v0.11.3_R23_L2_STANDARD_CAPABILITY_AMENDMENT.md)。表中 A–F 均为 T31 子任务。

| Oracle | 实际验收 / 负对照 | 实施归属 |
|---|---|---|
| SI-L1-01 | 真实完整请求零 prompt；明确选择后直接 Handling；媒体未独立批准无可见写入、库存合法 PREAUTHORIZED 不重复批准 | T31A/B/C/E/F、T32/33/34 |
| SI-L1-02 | 两域由业务知识生成关键决策、预填/候选，一次选择确定多项；前置选择改变后续字段并跳过无关步骤；固定逐项确认基线记录必要/重复/推导/跳过计数（不降低必要决策） | T31B/C/D/E、T32/33 |
| SI-L1-03 | 权威/用户/推荐/默认/推导/未知及冲突的实际路径；超限/非法/无合法候选不能 READY；未知事实不得凭 UI 默认确认 | T31A/B/C/D/E、T32/33 |
| SI-L1-04 | 修订使旧 prompt、候选、确认/计划失效；同 revision 重放、旧 revision、no-fit/拒绝、修订后实际重算；合法新输入可继续 | T31A/B/C/D/E/F、T32/33 |
| SI-L1-05 | 真实 Sharp/FFmpeg/ffprobe 源和派生 decode/Hash、真实 SciPy 和独立穷举/日历约束；修改适用政策重算，保留旧业务负例 | T32/33（真实专业路径，复用 B–F） |
| SI-L1-06 | 真实合法候选/依据/比较，incomplete/UNKNOWN/不可行/技术失败不冒称 COMPLETE；歧义候选实际拒绝在 Host 可见记录前 | T31B/C/D/E、T32/33 |
| SI-L1-07 | CLI 与视觉真实操作同一业务路径、同等语义；模板/动态字段、选项、类型约束、文件引用和不支持/降级 | T31A/E/F、T34 |
| SI-L1-08 | 两域确定性文本识别正例和未支持/歧义/不可信文本反例，进入结构化澄清或拒绝；实际无 LLM | T31F、T32/33/34 |
| SI-L1-09A | 连续至少两轮，同 root 等待前已消费、回复后恰好耗尽/调用和步骤不足，实际登记/读回及库存 submit/recover 请求计数和可见 Effect 验证；重放/迟到/错配/取消/拒绝、同步响应、异常通知、异步清理 gate；已进入的事实/UNKNOWN 不被后续额度或取消覆盖 | T31A/F、T32/34 |
| SI-L1-09B | 同一实际 KDP 激活 A 等待、B/C 在真实重叠时间推进，A 恢复/修订/取消，跨 ID 拒绝；依赖 A 的分支保留非成功、无关预算/状态不变；close 先撤 wait 后等全部业务/Hook，拒绝新 run | T31A/F、T34 |
| SI-L1-10 | T32 媒体真实 Owner/token/tenant/content/revision/批准、丢 ACK 与资产 readback；T34 现有库存真实跨等待撤销/过期或变更的 PER_CALL/SESSION、PREAUTHORIZED、version/attempt/receipt/RECOVER、已提交丢 ACK 与取消；真实请求计数和 Effect/账本不变或精确变化，T35 新包组合证据 | T31F、T32/34/35 |
| SI-L1-11 | 两真实域从同一新 packed SDK 根 import 新实现，独立依赖闭包；不复制等待/关联/校验/失效代码，不新增中央 Runtime | T31A–F、T32/33/35 |
| SI-L1-12 | 独立生成者实际从安装 README/公开类型/Skill/规范发现能力，生成新小业务并局部维护，真实独立 Oracle 覆盖配置/负对照、原版本保留、两平台适用范围；原始结果独立目录留存，不冒称盲或因果效率 | T31A–F、T35 |

继承 R9 两 P2 具体 Oracle；[R65](https://github.com/kaicreator-mm/domain-harness/issues/1612#issuecomment-7141533062)、[R73](https://github.com/kaicreator-mm/domain-harness/issues/1720#issuecomment-7143329514)、[R74](https://github.com/kaicreator-mm/domain-harness/issues/1720#issuecomment-7143625830) 与 #1724 R17/R19 是前阶段证据，不是 .3 PASS。继承 Roadmap R82/R84 **同一 Reference Domain App** 的现行原生后继 examples/native-domain-app/main.mjs、历史累计证据与原 test:consumer 门禁；两个专业域不能替代受影响 Reference 真实回归。新增同一 Reference 的 .3 交互路径（保持原 Guard/Reader/Hook/Switch/授权语义及旧正反例），不得新造替代 app 就宣布累计通过。所有正例同时验证实际业务输出，不以 UI 状态、生成代码行数、单次模型成功作结论。

## 7. 修订 Task DAG（R23 候选，独审前不准入新增任务）

| Task | 依赖 | 写集与退出门禁 |
|---|---|---|
| T30 .1 根预算只读查询缝 | 已关闭 #1731 | R17 既有资格保留 |
| T31A Standard Interaction 执行层（原 T31） | T30；已关闭 #1733 | R22 既有资格保留；不等于完整 SDK 功能 |
| T31B 信息组织与证据状态 | T31A、R23 正式冻结 | R23 §3B 实际标准实现、两个真实用途接线及独立正负验证 |
| T31C 必要决策及优先选择 | T31B | R23 §3C 实际标准实现、两个真实用途及独审 |
| T31D 候选组织、筛选、比较 | T31B | R23 §3D 实际标准实现、复用 Query 与真实用途及独审；共享写集顺序集成 |
| T31E 动态表单与最小确认 | T31C/D | R23 §3E 实际标准组织，复用 A 协议及独审 |
| T31F Recognition/Interaction/Handling 同根组合 | T31A–E | R23 §3F 实际便捷组合与完整 SDK 受影响测试/安装门禁、独审 |
| T32 媒体领域消费及真实授权 | T31F | 实际复用 R23 适用 B–F（不复制共同机制）；media-archive 交互及 planIn/registerIn/readbackIn 同根组合；§5.1 全路径预算表及真实请求、可见文件/DB/丢 ACK/原资产 readback 正反例；保留旧入口/原独立 oracle，R9 P2 预算/歧义 Effect 拒绝；不修 SDK 无关历史候选。 |
| T33 维修排程领域消费 | T31F | 实际复用 R23 适用 B–F（不复制共同机制）；workshop 交互、同根专业计算与真实 oracle/原预算、政策修订和候选。与 T32 独立写集可并行。 |
| T34 客户端与累计 Reference | T31F，T32/T33 接口稳定后组合 | 实际复用 F/E；CLI + 实际视觉语义适配、Reference App 同一激活 A/B/C、依赖及关闭、文本入口；唯一负责 §5.2 现有库存 action/client 同根入口及真实跨等待授权/取消/恢复见证。客户端/Reference 独立写集可在接口稳定后开始，T34 最终组合通过必须等 T32/T33 真实路径完成；不引入 SDK Web 框架。 |
| T35 真实新工件/独立生成维护/最终验收 | T30–34（含 T31A–F） | R23 §6 功能覆盖与两个真实调用点证据；新真实 clean-packed、受影响旧回归、实际双域独立依赖及 T34 库存授权见证、最低 Node22.12 Windows/Linux（工具矩阵分开）；陌生 Agent 仅公开入口、独立 Oracle、维护前后/负对照及原始证据；独立最终审查 P0/P1=0、P2 有归属、Exact HEAD 合入。 |

B–F 可在确证原有 SDK/原生实现完整满足共同用途时以实际两处复用/负对照及独审 NO_CHANGE_REQUIRED 关闭，不强制一任务一 Class；禁止把未实现的通用行为全部交给 Demo。R23 §4 冻结真实双域薄接线、§5 规定写集与退出门禁、§6 增强实际复用验收。

按 ADS 有限任务：实现前 L2 独立审核；必要源码改动前实际语法/Typecheck/Lint/Tests，源切片不是完整包资格；能当前环境完成不重复 CI，真实安装或平台必要才启有限执行任务。任何 T31 发现旧基础缺陷按归属版本修正、独立增量审核，禁止在 .3 建第二运行时规避。T32/T33 实施反馈可触发 T31A–F 最小 API 修订，须更新合同与适用独审，不擅改 L1。最终 #1613 统一控制，不开第二版本总控。实际工件、平台、状态、失败、未执行、证据归属写回 Issue/PR；无主干 release，.5 模型、.6 持久化均不实施。

## 8. 原 R10/R12 设计取舍与待审风险（历史）

- 采用运行期内存 Promise 等待而非持久 resume，满足 R9 和 S03 证据；不强制每个步骤 Workflow，不修改既有 XState 终态。
- 用户提交与业务确认/真实授权分离，安全边界是当前业务证据/Owner 校验而非客户端、nonce 或 SDK 自签。
- 表单选择语义有限类型、普通 TS 数据结构，不增加独立 schema/DSL；SDK 实现负责通用交互和失效，业务选择问题、确认适用性。T31 核验异步取消/同步重入/回调通知/重入 resolve/可变引用、实际预算的最小行为；审查如果 API 需要更多能力是否由真实用途证明。
- 原 R10/R12 选择单 pending、保守修订失效及最小客户端实例已按 R14 冻结；T30、原 T31（T31A）按 R17/R22 验收合入。R23 只扩展 SDK Standard 共同职责及实施分解，具体 fixture、类型声明、业务预算表和实际呈现接线仍在对应 task 先细化再实现。R23 文档不构成新源码、测试、CI 或产品通过。
