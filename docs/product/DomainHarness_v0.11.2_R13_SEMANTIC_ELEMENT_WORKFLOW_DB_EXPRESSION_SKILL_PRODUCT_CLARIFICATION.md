# DomainHarness v0.11.2 · R13 语义化流程、Element/Function、DB 能力、表达式和 LLM Skill 综合澄清

```ini
OUTPUT_LABEL=DH_V0112_R13_SEMANTIC_ELEMENT_WORKFLOW_DB_EXPRESSION_LLM_SKILL_PRODUCT_CLARIFICATION
REPO=kaicreator-mm/domain-harness
VERSION_ISSUE=#1612
PRODUCT_PR=#1702
PREDECESSOR=R8_R9_R10_R11_R12
STATUS=PRODUCT_L1_ARCHITECTURAL_OPTIONS_PROPOSED_NOT_FROZEN
L2=NOT_STARTED
IMPLEMENTATION=NOT_STARTED
CI=NOT_RUN_DOC_ONLY
```

> **性质：** 本文是对 Owner 五项问题的功能与架构抽象澄清候选，不是 L2 已批准合同、已存在 SDK API 或源代码。全部 TS 结构和名称都是**概念性候选**。依据现行 [CORE](../specs/domain-harness/core.md)、[EL](../specs/domain-harness/element-package.md)、[TS](../specs/domain-harness/typescript-profile.md) 和 [LIFE](../specs/domain-harness/lifecycle-workflow.md)，不恢复旧 FunctionRef/Target/Lock、第二 Runtime、自动 Package Loader、必须依赖 Forge，也不把领域特定知识塞入 SDK。

## 1. 核心定位：语义是数据与协议，Element 是内聚能力，Function 是原生实现

**DomainHarness SDK = 领域无关的语义合同 + 通用机制/能力 Elements + 原生 Workflow 组合。** Business Domain Package 独立提供具体语义实例、知识内容、识别、校验、规则和决策策略。Package 是 ESM 模块集合，Element 是一内聚 Class，Function 是普通模块函数或 Class 方法；不能将下表每个语义名词机械变成一个 SDK 根接口、固定 Role 或独立 Runtime。

| 通用领域语义对象 | 最小 SDK 抽象边界 | 可归属的共享能力 Element/Function | 外部 Business 责任 |
|---|---|---|---|
| Domain | 稳定语义身份/版本、范围、选定快照 | DomainRef/Scope helpers（非强制容器） | 本领域的语义范围、版本兼容 |
| Concept/Object/Entity | 概念/实体/属性与类型的描述、值/实体身份 | Schema/Type helpers、Entity Query | 真实概念、类型、属性、实体实例 |
| Relation | 有向/有类型/带来源的关系，显式跨域映射 | GraphQueryElement 候选 | 实际关系意义、跨域映射规则 |
| Knowledge/Fact | 知识集合、Fact、Source、Applicability、Evidence、选定版本 | KnowledgeStore/Query Element 候选 | 真实知识、事实、来源信任条件 |
| Rule | RuleRef、输入需求、参数/表达式或 native Function 关联、版本/适用性、结果语义 | ExpressionElement、规则选择/冲突 helpers | 真实领域条件、优先策略、规则函数 |
| Recognizer | 泛型 `input → recognized/ambiguous/not-recognized` 合同、来源与置信理由（需要时） | 普通可组合 Function/Element 协议 | 具体识别算法和模式 |
| Validator | 泛型 `input → valid/invalid/missing`、稳定问题引用 | 通用类型/结构/范围校验 helpers | 具体业务合法性、约束 |
| Decision | 泛型判断结果、业务拒绝/UNKNOWN、实用证据和快照引用 | Decision evidence helper/持久化 Element 候选 | 真实业务决策函数 |
| Intent | Goal/Operation/Intent 最小稳定引用，可用于选定 Workflow 的前置关联 | 业务 Function 接口的输入协议 | 具体意图分类与交互；全面理解/UI 留在 0.11.3 #1613 |
| Applicability | 时间/地域/主体/版本/场景等领域中立谓词，部分条件可结构化存储 | Predicate/Applicability helper | 特定领域维度/政策 |

