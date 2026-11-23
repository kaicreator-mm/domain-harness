# DomainHarness 0.11.2 · R14 Semantic Workflow Model：领域语义与现有 Workflow 的具体建模

```ini
OUTPUT_LABEL=DH_V0112_R14_SEMANTIC_WORKFLOW_MODEL_PRODUCT_L1_CLARIFICATION
REPO=kaicreator-mm/domain-harness
ISSUE=#1612
PR=#1702
BASE_PRODUCT=R8_R9_R10_R11_R12_R13
STATUS=PRODUCT_L1_DESIGN_CANDIDATE_NOT_OWNER_FROZEN
L2=NOT_STARTED
IMPLEMENTATION=NOT_STARTED
CI=NOT_RUN_DOC_ONLY
```

> **纠正 R13 缺口：** 单纯说“Recognizer→Query→Rule→Decision 走 Workflow”并没有建立 Domain Intelligence。本方案提出真正能连接**领域语义、领域能力、数据流、控制流、证据流、已存在的 Workflow API**的建模合同。所有 TS 类型/函数名是待评审**候选示意**，不是已实现 SDK API；依现行 `standard-workflow.ts`、`native-workflow-composition.ts` 真正支持的原生语义设计。不得新建 Workflow DAG Runtime、中央 Rule/Function Registry、FunctionRef/Target/Lock 或 KDP 领域调度。

## 1. 四个模型，明确彼此关系

1. **Domain Semantic Model（领域语义模型）**：DomainRef、Concept、Entity、Relation、Property/Fact、Knowledge、Rule、Applicability 与 Source/Version，回答“字段/关系/断言**意味着什么**，其来源和适用性是什么”。外部 Business 定义具体领域实例；SDK 提供通用合同与 Store/Query。
2. **Semantic Capability Model（语义能力模型）**：描述**一个实际可调用 Business Function/Element 的语义接口**，包含 Operation/Goal、consumes/produces 语义端口、前置条件、能力要求、结果、允许的副作用和证据义务，并通过原生函数值绑定具体实现。Recognizer、Validator、Query、Rule、Decision 是可以组合的语义职责，不是框架强制五个类。
3. **Semantic Workflow Model（语义流程模型）**：在已有 Workflow 的业务组合上定义每个步骤的**语义输入输出映射（data edges）、结果条件与分支（control edges）、Source→Fact→Rule→Decision 的证据传递（evidence edges）**；每个边有领域/版本/Subject/Time、TypeScript 类型及语义类型约束。明确 Goal→最终 Decision 的闭环；不存在的知识/错误转换/不兼容语义不可凭同名或类型匹配直接连线。
4. **Workflow Execution（现有执行机制）**：原生 TS 闭包、`StandardWorkflowSession` 或 `XStateWorkflowElement` 实际执行，负责预算/Actor/Hook/终态；**语义模型不复制执行器、没有额外 Step 调度/动态脚本引擎**。业务 Package 静态 import、普通方法调用，KDP 只做原有生命周期与最终兜底。

## 2. 语义流程最小合同（仅建议，非已公开类型）

### 2.1 Semantic Port — 普通 TypeScript 类型不足以证明语义相容

一个端口至少能够表达：
- `semanticRef = { domainId, domainVersion, conceptId, attributeId? }`：明确语义所属领域，不能只靠 `string` 字段名匹配。
- `valueType`：值的结构/TS 类型及必要时可验证 JSON Schema；泛型 TS 类型运行时会被擦除。
- `cardinality`（one/many/optional）、`requiredFacts`、`scope`、`knowledgeSnapshot`：输入预期及所需已选数据；只能在该步骤真正依赖时要求。
- `source/evidence`：数据证据和来源信任条件；输出只允许引用真实消费的事实/来源/规则。

例如“一个业务主体 ID”和“一个产品 ID”都可能是字符串，但 `SemanticRef` 不同，**不得自动连接**。跨 Domain、单位转换或数据类型变更必须显式声明 Business 提供的转换/映射并验证其来源和适用性。

### 2.2 Semantic Operation — 真正可执行的 Function + 语义合同

