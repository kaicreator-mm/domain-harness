# DomainHarness 0.11.2 · R15：Knowledge + Workflow 两层 Domain Intelligence 最小模型（Owner 方案）

```ini
OUTPUT_LABEL=DH_V0112_R15_TWO_LAYER_KNOWLEDGE_WORKFLOW_INTENT_MODEL
REPO=kaicreator-mm/domain-harness
VERSION_ISSUE=#1612
PRODUCT_PR=#1702
OWNER_PROPOSAL=KNOWLEDGE_SEMANTIC_LAYER_PLUS_WORKFLOW_EXECUTION_LAYER
R14_FOUR_LAYER_SEMANTIC_WORKFLOW_MODEL=SUPERSEDED_BY_R15_PROPOSAL
STATUS=PRODUCT_L1_PROPOSED_PENDING_OWNER_FINAL_REVIEW
L2=NOT_STARTED
CODE=NOT_STARTED
CI=NOT_RUN_DOC_ONLY
```

> **Owner 精简要求优先：** R14 曾提出 Domain Semantic / Semantic Capability / Semantic Workflow / Existing Workflow 四层及独立 SemanticPort、Data/Control/Evidence Edge。Owner 指出复杂度高且对 Domain Intelligence 的增量价值不清晰。R15 采用**两层**：语义层 Knowledge 和执行层 Workflow，Recognizer/Validator 作为形成合法 Intent 的通用能力，不设第三语义流程层。R14 的四层及独立 Graph/Port/Edge **不作为本版必须交付的架构、SDK 接口或验收门**；既有业务案例及“语义不兼容不能默许成功、结果不能误映射 COMPLETE”等正确性不变量保留。

> **R16 后续 Owner 提议：** R15 中将 Recognizer + Validator 放在 Workflow 外的示意，已被新的 [R16「Intent Recognition Workflow + Intent Handling Workflow」候选](./DomainHarness_v0.11.2_R16_TWO_WORKFLOWS_AUTHORIZED_ACTION_SCOPE_CONSOLIDATION.md)具体化：两者共用已有 Workflow API，无第三层或第二执行器。R16 同时建议将 0.11.4 Authorized Action（Business State、Capability、Tool、Host、Effect、Receipt/Journal/Readback）完整归入 0.11.2，Knowledge 存语义描述/规则，Workflow 负责编排实际授权行动；**授权不能由 Knowledge 声明或 Workflow 单独自授予**。原 R15 的图与范围界定作为本轮设计演进记录，R16 的版本合并**仍待 Owner 最终裁决，尚未修改正式 Roadmap**。

> **R18 · Knowledge 类型收敛：** 最新 [DataKnowledge + FunctionKnowledge 两基本类别，以及 FunctionKnowledge 的 stateful/external 两个独立属性](./DomainHarness_v0.11.2_R18_DATA_FUNCTION_KNOWLEDGE_TWO_AXES.md)作为更简单的抽象候选。Concept、Entity、Relation、Rule 条件、Intent 定义等均是**类型化 DataKnowledge**；Recognizer、Validator、Rule 求值、Decision、Tool 等对应的已选可信函数由 **FunctionKnowledge** 描述。函数知识查询只返回操作声明/引用，真正执行由外部 Business 静态 import 的 TS Function/Element 完成，不从数据库或 LLM 文本执行 JS。两个 Workflow 角色及 R17 用户确认策略均保持不变，不能依 stateful/external 自动推导授权。

> **R19 最新 Owner 收敛方案：** [R19 静态 DataKnowledge + 原生 FunctionKnowledge 共同组成 Business Element；Workflow 业务接口生成期定义](./DomainHarness_v0.11.2_R19_STATIC_KNOWLEDGE_BUSINESS_ELEMENT_WORKFLOW_GENERATION_CONTRACT.md)。本 R15 中若将 Knowledge 描述为**运行时独立 Store/Registry、必须公共 KnowledgeSelection/ValidatedIntent/DomainDecision**，均只作历史候选；现阶段“两层”仅是语义知识与 Workflow 行为的**责任划分**，不是额外 Knowledge Runtime。DataKnowledge 硬编码不可变，FunctionKnowledge 可直接访问并自己维护状态；共享状态先组合到内聚 Element。业务具体 Workflow 输入输出无需统一，只有现有 SDK 标准 Workflow 的基础运行 Outcome 保留。

## 1. Domain Intelligence 的最小闭环

```text
外部请求 / 结构化输入 / 后续自然语言交互 (0.11.3)
                    |
       Recognizer 读取 Knowledge，识别 Intent 候选
                    |
       Validator 读取 Knowledge，验证意图、参数、适用范围
                    |
         ValidatedIntent (id + domain + typed args + scope)
                    |
      Business 显式选择所关联的 Workflow（静态 TS）
                    |
              Workflow 执行层
          普通 Business Element / Function
             ↕ 查询 Knowledge
         Expression / Rule 条件 / Decision
                    |
        WorkflowOutcome + used Evidence / reason
```

