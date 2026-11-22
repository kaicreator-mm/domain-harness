# DomainHarness — Element 封装、Package 内部组织与职责边界规范

> **规范入口说明（R88）**：当前 DomainHarness 基础规则的唯一维护入口是 [统一规范](./DOMAIN_HARNESS_CANONICAL_SPEC.md)；本文件保留为历史决议/详细解释/实例或实现证据。如果二者存在冲突，以统一规范中标注的最新 Owner 决议和状态为准，不把本文件旧候选当现行强制 ABI。

> **状态**：R87 · 从已存在的 Product/Issue 讨论归纳的 **Foundation 设计合同候选**，待 #1668 Owner/L2 确认并经真正实现验证；**不是**新 DIS 标准 Full Conformance、不是对当前 Schema/运行时已实现的断言。
>
> **责任归属**：0.11.0 Foundation / 跨 v0.11.x 的共同结构；不属于 0.11.2 的 Domain Intelligence 产品功能。既有 v0.11.1 审核、CI 和历史 Reference App 收据保持真实有效，不能被本规范追认新架构 PASS。
>
> **现行配套**：[统一命名规范](./DomainHarness_v0.11.x_NAMING_STANDARD.md) · [Boot/KDP 所有权审计](../architecture/DomainHarness_v0.11.x_ELEMENT_FIRST_BOOTSTRAP_OWNERSHIP_REVIEW.md) · [#1668 整改入口](https://github.com/kaicreator-mm/domain-harness/issues/1668)。

## 1. 来源与历史裁决的优先级

| 来源 | 可继承的讨论结论 | 限制 |
|---|---|---|
| [#1563 R5 Element/Package D1–D4](https://github.com/kaicreator-mm/domain-harness/issues/1563#issuecomment-7020667768) | **核心组织来源**：Element = 单一内聚语义/职责，0..N Functions、多 typed content；Package 可以有多个 Elements；一 Element 唯一 owner；无固定 Element 子类；功能/文件/规则不是一一映射 | R5 当时是 Product 设计**建议**，不能把所有候选字段当作已冻结或已实现 |
| [#1496 Element-First Product](https://github.com/kaicreator-mm/domain-harness/issues/1496) | Domain/Element Dependency DAG、内聚微型 Library、多 Function 独立实现、Target/AOT；Workflow/Task 图不同于静态 Element 依赖 | 原“第二 Business App Init/直接 ingress”已被后续 0.11.0/0.11.1 裁决取代 |
| [#1480 Package 架构](https://github.com/kaicreator-mm/domain-harness/issues/1480) | K/S/B 统一 Package 结构；Manifest、数据/程序/资源、Hook、依赖/导出；Package Tree ≠ Package DAG；**目录只为作者便利** | 原旧版本 ABI 兼容与早期字段不构成现行合同 |
| [#1574 L2](https://github.com/kaicreator-mm/domain-harness/issues/1574) + [#1624 B0](https://github.com/kaicreator-mm/domain-harness/issues/1624) | 当前已实现 Manifest `init:ElementRef` / `exit?:ElementRef`；一个 Element 可含多 Function；具体实现由已选 FunctionRef→Target 绑定；直接 Extension；没有裸 EntryRef | 已实现部分不证明 KDP 内部真正拥有所有 Kernel 行为 |
| [#1563 KDP/XState Owner 决议](https://github.com/kaicreator-mm/domain-harness/issues/1563#issuecomment-7054968780) | 通用 Workflow/StateMachine 引擎归 **KDP Kernel Package**；Kernel 能力以 Element/Function 合同表达；领域 Workflow/State/Guard/Rule 归各领域或标准 Element | 覆盖早期“每个 Business Package 各自建 XState Engine”的候选 |
| [#1605 / #1608](https://github.com/kaicreator-mm/domain-harness/issues/1608) | Package.Init 内启动已选 Workflow；唯一 KDP；单轮 Init、可选 Exit；Workflow 可以单节点/子 Workflow，不强制 Main | 禁止第二次 App Init 或旧直接 ingress 兼容层 |
| [#1484 Boot/KDP 边界](https://github.com/kaicreator-mm/domain-harness/issues/1484) | Boot 最小引导；KDP Primary 真实持有 Package System/Kernel；只有一个 Runtime Authority | 本版具体 Pin/Lock/Target 实施以现有验收与新 L2 为准 |

**结论**：不是从零发明 Element 规范，而是将旧候选 D1–D4 的有效组织原则，与已经验收的 0.11.0/0.11.1 生命期、BUILD 和 KDP 裁决统一。任何冲突，必须明确标出历史提案已被后续决议覆盖。

## 2. 五层对象，各自负责什么

| 单元 | 边界与职责 | 不得替代 |
|---|---|---|
| Domain | 一组领域语义、关系、约束与被选 Elements；可有带环的知识语义关系 | 不负责 Package 安装、执行顺序、调用权限 |
| **Element** | **一个内聚职责的小型语义/功能库**：0..N Functions、0..N typed Content、资源/证明/依赖；有独立身份与版本 | 不等于单个函数、单条 Fact、一个文件、一个独立 Runtime |
| Function | Element 选定的对外行为合同：具名操作、输入/输出 Schema、Outcome、Effect Intent、独立 Target 实现 | 不等于 Element 本身；裸 JS export 不形成公开执行权限 |
| **Package** | **一个发布/装配/权限与实现所有权单元**：含多个 Elements、实现文件、资源、版本/Target、显式依赖、公开接口、Init/Exit | 不把单文件/单 Element/单 Feature 强制变成 Package；不凭目录自动授权 |
| Workflow/Task | 实际运行时执行图/节点与状态，引用已选 Element.Function 和内容 | 不能代替 Element Dependency DAG、Package DAG、Semantic Graph |

**同一层并非一一映射**：一个 Package 可有多个不同职责的 Elements；一个 Element 可以含多内容块和多个 Functions；多个不同 Workflow 可引用同一 Element 的不同 Functions；Element 的一个 Function 可以由多个私有文件/第三方精确依赖实现。

## 3. Element 的功能范围和颗粒度

### 3.1 一个 Element 应当包含什么

使用统一的 `kind:'Element'` 结构，内容由 `content[].contentKind` 与明确 `schemaRef` 区分。**不创建** `RuleElement`、`ToolElement`、`WorkflowElement`、`KnowledgeElement` 等互斥基础类型/第二继承树。

可以包含：
- 身份和说明：`id/version/schemaVersion/description`、Owner/Package 归属、适用/排除范围（由具体 Schema 定义）。
- `content[]`：`knowledge`、`rule`、`constraint`、`semantic-model`、`workflow-definition`、`state-model`、`structured-data`、`document`、`interaction`、`validation` 等已定义类型；一项职责可跨多种内容。
- `functions[]`：零个、一个或多个受契约约束的公开 Function；**某个 Element 有两个 Function 不产生两个 Element**。
- 声明式依赖/关系：依赖其它 Elements/Functions 的构建期选定边；Domain 的语义图可另行表达关系，**语义图不用于决定依赖 Init 或执行顺序**。
- 静态资源和 provenance/验证证据：通过已选 refs、版本和 Digest 关联，不要求内联全部源字节。
- 私有实现：源码文件、辅助函数、解析器、纯数据索引、经过固定版本的库，只在相应 Function/Target 及权限闭包下运行；不应为每个 private helper 制造 Element。

**严格区分已实现与建议**：现行 `ElementDefinition` 的真实 TypeScript Schema 有 `id/version/description/roles/content/functions/dependencies/validation`；R5 的 `facets/resources/implementations/provenance/semanticRelations` 等整合草图不是全部已进入同一个 Definition Schema。实现新字段前先核对当前 `packages/contracts/src/element-contracts.ts` 及 DIS 适用条款，不把历史草图当源码事实。

### 3.2 Element 的拆分/合并决策

同时满足以下问题时，倾向**放入同一个 Element**：

1. 所有内容和操作是否围绕**同一个明确可陈述的领域职责**？
2. 是否应由**同一个 Owner、版本、适用范围及验证边界**维护？
3. 多个 Functions 是否共享本 Element 的事实、策略/约束并共同定义一个对外能力？
4. 多个资源/规则是否只是同一职责的实现细节，而不是独立可复用的公开边界？

出现以下一项或多项，倾向拆分成不同 Elements：独立对外语义、独立版本/Owner、不同权限或 Effect、不同适用性、可被其它 Package 单独复用、不同验证证据或需要部分公开部分不公开。

**不构成拆分理由**：文件超过一份、存在两个 Function、既有 JSON 又有代码/Workflow、原历史类型分别叫 Rule/Knowledge、函数名动词不同。

**示例**：`brakeDiagnostics` Element 可以同时含制动诊断术语、规则表、检查顺序、说明与 `listSymptoms`/`recommendInspection` 两个 Functions。普通症状记录不各建一个 Element；如果独立的 `vehicleIdentity` 被多个诊断领域引用、有自己的版本和验收，则应该是另一个 Element。

### 3.3 0 Function / 运行期访问

- `functions:[]` 的知识/数据/规则/声明 Element **合法**，可在 BUILD/已授权元数据层精确选择/引用，不得强行塞一个假的 `invoke`。
- 若真正运行时需要读取/查询其内容，使用有声明的 Reader/Query Function、已选资源权限和明确输入输出；**零函数不等于任何 Package 可以自由读私有源文件**。
- 若 Element 被选为 Package `init/exit` 或技术 Hook Provider，它必须绑定真实、唯一且可执行的 FunctionRef/Target；此处与普通零函数 Element 的许可不同。

## 4. 一个 Package 内如何组织 Elements

### 4.1 统一 Package 规则

1. K/S/B 的 `layer` 是职责分类，不是三种不同的技术 Manifest；`primary/extension` 是组合角色，不决定是否有 Element。
2. Package Manifest 明确 `elements[]`、每个 Element 的 DefinitionRef/visibility/version、`dependsOn/imports/exports/provides/contributesTo/targetVariants`、`init` 和可选 `exit`。只对**直接声明的 Extension** 获得跨包调用资格；安装依赖的传递闭包不授予 API 权限。
3. 一个可执行 Package 可以有多个 Elements，**不要求 Package = Element**；**当前 0.11.x 可运行 Package 必须有一个自己的 Init Element**，所以旧 R5 的“理论上 Package 可有 0 个 Element”不能被误解为当前合法可运行零 Element Package。可选 Exit 不要求常驻占位函数。
4. 一个已选 Element 定义由**唯一 Package Owner** 负责；其它 Package 必须用公开的 ElementRef/FunctionRef、直接 Extension 的 imports/exports 使用，不能复制同名 Definition 然后各自声称拥有。
5. 在一个 Package 内，多 Element 可以共享私有代码和静态资源，但仍应在明确 Function Contract、Target/ResourceRef 和自身访问边界下工作；不要把 Package 内部 helper 暴露成隐形的公共 API。
6. 一个 Element 多个 Function 可以有不同 Target 实现文件和绑定；一个 Target 物理文件也可包含多个已选 Function 导出。**Element 数量与 ESM 文件数量无对应要求**。
7. Package 自己拥有 Init 的业务/功能状态与重复初始化策略；KDP 只管理最小 Init 调用/Exit 记录和系统兜底，不替各 Package 做业务去重。

### 4.2 推荐作者文件布局（非机器 Schema 强制）

```text
dh-standard-file/                    # Package，npm 风格 kebab-case
  manifest.json                      # Owner/Elements/依赖/Init/Export/Target
  package.json
  elements/
    lifecycle.json                   # Element: fileLifecycle
    json-codec.json                  # Element: jsonCodec
    yaml-codec.json                  # Element: yamlCodec
  content/
    schemas/                         # 选定结构数据、业务资源或格式 schema
  src/
    index.ts                         # 实现，可按职责拆成多个普通文件
    json-codec.ts
    yaml-codec.ts
  tests/
    ...                              # 正例、UNKNOWN、权限/摘要拒绝
```

**文件布局不是标准的授权来源**：允许单文件/多文件、JSON/YAML/TS 作者格式和内联 Definition。只要合法 Manifest/Element/Function/Resource、版本/摘要及已选目标一致即可。Domain Package 完全可以由人工/ChatGPT/Agent/未来 Forge 编写；Generator、独立 Package Assembly 不作为前置。

### 4.3 不混淆四种图

| 图 | 用途 | 是否允许环 |
|---|---|---|
| Package dependency DAG | 静态 Package 直接依赖、装配/Init 调用资格 | 依赖边不允许环 |
| Element dependency DAG | BUILD 静态 Element/Function 引用闭包 | 依赖边不允许环 |
| Domain semantic graph | 事实、语义关系、上下位/相互解释关系 | 可以有合理语义环 |
| Workflow/Task execution graph | 业务流程、分支与运行步骤 | 按实际 Workflow 合同及预算控制，**不等同前两种依赖图** |

## 5. KDP 与最小 Boot 如何遵守同一规范

**KDP 是真实 Kernel Package，不是名义上有 Lifecycle Element、真正所有 Kernel 功能却由一个平行 Microkernel 运行时拥有**。

- **KDP Package 内**：`kernelLifecycle` Element 的 `init/exit` 负责其自身和 Domain App 启动/退出的实际编排；通用执行功能可以以 `workflowRuntime`、`packageSystem` 等内聚 Kernel Elements 公开必要的、可选的 Function 合同。私有 XState/Schema/调度实现仍可分成多个普通 TS 文件，所有权不逃离 KDP Package；**不要求每个 Engine helper 都 Element 化**。
- **SDK Authoring Package**：`buildApp`/Composition 的可执行归属同样应当明确；尚未组合的新 Domain App 不能先 Boot 自己来运行自身 BUILD，所以作者期 SDK 入口的受信静态加载与运行期已选 Function 调用须由 L2 明确区分，避免循环 Bootstrap。
- **Boot 的全部职责**：验证最小可信安装锚点/Pin、Lock 的必需身份与摘要、将被执行的唯一 KDP 入口实际字节与 Target 身份；**随后只调用一次已经验证的 KDP Init Element Target**。必要的路径/JSON/摘要原生 helper 仍可留在 Boot，但不作为另一个可组合 Package/业务 Runtime。
- **Boot 禁止**：实例化 PackageSystem、遍历业务 Core/Extensions/Workflow、解释业务规则或 AppStatus、分配 Task/Actor、调用业务 Function、运行第二轮 Init、生成/解析业务授权图、承担 Domain App 初始化、运行 Exit 调度或在线 BUILD。
- **KDP Init 接管**：PackageSystem/当前 KDP Runtime 核心、运行时必需的已选代码验证、Hook/Workflow Engine、DomainApp 状态形成、故障及 Exit 的统一处理；顺序仍是 KDP Order 0 →已选后续 Core/直接 Extension 的实际 Init。不能因迁移导致未校验 KDP 代码先执行。
- **当前现状非合格断言**：现行 `boot.ts` 仍调用 `bootstrap`，现行参考 KDP `dist/index.mjs` 的 `init` 仅记录事件/转向下一 Core；这些差异列入 #1668，未修之前不得写“自举完全 Element 化 PASS”。

**最小 Boot 的实现决策需要特别验证**：根 Pin/Lock 的受信匹配、KDP 字节验证和拒绝前零不可信模块副作用不能移入 KDP 自检。KDP 可以复用同一验证工具以处理其它已选 Package，但不能引入第二种信任权威。

## 6. 命名在模型中的作用（不与内容类型混淆）

- **Package.id** 遵守 npm 风格的小写 `kebab-case`，例如 `dh-kernel`、`dh-standard-file`，没有轮次/临时版本前缀。
- **ElementDefinition.id** 像 TypeScript 变量/属性一样使用 **`camelCase`**，例如 `kernelLifecycle`、`workflowRuntime`、`jsonCodec`、`brakeDiagnostics`；不把完整命名空间/Package 路径拼进 `id`。
- **ElementRef** 的命名空间是**单独**字段，如 `{namespace:'dh',id:'kernelLifecycle',version:'1.0.0',digest:'sha256:…'}`，ElementOwner Package 由 Manifest/Lock 固定。字符串 `dh.kernel.lifecycle` 可以是展示用全限定表达，但**不是**新 `ElementDefinition.id` 的格式。
- **Function.id** 是 `camelCase` 动词；Content/Workflow/Node 等面向程序引用的逻辑字段也优先 `camelCase`；文件路径仍 `kebab-case`。历史已锁定的 dot-separated IDs 及 `decision-flow` 等不能直接重命名并声称旧 Digest 有效。
- **现行实现约束**：当前 `tooling/build/src/build.ts::elementNamespace` 会从带点 Element ID 提取命名空间，机器 Schema 也容许旧格式。迁移为单独 `namespace` + `camelCase id` 必须先修 BUILD/Schema/Refs/Lock/权限/消费端且重审，不能只改 README。

## 7. 最小可证伪验收

- POS：一个 Package 包含 `kernelLifecycle` + `workflowRuntime` 两个真实内聚 Elements；同一 `jsonCodec` Element 有 `readJson/writeJson` 两个不同 Function；另有一个 `functions:[]` 纯数据 Element；同一 Element 被两个 Workflow 精确引用，结果/状态独立。
- NEG：重复 Owner、无声明 Extension、私有 Function 直接调用、错 Namespace/Element ID/Version/Digest、错误 Target 实现、数据资源越权、零 Function Element 假冒可执行 Init、跨包未授权 import、动态模块加载未证、语义关系环被错误视为依赖环，全部可确定性拒绝。
- Boot POS/NEG：KDP 未执行之前证实 Pin/Lock/入口摘要有效；篡改入口时任何 KDP 副作用为 0；KDP Init 真正执行业务初始化；失败只退出实际进入过的 Package；唯一 KDP、单轮 Init、可选 Exit。
- 命名：新增 Package/Element ID 符合明确的机器规则；(namespace,id,version,digest) 一致且唯一；原已审 SHA/StageIndex 不改变；迁移后的新 Lock/AppPackage 生成新的真实摘要。

**实施关口**：R87 本文是将历史讨论明确为一份可审的基础规范候选；由 Owner/L2 确认机器 ABI/Boot 的最小边界后，才开展源码迁移、必要测试及独立非 Writer Exact-SHA 审核。原 v0.11.1 scoped 验收不冒称这项新资格。
