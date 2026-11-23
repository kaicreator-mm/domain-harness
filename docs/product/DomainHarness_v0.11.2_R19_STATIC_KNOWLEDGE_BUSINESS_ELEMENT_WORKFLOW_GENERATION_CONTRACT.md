# DomainHarness 0.11.2 · R19：不可变 Data Knowledge + 原生 Function Knowledge，组成 Business Element，Workflow 的业务接口由生成期定义

```ini
OUTPUT_LABEL=DH_V0112_R19_STATIC_DATA_NATIVE_FUNCTION_BUSINESS_ELEMENT_WORKFLOW_BOUNDARY
REPO=kaicreator-mm/domain-harness
VERSION_ISSUE=#1612
PRODUCT_PR=#1702
BASE_PRODUCT=R15_R16_R17_R18
STATUS=PRODUCT_L1_OWNER_CLARIFICATION_CANDIDATE_NOT_FROZEN
L2=NOT_STARTED
CODE=NOT_STARTED
CI=NOT_RUN_DOC_ONLY
```

> **R19 Owner 设计修正优先于 R18 的多余方案：**
> 1. DataKnowledge 是**生成时硬编码的不可变对象**，不是动态知识数据库记录。
> 2. FunctionKnowledge 是可访问 DataKnowledge 的**原生 Function / Element 方法**；与 DataKnowledge 和业务代码共同形成**内聚的 Business Element**，无需 OperationDescriptor/OperationId/FunctionRef/绑定 Registry。
> 3. Function 自己维护自己的内部状态；多个 Function 需要共享同一状态时，先组合为拥有同一状态的更大 Function / 内聚 Business Element，而不是新设中央 State 框架。
> 4. Workflow 保留现有 SDK 的通用执行抽象；**业务输入输出、参数/结果结构和交互完全由生成期定义**，不需要一个统一的 DomainResult/ValidatedIntent/KnowledgeRef/EvidenceCarrier 公共数据协议。
>
> 这是一份 Product/L1 候选文档，不改动 0.11.1 已验收 SDK Workflow API，不擅自宣称已经实施。R18 中 OperationDescriptor、operationId 静态映射、强制 stateAccess 及生成期通用知识连线验证要求被本方案**替换/删减**。

## 1. 极简对象关系

```text
Business Package (ESM, generated / authored)
  ├─ Business Element A
  │    ├─ Data Knowledge       immutable compiled-in object
  │    ├─ Function Knowledge   native function/method (reads Data Knowledge)
  │    ├─ Business Logic       direct TS code
  │    └─ optional Local State owned by the function/Element
  ├─ Business Element B ...
  ├─ Intent Recognition Workflow      existing Standard Workflow capability
  └─ Intent Handling Workflow         existing Standard Workflow capability

Workflow → direct import / call of Business Elements
Business Element → can use existing Standard Elements, SQLite/other providers as needed
```

- **Knowledge 是知识的概念/分类，而不是强制独立的 Runtime Layer、专用 Registry 或 Store**。先以 Business Element 的生成期静态代码/常量表达。
- **Business Element 是内聚复用单元**：可包含 readonly 数据对象、一个/多个原生函数/方法和内部状态/资源；普通业务 helper 仍可独立为函数，不必强制全部 Class 化。
- 以前的“Knowledge 语义层 + Workflow 行为层”是**设计职责视角**，不意味着 SDK 中必须提供一个与 Element 平行的可执行 Knowledge Runtime。

## 2. Data Knowledge：生成时硬编码的不可变对象

DataKnowledge 的来源可以是用户提供的资料、领域定义、规则数据、表格、JSON/YAML 等，但进入实际 Business Package 时**转换成代码中固定的静态常量/不可变对象**。它回答“已生成版本知道什么”，例如：Concept、Relation、Rule 的参数和常量、Intent 的静态定义、适用范围等。

