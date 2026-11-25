# R72 · 全 SDK 能力裁决与实施/验收矩阵

状态 DESIGN_CORRECTION_CANDIDATE（R74 / R73 0/2/2 限定整改）；#1761。实际读取基线 261e92faa9a3ec864c984e7de99016372a3d081b 的公开根、实现、示例及安装门禁；R71 pack b0a7f60e... 原证据不变。R70 已限定接受两项 P1，P2 文案已修正候选。本文件是设计/验收计划，不是新运行 PASS 或独立审核结论。

## 全部 28 个公开值（15 class/13 function）、61 独立类型
实际 TS checker 清点见 #1761，分类不依赖后缀。以下每行覆盖实际根值；列出主要接口、所有权及当前真实用途/限制，并作设计裁决。KEEP 不是全行为重新验收；若独审发现实际问题按证据限定修订。
| 能力/根值 | 类别 / 责任与主要接口 | 实际用途和边界 | 裁决 |
|---|---|---|---|
| KernelLifecycle | KDP Element；start/execute/run/[Symbol.asyncDispose]；实际进入与逆序退出 | native-domain-app/main 与 interaction-reference；仅静态 Core 元数据和兜底，非 loader | KEEP |
| WorkflowElement | 抽象契约；run | XState 实现继承，非可直接实例化 | KEEP |
| XStateWorkflowElement | Standard Element；actor logic/mapOutput/run | 原生 Workflow/真实 Reference；actor 生命周期与 Outcome，不拥有根预算或领域规则 | KEEP |
| NativeWorkflowContext | 执行支持；depth（readonly）/remaining/invoke/invokeOutcome/child/leaf | root callback 贯穿 Reference、media、workshop；不由应用另建根、不泄露预算 | KEEP，明确不可自行构造普通业务根 |
| StandardWorkflowSession | 执行支持；每根 limits/run | native-domain-app、media archive/register、workshop plan；唯一实际根会话，不是另一个引擎 | KEEP |
| routeWorkflowOutcome | Function；六态分流 | workflow-init 等；保留不同状态，不吞 UNKNOWN | KEEP |
| runRecognitionHandling | Function；固定双叶同根 | air-quality/repair-quote/combined；非交互等待，不嵌套为第二 root | KEEP |
| JsonReader / YamlReader | 两个 Standard Element；read/write 文本数据 | Reference business 多资源同实例、inventory/workflow-init；不是文件路径 I/O，无业务文件权限 | REFINE 文档分类/命名说明；保留实际接口，未来若证据足够再更名/合并 |
| readJson / readYaml / writeJson / writeYaml | 四个独立 Function；有限解析序列化 | 实际独立单元和非法输入测试；与 reader 共用实现，支持单次调用；非文件 I/O | KEEP，说明首选单次函数/组合实例，无重复实现 |
| BoundedQueryElement | Standard Element；select 同步有界扫描 | air-quality、repair-quote、combined、D 内部；完成性与截断，非数据库/安全沙箱 | KEEP |
| SQLiteDatabaseElement | Standard Element；连接、select、transaction、close | inventory authority/client、媒体 catalog、combined；真实事务，CAS 由应用在事务内使用实际 SQL 与 changes/get 实现（无 SDK CAS 方法），资源归实例；不替域授权 | KEEP |
| SQLiteDatabaseError | Error；脱敏错误码/阶段 | SQLite 失败语义，非可复用 Element | KEEP |
| VectorQueryElement | Standard Element；有限 Top-K | combined book-catalog/water-hardness；调用者提供同步 inScope predicate（SDK 不自带 tenant/scope 权威）、options topK/maxVisited/dimension/metric、完整性；非 embedding 生成/数据库 | KEEP |
| GraphQueryElement | Standard Element；有界有向 BFS | combined、workshop；关系方向/深度/完备性，非专业优化 solver | KEEP |
| BoundedExpressionElement | Standard Element；evaluate 有限纯 JSON AST | combined book-catalog/water-hardness；不执行任意 TS/业务规则引擎 | KEEP |
| CliElement | Standard Element；run/timeout/合计输出界限 | media FFmpeg/ffprobe、workshop SciPy；可信前台进程，Linux 进程组 vs Windows 直接子进程，不是 sandbox/权限 | KEEP |
| InteractionElement | Standard Element；run/current/submit/cancel | 四域、inventory、CLI/GUI；唯一逻辑意图运行/等待/预算 | REFINE/COMPOSE，仅增加原发布绑定通路和直接 notify 第二参数 |
| resolveEvidence / invalidateEvidence | 两个 Function；来源/冲突/依赖失效 | 四域实际；只处理已取得证据；无独立状态/读取/授权 | KEEP |
| selectNextDecision | Function；四态/依赖/必要优先 | 四域；域判断适用/满足/优先级，ready 不代表业务 READY | KEEP |
| prepareCandidates | Function；有限筛选/排序/投影/complete | 四域；复用 BoundedQuery；域硬约束/专业结果、截断不推荐 | KEEP |
| buildClarification / mapClarificationResponse | 两个 Function；组织及映射 | 四域手工配对，当前实证错配；纯内部测试仍保留 | COMPOSE 为 ClarificationElement，候选移出根，独审批准后迁移 |
| runInteractiveRecognitionHandling | Function；同根 resolve→step | 四域及 inventory；不设统一 reducer，不另建 Session | REFINE 泛型贯通，KEEP 原职责 |
实际值计数：具体 Standard10（XState、两 Reader、BoundedQuery、SQLite、Vector、Graph、Expression、CLI、Interaction）；KDP1、抽象1、执行支持2、Error1、Function13。公开类型61 按 lifecycle(7)、workflow(3)、interaction(10)、clarification(3)、candidates(5)、decision(3)、evidence(7)、structured-data(2)、bounded query(3)、SQLite(7)、vector(4)、graph(5)、expression(2) 关联目录；各实际名称由 checker 与独立预期逐项核验，不靠上述分组数代替名单。Class 同时可作类型不重复计作独立 type。
结果语义：文件 kind/SUCCEEDED、Workflow status/COMPLETE、查询 complete、Evidence complete、CLI/SQLite 抛错分别有不同含义；F11 默认文档及实际组合正反例，不统一不等价概念。F08/F10 未证实需要其他 API；F09 全清单裁决已给出，独审可反驳；不以名义数量作为问题。