- **Knowledge** 是统一领域语义层，提供 Intent/概念/实体/属性/关系/事实/规则/适用性/来源及选定版本的类型化领域知识。Recognizer、Validator、业务 Workflow 都能读取此层，同一业务决策应使用明确选定的有效知识，不靠相似字符串猜事实。
- **Workflow** 是唯一业务执行层：复用已存在的 `StandardWorkflowSession`、`XStateWorkflowElement`、`NativeWorkflowContext.invokeOutcome/leaf`；没有独立 Domain Workflow Runtime、语义图解释器或强制单一五步流程。
- **Recognizer** 读取输入及必要的 Knowledge，给出候选 Intent 或“无法识别/歧义”；**Validator** 检查候选 Intent 的参数、约束、Knowledge Applicability、版本、范围，产出 ValidatedIntent 或 ASK/UNKNOWN/REJECT。两者均为可组合 Function/Element 职责，具体识别策略与业务有效性函数由外部 Domain Package 提供。
- **Intent → Workflow 绑定**由 Business Package 以普通 TS 静态引用/明确映射完成。Knowledge 可以保存 Intent 的定义、输入 Schema、允许的 operation/workflow 标识等**语义声明**，不能把用户或数据库给出的任意字符串解析成未声明的动态 Function。不存在/未选/歧义的映射返回 ASK/UNKNOWN/REJECT；不能隐式安装 Package、调用未知 Tool。
- Rule/Decision **不是第三层**：Rule 的结构化条件、适用性、参数、来源归 Knowledge，复杂业务判断逻辑仍是 Business 原生 TS Function；Decision 是 Workflow 中执行业务判断后形成的结果与真实使用 Evidence。数据库不能直接执行存储的任意 JS 源码。

## 2. Knowledge 为统一抽象，但必须保留内部类型信息

Knowledge 是知识内容的**统一访问和引用边界**，不等于把所有对象降格成一份无结构 JSON，也不是以一个超大 `KnowledgeEngine` 统一管理运行：

| Knowledge 中的类型化内容 | 说明 |
|---|---|
| Domain / Concept / Entity / Property | 语义身份、类型、版本、实体属性 |
| Relation | 有向有类型的实体/概念关系、显式跨域映射 |
| Fact / Source | 事实、时点、声明来源、证据/真实性类别 |
| Rule / Constraint | 规则条件、参数、适用性、优先/冲突处理说明；可指向外部可信 TS Function |
| Intent / Operation Definition | 意图名称、领域、期望输入、约束、可允许的业务 Operation |
| Applicability | 时间、主体、地域、场景、Version 等适用条件 |
| Snapshot / Provenance | 选定知识快照、出处、有效期、使用依据 |

这些是 SDK 的**通用类型/约定和查询能力**，实际领域的概念名称、规则和数据全部由外部 Business Package 编写。可以通过 SQLite/YAML/JSON-LD 表达和保存；结构化查询、全文、向量和图查询都服务于同一个 Knowledge 语义层，底层 DB Element + 能力 Element 方案沿用 R10/R13，但不额外提升为架构层级。

## 3. 最少三个数据合同：KnowledgeRef、Intent、Decision

**都是候选示意，具体公共导出留给 L2。** 可选择普通 TS 类型 + helper，而不是强制创建新 Class/接口体系：

```ts
type KnowledgeSelection = {
  domainId: string;
  domainVersion: string;
  snapshotId: string;
  asOf: string;
};
type IntentCandidate<Args> = {
  intentId: string;
  domainId: string;
  arguments: Args;
};
type ValidatedIntent<Args> = IntentCandidate<Args> & {
  knowledge: KnowledgeSelection;
};
type DomainDecision<T> = {
  value: T;
  reasonCode: string;
  usedFacts: readonly string[];
  usedRules: readonly string[];
  usedSources: readonly string[];
};
```

当前 `StandardWorkflowOutcome` 为真实已有 API；DomainDecision 是候选业务领域结果和证据对象，映射至 `WorkflowOutcome` 必须显式。特别要注意非成功结果已有 `reason`，没有内置 Evidence 字段；可由本次运行局部 DecisionRecord 等途径保留。

## 4. Element-First 实际组合，不产生新 Workflow API

```ts
// 概念性示意：Recognizer/Validator/Knowledge 和 Business Workflows 都是外部组合对象。
// 真实已有：StandardWorkflowSession、invokeOutcome；下面识别和业务函数是示意。
const workflowByIntent = {
  // 由 Business Package 静态 import 并明确映射，不能从 DB 动态 eval/加载。
  'domain.operation': runDomainOperation,
} as const;

const recognized = await recognizer.recognize(input, knowledge);
if (recognized.kind !== 'CANDIDATE') return mapRecognitionFailure(recognized);
const validated = await validator.validate(recognized, knowledge);
if (validated.kind !== 'VALID') return mapValidationFailure(validated);
const selected = workflowByIntent[validated.intentId as keyof typeof workflowByIntent];
if (!selected) return unknownIntentOutcome();
return selected(validated.arguments, validated.knowledge);
```

