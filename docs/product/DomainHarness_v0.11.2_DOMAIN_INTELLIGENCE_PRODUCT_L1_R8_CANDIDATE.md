# DomainHarness 0.11.2 · Domain Intelligence Product/L1 功能澄清候选（R8 + R9）

```ini
OUTPUT_LABEL=DH_V0112_R9_DOMAIN_INTELLIGENCE_PRODUCT_L1_ARCHITECTURE_AMENDMENT
REPO=kaicreator-mm/domain-harness
VERSION_ISSUE=#1612
MASTER_ISSUE=#1563
OWNER_GATE=R7_PRODUCT_L1_REVIEW_REQUIRED
BASE=version/v0.11.x@1be3a099b5c3a476edfddd5a29e032efb1e3823c
UPSTREAM_0111=R173_ACCEPT_SCOPED_MERGED_SAME_TREE
PRODUCT_L1=PROPOSED_AWAITING_OWNER_APPROVAL
L2=NOT_STARTED
IMPLEMENTATION=NOT_AUTHORIZED
OLD_CANDIDATE_PR=#1667_DRAFT_HISTORY_ONLY
RELEASE=NO
```

> **本文件是供 Owner 审核的产品需求候选，不代表 L1 已冻结，也不是 L2 或实现许可。** 先澄清产品 WHAT 和可观察结果，再做方案比较、L2 独立审核、任务最小化和真实实现。优先于 #1666/#1667 旧机制中的任何设计假设；保留其真实负例与历史证据，但不移植已删除的代码接口。

> **R10 新增产品范围澄清（尚待 Owner 认可）：** [Domain Storage & Multi-Query R10](./DomainHarness_v0.11.2_STORAGE_QUERY_SCOPE_R10_PROPOSAL.md) 提议把 SQLite 本地持久化、YAML/JSON-LD 双向读写、SQL/Vector/Graph Query 纳入 0.11.2，保留 0.11.6 的 TaskRun/Checkpoint/恢复职责。**本文件原 R8/R9 的“不强制 SQLite/向量查询”是旧提案，不可再直接视为有效范围结论。** R10 新增 DI-AC15–21，仍是 PROPOSED，不是已批准/已实现。

> **Owner 最新 SDK 边界明确：** DomainHarness 是**不含任何具体领域业务**的 SDK。0.11.2 的 Product 包括跨任意 Domain 的语义抽象、Knowledge/Fact/Rule/Recognizer/Validator/Decision/Intent/Applicability 通用合同、SQLite/YAML/JSON-LD 领域中立存储及属性/字符串/向量/图查询、与原生 Element/Workflow 的通用组合机制。**具体业务概念/实体/知识内容/阈值/Rule/Recognizer/Validator/Decision 函数全部属于 SDK 外部的 Domain Package 或 Domain App；订单和库存只是消费者测试用例，不能影响 SDK Schema 或成为 SDK 依赖。** 相关细节见 [R11 领域无关 SDK 与 Element-First 边界](./DomainHarness_v0.11.2_ELEMENT_FIRST_INTELLIGENCE_R11_DESIGN_OPTIONS.md)。R8/R9 关于两个领域的论述仅作为通用性的跨域验收，不能曲解为 SDK 要实现两个领域的业务。

> **R13 新增语义化 SDK 抽象与 LLM Authoring 澄清候选：** 详见 [R13：语义/Element/Function/Workflow/DB 能力/表达式/Skill 统一架构](./DomainHarness_v0.11.2_R13_SEMANTIC_ELEMENT_WORKFLOW_DB_EXPRESSION_SKILL_PRODUCT_CLARIFICATION.md)。R13 复查 v0.10.3 实际源码，确认历史表达式引擎为 JSONata；提出基础 Database Element 与 SQL/Text/Vector/Graph 可选能力的组合，Workflow 基于业务原生调用不新增执行平台，Skill/能力说明以真实 TypeScript exports、TSDoc 和规范为唯一可信接口来源。**所有候选名称、功能入口及 Skill 新目录均未实施、未验收，等待 Product/L1 Owner 裁决。**