**纯语义数据不需要提供 `run()`。** SDK 可以用 `type`、`interface`、普通 `const`/JSON-LD/YAML/数据库记录表示；只有资源/流程/可复用操作才做 Element。SDK 的公共类型允许泛型化，不强迫 Business 继承 `DomainRule`、`DomainRecognizer` 或固定大基类。

## 2. 流程语义化：显式的语义契约和 Function/Element 连接

领域流程不是固定的 `recognize→validate→query→rule→decision` 五节点 Pipeline。对每个**业务 Operation/Function**，作者应能声明（或以 TSDoc + TypeScript 表达）：

- `purpose` / `operation`：要解决什么明确的领域问题；`domain/scope`：允许处理什么 Domain、Subject、Time、Version；
- `consumes`：读取哪些 Concept/Fact/Relation/Knowledge，所需参数、输入及证据质量；
- `produces`：结果、业务拒绝、未知/缺失/歧义、稳定 reason code 与使用证据；
- `preconditions/applicability`：调用前必须满足的条件；`effects`：纯运算、只读查询或明确业务外部副作用；
- `limits`：调用/数据规模/返回证据上限，及本函数是否需要 DB、表达式、Workflow 能力。

**行为由具体 TS Function 实现，描述与 TS 签名紧贴代码维护。** Skill 用于导航、选用和生成时验证，而不是通过一份 Skill JSON 创建第二运行时注册表或让 KDP 按语义名动态派发。表达式或数据可以是 Function 消费的静态 Knowledge；由业务 Package 通过静态 import 连接。

一个最小的**概念性**业务能力形式：

```ts
// 不要求 SDK 真的暴露 DomainOperation 基类。逻辑签名由业务定义。
// SDK 提供可选的 Scope/Evidence/Outcome 类型或 helpers。
export async function decide(input: Input, context: Context): Promise<DomainResult<Output>> {
  // 具体领域实现属于外部 Business Domain Package
}
```

## 3. Domain Intelligence 与现有 Workflow 的组合

```text
User/Service Goal / 已确定 Operation
             |
        Domain App Workflow (现有 StandardWorkflowSession/XState)
             |
  Business Element: 明确识别/校验需要哪些领域事实
             |
  KnowledgeQuery(Element) -> DB capability Elements / YAML / JSON-LD
             |
  Rule predicate (Expression Element 或普通 TS Function)
             |
  Business Decision Function -> Evidence / Applicability / Reason
             |
   业务结果→显式映射 WorkflowOutcome，继续已声明 Task 分支
```

识别、验证、查询、规则、决定可以在一个内聚 Business Element 或多个 Business Elements 中组合；某一步不需要就省略，顺序由具体领域决定。业务与 SDK Standard 之间用原生 TS 方法/构造器依赖调用，不强制新的 `Element.run`、Hook 注册或流程语言。

- Workflow 已有共享根预算、`invoke/leaf`、`routeWorkflowOutcome`、`COMPLETE/REJECT/ASK/WAIT/UNKNOWN/FAILED`；0.11.2 **只做领域结果→既有 Outcome 的显式、可测试转换**，不复制其调度、KDP、TaskRun 状态机。
- 查询/验证/规则执行不能因失败或 UNKNOWN 被当作 COMPLETE；匹配事实不等于政策判定。某领域需要业务拒绝时，应以清晰的业务结果显式映射 REJECT，不通过异常暗示。
- 一个 Invocation 的 Knowledge Snapshot、AsOf、Scope 和证据引用应明确传递；相同已选输入要保持结果和理由稳定，不能自动取“最新知识”或当前机器时钟。
- 不要求业务每一个私有 helper、数据表、Rule 条件都单独 Element 化；Domain App/Package 仍按直接 import/明确依赖组成。

## 4. DB：基础 Database Element 与上层能力 Element 分离

```text
Domain Knowledge/Fact/Relation Query (领域中立的上层组合)
           ├─ PropertyQuery / SqlQuery
           ├─ TextQuery
           ├─ VectorQuery
           └─ GraphQuery
                ↑ 可选组合的能力合同
         DatabaseElement / DB connection owner
            ├─ SQLite Provider（本版真实实现）
            ├─ Other SQL DB Provider（未来）
            └─ Other DB Provider（只具备对应能力）
```

