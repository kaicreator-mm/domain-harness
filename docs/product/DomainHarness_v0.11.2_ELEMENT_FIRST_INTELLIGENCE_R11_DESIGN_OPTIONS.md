# DomainHarness v0.11.2 · R11 Element-First Domain Intelligence 抽象与查询架构澄清（方案候选）

```ini
OUTPUT_LABEL=DH_V0112_R11_ELEMENT_FIRST_INTELLIGENCE_ARCHITECTURE_OPTIONS
REPO=kaicreator-mm/domain-harness
VERSION_ISSUE=#1612
PRODUCT_PR=#1702
UPSTREAM_R10=DOMAIN_STORAGE_AND_MULTI_QUERY_PROPOSED
STATUS=PROPOSED_DESIGN_DIRECTION_NOT_L1_FROZEN
L2=NOT_STARTED
TASK_DAG=NOT_STARTED
IMPLEMENTATION=NOT_STARTED
```

> 本文根据 Owner 四个设计问题说明**候选抽象方向**，与 [R10 存储/查询功能](./DomainHarness_v0.11.2_STORAGE_QUERY_SCOPE_R10_PROPOSAL.md) 一起交付 Owner 进行 Product/L1 澄清。类型名、表名、包名与代码片段均为**讨论样例，不是当前 SDK 已公开 API 或正式 L2 合同**。先确认领域功能 WHAT 与边界，再开展 L2 比较和独审。

## 0. Owner 澄清：DomainHarness 是**领域无关 SDK**，不是任何具体领域的实现

**架构基本约束（Owner 已明确，R11 必须遵守）：**

- DomainHarness 0.11.2 **仅实现领域共性抽象和通用机制**：Domain/Concept/Entity/Relation/Knowledge/Fact/Rule/Recognizer/Validator/Decision/Intent/Applicability 的可复用语义合同，领域数据的存储、查询、适用性、来源、规则/决策组合及 Workflow 接线；对任意领域均成立。
- **不在 SDK 内定义实际行业概念、业务实体、政策、阈值、识别标准、验证条件、Rule/Decision 业务算法或领域特定数据表**。`Order`、`Inventory`、SKU/补货等仅是仓内外 Consumer/测试夹具，用于证明 SDK 的通用能力，并非 SDK 产品对象、依赖或默认逻辑。
- **业务 Domain Package 由 SDK 消费者/作者实现**。其领域专属 Concept、Relation、Knowledge、Recognizer、Validator、Rule、Decision 具体内容和策略归消费者，不得反向写入 `@kaicreator/domain-harness` 的公共核心。Business Element 可以复用 SDK 的通用能力，但 SDK 不依赖任一 Business Package。
- “通用抽象”不等于所有名词必须变成抽象 Class。可用**参数化 TypeScript 数据合同、结构化 Function 签名、内聚的 Standard Element、组合工具**共同提供。对于 Recognizer/Validator/Rule/Decision，SDK 可以提供通用的输入/输出/上下文/证据/拒绝合同与可复用组合机制，**具体 Function 必须由业务注入或直接调用**，不得硬编码行业知识。
- SQLite/JSON-LD/YAML 与 SQL/属性/文本/向量/图 Query 的数据模型也必须是**领域中立、可扩展、可限定版本/范围**的；例如使用通用 Entity/Property/Relation/Fact/Source/Vector 引用，不在 SDK 中创建固定的订单表、库存表或面向某行业的 SQL。特定领域可自定义投影/索引，但必须留在外部领域 Package。
- KDP 仍只有最小生命周期/最终兜底；不新增领域调度 Runtime、集中 Rule VM、运行期业务插件发现或必须依赖 Forge。独立可用的普通 TS/Node/SQLite 方案优先。现有 Element-First 合同不改变。

**产品检验口径：** 只替换 Domain Package 提供的概念/规则/知识/函数及数据，**不修改 SDK 源码、公共数据表或通用查询实现**，即可在两个语义不同的领域完成读写、检索、适用性、规则评估、Decision Evidence 与 Workflow 组合。至少一个“从零创建的新领域”消费者应仅依赖发布的公开 SDK，避免以 SDK 内特制订单/库存逻辑假装通用性。

### 各项真正由 SDK 提供的通用抽象