- 不要求运行时动态写入、覆盖、修改、迁移或在 SQLite 中注册 DataKnowledge。
- 不需单独的 KnowledgeId、KnowledgeSnapshotId、通用 `contentKind`、Schema Registry 或跨知识对象的统一可执行映射表，除非具体业务确实需要这些普通数据字段。
- **不可变是运行期的实际合同**：TypeScript `readonly` / `as const` 主要是类型级约束；必要时将深层对象也冻结、复制/隔离引用或使用静态只读数据结构，避免运行时无意修改。生成期应测试多次调用前后对象保持相同。
- 如果来源、版本或适用性在该领域对业务正确性重要，则作为 DataKnowledge 的**普通业务字段**明确保存；不强制所有项目使用公共 Source/Version/Snapshot Schema。
- 当知识发生修订，生成并交付**新的 Business Package/版本**，而不是静默热修改当前已加载的 DataKnowledge。

**特别区分动态数据：** 运行中的当前库存、业务账户状态、消息、审批状态、实时外部事实，不是这些被编译冻结的 DataKnowledge。它们由业务 Function 从其自身状态/SQLite/外部资源读取，Workflow 按需消费；外部读回不因为被业务使用就成为可任意修改的静态知识。

## 3. Function Knowledge：真正可执行的原生函数，状态自己维护

FunctionKnowledge 即 Business Package 中已写好的原生 Function / Element 方法，不只是一条返回 OperationDescriptor 的 Knowledge 记录：

- 能读取所属 Business Element 的 DataKnowledge 和普通业务上下文，并调用其他**静态可信导入**的 Function/Standard Element。
- 同一个 Function/Element 能同时持有业务代码、Readonly DataKnowledge 和必要的内部变量；**状态不归 SDK 中央 State Store/Function Registry**。
- 若多个 Function 需要读写同一份状态，**先组合成一个更大的内聚函数/封装于同一 Element**，由其统一维护同一份状态与不变量；不以多个孤立 Function 通过隐藏全局可变对象共享状态。
- 状态的**作用域由生成者决定**：单次调用、Workflow Session、Business Element 实例或业务资源生命周期；不能意外用进程级共享状态混淆不同请求/租户。并发访问、跨进程一致性属于该具体业务代码/资源提供者的责任。
- 对持久业务状态或跨进程权威数据，普通函数本身的内部变量不能充当数据库/Host 的事实来源；函数可以封装真实 DB/Host State 调用，但 **持久性和一致性必须由实际存储/外部系统承担**。
- 先前 FunctionKnowledge 的 `stateful` 与 `external` 仍可作为**可选的 TSDoc/代码元数据描述**，不是强制布尔字段、更不是四个新根类。此处 **stateful 指函数自身维护内部状态**；**external 指调用进程/应用之外的能力**；本轮不再要求 `stateAccess` 统一字段。是否需要用户批准仍由 R17 的可信业务执行策略决定。

### 示例：静态数据 + 原生方法组成一个内聚 Element

```ts
// 示意业务代码，非 SDK 导出；示例中的领域常量来自生成期。
const qualificationKnowledge = Object.freeze({
  minimumScore: 70,
  ruleLabel: 'minimum-score',
} as const);

export class QualificationElement {
  // 状态只属于本 Element 实例；实际作用域由应用显式控制。
  private checkedCount = 0;

  public assess(input: { score: number }) {
    this.checkedCount++;
    return {
      qualified: input.score >= qualificationKnowledge.minimumScore,
      checkedCount: this.checkedCount,
      rule: qualificationKnowledge.ruleLabel,
    };
  }
}
```

多个方法若需要共同的 `checkedCount`，应在一个内聚的 Element/单个组合操作中使用该状态。此例不暗示返回值统一为 SDK 的 DomainResult；可以返回任意业务定义的类型。

## 4. Workflow：只保留最小通用执行抽象，业务接口由生成者写出

