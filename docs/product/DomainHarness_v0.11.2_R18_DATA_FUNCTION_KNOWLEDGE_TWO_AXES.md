# DomainHarness v0.11.2 · R18：Data Knowledge + Function Knowledge 两类知识与函数两维分类

```ini
OUTPUT_LABEL=DH_V0112_R18_DATA_FUNCTION_KNOWLEDGE_TWO_AXES_PRODUCT_CLARIFICATION
REPO=kaicreator-mm/domain-harness
VERSION_ISSUE=#1612
PRODUCT_PR=#1702
BASE=R15_R16_R17
STATUS=PRODUCT_L1_CANDIDATE_PENDING_OWNER_FINAL_REVIEW
L2=NOT_STARTED
IMPLEMENTATION=NOT_STARTED
CI=NOT_RUN_DOC_ONLY
```

> Owner 提案：Knowledge 只保留两种**基本类别**：**Data Knowledge** 返回数据，**Function Knowledge** 返回操作；Function Knowledge 通过**是否有业务状态**与**是否调用外部**两种独立属性分类。R18 精简顶层知识类型，但保留必要的语义、来源、类型、快照与真实执行权限边界。下面所有名称和类型是**设计示意，不是 SDK 已公开 API**。SDK 始终**领域无关**，真实业务 Concept、Rule、Function/Tool、State schema 等属于外部 Business Package。

> **R19 SUPERSEDED / 历史候选：** [R19 Owner 最新明确方案](./DomainHarness_v0.11.2_R19_STATIC_KNOWLEDGE_BUSINESS_ELEMENT_WORKFLOW_GENERATION_CONTRACT.md)已将 DataKnowledge 收敛为**生成期硬编码的不可变业务对象**，FunctionKnowledge 收敛为可直接访问 DataKnowledge 的**原生 Function/Element 方法**，二者连同业务代码构成内聚的 Business Element。R18 的强制 KnowledgeRef/SnapshotId/contentKind、OperationDescriptor/OperationId/动态知识存储、stateAccess、统一知识查询接口**不再是必需产品合同**；函数的 stateful/external 仅可选说明，状态由 Function/Element 自行管理，共享状态先在 Business 内聚封装。Workflow 的具体业务输入输出由生成期定义，复用已有 SDK 基础执行抽象。旧 DI-AC48–54 不应当作强制实现门，新的候选以 R19 DI-AC55–60 为准。**仍为 Product/L1 待审，非已发布 SDK。**

## 1. 统一 Knowledge 之下的两个类别

| 知识类别 | 定义 | 典型内容 | 读取产物 |
|---|---|---|---|
| `DataKnowledge` | 可描述/存储/查询的结构化领域知识，回答“是什么” | Domain/Concept/Entity/Property/Relation/Fact/Source、Rule 的条件/声明/参数、Intent/Operation 定义、Applicability、Business State 的**定义**、Capability/Tool 描述 | 带领域/版本/适用性/来源的普通数据或引用 |
| `FunctionKnowledge` | 描述**已选可用函数/Element 方法**的含义、输入输出、调用约束、状态与外部依赖；回答“能做什么” | Recognizer、Validator、Rule 求值、Decision、Query、业务 Transition、Tool、外部操作 | `OperationDescriptor / OperationRef`（加上可信 Business 绑定的实际 TS Function），而不是任意可执行数据库字符串 |

**不是**把 DataKnowledge 的 `Rule` 或 `Concept` 再变成第三大类。`Rule` 的声明是 DataKnowledge；执行/评价该 Rule 的原生 TS Function 或已选表达式求值 Function 可被描述为 FunctionKnowledge，两者通过明确规则 ID 关联。某个 `Intent` 的含义/参数也是 DataKnowledge；负责识别/验证它的 Function 是 FunctionKnowledge。

**事实当前值 vs 声明：** Concept/State schema/允许 Transition 属于知识内容。**权威实时 Business State、权限授予状态和 Host 完成状态**由实际 DB/Host/state-owner 返回；可以作为带时间/来源的 DataKnowledge 快照被查询，但不能仅凭旧知识记录替代当前 CAS 或真实资源权限。

## 2. Function Knowledge 的两种正交属性

为避免将一个框架功能误解为四种互相独立的基类，只在 FunctionKnowledge 上描述：

1. `stateful: boolean`：操作的**业务语义**是否依赖或改变有身份/版本的业务状态。**不等同于** Class 内部是否持有 cache、私有字段、计数器或 Workflow RootBudget。
2. `external: boolean`：操作是否跨出当前 Domain App 本地原生 Function/Element 的控制边界，依赖外部 Host、进程、系统或远端服务。**不等同于**是否有副作用；纯 HTTP 读取也可以是 external，向本地数据库写入也可以是本地有状态行为。