```ts
// 仅示意，名称和签名留待 L2。
type SemanticRef = {
  readonly domainId: string;
  readonly domainVersion: string;
  readonly conceptId: string;
  readonly attributeId?: string;
};
type SemanticPort = {
  readonly semantic: SemanticRef;
  readonly required: boolean;
  readonly evidenceRequired?: boolean;
};
type SemanticOperation<I, O> = {
  readonly id: string;            // 语义 Operation 的稳定身份
  readonly purpose: string;       // 本功能要解决的领域问题
  readonly consumes: readonly SemanticPort[];
  readonly produces: readonly SemanticPort[];
  readonly applicability?: unknown;
  readonly needs: readonly string[]; // 如 property-query、graph-query；不等于动态 loader
  readonly effects: 'pure' | 'read'; // 0.11.2 不声明通用 Host Effect 授权
  readonly invoke: (input: I, ctx: unknown) => Promise<DomainResult<O>>;
};
type DomainResult<T> =
  | { readonly kind: 'VALUE'; readonly value: T; readonly evidence: readonly string[] }
  | { readonly kind: 'NEED_INPUT'; readonly missing: readonly string[] }
  | { readonly kind: 'UNDETERMINED'; readonly code: string; readonly evidence: readonly string[] }
  | { readonly kind: 'DENIED'; readonly code: string; readonly evidence: readonly string[] }
  | { readonly kind: 'ERROR'; readonly code: string };
```

Business Function 可直接导出；`SemanticOperation` 只是将其语义说明和**真实函数值**并置的候选工具，不要求继承某个 Element 基类或注册到 SDK。该模型中的 `invoke` 是业务函数引用，不是已存在的 `NativeWorkflowContext.invoke`，最终命名可避免混淆。

### 2.3 三类显式连接

| 边 | 核心问题 | 必须检测 |
|---|---|---|
| **Data edge**：前步输出→后步输入 | 数据的领域**语义**能否匹配？哪些映射/适用性条件成立？ | TS 值类型 + SemanticRef + 显式来源、版本、快照与转换；非兼容拒绝 |
| **Control edge**：结果→下个步骤/终止 | 当前 Outcome 允许继续执行吗？需要 ASK、REJECT、UNKNOWN 或 FAILED？ | 非成功不继续 Rule/外部 Action、不隐式降级成功；Branch 覆盖 |
| **Evidence edge**：来源→最终依据 | 哪些事实/关系/规则实际参与了判断？ | 每个节点产生/传递实际引用，最终 Decision 引用真实使用的 Fact/Rule/Source；不把向量候选冒充可信证据 |

### 2.4 语义流程的完整性判定

要能在生成期（不是 SDK Runtime 重新验证源码）检查：
- **Goal/Operation coverage**：有明确输入、语义目标、最终结果；每个必须的输入端口都有来源或 ASK 分支；
- **Semantic compatibility**：所连接的 Port 的领域、Concept、值类型、版本和适用条件相容；显式跨域映射可证明；
- **Knowledge obligations**：访问 Fact/Rule 的节点对 Scope/AsOf/Snapshot/Source 负责；不能把无事实变成布尔 `false` 或决策成功；
- **Branch totality**：所有 WorkflowOutcome 非成功分支的去向可确定，不隐式默认 COMPLETE；合法业务拒绝有明确 REJECT；
- **Evidence closure**：最终 Decision 的关键结论与所使用事实、规则、来源的链可回溯；无数据时 UNKNOWN 或 ASK；
- **Bounded execution**：本工作流预算、数据库扫描/返回、向量 TopK、图深度等既有/新增额度与副作用顺序吻合。
静态 TS 类型只能覆盖其中一部分；语义正确性还必须有生成期检查、真实数据测试及干净外部 Consumer E2E，不能声称可以对任意业务证明完全正确。

## 3. 具体领域智能流程模型示例（**外部 Business Package 示例，不是 SDK 实现**）

为避免 SDK 行业化，使用完全假设的外部领域 `equipment-qualification`，只说明组合关系；以下语义与规则均归外部业务，**不得并入 SDK 核心**：

```text
Goal: assessQualification(subject, at, selectedSnapshot)
  input semantic: EquipmentRef + AssessmentTime
  selected domain: equipment-qualification@1
  snapshot: knowledge-2026-11 (实际只有被选定时使用)
  │
  ├─ N1 ValidateInput
  │   consumes: EquipmentRef + AssessmentTime
  │   produces: ValidAssessment
  │   missing/invalid → ASK 或 UNKNOWN
  │
  ├─ N2 QueryKnowledge [depends on DomainQuery + DB Provider]
  │   consumes: ValidAssessment + KnowledgeSnapshot
  │   produces: EvidenceBackedFactSet
  │   no facts/conflict/unverified → UNKNOWN
  │
  ├─ N3 EvaluateRule [ExpressionElement or native Business Function]
  │   consumes: EvidenceBackedFactSet + SelectedRule
  │   produces: RuleJudgment + UsedFact/Source/RuleRefs
  │   conflicting rules → UNKNOWN_CONFLICT
  │
  └─ N4 Decide [Business Function]
      consumes: RuleJudgment + Evidence
      produces: QualificationDecision
      ACCEPT → Workflow.COMPLETE + evidence
      DENY   → Workflow.REJECT
      UNKNOWN/ASK/FAILED → 各自保留，不能运行 ACCEPT 后续分支
```