> **R14 语义 Workflow 正式建模候选（待 Owner 裁决）：** [Semantic Workflow Model · R14](./DomainHarness_v0.11.2_R14_SEMANTIC_WORKFLOW_MODEL_AND_COMPOSITION.md) 纠正 R13“把 Function 接进 Workflow 就等于领域智能”的不足：明确 Domain Semantic Model → Semantic Capability Model → Semantic Workflow Model（语义 Port / Data、Control、Evidence 三类连接）→ **现有** StandardWorkflowSession/XState 执行。语义兼容、必需事实、Scope/Snapshot、来源及 Outcome 传播需要可验证；不建立第二执行 Runtime，具体领域 Function 均由外部 Business 提供。新增 DI-AC29–34 仍是拟验收、NOT_RUN。

## 1. 产品目的与实际消费场景

DomainHarness 0.11.2 应让 Domain App 在一个**明确受选的领域语义范围**内，利用可追溯且有适用边界的领域事实、知识与规则，形成可解释、可复现的确定性业务判断，并将判断作为 0.11.1 已有 Workflow/Task 的输入/分支依据。**领域知识必须改变真实业务结果**；“把 JSON 解析出来”、一次成功 Demo 或给一个示例写死政策分数，不构成本版本的通用领域智能。

本版应在当前唯一 [原生 Domain App](../../examples/native-domain-app/main.mjs) 上累积验证：其现有订单政策（OrderPolicyElement）与库存政策（InventoryElement）已是两个不同领域；二者应共享**适用的领域事实/来源/范围/查询语义**，但具体订单阈值和库存补货规则仍归各自业务 Element。不能恢复已删除的 `examples/reference-domain-app` 和旧 Runtime，以“保留历史 App”名义重新建立 FunctionRef/Target/Lock/Boot。

### 用户可见的核心能力

1. 明确当前判断依赖**哪个 Domain、哪个已选择的知识/规则版本、哪个主体/范围**，不把一个普通 Package 等同整个 Domain。
2. 当确定的有效事实和规则足够时，给出可解释的决定及来源引用；同一 Goal 下仅改变有效的选定知识或适用范围，真实输出应发生预期变化。
3. 当信息不足、超期、冲突、跨 Domain 或不适用时，输出 **ASK / UNKNOWN / REJECT 等明确非成功语义及稳定原因**，绝不能猜测成功。
4. 在当前语言原生 SDK 中用普通 Package、Element、Function、资源与 Workflow 组合；领域通用能力可复用，业务知识不硬编码进 KDP。

## 2. 七项待 Owner 确认的产品决定（候选首选方向）

| 决议 | 建议的产品边界 | 反例/不采用 |
|---|---|---|
| **D01 Domain 身份** | Domain 是**显式的领域语义和适用边界**，具有稳定 id 和选定版本；可以横跨多个已选择的 Package，也允许一个 App 消费多个 Domain；不以“一个 Package = 一个 Domain”作为强制定义 | 新建 Domain Runtime Container/Loader、用 npm packageName 当唯一业务 Domain 标识 |
| **D02 结构化语义范围** | 最小描述 Concept/Entity、Attribute、Relation、Fact、Constraint 与可选业务 Goal/Operation 关联；真正需要这些关系时才声明，且可由普通 TS/数据表达 | 强制完整知识图谱、Ontology Server、全局动态 Schema 或将任意 helper 变成 Element |
| **D03 Source/Truth** | Source/Provenance、数据版本、证据身份、观察与有效期、地域/主体/场景 Applicability 必须可表示、可追溯；内容完整性、来源声称和来源真实性 **三者分开**，SHA256 不能单独证明签名或业务真伪 | 将开发者声明的 `source` 字符串当权威认证，或直接把命中规则等同外部世界真实事实 |
| **D04 领域能力职责** | Knowledge 查询、Recognizer 识别、Validator 校验、Rule 评估、Decision 输出是**可观察的职责/组合方式**，可由普通 Element Class/Function 实现；同类通用机制可复用，业务策略留在领域 Package | 强制建立五种 SDK 根接口/Element.role 全局枚举、另一套 Rule VM 或 KDP 领域调度中心 |
| **D05 范围内 Query** | 只读取已静态选择、适用、可核验来源的有限知识集合；过滤 Domain/Concept/Subject/Time/Scope/Version，返回有界结果与来源引用；支持必要的多来源冲突检测；SQLite/SQL/向量/图查询新增需求见 R10 候选，仍不强制 RAG | 运行时自动下载未知知识、任意网络搜索或无界拼接证据 |
| **D06 决策/Task 分界** | 0.11.2 提供领域判断及明确依据、必要时选定已声明的 Workflow/业务分支；执行、预算/Hook/生命周期由 0.11.1 既有能力承担，业务 Effect 权限归 0.11.4 | 在本版直接执行真实 Host Effect、构建独立任务引擎、自动选择未安装 Package |
| **D07 共性验收** | 订单和库存**至少两个真实不同领域 Consumer**共同验证通用事实/来源/范围/查询语义，且分别拥有不同政策与失败案例；一个合成数字阈值实例只能作为局部证据 | 只有单一 Reference Score 数据集的 10–11 个测试就声称领域通用 SDK 已完成 |