**基础 Database Element 仅负责：** 数据源连接/关闭、事务、资源所有权、结构化错误、明确的 Provider 能力集合。它不能假装所有数据库都有 SQL、FTS、Vector、Graph；具体能力以组合 TypeScript 结构合同实现，不强制所有 Provider extends 一个巨大 AbstractDatabase。可选具体 `SqliteDatabaseElement` 是本版 Node22 实现；其它 DB Provider 在后续可接入。

**能力 Elements** 是按职责内聚的可组合类，例如 `SqlQueryElement`、`TextQueryElement`、`VectorQueryElement`、`GraphQueryElement`；**类名均只是候选，不是四个必须分发的类**。有用且内聚时可合并，重点是能力边界和公共类型可被其它数据库 Provider 实现。Business Consumer 依赖 Query capability，不依赖特定 SQLite API。SQLite 驱动/事务异常不能穿透为另一数据库的“万能 SQL 异常”假象。

**查询合同建议：**

| 能力 | 必须的可观察行为 | 边界 |
|---|---|---|
| 属性 / SQL | 相等、范围、JOIN、聚合、分页、稳定排序、参数绑定 | SQL 是可选的 SQL Provider 能力，不要求 NoSQL 支持 SQL |
| String / Text | exact/prefix/substring/fulltext，明确 tokenizer、短词和语言边界 | FTS5（SQLite）是实现之一，不能当作多语言语义模型 |
| Vector | 向量 ID、模型/维度/metric/版本、Top-K、分数、显式过滤 | 不要求本版生成 embedding/LLM；相似度不能证明业务事实真实 |
| Graph | 节点/关系、方向/类型、多跳、有环、有界遍历、跨域映射 | 不要求独立图 DB / Cypher / SPARQL / 无界推理 |
| Knowledge query | 基于 Domain、知识快照、时点、Subject、Applicability、Source 的 QueryResult/Evidence | 同一权威事实集经多个索引/能力查询；不得越过领域、版本和信任边界 |

**文件 Provider：** YAML/JSON-LD 必须支持已有文件的直接读写及有界语义/关系查询、按需导入/导出 SQLite；不要强制所有静态文件伪装成持久 DB 连接。若想复用上层 KnowledgeQuery 合同，可以在已选文件上提供轻量适配器；保留格式自身特性与导入损失的显式结果。

**其他 DB 可扩展性证明：** 在 L2/验收设计至少一个不依赖 SQLite 类型的能力合同 Consumer/假 Provider；真实 PostgreSQL/其他 DB 未实现就明确 NOT_SUPPORTED/NOT_RUN，不能把 mock 冒充跨数据库 E2E。设计不必预先引入多数据库驱动及网络连接系统。

## 5. 表达式引擎历史审查（v0.10.3）

从 GitHub `version/v0.10.3` 的**实际源码**核实：

- `packages/domain-harness/src/expression/expression-runtime.ts` 真正使用 `jsonata`，按纯 JSON 边界输入/输出，显式逻辑时点绑定 `$now/$millis`，设置默认 2s timeout、256 stack、1MiB 输入和输出限额，Strict Boolean 检查。
- `expression-tool.ts`：包装 `ExpressionRuntime` 并用 Ajv 2020 按输出 JSON Schema 校验。
- `policy.ts`：检查 JSONata AST，拒绝 `$random`、`$eval`，限制 `$now/$millis` 参数。
- `json-boundary.ts`：可移植 JSON 值约束、UTF-8 字节统计。
- `packages/domain-harness/package.json`：`jsonata:^2.2.2` 作为当时开发依赖（不是当前 0.11.1 SDK 的 runtime dependency）。
- 已读取的 `expression-runtime.ts` 本身**没有可证实的 Node Worker 强制终止逻辑**，但历史测试 `expression-runtime.test.ts` 出现“Worker timeout”命名；不能把测试名称当成实际隔离实现的证明。

**采纳历史设计思想，不恢复旧 ABI/源码或 v0.10 兼容：** JSONata 作为已有技术经验和通用 JSON 变换/表达式的第一候选；CEL 与 JSON Logic 是竞争候选。需要按表达能力、输入输出类型、确定性/错误语义、无副作用、执行预算、可缓存编译以及语义版本进行 L2 有限比较。当前并未批准强制 JSONata。