## 声明级可调用成员目录 · P1-R73-02
当前基线 actual TypeScript checker（仓库源/真实配置；核验结果见 R74 收据），以下是对 D4 预期成员的明确设计清单；独审逐项和实际 d.ts/实现独立核验。C=可构造（列参数前置），A=abstract 不直接 new，R=声明构造可见但业务不可直接构造（由 SDK 提供），F=仅工厂取得，I=instance，S=static，P=属性。所有 SDK 自有 public 成员包含 inherited contract 一次（override 以实现签名显示并链接抽象）；Error/JS/Node/外部库继承的非 DH 成员只指向原契约，不包装为 DH 能力。构造器不是普通 method；默认 constructor () 也记录。符号名按实际 computed declaration canonicalize 为 [Symbol.asyncDispose]（不可用 checker 内部 __@...序号）；private/protected/#private 与仅内部 accessor 不进入消费清单。私有构造禁止 new，R 类区分可见 TS 签名与支持用途。每个成员的实际签名/overload/generic/readonly/optional 从真实声明提取而非手抄；审阅独立成员集合和必要限制，而非从同一生成器自证。
| Class | 获取/构造 | I/S/P 的 DH 成员（旧基线→目标） |
|---|---|---|
| KernelLifecycle | C(cores,logger?) | I start(context),execute(business),run(context,business),[Symbol.asyncDispose]()；没有 close |
| WorkflowElement | A<Input,Output> | I abstract run(input) |
| XStateWorkflowElement | C(logic,mapOutput) | I run(input)，覆盖 WorkflowElement |
| JsonReader | C() | I read(source),write(value) |
| YamlReader | C() | I read(source),write(value) |
| NativeWorkflowContext | R(budget:RootBudget,ancestors,depth)，SDK scope/root callback 提供；不可作为应用新根 | P readonly depth；I remaining(),invoke(action),invokeOutcome(action),child(maxDescendantDepth,action),leaf(options) |
| StandardWorkflowSession | C(limits) | I run(action) |
| BoundedQueryElement | C() | I select(source,predicate,limits) |
| SQLiteDatabaseError | C(code,stage,details?,options?)（Error 类型，应用构造非 SDK 可信错误） | P readonly code,stage,primaryCode?,rollbackCode?；继承 Error name/message/stack?/cause? 及 Node Error static 不计 DH 专用能力 |
| SQLiteDatabaseElement | C(path,options?) | I select(sql,parameters,limit),transaction(work),close()；应用 SQL 实现 CAS |
| VectorQueryElement | C() | I search(source,query,inScope,options)，不提供 SDK 租户过滤策略 |
| GraphQueryElement | C() | I search(edges,options) |
| BoundedExpressionElement | C() | I evaluate(astJson,inputJson,options?) |
| CliElement | C(timeoutMs?,maxOutputBytes?) | I run(file,args)，无 shell |
| InteractionElement | C(options?)，目标 onPrompt(prompt,interaction) void | I current():InteractionPrompt或undefined,cancel(),submit(input),run(limits,work) |
| ClarificationElement（目标新增） | F private constructor，真实工厂 token；不能 new | S prepare<K,E,V>(evidence,selection,template,fields)；无公开实例方法/绑定字段 |
同源 callable contract（不是可 new Element）：LifecycleInitContext.enter(element,componentId?)，PackageInitElement.start(context),[Symbol.asyncDispose]?，StaticCorePackage.Init?（construct signature），LifecycleLogger.error(record)，WorkflowRoutes.COMPLETE/REJECT/ASK/WAIT/UNKNOWN/FAILED 回调，SQLiteTransaction.active(readonly)/run(sql,parameters)/get<T>(sql,parameters)，InteractionScope.root/signal(readonly)/resolve(initial,decide)/step(action)，ClarificationField.projectPrefill?。这些支持契约及函数的 callback 参数随真实声明显示；数据 type 不枚举 String/Array/Object/Node 原生继承成员，不把普通数据字段包装为能力。函数根符号自身调用签名和回调/返回契约同样校验。所有61 独立类型逐名归类，不要求每字段单独教程。
场景索引在 authored Skill family/comp guide 维护精确 member ref（例如 KernelLifecycle#[Symbol.asyncDispose]、VectorQueryElement#search、ClarificationElement.prepare、SQLiteDatabaseElement#transaction + SQLiteTransaction#run/get；记号是文档锚点，不是 runtime ID 或 DSL）。生成器用 TS checker 分辨 static/instance/constructor/property/callable type、可访问性及继承声明来源，规范化 symbol computed names，按独立期望校验完整集合及每个 curated ref，签名展示由 checker 生成并与 packed installed d.ts 对比；不存在的 member、错误调用种类/构造限制、遗漏 public member、无关/内部符号、错误签名均失败。语义如 Vector inScope 由调用者声明、SQLite CAS 为应用 SQL，不可仅由签名推出，独立评审场景与真实 typed/runnable examples 验证，不以字符串匹配充当语义证明。不得依赖编译器合成 __@number、JS prototype 反射或新 runtime registry。
### 目标公共面候选独立期望（R73 所列，R74 不另增）
运行值27：KernelLifecycle, WorkflowElement, XStateWorkflowElement, NativeWorkflowContext, StandardWorkflowSession, routeWorkflowOutcome, JsonReader, YamlReader, readJson, readYaml, writeJson, writeYaml, BoundedQueryElement, SQLiteDatabaseElement, SQLiteDatabaseError, VectorQueryElement, GraphQueryElement, BoundedExpressionElement, CliElement, runRecognitionHandling, InteractionElement, resolveEvidence, invalidateEvidence, selectNextDecision, prepareCandidates, ClarificationElement, runInteractiveRecognitionHandling。16 class/11 function，具体 Standard11；基线28移除 buildClarification/mapClarificationResponse（内部纯实现及测试保留）。61 type 名称不变：CorePackageMetadata, DomainAppContext, LifecycleInitContext, PackageInitElement, StaticCorePackage, LifecycleLogRecord, LifecycleLogger; StandardWorkflowOutcome, WorkflowLimits, WorkflowRoutes; StandardJsonValue, StandardFileOutcome; BoundedQueryLimits, BoundedQueryTruncationReason, BoundedQueryResult; SQLiteScalar, SQLiteNonThenable, SQLiteTransaction, SQLiteDatabaseOptions, SQLiteErrorCode, SQLiteFailureOrigin, SQLiteTerminalFailureDetails; VectorCandidate, VectorQueryOptions, VectorMatch, VectorQueryResult; TypedGraphEdge, GraphQueryLimits, GraphQueryOptions, GraphPath, GraphQueryResult; ExpressionScalar, ExpressionLimits; InteractionCandidate, InteractionField, InteractionEvent, InteractionPrompt, InteractionPromptSpec, InteractionRecord, InteractionResponse, InteractionSubmitResult, InteractionDecision, InteractionScope; EvidenceOrigin, EvidenceObservation, EvidenceRequirement, EvidenceContext, EvidenceResolution, EvidenceDependency, EvidenceInvalidation; DecisionCondition, DecisionDescription, DecisionSelection; CandidateEntry, CandidateSource, CandidateAssessment, CandidateProjection, CandidatePreparation; ClarificationField, ClarificationPreparation, ClarificationResponse。独审冻结本 exact candidate；任何变更需明确实际理由与复核。
## 方案一致性修正 C01–06 / F01–12
| 编号 | 设计交付 | 验收 |
|---|---|---|
| C01/F01,F02,F03,F06 | EL09–15+QA09B，源码分类/Skill/显式根/独立 inventory | 缺 Reader、错 Error、抽象当具体、漏 type、重复/phantom、新未批准 export、无分类均拒绝；源与安装实际一致 |
| C02/F04,F05 | portable Skill+本地规范及指南、README 导航 | 实际 tar/clean install 中所有本地引用/anchor 可达，离线查找与运行 API；无 repo 私有访问要求/不存在示例 |
| C03/F06 | build/gen gate/CI sparse 与 path include、独立 root+types | clean stale/丢 docs/漏 sparse/错版本/坏例/深路径负例；保留旧功能门禁和 --ignore-scripts；不加 runtime validator |
| C04/F07 | E immutable preparation + A actual publication binding | 同 visible 不同 key、双路径、stale/cross-root/cancel、async notify、预算、真实四域，不手工配对；见 L2-D |
| C05/F08–11 | 上表逐项裁决、必要有限 refactor | 无自动 IntentElement/全 Class 化/状态统一，真实调用及维护边界；对新增问题先给独审限定范围 |
| C06/F12 | 两阶段独立消费证据 | docs-only runtime 相同与 API-change 分开，原始产物/盲评隔离，不泛化效率 |