**建议审核方向：D01–D07 先确定“产品责任和可观察语义”，但不在 L1 锁定某个 TypeScript Interface、数据库、文件结构或类名。** 具体公共 TypeScript 类型是否进入 SDK、哪些进入 Standard、哪些属于领域业务 Package，必须在 L2 以两种消费场景证明确有复用后裁定。这里保留组合的演化空间，而非提前新增大抽象。

## 3. 产品对象及最低语义信息

| 对象 | 最少需要区分的产品信息 | 合法的 UNKNOWN/不适用 |
|---|---|---|
| Domain Boundary | 稳定 Domain ID、选定领域版本、适用概念与上下文；与 Package ID 是两个独立身份 | 请求 Domain 不在选定范围内，不得跨域复用事实 |
| Concept/Entity/Relation | 有界名称/标识、所属 Domain、属性/关系的语义和必要约束 | 不存在或没有已定义关系，不凭相似词臆造关联 |
| Business Fact | 稳定 Fact ID、subject/predicate/value（或等价领域形态）、类型、Domain 和关联 Source | 缺值/错类型、同范围内互斥事实冲突、领域不匹配 |
| Source/Provenance | Source ID、声明者/出处、选定数据集/版本、事实对应引用和完整性证据的**性质** | 只持有校验和但来源真实性未获确认：不声称已认证；缺关键出处可能无法用于受约束决策 |
| Applicability | 版本、时间（真实日历/时区策略）、地域、主体、条件/场景；仅检查本次 Goal 实际依赖的维度 | 失效、尚未生效、错误地域、主体不适用、非法日期与不完整范围 |
| Rule/Constraint | 领域归属、标识和选定版本、需要的事实、判定条件与输出理由；不重复写死事实值 | 依赖事实缺失、冲突或不可用不得降级为默认“允许” |
| Decision/Evidence | 明确结果、稳定代码、实际使用的 Fact/Rule/Source 版本引用以及 UNKNOWN/ASK 的成因 | 没有业务 Readback 不宣称真实 Effect 成功，不把模型推测当确定事实 |

这些是**最低产品信息要求而非固定 JSON Schema**；具体信息可直接来自编写者提供的普通 TypeScript/JSON/YAML 文件和选定 Package。无关字段可按适用性不使用，但不得把必要信息缺失解释为可信的 TRUE/FALSE。

### 来源边界及确定性处理原则

- 静态可信组合/文件完整性由作者、生成者、安装及交付链证明；**SDK Runtime 不重新做 Package/Element 正确性扫描**。
- 运行时对业务请求、时间、地域、事实类型、相互冲突等**业务有效性**做正常处理；这不等于重新引入旧 App Lock/Target 校验。
- Query 允许多个选定来源，须保留每个来源实际参与的证据引用和冲突原因；不能依靠数组顺序、最后覆盖、最高分来悄悄选择胜者。若业务声明明确的优先级/权威依据，应作为可追溯的规则被验证，不是 SDK 的隐式“来源评分”。
- 事实有效期不等于自动真伪认证；`observedAt`、`validFrom/To`、所选知识版本用途不同。日历非法（如 2026-02-31）必须被拒绝或 UNKNOWN，而不是字符串顺序比较后可产生 COMPLETE。
- 确定性指：**同一选定知识/规则 + 相同有效请求/范围 + 相同显式时点/约束**，输出和其理由稳定；不能偷偷依赖当前机器时钟、随机外部搜索或未钉住的知识更新。