### Expression Element 应承担的通用职责

- `compile/validate` 可信生成时或明确选定表达式时的语法/能力检查；`evaluate` 的纯数据输入/输出、显式 AsOf、结构化错误与资源额度。
- `ExpressionElement` 若成立，应封装一种选定的表达式引擎或被证实需要的少量实现；**不得创建新的表达式 Runtime 系统**。它不需要知道行业概念，也不应替 Business 决定哪些 Rule 应用。
- 数据化条件、Applicability、可配置简单 Rule 可使用表达式；复杂 Rule/Recognizer/Validator/Decision 由静态选定的普通 TS Function 实现。规则可以引用既有 Function/Expression 的**语义标识**以供 LLM 阅读，实际执行依然由 Business 静态 import/直接调用，不新建 FunctionRef Registry。
- **SQL 不等于表达式语言。** 可以单独采用**受限的查询谓词结构**（EQ/IN/RANGE/AND/OR 等）安全转换到某数据库的参数化查询；不能假装通用 JSONata AST 自动准确下推成 SQL、FTS、Vector 或 Graph，也不允许语义漂移。无法证明等价时仅用显式过滤或返回 NOT_SUPPORTED。
- 拒绝任意数据库字符串经 JS eval 执行，JSONata AST 黑名单不等于全面沙箱；不信任表达式的强制中止应通过独立执行隔离/可终止机制证明，内部求值 timeout 不得冒称 hard-kill。
- 表达式和关联条件需保存 `engineId/version`、源码或 AST 身份、输入/输出 Schema、显式时点与数据版本；历史重放不应因无声明升级引擎而改变。

## 6. LLM Skill 与 Element 的唯一事实源关系

**核心原则：Skill 是给 LLM 的“如何正确选用和生成”说明，不是会被 SDK 运行的第二套领域描述。** 真正的能力以**实际 TS exports、Class static metadata（有明确用途时）、TSDoc、源码测试**为准；权威设计合同放在 `docs/specs/domain-harness/`，现有 `.agents/skills/domain-harness-spec/SKILL.md` 是导航入口。不要在 Skill、TypeScript、JSON Catalog 三处手工维护易分叉的接口真相。

建议（待批准后）增设**专题 Skill**：

```text
.agents/skills/domain-harness-spec/SKILL.md      # 现有，统一规范导航
.agents/skills/domain-intelligence/SKILL.md      # 候选，什么场景选什么通用能力
.agents/skills/domain-intelligence/references/
    capability-selection.md                      # Element/Function 选用矩阵
    semantic-modeling.md                         # Domain/Concept/Relation/Fact/Rule 的表达和典型误用
    database-query.md                            # DB capability 的约束和负例
    expression-rule.md                           # 何时表达式、何时 TS Function
    workflow-composition.md                      # Outcome、预算、Evidence、静态 import
    business-package-generation.md               # 业务转换与可证伪验收
```

Skill **只引用已发布的规范、真实导出符号和附带 TSDoc**；候选未实现的 API 必须标示 PROPOSED，不得指导 LLM 当作已存在的 SDK 可调用接口。每个通用 Element/Function 的使用说明应能回答：用途、何时用、何时不该用、输入/输出、依赖能力、资源/副作用、可预期 UNKNOWN/FAILED、负例/预算、最小可运行片段及适用版本。复杂资料拆 references，主 Skill 保持精简，并可按当前问题按需读取。

### LLM 生成 Business Package 的流程（不需要 Forge）

1. **读现行 SDK 版本和权威 Spec/Skill，确认已实现能力**：从真实 npm SDK exports / TypeScript 声明读取，可区分 PROPOSED / IMPLEMENTED / TESTED，不凭示例猜 API。
2. **领域需求结构化**：从领域来源材料提取 Concept、Entity、Relation、Fact、Rule、Applicability、Goal/Operation 及 Source→Claim→Domain Record 映射；不构造未给出的行业事实，不把“LLM 说了”当已验证真相。
3. **能力匹配**：每个所需操作映射到最小的 SDK Standard Element/Function 能力（DB/Query/Expression/Workflow/Evidence），记录“使用理由与替代方案”；业务算法用原生 TS Function/Class，不生成业务框架。
4. **静态文件生成**：直接编写 Business ESM Package 的真实文件、Exports、依赖、业务 Knowledge、Elements、Functions、可选 Init/Exit；不得要求 Forge、Generator 或第二 Assembly 工具。
5. **对照与校验**：生成期 TS strict/typecheck、静态依赖/Order/Context 检查、语义身份/Schema/Rule/范围检查，以及数据导入、查询、合法/冲突/缺失/恶意请求的正反例；错误/日志结构化脱敏。
6. **真实消费**：干净 npm SDK-only 外部 Consumer 以普通 TypeScript 静态组合 Business Package + Workflow 并执行 E2E；同一个 SDK 不改实现即可再接另一个完全不同领域的 Package。