这四节点不是 SDK 固定流水线。另一个领域可以跳过 Recognizer、合并 Rule+Decision、单独做 Query，或使用多条并行查询；仍通过同一语义端口/结果/证据约束建立正确连接。

## 4. 与**现有** Workflow API 的真实映射（设计重点）

已读取 `packages/domain-harness/src/native-workflow-composition.ts`：
- `root.invoke(action)` **一定将普通返回值包装为 `{ status:'COMPLETE', value }`**。如果 action 返回 `{kind:'UNDETERMINED'}` 或 `{status:'UNKNOWN'}`，使用 invoke 会产生 `COMPLETE` 外层包装，**不能用它传递业务非成功状态**。
- `root.invokeOutcome(action)` 接受实际 `StandardWorkflowOutcome<T>`，保留 `COMPLETE/REJECT/ASK/WAIT/UNKNOWN/FAILED`；推荐用于有语义拒绝/缺失/冲突的节点。
- `root.leaf({run,start?,end?})` 也保留业务 Outcome，在 start/run/end 前预留调用预算；注意它不会自动替 Domain Result 做映射。
- `routeWorkflowOutcome(...)` 对全部六种状态做具名路由；RootBudget 和生命周期仍由现有 Standard 控制。
- 现有 `StandardWorkflowOutcome` 的**非成功分支只有 reason.code/message，没有标准 Evidence 字段**。不应在候选代码中假设当前 Workflow 已将非成功 Evidence 存入 Outcome；可由 Domain App 本次运行的局部 `DecisionRecord`/Evidence sidecar 收集和保存，不在 ESM 模块放全局可变 Evidence；若真有必要新增通用 Evidence Carrier，必须另行论证并在 L2 独审中确认。

### 4.1 显式映射函数（候选示意，不是 SDK 已实现）

```ts
import type { StandardWorkflowOutcome } from '@kaicreator/domain-harness';

// 根据业务领域结果显式转换，不靠 falsy/truthy 或包装为 COMPLETE。
function asWorkflow<T>(r: DomainResult<T>): StandardWorkflowOutcome<T> {
  switch (r.kind) {
    case 'VALUE': return { status: 'COMPLETE', value: r.value };
    case 'NEED_INPUT':
      return { status: 'ASK', reason: { code: 'REQUIRED_INPUT', message: 'Input required' } };
    case 'UNDETERMINED':
      return { status: 'UNKNOWN', reason: { code: r.code, message: 'Not determined' } };
    case 'DENIED':
      return { status: 'REJECT', reason: { code: r.code, message: 'Not permitted' } };
    case 'ERROR':
      return { status: 'FAILED', reason: { code: r.code, message: 'Operation failed' } };
  }
}
```

这里 DomainResult 属于**提出的**领域结果类型，`StandardWorkflowOutcome` 才是真实 SDK 已存在的工作流结果类型。Scope/Source/Evidence 应在业务流程的独立本地记录中按实际使用收集，且不同业务拒绝/未知应保留相应 code，不被静默转成成功。

### 4.2 直接可映射的业务组合样例

```ts
import { StandardWorkflowSession } from '@kaicreator/domain-harness';

// 假设外部 Business 提供了 type-safe validate/query/evaluate/decide 实现；
// SDK 不含这些领域 Function。以下调用方式对应现行 SDK 的 invokeOutcome。
async function runQualification(
  input: AssessmentRequest,
  operations: {
    validate: (x: AssessmentRequest) => Promise<DomainResult<ValidatedRequest>>;
    query: (x: ValidatedRequest) => Promise<DomainResult<FactSet>>;
    decide: (x: FactSet) => Promise<DomainResult<QualificationDecision>>;
  },
) {
  const usedEvidence: string[] = [];  // 本次 Domain App 调用所有，不是 ESM 全局
  const session = new StandardWorkflowSession({ maxCalls: 3, maxSteps: 4, maxDepth: 0 });
  const outcome = await session.run(async root => {
    const valid = await root.invokeOutcome(async () => asWorkflow(await operations.validate(input)));
    if (valid.status !== 'COMPLETE') return valid;
    const facts = await root.invokeOutcome(async () => {
      const response = await operations.query(valid.value);
      if ('evidence' in response) usedEvidence.push(...response.evidence);
      return asWorkflow(response);
    });
    if (facts.status !== 'COMPLETE') return facts;
    return root.invokeOutcome(async () => {
      const response = await operations.decide(facts.value);
      if ('evidence' in response) usedEvidence.push(...response.evidence);
      return asWorkflow(response);
    });
  });
  return { outcome, evidence: usedEvidence };
}
```

示例把 Rule 评估组合在 `decide` 内，证明**不需要固定 Rule 节点**。需要独立 Rule 时可增加一步，并按根预算增额。完整代码仍是外部 Consumer 草图；生成期严格 TypeScript/真正 Consumer 及业务语义验证是后续必要条件。实际 Evidence 不应仅用字符串数组充当最终来源真伪证明；正式设计要采用 Fact/Rule/Source/Version 稳定引用。