## 4. 输入、输出与分支的 L1 约束

输入至少可以表达：Goal/Operation、Domain ID/Version、查询 subject/concept/attribute、业务请求的事实、适用区域/主体/评估时点、已选知识与规则范围、有限查询额度。无需所有业务都输入同样字段，但它的规则真正需要的字段必须被检查。

输出至少表达：

- **可决定**：已使用的条件、已选 Rule/Fact/Source 引用、规则实际结论，通过现有 `WorkflowOutcome.COMPLETE` 传递成功的确定性计算结果，或以 `REJECT` 表示合法业务拒绝；
- **可补问**：缺少能由交互补充的输入可以返回 `ASK`，指出具体缺项；本版不实现 UI 或持续会话；
- **暂不可判定**：冲突、过期、不足、真实性待核实可返回 `UNKNOWN` 和稳定 reason code；`NOT_APPLICABLE` 是**原因分类**，不是偷偷给现有 WorkflowOutcome 新加未经设计的状态值；
- **技术失败**：读取失败、解析错误、额度耗尽应明确 `FAILED`（按已有 Standard Workflow 状态），不与业务 UNKNOWN 互相冒充。

Query 的领域查询结果与 Workflow 的六种现有运行终态并非必须使用同一类型；映射须**显式且不提升成功**，交由后续 L2 决定最小合同形式。不得向 Core/KDP 注入强制业务字段。

## 4A. R9 · 跨版本架构审核补足的产品裁决条件（仍为 Owner 候选）

这部分补充 R8 D01–D07 的**可观察语义与准入约束**，不是预先指定 TS Interface、JSON Schema、Rule VM、Package 生成器或独立 Runtime。保留七项 Owner 决议，不增加不必要的新产品决策门。

### D01/D02 · Domain 边界、引用与最小关系

- `DomainId` 代表稳定的业务语义命名空间；`DomainVersion` 代表已明确选定的语义合同版本，不等于 npm Package 版本、知识数据集版本、Rule 版本或 Git SHA。一个 Domain 可以由多个直接选定的 Package 供给知识/规则，一个 Package 也可以导出多个领域能力；无隐式全局 Domain Registry、运行时热发现。
- Fact/Rule/Concept/Entity/Relation 的引用必须能明确其 Domain 和命名范围；同名 Entity、Concept、谓词、Rule ID 在另一 Domain 下**不自动等价**。确需跨域消费时，由业务显式选定映射或转换及其出处、版本、适用条件；不存在映射就返回非成功，不依靠名称相似或跨域扫库。
- v0.11.2 **至少实测一个有实际业务意义的 Relation 或 Constraint**（例如订单是否满足与库存可用性的已声明约束），不强制实体图数据库或通用推理。该关联不赋予任一 Domain 隐式读取另一 Domain 任意事实的权限。

### D03/D05 · 已选知识快照、来源等级与冲突