### 建议的生成可追溯清单（编写者使用；不作为 Runtime Manifest）

```text
SOURCE/CLAIM → CONCEPT/ENTITY/RELATION → KNOWLEDGE/FACT/PROVENANCE
             → RULE/VALIDATOR/RECOGNIZER → BUSINESS FUNCTION / ELEMENT
             → SDK CAPABILITY USED → WORKFLOW BRANCH → TEST/EVIDENCE
```

每个新领域 Function 必须能够追踪其领域规则或事实来源、输入输出类型、决策解释与负例；LLM 生成 Skill 应有“找不到来源→标 UNKNOWN/待授权”的停止条件。该映射属于**生成/审核材料**，不是运行时权限注册表或动态函数派发。

## 7. 新增候选验收（DI-AC22–DI-AC28，NOT_RUN）

| ID | 验收 Oracle |
|---|---|
| DI-AC22 | 一个全新陌生领域仅提供外部知识/概念/关系/规则/函数，SDK 源码、公共 DB Schema 与通用 Query 不变，完成 Store→Query→Rule→Decision→Workflow |
| DI-AC23 | 语义 Function 合同具有输入/输出/Scope、证据/未知/拒绝/资源约束；可省略非必要流程环节、直接 TS 调用，不能强制五阶段 |
| DI-AC24 | SQLite DB Element 的生命周期/事务与 SQL/Text/Vector/Graph 能力接口分离；至少另一 Provider 的契约性假实现只证明可扩展性，不冒充真实 DB E2E |
| DI-AC25 | SQL/属性、文本、向量与图的能力受明确支持检查；Unsupported/跨域/范围无效/资源超限可解释失败，未选扩展不能伪报已安装 |
| DI-AC26 | JSONata/CEL/JSON Logic 做真实小型选型对照；检查 v0.10.3 JSONata 的确定时钟、输入输出/类型、AST policy 和 timeout/Worker 差距，并验证选定新 Element 的实际正负用例 |
| DI-AC27 | 同一 Business Rule 提供可持久化 predicate 与原生 TS Function 两种适当消费情形；不执行数据库存储的任意 JS、不做不可证明等价的 SQL 自动转换 |
| DI-AC28 | 使用正式 Skill + 公开 SDK API 独立生成至少一个新领域 Business Package：需求→语义模型→SDK 能力选择→源文件→Workflow→类型/正反例/证据；不存在的 API 不得假造 |

## 8. Owner 待批准的设计取向

- **S1 语义流程：** SDK 给可复用语义合同与能力描述，实际 Domain Function 由 Business 静态 import/实现；流程可组合，不强制五阶段 Engine。
- **S2 DB：** 可选能力接口 + 一个实际 SQLite Database Element Provider + 通用 SQL/Text/Vector/Graph 能力；其它 DB 依能力接入，不要求本版完成所有 DB。
- **S3 Expression：** 0.10.3 已证实 JSONata；新版本比较 JSONata/CEL/JSON Logic，优先可复用选定引擎封装 Element + Business 原生函数，无独立 VM/FunctionRef。
- **S4 Skill：** 先规范与真实 TypeScript 出口，再专题 Skill、选择矩阵、正反例、类型/功能验收，帮助 LLM 直接生成 Business Package；Skill 不作为第二执行事实源。
- **S5 资格：** Product/L1 未确认前保持本文件 R13 为 PROPOSED；L2、源代码、CI、源码审查、合并均未开始。历史 v0.10.3 仅为选型证据，不继承 ABI、实现和旧测试 PASS。