已核对真实 v0.11.1 SDK：
- `WorkflowElement<Input,Output>` 是**现有**抽象 Class，含 `run(input): Promise<StandardWorkflowOutcome<Output>>`；它并非字面上的空类。现有 `StandardWorkflowSession` / `XStateWorkflowElement`、预算及失败状态继续有效。
- Owner 所称“公共空的抽象”应理解为**不规定业务字段、统一 Intent 形状、DomainResult/OperationDescriptor**。如果需要标记型的空语义协议，可选普通空接口/抽象基类，但**目前没有必要为了空接口新增 SDK API**；现有 Workflow 基础 API 够用。
- **Intent Recognition Workflow / Intent Handling Workflow** 是两个业务用途，不强制两个 SDK 根类，也不规定 `ValidatedIntent` 或 `DomainDecision` 必须具备统一结构；每个 Domain Package 生成自己的 typed arguments / results。
- **保留 Workflow 的真实运行终态安全语义**：使用已有 `StandardWorkflowOutcome` 时，非成功状态（ASK/WAIT/REJECT/UNKNOWN/FAILED）不得隐式成为 COMPLETE；涉及业务非成功的 Function 必须由业务正确适配并使用 `root.invokeOutcome` 或 `leaf`；`root.invoke` 只适合普通值。
- 普通 Function 的输入输出由生成期 TS 类型、真实调用和测试确定；如果采用更弱的标记型抽象，不能因此失去已有 Workflow 的最低失败/预算保障。

### 示意调用（不是新的 SDK API）

```ts
import { StandardWorkflowSession } from '@kaicreator/domain-harness';
import { QualificationElement } from './qualification.js';

export async function handleAssessment(input: { score: number }) {
  const business = new QualificationElement();
  const flow = new StandardWorkflowSession({ maxCalls: 1, maxSteps: 2, maxDepth: 0 });
  return flow.run(root => root.invoke(() => business.assess(input)));
}
```

上述 Function 返回普通业务结果，`root.invoke` 在本例恰当；如业务函数实际返回非成功 `WorkflowOutcome`，必须改用 `invokeOutcome`，不能把 `UNKNOWN` 作为 `COMPLETE.value`。

## 5. SQLite/Query 的位置：保留通用能力，但不再作为静态知识运行基础

R10 原先将“所有 Domain Knowledge/Rule/Fact 在 SQLite 持久存储、更新、重开”作为 v0.11.2 必选知识功能，其**静态 DataKnowledge 归属已被本 R19 修正**：生成期硬编码并不可变，**不是**运行时可修改的 Knowledge Store，因此不能同时要求其必须在 SQLite 更新。

仍可保留 SDK 的通用 **Database Element**（如 SQLite 驱动）与 SQL/Vector/Graph/JSON/YAML Reader/Query 能力，供真正需要持久化的业务状态、外部数据、索引或生成期材料处理使用；是否全部列为本版必选功能须在统一 Product/L1 结论中重新审定，不能以旧 R10 “可修改 Knowledge” AC 自动要求实现。

- 向量召回返回候选数据，不自动修改静态 DataKnowledge；
- 业务当前状态、外部数据、Tool Result 走真实 Store/Host，不改变静态知识对象；
- 若应用确实需要运行时可变规则/知识，那是**另一个明确的产品能力**，不能偷偷覆盖本版“生成期硬编码不可变”合同或借 SQLite 改写已加载 Business Package。

## 6. 同 R16/R17 的关系

- R16 双 Workflow、0.11.4 Authorized Action 合并的提案仍然成立，但**业务 State 由 Function/Element 自己组织维护**，SDK 不强制中心 State Element；外部真实 Effect/权限、ACK/readback 仍有实际责任，不能靠进程变量解决持久幂等。
- R17 的 `PREAUTHORIZED`（无需额外用户确认）/ `USER_APPROVAL`（具体操作需要用户同意）依然是 **业务调用策略**，不由是否 stateful/external 自动决定。
- Function 能直接调用其它生成期选定的可信资源，实际 OS/DB/Host 权限与错误结果仍正常生效；不恢复 KDP 中央 FunctionRef/Permit/Tool Registry。
- LLM/Skill 根据实际 SDK TypeScript exports/TSDoc 和本规范，在生成期产出 readonly 数据对象、Native Functions、Element 和两个 Workflow；不用再生成外部知识表、FunctionDescriptor、统一 DomainResult 或校验一套语义 Port/Edge 图。