- App/Package 作者显式选定本次可用的数据源/规则集合及其版本或等价不可变快照；Source ID、Fact ID、Rule ID、知识版本、领域语义版本、包版本须保持不同身份。**相同业务请求只有在已选输入和快照相同**时才承诺决定可复现；运行时不得无声明地切换到新版本/新来源。
- 区分**应用明确选定**、**内容完整性得到检查**、**来源声称可追溯**、**真实性/授权经外部证据确认**四种不同事实。仅被静态 import 或记录 SHA256 的知识，不自动具备真实世界权威；是否足以支持某项业务规则由该 Rule 的显式信任要求裁定。缺必要信任等级返回 UNKNOWN_UNVERIFIED（或稳定等价原因），不能假造认证。
- 多来源查询先按请求 Domain、所选版本和有效范围过滤，再识别同一语义键下相互排斥的有效 Fact；**不能靠导入顺序、数组下标、最后写入者或隐式优先级**消除冲突。选定的权威顺序/优先级若存在，必须是领域规则的一部分并在 Decision Evidence 中明示；无可用裁决规则则 UNKNOWN_CONFLICT。
- 区分：没有事实（MISSING / ASK 或 UNKNOWN）、事实存在但不适用（NOT_APPLICABLE 原因）、存在互斥事实（CONFLICT）、已选事实不满足信任要求（UNVERIFIED）、数据文件/Reader 技术损坏（FAILED）。非成功不得被包装成 `COMPLETE`。

### D04/D06 · Rule 选择、解释与 Workflow 接线

- Rule 评估对输入的知识、上下文、版本和受约束的事实集负责；业务阈值/库存策略存在**唯一可追溯权威源**，不能在 Fact 和业务 Function 中同时维护相互独立的数值。变更选定的知识或适用范围必须真实改变 `OrderPolicyElement` / `InventoryElement` 决策结果。
- 多条规则同范围命中时：若规则明确声明优先顺序/组合策略且前提均可判定，按可解释策略产出结果；否则互斥结论返回 UNKNOWN_CONFLICT，不以第一条命中或成功默认值掩盖冲突。Rule 无权自行执行未经许可的 Effect、调用 LLM 或加载其它 Package。
- 每次 Decision 只引用**实际用于本次判断**的 Fact、Rule、Source 和所选版本/适用范围；Query 命中但未参与决策的内容不得伪装为已使用证据。证据不表示业务外部 Effect 的执行回执。
- Query/Decision 的领域结果到 `StandardWorkflowSession` 的映射必须显式：`ASK / WAIT / UNKNOWN / REJECT / FAILED` 不提升为 `COMPLETE`。使用 0.11.1 已有 `invokeOutcome` / `leaf` 和共享根预算，不新建 Task/Workflow 执行器。

### D05/D07 · 有界读取与两领域复用的验收口径

- Query 在使用前有明确有限的**输入/来源/事实候选规模、返回条数、证据规模和调用预算**；不能先无界分配或扫描未知大数据，再以超限错误宣称资源有界。允许由受选 Package 自己限制内容大小，或利用现成 Reader 上限；不要求 SDK 声称可对任意恶意 JS 对象实现沙箱级限制。
- Query 作为可独立调用的普通函数/Element 能力，必须自行验证本次请求依赖的 Domain、语义版本、日历日期及范围；不把唯一正确性守门放在上游 Recognizer。业务输入为非法日历日期或非数字阈值时不得完成决定；时间比较明确评价时点与时区/日历约定，不把字符串字典序当日期合法性。
- Order 与 Inventory 应在**同一个现有 native-domain-app** 下使用相同的通用 Query/Fact 适用性/来源/证据处理实现（不是分别复制两个实现）；领域专属规则仍位于各自业务 Element/Package。若复用只由一个小型普通 TS 工具/可组合 Package 满足，不为“标准化”强行新增 SDK public 根接口；若确有跨域应用级复用收益，L2 说明为何升级为 Standard。
- 两个领域都必须有改变选定知识/范围而改变结果的正例和至少一个业务相关非成功/冲突负例；还须验证直接 Query、完整 Workflow 两个入口。保持当前 AC01–AC20 的真实可观察行为与单公开 SDK clean consumer。

## 5. Product/L1 验收标准（后续 L2 应保留，不是已运行证据）

