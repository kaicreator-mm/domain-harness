# 0.11.3 · R23 L2 增补：领域知识驱动的标准能力与实施 DAG

> CANDIDATE_PENDING_INDEPENDENT_REVIEW。Owner 已要求修订 L2/DAG，补齐 SDK 功能分解；本文件只改变 HOW 与实施归属，不改变 R9 冻结 WHAT。#1613 唯一版本总控。R14 已审交互执行、预算、真实领域和权限合同保留；原 T31 的已验收实际范围改称 T31A，不等于全部产品完成。新增任务未实施，13 产品 Oracle 尚未验收。

## 1. 实际基线与缺口裁定

- [冻结 L1](./DomainHarness_v0.11.3_R7_PRODUCT_L1_SEMANTIC_INTERACTION.md) blob 5c158332a617cc5864fd40188459b45ace2d6b62，R9 comment 7145891451。原 L2 blob 3976ede0b36b7dcca7f33fa2848f1e33b9ca7c36，R14 comment 7156092250。
- train 2fa88be890d458b0ca8586fd1f0874a03ef1ffb0；[R22](https://github.com/kaicreator-mm/domain-harness/issues/1733#issuecomment-7157152801) 已按 R21 0/0/0、CI3197 合入 #1734，受审 head 847f386a9304796ce8009ad016ec0781704fa75f 至 merge 零文件差异。T30 已验收，T31A 执行层已验收（21个值/43个独立类型），不重跑不变范围。
- 实际 standard-interaction.ts blob d9e6a1affc9ac031e9463a8ab0fdf14d31758a7e：scope.resolve(initial, decide) 的 decide 由应用自行实现，返回 ready 或 clarify(state,prompt)，SDK 提供关联、记录、保守修订失效、等待、预算、取消。interaction-protocol.ts blob 8d48c6ffbf2b0084092da606894d9544110665bd：只表达/校验字段、选项、候选、比较、预填及响应，并拒绝显然无可用动作的坏表单，不组织领域信息、不确定下一决策。R19/R21 已审结论不被推翻。
- 原 L2 §2–4 将事实组织、优先决策、候选及必要确认整体委托 decide；§7 T32/T33 分别实现各自业务，缺少对共同机制的 SDK 交付任务。原产品 Oracle 有映射，不是 L1 编号遗漏；实际缺口是 SI-P11 的标准实现覆盖和 Agent-first 消费。
- 现有 BoundedQueryElement blob 1299a4a41fb5c763b4c358ccbd901281707335eb 支持 predicate 与完整性/截断；BoundedExpressionElement blob 4fcf85df85b0bb36829f98a0faab6f13cdd57376 是纯有界标量计算；已有 GraphQuery、原生 TS、runRecognitionHandling、remaining。它们是复用基础，不需要新查询、规则或推理引擎。runRecognitionHandling 固定双叶子并自行建 root，不直接包在一个新 Interaction 的 root 内。
- 本修订明确**可选实际 Standard 实现**，非强制 Domain Fact/Goal/Intent ABI。专业知识、来源可信度/适用性、硬规则、业务排序政策、候选专业计算、最终意图类型与真实授权仍由 Domain Package/Owner 负责。Standard 只执行明确提供的元数据、原生 callback 与确定性组织规则，不能自动推断专业事实、授权或强制 UI 顺序。

## 2. 功能级分解：12 需求到实际交付

| L1 | 已有基础 | 尚需 Standard 实现或组合 | SDK 实施 / 实际验收 |
|---|---|---|---|
| P01 | .2 知识、Query/Graph/Expression，A 的 decide | 类型化信息项及证据来源/适用版本、缺失/冲突/未知、依赖修订后的可用性；专业事实由域提供 | B / 32,33 |
| P02 | A 接受任意下一 prompt | 从适用未决项按域声明优先级选择关键问题，跳过已满足/不适用，阻止未满足依赖 | C,E / 32,33 |
| P03 | A 候选 DTO、.2 查询 | 有界实际筛选、完整性传播、排序/推荐与比较投影、依据/版本绑定及更新 | D / 32,33 |
| P04 | A 可每轮发不同 prompt | 根据当前决策和证据组装字段、预填、分支、替代动作；复用模板 | E / 32,33,34 |
| P05 | A 有效响应记录与 invalidate | 来源/确认与偏好区分、必要确认门禁、重算失效，完整明确输入零问，推荐不算确认 | B,C,E / 32,33,34 |
| P06 | A 同一 root 与多轮 | 保留 A，F 便捷组合，验证 exact/差一及修订 | A,F / 32,34 |
| P07 | A 独立实例、KDP 等待 | 保留 A；F 不能共享状态或阻塞独立根 | A,F / 34 |
| P08 | A text action、.2 recognition | 结构化/文本入口接线、确定/需澄清/非成功分支；确定性域解析器，不加 NLP/LLM 引擎 | F / 32,33,34 |
| P09 | A UI-neutral 协议 | E 组织语义内容；应用呈现与传输，不做 SDK UI | A,E / 34 |
| P10 | .2 真实授权与双角色、A root | F 同根 Recognition→Clarification→Handling 便捷组合；后续再澄清显式进入，不自动重做 Effect | F / 32,34,35 |
| P11 | CORE-13/14, QA-09, A | B–F 的实际复用合同及两个真实域不复制的证据；已有功能复用可裁定 NO_CHANGE_REQUIRED | B–F / 32,33,35 |
| P12 | A 已验收 API/导航 | 每任务 TSDoc/类型与独立 expected、短默认路径、规范/Skill；陌生生成及维护 | B–F / 35 |

字母均指 T31 子任务。上述是分解，不是 12 项 PASS，也不因 1 个函数可覆盖多个职责而强制拆成 5 个 Class。

## 3. SDK 设计：可选的类型化辅助组合，不是新 Runtime

### T31B · 信息组织与证据状态

实现本意图局部的类型化信息组织函数或内聚 Element。候选 API 形状（具体命名不冻结）：`resolveEvidence<K,V>(observations, context, policy, limits)` → 每个需要的 key 的 resolved/missing/unknown/conflict/not-applicable 状态、可用来源与原因；`invalidateEvidence(previous, changedKeys, dependencies)` → 待重算标记。K/V 可以是域自己的泛型/普通不可变数据，不强制域将所有知识放入此结构；真实领域对象和私有凭据不进入语义快照。

- 区分 authority/user/derived/default/recommendation（候选命名），来源 identity、scope/revision 与必要时有效期；用域提供的适用性、等价比较/优先规则，不能以字符串、来源类别或最新时间擅自判定权威。缺失事实与明确 unknown 不混为一谈；不适用不是假值。多个相冲突的有效证据不能静默最后写入胜出；缺少明确消歧政策则 conflict。默认/推荐可作提案，不满足必须用户确认或权威事实的条件。
- 来源、scope、policy revision 改变或依赖改变时，已依赖的推导/候选/确认标记为待重算；复用未受影响证据须有当前适用性支持，缺失依赖信息保守失效。依赖只限当前意图显式有限项；不建持久事实库/全局 truth-maintenance。A 的 revise 仍保守撤销旧用户记录，不复活已失效表达；域可重新验证未受影响权威事实，不等同重新确认用户选择。
- 复用 Query/Graph/native Map 与普通纯函数；专业证据取得/真实计算在原 root 计费，B 不自行执行 I/O 或建立 Session。数据规模受显式 maxItems/maxDependencies 等有限参数约束，截断/未覆盖返回不完整，不能伪造 missing 或 resolved；禁止不受限递归。冻结实际默认/上限与错误码于 task 内。
- 独立测试：同一 key 不同来源一致/冲突、false/0 不当缺失、过期/错 scope/旧 revision、推荐不能满足权威、变更 A 使派生 B/C 待重算且无关 D 保留、依赖缺失与限额不足拒绝。变异去掉 scope/revision 检查或把默认升格为确认须检出。至少两个真实域映射 §4，不能仅靠泛型接口宣布复用。

### T31C · 必要决策与下一问题选择

实现可复用的决策组织/选择算法，接受本意图有限决策描述：稳定 decisionKey、依赖 key、域提供的 applicability/required/satisfied 检查及优先级（有限数值或显式顺序）；返回 ready（没有未满足必要决策）、next（一个合法当前决策/可组合字段组）或 unresolved/blocked/conflict，附跳过/等待原因。候选名称 `selectNextDecision`，不预设通用 DSL 或固定流程图。

- 先按当前有效证据检查适用性、必要性与是否已满足；依赖未满足不能询问依赖结果，非必需或已经充分确定的跳过。优先级由域定义（可依据影响目标/方案、可一次解决多个信息项），同级使用确定性 domain order 或稳定 key，不依据 UI 提交顺序。对影响多个事项的一个真实选择，由 domain reducer 产生关联信息，SDK 重新评估并跳过满足的决策。
- 未知适用性、歧义、冲突或所有必要项被阻塞不得返回 ready；未知必要性不默认为 false。对依赖缺失、循环、重复 key、非法优先级、上限截断明确拒绝或 unresolved；可复用 GraphQuery 或简单有限依赖检查，不能引入第二 DAG 执行器。仅组织当轮决策，不自动执行 Workflow/专业计算。
- 测试：已知事实零问题、关键高优先项先于低价值项、前置选择覆盖后续两项、改变前置后切换分支、缺失权威事实不会被推荐填补、同优先级稳定、依赖循环/截断不 ready。移除依赖或必要检查负对照。
- 域提供“哪个决定更重要”与具体业务满足条件，不让应用重复编写筛选、排序、依赖/无可用决策判断。

### T31D · 候选方案组织、筛选及比较

实现候选集合的实际处理函数/Element（例如 `prepareCandidates<T>(source, predicates, ranking, projection, limits)`）：域输入实际候选源、当前 scope/revision、硬约束 predicate、业务比较/推荐依据及呈现投影；Standard 执行有限过滤、稳定排序、候选 ID 检查、比较行投影、完整性及拒绝原因组织。复用 BoundedQueryElement 的 visit/return 限额/complete，复用原生 sort 与 Expression 仅在已有实际需要时使用，不重复查询或优化算法。

- 把输入源完整性与筛选截断合并：只有来源及遍历均完整才标 complete；评估 unknown/失败或未见全集不能当无合法方案。非法或不适用候选不能被排序/推荐挽救；已知无候选与未知候选分别输出，保留 no-fit/进一步澄清出口。推荐必须来自域给定依据，非自动承诺最优；若有截断，不宣称全局最高或唯一。
- 输出当前版本候选及稳定 opaque ID 与 domain value 的关联；不把任意业务对象、敏感 token、未经验证的 path/数据暴露给客户端。比较行按真实候选 ID 和域提供指标组织，区分不同约束场景；旧输入或版本变化后重新生成，不允许直接提交旧候选。真实提交仍由 A correlation + 域重新验证硬约束/版本。
- 专业候选生成（读 DB、解码、求解）是域在同 root 真实计费的操作，D 的通用组织在已计费分析中执行，不隐式调用任意异步专业函数或创造新 root。规模/复杂度上限及错误分类由实际 task 确定。
- 测试：完整/截断/未知/失败、零合法候选、同级排序、重复ID、错误比较项、旧版本、跨 scope、推荐违反硬约束、输入顺序变化及完整性负对照；保持 BoundedQuery 现有合同。媒体合法文件/排程合法情景各消费同一真实实现。

### T31E · 动态表单与最小确认

实现 `buildClarification` 或等价通用组织能力：输入 B 的当前证据、C 的 next、D 的候选和领域预制字段模板/映射，输出 T31A 的 InteractionPromptSpec 或无需澄清/无可合法表达的明确结果。优先复用已有协议校验，不新增另一套表单 schema；领域提供 label、字段/候选绑定、必要确认条件和可用动作。

- 自动把已确定且无需确认的信息排除于必填问题；需要用户决定的可采用有来源预填、候选推荐，不能把默认或系统推断自动变成用户明确表达。用户初始输入/一次有效提交可同时满足多个领域需求，更新 B/C 后只问仍必要的字段；已确定目标不再追加最终确认。
- 可选分支按当前决策和适用性组装字段；前置变化删除无关字段、更新候选及明确失效。响应映射回当前 typed domain state 的最小通用辅助使用显式映射/业务 reducer，不能客户端提交任意权威状态或绕过硬约束；最终 READY 必须由域核验。
- 源字段模板可预生成，运行期只组织数据；使用 A 现有 64KiB、256、4096、16 等上限及无合法提交拒绝。需要分页/更大数据由域有界引用实现，未证实不扩展。无 fit/冲突/缺失权威数据按域提供动作、或真实 ASK/UNKNOWN/REJECT；不生成虚假候选。
- 测试：完整输入无 prompt、单次选择确定多个必要项、默认不是确认、分支动态增删、模板不可变、前置修订/旧响应与必要确认失效、合法空候选/no-fit、无可安全解释的未知非 READY。对比独立固定逐项确认基线的 necessary/repeated/derived/skipped 计数，保持相同专业 Oracle。SDK 生成的是语义表单，不是 UI 渲染器。

### T31F · Recognition / Interaction / Handling 同根组合

实现短默认路径（例如 `runInteractiveRecognitionHandling(interaction, limits, callbacks)` 或 InteractionElement 上内聚组合方法，独审按实际用途确定）：已有结构化输入/领域确定性文本解析 → 分析 B–E → A.resolve 的 ready/clarify → 同根真实 Handling。保留低级 scope.resolve/step/root，复杂领域无需使用便捷入口。不能为“统一”硬塞额外阶段、再创建 Session 或要求领域采用统一 Intent 基类。

- 输入识别只接受域给定解析/验证函数；已明确意图直接 ready、需澄清才发布、未支持/歧义文本进入域允许的结构化询问或 REJECT/UNKNOWN。保持旧 ASK/WAIT/UNKNOWN/FAILED 原语义；不能把任何非成功自动变成互动循环。真实 LLM 后移 .5；不实现通用语言 parser/provider。
- 一次 run 的 root 仍由 A 建立一次；分析与等待各 1call/1step、root 1step，B–E 的纯计算在已计费分析内，专业 I/O 与域调用另由同 root 的 invokeOutcome/child/leaf 真实计费。若初始识别独立操作，则额外计费，不能声称免费。最短完全识别+处理路径 2calls/3steps（识别兼分析1/1+step1/1+root）；一次澄清 4/5，两轮 6/7；真实额外阶段必须更新预算表。T32/T33 固定专业路径同根 preflight 和旧入口保持。使用 remaining 只是快照不保证并发预留。
- Handling 可明确返回“需要新的意图澄清”并由域选择在同 scope 再 resolve；仅在真实无已提交效果的下一操作或明确 checkpoint 上继续，不自动重新执行整个 Handling、不吞掉既有 COMPLETE/UNKNOWN/receipt。已进入真实动作保持原 .2 授权/收敛/恢复合同；取消只阻止新的相关操作。恢复请求若根终止，按既定 §5.1/5.2 的显式新授权只读恢复，不在原意图内部重开预算。
- 测试：文本/结构化完整与部分输入、未知/歧义、明确再澄清不重复 effect、精确及差一预算、无关联意图继续、取消期间已进入结果保留、旧非成功不包装、必要权威事实缺失时不调用 Handling；A 的受影响回归继续。实际两域消费组合，库存授权见证按 T34。
- 公开 API 名单、源码组织按实际共用程度最小化；每阶段若增加公开入口同步根导出、独立 expected runtime/type 集合、真实 installed gate、README、TSDoc、canonical spec/Skill；可集中共享文件按依赖顺序提交，不提前公开未可用类型。T31F 收口验证 B–E 组合，不要求另造一个 Class 或中间 DSL。

## 4. 真实用途约束：先冻结两域薄接线，再实施抽象

实际源码锚点（train exact）：media-archive/archive.ts dfd7b1cb41df5b43957a86d28738b7872cf708e3、client.ts e918a0e4540c8b5410e1d747a977a2c8ee6a022b、host.ts 8553d2342d40d930ec4bd0254a4838c2816e602b、verify.ts 04dc275f526fb3f42b8da9ef10d7c6ff8d0657e0；workshop/plan.ts dad50d9a9cb9e34117f88c338cb96948b405d35f、verify.ts 61dbbb72ad4f720b8f453ed3ad57cd3c27145c54。以下为基于真实路径的拟实施 consumer 合同，新增第三合法媒体/输入情形是测试 fixture，不是已存在结果或新产品政策。

| 能力 | 媒体域实际用途 | 排程域实际用途 |
|---|---|---|
| B | 受信文件引用、内容 Hash/metadata 来源、tenant/Owner scope、归档 policy revision；文件改变使派生计划/选择适用性重新验证，不把 token 当语义字段 | 工单/前置依赖、真实当前 calendar/policy revision、用户目标与 what-if 条件；未知停机不默认正常，政策变更使计划待重算 |
| C | 已选一件且 scope 已知只问第二件；未知或冲突 scope 优先澄清可澄清事项/拒绝；完整两件零额外问题 | 当前真实日历已知且请求明确无需选择政策；未确定目标先问 current vs what-if，选 current 跳过情景字段 |
| D | 由受信候选集合提供实际文件，筛去不适用类型/范围，按域依据排序；完整/截断、无 fit；技术合法性仍须真实 decode/Hash | 候选为适用的 current/明确 what-if 情景；真实求解后比较结果/依据，不把不同约束的 7/10 当同条件方案；不适用/不确定情景不推荐 |
| E | 补第二件字段、已有选项预填仅提示，改变配对使计划确认失效；不要求重输可读取的元数据或 owner scope | 动态显示 what-if 日历字段，改 current 移除该字段；用户明确目标足够后直接求解，不重复确认已知事实 |
| F | 有限确定性文本入口“归档选中的照片和视频”结合实际文件引用；明确选择→同根 planIn→真实 registerIn/readbackIn；授权独立 | 有限文本/结构化入口→澄清目标及适用条件→同根 runIn→实际 SciPy + TS 独立 oracle；不新增 dispatch |

每个 B–F 任务开始时，在任务 Issue 冻结最少两处实际调用草图（真实领域类型、输入/输出、已有能力、必要标准行为、预期 Oracle；可用隔离 TS consumer probe 验证类型与行为），不等到 SDK 全部写完才发现无用途。功能 task 实施时允许提供有限双域接线探针或实际共用使用片段，但不得提前宣称 T32/T33 专业业务合格；正式域代码写集由 T32/T33 持有或顺序受控转移。抽象优先实际需求、非专业专有职责、有限范围、真实可用行为；如果已有 SDK/原生语言已提供完整行为，task 必须给出两处实际复用、负对照及 NO_CHANGE_REQUIRED 独审，不能空关或强制增加类/类型。若只有一个领域真实需要，保留域实现并说明为何无共用价值，不能把未实现的 L1 产品结果标 PASS。所有必要产品功能仍必须在 T32–35 实测。两个业务共享 SDK，不共享彼此的领域包。

## 5. 修订 Task DAG、写集与门禁

| Task | 依赖 | 交付和退出条件 |
|---|---|---|
| T30 | 已关闭 #1731 | 已验收 remaining，证据 R17 |
| T31A | 已关闭 #1733 | 原 T31 已验收执行层，R22；仅此范围，保持原合并及测试 |
| T31B | A + R23 增补独审冻结 | §3 B 实际信息组织；两域消费探针、正负例/变异、公开文档/类型/适用 CI，限定独审合入 |
| T31C | B | §3 C 实际关键决策；同样独审门禁 |
| T31D | B | §3 D 实际候选组织；同样独审门禁 |
| T31E | C,D | §3 E 动态组织及必要确认；验证实际 A 协议消费 |
| T31F | A,B,C,D,E | §3 F 实际短路径同根组合；完整 SDK 功能收口、受影响测试/安装门禁，独审 |
| T32 | F | 原 §5/5.1 媒体专业路径/授权/读回；实际使用 B–F 共用能力（不适用明确理由），完整域 Oracle、共用行为审查 |
| T33 | F | 原 §5 排程同根专业求解及独立 Oracle；实际使用 B–F 共用能力（不适用明确理由） |
| T34 | F，T32/T33 接口稳定后独立部分可开始；最终 join T32/T33 | 原客户端、Reference A/B/C、§5.2 库存真实授权、取消及恢复；复用 F 组合，CLI/视觉真实操作，不重写 SDK 通用部分 |
| T35 | 全部 T30–34（含 A–F） | 真正新 packed SDK/独立域依赖/最低 Node22.12 Win/Linux/真实专业结果/原累计 Reference；陌生 Agent 实际生成及维护、13项 Oracle、负对照、Exact HEAD 最终独审 |

B 是共享数据组织基础；C/D 逻辑上可并行，但若共享 SDK index/README/expected gate/规范写集则顺序集成（建议 C 后 D），禁止并发覆盖；不为并行额外拆包。B–F 优先一个有限从属 task 一次实施/审核/合入，若同一职责无需独立 Class 可共用模块，保留独立可验证退出条件。T32/T33 各自写集独立。新增 task issue 在 R23 通过后按准入顺序创建，不新建版本总控，不再重新审查原 T30/A 无变化范围；有影响 A 的修订则只审实际影响。任何 0.11.0–.2 确证基础缺陷按原版本归属处理，不重开 #1724 全面优化。语法、Typecheck、Lint、Tests 实际通过后才交付相应 PR 资格，复用已有精确 CI，限定失败读取原日志；无必要不使用本地 Agent/全量跨平台重测。

## 6. 加强验收（13 原 Oracle 不变）

原 L2 §6 每项 Oracle 及实际专业/授权/客户端门禁完整保留；新增 Standard 实施归属已更新于主文 §6。T35 对每个 B–F 提供清单：真实 SDK 入口/版本与行为，媒体调用点、排程调用点，实际正/负/未知结果，重复通用机制检查（实际源码、依赖闭包、测试，不仅 import），原生已有能力复用或不适用裁决，明确域专有剩余代码职责。不能只证明 Demo 能跑，或仅有空壳接口/共同 DTO。

- SI-L1-02/03/04/06：至少实际输入完整、部分、冲突、改变前置决定、无合适候选的同一专业 Oracle 对照。分别记录实际请求路径、必须决定、重复问、推导、跳过、澄清轮次；必要决策不被省略，结果仍专业正确，不设普适轮次目标。
- SI-L1-11：从同一真实新包加载 A–F 实际有用 Standard（或已有 Standard NO_CHANGE_REQUIRED），各域不得复制事实/决策/候选/表单组织和等待关联的同义机制；域专业规则、数据读取、求解、授权重复不可假称通用。对新增共用能力做独立正负例及真实消费证据，若一域不适用需给实际证据且另一个真实用途验证复用价值或取消该抽象。
- SI-L1-12：独立生成者在已冻结公开 API/规范/Skill 下完成新小领域的关键决策、真实候选、修改重算与实际业务结果，并局部变更；审查生成代码中通用职责是否来自 SDK，而非重新编写。使用真实 clean-packed/独立 Oracle/保留首次成果和反例；不以代码行数或单次成功推出普遍效率。适用原 13 Oracle 全部通过前不结束版本。

本修订不新增产品需求、不改已批准 L1，不提前 .5 真实 LLM 或 .6 持久执行，不新增强制 DSL、事实引擎、权限模型、UI Runtime 或中央 Registry。R23 是候选 HOW 补充分解：新增 API 形状、有限参数与实现粒度尚未冻结，独审通过才正式准入 B；实施前按真实用例细化，不另起无限设计审核。不以任何本文内容冒充新源码、测试、CI 或产品 PASS。
