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
- **C / 原生 TypeScript 数据合同 + 少量 Standard Store/Query Element + Business 自有规则/判断：首选候选。** 只抽真正跨订单/库存重复的访问能力；复杂 Rule 和领域 Recognizer/Validator 用原生函数和 Class。具体哪一个成为公开 Standard Class，待 L2 两消费者实证后确认。

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

建议在真实 Business 使用 `OrderPolicyElement`、`InventoryElement` 等内聚 Class，直接组合可选通用的 SQLite/Query/Applicability helper；Business Recognizer/Validator/Rule/Decision 可以是其方法或拆出的纯函数。**一个“业务智能组合 Element”仅在有复用价值时创建**，不是框架强制命名容器。

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

1. **抽象原则：** 认可“数据合同 + 少量真实可复用 Standard Elements + Business 原生函数/Class”，不设十种强制根类型。
2. **查询：** SQLite 属性/字符串/向量/图检索必须都在本版可运行；String 包括 exact/prefix/substring/full-text，Vector 明确输入向量 Top-K，不要求 Embedding Model。
3. **规则：** 原生 TS Function 为主体，有限可序列化/可持久化的条件可由 AST 表达；不引入通用 DSL/VM。
4. **Element-First：** Store/Query/Workflow 为能力 Element，领域 Business Class 直接组合；Knowledge/Rule/Applicability 等领域数据无需强制单独 Element；Intent 全量处理归 0.11.3。

这些条目只是 Owner 审核候选，**在明确批准前不修改运行时源码、不宣布 L2/CI/独立审核通过、不合并 Train/main**。