| ID | 观测场景 / 最低门槛 |
|---|---|
| **DI-AC01** | 同一个原生 Domain App 使用**两个实际不同领域**（订单政策和库存补货）；两者显式区分 Domain 身份和选定规则版本，不复制一份 SDK Query 内核才能工作 |
| **DI-AC02** | 两领域都能消费结构化 Fact/Source/Version/Applicability；至少包含一个关系或约束用例，而不只是任意 JSON 属性读取 |
| **DI-AC03** | 同 Goal/数值，只变更**明确选定的知识内容或适用范围**，会产生可解释且不同的业务决定；业务 Function 不另硬编码同一阈值 |
| **DI-AC04** | 决策输出列出实际引用的 Fact ID、Rule ID、Source ID、数据/规则版本及适用范围；无消费证据不得虚构引用 |
| **DI-AC05** | 不足事实进入 ASK/UNKNOWN，冲突事实进入 UNKNOWN_CONFLICT，源声明/权威不满足当前规则进入 UNKNOWN_UNVERIFIED（或等价原因），无静默随机决策 |
| **DI-AC06** | 过期/尚未生效/地域或主体不适用进入非成功，错误 Domain/Version 无法借另一个 Domain 的来源得出 COMPLETE |
| **DI-AC07** | `2026-02-31` 等不存在日期、非法地区/subject、缺失关键类型，既不能经完整 Workflow，也不能绕过上游直接调用 Query 而误判 COMPLETE |
| **DI-AC08** | 资源查询在确定界限内返回结果；超出实际查询/Workflow 预算不得执行额外 Reader/Rule 副作用；不强制安装数据库 |
| **DI-AC09** | Knowledge/Recognizer/Validator/Rule/Decision 的职责可观察（不要求五个必须独立 Class），规则/事实被实际使用而非只在测试里对照；最终通过已选 Workflow/Task 执行 |
| **DI-AC10** | 普通知识类型及 Query 语义跨两个业务复用；领域特定策略分别由订单/库存 Package 持有。新 SDK API 的加入必须给出独立可复用收益证据 |
| **DI-AC11** | 当前 SDK **单直接安装**、Node22+原生 ESM、静态 Package 依赖、真实 Stage 累计 App E2E；保留 0.11.0 AC01–10、0.11.1 AC11–20 与 R164/R168/R173 限定回归 |
| **DI-AC12** | 原始 Evidence、Actual CI 与 Exact SHA、独立非 Writer Review、Stage Index 只在实际通过后记 ACCEPT；失败、未运行、无可信来源分别明确记录 |
| **DI-AC13** | 真实事实/规则完整性、来源真实性、权限/运行条件分开说明；SHA256 摘要不得在文档/代码命名中冒充“经证书签名的政策权威” |
| **DI-AC14** | 缺失领域语义、规则冲突或无法判定时不能隐式触发 LLM/Effect，也不能代替 0.11.4 Host 授权或 0.11.5 bounded reasoning |

**R9 对 DI-AC01–14 的验收细化**：DI-AC01/02/10 必须证明领域标识不等于 Package 标识、跨域不自动匹配、两领域共享**同一**查询实现且存在有意义的关系/约束；DI-AC03/04 应对明确选定的同一快照重复运行得到相同结果与证据，并展示单一业务阈值来源；DI-AC05/06 应把 MISSING、NOT_APPLICABLE、UNVERIFIED、CONFLICT、技术 FAILED 逐类区分，补多 Rule 冲突负例；DI-AC07 应直接 Query 拒绝非法真实日历/跨域/版本；DI-AC08 应观察 Reader/Rule 调用次数以及超限**前**副作用；DI-AC09/11/12/13/14 仍按 R8 原验收，不能以 L1 文档代替运行、CI、独审或授权证明。

**负例级别应覆盖两个调用入口**：完整 Domain App/Workflow 消费、以及未来合法的直接业务 Query/Decision Function 消费。不能仅凭上游 Recognizer 做了验证，就允许独立 Query 跨 Domain 读取来源（旧 R6 P1）。

## 6. 现行代码与旧候选的取舍

**现行基础**：唯一 npm SDK `@kaicreator/domain-harness`，`KernelLifecycle<Context>`、`StandardWorkflowSession`、`NativeWorkflowContext.invokeOutcome`、`JsonReader/YamlReader`；当前 [native-domain-app](../../examples/native-domain-app) 已有 Order/Inventory 两个独立领域、显式资源和业务 Outcome。0.11.1 的[跨版本基础审核](../engineering/DomainHarness_v0.11.x_CROSS_VERSION_ABSTRACTION_AUDIT_R169.md)已确认 typed Context/在途关闭/Outcome 传播为可用基础，**不在本阶段重做**。