## 5. LLM 怎么从领域语义生成真实 Workflow（不是自动运行 AI 计划）

1. **Goal/Intent 识别或明确选择**：0.11.2 接收已选 Operation/IntentRef 与 Context，完整交互意图消歧属于 0.11.3；不存在已选 Operation 则 ASK/UNKNOWN。
2. **领域语义建模**：依据实际 Source/Claim 提取 Concept/Entity/Relation/Fact/Rule/Applicability，关联领域语义 ID 和 Source；缺关键材料明确 UNKNOWN。
3. **Function 语义建模**：为真实 Business Function/Element 声明 `consumes/produces` SemanticPort、`purpose/needs/preconditions`、Outcome/Effects/Evidence 合同；不假设缺失 API 或运行时动态加载。
4. **语义连线**：为每个后继 Port 选择匹配的前驱结果/知识查询；若领域 ID/语义/版本不兼容，则要求显式转换 Business Function；检查必需事实是否可获得，不可满足则 ASK/UNKNOWN。
5. **编写静态原生 Workflow**：实际 TS 代码组合 `StandardWorkflowSession`、`invokeOutcome`、`leaf`、`routeWorkflowOutcome`；预算正确、分支完整；不生成第二动态 Workflow Executor。
6. **生成期审查**：TS strict、静态依赖与导出、语义 Port 连线与 Source/Rule 追溯、Outcome 全分支、反例/冲突/过期/非法日期/失效 DB/证据闭合，真实外部 SDK Consumer 运行。编译成功不等于领域语义正确。
7. **输出交付**：领域 Package 真实文件 + Semantic Mapping/Workflow Explanation（供人和 Agent 审核）+ 类型/正反例证据。Skill 只指导选择，实际能力以 npm SDK exports/TSDoc/权威 spec 为准。

**Single Source of Truth：** 语义操作说明优先与真实 Function/Element 的 TypeScript 代码并置（或由代码生成只读文档），Workflow 执行逻辑也在同一个 Business 源码，不手工维护另一个可执行 JSON Workflow 图造成双重事实源。Skill 不作为第二业务图解释器。可选的静态描述/Port 列表主要用于 LLM 设计和生成期校验，明确不是运行期需要解析执行的 DAG。

## 6. DI-AC29–DI-AC34（新增 Product/L1 验收候选，NOT_RUN）

| ID | 可证伪验收 |
|---|---|
| **DI-AC29** | 一个实际业务 Operation 明确 Goal、SemanticPort、Concept/Scope、输入输出及 Source/Rule 证据；换领域无需改 SDK，且同 TS string、不同 Domain/Concept 的端口连接在生成期拒绝，显式合法转换可通过 |
| **DI-AC30** | LLM 生成真实 Workflow 组合时具有 data/control/evidence 三类可追溯边；所需 Fact 不存在进入 ASK/UNKNOWN，Domain/Version 冲突不产生 COMPLETE；完整分支符合语义 |
| **DI-AC31** | 直接使用实际 `StandardWorkflowSession` 和 `invokeOutcome` / `leaf`，冲突/业务拒绝/技术失败分别保持 UNKNOWN/REJECT/FAILED，不使用 `invoke` 把非成功业务 Outcome 包装为 COMPLETE |
| **DI-AC32** | Rule+Decision 可合并或拆分，Recognizer/Validator 可省略；相同语义模型适用于多种 Workflow 形态，没有固定五节点及新增 Runtime |
| **DI-AC33** | 真实 Domain Decision 的完整/非成功证据在当前 Outcome 不能携带的场合，使用本次运行局部记录/外部 DomainResult 保留，不凭空宣称 WorkflowOutcome 已支持 Evidence |
| **DI-AC34** | 依据 Skill + 真实 TS exports/Operation 语义声明独立生成一个**全新领域**的 Package + Workflow；类型、语义 Port 连线、选定知识、正反例、证据/结果闭环通过真实外部 Consumer，SDK 不修改 |

## 7. Owner 待裁决

R14 请求将 **Semantic Workflow Model（语义端口 + data/control/evidence edges + 领域结果/WorkflowOutcome 显式适配 + 生成期语义连线验证）** 纳入 v0.11.2 Product/L1 必要功能范围，而不是只给一个固定的多节点 Demo。本设计**不新建执行 Runtime**，并保留现有 Workflow 的真实 API 和责任。若批准，进入 L2 比较：声明/TS 推导/静态 helper 的最小形式、SemanticRef 精确兼容规则、Evidence Carrier 方案、Skill 选用/验证器范围、两个陌生领域 Consumer E2E。