| 领域对象/能力 | SDK 通用合同/机制 | 具体业务 Domain Package 提供 |
|---|---|---|
| Domain/Concept/Object/Relation | 稳定语义引用、类型/属性与关系描述、范围/版本、通用图存取 | 实际行业概念、实体结构、关系名称和业务含义 |
| Knowledge/Fact | 数据/来源/证据/快照模型、读写/查询/过滤、冲突与有效性语义 | 真实知识内容、数据来源、信任规则与领域数据 |
| Rule | 通用规则描述、选定、版本、Applicability、条件表达式/函数协议、结果/冲突组合语义 | 领域政策、规则定义、业务 Function、优先级 |
| Recognizer | 泛型输入→候选/匹配/歧义的结构化合同及可选组合工具 | 哪些模式代表该领域对象的识别器 |
| Validator | 泛型输入→合法/缺失/违反约束的结果合同和通用类型/范围工具 | 实际领域约束/拒绝条件 |
| Decision | 泛型事实/规则结果→决定/未知/证据的结果合同、可复现引用机制 | 实际判断逻辑与业务结论 |
| Intent | 通用 Goal/Operation 引用与领域映射接口，本版不实现完整意图交互 | 本领域能处理的具体意图、参数及操作；交互逻辑归 0.11.3 |
| Applicability | 通用时间、主体、地域、版本、来源等维度的筛选组合语义 | 特定领域的适用条件与解析 |

**API 方向：** 为独立使用的 Business Function 提供可选的**结构化泛型协议**，而不是要求 `extends DomainRule`、`implements DomainRecognizer` 或经过 SDK 调度才能被调用。例如 `(input: I, context: C) => DomainOutcome<O>` 属于可能的公共类型约定，实际函数实现归 Domain Package。若业务无需通用包装，依然可用原生函数与标准 Workflow 直接组合。此处为 Product/L1 约束，不锁死确切签名。

## 1. 十个领域概念的正确抽象层次

| 概念 | 主要载体 | 典型 Business 职责 | SDK 可能提供的共享能力 |
|---|---|---|---|
| Domain Concept | 不可变声明/数据，TypeScript 类型 | 定义业务概念、属性、约束 | 通用引用、命名、版本 |
| Domain Object / Entity | 领域业务对象 / entity reference | 定义实际类型与行为 | 通用 ID、版本及关系查询 |
| Relation | 有向有类型边 / relation fact | 声明关系及跨域映射 | 存储、邻居/有界路径 |
| Knowledge / Fact | 内容、来源、适用性、版本快照 | 选择领域知识和信任前提 | 读写、Query、evidence |
| Rule | 规则数据（条件/参数/版本）+ TS 业务函数 | 具体业务规则/冲突处理 | 公共 predicate/条件检查（经复用证明） |
| Recognizer | 普通 Function 或内聚 Class | 识别已结构化业务对象 | 复用基础类型和检索 |
| Validator | Function/Class | 领域校验；错误/缺项分类 | 通用结构/范围校验 helper |
| Decision | 业务结果数据 + Function/Class | 组合规则产生业务决定 | 稳定 Evidence/原因语义及持久化 |
| Intent | 轻量引用（Goal/OperationId + 已确定输入） | 业务功能与意图的关联 | v0.11.2 仅定义最小引用；完整意图消歧/UI 属 0.11.3 #1613 |
| Applicability | 事实/Rule/Query 共用的声明式条件 | 业务筛选政策 | 时间、地域、主体、版本的共用判断 |

**不创建十个强制 SDK 根接口或十个固定 Element 角色。** 领域“名词”通常是普通数据/TS 类型；真正可复用的“动作”才考虑 Element Class。一个业务复合 Class 组合其它 Element 也属于 Element，Package 仍为静态 ESM 模块集合。零方法 Knowledge Class 可持有选定静态知识；无需强迫每项数据都有 run()。

**可选 SDK 最小语义合同草图（仅为样例）：**

```ts
type DomainRef = { id: string; version: string };
type KnowledgeRef = { domain: DomainRef; datasetId: string; snapshotId: string };
type FactRef = { domain: DomainRef; factId: string; sourceId: string; snapshotId: string };
type Applicability = { validFrom?: string; validTo?: string; region?: string; subject?: string };
type Evidence = { facts: FactRef[]; ruleIds: string[]; snapshotIds: string[] };
type DomainDecision<T> =
  | { kind: 'DECIDED'; value: T; evidence: Evidence }
  | { kind: 'ASK'; missing: string[] }
  | { kind: 'UNKNOWN'; code: string; evidence?: Partial<Evidence> }
  | { kind: 'FAILED'; code: string };
```

这些是领域结果，不是强行替换现有 WorkflowOutcome；业务拒绝可由 `DECIDED.value` 表达，映射至 Workflow.REJECT 必须显式。不得把未知和失败变 COMPLETE。

## 2. SDK vs Standard vs Business，三种抽象选项