| 状态 | 外部 | 类别 | 例子 | 运行特征 |
|---|---|---|---|---|
| false | false | 本地无状态 | 纯表达式、输入格式校验、对已给事实做判断 | 可在相同确定性输入下复算；实际是否纯净要靠函数合同与测试 |
| true | false | 本地有状态 | 本地业务状态读取、写入、事务/CAS | 必须明确状态源、快照/版本、读写行为和失败语义 |
| false | true | 外部无状态 | 使用已选外部无状态计算服务、只读计算 API | 有 I/O、延迟与外部失败风险，即使不依赖业务状态，也不能承诺纯函数确定性 |
| true | true | 外部有状态 | 远端业务对象读取/修改、外部提交/取消操作 | 需要明确 Host 权限、真实回执、读回/UNKNOWN、必要幂等 |

**维度含义明确：** 
- `stateful` 主要回答“是否需要**业务状态管理**”；若想判断会不会改变状态，仍需在 L2 定义最小 `stateAccess: none/read/write` 或类似业务语义，不能因为 `stateful=true` 就断言有写入。
- `external` 主要回答“是否有**受控执行边界或 I/O 依赖**”；即便 `external=false`，对本地 SQLite 写入仍可能是 Effect。外部“读取”是否来自有状态权威系统，取决于是否依赖其业务状态，不自动因为 external 就变 stateful。
- 原生业务代码不得依赖两个布尔值自动推导“允许调用”“用户已经批准”“是否幂等”或“可缓存/重放”。它们是 **Knowledge 描述维度**，非全权安全授权系统。

## 3. 最小抽象（候选 TS 类型，不引入新运行时）

```ts
type KnowledgeRef = {
  domainId: string;
  domainVersion: string;
  knowledgeId: string;
  snapshotId: string;
};

// 所有实际领域数据都仍有可区别的 contentKind 和 schema/语义版本。
type DataKnowledge<T> = {
  kind: 'data';
  ref: KnowledgeRef;
  contentKind: string;          // concept/entity/relation/fact/rule/intent...
  value: T;
};

// FunctionKnowledge 是可供查询/选择的描述和引用，不能当作 JS 源码。
type FunctionKnowledge = {
  kind: 'function';
  ref: KnowledgeRef;
  operationId: string;
  inputType: string;             // L2 可用 TS/TSDoc/实际 Schema 明确
  outputType: string;
  stateful: boolean;
  external: boolean;
  // 可选更多调用限制、State access、Effect、Approval 要求；
  // 不额外制造第三顶层知识类别。
};
type Knowledge<T> = DataKnowledge<T> | FunctionKnowledge;
```

**执行来源与绑定：** `FunctionKnowledge` 查询返回操作描述/引用；生成期由 Business 静态 import 实际 Function/Element、使用普通 TS 显式映射绑定 `operationId`。数据库、YAML、LLM 文本不能提供任意 JS 源码/模块路径给 SDK 动态加载，也不能让任意描述变成可以执行的操作。OperationId 和函数/方法的合法选择由生成期保证，运行时只处理业务输入/实际资源错误，不重复执行 Package 结构检查。

**Element-First：** 存储/查询、Expression、Workflow、必要 State/Effect 能力可以作为内聚 Standard Element；Recognizer/Validator/Rule/Decision/Tool 是业务 Function 或业务 Element 方法，均可在 FunctionKnowledge 中表示。不是每一种 FunctionKnowledge 要 `extends...`，也不是每个 DataKnowledge 必须建 Class。

## 4. 在两个 Workflow 中怎样使用

```text
Knowledge
  ├─ Data Knowledge: Concepts, Facts, Rules, Intent definitions, Capability/Tool metadata
  └─ Function Knowledge: Recognizer, Validator, Query, Rule evaluators, Decision, Tools
       (stateful? external?)

Intent Recognition Workflow (现有 Standard Workflow):
  → 读取 DataKnowledge 确定意图、Schema/Applicable Rules
  → 调用已选 Recognizer + Validator 的原生 Function
  → COMPLETE(ValidatedIntent) | ASK | UNKNOWN | REJECT | FAILED
       ↓ COMPLETE only
Business 静态 Intent → Handling Workflow
  → 按需要查询 DataKnowledge / 选定 FunctionKnowledge 对应已绑定 Function
  → 按业务状态、外部访问、Effect/Approval Policy 处理不同操作
  → 真实 Decision / Host receipt / Evidence / WorkflowOutcome
```

