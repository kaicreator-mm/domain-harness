# DomainHarness 0.11.5 · Workflow-based Bounded Domain Reasoning · Product/L1

> 状态：OWNER_DIRECTION_CONFIRMED / L1_CANDIDATE_PENDING_INDEPENDENT_REVIEW。不是 L2、源码实施、产品验收或发布。  
> 主控：[#1563](https://github.com/kaicreator-mm/domain-harness/issues/1563) / [#1615](https://github.com/kaicreator-mm/domain-harness/issues/1615)。  
> 继承基线：`997164e342e6b3743b77e572bcf0e562b9014ceb`，R94 0.11.3 限定验收 [#1757](https://github.com/kaicreator-mm/domain-harness/issues/1757#issuecomment-7187812722)。  
> 决议来源：[R1](https://github.com/kaicreator-mm/domain-harness/issues/1615#issuecomment-7189240669)、[R2](https://github.com/kaicreator-mm/domain-harness/issues/1615#issuecomment-7189798951)、[R3](https://github.com/kaicreator-mm/domain-harness/issues/1615#issuecomment-7190129130)、[R4](https://github.com/kaicreator-mm/domain-harness/issues/1615#issuecomment-7190337172)、[R5](https://github.com/kaicreator-mm/domain-harness/issues/1615#issuecomment-7190466859)、[R6](https://github.com/kaicreator-mm/domain-harness/issues/1615#issuecomment-7190554979)、[R7](https://github.com/kaicreator-mm/domain-harness/issues/1615#issuecomment-7190696474)、[R8](https://github.com/kaicreator-mm/domain-harness/issues/1615#issuecomment-7190843398)、[R9](https://github.com/kaicreator-mm/domain-harness/issues/1615#issuecomment-7190976949) 及 R10 Owner 补充（本 PR/Issue 收据）。矛盾的历史措辞以较新 Owner 决议为准。

## 1. 产品结果与归属

0.11.5 提供以 Workflow 为骨架、能够实际运行已固化领域知识和专业能力的统一有界领域推理 SDK。Reasoning Workflow 根据职责定义，包含完全非 LLM、LLM 辅助及混合推理；LLM 不是必要运行条件。Workflow 的固定/动态性与是否使用模型相互独立。C03–C06 是核心，模型接入是支撑，不建设通用 Agent Runtime。

- SDK 仅负责 Domain App 运行（含初始化、退出和运行时实际验证）。SDK 自身需要 Domain Packages。Domain Forge 是基于 DH SDK 的生成 Domain App，负责运行前知识发现、抽象、生成和固化；当前需重构。必要的临时生成工具可位于 DH 仓库但不属于 SDK 公共 API、运行依赖或运行工件，未来迁移为 Forge 的 Domain Package。直接编写原生文件仍允许，不强制生成器或 Forge 前置。SDK Runtime Standard Packages 不因由生成工具编写而迁出。
- 运行后经验分析、提取、验证、晋升、学习及重新生成不属于 SDK。本版仅输出可消费的实际推理事实接口。保留 .6 durable、.7 execution evidence、.8 client experience、.9 server evolution 的既定路线，不自行重新分派。
- 继承原生 TypeScript ESM Package/Class/Function、已有 KDP 生命周期、Workflow、数据查询、.2 授权及 .3 Semantic Interaction。历史 .4 Authorized Action 已纳入 .2 #1612。不得恢复 KDP/Host 中央分派、旧 Lock/Target/BUILD ABI、运行时插件扫描/全局 Registry、强制 DSL、第二 Workflow/Agent Executor。正确性主要在生成期，SDK 验证自己接受的运行时输入及实际行为，而非任意 Package 设计正确性。

## 2. 统一语义

Workflow 是整个 Domain Harness 的核心与骨架，也是已固化的推理方法知识。Data Knowledge（事实、规则、关系、约束等）及 Function Knowledge（可执行领域能力）由 Workflow 连接组织，可独立存在及复用。Tool 是一种 Function：同一原生 Function/Element method 可被程序直接使用，也可被选为模型提案调用的能力；不建立第二套 Tool 执行对象。具有稳定合同的子 Workflow 可以作为复合 Function Knowledge 使用。

区分 Definition（可信固化结构）、Execution（一次运行的真实路径）、Context（当前运行环境的有效语义投影）、Proposal（未信任的局部候选结构）。Node 是任务组织位置，不强制成为 Element/Class；简单节点可直接调用 Function，复杂节点可执行子 Workflow。Data Knowledge 可以作为输入、约束、验证依据或获取/选择知识的任务目的，不将所有知识强制变成节点。控制节点可表达分支、合流、循环及终止，不虚构业务 Function。Definition 能表达知识及能力需求、输入输出、条件、验证、允许变化区域和完成条件。静态原生代码不强制转换为动态计划数据。父子通过明确合同组合，子内部知识/实现封装，不自动暴露所有底层能力。

## 3. 产品功能合同（WHAT）

| ID | 能力与必须行为 |
|---|---|
| C01 | Model：OpenAI-compatible、Anthropic Messages 两类标准协议；普通文本、结构化提案、多轮消息及工具调用/结果关联；错误、拒绝、超时、取消、可用 usage。明确能力差异，不静默忽略。 |
| C02 | Model Selection：应用/任务/Workflow 可显式选择配置和模型；不强制中央路由、自动 fallback、streaming、多模态、embedding/rerank。显式 fallback 若实现须保持数据/授权边界及共享预算。无模型任务不需凭据、模型初始化或网络。 |
| C03 | Context：由可信 Definition 的知识/能力需求与真实 Execution 状态构建，适用于非 LLM 和 LLM；根/区域/节点按需投影，保留目标、必须约束、适用知识、允许 Function、真实进度、已知/缺失/冲突/未知/失效信息、计划 revision、反馈、剩余资源；依据来源/版本/范围有效性刷新。原生 Function 消费类型化对象；仅需要模型时构建有限 Model Context，关键条件不可静默裁掉，无法容纳时显式非成功。 |
| C04 | Knowledge：生成期主要完成发现、抽象、知识关系与需求绑定。运行时使用已固化知识、预选真实查询、参数化数据读取、可信适用规则；允许动态区域按需请求已授权知识。无全局知识发现平台、必需 RAG、自动模型压缩、通用知识库。数据/检索文本不产生指令或权威。 |
| C05 | Function：真实原生 Function 和可复用 Workflow 的组合、输入输出/前后条件及适用性；Tool 是选定 Function，局部提案映射到真实调用。模型不获得任意 TS/SQL/shell/eval、凭据、私有实现或新的能力权限。非模型路径不强制 JSON schema 或模型消息。 |
| C06 | Reasoning Workflow：统一执行语义，支持固定流程、局部动态、较大但有界的动态区域；顶层固定、局部动态、整体有界。支持第4节全部结构操作、生成/验证/执行/观察/调整、单次及多轮推理、原生或模型产生局部计划；固定结构中可包含模型 Function；非 LLM 算法也可动态生成计划。 |
| C07 | Validation：在每个 Workflow 节点前后及关键转换处满足第5节，领域定义正确性，Standard 提供可复用组合机制；模型不能自证事实、授权或完成。 |
| C08 | Semantic Interaction：Reasoning 与 Interaction 双向可组合，同一逻辑根、取消、状态及预算；只有真实需要时请求反馈。用户选择不是实际授权，反馈修订使受影响计划/审批失效。ASK/WAIT 不表示跨进程恢复。 |
| C09 | Control：共享根调用/步骤/深度及模型调用、重试、时间、可实施 token 限额；在工作前预留，子流程和重规划不重置。区别实际/估计/不可得用量；不能保证的硬限制显式不支持；费用限额仅在有可靠保守上界时使用。无进展/取消/超时/拒绝等安全终止，过期响应不得推进/触发新工作。建议活动处理时限与可配置墙钟截止分开，等待不得重置预算。 |
| C10 | Reasoning Evidence：运行期输出真实可关联的任务/定义/节点/计划 revision、推理方法（模型可选）、知识来源、实际 Function 调用、Observation、校验、用户反馈、计划变更及原因、资源/终止事实；脱敏，不保存私有思维链，不捏造模型或用量。实际消费者验证可读接口，非持久化平台、非经验系统。领域可声明关键证据要求；证据失败不能掩盖已提交/UNKNOWN 外部结果。 |

## 4. 局部动态 Workflow（R10 Owner 增补）

### 4.1 固定与动态边界

固定的是可信根 Definition、目标与任务合同、授权及不可绕过的校验/完成条件、允许的动态区域及总限制，而非每次执行路径。动态区域可是一段或覆盖大部分求解，但须由固定父 Workflow 入口/出口及验证约束。运行时生成的是本次 Execution 的局部结构，不是永久 Definition、任意源码、新 Function 实现或新权限。用户改变根目标应经过可信业务重新确认/建立适当任务边界，不能通过模型自行改写。

### 4.2 必须支持的结构操作

| ID | 行为 | 产品语义 |
|---|---|---|
| DY01 | 生成节点 | 利用当前有效 Context、已固化 Data Knowledge/Function Knowledge、合法输入绑定和目的构成新的本次运行节点；不是生成任意代码。 |
| DY02 | 插入已有节点 | 在允许的局部位置将已有可复用节点/Function/Workflow 作为新执行实例插入。 |
| DY03 | 插入动态生成节点 | 在运行过程中接纳 DY01 产生的节点并改变局部执行结构；不只返回建议清单。 |
| DY04 | 跳过节点 | 仅能跳过明确可选且当前不适用的节点；必须验证依赖、替代结果与完成条件，记录 SKIP 原因，不伪造执行/结果，不绕过强制关卡。 |
| DY05 | 动态生成子 Workflow | 以运行时组合的合法节点形成新的局部 Workflow，作为上层 Workflow 的一个节点执行；可递归嵌套，具备区域输入/输出、约束、验证和完成条件，实际子路径可观察。 |
| DY06 | 调整未执行结构 | 基于实际观察和用户反馈替换、重排、取消或插入剩余节点；保持必要依赖及边界。已运行节点/attempt/外部 effect 历史不可改写。 |

单步、有限有序/依赖步骤及子 Workflow 为必须；显式复杂并行 DAG、任意条件子图表达或并行优化不是默认新增通用引擎要求，L2 依据真实领域必要性决定有限支持。不得为简化实现把 DY01–06 降级为仅单步 Tool Calling。动态节点可以调用已固化复合 Workflow；动态子 Workflow 是新的本次运行结构，可包含固定及动态节点。固定原生 Workflow 无需为了此能力迁移为通用 DSL。

### 4.3 运行时语义

1. 进入区域：可信定义与已选原生能力给出输入/输出、目标、知识/能力范围、可变节点、不可跳过关卡及限制。
2. 从当前 Context 生成未信任候选（可信程序或 LLM）。候选关联 task/region/revision，声明节点目的、能力、输入/受限引用、依赖及必要结果；不允许运行任意表达式或引入未选能力。
3. 接纳前检验结构/规模/合法能力/输入绑定/数据和控制依赖/环/约束/必需关卡，验证插入或跳过的实际位置与影响；计划接纳不等于业务授权。
4. 真实执行采用同根 Workflow 原生组合；每节点前后验证，真实 Observation 驱动状态和下一步，提供真实进度（完成、未执行、跳过、失效等语义；不提前冻结枚举）。子完成不代表根完成。
5. 状态/知识 revision/用户反馈变化触发受影响结果和未执行候选失效；保留仍适用的已验证结果和所有真实历史。旧 revision 的晚到提案不得采用；在途调用按能力合同取消或观察，未知外部 effect 通过权威核验而非重试或虚构回滚。
6. 达成固定出口/目标验收条件才完成；否则按现有 Outcome 返回或继续有界求解。默认非成功 Outcome + 明确已验证部分证据，不擅自将部分完成视为业务成功。

## 5. 节点前后 Validation 与运行不变量

| 位置 | 必需的运行语义 |
|---|---|
| 父/子 Workflow 入口 | 目标、输入、范围、必需知识及前置条件 |
| 动态结构变更前 | 校验候选、当前 revision、节点关系/依赖、必要关卡、跳过许可及预算可行性 |
| **每个实际执行节点之前** | 节点输入及来源有效、知识适用、依赖满足、前置条件、当前权限、剩余额度；检查失败不调用业务能力；原子预留实际消耗。 |
| **每个实际执行节点之后** | 验证实际结果、业务后置条件、输出合同与观察来源；只有满足节点完成条件才认可其完成/允许下游使用；保持真实失败或 UNKNOWN。 |
| 跳过及分支/合流转换 | 校验适用性及允许转换；跳过不是执行成功；依赖可用，必要结果不缺失。 |
| 父/子 Workflow 出口 | 独立的任务目标完成条件及真实结果，不由模型声明代替。 |

节点前后均具有验证边界，不要求每个简单节点另建独立 Validator Class 或重复 Function 已有不变量；可信已固化合同/原生类型/验证 Function 可共同承担适用验证。无副作用预检与真正授权不同，真实 Effect 复用 .2 业务授权、CAS、attempt/receipt/readback、lost ACK UNKNOWN；不得盲目重放。子 Workflow 同根，限制不重置，取消传播，不越委派范围；内部可信依赖可封装而非全量公开给模型。保持六种既有 Outcome COMPLETE/REJECT/ASK/WAIT/UNKNOWN/FAILED；不得以 invoke 普通值包装掩盖 invokeOutcome 的非成功。非 LLM 路径也执行同等适用的校验。验证和 Evidence 消费者不假冒全业务正确性证明。

## 6. 对抗性与真实需求驱动验收（所有 Oracle = NOT_RUN）

必须先冻结独立业务需求、预期结果、拒绝边界及真实数据/测试数据身份，再生成或实现见证；验收不是快乐路径演示。既要选择具有实际问题复杂度的领域需求，也要主动构造反例、冲突、变化、错误模型返回、越权和资源边界，独立评价真实执行及结果。业务 Oracle 不由被测模型自签；合成 fixture 可用于可复现测试，必须标明非生产证据；真实计算、查询、模型和适用 Host 不可由 Mock 替代；受控错误/恶意提案允许用协议 fixture 精确注入，不能作为真实 Provider 完整闭环证据。

### 6.1 候选领域场景（具体需求与数据、独立 Oracle 于 L2/实施准入前冻结）

- 采购/零件匹配：真实业务需求包含型号兼容性、MOQ/包装倍数、预算、交期冲突；用实际领域查询/计算、受控报价数据、独立枚举/手算合法集合/目标。任务中新增替代件或供应商查询节点、插入已有检查节点、跳过已被有效事实满足的可选重复查询、动态生成候选比较子 Workflow；用户改变预算/交期仅重做依赖部分；非法适配、报价修订、伪造报价或企图跳过必需检查不得成功。采购方案为 read-only；不宣称下单。若验证 effect，另外使用已合格实际 order/inventory Host 的正负例。
- 维修/工序排程：实际工序依赖、技师/设备容量、工期/成本约束、缺少信息及不可行输入；真实专业求解器（已有 SciPy witness 可复用）、独立小规模穷举或业务约束 Oracle；无模型也能生成动态节点/子计划并实际运行，反馈/资源变化触发局部调整；拒绝循环依赖、超容量、非法跳过前置工序、过期结果。区分求解结果与实际工单派发。
- 保留已有 media/order/inventory 见证作为实际授权/真实观察/UNKNOWN 回归来源，选用最小必要新增真实场景；若两个候选不能证明某项能力，补最小独立对抗场景而非降低门槛。至少两个实际独立用途证明 Standard 复用（EL-12）；最终独立陌生 Consumer 生成与维护用于外部 QA，不是 SDK 生成能力。

### 6.2 可证伪验收矩阵

| AC | 必须观察的结果 | R1/后续映射 |
|---|---|---|
| AC01 | 已知可解任务实际零 Provider 初始化/请求，无凭据亦能运行；同一领域适用时使用真实 LLM；权威未知、权限不足不能靠模型填补。 | BR01, R5 |
| AC02 | 两类协议合同分别覆盖文本、结构化输出、tool ID/result、拒绝/错误/超时/取消/usage/不支持能力；至少一个真实 Provider 贯通实际领域闭环，不把协议 fixture 当真实模型。 | BR02,07 |
| AC03 | 结构无效、截断、schema 合法但业务错误、虚构来源、提示注入、未知 Function、越权和不合法参数被拒绝，不实际调用非法能力；合法调用产生实际观察。 | BR03,08 |
| AC04 | 实际不同节点得到不同预选知识/Function 及真实进度；事实/知识 revision 或用户输入变化改变结果，旧提案无效；关键约束不被裁掉，不泄漏其他任务/秘密。 | BR04,11 |
| AC05 | 固定、局部动态、大范围有界动态，非 LLM/LLM/混合适用组合；真实模型→Function→Observation→模型再入及真实结果校验；单次推理不强制循环。 | BR05,R3–R6 |
| AC06 | DY01–06 全部以真实执行结构观察：新节点生成/插入、已有节点插入、合法跳过、生成并执行嵌套子 Workflow、调整后续节点；在至少两个真实领域用途组合验证。 | R10 |
| AC07 | 对抗结构变更：强制节点跳过、非法插入点、缺失/未完成依赖、循环、伪造输出、过期 revision、重规划越界、未知节点/Function 均不能绕过合同；原始 Definition 与实际历史不变。 | R4,R10 |
| AC08 | 每节点前后验证（固定、动态、子 Workflow、非 LLM/LLM）：前置失败无业务调用，后置失败不能推进成功；独立根完成条件；跳过不伪造结果。 | BR03,R10 |
| AC09 | 父子同根预算，零/少一额度、深度、重试、token/time、无进展、取消及过期响应负例；实际调用前限制生效；无预算重置或虚构费用。 | BR06,07 |
| AC10 | 同一原生 Function 直接调用和作为 Tool，稳定子 Workflow 合同复用；两实例/多次调用真实身份不混淆；私有能力不暴露。 | BR08,R6 |
| AC11 | 实际 Interaction 与 Reasoning 双向同根，用户修正触发局部失效和重规划，保留有效结果；不重复询问已确定事项；另一任务不受等待/取消影响。 | BR10,11 |
| AC12 | 实际 Host 授权正负例：PREAUTHORIZED、用户批准、PER_CALL/SESSION、错误主体/载荷/revision、旧批准、CAS、lost ACK/readback UNKNOWN；不得自动重复未知 effect 或错误宣称完成。 | BR09 |
| AC13 | 实际消费者收到可关联、脱敏的模型可选 Evidence；包括真实结构变更、跳过、拒绝/修正、调用与验证事实、用户反馈及终态；无模型不虚构模型用量；不实现经验提取。 | BR12,R5,R10 |
| AC14 | 至少两个独立真实用途复用可直接使用的 Standard；安装实际 clean-packed SDK（Node >=22.12.0，适用 Linux/Windows），验证根公开面、文档及受影响历史能力；无重复手写机制冒充复用。 | BR13 |
| AC15 | 独立陌生 Consumer 仅使用实际 SDK 公共工件/API 说明、冻结真实需求及外部资格材料，完成 Package 与维护任务，编译/测试/业务 Oracle 独立评价；保留首轮与维护证据，不做未经设计的因果宣称。 | BR14,QA09A/B |

## 7. L2 需要解决的工程边界（非本文件技术冻结）

- 实际基线 NativeWorkflowContext/StandardWorkflowSession 共享调用/步骤/深度、child/invokeOutcome/leaf；remaining 是只读快照，非预留；XStateWorkflowElement 当前终态输出不等同自动进度；InteractionElement.run 创建根。必须实证同根嵌入及可观察语义进度，若基础缺口归 .1/.3 修正，避免双执行机制。
- 现有 resolveEvidence/invalidateEvidence 是已取得证据的有界解析/依赖失效，不是自动知识获取/动态流程引擎；可复用其真实合同，不预设全部新能力已存在。
- 确定动态结构表示、插入/跳过/生成子 Workflow、版本与依赖、实际进度、节点前后验证、同根取消/资源预留、两协议适配、最小 evidence seam、领域对抗 oracle。选择原生表达或有限动态数据表示及必要执行组合，不按类数量设目标，不强制 Node Class/全局 Registry/第二 Runtime。
- 现有 Skill/规范/生成期检查属于工程或 Forge 过渡材料，不是 SDK Runtime 能力。运行 API 说明可随工件提供；实际生成工具须隔离，未来迁移 Forge。具体仓库目录与包装边界留 L2；不启动 Forge 重构。
- 独立 Product/L1 审核须确认来源映射、动态结构操作/前后验证、真实需求和对抗门禁、范围及非目标；接受后冻结，才进入 L2 独立审核、Task DAG、源码实施与真正 Oracle。0.11.x 是统一重构阶段，不单独发布、不合 main、不 Tag/npm publish。复用未变化合格证据，实际受影响部分重新验证。所有 AC NOT_RUN。

## 8. 本轮记录

Owner 已确认 R9 P01–P15，R10 增加 DY01–05（DY06 作为调整语义展开）、逐节点前后验证、真实需求及对抗性资格要求；其余采用 R9 推荐方案。具体例题、阈值、技术表达是待审核候选，不是 Owner 指定的实现细节。未修改 SDK、未执行 CI/测试/真实模型、未冻结 L1/L2、未实施/重构 Forge。