- **A / 每个 Business 自行处理 SQLite/Scope/Rule：** 首版代码少，但订单和库存反复实现相同索引、范围过滤、证据语义，不符合跨 Domain 共性验收。
- **B / SDK 大型 DomainEngine + 十个 `I*` 根接口 + 规则 VM：** 表面统一，但与 Element-First 原生 TS、Package 静态直接调用、最小 SDK 原则冲突，且扩大调试/运行风险，不推荐。
- **C / 原生 TypeScript 数据合同 + 少量 Standard Store/Query Element + Business 自有规则/判断：首选候选。** 只抽跨**任意领域**确有复用性的能力；实际领域 Rule、Recognizer、Validator 由外部 Business Package 以原生函数和 Class 实现。订单/库存只是可替换测试消费者，不能成为 SDK 内部功能。具体哪一个成为公开 Standard Class，待 L2 两消费者实证后确认。

建议使用一份明确已选的 `DomainScope = DomainRef + KnowledgeSnapshot + subject/region/asOf/limits` 作为**查询调用参数**，而非所有 Element/Package 的强制基类 Context。请求读取的 Domain、语义版本、知识快照、适用时间、来源应由查询本身验证；不可仅靠上游 Recognizer 保证。

## 3. SQLite 统一查询计划：属性、字符串、向量、关系

| 查询 | 产品语义 | SQLite 实现方向（L2 再裁决） |
|---|---|---|
| Property | 精确相等/比较/IN/范围、关联、聚合、稳定排序、有界分页 | 普通列 + 索引 + 参数化 SQL；可选 JSON1 的 `json_extract`；高频领域属性考虑索引/生成列 |
| String | 精确、前缀、包含、全文相关性检索，附语言与匹配模式 | 精确与前缀普通索引，全文 FTS5，部分子串 trigram；短词和中文/缅甸语分词局限须正例实测，不把 FTS5 当语义理解 |
| Vector | 调用方提供查询向量；存储浮点向量的 metric/model/version/dim；Top-K 及业务筛选 | 优先有界精确距离计算证明可用；可比较 sqlite-vec 扩展作加速，需真实 Node22 Windows/Linux 安装/分发验证 |
| Graph | 实体/关系边，方向/类型、直接邻居、深度/节点数受限路径 | SQLite edges 索引表 + recursive CTE；环去重/截止条件，跨域需明确映射 |

**同一领域数据事实权威源，不为 SQL/FTS/Vector/Graph 创建四套独立知识真相。** FTS 与向量索引是派生投影，必须与事实数据及版本事务同步或显式可重建；同一 SQL/Graph 查询不得无声明切换到另一快照。R10 的 YAML/JSON-LD 同样支持直接读写及对已选文件的有界语义查询；SQL 仅对 SQLite 执行。

查询 Element 建议候选：一个负责 SQLite 连接/事务/资源释放的 `SqliteStoreElement`，一个或少量负责领域有界查询的 `KnowledgeQueryElement`，且能力可用普通方法 `findByProperty/searchText/searchVector/traverse` 表达。**不要求把这四个方法每个做独立 Element**；业务可以直接组合两个内聚 Class。具体公开 API 暂不冻结。

### 查询保护和正确性

1. SQL 值全部绑定参数，标识符或排序列必须由业务固定枚举/白名单选择；外部用户输入不是任意 SQL/FTS MATCH 原文，不允许注入或擅自执行数据定义/修改命令。
2. 先限定 DomainId/Version/KnowledgeSnapshot/Applicability，再限额、排序、返回。向量检索中若先取 K 再做 Scope 过滤可能漏报正确候选；需支持候选集内过滤、扩大有界召回或明确不完整语义。
3. String 模式区分 exact/prefix/substring/full-text；`unicode61` 不是通用中文或缅甸语分词器，trigram 的不足三 Unicode 字符场景应单独处理。排序稳定，缺少索引/Tokenizer/Vector 扩展应给出可观察退化/失败，而非悄然返回空结果。
4. 数据版本变更、SQLite 事务失败、向量维度错误、图环/超限、非法适用时点、跨域同名对象及来源冲突均需要正反例；历史 Decision 不引用已被静默覆盖的知识。

## 4. 表达式引擎 vs TypeScript 原生函数：推荐混合