两个 Workflow 都是职责，不是新的 Workflow 实现/Runtime。无需另做 SemanticPort/DataEdge/控制边编排系统，也不必把 Knowledge 变成隐式动态 Rule Engine。

## 5. 与 R17 两种 Tool 调用政策是**独立的分类**

FunctionKnowledge 的 `stateful/external` 描述调用性质，**不决定用户是否需要批准**。可信 Business/部署明确选择 **PREAUTHORIZED** 或 **USER_APPROVAL**：
- 无状态的外部服务可能需要用户许可（例如发送敏感材料给外部计算服务）；
- 有状态的本地操作可能为预授权（例如已配置的内部同步/缓存或本地保存）；
- 外部有状态 Tool 可以因部署授权而自动执行，也可以要求用户逐次批准；
- 无状态本地 Function 也可以按业务策略要求确认，但通常没有必要。

`stateful/external` 不可替代 `effect` 的只读/修改性质或 R16 最小真实 Host/权限/ACK/UNKNOWN 语义。**不创建“只要标注 preauthorized 就可绕过外部系统权限”的假授权机制**。Knowledge 说明用途，真正的批准策略由可信静态选定的 Business 代码和部署配置执行，不可信 Data/Function 描述不得降级审批要求。

## 6. 对 LLM / Skill 的好处

LLM 可按简单、可验证的选择步骤处理领域材料：

1. 先根据领域资料生成 **DataKnowledge**（类型/关系/事实/规则/意图定义及来源），不发明未知事实。
2. 对每项业务能力生成 **FunctionKnowledge**（Purpose、输入/输出、stateful、external、需要的 State/Host/Effect/Approval 描述），实际 TS Function/Element 方法由 Business 代码实现或复用真正 SDK Standard。
3. 用两种已有 Workflow 职责编排：Intent Recognition / Intent Handling；根据 selected Intent 静态绑定 Business Workflow，按 Knowledge/R17 的实际业务政策调用。
4. 生成期对 OperationId↔真实 TS Export、DataKnowledge↔FunctionKnowledge 引用、接口类型/依赖、stateful/external 描述与行为、权限/审批/状态负例做校验和真实 Consumer 测试。Skill 只导航真实源码/TSDoc/正式规范，不能自发新增 SDK API。

不需要将每个 `Rule`、`Recognizer`、`Validator`、`Tool` 做成独立顶层 Knowledge 类，也无需为 `stateful/external` 的四个象限分别创建 Runtime/抽象根类。

## 7. 0.11.2 新验收候选（NOT_RUN）

| ID | 验收 |
|---|---|
| DI-AC48 | 同一通用 Knowledge Query 正确返回 DataKnowledge 的结构化业务数据及 FunctionKnowledge 的**操作描述/静态绑定引用**，而非任意动态可执行源码 |
| DI-AC49 | FunctionKnowledge 两个独立布尔分类覆盖 4 个组合，明确业务 State 与 Class cache、外部调用与 Side Effect 的区别；行为测试与声明一致 |
| DI-AC50 | Rule/Intent/State 定义归 DataKnowledge，Rule/Recognizer/Validator/Decision/Tool 的可执行逻辑归 FunctionKnowledge 所描述的可信静态 Function；不同领域只替换外部 Package 与数据 |
| DI-AC51 | Recognition 和 Handling Workflow 共享已有 SDK Standard Workflow；非成功不能转 COMPLETE，操作选择不执行未知 Function/Tool |
| DI-AC52 | 预授权/用户批准与两个分类轴独立；即使 stateful=false/external=false 也不凭标注跳过已选审批，外部资源拒绝/UNKNOWN 不冒充已成功 |
| DI-AC53 | 真实 DB/Host State 与版本权威来源被明确消费，旧知识快照不得冒充实时授权/当前状态；日志和 Evidence 保留实际来源，支持版本和作用域回溯 |
| DI-AC54 | LLM 只看正式 Skill + SDK 类型/示例便能在两个新领域生成两类 Knowledge、正确 Function 组合、两个 Workflow、正反例；SDK 不增加领域业务代码 |

## 8. 本轮 Owner 设计确认的边界

**建议接受两种顶层 Knowledge：DataKnowledge / FunctionKnowledge；FunctionKnowledge 有 `stateful` / `external` 两个正交属性。** 不因此抹平数据类型、知识来源、版本/适用性；不把函数描述当动态代码；不以两个布尔值替代 Tool 是否需用户同意和实际 Host 权限。L2 再将“stateAccess 是 read/write”和“effect 受控/外部”落到最小可用形状，目前不扩展为额外分层。