## 7. R19 提议取代的旧候选项目与新验收

| 旧项 | R19 的替代方向 |
|---|---|
| R18 `DataKnowledge {kind,ref,contentKind,value}` / snapshot/持久数据 | 直接写入 Business Element 的 readonly 常量/对象；仅实际业务需要时加版本/来源字段 |
| R18 `FunctionKnowledge {operationId, inputType, outputType, stateful, external}` | 原生 TS Function/Element 方法；可选 TSDoc 行为描述，不强制 wrapper/Descriptor |
| R18 统一的 OperationId→函数绑定 | 生成期直接 import、直接调用；不建立必选 SDK Knowledge-to-Function 映射 |
| R18 `stateAccess` 或独立 State 层 | 由函数/内聚 Element 实例拥有内部状态；真实外部/持久状态由所选 DB/Host 处理 |
| R15/R16 强制统一 `ValidatedIntent / DomainDecision / DomainResult` | 只保留现有 Workflow 的通用执行结果，具体业务的输入输出/交互由生成者自由定义 |
| R10 通用动态 Knowledge Store 必选 / 运行时更新 Knowledge 验收 | **静态知识不运行时修改**；通用 SQLite/Query 是独立可选能力，版本功能归属重新审核 |

### R19 新候选验收（全部 NOT_RUN）

| ID | 验收场景 |
|---|---|
| DI-AC55 | 两个不同行业 Business Package 以源码中的静态不可变 DataKnowledge 组织概念/Rule/参数，实际多次 Workflow 运行前后无知识变异；不安装特有 Knowledge Store |
| DI-AC56 | FunctionKnowledge 是普通 TS 函数/Element 方法，直接读取本 Element 的 DataKnowledge，返回各自业务类型；无需 OperationDescriptor、OperationId/FunctionRef/Registry |
| DI-AC57 | 单 Function 自己持有并维护实例/闭包状态；多个共享状态的 Function 重构为一个更大的内聚业务操作或 Business Element；不同会话/请求作用域不意外共享 |
| DI-AC58 | Intent Recognition/Handling 共享现有 Workflow 抽象但业务输入输出完全不同；无需统一 DomainResult、统一 Intent/schema 或专有业务回执；已有运行期失败不被转为成功 |
| DI-AC59 | 函数对真实 DB/Host 的查询/写入/Effect/批准按本身业务规则/资源权限处理，静态 DataKnowledge 不被用作当前业务 State 或自动授权；实际 UNKNOWN 不作成功 |
| DI-AC60 | 生成新领域时 LLM 只需将数据知识生成只读常量、函数知识生成 TS 实现、组合内聚 Business Element、由现有 Workflow 调用；可通过真实外部 SDK-only Consumer，无 SDK 领域化或新 Runtime |

## 8. 最小决议

**建议按 Owner 这三点收敛架构：**
- Data Knowledge = **生成期写死、运行期不可变的业务对象**；
- Function Knowledge = **可访问 Data Knowledge 的原生业务函数/Element 方法**，函数内维护状态，多函数共享状态则先合并为内聚组合；
- Workflow = **复用现有通用运行抽象，具体输入输出交互由 Business 生成期定义**，不强制统一领域返回/识别/决策 Schema。

R19 仅变更 Product/L1 候选文档，不在 Owner 最终冻结前单方面改变已接受的 0.11.1 SDK Workflow 代码、正式统一规范或 Roadmap。