## 独立设计审查及验收 Oracle（先冻结，后实施）
- Q1 公共面：对实际 root 的 runtime+type set 完整枚举，独立预期不由被测目录生成；逐符号明确 kind/semantic class/family，核验根导出与安装 d.ts，排除内部 helpers/子路径。负对照删 Reader/错 Error/抽象实例化/多余公开/漏类型/假符号；另有 phantom KernelLifecycle.close、漏 [Symbol.asyncDispose]、错静态/实例/constructor/受限 Context/私有 accessor、错签名/overload、漏 depth/Scope/Tx callable、curated 场景 ref 不存在；独立语义审核及实际 typed examples 拒绝 Vector 内建租户 scope 或 SQLite 公共 CAS 的虚假宣称；新预期 27 值（待独审准确裁定）及类型合同，不把数字当目的。
- Q2 Skill：仓内/安装均可查同一能力目录，使用者从 README 找到本地 SKILL.md；本地链接、引用 canonical 快照/例/注释描述可核验，离线无需私有 GitHub。生成物 deterministic，漏文件/错锚点/陈旧分类或成员/错误示例/不含 CI docs 均有可判别失败；在 build 覆盖前 check tracked 目录；集成 PR 必须指向实际 version/v0.11.x 并绑定 exact CI，不将 stacked 无 status 当 PASS；实际 npm pack --ignore-scripts 在先构建后有效。所有 standalone TS 示例实际编译，代表性真实示例运行。
- Q3 绑定机制：旧反例 shippingName vs billingName 同 visible 内容真实 accepted response 再现；新 bound 路径普通应用无法在发布后替换 binding，实际映射正确 key，另一准备只能在新实际发布前选择。保持原 raw prompt；双路径或无效准备 FAILED/INTERACTION_INVALID_PROMPT，在等待预留之前拒绝不发布；实际旧 revision、跨意图、重复/无效、cancel/reject、async resolved/rejected notify（含 sync submit 后）、修订和 checkpoint、L2-D.1 全动作表：submit→values/submit、revise-values→values/revise（旧 records 全失效且当前 valid）、revise-text/text/no-fit→other 与 raw payload 不变、reject/cancel/通知失败/短预算→无 mapper/下一 decide/Handling；bound mapping fail 在下一分析预留内 FAILED/INTERACTION_CLARIFICATION_BINDING_FAILED，无可用映射；实际两独立实例/同不可变准备新发布/混合 raw-bound/两个 checkpoint/假 JS 构造及对象/明确泛型错 key/实际第二参实例/同步捕获后异步失败，变异去掉 occurrence 绑定须被检出，失败不进入后续 Handling，不产生权限/权威提升；测试 mapper 输入快照不可变和 per-occurrence 隔离。不宣称阻止任意恶意可信 JS。
- Q4 原功能：实际 R64/R69/R70/R67 的 core/generation/regression、CLI8、inventory13、visual6、media/professional + workshop/SciPy + 原 independent oracle、采购真实36（按实际新测试扩展）及预算/取消/权限/Effect 正负对照。既有 2/3,4/5,6/7 最小路径及各域实际预算/副作用保持，触发次数无错误膨胀。全 Linux verify + clean packed separate consumers；新 artifact Windows 只运行实际受影响路径，R67/R71 原证据保留，不重复全版本。
- Q5 discovery experiment：独立 reviewer 在实施前冻结任务、真值（独立实际 public inventory 分类+需求→可接受能力/不适用项）、评判及隔离方法；评价 oracle 置于独立评估会话或受控文件，仅公开哈希及任务定义，后公开实际证据；若无法证实访问隔离，记为非盲，不以其替代独立评估。两 fresh isolated Agent 使用旧实际 SDK docs 与仅文档投影的新 Skill（相同 runtime/dist byte hashes、同要求；新文档不得描述未实现接口），不提供符号名称/正确答案；任务包括完整 Element/Function/support 清单及适用需求：结构化文本非文件 I/O、root budget、有限查询 vs SQLite、向量/图、CLI、expression、语义澄清与无适合能力。记录错漏、幻觉、正确选择/no-fit、读取/步骤/token仅在实际可测时，不能承诺固定速度；至少一次独立完整发现及真实选用。文档对照与后续 API 对照分开。
- Q6 API experiment：同一真实小领域要求/独立 Oracle，两个独立初见 Agent 分别使用旧 API+旧接口对应的改进 Skill 和新受审 API+对应 Skill，采用同一任务和初始/维护两个有限阶段，各自生成和维护（不向生成者开放另一组代码或评价真值；若环境无法证明隔离，明确非盲限制，不把结果解释为因果效率）；实测编译、真实业务结果、错配反例、修订前后、通用协议重复、调用者需掌握概念/步骤、变化影响与无权限越界。先前 R65 原始证据及 evaluator exposure 明示、绝不改写。四现有域迁移是集成证据，不冒充四次独立陌生生成。独立真实 Oracle 分离且原始输出/初始与维护 SHA 留存；不推广单次效率。
- Q7 final：全部冻结 SI-L1 13 Oracle + QA-09B 实际裁决、R70 P2、#1761 无未解决 material P0/P1，非阻断 P2 有 owner/scope；exact CI/pack SHA/tree，Windows 证据绑定实际 bytes，合入后核验组合树，不发布或启动新版本。
## 写集/Task DAG（批准后）
D1/D2 本三文件为设计候选，D3 独立 non-writer 审查接受/返工/阻塞；确认分类、API、真值实验设计和每个处理裁决。D4A canonical/Skill规范；D4B source annotations/explicit exports/catalog generator/test; D4C portable pack/build/CI/installed gate；先产旧 API docs-only 实验快照，非产品发布，保留 runtime hash；D4D A/E/F limited refactor、四域迁移；共同 index/docs/gates 顺序集成避免覆盖。D5 实际全 Linux/clean-packed、两阶段独立消费、有限 independent implementation review。D6 单次最终 freeze，按 L2-A 的集成分支策略，将 exact accepted combined implementation PR 指向 version/v0.11.x 触发实际 CI，不扩大 branch filter；保留 R67/R71 旧工件，按真实变化确定 Windows 受影响验证；T35 最终综合独审。若 R71 尚未完成不阻断设计，不虚报其结果。不新增本地任务（除必要平台）、不做 0.11.4、不改 R65 证据。