**旧候选 [#1666](https://github.com/kaicreator-mm/domain-harness/issues/1666) / [Draft PR #1667](https://github.com/kaicreator-mm/domain-harness/pull/1667)**：原样保留历史技术尝试及 CI #2985；但它基于已删除的 `examples/reference-domain-app`、专用 `FunctionRef/Target/Lock/Boot` 等机器 ABI，和现行 Canonical [Core](../specs/domain-harness/core.md)、[TS Profile](../specs/domain-harness/typescript-profile.md) 不相容，不可直接合并或冒充已完成。仍可复用**真实业务验收意图**：版本/地域不同改变判定、事实冲突/超期/跨 Domain、真实知识内容参与输出、知识修改需要更新生成期证明。

旧 R6 [独立复审 REWORK（P1×2、P2×1）](https://github.com/kaicreator-mm/domain-harness/pull/1667#pullrequestreview-6013065882)提供三项必须继承的反例：
1. 真实日历合法性（不能用字典序替代），以及独立 Query 也应检查相关范围；
2. 直接调用 Query 不得忽略输入 Domain 导致跨 Domain 混用；
3. SHA256 内容完整性证明不等于政策文件经可信来源签名/认证。

旧 PR #1667 维持 **Draft/Unmerged/History Only**；正式 L1 经 Owner 确认、L2 独立审查后才能决定关闭旧任务并在现行 SDK 上建新实现任务，不提前套用旧代码设计。

## 7. 本版明确不做及后续归属

- 不开发通用 Knowledge Graph/RAG 引擎、知识爬取/生产、训练和自我进化；这些不属于 0.11.2 产品验收。
- 不构建 DomainForge、Package 生成平台、专用 Runtime Package Loader、独立 Domain Container、统一权限调度器或第二 Workflow VM。
- R10 提议 SQLite 本地领域持久化及 SQL/向量/图查询为本版必需；不要求独立向量数据库/图数据库、外部 DB 服务、LLM 或网络下载。具体引擎与索引在 Owner 确认后进入 L2 比较。
- **0.11.3** 才负责交互式 Goal 理解及 UI；**0.11.4** 才负责 Host/Capability/Effect/授权；**0.11.5** 才负责有界 LLM/Tool；**0.11.6–0.11.9** 才负责持久任务、执行证据、Client 经验与 Server 进化。
- 领域包可由人/Agent 手工编写；作者/生成期保证 Package/Element 规范，SDK Runtime 仅做已有兜底，不增加“来源摘要验证器就是可信来源裁定器”。

## 8. 审核、L2 与实施门禁

1. **R8/R9/R10 Product/L1：** Owner 审核 D01–D07、DI-AC01–14 和 R10 新增 DI-AC15–21、范围与不做项；有冲突则修订本文件；当前 `PROPOSED`，不得因文档创建自动冻结。
2. **Owner 明确确认后 · L2：** Owner 对 WHAT 范围确认后，比较“只用 Business 原生代码”“有限共享 Standard 类型/Query”“复用第三方库”方案；冻结最小 TypeScript/文件/Function/领域数据和读取边界，并作独立非 Writer 设计审核。不可根据旧 PR #1667 中专用机器合同偷渡 L2。
3. **L2 独立审核通过后 · Task：** 整理 #1666/#1667 旧候选，确立一个最小有界新 Task/PR；基于当前 train / 当前 native-domain-app 做 2 领域实际消费，必须执行生成期验证、严格 Types、阴性与阳性业务测试、clean-pack 外部消费者。
4. **Task 实施完成后 · QA/Review/Integration：** 新 Exact HEAD Woodpecker 成功及必要非 Writer 独立增量审核后受控合并 `version/v0.11.x`，对比受审树/合并树，回写 #1612/#1563 Stage 证据。不得提前合并 main、Tag、npm Release。

**正式状态：仅 Product/L1 候选，0.11.2 尚未获得 L1 Owner Freeze、L2 独审或源码实施资格。**