- 这里的 `workflowByIntent` 是 Business 普通静态 TS 对象，而非 SDK 中央 Registry。
- 对同一 Intent 有多个候选时，Recognizer 可返回歧义；Validator 不得靠“第一个匹配”直接选择。需要澄清的交互由 0.11.3 完整实现。
- Business Workflow 内通过已有 `root.invokeOutcome(() => businessFunction(...))` 或 `root.leaf({run})` 调用，避免 `root.invoke()` 把业务 UNKNOWN 当作 COMPLETE.value。
- Workflow 的真正步骤和分支由 Business 编写；可以只运行一个函数，也可以复杂到多阶段、多分支。Knowledge 为步骤提供查询与判断所需数据。实际用于结论的知识来源须可追踪。

## 5. 0.11.2 / 0.11.3 边界

**0.11.2 必须保证：** 从已给定的结构化请求或明确候选输入，通过通用 Recognizer/Validator 组合形成合法 Intent，显式绑定选定 Business Workflow，执行时可从 Knowledge 获取规则和事实，输出可解释的结果。提供 Intent 定义/参数/范围和必要查询结构；仍不替业务定义具体 Intent。

**0.11.3 负责增强：** 自然语言 Goal→Intent 多轮识别、用户澄清、UI 选择、必要的人机确认和不确定候选处理。0.11.2 不因这一模型提前承诺任意自然语言意图识别或 LLM 推理。

## 6. 对 LLM / Skill 更简单的生成方式

LLM 不需要先设计 SemanticPort/DataEdge/ControlEdge/EvidenceEdge 或独立的语义图。推荐直接做：

1. **生成 Knowledge：** 从有出处的领域资料中抽取领域概念、事实、关系、规则、Intent 定义和 Applicability，保存为普通 Business 文件/SQLite 数据（不生成猜测事实）。
2. **生成 Recognizer + Validator：** 消费 Knowledge，形成合法领域 Intent（或 ASK/UNKNOWN/REJECT）；实际业务识别/验证函数归外部 Business。
3. **生成 Workflow：** 为明确的 Intent 静态绑定外部 Business Function/Element，在 Workflow 内按需读取 Knowledge 与调用 Rule/Decision；使用真实 SDK StandardWorkflowSession/Outcome。
4. **生成验证：** Knowledge 来源/版本/范围，Intent 歧义/缺输入，Workflow 分支，知识冲突/过期，非成功不能变成功，静态 API/TypeScript、外部 SDK Consumer 正反例。

**Single Source of Truth：** 实际接口与调用以 SDK 真正的 TS exports/代码元数据/TSDoc 为准；Skill 只解释选择依据与生成实践，永不成为独立 Runtime 文件。构建一个新领域无需修改 SDK 的知识表示、查询、Intent 路由抽象或 Workflow 实现。

## 7. 简化后的候选验收（替代 R14 的 DI-AC29–34）

| ID | 新验收 Oracle |
|---|---|
| DI-AC29R | 外部领域使用通用 Knowledge 模型表示 Concept/Entity/Relation/Fact/Rule/Applicability/Intent，保留各类型语义和来源，SQLite/YAML/JSON-LD 可消费 |
| DI-AC30R | Recognizer + Validator 在真实通用知识查询支持下形成确定的 ValidatedIntent；参数缺失、歧义、知识失效/冲突返回明确非成功 |
| DI-AC31R | 每个已选 Intent 以外部 Business 的静态 TS 引用映射到 Workflow，未知/未选映射不触发执行；Domain 版本/Scope 不混用 |
| DI-AC32R | Business Workflow 通过真实 SDK Workflow 调用 Knowledge 并产生业务 Decision/Evidence，`invokeOutcome/leaf` 保留 REJECT/ASK/UNKNOWN/FAILED，不复制新 Runtime |
| DI-AC33R | Rule/Applicability/Decision 的知识、参数和可信函数有明确来源；相同知识快照和输入能复现结果；复杂规则不从数据库动态 eval |
| DI-AC34R | LLM 只用 SDK 的 Skill、真实公开 API 和新的领域资料，生成 Knowledge + Recognizer + Validator + 意图路由 + Workflow 的外部 Package，不修改 SDK 源码/通用 DB Schema |

**R15 采用这些拟验收来替换 R14 的强制 SemanticPort/Data-Control-Evidence Edge 等方案；旧 R14 仍保留为历史设计记录，但不能据其要求开发第二套图模型。**

## 8. 尚待最终确认的最小决议

1. 接受 **Knowledge 语义层 + Workflow 执行层** 两层架构，Intent 为桥梁；Recognizer/Validator 在两层上完成 Intent 准入，不创建独立层级。
2. Knowledge 为统一外部知识抽象，但内部仍保持类型化 Concept/Entity/Relation/Fact/Rule/Intent/Applicability、真实来源/版本/作用域；具体行业知识属于 Business。
3. Intent→Workflow 为 Business 静态显式绑定，不新增动态 Function Registry/执行器；Rule/Decision 在 Workflow 执行。
4. 0.11.2 只提供结构化/已选择输入的通用 Recognizer/Validator/Intent 合同，0.11.3 完成自然语言交互。
5. R13 的通用 DB Element + 可选 Query Capability Element 与表达式引擎候选保留作为 Knowledge/Workflow 下的支撑组件，不作为第三、第四架构层。