| 任务 | 表达式（小型声明式 AST/数据） | 原生 TS Function |
|---|---|---|
| 可持久化的比较、集合包含、AND/OR、简单范围筛选 | **首选**：可序列化、版本化和安全校验；可在可证明等价时转 SQLite WHERE | 可选，不强制 |
| 复杂业务 Rule、组合 Decision、外部业务 helper、可测试流程 | 只表达可稳定验证的基础条件 | **首选**：语言能力完整，便于调试、组合、单测 |
| SQL/向量/全文/图检索计划 | 可由小型条件 AST 转译安全 SQL | 数据访问 Element 使用参数化驱动 |
| 动态加载/执行数据库保存的任意 JS | **不允许** | 只能是生成/安装时明确导入的可信 Package 函数 |

**不推荐在 0.11.2 创建完整 DSL parser/通用表达式 VM 或 JS eval。** 如果业务 Rule 全都能以普通 TS Function 表达，不必引入表达式 AST；只有真正需要持久化、查询推导、数据化配置的简单可复用条件才建立有限谓词 AST（如 `eq/lt/and/or/in`）。Rule 版本元数据与已选参数可持久化；业务实现仍是当前 Package 的可信函数，禁止将数据库字符串当成隐式可执行新代码。

```ts
// 讨论示意：声明式条件和业务函数并不互斥。
const restockCondition = { op: 'lt', left: { fact: 'stock.available' },
                           right: { param: 'minimumAvailable' } } as const;
export function evaluateRestock(facts: StockFacts, policy: StockPolicy) {
  return facts.available < policy.minimumAvailable;
}
```

## 5. Element-First 实际组合路线

外部 Domain App 可在测试示例中使用 `OrderPolicyElement`、`InventoryElement` 等内聚 Class，直接组合可选通用的 SQLite/Query/Applicability helper；Business Recognizer/Validator/Rule/Decision 可以是其方法或拆出的纯函数。**一个“业务智能组合 Element”仅在有复用价值时创建**，不是框架强制命名容器。

典型路径：

```text
Package (ESM imports)
  ├─ Business Element (Class)
  │    ├─ recognize(...)          普通方法/Function
  │    ├─ validate(...)           普通方法/Function
  │    ├─ decide(...)             普通方法/Function
  │    └─ Query Element (Class)   SQLite + 适用性 + 查询
  ├─ Rule/Concept/Knowledge       数据 + 函数 + 资源
  └─ Workflow Element             现有 StandardWorkflowSession
        └─ invoke/leaf 调用具体业务方法，保留原 Outcome 和根预算
```

业务 Workflow 用现有 `StandardWorkflowSession`、`root.invoke`/`root.leaf`、`routeWorkflowOutcome` 组合直接调用。Query 的 DomainDecision 和 WorkflowOutcome 必须显式映射、UNKNOWN/ASK/REJECT/FAILED 不提升为 COMPLETE；所有查询/规则调用遵守共享预算和调用前限额。SDK/KDP 不介入规则调度，不要求新的 Element.run 协议、FunctionRef、Target、Lock、Schema Registry 或第二 Runtime。

## 6. 与后续版本边界

- **0.11.2：** Domain 数据语义、Query/Store、有限适用性/规则/决定，轻量 Goal/Operation/Intent 引用；本次技术抽象均只是候选，不能取代实际 Product/L1 验收。
- **0.11.3 #1613：** Goal/Intent/Requirement/ConfirmedFact/UnknownFact 的完整交互识别、澄清、用户确认与声明式 UI，不在 0.11.2 重复实现。
- **0.11.4：** 真实 Tool/Host/Effect 的授权与外部副作用；0.11.2 仅可信 App 显式控制本地 SQLite/文件写入。
- **0.11.6：** TaskRun/Checkpoint/暂停恢复与 Effect 幂等；可复用数据访问能力，不由 0.11.2 创建 Task State Runtime。

## 7. Owner 产品澄清还需确认的四项选择

1. **抽象原则：** **SDK 绝不包含任何具体领域业务实现**；提供跨任意领域的语义/存储/查询/处理/结果通用合同与组合机制，实际 Business Function/Class 由 SDK 外部 Domain Package 编写；不设十种强制根类型。
2. **查询：** SQLite 属性/字符串/向量/图检索必须都在本版可运行；String 包括 exact/prefix/substring/full-text，Vector 明确输入向量 Top-K，不要求 Embedding Model。
3. **规则：** 原生 TS Function 为主体，有限可序列化/可持久化的条件可由 AST 表达；不引入通用 DSL/VM。
4. **Element-First：** Store/Query/Workflow 为能力 Element，领域 Business Class 直接组合；Knowledge/Rule/Applicability 等领域数据无需强制单独 Element；Intent 全量处理归 0.11.3。

这些条目只是 Owner 审核候选，**在明确批准前不修改运行时源码、不宣布 L2/CI/独立审核通过、不合并 Train/main**。
